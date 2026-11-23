// Business settings (System Design Table 14). Override in .env if needed.
const int = (name, fallback) => {
    const value = Number.parseInt(process.env[name], 10);
    return Number.isFinite(value) ? value : fallback;
};

module.exports = Object.freeze({
    // Reservations (Q9)
    RES_SLOT_MIN: int('RES_SLOT_MIN', 30),
    RES_DURATION_MIN: int('RES_DURATION_MIN', 120),
    RES_DAYS_AHEAD: int('RES_DAYS_AHEAD', 30),
    RES_FIRST_SLOT: process.env.RES_FIRST_SLOT || '17:00',
    RES_LAST_SLOT: process.env.RES_LAST_SLOT || '21:00',
    RES_NO_SHOW_GRACE_MIN: int('RES_NO_SHOW_GRACE_MIN', 15),

    // Authentication (Table 14, 4.8.2)
    JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '8h',
    SESSION_HOURS: int('SESSION_HOURS', 8),
    LOGIN_MAX_ATTEMPTS: int('LOGIN_MAX_ATTEMPTS', 5),
    LOCK_MIN: int('LOCK_MIN', 15),
    // Requests per IP to the login endpoints per window (on top of account lockout)
    LOGIN_RATE_LIMIT: int('LOGIN_RATE_LIMIT', 20),
    LOGIN_RATE_WINDOW_MIN: int('LOGIN_RATE_WINDOW_MIN', 15),
    // Secure cookies work on https and on http://localhost; set false only for
    // plain-http LAN testing.
    COOKIE_SECURE: process.env.COOKIE_SECURE !== 'false',
    COOKIE_NAME: 'ubms_token',

    // Orders (Table 14)
    ORDER_MAX_QTY: int('ORDER_MAX_QTY', 25),
    ORDER_MAX_LINES: int('ORDER_MAX_LINES', 50),

    // Reports
    REPORT_MAX_DAYS: int('REPORT_MAX_DAYS', 366),

    // Payments
    VAT_RATE: 0.15,

    // Receipt header (Figure 32) - sample data only
    RESTAURANT_NAME: process.env.RESTAURANT_NAME || 'UBUNTU BISTRO',
    RESTAURANT_TAGLINE: 'Good Food. Good People.',
    RESTAURANT_ADDRESS: process.env.RESTAURANT_ADDRESS || '12 Long Street, Cape Town · 021 000 0000'
});
