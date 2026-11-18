import { useEffect } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { SESSION_EXPIRED_EVENT } from '../api/client';
import { getUser } from './session';
import { hasRole, ROLES } from './permissions';

// Route guard for the staff portal. Not a security control on its own - the
// API checks every request (System Design 4.8.3).
function RequireStaff({ roles, children }) {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  useEffect(() => {
    const onExpired = () =>
      navigate('/staff/login', { replace: true, state: { from: location.pathname, expired: true } });

    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [navigate, location.pathname]);

  if (!user || user.role === ROLES.CUSTOMER) {
    return <Navigate to="/staff/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !hasRole(user, roles)) {
    return (
      <section className="not-authorised" role="alert">
        <div className="not-authorised-icon" aria-hidden="true">🔒</div>
        <h2>You don&apos;t have access to this page.</h2>
        <p>Your role ({user.role}) can only use the functions allowed for it.</p>
        <Link to="/staff/dashboard" className="not-authorised-link">Go to my dashboard</Link>
      </section>
    );
  }

  return children;
}

export default RequireStaff;
