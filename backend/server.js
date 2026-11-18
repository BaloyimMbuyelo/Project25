
const app = require('./app');
const { testConnection } = require('./config/db');

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
