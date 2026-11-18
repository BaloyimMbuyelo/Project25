const express = require('express');

const controller = require('../controllers/inventoryController');
const schemas = require('../validation/inventorySchemas');
const { idParam } = require('../validation/common');
const validate = require('../middleware/validate');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

const router = express.Router();

// Table 30: Manager and Administrator manage stock; Kitchen Staff can view.
const VIEWERS = [ROLES.MANAGER, ROLES.ADMIN, ROLES.KITCHEN];
const MANAGERS = [ROLES.MANAGER, ROLES.ADMIN];

router.use(authenticateToken);

router.get('/', authorizeRoles(...VIEWERS), validate({ query: schemas.listQuery }), controller.list);
router.get('/low-stock', authorizeRoles(...VIEWERS), controller.lowStock);
router.get('/:id', authorizeRoles(...VIEWERS), validate({ params: idParam }), controller.getOne);
router.get('/:id/movements', authorizeRoles(...VIEWERS), validate({ params: idParam }), controller.movements);
router.post('/', authorizeRoles(...MANAGERS), validate({ body: schemas.createItem }), controller.create);
router.put('/:id', authorizeRoles(...MANAGERS), validate({ params: idParam, body: schemas.updateItem }), controller.update);
router.patch('/:id/status', authorizeRoles(...MANAGERS), validate({ params: idParam, body: schemas.setStatus }), controller.setStatus);
router.post('/:id/movements', authorizeRoles(...MANAGERS), validate({ params: idParam, body: schemas.recordMovement }), controller.recordMovement);

module.exports = router;
