const { z, isoDate, phone, positiveId } = require('./common');

const STAFF_ROLE_NAMES = ['Administrator', 'Manager', 'Waiter', 'Kitchen Staff', 'Cashier'];

const staffUser = z.object({
    full_name: z.string({ required_error: 'Enter the full name.' })
        .trim()
        .min(2, 'Enter the full name (2–150 characters).')
        .max(150, 'Enter the full name (2–150 characters).')
        .regex(/^[\p{L}][\p{L} '.\-]*$/u, 'Name can only contain letters, spaces, hyphens and apostrophes.'),
    // Staff log in with this value; the users table stores it as email.
    email: z.string({ required_error: 'Enter the username / email.' })
        .trim()
        .toLowerCase()
        .min(3, 'Enter the username / email.')
        .max(150, 'Username / email must be 150 characters or fewer.')
        .regex(/^[a-z0-9._%+\-@]+$/, 'Use letters, numbers and . _ - @ only.'),
    role: z.enum(STAFF_ROLE_NAMES, { errorMap: () => ({ message: 'Choose a staff role.' }) }),
    phone: z.union([phone, z.literal('').transform(() => null), z.null()]).optional()
});

const setStatus = z.object({
    status: z.enum(['ACTIVE', 'INACTIVE'], { errorMap: () => ({ message: 'Status must be ACTIVE or INACTIVE.' }) })
});

const listQuery = z.object({
    type: z.enum(['staff', 'customer']).optional(),
    role: z.enum([...STAFF_ROLE_NAMES, 'Customer']).optional(),
    status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
    search: z.string().trim().max(100).optional()
});

const auditQuery = z.object({
    from: isoDate().optional(),
    to: isoDate().optional(),
    action: z.string().trim().toUpperCase().regex(/^[A-Z_]{2,50}$/, 'Invalid action filter.').optional(),
    user_id: z.coerce.number().int().positive().optional(),
    page: z.coerce.number().int().min(1).max(100000).optional(),
    limit: z.coerce.number().int().min(1).max(200).optional()
});

module.exports = { STAFF_ROLE_NAMES, staffUser, setStatus, listQuery, auditQuery, positiveId };
