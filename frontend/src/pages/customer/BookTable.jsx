import { useCallback, useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { reservationsApi } from '../../api/modules';
import { getUser } from '../../auth/session';
import { ROLES } from '../../auth/permissions';
import { addDaysISO, formatDate, todayISO } from '../../utils/format';
import CustomerAccountBar from '../../components/CustomerAccountBar';
import './Checkout.css';
import './BookTable.css';

// Customer reservations (Analysis 11.1 "reservation capture and conflict
// feedback", 13.1 reservation flow; FR-12 to FR-14). The API checks the date
// window, opening times, party size and table capacity; staff allocate the
// table and confirm the booking.

const STATUS_TEXT = {
  PENDING: 'Requested – we will confirm your table',
  CONFIRMED: 'Confirmed',
  SEATED: 'Seated',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
  NO_SHOW: 'No-show',
};

function BookTable() {
  const user = getUser();
  const today = todayISO();
  const [date, setDate] = useState(() => addDaysISO(todayISO(), 1));
  const [partySize, setPartySize] = useState(2);
  const [slots, setSlots] = useState(null);
  const [time, setTime] = useState('');
  const [requests, setRequests] = useState('');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [booked, setBooked] = useState(null);
  const [mine, setMine] = useState([]);

  const isCustomer = user?.role === ROLES.CUSTOMER;

  const loadMine = useCallback(() => {
    reservationsApi.list().then((r) => setMine(r.data.reservations || [])).catch(() => setMine([]));
  }, []);

  useEffect(() => {
    if (isCustomer) loadMine();
  }, [isCustomer, loadMine]);

  // Availability for the chosen date and party size
  useEffect(() => {
    if (!isCustomer || !date || !(partySize >= 1)) return undefined;
    let cancelled = false;
    reservationsApi.availability(date, partySize)
      .then((r) => { if (!cancelled) { setSlots(r.data.slots); setError(''); } })
      .catch((err) => { if (!cancelled) { setSlots([]); setError(err.message); } });
    return () => { cancelled = true; };
  }, [isCustomer, date, partySize]);

  if (!isCustomer) return <Navigate to="/login?next=/book" replace />;

  async function book(event) {
    event.preventDefault();
    if (!time) {
      setFieldErrors({ start_time: 'Choose a time.' });
      return;
    }
    setSaving(true);
    setError('');
    setFieldErrors({});
    try {
      const r = await reservationsApi.create({
        reservation_date: date,
        start_time: time,
        party_size: Number(partySize),
        special_requests: requests.trim() || undefined,
      });
      setBooked(r.data);
      setTime('');
      setRequests('');
      loadMine();
    } catch (err) {
      if (err.fields?.length) setFieldErrors(err.fieldErrors());
      setError(err.message);
    } finally {
      setSaving(false);
    }
  }

  const upcoming = mine.filter((b) => b.reservation_date >= today);

  return (
    <>
      <CustomerAccountBar />
      <main className="checkout-page">
        <header className="checkout-header">
          <p className="eyebrow">UBUNTU BISTRO</p>
          <h2>Book a table</h2>
          <p>Choose a day, the number of guests and a time. We&apos;ll confirm your table.</p>
        </header>

        <div className="checkout-layout">
          <form className="checkout-panel" onSubmit={book} noValidate>
            <h3>Your booking</h3>

            {booked && (
              <div className="book-done" role="status">
                <strong>Booking {booked.reservation_ref} received</strong> for {booked.party_size} on {formatDate(booked.reservation_date)} at {booked.start_time}.
                {' '}{booked.status === 'CONFIRMED' ? 'Your table is confirmed.' : 'We will confirm your table shortly.'}
              </div>
            )}

            <div className="book-row">
              <div>
                <label htmlFor="book-date" className="checkout-note-label">Date</label>
                <input id="book-date" type="date" value={date} min={today} max={addDaysISO(today, 30)}
                  onChange={(e) => { setDate(e.target.value); setTime(''); setBooked(null); }}
                  aria-invalid={Boolean(fieldErrors.reservation_date)} />
                {fieldErrors.reservation_date && <p className="checkout-field-error">{fieldErrors.reservation_date}</p>}
              </div>
              <div>
                <label htmlFor="book-party" className="checkout-note-label">Guests</label>
                <input id="book-party" type="number" min="1" max="20" value={partySize}
                  onChange={(e) => { setPartySize(e.target.value); setTime(''); setBooked(null); }}
                  aria-invalid={Boolean(fieldErrors.party_size)} />
                {fieldErrors.party_size && <p className="checkout-field-error">{fieldErrors.party_size}</p>}
              </div>
            </div>

            <span className="checkout-note-label" id="slots-label">Time</span>
            {slots === null ? (
              <p className="checkout-small">Checking availability…</p>
            ) : slots.length === 0 ? (
              <p className="checkout-small">No times available for this choice.</p>
            ) : (
              <div className="book-slots" role="radiogroup" aria-labelledby="slots-label">
                {slots.map((s) => (
                  <button key={s.start_time} type="button" role="radio" aria-checked={time === s.start_time}
                    className={time === s.start_time ? 'selected' : ''} disabled={!s.available}
                    title={s.available ? '' : 'Fully booked'} onClick={() => setTime(s.start_time)}>
                    {s.start_time}
                  </button>
                ))}
              </div>
            )}
            {fieldErrors.start_time && <p className="checkout-field-error">{fieldErrors.start_time}</p>}

            <label htmlFor="book-requests" className="checkout-note-label">Special requests (optional)</label>
            <textarea id="book-requests" rows={2} maxLength={255} value={requests}
              onChange={(e) => setRequests(e.target.value)} placeholder="e.g. Birthday, window seat" />

            {error && <div className="checkout-error" role="alert">⚠ {error}</div>}

            <button type="submit" className="checkout-primary" disabled={saving}>
              {saving ? 'Booking…' : time ? `Book for ${partySize} at ${time}` : 'Book table'}
            </button>
          </form>

          <section className="checkout-panel" aria-labelledby="mine-heading">
            <h3 id="mine-heading">Your upcoming bookings</h3>
            {upcoming.length === 0 ? (
              <p className="checkout-small">You have no upcoming bookings.</p>
            ) : (
              <ul className="checkout-lines">
                {upcoming.map((b) => (
                  <li key={b.reservation_ref}>
                    <div className="checkout-line-top">
                      <strong>{formatDate(b.reservation_date)} · {b.start_time}</strong>
                      <span>{b.party_size} guest{b.party_size === 1 ? '' : 's'}</span>
                    </div>
                    <span className="checkout-small">
                      {b.reservation_ref} · {STATUS_TEXT[b.status] || b.status}{b.table_number ? ` · Table ${b.table_number}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="checkout-small">To change or cancel a booking, call us on 021 000 0000.</p>
          </section>
        </div>
      </main>
    </>
  );
}

export default BookTable;
