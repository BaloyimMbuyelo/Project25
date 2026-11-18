const path = require('path');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
require('dotenv').config({ path: path.join(__dirname, '.env'), quiet: true });

const menuRoutes = require('./routes/menuRoutes');
const authRoutes = require('./routes/authRoutes');
const reservationRoutes = require('./routes/reservationRoutes');
const inventoryRoutes = require('./routes/inventoryRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const errorHandler = require('./middleware/errorHandler');

const {
    authenticateToken,
    authorizeRoles
} = require('./middleware/authMiddleware');

const app = express();

// Allowed browser origins (comma-separated). Defaults to the Vite dev server.
const allowedOrigins = (process.env.CLIENT_ORIGIN || 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

// Middleware configuration (System Design 4.3.1, 4.8.4)
app.use(helmet({
    // The React app on another port loads menu images from this server.
    crossOriginResourcePolicy: { policy: 'cross-origin' }
}));
app.use(cors({ origin: allowedOrigins }));
app.use(express.json({ limit: '100kb' }));

// Serve frontend restaurant images (resolved from this file, not the cwd)
app.use('/images', express.static(path.join(__dirname, '../frontend/public/images')));

// API health check
app.get('/', (req, res) => {
    res.json({
        message: 'Ubuntu Bistro Management System API is running!'
    });
});

// Menu management routes
app.use('/api/menu', menuRoutes);

// Customer registration and login routes
app.use('/api/auth', authRoutes);

// Modules 4.0 - 6.0 (System Design 4.4.4: prefixed with /api/v1)
app.use('/api/v1/reservations', reservationRoutes);
app.use('/api/v1/inventory', inventoryRoutes);
app.use('/api/v1/payments', paymentRoutes);

// Protected customer test endpoint
app.get(
    '/api/test/customer',
    authenticateToken,
    authorizeRoles('Customer'),
    (req, res) => {
        res.status(200).json({
            message: 'Customer authentication successful!',
            user: req.user
        });
    }
);

// Unknown API routes
app.use('/api', (req, res) => {
    res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'The requested resource was not found.', fields: [] }
    });
});

app.use(errorHandler);

module.exports = app;
