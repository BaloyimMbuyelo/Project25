const { z } = require('zod');

// zod 4: one message when a value is missing, another when it has the wrong type
const msg = (required, invalid = required) => ({
    error: (issue) => (issue.input === undefined ? required : invalid)
});

// Shared zod building blocks. The same rules are mirrored in the React forms;
// the API remains authoritative (System Design 4.1.3).

const isoDate = (message = 'Enter a valid date.') =>
    z.string(msg(message))
        .regex(/^\d{4}-\d{2}-\d{2}$/, message)
        .refine((value) => !Number.isNaN(new Date(`${value}T00:00:00`).getTime()), message);

const hhmm = (message = 'Enter a valid time.') =>
    z.string(msg(message))
        .regex(/^([01]\d|2[0-3]):[0-5]\d$/, message);

// Empty strings become null so optional text fields can be cleared.
const optionalText = (max, label) =>
    z.union([
        z.string().trim().max(max, `${label} must be ${max} characters or fewer.`),
        z.null()
    ])
        .optional()
        .transform((value) => (value === '' ? null : value));

const phone = z.string(msg('Enter a contact number.'))
    .trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .pipe(z.string().regex(/^(0\d{9}|\+27\d{9})$/, 'Enter a 10-digit number, e.g. 0821234567 or +27821234567.'));

const positiveId = (label = 'id') =>
    z.number(msg(`Select a valid ${label}.`)).int().positive(`Select a valid ${label}.`);

// Positive quantity with at most two decimals (DECIMAL(10,2))
const quantity2dp = (label = 'Quantity') =>
    z.number(msg(`${label} is required.`, `${label} must be a number.`))
        .positive(`${label} must be greater than zero.`)
        .max(99999999.99, `${label} is too large.`)
        .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, `${label} can have at most 2 decimals.`);

const nonNegative2dp = (label) =>
    z.number(msg(`${label} is required.`, `${label} must be a number.`))
        .min(0, `${label} cannot be negative.`)
        .max(99999999.99, `${label} is too large.`)
        .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, `${label} can have at most 2 decimals.`);

const idParam = z.object({
    id: z.coerce.number(msg('Invalid id.')).int().positive('Invalid id.')
});

module.exports = { z, msg, isoDate, hhmm, optionalText, phone, positiveId, quantity2dp, nonNegative2dp, idParam };
