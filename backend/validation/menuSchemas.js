const { z, msg, optionalText, positiveId } = require('./common');

// P9 validation: name 1-50 characters; price numeric, > 0, <= 999.99, max 2
// decimals; description <= 255.
const price = z.number(msg('Enter a price.', 'Please enter a valid price.'))
    .positive('Please enter a valid price.')
    .max(999.99, 'Price must be R999.99 or less.')
    .refine((v) => Math.abs(Math.round(v * 100) - v * 100) < 1e-6, 'Price can have at most 2 decimals.');

const itemBody = z.object({
    name: z.string(msg('Enter the item name.'))
        .trim()
        .min(1, 'Enter the item name.')
        .max(50, 'Item name must be 50 characters or fewer.'),
    category_id: positiveId('category'),
    description: optionalText(255, 'Description'),
    price,
    is_available: z.boolean(msg('Availability must be true or false.')).optional()
});

const availability = z.object({
    is_available: z.boolean(msg('Availability must be true or false.'))
});

const categoryBody = z.object({
    name: z.string(msg('Enter the category name.'))
        .trim()
        .min(2, 'Category name must be 2–50 characters.')
        .max(50, 'Category name must be 2–50 characters.'),
    description: optionalText(255, 'Description'),
    sort_order: z.number(msg('Sort order must be a whole number.')).int().min(0).max(1000).optional()
});

const categoryStatus = z.object({
    is_active: z.boolean(msg('is_active must be true or false.'))
});

const listQuery = z.object({
    category_id: z.coerce.number().int().positive().optional(),
    search: z.string().trim().max(50).optional(),
    available_only: z.enum(['true', 'false']).optional().transform((v) => v === 'true')
});

module.exports = { itemBody, availability, categoryBody, categoryStatus, listQuery };
