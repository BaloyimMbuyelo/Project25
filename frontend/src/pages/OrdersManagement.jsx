import { useCallback, useEffect, useMemo, useState } from 'react';
import { menuApi, ordersApi, reservationsApi } from '../api/modules';
import { getUser } from '../auth/session';
import { ROLES } from '../auth/permissions';
import { formatDateTime, formatRand } from '../utils/format';
import './OrdersManagement.css';

// Staff orders (P4/P5; FR-08 to FR-11, FR-22; Analysis FR-05, FR-07, FR-19).
// Waiters and managers capture dine-in and collection orders; the kitchen
// sees its active queue and moves orders to Preparing and Ready; cashiers
// see what is ready for payment. Prices, totals and allowed status changes
// are decided by the API - this screen only shows them.

const STATUS_FILTERS = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'COMPLETED', 'CANCELLED'];
const LABELS = { PENDING: 'Pending', CONFIRMED: 'Confirmed', PREPARING: 'Preparing', READY: 'Ready', COMPLETED: 'Completed', CANCELLED: 'Cancelled' };
const TYPE_LABELS = { DINE_IN: 'Dine-in', COLLECTION: 'Collection' };

// Who may move an order to each status (mirrors the API's rules)
const CAN_SET = {
  CONFIRMED: [ROLES.WAITER, ROLES.MANAGER],
  PREPARING: [ROLES.KITCHEN, ROLES.MANAGER],
  READY: [ROLES.KITCHEN, ROLES.MANAGER],
  COMPLETED: [ROLES.WAITER, ROLES.CASHIER, ROLES.MANAGER],
};
const PLACERS = [ROLES.WAITER, ROLES.MANAGER];
const REFRESH_MS = 20000;

const emptyLine = () => ({ menu_item_id: '', quantity: 1, notes: '' });
const emptyForm = () => ({
  order_type: 'DINE_IN', table_id: '', guest_name: '', guest_phone: '', special_instructions: '', lines: [emptyLine()],
});

function OrdersManagement() {
  const user = getUser();
  const role = user?.role;
  const canPlace = PLACERS.includes(role);
  const isKitchen = role === ROLES.KITCHEN;

  const [orders, setOrders] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [filters, setFilters] = useState({ search: '', status: '', order_type: '', date: '' });
  const [searchText, setSearchText] = useState('');

  const [menu, setMenu] = useState([]);
  const [tables, setTables] = useState([]);
  const [form, setForm] = useState(null); // null = closed; { mode: 'create' | 'edit', ref?, ...fields }
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);

  const [selected, setSelected] = useState(null);
  const [busyRef, setBusyRef] = useState('');
  const [notice, setNotice] = useState('');
  const [actionError, setActionError] = useState('');

  const load = useCallback(async () => {
    try {
      const response = await ordersApi.list({ ...filters, limit: 100 });
      setOrders(response.data.orders || []);
      setSummary(response.data.summary || null);
      setLoadError('');
    } catch (err) {
      setLoadError(err.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
    const timer = setInterval(load, REFRESH_MS); // kitchen queue stays current
    return () => clearInterval(timer);
  }, [load]);

  // Menu and tables are only needed by roles that capture orders
  useEffect(() => {
    if (!canPlace) return;
    menuApi.items({ available_only: true }).then((r) => setMenu(r.data)).catch(() => setMenu([]));
    reservationsApi.tables().then((r) => setTables((r.data || []).filter((t) => t.status === 'IN_SERVICE'))).catch(() => setTables([]));
  }, [canPlace]);

  // Staff get today's counts from the API (or the chosen date's); fall back
  // to counting the current list
  const counts = useMemo(() => {
    const by = (s) => orders.filter((o) => o.order_status === s).length;
    if (!summary) return { total: orders.length, pending: by('PENDING'), preparing: by('PREPARING'), ready: by('READY') };
    const { date: _date, ...perStatus } = summary;
    return {
      total: Object.values(perStatus).reduce((a, b) => a + b, 0),
      pending: summary.pending,
      preparing: summary.preparing,
      ready: summary.ready,
    };
  }, [orders, summary]);
  const countsLabel = filters.date ? `On ${filters.date}` : 'Today';

  const flash = (message) => {
    setNotice(message);
    setActionError('');
    setTimeout(() => setNotice(''), 4000);
  };

  // ---------- capture / amend ----------

  function openCreate() {
    setForm({ mode: 'create', ...emptyForm() });
    setFormErrors({});
    setFormError('');
    setSelected(null);
  }

  async function openEdit(order) {
    setFormErrors({});
    setFormError('');
    try {
      const detail = (await ordersApi.get(order.order_ref)).data;
      setForm({
        mode: 'edit',
        ref: detail.order_ref,
        order_type: detail.order_type,
        special_instructions: detail.special_instructions || '',
        lines: detail.lines.map((l) => ({ menu_item_id: String(l.menu_item_id), quantity: l.quantity, notes: l.notes || '' })),
      });
      setSelected(null);
    } catch (err) {
      setActionError(err.message);
    }
  }

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };
  const setLine = (index, key, value) =>
    setForm((f) => ({ ...f, lines: f.lines.map((l, i) => (i === index ? { ...l, [key]: value } : l)) }));

  const priceOf = (id) => menu.find((m) => m.menu_item_id === Number(id))?.price || 0;
  const formTotal = form ? form.lines.reduce((t, l) => t + priceOf(l.menu_item_id) * Number(l.quantity || 0), 0) : 0;

  async function saveForm(event) {
    event.preventDefault();
    const errors = {};
    if (form.mode === 'create') {
      if (form.order_type === 'DINE_IN' && !form.table_id) errors.table_id = 'Select a table for dine-in orders.';
      if (form.order_type === 'COLLECTION' && form.guest_name.trim().length < 2) errors.guest_name = 'Enter the customer name.';
    }
    if (form.lines.some((l) => !l.menu_item_id || !(Number(l.quantity) >= 1 && Number(l.quantity) <= 25))) {
      errors.lines = 'Choose a dish and a quantity from 1 to 25 on every row.';
    }
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    const lines = form.lines.map((l) => ({
      menu_item_id: Number(l.menu_item_id),
      quantity: Number(l.quantity),
      notes: l.notes.trim() || undefined,
    }));

    setSaving(true);
    setFormError('');
    try {
      if (form.mode === 'create') {
        const body = {
          order_type: form.order_type,
          lines,
          special_instructions: form.special_instructions.trim() || undefined,
          ...(form.order_type === 'DINE_IN'
            ? { table_id: Number(form.table_id) }
            : { guest_name: form.guest_name.trim(), guest_phone: form.guest_phone.trim() || undefined }),
        };
        const r = await ordersApi.place(body);
        flash(`Order ${r.data.order_ref} created · ${formatRand(r.data.total)}`);
      } else {
        const r = await ordersApi.amend(form.ref, { lines, special_instructions: form.special_instructions.trim() });
        flash(`Order ${r.data.order_ref} updated · new total ${formatRand(r.data.total)}`);
      }
      setForm(null);
      load();
    } catch (err) {
      if (err.fields?.length) setFormErrors(err.fieldErrors());
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  // ---------- status / cancel / view ----------

  async function advance(order) {
    setBusyRef(order.order_ref);
    try {
      const r = await ordersApi.setStatus(order.order_ref, order.next_status);
      flash(`${r.data.order_ref} is now ${r.data.status_label}`);
      if (selected?.order_ref === order.order_ref) setSelected(r.data);
      load();
    } catch (err) {
      setActionError(`${order.order_ref}: ${err.message}`);
    } finally {
      setBusyRef('');
    }
  }

  async function cancel(order) {
    const reason = window.prompt(`Cancel order ${order.order_ref}? Enter the reason (required):`);
    if (reason === null) return;
    setBusyRef(order.order_ref);
    try {
      const r = await ordersApi.cancel(order.order_ref, reason.trim());
      flash(`${r.data.order_ref} cancelled`);
      if (selected?.order_ref === order.order_ref) setSelected(r.data);
      load();
    } catch (err) {
      setActionError(`${order.order_ref}: ${err.message}`);
    } finally {
      setBusyRef('');
    }
  }

  async function view(order) {
    try {
      setSelected((await ordersApi.get(order.order_ref)).data);
      setForm(null);
    } catch (err) {
      setActionError(err.message);
    }
  }

  // Recording the payment completes an order (P7, FR-14), so there is no
  // manual "Complete" step here - a Ready order waits for the cashier.
  const canAdvance = (o) => o.next_status && o.next_status !== 'COMPLETED' && CAN_SET[o.next_status]?.includes(role);
  const canCancel = (o) =>
    [ROLES.WAITER, ROLES.MANAGER].includes(role) && !['READY', 'COMPLETED', 'CANCELLED'].includes(o.order_status) &&
    (role === ROLES.MANAGER || o.order_status === 'PENDING');
  const canAmend = (o) => PLACERS.includes(role) && ['PENDING', 'CONFIRMED'].includes(o.order_status);

  function applySearch(event) {
    event.preventDefault();
    setFilters((f) => ({ ...f, search: searchText.trim() }));
  }

  return (
    <div className="orders-page">
      <div className="orders-heading">
        <div>
          <h2>{isKitchen ? 'Kitchen Queue' : 'Orders Overview'}</h2>
          <p>
            {isKitchen
              ? 'Confirmed orders waiting for the kitchen, oldest first. Updates every 20 seconds.'
              : 'Capture, monitor and update restaurant orders. Updates every 20 seconds.'}
          </p>
        </div>
        {canPlace && (
          <button type="button" className="orders-primary-btn" onClick={openCreate}>
            + Create New Order
          </button>
        )}
      </div>

      {notice && <div className="orders-notice" role="status">{notice}</div>}
      {actionError && <div className="orders-error" role="alert">⚠ {actionError}</div>}

      <section className="orders-summary">
        <div className="orders-summary-card"><span>Orders</span><strong>{counts.total}</strong><small>{countsLabel}</small></div>
        <div className="orders-summary-card"><span>Pending</span><strong>{counts.pending}</strong><small>{countsLabel} · waiting to be confirmed</small></div>
        <div className="orders-summary-card"><span>Preparing</span><strong>{counts.preparing}</strong><small>{countsLabel} · in the kitchen</small></div>
        <div className="orders-summary-card"><span>Ready</span><strong>{counts.ready}</strong><small>{countsLabel} · to serve or collect</small></div>
      </section>

      {form && (
        <form className="orders-form" onSubmit={saveForm} noValidate>
          <h3>{form.mode === 'create' ? 'Create New Order' : `Change Order ${form.ref}`}</h3>

          {form.mode === 'create' && (
            <div className="orders-form-grid">
              <div>
                <label htmlFor="orderType">Order Type</label>
                <select id="orderType" value={form.order_type} onChange={(e) => setField('order_type', e.target.value)}>
                  <option value="DINE_IN">Dine-in</option>
                  <option value="COLLECTION">Collection</option>
                </select>
              </div>

              {form.order_type === 'DINE_IN' ? (
                <div>
                  <label htmlFor="tableId">Table</label>
                  <select id="tableId" value={form.table_id} onChange={(e) => setField('table_id', e.target.value)}
                    aria-invalid={Boolean(formErrors.table_id)}>
                    <option value="">Select table</option>
                    {tables.map((t) => (
                      <option key={t.table_id} value={t.table_id}>{t.table_number} (seats {t.capacity})</option>
                    ))}
                  </select>
                  {formErrors.table_id && <p className="orders-field-error">{formErrors.table_id}</p>}
                </div>
              ) : (
                <>
                  <div>
                    <label htmlFor="guestName">Customer Name</label>
                    <input id="guestName" value={form.guest_name} onChange={(e) => setField('guest_name', e.target.value)}
                      placeholder="Name for collection" aria-invalid={Boolean(formErrors.guest_name)} />
                    {formErrors.guest_name && <p className="orders-field-error">{formErrors.guest_name}</p>}
                  </div>
                  <div>
                    <label htmlFor="guestPhone">Phone (optional)</label>
                    <input id="guestPhone" type="tel" value={form.guest_phone} onChange={(e) => setField('guest_phone', e.target.value)}
                      placeholder="0821234567" aria-invalid={Boolean(formErrors.guest_phone)} />
                    {formErrors.guest_phone && <p className="orders-field-error">{formErrors.guest_phone}</p>}
                  </div>
                </>
              )}
            </div>
          )}

          <div className="orders-items-heading">
            <h4>Order Items</h4>
            <button type="button" className="orders-add-item-btn"
              onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}>
              + Add Item
            </button>
          </div>

          {form.lines.map((line, index) => (
            <div className="orders-item-row" key={index}>
              <div>
                <label htmlFor={`item-${index}`}>Menu Item</label>
                <select id={`item-${index}`} value={line.menu_item_id} onChange={(e) => setLine(index, 'menu_item_id', e.target.value)}>
                  <option value="">Select menu item</option>
                  {menu.map((m) => (
                    <option key={m.menu_item_id} value={m.menu_item_id}>{m.name} – {formatRand(m.price)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor={`qty-${index}`}>Quantity</label>
                <input id={`qty-${index}`} type="number" min="1" max="25" step="1" value={line.quantity}
                  onChange={(e) => setLine(index, 'quantity', e.target.value)} />
              </div>
              <div>
                <label htmlFor={`notes-${index}`}>Notes</label>
                <input id={`notes-${index}`} value={line.notes} maxLength={255} placeholder="e.g. No onions"
                  onChange={(e) => setLine(index, 'notes', e.target.value)} />
              </div>
              <div className="orders-item-price">
                <label>Subtotal</label>
                <strong>{formatRand(priceOf(line.menu_item_id) * Number(line.quantity || 0))}</strong>
              </div>
              {form.lines.length > 1 && (
                <button type="button" className="orders-remove-item"
                  onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== index) }))}>
                  Remove
                </button>
              )}
            </div>
          ))}
          {formErrors.lines && <p className="orders-field-error">{formErrors.lines}</p>}

          <div>
            <label htmlFor="instructions">Special Instructions (optional)</label>
            <input id="instructions" value={form.special_instructions} maxLength={255}
              onChange={(e) => setField('special_instructions', e.target.value)} />
          </div>

          <div className="orders-form-total">
            <span>Estimated Total</span>
            <strong>{formatRand(formTotal)}</strong>
          </div>
          <p className="orders-hint">The final total is calculated by the system when you save.</p>

          {formError && <div className="orders-error" role="alert">⚠ {formError}</div>}

          <div className="orders-form-actions">
            <button type="submit" className="orders-primary-btn" disabled={saving}>
              {saving ? 'Saving…' : form.mode === 'create' ? 'Create Order' : 'Save Changes'}
            </button>
            <button type="button" className="orders-cancel-btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      {selected && (
        <section className="orders-detail-panel">
          <div className="orders-detail-heading">
            <div>
              <h3>Order Details – {selected.order_ref}</h3>
              <p>{selected.customer_name}{selected.customer_phone ? ` · ${selected.customer_phone}` : ''}</p>
            </div>
            <button type="button" className="orders-cancel-btn" onClick={() => setSelected(null)}>Close</button>
          </div>

          <p><strong>Type:</strong> {TYPE_LABELS[selected.order_type]}{selected.table_number ? ` · Table ${selected.table_number}` : ''} · {selected.sales_channel === 'ONLINE' ? 'Online' : 'In-house'}</p>
          <p><strong>Placed:</strong> {formatDateTime(selected.time_placed)}{selected.staff_name ? ` by ${selected.staff_name}` : ''}</p>
          <p><strong>Status:</strong> {selected.status_label}{selected.cancel_reason ? ` – ${selected.cancel_reason}` : ''}</p>
          {selected.special_instructions && <p><strong>Instructions:</strong> {selected.special_instructions}</p>}
          <p><strong>Payment:</strong> {selected.payment ? `Paid · ${selected.payment.receipt_number}` : 'Not paid'}</p>

          <h4>Items</h4>
          {selected.lines.map((line) => (
            <div className="orders-detail-item" key={line.order_item_id}>
              <span>{line.name} × {line.quantity}{line.notes ? ` – ${line.notes}` : ''}</span>
              <strong>{formatRand(line.line_total)}</strong>
            </div>
          ))}
          <div className="orders-form-total">
            <span>Total</span>
            <strong>{formatRand(selected.total)}</strong>
          </div>
        </section>
      )}

      <section className="orders-table-panel">
        <div className="orders-table-heading">
          <div>
            <h3>{isKitchen ? 'Active Orders' : 'Customer Orders'}</h3>
            <p>Online orders and orders captured by staff, from the shared database.</p>
          </div>
          <button type="button" className="orders-reset-btn" onClick={load}>Refresh</button>
        </div>

        <form className="orders-filters" onSubmit={applySearch} role="search">
          <input type="search" placeholder="Search order number, name or phone…" value={searchText}
            onChange={(e) => setSearchText(e.target.value)} aria-label="Search orders" />
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">All Statuses</option>
            {(isKitchen ? ['CONFIRMED', 'PREPARING', 'READY'] : STATUS_FILTERS).map((s) => (
              <option key={s} value={s}>{LABELS[s]}</option>
            ))}
          </select>
          <select value={filters.order_type} onChange={(e) => setFilters((f) => ({ ...f, order_type: e.target.value }))} aria-label="Order type">
            <option value="">All Order Types</option>
            <option value="DINE_IN">Dine-in</option>
            <option value="COLLECTION">Collection</option>
          </select>
          <input type="date" value={filters.date} onChange={(e) => setFilters((f) => ({ ...f, date: e.target.value }))} aria-label="Date" />
        </form>

        {loadError && <div className="orders-error" role="alert">⚠ {loadError} <button type="button" onClick={load}>Try again</button></div>}

        <div className="table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order</th>
                <th>Customer / Table</th>
                <th>Type</th>
                <th>Placed</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan="8" className="orders-empty">Loading orders…</td></tr>
              )}
              {!loading && orders.map((order) => (
                <tr key={order.order_ref}>
                  <td><strong>{order.order_ref}</strong></td>
                  <td>{order.customer_name}{order.table_number ? ` · ${order.table_number}` : ''}</td>
                  <td>{TYPE_LABELS[order.order_type]}{order.sales_channel === 'ONLINE' ? ' · Online' : ''}</td>
                  <td>{formatDateTime(order.time_placed)}</td>
                  <td>{order.item_count}</td>
                  <td>{formatRand(order.total)}</td>
                  <td>
                    <span className={`orders-status ${order.order_status.toLowerCase()}`}>{order.status_label}</span>
                  </td>
                  <td>
                    <div className="orders-row-actions">
                      <button type="button" onClick={() => view(order)}>View</button>
                      {canAdvance(order) && (
                        <button type="button" className="orders-advance-btn" disabled={busyRef === order.order_ref}
                          onClick={() => advance(order)}>
                          {`Mark ${LABELS[order.next_status]}`}
                        </button>
                      )}
                      {order.order_status === 'READY' && (
                        <span className="orders-awaiting">Awaiting payment</span>
                      )}
                      {canAmend(order) && (
                        <button type="button" onClick={() => openEdit(order)}>Edit</button>
                      )}
                      {canCancel(order) && (
                        <button type="button" className="orders-delete-btn" disabled={busyRef === order.order_ref}
                          onClick={() => cancel(order)}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && orders.length === 0 && !loadError && (
                <tr><td colSpan="8" className="orders-empty">No matching orders found.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

export default OrdersManagement;
