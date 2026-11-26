import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { inventoryApi, reportsApi } from '../api/modules';
import { addDaysISO, formatDate, formatRand, todayISO } from '../utils/format';
import './ReportsManagement.css';

// Reports (P10; FR-20; Analysis FR-15). Figures come from the shared
// database through /api/v1/reports/{orders,payments,reservations}; stock
// figures from /api/v1/inventory. Managers and administrators only.

const PERIODS = {
  today: { label: 'Today', days: 0 },
  '7days': { label: 'Last 7 days', days: 6 },
  '30days': { label: 'Last 30 days', days: 29 },
  custom: { label: 'Custom range' },
};
const REPORT_TABS = [
  ['orders', 'Sales / Orders'],
  ['payments', 'Payments by method'],
  ['reservations', 'Reservations'],
];

function SummaryCard({ label, value, description, icon }) {
  return (
    <div className="report-summary-card">
      <div className="report-summary-top">
        <span className="report-summary-icon">{icon}</span>
      </div>
      <p className="report-summary-label">{label}</p>
      <h3>{value}</h3>
      <span className="report-summary-description">{description}</span>
    </div>
  );
}

function StatusRow({ label, count, total }) {
  const percentage = total > 0 ? (count / total) * 100 : 0;
  return (
    <div className="report-status-row">
      <div className="report-status-heading">
        <span>{label}</span>
        <strong>{count}</strong>
      </div>
      <div className="report-progress-track">
        <div className="report-progress-fill" style={{ width: `${percentage}%` }} />
      </div>
    </div>
  );
}

const cell = (value, format) => {
  if (value === null || value === undefined) return '—';
  if (format === 'money') return formatRand(value);
  if (format === 'date') return formatDate(String(value));
  return value;
};

function ReportsManagement() {
  const [period, setPeriod] = useState('7days');
  const [custom, setCustom] = useState(() => ({ from: addDaysISO(todayISO(), -6), to: todayISO() }));
  const [reports, setReports] = useState(null);
  const [stock, setStock] = useState(null);
  const [tab, setTab] = useState('orders');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const range = period === 'custom'
    ? custom
    : { from: addDaysISO(todayISO(), -PERIODS[period].days), to: todayISO() };

  const load = useCallback(async ({ from, to }) => {
    setLoading(true);
    setError('');
    try {
      const [orders, payments, reservations, inventory] = await Promise.all([
        reportsApi.run('orders', { from, to }),
        reportsApi.run('payments', { from, to }),
        reportsApi.run('reservations', { from, to }),
        inventoryApi.list(),
      ]);
      setReports({ orders: orders.data, payments: payments.data, reservations: reservations.data });
      setStock(inventory.data.summary);
    } catch (err) {
      // e.g. 400 "The date range can be at most 366 days."
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload when the period changes (custom ranges reload on "Run")
  useEffect(() => {
    if (period !== 'custom') load(range);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, load]);

  const o = reports?.orders.summary;
  const p = reports?.payments.summary;
  const rTotals = reports?.reservations.totals;
  const r = reports?.reservations.summary;
  const active = reports?.[tab];

  return (
    <div className="reports-page">
      <div className="reports-header">
        <div>
          <h2>Reports & Analytics</h2>
          <p>Sales, payments, bookings and stock from the shared database.</p>
        </div>
        <div className="reports-header-actions">
          <button type="button" className="report-refresh-button" onClick={() => load(range)} disabled={loading}>
            ↻ Refresh Reports
          </button>
          <button type="button" className="report-print-button" onClick={() => window.print()}>
            Print Report
          </button>
        </div>
      </div>

      <div className="reports-filter-panel">
        <div>
          <label htmlFor="report-period">Report period</label>
          <select id="report-period" value={period} onChange={(e) => setPeriod(e.target.value)}>
            {Object.entries(PERIODS).map(([key, p]) => <option key={key} value={key}>{p.label}</option>)}
          </select>
        </div>
        {period === 'custom' && (
          <form className="reports-custom-range" onSubmit={(e) => { e.preventDefault(); load(custom); }}>
            <label htmlFor="report-from">From</label>
            <input id="report-from" type="date" value={custom.from} max={custom.to}
              onChange={(e) => setCustom((c) => ({ ...c, from: e.target.value }))} />
            <label htmlFor="report-to">To</label>
            <input id="report-to" type="date" value={custom.to} min={custom.from}
              onChange={(e) => setCustom((c) => ({ ...c, to: e.target.value }))} />
            <button type="submit" className="report-refresh-button">Run</button>
          </form>
        )}
        <span className="report-data-note">
          {reports ? `${formatDate(reports.orders.from)} – ${formatDate(reports.orders.to)} · generated by ${reports.orders.generated_by}` : 'Loading…'}
        </span>
      </div>

      {error && <div className="reports-error" role="alert">⚠ {error}</div>}

      {reports && (
        <>
          <div className="reports-summary-grid">
            <SummaryCard label="Sales" value={formatRand(o.revenue)} description={`Average order ${formatRand(o.average_order)}`} icon="R" />
            <SummaryCard label="Orders" value={o.orders} description={`${o.cancelled} cancelled (${o.cancelled_pct}%)`} icon="▤" />
            <SummaryCard label="Payments received" value={formatRand(p.total)} description={`${p.payments} payments · ${p.voided} voided`} icon="▣" />
            <SummaryCard label="Reservations" value={r.bookings} description={`${r.guests} guests · no-show rate ${r.no_show_rate}%`} icon="▦" />
          </div>

          <div className="reports-content-grid">
            <section className="report-panel">
              <div className="report-panel-heading">
                <div><h3>Payments by Method</h3><p>Paid payments in the period</p></div>
                <span className="report-panel-icon">R</span>
              </div>
              <div className="report-financial-highlight">
                <span>Received</span>
                <strong>{formatRand(p.total)}</strong>
              </div>
              <div className="report-metric-list">
                {p.by_method.length === 0 && <div><span>No payments in this period</span><strong>—</strong></div>}
                {p.by_method.map((m) => (
                  <div key={m.method_name}><span>{m.method_name} ({m.payments})</span><strong>{formatRand(m.total)}</strong></div>
                ))}
                <div><span>Voided payments</span><strong>{p.voided}</strong></div>
              </div>
            </section>

            <section className="report-panel">
              <div className="report-panel-heading">
                <div><h3>Orders by Type</h3><p>Dine-in and collection in the period</p></div>
                <span className="report-panel-icon">▤</span>
              </div>
              <div className="report-status-list">
                <StatusRow label="Dine-in" count={reports.orders.totals.dine_in} total={Math.max(1, o.orders)} />
                <StatusRow label="Collection" count={reports.orders.totals.collection} total={Math.max(1, o.orders)} />
                <StatusRow label="Cancelled" count={o.cancelled} total={Math.max(1, o.orders)} />
              </div>
            </section>

            <section className="report-panel">
              <div className="report-panel-heading">
                <div><h3>Reservations Overview</h3><p>Booking status breakdown</p></div>
                <span className="report-panel-icon">▣</span>
              </div>
              <div className="report-status-list">
                {[['Pending', 'pending'], ['Confirmed', 'confirmed'], ['Seated', 'seated'], ['Completed', 'completed'], ['Cancelled', 'cancelled'], ['No-show', 'no_show']].map(([label, key]) => (
                  <StatusRow key={key} label={label} count={rTotals[key] || 0} total={Math.max(1, rTotals.bookings)} />
                ))}
              </div>
            </section>

            <section className="report-panel">
              <div className="report-panel-heading">
                <div><h3>Inventory Overview</h3><p>Current stock position (today)</p></div>
                <span className="report-panel-icon">▥</span>
              </div>
              <div className="inventory-report-stats">
                <div className="inventory-report-stat"><strong>{stock.total}</strong><span>Active items</span></div>
                <div className="inventory-report-stat warning"><strong>{stock.low}</strong><span>Low stock</span></div>
                <div className="inventory-report-stat danger"><strong>{stock.out}</strong><span>Out of stock</span></div>
              </div>
              <div className="inventory-report-note">
                <Link to="/staff/inventory">Open Inventory</Link> to see which items need re-ordering.
              </div>
            </section>
          </div>

          <section className="report-panel report-table-panel">
            <div className="report-panel-heading">
              <div>
                <h3>{active.title}</h3>
                <p>Day-by-day figures for the period</p>
              </div>
              <a className="report-print-button" href={reportsApi.csvUrl(tab, { from: active.from, to: active.to })}>
                Download CSV
              </a>
            </div>
            <div className="reports-tabs" role="tablist" aria-label="Report">
              {REPORT_TABS.map(([key, label]) => (
                <button key={key} type="button" role="tab" aria-selected={tab === key}
                  className={tab === key ? 'active' : ''} onClick={() => setTab(key)}>
                  {label}
                </button>
              ))}
            </div>

            {active.rows.length === 0 ? (
              <div className="report-empty-state">No records in this period.</div>
            ) : (
              <div className="report-table-wrapper">
                <table className="report-table">
                  <thead>
                    <tr>{active.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {active.rows.map((row, i) => (
                      <tr key={i}>{active.columns.map((c) => <td key={c.key}>{cell(row[c.key], c.format)}</td>)}</tr>
                    ))}
                    <tr className="report-total-row">
                      {active.columns.map((c, i) => (
                        <td key={c.key}>{i === 0 ? 'Total' : c.key in active.totals ? cell(active.totals[c.key], c.format) : ''}</td>
                      ))}
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}

      {loading && !reports && <div className="report-empty-state">Loading reports…</div>}
    </div>
  );
}

export default ReportsManagement;
