// Unit tests for the pure business rules (no database needed).
const reservation = require('../../services/reservationService');
const inventory = require('../../services/inventoryService');
const payment = require('../../services/paymentService');
const format = require('../../utils/format');
const { db } = require('../../config/db');

afterAll(() => db.end());

// A fixed "now": Wednesday 18 Nov 2026, 18:10 server time
const NOW = new Date(2026, 10, 18, 18, 10, 0);

const expectAppError = (fn, status, messagePart) => {
    try {
        fn();
    } catch (error) {
        expect(error.status).toBe(status);
        if (messagePart) expect(error.message).toContain(messagePart);
        return error;
    }
    throw new Error('Expected an error to be thrown');
};

describe('reservation time-slot rule (Q9)', () => {
    test('slots run 17:00 to 21:00 in 30-minute steps', () => {
        expect(reservation.generateSlots()).toEqual([
            '17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'
        ]);
    });

    test('a sitting lasts two hours', () => {
        expect(reservation.endTimeFor('19:00')).toBe('21:00');
        expect(reservation.endTimeFor('21:00')).toBe('23:00');
    });

    test('accepts a valid future slot within 30 days', () => {
        expect(() => reservation.validateSlot({ reservation_date: '2026-11-18', start_time: '19:00' }, NOW)).not.toThrow();
        expect(() => reservation.validateSlot({ reservation_date: '2026-12-18', start_time: '17:00' }, NOW)).not.toThrow();
    });

    test('rejects dates in the past or more than 30 days ahead', () => {
        expectAppError(() => reservation.validateSlot({ reservation_date: '2026-11-17', start_time: '19:00' }, NOW), 400, 'up to 30 days');
        expectAppError(() => reservation.validateSlot({ reservation_date: '2026-12-19', start_time: '19:00' }, NOW), 400, 'up to 30 days');
    });

    test('rejects times outside 17:00-21:00 or off the 30-minute step', () => {
        expectAppError(() => reservation.validateSlot({ reservation_date: '2026-11-19', start_time: '16:30' }, NOW), 400, '17:00');
        expectAppError(() => reservation.validateSlot({ reservation_date: '2026-11-19', start_time: '21:30' }, NOW), 400, '17:00');
        expectAppError(() => reservation.validateSlot({ reservation_date: '2026-11-19', start_time: '19:15' }, NOW), 400, '30-minute');
    });

    test('rejects a slot that has already started today', () => {
        expectAppError(() => reservation.validateSlot({ reservation_date: '2026-11-18', start_time: '18:00' }, NOW), 400, 'later than now');
    });
});

describe('reservation overlap (BR-04)', () => {
    const tables = [{ table_id: 1 }, { table_id: 2 }];
    const bookings = [{ reservation_id: 10, table_id: 1, start_time: '19:00', end_time: '21:00' }];

    test('an overlapping booking blocks the table', () => {
        expect(reservation.freeTablesForSlot(tables, bookings, '19:30', '21:30')).toEqual([{ table_id: 2 }]);
        expect(reservation.freeTablesForSlot(tables, bookings, '18:00', '20:00')).toEqual([{ table_id: 2 }]);
    });

    test('back-to-back bookings do not overlap', () => {
        expect(reservation.freeTablesForSlot(tables, bookings, '21:00', '23:00')).toHaveLength(2);
        expect(reservation.freeTablesForSlot(tables, bookings, '17:00', '19:00')).toHaveLength(2);
    });

    test('a booking does not clash with itself when edited', () => {
        expect(reservation.freeTablesForSlot(tables, bookings, '19:00', '21:00', 10)).toHaveLength(2);
    });
});

describe('reservation state model (Figure 8)', () => {
    const booking = { reservation_date: '2026-11-18', start_time: '18:00' };

    test('allowed transitions pass', () => {
        expect(() => reservation.assertTransition('PENDING', 'CANCELLED', booking, NOW)).not.toThrow();
        expect(() => reservation.assertTransition('CONFIRMED', 'SEATED', booking, NOW)).not.toThrow();
        expect(() => reservation.assertTransition('SEATED', 'COMPLETED', booking, NOW)).not.toThrow();
    });

    test('skipping or reversing steps is rejected', () => {
        expectAppError(() => reservation.assertTransition('PENDING', 'SEATED', booking, NOW), 409);
        expectAppError(() => reservation.assertTransition('CONFIRMED', 'COMPLETED', booking, NOW), 409);
        expectAppError(() => reservation.assertTransition('COMPLETED', 'CANCELLED', booking, NOW), 409);
        expectAppError(() => reservation.assertTransition('CANCELLED', 'CONFIRMED', booking, NOW), 409);
    });

    test('No-show only 15 minutes after the start time', () => {
        const started = { reservation_date: '2026-11-18', start_time: '17:30' }; // 40 min before NOW
        expect(() => reservation.assertTransition('CONFIRMED', 'NO_SHOW', started, NOW)).not.toThrow();
        // 18:00 start is only 10 minutes before NOW (18:10)
        expectAppError(() => reservation.assertTransition('CONFIRMED', 'NO_SHOW', booking, NOW), 409, '15 minutes');
    });
});

describe('stock rules (P8, BR-07, FR-17)', () => {
    test('stock status', () => {
        expect(inventory.stockStatus(0, 5)).toBe('OUT');
        expect(inventory.stockStatus(5, 5)).toBe('LOW');
        expect(inventory.stockStatus(5.01, 5)).toBe('OK');
        expect(inventory.stockStatus('3.50', '5.00')).toBe('LOW');
    });

    test('movement directions', () => {
        expect(inventory.applyMovement(350, 'STOCK_IN', 1000)).toBe(1350);
        expect(inventory.applyMovement(350, 'ADJUSTMENT_IN', 50)).toBe(400);
        expect(inventory.applyMovement(350, 'STOCK_OUT', 350)).toBe(0);
        expect(inventory.applyMovement(350, 'WASTAGE', 100)).toBe(250);
        expect(inventory.applyMovement(350, 'ADJUSTMENT_OUT', 50)).toBe(300);
    });

    test('stock can never go negative', () => {
        expect(inventory.applyMovement(350, 'STOCK_OUT', 351)).toBeNull();
        expect(inventory.applyMovement(0, 'WASTAGE', 1)).toBeNull();
    });

    test('wastage and adjustments need a reason', () => {
        expect(inventory.REASON_REQUIRED).toEqual(['WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT']);
    });
});

describe('payment rules (P7, BR-06, Q10)', () => {
    const cash = { method_name: 'Cash', requires_reference: 0 };
    const card = { method_name: 'Card (terminal)', requires_reference: 1 };

    test('cash records tendered amount and change', () => {
        expect(payment.evaluatePayment({ method: cash, amountDueCents: 27500, amountTendered: 300 })).toEqual({
            amountCents: 27500, tenderedCents: 30000, changeCents: 2500, reference: null
        });
    });

    test('cash must cover the total', () => {
        expectAppError(() => payment.evaluatePayment({ method: cash, amountDueCents: 27500, amountTendered: 274.99 }), 400, 'R275.00');
        expectAppError(() => payment.evaluatePayment({ method: cash, amountDueCents: 27500 }), 400, 'amount received');
    });

    test('card and EFT require a reference', () => {
        expectAppError(() => payment.evaluatePayment({ method: card, amountDueCents: 27500 }), 400, 'reference');
        expect(payment.evaluatePayment({ method: card, amountDueCents: 27500, reference: 'SLIP-1' })).toEqual({
            amountCents: 27500, tenderedCents: null, changeCents: 0, reference: 'SLIP-1'
        });
    });

    test('the amount always equals the order total', () => {
        const result = payment.evaluatePayment({ method: cash, amountDueCents: 14500, amountTendered: 200 });
        expect(result.amountCents).toBe(14500);
    });

    test('which orders can be paid', () => {
        expect(payment.payableProblem({ order_status: 'READY' }, null)).toBeNull();
        expect(payment.payableProblem({ order_status: 'COMPLETED' }, null)).toBeNull();
        expect(payment.payableProblem({ order_status: 'PENDING' }, null)).toContain('Ready or Completed');
        expect(payment.payableProblem({ order_status: 'CANCELLED' }, null)).toContain('Cancelled');
        expect(payment.payableProblem({ order_status: 'READY' }, { payment_id: 1 })).toContain('already has');
    });
});

describe('formatting helpers', () => {
    test('references', () => {
        expect(format.formatRef('RS', 240, 4)).toBe('RS-0240');
        expect(format.formatRef('RC', 512, 6)).toBe('RC-000512');
        expect(format.orderRef(105)).toBe('UB-0105');
    });

    test('order reference parsing', () => {
        expect(format.parseOrderRef('UB-0105')).toBe(105);
        expect(format.parseOrderRef('ub105')).toBe(105);
        expect(format.parseOrderRef('105')).toBe(105);
        expect(format.parseOrderRef('RS-0105')).toBeNull();
        expect(format.parseOrderRef('')).toBeNull();
    });

    test('VAT split matches the receipt design (R275.00 -> R239.13 + R35.87)', () => {
        expect(format.vatBreakdown(27500)).toEqual({ subtotal_excl_vat: 239.13, vat: 35.87, total: 275 });
    });

    test('cents arithmetic avoids floating-point errors', () => {
        expect(format.fromCents(format.toCents(0.1) + format.toCents(0.2))).toBe(0.3);
    });
});
