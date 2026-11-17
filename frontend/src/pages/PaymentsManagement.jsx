
import { useEffect, useMemo, useState } from 'react';
import './PaymentsManagement.css';

const STORAGE_KEY = 'ubms_payments_v1';

const samplePayments = [
  {
    id: 'PAY001',
    orderId: 'UB001',
    customer: 'Customer 01',
    amount: 195,
    method: 'Card',
    status: 'Paid',
    reference: 'TXN10001',
    date: '2026-11-17',
  },
  {
    id: 'PAY002',
    orderId: 'UB002',
    customer: 'Customer 02',
    amount: 120,
    method: 'Cash',
    status: 'Paid',
    reference: 'TXN10002',
    date: '2026-11-17',
  },
  {
    id: 'PAY003',
    orderId: 'UB003',
    customer: 'Customer 03',
    amount: 145,
    method: 'EFT',
    status: 'Pending',
    reference: 'TXN10003',
    date: '2026-11-17',
  },
  {
    id: 'PAY004',
    orderId: 'UB004',
    customer: 'Customer 04',
    amount: 95,
    method: 'Mobile Payment',
    status: 'Failed',
    reference: 'TXN10004',
    date: '2026-11-17',
  },
  {
    id: 'PAY005',
    orderId: 'UB005',
    customer: 'Customer 05',
    amount: 250,
    method: 'Card',
    status: 'Refunded',
    reference: 'TXN10005',
    date: '2026-11-16',
  },
];

const emptyForm = {
  orderId: '',
  customer: '',
  amount: '',
  method: 'Cash',
  status: 'Pending',
  reference: '',
  date: new Date().toLocaleDateString('en-CA'),
};

function getInitialPayments() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : samplePayments;
  } catch {
    return samplePayments;
  }
}

function PaymentsManagement() {
  const [payments, setPayments] = useState(getInitialPayments);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [methodFilter, setMethodFilter] = useState('All');
  const [dateFilter, setDateFilter] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const methods = ['Cash', 'Card', 'EFT', 'Mobile Payment'];
  const statuses = ['Pending', 'Paid', 'Failed', 'Refunded'];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payments));
  }, [payments]);

  const summary = useMemo(() => {
    const paid = payments
      .filter((payment) => payment.status === 'Paid')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const pending = payments
      .filter((payment) => payment.status === 'Pending')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    const refunded = payments
      .filter((payment) => payment.status === 'Refunded')
      .reduce((sum, payment) => sum + Number(payment.amount), 0);

    return {
      totalTransactions: payments.length,
      paid,
      pending,
      refunded,
    };
  }, [payments]);

  const filteredPayments = payments.filter((payment) => {
    const searchTerm = search.toLowerCase();

    const matchesSearch =
      payment.id.toLowerCase().includes(searchTerm) ||
      payment.orderId.toLowerCase().includes(searchTerm) ||
      payment.customer.toLowerCase().includes(searchTerm) ||
      payment.reference.toLowerCase().includes(searchTerm);

    const matchesStatus =
      statusFilter === 'All' || payment.status === statusFilter;

    const matchesMethod =
      methodFilter === 'All' || payment.method === methodFilter;

    const matchesDate =
      !dateFilter || payment.date === dateFilter;

    return matchesSearch && matchesStatus && matchesMethod && matchesDate;
  });

  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
    setSelectedPayment(null);
  }

  function openEditForm(payment) {
    setEditingId(payment.id);
    setForm({
      orderId: payment.orderId,
      customer: payment.customer,
      amount: String(payment.amount),
      method: payment.method,
      status: payment.status,
      reference: payment.reference,
      date: payment.date,
    });
    setShowForm(true);
    setSelectedPayment(null);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const amount = Number(form.amount);

    if (!form.orderId.trim() || !form.customer.trim()) {
      alert('Please enter the order ID and customer name.');
      return;
    }

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Please enter a valid payment amount greater than zero.');
      return;
    }

    const paymentData = {
      orderId: form.orderId.trim(),
      customer: form.customer.trim(),
      amount,
      method: form.method,
      status: form.status,
      reference: form.reference.trim() || 'Not provided',
      date: form.date,
    };

    if (editingId) {
      setPayments((current) =>
        current.map((payment) =>
          payment.id === editingId
            ? { ...payment, ...paymentData }
            : payment
        )
      );
    } else {
      const newPayment = {
        id: `PAY${String(Date.now()).slice(-7)}`,
        ...paymentData,
      };

      setPayments((current) => [newPayment, ...current]);
    }

    closeForm();
    alert(editingId ? 'Payment updated successfully!' : 'Payment recorded successfully!');
  }

  function updateStatus(id, status) {
    setPayments((current) =>
      current.map((payment) =>
        payment.id === id ? { ...payment, status } : payment
      )
    );

    setSelectedPayment((current) =>
      current?.id === id ? { ...current, status } : current
    );
  }

  function deletePayment(id) {
    if (window.confirm('Are you sure you want to delete this payment record?')) {
      setPayments((current) =>
        current.filter((payment) => payment.id !== id)
      );
      setSelectedPayment(null);
    }
  }

  function resetSampleData() {
    if (
      window.confirm(
        'Reset payments to the original demonstration records? Your changes will be lost.'
      )
    ) {
      setPayments(samplePayments);
      setSearch('');
      setStatusFilter('All');
      setMethodFilter('All');
      setDateFilter('');
      setSelectedPayment(null);
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

  function formatCurrency(amount) {
    return `R ${Number(amount).toLocaleString('en-ZA', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;
  }

  return (
    <div className="payments-page">
      <div className="payments-heading">
        <div>
          <h2>Payments Overview</h2>
          <p>Record and monitor restaurant customer payments.</p>
        </div>

        <button
          type="button"
          className="payments-primary-btn"
          onClick={openAddForm}
        >
          + Record Payment
        </button>
      </div>

      <div className="payments-demo-note">
        <strong>Demonstration mode:</strong> These are sample payment records.
        No actual bank, card or mobile transactions are processed.
        Records are saved locally in this browser.
      </div>

      <section className="payments-summary">
        <div className="payments-summary-card">
          <span>Total Transactions</span>
          <strong>{summary.totalTransactions}</strong>
          <small>All recorded transactions</small>
        </div>

        <div className="payments-summary-card">
          <span>Total Paid</span>
          <strong>{formatCurrency(summary.paid)}</strong>
          <small>Successfully received</small>
        </div>

        <div className="payments-summary-card">
          <span>Pending Payments</span>
          <strong>{formatCurrency(summary.pending)}</strong>
          <small>Awaiting payment</small>
        </div>

        <div className="payments-summary-card">
          <span>Total Refunded</span>
          <strong>{formatCurrency(summary.refunded)}</strong>
          <small>Refunded transactions</small>
        </div>
      </section>

      {showForm && (
        <form className="payments-form" onSubmit={handleSubmit}>
          <h3>{editingId ? 'Edit Payment' : 'Record New Payment'}</h3>

          <div className="payments-form-grid">
            <div>
              <label htmlFor="paymentOrderId">Order ID</label>
              <input
                id="paymentOrderId"
                value={form.orderId}
                onChange={(event) =>
                  setForm({ ...form, orderId: event.target.value })
                }
                placeholder="e.g. UB001"
                required
              />
            </div>

            <div>
              <label htmlFor="paymentCustomer">Customer Name</label>
              <input
                id="paymentCustomer"
                value={form.customer}
                onChange={(event) =>
                  setForm({ ...form, customer: event.target.value })
                }
                placeholder="Enter customer name"
                required
              />
            </div>

            <div>
              <label htmlFor="paymentAmount">Payment Amount (R)</label>
              <input
                id="paymentAmount"
                type="number"
                min="0.01"
                step="0.01"
                value={form.amount}
                onChange={(event) =>
                  setForm({ ...form, amount: event.target.value })
                }
                placeholder="Enter amount"
                required
              />
            </div>

            <div>
              <label htmlFor="paymentMethod">Payment Method</label>
              <select
                id="paymentMethod"
                value={form.method}
                onChange={(event) =>
                  setForm({ ...form, method: event.target.value })
                }
              >
                {methods.map((method) => (
                  <option key={method}>{method}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="paymentStatus">Payment Status</label>
              <select
                id="paymentStatus"
                value={form.status}
                onChange={(event) =>
                  setForm({ ...form, status: event.target.value })
                }
              >
                {statuses.map((status) => (
                  <option key={status}>{status}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="paymentDate">Payment Date</label>
              <input
                id="paymentDate"
                type="date"
                value={form.date}
                onChange={(event) =>
                  setForm({ ...form, date: event.target.value })
                }
                required
              />
            </div>

            <div className="payments-full-width">
              <label htmlFor="paymentReference">Transaction Reference</label>
              <input
                id="paymentReference"
                value={form.reference}
                onChange={(event) =>
                  setForm({ ...form, reference: event.target.value })
                }
                placeholder="Enter transaction reference (optional)"
              />
            </div>
          </div>

          <div className="payments-form-actions">
            <button type="submit" className="payments-primary-btn">
              {editingId ? 'Update Payment' : 'Save Payment'}
            </button>

            <button
              type="button"
              className="payments-cancel-btn"
              onClick={closeForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {selectedPayment && (
        <section className="payments-detail-panel">
          <div className="payments-detail-heading">
            <div>
              <h3>Payment Details – {selectedPayment.id}</h3>
              <p>{selectedPayment.customer}</p>
            </div>

            <button
              type="button"
              className="payments-cancel-btn"
              onClick={() => setSelectedPayment(null)}
            >
              Close
            </button>
          </div>

          <div className="payments-detail-grid">
            <p><strong>Order ID:</strong> {selectedPayment.orderId}</p>
            <p><strong>Customer:</strong> {selectedPayment.customer}</p>
            <p><strong>Amount:</strong> {formatCurrency(selectedPayment.amount)}</p>
            <p><strong>Method:</strong> {selectedPayment.method}</p>
            <p><strong>Status:</strong> {selectedPayment.status}</p>
            <p><strong>Date:</strong> {formatDate(selectedPayment.date)}</p>
            <p><strong>Reference:</strong> {selectedPayment.reference}</p>
          </div>
        </section>
      )}

      <section className="payments-table-panel">
        <div className="payments-table-heading">
          <div>
            <h3>Payment Transactions</h3>
            <p>View and manage all recorded payment transactions.</p>
          </div>

          <button
            type="button"
            className="payments-reset-btn"
            onClick={resetSampleData}
          >
            Reset Sample Data
          </button>
        </div>

        <div className="payments-filters">
          <input
            type="search"
            placeholder="Search payment, order or customer..."
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

          <select
            value={methodFilter}
            onChange={(event) => setMethodFilter(event.target.value)}
          >
            <option value="All">All Methods</option>
            {methods.map((method) => (
              <option key={method}>{method}</option>
            ))}
          </select>

          <input
            type="date"
            value={dateFilter}
            onChange={(event) => setDateFilter(event.target.value)}
          />
        </div>

        <div className="table-wrapper">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Payment ID</th>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Amount</th>
                <th>Method</th>
                <th>Date</th>
                <th>Status</th>
                <th>Update Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredPayments.map((payment) => (
                <tr key={payment.id}>
                  <td><strong>#{payment.id}</strong></td>
                  <td>{payment.orderId}</td>
                  <td>{payment.customer}</td>
                  <td>{formatCurrency(payment.amount)}</td>
                  <td>{payment.method}</td>
                  <td>{formatDate(payment.date)}</td>
                  <td>
                    <span
                      className={`payments-status ${payment.status.toLowerCase()}`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td>
                    <select
                      className="payments-status-select"
                      value={payment.status}
                      onChange={(event) =>
                        updateStatus(payment.id, event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="payments-row-actions">
                      <button
                        type="button"
                        onClick={() => setSelectedPayment(payment)}
                      >
                        View
                      </button>

                      <button
                        type="button"
                        onClick={() => openEditForm(payment)}
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        className="payments-delete-btn"
                        onClick={() => deletePayment(payment.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan="9" className="payments-empty">
                    No matching payment records found.
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

export default PaymentsManagement;
