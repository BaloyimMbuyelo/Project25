
import { useMemo, useState } from 'react';
import './ReportsManagement.css';

const STORAGE_KEYS = {
  orders: 'ubms_orders_v1',
  payments: 'ubms_payments_v1',
  reservations: 'ubms_reservations_v1',
  inventory: 'ubms_inventory_v1',
};

// Read saved demonstration data
const readData = (key) => {
  try {
    const saved = localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

// Get payment or order amount
const getAmount = (item) =>
  Number(
    item.amount ??
    item.total ??
    item.totalAmount ??
    item.price ??
    item.grandTotal ??
    0
  ) || 0;

// Get record status
const getStatus = (item) =>
  String(item.status ?? 'Unknown').toLowerCase();

// Format South African currency
const formatCurrency = (amount) =>
  new Intl.NumberFormat('en-ZA', {
    style: 'currency',
    currency: 'ZAR',
    minimumFractionDigits: 2,
  }).format(Number(amount) || 0);

// Format dates
const formatDate = (value) => {
  if (!value) return 'Not specified';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleDateString('en-ZA', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
};

// Check whether a record was created today
const isToday = (value) => {
  if (!value) return false;

  const date = new Date(value);
  const today = new Date();

  return (
    !Number.isNaN(date.getTime()) &&
    date.getDate() === today.getDate() &&
    date.getMonth() === today.getMonth() &&
    date.getFullYear() === today.getFullYear()
  );
};

// Get record date
const getDate = (item) =>
  item.date ??
  item.orderDate ??
  item.createdAt ??
  item.reservationDate ??
  '';

// Get inventory quantity
const getInventoryQuantity = (item) =>
  Number(
    item.quantity ??
    item.stock ??
    item.currentStock ??
    0
  ) || 0;

// Get minimum inventory quantity
const getInventoryThreshold = (item) =>
  Number(
    item.minimumStock ??
    item.minStock ??
    item.reorderLevel ??
    5
  ) || 0;

// Summary card component
function SummaryCard({ label, value, description, icon }) {
  return (
    <div className="report-summary-card">
      <div className="report-summary-top">
        <span className="report-summary-icon">{icon}</span>
      </div>

      <p className="report-summary-label">{label}</p>

      <h3>{value}</h3>

      <span className="report-summary-description">
        {description}
      </span>
    </div>
  );
}

// Status progress bar component
function StatusRow({ label, count, total }) {
  const percentage = total > 0
    ? (count / total) * 100
    : 0;

  return (
    <div className="report-status-row">
      <div className="report-status-heading">
        <span>{label}</span>
        <strong>{count}</strong>
      </div>

      <div className="report-progress-track">
        <div
          className="report-progress-fill"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

function ReportsManagement() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [period, setPeriod] = useState('all');

  // Load saved demonstration data
  const data = useMemo(() => {
    void refreshKey;

    return {
      orders: readData(STORAGE_KEYS.orders),
      payments: readData(STORAGE_KEYS.payments),
      reservations: readData(STORAGE_KEYS.reservations),
      inventory: readData(STORAGE_KEYS.inventory),
    };
  }, [refreshKey]);

  // Filter records according to selected reporting period
  const filtered = useMemo(() => {
    const now = new Date();
    const start = new Date(now);

    if (period === 'today') {
      start.setHours(0, 0, 0, 0);
    } else if (period === '7days') {
      start.setDate(now.getDate() - 6);
      start.setHours(0, 0, 0, 0);
    } else if (period === '30days') {
      start.setDate(now.getDate() - 29);
      start.setHours(0, 0, 0, 0);
    }

    const filterByDate = (items) => {
      if (period === 'all') {
        return items;
      }

      return items.filter((item) => {
        const dateValue = getDate(item);

        if (!dateValue) return false;

        const date = new Date(dateValue);

        return (
          !Number.isNaN(date.getTime()) &&
          date >= start &&
          date <= now
        );
      });
    };

    return {
      orders: filterByDate(data.orders),
      payments: filterByDate(data.payments),
      reservations: filterByDate(data.reservations),
    };
  }, [data, period]);

  // Payment calculations
  const paidPayments = filtered.payments.filter(
    (payment) => getStatus(payment) === 'paid'
  );

  const paidRevenue = paidPayments.reduce(
    (sum, payment) => sum + getAmount(payment),
    0
  );

  const pendingPayments = filtered.payments.filter(
    (payment) => getStatus(payment) === 'pending'
  );

  const refundedPayments = filtered.payments.filter(
    (payment) => getStatus(payment) === 'refunded'
  );

  const failedPayments = filtered.payments.filter(
    (payment) => getStatus(payment) === 'failed'
  );

  const refundedAmount = refundedPayments.reduce(
    (sum, payment) => sum + getAmount(payment),
    0
  );

  // Orders recorded today
  const todayOrders = data.orders.filter(
    (order) => isToday(getDate(order))
  );

  // Order statuses
  const orderStatuses = [
    'Pending',
    'Preparing',
    'Ready',
    'Completed',
    'Cancelled',
  ];

  // Reservation statuses
  const reservationStatuses = [
    'Pending',
    'Confirmed',
    'Seated',
    'Completed',
    'Cancelled',
  ];

  // Corrected order chart calculation:
  // Each status is measured against the total number of orders.
  const totalOrdersForChart = Math.max(
    1,
    filtered.orders.length
  );

  // Inventory calculations
  const lowStockItems = data.inventory.filter((item) => {
    const quantity = getInventoryQuantity(item);
    const minimum = getInventoryThreshold(item);

    return quantity > 0 && quantity <= minimum;
  });

  const outOfStockItems = data.inventory.filter(
    (item) => getInventoryQuantity(item) <= 0
  );

  // Refresh reports
  const handleRefresh = () => {
    setRefreshKey((current) => current + 1);
  };

  // Print reports
  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="reports-page">

      {/* Reports heading */}
      <div className="reports-header">
        <div>
          <h2>Reports & Analytics</h2>

          <p>
            Monitor restaurant performance, sales, orders,
            payments and stock.
          </p>
        </div>

        <div className="reports-header-actions">
          <button
            className="report-refresh-button"
            onClick={handleRefresh}
          >
            ↻ Refresh Reports
          </button>

          <button
            className="report-print-button"
            onClick={handlePrint}
          >
            Print Report
          </button>
        </div>
      </div>

      {/* Reporting period filter */}
      <div className="reports-filter-panel">
        <div>
          <label htmlFor="report-period">
            Report period
          </label>

          <select
            id="report-period"
            value={period}
            onChange={(event) => setPeriod(event.target.value)}
          >
            <option value="all">All available records</option>
            <option value="today">Today</option>
            <option value="7days">Last 7 days</option>
            <option value="30days">Last 30 days</option>
          </select>
        </div>

        <span className="report-data-note">
          Demonstration data · Last refreshed when you click Refresh Reports
        </span>
      </div>

      {/* Summary cards */}
      <div className="reports-summary-grid">

        <SummaryCard
          label="Total Revenue"
          value={formatCurrency(paidRevenue)}
          description="Payments with Paid status"
          icon="R"
        />

        <SummaryCard
          label="Total Orders"
          value={filtered.orders.length}
          description={`${todayOrders.length} orders recorded today`}
          icon="▤"
        />

        <SummaryCard
          label="Transactions"
          value={filtered.payments.length}
          description="Payment records in selected period"
          icon="▣"
        />

        <SummaryCard
          label="Reservations"
          value={filtered.reservations.length}
          description="Bookings in selected period"
          icon="▦"
        />

      </div>

      {/* Reports content */}
      <div className="reports-content-grid">

        {/* Sales and Payments */}
        <section className="report-panel">

          <div className="report-panel-heading">
            <div>
              <h3>Sales & Payments</h3>
              <p>Overview of recorded payment transactions</p>
            </div>

            <span className="report-panel-icon">R</span>
          </div>

          <div className="report-financial-highlight">
            <span>Successfully received</span>
            <strong>{formatCurrency(paidRevenue)}</strong>
          </div>

          <div className="report-metric-list">

            <div>
              <span>Paid transactions</span>
              <strong>{paidPayments.length}</strong>
            </div>

            <div>
              <span>Pending payments</span>
              <strong>{pendingPayments.length}</strong>
            </div>

            <div>
              <span>Failed payments</span>
              <strong>{failedPayments.length}</strong>
            </div>

            <div>
              <span>Refunded amount</span>
              <strong>{formatCurrency(refundedAmount)}</strong>
            </div>

          </div>
        </section>

        {/* Order Status */}
        <section className="report-panel">

          <div className="report-panel-heading">
            <div>
              <h3>Order Status</h3>
              <p>Breakdown of orders by progress</p>
            </div>

            <span className="report-panel-icon">▤</span>
          </div>

          <div className="report-status-list">

            {orderStatuses.map((status) => {
              const count = filtered.orders.filter(
                (order) =>
                  getStatus(order) === status.toLowerCase()
              ).length;

              return (
                <StatusRow
                  key={status}
                  label={status}
                  count={count}
                  total={totalOrdersForChart}
                />
              );
            })}

          </div>
        </section>

        {/* Reservations Overview */}
        <section className="report-panel">

          <div className="report-panel-heading">
            <div>
              <h3>Reservations Overview</h3>
              <p>Booking status breakdown</p>
            </div>

            <span className="report-panel-icon">▣</span>
          </div>

          <div className="report-status-list">

            {reservationStatuses.map((status) => {
              const count = filtered.reservations.filter(
                (reservation) =>
                  getStatus(reservation) === status.toLowerCase()
              ).length;

              return (
                <StatusRow
                  key={status}
                  label={status}
                  count={count}
                  total={Math.max(
                    1,
                    filtered.reservations.length
                  )}
                />
              );
            })}

          </div>
        </section>

        {/* Inventory Overview */}
        <section className="report-panel">

          <div className="report-panel-heading">
            <div>
              <h3>Inventory Overview</h3>
              <p>Current stock position</p>
            </div>

            <span className="report-panel-icon">▥</span>
          </div>

          <div className="inventory-report-stats">

            <div className="inventory-report-stat">
              <strong>{data.inventory.length}</strong>
              <span>Total items</span>
            </div>

            <div className="inventory-report-stat warning">
              <strong>{lowStockItems.length}</strong>
              <span>Low stock</span>
            </div>

            <div className="inventory-report-stat danger">
              <strong>{outOfStockItems.length}</strong>
              <span>Out of stock</span>
            </div>

          </div>

          <div className="inventory-report-note">
            Stock figures are based on the current saved inventory records.
          </div>

        </section>

      </div>

      {/* Recent payment transactions */}
      <section className="report-panel report-table-panel">

        <div className="report-panel-heading">
          <div>
            <h3>Recent Payment Transactions</h3>
            <p>Latest payment records in the selected period</p>
          </div>
        </div>

        {filtered.payments.length === 0 ? (

          <div className="report-empty-state">
            No payment records found for this period.
          </div>

        ) : (

          <div className="report-table-wrapper">

            <table className="report-table">

              <thead>
                <tr>
                  <th>Payment ID</th>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Amount</th>
                  <th>Method</th>
                  <th>Date</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>

                {[...filtered.payments]
                  .reverse()
                  .slice(0, 8)
                  .map((payment, index) => (

                    <tr
                      key={
                        payment.id ??
                        payment.paymentId ??
                        index
                      }
                    >
                      <td>
                        {payment.paymentId ??
                          payment.id ??
                          `Payment ${index + 1}`}
                      </td>

                      <td>{payment.orderId ?? '—'}</td>

                      <td>
                        {payment.customer ??
                          payment.customerName ??
                          '—'}
                      </td>

                      <td>{formatCurrency(getAmount(payment))}</td>

                      <td>
                        {payment.method ??
                          payment.paymentMethod ??
                          '—'}
                      </td>

                      <td>{formatDate(getDate(payment))}</td>

                      <td>
                        <span
                          className={`report-status-badge ${getStatus(payment)}`}
                        >
                          {payment.status ?? 'Unknown'}
                        </span>
                      </td>
                    </tr>

                  ))}

              </tbody>

            </table>

          </div>

        )}

      </section>

      {/* Report disclaimer */}
      <div className="reports-footer-note">
        <strong>Note:</strong> These reports use locally saved demonstration
        records. Revenue is calculated from payments marked Paid. The figures
        will be connected to the shared MySQL database during backend
        integration.
      </div>

    </div>
  );
}

export default ReportsManagement;
