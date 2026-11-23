
const authService = require('../services/authService');
const settings = require('../config/settings');
const { readToken, verifyToken } = require('../middleware/authMiddleware');
const { AppError } = require('../utils/errors');

// POST /api/auth/register (P3)
const registerCustomer = async (req, res) => {
    const data = await authService.registerCustomer(req.valid.body, req.ip);
    res.status(201).json({ data, message: 'Registration successful. Please log in.' });
};

// POST /api/auth/login and /api/auth/staff-login (P1).
// The token goes in an httpOnly cookie; it is not returned in the body.
const loginFor = (portal) => async (req, res) => {
    const { token, user } = await authService.login({ ...req.valid.body, portal, ip: req.ip });
    res.cookie(settings.COOKIE_NAME, token, authService.cookieOptions());
    res.json({ data: { user }, message: 'Login successful.' });
};

// POST /api/auth/logout (FR-23). Always clears the cookie, even if expired.
const logout = async (req, res) => {
    const token = readToken(req);
    const payload = token ? verifyToken(token) : null;
    const userId = payload && Number(payload.sub ?? payload.user_id);

    if (userId) {
        try {
            await authService.recordLogout(userId, req.ip);
        } catch (error) {
            console.error('Unable to audit LOGOUT:', error.message);
        }
    }

    const { maxAge: _maxAge, ...options } = authService.cookieOptions();
    res.clearCookie(settings.COOKIE_NAME, options);
    res.json({ data: null, message: 'You have been logged out.' });
};

// GET /api/auth/me
const me = async (req, res) => {
    const user = await authService.getCurrentUser(req.user.user_id);
    if (!user) throw new AppError(401, 'Your session has expired. Please log in again.');
    res.json({ data: { user } });
};

// POST /api/auth/change-password
const changePassword = async (req, res) => {
    const user = await authService.changePassword(req.user.user_id, req.valid.body, req.ip);
    res.json({ data: { user }, message: 'Password changed successfully.' });
};

module.exports = {
    registerCustomer,
    login: loginFor('customer'),
    staffLogin: loginFor('staff'),
    logout,
    me,
    changePassword
};
