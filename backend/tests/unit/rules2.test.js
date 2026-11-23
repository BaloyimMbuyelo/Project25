// Unit tests for orders, passwords, reports and the login rate limiter.
const express = require('express');
const request = require('supertest');

const orders = require('../../services/orderService');
const reports = require('../../services/reportService');
const { passwordProblem, randomPassword } = require('../../utils/passwords');
const { createLoginLimiter } = require('../../middleware/rateLimit');
const { db } = require('../../config/db');

afterAll(() => db.end());

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

describe('order status workflow (P5, Figure 7)', () => {
    test('each role can make only its own step', () => {
        expect(() => orders.assertStatusChange('Waiter', 'PENDING', 'CONFIRMED')).not.toThrow();
        expect(() => orders.assertStatusChange('Kitchen Staff', 'CONFIRMED', 'PREPARING')).not.toThrow();
        expect(() => orders.assertStatusChange('Kitchen Staff', 'PREPARING', 'READY')).not.toThrow();
        expect(() => orders.assertStatusChange('Cashier', 'READY', 'COMPLETED')).not.toThrow();
        expect(() => orders.assertStatusChange('Manager', 'PENDING', 'CONFIRMED')).not.toThrow();

        expectAppError(() => orders.assertStatusChange('Kitchen Staff', 'PENDING', 'CONFIRMED'), 403);
        expectAppError(() => orders.assertStatusChange('Waiter', 'CONFIRMED', 'PREPARING'), 403);
        expectAppError(() => orders.assertStatusChange('Cashier', 'PREPARING', 'READY'), 403);
    });

    test('steps cannot be skipped or reversed', () => {
        expectAppError(() => orders.assertStatusChange('Manager', 'PENDING', 'PREPARING'), 409, 'next step');
        expectAppError(() => orders.assertStatusChange('Manager', 'READY', 'PREPARING'), 409);
    });

    test('closed orders cannot change', () => {
        expectAppError(() => orders.assertStatusChange('Manager', 'COMPLETED', 'READY'), 409, 'closed');
        expectAppError(() => orders.assertStatusChange('Manager', 'CANCELLED', 'CONFIRMED'), 409, 'closed');
    });
});

describe('order cancellation rules (P5 CancelOrder, Table 30)', () => {
    const customer = { user_id: 7, role: 'Customer' };
    const waiter = { user_id: 2, role: 'Waiter' };
    const manager = { user_id: 3, role: 'Manager' };
    const order = (status, customerId = 7) => ({ order_status: status, customer_id: customerId });

    test('customers cancel only their own Pending orders', () => {
        expect(() => orders.assertCanCancel(customer, order('PENDING'))).not.toThrow();
        expectAppError(() => orders.assertCanCancel(customer, order('PENDING', 8)), 403);
        expectAppError(() => orders.assertCanCancel(customer, order('CONFIRMED')), 403);
    });

    test('waiters cancel Pending orders; managers up to Preparing', () => {
        expect(() => orders.assertCanCancel(waiter, order('PENDING'))).not.toThrow();
        expectAppError(() => orders.assertCanCancel(waiter, order('CONFIRMED')), 403, 'manager');
        expect(() => orders.assertCanCancel(manager, order('PREPARING'))).not.toThrow();
        expectAppError(() => orders.assertCanCancel(manager, order('READY')), 409);
        expectAppError(() => orders.assertCanCancel(manager, order('COMPLETED')), 409);
    });
});

describe('server-side order pricing (P4, BR-01, BR-02)', () => {
    const menu = [
        { id: 1, name: 'Bunny Chow', price: '95.00', available: 1 },
        { id: 2, name: 'Malva Pudding', price: '55.00', available: 1 },
        { id: 3, name: 'Rooibos Iced Tea', price: '30.00', available: 1 },
        { id: 4, name: 'Bobotie', price: '120.00', available: 0 }
    ];

    test('prices come from the menu and totals are exact (R275.00 example)', () => {
        const { lines, totalCents } = orders.priceLines([
            { menu_item_id: 1, quantity: 2, unit_price: 1 },
            { menu_item_id: 2, quantity: 1 },
            { menu_item_id: 3, quantity: 1, notes: 'No ice' }
        ], menu);

        expect(totalCents).toBe(27500);
        expect(lines.map((l) => [l.unit_price, l.subtotal])).toEqual([[95, 190], [55, 55], [30, 30]]);
        expect(lines[2].notes).toBe('No ice');
    });

    test('unavailable or missing items are rejected', () => {
        expectAppError(() => orders.priceLines([{ menu_item_id: 4, quantity: 1 }], menu), 409, 'Bobotie is no longer available');
        expectAppError(() => orders.priceLines([{ menu_item_id: 99, quantity: 1 }], menu), 409, 'no longer available');
    });
});

describe('password policy (4.8.2, SEC-01)', () => {
    test('requires 8+ characters with upper, lower and a digit', () => {
        expect(passwordProblem('Bistro2026')).toBeNull();
        expect(passwordProblem('short1A')).toMatch(/at least 8/);
        expect(passwordProblem('alllowercase1')).toMatch(/upper-case/);
        expect(passwordProblem('ALLUPPERCASE1')).toMatch(/lower-case/);
        expect(passwordProblem('NoDigitsHere')).toMatch(/number/);
    });

    test('rejects common passwords', () => {
        expect(passwordProblem('Password123')).toMatch(/too common/);
    });

    test('temporary passwords always meet the policy', () => {
        for (let i = 0; i < 200; i += 1) {
            const temp = randomPassword(12);
            expect(temp).toHaveLength(12);
            expect(passwordProblem(temp)).toBeNull();
        }
    });
});

describe('reports (P10)', () => {
    test('date range validation', () => {
        expect(reports.validateRange('2026-10-01', '2026-10-07')).toBe(7);
        expect(reports.validateRange('2026-10-01', '2026-10-01')).toBe(1);
        expectAppError(() => reports.validateRange('2026-10-07', '2026-10-01'), 400, "'To' cannot be before");
        expect(reports.validateRange('2025-11-18', '2026-11-19')).toBe(367);
        expectAppError(() => reports.validateRange('2025-11-17', '2026-11-19'), 400, '366 days');
    });

    test('CSV export has a BOM, escapes quotes and blocks formula injection', () => {
        const csv = reports.toCsv({
            title: 'Sales / Orders',
            from: '2026-10-01',
            to: '2026-10-07',
            generatedAt: '07 Oct 2026',
            generatedBy: 'Thandi M.',
            filters: { order_type: 'DINE_IN' },
            columns: [{ key: 'name', label: 'Item' }, { key: 'total', label: 'Total (R)' }],
            rows: [
                { name: '=HYPERLINK("http://evil")', total: 10 },
                { name: 'Chakalaka, Pap', total: -5 }
            ],
            totals: { total: 5 }
        });

        expect(csv.startsWith('﻿Report,Sales / Orders\r\n')).toBe(true);
        expect(csv).toContain('order_type,DINE_IN');
        expect(csv).toContain(`"'=HYPERLINK(""http://evil"")",10`);
        expect(csv).toContain('"Chakalaka, Pap",-5');
        expect(csv).toContain('Total,5');
    });
});

describe('login rate limiter (OWASP A07)', () => {
    test('blocks an IP after the limit with the standard error envelope', async () => {
        const app = express();
        app.post('/login', createLoginLimiter({ limit: 2, windowMin: 15 }), (req, res) => res.json({ ok: true }));

        expect((await request(app).post('/login')).status).toBe(200);
        expect((await request(app).post('/login')).status).toBe(200);

        const blocked = await request(app).post('/login');
        expect(blocked.status).toBe(429);
        expect(blocked.body.error).toEqual({
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many attempts. Try again in 15 minutes.',
            fields: []
        });
    });
});
