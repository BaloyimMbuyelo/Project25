// Data access for payments, payment methods and the order data a cashier
// needs. Orders are read here (and moved Ready -> Completed on payment) but
// are otherwise owned by the Orders module.

const SELECT_ORDER = `
    SELECT
        o.order_id,
        o.order_type,
        o.order_status,
        o.total_amount,
        o.created_at,
        o.customer_id,
        COALESCE(u.full_name, o.guest_name, 'Walk-in guest') AS customer_name,
        t.table_number
    FROM orders o
    LEFT JOIN users u ON u.user_id = o.customer_id
    LEFT JOIN restaurant_tables t ON t.table_id = o.table_id`;

async function findOrder(ex, orderId, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_ORDER} WHERE o.order_id = ?${forUpdate ? ' FOR UPDATE OF o' : ''}`,
        [orderId]
    );
    return rows[0] || null;
}

async function orderLines(ex, orderId) {
    const [rows] = await ex.query(
        `SELECT oi.order_item_id, m.name, oi.quantity, oi.unit_price, oi.subtotal
         FROM order_items oi
         INNER JOIN menu_items m ON m.id = oi.menu_item_id
         WHERE oi.order_id = ?
         ORDER BY oi.order_item_id`,
        [orderId]
    );
    return rows;
}

async function findActivePayment(ex, orderId) {
    const [rows] = await ex.query(
        `SELECT payment_id, receipt_number, amount, paid_at
         FROM payments WHERE order_id = ? AND payment_status = 'PAID'
         LIMIT 1`,
        [orderId]
    );
    return rows[0] || null;
}

// Orders waiting at the counter: Ready (or Completed after a void) with no
// active Paid payment (BR-05).
async function listPayableOrders(ex) {
    const [rows] = await ex.query(
        `${SELECT_ORDER}
         WHERE o.order_status IN ('READY', 'COMPLETED')
           AND NOT EXISTS (
               SELECT 1 FROM payments p
               WHERE p.order_id = o.order_id AND p.payment_status = 'PAID'
           )
         ORDER BY o.created_at
         LIMIT 100`
    );
    return rows;
}

async function setOrderStatus(ex, orderId, status) {
    await ex.query('UPDATE orders SET order_status = ? WHERE order_id = ?', [status, orderId]);
}

async function listMethods(ex) {
    const [rows] = await ex.query(
        `SELECT payment_method_id, method_name, requires_reference
         FROM payment_methods WHERE is_active = 1 ORDER BY payment_method_id`
    );
    return rows;
}

async function findMethod(ex, id) {
    const [rows] = await ex.query(
        `SELECT payment_method_id, method_name, requires_reference
         FROM payment_methods WHERE payment_method_id = ? AND is_active = 1`,
        [id]
    );
    return rows[0] || null;
}

async function insertPayment(ex, data) {
    const tempReceipt = `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 12);

    const [result] = await ex.query(
        `INSERT INTO payments
            (order_id, payment_method_id, recorded_by, amount, amount_tendered,
             payment_status, reference_number, receipt_number)
         VALUES (?, ?, ?, ?, ?, 'PAID', ?, ?)`,
        [
            data.order_id,
            data.payment_method_id,
            data.recorded_by,
            data.amount,
            data.amount_tendered ?? null,
            data.reference_number ?? null,
            tempReceipt
        ]
    );
    return result.insertId;
}

async function setReceiptNumber(ex, paymentId, receiptNumber) {
    await ex.query('UPDATE payments SET receipt_number = ? WHERE payment_id = ?', [receiptNumber, paymentId]);
}

const SELECT_PAYMENT = `
    SELECT
        p.payment_id,
        p.order_id,
        p.receipt_number,
        p.amount,
        p.amount_tendered,
        p.paid_at,
        p.payment_status,
        p.reference_number,
        p.void_reason,
        p.voided_at,
        pm.payment_method_id,
        pm.method_name,
        rec.full_name AS recorded_by_name,
        vo.full_name AS voided_by_name,
        COALESCE(cu.full_name, o.guest_name, 'Walk-in guest') AS customer_name,
        o.order_type
    FROM payments p
    INNER JOIN payment_methods pm ON pm.payment_method_id = p.payment_method_id
    INNER JOIN users rec ON rec.user_id = p.recorded_by
    LEFT JOIN users vo ON vo.user_id = p.voided_by
    INNER JOIN orders o ON o.order_id = p.order_id
    LEFT JOIN users cu ON cu.user_id = o.customer_id`;

async function findPayment(ex, paymentId, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_PAYMENT} WHERE p.payment_id = ?${forUpdate ? ' FOR UPDATE OF p' : ''}`,
        [paymentId]
    );
    return rows[0] || null;
}

async function listPayments(ex, { date, status }) {
    const where = ['p.paid_at >= ?', 'p.paid_at < DATE_ADD(?, INTERVAL 1 DAY)'];
    const params = [date, date];

    if (status) {
        where.push('p.payment_status = ?');
        params.push(status);
    }

    const [rows] = await ex.query(
        `${SELECT_PAYMENT} WHERE ${where.join(' AND ')} ORDER BY p.paid_at DESC, p.payment_id DESC`,
        params
    );
    return rows;
}

async function voidPayment(ex, paymentId, { userId, reason }) {
    await ex.query(
        `UPDATE payments
         SET payment_status = 'VOIDED', void_reason = ?, voided_by = ?, voided_at = NOW()
         WHERE payment_id = ?`,
        [reason, userId, paymentId]
    );
}

module.exports = {
    findOrder,
    orderLines,
    findActivePayment,
    listPayableOrders,
    setOrderStatus,
    listMethods,
    findMethod,
    insertPayment,
    setReceiptNumber,
    findPayment,
    listPayments,
    voidPayment
};
