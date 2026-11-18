// Who is logged in, for this browser tab (sessionStorage).
// The login token itself is an httpOnly cookie set by the API (System Design
// 4.8.2), so JavaScript never sees it. Only the user's name and role are kept
// here, to drive navigation; the API checks every request.

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
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ user: session.user }));
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

export const getUser = () => getSession()?.user || null;
