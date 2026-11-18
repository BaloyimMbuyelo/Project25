
import { useCallback, useEffect, useState } from 'react';
import { inventoryApi } from '../api/modules';
import { getUser } from '../auth/session';
import { hasRole, ROLES } from '../auth/permissions';
import { formatDateTime } from '../utils/format';
import useToast from '../utils/useToast';
import './InventoryManagement.css';

// Module 5.0 Inventory (FR-15 to FR-17) - System Design wireframe 11A, P8.

const MOVEMENT_TYPES = [
  { value: 'STOCK_IN', label: 'Stock in (delivery)', sign: 1 },
  { value: 'STOCK_OUT', label: 'Stock out (usage)', sign: -1 },
  { value: 'WASTAGE', label: 'Wastage', sign: -1, reason: true },
  { value: 'ADJUSTMENT_IN', label: 'Adjustment +', sign: 1, reason: true },
  { value: 'ADJUSTMENT_OUT', label: 'Adjustment −', sign: -1, reason: true },
];

const UNITS = ['kg', 'g', 'l', 'ml', 'ea', 'box', 'jar', 'pack'];

const STATUS_TEXT = { OK: 'OK', LOW: 'LOW STOCK', OUT: 'OUT' };
const STATUS_CLASS = { OK: 'in-stock', LOW: 'low-stock', OUT: 'out-of-stock' };

const toCents = (value) => Math.round(Number(value) * 100);
const has2dp = (value) => /^\d+(\.\d{1,2})?$/.test(String(value).trim());

function statusFor(quantity, reorder) {
  if (toCents(quantity) <= 0) return 'OUT';
  if (toCents(quantity) <= toCents(reorder)) return 'LOW';
  return 'OK';
}

const emptyItemForm = {
  id: null,
  item_name: '',
  category: '',
  unit: 'kg',
  reorder_level: '',
  opening_quantity: '',
};

function InventoryManagement() {
  const user = getUser();
  const canManage = hasRole(user, [ROLES.MANAGER, ROLES.ADMIN]);

  const [data, setData] = useState({ items: [], categories: [], summary: null });
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [toast, showToast] = useToast();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [lowOnly, setLowOnly] = useState(false);
  const [showInactive, setShowInactive] = useState(false);

  const [itemForm, setItemForm] = useState(null);
  const [itemErrors, setItemErrors] = useState({});
  const [itemSaving, setItemSaving] = useState(false);

  const [movementItem, setMovementItem] = useState(null);
  const [movement, setMovement] = useState({ movement_type: 'STOCK_IN', quantity: '', reason: '' });
  const [movementErrors, setMovementErrors] = useState({});
  const [movementSaving, setMovementSaving] = useState(false);

  const [historyItem, setHistoryItem] = useState(null);
  const [history, setHistory] = useState({ loading: false, rows: [], error: '' });

  const loadItems = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await inventoryApi.list({
        search: search.trim() || undefined,
        category: category || undefined,
        low: lowOnly ? 'true' : undefined,
        include_inactive: showInactive ? 'true' : undefined,
      });
      setData(response.data);
    } catch (error) {
      setLoadError(error.message);
    } finally {
      setLoading(false);
    }
  }, [search, category, lowOnly, showInactive]);

  useEffect(() => {
    const timer = window.setTimeout(loadItems, 250); // debounce typing in search
    return () => window.clearTimeout(timer);
  }, [loadItems]);

  // ---------- Add / edit stock item ----------

  function openAdd() {
    setItemForm({ ...emptyItemForm });
    setItemErrors({});
    setMovementItem(null);
  }

  function openEdit(item) {
    setItemForm({
      id: item.inventory_item_id,
      item_name: item.item_name,
      category: item.category || '',
      unit: item.unit,
      reorder_level: String(item.reorder_level),
      opening_quantity: '',
    });
    setItemErrors({});
    setMovementItem(null);
  }

  async function saveItem(event) {
    event.preventDefault();

    const errors = {};
    if (!itemForm.item_name.trim()) errors.item_name = 'Enter the item name.';
    if (!has2dp(itemForm.reorder_level)) errors.reorder_level = 'Enter a number of 0 or more (max 2 decimals).';
    if (!itemForm.id && itemForm.opening_quantity !== '' && !has2dp(itemForm.opening_quantity)) {
      errors.opening_quantity = 'Enter a number of 0 or more (max 2 decimals).';
    }
    if (Object.keys(errors).length) {
      setItemErrors(errors);
      return;
    }

    const body = {
      item_name: itemForm.item_name.trim(),
      category: itemForm.category.trim() || null,
      unit: itemForm.unit,
      reorder_level: Number(itemForm.reorder_level),
    };
    if (!itemForm.id && itemForm.opening_quantity !== '') {
      body.opening_quantity = Number(itemForm.opening_quantity);
    }

    setItemSaving(true);
    try {
      const response = itemForm.id
        ? await inventoryApi.update(itemForm.id, body)
        : await inventoryApi.create(body);
      showToast('success', `${response.message}: ${response.data.item_name}`);
      setItemForm(null);
      loadItems();
    } catch (error) {
      if (error.fields?.length) setItemErrors(error.fieldErrors());
      else setItemErrors({ form: error.message });
    } finally {
      setItemSaving(false);
    }
  }

  async function toggleActive(item) {
    const deactivate = item.is_active;
    if (deactivate && !window.confirm(`Deactivate '${item.item_name}'? It will be hidden from the stock list, but its movement history is kept.`)) {
      return;
    }

    try {
      const response = await inventoryApi.setActive(item.inventory_item_id, !deactivate);
      showToast('success', `${response.message}: ${item.item_name}`);
      loadItems();
    } catch (error) {
      showToast('error', error.message);
    }
  }

  // ---------- Stock movement ----------

  function openMovement(item) {
    setMovementItem(item);
    setMovement({ movement_type: 'STOCK_IN', quantity: '', reason: '' });
    setMovementErrors({});
    setItemForm(null);
  }

  const movementType = MOVEMENT_TYPES.find((t) => t.value === movement.movement_type);
  const quantityValid = has2dp(movement.quantity) && toCents(movement.quantity) > 0;
  const previewCents = movementItem && quantityValid
    ? toCents(movementItem.quantity_on_hand) + movementType.sign * toCents(movement.quantity)
    : null;

  async function saveMovement(event) {
    event.preventDefault();

    const errors = {};
    if (!quantityValid) errors.quantity = 'Quantity must be greater than zero (max 2 decimals).';
    else if (previewCents < 0) {
      errors.quantity = `Not enough stock: only ${Number(movementItem.quantity_on_hand).toFixed(2)} ${movementItem.unit} on hand.`;
    }
    if (movementType.reason && !movement.reason.trim()) errors.reason = 'A reason is required for this movement.';

    if (Object.keys(errors).length) {
      setMovementErrors(errors);
      return;
    }

    setMovementSaving(true);
    try {
      const response = await inventoryApi.recordMovement(movementItem.inventory_item_id, {
        movement_type: movement.movement_type,
        quantity: Number(movement.quantity),
        reason: movement.reason.trim() || null,
      });
      const result = response.data;
      showToast(
        result.low_stock ? 'error' : 'success',
        `${response.message}: ${movementItem.item_name} now ${result.new_quantity.toFixed(2)} ${movementItem.unit}` +
          (result.low_stock ? ` – ${STATUS_TEXT[result.stock_status]}` : '')
      );
      setMovementItem(null);
      loadItems();
      if (historyItem?.inventory_item_id === movementItem.inventory_item_id) openHistory(movementItem);
    } catch (error) {
      if (error.fields?.length) setMovementErrors(error.fieldErrors());
      else setMovementErrors({ form: error.message });
    } finally {
      setMovementSaving(false);
    }
  }

  // ---------- Movement history ----------

  async function openHistory(item) {
    setHistoryItem(item);
    setHistory({ loading: true, rows: [], error: '' });
    try {
      const response = await inventoryApi.movements(item.inventory_item_id);
      setHistory({ loading: false, rows: response.data, error: '' });
    } catch (error) {
      setHistory({ loading: false, rows: [], error: error.message });
    }
  }

  const summary = data.summary || { total: 0, ok: 0, low: 0, out: 0 };
  const unitOptions = itemForm && !UNITS.includes(itemForm.unit) ? [itemForm.unit, ...UNITS] : UNITS;

  return (
    <div className="inventory-page">
      <div className="inventory-heading">
        <div>
          <h2>Inventory Overview</h2>
          <p>Stock levels, low-stock alerts and every stock movement with who recorded it.</p>
        </div>

        {canManage && (
          <button type="button" className="inventory-primary-btn" onClick={openAdd}>
            + Add stock item
          </button>
        )}
      </div>

      {toast && (
        <div className={`inventory-toast ${toast.type}`} role="status" aria-live="polite">
          {toast.type === 'success' ? '✓ ' : '⚠ '}{toast.text}
        </div>
      )}

      <section className="inventory-summary">
        <div className="inventory-summary-card">
          <span>Stock items</span>
          <strong>{summary.total}</strong>
          <small>Active items</small>
        </div>

        <div className="inventory-summary-card">
          <span>OK</span>
          <strong>{summary.ok}</strong>
          <small>Above reorder level</small>
        </div>

        <button
          type="button"
          className={`inventory-summary-card inventory-warning-card inventory-card-button ${lowOnly ? 'active' : ''}`}
          onClick={() => setLowOnly((value) => !value)}
          aria-pressed={lowOnly}
        >
          <span>Low stock</span>
          <strong>{summary.low}</strong>
          <small>At or below reorder level</small>
        </button>

        <button
          type="button"
          className={`inventory-summary-card inventory-danger-card inventory-card-button ${lowOnly ? 'active' : ''}`}
          onClick={() => setLowOnly((value) => !value)}
          aria-pressed={lowOnly}
        >
          <span>Out of stock</span>
          <strong>{summary.out}</strong>
          <small>Nothing on hand</small>
        </button>
      </section>

      {itemForm && (
        <form className="inventory-form" onSubmit={saveItem} noValidate>
          <h3>{itemForm.id ? `Edit ${itemForm.item_name}` : 'Add stock item'}</h3>

          <div className="inventory-form-grid">
            <div>
              <label htmlFor="itemName">Item name *</label>
              <input
                id="itemName"
                maxLength={80}
                value={itemForm.item_name}
                onChange={(e) => setItemForm({ ...itemForm, item_name: e.target.value })}
                aria-invalid={Boolean(itemErrors.item_name)}
              />
              {itemErrors.item_name && <p className="inventory-field-error">{itemErrors.item_name}</p>}
            </div>

            <div>
              <label htmlFor="itemCategory">Category</label>
              <input
                id="itemCategory"
                list="inventoryCategories"
                maxLength={50}
                value={itemForm.category}
                onChange={(e) => setItemForm({ ...itemForm, category: e.target.value })}
                placeholder="e.g. Meat, Vegetables"
              />
              <datalist id="inventoryCategories">
                {data.categories.map((c) => <option key={c} value={c} />)}
              </datalist>
            </div>

            <div>
              <label htmlFor="itemUnit">Unit *</label>
              <select
                id="itemUnit"
                value={itemForm.unit}
                onChange={(e) => setItemForm({ ...itemForm, unit: e.target.value })}
              >
                {unitOptions.map((u) => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="itemReorder">Reorder level *</label>
              <input
                id="itemReorder"
                inputMode="decimal"
                value={itemForm.reorder_level}
                onChange={(e) => setItemForm({ ...itemForm, reorder_level: e.target.value })}
                aria-invalid={Boolean(itemErrors.reorder_level)}
              />
              <small className="inventory-help">Low stock when on hand is at or below this level</small>
              {itemErrors.reorder_level && <p className="inventory-field-error">{itemErrors.reorder_level}</p>}
            </div>

            {!itemForm.id && (
              <div>
                <label htmlFor="itemOpening">Opening quantity</label>
                <input
                  id="itemOpening"
                  inputMode="decimal"
                  value={itemForm.opening_quantity}
                  onChange={(e) => setItemForm({ ...itemForm, opening_quantity: e.target.value })}
                  aria-invalid={Boolean(itemErrors.opening_quantity)}
                />
                <small className="inventory-help">Recorded as a Stock in movement</small>
                {itemErrors.opening_quantity && <p className="inventory-field-error">{itemErrors.opening_quantity}</p>}
              </div>
            )}
          </div>

          {itemForm.id && (
            <p className="inventory-help">
              Quantities can only change through stock movements, so every change is traceable.
            </p>
          )}

          {itemErrors.form && <div className="inventory-form-error" role="alert">⚠ {itemErrors.form}</div>}

          <div className="inventory-form-actions">
            <button type="submit" className="inventory-primary-btn" disabled={itemSaving}>
              {itemSaving ? 'Saving…' : 'Save item'}
            </button>
            <button type="button" className="inventory-cancel-btn" onClick={() => setItemForm(null)} disabled={itemSaving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {movementItem && (
        <form className="inventory-form" onSubmit={saveMovement} noValidate>
          <h3>Record movement – {movementItem.item_name}</h3>
          <p className="inventory-current-stock">
            On hand: <strong>{Number(movementItem.quantity_on_hand).toFixed(2)} {movementItem.unit}</strong>
            {' · '}Reorder level: {Number(movementItem.reorder_level).toFixed(2)} {movementItem.unit}
          </p>

          <div className="inventory-form-grid">
            <div>
              <label htmlFor="movementType">Movement type *</label>
              <select
                id="movementType"
                value={movement.movement_type}
                onChange={(e) => { setMovement({ ...movement, movement_type: e.target.value }); setMovementErrors({}); }}
              >
                {MOVEMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            <div>
              <label htmlFor="movementQuantity">Quantity ({movementItem.unit}) *</label>
              <input
                id="movementQuantity"
                inputMode="decimal"
                value={movement.quantity}
                onChange={(e) => { setMovement({ ...movement, quantity: e.target.value }); setMovementErrors({}); }}
                aria-invalid={Boolean(movementErrors.quantity)}
              />
              {movementErrors.quantity && <p className="inventory-field-error">{movementErrors.quantity}</p>}
            </div>

            <div className="inventory-full-width">
              <label htmlFor="movementReason">
                Reason {movementType.reason ? '*' : '(optional)'}
              </label>
              <input
                id="movementReason"
                maxLength={255}
                value={movement.reason}
                onChange={(e) => { setMovement({ ...movement, reason: e.target.value }); setMovementErrors({}); }}
                placeholder={movementType.reason ? 'Required for wastage and adjustments' : 'e.g. Supplier delivery INV-889'}
                aria-invalid={Boolean(movementErrors.reason)}
              />
              {movementErrors.reason && <p className="inventory-field-error">{movementErrors.reason}</p>}
            </div>
          </div>

          {previewCents !== null && previewCents >= 0 && (
            <p className="inventory-preview">
              New balance: <strong>{(previewCents / 100).toFixed(2)} {movementItem.unit}</strong>
              {' · '}Status after save:{' '}
              <span className={`inventory-status ${STATUS_CLASS[statusFor(previewCents / 100, movementItem.reorder_level)]}`}>
                {STATUS_TEXT[statusFor(previewCents / 100, movementItem.reorder_level)]}
              </span>
            </p>
          )}

          {movementErrors.form && <div className="inventory-form-error" role="alert">⚠ {movementErrors.form}</div>}

          <div className="inventory-form-actions">
            <button type="submit" className="inventory-primary-btn" disabled={movementSaving}>
              {movementSaving ? 'Saving…' : 'Save movement'}
            </button>
            <button type="button" className="inventory-cancel-btn" onClick={() => setMovementItem(null)} disabled={movementSaving}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {historyItem && (
        <section className="inventory-table-panel inventory-history">
          <div className="inventory-table-heading">
            <div>
              <h3>Movement history – {historyItem.item_name}</h3>
              <p>Latest 50 movements, newest first.</p>
            </div>
            <button type="button" className="inventory-cancel-btn" onClick={() => setHistoryItem(null)}>Close</button>
          </div>

          <div className="table-wrapper">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Balance after</th>
                  <th>Reason</th>
                  <th>Recorded by</th>
                </tr>
              </thead>
              <tbody>
                {history.loading && <tr><td colSpan="6" className="inventory-empty">Loading history…</td></tr>}
                {history.error && <tr><td colSpan="6" className="inventory-empty" role="alert">{history.error}</td></tr>}
                {!history.loading && !history.error && history.rows.map((m) => (
                  <tr key={m.movement_id}>
                    <td>{formatDateTime(m.moved_at)}</td>
                    <td>{m.movement_label}</td>
                    <td>{['STOCK_IN', 'ADJUSTMENT_IN'].includes(m.movement_type) ? '+' : '−'}{m.quantity.toFixed(2)} {historyItem.unit}</td>
                    <td>{m.balance_after.toFixed(2)} {historyItem.unit}</td>
                    <td>{m.reason || '—'}</td>
                    <td>{m.recorded_by}</td>
                  </tr>
                ))}
                {!history.loading && !history.error && history.rows.length === 0 && (
                  <tr><td colSpan="6" className="inventory-empty">No movements recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      <section className="inventory-table-panel">
        <div className="inventory-table-heading">
          <div>
            <h3>Stock levels</h3>
            <p>{lowOnly ? 'Showing low and out-of-stock items only.' : 'All active stock items.'}</p>
          </div>
          <button type="button" className="inventory-reset-btn" onClick={loadItems} disabled={loading}>
            Refresh
          </button>
        </div>

        <div className="inventory-filters">
          <input
            type="search"
            aria-label="Search stock items"
            placeholder="Search item name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />

          <select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">All categories</option>
            {data.categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <label className="inventory-check">
            <input type="checkbox" checked={lowOnly} onChange={(e) => setLowOnly(e.target.checked)} />
            Low stock only ({summary.low + summary.out})
          </label>

          {canManage && (
            <label className="inventory-check">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
              Show deactivated
            </label>
          )}
        </div>

        <div className="table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Item</th>
                <th>Category</th>
                <th>Unit</th>
                <th>On hand</th>
                <th>Reorder</th>
                <th>Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading && <tr><td colSpan="7" className="inventory-empty">Loading stock…</td></tr>}

              {!loading && loadError && (
                <tr>
                  <td colSpan="7" className="inventory-empty">
                    <span role="alert">{loadError}</span>{' '}
                    <button type="button" className="inventory-inline-btn" onClick={loadItems}>Try again</button>
                  </td>
                </tr>
              )}

              {!loading && !loadError && data.items.map((item) => (
                <tr key={item.inventory_item_id} className={item.is_active ? '' : 'inventory-inactive-row'}>
                  <td><strong>{item.item_name}</strong></td>
                  <td>{item.category || '—'}</td>
                  <td>{item.unit}</td>
                  <td>{item.quantity_on_hand.toFixed(2)}</td>
                  <td>{item.reorder_level.toFixed(2)}</td>
                  <td>
                    {item.is_active ? (
                      <span className={`inventory-status ${STATUS_CLASS[item.stock_status]}`}>
                        {STATUS_TEXT[item.stock_status]}
                      </span>
                    ) : (
                      <span className="inventory-status inactive">DEACTIVATED</span>
                    )}
                  </td>
                  <td>
                    <div className="inventory-row-actions">
                      {canManage && item.is_active && (
                        <button type="button" onClick={() => openMovement(item)}>Move</button>
                      )}
                      <button type="button" onClick={() => openHistory(item)}>History</button>
                      {canManage && item.is_active && (
                        <button type="button" onClick={() => openEdit(item)}>Edit</button>
                      )}
                      {canManage && (
                        <button
                          type="button"
                          className={item.is_active ? 'inventory-delete-btn' : ''}
                          onClick={() => toggleActive(item)}
                        >
                          {item.is_active ? 'Deactivate' : 'Reactivate'}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}

              {!loading && !loadError && data.items.length === 0 && (
                <tr>
                  <td colSpan="7" className="inventory-empty">
                    {search || category || lowOnly ? 'No stock items match your filters.' : 'No stock items yet.'}
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

export default InventoryManagement;
