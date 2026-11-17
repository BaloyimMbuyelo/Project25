
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
import Cart from '../pages/customer/Cart';
import CustomerMenu from '../pages/customer/CustomerMenu';

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

      {/* Customer menu route */}
      <Route path="/menu" element={<CustomerMenu />} />

      {/* Customer shopping cart */}
    <Route path="/cart" element={<Cart />} />

      {/* Staff management routes */}
      <Route path="/staff" element={<StaffLayout />}>
        <Route index element={<Navigate to="dashboard" replace />} />

        {/* Staff dashboard */}
        <Route path="dashboard" element={<Dashboard />} />

        {/* Orders */}
        <Route path="orders" element={<OrdersManagement />} />

        {/* Reservations */}
        <Route path="reservations" element={<ReservationsManagement />} />

        {/* Menu management */}
        <Route path="menu" element={<MenuManagement />} />

        {/* Inventory */}
        <Route path="inventory" element={<InventoryManagement />} />

        {/* Payments */}
        <Route path="payments" element={<PaymentsManagement />} />

        {/* Reports */}
        <Route path="reports" element={<ReportsManagement />} />
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
