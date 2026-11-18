import { clearSession, getToken } from '../auth/session';

// Single API client (System Design 4.3.1 shared frontend layer): attaches the
// token, unwraps the { data, message } envelope and turns errors into ApiError.

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');

export const SESSION_EXPIRED_EVENT = 'ubms:session-expired';

export class ApiError extends Error {
  constructor(status, error = {}) {
    super(error.message || 'Something went wrong. Please try again.');
    this.name = 'ApiError';
    this.status = status;
    this.code = error.code;
    this.fields = error.fields || [];
    this.details = error.details;
  }

  // { field: message } for showing errors under each input
  fieldErrors() {
    return Object.fromEntries(this.fields.map((f) => [f.field, f.message]));
  }
}

export async function apiRequest(path, { method = 'GET', body, query } = {}) {
  const url = new URL(`${API_BASE}${path}`);

  if (query) {
    Object.entries(query).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    });
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { message: 'Unable to reach the server. Check your connection and try again.' });
  }

  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    // New modules use { error: {...} }; older routes use { message }.
    const error = payload.error || { message: payload.message };
    const tokenProblem = response.status === 401 ||
      (response.status === 403 && /token/i.test(error.message || ''));

    if (tokenProblem && token) {
      clearSession();
      window.dispatchEvent(new Event(SESSION_EXPIRED_EVENT));
      throw new ApiError(401, { message: 'Your session has expired. Please log in again.' });
    }

    throw new ApiError(response.status, error);
  }

  return payload;
}

export const assetUrl = (path) => `${API_BASE}${path}`;
