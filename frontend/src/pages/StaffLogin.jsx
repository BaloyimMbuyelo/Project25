import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { authApi } from '../api/modules';
import { clearSession, getUser, setSession } from '../auth/session';
import './StaffLogin.css';

// Staff login (System Design Figure 16, P1) and the first-login password
// change for staff given a temporary password (P11).

const PASSWORD_RULE = 'At least 8 characters with an upper-case letter, a lower-case letter and a number.';

function StaffLogin() {
  const navigate = useNavigate();
  const location = useLocation();
  const current = getUser();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(
    location.state?.expired ? 'Your session has expired. Please log in again.' : ''
  );
  const [submitting, setSubmitting] = useState(false);
  // A customer account used on this page - point them to the customer login
  const [wrongPortal, setWrongPortal] = useState(false);

  // Password change step
  const [mustChange, setMustChange] = useState(Boolean(current?.must_change_pw));
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  const destination = location.state?.from && location.state.from !== '/staff/login'
    ? location.state.from
    : '/staff/dashboard';

  if (current && !current.must_change_pw && !mustChange) {
    return <Navigate to={destination} replace />;
  }

  async function handleLogin(event) {
    event.preventDefault();

    if (!email.trim() || !password) {
      setError('Email/username and password are required.');
      return;
    }

    setSubmitting(true);
    setError('');

    try {
      const response = await authApi.staffLogin(email.trim(), password);
      const { user } = response.data;
      setSession({ user });

      if (user.must_change_pw) {
        setCurrentPassword(password);
        setPassword('');
        setMustChange(true);
        return;
      }

      navigate(destination, { replace: true });
    } catch (err) {
      // Server messages are already user-friendly (generic 401, 429 lockout,
      // inactive account, wrong portal).
      setError(err.message);
      setWrongPortal(err.code === 'WRONG_PORTAL');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleChangePassword(event) {
    event.preventDefault();

    const errors = {};
    if (!currentPassword) errors.current_password = 'Enter your current (temporary) password.';
    if (newPassword.length < 8 || !/[A-Z]/.test(newPassword) || !/[a-z]/.test(newPassword) || !/\d/.test(newPassword)) {
      errors.new_password = PASSWORD_RULE;
    }
    if (confirmPassword !== newPassword) errors.confirm_password = 'Passwords do not match.';
    if (Object.keys(errors).length) {
      setFieldErrors(errors);
      return;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors({});

    try {
      const response = await authApi.changePassword(currentPassword, newPassword, confirmPassword);
      setSession({ user: response.data.user });
      navigate(destination, { replace: true });
    } catch (err) {
      if (err.fields?.length) setFieldErrors(err.fieldErrors());
      else setError(err.message);
      if (err.status === 401) setMustChange(false);
    } finally {
      setSubmitting(false);
    }
  }

  async function cancelChange() {
    try {
      await authApi.logout();
    } catch {
      // the cookie is cleared server-side when possible
    }
    clearSession();
    setMustChange(false);
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
  }

  if (mustChange) {
    return (
      <main className="staff-login-page">
        <form className="staff-login-card" onSubmit={handleChangePassword} noValidate>
          <div className="staff-login-logo" aria-hidden="true">UB</div>
          <h1>Choose a new password</h1>
          <p className="staff-login-subtitle">
            You signed in with a temporary password. Choose your own to continue.
          </p>

          {error && <div className="staff-login-error" role="alert">⚠ {error}</div>}

          {!currentPassword || fieldErrors.current_password ? (
            <>
              <label htmlFor="currentPassword">Current (temporary) password <span aria-hidden="true">*</span></label>
              <input
                id="currentPassword"
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                aria-invalid={Boolean(fieldErrors.current_password)}
              />
              {fieldErrors.current_password && <p className="staff-login-field-error">{fieldErrors.current_password}</p>}
            </>
          ) : null}

          <label htmlFor="newPassword">New password <span aria-hidden="true">*</span></label>
          <input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.new_password)}
            aria-describedby="passwordRule"
          />
          <small id="passwordRule" className="staff-login-help">{PASSWORD_RULE}</small>
          {fieldErrors.new_password && <p className="staff-login-field-error">{fieldErrors.new_password}</p>}

          <label htmlFor="confirmPassword">Confirm new password <span aria-hidden="true">*</span></label>
          <input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            aria-invalid={Boolean(fieldErrors.confirm_password)}
          />
          {fieldErrors.confirm_password && <p className="staff-login-field-error">{fieldErrors.confirm_password}</p>}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save password and continue'}
          </button>

          <p className="staff-login-footer">
            <button type="button" className="staff-login-link" onClick={cancelChange}>Log out instead</button>
          </p>
        </form>
      </main>
    );
  }

  return (
    <main className="staff-login-page">
      <form className="staff-login-card" onSubmit={handleLogin} noValidate>
        <div className="staff-login-logo" aria-hidden="true">UB</div>
        <h1>UBMS Staff Portal</h1>
        <p className="staff-login-subtitle">Authorised staff only</p>

        {error && (
          <div className="staff-login-error" role="alert">
            ⚠ {wrongPortal ? 'This is a customer account. ' : ''}{error}
            {wrongPortal && <> <Link to="/login">Go to the customer login</Link></>}
          </div>
        )}

        <label htmlFor="staffEmail">
          Staff username / email <span aria-hidden="true">*</span>
        </label>
        <input
          id="staffEmail"
          type="text"
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
          Customer? <Link to="/login">Log in here</Link> or <Link to="/menu">see the menu</Link>
        </p>
      </form>
    </main>
  );
}

export default StaffLogin;
