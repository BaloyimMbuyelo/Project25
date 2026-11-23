// Demo data for Reservations, Inventory and Payments (sample data only, NFR-11).
//
//   DEMO_PASSWORD=YourPass123 npm run seed:demo
//
// Creates one staff account per role, a sample customer, stock items (with
// opening-stock movements) and a few Ready orders so the cashier screen has
// something to pay. Safe to run more than once: existing rows are skipped.

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env'), quiet: true });

const bcrypt = require('bcryptjs');
const { db } = require('../config/db');

const USERS = [
    { email: 'admin@ubms.local', full_name: 'System Admin', role: 'Administrator' },
    { email: 'manager@ubms.local', full_name: 'Thandi Manager', role: 'Manager' },
    { email: 'waiter@ubms.local', full_name: 'Zanele Waiter', role: 'Waiter' },
    { email: 'kitchen@ubms.local', full_name: 'Bongani Kitchen', role: 'Kitchen Staff' },
    { email: 'cashier@ubms.local', full_name: 'Kagiso Cashier', role: 'Cashier' },
    { email: 'thabo.nkosi@example.com', full_name: 'Thabo Nkosi', role: 'Customer', phone: '0821234567' }
];

const STOCK = [
    { name: 'Chicken', category: 'Meat', unit: 'kg', qty: 25, reorder: 10 },
    { name: 'Beef', category: 'Meat', unit: 'kg', qty: 18, reorder: 8 },
    { name: 'Potatoes', category: 'Vegetables', unit: 'kg', qty: 40, reorder: 15 },
    { name: 'Tomatoes', category: 'Vegetables', unit: 'kg', qty: 5, reorder: 10 },
    { name: 'Cooking Oil', category: 'Supplies', unit: 'l', qty: 3, reorder: 5 },
    { name: 'Cheese', category: 'Dairy', unit: 'kg', qty: 12, reorder: 5 },
    { name: 'Pasta', category: 'Dry Goods', unit: 'kg', qty: 20, reorder: 8 },
    { name: 'Maize Meal', category: 'Dry Goods', unit: 'kg', qty: 0, reorder: 10 }
];

const DEMO_GUESTS = ['Lerato K. (demo)', 'Sipho D. (demo)', 'Naledi P. (demo)'];

function checkPassword(password) {
    if (!password || password.length < 8 || !/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/\d/.test(password)) {
        console.error('Set DEMO_PASSWORD (8+ characters with upper-case, lower-case and a digit), e.g.');
        console.error('  DEMO_PASSWORD=Bistro2026 npm run seed:demo');
        process.exit(1);
    }
}

async function seedUsers(password) {
    const hash = await bcrypt.hash(password, 12);
    const ids = {};

    for (const user of USERS) {
        const [existing] = await db.query('SELECT user_id FROM users WHERE email = ?', [user.email]);

        if (existing.length > 0) {
            ids[user.role] = existing[0].user_id;
            console.log(`  = ${user.email} (exists)`);
            continue;
        }

        const [roles] = await db.query('SELECT role_id FROM roles WHERE role_name = ?', [user.role]);
        if (roles.length === 0) throw new Error(`Role '${user.role}' is missing - run ubms_database_extension.sql first.`);

        const [result] = await db.query(
            'INSERT INTO users (role_id, full_name, email, password_hash, phone) VALUES (?, ?, ?, ?, ?)',
            [roles[0].role_id, user.full_name, user.email, hash, user.phone || null]
        );
        ids[user.role] = result.insertId;
        console.log(`  + ${user.email} (${user.role})`);
    }

    return ids;
}

async function seedStock(managerId) {
    for (const item of STOCK) {
        const [existing] = await db.query('SELECT ingredient_id FROM ingredients WHERE ingredient_name = ?', [item.name]);
        if (existing.length > 0) {
            console.log(`  = ${item.name} (exists)`);
            continue;
        }

        const [result] = await db.query(
            `INSERT INTO ingredients (ingredient_name, category, unit, reorder_level, quantity_in_stock)
             VALUES (?, ?, ?, ?, ?)`,
            [item.name, item.category, item.unit, item.reorder, item.qty]
        );

        if (item.qty > 0) {
            await db.query(
                `INSERT INTO stock_movements (ingredient_id, user_id, movement_type, quantity, balance_after, reason)
                 VALUES (?, ?, 'STOCK_IN', ?, ?, 'Opening stock')`,
                [result.insertId, managerId, item.qty, item.qty]
            );
        }
        console.log(`  + ${item.name}`);
    }
}

async function seedReadyOrders() {
    const [existing] = await db.query('SELECT COUNT(*) AS n FROM orders WHERE guest_name IN (?)', [DEMO_GUESTS]);
    if (existing[0].n > 0) {
        console.log('  = demo orders (exist)');
        return;
    }

    const [menu] = await db.query('SELECT id, name, price FROM menu_items ORDER BY id LIMIT 5');
    if (menu.length < 3) {
        console.log('  ! skipped orders: run ubuntu_bistro_database.sql to load menu items first');
        return;
    }

    const baskets = [
        [[menu[0], 1], [menu[4] || menu[1], 2]],
        [[menu[1], 2], [menu[2], 1]],
        [[menu[2], 1]]
    ];

    for (let i = 0; i < DEMO_GUESTS.length; i += 1) {
        const lines = baskets[i];
        const totalCents = lines.reduce((sum, [item, qty]) => sum + Math.round(Number(item.price) * 100) * qty, 0);

        const [order] = await db.query(
            `INSERT INTO orders (guest_name, order_type, order_status, total_amount)
             VALUES (?, ?, 'READY', ?)`,
            [DEMO_GUESTS[i], i === 0 ? 'DINE_IN' : 'COLLECTION', totalCents / 100]
        );

        for (const [item, qty] of lines) {
            const price = Number(item.price);
            await db.query(
                `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal)
                 VALUES (?, ?, ?, ?, ?)`,
                [order.insertId, item.id, qty, price, (Math.round(price * 100) * qty) / 100]
            );
        }
        console.log(`  + order UB-${String(order.insertId).padStart(4, '0')} for ${DEMO_GUESTS[i]} (R${(totalCents / 100).toFixed(2)})`);
    }
}

async function main() {
    const password = process.env.DEMO_PASSWORD;
    checkPassword(password);

    console.log('Users:');
    const ids = await seedUsers(password);

    console.log('Stock items:');
    await seedStock(ids.Manager);

    console.log('Ready orders for the cashier:');
    await seedReadyOrders();

    console.log('\nDone. Staff log in at /staff/login with the emails above and DEMO_PASSWORD.');
}

main()
    .catch((error) => {
        console.error('Seeding failed:', error.message);
        process.exitCode = 1;
    })
    .finally(() => db.end());
