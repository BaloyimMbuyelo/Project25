
import { useCallback, useEffect, useState } from 'react';
import { paymentsApi } from '../api/modules';
import { getUser } from '../auth/session';
import { hasRole, ROLES } from '../auth/permissions';
import Receipt from '../components/Receipt';
import { formatDate, formatRand, formatTime, todayISO } from '../utils/format';
import useToast from '../utils/useToast';
import './PaymentsManagement.css';

// Module 6.0 Payments (FR-18, FR-19) - System Design wireframes 11B and 11C, P7.
// Payment is taken at the counter and recorded here; there is no live gateway (Q5).

const ORDER_STATUS = {
  PENDING: 'Pending', ACCEPTED: 'Confirmed', PREPARING: 'Preparing',
  READY: 'Ready', COMPLETED: 'Completed', CANCELLED: 'Cancelled',
};
const ORDER_TYPES = { DINE_IN: 'Dine-in', TAKEAWAY: 'Collection' };

const toCents = (value) => Math.round(Number(value) * 100);
const isCash = (method) => method?.method_name?.toLowerCase() === 'cash';

function PaymentsManagement() {
  const user = getUser();
  const canRecord = hasRole(user, [ROLES.CASHIER, ROLES.MANAGER]);
  const canVoid = hasRole(user, [ROLES.MANAGER]);

  const [toast, showToast] = useToast(5000);

  // Day's payments
  const [date, setDate] = useState(todayISO());
  const [statusFilter, setStatusFilter] = useState('');
  const [day, setDay] = useState({ payments: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Record payment
  const [methods, setMethods] = useState([]);
  const [payable, setPayable] = useState([]);
  const [orderRef, setOrderRef] = useState('');
  const [order, setOrder] = useState(null);
  const [orderError, setOrderError] = useState('');
  const [findingOrder, setFindingOrder] = useState(false);
  const [methodId, setMethodId] = useState('');
  const [tendered, setTendered] = useState('');
  const [reference, setReference] = useState('');
  const [payErrors, setPayErrors] = useState({});
  const [saving, setSaving] = useState(false);

  const [receipt, setReceipt] = useState(null);

  const loadDay = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await paymentsApi.list({ date, status: statusFilter || undefined });
      setDay(response.data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [date, statusFilter]);

  const loadPayable = useCallback(async () => {
    try {
      const response = await paymentsApi.payableOrders();
      setPayable(response.data);
    } catch {
      setPayable([]);
    }
  }, []);

  useEffect(() => { loadDay(); }, [loadDay]);

  useEffect(() => {
    if (!canRecord) return;
    loadPayable();
    paymentsApi.methods()
      .then((response) => {
        setMethods(response.data);
        // Sensible default: Cash (System Design 4.7.3)
        const cash = response.data.find(isCash) || response.data[0];
        if (cash) setMethodId(String(cash.payment_method_id));
      })
      .catch(() => setMethods([]));
  }, [canRecord, loadPayable]);

  const method = methods.find((m) => String(m.payment_method_id) === methodId);

  async function findOrder(ref) {
    const value = (ref ?? orderRef).trim();
    if (!value) {
      setOrderError('Enter the order number, e.g. UB-0105.');
      return;
    }

    setFindingOrder(true);
    setOrderError('');
    setPayErrors({});
    try {
      const response = await paymentsApi.order(value);
      setOrder(response.data);
      setOrderRef(response.data.order_ref);
      setTendered(isCash(method) ? response.data.amount_due.toFixed(2) : '');
      setReference('');
    } catch (error) {
      setOrder(null);
      setOrderError(error.message);
    } finally {
      setFindingOrder(false);
    }
  }

  function clearOrder() {
    setOrder(null);
    setOrderRef('');
    setTendered('');
    setReference('');
    setPayErrors({});
    setOrderError('');
  }

  const dueCents = order ? toCents(order.amount_due) : 0;
  const tenderedValid = /^\d+(\.\d{1,2})?$/.test(tendered.trim());
  const changeCents = isCash(method) && tenderedValid ? toCents(tendered) - dueCents : null;

  async function recordPayment(event) {
    event.preventDefault();
    if (!order || !method) return;

    const errors = {};
    if (isCash(method)) {
      if (!tenderedValid) errors.amount_tendered = 'Enter the amount received (max 2 decimals).';
      else if (changeCents < 0) errors.amount_tendered = `Amount received must cover ${formatRand(order.amount_due)}.`;
    } else if (method.requires_reference && !reference.trim()) {
      errors.reference_number = 'Enter the card slip or EFT reference.';
    }

    if (Object.keys(errors).length) {
      setPayErrors(errors);
      return;
    }

    // Confirmation step for a financial action (System Design 4.7.3)
    const confirmText = `Record ${formatRand(order.amount_due)} by ${method.method_name} for ${order.order_ref}?` +
      (isCash(method) ? `\nReceived ${formatRand(tendered)} – change ${formatRand(changeCents / 100)}` : '');
    if (!window.confirm(confirmText)) return;

    setSaving(true);
    try {
      const response = await paymentsApi.record({
        order_ref: order.order_ref,
        payment_method_id: method.payment_method_id,
        amount_tendered: isCash(method) ? Number(tendered) : null,
        reference_number: isCash(method) ? null : reference.trim() || null,
      });

      showToast('success', `${response.message} (${response.data.receipt_number})`);
      clearOrder();
      loadPayable();
      loadDay();

      const receiptResponse = await paymentsApi.receipt(response.data.payment_id);
      setReceipt(receiptResponse.data);
    } catch (error) {
      if (error.fields?.length) setPayErrors(error.fieldErrors());
      else setPayErrors({ form: error.message });
    } finally {
      setSaving(false);
    }
  }

  async function openReceipt(payment) {
    try {
      const response = await paymentsApi.receipt(payment.payment_id);
      setReceipt(response.data);
    } catch (error) {
      showToast('error', error.message);
    }
  }

  async function voidPayment(payment) {
    const reason = window.prompt(
      `Void ${payment.receipt_number} (${formatRand(payment.amount)}, ${payment.method_name}) for ${payment.order_ref}?\n` +
      'The record is kept for audit and the order can be paid again.\n\nReason (required):',
      ''
    );
    if (reason === null) return;
    if (reason.trim().length < 3) {
      showToast('error', 'Enter a reason for voiding this payment.');
      return;
    }

    try {
      const response = await paymentsApi.void(payment.payment_id, reason.trim());
      showToast('success', response.message);
      loadDay();
      loadPayable();
    } catch (error) {
      showToast('error', error.message);
    }
  }

  const summary = day.summary || { count: 0, total_paid: 0, voided: 0, by_method: [] };

  return (
    <div className="payments-page">
      <div className="payments-heading">
        <div>
          <h2>Payments Overview</h2>
          <p>Record counter payments against orders and print receipts. Amounts always come from the order total.</p>
        </div>
      </div>

      {toast && (
        <div className={`payments-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success' ? '✓ ' : '⚠ '}{toast.text}
        </div>
      )}

      <section className="payments-summary">
        <div className="payments-summary-card">
          <span>Payments</span>
          <strong>{summary.count}</strong>
          <small>{formatDate(day.date || date)}</small>
        </div>

        <div className="payments-summary-card">
          <span>Total received</span>
          <strong>{formatRand(summary.total_paid)}</strong>
          <small>Active Paid payments</small>
        </div>

        <div className="payments-summary-card">
          <span>By method</span>
          <div className="payments-by-method">
            {summary.by_method.length === 0 && <small>No payments yet</small>}
            {summary.by_method.map((m) => (
              <small key={m.method_name}>{m.method_name}: {formatRand(m.total)} ({m.count})</small>
            ))}
          </div>
        </div>

        <div className="payments-summary-card">
          <span>Voided</span>
          <strong>{summary.voided}</strong>
          <small>Kept for audit</small>
        </div>
      </section>

      {canRecord && (
        <section className="payments-record">
          <div className="payments-record-order">
            <h3>Record payment</h3>

            <form
              className="payments-find"
              onSubmit={(event) => { event.preventDefault(); findOrder(); }}
            >
              <label htmlFor="orderRef">Order number *</label>
              <div className="payments-find-row">
                <input
                  id="orderRef"
                  value={orderRef}
                  onChange={(event) => setOrderRef(event.target.value)}
                  placeholder="e.g. UB-0105"
                  aria-invalid={Boolean(orderError)}
                />
                <button type="submit" className="payments-secondary-btn" disabled={findingOrder}>
                  {findingOrder ? 'Finding…' : 'Find'}
                </button>
              </div>
              {orderError && <p className="payments-field-error" role="alert">{orderError}</p>}
            </form>

            {!order && (
              <div className="payments-awaiting">
                <h4>Awaiting payment ({payable.length})</h4>
                {payable.length === 0 && <p className="payments-muted">No Ready orders are waiting for payment.</p>}
                <ul>
                  {payable.map((o) => (
                    <li key={o.order_id}>
                      <button type="button" onClick={() => findOrder(o.order_ref)}>
                        <strong>{o.order_ref}</strong>
                        <span>{o.customer_name} · {ORDER_TYPES[o.order_type] || o.order_type}</span>
                        <span className="payments-awaiting-amount">{formatRand(o.total)}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {order && (
              <div className="payments-order-card">
                <div className="payments-order-heading">
                  <strong>
                    Order {order.order_ref} · {order.customer_name} · {ORDER_TYPES[order.order_type] || order.order_type}
                  </strong>
                  <span className={`payments-order-status ${order.order_status.toLowerCase()}`}>
                    {ORDER_STATUS[order.order_status] || order.order_status}
                  </span>
                </div>

                <ul className="payments-lines">
                  {order.lines.map((line, index) => (
                    <li key={`${line.name}-${index}`}>
                      <span>{line.quantity} × {line.name}</span>
                      <span>{formatRand(line.line_total)}</span>
                    </li>
                  ))}
                </ul>

                <div className="payments-amount-due">
                  <span>Amount due</span>
                  <strong>{formatRand(order.amount_due)}</strong>
                </div>

                {!order.payable && (
                  <p className="payments-not-payable" role="alert">⚠ {order.not_payable_reason}</p>
                )}
              </div>
            )}
          </div>

          <form className="payments-record-form" onSubmit={recordPayment} noValidate>
            <h3>Payment</h3>

            <label htmlFor="paymentMethod">Payment method *</label>
            <select
              id="paymentMethod"
              value={methodId}
              onChange={(event) => {
                setMethodId(event.target.value);
                setPayErrors({});
                const next = methods.find((m) => String(m.payment_method_id) === event.target.value);
                if (isCash(next) && order && !tendered) setTendered(order.amount_due.toFixed(2));
              }}
              disabled={!order || !order.payable}
            >
              {methods.map((m) => (
                <option key={m.payment_method_id} value={m.payment_method_id}>{m.method_name}</option>
              ))}
            </select>

            {isCash(method) ? (
              <>
                <label htmlFor="amountTendered">Amount received (R) *</label>
                <input
                  id="amountTendered"
                  inputMode="decimal"
                  value={tendered}
                  onChange={(event) => { setTendered(event.target.value); setPayErrors({}); }}
                  disabled={!order || !order.payable}
                  aria-invalid={Boolean(payErrors.amount_tendered)}
                />
                {order && <small className="payments-help">Must cover {formatRand(order.amount_due)}</small>}
                {payErrors.amount_tendered && <p className="payments-field-error">{payErrors.amount_tendered}</p>}
              </>
            ) : (
              <>
                <label htmlFor="paymentReference">Reference no. (card / EFT) *</label>
                <input
                  id="paymentReference"
                  maxLength={30}
                  value={reference}
                  onChange={(event) => { setReference(event.target.value); setPayErrors({}); }}
                  disabled={!order || !order.payable}
                  placeholder="Card slip or EFT reference"
                  aria-invalid={Boolean(payErrors.reference_number)}
                />
                {payErrors.reference_number && <p className="payments-field-error">{payErrors.reference_number}</p>}
              </>
            )}

            {order && order.payable && isCash(method) && changeCents !== null && changeCents >= 0 && (
              <div className="payments-change">Change due: <strong>{formatRand(changeCents / 100)}</strong></div>
            )}

            {payErrors.form && <div className="payments-form-error" role="alert">⚠ {payErrors.form}</div>}

            <button
              type="submit"
              className="payments-primary-btn payments-record-btn"
              disabled={!order || !order.payable || !method || saving}
            >
              {saving ? 'Recording…' : 'Record payment'}
            </button>

            {order && (
              <button type="button" className="payments-cancel-btn" onClick={clearOrder} disabled={saving}>
                Cancel
              </button>
            )}
          </form>
        </section>
      )}

      <section className="payments-table-panel">
        <div className="payments-table-heading">
          <div>
            <h3>Payments for {formatDate(date)}</h3>
            <p>Voided payments stay on record. Only a Manager can void.</p>
          </div>

          <button type="button" className="payments-reset-btn" onClick={loadDay} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="payments-filters">
          <input
            type="date"
            aria-label="Payment date"
            value={date}
            max={todayISO()}
            onChange={(event) => setDate(event.target.value || todayISO())}
          />

          <select aria-label="Filter by status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
            <option value="">All statuses</option>
            <option value="PAID">Paid</option>
            <option value="VOIDED">Voided</option>
          </select>
        </div>

        <div className="table-wrapper">
          <table className="payments-table">
            <thead>
              <tr>
                <th>Receipt</th>
                <th>Time</th>
                <th>Order</th>
                <th>Customer</th>
                <th>Method</th>
                <th>Amount</th>
                <th>Status</th>
                <th>Recorded by</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && <tr><td colSpan="9" className="payments-empty">Loading payments…</td></tr>}

              {!loading && loadError && (
                <tr>
                  <td colSpan="9" className="payments-empty">
                    <span role="alert">{loadError}</span>{' '}
                    <button type="button" className="payments-inline-btn" onClick={loadDay}>Try again</button>
                  </td>
                </tr>
              )}

              {!loading && !loadError && day.payments.map((payment) => (
                <tr key={payment.payment_id}>
                  <td><strong>{payment.receipt_number}</strong></td>
                  <td>{formatTime(payment.paid_at)}</td>
                  <td>{payment.order_ref}</td>
                  <td>{payment.customer_name}</td>
                  <td>
                    {payment.method_name}
                    {payment.reference_number && <small className="payments-ref">{payment.reference_number}</small>}
                  </td>
                  <td>{formatRand(payment.amount)}</td>
                  <td>
                    <span className={`payments-status ${payment.payment_status === 'PAID' ? 'paid' : 'voided'}`}>
                      {payment.payment_status === 'PAID' ? 'Paid' : 'Voided'}
                    </span>
                    {payment.void_reason && <small className="payments-ref">{payment.void_reason}</small>}
                  </td>
                  <td>{payment.recorded_by}</td>
                  <td>
                    <div className="payments-row-actions">
                      <button type="button" onClick={() => openReceipt(payment)}>Receipt</button>
                      {canVoid && payment.payment_status === 'PAID' && (
                        <button type="button" className="payments-delete-btn" onClick={() => voidPayment(payment)}>
                          Void
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && !loadError && day.payments.length === 0 && (
                <tr><td colSpan="9" className="payments-empty">No payments recorded for this day.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {receipt && <Receipt receipt={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

export default PaymentsManagement;
