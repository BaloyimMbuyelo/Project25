const service = require('../services/paymentService');

async function methods(req, res) {
    res.json({ data: await service.listMethods() });
}

async function payableOrders(req, res) {
    res.json({ data: await service.listPayableOrders() });
}

async function orderForPayment(req, res) {
    res.json({ data: await service.getOrderForPayment(req.valid.params.orderRef) });
}

async function list(req, res) {
    res.json({ data: await service.listPayments(req.valid.query) });
}

async function create(req, res) {
    const data = await service.recordPayment(req.user, req.valid.body);
    const message = data.change > 0
        ? `Payment recorded – change due R${data.change.toFixed(2)}`
        : 'Payment recorded';
    res.status(201).json({ data, message });
}

async function receipt(req, res) {
    res.json({ data: await service.getReceipt(req.valid.params.id) });
}

async function voidPayment(req, res) {
    const data = await service.voidPayment(req.user, req.valid.params.id, req.valid.body);
    res.json({ data, message: `Payment ${data.receipt_number} voided` });
}

module.exports = { methods, payableOrders, orderForPayment, list, create, receipt, voidPayment };
