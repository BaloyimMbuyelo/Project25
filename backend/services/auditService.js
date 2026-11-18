// Audit logging (FR-21, SEC-06, System Design 4.8.6).
// Writes to the existing audit_logs table. Entity, record id and details are
// stored as JSON in the description column. Never pass passwords here.
async function logAudit(executor, { userId, action, entity, recordId = null, details = {} }) {
    await executor.query(
        'INSERT INTO audit_logs (user_id, action, description) VALUES (?, ?, ?)',
        [
            userId ?? null,
            action,
            JSON.stringify({ entity, record_id: recordId, ...details })
        ]
    );
}

module.exports = { logAudit };
