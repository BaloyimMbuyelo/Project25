// Role names exactly as seeded in the roles table (ubms_database_extension.sql).
const ROLES = Object.freeze({
    ADMIN: 'Administrator',
    MANAGER: 'Manager',
    WAITER: 'Waiter',
    KITCHEN: 'Kitchen Staff',
    CASHIER: 'Cashier',
    CUSTOMER: 'Customer'
});

module.exports = { ROLES };
