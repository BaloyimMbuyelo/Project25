// Audit logging (FR-21, SEC-06, System Design 4.8.6).
// Writes to audit_logs. Entity, record id and details are stored as JSON in
// the description column. Never pass passwords here.
async function logAudit(executor, { userId, action, entity, recordId = null, details = {}, ip = null }) {
    await executor.query(
        'INSERT INTO audit_logs (user_id, action, description, ip_address) VALUES (?, ?, ?, ?)',
        [
            userId ?? null,
            action,
            JSON.stringify({ entity, record_id: recordId, ...details }),
            ip ? String(ip).slice(0, 45) : null
        ]
    );
}

module.exports = { logAudit };
