// API integration tests: login hardening, Orders, Users & audit, Reports.
//
//   RUN_DB_TESTS=1 DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... npm test
//
// Needs migrations 001 and 002. Use a test copy of the database: the tests
// create their own users, menu items, tables and orders and remove them after.

const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const request = require('supertest');
const jwt = require('jsonwebtoken');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.LOGIN_RATE_LIMIT = '10000'; // the per-IP limiter has its own unit test

const app = require('../../app');
const { db } = require('../../config/db');
const { localDate, addDays } = require('../../utils/format');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybe = RUN ? describe : describe.skip;

const tag = crypto.randomBytes(3).toString('hex');
const PASSWORD = 'Bistro2026';
const TODAY = localDate();

const created = { users: [], menu: [], tables: [], orders: [] };
const users = {};
const tokens = {};
const menu = {};
const tables = {};

const emailFor = (label) => `${label}.${tag}@test.local`;

// Bearer helper (still accepted) - cookie behaviour is tested separately.
const as = (label) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[label]}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${tokens[label]}`).send(body),
    put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${tokens[label]}`).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${tokens[label]}`).send(body)
});

const cookieFrom = (res) => (res.headers['set-cookie'] || []).find((c) => c.startsWith('ubms_token=')) || '';
const cookieValue = (res) => cookieFrom(res).split(';')[0];

async function createUser(role, label, { status = 'ACTIVE', mustChange = 0 } = {}) {
    const [[roleRow]] = await db.query('SELECT role_id FROM roles WHERE role_name = ?', [role]);
    const hash = await bcrypt.hash(PASSWORD, 4);
    const [result] = await db.query(
        `INSERT INTO users (role_id, full_name, email, password_hash, phone, status, must_change_pw)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [roleRow.role_id, `Test ${label}`, emailFor(label), hash, '0820000000', status, mustChange]
    );
    created.users.push(result.insertId);
    users[label] = result.insertId;
    tokens[label] = jwt.sign({ sub: String(result.insertId), role }, process.env.JWT_SECRET);
    return result.insertId;
}

async function createMenuItem(label, price, available = true) {
    const [result] = await db.query(
        `INSERT INTO menu_items (name, description, category, price, image, available)
         VALUES (?, 'Test item', 'Test', ?, '', ?)`,
        [`${label} ${tag}`, price, available]
    );
    created.menu.push(result.insertId);
    menu[label] = result.insertId;
}

async function createTable(label, capacity, status = 'IN_SERVICE') {
    const [result] = await db.query(
        'INSERT INTO restaurant_tables (table_number, capacity, status) VALUES (?, ?, ?)',
        [`Y${label}-${tag}`, capacity, status]
    );
    created.tables.push(result.insertId);
    tables[label] = result.insertId;
}

const lastAudit = async (action, userId = null) => {
    const [rows] = await db.query(
        `SELECT * FROM audit_logs WHERE action = ? ${userId === null ? '' : 'AND user_id <=> ?'}
         ORDER BY log_id DESC LIMIT 1`,
        userId === null ? [action] : [action, userId]
    );
    return rows[0];
};

maybe('UBMS API - access control, orders, users and reports', () => {
    beforeAll(async () => {
        for (const [role, label] of [
            ['Customer', 'customer'], ['Customer', 'customer2'], ['Waiter', 'waiter'],
            ['Kitchen Staff', 'kitchen'], ['Cashier', 'cashier'], ['Manager', 'manager'],
            ['Administrator', 'admin'], ['Waiter', 'locky'], ['Waiter', 'gone']
        ]) {
            await createUser(role, label);
        }
        await createUser('Waiter', 'sleepy', { status: 'INACTIVE' });
        await createUser('Waiter', 'newbie', { mustChange: 1 });

        await createMenuItem('Bunny Chow', 95);
        await createMenuItem('Malva Pudding', 55);
        await createMenuItem('Bobotie', 120, false);

        await createTable('A', 4);
        await createTable('OOS', 4, 'OUT_OF_SERVICE');
    });

    afterAll(async () => {
        const ids = (list) => (list.length ? list : [0]);
        const [registered] = await db.query('SELECT user_id FROM users WHERE email LIKE ?', [`%.${tag}@test.local`]);
        const allUsers = ids([...new Set([...created.users, ...registered.map((r) => r.user_id)])]);

        const [orderRows] = await db.query(
            'SELECT order_id FROM orders WHERE customer_id IN (?) OR staff_id IN (?)', [allUsers, allUsers]
        );
        const orderIds = ids([...new Set([...created.orders, ...orderRows.map((r) => r.order_id)])]);

        await db.query('DELETE FROM payments WHERE order_id IN (?)', [orderIds]);
        await db.query('DELETE FROM order_items WHERE order_id IN (?)', [orderIds]);
        await db.query('DELETE FROM orders WHERE order_id IN (?)', [orderIds]);
        await db.query('DELETE FROM menu_items WHERE id IN (?)', [ids(created.menu)]);
        await db.query('DELETE FROM restaurant_tables WHERE table_id IN (?)', [ids(created.tables)]);
        await db.query('DELETE FROM audit_logs WHERE user_id IN (?)', [allUsers]);
        await db.query("DELETE FROM audit_logs WHERE user_id IS NULL AND description LIKE ?", [`%${tag}@test.local%`]);
        await db.query('DELETE FROM users WHERE user_id IN (?)', [allUsers]);
        await db.end();
    });

    // ===================================================== login hardening
    describe('login (P1) and sessions (P2)', () => {
        test('staff login sets an httpOnly, Secure, SameSite=Strict cookie and returns no token', async () => {
            const res = await request(app).post('/api/auth/staff-login').send({ email: emailFor('waiter'), password: PASSWORD });
            expect(res.status).toBe(200);
            expect(res.body.data.user).toEqual(expect.objectContaining({ role: 'Waiter', must_change_pw: false }));
            expect(JSON.stringify(res.body)).not.toMatch(/eyJ/); // no JWT in the body

            const cookie = cookieFrom(res);
            expect(cookie).toMatch(/^ubms_token=/);
            expect(cookie).toMatch(/HttpOnly/i);
            expect(cookie).toMatch(/Secure/i);
            expect(cookie).toMatch(/SameSite=Strict/i);

            const me = await request(app).get('/api/auth/me').set('Cookie', cookieValue(res));
            expect(me.status).toBe(200);
            expect(me.body.data.user.user_id).toBe(users.waiter);

            const audit = await lastAudit('LOGIN_SUCCESS', users.waiter);
            expect(audit).toBeDefined();
            expect(audit.ip_address).toBeTruthy();
        });

        test('each portal only accepts its own users', async () => {
            const staffAtCustomer = await request(app).post('/api/auth/login').send({ email: emailFor('waiter'), password: PASSWORD });
            expect(staffAtCustomer.status).toBe(403);
            expect(staffAtCustomer.body.error.message).toBe('Please use the correct login page.');

            const customerAtStaff = await request(app).post('/api/auth/staff-login').send({ email: emailFor('customer'), password: PASSWORD });
            expect(customerAtStaff.status).toBe(403);

            const customer = await request(app).post('/api/auth/login').send({ email: emailFor('customer').toUpperCase(), password: PASSWORD });
            expect(customer.status).toBe(200);
        });

        test('wrong password and unknown account get the same generic 401', async () => {
            const wrong = await request(app).post('/api/auth/staff-login').send({ email: emailFor('manager'), password: 'Wrong1234' });
            const unknown = await request(app).post('/api/auth/staff-login').send({ email: emailFor('nobody'), password: 'Wrong1234' });
            expect(wrong.status).toBe(401);
            expect(unknown.status).toBe(401);
            expect(wrong.body.error.message).toBe('Incorrect email or password.');
            expect(unknown.body.error.message).toBe(wrong.body.error.message);

            const [[anon]] = await db.query(
                "SELECT * FROM audit_logs WHERE action = 'LOGIN_FAILED' AND user_id IS NULL AND description LIKE ? ORDER BY log_id DESC LIMIT 1",
                [`%${emailFor('nobody')}%`]
            );
            expect(anon).toBeDefined();
        });

        test('blank fields -> 400', async () => {
            const res = await request(app).post('/api/auth/staff-login').send({ email: '', password: '' });
            expect(res.status).toBe(400);
            expect(res.body.error.message).toBe('Email/username and password are required.');
        });

        test('5 wrong passwords lock the account for 15 minutes', async () => {
            for (let i = 1; i <= 5; i += 1) {
                const res = await request(app).post('/api/auth/staff-login').send({ email: emailFor('locky'), password: `Wrong${i}abc` });
                expect(res.status).toBe(401);
            }

            const locked = await request(app).post('/api/auth/staff-login').send({ email: emailFor('locky'), password: PASSWORD });
            expect(locked.status).toBe(429);
            expect(locked.body.error.message).toBe('Too many attempts. Try again in 15 minutes.');
            expect(await lastAudit('ACCOUNT_LOCKED', users.locky)).toBeDefined();

            const [[row]] = await db.query('SELECT locked_until FROM users WHERE user_id = ?', [users.locky]);
            const minutes = (new Date(row.locked_until) - Date.now()) / 60000;
            expect(minutes).toBeGreaterThan(14);
            expect(minutes).toBeLessThanOrEqual(15.1);
        });

        test('the account unlocks when the lock expires', async () => {
            await db.query('UPDATE users SET locked_until = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE user_id = ?', [users.locky]);
            const res = await request(app).post('/api/auth/staff-login').send({ email: emailFor('locky'), password: PASSWORD });
            expect(res.status).toBe(200);

            const [[row]] = await db.query('SELECT failed_logins, locked_until FROM users WHERE user_id = ?', [users.locky]);
            expect(row.failed_logins).toBe(0);
            expect(row.locked_until).toBeNull();
        });

        test('inactive accounts: message only after the right password', async () => {
            const right = await request(app).post('/api/auth/staff-login').send({ email: emailFor('sleepy'), password: PASSWORD });
            expect(right.status).toBe(403);
            expect(right.body.error.message).toBe('Your account is inactive. Contact your manager.');

            const wrong = await request(app).post('/api/auth/staff-login').send({ email: emailFor('sleepy'), password: 'Wrong1234' });
            expect(wrong.status).toBe(401);
        });

        test('missing, invalid and expired tokens are 401 (not 403)', async () => {
            const expired = jwt.sign({ sub: String(users.waiter), role: 'Waiter' }, process.env.JWT_SECRET, { expiresIn: -10 });
            const forged = jwt.sign({ sub: String(users.waiter), role: 'Waiter' }, 'not-the-secret');

            for (const res of [
                await request(app).get('/api/v1/orders'),
                await request(app).get('/api/v1/orders').set('Cookie', `ubms_token=${expired}`),
                await request(app).get('/api/v1/orders').set('Authorization', `Bearer ${forged}`)
            ]) {
                expect(res.status).toBe(401);
                expect(res.body.error.message).toBe('Your session has expired. Please log in again.');
            }
        });

        test('the role comes from the database, not the token', async () => {
            const claimsAdmin = jwt.sign({ sub: String(users.waiter), role: 'Administrator' }, process.env.JWT_SECRET);
            const res = await request(app).get('/api/v1/users').set('Authorization', `Bearer ${claimsAdmin}`);
            expect(res.status).toBe(403);

            const denied = await lastAudit('ACCESS_DENIED', users.waiter);
            expect(JSON.parse(denied.description)).toEqual(expect.objectContaining({ path: '/api/v1/users', role: 'Waiter' }));
        });

        test('a deactivated user is logged out on the next request', async () => {
            expect((await as('gone').get('/api/v1/orders')).status).toBe(200);
            await db.query("UPDATE users SET status = 'INACTIVE' WHERE user_id = ?", [users.gone]);
            expect((await as('gone').get('/api/v1/orders')).status).toBe(401);
        });

        test('logout clears the cookie and is audited', async () => {
            const login = await request(app).post('/api/auth/staff-login').send({ email: emailFor('cashier'), password: PASSWORD });
            const res = await request(app).post('/api/auth/logout').set('Cookie', cookieValue(login));
            expect(res.status).toBe(200);
            expect(cookieFrom(res)).toMatch(/ubms_token=;.*Expires=Thu, 01 Jan 1970/i);
            expect(await lastAudit('LOGOUT', users.cashier)).toBeDefined();
        });

        test('a temporary password must be changed before anything else', async () => {
            const login = await request(app).post('/api/auth/staff-login').send({ email: emailFor('newbie'), password: PASSWORD });
            expect(login.status).toBe(200);
            expect(login.body.data.user.must_change_pw).toBe(true);
            const cookie = cookieValue(login);

            const blocked = await request(app).get('/api/v1/orders').set('Cookie', cookie);
            expect(blocked.status).toBe(403);
            expect(blocked.body.error.code).toBe('PASSWORD_CHANGE_REQUIRED');

            expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(200);

            const badCurrent = await request(app).post('/api/auth/change-password').set('Cookie', cookie)
                .send({ current_password: 'Nope12345', new_password: 'Fresh2026x' });
            expect(badCurrent.status).toBe(400);

            const weak = await request(app).post('/api/auth/change-password').set('Cookie', cookie)
                .send({ current_password: PASSWORD, new_password: 'weakpass' });
            expect(weak.status).toBe(400);

            const changed = await request(app).post('/api/auth/change-password').set('Cookie', cookie)
                .send({ current_password: PASSWORD, new_password: 'Fresh2026x', confirm_password: 'Fresh2026x' });
            expect(changed.status).toBe(200);
            expect(changed.body.data.user.must_change_pw).toBe(false);

            expect((await request(app).get('/api/v1/orders').set('Cookie', cookie)).status).toBe(200);
            expect(await lastAudit('PASSWORD_CHANGED', users.newbie)).toBeDefined();
        });
    });

    describe('customer registration (P3)', () => {
        const form = (overrides = {}) => ({
            first_name: 'Thabo',
            last_name: "O'Neil-Nkosi",
            email: emailFor('register'),
            phone: '082 123 4567',
            password: 'Sawubona2026',
            confirm_password: 'Sawubona2026',
            ...overrides
        });

        test.each([
            [{ password: 'weakpass', confirm_password: 'weakpass' }, 'password'],
            [{ confirm_password: 'Different2026' }, 'confirm_password'],
            [{ phone: '12345' }, 'phone'],
            [{ email: 'not-an-email' }, 'email'],
            [{ first_name: 'T' }, 'first_name']
        ])('invalid %o -> 400 on %s', async (overrides, field) => {
            const res = await request(app).post('/api/auth/register').send(form(overrides));
            expect(res.status).toBe(400);
            expect(res.body.error.fields.map((f) => f.field)).toContain(field);
        });

        test('registers a customer, joins first and last name; duplicates -> 409', async () => {
            const res = await request(app).post('/api/auth/register').send(form());
            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Registration successful. Please log in.');

            const [[row]] = await db.query(
                'SELECT u.full_name, u.phone, r.role_name FROM users u JOIN roles r ON r.role_id = u.role_id WHERE u.user_id = ?',
                [res.body.data.user_id]
            );
            expect(row).toEqual({ full_name: "Thabo O'Neil-Nkosi", phone: '0821234567', role_name: 'Customer' });

            const dup = await request(app).post('/api/auth/register').send(form({ email: emailFor('register').toUpperCase() }));
            expect(dup.status).toBe(409);
        });
    });

    // ============================================================ orders
    describe('orders (P4, P5)', () => {
        let customerOrder;
        let staffOrder;

        test('customer places a Collection order; prices come from the server', async () => {
            const res = await as('customer').post('/api/v1/orders', {
                order_type: 'COLLECTION',
                special_instructions: 'Extra napkins',
                lines: [
                    { menu_item_id: menu['Bunny Chow'], quantity: 2, unit_price: 1, notes: 'No onions' },
                    { menu_item_id: menu['Malva Pudding'], quantity: 1 }
                ]
            });
            expect(res.status).toBe(201);
            expect(res.body.message).toBe('Order placed successfully');
            expect(res.body.data).toEqual(expect.objectContaining({
                order_status: 'PENDING', sales_channel: 'ONLINE', order_type: 'COLLECTION',
                total: 245, item_count: 3, customer_id: users.customer
            }));
            expect(res.body.data.order_ref).toMatch(/^UB-\d{4,}$/);
            expect(res.body.data.lines.map((l) => [l.unit_price, l.line_total, l.notes])).toEqual([
                [95, 190, 'No onions'], [55, 55, null]
            ]);
            customerOrder = res.body.data;
            created.orders.push(customerOrder.order_id);
        });

        test('unavailable items are rejected inside the transaction (BR-01)', async () => {
            const res = await as('customer').post('/api/v1/orders', {
                order_type: 'COLLECTION',
                lines: [{ menu_item_id: menu['Bunny Chow'], quantity: 1 }, { menu_item_id: menu.Bobotie, quantity: 1 }]
            });
            expect(res.status).toBe(409);
            expect(res.body.error.message).toBe(`Bobotie ${tag} is no longer available.`);
        });

        test.each([
            [{ lines: [] }, 'lines'],
            [{ lines: [{ menu_item_id: 1, quantity: 26 }] }, 'lines.0.quantity'],
            [{ lines: [{ menu_item_id: 1, quantity: 0 }] }, 'lines.0.quantity'],
            [{ lines: [{ menu_item_id: 1, quantity: 1.5 }] }, 'lines.0.quantity'],
            [{ order_type: 'DELIVERY' }, 'order_type']
        ])('invalid order %o -> 400 on %s', async (overrides, field) => {
            const res = await as('customer').post('/api/v1/orders', {
                order_type: 'COLLECTION', lines: [{ menu_item_id: 1, quantity: 1 }], ...overrides
            });
            expect(res.status).toBe(400);
            expect(res.body.error.fields.map((f) => f.field)).toContain(field);
        });

        test('dine-in needs an in-service table', async () => {
            const lines = [{ menu_item_id: menu['Malva Pudding'], quantity: 1 }];
            expect((await as('waiter').post('/api/v1/orders', { order_type: 'DINE_IN', lines })).status).toBe(400);
            expect((await as('waiter').post('/api/v1/orders', { order_type: 'DINE_IN', table_id: tables.OOS, lines })).status).toBe(409);
        });

        test('staff capture a walk-in dine-in order (In-house, named after the table)', async () => {
            const res = await as('waiter').post('/api/v1/orders', {
                order_type: 'DINE_IN', table_id: tables.A,
                lines: [{ menu_item_id: menu['Bunny Chow'], quantity: 1 }]
            });
            expect(res.status).toBe(201);
            expect(res.body.data.sales_channel).toBe('IN_HOUSE');
            expect(res.body.data.customer_name).toBe(`Table YA-${tag}`);
            expect(res.body.data.staff_name).toBe('Test waiter');
            staffOrder = res.body.data;
            created.orders.push(staffOrder.order_id);
        });

        test('staff collection orders need a customer name', async () => {
            const res = await as('waiter').post('/api/v1/orders', {
                order_type: 'COLLECTION', lines: [{ menu_item_id: menu['Bunny Chow'], quantity: 1 }]
            });
            expect(res.status).toBe(400);
            expect(res.body.error.fields[0].field).toBe('guest_name');
        });

        test('kitchen staff and cashiers cannot place orders', async () => {
            const body = { order_type: 'COLLECTION', guest_name: 'X Y', lines: [{ menu_item_id: menu['Bunny Chow'], quantity: 1 }] };
            expect((await as('kitchen').post('/api/v1/orders', body)).status).toBe(403);
            expect((await as('cashier').post('/api/v1/orders', body)).status).toBe(403);
        });

        test('customers see only their own orders', async () => {
            const mine = await as('customer').get('/api/v1/orders');
            expect(mine.status).toBe(200);
            expect(mine.body.data.orders.map((o) => o.order_id)).toEqual([customerOrder.order_id]);
            expect(mine.body.data.summary).toBeUndefined();

            expect((await as('customer2').get(`/api/v1/orders/${customerOrder.order_ref}`)).status).toBe(403);
            expect((await as('customer').get(`/api/v1/orders/${customerOrder.order_ref}`)).status).toBe(200);
        });

        test('staff list has search and dashboard counts', async () => {
            const res = await as('manager').get(`/api/v1/orders?date=${TODAY}&search=${customerOrder.order_ref}`);
            expect(res.status).toBe(200);
            expect(res.body.data.orders.map((o) => o.order_id)).toEqual([customerOrder.order_id]);
            expect(res.body.data.summary.pending).toBeGreaterThanOrEqual(2);
        });

        test('status follows Pending → Confirmed → Preparing → Ready with role checks', async () => {
            const url = `/api/v1/orders/${staffOrder.order_ref}/status`;

            expect((await as('kitchen').patch(url, { status: 'CONFIRMED' })).status).toBe(403);
            expect((await as('waiter').patch(url, { status: 'PREPARING' })).status).toBe(409);

            const confirmed = await as('waiter').patch(url, { status: 'CONFIRMED' });
            expect(confirmed.status).toBe(200);
            expect(confirmed.body.data.order_status).toBe('CONFIRMED');

            const kitchenQueue = await as('kitchen').get('/api/v1/orders');
            const queueIds = kitchenQueue.body.data.orders.map((o) => o.order_id);
            expect(queueIds).toContain(staffOrder.order_id);
            expect(queueIds).not.toContain(customerOrder.order_id); // still Pending

            expect((await as('kitchen').patch(url, { status: 'PREPARING' })).status).toBe(200);
            expect((await as('kitchen').patch(url, { status: 'READY' })).status).toBe(200);
        });

        test('completing needs a payment; paying completes the order; closed orders are locked', async () => {
            const url = `/api/v1/orders/${staffOrder.order_ref}/status`;

            const unpaid = await as('waiter').patch(url, { status: 'COMPLETED' });
            expect(unpaid.status).toBe(409);
            expect(unpaid.body.error.message).toBe('Record payment before completing the order.');

            const paid = await as('cashier').post('/api/v1/payments', {
                order_ref: staffOrder.order_ref, payment_method_id: 1, amount_tendered: 100
            });
            expect(paid.status).toBe(201);

            const detail = await as('waiter').get(`/api/v1/orders/${staffOrder.order_ref}`);
            expect(detail.body.data.order_status).toBe('COMPLETED');
            expect(detail.body.data.payment.receipt_number).toMatch(/^RC-/);

            const closed = await as('manager').patch(url, { status: 'COMPLETED' });
            expect(closed.status).toBe(409);
            expect(closed.body.error.message).toBe('This order is closed and cannot be changed.');
        });

        test('cancellation rules (P5, BR-11)', async () => {
            const place = async (who, extra = {}) => {
                const res = await as(who).post('/api/v1/orders', {
                    order_type: 'COLLECTION', guest_name: 'Cancel Test',
                    lines: [{ menu_item_id: menu['Malva Pudding'], quantity: 1 }], ...extra
                });
                created.orders.push(res.body.data.order_id);
                return res.body.data.order_ref;
            };
            const status = (ref, s) => as('manager').patch(`/api/v1/orders/${ref}/status`, { status: s });

            // Customer cancels own Pending order
            const own = await as('customer').post(`/api/v1/orders/${customerOrder.order_ref}/cancel`, {});
            expect(own.status).toBe(200);
            expect(own.body.data.order_status).toBe('CANCELLED');
            expect(own.body.data.cancel_reason).toBe('Cancelled by customer');

            // Waiter needs a reason, and cannot cancel after confirmation
            const pendingRef = await place('waiter');
            expect((await as('waiter').post(`/api/v1/orders/${pendingRef}/cancel`, {})).status).toBe(400);
            await status(pendingRef, 'CONFIRMED');
            expect((await as('waiter').post(`/api/v1/orders/${pendingRef}/cancel`, { reason: 'Guest left' })).status).toBe(403);

            // Manager can cancel while Preparing, not once Ready
            await status(pendingRef, 'PREPARING');
            const mgr = await as('manager').post(`/api/v1/orders/${pendingRef}/cancel`, { reason: 'Kitchen out of stock' });
            expect(mgr.status).toBe(200);

            const readyRef = await place('manager');
            await status(readyRef, 'CONFIRMED');
            await status(readyRef, 'PREPARING');
            await status(readyRef, 'READY');
            expect((await as('manager').post(`/api/v1/orders/${readyRef}/cancel`, { reason: 'Too late' })).status).toBe(409);

            // Cancelled orders are kept (no hard delete) and cannot be paid
            const [[kept]] = await db.query('SELECT order_status FROM orders WHERE order_id = ?', [customerOrder.order_id]);
            expect(kept.order_status).toBe('CANCELLED');
            const pay = await as('cashier').post('/api/v1/payments', {
                order_ref: customerOrder.order_ref, payment_method_id: 1, amount_tendered: 500
            });
            expect(pay.status).toBe(409);
        });

        test('order events are audited', async () => {
            const [rows] = await db.query(
                "SELECT DISTINCT action FROM audit_logs WHERE user_id IN (?) AND action LIKE 'ORDER_%'",
                [[users.customer, users.waiter, users.kitchen, users.manager]]
            );
            expect(rows.map((r) => r.action).sort()).toEqual(['ORDER_CANCELLED', 'ORDER_PLACED', 'ORDER_STATUS']);
        });
    });

    // ============================================================= users
    describe('staff users and roles (P11) and the audit log (FR-21)', () => {
        let newUser;
        let tempPassword;

        test('only the Administrator can manage users', async () => {
            expect((await as('manager').get('/api/v1/users')).status).toBe(403);
            expect((await as('admin').get('/api/v1/users')).status).toBe(200);

            const roles = await as('admin').get('/api/v1/users/roles');
            expect(roles.body.data.map((r) => r.role_name)).not.toContain('Customer');
        });

        test('creating staff gives a one-time temporary password that must be changed', async () => {
            const res = await as('admin').post('/api/v1/users', {
                full_name: 'Kagiso Rammala', email: `kagiso.${tag}@test.local`, role: 'Cashier'
            });
            expect(res.status).toBe(201);
            newUser = res.body.data.user;
            tempPassword = res.body.data.temporary_password;
            expect(newUser).toEqual(expect.objectContaining({ role: 'Cashier', must_change_pw: true, status: 'ACTIVE' }));
            expect(tempPassword).toMatch(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d).{12}$/);

            const login = await request(app).post('/api/auth/staff-login').send({ email: newUser.email, password: tempPassword });
            expect(login.status).toBe(200);
            expect(login.body.data.user.must_change_pw).toBe(true);

            const list = await as('admin').get(`/api/v1/users?search=kagiso.${tag}`);
            expect(JSON.stringify(list.body)).not.toMatch(/password_hash|\$2[aby]\$/);
        });

        test('validation: unique username, staff roles only', async () => {
            expect((await as('admin').post('/api/v1/users', {
                full_name: 'Copy Cat', email: `kagiso.${tag}@test.local`, role: 'Waiter'
            })).status).toBe(409);
            expect((await as('admin').post('/api/v1/users', {
                full_name: 'Not Staff', email: `cust.${tag}@test.local`, role: 'Customer'
            })).status).toBe(400);
        });

        test('role changes are saved and audited old → new', async () => {
            const res = await as('admin').put(`/api/v1/users/${newUser.user_id}`, {
                full_name: 'Kagiso Rammala', email: newUser.email, role: 'Waiter'
            });
            expect(res.status).toBe(200);
            expect(res.body.data.role).toBe('Waiter');

            const audit = await lastAudit('USER_SAVED', users.admin);
            expect(JSON.parse(audit.description).changes.role).toEqual({ from: 'Cashier', to: 'Waiter' });
        });

        test('administrators cannot lock themselves out', async () => {
            const self = await as('admin').patch(`/api/v1/users/${users.admin}/status`, { status: 'INACTIVE' });
            expect(self.status).toBe(409);
            expect(self.body.error.message).toBe('You cannot deactivate your own account.');

            const ownRole = await as('admin').put(`/api/v1/users/${users.admin}`, {
                full_name: 'Test admin', email: emailFor('admin'), role: 'Manager'
            });
            expect(ownRole.status).toBe(409);
        });

        test('customer accounts are viewable but not editable here', async () => {
            const customers = await as('admin').get('/api/v1/users?type=customer');
            expect(customers.status).toBe(200);
            expect(customers.body.data.map((u) => u.user_id)).toContain(users.customer);

            const edit = await as('admin').patch(`/api/v1/users/${users.customer}/status`, { status: 'INACTIVE' });
            expect(edit.status).toBe(409);
        });

        test('deactivation blocks login and ends the session; reactivation restores it', async () => {
            const login = await request(app).post('/api/auth/staff-login').send({ email: newUser.email, password: tempPassword });
            const cookie = cookieValue(login);

            expect((await as('admin').patch(`/api/v1/users/${newUser.user_id}/status`, { status: 'INACTIVE' })).status).toBe(200);
            expect((await request(app).get('/api/auth/me').set('Cookie', cookie)).status).toBe(401);
            expect((await request(app).post('/api/auth/staff-login').send({ email: newUser.email, password: tempPassword })).status).toBe(403);

            expect((await as('admin').patch(`/api/v1/users/${newUser.user_id}/status`, { status: 'ACTIVE' })).status).toBe(200);
        });

        test('password reset issues a new temporary password and clears a lockout', async () => {
            await db.query('UPDATE users SET locked_until = DATE_ADD(NOW(), INTERVAL 15 MINUTE) WHERE user_id = ?', [newUser.user_id]);

            const res = await as('admin').post(`/api/v1/users/${newUser.user_id}/reset-password`, {});
            expect(res.status).toBe(200);
            const fresh = res.body.data.temporary_password;
            expect(fresh).not.toBe(tempPassword);

            expect((await request(app).post('/api/auth/staff-login').send({ email: newUser.email, password: tempPassword })).status).toBe(401);
            expect((await request(app).post('/api/auth/staff-login').send({ email: newUser.email, password: fresh })).status).toBe(200);
            created.users.push(newUser.user_id);
        });

        test('the audit log can be filtered and never contains passwords', async () => {
            const res = await as('admin').get(`/api/v1/audit?action=USER_SAVED&user_id=${users.admin}&from=${addDays(TODAY, -1)}&to=${TODAY}`);
            expect(res.status).toBe(200);
            expect(res.body.data.total).toBeGreaterThanOrEqual(3);
            expect(res.body.data.entries.every((e) => e.action === 'USER_SAVED')).toBe(true);
            expect(res.body.data.entries[0].details.entity).toBe('users');

            const [rows] = await db.query('SELECT description FROM audit_logs WHERE user_id IN (?)', [created.users]);
            const text = rows.map((r) => r.description).join(' ');
            expect(text).not.toContain(PASSWORD);
            expect(text).not.toContain(tempPassword);

            expect((await as('manager').get('/api/v1/audit')).status).toBe(403);
        });
    });

    // =========================================================== reports
    describe('reports (P10)', () => {
        test('Manager and Administrator only', async () => {
            expect((await as('waiter').get(`/api/v1/reports/orders?from=${TODAY}&to=${TODAY}`)).status).toBe(403);
            expect((await as('admin').get(`/api/v1/reports/orders?from=${TODAY}&to=${TODAY}`)).status).toBe(200);
        });

        test.each([
            [`?to=${TODAY}`, 'from'],
            [`?from=${TODAY}&to=${addDays(TODAY, -1)}`, 'to'],
            [`?from=${addDays(TODAY, -400)}&to=${TODAY}`, 'from']
        ])('invalid range %s -> 400 on %s', async (qs, field) => {
            const res = await as('manager').get(`/api/v1/reports/orders${qs}`);
            expect(res.status).toBe(400);
            expect(res.body.error.fields.map((f) => f.field)).toContain(field);
        });

        test('unknown report type -> 400', async () => {
            expect((await as('manager').get(`/api/v1/reports/salaries?from=${TODAY}&to=${TODAY}`)).status).toBe(400);
        });

        test('orders report totals are calculated from the stored orders', async () => {
            const res = await as('manager').get(`/api/v1/reports/orders?from=${TODAY}&to=${TODAY}`);
            expect(res.status).toBe(200);
            const { rows, summary, totals, generated_by: by } = res.body.data;

            const [[db1]] = await db.query(
                `SELECT COUNT(*) AS n, SUM(CASE WHEN order_status <> 'CANCELLED' THEN total_amount ELSE 0 END) AS revenue,
                        SUM(order_status = 'CANCELLED') AS cancelled
                 FROM orders WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)`,
                [TODAY, TODAY]
            );
            expect(summary.orders).toBe(Number(db1.n));
            expect(summary.revenue).toBe(Number(db1.revenue));
            expect(summary.cancelled).toBe(Number(db1.cancelled));
            expect(totals.orders).toBe(rows.reduce((s, r) => s + r.orders, 0));
            expect(by).toBe('Test manager');
        });

        test('filters, payments, reservations and stock reports', async () => {
            const dineIn = await as('manager').get(`/api/v1/reports/orders?from=${TODAY}&to=${TODAY}&order_type=DINE_IN`);
            expect(dineIn.body.data.rows.every((r) => r.collection === 0)).toBe(true);

            const payments = await as('manager').get(`/api/v1/reports/payments?from=${TODAY}&to=${TODAY}`);
            expect(payments.status).toBe(200);
            expect(payments.body.data.summary.by_method.map((m) => m.method_name)).toContain('Cash');

            const reservations = await as('manager').get(`/api/v1/reports/reservations?from=${TODAY}&to=${addDays(TODAY, 30)}`);
            expect(reservations.status).toBe(200);
            expect(reservations.body.data.summary).toEqual(expect.objectContaining({ no_show_rate: expect.any(Number) }));

            const stock = await as('manager').get(`/api/v1/reports/stock?from=${addDays(TODAY, -7)}&to=${TODAY}`);
            expect(stock.status).toBe(200);
            expect(stock.body.data.columns.map((c) => c.key)).toEqual(expect.arrayContaining(['on_hand', 'wasted']));
        });

        test('CSV export downloads a UTF-8 file for Excel', async () => {
            const res = await as('manager').get(`/api/v1/reports/orders?from=${TODAY}&to=${TODAY}&format=csv`);
            expect(res.status).toBe(200);
            expect(res.headers['content-type']).toMatch(/^text\/csv/);
            expect(res.headers['content-disposition']).toBe(`attachment; filename="ubms-orders-${TODAY}-to-${TODAY}.csv"`);
            expect(res.text.charCodeAt(0)).toBe(0xFEFF);
            expect(res.text).toContain('Date,Orders,Dine-in,Collection,Revenue (R),Cancelled');
            expect(res.text).toContain('Generated by,Test manager');
        });

        test('report runs are audited', async () => {
            const audit = await lastAudit('REPORT_RUN', users.manager);
            expect(JSON.parse(audit.description)).toEqual(expect.objectContaining({ type: 'orders', format: 'csv' }));
        });
    });
});

if (!RUN) {
    test.skip('integration tests skipped - set RUN_DB_TESTS=1 to run them', () => {});
}
