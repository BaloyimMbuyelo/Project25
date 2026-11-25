const { z, phone, msg } = require('./common');

const required = 'Email/username and password are required.';

const login = z.object({
    email: z.string(msg(required))
        .trim()
        .toLowerCase()
        .min(1, required)
        .max(150, required),
    password: z.string(msg(required))
        .min(1, required)
        .max(200, required)
});

// Letters (any language), spaces, hyphens and apostrophes (P3)
const NAME = /^[\p{L}][\p{L} '\-]*$/u;

const namePart = (label) => z.string(msg(`Enter your ${label}.`))
    .trim()
    .min(2, `${label[0].toUpperCase()}${label.slice(1)} must be 2–50 characters.`)
    .max(50, `${label[0].toUpperCase()}${label.slice(1)} must be 2–50 characters.`)
    .regex(NAME, `${label[0].toUpperCase()}${label.slice(1)} can only contain letters, spaces, hyphens and apostrophes.`);

// The users table stores one full_name, so first and last name (the design's
// form fields, Q2) are joined. full_name is accepted for existing clients.
const register = z.object({
    first_name: namePart('first name').optional(),
    last_name: namePart('last name').optional(),
    full_name: z.string().trim().min(2, 'Enter your full name.').max(150, 'Name is too long.')
        .regex(NAME, 'Name can only contain letters, spaces, hyphens and apostrophes.')
        .optional(),
    email: z.string(msg('Enter your email address.'))
        .trim()
        .toLowerCase()
        .max(120, 'Email must be 120 characters or fewer.')
        .email('Enter a valid email address.'),
    phone,
    password: z.string(msg('Enter a password.')),
    confirm_password: z.string().optional()
}).superRefine((value, ctx) => {
    if (!value.full_name && !(value.first_name && value.last_name)) {
        if (!value.first_name) ctx.addIssue({ code: 'custom', path: ['first_name'], message: 'Enter your first name.' });
        if (!value.last_name) ctx.addIssue({ code: 'custom', path: ['last_name'], message: 'Enter your last name.' });
    }
    if (value.confirm_password !== undefined && value.confirm_password !== value.password) {
        ctx.addIssue({ code: 'custom', path: ['confirm_password'], message: 'Passwords do not match.' });
    }
}).transform(({ first_name: first, last_name: last, full_name: full, confirm_password: _confirm, ...rest }) => ({
    ...rest,
    full_name: full || `${first} ${last}`
}));

const changePassword = z.object({
    current_password: z.string(msg('Enter your current password.')).min(1, 'Enter your current password.'),
    new_password: z.string(msg('Enter a new password.')),
    confirm_password: z.string().optional()
}).refine(
    (value) => value.confirm_password === undefined || value.confirm_password === value.new_password,
    { path: ['confirm_password'], message: 'Passwords do not match.' }
);

module.exports = { login, register, changePassword };
