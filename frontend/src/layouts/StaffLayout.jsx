
import { NavLink, Outlet, useLocation } from 'react-router-dom';

const menuItems = [
  { name: 'Dashboard', path: '/staff/dashboard', icon: '▦' },
  { name: 'Orders', path: '/staff/orders', icon: '▤' },
  { name: 'Reservations', path: '/staff/reservations', icon: '▣' },
  { name: 'Menu Management', path: '/staff/menu', icon: '☷' },
  { name: 'Inventory', path: '/staff/inventory', icon: '▥' },
  { name: 'Payments', path: '/staff/payments', icon: 'R' },
  { name: 'Reports', path: '/staff/reports', icon: '▧' },
];

function StaffLayout() {
  const location = useLocation();

  const currentPage =
    menuItems.find((item) => item.path === location.pathname)?.name
    || 'Dashboard';

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
            <NavLink
              key={item.name}
              to={item.path}
              end
              className={({ isActive }) =>
                `nav-item ${isActive ? 'active' : ''}`
              }
            >
              <span className="nav-icon">{item.icon}</span>
              {item.name}
            </NavLink>
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
        <header className="topbar">
          <div>
            <span className="breadcrumb">
              UBMS / {currentPage}
            </span>

            <h1>{currentPage}</h1>
          </div>

          <div className="topbar-right">
            <span className="date-label">
              Restaurant Management
            </span>

            <div className="profile-avatar">MB</div>
          </div>
        </header>

        {/* Selected page appears here */}
        <Outlet />

        <footer>
          <span>Ubuntu Bistro Management System</span>
          <span>Group 25 | Release 1</span>
        </footer>
      </main>
    </div>
  );
}

export default StaffLayout;
