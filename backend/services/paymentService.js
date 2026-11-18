// PaymentService - business rules for module 6.0 (FR-18, FR-19).
// Implements System Design P7 (record payment), Q5 (counter payments, no
// gateway), Q10 (one active Paid payment per order; voided rows retained)
// and BR-05 / BR-06.

const { db } = require('../config/db');
const settings = require('../config/settings');
const repo = require('../repositories/paymentRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { badRequest, notFound, conflict } = require('../utils/errors');
const {
    toCents, fromCents, formatRef, orderRef, parseOrderRef, vatBreakdown, localDate
} = require('../utils/format');

const PAYABLE_STATUSES = ['READY', 'COMPLETED'];

const rand = (cents) => `R${fromCents(cents).toFixed(2)}`;
const isCash = (method) => method.method_name.toLowerCase() === 'cash';

// ---------- Pure rules (unit tested) ----------

// Validates the cashier's input against the order total (BR-06) and
// returns what will be stored. Amounts are in cents.
function evaluatePayment({ method, amountDueCents, amountTendered, reference }) {
    if (method.requires_reference && !reference) {
        throw badRequest('Enter the card slip or EFT reference.', [
            { field: 'reference_number', message: 'Enter the card slip or EFT reference.' }
        ]);
    }

    if (isCash(method)) {
        if (amountTendered === undefined || amountTendered === null) {
            throw badRequest('Enter the amount received.', [
                { field: 'amount_tendered', message: 'Enter the amount received.' }
            ]);
        }

        const tenderedCents = toCents(amountTendered);

        if (tenderedCents < amountDueCents) {
            const message = `Amount received must cover ${rand(amountDueCents)}.`;
            throw badRequest(message, [{ field: 'amount_tendered', message }]);
        }

        return {
            amountCents: amountDueCents,
            tenderedCents,
            changeCents: tenderedCents - amountDueCents,
            reference: null
        };
    }

    return {
        amountCents: amountDueCents,
        tenderedCents: null,
        changeCents: 0,
        reference: reference || null
    };
}

// ---------- Presentation helpers ----------

function presentLine(line) {
    return {
        name: line.name,
        quantity: Number(line.quantity),
        unit_price: Number(line.unit_price),
        line_total: Number(line.subtotal)
    };
}

function presentOrder(order) {
    return {
        order_id: order.order_id,
        order_ref: orderRef(order.order_id),
        order_type: order.order_type,
        order_status: order.order_status,
        customer_name: order.customer_name,
        table_number: order.table_number,
        total: Number(order.total_amount),
        created_at: order.created_at
    };
}

function presentPayment(p) {
    const amountCents = toCents(p.amount);
    const tenderedCents = p.amount_tendered === null ? null : toCents(p.amount_tendered);

    return {
        payment_id: p.payment_id,
        order_id: p.order_id,
        order_ref: orderRef(p.order_id),
        receipt_number: p.receipt_number,
        customer_name: p.customer_name,
        order_type: p.order_type,
        payment_method_id: p.payment_method_id,
        method_name: p.method_name,
        amount: fromCents(amountCents),
        amount_tendered: tenderedCents === null ? null : fromCents(tenderedCents),
        change: tenderedCents === null ? 0 : fromCents(tenderedCents - amountCents),
        reference_number: p.reference_number,
        payment_status: p.payment_status,
        paid_at: p.paid_at,
        recorded_by: p.recorded_by_name,
        void_reason: p.void_reason,
        voided_by: p.voided_by_name,
        voided_at: p.voided_at
    };
}

// Why an order cannot be paid right now, or null if it can.
function payableProblem(order, activePayment) {
    if (order.order_status === 'CANCELLED') return 'Cancelled orders cannot be paid.';
    if (activePayment) return 'This order already has an active Paid payment.';
    if (!PAYABLE_STATUSES.includes(order.order_status)) {
        return 'Only orders that are Ready or Completed can be paid.';
    }
    return null;
}

function requireOrderId(value) {
    const orderId = parseOrderRef(value);
    if (!orderId) {
        throw badRequest('Enter a valid order number, e.g. UB-0105.', [
            { field: 'order_ref', message: 'Enter a valid order number, e.g. UB-0105.' }
        ]);
    }
    return orderId;
}

// ---------- Use cases ----------

async function listMethods() {
    return (await repo.listMethods(db)).map((m) => ({ ...m, requires_reference: Boolean(m.requires_reference) }));
}

async function listPayableOrders() {
    return (await repo.listPayableOrders(db)).map(presentOrder);
}

// Order look-up for the Record payment screen (Figure 22, note 1).
async function getOrderForPayment(orderRefValue) {
    const orderId = requireOrderId(orderRefValue);
    const order = await repo.findOrder(db, orderId);

    if (!order) throw notFound('Order not found.');

    const [lines, activePayment] = await Promise.all([
        repo.orderLines(db, orderId),
        repo.findActivePayment(db, orderId)
    ]);

    const problem = payableProblem(order, activePayment);

    return {
        ...presentOrder(order),
        lines: lines.map(presentLine),
        amount_due: Number(order.total_amount),
        payable: problem === null,
        not_payable_reason: problem,
        active_payment: activePayment
            ? { payment_id: activePayment.payment_id, receipt_number: activePayment.receipt_number }
            : null
    };
}

// P7 - Record payment (UC-05).
async function recordPayment(cashier, input) {
    const orderId = requireOrderId(input.order_ref);

    let paymentId;

    try {
        paymentId = await withTransaction(async (conn) => {
            const order = await repo.findOrder(conn, orderId, { forUpdate: true });
            if (!order) throw notFound('Order not found.');

            const activePayment = await repo.findActivePayment(conn, orderId);
            const problem = payableProblem(order, activePayment);
            if (problem) throw conflict(problem);

            const method = await repo.findMethod(conn, input.payment_method_id);
            if (!method) {
                throw badRequest('Choose a payment method.', [
                    { field: 'payment_method_id', message: 'Choose a payment method.' }
                ]);
            }

            // The amount always comes from the server, never the browser (A04).
            const amountDueCents = toCents(order.total_amount);
            if (amountDueCents <= 0) throw conflict('This order has no amount due.');

            const lines = await repo.orderLines(conn, orderId);
            const linesCents = lines.reduce((sum, l) => sum + toCents(l.subtotal), 0);
            if (lines.length > 0 && linesCents !== amountDueCents) {
                throw conflict('The order total does not match its items. Ask a manager to check the order.');
            }

            const result = evaluatePayment({
                method,
                amountDueCents,
                amountTendered: input.amount_tendered,
                reference: input.reference_number
            });

            const id = await repo.insertPayment(conn, {
                order_id: orderId,
                payment_method_id: method.payment_method_id,
                recorded_by: cashier.user_id,
                amount: fromCents(result.amountCents),
                amount_tendered: result.tenderedCents === null ? null : fromCents(result.tenderedCents),
                reference_number: result.reference
            });

            const receiptNumber = formatRef('RC', id, 6);
            await repo.setReceiptNumber(conn, id, receiptNumber);

            if (order.order_status === 'READY') {
                await repo.setOrderStatus(conn, orderId, 'COMPLETED');
            }

            await logAudit(conn, {
                userId: cashier.user_id,
                action: 'PAYMENT_RECORDED',
                entity: 'payments',
                recordId: id,
                details: {
                    order_id: orderId,
                    receipt_number: receiptNumber,
                    amount: fromCents(result.amountCents),
                    method: method.method_name
                }
            });

            return id;
        });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') {
            if (String(error.message).includes('uq_pay_active_order')) {
                throw conflict('This order already has an active Paid payment.');
            }
            if (String(error.message).includes('reference_number')) {
                throw conflict('This reference number has already been used.');
            }
        }
        throw error;
    }

    return presentPayment(await repo.findPayment(db, paymentId));
}

// Manager-only void (Table 30). The row is kept for audit and a replacement
// payment may follow (Q10).
async function voidPayment(manager, paymentId, { reason }) {
    await withTransaction(async (conn) => {
        const payment = await repo.findPayment(conn, paymentId, { forUpdate: true });
        if (!payment) throw notFound('Payment not found.');

        if (payment.payment_status === 'VOIDED') {
            throw conflict('This payment has already been voided.');
        }

        await repo.voidPayment(conn, paymentId, { userId: manager.user_id, reason });

        await logAudit(conn, {
            userId: manager.user_id,
            action: 'PAYMENT_VOIDED',
            entity: 'payments',
            recordId: paymentId,
            details: {
                order_id: payment.order_id,
                receipt_number: payment.receipt_number,
                amount: Number(payment.amount),
                method: payment.method_name,
                reason
            }
        });
    });

    return presentPayment(await repo.findPayment(db, paymentId));
}

// The day's payments (Table 3: cashier views the day's payments).
async function listPayments({ date, status } = {}, now = new Date()) {
    const day = date || localDate(now);
    const payments = (await repo.listPayments(db, { date: day, status })).map(presentPayment);

    const paid = payments.filter((p) => p.payment_status === 'PAID');
    const byMethod = {};
    for (const p of paid) {
        byMethod[p.method_name] = byMethod[p.method_name] || { method_name: p.method_name, count: 0, cents: 0 };
        byMethod[p.method_name].count += 1;
        byMethod[p.method_name].cents += toCents(p.amount);
    }

    return {
        date: day,
        payments,
        summary: {
            count: paid.length,
            total_paid: fromCents(paid.reduce((sum, p) => sum + toCents(p.amount), 0)),
            voided: payments.length - paid.length,
            by_method: Object.values(byMethod).map(({ cents, ...rest }) => ({ ...rest, total: fromCents(cents) }))
        }
    };
}

// Receipt / tax invoice data (FR-19, Figure 32).
async function getReceipt(paymentId) {
    const payment = await repo.findPayment(db, paymentId);
    if (!payment) throw notFound('Payment not found.');

    const [order, lines] = await Promise.all([
        repo.findOrder(db, payment.order_id),
        repo.orderLines(db, payment.order_id)
    ]);

    const presented = presentPayment(payment);

    return {
        restaurant: {
            name: settings.RESTAURANT_NAME,
            tagline: settings.RESTAURANT_TAGLINE,
            address: settings.RESTAURANT_ADDRESS
        },
        receipt_number: presented.receipt_number,
        order_ref: presented.order_ref,
        paid_at: presented.paid_at,
        cashier: presented.recorded_by,
        order_type: order.order_type,
        table_number: order.table_number,
        customer_name: order.customer_name,
        lines: lines.map(presentLine),
        ...vatBreakdown(toCents(presented.amount), settings.VAT_RATE),
        method_name: presented.method_name,
        amount_tendered: presented.amount_tendered,
        change: presented.change,
        reference_number: presented.reference_number,
        payment_status: presented.payment_status,
        void_reason: presented.void_reason
    };
}

module.exports = {
    evaluatePayment,
    payableProblem,
    listMethods,
    listPayableOrders,
    getOrderForPayment,
    recordPayment,
    voidPayment,
    listPayments,
    getReceipt
};
