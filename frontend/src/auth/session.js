// Staff session held for the browser tab (sessionStorage).
// Note: the System Design targets an httpOnly cookie (4.8.2); this keeps the
// current backend's Bearer-token login working until that change is made.

const SESSION_KEY = 'ubms_staff_session';

export function getSession() {
  try {
    const saved = sessionStorage.getItem(SESSION_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch {
    return null;
  }
}

export function setSession(session) {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage unavailable (private mode) - the user will need to log in again.
  }
}

export function clearSession() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

export const getToken = () => getSession()?.token || null;
export const getUser = () => getSession()?.user || null;
