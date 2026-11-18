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

    // Payments
    VAT_RATE: 0.15,

    // Receipt header (Figure 32) - sample data only
    RESTAURANT_NAME: process.env.RESTAURANT_NAME || 'UBUNTU BISTRO',
    RESTAURANT_TAGLINE: 'Good Food. Good People.',
    RESTAURANT_ADDRESS: process.env.RESTAURANT_ADDRESS || '12 Long Street, Cape Town · 021 000 0000'
});
