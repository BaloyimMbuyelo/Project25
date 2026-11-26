import { useCallback, useEffect, useState } from 'react';
import { usersApi } from '../api/modules';
import { addDaysISO, formatDateTime, todayISO } from '../utils/format';
import './AdminPages.css';

// Audit log (FR-21, SEC-06; Analysis FR-18 "timestamps and responsible-user
// data", NFR-10 Auditability). Read-only: who did what, when, from where.

// Every action the API writes (backend services and auth middleware)
const ACTIONS = [
  'LOGIN_SUCCESS', 'LOGIN_FAILED', 'ACCOUNT_LOCKED', 'LOGOUT', 'ACCESS_DENIED', 'CUSTOMER_REGISTERED', 'PASSWORD_CHANGED',
  'USER_SAVED', 'PASSWORD_RESET',
  'ORDER_PLACED', 'ORDER_AMENDED', 'ORDER_STATUS', 'ORDER_CANCELLED',
  'PAYMENT_RECORDED', 'PAYMENT_VOIDED',
  'RESERVATION_CREATED', 'RESERVATION_UPDATED', 'RESERVATION_STATUS',
  'MENU_ITEM_CREATED', 'MENU_ITEM_UPDATED', 'MENU_ITEM_DELETED', 'MENU_ITEM_AVAILABILITY', 'PRICE_CHANGED',
  'MENU_IMAGE_UPLOADED', 'MENU_IMAGE_REMOVED', 'MENU_CATEGORY_CREATED', 'MENU_CATEGORY_UPDATED',
  'STOCK_ITEM_CREATED', 'STOCK_ITEM_UPDATED', 'STOCK_MOVEMENT', 'REPORT_RUN',
];
const label = (a) => a.toLowerCase().replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

// One readable line from the stored details
function summarise(details) {
  if (!details || typeof details !== 'object') return '';
  const skip = new Set(['entity', 'record_id']);
  return Object.entries(details)
    .filter(([k, v]) => !skip.has(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => {
      const name = k.replace(/_/g, ' ');
      if (Array.isArray(v)) return `${name}: ${v.join(', ')}`;
      if (v && typeof v === 'object') {
        // e.g. changes: { role: { from: 'Cashier', to: 'Waiter' } } -> role: Cashier → Waiter
        const parts = Object.entries(v).map(([field, c]) =>
          c && typeof c === 'object' && 'from' in c ? `${field.replace(/_/g, ' ')}: ${c.from ?? '—'} → ${c.to ?? '—'}` : `${field}: ${JSON.stringify(c)}`);
        return parts.length ? parts.join(' · ') : '';
      }
      return `${name}: ${v}`;
    })
    .filter(Boolean)
    .join(' · ');
}

function AuditLog() {
  const [filters, setFilters] = useState(() => ({ from: addDaysISO(todayISO(), -6), to: todayISO(), action: '', page: 1 }));
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const r = await usersApi.audit({ ...filters, limit: 50 });
      setResult(r.data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [filters]);

  useEffect(() => { load(); }, [load]);

  const set = (key, value) => setFilters((f) => ({ ...f, [key]: value, page: key === 'page' ? value : 1 }));

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div>
          <h2>Audit Log</h2>
          <p>Logins, lockouts and every change to orders, payments, bookings, menu, stock and users.</p>
        </div>
        <button type="button" className="admin-secondary-btn" onClick={load}>Refresh</button>
      </div>

      {error && <div className="admin-error" role="alert">⚠ {error}</div>}

      <section className="admin-panel">
        <div className="admin-filters">
          <label>From <input type="date" value={filters.from} max={filters.to} onChange={(e) => set('from', e.target.value)} /></label>
          <label>To <input type="date" value={filters.to} min={filters.from} onChange={(e) => set('to', e.target.value)} /></label>
          <select value={filters.action} onChange={(e) => set('action', e.target.value)} aria-label="Action">
            <option value="">All actions</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{label(a)}</option>)}
          </select>
          {result && <span className="admin-hint">{result.total} entr{result.total === 1 ? 'y' : 'ies'}</span>}
        </div>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr><th>When</th><th>Who</th><th>Action</th><th>Details</th><th>IP address</th></tr>
            </thead>
            <tbody>
              {!result && !error && <tr><td colSpan="5" className="admin-empty">Loading…</td></tr>}
              {result?.entries.length === 0 && <tr><td colSpan="5" className="admin-empty">No entries for this period.</td></tr>}
              {result?.entries.map((e) => (
                <tr key={e.log_id}>
                  <td className="admin-nowrap">{formatDateTime(e.created_at)}</td>
                  <td>{e.user_name || <span className="admin-hint">{e.details?.email || 'Unknown'}</span>}</td>
                  <td><span className={`admin-badge ${/FAILED|LOCKED|DENIED|VOIDED|CANCELLED/.test(e.action) ? 'warn' : 'info'}`}>{label(e.action)}</span></td>
                  <td className="admin-details">{summarise(e.details)}</td>
                  <td className="admin-nowrap">{e.ip_address || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {result && result.pages > 1 && (
          <div className="admin-pager">
            <button type="button" className="admin-secondary-btn" disabled={filters.page <= 1} onClick={() => set('page', filters.page - 1)}>← Newer</button>
            <span>Page {result.page} of {result.pages}</span>
            <button type="button" className="admin-secondary-btn" disabled={filters.page >= result.pages} onClick={() => set('page', filters.page + 1)}>Older →</button>
          </div>
        )}
      </section>
    </div>
  );
}

export default AuditLog;
