// Role-based staff navigation (System Design Table 30 and Table 10).
// The API enforces these rules; the UI only hides what a role cannot use.

export const ROLES = Object.freeze({
  ADMIN: 'Administrator',
  MANAGER: 'Manager',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen Staff',
  CASHIER: 'Cashier',
  CUSTOMER: 'Customer',
});

const ALL_STAFF = [ROLES.ADMIN, ROLES.MANAGER, ROLES.WAITER, ROLES.KITCHEN, ROLES.CASHIER];

export const STAFF_PAGES = [
  { name: 'Dashboard', path: '/staff/dashboard', icon: '▦', roles: ALL_STAFF },
  { name: 'Orders', path: '/staff/orders', icon: '▤', roles: ALL_STAFF },
  { name: 'Reservations', path: '/staff/reservations', icon: '▣', roles: [ROLES.WAITER, ROLES.MANAGER, ROLES.ADMIN] },
  { name: 'Menu Management', path: '/staff/menu', icon: '☷', roles: [ROLES.MANAGER, ROLES.ADMIN] },
  { name: 'Inventory', path: '/staff/inventory', icon: '▥', roles: [ROLES.MANAGER, ROLES.ADMIN, ROLES.KITCHEN] },
  { name: 'Payments', path: '/staff/payments', icon: 'R', roles: [ROLES.CASHIER, ROLES.MANAGER, ROLES.ADMIN] },
  { name: 'Reports', path: '/staff/reports', icon: '▧', roles: [ROLES.MANAGER, ROLES.ADMIN] },
  { name: 'Users & Roles', path: '/staff/users', icon: '☺', roles: [ROLES.ADMIN] },
  { name: 'Audit Log', path: '/staff/audit', icon: '≡', roles: [ROLES.ADMIN] },
];

export const rolesFor = (path) => STAFF_PAGES.find((page) => page.path === path)?.roles || ALL_STAFF;

export const hasRole = (user, roles) => Boolean(user && roles.includes(user.role));
