
import { useCallback } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/modules';
import { STAFF_PAGES, hasRole } from '../auth/permissions';
import { clearSession, getUser } from '../auth/session';
import useIdleLogout from '../auth/useIdleLogout';
import { initials } from '../utils/format';

function StaffLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  // Staff see only the modules their role may use (System Design 4.7.2)
  const menuItems = STAFF_PAGES.filter((item) => hasRole(user, item.roles));

  const currentPage =
    STAFF_PAGES.find((item) => item.path === location.pathname)?.name
    || 'Dashboard';

  // Ends the server session (clears the httpOnly cookie) as well as the tab's
  // record of who is logged in (FR-23).
  const endSession = useCallback(async (expired) => {
    try {
      await authApi.logout();
    } catch {
      // Still clear locally if the server cannot be reached
    }
    clearSession();
    navigate('/staff/login', { replace: true, state: expired ? { expired: true } : undefined });
  }, [navigate]);

  const logout = () => endSession(false);

  // 'Your session has expired' after 30 minutes without activity
  useIdleLogout(useCallback(() => endSession(true), [endSession]));

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
          <div className="user-avatar">{initials(user?.full_name)}</div>

          <div>
            <strong>{user?.full_name}</strong>
            <span>{user?.role}</span>
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
              {user?.full_name} · {user?.role}
            </span>

            <button type="button" className="logout-button" onClick={logout}>
              Log out
            </button>
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
