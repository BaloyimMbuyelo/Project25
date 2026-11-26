import { Link, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/modules';
import { clearSession, getUser } from '../auth/session';
import { ROLES } from '../auth/permissions';
import './CustomerAccountBar.css';

// Top bar on the customer pages: log in / register, or the signed-in
// customer's name with My orders and Log out (Analysis 11.1).
function CustomerAccountBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = getUser();
  const isCustomer = user?.role === ROLES.CUSTOMER;

  async function logout() {
    try {
      await authApi.logout();
    } catch {
      // the server clears the cookie when it can; the tab session is cleared anyway
    }
    clearSession();
    navigate('/menu', { replace: true });
  }

  return (
    <nav className="customer-account-bar" aria-label="Account">
      <Link to="/menu" className="customer-account-brand">Ubuntu Bistro</Link>
      <div className="customer-account-links">
        <Link to="/menu">Menu</Link>
        <Link to="/book">Book a table</Link>
        {isCustomer ? (
          <>
            <Link to="/my-orders">My orders</Link>
            <span className="customer-account-name">Hi, {user.full_name?.split(' ')[0] || 'there'}</span>
            <button type="button" onClick={logout}>Log out</button>
          </>
        ) : (
          <Link to={`/login?next=${encodeURIComponent(location.pathname)}`} className="customer-account-login">
            Log in / Register
          </Link>
        )}
      </div>
    </nav>
  );
}

export default CustomerAccountBar;
