const service = require('../services/userService');

async function roles(req, res) {
    res.json({ data: await service.listRoles() });
}

async function list(req, res) {
    res.json({ data: await service.listUsers(req.valid.query) });
}

async function getOne(req, res) {
    res.json({ data: await service.getUser(req.valid.params.id) });
}

async function create(req, res) {
    const data = await service.createStaffUser(req.user, req.valid.body, req.ip);
    res.status(201).json({
        data,
        message: 'Staff user created. Give them the temporary password – it is shown only once.'
    });
}

async function update(req, res) {
    const data = await service.updateStaffUser(req.user, req.valid.params.id, req.valid.body, req.ip);
    res.json({ data, message: 'User updated · logged to audit trail' });
}

async function setStatus(req, res) {
    const data = await service.setStatus(req.user, req.valid.params.id, req.valid.body.status, req.ip);
    res.json({ data, message: data.status === 'ACTIVE' ? 'User activated' : 'User deactivated' });
}

async function resetPassword(req, res) {
    const data = await service.resetPassword(req.user, req.valid.params.id, req.ip);
    res.json({
        data,
        message: 'Password reset. Give the user the temporary password – it is shown only once.'
    });
}

async function audit(req, res) {
    res.json({ data: await service.listAudit(req.valid.query) });
}

module.exports = { roles, list, getOne, create, update, setStatus, resetPassword, audit };
