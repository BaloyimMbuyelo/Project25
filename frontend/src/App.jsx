
import { useState } from 'react';
import './App.css';

import MenuManagement from './pages/MenuManagement';
import InventoryManagement from './pages/InventoryManagement';
import OrdersManagement from './pages/OrdersManagement';
import ReservationsManagement from './pages/ReservationsManagement';
import PaymentsManagement from './pages/PaymentsManagement';
import ReportsManagement from './pages/ReportsManagement';

// Main navigation
const menuItems = [
  { name: 'Dashboard', icon: '▦' },
  { name: 'Orders', icon: '▤' },
  { name: 'Reservations', icon: '▣' },
  { name: 'Menu Management', icon: '☷' },
  { name: 'Inventory', icon: '▥' },
  { name: 'Payments', icon: 'R' },
  { name: 'Reports', icon: '▧' },
];

// Dashboard statistics (temporary demonstration data)
const stats = [
  { label: 'Total Orders', value: '128', change: '+12.5%', icon: '▤' },
  { label: 'Reservations', value: '36', change: '+8.2%', icon: '▣' },
  { label: 'Revenue', value: 'R 18,450', change: '+15.3%', icon: 'R' },
  { label: 'Low Stock Items', value: '08', change: 'Needs attention', icon: '▥' },
];

// Recent orders (temporary demonstration data)
const orders = [
  {
    id: '#UB001',
    customer: 'Customer 01',
    item: 'Grilled Chicken',
    amount: 'R 185',
    status: 'Completed',
  },
  {
    id: '#UB002',
    customer: 'Customer 02',
    item: 'Beef Burger',
    amount: 'R 120',
    status: 'Preparing',
  },
  {
    id: '#UB003',
    customer: 'Customer 03',
    item: 'Creamy Pasta',
    amount: 'R 145',
    status: 'Pending',
  },
  {
    id: '#UB004',
    customer: 'Customer 04',
    item: 'Garden Salad',
    amount: 'R 95',
    status: 'Completed',
  },
];

function App() {
  const [activePage, setActivePage] = useState('Dashboard');

  // Navigation handler
  const handleNavigation = (page) => {
    setActivePage(page);
  };

  // Dashboard component
  const Dashboard = () => (
    <>
      <section className="welcome">
        <div>
          <p className="eyebrow">
            UBUNTU BISTRO MANAGEMENT SYSTEM
          </p>

          <h2>Welcome back, Administrator!</h2>

          <p>
            Here's an overview of your restaurant operations.
          </p>
        </div>

        <div className="welcome-icon">✦</div>
      </section>

      {/* Statistics cards */}
      <section className="stats-grid">
        {stats.map((stat) => (
          <div className="stat-card" key={stat.label}>
            <div className="stat-top">
              <span>{stat.label}</span>
              <div className="stat-icon">{stat.icon}</div>
            </div>

            <h2>{stat.value}</h2>

            <span className="stat-change">
              {stat.change}
            </span>
          </div>
        ))}
      </section>

      {/* Recent orders and quick access */}
      <section className="content-grid">
        <div className="panel orders-panel">
          <div className="panel-heading">
            <div>
              <h3>Recent Orders</h3>
              <p>Overview of recent restaurant orders</p>
            </div>

            <button
              type="button"
              className="outline-button"
              onClick={() => handleNavigation('Orders')}
            >
              View All
            </button>
          </div>

          <div className="table-wrapper">
            <table>
              <thead>
                <tr>
                  <th>Order ID</th>
                  <th>Customer</th>
                  <th>Item</th>
                  <th>Amount</th>
                  <th>Status</th>
                </tr>
              </thead>

              <tbody>
                {orders.map((order) => (
                  <tr key={order.id}>
                    <td>{order.id}</td>
                    <td>{order.customer}</td>
                    <td>{order.item}</td>
                    <td>{order.amount}</td>

                    <td>
                      <span
                        className={`status ${order.status.toLowerCase()}`}
                      >
                        {order.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel quick-panel">
          <h3>Quick Access</h3>
          <p>Navigate to restaurant operations.</p>

          {[
            'Orders',
            'Reservations',
            'Menu Management',
            'Inventory',
            'Payments',
            'Reports',
          ].map((item) => (
            <button
              type="button"
              className="quick-link"
              key={item}
              onClick={() => handleNavigation(item)}
            >
              <span>{item}</span>
              <span>→</span>
            </button>
          ))}
        </div>
      </section>
    </>
  );

  // Placeholder for modules still under development
  const ComingSoon = ({ page }) => (
    <section className="panel" style={{ padding: '35px' }}>
      <div style={{ textAlign: 'center', padding: '35px 10px' }}>
        <div
          style={{
            fontSize: '42px',
            color: '#b87845',
            marginBottom: '15px',
          }}
        >
          ✦
        </div>

        <h2>{page}</h2>

        <p style={{ marginTop: '12px', color: '#888' }}>
          The {page} module is currently under development.
        </p>

        <p
          style={{
            marginTop: '8px',
            color: '#888',
            fontSize: '13px',
          }}
        >
          This module will be implemented as part of UBMS Release 1.
        </p>

        <button
          type="button"
          className="outline-button"
          style={{ marginTop: '22px' }}
          onClick={() => handleNavigation('Dashboard')}
        >
          Back to Dashboard
        </button>
      </div>
    </section>
  );

  // Main application layout
  return (
    <div className="app">

      {/* Sidebar */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">UB</div>

          <div>
            <h2>UBUNTU BISTRO</h2>
            <span>Management System</span>
          </div>
        </div>

        <p className="nav-heading">MAIN MENU</p>

        <nav>
          {menuItems.map((item) => (
            <button
              key={item.name}
              type="button"
              className={`nav-item ${
                activePage === item.name ? 'active' : ''
              }`}
              onClick={() => handleNavigation(item.name)}
            >
              <span className="nav-icon">
                {item.icon}
              </span>

              {item.name}
            </button>
          ))}
        </nav>

        {/* User profile */}
        <div className="sidebar-bottom">
          <div className="user-avatar">MB</div>

          <div>
            <strong>System Admin</strong>
            <span>Administrator</span>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="main-content">

        {/* Top navigation */}
        <header className="topbar">
          <div>
            <span className="breadcrumb">
              UBMS / {activePage}
            </span>

            <h1>{activePage}</h1>
          </div>

          <div className="topbar-right">
            <span className="date-label">
              Restaurant Management
            </span>

            <div className="profile-avatar">MB</div>
          </div>
        </header>

        {/* Page content */}
        {activePage === 'Dashboard' && <Dashboard />}

        {activePage === 'Menu Management' && (
          <MenuManagement />
        )}

        {activePage === 'Inventory' && (
          <InventoryManagement />
        )}

        {activePage === 'Orders' && (
          <OrdersManagement />
        )}

        {activePage === 'Reservations' && (
          <ReservationsManagement />
        )}

        {activePage === 'Payments' && (
          <PaymentsManagement />
        )}

        {activePage === 'Reports' && (
          <ReportsManagement />
        )}

        {/* Only show placeholders for unfinished modules */}
        {activePage !== 'Dashboard' &&
          activePage !== 'Menu Management' &&
          activePage !== 'Inventory' &&
          activePage !== 'Orders' &&
          activePage !== 'Reservations' &&
          activePage !== 'Payments' &&
          activePage !== 'Reports' && (
            <ComingSoon page={activePage} />
          )}

        {/* Footer */}
        <footer>
          <span>Ubuntu Bistro Management System</span>
          <span>Group 25 | Release 1</span>
        </footer>

      </main>
    </div>
  );
}

export default App;
