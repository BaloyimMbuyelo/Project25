
const express = require('express');
const cors = require('cors');
require('dotenv').config();

const { testConnection } = require('./config/db');
const menuRoutes = require('./routes/menuRoutes');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/images', express.static('../frontend/public/images'));

app.get('/', (req, res) => {
    res.json({
        message: 'Ubuntu Bistro Management System API is running!'
    });
});

// Menu management routes
app.use('/api/menu', menuRoutes);

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
