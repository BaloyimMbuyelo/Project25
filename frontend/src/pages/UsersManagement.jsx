import { useCallback, useEffect, useState } from 'react';
import { usersApi } from '../api/modules';
import { getUser } from '../auth/session';
import { formatDateTime } from '../utils/format';
import './AdminPages.css';

// Users & roles (P11; FR-04; Analysis FR-02, 13.1 "Manager/Admin ... user
// functions"). Administrators create staff accounts with a one-time temporary
// password, change roles, deactivate and reset passwords. Every change is
// written to the audit log by the API. Customer accounts are view-only.

const emptyForm = { full_name: '', email: '', role: 'Waiter', phone: '' };

function UsersManagement() {
  const me = getUser();
  const [type, setType] = useState('staff');
  const [filters, setFilters] = useState({ role: '', status: '', search: '' });
  const [searchText, setSearchText] = useState('');
  const [users, setUsers] = useState(null);
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [secret, setSecret] = useState(null); // { name, password } shown once
  const [form, setForm] = useState(null); // null | { mode: 'create' | 'edit', id?, ...fields }
  const [formErrors, setFormErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState(null);

  const load = useCallback(async () => {
    try {
      const r = await usersApi.list({ type, ...filters });
      setUsers(r.data);
      setError('');
    } catch (err) {
      setError(err.message);
    }
  }, [type, filters]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    usersApi.roles().then((r) => setRoles(r.data.map((x) => x.role_name))).catch(() => setRoles([]));
  }, []);

  const flash = (message) => {
    setNotice(message);
    setTimeout(() => setNotice(''), 5000);
  };

  function openCreate() {
    setForm({ mode: 'create', ...emptyForm });
    setFormErrors({});
    setFormError('');
  }

  function openEdit(u) {
    setForm({ mode: 'edit', id: u.user_id, full_name: u.full_name, email: u.email, role: u.role, phone: u.phone || '' });
    setFormErrors({});
    setFormError('');
  }

  const setField = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setFormErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  async function save(event) {
    event.preventDefault();
    const errors = {};
    if (form.full_name.trim().length < 2) errors.full_name = 'Enter the full name.';
    if (form.email.trim().length < 3) errors.email = 'Enter the username / email.';
    setFormErrors(errors);
    if (Object.keys(errors).length) return;

    const body = { full_name: form.full_name.trim(), email: form.email.trim(), role: form.role, phone: form.phone.trim() };
    if (form.mode === 'edit' && form.role !== users.find((u) => u.user_id === form.id)?.role) {
      if (!window.confirm(`Change ${form.full_name}'s role to ${form.role}? It takes effect on their next request.`)) return;
    }
    setSaving(true);
    setFormError('');
    try {
      if (form.mode === 'create') {
        const r = await usersApi.create(body);
        setSecret({ name: r.data.user.full_name, email: r.data.user.email, password: r.data.temporary_password });
        flash(`${r.data.user.full_name} added as ${r.data.user.role}.`);
      } else {
        const r = await usersApi.update(form.id, body);
        flash(`${r.data.full_name || form.full_name} updated.`);
      }
      setForm(null);
      load();
    } catch (err) {
      if (err.fields?.length) setFormErrors(err.fieldErrors());
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(u) {
    const to = u.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    const verb = to === 'INACTIVE' ? 'Deactivate' : 'Activate';
    if (!window.confirm(`${verb} ${u.full_name}?${to === 'INACTIVE' ? ' They will not be able to log in.' : ''}`)) return;
    setBusyId(u.user_id);
    try {
      await usersApi.setStatus(u.user_id, to);
      flash(`${u.full_name} ${to === 'ACTIVE' ? 'activated' : 'deactivated'}.`);
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  async function reset(u) {
    if (!window.confirm(`Reset ${u.full_name}'s password? They must choose a new one at their next login.`)) return;
    setBusyId(u.user_id);
    try {
      const r = await usersApi.resetPassword(u.user_id);
      setSecret({ name: u.full_name, email: u.email, password: r.data.temporary_password });
      load();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusyId(null);
    }
  }

  const staffView = type === 'staff';

  return (
    <div className="admin-page">
      <div className="admin-heading">
        <div>
          <h2>Users &amp; Roles</h2>
          <p>Staff accounts and what each role can use. Every change is recorded in the audit log.</p>
        </div>
        {staffView && <button type="button" className="admin-primary-btn" onClick={openCreate}>+ Add Staff User</button>}
      </div>

      {notice && <div className="admin-notice" role="status">{notice}</div>}
      {error && <div className="admin-error" role="alert">⚠ {error}</div>}

      {secret && (
        <div className="admin-secret" role="status">
          <div>
            <strong>Temporary password for {secret.name} ({secret.email}):</strong>
            <code>{secret.password}</code>
            <p>It is shown only once. They must change it the first time they log in.</p>
          </div>
          <button type="button" className="admin-secondary-btn" onClick={() => setSecret(null)}>Done</button>
        </div>
      )}

      {form && (
        <form className="admin-panel admin-form" onSubmit={save} noValidate>
          <h3>{form.mode === 'create' ? 'Add Staff User' : `Edit ${form.full_name}`}</h3>
          <div className="admin-form-grid">
            <div>
              <label htmlFor="u-name">Full name *</label>
              <input id="u-name" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} aria-invalid={Boolean(formErrors.full_name)} />
              {formErrors.full_name && <p className="admin-field-error">{formErrors.full_name}</p>}
            </div>
            <div>
              <label htmlFor="u-email">Username / email *</label>
              <input id="u-email" value={form.email} onChange={(e) => setField('email', e.target.value)} aria-invalid={Boolean(formErrors.email)} placeholder="e.g. lerato@ubms.local" />
              {formErrors.email && <p className="admin-field-error">{formErrors.email}</p>}
            </div>
            <div>
              <label htmlFor="u-role">Role *</label>
              <select id="u-role" value={form.role} onChange={(e) => setField('role', e.target.value)}
                disabled={form.mode === 'edit' && form.id === me?.user_id}>
                {roles.map((r) => <option key={r}>{r}</option>)}
              </select>
              {form.mode === 'edit' && form.id === me?.user_id && <p className="admin-hint">You can&apos;t change your own role.</p>}
              {formErrors.role && <p className="admin-field-error">{formErrors.role}</p>}
            </div>
            <div>
              <label htmlFor="u-phone">Phone (optional)</label>
              <input id="u-phone" type="tel" value={form.phone} onChange={(e) => setField('phone', e.target.value)} aria-invalid={Boolean(formErrors.phone)} />
              {formErrors.phone && <p className="admin-field-error">{formErrors.phone}</p>}
            </div>
          </div>
          {form.mode === 'create' && <p className="admin-hint">A temporary password is created and shown once after saving.</p>}
          {formError && <div className="admin-error" role="alert">⚠ {formError}</div>}
          <div className="admin-form-actions">
            <button type="submit" className="admin-primary-btn" disabled={saving}>{saving ? 'Saving…' : form.mode === 'create' ? 'Create User' : 'Save Changes'}</button>
            <button type="button" className="admin-secondary-btn" onClick={() => setForm(null)}>Cancel</button>
          </div>
        </form>
      )}

      <section className="admin-panel">
        <div className="admin-tabs" role="tablist" aria-label="Account type">
          {[['staff', 'Staff'], ['customer', 'Customers']].map(([key, label]) => (
            <button key={key} type="button" role="tab" aria-selected={type === key} className={type === key ? 'active' : ''}
              onClick={() => { setType(key); setFilters((f) => ({ ...f, role: '' })); setForm(null); }}>
              {label}
            </button>
          ))}
        </div>

        <form className="admin-filters" role="search" onSubmit={(e) => { e.preventDefault(); setFilters((f) => ({ ...f, search: searchText.trim() })); }}>
          <input type="search" placeholder="Search name or email…" value={searchText} onChange={(e) => setSearchText(e.target.value)} aria-label="Search users" />
          {staffView && (
            <select value={filters.role} onChange={(e) => setFilters((f) => ({ ...f, role: e.target.value }))} aria-label="Role">
              <option value="">All roles</option>
              {roles.map((r) => <option key={r}>{r}</option>)}
            </select>
          )}
          <select value={filters.status} onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))} aria-label="Status">
            <option value="">Active and inactive</option>
            <option value="ACTIVE">Active</option>
            <option value="INACTIVE">Inactive</option>
          </select>
        </form>

        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th><th>Username / email</th><th>Role</th><th>Status</th><th>Last login</th>
                {staffView && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {users === null && <tr><td colSpan="6" className="admin-empty">Loading…</td></tr>}
              {users?.length === 0 && <tr><td colSpan="6" className="admin-empty">No users found.</td></tr>}
              {users?.map((u) => (
                <tr key={u.user_id}>
                  <td><strong>{u.full_name}</strong>{u.user_id === me?.user_id && <span className="admin-you"> (you)</span>}</td>
                  <td>{u.email}</td>
                  <td>{u.role}</td>
                  <td>
                    <span className={`admin-badge ${u.status === 'ACTIVE' ? 'ok' : 'off'}`}>{u.status === 'ACTIVE' ? 'Active' : 'Inactive'}</span>
                    {u.locked && <span className="admin-badge warn">Locked</span>}
                    {u.must_change_pw && <span className="admin-badge info">Temp password</span>}
                  </td>
                  <td>{u.last_login_at ? formatDateTime(u.last_login_at) : 'Never'}</td>
                  {staffView && (
                    <td>
                      <div className="admin-row-actions">
                        <button type="button" onClick={() => openEdit(u)}>Edit</button>
                        <button type="button" onClick={() => reset(u)} disabled={busyId === u.user_id}>Reset password</button>
                        {u.user_id !== me?.user_id && (
                          <button type="button" className={u.status === 'ACTIVE' ? 'danger' : ''} onClick={() => toggleStatus(u)} disabled={busyId === u.user_id}>
                            {u.status === 'ACTIVE' ? 'Deactivate' : 'Activate'}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!staffView && <p className="admin-hint">Customer accounts are created by customers themselves and can only be viewed here.</p>}
      </section>
    </div>
  );
}

export default UsersManagement;
