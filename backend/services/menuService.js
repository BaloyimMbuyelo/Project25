// MenuService - module 2.0 Menu Management (FR-05 to FR-07).
// Implements System Design P9 (save and delete menu item): names unique among
// active items, prices audited when they change, soft delete, plus menu
// categories and image upload (4.4.5).

const { db } = require('../config/db');
const repo = require('../repositories/menuRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { toCents, fromCents } = require('../utils/format');
const { processMenuImage, saveMenuImage, removeMenuImage } = require('../utils/images');

// ---------- Presentation ----------

function presentItem(item) {
    return {
        menu_item_id: item.menu_item_id,
        name: item.name,
        description: item.description,
        category_id: item.category_id,
        category_name: item.category_name,
        price: Number(item.price),
        image_path: item.image_path || null,
        is_available: Boolean(item.is_available),
        updated_at: item.updated_at
    };
}

function presentCategory(c) {
    return {
        category_id: c.category_id,
        name: c.name,
        description: c.description,
        sort_order: Number(c.sort_order),
        is_active: Boolean(c.is_active),
        item_count: c.item_count === undefined ? undefined : Number(c.item_count)
    };
}

// Field-by-field changes for the audit trail (old -> new)
function diffItem(before, after) {
    const changes = {};
    if (before.name !== after.name) changes.name = { from: before.name, to: after.name };
    if ((before.description || null) !== (after.description || null)) {
        changes.description = { from: before.description || null, to: after.description || null };
    }
    if (before.category_id !== after.category_id) {
        changes.category_id = { from: before.category_id, to: after.category_id };
    }
    if (Boolean(before.is_available) !== Boolean(after.is_available)) {
        changes.is_available = { from: Boolean(before.is_available), to: Boolean(after.is_available) };
    }
    return changes;
}

const isDuplicate = (error) => error && error.code === 'ER_DUP_ENTRY';
const duplicateName = (name) => conflict(`A menu item called '${name}' already exists.`);

async function requireActiveCategory(conn, categoryId) {
    const category = await repo.findCategory(conn, categoryId);
    if (!category || !category.is_active) {
        throw badRequest('Choose an active category.', [{ field: 'category_id', message: 'Choose an active category.' }]);
    }
    return category;
}

// ---------- Categories ----------

async function listCategories({ includeInactive = false } = {}) {
    return (await repo.listCategories(db, { includeInactive })).map(presentCategory);
}

async function createCategory(user, input) {
    try {
        const id = await withTransaction(async (conn) => {
            const newId = await repo.insertCategory(conn, input);
            await logAudit(conn, {
                userId: user.user_id, action: 'MENU_CATEGORY_CREATED', entity: 'menu_categories', recordId: newId,
                details: { name: input.name }
            });
            return newId;
        });
        return presentCategory(await repo.findCategory(db, id));
    } catch (error) {
        if (isDuplicate(error)) throw conflict(`A category called '${input.name}' already exists.`);
        throw error;
    }
}

async function updateCategory(user, id, input) {
    try {
        await withTransaction(async (conn) => {
            const current = await repo.findCategory(conn, id, { forUpdate: true });
            if (!current) throw notFound('Category not found.');

            await repo.updateCategory(conn, id, input);
            await logAudit(conn, {
                userId: user.user_id, action: 'MENU_CATEGORY_UPDATED', entity: 'menu_categories', recordId: id,
                details: { from: { name: current.name, sort_order: current.sort_order }, to: { name: input.name, sort_order: input.sort_order } }
            });
        });
    } catch (error) {
        if (isDuplicate(error)) throw conflict(`A category called '${input.name}' already exists.`);
        throw error;
    }
    return presentCategory(await repo.findCategory(db, id));
}

async function setCategoryActive(user, id, isActive) {
    await withTransaction(async (conn) => {
        const current = await repo.findCategory(conn, id, { forUpdate: true });
        if (!current) throw notFound('Category not found.');

        if (!isActive) {
            const count = await repo.countActiveItemsInCategory(conn, id);
            if (count > 0) {
                throw conflict(`Move or delete the ${count} menu item${count === 1 ? '' : 's'} in '${current.name}' first.`);
            }
        }

        await repo.setCategoryActive(conn, id, isActive);
        await logAudit(conn, {
            userId: user.user_id,
            action: isActive ? 'MENU_CATEGORY_REACTIVATED' : 'MENU_CATEGORY_DEACTIVATED',
            entity: 'menu_categories',
            recordId: id,
            details: { name: current.name }
        });
    });
    return presentCategory(await repo.findCategory(db, id));
}

// ---------- Items ----------

async function listItems({ category_id: categoryId, search, available_only: availableOnly } = {}) {
    return (await repo.listItems(db, { categoryId, search, availableOnly })).map(presentItem);
}

async function getItem(id) {
    const item = await repo.findItem(db, id);
    if (!item || !item.category_active) throw notFound('Menu item not found.');
    return presentItem(item);
}

// P9 SaveMenuItem - create
async function createItem(user, input) {
    try {
        const id = await withTransaction(async (conn) => {
            await requireActiveCategory(conn, input.category_id);
            if (await repo.activeNameTaken(conn, input.name)) throw duplicateName(input.name);

            const newId = await repo.insertItem(conn, input);
            await logAudit(conn, {
                userId: user.user_id, action: 'MENU_ITEM_CREATED', entity: 'menu_items', recordId: newId,
                details: {
                    name: input.name,
                    category_id: input.category_id,
                    price: input.price,
                    is_available: input.is_available !== false
                }
            });
            return newId;
        });
        return getItem(id);
    } catch (error) {
        if (isDuplicate(error)) throw duplicateName(input.name);
        throw error;
    }
}

// P9 SaveMenuItem - update. A price change gets its own PRICE_CHANGED entry.
async function updateItem(user, id, input) {
    try {
        await withTransaction(async (conn) => {
            const current = await repo.findItem(conn, id, { forUpdate: true });
            if (!current) throw notFound('Menu item not found.');

            if (input.category_id !== current.category_id) await requireActiveCategory(conn, input.category_id);
            if (await repo.activeNameTaken(conn, input.name, id)) throw duplicateName(input.name);

            const next = {
                ...input,
                is_available: input.is_available === undefined ? Boolean(current.is_available) : input.is_available
            };

            await repo.updateItem(conn, id, next);

            const changes = diffItem(current, next);
            if (Object.keys(changes).length > 0) {
                await logAudit(conn, {
                    userId: user.user_id, action: 'MENU_ITEM_UPDATED', entity: 'menu_items', recordId: id,
                    details: { name: next.name, changes }
                });
            }

            if (toCents(current.price) !== toCents(next.price)) {
                await logAudit(conn, {
                    userId: user.user_id, action: 'PRICE_CHANGED', entity: 'menu_items', recordId: id,
                    details: {
                        name: next.name,
                        from: fromCents(toCents(current.price)),
                        to: fromCents(toCents(next.price))
                    }
                });
            }
        });
    } catch (error) {
        if (isDuplicate(error)) throw duplicateName(input.name);
        throw error;
    }
    return getItem(id);
}

// Availability toggle (FR-06) - takes effect on the customer menu at once
async function setAvailability(user, id, isAvailable) {
    await withTransaction(async (conn) => {
        const current = await repo.findItem(conn, id, { forUpdate: true });
        if (!current) throw notFound('Menu item not found.');

        await repo.setAvailable(conn, id, isAvailable);
        await logAudit(conn, {
            userId: user.user_id, action: 'MENU_ITEM_AVAILABILITY', entity: 'menu_items', recordId: id,
            details: { name: current.name, from: Boolean(current.is_available), to: isAvailable }
        });
    });
    return getItem(id);
}

// P9 DeleteMenuItem - soft delete keeps order history
async function deleteItem(user, id) {
    await withTransaction(async (conn) => {
        const current = await repo.findItem(conn, id, { forUpdate: true });
        if (!current) throw notFound('Menu item not found.');

        await repo.softDelete(conn, id);
        await logAudit(conn, {
            userId: user.user_id, action: 'MENU_ITEM_DELETED', entity: 'menu_items', recordId: id,
            details: { name: current.name, price: Number(current.price) }
        });
    });
}

// Image upload: check, resize and save the file, then point the item at it.
async function uploadImage(user, id, fileBuffer) {
    const existing = await repo.findItem(db, id);
    if (!existing) throw notFound('Menu item not found.');

    const webp = await processMenuImage(fileBuffer);
    const newPath = await saveMenuImage(id, webp);
    let oldPath = null;

    try {
        await withTransaction(async (conn) => {
            const current = await repo.findItem(conn, id, { forUpdate: true });
            if (!current) throw notFound('Menu item not found.');
            oldPath = current.image_path;

            await repo.setImage(conn, id, newPath);
            await logAudit(conn, {
                userId: user.user_id, action: 'MENU_IMAGE_UPLOADED', entity: 'menu_items', recordId: id,
                details: { name: current.name, image_path: newPath, bytes: webp.length }
            });
        });
    } catch (error) {
        await removeMenuImage(newPath);
        throw error;
    }

    await removeMenuImage(oldPath);
    return getItem(id);
}

async function removeImage(user, id) {
    let oldPath = null;

    await withTransaction(async (conn) => {
        const current = await repo.findItem(conn, id, { forUpdate: true });
        if (!current) throw notFound('Menu item not found.');
        oldPath = current.image_path;

        await repo.setImage(conn, id, null);
        await logAudit(conn, {
            userId: user.user_id, action: 'MENU_IMAGE_REMOVED', entity: 'menu_items', recordId: id,
            details: { name: current.name }
        });
    });

    await removeMenuImage(oldPath);
    return getItem(id);
}

module.exports = {
    presentItem,
    diffItem,
    listCategories,
    createCategory,
    updateCategory,
    setCategoryActive,
    listItems,
    getItem,
    createItem,
    updateItem,
    setAvailability,
    deleteItem,
    uploadImage,
    removeImage
};
