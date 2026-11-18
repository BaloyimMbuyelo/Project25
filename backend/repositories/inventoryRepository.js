// Data access for inventory items (ingredients table) and stock movements.
// Column aliases match the System Design names (inventory_item_id,
// item_name, quantity_on_hand).

const SELECT_ITEM = `
    SELECT
        ingredient_id      AS inventory_item_id,
        ingredient_name    AS item_name,
        category,
        unit,
        quantity_in_stock  AS quantity_on_hand,
        reorder_level,
        is_active,
        updated_at
    FROM ingredients`;

async function listItems(ex, { includeInactive = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_ITEM} ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY ingredient_name`
    );
    return rows;
}

// P8 LowStockList: active items at or below their reorder level,
// most urgent first.
async function listLowStock(ex) {
    const [rows] = await ex.query(
        `${SELECT_ITEM}
         WHERE is_active = 1 AND quantity_in_stock <= reorder_level
         ORDER BY quantity_in_stock / NULLIF(reorder_level, 0), ingredient_name`
    );
    return rows;
}

async function findItem(ex, id, { forUpdate = false, activeOnly = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_ITEM} WHERE ingredient_id = ?${activeOnly ? ' AND is_active = 1' : ''}${forUpdate ? ' FOR UPDATE' : ''}`,
        [id]
    );
    return rows[0] || null;
}

async function insertItem(ex, { item_name, category, unit, reorder_level }) {
    const [result] = await ex.query(
        `INSERT INTO ingredients (ingredient_name, category, unit, reorder_level, quantity_in_stock)
         VALUES (?, ?, ?, ?, 0)`,
        [item_name, category ?? null, unit, reorder_level]
    );
    return result.insertId;
}

async function updateItem(ex, id, { item_name, category, unit, reorder_level }) {
    await ex.query(
        `UPDATE ingredients
         SET ingredient_name = ?, category = ?, unit = ?, reorder_level = ?
         WHERE ingredient_id = ?`,
        [item_name, category ?? null, unit, reorder_level, id]
    );
}

async function setActive(ex, id, isActive) {
    await ex.query('UPDATE ingredients SET is_active = ? WHERE ingredient_id = ?', [isActive ? 1 : 0, id]);
}

async function setQuantity(ex, id, quantity) {
    await ex.query('UPDATE ingredients SET quantity_in_stock = ? WHERE ingredient_id = ?', [quantity, id]);
}

async function insertMovement(ex, { itemId, userId, type, quantity, balanceAfter, reason }) {
    const [result] = await ex.query(
        `INSERT INTO stock_movements
            (ingredient_id, user_id, movement_type, quantity, balance_after, reason)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [itemId, userId, type, quantity, balanceAfter, reason ?? null]
    );
    return result.insertId;
}

async function listMovements(ex, itemId, limit = 50) {
    const [rows] = await ex.query(
        `SELECT
            m.movement_id,
            m.movement_type,
            m.quantity,
            m.balance_after,
            m.reason,
            m.moved_at,
            u.full_name AS recorded_by
         FROM stock_movements m
         INNER JOIN users u ON u.user_id = m.user_id
         WHERE m.ingredient_id = ?
         ORDER BY m.moved_at DESC, m.movement_id DESC
         LIMIT ?`,
        [itemId, limit]
    );
    return rows;
}

module.exports = {
    listItems,
    listLowStock,
    findItem,
    insertItem,
    updateItem,
    setActive,
    setQuantity,
    insertMovement,
    listMovements
};
