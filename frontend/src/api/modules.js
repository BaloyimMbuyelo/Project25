import { apiRequest } from './client';

// One function per endpoint (System Design Table 11). Each returns the
// response envelope { data, message }.

export const authApi = {
  login: (email, password) => apiRequest('/api/auth/login', { method: 'POST', body: { email, password } }),
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
