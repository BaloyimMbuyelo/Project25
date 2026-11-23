// Data access for users and roles (login, P2 user reload, P11 staff users).

const SELECT_USER = `
    SELECT
        u.user_id,
        u.full_name,
        u.email,
        u.phone,
        u.password_hash,
        u.status,
        u.failed_logins,
        u.locked_until,
        u.last_login_at,
        u.must_change_pw,
        u.created_at,
        u.updated_at,
        r.role_id,
        r.role_name
    FROM users u
    INNER JOIN roles r ON r.role_id = u.role_id`;

async function findByEmail(ex, email, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_USER} WHERE u.email = ?${forUpdate ? ' FOR UPDATE OF u' : ''}`,
        [email]
    );
    return rows[0] || null;
}

async function findById(ex, userId, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_USER} WHERE u.user_id = ?${forUpdate ? ' FOR UPDATE OF u' : ''}`,
        [userId]
    );
    return rows[0] || null;
}

async function emailTaken(ex, email, exceptUserId = 0) {
    const [rows] = await ex.query('SELECT 1 FROM users WHERE email = ? AND user_id <> ? LIMIT 1', [email, exceptUserId]);
    return rows.length > 0;
}

async function findRole(ex, roleName) {
    const [rows] = await ex.query('SELECT role_id, role_name FROM roles WHERE role_name = ?', [roleName]);
    return rows[0] || null;
}

async function listRoles(ex) {
    const [rows] = await ex.query('SELECT role_id, role_name FROM roles ORDER BY role_id');
    return rows;
}

async function insertUser(ex, { roleId, fullName, email, passwordHash, phone = null, mustChangePassword = false }) {
    const [result] = await ex.query(
        `INSERT INTO users (role_id, full_name, email, password_hash, phone, must_change_pw)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [roleId, fullName, email, passwordHash, phone, mustChangePassword ? 1 : 0]
    );
    return result.insertId;
}

const UPDATABLE = [
    'role_id', 'full_name', 'email', 'phone', 'password_hash', 'status',
    'failed_logins', 'locked_until', 'last_login_at', 'must_change_pw'
];

async function updateUser(ex, userId, fields) {
    const columns = Object.keys(fields).filter((key) => UPDATABLE.includes(key));
    if (columns.length === 0) return;

    await ex.query(
        `UPDATE users SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE user_id = ?`,
        [...columns.map((c) => fields[c]), userId]
    );
}

async function countActiveAdmins(ex, { excludeUserId = 0 } = {}) {
    const [rows] = await ex.query(
        `SELECT COUNT(*) AS n
         FROM users u INNER JOIN roles r ON r.role_id = u.role_id
         WHERE r.role_name = 'Administrator' AND u.status = 'ACTIVE' AND u.user_id <> ?`,
        [excludeUserId]
    );
    return Number(rows[0].n);
}

async function listUsers(ex, { customers = false, role, status, search }) {
    const where = [customers ? "r.role_name = 'Customer'" : "r.role_name <> 'Customer'"];
    const params = [];

    if (role) {
        where.push('r.role_name = ?');
        params.push(role);
    }
    if (status) {
        where.push('u.status = ?');
        params.push(status);
    }
    if (search) {
        where.push('(u.full_name LIKE ? OR u.email LIKE ?)');
        params.push(`%${search}%`, `%${search}%`);
    }

    const [rows] = await ex.query(
        `${SELECT_USER} WHERE ${where.join(' AND ')} ORDER BY u.full_name LIMIT 500`,
        params
    );
    return rows;
}

async function listAudit(ex, { from, to, action, userId, limit, offset }) {
    const where = ['a.created_at >= ?', 'a.created_at < DATE_ADD(?, INTERVAL 1 DAY)'];
    const params = [from, to];

    if (action) {
        where.push('a.action LIKE ?');
        params.push(`${action}%`);
    }
    if (userId) {
        where.push('a.user_id = ?');
        params.push(userId);
    }

    const [[{ total }]] = await ex.query(
        `SELECT COUNT(*) AS total FROM audit_logs a WHERE ${where.join(' AND ')}`,
        params
    );

    const [rows] = await ex.query(
        `SELECT a.log_id, a.user_id, u.full_name AS user_name, a.action, a.description,
                a.ip_address, a.created_at
         FROM audit_logs a
         LEFT JOIN users u ON u.user_id = a.user_id
         WHERE ${where.join(' AND ')}
         ORDER BY a.created_at DESC, a.log_id DESC
         LIMIT ? OFFSET ?`,
        [...params, limit, offset]
    );

    return { total: Number(total), rows };
}

module.exports = {
    findByEmail,
    findById,
    emailTaken,
    findRole,
    listRoles,
    insertUser,
    updateUser,
    countActiveAdmins,
    listUsers,
    listAudit
};
