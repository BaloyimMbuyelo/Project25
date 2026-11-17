
import { useEffect, useMemo, useState } from 'react';
import './ReservationsManagement.css';

const STORAGE_KEY = 'ubms_reservations_v1';

const sampleReservations = [
  {
    id: 'RES001',
    customer: 'Thabo Mokoena',
    phone: '071 234 5678',
    date: '2026-11-17',
    time: '12:00',
    guests: 4,
    tableNumber: 'T01',
    status: 'Confirmed',
    notes: 'Window seating preferred',
  },
  {
    id: 'RES002',
    customer: 'Lerato Nkosi',
    phone: '082 345 6789',
    date: '2026-11-17',
    time: '13:30',
    guests: 2,
    tableNumber: 'T02',
    status: 'Pending',
    notes: '',
  },
  {
    id: 'RES003',
    customer: 'Sipho Dlamini',
    phone: '083 456 7890',
    date: '2026-11-18',
    time: '18:00',
    guests: 6,
    tableNumber: 'T05',
    status: 'Confirmed',
    notes: 'Birthday dinner',
  },
  {
    id: 'RES004',
    customer: 'Naledi Molefe',
    phone: '072 567 8901',
    date: '2026-11-18',
    time: '19:00',
    guests: 3,
    tableNumber: 'T03',
    status: 'Seated',
    notes: '',
  },
];

const emptyForm = {
  customer: '',
  phone: '',
  date: '',
  time: '',
  guests: '2',
  tableNumber: '',
  notes: '',
};

function getInitialReservations() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : sampleReservations;
  } catch {
    return sampleReservations;
  }
}

function ReservationsManagement() {
  const [reservations, setReservations] = useState(getInitialReservations);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [selectedReservation, setSelectedReservation] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const statuses = [
    'Pending',
    'Confirmed',
    'Seated',
    'Completed',
    'Cancelled',
  ];

  const tables = ['T01', 'T02', 'T03', 'T04', 'T05', 'T06', 'T07', 'T08'];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(reservations));
  }, [reservations]);

  const summary = useMemo(() => ({
    total: reservations.length,
    pending: reservations.filter((r) => r.status === 'Pending').length,
    confirmed: reservations.filter((r) => r.status === 'Confirmed').length,
    seated: reservations.filter((r) => r.status === 'Seated').length,
  }), [reservations]);

  const filteredReservations = reservations
    .filter((reservation) => {
      const matchesSearch =
        reservation.customer.toLowerCase().includes(search.toLowerCase()) ||
        reservation.id.toLowerCase().includes(search.toLowerCase()) ||
        reservation.phone.includes(search);

      const matchesStatus =
        statusFilter === 'All' || reservation.status === statusFilter;

      const matchesDate =
        !dateFilter || reservation.date === dateFilter;

      return matchesSearch && matchesStatus && matchesDate;
    })
    .sort((a, b) =>
      `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`)
    );

  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
    setSelectedReservation(null);
  }

  function openEditForm(reservation) {
    setEditingId(reservation.id);
    setForm({
      customer: reservation.customer,
      phone: reservation.phone,
      date: reservation.date,
      time: reservation.time,
      guests: String(reservation.guests),
      tableNumber: reservation.tableNumber,
      notes: reservation.notes || '',
    });
    setShowForm(true);
    setSelectedReservation(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const guests = Number(form.guests);

    if (!form.customer.trim() || !form.phone.trim()) {
      alert('Please enter the customer name and contact number.');
      return;
    }

    if (!Number.isInteger(guests) || guests < 1) {
      alert('Please enter a valid number of guests.');
      return;
    }

    const reservationData = {
      customer: form.customer.trim(),
      phone: form.phone.trim(),
      date: form.date,
      time: form.time,
      guests,
      tableNumber: form.tableNumber,
      notes: form.notes.trim(),
    };

    const tableConflict = reservations.some((reservation) =>
      reservation.id !== editingId &&
      reservation.date === reservationData.date &&
      reservation.time === reservationData.time &&
      reservation.tableNumber === reservationData.tableNumber &&
      !['Cancelled', 'Completed'].includes(reservation.status)
    );

    if (tableConflict) {
      alert('This table is already reserved at that date and time.');
      return;
    }

    if (editingId) {
      setReservations((current) =>
        current.map((reservation) =>
          reservation.id === editingId
            ? { ...reservation, ...reservationData }
            : reservation
        )
      );
    } else {
      const newReservation = {
        id: `RES${String(Date.now()).slice(-6)}`,
        ...reservationData,
        status: 'Pending',
      };

      setReservations((current) => [...current, newReservation]);
    }

    closeForm();
    alert(editingId ? 'Reservation updated successfully!' : 'Reservation created successfully!');
  }

  function updateStatus(id, status) {
    setReservations((current) =>
      current.map((reservation) =>
        reservation.id === id
          ? { ...reservation, status }
          : reservation
      )
    );

    setSelectedReservation((current) =>
      current?.id === id ? { ...current, status } : current
    );
  }

  function deleteReservation(id) {
    if (window.confirm('Are you sure you want to delete this reservation?')) {
      setReservations((current) =>
        current.filter((reservation) => reservation.id !== id)
      );
      setSelectedReservation(null);
    }
  }

  function resetSampleData() {
    if (window.confirm('Reset reservations to the original sample data? Your changes will be lost.')) {
      setReservations(sampleReservations);
      setSearch('');
      setStatusFilter('All');
      setDateFilter('');
      setSelectedReservation(null);
    }
  }

  function formatDate(date) {
    if (!date) return '';
    return new Date(`${date}T00:00:00`).toLocaleDateString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  return (
    <div className="reservations-page">
      <div className="reservations-heading">
        <div>
          <h2>Reservations Overview</h2>
          <p>Manage customer bookings, tables and dining schedules.</p>
        </div>

        <button
          type="button"
          className="reservations-primary-btn"
          onClick={openAddForm}
        >
          + New Reservation
        </button>
      </div>

      <div className="reservations-demo-note">
        <strong>Demonstration mode:</strong> Reservation records are saved
        locally in this browser and are not yet connected to the shared database.
      </div>

      <section className="reservations-summary">
        <div className="reservations-summary-card">
          <span>Total Reservations</span>
          <strong>{summary.total}</strong>
          <small>All bookings</small>
        </div>

        <div className="reservations-summary-card">
          <span>Pending</span>
          <strong>{summary.pending}</strong>
          <small>Awaiting confirmation</small>
        </div>

        <div className="reservations-summary-card">
          <span>Confirmed</span>
          <strong>{summary.confirmed}</strong>
          <small>Confirmed bookings</small>
        </div>

        <div className="reservations-summary-card">
          <span>Currently Seated</span>
          <strong>{summary.seated}</strong>
          <small>Guests at tables</small>
        </div>
      </section>

      {showForm && (
        <form className="reservations-form" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Reservation' : 'Create New Reservation'}</h3>

          <div className="reservations-form-grid">
            <div>
              <label htmlFor="reservationCustomer">Customer Name</label>
              <input
                id="reservationCustomer"
                value={form.customer}
                onChange={(event) =>
                  setForm({ ...form, customer: event.target.value })
                }
                placeholder="Enter customer name"
                required
              />
            </div>

            <div>
              <label htmlFor="reservationPhone">Contact Number</label>
              <input
                id="reservationPhone"
                type="tel"
                value={form.phone}
                onChange={(event) =>
                  setForm({ ...form, phone: event.target.value })
                }
                placeholder="e.g. 071 234 5678"
                required
              />
            </div>

            <div>
              <label htmlFor="reservationDate">Reservation Date</label>
              <input
                id="reservationDate"
                type="date"
                value={form.date}
                min={new Date().toLocaleDateString('en-CA')}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
                required
              />
            </div>

            <div>
              <label htmlFor="reservationTime">Reservation Time</label>
              <input
                id="reservationTime"
                type="time"
                value={form.time}
                onChange={(event) =>
                  setForm({ ...form, time: event.target.value })
                }
                required
              />
            </div>

            <div>
              <label htmlFor="reservationGuests">Number of Guests</label>
              <input
                id="reservationGuests"
                type="number"
                min="1"
                max="20"
                value={form.guests}
                onChange={(event) =>
                  setForm({ ...form, guests: event.target.value })
                }
                required
              />
            </div>

            <div>
              <label htmlFor="reservationTable">Assign Table</label>
              <select
                id="reservationTable"
                value={form.tableNumber}
                onChange={(event) =>
                  setForm({ ...form, tableNumber: event.target.value })
                }
                required
              >
                <option value="">Select a table</option>
                {tables.map((table) => (
                  <option key={table} value={table}>
                    Table {table}
                  </option>
                ))}
              </select>
            </div>

            <div className="reservations-full-width">
              <label htmlFor="reservationNotes">Special Requests / Notes</label>
              <textarea
                id="reservationNotes"
                rows="3"
                value={form.notes}
                onChange={(event) =>
                  setForm({ ...form, notes: event.target.value })
                }
                placeholder="Birthday, preferred seating or other requests..."
              />
            </div>
          </div>

          <div className="reservations-form-actions">
            <button type="submit" className="reservations-primary-btn">
              {editingId ? 'Update Reservation' : 'Save Reservation'}
            </button>

            <button
              type="button"
              className="reservations-cancel-btn"
              onClick={closeForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {selectedReservation && (
        <section className="reservations-detail-panel">
          <div className="reservations-detail-heading">
            <div>
              <h3>Reservation Details – {selectedReservation.id}</h3>
              <p>{selectedReservation.customer}</p>
            </div>

            <button
              type="button"
              className="reservations-cancel-btn"
              onClick={() => setSelectedReservation(null)}
            >
              Close
            </button>
          </div>

          <div className="reservations-detail-grid">
            <p><strong>Contact:</strong> {selectedReservation.phone}</p>
            <p><strong>Date:</strong> {formatDate(selectedReservation.date)}</p>
            <p><strong>Time:</strong> {selectedReservation.time}</p>
            <p><strong>Guests:</strong> {selectedReservation.guests}</p>
            <p><strong>Table:</strong> {selectedReservation.tableNumber}</p>
            <p><strong>Status:</strong> {selectedReservation.status}</p>
          </div>

          <p className="reservations-notes">
            <strong>Special Requests:</strong>{' '}
            {selectedReservation.notes || 'No special requests.'}
          </p>
        </section>
      )}

      <section className="reservations-table-panel">
        <div className="reservations-table-heading">
          <div>
            <h3>Customer Reservations</h3>
            <p>View, update and manage restaurant bookings.</p>
          </div>

          <button
            type="button"
            className="reservations-reset-btn"
            onClick={resetSampleData}
          >
            Reset Sample Data
          </button>
        </div>

        <div className="reservations-filters">
          <input
            type="search"
            placeholder="Search customer, phone or reservation ID..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            <option value="All">All Statuses</option>
            {statuses.map((status) => (
              <option key={status}>{status}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>

        <div className="table-wrapper">
          <table className="reservations-table">
            <thead>
              <tr>
                <th>Reservation ID</th>
                <th>Customer</th>
                <th>Date</th>
                <th>Time</th>
                <th>Guests</th>
                <th>Table</th>
                <th>Status</th>
                <th>Update Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredReservations.map((reservation) => (
                <tr key={reservation.id}>
                  <td><strong>#{reservation.id}</strong></td>
                  <td>
                    <strong>{reservation.customer}</strong>
                    <small className="reservations-phone">{reservation.phone}</small>
                  </td>
                  <td>{formatDate(reservation.date)}</td>
                  <td>{reservation.time}</td>
                  <td>{reservation.guests}</td>
                  <td>{reservation.tableNumber}</td>
                  <td>
                    <span
                      className={`reservations-status ${reservation.status.toLowerCase()}`}
                    >
                      {reservation.status}
                    </span>
                  </td>
                  <td>
                    <select
                      className="reservations-status-select"
                      value={reservation.status}
                      onChange={(event) =>
                        updateStatus(reservation.id, event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="reservations-row-actions">
                      <button
                        type="button"
                        onClick={() => setSelectedReservation(reservation)}
                      >
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(reservation)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="reservations-delete-btn"
                        onClick={() => deleteReservation(reservation.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredReservations.length === 0 && (
                <tr>
                  <td colSpan="9" className="reservations-empty">
                    No matching reservations found.
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
