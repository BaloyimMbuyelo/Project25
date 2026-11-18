const { rateLimit } = require('express-rate-limit');
const settings = require('../config/settings');

// Per-IP limit on the login endpoints (OWASP A07, System Design 4.8.2).
// Works alongside the per-account lockout in AuthService.
function createLoginLimiter({
    limit = settings.LOGIN_RATE_LIMIT,
    windowMin = settings.LOGIN_RATE_WINDOW_MIN
} = {}) {
    return rateLimit({
        windowMs: windowMin * 60 * 1000,
        limit,
        standardHeaders: 'draft-7',
        legacyHeaders: false,
        handler: (req, res) => {
            res.status(429).json({
                error: {
                    code: 'TOO_MANY_REQUESTS',
                    message: `Too many attempts. Try again in ${windowMin} minutes.`,
                    fields: []
                }
            });
        }
    });
}

module.exports = { createLoginLimiter };
