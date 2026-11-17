
import { useEffect, useMemo, useState } from 'react';
import './InventoryManagement.css';

const STORAGE_KEY = 'ubms_inventory_v1';

const sampleInventory = [
  { id: 1, name: 'Chicken', category: 'Meat', quantity: 25, unit: 'kg', minimumStock: 10 },
  { id: 2, name: 'Beef', category: 'Meat', quantity: 18, unit: 'kg', minimumStock: 8 },
  { id: 3, name: 'Potatoes', category: 'Vegetables', quantity: 40, unit: 'kg', minimumStock: 15 },
  { id: 4, name: 'Tomatoes', category: 'Vegetables', quantity: 5, unit: 'kg', minimumStock: 10 },
  { id: 5, name: 'Cooking Oil', category: 'Supplies', quantity: 3, unit: 'litres', minimumStock: 5 },
  { id: 6, name: 'Cheese', category: 'Dairy', quantity: 12, unit: 'kg', minimumStock: 5 },
  { id: 7, name: 'Pasta', category: 'Dry Goods', quantity: 20, unit: 'kg', minimumStock: 8 },
  { id: 8, name: 'Rice', category: 'Dry Goods', quantity: 30, unit: 'kg', minimumStock: 10 },
];

const emptyForm = {
  name: '',
  category: 'Meat',
  quantity: '',
  unit: 'kg',
  minimumStock: '',
};

function getInitialInventory() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : sampleInventory;
  } catch {
    return sampleInventory;
  }
}

function InventoryManagement() {
  const [items, setItems] = useState(getInitialInventory);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [stockFilter, setStockFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [movementItem, setMovementItem] = useState(null);
  const [movementType, setMovementType] = useState('Stock In');
  const [movementQuantity, setMovementQuantity] = useState('');
  const [movementNote, setMovementNote] = useState('');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  const categories = [
    'Meat',
    'Vegetables',
    'Dairy',
    'Dry Goods',
    'Supplies',
    'Beverages',
    'Other',
  ];

  const getStatus = (item) => {
    if (Number(item.quantity) <= 0) return 'Out of Stock';
    if (Number(item.quantity) <= Number(item.minimumStock)) return 'Low Stock';
    return 'In Stock';
  };

  const summary = useMemo(() => ({
    total: items.length,
    inStock: items.filter((item) => getStatus(item) === 'In Stock').length,
    lowStock: items.filter((item) => getStatus(item) === 'Low Stock').length,
    outOfStock: items.filter((item) => getStatus(item) === 'Out of Stock').length,
  }), [items]);

  const filteredItems = items.filter((item) => {
    const matchesSearch = item.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      categoryFilter === 'All' || item.category === categoryFilter;
    const matchesStock =
      stockFilter === 'All' || getStatus(item) === stockFilter;

    return matchesSearch && matchesCategory && matchesStock;
  });

  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  function openEditForm(item) {
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      quantity: String(item.quantity),
      unit: item.unit,
      minimumStock: String(item.minimumStock),
    });
    setShowForm(true);
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  function handleSubmit(event) {
    event.preventDefault();

    const quantity = Number(form.quantity);
    const minimumStock = Number(form.minimumStock);

    if (
      !form.name.trim() ||
      !Number.isFinite(quantity) ||
      quantity < 0 ||
      !Number.isFinite(minimumStock) ||
      minimumStock < 0
    ) {
      alert('Please enter a valid item name, quantity and minimum stock.');
      return;
    }

    const itemData = {
      name: form.name.trim(),
      category: form.category,
      quantity,
      unit: form.unit,
      minimumStock,
    };

    if (editingId !== null) {
      setItems((current) =>
        current.map((item) =>
          item.id === editingId ? { ...item, ...itemData } : item
        )
      );
    } else {
      setItems((current) => [
        ...current,
        { id: Date.now(), ...itemData },
      ]);
    }

    closeForm();
  }

  function openMovement(item, type) {
    setMovementItem(item);
    setMovementType(type);
    setMovementQuantity('');
    setMovementNote('');
  }

  function closeMovement() {
    setMovementItem(null);
    setMovementQuantity('');
    setMovementNote('');
  }

  function saveMovement(event) {
    event.preventDefault();

    const amount = Number(movementQuantity);

    if (!Number.isFinite(amount) || amount <= 0) {
      alert('Enter a quantity greater than zero.');
      return;
    }

    if (
      movementType === 'Stock Out' &&
      amount > Number(movementItem.quantity)
    ) {
      alert('Stock out quantity cannot exceed the available quantity.');
      return;
    }

    setItems((current) =>
      current.map((item) => {
        if (item.id !== movementItem.id) return item;

        const newQuantity = movementType === 'Stock In'
          ? Number(item.quantity) + amount
          : Number(item.quantity) - amount;

        return { ...item, quantity: newQuantity };
      })
    );

    closeMovement();
    alert(`${movementType} recorded successfully.`);
  }

  function deleteItem(id) {
    if (window.confirm('Are you sure you want to delete this inventory item?')) {
      setItems((current) => current.filter((item) => item.id !== id));
    }
  }

  function resetSampleData() {
    if (window.confirm('Reset inventory to the original demonstration data? Your current inventory changes will be lost.')) {
      setItems(sampleInventory);
      setSearch('');
      setCategoryFilter('All');
      setStockFilter('All');
    }
  }

  return (
    <div className="inventory-page">
      <div className="inventory-heading">
        <div>
          <h2>Inventory Overview</h2>
          <p>Monitor ingredients, stock levels and stock movements.</p>
        </div>

        <button className="inventory-primary-btn" onClick={openAddForm}>
          + Add Inventory Item
        </button>
      </div>

      <div className="inventory-demo-note">
        <strong>Demonstration mode:</strong> These are sample inventory records.
        Changes are saved locally in this browser, not in the shared database.
      </div>

      <section className="inventory-summary">
        <div className="inventory-summary-card">
          <span>Total Items</span>
          <strong>{summary.total}</strong>
          <small>Inventory records</small>
        </div>
        <div className="inventory-summary-card">
          <span>In Stock</span>
          <strong>{summary.inStock}</strong>
          <small>Above minimum level</small>
        </div>
        <div className="inventory-summary-card inventory-warning-card">
          <span>Low Stock</span>
          <strong>{summary.lowStock}</strong>
          <small>Restocking recommended</small>
        </div>
        <div className="inventory-summary-card inventory-danger-card">
          <span>Out of Stock</span>
          <strong>{summary.outOfStock}</strong>
          <small>Immediate attention</small>
        </div>
      </section>

      {summary.lowStock + summary.outOfStock > 0 && (
        <div className="inventory-alert">
          <strong>Stock attention required</strong>
          <span>
            {summary.lowStock + summary.outOfStock} item(s) are at or below
            their minimum stock level.
          </span>
        </div>
      )}

      {showForm && (
        <form className="inventory-form" onSubmit={handleSubmit}>
          <h3>{editingId !== null ? 'Edit Inventory Item' : 'Add Inventory Item'}</h3>

          <div className="inventory-form-grid">
            <div>
              <label htmlFor="inventoryName">Item Name</label>
              <input
                id="inventoryName"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Enter item name"
                required
              />
            </div>

            <div>
              <label htmlFor="inventoryCategory">Category</label>
              <select
                id="inventoryCategory"
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {categories.map((category) => (
                  <option key={category}>{category}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="inventoryQuantity">Current Quantity</label>
              <input
                id="inventoryQuantity"
                type="number"
                min="0"
                step="0.01"
                value={form.quantity}
                onChange={(event) => setForm({ ...form, quantity: event.target.value })}
                placeholder="e.g. 25"
                required
              />
            </div>

            <div>
              <label htmlFor="inventoryUnit">Unit</label>
              <select
                id="inventoryUnit"
                value={form.unit}
                onChange={(event) => setForm({ ...form, unit: event.target.value })}
              >
                {['kg', 'g', 'litres', 'ml', 'units', 'packets', 'bottles'].map((unit) => (
                  <option key={unit}>{unit}</option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="minimumStock">Minimum Stock Level</label>
              <input
                id="minimumStock"
                type="number"
                min="0"
                step="0.01"
                value={form.minimumStock}
                onChange={(event) => setForm({ ...form, minimumStock: event.target.value })}
                placeholder="e.g. 10"
                required
              />
            </div>
          </div>

          <div className="inventory-form-actions">
            <button type="submit" className="inventory-primary-btn">
              {editingId !== null ? 'Update Item' : 'Save Item'}
            </button>
            <button type="button" className="inventory-cancel-btn" onClick={closeForm}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {movementItem && (
        <form className="inventory-form" onSubmit={saveMovement}>
          <h3>{movementType}: {movementItem.name}</h3>
          <p className="inventory-current-stock">
            Current quantity: {movementItem.quantity} {movementItem.unit}
          </p>

          <div className="inventory-form-grid">
            <div>
              <label htmlFor="movementQuantity">Quantity</label>
              <input
                id="movementQuantity"
                type="number"
                min="0.01"
                step="0.01"
                value={movementQuantity}
                onChange={(event) => setMovementQuantity(event.target.value)}
                placeholder="Enter quantity"
                required
              />
            </div>

            <div>
              <label htmlFor="movementNote">Reason / Note</label>
              <input
                id="movementNote"
                value={movementNote}
                onChange={(event) => setMovementNote(event.target.value)}
                placeholder="e.g. Supplier delivery or kitchen usage"
              />
            </div>
          </div>

          <div className="inventory-form-actions">
            <button type="submit" className="inventory-primary-btn">
              Record {movementType}
            </button>
            <button type="button" className="inventory-cancel-btn" onClick={closeMovement}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <section className="inventory-table-panel">
        <div className="inventory-table-heading">
          <div>
            <h3>Inventory Items</h3>
            <p>View and manage restaurant ingredients and supplies.</p>
          </div>
          <button className="inventory-reset-btn" onClick={resetSampleData}>
            Reset Sample Data
          </button>
        </div>

        <div className="inventory-filters">
          <input
            type="search"
            placeholder="Search inventory..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />

          <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
            <option value="All">All Categories</option>
            {categories.map((category) => (
              <option key={category}>{category}</option>
            ))}
          </select>

          <select value={stockFilter} onChange={(event) => setStockFilter(event.target.value)}>
            <option value="All">All Stock Levels</option>
            <option value="In Stock">In Stock</option>
            <option value="Low Stock">Low Stock</option>
            <option value="Out of Stock">Out of Stock</option>
          </select>
        </div>

        <div className="table-wrapper">
          <table className="inventory-table">
            <thead>
              <tr>
                <th>Item Name</th>
                <th>Category</th>
                <th>Quantity</th>
                <th>Minimum Stock</th>
                <th>Stock Status</th>
                <th>Stock Movement</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredItems.map((item) => {
                const status = getStatus(item);

                return (
                  <tr key={item.id}>
                    <td><strong>{item.name}</strong></td>
                    <td>{item.category}</td>
                    <td>{item.quantity} {item.unit}</td>
                    <td>{item.minimumStock} {item.unit}</td>
                    <td>
                      <span className={`inventory-status ${status.toLowerCase().replaceAll(' ', '-')}`}>
                        {status}
                      </span>
                    </td>
                    <td>
                      <div className="inventory-movement-actions">
                        <button onClick={() => openMovement(item, 'Stock In')}>Stock In</button>
                        <button onClick={() => openMovement(item, 'Stock Out')}>Stock Out</button>
                      </div>
                    </td>
                    <td>
                      <div className="inventory-row-actions">
                        <button onClick={() => openEditForm(item)}>Edit</button>
                        <button className="inventory-delete-btn" onClick={() => deleteItem(item.id)}>Delete</button>
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredItems.length === 0 && (
                <tr>
                  <td colSpan="7" className="inventory-empty">
                    No matching inventory items found.
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
