const { z, isoDate, optionalText, positiveId } = require('./common');

const money = (label) =>
    z.number({ invalid_type_error: `${label} must be a number.` })
        .positive(`${label} must be greater than zero.`)
        .max(99999999.99, `${label} is too large.`)
        .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, `${label} can have at most 2 decimals.`);

const orderRef = z.union([z.string(), z.number()], {
    errorMap: () => ({ message: 'Enter the order number.' })
}).transform((v) => String(v).trim());

// Note: there is deliberately no "amount" field - the server uses the
// order total (BR-06, OWASP A04).
const recordPayment = z.object({
    order_ref: orderRef,
    payment_method_id: positiveId('payment method'),
    amount_tendered: money('Amount received').nullable().optional(),
    reference_number: optionalText(30, 'Reference number')
});

const voidPayment = z.object({
    reason: z.string({ required_error: 'Enter a reason for voiding this payment.' })
        .trim()
        .min(3, 'Enter a reason for voiding this payment.')
        .max(255, 'Reason must be 255 characters or fewer.')
});

const listQuery = z.object({
    date: isoDate().optional(),
    status: z.enum(['PAID', 'VOIDED']).optional()
});

const orderParam = z.object({
    orderRef: z.string().trim().min(1).max(20)
});

module.exports = { recordPayment, voidPayment, listQuery, orderParam };
