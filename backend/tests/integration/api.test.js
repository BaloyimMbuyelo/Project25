// API integration tests for Reservations, Inventory and Payments.
//
// Needs a MySQL database with the schema and migration 001 loaded. Run with:
//   RUN_DB_TESTS=1 DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... npm test
//
// Use a test copy of the database. The tests create their own users,
// tables, stock items and orders, and remove them afterwards.

const crypto = require('crypto');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';

const app = require('../../app');
const { db } = require('../../config/db');
const { localDate, addDays } = require('../../utils/format');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybe = RUN ? describe : describe.skip;

const tag = crypto.randomBytes(3).toString('hex');
const TOMORROW = addDays(localDate(), 1);

const created = { users: [], tables: [], ingredients: [], orders: [] };
const users = {};
const tables = {};
const tokens = {};

const api = (role) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[role]}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${tokens[role]}`).send(body),
    put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${tokens[role]}`).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${tokens[role]}`).send(body)
});

async function createUser(role, label) {
    const [[roleRow]] = await db.query('SELECT role_id FROM roles WHERE role_name = ?', [role]);
    const [result] = await db.query(
        'INSERT INTO users (role_id, full_name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)',
        [roleRow.role_id, `Test ${label}`, `${label}.${tag}@test.local`, 'x'.repeat(60), '0820000000']
    );
    created.users.push(result.insertId);
    users[label] = result.insertId;
    tokens[label] = jwt.sign({ user_id: result.insertId, email: `${label}@test`, role }, process.env.JWT_SECRET);
}

async function createTable(label, capacity, status = 'IN_SERVICE') {
    const [result] = await db.query(
        'INSERT INTO restaurant_tables (table_number, capacity, status) VALUES (?, ?, ?)',
        [`Z${label}-${tag}`, capacity, status]
    );
    created.tables.push(result.insertId);
    tables[label] = result.insertId;
}

async function createOrder({ status = 'READY', lines }) {
    const [[menuItem]] = await db.query('SELECT id FROM menu_items ORDER BY id LIMIT 1');
    const totalCents = lines.reduce((sum, [price, qty]) => sum + Math.round(price * 100) * qty, 0);

    const [order] = await db.query(
        `INSERT INTO orders (guest_name, order_type, order_status, total_amount) VALUES (?, 'COLLECTION', ?, ?)`,
        [`Test guest ${tag}`, status, totalCents / 100]
    );
    for (const [price, qty] of lines) {
        await db.query(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal) VALUES (?, ?, ?, ?, ?)',
            [order.insertId, menuItem.id, qty, price, (Math.round(price * 100) * qty) / 100]
        );
    }
    created.orders.push(order.insertId);
    return { id: order.insertId, ref: `UB-${String(order.insertId).padStart(4, '0')}` };
}

maybe('UBMS API - modules 4.0 to 6.0', () => {
    beforeAll(async () => {
        await createUser('Customer', 'customer');
        await createUser('Customer', 'customer2');
        await createUser('Waiter', 'waiter');
        await createUser('Manager', 'manager');
        await createUser('Cashier', 'cashier');
        await createUser('Kitchen Staff', 'kitchen');
        await createUser('Administrator', 'admin');

        await createTable('A', 6);
        await createTable('B', 4);
        await createTable('OOS', 8, 'OUT_OF_SERVICE');
    });

    afterAll(async () => {
        const ids = (list) => (list.length ? list : [0]);
        await db.query('DELETE FROM payments WHERE order_id IN (?)', [ids(created.orders)]);
        await db.query('DELETE FROM order_items WHERE order_id IN (?)', [ids(created.orders)]);
        await db.query('DELETE FROM orders WHERE order_id IN (?)', [ids(created.orders)]);
        await db.query('DELETE FROM reservations WHERE created_by IN (?)', [ids(created.users)]);
        await db.query('DELETE FROM stock_movements WHERE user_id IN (?)', [ids(created.users)]);
        await db.query('DELETE FROM ingredients WHERE ingredient_id IN (?)', [ids(created.ingredients)]);
        await db.query('DELETE FROM restaurant_tables WHERE table_id IN (?)', [ids(created.tables)]);
        await db.query('DELETE FROM audit_logs WHERE user_id IN (?)', [ids(created.users)]);
        await db.query('DELETE FROM users WHERE user_id IN (?)', [ids(created.users)]);
        await db.end();
    });

    // ---------------------------------------------------------------- access
    describe('access control', () => {
        test('no token -> 401', async () => {
            const res = await request(app).get('/api/v1/reservations');
            expect(res.status).toBe(401);
        });

        test('roles outside the matrix -> 403', async () => {
            expect((await api('kitchen').get('/api/v1/reservations')).status).toBe(403);
            expect((await api('waiter').get('/api/v1/inventory')).status).toBe(403);
            expect((await api('kitchen').post('/api/v1/inventory', {})).status).toBe(403);
            expect((await api('waiter').get('/api/v1/payments')).status).toBe(403);
            expect((await api('customer').patch('/api/v1/reservations/RS-0001', { party_size: 2 })).status).toBe(403);
        });

        test('error responses use the standard envelope', async () => {
            const res = await api('manager').post('/api/v1/inventory', { item_name: '' });
            expect(res.status).toBe(400);
            expect(res.body.error).toEqual(expect.objectContaining({
                code: 'VALIDATION_ERROR',
                message: expect.any(String),
                fields: expect.any(Array)
            }));
        });
    });

    // ---------------------------------------------------------- reservations
    describe('reservations (P6, Figure 8)', () => {
        let customerRef;
        let confirmedRef;

        test('availability lists 30-minute slots', async () => {
            const res = await api('customer').get(`/api/v1/reservations/availability?date=${TOMORROW}&party_size=4`);
            expect(res.status).toBe(200);
            expect(res.body.data.slots.map((s) => s.start_time)).toEqual(
                ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00']
            );
        });

        test('customer request is Pending with no table and an RS reference', async () => {
            const res = await api('customer').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '19:30', party_size: 4,
                table_id: tables.A // ignored: customers cannot allocate
            });
            expect(res.status).toBe(201);
            expect(res.body.data.status).toBe('PENDING');
            expect(res.body.data.table_id).toBeNull();
            expect(res.body.data.end_time).toBe('21:30');
            expect(res.body.data.reservation_ref).toMatch(/^RS-\d{4,}$/);
            expect(res.body.message).toContain('Reservation received');
            customerRef = res.body.data.reservation_ref;
        });

        test('staff booking with a table is Confirmed', async () => {
            const res = await api('waiter').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '19:00', party_size: 4,
                table_id: tables.A, guest_name: 'Naledi P', guest_phone: '071 234 5678'
            });
            expect(res.status).toBe(201);
            expect(res.body.data.status).toBe('CONFIRMED');
            expect(res.body.data.customer_phone).toBe('0712345678');
            confirmedRef = res.body.data.reservation_ref;
        });

        test('overlapping booking on the same table -> 409 with alternatives', async () => {
            const res = await api('waiter').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '20:00', party_size: 2,
                table_id: tables.A, guest_name: 'Sipho D', guest_phone: '0831234567'
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toMatch(/already booked 19:00–21:00 \(RS-\d+\)/);
            expect(Array.isArray(res.body.error.details.alternatives)).toBe(true);
            expect(res.body.error.details.alternatives.length).toBeGreaterThan(0);
        });

        test('back-to-back booking at 21:00 is allowed', async () => {
            const res = await api('waiter').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '21:00', party_size: 2,
                table_id: tables.A, guest_name: 'Late Guest', guest_phone: '0831234567'
            });
            expect(res.status).toBe(201);
        });

        test('party larger than the table -> 409', async () => {
            const res = await api('waiter').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '17:00', party_size: 5,
                table_id: tables.B, guest_name: 'Big Group', guest_phone: '0831234567'
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toBe('Party of 5 exceeds table capacity (4).');
        });

        test('out-of-service table -> 409', async () => {
            const res = await api('manager').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '17:00', party_size: 2,
                table_id: tables.OOS, guest_name: 'Guest', guest_phone: '0831234567'
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toContain('out of service');
        });

        test.each([
            [{ start_time: '16:30' }, 'start_time'],
            [{ start_time: '19:15' }, 'start_time'],
            [{ reservation_date: addDays(localDate(), 31) }, 'reservation_date'],
            [{ party_size: 21 }, 'party_size'],
            [{ party_size: 0 }, 'party_size']
        ])('invalid input %o -> 400 on %s', async (override, field) => {
            const res = await api('customer').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '19:00', party_size: 2, ...override
            });
            expect(res.status).toBe(400);
            expect(res.body.error.fields.map((f) => f.field)).toContain(field);
        });

        test('staff guest booking needs a name and phone', async () => {
            const res = await api('waiter').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '17:00', party_size: 2
            });
            expect(res.status).toBe(400);
            expect(res.body.error.fields.map((f) => f.field)).toEqual(['guest_name', 'guest_phone']);
        });

        test('customers only see their own bookings', async () => {
            const own = await api('customer').get('/api/v1/reservations');
            expect(own.status).toBe(200);
            expect(own.body.data.reservations.map((r) => r.reservation_ref)).toEqual([customerRef]);

            const other = await api('customer2').get(`/api/v1/reservations/${customerRef}`);
            expect(other.status).toBe(403);
        });

        test('allocating a table confirms a pending request', async () => {
            const res = await api('waiter').patch(`/api/v1/reservations/${customerRef}`, { table_id: tables.B });
            expect(res.status).toBe(200);
            expect(res.body.data.status).toBe('CONFIRMED');
            expect(res.body.data.table_id).toBe(tables.B);
        });

        test('moving a booking onto a clashing table is rejected', async () => {
            const res = await api('waiter').patch(`/api/v1/reservations/${customerRef}`, { table_id: tables.A });
            expect(res.status).toBe(409);
        });

        test('status follows the state model', async () => {
            expect((await api('waiter').patch(`/api/v1/reservations/${confirmedRef}/status`, { status: 'COMPLETED' })).status).toBe(409);
            expect((await api('waiter').patch(`/api/v1/reservations/${confirmedRef}/status`, { status: 'NO_SHOW' })).status).toBe(409);

            const seated = await api('waiter').patch(`/api/v1/reservations/${confirmedRef}/status`, { status: 'SEATED' });
            expect(seated.status).toBe(200);
            expect(seated.body.data.status).toBe('SEATED');

            expect((await api('waiter').patch(`/api/v1/reservations/${confirmedRef}`, { party_size: 3 })).status).toBe(409);

            const done = await api('manager').patch(`/api/v1/reservations/${confirmedRef}/status`, { status: 'COMPLETED' });
            expect(done.status).toBe(200);
            expect(done.body.data.status).toBe('COMPLETED');
        });

        test('cancelling frees the slot', async () => {
            const cancel = await api('waiter').patch(`/api/v1/reservations/${customerRef}/status`, { status: 'CANCELLED', reason: 'Guest called' });
            expect(cancel.status).toBe(200);
            expect(cancel.body.data.cancel_reason).toBe('Guest called');

            const rebook = await api('waiter').post('/api/v1/reservations', {
                reservation_date: TOMORROW, start_time: '19:30', party_size: 4,
                table_id: tables.B, guest_name: 'New Guest', guest_phone: '0831234567'
            });
            expect(rebook.status).toBe(201);
        });

        test('table plan marks booked tables for a slot', async () => {
            const res = await api('waiter').get(`/api/v1/reservations/tables?date=${TOMORROW}&start_time=19:00`);
            expect(res.status).toBe(200);
            const planB = res.body.data.find((t) => t.table_id === tables.B);
            expect(planB.booked).toBe(true);
        });

        test('changes are written to the audit log', async () => {
            const [rows] = await db.query(
                "SELECT action FROM audit_logs WHERE user_id = ? AND action LIKE 'RESERVATION_%'",
                [users.waiter]
            );
            expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['RESERVATION_CREATED', 'RESERVATION_UPDATED', 'RESERVATION_STATUS']));
        });
    });

    // ------------------------------------------------------------- inventory
    describe('inventory (P8, BR-07)', () => {
        let itemId;
        const name = `Lamb ${tag}`;

        test('manager adds an item with opening stock', async () => {
            const res = await api('manager').post('/api/v1/inventory', {
                item_name: name, category: 'Meat', unit: 'kg', reorder_level: 5, opening_quantity: 10
            });
            expect(res.status).toBe(201);
            expect(res.body.data.quantity_on_hand).toBe(10);
            expect(res.body.data.stock_status).toBe('OK');
            itemId = res.body.data.inventory_item_id;
            created.ingredients.push(itemId);
        });

        test('duplicate names -> 409', async () => {
            const res = await api('manager').post('/api/v1/inventory', { item_name: name, unit: 'kg', reorder_level: 1 });
            expect(res.status).toBe(409);
        });

        test('stock out reduces the balance and flags low stock', async () => {
            const res = await api('manager').post(`/api/v1/inventory/${itemId}/movements`, {
                movement_type: 'STOCK_OUT', quantity: 6.5
            });
            expect(res.status).toBe(201);
            expect(res.body.data.new_quantity).toBe(3.5);
            expect(res.body.data.low_stock).toBe(true);
            expect(res.body.data.stock_status).toBe('LOW');
        });

        test('wastage without a reason -> 400', async () => {
            const res = await api('manager').post(`/api/v1/inventory/${itemId}/movements`, {
                movement_type: 'WASTAGE', quantity: 1
            });
            expect(res.status).toBe(400);
            expect(res.body.error.fields[0].field).toBe('reason');
        });

        test('more than 2 decimals -> 400', async () => {
            const res = await api('manager').post(`/api/v1/inventory/${itemId}/movements`, {
                movement_type: 'STOCK_IN', quantity: 1.234
            });
            expect(res.status).toBe(400);
        });

        test('stock can never go negative -> 409', async () => {
            const res = await api('manager').post(`/api/v1/inventory/${itemId}/movements`, {
                movement_type: 'WASTAGE', quantity: 4, reason: 'Spoiled'
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toBe('Not enough stock: only 3.50 kg on hand.');
        });

        test('movement history records type, balance and who did it', async () => {
            const res = await api('kitchen').get(`/api/v1/inventory/${itemId}/movements`);
            expect(res.status).toBe(200);
            expect(res.body.data.map((m) => [m.movement_type, m.balance_after])).toEqual([
                ['STOCK_OUT', 3.5],
                ['STOCK_IN', 10]
            ]);
            expect(res.body.data[0].recorded_by).toBe('Test manager');
        });

        test('low-stock list includes the item', async () => {
            const res = await api('kitchen').get('/api/v1/inventory/low-stock');
            expect(res.status).toBe(200);
            expect(res.body.data.items.map((i) => i.inventory_item_id)).toContain(itemId);
        });

        test('editing details does not change the quantity', async () => {
            const res = await api('manager').put(`/api/v1/inventory/${itemId}`, {
                item_name: name, category: 'Meat', unit: 'kg', reorder_level: 2
            });
            expect(res.status).toBe(200);
            expect(res.body.data.quantity_on_hand).toBe(3.5);
            expect(res.body.data.stock_status).toBe('OK');
        });

        test('deactivated items accept no movements', async () => {
            expect((await api('manager').patch(`/api/v1/inventory/${itemId}/status`, { is_active: false })).status).toBe(200);
            const res = await api('manager').post(`/api/v1/inventory/${itemId}/movements`, {
                movement_type: 'STOCK_IN', quantity: 1
            });
            expect(res.status).toBe(404);
        });
    });

    // -------------------------------------------------------------- payments
    describe('payments (P7, Q10)', () => {
        let cashOrder;
        let cardOrder;
        let thirdOrder;
        let pendingOrder;
        let cashPaymentId;

        beforeAll(async () => {
            cashOrder = await createOrder({ lines: [[95, 2], [55, 1], [30, 1]] }); // R275.00
            cardOrder = await createOrder({ lines: [[120, 1]] });
            thirdOrder = await createOrder({ lines: [[75, 1]] });
            pendingOrder = await createOrder({ status: 'PENDING', lines: [[75, 1]] });
        });

        test('payable orders list Ready orders', async () => {
            const res = await api('cashier').get('/api/v1/payments/payable-orders');
            expect(res.status).toBe(200);
            const refs = res.body.data.map((o) => o.order_ref);
            expect(refs).toEqual(expect.arrayContaining([cashOrder.ref, cardOrder.ref]));
            expect(refs).not.toContain(pendingOrder.ref);
        });

        test('order look-up shows lines and amount due', async () => {
            const res = await api('cashier').get(`/api/v1/payments/orders/${cashOrder.ref}`);
            expect(res.status).toBe(200);
            expect(res.body.data.amount_due).toBe(275);
            expect(res.body.data.lines).toHaveLength(3);
            expect(res.body.data.payable).toBe(true);
        });

        test('cash short of the total -> 400', async () => {
            const res = await api('cashier').post('/api/v1/payments', {
                order_ref: cashOrder.ref, payment_method_id: 1, amount_tendered: 270
            });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toBe('Amount received must cover R275.00.');
        });

        test('cash payment uses the server total, gives change and completes the order', async () => {
            const res = await api('cashier').post('/api/v1/payments', {
                order_ref: cashOrder.ref, payment_method_id: 1, amount_tendered: 300,
                amount: 1 // ignored: the amount always comes from the order
            });
            expect(res.status).toBe(201);
            expect(res.body.data.amount).toBe(275);
            expect(res.body.data.change).toBe(25);
            expect(res.body.data.receipt_number).toMatch(/^RC-\d{6,}$/);
            expect(res.body.message).toBe('Payment recorded – change due R25.00');
            cashPaymentId = res.body.data.payment_id;

            const [[order]] = await db.query('SELECT order_status FROM orders WHERE order_id = ?', [cashOrder.id]);
            expect(order.order_status).toBe('COMPLETED');
        });

        test('a second active payment for the same order -> 409', async () => {
            const res = await api('cashier').post('/api/v1/payments', {
                order_ref: cashOrder.ref, payment_method_id: 1, amount_tendered: 300
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toBe('This order already has an active Paid payment.');
        });

        test('card payment needs a reference', async () => {
            const res = await api('cashier').post('/api/v1/payments', { order_ref: cardOrder.ref, payment_method_id: 2 });
            expect(res.status).toBe(400);
            expect(res.body.error.fields[0].field).toBe('reference_number');
        });

        test('card payment with a reference; references are unique', async () => {
            const reference = `SLIP-${tag}`;
            const ok = await api('cashier').post('/api/v1/payments', {
                order_ref: cardOrder.ref, payment_method_id: 2, reference_number: reference
            });
            expect(ok.status).toBe(201);
            expect(ok.body.data.amount_tendered).toBeNull();

            const dup = await api('cashier').post('/api/v1/payments', {
                order_ref: thirdOrder.ref, payment_method_id: 2, reference_number: reference
            });
            expect(dup.status).toBe(409);
            expect(dup.body.error.message).toBe('This reference number has already been used.');
        });

        test('orders that are not Ready cannot be paid', async () => {
            const res = await api('cashier').post('/api/v1/payments', {
                order_ref: pendingOrder.ref, payment_method_id: 1, amount_tendered: 100
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toBe('Only orders that are Ready or Completed can be paid.');
        });

        test('unknown order -> 404', async () => {
            const res = await api('cashier').post('/api/v1/payments', {
                order_ref: 'UB-999999', payment_method_id: 1, amount_tendered: 100
            });
            expect(res.status).toBe(404);
        });

        test('receipt shows the VAT split', async () => {
            const res = await api('cashier').get(`/api/v1/payments/${cashPaymentId}/receipt`);
            expect(res.status).toBe(200);
            expect(res.body.data).toEqual(expect.objectContaining({
                subtotal_excl_vat: 239.13,
                vat: 35.87,
                total: 275,
                amount_tendered: 300,
                change: 25,
                cashier: 'Test cashier'
            }));
            expect(res.body.data.lines).toHaveLength(3);
        });

        test('only the manager can void, with a reason', async () => {
            expect((await api('cashier').post(`/api/v1/payments/${cashPaymentId}/void`, { reason: 'Wrong method' })).status).toBe(403);
            expect((await api('manager').post(`/api/v1/payments/${cashPaymentId}/void`, {})).status).toBe(400);

            const res = await api('manager').post(`/api/v1/payments/${cashPaymentId}/void`, { reason: 'Wrong method' });
            expect(res.status).toBe(200);
            expect(res.body.data.payment_status).toBe('VOIDED');

            expect((await api('manager').post(`/api/v1/payments/${cashPaymentId}/void`, { reason: 'Again' })).status).toBe(409);
        });

        test('a replacement payment may follow a void; the voided row is kept', async () => {
            const res = await api('manager').post('/api/v1/payments', {
                order_ref: cashOrder.ref, payment_method_id: 3, reference_number: `EFT-${tag}`
            });
            expect(res.status).toBe(201);

            const [rows] = await db.query('SELECT payment_status FROM payments WHERE order_id = ? ORDER BY payment_id', [cashOrder.id]);
            expect(rows.map((r) => r.payment_status)).toEqual(['VOIDED', 'PAID']);
        });

        test('the database itself blocks a second Paid row for an order', async () => {
            const [[existing]] = await db.query("SELECT * FROM payments WHERE order_id = ? AND payment_status = 'PAID'", [cashOrder.id]);
            await expect(db.query(
                `INSERT INTO payments (order_id, payment_method_id, recorded_by, amount, receipt_number)
                 VALUES (?, 1, ?, ?, ?)`,
                [cashOrder.id, existing.recorded_by, existing.amount, `X${tag}`]
            )).rejects.toThrow(/Duplicate entry/);
        });

        test("the day's payments list and summary", async () => {
            const res = await api('admin').get('/api/v1/payments');
            expect(res.status).toBe(200);
            const mine = res.body.data.payments.filter((p) => created.orders.includes(p.order_id));
            expect(mine.map((p) => p.payment_status).sort()).toEqual(['PAID', 'PAID', 'VOIDED']);
            expect(res.body.data.summary.count).toBeGreaterThanOrEqual(2);
        });

        test('payment events are audited', async () => {
            const [rows] = await db.query(
                "SELECT action FROM audit_logs WHERE user_id IN (?, ?) AND action LIKE 'PAYMENT_%'",
                [users.cashier, users.manager]
            );
            expect(rows.map((r) => r.action)).toEqual(expect.arrayContaining(['PAYMENT_RECORDED', 'PAYMENT_VOIDED']));
        });
    });
});

if (!RUN) {
    test.skip('integration tests skipped - set RUN_DB_TESTS=1 to run them', () => {});
}
