// ReservationService - business rules for module 4.0 (FR-12 to FR-14).
// Implements System Design P6 (create with conflict check), the reservation
// state model (Figure 8) and the time-slot rule (Q9).

const { db } = require('../config/db');
const settings = require('../config/settings');
const repo = require('../repositories/reservationRepository');
const { withTransaction } = require('../repositories/transaction');
const { logAudit } = require('./auditService');
const { ROLES } = require('../utils/roles');
const { badRequest, forbidden, notFound, conflict } = require('../utils/errors');
const {
    formatRef, localDate, addDays, timeToMinutes, minutesToTime
} = require('../utils/format');

const STATUS_LABELS = {
    PENDING: 'Pending',
    CONFIRMED: 'Confirmed',
    SEATED: 'Seated',
    COMPLETED: 'Completed',
    CANCELLED: 'Cancelled',
    NO_SHOW: 'No-show'
};

// Allowed manual status changes (Figure 8). Pending -> Confirmed happens only
// by allocating a table, so it is not listed here.
const TRANSITIONS = {
    PENDING: ['CANCELLED'],
    CONFIRMED: ['SEATED', 'NO_SHOW', 'CANCELLED'],
    SEATED: ['COMPLETED']
};

const EDITABLE_STATUSES = ['PENDING', 'CONFIRMED'];

// ---------- Pure rules (unit tested) ----------

// 17:00, 17:30 ... 21:00
function generateSlots({
    first = settings.RES_FIRST_SLOT,
    last = settings.RES_LAST_SLOT,
    step = settings.RES_SLOT_MIN
} = {}) {
    const slots = [];
    for (let m = timeToMinutes(first); m <= timeToMinutes(last); m += step) {
        slots.push(minutesToTime(m));
    }
    return slots;
}

const endTimeFor = (startTime, duration = settings.RES_DURATION_MIN) =>
    minutesToTime(timeToMinutes(startTime) + duration);

const minutesNow = (now) => now.getHours() * 60 + now.getMinutes();

// Date today..today+30, start on a 30-minute step between 17:00 and 21:00,
// and the booking must be in the future.
function validateSlot({ reservation_date: date, start_time: startTime }, now = new Date()) {
    const fields = [];
    const today = localDate(now);
    const lastDate = addDays(today, settings.RES_DAYS_AHEAD);

    if (date < today || date > lastDate) {
        fields.push({
            field: 'reservation_date',
            message: `Choose a date from today up to ${settings.RES_DAYS_AHEAD} days ahead.`
        });
    }

    if (!generateSlots().includes(startTime)) {
        fields.push({
            field: 'start_time',
            message: `Bookings start between ${settings.RES_FIRST_SLOT} and ${settings.RES_LAST_SLOT} in ${settings.RES_SLOT_MIN}-minute steps.`
        });
    } else if (date === today && timeToMinutes(startTime) <= minutesNow(now)) {
        fields.push({ field: 'start_time', message: 'Choose a time later than now.' });
    }

    if (fields.length > 0) {
        throw badRequest(fields[0].message, fields);
    }
}

function assertTransition(from, to, reservation, now = new Date()) {
    const allowed = TRANSITIONS[from] || [];

    if (!allowed.includes(to)) {
        throw conflict(`A ${STATUS_LABELS[from]} booking cannot be changed to ${STATUS_LABELS[to]}.`);
    }

    if (to === 'NO_SHOW') {
        const start = new Date(`${reservation.reservation_date}T${reservation.start_time}:00`);
        const earliest = start.getTime() + settings.RES_NO_SHOW_GRACE_MIN * 60 * 1000;

        if (now.getTime() < earliest) {
            throw conflict(`A booking can be marked No-show ${settings.RES_NO_SHOW_GRACE_MIN} minutes after its start time.`);
        }
    }
}

// Tables (already filtered by capacity and service) that are free for a slot,
// given the day's active bookings. Mirrors repo.findFreeTables in memory.
function freeTablesForSlot(tables, bookings, startTime, endTime, excludeId = 0) {
    return tables.filter((table) => !bookings.some((b) =>
        b.table_id === table.table_id &&
        b.reservation_id !== excludeId &&
        b.start_time < endTime &&
        b.end_time > startTime
    ));
}

// ---------- Helpers ----------

const isCustomer = (user) => user.role === ROLES.CUSTOMER;

async function suggestAlternatives(ex, { date, startTime, partySize, tableId = null, excludeId = 0 }, now) {
    const endTime = endTimeFor(startTime);
    const today = localDate(now);
    const slots = generateSlots();

    const freeTables = (await repo.findFreeTables(ex, { date, startTime, endTime, partySize, excludeId }))
        .slice(0, 3)
        .map((t) => ({ table_id: t.table_id, table_number: t.table_number, start_time: startTime }));

    const times = [];
    for (const offset of [-30, 30, -60, 60]) {
        const candidate = minutesToTime(timeToMinutes(startTime) + offset);

        if (!slots.includes(candidate)) continue;
        if (date === today && timeToMinutes(candidate) <= minutesNow(now)) continue;

        const candidateEnd = endTimeFor(candidate);

        if (tableId) {
            const clash = await repo.findClash(ex, { tableId, date, startTime: candidate, endTime: candidateEnd, excludeId });
            if (!clash) {
                const table = await repo.findTable(ex, tableId);
                times.push({ table_id: tableId, table_number: table.table_number, start_time: candidate });
            }
        } else {
            const free = await repo.findFreeTables(ex, { date, startTime: candidate, endTime: candidateEnd, partySize, excludeId });
            if (free.length > 0) times.push({ start_time: candidate });
        }

        if (times.length >= 2) break;
    }

    return [...freeTables, ...times];
}

// Capacity, service status and overlap checks for a specific table (BR-04).
// Locks the table row so concurrent bookings for it are serialised.
async function assertTableBookable(conn, { tableId, date, startTime, endTime, partySize, excludeId = 0 }, now) {
    const table = await repo.findTable(conn, tableId, { forUpdate: true });

    if (!table) {
        throw badRequest('Select a valid table.', [{ field: 'table_id', message: 'Select a valid table.' }]);
    }

    if (table.status === 'OUT_OF_SERVICE') {
        throw conflict(`Table ${table.table_number} is out of service.`);
    }

    if (partySize > table.capacity) {
        throw conflict(`Party of ${partySize} exceeds table capacity (${table.capacity}).`);
    }

    const clash = await repo.findClash(conn, { tableId, date, startTime, endTime, excludeId });

    if (clash) {
        const alternatives = await suggestAlternatives(conn, { date, startTime, partySize, tableId, excludeId }, now);
        throw conflict(
            `Table ${table.table_number} is already booked ${clash.start_time}–${clash.end_time} (${clash.reservation_ref}).`,
            { alternatives }
        );
    }

    return table;
}

async function assertSomeTableFree(conn, { date, startTime, endTime, partySize, excludeId = 0 }, now) {
    const free = await repo.findFreeTables(conn, { date, startTime, endTime, partySize, excludeId });

    if (free.length === 0) {
        const alternatives = await suggestAlternatives(conn, { date, startTime, partySize, excludeId }, now);
        throw conflict('No table available at that time.', { alternatives });
    }
}

// ---------- Use cases ----------

async function listReservations(user, query, now = new Date()) {
    const filters = {
        date: query.date,
        status: query.status,
        search: query.search
    };

    if (isCustomer(user)) {
        filters.customerId = user.user_id;
    } else if (!query.date) {
        filters.fromDate = localDate(now);
    }

    const reservations = await repo.list(db, filters);

    const count = (status) => reservations.filter((r) => r.status === status).length;

    return {
        reservations,
        summary: {
            total: reservations.length,
            pending: count('PENDING'),
            confirmed: count('CONFIRMED'),
            seated: count('SEATED')
        }
    };
}

async function getReservation(user, ref) {
    const reservation = await repo.findByRef(db, ref);

    if (!reservation) throw notFound('Reservation not found.');

    if (isCustomer(user) && reservation.customer_id !== user.user_id) {
        throw forbidden();
    }

    return reservation;
}

// GET /reservations/availability - free 30-minute slots for a date and party.
async function getAvailability({ date, party_size: partySize }, now = new Date()) {
    const today = localDate(now);

    if (date < today || date > addDays(today, settings.RES_DAYS_AHEAD)) {
        throw badRequest(
            `Choose a date from today up to ${settings.RES_DAYS_AHEAD} days ahead.`,
            [{ field: 'date', message: `Choose a date from today up to ${settings.RES_DAYS_AHEAD} days ahead.` }]
        );
    }

    const tables = (await repo.listTables(db))
        .filter((t) => t.status === 'IN_SERVICE' && t.capacity >= partySize);
    const bookings = await repo.listActiveForDate(db, date);

    const slots = generateSlots().map((startTime) => {
        const inPast = date === today && timeToMinutes(startTime) <= minutesNow(now);
        const free = inPast ? [] : freeTablesForSlot(tables, bookings, startTime, endTimeFor(startTime));
        return { start_time: startTime, available: free.length > 0 };
    });

    return { date, party_size: partySize, slots };
}

// GET /reservations/tables - table plan for a slot (Figure 19, note 2).
async function getTablePlan({ date, start_time: startTime }) {
    const tables = await repo.listTables(db);

    if (!date || !startTime) {
        return tables.map((t) => ({ ...t, booked: false, booking_ref: null }));
    }

    const endTime = endTimeFor(startTime);
    const bookings = await repo.listActiveForDate(db, date);

    return tables.map((table) => {
        const clash = bookings.find((b) =>
            b.table_id === table.table_id && b.start_time < endTime && b.end_time > startTime
        );
        return { ...table, booked: Boolean(clash), booking_ref: clash ? clash.reservation_ref : null };
    });
}

// P6 - Create reservation with conflict check (UC-03).
async function createReservation(user, input, now = new Date()) {
    const data = {
        reservation_date: input.reservation_date,
        start_time: input.start_time,
        end_time: endTimeFor(input.start_time),
        party_size: input.party_size,
        special_requests: input.special_requests || null,
        created_by: user.user_id,
        table_id: null,
        customer_id: null,
        guest_name: null,
        guest_phone: null
    };

    if (isCustomer(user)) {
        // Customers request a booking for themselves; staff allocate the table.
        data.customer_id = user.user_id;
    } else {
        if (input.customer_id) {
            const customer = await repo.findCustomerUser(db, input.customer_id);
            if (!customer) {
                throw badRequest('Select a registered customer.', [{ field: 'customer_id', message: 'Select a registered customer.' }]);
            }
            data.customer_id = customer.user_id;
        } else {
            const fields = [];
            if (!input.guest_name) fields.push({ field: 'guest_name', message: 'Enter the guest name.' });
            if (!input.guest_phone) fields.push({ field: 'guest_phone', message: 'Enter the guest contact number.' });
            if (fields.length) throw badRequest(fields[0].message, fields);

            data.guest_name = input.guest_name;
            data.guest_phone = input.guest_phone;
        }

        data.table_id = input.table_id ?? null;
    }

    validateSlot(data, now);

    const reservationId = await withTransaction(async (conn) => {
        const slot = {
            date: data.reservation_date,
            startTime: data.start_time,
            endTime: data.end_time,
            partySize: data.party_size
        };

        if (data.table_id) {
            await assertTableBookable(conn, { ...slot, tableId: data.table_id }, now);
            data.status = 'CONFIRMED';
        } else {
            await assertSomeTableFree(conn, slot, now);
            data.status = 'PENDING';
        }

        const id = await repo.insert(conn, data);
        const ref = formatRef('RS', id, 4);
        await repo.setRef(conn, id, ref);

        await logAudit(conn, {
            userId: user.user_id,
            action: 'RESERVATION_CREATED',
            entity: 'reservations',
            recordId: id,
            details: {
                ref,
                date: data.reservation_date,
                start_time: data.start_time,
                party_size: data.party_size,
                table_id: data.table_id,
                status: data.status
            }
        });

        return id;
    });

    return repo.findById(db, reservationId);
}

// PATCH /reservations/:ref - allocate a table or change booking details.
async function updateReservation(user, ref, changes, now = new Date()) {
    await withTransaction(async (conn) => {
        const current = await repo.findByRef(conn, ref, { forUpdate: true });

        if (!current) throw notFound('Reservation not found.');

        if (!EDITABLE_STATUSES.includes(current.status)) {
            throw conflict(`A ${STATUS_LABELS[current.status]} booking can no longer be changed.`);
        }

        const next = {
            reservation_date: changes.reservation_date ?? current.reservation_date,
            start_time: changes.start_time ?? current.start_time,
            party_size: changes.party_size ?? current.party_size,
            table_id: changes.table_id !== undefined ? changes.table_id : current.table_id
        };
        next.end_time = endTimeFor(next.start_time);

        const slotChanged =
            next.reservation_date !== current.reservation_date ||
            next.start_time !== current.start_time;

        if (slotChanged) validateSlot(next, now);

        const slot = {
            date: next.reservation_date,
            startTime: next.start_time,
            endTime: next.end_time,
            partySize: next.party_size,
            excludeId: current.reservation_id
        };

        if (next.table_id) {
            await assertTableBookable(conn, { ...slot, tableId: next.table_id }, now);
            next.status = 'CONFIRMED';
        } else {
            await assertSomeTableFree(conn, slot, now);
            next.status = 'PENDING';
        }

        const update = { ...next };

        if (changes.special_requests !== undefined) {
            update.special_requests = changes.special_requests || null;
        }

        // Guest details can only be edited on guest bookings.
        if (!current.customer_id) {
            if (changes.guest_name !== undefined) update.guest_name = changes.guest_name;
            if (changes.guest_phone !== undefined) update.guest_phone = changes.guest_phone;
        }

        await repo.update(conn, current.reservation_id, update);

        await logAudit(conn, {
            userId: user.user_id,
            action: 'RESERVATION_UPDATED',
            entity: 'reservations',
            recordId: current.reservation_id,
            details: {
                ref,
                from: {
                    date: current.reservation_date,
                    start_time: current.start_time,
                    party_size: current.party_size,
                    table_id: current.table_id,
                    status: current.status
                },
                to: {
                    date: next.reservation_date,
                    start_time: next.start_time,
                    party_size: next.party_size,
                    table_id: next.table_id,
                    status: next.status
                }
            }
        });
    });

    return repo.findByRef(db, ref);
}

// PATCH /reservations/:ref/status - Seated, Completed, Cancelled, No-show.
async function changeStatus(user, ref, { status, reason }, now = new Date()) {
    await withTransaction(async (conn) => {
        const current = await repo.findByRef(conn, ref, { forUpdate: true });

        if (!current) throw notFound('Reservation not found.');

        assertTransition(current.status, status, current, now);

        const update = { status };
        if (status === 'CANCELLED') update.cancel_reason = reason || null;

        await repo.update(conn, current.reservation_id, update);

        await logAudit(conn, {
            userId: user.user_id,
            action: 'RESERVATION_STATUS',
            entity: 'reservations',
            recordId: current.reservation_id,
            details: { ref, from: current.status, to: status, reason: reason || null }
        });
    });

    return repo.findByRef(db, ref);
}

module.exports = {
    STATUS_LABELS,
    TRANSITIONS,
    generateSlots,
    endTimeFor,
    validateSlot,
    assertTransition,
    freeTablesForSlot,
    listReservations,
    getReservation,
    getAvailability,
    getTablePlan,
    createReservation,
    updateReservation,
    changeStatus
};
