// Data access for reservations and restaurant tables.
// Every query is parameterised (SEC-04). `ex` is the pool or a transaction
// connection.

const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'SEATED'];

const SELECT_RESERVATION = `
    SELECT
        r.reservation_id,
        r.reservation_ref,
        r.customer_id,
        r.guest_name,
        r.guest_phone,
        r.table_id,
        t.table_number,
        t.capacity AS table_capacity,
        DATE_FORMAT(r.reservation_date, '%Y-%m-%d') AS reservation_date,
        TIME_FORMAT(r.start_time, '%H:%i') AS start_time,
        TIME_FORMAT(r.end_time, '%H:%i') AS end_time,
        r.party_size,
        r.special_requests,
        r.status,
        r.cancel_reason,
        r.created_by,
        r.created_at,
        r.updated_at,
        COALESCE(u.full_name, r.guest_name) AS customer_name,
        COALESCE(u.phone, r.guest_phone) AS customer_phone
    FROM reservations r
    LEFT JOIN restaurant_tables t ON t.table_id = r.table_id
    LEFT JOIN users u ON u.user_id = r.customer_id`;

async function findByRef(ex, ref, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `${SELECT_RESERVATION} WHERE r.reservation_ref = ?${forUpdate ? ' FOR UPDATE OF r' : ''}`,
        [ref]
    );
    return rows[0] || null;
}

async function findById(ex, id) {
    const [rows] = await ex.query(`${SELECT_RESERVATION} WHERE r.reservation_id = ?`, [id]);
    return rows[0] || null;
}

async function list(ex, { date, fromDate, status, search, customerId, limit = 200 }) {
    const where = [];
    const params = [];

    if (date) {
        where.push('r.reservation_date = ?');
        params.push(date);
    } else if (fromDate) {
        where.push('r.reservation_date >= ?');
        params.push(fromDate);
    }

    if (status) {
        where.push('r.status = ?');
        params.push(status);
    }

    if (customerId) {
        where.push('r.customer_id = ?');
        params.push(customerId);
    }

    if (search) {
        where.push('(r.reservation_ref LIKE ? OR COALESCE(u.full_name, r.guest_name) LIKE ? OR COALESCE(u.phone, r.guest_phone) LIKE ?)');
        const like = `%${search}%`;
        params.push(like, like, like);
    }

    const order = customerId
        ? 'r.reservation_date DESC, r.start_time DESC'
        : 'r.reservation_date ASC, r.start_time ASC';

    const [rows] = await ex.query(
        `${SELECT_RESERVATION}
         ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
         ORDER BY ${order}
         LIMIT ?`,
        [...params, limit]
    );
    return rows;
}

// Active bookings on one date, used to build availability in memory.
async function listActiveForDate(ex, date) {
    const [rows] = await ex.query(
        `SELECT reservation_id, reservation_ref, table_id,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time, '%H:%i') AS end_time
         FROM reservations
         WHERE reservation_date = ? AND status IN (?)`,
        [date, ACTIVE_STATUSES]
    );
    return rows;
}

async function listTables(ex) {
    const [rows] = await ex.query(
        `SELECT table_id, table_number, capacity, status
         FROM restaurant_tables
         ORDER BY CAST(REGEXP_REPLACE(table_number, '[^0-9]', '') AS UNSIGNED), table_number`
    );
    return rows;
}

// Locking the table row serialises bookings for that table, so two staff
// members cannot double-book it at the same moment (BR-04).
async function findTable(ex, tableId, { forUpdate = false } = {}) {
    const [rows] = await ex.query(
        `SELECT table_id, table_number, capacity, status
         FROM restaurant_tables WHERE table_id = ?${forUpdate ? ' FOR UPDATE' : ''}`,
        [tableId]
    );
    return rows[0] || null;
}

// Overlap = same table, same date, start < other end AND end > other start,
// for active statuses (Q9).
async function findClash(ex, { tableId, date, startTime, endTime, excludeId = 0 }) {
    const [rows] = await ex.query(
        `SELECT reservation_ref,
                TIME_FORMAT(start_time, '%H:%i') AS start_time,
                TIME_FORMAT(end_time, '%H:%i') AS end_time
         FROM reservations
         WHERE table_id = ?
           AND reservation_date = ?
           AND status IN (?)
           AND start_time < ?
           AND end_time > ?
           AND reservation_id <> ?
         ORDER BY start_time
         LIMIT 1
         FOR UPDATE`,
        [tableId, date, ACTIVE_STATUSES, endTime, startTime, excludeId]
    );
    return rows[0] || null;
}

// In-service tables big enough for the party and free for the whole slot,
// smallest suitable table first.
async function findFreeTables(ex, { date, startTime, endTime, partySize, excludeId = 0 }) {
    const [rows] = await ex.query(
        `SELECT t.table_id, t.table_number, t.capacity
         FROM restaurant_tables t
         WHERE t.status = 'IN_SERVICE'
           AND t.capacity >= ?
           AND NOT EXISTS (
               SELECT 1 FROM reservations r
               WHERE r.table_id = t.table_id
                 AND r.reservation_date = ?
                 AND r.status IN (?)
                 AND r.start_time < ?
                 AND r.end_time > ?
                 AND r.reservation_id <> ?
           )
         ORDER BY t.capacity, t.table_number`,
        [partySize, date, ACTIVE_STATUSES, endTime, startTime, excludeId]
    );
    return rows;
}

async function findCustomerUser(ex, userId) {
    const [rows] = await ex.query(
        `SELECT u.user_id, u.full_name, u.phone
         FROM users u
         INNER JOIN roles ro ON ro.role_id = u.role_id
         WHERE u.user_id = ? AND ro.role_name = 'Customer' AND u.status = 'ACTIVE'`,
        [userId]
    );
    return rows[0] || null;
}

async function insert(ex, data) {
    // A temporary unique reference is replaced by RS-#### once the id is known.
    const tempRef = `TMP${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`.slice(0, 12);

    const [result] = await ex.query(
        `INSERT INTO reservations
            (reservation_ref, customer_id, guest_name, guest_phone, table_id,
             reservation_date, start_time, end_time, party_size, special_requests,
             status, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
            tempRef,
            data.customer_id ?? null,
            data.guest_name ?? null,
            data.guest_phone ?? null,
            data.table_id ?? null,
            data.reservation_date,
            data.start_time,
            data.end_time,
            data.party_size,
            data.special_requests ?? null,
            data.status,
            data.created_by
        ]
    );

    return result.insertId;
}

async function setRef(ex, id, ref) {
    await ex.query('UPDATE reservations SET reservation_ref = ? WHERE reservation_id = ?', [ref, id]);
}

const UPDATABLE = [
    'table_id', 'reservation_date', 'start_time', 'end_time', 'party_size',
    'special_requests', 'guest_name', 'guest_phone', 'status', 'cancel_reason'
];

async function update(ex, id, fields) {
    const columns = Object.keys(fields).filter((key) => UPDATABLE.includes(key));
    if (columns.length === 0) return;

    await ex.query(
        `UPDATE reservations SET ${columns.map((c) => `${c} = ?`).join(', ')} WHERE reservation_id = ?`,
        [...columns.map((c) => fields[c]), id]
    );
}

module.exports = {
    ACTIVE_STATUSES,
    findByRef,
    findById,
    list,
    listActiveForDate,
    listTables,
    findTable,
    findClash,
    findFreeTables,
    findCustomerUser,
    insert,
    setRef,
    update
};
