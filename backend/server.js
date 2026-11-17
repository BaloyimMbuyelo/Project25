
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/db');

const menuRoutes = require('./routes/menuRoutes');
const authRoutes = require('./routes/authRoutes');

const {
    authenticateToken,
    authorizeRoles
} = require('./middleware/authMiddleware');

const app = express();

// Middleware configuration
app.use(cors());
app.use(express.json());

// Serve frontend restaurant images
app.use('/images', express.static('../frontend/public/images'));

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

// Start backend server
const PORT = process.env.PORT || 5000;

async function startServer() {
    try {
        await testConnection();

        app.listen(PORT, () => {
            console.log(`UBMS Backend running at http://localhost:${PORT}`);
        });

    } catch (error) {
        console.error('Unable to start UBMS backend:', error.message);
        process.exit(1);
    }
}

startServer();
