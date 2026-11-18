
import { useCallback, useEffect, useMemo, useState } from 'react';
import { reservationsApi } from '../api/modules';
import { getUser } from '../auth/session';
import { hasRole, ROLES } from '../auth/permissions';
import { addDaysISO, formatDate, todayISO } from '../utils/format';
import useToast from '../utils/useToast';
import './ReservationsManagement.css';

// Module 4.0 Reservations (FR-12 to FR-14) - System Design wireframe 10A.

const STATUS_LABELS = {
  PENDING: 'Pending',
  CONFIRMED: 'Confirmed',
  SEATED: 'Seated',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

// Status actions follow the reservation state model (Figure 8)
const STATUS_ACTIONS = {
  PENDING: [{ status: 'CANCELLED', label: 'Cancel', danger: true }],
  CONFIRMED: [
    { status: 'SEATED', label: 'Seat' },
    { status: 'NO_SHOW', label: 'No-show' },
    { status: 'CANCELLED', label: 'Cancel', danger: true },
  ],
  SEATED: [{ status: 'COMPLETED', label: 'Complete' }],
};

const EDITABLE = ['PENDING', 'CONFIRMED'];

// 17:00 to 21:00 in 30-minute steps (Q9) - the API applies the same rule
const SLOTS = ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'];

const statusClass = (status) => status.toLowerCase().replace('_', '-');

const emptyForm = () => ({
  mode: 'create',
  ref: null,
  isGuest: true,
  guest_name: '',
  guest_phone: '',
  reservation_date: todayISO(),
  start_time: '19:00',
  party_size: '2',
  table_id: null,
  special_requests: '',
});

function ReservationsManagement() {
  const user = getUser();
  const canEdit = hasRole(user, [ROLES.WAITER, ROLES.MANAGER]);

  const [date, setDate] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const [data, setData] = useState({ reservations: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, showToast] = useToast();

  const [form, setForm] = useState(null);
  const [formErrors, setFormErrors] = useState({});
  const [formConflict, setFormConflict] = useState(null);
  const [saving, setSaving] = useState(false);
  const [tablePlan, setTablePlan] = useState([]);

  const [selected, setSelected] = useState(null);
  const [busyRef, setBusyRef] = useState(null);

  const loadReservations = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await reservationsApi.list({ date, status: statusFilter || undefined });
      setData(response.data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [date, statusFilter]);

  useEffect(() => {
    loadReservations();
  }, [loadReservations]);

  // Table plan for the slot being booked (Figure 19, note 2)
  useEffect(() => {
    if (!form || !form.reservation_date || !form.start_time) return undefined;

    let cancelled = false;
    reservationsApi.tables(form.reservation_date, form.start_time)
      .then((response) => { if (!cancelled) setTablePlan(response.data); })
      .catch(() => { if (!cancelled) setTablePlan([]); });

    return () => { cancelled = true; };
  }, [form?.reservation_date, form?.start_time]); // eslint-disable-line react-hooks/exhaustive-deps

  const visibleReservations = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return data.reservations;
    return data.reservations.filter((r) =>
      r.reservation_ref.toLowerCase().includes(needle) ||
      (r.customer_name || '').toLowerCase().includes(needle) ||
      (r.customer_phone || '').includes(needle)
    );
  }, [data.reservations, search]);

  function openCreate() {
    setForm({ ...emptyForm(), reservation_date: date >= todayISO() ? date : todayISO() });
    setFormErrors({});
    setFormConflict(null);
    setSelected(null);
  }

  function openEdit(reservation) {
    setForm({
      mode: 'edit',
      ref: reservation.reservation_ref,
      isGuest: !reservation.customer_id,
      guest_name: reservation.guest_name || reservation.customer_name || '',
      guest_phone: reservation.guest_phone || reservation.customer_phone || '',
      reservation_date: reservation.reservation_date,
      start_time: reservation.start_time,
      party_size: String(reservation.party_size),
      table_id: reservation.table_id,
      special_requests: reservation.special_requests || '',
    });
    setFormErrors({});
    setFormConflict(null);
    setSelected(null);
  }

  function closeForm() {
    setForm(null);
    setFormErrors({});
    setFormConflict(null);
  }

  const updateForm = (changes) => {
    setForm((current) => ({ ...current, ...changes }));
    setFormConflict(null);
    setFormErrors((current) => {
      const next = { ...current };
      Object.keys(changes).forEach((key) => delete next[key]);
      return next;
    });
  };

  function applyAlternative(alternative) {
    updateForm({
      start_time: alternative.start_time,
      ...(alternative.table_id ? { table_id: alternative.table_id } : {}),
    });
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const partySize = Number(form.party_size);
    const errors = {};
    if (!Number.isInteger(partySize) || partySize < 1 || partySize > 20) {
      errors.party_size = 'Party size must be between 1 and 20.';
    }
    if (form.isGuest && form.guest_name.trim().length < 2) errors.guest_name = 'Enter the guest name.';
    if (form.isGuest && !form.guest_phone.trim()) errors.guest_phone = 'Enter the guest contact number.';

    if (Object.keys(errors).length) {
      setFormErrors(errors);
      return;
    }

    const body = {
      reservation_date: form.reservation_date,
      start_time: form.start_time,
      party_size: partySize,
      table_id: form.table_id || null,
      special_requests: form.special_requests.trim() || null,
    };

    if (form.isGuest) {
      body.guest_name = form.guest_name.trim();
      body.guest_phone = form.guest_phone.trim();
    }

    setSaving(true);
    try {
      const response = form.mode === 'create'
        ? await reservationsApi.create(body)
        : await reservationsApi.update(form.ref, body);

      showToast('success', form.mode === 'create'
        ? `${response.message} (${STATUS_LABELS[response.data.status]})`
        : response.message);

      closeForm();
      if (response.data.reservation_date !== date) setDate(response.data.reservation_date);
      else loadReservations();
    } catch (error) {
      if (error.status === 409) {
        setFormConflict({ message: error.message, alternatives: error.details?.alternatives || [] });
      } else if (error.fields?.length) {
        setFormErrors(error.fieldErrors());
      } else {
        setFormConflict({ message: error.message, alternatives: [] });
      }
    } finally {
      setSaving(false);
    }
  }

  async function changeStatus(reservation, status) {
    let reason;

    if (status === 'CANCELLED') {
      reason = window.prompt(`Cancel ${reservation.reservation_ref} for ${reservation.customer_name}?\nReason (optional):`, '');
      if (reason === null) return;
    } else if (status === 'NO_SHOW' && !window.confirm(`Mark ${reservation.reservation_ref} as a no-show?`)) {
      return;
    }

    setBusyRef(reservation.reservation_ref);
    try {
      const response = await reservationsApi.changeStatus(reservation.reservation_ref, status, reason || undefined);
      showToast('success', `${reservation.reservation_ref}: ${response.message}`);
      if (selected?.reservation_ref === reservation.reservation_ref) setSelected(response.data);
      loadReservations();
    } catch (error) {
      showToast('error', error.message);
    } finally {
      setBusyRef(null);
    }
  }

  const summary = data.summary || { total: 0, pending: 0, confirmed: 0, seated: 0 };
  const today = todayISO();

  return (
    <div className="reservations-page">
      <div className="reservations-heading">
        <div>
          <h2>Reservations Overview</h2>
          <p>Bookings for the selected day, with table allocation and conflict checks.</p>
        </div>

        {canEdit && (
          <button type="button" className="reservations-primary-btn" onClick={openCreate}>
            + New booking
          </button>
        )}
      </div>

      {toast && (
        <div className={`reservations-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success' ? '✓ ' : '⚠ '}{toast.text}
        </div>
      )}

      <section className="reservations-summary">
        <div className="reservations-summary-card">
          <span>Bookings</span>
          <strong>{summary.total}</strong>
          <small>{formatDate(date)}</small>
        </div>

        <div className="reservations-summary-card">
          <span>Pending</span>
          <strong>{summary.pending}</strong>
          <small>Awaiting a table</small>
        </div>

        <div className="reservations-summary-card">
          <span>Confirmed</span>
          <strong>{summary.confirmed}</strong>
          <small>Table allocated</small>
        </div>

        <div className="reservations-summary-card">
          <span>Currently Seated</span>
          <strong>{summary.seated}</strong>
          <small>Guests at tables</small>
        </div>
      </section>

      {form && (
        <form className="reservations-form" onSubmit={handleSubmit} noValidate>
          <h3>{form.mode === 'create' ? 'New booking' : `Edit booking ${form.ref}`}</h3>

          <div className="reservations-form-grid">
            {form.isGuest && (
              <>
                <div>
                  <label htmlFor="guestName">Guest name *</label>
                  <input
                    id="guestName"
                    value={form.guest_name}
                    onChange={(e) => updateForm({ guest_name: e.target.value })}
                    placeholder="e.g. Thabo Nkosi"
                    aria-invalid={Boolean(formErrors.guest_name)}
                  />
                  {formErrors.guest_name && <p className="reservations-field-error">{formErrors.guest_name}</p>}
                </div>

                <div>
                  <label htmlFor="guestPhone">Contact number *</label>
                  <input
                    id="guestPhone"
                    type="tel"
                    inputMode="tel"
                    value={form.guest_phone}
                    onChange={(e) => updateForm({ guest_phone: e.target.value })}
                    placeholder="e.g. 082 123 4567"
                    aria-invalid={Boolean(formErrors.guest_phone)}
                  />
                  <small className="reservations-help">10 digits, or +27 format</small>
                  {formErrors.guest_phone && <p className="reservations-field-error">{formErrors.guest_phone}</p>}
                </div>
              </>
            )}

            {!form.isGuest && (
              <div className="reservations-full-width">
                <p className="reservations-help">
                  Booking for registered customer <strong>{form.guest_name}</strong> ({form.guest_phone})
                </p>
              </div>
            )}

            <div>
              <label htmlFor="reservationDate">Date *</label>
              <input
                id="reservationDate"
                type="date"
                value={form.reservation_date}
                min={today}
                max={addDaysISO(today, 30)}
                onChange={(e) => updateForm({ reservation_date: e.target.value })}
                aria-invalid={Boolean(formErrors.reservation_date)}
              />
              {formErrors.reservation_date && <p className="reservations-field-error">{formErrors.reservation_date}</p>}
            </div>

            <div>
              <label htmlFor="reservationTime">Start time *</label>
              <select
                id="reservationTime"
                value={form.start_time}
                onChange={(e) => updateForm({ start_time: e.target.value })}
                aria-invalid={Boolean(formErrors.start_time)}
              >
                {SLOTS.map((slot) => <option key={slot} value={slot}>{slot}</option>)}
              </select>
              <small className="reservations-help">Sittings last 2 hours</small>
              {formErrors.start_time && <p className="reservations-field-error">{formErrors.start_time}</p>}
            </div>

            <div>
              <label htmlFor="partySize">Party size *</label>
              <input
                id="partySize"
                type="number"
                inputMode="numeric"
                min="1"
                max="20"
                value={form.party_size}
                onChange={(e) => updateForm({ party_size: e.target.value })}
                aria-invalid={Boolean(formErrors.party_size)}
              />
              <small className="reservations-help">1–20 guests</small>
              {formErrors.party_size && <p className="reservations-field-error">{formErrors.party_size}</p>}
            </div>

            <div className="reservations-full-width">
              <span className="reservations-label">Table</span>
              <div className="reservations-table-plan" role="group" aria-label="Choose a table">
                <button
                  type="button"
                  className={`plan-table none ${!form.table_id ? 'selected' : ''}`}
                  onClick={() => updateForm({ table_id: null })}
                >
                  No table yet
                  <small>stays Pending</small>
                </button>

                {tablePlan.map((table) => {
                  const ownBooking = form.ref && table.booking_ref === form.ref;
                  const booked = table.booked && !ownBooking;
                  const outOfService = table.status === 'OUT_OF_SERVICE';
                  const tooSmall = Number(form.party_size) > table.capacity;
                  const state = outOfService ? 'out' : booked ? 'booked' : tooSmall ? 'small' : 'free';

                  return (
                    <button
                      key={table.table_id}
                      type="button"
                      className={`plan-table ${state} ${form.table_id === table.table_id ? 'selected' : ''}`}
                      onClick={() => updateForm({ table_id: table.table_id })}
                      disabled={outOfService}
                      title={
                        outOfService ? 'Out of service'
                          : booked ? `Booked (${table.booking_ref})`
                            : tooSmall ? `Seats ${table.capacity}` : 'Free'
                      }
                    >
                      {table.table_number}
                      <small>
                        {outOfService ? 'out of service' : booked ? 'booked' : `${table.capacity} seats`}
                      </small>
                    </button>
                  );
                })}
              </div>
              <p className="reservations-help">
                Green = free · amber = booked in this slot · grey = out of service. Choosing a table confirms the booking.
              </p>
            </div>

            <div className="reservations-full-width">
              <label htmlFor="reservationNotes">Special requests</label>
              <textarea
                id="reservationNotes"
                rows="2"
                maxLength={255}
                value={form.special_requests}
                onChange={(e) => updateForm({ special_requests: e.target.value })}
                placeholder="e.g. high chair, birthday (optional, max 255)"
              />
            </div>
          </div>

          {formConflict && (
            <div className="reservations-conflict" role="alert">
              <strong>⚠ {formConflict.message}</strong>
              {formConflict.alternatives.length > 0 && (
                <div className="reservations-alternatives">
                  <span>Available:</span>
                  {formConflict.alternatives.map((alt) => (
                    <button
                      type="button"
                      key={`${alt.table_id || 'any'}-${alt.start_time}`}
                      onClick={() => applyAlternative(alt)}
                    >
                      {alt.table_number ? `${alt.table_number} at ${alt.start_time}` : `${alt.start_time}`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="reservations-form-actions">
            <button type="submit" className="reservations-primary-btn" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>

            <button type="button" className="reservations-cancel-btn" onClick={closeForm} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {selected && (
        <section className="reservations-detail-panel">
          <div className="reservations-detail-heading">
            <div>
              <h3>Reservation {selected.reservation_ref}</h3>
              <p>{selected.customer_name}</p>
            </div>

            <button type="button" className="reservations-cancel-btn" onClick={() => setSelected(null)}>
              Close
            </button>
          </div>

          <div className="reservations-detail-grid">
            <p><strong>Contact:</strong> {selected.customer_phone || '—'}</p>
            <p><strong>Date:</strong> {formatDate(selected.reservation_date)}</p>
            <p><strong>Time:</strong> {selected.start_time}–{selected.end_time}</p>
            <p><strong>Party:</strong> {selected.party_size}</p>
            <p><strong>Table:</strong> {selected.table_number || 'Not allocated'}</p>
            <p><strong>Status:</strong> {STATUS_LABELS[selected.status]}</p>
          </div>

          <p className="reservations-notes">
            <strong>Special requests:</strong> {selected.special_requests || 'None.'}
          </p>
          {selected.cancel_reason && (
            <p className="reservations-notes"><strong>Cancel reason:</strong> {selected.cancel_reason}</p>
          )}
        </section>
      )}

      <section className="reservations-table-panel">
        <div className="reservations-table-heading">
          <div>
            <h3>Bookings for {formatDate(date)}</h3>
            <p>Sorted by start time.</p>
          </div>

          <button type="button" className="reservations-reset-btn" onClick={loadReservations} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="reservations-filters">
          <input
            type="search"
            aria-label="Search reservations"
            placeholder="Search name, phone or RS reference..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            aria-label="Filter by status"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="">All statuses</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>

          <input
            type="date"
            aria-label="Booking date"
            value={date}
            onChange={(event) => setDate(event.target.value || todayISO())}
          />
        </div>

        <div className="table-wrapper">
          <table className="reservations-table">
            <thead>
              <tr>
                <th>Ref</th>
                <th>Guest</th>
                <th>Time</th>
                <th>Party</th>
                <th>Table</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && (
                <tr><td colSpan="7" className="reservations-empty">Loading bookings…</td></tr>
              )}

              {!loading && loadError && (
                <tr>
                  <td colSpan="7" className="reservations-empty">
                    <span role="alert">{loadError}</span>{' '}
                    <button type="button" className="reservations-inline-btn" onClick={loadReservations}>Try again</button>
                  </td>
                </tr>
              )}

              {!loading && !loadError && visibleReservations.map((reservation) => (
                <tr key={reservation.reservation_id}>
                  <td><strong>{reservation.reservation_ref}</strong></td>
                  <td>
                    <strong>{reservation.customer_name}</strong>
                    <small className="reservations-phone">{reservation.customer_phone}</small>
                  </td>
                  <td>{reservation.start_time}–{reservation.end_time}</td>
                  <td>{reservation.party_size}</td>
                  <td>{reservation.table_number || '—'}</td>
                  <td>
                    <span className={`reservations-status ${statusClass(reservation.status)}`}>
                      {STATUS_LABELS[reservation.status]}
                    </span>
                  </td>
                  <td>
                    <div className="reservations-row-actions">
                      <button type="button" onClick={() => setSelected(reservation)}>View</button>

                      {canEdit && EDITABLE.includes(reservation.status) && (
                        <button type="button" onClick={() => openEdit(reservation)}>
                          {reservation.table_id ? 'Edit' : 'Allocate'}
                        </button>
                      )}

                      {canEdit && (STATUS_ACTIONS[reservation.status] || []).map((action) => (
                        <button
                          key={action.status}
                          type="button"
                          className={action.danger ? 'reservations-delete-btn' : ''}
                          disabled={busyRef === reservation.reservation_ref}
                          onClick={() => changeStatus(reservation, action.status)}
                        >
                          {action.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && !loadError && visibleReservations.length === 0 && (
                <tr>
                  <td colSpan="7" className="reservations-empty">
                    No bookings for this day{statusFilter || search ? ' match your filters' : ''}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default ReservationsManagement;
