import { useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { authApi } from '../../api/modules';
import { getUser, setSession } from '../../auth/session';
import { ROLES } from '../../auth/permissions';
import CustomerAccountBar from '../../components/CustomerAccountBar';
import '../StaffLogin.css';
import './CustomerLogin.css';

// Customer portal login and registration (Analysis 11.1; FR-01, FR-02,
// FR-24). Uses POST /api/auth/login and /api/auth/register. The server sets
// the httpOnly session cookie; only the user's name and role are kept here.

const PASSWORD_RULE = 'At least 8 characters with an upper-case letter, a lower-case letter and a number.';
const NAME = /^[\p{L}][\p{L} '-]*$/u;
const PHONE = /^(0\d{9}|\+27\d{9})$/;

// Only same-site paths, so ?next= can't send people to another website
const safeNext = (next) => (next && next.startsWith('/') && !next.startsWith('//') ? next : '/menu');

function validateRegister(f) {
  const e = {};
  for (const [key, label] of [['first_name', 'First name'], ['last_name', 'Last name']]) {
    const v = f[key].trim();
    if (v.length < 2 || v.length > 50) e[key] = `${label} must be 2–50 characters.`;
    else if (!NAME.test(v)) e[key] = `${label} can only contain letters, spaces, hyphens and apostrophes.`;
  }
  if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
  if (!PHONE.test(f.phone.replace(/[\s-]/g, ''))) e.phone = 'Enter a 10-digit number, e.g. 0821234567 or +27821234567.';
  if (f.password.length < 8 || !/[A-Z]/.test(f.password) || !/[a-z]/.test(f.password) || !/\d/.test(f.password)) {
    e.password = PASSWORD_RULE;
  }
  if (f.confirm_password !== f.password) e.confirm_password = 'Passwords do not match.';
  return e;
}

function Field({ id, label, type = 'text', value, onChange, error, autoComplete, hint }) {
  return (
    <>
      <label htmlFor={id}>{label} <span aria-hidden="true">*</span></label>
      <input
        id={id}
        type={type}
        value={value}
        autoComplete={autoComplete}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      />
      {hint && !error && <p className="customer-login-hint" id={`${id}-hint`}>{hint}</p>}
      {error && <p className="staff-login-field-error" id={`${id}-error`}>{error}</p>}
    </>
  );
}

function CustomerLogin() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));
  const current = getUser();

  const [mode, setMode] = useState(params.get('mode') === 'register' ? 'register' : 'login');
  const [form, setForm] = useState({
    email: '', password: '', first_name: '', last_name: '', phone: '', confirm_password: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (current?.role === ROLES.CUSTOMER) return <Navigate to={next} replace />;

  // Editing a field clears its message, so corrected fields stop showing errors
  const set = (key) => (value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFieldErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  function switchMode(to) {
    setMode(to);
    setError('');
    setNotice('');
    setFieldErrors({});
  }

  async function signIn(email, password) {
    const response = await authApi.login(email.trim(), password);
    setSession({ user: response.data.user });
    navigate(next, { replace: true });
  }

  async function handleLogin(event) {
    event.preventDefault();
    const errors = {};
    if (!form.email.trim()) errors.email = 'Enter your email address.';
    if (!form.password) errors.password = 'Enter your password.';
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setError('');
    try {
      await signIn(form.email, form.password);
    } catch (err) {
      // Server messages are user-friendly: wrong details, lockout, inactive,
      // or a staff account on the customer portal.
      setError(err.code === 'WRONG_PORTAL'
        ? 'This is a staff account. Please use the staff portal (link below).'
        : err.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRegister(event) {
    event.preventDefault();
    const errors = validateRegister(form);
    setFieldErrors(errors);
    if (Object.keys(errors).length) return;

    setSubmitting(true);
    setError('');
    try {
      await authApi.register({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        password: form.password,
        confirm_password: form.confirm_password,
      });
    } catch (err) {
      if (err.fields?.length) setFieldErrors(err.fieldErrors());
      setError(err.message);
      setSubmitting(false);
      return;
    }

    // Account created - sign straight in so they can carry on to checkout
    try {
      await signIn(form.email, form.password);
    } catch {
      switchMode('login');
      setNotice('Your account was created. Please log in.');
    } finally {
      setSubmitting(false);
    }
  }

  const registering = mode === 'register';

  return (
    <>
      <CustomerAccountBar />
      <main className="staff-login-page customer-login-page">
        <form
          className="staff-login-card"
          onSubmit={registering ? handleRegister : handleLogin}
          noValidate
        >
          <div className="staff-login-logo" aria-hidden="true">UB</div>
          <h1>{registering ? 'Create your account' : 'Customer login'}</h1>
          <p className="staff-login-subtitle">
            {registering ? 'Register to order online and track your orders.' : 'Log in to check out and see your orders.'}
          </p>

          {notice && <div className="customer-login-notice" role="status">{notice}</div>}
          {error && <div className="staff-login-error" role="alert">⚠ {error}</div>}

          {registering && (
            <div className="customer-login-names">
              <div>
                <Field id="first_name" label="First name" value={form.first_name} onChange={set('first_name')}
                  error={fieldErrors.first_name} autoComplete="given-name" />
              </div>
              <div>
                <Field id="last_name" label="Last name" value={form.last_name} onChange={set('last_name')}
                  error={fieldErrors.last_name} autoComplete="family-name" />
              </div>
            </div>
          )}

          <Field id="email" label="Email" type="email" value={form.email} onChange={set('email')}
            error={fieldErrors.email} autoComplete="email" />

          {registering && (
            <Field id="phone" label="Phone number" type="tel" value={form.phone} onChange={set('phone')}
              error={fieldErrors.phone} autoComplete="tel" hint="e.g. 0821234567" />
          )}

          <Field id="password" label="Password" type="password" value={form.password} onChange={set('password')}
            error={fieldErrors.password} autoComplete={registering ? 'new-password' : 'current-password'}
            hint={registering ? PASSWORD_RULE : undefined} />

          {registering && (
            <Field id="confirm_password" label="Confirm password" type="password" value={form.confirm_password}
              onChange={set('confirm_password')} error={fieldErrors.confirm_password} autoComplete="new-password" />
          )}

          <button type="submit" disabled={submitting}>
            {submitting ? 'Please wait…' : registering ? 'Create account' : 'Log in'}
          </button>

          <p className="staff-login-footer">
            {registering ? (
              <>Already have an account?{' '}
                <button type="button" className="staff-login-link" onClick={() => switchMode('login')}>Log in</button></>
            ) : (
              <>New here?{' '}
                <button type="button" className="staff-login-link" onClick={() => switchMode('register')}>Create an account</button></>
            )}
          </p>
          <p className="staff-login-footer">
            Staff? <Link to="/staff/login">Go to the staff portal</Link>
          </p>
        </form>
      </main>
    </>
  );
}

export default CustomerLogin;
