
const jwt = require('jsonwebtoken');

const { db } = require('../config/db');
const settings = require('../config/settings');
const userRepo = require('../repositories/userRepository');
const { logAudit } = require('../services/auditService');
const { AppError } = require('../utils/errors');

const SESSION_EXPIRED = 'Your session has expired. Please log in again.';

// Token from the httpOnly cookie set at login (System Design 4.8.2). An
// Authorization: Bearer header is still accepted for API tools and tests.
function readToken(req) {
    const fromCookie = req.cookies && req.cookies[settings.COOKIE_NAME];
    if (fromCookie) return fromCookie;

    const header = req.headers.authorization || '';
    return header.startsWith('Bearer ') ? header.slice(7) : null;
}

function verifyToken(token) {
    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not configured.');
        throw new AppError(500, 'Authentication is not configured.');
    }
    try {
        return jwt.verify(token, process.env.JWT_SECRET);
    } catch {
        return null;
    }
}

// P2 - Authenticate every protected request.
// Missing, invalid or expired tokens are 401. The user and role are reloaded
// from the database on each request, so a deactivated account or a changed
// role takes effect at once (OWASP A08).
function authenticate({ allowPasswordChange = false } = {}) {
    return async (req, res, next) => {
        const token = readToken(req);
        const payload = token ? verifyToken(token) : null;
        const userId = payload && Number(payload.sub ?? payload.user_id);

        if (!userId) throw new AppError(401, SESSION_EXPIRED);

        const user = await userRepo.findById(db, userId);
        if (!user || user.status !== 'ACTIVE') throw new AppError(401, SESSION_EXPIRED);

        req.user = {
            user_id: user.user_id,
            full_name: user.full_name,
            email: user.email,
            role: user.role_name,
            must_change_pw: Boolean(user.must_change_pw)
        };

        // Staff given a temporary password must change it first (P11).
        if (req.user.must_change_pw && !allowPasswordChange) {
            throw new AppError(403, 'Please change your temporary password before continuing.', {
                code: 'PASSWORD_CHANGE_REQUIRED'
            });
        }

        next();
    };
}

const authenticateToken = authenticate();

// P2 - Authorize(allowedRoles). Denials are audited (4.8.6).
const authorizeRoles = (...allowedRoles) => {
    return async (req, res, next) => {
        if (!req.user) throw new AppError(401, SESSION_EXPIRED);

        if (!allowedRoles.includes(req.user.role)) {
            try {
                await logAudit(db, {
                    userId: req.user.user_id,
                    action: 'ACCESS_DENIED',
                    entity: 'route',
                    ip: req.ip,
                    details: { method: req.method, path: req.originalUrl.split('?')[0], role: req.user.role }
                });
            } catch (error) {
                console.error('Unable to audit ACCESS_DENIED:', error.message);
            }
            throw new AppError(403, "You don't have access to this page.");
        }

        next();
    };
};

module.exports = {
    authenticate,
    authenticateToken,
    authorizeRoles,
    readToken,
    verifyToken
};
