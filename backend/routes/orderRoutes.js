const express = require('express');

const controller = require('../controllers/orderController');
const schemas = require('../validation/orderSchemas');
const validate = require('../middleware/validate');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// System Design Table 11 / Table 30
const ALL = Object.values(ROLES);
const PLACERS = [ROLES.CUSTOMER, ROLES.WAITER, ROLES.MANAGER];
const STATUS_CHANGERS = [ROLES.WAITER, ROLES.KITCHEN, ROLES.CASHIER, ROLES.MANAGER];
const CANCELLERS = [ROLES.CUSTOMER, ROLES.WAITER, ROLES.MANAGER];

router.use(authenticateToken);

router.get('/', authorizeRoles(...ALL), validate({ query: schemas.listQuery }), controller.list);
router.get('/:ref', authorizeRoles(...ALL), validate({ params: schemas.refParam }), controller.getOne);
router.post('/', authorizeRoles(...PLACERS), validate({ body: schemas.placeOrder }), controller.create);
router.patch('/:ref/status', authorizeRoles(...STATUS_CHANGERS), validate({ params: schemas.refParam, body: schemas.updateStatus }), controller.updateStatus);
router.post('/:ref/cancel', authorizeRoles(...CANCELLERS), validate({ params: schemas.refParam, body: schemas.cancelOrder }), controller.cancel);

module.exports = router;
