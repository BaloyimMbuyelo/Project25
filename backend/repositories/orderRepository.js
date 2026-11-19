// Data access for orders and order items (System Design Tables 19 and 20).

const SELECT_ORDER = `
    SELECT
        o.order_id,
        o.customer_id,
        o.guest_name,
        o.guest_phone,
        o.staff_id,
        o.table_id,
        t.table_number,
        o.order_type,
        o.sales_channel,
        o.order_status,
        o.special_instructions,
        o.cancel_reason,
        o.total_amount,
        o.created_at,
        o.updated_at,
        o.status_updated_at,
        COALESCE(cu.full_name, o.guest_name, 'Walk-in guest') AS customer_name,
        COALESCE(cu.phone, o.guest_phone) AS customer_phone,
        cu.email AS customer_email,
        st.full_name AS staff_name,
        (SELECT COALESCE(SUM(oi.quantity), 0) FROM order_items oi WHERE oi.order_id = o.order_id) AS item_count
    FROM orders o
    LEFT JOIN users cu ON cu.user_id = o.customer_id
    LEFT JOIN users st ON st.user_id = o.staff_id
    LEFT JOIN restaurant_tables t ON t.table_id = o.table_id`;

async function findById(ex, orderId, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_ORDER} WHERE o.order_id = ?${forUpdate ? ' FOR UPDATE OF o' : ''}`,
        [orderId]
    );
    return rows[0] || null;
}

async function lines(ex, orderId) {
    const [rows] = await ex.query(
        `SELECT oi.order_item_id, oi.menu_item_id, m.name, oi.quantity, oi.unit_price, oi.subtotal, oi.notes
         FROM order_items oi
         INNER JOIN menu_items m ON m.id = oi.menu_item_id
         WHERE oi.order_id = ?
         ORDER BY oi.order_item_id`,
        [orderId]
    );
    return rows;
}

function buildFilters({ statuses, date, search, customerId, orderType }) {
    const where = [];
    const params = [];

    if (statuses && statuses.length) {
        where.push('o.order_status IN (?)');
        params.push(statuses);
    }
    if (date) {
        where.push('o.created_at >= ? AND o.created_at < DATE_ADD(?, INTERVAL 1 DAY)');
        params.push(date, date);
    }
    if (customerId) {
        where.push('o.customer_id = ?');
        params.push(customerId);
    }
    if (orderType) {
        where.push('o.order_type = ?');
        params.push(orderType);
    }
    if (search) {
        // Order number (UB-0105 / 105) or customer name
        const digits = /^(?:UB-?)?0*(\d+)$/i.exec(search.trim());
        if (digits) {
            where.push('(o.order_id = ? OR COALESCE(cu.full_name, o.guest_name) LIKE ?)');
            params.push(Number(digits[1]), `%${search}%`);
        } else {
            where.push('COALESCE(cu.full_name, o.guest_name) LIKE ?');
            params.push(`%${search}%`);
        }
    }

    return { where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

async function list(ex, filters, { limit, offset, oldestFirst = false }) {
    const { where, params } = buildFilters(filters);

    const [[{ total }]] = await ex.query(
        `SELECT COUNT(*) AS total
         FROM orders o LEFT JOIN users cu ON cu.user_id = o.customer_id
         ${where}`,
        params
    );

    const [rows] = await ex.query(
        `${SELECT_ORDER} ${where}
         ORDER BY o.created_at ${oldestFirst ? 'ASC' : 'DESC'}, o.order_id ${oldestFirst ? 'ASC' : 'DESC'}
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return { total: Number(total), rows };
}

// Counts by status for one day (staff dashboard tiles, Figure 29)
async function statusCounts(ex, date) {
    const [rows] = await ex.query(
        `SELECT order_status, COUNT(*) AS n
         FROM orders
         WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY)
         GROUP BY order_status`,
        [date, date]
    );
    return Object.fromEntries(rows.map((r) => [r.order_status, Number(r.n)]));
}

async function lockMenuItems(ex, ids) {
    const [rows] = await ex.query(
        'SELECT id, name, price, available, is_active FROM menu_items WHERE id IN (?) FOR UPDATE',
        [ids]
    );
    return rows;
}

async function findCustomerUser(ex, userId) {
    const [rows] = await ex.query(
        `SELECT u.user_id FROM users u INNER JOIN roles r ON r.role_id = u.role_id
         WHERE u.user_id = ? AND r.role_name = 'Customer' AND u.status = 'ACTIVE'`,
        [userId]
    );
    return rows[0] || null;
}

async function insertOrder(ex, data) {
    const [result] = await ex.query(
        `INSERT INTO orders
            (customer_id, guest_name, guest_phone, staff_id, table_id, order_type,
             sales_channel, order_status, special_instructions, total_amount, status_updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'PENDING', ?, ?, NOW())`,
        [
            data.customer_id ?? null,
            data.guest_name ?? null,
            data.guest_phone ?? null,
            data.staff_id ?? null,
            data.table_id ?? null,
            data.order_type,
            data.sales_channel,
            data.special_instructions ?? null,
            data.total_amount
        ]
    );
    return result.insertId;
}

async function insertLine(ex, orderId, line) {
    await ex.query(
        `INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price, subtotal, notes)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [orderId, line.menu_item_id, line.quantity, line.unit_price, line.subtotal, line.notes ?? null]
    );
}

async function setStatus(ex, orderId, status, { cancelReason } = {}) {
    if (cancelReason !== undefined) {
        await ex.query(
            'UPDATE orders SET order_status = ?, cancel_reason = ?, status_updated_at = NOW() WHERE order_id = ?',
            [status, cancelReason, orderId]
        );
        return;
    }
    await ex.query(
        'UPDATE orders SET order_status = ?, status_updated_at = NOW() WHERE order_id = ?',
        [status, orderId]
    );
}

module.exports = {
    findById,
    lines,
    list,
    statusCounts,
    lockMenuItems,
    findCustomerUser,
    insertOrder,
    insertLine,
    setStatus
};
