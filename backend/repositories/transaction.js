const { db } = require('../config/db');

// Run fn(connection) inside a REPEATABLE READ transaction (System Design 4.5.8).
// Any thrown error rolls the whole unit of work back, so no partial records
// remain (NFR-07).
async function withTransaction(fn) {
    const connection = await db.getConnection();

    try {
        await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        await connection.beginTransaction();

        const result = await fn(connection);

        await connection.commit();
        return result;
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
}

module.exports = { withTransaction };
