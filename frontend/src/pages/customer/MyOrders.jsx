import { useCallback, useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ordersApi } from '../../api/modules';
import { clearSession, getUser } from '../../auth/session';
import { ROLES } from '../../auth/permissions';
import { formatDateTime, formatRand } from '../../utils/format';
import CustomerAccountBar from '../../components/CustomerAccountBar';
import './Checkout.css';
import './MyOrders.css';

// Customer order confirmation, status and history (Analysis 11.1 "order
// submission, confirmation and status display"; FR-10, FR-11, FR-17).
// Customers only ever see their own orders - the API enforces that.

const STEPS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED'];
const STEP_LABELS = { PENDING: 'Received', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready to collect', COMPLETED: 'Collected' };
const FINAL = ['COMPLETED', 'CANCELLED'];
const REFRESH_MS = 20000;

function useAuthRedirect() {
  const navigate = useNavigate();
  return useCallback((err, next) => {
    if (err.status === 401) {
      clearSession();
      navigate(`/login?next=${encodeURIComponent(next)}`, { replace: true });
      return true;
    }
    return false;
  }, [navigate]);
}

function StatusSteps({ status }) {
  if (status === 'CANCELLED') {
    return <p className="order-cancelled" role="status">This order was cancelled.</p>;
  }
  const at = STEPS.indexOf(status);
  return (
    <ol className="order-steps" aria-label="Order progress">
      {STEPS.map((step, i) => (
        <li key={step} className={i < at ? 'done' : i === at ? 'current' : ''} aria-current={i === at ? 'step' : undefined}>
          <span className="order-step-dot" aria-hidden="true">{i < at ? '✓' : i + 1}</span>
          <span>{STEP_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  );
}

function OrderDetail({ orderRef }) {
  const location = useLocation();
  const authRedirect = useAuthRedirect();
  const [order, setOrder] = useState(null);
  const [error, setError] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const load = useCallback(async () => {
    try {
      const response = await ordersApi.get(orderRef);
      setOrder(response.data);
      setError('');
    } catch (err) {
      if (!authRedirect(err, `/my-orders/${orderRef}`)) setError(err.message);
    }
  }, [orderRef, authRedirect]);

  useEffect(() => {
    load();
  }, [load]);

  // Keep the status up to date while the kitchen works on it
  useEffect(() => {
    if (!order || FINAL.includes(order.order_status)) return undefined;
    const timer = setInterval(load, REFRESH_MS);
    return () => clearInterval(timer);
  }, [order, load]);

  async function cancel() {
    if (!window.confirm(`Cancel order ${orderRef}?`)) return;
    setCancelling(true);
    try {
      const response = await ordersApi.cancel(orderRef);
      setOrder(response.data);
    } catch (err) {
      if (!authRedirect(err, `/my-orders/${orderRef}`)) setError(err.message);
    } finally {
      setCancelling(false);
    }
  }

  if (error && !order) {
    return (
      <section className="checkout-panel checkout-empty">
        <h2>Order not found</h2>
        <p>{error}</p>
        <Link to="/my-orders" className="checkout-primary">My orders</Link>
      </section>
    );
  }
  if (!order) return <p className="order-loading">Loading your order…</p>;

  return (
    <div className="order-detail">
      {location.state?.placed && (
        <div className="order-placed" role="status">
          <strong>Thank you, your order has been placed.</strong> Your order number is <strong>{order.order_ref}</strong>.
          Pay when you collect it.
        </div>
      )}

      <section className="checkout-panel">
        <div className="order-detail-head">
          <div>
            <h3>Order {order.order_ref}</h3>
            <p className="checkout-small">Placed {formatDateTime(order.time_placed)} · Collection</p>
          </div>
          <span className={`order-badge status-${order.order_status.toLowerCase()}`}>{order.status_label}</span>
        </div>

        <StatusSteps status={order.order_status} />
        {!FINAL.includes(order.order_status) && (
          <p className="checkout-small">This page updates by itself every 20 seconds.</p>
        )}
        {order.cancel_reason && <p className="checkout-small">Reason: {order.cancel_reason}</p>}

        <ul className="checkout-lines">
          {order.lines.map((line) => (
            <li key={line.order_item_id}>
              <div className="checkout-line-top">
                <span><strong>{line.quantity} ×</strong> {line.name}</span>
                <span>{formatRand(line.line_total)}</span>
              </div>
              {line.notes && <span className="checkout-small">Note: {line.notes}</span>}
            </li>
          ))}
        </ul>
        {order.special_instructions && <p className="checkout-small">Instructions: {order.special_instructions}</p>}

        <div className="checkout-total">
          <span>Total</span>
          <strong>{formatRand(order.total)}</strong>
        </div>
        <p className="checkout-small">
          {order.payment ? `Paid · receipt ${order.payment.receipt_number}` : 'Not paid yet - pay when you collect.'}
        </p>

        {error && <div className="checkout-error" role="alert">⚠ {error}</div>}

        <div className="order-actions">
          <Link to="/my-orders" className="checkout-edit">All my orders</Link>
          {order.order_status === 'PENDING' && (
            <button type="button" className="order-cancel" onClick={cancel} disabled={cancelling}>
              {cancelling ? 'Cancelling…' : 'Cancel order'}
            </button>
          )}
        </div>
      </section>
    </div>
  );
}

function OrderList() {
  const authRedirect = useAuthRedirect();
  const [orders, setOrders] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    ordersApi.list({ limit: 50 })
      .then((response) => setOrders(response.data.orders || []))
      .catch((err) => { if (!authRedirect(err, '/my-orders')) setError(err.message); });
  }, [authRedirect]);

  if (error) return <div className="checkout-error" role="alert">⚠ {error}</div>;
  if (!orders) return <p className="order-loading">Loading your orders…</p>;
  if (orders.length === 0) {
    return (
      <section className="checkout-panel checkout-empty">
        <h2>No orders yet</h2>
        <p>Orders you place online will appear here.</p>
        <Link to="/menu" className="checkout-primary">Explore menu</Link>
      </section>
    );
  }

  return (
    <ul className="order-list">
      {orders.map((o) => (
        <li key={o.order_ref}>
          <Link to={`/my-orders/${encodeURIComponent(o.order_ref)}`} className="checkout-panel order-list-item">
            <div>
              <strong>{o.order_ref}</strong>
              <span className="checkout-small">{formatDateTime(o.time_placed)} · {o.item_count} item{o.item_count === 1 ? '' : 's'}</span>
            </div>
            <div className="order-list-right">
              <span className={`order-badge status-${o.order_status.toLowerCase()}`}>{o.status_label}</span>
              <strong>{formatRand(o.total)}</strong>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function MyOrders() {
  const { ref } = useParams();
  const user = getUser();

  if (user?.role !== ROLES.CUSTOMER) {
    const next = ref ? `/my-orders/${ref}` : '/my-orders';
    return <Navigate to={`/login?next=${encodeURIComponent(next)}`} replace />;
  }

  return (
    <>
      <CustomerAccountBar />
      <main className="checkout-page">
        <header className="checkout-header order-header">
          <p className="eyebrow">UBUNTU BISTRO</p>
          <h2>{ref ? 'Your order' : 'My orders'}</h2>
        </header>
        <div className="order-wrap">
          {ref ? <OrderDetail orderRef={ref} /> : <OrderList />}
        </div>
      </main>
    </>
  );
}

export default MyOrders;
