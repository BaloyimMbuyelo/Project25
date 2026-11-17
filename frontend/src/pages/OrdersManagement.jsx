
import { useEffect, useMemo, useState } from 'react';
import './OrdersManagement.css';

const STORAGE_KEY = 'ubms_orders_v1';

const menuItems = [
  { id: 1, name: 'Grilled Chicken', price: 195 },
  { id: 2, name: 'Beef Burger', price: 120 },
  { id: 3, name: 'Creamy Pasta', price: 145 },
  { id: 4, name: 'Garden Salad', price: 95 },
  { id: 5, name: 'Chocolate Cake', price: 75 },
];

const sampleOrders = [
  {
    id: 'UB001',
    customer: 'Customer 01',
    orderType: 'Dine In',
    tableNumber: '4',
    items: [{ name: 'Grilled Chicken', price: 195, quantity: 1 }],
    status: 'Completed',
    createdAt: '2026-11-17T08:30:00',
  },
  {
    id: 'UB002',
    customer: 'Customer 02',
    orderType: 'Takeaway',
    tableNumber: '',
    items: [{ name: 'Beef Burger', price: 120, quantity: 1 }],
    status: 'Preparing',
    createdAt: '2026-11-17T09:00:00',
  },
  {
    id: 'UB003',
    customer: 'Customer 03',
    orderType: 'Dine In',
    tableNumber: '2',
    items: [{ name: 'Creamy Pasta', price: 145, quantity: 1 }],
    status: 'Pending',
    createdAt: '2026-11-17T09:15:00',
  },
  {
    id: 'UB004',
    customer: 'Customer 04',
    orderType: 'Takeaway',
    tableNumber: '',
    items: [{ name: 'Garden Salad', price: 95, quantity: 1 }],
    status: 'Ready',
    createdAt: '2026-11-17T09:30:00',
  },
];

const emptyForm = {
  customer: '',
  orderType: 'Dine In',
  tableNumber: '',
  items: [{ menuItemId: '', quantity: 1 }],
};

function getInitialOrders() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : sampleOrders;
  } catch {
    return sampleOrders;
  }
}

function OrdersManagement() {
  const [orders, setOrders] = useState(getInitialOrders);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const statuses = [
    'Pending',
    'Preparing',
    'Ready',
    'Completed',
    'Cancelled',
  ];

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(orders));
  }, [orders]);

  const getTotal = (order) =>
    order.items.reduce(
      (total, item) => total + Number(item.price) * Number(item.quantity),
      0
    );

  const summary = useMemo(() => ({
    total: orders.length,
    pending: orders.filter((order) => order.status === 'Pending').length,
    preparing: orders.filter((order) => order.status === 'Preparing').length,
    completed: orders.filter((order) => order.status === 'Completed').length,
  }), [orders]);

  const filteredOrders = orders.filter((order) => {
    const matchesSearch =
      order.id.toLowerCase().includes(search.toLowerCase()) ||
      order.customer.toLowerCase().includes(search.toLowerCase());

    const matchesStatus =
      statusFilter === 'All' || order.status === statusFilter;

    const matchesType =
      typeFilter === 'All' || order.orderType === typeFilter;

    return matchesSearch && matchesStatus && matchesType;
  });

  function openForm() {
    setForm({
      ...emptyForm,
      items: [{ menuItemId: '', quantity: 1 }],
    });
    setShowForm(true);
    setSelectedOrder(null);
  }

  function closeForm() {
    setShowForm(false);
    setForm(emptyForm);
  }

  function updateOrderItem(index, field, value) {
    setForm((current) => ({
      ...current,
      items: current.items.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      ),
    }));
  }

  function addOrderItem() {
    setForm((current) => ({
      ...current,
      items: [...current.items, { menuItemId: '', quantity: 1 }],
    }));
  }

  function removeOrderItem(index) {
    setForm((current) => ({
      ...current,
      items: current.items.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  const formTotal = form.items.reduce((total, item) => {
    const selected = menuItems.find(
      (menuItem) => menuItem.id === Number(item.menuItemId)
    );
    return total + (selected ? selected.price * Number(item.quantity || 0) : 0);
  }, 0);

  function createOrder(event) {
    event.preventDefault();

    if (!form.customer.trim()) {
      alert('Please enter the customer name.');
      return;
    }

    if (
      form.orderType === 'Dine In' &&
      !form.tableNumber.trim()
    ) {
      alert('Please enter a table number for dine-in orders.');
      return;
    }

    const selectedItems = form.items.map((item) => {
      const menuItem = menuItems.find(
        (entry) => entry.id === Number(item.menuItemId)
      );

      if (!menuItem || Number(item.quantity) < 1) return null;

      return {
        name: menuItem.name,
        price: menuItem.price,
        quantity: Number(item.quantity),
      };
    });

    if (selectedItems.length === 0 || selectedItems.some((item) => !item)) {
      alert('Please select a valid menu item and quantity for every row.');
      return;
    }

    const newOrder = {
      id: `UB${String(Date.now()).slice(-6)}`,
      customer: form.customer.trim(),
      orderType: form.orderType,
      tableNumber: form.orderType === 'Dine In' ? form.tableNumber.trim() : '',
      items: selectedItems,
      status: 'Pending',
      createdAt: new Date().toISOString(),
    };

    setOrders((current) => [newOrder, ...current]);
    closeForm();
    alert('Order created successfully!');
  }

  function updateStatus(orderId, newStatus) {
    setOrders((current) =>
      current.map((order) =>
        order.id === orderId
          ? { ...order, status: newStatus }
          : order
      )
    );

    setSelectedOrder((current) =>
      current?.id === orderId
        ? { ...current, status: newStatus }
        : current
    );
  }

  function deleteOrder(orderId) {
    if (window.confirm('Are you sure you want to delete this order?')) {
      setOrders((current) =>
        current.filter((order) => order.id !== orderId)
      );
      setSelectedOrder(null);
    }
  }

  function resetOrders() {
    if (
      window.confirm(
        'Reset all orders to the original sample data? Your current changes will be lost.'
      )
    ) {
      setOrders(sampleOrders);
      setSearch('');
      setStatusFilter('All');
      setTypeFilter('All');
      setSelectedOrder(null);
    }
  }

  function formatDate(date) {
    return new Date(date).toLocaleString('en-ZA', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }

  return (
    <div className="orders-page">
      <div className="orders-heading">
        <div>
          <h2>Orders Overview</h2>
          <p>Create, monitor and manage restaurant customer orders.</p>
        </div>
        <button className="orders-primary-btn" onClick={openForm}>
          + Create New Order
        </button>
      </div>

      <div className="orders-demo-note">
        <strong>Demonstration mode:</strong> Orders are saved locally in this
        browser. They are not yet connected to the shared MySQL database.
      </div>

      <section className="orders-summary">
        <div className="orders-summary-card">
          <span>Total Orders</span>
          <strong>{summary.total}</strong>
          <small>All recorded orders</small>
        </div>
        <div className="orders-summary-card">
          <span>Pending Orders</span>
          <strong>{summary.pending}</strong>
          <small>Awaiting preparation</small>
        </div>
        <div className="orders-summary-card">
          <span>Preparing</span>
          <strong>{summary.preparing}</strong>
          <small>Currently being prepared</small>
        </div>
        <div className="orders-summary-card">
          <span>Completed</span>
          <strong>{summary.completed}</strong>
          <small>Successfully completed</small>
        </div>
      </section>

      {showForm && (
        <form className="orders-form" onSubmit={createOrder}>
          <h3>Create New Order</h3>

          <div className="orders-form-grid">
            <div>
              <label htmlFor="orderCustomer">Customer Name</label>
              <input
                id="orderCustomer"
                value={form.customer}
                onChange={(event) =>
                  setForm({ ...form, customer: event.target.value })
                }
                placeholder="Enter customer name"
                required
              />
            </div>

            <div>
              <label htmlFor="orderType">Order Type</label>
              <select
                id="orderType"
                value={form.orderType}
                onChange={(event) =>
                  setForm({
                    ...form,
                    orderType: event.target.value,
                    tableNumber: '',
                  })
                }
              >
                <option>Dine In</option>
                <option>Takeaway</option>
              </select>
            </div>

            {form.orderType === 'Dine In' && (
              <div>
                <label htmlFor="tableNumber">Table Number</label>
                <input
                  id="tableNumber"
                  value={form.tableNumber}
                  onChange={(event) =>
                    setForm({ ...form, tableNumber: event.target.value })
                  }
                  placeholder="Enter table number"
                  required
                />
              </div>
            )}
          </div>

          <div className="orders-items-heading">
            <h4>Order Items</h4>
            <button
              type="button"
              className="orders-add-item-btn"
              onClick={addOrderItem}
            >
              + Add Item
            </button>
          </div>

          {form.items.map((item, index) => {
            const selected = menuItems.find(
              (menuItem) => menuItem.id === Number(item.menuItemId)
            );

            return (
              <div className="orders-item-row" key={index}>
                <div>
                  <label>Menu Item</label>
                  <select
                    value={item.menuItemId}
                    onChange={(event) =>
                      updateOrderItem(index, 'menuItemId', event.target.value)
                    }
                    required
                  >
                    <option value="">Select menu item</option>
                    {menuItems.map((menuItem) => (
                      <option key={menuItem.id} value={menuItem.id}>
                        {menuItem.name} - R {menuItem.price.toFixed(2)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label>Quantity</label>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={item.quantity}
                    onChange={(event) =>
                      updateOrderItem(index, 'quantity', event.target.value)
                    }
                    required
                  />
                </div>

                <div className="orders-item-price">
                  <label>Subtotal</label>
                  <strong>
                    R {((selected?.price || 0) * Number(item.quantity || 0)).toFixed(2)}
                  </strong>
                </div>

                {form.items.length > 1 && (
                  <button
                    type="button"
                    className="orders-remove-item"
                    onClick={() => removeOrderItem(index)}
                  >
                    Remove
                  </button>
                )}
              </div>
            );
          })}

          <div className="orders-form-total">
            <span>Order Total</span>
            <strong>R {formTotal.toFixed(2)}</strong>
          </div>

          <div className="orders-form-actions">
            <button type="submit" className="orders-primary-btn">
              Create Order
            </button>
            <button
              type="button"
              className="orders-cancel-btn"
              onClick={closeForm}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {selectedOrder && (
        <section className="orders-detail-panel">
          <div className="orders-detail-heading">
            <div>
              <h3>Order Details – {selectedOrder.id}</h3>
              <p>{selectedOrder.customer}</p>
            </div>
            <button
              className="orders-cancel-btn"
              onClick={() => setSelectedOrder(null)}
            >
              Close
            </button>
          </div>

          <p><strong>Order Type:</strong> {selectedOrder.orderType}</p>
          {selectedOrder.tableNumber && (
            <p><strong>Table:</strong> {selectedOrder.tableNumber}</p>
          )}
          <p><strong>Date:</strong> {formatDate(selectedOrder.createdAt)}</p>
          <p><strong>Status:</strong> {selectedOrder.status}</p>

          <h4>Items</h4>
          {selectedOrder.items.map((item, index) => (
            <div className="orders-detail-item" key={index}>
              <span>{item.name} × {item.quantity}</span>
              <strong>R {(item.price * item.quantity).toFixed(2)}</strong>
            </div>
          ))}

          <div className="orders-form-total">
            <span>Total</span>
            <strong>R {getTotal(selectedOrder).toFixed(2)}</strong>
          </div>
        </section>
      )}

      <section className="orders-table-panel">
        <div className="orders-table-heading">
          <div>
            <h3>Customer Orders</h3>
            <p>View and manage all restaurant orders.</p>
          </div>
          <button className="orders-reset-btn" onClick={resetOrders}>
            Reset Sample Data
          </button>
        </div>

        <div className="orders-filters">
          <input
            type="search"
            placeholder="Search order ID or customer..."
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
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value="All">All Order Types</option>
            <option>Dine In</option>
            <option>Takeaway</option>
          </select>
        </div>

        <div className="table-wrapper">
          <table className="orders-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Customer</th>
                <th>Type</th>
                <th>Items</th>
                <th>Total</th>
                <th>Status</th>
                <th>Update Status</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {filteredOrders.map((order) => (
                <tr key={order.id}>
                  <td><strong>#{order.id}</strong></td>
                  <td>{order.customer}</td>
                  <td>{order.orderType}</td>
                  <td>{order.items.reduce((sum, item) => sum + item.quantity, 0)}</td>
                  <td>R {getTotal(order).toFixed(2)}</td>
                  <td>
                    <span
                      className={`orders-status ${order.status.toLowerCase()}`}
                    >
                      {order.status}
                    </span>
                  </td>
                  <td>
                    <select
                      className="orders-status-select"
                      value={order.status}
                      onChange={(event) =>
                        updateStatus(order.id, event.target.value)
                      }
                    >
                      {statuses.map((status) => (
                        <option key={status}>{status}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <div className="orders-row-actions">
                      <button onClick={() => setSelectedOrder(order)}>
                        View
                      </button>
                      <button
                        className="orders-delete-btn"
                        onClick={() => deleteOrder(order.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}

              {filteredOrders.length === 0 && (
                <tr>
                  <td colSpan="8" className="orders-empty">
                    No matching orders found.
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

export default OrdersManagement;
