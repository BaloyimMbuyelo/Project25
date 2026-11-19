// UserService - staff users and roles (FR-04, UC-08) and the audit log
// viewer (FR-21). Implements System Design P11 and Figure 23.

const bcrypt = require('bcryptjs');

const { db } = require('../config/db');
const settings = require('../config/settings');
const repo = require('../repositories/userRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { BCRYPT_COST, presentUser } = require('./authService');
const { ROLES } = require('../utils/roles');
const { badRequest, notFound, conflict } = require('../utils/errors');
const { randomPassword } = require('../utils/passwords');
const { localDate, addDays } = require('../utils/format');

const STAFF_ROLES = [ROLES.ADMIN, ROLES.MANAGER, ROLES.WAITER, ROLES.KITCHEN, ROLES.CASHIER];

function presentListUser(user, now = new Date()) {
    return {
        ...presentUser(user),
        locked: Boolean(user.locked_until && new Date(user.locked_until) > now),
        created_at: user.created_at
    };
}

async function loadStaffUser(conn, id) {
    const user = await repo.findById(conn, id, { forUpdate: true });
    if (!user) throw notFound('User not found.');
    if (user.role_name === ROLES.CUSTOMER) {
        throw conflict('Customer accounts are managed by the customer and cannot be edited here.');
    }
    return user;
}

async function resolveStaffRole(conn, roleName) {
    if (!STAFF_ROLES.includes(roleName)) {
        throw badRequest('Choose a staff role.', [{ field: 'role', message: 'Choose a staff role.' }]);
    }
    const role = await repo.findRole(conn, roleName);
    if (!role) throw badRequest('Choose a staff role.', [{ field: 'role', message: 'Choose a staff role.' }]);
    return role;
}

// Removing the last active Administrator would lock everyone out of user
// management.
async function assertNotLastAdmin(conn, user) {
    if (user.role_name === ROLES.ADMIN && user.status === 'ACTIVE') {
        const others = await repo.countActiveAdmins(conn, { excludeUserId: user.user_id });
        if (others === 0) throw conflict('At least one active Administrator is required.');
    }
}

const isDuplicate = (error) => error && error.code === 'ER_DUP_ENTRY';

// ---------- Use cases ----------

async function listRoles() {
    return (await repo.listRoles(db)).filter((r) => r.role_name !== ROLES.CUSTOMER);
}

async function listUsers({ type = 'staff', role, status, search }) {
    const users = await repo.listUsers(db, { customers: type === 'customer', role, status, search });
    return users.map((u) => presentListUser(u));
}

async function getUser(id) {
    const user = await repo.findById(db, id);
    if (!user) throw notFound('User not found.');
    return presentListUser(user);
}

// P11 - new staff user with a temporary password, shown once.
async function createStaffUser(admin, input, ip) {
    const temporaryPassword = randomPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

    try {
        const userId = await withTransaction(async (conn) => {
            const role = await resolveStaffRole(conn, input.role);

            if (await repo.emailTaken(conn, input.email)) {
                throw conflict('A user with this username / email already exists.');
            }

            const id = await repo.insertUser(conn, {
                roleId: role.role_id,
                fullName: input.full_name,
                email: input.email,
                phone: input.phone || null,
                passwordHash,
                mustChangePassword: true
            });

            await logAudit(conn, {
                userId: admin.user_id, action: 'USER_SAVED', entity: 'users', recordId: id, ip,
                details: { change: 'created', email: input.email, role: role.role_name }
            });

            return id;
        });

        return { user: await getUser(userId), temporary_password: temporaryPassword };
    } catch (error) {
        if (isDuplicate(error)) throw conflict('A user with this username / email already exists.');
        throw error;
    }
}

async function updateStaffUser(admin, id, input, ip) {
    try {
        await withTransaction(async (conn) => {
            const user = await loadStaffUser(conn, id);
            const role = await resolveStaffRole(conn, input.role);

            if (role.role_name !== user.role_name) {
                if (id === admin.user_id) throw conflict('You cannot change your own role.');
                await assertNotLastAdmin(conn, user);
            }

            if (await repo.emailTaken(conn, input.email, id)) {
                throw conflict('A user with this username / email already exists.');
            }

            await repo.updateUser(conn, id, {
                role_id: role.role_id,
                full_name: input.full_name,
                email: input.email,
                phone: input.phone || null
            });

            const changes = {};
            if (user.full_name !== input.full_name) changes.full_name = { from: user.full_name, to: input.full_name };
            if (user.email !== input.email) changes.email = { from: user.email, to: input.email };
            if ((user.phone || null) !== (input.phone || null)) changes.phone = { from: user.phone, to: input.phone || null };
            if (user.role_name !== role.role_name) changes.role = { from: user.role_name, to: role.role_name };

            await logAudit(conn, {
                userId: admin.user_id, action: 'USER_SAVED', entity: 'users', recordId: id, ip,
                details: { change: 'updated', changes }
            });
        });
    } catch (error) {
        if (isDuplicate(error)) throw conflict('A user with this username / email already exists.');
        throw error;
    }

    return getUser(id);
}

// Deactivate instead of delete so history stays valid (BR-09, 4.5.1).
async function setStatus(admin, id, status, ip) {
    await withTransaction(async (conn) => {
        const user = await loadStaffUser(conn, id);

        if (status === 'INACTIVE') {
            if (id === admin.user_id) throw conflict('You cannot deactivate your own account.');
            await assertNotLastAdmin(conn, user);
        }

        await repo.updateUser(conn, id, { status });

        await logAudit(conn, {
            userId: admin.user_id, action: 'USER_SAVED', entity: 'users', recordId: id, ip,
            details: { change: 'status', from: user.status, to: status }
        });
    });

    return getUser(id);
}

// New temporary password; also clears a lockout (Figure 23, note 3).
async function resetPassword(admin, id, ip) {
    const temporaryPassword = randomPassword(12);
    const passwordHash = await bcrypt.hash(temporaryPassword, BCRYPT_COST);

    await withTransaction(async (conn) => {
        await loadStaffUser(conn, id);

        await repo.updateUser(conn, id, {
            password_hash: passwordHash,
            must_change_pw: 1,
            failed_logins: 0,
            locked_until: null
        });

        await logAudit(conn, {
            userId: admin.user_id, action: 'PASSWORD_RESET', entity: 'users', recordId: id, ip,
            details: {}
        });
    });

    return { user: await getUser(id), temporary_password: temporaryPassword };
}

// GET /audit - filtered audit log for the Administrator (FR-21)
async function listAudit(query, now = new Date()) {
    const to = query.to || localDate(now);
    const from = query.from || addDays(to, -6);

    if (to < from) {
        throw badRequest("'To' cannot be before 'From'.", [{ field: 'to', message: "'To' cannot be before 'From'." }]);
    }
    const days = (new Date(`${to}T00:00:00`) - new Date(`${from}T00:00:00`)) / 86400000;
    if (days > settings.REPORT_MAX_DAYS) {
        throw badRequest(`The date range can be at most ${settings.REPORT_MAX_DAYS} days.`, [
            { field: 'from', message: `The date range can be at most ${settings.REPORT_MAX_DAYS} days.` }
        ]);
    }

    const page = query.page || 1;
    const limit = query.limit || 50;
    const { total, rows } = await repo.listAudit(db, {
        from, to, action: query.action, userId: query.user_id, limit, offset: (page - 1) * limit
    });

    return {
        from,
        to,
        page,
        limit,
        total,
        pages: Math.max(1, Math.ceil(total / limit)),
        entries: rows.map((row) => {
            let details = null;
            try {
                details = row.description ? JSON.parse(row.description) : null;
            } catch {
                details = { text: row.description };
            }
            return {
                log_id: row.log_id,
                user_id: row.user_id,
                user_name: row.user_name,
                action: row.action,
                details,
                ip_address: row.ip_address,
                created_at: row.created_at
            };
        })
    };
}

module.exports = {
    STAFF_ROLES,
    listRoles,
    listUsers,
    getUser,
    createStaffUser,
    updateStaffUser,
    setStatus,
    resetPassword,
    listAudit
};
