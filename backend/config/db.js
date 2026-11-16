
const mysql = require('mysql2/promise');
require('dotenv').config();

const db = mysql.createPool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

async function testConnection() {
    try {
        const connection = await db.getConnection();

        console.log('MySQL database connected successfully!');
        console.log('Database: ubuntu_bistro_db');

        connection.release();
    } catch (error) {
        console.error('MySQL connection failed:', error.message);
        process.exit(1);
    }
}

module.exports = { db, testConnection };
