import { apiRequest, apiUpload, assetUrl } from './client';

// One function per endpoint (System Design Table 11). Each returns the
// response envelope { data, message }.

export const authApi = {
  // Customer portal and staff portal logins (P1). The API sets the cookie.
  login: (email, password) => apiRequest('/api/auth/login', { method: 'POST', body: { email, password } }),
  staffLogin: (email, password) => apiRequest('/api/auth/staff-login', { method: 'POST', body: { email, password } }),
  register: (body) => apiRequest('/api/auth/register', { method: 'POST', body }),
  logout: () => apiRequest('/api/auth/logout', { method: 'POST' }),
  me: () => apiRequest('/api/auth/me'),
  changePassword: (currentPassword, newPassword, confirmPassword) =>
    apiRequest('/api/auth/change-password', {
      method: 'POST',
      body: { current_password: currentPassword, new_password: newPassword, confirm_password: confirmPassword },
    }),
};

// Menu (FR-05 to FR-07). Reading is public; changes need Manager or Admin.
export const menuApi = {
  categories: () => apiRequest('/api/v1/menu/categories'),
  items: (query) => apiRequest('/api/v1/menu/items', { query }),
  item: (id) => apiRequest(`/api/v1/menu/items/${id}`),
  create: (body) => apiRequest('/api/v1/menu/items', { method: 'POST', body }),
  update: (id, body) => apiRequest(`/api/v1/menu/items/${id}`, { method: 'PUT', body }),
  setAvailability: (id, isAvailable) =>
    apiRequest(`/api/v1/menu/items/${id}/availability`, { method: 'PATCH', body: { is_available: isAvailable } }),
  remove: (id) => apiRequest(`/api/v1/menu/items/${id}`, { method: 'DELETE' }),
  uploadImage: (id, file) => apiUpload(`/api/v1/menu/items/${id}/image`, 'image', file),
  removeImage: (id) => apiRequest(`/api/v1/menu/items/${id}/image`, { method: 'DELETE' }),
  createCategory: (body) => apiRequest('/api/v1/menu/categories', { method: 'POST', body }),
  updateCategory: (id, body) => apiRequest(`/api/v1/menu/categories/${id}`, { method: 'PUT', body }),
  setCategoryActive: (id, isActive) =>
    apiRequest(`/api/v1/menu/categories/${id}/status`, { method: 'PATCH', body: { is_active: isActive } }),
};

// Uploaded photos live on the API server (/uploads/...); the original sample
// photos are in the frontend's public/images folder.
export const menuImageSrc = (imagePath) =>
  imagePath && imagePath.startsWith('/uploads/') ? assetUrl(imagePath) : imagePath;

export const ordersApi = {
  list: (query) => apiRequest('/api/v1/orders', { query }),
  get: (ref) => apiRequest(`/api/v1/orders/${encodeURIComponent(ref)}`),
  place: (body) => apiRequest('/api/v1/orders', { method: 'POST', body }),
  setStatus: (ref, status) =>
    apiRequest(`/api/v1/orders/${encodeURIComponent(ref)}/status`, { method: 'PATCH', body: { status } }),
  cancel: (ref, reason) =>
    apiRequest(`/api/v1/orders/${encodeURIComponent(ref)}/cancel`, { method: 'POST', body: { reason } }),
};

export const usersApi = {
  roles: () => apiRequest('/api/v1/users/roles'),
  list: (query) => apiRequest('/api/v1/users', { query }),
  create: (body) => apiRequest('/api/v1/users', { method: 'POST', body }),
  update: (id, body) => apiRequest(`/api/v1/users/${id}`, { method: 'PUT', body }),
  setStatus: (id, status) => apiRequest(`/api/v1/users/${id}/status`, { method: 'PATCH', body: { status } }),
  resetPassword: (id) => apiRequest(`/api/v1/users/${id}/reset-password`, { method: 'POST' }),
  audit: (query) => apiRequest('/api/v1/audit', { query }),
};

export const reportsApi = {
  run: (type, query) => apiRequest(`/api/v1/reports/${type}`, { query }),
  // CSV downloads go straight to the browser (the cookie is sent automatically)
  csvUrl: (type, query) => {
    const base = (import.meta.env.VITE_API_URL || 'http://localhost:5000').replace(/\/$/, '');
    const params = new URLSearchParams({ ...query, format: 'csv' });
    return `${base}/api/v1/reports/${type}?${params}`;
  },
};

export const reservationsApi = {
  list: (query) => apiRequest('/api/v1/reservations', { query }),
  get: (ref) => apiRequest(`/api/v1/reservations/${ref}`),
  availability: (date, partySize) =>
    apiRequest('/api/v1/reservations/availability', { query: { date, party_size: partySize } }),
  tables: (date, startTime) =>
    apiRequest('/api/v1/reservations/tables', { query: { date, start_time: startTime } }),
  create: (body) => apiRequest('/api/v1/reservations', { method: 'POST', body }),
  update: (ref, body) => apiRequest(`/api/v1/reservations/${ref}`, { method: 'PATCH', body }),
  changeStatus: (ref, status, reason) =>
    apiRequest(`/api/v1/reservations/${ref}/status`, { method: 'PATCH', body: { status, reason } }),
};

export const inventoryApi = {
  list: (query) => apiRequest('/api/v1/inventory', { query }),
  lowStock: () => apiRequest('/api/v1/inventory/low-stock'),
  create: (body) => apiRequest('/api/v1/inventory', { method: 'POST', body }),
  update: (id, body) => apiRequest(`/api/v1/inventory/${id}`, { method: 'PUT', body }),
  setActive: (id, isActive) =>
    apiRequest(`/api/v1/inventory/${id}/status`, { method: 'PATCH', body: { is_active: isActive } }),
  recordMovement: (id, body) => apiRequest(`/api/v1/inventory/${id}/movements`, { method: 'POST', body }),
  movements: (id) => apiRequest(`/api/v1/inventory/${id}/movements`),
};

export const paymentsApi = {
  methods: () => apiRequest('/api/v1/payments/methods'),
  payableOrders: () => apiRequest('/api/v1/payments/payable-orders'),
  order: (orderRef) => apiRequest(`/api/v1/payments/orders/${encodeURIComponent(orderRef)}`),
  list: (query) => apiRequest('/api/v1/payments', { query }),
  record: (body) => apiRequest('/api/v1/payments', { method: 'POST', body }),
  receipt: (id) => apiRequest(`/api/v1/payments/${id}/receipt`),
  void: (id, reason) => apiRequest(`/api/v1/payments/${id}/void`, { method: 'POST', body: { reason } }),
};
