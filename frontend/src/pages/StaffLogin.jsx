import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/modules';
import { getUser, setSession } from '../auth/session';
import { ROLES } from '../auth/permissions';
import './StaffLogin.css';

// Staff login (System Design Figure 16, P1).
function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    location.state?.expired ? 'Your session has expired. Please log in again.' : ''
  );
  const [submitting, setSubmitting] = useState(false);

  const destination = location.state?.from && location.state.from !== '/staff/login'
    ? location.state.from
    : '/staff/dashboard';

  const current = getUser();
  if (current && current.role !== ROLES.CUSTOMER) {
    return <Navigate to={destination} replace />;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError('Email/username and password are required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await authApi.login(email.trim(), password);

      if (response.user.role === ROLES.CUSTOMER) {
        setError('Please use the correct login page.');
        return;
      }

      setSession({ token: response.token, user: response.user });
      navigate(destination, { replace: true });
    } catch (err) {
      setError(err.status === 401 ? 'Incorrect username or password.' : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="staff-login-page">
      <form className="staff-login-card" onSubmit={handleSubmit} noValidate>
        <div className="staff-login-logo" aria-hidden="true">UB</div>
        <h1>UBMS Staff Portal</h1>
        <p className="staff-login-subtitle">Authorised staff only</p>

        {error && (
          <div className="staff-login-error" role="alert">
            ⚠ {error}
          </div>
        )}

        <label htmlFor="staffEmail">
          Staff username / email <span aria-hidden="true">*</span>
        </label>
        <input
          id="staffEmail"
          type="email"
          autoComplete="username"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          required
        />

        <label htmlFor="staffPassword">
          Password <span aria-hidden="true">*</span>
        </label>
        <input
          id="staffPassword"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          required
        />

        <button type="submit" disabled={submitting}>
          {submitting ? 'Logging in…' : 'Log in'}
        </button>

        <p className="staff-login-footer">
          Customer? <Link to="/menu">Go to the customer menu</Link>
        </p>
      </form>
    </main>
  );
}

export default StaffLogin;
