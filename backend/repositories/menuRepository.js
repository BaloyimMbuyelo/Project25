// Data access for menu categories and menu items (System Design Table 18,
// Table 24). Only active (not deleted) items are ever listed.

const SELECT_ITEM = `
    SELECT
        m.id AS menu_item_id,
        m.name,
        m.description,
        m.category_id,
        c.name AS category_name,
        c.is_active AS category_active,
        m.price,
        m.image AS image_path,
        m.available AS is_available,
        m.is_active,
        m.created_at,
        m.updated_at
    FROM menu_items m
    INNER JOIN menu_categories c ON c.category_id = m.category_id`;

async function listCategories(ex, { includeInactive = false } = {}) {
    const [rows] = await ex.query(
        `SELECT c.category_id, c.name, c.description, c.sort_order, c.is_active,
                (SELECT COUNT(*) FROM menu_items m WHERE m.category_id = c.category_id AND m.is_active = 1) AS item_count
         FROM menu_categories c
         ${includeInactive ? '' : 'WHERE c.is_active = 1'}
         ORDER BY c.sort_order, c.name`
    );
    return rows;
}

async function findCategory(ex, id, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `SELECT category_id, name, description, sort_order, is_active
         FROM menu_categories WHERE category_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
        [id]
    );
    return rows[0] || null;
}

async function insertCategory(ex, { name, description, sort_order: sortOrder }) {
    const [result] = await ex.query(
        'INSERT INTO menu_categories (name, description, sort_order) VALUES (?, ?, ?)',
        [name, description ?? null, sortOrder ?? 0]
    );
    return result.insertId;
}

async function updateCategory(ex, id, { name, description, sort_order: sortOrder }) {
    await ex.query(
        'UPDATE menu_categories SET name = ?, description = ?, sort_order = ? WHERE category_id = ?',
        [name, description ?? null, sortOrder ?? 0, id]
    );
}

async function setCategoryActive(ex, id, isActive) {
    await ex.query('UPDATE menu_categories SET is_active = ? WHERE category_id = ?', [isActive ? 1 : 0, id]);
}

async function countActiveItemsInCategory(ex, id) {
    const [[row]] = await ex.query(
        'SELECT COUNT(*) AS n FROM menu_items WHERE category_id = ? AND is_active = 1',
        [id]
    );
    return Number(row.n);
}

// Public menu: active items in active categories (available or not - the
// screen greys out unavailable ones, Q3).
async function listItems(ex, { categoryId, search, availableOnly = false }) {
    const where = ['m.is_active = 1', 'c.is_active = 1'];
    const params = [];

    if (categoryId) {
        where.push('m.category_id = ?');
        params.push(categoryId);
    }
    if (search) {
        where.push('(m.name LIKE ? OR m.description LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }
    if (availableOnly) where.push('m.available = 1');

    const [rows] = await ex.query(
        `${SELECT_ITEM} WHERE ${where.join(' AND ')} ORDER BY c.sort_order, c.name, m.name`,
        params
    );
    return rows;
}

async function findItem(ex, id, { forUpdate = false, includeDeleted = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_ITEM} WHERE m.id = ?${includeDeleted ? '' : ' AND m.is_active = 1'}${forUpdate ? ' FOR UPDATE OF m' : ''}`,
        [id]
    );
    return rows[0] || null;
}

async function activeNameTaken(ex, name, exceptId = 0) {
    const [rows] = await ex.query(
        'SELECT 1 FROM menu_items WHERE name = ? AND is_active = 1 AND id <> ? LIMIT 1',
        [name, exceptId]
    );
    return rows.length > 0;
}

async function insertItem(ex, { name, description, category_id: categoryId, price, is_available: available = true }) {
    const [result] = await ex.query(
        `INSERT INTO menu_items (name, description, category_id, price, image, available)
         VALUES (?, ?, ?, ?, NULL, ?)`,
        [name, description ?? null, categoryId, price, available ? 1 : 0]
    );
    return result.insertId;
}

async function updateItem(ex, id, { name, description, category_id: categoryId, price, is_available: available }) {
    await ex.query(
        `UPDATE menu_items
         SET name = ?, description = ?, category_id = ?, price = ?, available = ?
         WHERE id = ?`,
        [name, description ?? null, categoryId, price, available ? 1 : 0, id]
    );
}

async function setAvailable(ex, id, available) {
    await ex.query('UPDATE menu_items SET available = ? WHERE id = ?', [available ? 1 : 0, id]);
}

// Soft delete (P9 DeleteMenuItem): past orders keep their lines.
async function softDelete(ex, id) {
    await ex.query('UPDATE menu_items SET is_active = 0, available = 0 WHERE id = ?', [id]);
}

async function setImage(ex, id, imagePath) {
    await ex.query('UPDATE menu_items SET image = ? WHERE id = ?', [imagePath, id]);
}

module.exports = {
    listCategories,
    findCategory,
    insertCategory,
    updateCategory,
    setCategoryActive,
    countActiveItemsInCategory,
    listItems,
    findItem,
    activeNameTaken,
    insertItem,
    updateItem,
    setAvailable,
    softDelete,
    setImage
};
