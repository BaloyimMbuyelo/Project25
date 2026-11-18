
import { Routes, Route, Navigate } from 'react-router-dom';

// Import staff layout
import StaffLayout from '../layouts/StaffLayout';

// Import staff dashboard
import Dashboard from '../Dashboard';

// Import staff management modules
import MenuManagement from '../pages/MenuManagement';
import InventoryManagement from '../pages/InventoryManagement';
import OrdersManagement from '../pages/OrdersManagement';
import ReservationsManagement from '../pages/ReservationsManagement';
import PaymentsManagement from '../pages/PaymentsManagement';
import ReportsManagement from '../pages/ReportsManagement';
import StaffLogin from '../pages/StaffLogin';
import Cart from '../pages/customer/Cart';
import CustomerMenu from '../pages/customer/CustomerMenu';

// Staff route guard and role matrix (System Design Table 10 / Table 30)
import RequireStaff from '../auth/RequireStaff';
import { rolesFor } from '../auth/permissions';

const staffPage = (path, element) => (
  <RequireStaff roles={rolesFor(`/staff/${path}`)}>{element}</RequireStaff>
);

function AppRoutes() {
  return (
    <Routes>
      {/* Redirect to staff dashboard */}
      <Route
        path="/"
        element={<Navigate to="/staff/dashboard" replace />}
      />

      {/* Customer menu route */}
      <Route path="/menu" element={<CustomerMenu />} />

      {/* Customer shopping cart */}
      <Route path="/cart" element={<Cart />} />

      {/* Staff login (public) */}
      <Route path="/staff/login" element={<StaffLogin />} />

      {/* Staff management routes - login required */}
      <Route
        path="/staff"
        element={
          <RequireStaff>
            <StaffLayout />
          </RequireStaff>
        }
      >
        <Route index element={<Navigate to="dashboard" replace />} />

        {/* Staff dashboard */}
        <Route path="dashboard" element={staffPage('dashboard', <Dashboard />)} />

        {/* Orders */}
        <Route path="orders" element={staffPage('orders', <OrdersManagement />)} />

        {/* Reservations */}
        <Route path="reservations" element={staffPage('reservations', <ReservationsManagement />)} />

        {/* Menu management */}
        <Route path="menu" element={staffPage('menu', <MenuManagement />)} />

        {/* Inventory */}
        <Route path="inventory" element={staffPage('inventory', <InventoryManagement />)} />

        {/* Payments */}
        <Route path="payments" element={staffPage('payments', <PaymentsManagement />)} />

        {/* Reports */}
        <Route path="reports" element={staffPage('reports', <ReportsManagement />)} />
      </Route>

      {/* Redirect unknown routes */}
      <Route
        path="*"
        element={<Navigate to="/staff/dashboard" replace />}
      />
    </Routes>
  );
}

export default AppRoutes;
