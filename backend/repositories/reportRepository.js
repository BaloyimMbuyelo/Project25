// Aggregate queries for the four reports (System Design P10, Figure 33).
// Every report covers [from, to] inclusive using index-friendly ranges.

async function ordersByDay(ex, { from, to, orderType }) {
    const params = [from, to];
    let filter = '';
    if (orderType) {
        filter = 'AND order_type = ?';
        params.push(orderType);
    }

    const [rows] = await ex.query(
        `SELECT
            DATE_FORMAT(created_at, '%Y-%m-%d') AS day,
            COUNT(*) AS orders,
            SUM(order_type = 'DINE_IN') AS dine_in,
            SUM(order_type = 'COLLECTION') AS collection,
            SUM(CASE WHEN order_status <> 'CANCELLED' THEN total_amount ELSE 0 END) AS revenue,
            SUM(order_status = 'CANCELLED') AS cancelled
         FROM orders
         WHERE created_at >= ? AND created_at < DATE_ADD(?, INTERVAL 1 DAY) ${filter}
         GROUP BY day
         ORDER BY day`,
        params
    );
    return rows;
}

async function paymentsByDay(ex, { from, to, methodId }) {
    const params = [from, to];
    let filter = '';
    if (methodId) {
        filter = 'AND p.payment_method_id = ?';
        params.push(methodId);
    }

    const [rows] = await ex.query(
        `SELECT
            DATE_FORMAT(p.paid_at, '%Y-%m-%d') AS day,
            pm.method_name,
            SUM(p.payment_status = 'PAID') AS payments,
            SUM(CASE WHEN p.payment_status = 'PAID' THEN p.amount ELSE 0 END) AS total,
            SUM(p.payment_status = 'VOIDED') AS voided
         FROM payments p
         INNER JOIN payment_methods pm ON pm.payment_method_id = p.payment_method_id
         WHERE p.paid_at >= ? AND p.paid_at < DATE_ADD(?, INTERVAL 1 DAY) ${filter}
         GROUP BY day, pm.payment_method_id, pm.method_name
         ORDER BY day, pm.payment_method_id`,
        params
    );
    return rows;
}

async function reservationsByDay(ex, { from, to }) {
    const [rows] = await ex.query(
        `SELECT
            DATE_FORMAT(reservation_date, '%Y-%m-%d') AS day,
            COUNT(*) AS bookings,
            SUM(CASE WHEN status NOT IN ('CANCELLED', 'NO_SHOW') THEN party_size ELSE 0 END) AS guests,
            SUM(status = 'PENDING') AS pending,
            SUM(status = 'CONFIRMED') AS confirmed,
            SUM(status = 'SEATED') AS seated,
            SUM(status = 'COMPLETED') AS completed,
            SUM(status = 'CANCELLED') AS cancelled,
            SUM(status = 'NO_SHOW') AS no_show
         FROM reservations
         WHERE reservation_date BETWEEN ? AND ?
         GROUP BY day
         ORDER BY day`,
        [from, to]
    );
    return rows;
}

async function stockSummary(ex, { from, to }) {
    const [rows] = await ex.query(
        `SELECT
            i.ingredient_name AS item_name,
            i.category,
            i.unit,
            i.quantity_in_stock AS on_hand,
            i.reorder_level,
            COALESCE(SUM(CASE WHEN m.movement_type IN ('STOCK_IN', 'ADJUSTMENT_IN') THEN m.quantity END), 0) AS received,
            COALESCE(SUM(CASE WHEN m.movement_type = 'STOCK_OUT' THEN m.quantity END), 0) AS used,
            COALESCE(SUM(CASE WHEN m.movement_type = 'WASTAGE' THEN m.quantity END), 0) AS wasted,
            COALESCE(SUM(CASE WHEN m.movement_type = 'ADJUSTMENT_OUT' THEN m.quantity END), 0) AS adjusted_out,
            COUNT(m.movement_id) AS movements
         FROM ingredients i
         LEFT JOIN stock_movements m
                ON m.ingredient_id = i.ingredient_id
               AND m.moved_at >= ? AND m.moved_at < DATE_ADD(?, INTERVAL 1 DAY)
         WHERE i.is_active = 1
         GROUP BY i.ingredient_id, i.ingredient_name, i.category, i.unit, i.quantity_in_stock, i.reorder_level
         ORDER BY i.ingredient_name`,
        [from, to]
    );
    return rows;
}

module.exports = { ordersByDay, paymentsByDay, reservationsByDay, stockSummary };
