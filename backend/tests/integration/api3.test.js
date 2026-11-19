// API integration tests: menu management (FR-05 to FR-07, P9) and menu
// image upload (4.4.5).
//
//   RUN_DB_TESTS=1 DB_HOST=... DB_PORT=... DB_USER=... DB_PASSWORD=... npm test
//
// Needs migrations 001-003. Uses a temporary upload folder and removes the
// users, categories, items and orders it creates.

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const sharp = require('sharp');

process.env.JWT_SECRET = process.env.JWT_SECRET || 'integration-test-secret';
process.env.UPLOAD_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'ubms-uploads-'));

const app = require('../../app');
const { db } = require('../../config/db');

const RUN = process.env.RUN_DB_TESTS === '1';
const maybe = RUN ? describe : describe.skip;

const tag = crypto.randomBytes(3).toString('hex');
const created = { users: [], categories: [] };
const tokens = {};
const ids = {};

const as = (label) => ({
    get: (url) => request(app).get(url).set('Authorization', `Bearer ${tokens[label]}`),
    post: (url, body) => request(app).post(url).set('Authorization', `Bearer ${tokens[label]}`).send(body),
    put: (url, body) => request(app).put(url).set('Authorization', `Bearer ${tokens[label]}`).send(body),
    patch: (url, body) => request(app).patch(url).set('Authorization', `Bearer ${tokens[label]}`).send(body),
    delete: (url) => request(app).delete(url).set('Authorization', `Bearer ${tokens[label]}`),
    upload: (url, buffer, filename = 'photo.png', type = 'image/png') =>
        request(app).post(url).set('Authorization', `Bearer ${tokens[label]}`)
            .attach('image', buffer, { filename, contentType: type })
});

async function createUser(role, label) {
    const [[roleRow]] = await db.query('SELECT role_id FROM roles WHERE role_name = ?', [role]);
    const [result] = await db.query(
        'INSERT INTO users (role_id, full_name, email, password_hash) VALUES (?, ?, ?, ?)',
        [roleRow.role_id, `Test ${label}`, `${label}.${tag}@test.local`, 'x'.repeat(60)]
    );
    created.users.push(result.insertId);
    tokens[label] = jwt.sign({ sub: String(result.insertId), role }, process.env.JWT_SECRET);
}

const audit = async (action, recordId) => {
    const [rows] = await db.query(
        "SELECT description FROM audit_logs WHERE action = ? AND JSON_EXTRACT(description, '$.record_id') = ? ORDER BY log_id",
        [action, recordId]
    );
    return rows.map((r) => JSON.parse(r.description));
};

const pngOf = (width, height) =>
    sharp({ create: { width, height, channels: 3, background: { r: 201, g: 162, b: 39 } } }).png().toBuffer();

maybe('UBMS API - menu management and images', () => {
    beforeAll(async () => {
        for (const [role, label] of [['Manager', 'manager'], ['Administrator', 'admin'], ['Waiter', 'waiter'], ['Customer', 'customer']]) {
            await createUser(role, label);
        }
    });

    afterAll(async () => {
        const users = created.users.length ? created.users : [0];
        const [items] = await db.query('SELECT id FROM menu_items WHERE name LIKE ?', [`%${tag}%`]);
        const itemIds = items.length ? items.map((i) => i.id) : [0];
        const [orders] = await db.query('SELECT DISTINCT order_id FROM order_items WHERE menu_item_id IN (?)', [itemIds]);
        const orderIds = orders.length ? orders.map((o) => o.order_id) : [0];

        await db.query('DELETE FROM order_items WHERE order_id IN (?)', [orderIds]);
        await db.query('DELETE FROM orders WHERE order_id IN (?)', [orderIds]);
        await db.query('DELETE FROM menu_items WHERE id IN (?)', [itemIds]);
        await db.query('DELETE FROM menu_categories WHERE category_id IN (?)', [created.categories.length ? created.categories : [0]]);
        await db.query('DELETE FROM audit_logs WHERE user_id IN (?)', [users]);
        await db.query('DELETE FROM users WHERE user_id IN (?)', [users]);
        await db.end();
        fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
    });

    describe('access (Table 30)', () => {
        test('reading the menu is public', async () => {
            expect((await request(app).get('/api/v1/menu/categories')).status).toBe(200);
            expect((await request(app).get('/api/v1/menu/items')).status).toBe(200);
        });

        test('changing the menu needs a Manager or Administrator', async () => {
            const body = { name: `Nope ${tag}`, category_id: 1, price: 10 };
            expect((await request(app).post('/api/v1/menu/items').send(body)).status).toBe(401);
            expect((await as('waiter').post('/api/v1/menu/items', body)).status).toBe(403);
            expect((await as('customer').post('/api/v1/menu/items', body)).status).toBe(403);
            expect((await request(app).delete('/api/v1/menu/items/1')).status).toBe(401);
        });

        test('the old /api/menu address is read-only', async () => {
            const list = await request(app).get('/api/menu');
            expect(list.status).toBe(200);
            expect(Object.keys(list.body[0])).toEqual(expect.arrayContaining(['id', 'name', 'category', 'price', 'image', 'available']));

            for (const res of [
                await request(app).post('/api/menu').send({ name: 'Hack', category: 'x', price: 1 }),
                await request(app).put('/api/menu/1').send({ name: 'Hack', category: 'x', price: 1 }),
                await request(app).patch('/api/menu/1/availability').send({ available: false }),
                await request(app).delete('/api/menu/1')
            ]) {
                expect(res.status).toBe(410);
                expect(res.body.error.code).toBe('MOVED');
            }
        });
    });

    describe('categories', () => {
        test('manager adds a category; names are unique', async () => {
            const res = await as('manager').post('/api/v1/menu/categories', { name: `Specials ${tag}`, sort_order: 9 });
            expect(res.status).toBe(201);
            ids.category = res.body.data.category_id;
            created.categories.push(ids.category);

            expect((await as('admin').post('/api/v1/menu/categories', { name: `Specials ${tag}` })).status).toBe(409);
        });
    });

    describe('items (P9)', () => {
        test('manager adds an item; it appears on the public menu and is audited', async () => {
            const res = await as('manager').post('/api/v1/menu/items', {
                name: `Bunny Chow ${tag}`, category_id: ids.category, price: 95, description: 'Quarter loaf with lamb curry'
            });
            expect(res.status).toBe(201);
            expect(res.body.data).toEqual(expect.objectContaining({
                name: `Bunny Chow ${tag}`, category_name: `Specials ${tag}`, price: 95, is_available: true, image_path: null
            }));
            ids.item = res.body.data.menu_item_id;

            const menu = await request(app).get(`/api/v1/menu/items?category_id=${ids.category}`);
            expect(menu.body.data.map((i) => i.menu_item_id)).toEqual([ids.item]);

            expect(await audit('MENU_ITEM_CREATED', ids.item)).toHaveLength(1);
        });

        test.each([
            [{ price: 0 }, 'price', 'Please enter a valid price.'],
            [{ price: 1000 }, 'price', 'Price must be R999.99 or less.'],
            [{ price: 12.345 }, 'price', 'Price can have at most 2 decimals.'],
            [{ price: '90.OO' }, 'price', 'Please enter a valid price.'],
            [{ name: '' }, 'name', 'Enter the item name.'],
            [{ name: 'x'.repeat(51) }, 'name', 'Item name must be 50 characters or fewer.'],
            [{ description: 'd'.repeat(256) }, 'description', 'Description must be 255 characters or fewer.']
        ])('invalid %o -> 400 on %s', async (override, field, message) => {
            const res = await as('manager').post('/api/v1/menu/items', {
                name: `Valid ${tag}`, category_id: ids.category, price: 50, ...override
            });
            expect(res.status).toBe(400);
            expect(res.body.error.fields).toEqual(expect.arrayContaining([{ field, message }]));
        });

        test('unknown category -> 400; duplicate active name -> 409', async () => {
            expect((await as('manager').post('/api/v1/menu/items', { name: `Other ${tag}`, category_id: 999999, price: 5 })).status).toBe(400);
            const dup = await as('manager').post('/api/v1/menu/items', { name: `Bunny Chow ${tag}`, category_id: ids.category, price: 5 });
            expect(dup.status).toBe(409);
            expect(dup.body.error.message).toBe(`A menu item called 'Bunny Chow ${tag}' already exists.`);
        });

        test('a price change is audited old -> new; other edits are not logged as price changes', async () => {
            const body = { name: `Bunny Chow ${tag}`, category_id: ids.category, price: 99.5, description: 'Quarter loaf with lamb curry' };
            const res = await as('admin').put(`/api/v1/menu/items/${ids.item}`, body);
            expect(res.status).toBe(200);
            expect(res.body.data.price).toBe(99.5);
            expect(res.body.message).toBe('Menu item updated successfully');

            await as('admin').put(`/api/v1/menu/items/${ids.item}`, { ...body, description: 'Now with extra chutney' });

            expect(await audit('PRICE_CHANGED', ids.item)).toEqual([
                expect.objectContaining({ from: 95, to: 99.5 })
            ]);
            const updates = await audit('MENU_ITEM_UPDATED', ids.item);
            expect(updates[updates.length - 1].changes).toEqual({
                description: { from: 'Quarter loaf with lamb curry', to: 'Now with extra chutney' }
            });
        });

        test('unavailable items stay on the menu (greyed out) but cannot be ordered', async () => {
            const off = await as('manager').patch(`/api/v1/menu/items/${ids.item}/availability`, { is_available: false });
            expect(off.status).toBe(200);
            expect(off.body.data.is_available).toBe(false);

            const all = await request(app).get(`/api/v1/menu/items?category_id=${ids.category}`);
            expect(all.body.data[0].is_available).toBe(false);
            const availableOnly = await request(app).get(`/api/v1/menu/items?category_id=${ids.category}&available_only=true`);
            expect(availableOnly.body.data).toHaveLength(0);

            const order = await as('customer').post('/api/v1/orders', {
                order_type: 'COLLECTION', lines: [{ menu_item_id: ids.item, quantity: 1 }]
            });
            expect(order.status).toBe(409);

            await as('manager').patch(`/api/v1/menu/items/${ids.item}/availability`, { is_available: true });
        });

        test('deleting hides the item but keeps it for past orders; the name can be reused', async () => {
            const order = await as('customer').post('/api/v1/orders', {
                order_type: 'COLLECTION', lines: [{ menu_item_id: ids.item, quantity: 2 }]
            });
            expect(order.status).toBe(201);

            const del = await as('manager').delete(`/api/v1/menu/items/${ids.item}`);
            expect(del.status).toBe(200);
            expect(del.body.message).toBe('Menu item removed. Past orders that include it are kept.');

            expect((await request(app).get(`/api/v1/menu/items/${ids.item}`)).status).toBe(404);
            expect((await request(app).get(`/api/menu/${ids.item}`)).status).toBe(404);
            expect((await as('manager').delete(`/api/v1/menu/items/${ids.item}`)).status).toBe(404);

            const [[row]] = await db.query('SELECT is_active, available FROM menu_items WHERE id = ?', [ids.item]);
            expect(row).toEqual({ is_active: 0, available: 0 });

            const past = await as('customer').get(`/api/v1/orders/${order.body.data.order_ref}`);
            expect(past.body.data.lines[0]).toEqual(expect.objectContaining({ name: `Bunny Chow ${tag}`, quantity: 2 }));

            const again = await as('customer').post('/api/v1/orders', {
                order_type: 'COLLECTION', lines: [{ menu_item_id: ids.item, quantity: 1 }]
            });
            expect(again.status).toBe(409);

            const reuse = await as('manager').post('/api/v1/menu/items', { name: `Bunny Chow ${tag}`, category_id: ids.category, price: 105 });
            expect(reuse.status).toBe(201);
            ids.item2 = reuse.body.data.menu_item_id;
        });

        test('a category with items cannot be deactivated', async () => {
            const blocked = await as('manager').patch(`/api/v1/menu/categories/${ids.category}/status`, { is_active: false });
            expect(blocked.status).toBe(409);
            expect(blocked.body.error.message).toBe(`Move or delete the 1 menu item in 'Specials ${tag}' first.`);
        });
    });

    describe('photos (4.4.5, 4.8.4)', () => {
        test('a large PNG is resized to WebP, stored under a random name and served', async () => {
            const res = await as('manager').upload(`/api/v1/menu/items/${ids.item2}/image`, await pngOf(1600, 1200));
            expect(res.status).toBe(200);
            expect(res.body.data.image_path).toMatch(new RegExp(`^/uploads/menu/item-${ids.item2}-[0-9a-f]{16}\\.webp$`));
            ids.firstImage = res.body.data.image_path;

            const served = await request(app).get(ids.firstImage).buffer(true).parse((r, cb) => {
                const chunks = [];
                r.on('data', (c) => chunks.push(c));
                r.on('end', () => cb(null, Buffer.concat(chunks)));
            });
            expect(served.status).toBe(200);
            expect(served.headers['content-type']).toBe('image/webp');
            expect(served.headers['x-content-type-options']).toBe('nosniff');
            const meta = await sharp(served.body).metadata();
            expect([meta.width, meta.height]).toEqual([800, 600]);

            const legacy = await request(app).get(`/api/menu/${ids.item2}`);
            expect(legacy.body.image).toBe(ids.firstImage);
        });

        test('replacing the photo deletes the old file', async () => {
            const res = await as('admin').upload(`/api/v1/menu/items/${ids.item2}/image`, await pngOf(200, 200), 'small.png');
            expect(res.status).toBe(200);
            expect(res.body.data.image_path).not.toBe(ids.firstImage);

            const oldFile = path.join(process.env.UPLOAD_DIR, 'menu', path.basename(ids.firstImage));
            expect(fs.existsSync(oldFile)).toBe(false);
            expect((await request(app).get(ids.firstImage)).status).toBe(404);
            ids.secondImage = res.body.data.image_path;
        });

        test('files that are not real images are refused, whatever their name', async () => {
            const fake = await as('manager').upload(`/api/v1/menu/items/${ids.item2}/image`, Buffer.from('<script>alert(1)</script>'), 'photo.png');
            expect(fake.status).toBe(400);
            expect(fake.body.error.message).toBe('Upload a JPEG, PNG or WebP image.');

            const svg = await as('manager').upload(`/api/v1/menu/items/${ids.item2}/image`,
                Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'), 'logo.svg', 'image/svg+xml');
            expect(svg.status).toBe(400);
        });

        test('photos over 1 MB and empty uploads are refused', async () => {
            const big = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(1024 * 1024 + 10)]);
            const res = await as('manager').upload(`/api/v1/menu/items/${ids.item2}/image`, big);
            expect(res.status).toBe(400);
            expect(res.body.error.message).toBe('Image must be 1 MB or smaller.');

            const none = await request(app).post(`/api/v1/menu/items/${ids.item2}/image`)
                .set('Authorization', `Bearer ${tokens.manager}`).field('note', 'no file');
            expect(none.status).toBe(400);
            expect(none.body.error.message).toBe('Choose an image to upload.');

            const fileNames = fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'menu'));
            expect(fileNames).toEqual([path.basename(ids.secondImage)]);
        });

        test('only managers and admins can upload', async () => {
            expect((await as('waiter').upload(`/api/v1/menu/items/${ids.item2}/image`, await pngOf(20, 20))).status).toBe(403);
            expect((await request(app).post(`/api/v1/menu/items/${ids.item2}/image`).attach('image', await pngOf(20, 20), 'a.png')).status).toBe(401);
        });

        test('removing the photo clears it and deletes the file; all audited', async () => {
            const res = await as('manager').delete(`/api/v1/menu/items/${ids.item2}/image`);
            expect(res.status).toBe(200);
            expect(res.body.data.image_path).toBeNull();
            expect(fs.readdirSync(path.join(process.env.UPLOAD_DIR, 'menu'))).toEqual([]);

            expect(await audit('MENU_IMAGE_UPLOADED', ids.item2)).toHaveLength(2);
            expect(await audit('MENU_IMAGE_REMOVED', ids.item2)).toHaveLength(1);
        });

        test('once empty, the category can be deactivated and drops off the public menu', async () => {
            await as('manager').delete(`/api/v1/menu/items/${ids.item2}`);
            const res = await as('manager').patch(`/api/v1/menu/categories/${ids.category}/status`, { is_active: false });
            expect(res.status).toBe(200);

            const categories = await request(app).get('/api/v1/menu/categories');
            expect(categories.body.data.map((c) => c.category_id)).not.toContain(ids.category);
        });
    });
});

if (!RUN) {
    test.skip('integration tests skipped - set RUN_DB_TESTS=1 to run them', () => {});
}
