const service = require('../services/reservationService');

// Controllers: read request data, call the service, shape the HTTP response
// ({ data, message } envelope - System Design 4.3.1).

async function list(req, res) {
    const data = await service.listReservations(req.user, req.valid.query);
    res.json({ data });
}

async function getOne(req, res) {
    const data = await service.getReservation(req.user, req.valid.params.ref);
    res.json({ data });
}

async function availability(req, res) {
    const data = await service.getAvailability(req.valid.query);
    res.json({ data });
}

async function tables(req, res) {
    const data = await service.getTablePlan(req.valid.query);
    res.json({ data });
}

async function create(req, res) {
    const data = await service.createReservation(req.user, req.valid.body);
    res.status(201).json({
        data,
        message: `Reservation received – reference ${data.reservation_ref}`
    });
}

async function update(req, res) {
    const data = await service.updateReservation(req.user, req.valid.params.ref, req.valid.body);
    res.json({ data, message: 'Reservation updated successfully' });
}

async function changeStatus(req, res) {
    const data = await service.changeStatus(req.user, req.valid.params.ref, req.valid.body);
    res.json({ data, message: `Reservation marked ${service.STATUS_LABELS[data.status]}` });
}

module.exports = { list, getOne, availability, tables, create, update, changeStatus };
