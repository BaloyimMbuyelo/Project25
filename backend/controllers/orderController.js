const service = require('../services/orderService');

async function create(req, res) {
    const data = await service.placeOrder(req.user, req.valid.body);
    res.status(201).json({ data, message: 'Order placed successfully' });
}

async function list(req, res) {
    res.json({ data: await service.listOrders(req.user, req.valid.query) });
}

async function getOne(req, res) {
    res.json({ data: await service.getOrder(req.user, req.valid.params.ref) });
}

async function updateStatus(req, res) {
    const data = await service.updateStatus(req.user, req.valid.params.ref, req.valid.body.status);
    res.json({ data, message: 'Order updated successfully' });
}

async function cancel(req, res) {
    const data = await service.cancelOrder(req.user, req.valid.params.ref, req.valid.body);
    res.json({ data, message: `Order ${data.order_ref} cancelled` });
}

module.exports = { create, list, getOne, updateStatus, cancel };
