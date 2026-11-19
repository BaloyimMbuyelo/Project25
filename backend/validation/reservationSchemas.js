const { z, isoDate, hhmm, optionalText, phone, positiveId, msg } = require('./common');

const partySize = z.number(msg('Party size is required.', 'Party size must be a number.'))
    .int('Party size must be a whole number.')
    .min(1, 'Party size must be between 1 and 20.')
    .max(20, 'Party size must be between 1 and 20.');

const guestName = z.string()
    .trim()
    .min(2, 'Enter the guest name (2–150 characters).')
    .max(150, 'Enter the guest name (2–150 characters).');

const refParam = z.object({
    ref: z.string().trim().toUpperCase().regex(/^RS-\d{4,}$/, 'Invalid reservation reference.')
});

const createReservation = z.object({
    reservation_date: isoDate('Choose a reservation date.'),
    start_time: hhmm('Choose a start time.'),
    party_size: partySize,
    table_id: positiveId('table').nullable().optional(),
    customer_id: positiveId('customer').optional(),
    guest_name: guestName.optional(),
    guest_phone: phone.optional(),
    special_requests: optionalText(255, 'Special requests')
});

const updateReservation = z.object({
    reservation_date: isoDate().optional(),
    start_time: hhmm().optional(),
    party_size: partySize.optional(),
    table_id: positiveId('table').nullable().optional(),
    guest_name: guestName.optional(),
    guest_phone: phone.optional(),
    special_requests: optionalText(255, 'Special requests')
}).refine((value) => Object.keys(value).length > 0, 'Nothing to update.');

const changeStatus = z.object({
    status: z.enum(['SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW'], {
        error: 'Choose Seated, Completed, Cancelled or No-show.'
    }),
    reason: optionalText(255, 'Reason')
});

const listQuery = z.object({
    date: isoDate().optional(),
    status: z.enum(['PENDING', 'CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']).optional(),
    search: z.string().trim().max(100).optional()
});

const availabilityQuery = z.object({
    date: isoDate('Choose a date.'),
    party_size: z.coerce.number(msg('Party size must be a number.'))
        .int('Party size must be a whole number.')
        .min(1, 'Party size must be between 1 and 20.')
        .max(20, 'Party size must be between 1 and 20.')
});

const tablePlanQuery = z.object({
    date: isoDate().optional(),
    start_time: hhmm().optional()
});

module.exports = {
    refParam,
    createReservation,
    updateReservation,
    changeStatus,
    listQuery,
    availabilityQuery,
    tablePlanQuery
};
