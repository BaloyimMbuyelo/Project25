// OrderService - module 3.0 Order Management (FR-08 to FR-11, FR-22).
// Implements System Design P4 (place order in one transaction), P5 (status
// workflow and cancellation) and the order state model (Figure 7, Q1).

const { db } = require('../config/db');
const settings = require('../config/settings');
const repo = require('../repositories/orderRepository');
const { findTable } = require('../repositories/reservationRepository');
const { findActivePayment } = require('../repositories/paymentRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { ROLES } = require('../utils/roles');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');
const { toCents, fromCents, orderRef, parseOrderRef, localDate } = require('../utils/format');

const STATUS_LABELS = {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    PREPARING: 'Preparing',
    READY: 'Ready',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled'
};

// P5 constants
const NEXT_STATUS = {
    PENDING: 'CONFIRMED',
    CONFIRMED: 'PREPARING',
    PREPARING: 'READY',
    READY: 'COMPLETED'
};

const ALLOWED = {
    CONFIRMED: [ROLES.WAITER, ROLES.MANAGER],
    PREPARING: [ROLES.KITCHEN, ROLES.MANAGER],
    READY: [ROLES.KITCHEN, ROLES.MANAGER],
    COMPLETED: [ROLES.WAITER, ROLES.CASHIER, ROLES.MANAGER]
};

const CLOSED = ['COMPLETED', 'CANCELLED'];

// Kitchen staff see the active queue only (Table 30: "View orders - Active")
const KITCHEN_STATUSES = ['CONFIRMED', 'PREPARING', 'READY'];

// ---------- Pure rules (unit tested) ----------

function assertStatusChange(role, from, to) {
    if (CLOSED.includes(from)) {
        throw conflict('This order is closed and cannot be changed.');
    }
    if (NEXT_STATUS[from] !== to) {
        throw conflict(`Orders must follow the sequence Pending → Confirmed → Preparing → Ready → Completed. The next step for this order is ${STATUS_LABELS[NEXT_STATUS[from]]}.`);
    }
    if (!(ALLOWED[to] || []).includes(role)) {
        throw forbidden(`Your role cannot move an order to ${STATUS_LABELS[to]}.`);
    }
}

// P5 CancelOrder permission rules
function assertCanCancel(user, order) {
    if (user.role === ROLES.CUSTOMER) {
        if (order.customer_id !== user.user_id || order.order_status !== 'PENDING') {
            throw forbidden('You can only cancel your own order while it is Pending.');
        }
    } else if (order.order_status !== 'PENDING' && user.role !== ROLES.MANAGER) {
        throw forbidden('Only a manager can cancel an order after it has been confirmed.');
    }

    if (['READY', 'COMPLETED', 'CANCELLED'].includes(order.order_status)) {
        throw conflict(`A ${STATUS_LABELS[order.order_status]} order can no longer be cancelled.`);
    }
}

// Server-side prices and totals (BR-01, BR-02). menuItems come from the
// database inside the transaction; the browser never supplies prices.
function priceLines(requestLines, menuItems) {
    const byId = new Map(menuItems.map((item) => [item.id, item]));
    let totalCents = 0;

    const priced = requestLines.map((line) => {
        const item = byId.get(line.menu_item_id);

        if (!item || !item.available || item.is_active === 0) {
            throw conflict(`${item ? item.name : 'An item in your order'} is no longer available.`, {
                menu_item_id: line.menu_item_id
            });
        }

        const unitCents = toCents(item.price);
        const lineCents = unitCents * line.quantity;
        totalCents += lineCents;

        return {
            menu_item_id: item.id,
            name: item.name,
            quantity: line.quantity,
            unit_price: fromCents(unitCents),
            subtotal: fromCents(lineCents),
            notes: line.notes || null
        };
    });

    return { lines: priced, totalCents };
}

// ---------- Presentation ----------

function presentOrder(order) {
    return {
        order_id: order.order_id,
        order_ref: orderRef(order.order_id),
        order_type: order.order_type,
        sales_channel: order.sales_channel,
        order_status: order.order_status,
        status_label: STATUS_LABELS[order.order_status],
        next_status: NEXT_STATUS[order.order_status] || null,
        customer_id: order.customer_id,
        customer_name: order.customer_name,
        customer_phone: order.customer_phone,
        table_id: order.table_id,
        table_number: order.table_number,
        staff_name: order.staff_name,
        special_instructions: order.special_instructions,
        cancel_reason: order.cancel_reason,
        item_count: Number(order.item_count),
        total: Number(order.total_amount),
        time_placed: order.created_at,
        status_updated_at: order.status_updated_at || order.updated_at
    };
}

const presentLine = (line) => ({
    order_item_id: line.order_item_id,
    menu_item_id: line.menu_item_id,
    name: line.name,
    quantity: Number(line.quantity),
    unit_price: Number(line.unit_price),
    line_total: Number(line.subtotal),
    notes: line.notes
});

function requireOrderId(ref) {
    const id = parseOrderRef(ref);
    if (!id) throw notFound('Order not found.');
    return id;
}

async function loadDetail(ex, orderId) {
    const order = await repo.findById(ex, orderId);
    if (!order) return null;

    const [orderLines, payment] = await Promise.all([
        repo.lines(ex, orderId),
        findActivePayment(ex, orderId)
    ]);

    return {
        ...presentOrder(order),
        lines: orderLines.map(presentLine),
        payment: payment ? { payment_id: payment.payment_id, receipt_number: payment.receipt_number } : null
    };
}

// ---------- Use cases ----------

// P4 - PlaceOrder(user, request) (UC-02, FR-08, FR-09)
async function placeOrder(user, input) {
    const isCustomer = user.role === ROLES.CUSTOMER;

    const data = {
        order_type: input.order_type,
        sales_channel: isCustomer ? 'ONLINE' : 'IN_HOUSE',
        special_instructions: input.special_instructions || null,
        table_id: input.order_type === 'DINE_IN' ? input.table_id ?? null : null,
        customer_id: null,
        guest_name: null,
        guest_phone: null,
        staff_id: null
    };

    if (data.order_type === 'DINE_IN' && !data.table_id) {
        throw badRequest('Select a table for dine-in orders.', [
            { field: 'table_id', message: 'Select a table for dine-in orders.' }
        ]);
    }

    if (isCustomer) {
        data.customer_id = user.user_id;
    } else {
        data.staff_id = user.user_id;

        if (input.customer_id) {
            const customer = await repo.findCustomerUser(db, input.customer_id);
            if (!customer) {
                throw badRequest('Select a registered customer.', [{ field: 'customer_id', message: 'Select a registered customer.' }]);
            }
            data.customer_id = customer.user_id;
        } else if (input.guest_name) {
            data.guest_name = input.guest_name;
            data.guest_phone = input.guest_phone || null;
        } else if (data.order_type === 'COLLECTION') {
            throw badRequest('Enter the customer name for collection orders.', [
                { field: 'guest_name', message: 'Enter the customer name for collection orders.' }
            ]);
        }
    }

    const orderId = await withTransaction(async (conn) => {
        if (data.table_id) {
            const table = await findTable(conn, data.table_id);
            if (!table) {
                throw badRequest('Select a valid table.', [{ field: 'table_id', message: 'Select a valid table.' }]);
            }
            if (table.status === 'OUT_OF_SERVICE') throw conflict(`Table ${table.table_number} is out of service.`);

            // Walk-in dine-in orders are identified by their table.
            if (!data.customer_id && !data.guest_name) data.guest_name = `Table ${table.table_number}`;
        }

        const ids = [...new Set(input.lines.map((line) => line.menu_item_id))];
        const menuItems = await repo.lockMenuItems(conn, ids);
        const { lines, totalCents } = priceLines(input.lines, menuItems);

        const id = await repo.insertOrder(conn, { ...data, total_amount: fromCents(totalCents) });
        for (const line of lines) {
            await repo.insertLine(conn, id, line);
        }

        await logAudit(conn, {
            userId: user.user_id,
            action: 'ORDER_PLACED',
            entity: 'orders',
            recordId: id,
            details: {
                order_ref: orderRef(id),
                order_type: data.order_type,
                channel: data.sales_channel,
                total: fromCents(totalCents),
                lines: lines.length
            }
        });

        return id;
    });

    return loadDetail(db, orderId);
}

// GET /orders (FR-11, FR-22). Customers see only their own orders; kitchen
// staff see the active queue, oldest first.
async function listOrders(user, query, now = new Date()) {
    const page = query.page || 1;
    const limit = query.limit || 25;
    const filters = {
        statuses: query.status ? [query.status] : null,
        date: query.date,
        search: query.search,
        orderType: query.order_type
    };

    let oldestFirst = false;

    if (user.role === ROLES.CUSTOMER) {
        filters.customerId = user.user_id;
    } else if (user.role === ROLES.KITCHEN) {
        filters.statuses = (filters.statuses || KITCHEN_STATUSES).filter((s) => KITCHEN_STATUSES.includes(s));
        if (filters.statuses.length === 0) filters.statuses = ['__none__'];
        oldestFirst = true;
    } else if (query.needs_action) {
        // "Orders needing action" on the staff dashboard - oldest first
        filters.statuses = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'];
        oldestFirst = true;
    }

    const { total, rows } = await repo.list(db, filters, {
        limit,
        offset: (page - 1) * limit,
        oldestFirst
    });

    const response = {
        orders: rows.map(presentOrder),
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit))
    };

    if (user.role !== ROLES.CUSTOMER) {
        const day = query.date || localDate(now);
        const counts = await repo.statusCounts(db, day);
        response.summary = {
            date: day,
            pending: counts.PENDING || 0,
            confirmed: counts.CONFIRMED || 0,
            preparing: counts.PREPARING || 0,
            ready: counts.READY || 0,
            completed: counts.COMPLETED || 0,
            cancelled: counts.CANCELLED || 0
        };
    }

    return response;
}

async function getOrder(user, ref) {
    const order = await loadDetail(db, requireOrderId(ref));
    if (!order) throw notFound('Order not found.');

    if (user.role === ROLES.CUSTOMER && order.customer_id !== user.user_id) {
        throw forbidden();
    }

    return order;
}

// P5 - UpdateOrderStatus(user, orderNo, newStatus) (UC-04, FR-10)
async function updateStatus(user, ref, newStatus) {
    const orderId = requireOrderId(ref);

    await withTransaction(async (conn) => {
        const order = await repo.findById(conn, orderId, { forUpdate: true });
        if (!order) throw notFound('Order not found.');

        assertStatusChange(user.role, order.order_status, newStatus);

        if (newStatus === 'COMPLETED' && !(await findActivePayment(conn, orderId))) {
            throw conflict('Record payment before completing the order.');
        }

        await repo.setStatus(conn, orderId, newStatus);

        await logAudit(conn, {
            userId: user.user_id,
            action: 'ORDER_STATUS',
            entity: 'orders',
            recordId: orderId,
            details: { order_ref: orderRef(orderId), from: order.order_status, to: newStatus }
        });
    });

    return loadDetail(db, orderId);
}

// P5 - CancelOrder(user, orderNo, reason) (FR-10, BR-11 - the order is kept)
async function cancelOrder(user, ref, { reason }) {
    const orderId = requireOrderId(ref);
    const isCustomer = user.role === ROLES.CUSTOMER;

    if (!isCustomer && !reason) {
        throw badRequest('Enter a reason for cancelling this order.', [
            { field: 'reason', message: 'Enter a reason for cancelling this order.' }
        ]);
    }

    await withTransaction(async (conn) => {
        const order = await repo.findById(conn, orderId, { forUpdate: true });
        if (!order) throw notFound('Order not found.');

        assertCanCancel(user, order);

        const finalReason = reason || 'Cancelled by customer';
        await repo.setStatus(conn, orderId, 'CANCELLED', { cancelReason: finalReason });

        await logAudit(conn, {
            userId: user.user_id,
            action: 'ORDER_CANCELLED',
            entity: 'orders',
            recordId: orderId,
            details: { order_ref: orderRef(orderId), from: order.order_status, reason: finalReason }
        });
    });

    return loadDetail(db, orderId);
}

module.exports = {
    STATUS_LABELS,
    NEXT_STATUS,
    ALLOWED,
    KITCHEN_STATUSES,
    MAX_QTY: settings.ORDER_MAX_QTY,
    assertStatusChange,
    assertCanCancel,
    priceLines,
    placeOrder,
    listOrders,
    getOrder,
    updateStatus,
    cancelOrder
};
