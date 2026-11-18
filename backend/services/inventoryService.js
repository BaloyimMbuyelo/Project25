// InventoryService - business rules for module 5.0 (FR-15 to FR-17).
// Implements System Design P8 (record stock movement, low-stock check) and
// BR-07 (complete movements, no negative stock).

const { db } = require('../config/db');
const repo = require('../repositories/inventoryRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { toCents, fromCents } = require('../utils/format');

// Direction of each movement type (stock_movement.movement_type).
const MOVEMENT_DIRECTION = {
    STOCK_IN: 1,
    ADJUSTMENT_IN: 1,
    STOCK_OUT: -1,
    WASTAGE: -1,
    ADJUSTMENT_OUT: -1
};

const MOVEMENT_LABELS = {
    STOCK_IN: 'Stock in',
    STOCK_OUT: 'Stock out',
    WASTAGE: 'Wastage',
    ADJUSTMENT_IN: 'Adjustment +',
    ADJUSTMENT_OUT: 'Adjustment −'
};

const REASON_REQUIRED = ['WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'];

// ---------- Pure rules (unit tested) ----------

// OUT when nothing is left, LOW when on hand <= reorder level (FR-17).
function stockStatus(quantityOnHand, reorderLevel) {
    const onHand = toCents(quantityOnHand);
    if (onHand <= 0) return 'OUT';
    if (onHand <= toCents(reorderLevel)) return 'LOW';
    return 'OK';
}

// Returns the new balance in cents, or null if it would go negative.
function applyMovement(balanceCents, type, quantityCents) {
    const next = balanceCents + MOVEMENT_DIRECTION[type] * quantityCents;
    return next < 0 ? null : next;
}

// mysql2 returns DECIMAL columns as strings; expose numbers to the client.
function present(item) {
    const quantity = Number(item.quantity_on_hand);
    const reorder = Number(item.reorder_level);
    return {
        ...item,
        quantity_on_hand: quantity,
        reorder_level: reorder,
        is_active: Boolean(item.is_active),
        stock_status: stockStatus(quantity, reorder)
    };
}

function presentMovement(m) {
    return {
        ...m,
        quantity: Number(m.quantity),
        balance_after: Number(m.balance_after),
        movement_label: MOVEMENT_LABELS[m.movement_type]
    };
}

const isDuplicate = (error) => error && error.code === 'ER_DUP_ENTRY';

// ---------- Use cases ----------

async function listItems({ search, category, low, include_inactive: includeInactive } = {}) {
    const all = (await repo.listItems(db, { includeInactive })).map(present);
    const active = all.filter((item) => item.is_active);

    const needle = (search || '').toLowerCase();
    const items = all.filter((item) =>
        (!needle || item.item_name.toLowerCase().includes(needle)) &&
        (!category || item.category === category) &&
        (!low || (item.is_active && item.stock_status !== 'OK'))
    );

    const categories = [...new Set(active.map((i) => i.category).filter(Boolean))].sort();

    return {
        items,
        categories,
        summary: {
            total: active.length,
            ok: active.filter((i) => i.stock_status === 'OK').length,
            low: active.filter((i) => i.stock_status === 'LOW').length,
            out: active.filter((i) => i.stock_status === 'OUT').length
        }
    };
}

async function listLowStock() {
    const items = (await repo.listLowStock(db)).map(present);
    return { items, count: items.length };
}

async function getItem(id) {
    const item = await repo.findItem(db, id);
    if (!item) throw notFound('Stock item not found.');
    return present(item);
}

async function createItem(user, input) {
    try {
        const id = await withTransaction(async (conn) => {
            const itemId = await repo.insertItem(conn, input);
            const opening = toCents(input.opening_quantity || 0);

            // Stock only changes through movements, so opening stock is
            // recorded as a Stock in movement.
            if (opening > 0) {
                await repo.insertMovement(conn, {
                    itemId,
                    userId: user.user_id,
                    type: 'STOCK_IN',
                    quantity: fromCents(opening),
                    balanceAfter: fromCents(opening),
                    reason: 'Opening stock'
                });
                await repo.setQuantity(conn, itemId, fromCents(opening));
            }

            await logAudit(conn, {
                userId: user.user_id,
                action: 'STOCK_ITEM_CREATED',
                entity: 'ingredients',
                recordId: itemId,
                details: {
                    item_name: input.item_name,
                    unit: input.unit,
                    reorder_level: input.reorder_level,
                    opening_quantity: fromCents(opening)
                }
            });

            return itemId;
        });

        return getItem(id);
    } catch (error) {
        if (isDuplicate(error)) throw conflict(`A stock item called '${input.item_name}' already exists.`);
        throw error;
    }
}

async function updateItem(user, id, input) {
    try {
        await withTransaction(async (conn) => {
            const current = await repo.findItem(conn, id, { forUpdate: true });
            if (!current) throw notFound('Stock item not found.');

            await repo.updateItem(conn, id, input);

            await logAudit(conn, {
                userId: user.user_id,
                action: 'STOCK_ITEM_UPDATED',
                entity: 'ingredients',
                recordId: id,
                details: {
                    from: {
                        item_name: current.item_name,
                        category: current.category,
                        unit: current.unit,
                        reorder_level: Number(current.reorder_level)
                    },
                    to: input
                }
            });
        });
    } catch (error) {
        if (isDuplicate(error)) throw conflict(`A stock item called '${input.item_name}' already exists.`);
        throw error;
    }

    return getItem(id);
}

// Deactivate instead of delete so movement history stays valid (4.5.1).
async function setActive(user, id, isActive) {
    await withTransaction(async (conn) => {
        const current = await repo.findItem(conn, id, { forUpdate: true });
        if (!current) throw notFound('Stock item not found.');

        await repo.setActive(conn, id, isActive);

        await logAudit(conn, {
            userId: user.user_id,
            action: isActive ? 'STOCK_ITEM_REACTIVATED' : 'STOCK_ITEM_DEACTIVATED',
            entity: 'ingredients',
            recordId: id,
            details: { item_name: current.item_name }
        });
    });

    return getItem(id);
}

// P8 - Record stock movement (UC-06, FR-16, FR-17).
async function recordMovement(user, id, { movement_type: type, quantity, reason }) {
    if (REASON_REQUIRED.includes(type) && !reason) {
        throw badRequest('A reason is required for this movement.', [
            { field: 'reason', message: 'A reason is required for this movement.' }
        ]);
    }

    const result = await withTransaction(async (conn) => {
        const item = await repo.findItem(conn, id, { forUpdate: true, activeOnly: true });
        if (!item) throw notFound('Stock item not found.');

        const balance = toCents(item.quantity_on_hand);
        const next = applyMovement(balance, type, toCents(quantity));

        if (next === null) {
            throw conflict(`Not enough stock: only ${fromCents(balance).toFixed(2)} ${item.unit} on hand.`);
        }

        const movementId = await repo.insertMovement(conn, {
            itemId: id,
            userId: user.user_id,
            type,
            quantity,
            balanceAfter: fromCents(next),
            reason
        });

        await repo.setQuantity(conn, id, fromCents(next));

        await logAudit(conn, {
            userId: user.user_id,
            action: 'STOCK_MOVEMENT',
            entity: 'ingredients',
            recordId: id,
            details: {
                movement_id: movementId,
                type,
                quantity,
                balance_before: fromCents(balance),
                balance_after: fromCents(next),
                reason: reason || null
            }
        });

        return { movementId, item, next };
    });

    const status = stockStatus(fromCents(result.next), result.item.reorder_level);

    return {
        movement_id: result.movementId,
        inventory_item_id: id,
        movement_type: type,
        movement_label: MOVEMENT_LABELS[type],
        quantity,
        new_quantity: fromCents(result.next),
        stock_status: status,
        low_stock: status !== 'OK'
    };
}

async function listMovements(id) {
    await getItem(id);
    return (await repo.listMovements(db, id)).map(presentMovement);
}

module.exports = {
    MOVEMENT_DIRECTION,
    MOVEMENT_LABELS,
    REASON_REQUIRED,
    stockStatus,
    applyMovement,
    listItems,
    listLowStock,
    getItem,
    createItem,
    updateItem,
    setActive,
    recordMovement,
    listMovements
};
