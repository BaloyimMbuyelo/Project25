const express = require('express');

const controller = require('../controllers/reservationController');
const schemas = require('../validation/reservationSchemas');
const validate = require('../middleware/validate');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Role permission matrix (System Design Table 30):
// customers request their own bookings; Waiter and Manager create, allocate
// and change status; Administrator can view.
const VIEWERS = [ROLES.CUSTOMER, ROLES.WAITER, ROLES.MANAGER, ROLES.ADMIN];
const STAFF_VIEWERS = [ROLES.WAITER, ROLES.MANAGER, ROLES.ADMIN];
const CREATORS = [ROLES.CUSTOMER, ROLES.WAITER, ROLES.MANAGER];
const EDITORS = [ROLES.WAITER, ROLES.MANAGER];

router.use(authenticateToken);

router.get('/availability', authorizeRoles(...VIEWERS), validate({ query: schemas.availabilityQuery }), controller.availability);
router.get('/tables', authorizeRoles(...STAFF_VIEWERS), validate({ query: schemas.tablePlanQuery }), controller.tables);
router.get('/', authorizeRoles(...VIEWERS), validate({ query: schemas.listQuery }), controller.list);
router.get('/:ref', authorizeRoles(...VIEWERS), validate({ params: schemas.refParam }), controller.getOne);
router.post('/', authorizeRoles(...CREATORS), validate({ body: schemas.createReservation }), controller.create);
router.patch('/:ref', authorizeRoles(...EDITORS), validate({ params: schemas.refParam, body: schemas.updateReservation }), controller.update);
router.patch('/:ref/status', authorizeRoles(...EDITORS), validate({ params: schemas.refParam, body: schemas.changeStatus }), controller.changeStatus);

module.exports = router;
