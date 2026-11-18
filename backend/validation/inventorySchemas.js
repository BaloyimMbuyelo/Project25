const { z, optionalText, quantity2dp, nonNegative2dp } = require('./common');

const itemFields = {
    item_name: z.string({ required_error: 'Enter the item name.' })
        .trim()
        .min(1, 'Enter the item name.')
        .max(80, 'Item name must be 80 characters or fewer.'),
    category: optionalText(50, 'Category'),
    unit: z.string({ required_error: 'Choose a unit.' })
        .trim()
        .min(1, 'Choose a unit.')
        .max(10, 'Unit must be 10 characters or fewer (e.g. kg, l, ea, box, jar).'),
    reorder_level: nonNegative2dp('Reorder level')
};

const createItem = z.object({
    ...itemFields,
    opening_quantity: nonNegative2dp('Opening quantity').optional()
});

const updateItem = z.object(itemFields);

const setStatus = z.object({
    is_active: z.boolean({
        required_error: 'is_active must be true or false.',
        invalid_type_error: 'is_active must be true or false.'
    })
});

const recordMovement = z.object({
    movement_type: z.enum(['STOCK_IN', 'STOCK_OUT', 'WASTAGE', 'ADJUSTMENT_IN', 'ADJUSTMENT_OUT'], {
        errorMap: () => ({ message: 'Choose a movement type.' })
    }),
    quantity: quantity2dp('Quantity'),
    reason: optionalText(255, 'Reason')
});

const listQuery = z.object({
    search: z.string().trim().max(80).optional(),
    category: z.string().trim().max(50).optional(),
    low: z.enum(['true', 'false']).optional().transform((v) => v === 'true'),
    include_inactive: z.enum(['true', 'false']).optional().transform((v) => v === 'true')
});

module.exports = { createItem, updateItem, setStatus, recordMovement, listQuery };
