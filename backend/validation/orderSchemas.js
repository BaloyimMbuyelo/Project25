const settings = require('../config/settings');
const { z, isoDate, optionalText, phone, positiveId, msg } = require('./common');

const line = z.object({
    menu_item_id: positiveId('menu item'),
    quantity: z.number(msg('Quantity must be greater than zero.'))
        .int('Quantity must be a whole number.')
        .min(1, 'Quantity must be greater than zero.')
        .max(settings.ORDER_MAX_QTY, `Quantity must be ${settings.ORDER_MAX_QTY} or fewer per item.`),
    notes: optionalText(255, 'Item notes')
});

const placeOrder = z.object({
    lines: z.array(line, msg('Your order is empty.'))
        .min(1, 'Your order is empty.')
        .max(settings.ORDER_MAX_LINES, `An order can have at most ${settings.ORDER_MAX_LINES} lines.`),
    // Dine-in and Collection only - delivery is out of scope (Q4)
    order_type: z.enum(['DINE_IN', 'COLLECTION'], {
        error: 'Choose Dine-in or Collection.'
    }),
    table_id: positiveId('table').nullable().optional(),
    customer_id: positiveId('customer').optional(),
    guest_name: z.string().trim().min(2, 'Enter the customer name (2–150 characters).').max(150).optional(),
    guest_phone: phone.optional(),
    special_instructions: optionalText(255, 'Special instructions')
});

// Order amendment (Analysis FR-19): the full new set of lines, and optionally
// new instructions. Type, table and customer stay as placed.
const amendOrder = z.object({
    lines: placeOrder.shape.lines,
    special_instructions: optionalText(255, 'Special instructions')
});

const statusValues = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];

const updateStatus = z.object({
    status: z.enum(['CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'], {
        error: 'Choose the next status for this order.'
    })
});

const cancelOrder = z.object({
    reason: z.union([
        z.string().trim().min(3, 'Enter a reason (at least 3 characters).').max(255, 'Reason must be 255 characters or fewer.'),
        z.literal('').transform(() => undefined)
    ]).optional()
});

const listQuery = z.object({
    status: z.enum(statusValues).optional(),
    date: isoDate().optional(),
    search: z.string().trim().max(100).optional(),
    order_type: z.enum(['DINE_IN', 'COLLECTION']).optional(),
    needs_action: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
    page: z.coerce.number().int().min(1).max(10000).optional(),
    limit: z.coerce.number().int().min(1).max(100).optional()
});

const refParam = z.object({
    ref: z.string().trim().min(1).max(20)
});

module.exports = { placeOrder, amendOrder, updateStatus, cancelOrder, listQuery, refParam };
