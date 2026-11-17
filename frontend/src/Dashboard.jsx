
import { useNavigate } from 'react-router-dom';

// Temporary dashboard demonstration data
const stats = [
  { label: 'Total Orders', value: '128', change: '+12.5%', icon: '▤' },
  { label: 'Reservations', value: '36', change: '+8.2%', icon: '▣' },
  { label: 'Revenue', value: 'R 18,450', change: '+15.3%', icon: 'R' },
  { label: 'Low Stock Items', value: '08', change: 'Needs attention', icon: '▥' },
];

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

function Dashboard() {
  const navigate = useNavigate();

  const quickLinks = [
    { name: 'Orders', path: '/staff/orders' },
    { name: 'Reservations', path: '/staff/reservations' },
    { name: 'Menu Management', path: '/staff/menu' },
    { name: 'Inventory', path: '/staff/inventory' },
    { name: 'Payments', path: '/staff/payments' },
    { name: 'Reports', path: '/staff/reports' },
  ];

  return (
    <>
      {/* Welcome section */}
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
              onClick={() => navigate('/staff/orders')}
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

          {quickLinks.map((item) => (
            <button
              type="button"
              className="quick-link"
              key={item.name}
              onClick={() => navigate(item.path)}
            >
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
