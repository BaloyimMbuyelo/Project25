// AuthService - module 1.0 Access Control (FR-01 to FR-03, FR-23).
// Implements System Design P1 (login with lockout), P3 (register customer)
// and the first-login password change for staff created by P11.

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const { db } = require('../config/db');
const settings = require('../config/settings');
const repo = require('../repositories/userRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { AppError, badRequest, conflict } = require('../utils/errors');
const { passwordProblem } = require('../utils/passwords');
const { ROLES } = require('../utils/roles');

const BCRYPT_COST = 12;
const GENERIC_LOGIN_ERROR = 'Incorrect email or password.';

// Compared against when the user does not exist, so a missing account takes
// about as long to reject as a wrong password.
let dummyHash = null;
const getDummyHash = async () => {
    dummyHash = dummyHash || await bcrypt.hash('ubms-timing-equaliser', BCRYPT_COST);
    return dummyHash;
};

function presentUser(user) {
    return {
        user_id: user.user_id,
        full_name: user.full_name,
        email: user.email,
        phone: user.phone,
        role: user.role_name,
        status: user.status,
        must_change_pw: Boolean(user.must_change_pw),
        last_login_at: user.last_login_at
    };
}

function requireSecret() {
    if (!process.env.JWT_SECRET) {
        console.error('JWT_SECRET is not configured.');
        throw new AppError(500, 'Authentication is not configured.');
    }
    return process.env.JWT_SECRET;
}

function signToken(user) {
    return jwt.sign(
        { sub: String(user.user_id), role: user.role_name },
        requireSecret(),
        { expiresIn: settings.JWT_EXPIRES_IN }
    );
}

function cookieOptions() {
    return {
        httpOnly: true,
        secure: settings.COOKIE_SECURE,
        sameSite: 'strict',
        path: '/',
        maxAge: settings.SESSION_HOURS * 60 * 60 * 1000
    };
}

// P1 - Login(username, password, portal)
async function login({ email, password, portal, ip }, now = new Date()) {
    requireSecret();

    // Failures are recorded (audit row, counter) and committed before the
    // error is returned, so the transaction returns { error } instead of
    // throwing.
    const outcome = await withTransaction(async (conn) => {
        const user = await repo.findByEmail(conn, email, { forUpdate: true });

        if (!user) {
            await bcrypt.compare(password, await getDummyHash());
            await logAudit(conn, {
                userId: null, action: 'LOGIN_FAILED', entity: 'users', ip,
                details: { email, reason: 'unknown account', portal }
            });
            return { error: new AppError(401, GENERIC_LOGIN_ERROR) };
        }

        const lockedUntil = user.locked_until ? new Date(user.locked_until) : null;

        if (lockedUntil && lockedUntil > now) {
            await logAudit(conn, {
                userId: user.user_id, action: 'LOGIN_FAILED', entity: 'users', recordId: user.user_id, ip,
                details: { reason: 'account locked', portal }
            });
            return {
                error: new AppError(429, `Too many attempts. Try again in ${settings.LOCK_MIN} minutes.`, { code: 'ACCOUNT_LOCKED' })
            };
        }

        const passwordOk = await bcrypt.compare(password, user.password_hash);

        if (!passwordOk) {
            // A lock that has expired starts a fresh count.
            const previous = lockedUntil ? 0 : Number(user.failed_logins);
            const failed = previous + 1;

            if (failed >= settings.LOGIN_MAX_ATTEMPTS) {
                await repo.updateUser(conn, user.user_id, {
                    failed_logins: 0,
                    locked_until: new Date(now.getTime() + settings.LOCK_MIN * 60 * 1000)
                });
                await logAudit(conn, {
                    userId: user.user_id, action: 'ACCOUNT_LOCKED', entity: 'users', recordId: user.user_id, ip,
                    details: { attempts: failed, lock_minutes: settings.LOCK_MIN, portal }
                });
            } else {
                await repo.updateUser(conn, user.user_id, { failed_logins: failed, locked_until: null });
                await logAudit(conn, {
                    userId: user.user_id, action: 'LOGIN_FAILED', entity: 'users', recordId: user.user_id, ip,
                    details: { reason: 'wrong password', attempts: failed, portal }
                });
            }

            return { error: new AppError(401, GENERIC_LOGIN_ERROR) };
        }

        if (user.status !== 'ACTIVE') {
            await logAudit(conn, {
                userId: user.user_id, action: 'LOGIN_FAILED', entity: 'users', recordId: user.user_id, ip,
                details: { reason: 'inactive account', portal }
            });
            return {
                error: new AppError(403, 'Your account is inactive. Contact your manager.', { code: 'ACCOUNT_INACTIVE' })
            };
        }

        const isCustomer = user.role_name === ROLES.CUSTOMER;
        if ((portal === 'staff' && isCustomer) || (portal === 'customer' && !isCustomer)) {
            return {
                error: new AppError(403, 'Please use the correct login page.', { code: 'WRONG_PORTAL' })
            };
        }

        await repo.updateUser(conn, user.user_id, {
            failed_logins: 0,
            locked_until: null,
            last_login_at: now
        });
        await logAudit(conn, {
            userId: user.user_id, action: 'LOGIN_SUCCESS', entity: 'users', recordId: user.user_id, ip,
            details: { portal }
        });

        return { user: { ...user, last_login_at: now } };
    });

    if (outcome.error) throw outcome.error;

    return {
        token: signToken(outcome.user),
        user: presentUser(outcome.user)
    };
}

// P3 - RegisterCustomer(form)
async function registerCustomer({ full_name: fullName, email, phone, password }, ip) {
    const problem = passwordProblem(password);
    if (problem) throw badRequest(problem, [{ field: 'password', message: problem }]);

    if (await repo.emailTaken(db, email)) {
        throw conflict('An account with this email already exists.');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_COST);

    try {
        return await withTransaction(async (conn) => {
            const role = await repo.findRole(conn, ROLES.CUSTOMER);
            if (!role) throw new AppError(500, 'Customer role has not been configured.');

            const userId = await repo.insertUser(conn, {
                roleId: role.role_id, fullName, email, passwordHash, phone
            });

            await logAudit(conn, {
                userId, action: 'CUSTOMER_REGISTERED', entity: 'users', recordId: userId, ip,
                details: { email }
            });

            return { user_id: userId };
        });
    } catch (error) {
        if (error && error.code === 'ER_DUP_ENTRY') throw conflict('An account with this email already exists.');
        throw error;
    }
}

async function getCurrentUser(userId) {
    const user = await repo.findById(db, userId);
    return user ? presentUser(user) : null;
}

// Required before staff with a temporary password can use the system (P11).
async function changePassword(userId, { current_password: current, new_password: next }, ip) {
    const problem = passwordProblem(next);
    if (problem) throw badRequest(problem, [{ field: 'new_password', message: problem }]);

    const passwordHash = await bcrypt.hash(next, BCRYPT_COST);

    await withTransaction(async (conn) => {
        const user = await repo.findById(conn, userId, { forUpdate: true });

        if (!user || !(await bcrypt.compare(current, user.password_hash))) {
            throw badRequest('Your current password is incorrect.', [
                { field: 'current_password', message: 'Your current password is incorrect.' }
            ]);
        }

        if (await bcrypt.compare(next, user.password_hash)) {
            throw badRequest('Choose a password different from the current one.', [
                { field: 'new_password', message: 'Choose a password different from the current one.' }
            ]);
        }

        await repo.updateUser(conn, userId, { password_hash: passwordHash, must_change_pw: 0 });
        await logAudit(conn, {
            userId, action: 'PASSWORD_CHANGED', entity: 'users', recordId: userId, ip, details: {}
        });
    });

    return getCurrentUser(userId);
}

async function recordLogout(userId, ip) {
    await logAudit(db, { userId, action: 'LOGOUT', entity: 'users', recordId: userId, ip, details: {} });
}

module.exports = {
    BCRYPT_COST,
    presentUser,
    cookieOptions,
    login,
    registerCustomer,
    getCurrentUser,
    changePassword,
    recordLogout
};
