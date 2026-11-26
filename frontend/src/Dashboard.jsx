import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoryApi, ordersApi, paymentsApi, reservationsApi } from './api/modules';
import { getUser } from './auth/session';
import { ROLES, STAFF_PAGES, hasRole } from './auth/permissions';
import { formatDateTime, formatRand, todayISO } from './utils/format';

// Role-appropriate staff dashboard (Analysis 11.2; System Design Figure 18).
// Each card only loads data the signed-in role may see; the API enforces it.

const ORDER_ROLES = Object.values(ROLES).filter((r) => r !== ROLES.CUSTOMER);
const RES_ROLES = [ROLES.WAITER, ROLES.MANAGER, ROLES.ADMIN];
const PAY_ROLES = [ROLES.CASHIER, ROLES.MANAGER, ROLES.ADMIN];
const STOCK_ROLES = [ROLES.KITCHEN, ROLES.MANAGER, ROLES.ADMIN];

const HINTS = {
  [ROLES.WAITER]: 'Confirm new orders and look after today\'s bookings.',
  [ROLES.KITCHEN]: 'Orders waiting for the kitchen are listed oldest first.',
  [ROLES.CASHIER]: 'Orders marked Ready are waiting for payment.',
  [ROLES.MANAGER]: 'Here\'s an overview of today\'s restaurant operations.',
  [ROLES.ADMIN]: 'Here\'s an overview of today\'s restaurant operations.',
};

function Dashboard() {
  const navigate = useNavigate();
  const user = getUser();
  const role = user?.role;
  const [stats, setStats] = useState({});
  const [recent, setRecent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const today = todayISO();
    const jobs = [];
    if (ORDER_ROLES.includes(role)) {
      jobs.push(ordersApi.list({ needs_action: true, limit: 6 }).then((r) => {
        setRecent(r.data.orders);
        const s = r.data.summary || {};
        setStats((x) => ({ ...x, orders: s, active: r.data.total ?? r.data.orders.length }));
      }));
    }
    if (RES_ROLES.includes(role)) {
      jobs.push(reservationsApi.list({ date: today }).then((r) => {
        const list = r.data.reservations || [];
        setStats((x) => ({ ...x, bookings: list.filter((b) => !['CANCELLED', 'NO_SHOW'].includes(b.status)).length }));
      }));
    }
    if (PAY_ROLES.includes(role)) {
      jobs.push(paymentsApi.list({ date: today }).then((r) => setStats((x) => ({ ...x, paid: r.data.summary }))));
    }
    if (STOCK_ROLES.includes(role)) {
      jobs.push(inventoryApi.list().then((r) => setStats((x) => ({ ...x, stock: r.data.summary }))));
    }
    Promise.allSettled(jobs).then((results) => {
      const failed = results.find((x) => x.status === 'rejected');
      if (failed) setError(failed.reason?.message || 'Some figures could not be loaded.');
    });
  }, [role]);

  const quickLinks = STAFF_PAGES.filter((page) => page.path !== '/staff/dashboard' && hasRole(user, page.roles));
  const o = stats.orders || {};
  const ordersToday = ['pending', 'confirmed', 'preparing', 'ready', 'completed', 'cancelled'].reduce((t, k) => t + (o[k] || 0), 0);

  const cards = [
    ORDER_ROLES.includes(role) && { label: 'Orders today', value: ordersToday, change: `${(o.pending || 0) + (o.confirmed || 0) + (o.preparing || 0)} in progress · ${o.ready || 0} ready`, icon: '▤' },
    RES_ROLES.includes(role) && { label: 'Bookings today', value: stats.bookings ?? '…', change: 'Confirmed, pending or seated', icon: '▣' },
    PAY_ROLES.includes(role) && { label: 'Paid today', value: stats.paid ? formatRand(stats.paid.total_paid) : '…', change: stats.paid ? `${stats.paid.count} payments · ${stats.paid.voided} voided` : '', icon: 'R' },
    STOCK_ROLES.includes(role) && { label: 'Low stock items', value: stats.stock ? stats.stock.low + stats.stock.out : '…', change: stats.stock ? `${stats.stock.out} out of stock` : '', icon: '▥' },
  ].filter(Boolean);

  return (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">UBUNTU BISTRO MANAGEMENT SYSTEM</p>
          <h2>Welcome back, {user?.full_name || 'there'}!</h2>
          <p>{role ? `Signed in as ${role}. ` : ''}{HINTS[role] || ''}</p>
        </div>
        <div className="welcome-icon">✦</div>
      </section>

      {error && <p className="dashboard-error" role="alert">⚠ {error}</p>}

      <section className="stats-grid">
        {cards.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <div className="stat-icon">{stat.icon}</div>
            </div>
            <h2>{stat.value}</h2>
            <span className="stat-change">{stat.change}</span>
          </div>
        ))}
      </section>

      <section className="content-grid">
        <div className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <h3>Orders Needing Action</h3>
              <p>Open orders from the shared database, oldest first</p>
            </div>
            <button type="button" className="outline-button" onClick={() => navigate('/staff/orders')}>
              View All
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order</th>
                  <th>Customer / Table</th>
                  <th>Placed</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {recent === null && (
                  <tr><td colSpan="5">Loading…</td></tr>
                )}
                {recent?.length === 0 && (
                  <tr><td colSpan="5">No open orders right now.</td></tr>
                )}
                {recent?.map((order) => (
                  <tr key={order.order_ref}>
                    <td>{order.order_ref}</td>
                    <td>{order.customer_name}{order.table_number ? ` · ${order.table_number}` : ''}</td>
                    <td>{formatDateTime(order.time_placed)}</td>
                    <td>{formatRand(order.total)}</td>
                    <td>
                      <span className={`status ${order.order_status.toLowerCase()}`}>{order.status_label}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel quick-panel">
          <h3>Quick Access</h3>
          <p>Pages you can use as {role || 'staff'}.</p>
          {quickLinks.map((item) => (
            <button type="button" className="quick-link" key={item.name} onClick={() => navigate(item.path)}>
              <span>{item.name}</span>
              <span>→</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}

export default Dashboard;
