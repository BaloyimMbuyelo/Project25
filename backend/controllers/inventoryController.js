const service = require('../services/inventoryService');

async function list(req, res) {
    res.json({ data: await service.listItems(req.valid.query) });
}

async function lowStock(req, res) {
    res.json({ data: await service.listLowStock() });
}

async function getOne(req, res) {
    res.json({ data: await service.getItem(req.valid.params.id) });
}

async function create(req, res) {
    const data = await service.createItem(req.user, req.valid.body);
    res.status(201).json({ data, message: 'Stock item added' });
}

async function update(req, res) {
    const data = await service.updateItem(req.user, req.valid.params.id, req.valid.body);
    res.json({ data, message: 'Stock item updated' });
}

async function setStatus(req, res) {
    const data = await service.setActive(req.user, req.valid.params.id, req.valid.body.is_active);
    res.json({ data, message: data.is_active ? 'Stock item reactivated' : 'Stock item deactivated' });
}

async function recordMovement(req, res) {
    const data = await service.recordMovement(req.user, req.valid.params.id, req.valid.body);
    res.status(201).json({ data, message: 'Stock movement recorded' });
}

async function movements(req, res) {
    res.json({ data: await service.listMovements(req.valid.params.id) });
}

module.exports = { list, lowStock, getOne, create, update, setStatus, recordMovement, movements };
