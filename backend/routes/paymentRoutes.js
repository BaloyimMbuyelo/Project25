const express = require('express');

const controller = require('../controllers/paymentController');
const schemas = require('../validation/paymentSchemas');
const { idParam } = require('../validation/common');
const validate = require('../middleware/validate');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Table 11 / Table 30: Cashier and Manager record payments and receipts;
// only the Manager voids; Administrator may view (route table 10).
const VIEWERS = [ROLES.CASHIER, ROLES.MANAGER, ROLES.ADMIN];
const RECORDERS = [ROLES.CASHIER, ROLES.MANAGER];

router.use(authenticateToken);

router.get('/methods', authorizeRoles(...VIEWERS), controller.methods);
router.get('/payable-orders', authorizeRoles(...VIEWERS), controller.payableOrders);
router.get('/orders/:orderRef', authorizeRoles(...VIEWERS), validate({ params: schemas.orderParam }), controller.orderForPayment);
router.get('/', authorizeRoles(...VIEWERS), validate({ query: schemas.listQuery }), controller.list);
router.get('/:id/receipt', authorizeRoles(...VIEWERS), validate({ params: idParam }), controller.receipt);
router.post('/', authorizeRoles(...RECORDERS), validate({ body: schemas.recordPayment }), controller.create);
router.post('/:id/void', authorizeRoles(ROLES.MANAGER), validate({ params: idParam, body: schemas.voidPayment }), controller.voidPayment);

module.exports = router;
