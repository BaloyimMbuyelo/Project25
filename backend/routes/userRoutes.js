const express = require('express');

const controller = require('../controllers/userController');
const schemas = require('../validation/userSchemas');
const { idParam } = require('../validation/common');
const validate = require('../middleware/validate');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { ROLES } = require('../utils/roles');

// Users & roles and the audit log are Administrator-only (Table 11, Table 30).
const usersRouter = express.Router();
usersRouter.use(authenticateToken, authorizeRoles(ROLES.ADMIN));

usersRouter.get('/roles', controller.roles);
usersRouter.get('/', validate({ query: schemas.listQuery }), controller.list);
usersRouter.get('/:id', validate({ params: idParam }), controller.getOne);
usersRouter.post('/', validate({ body: schemas.staffUser }), controller.create);
usersRouter.put('/:id', validate({ params: idParam, body: schemas.staffUser }), controller.update);
usersRouter.patch('/:id/status', validate({ params: idParam, body: schemas.setStatus }), controller.setStatus);
usersRouter.post('/:id/reset-password', validate({ params: idParam }), controller.resetPassword);

const auditRouter = express.Router();
auditRouter.use(authenticateToken, authorizeRoles(ROLES.ADMIN));
auditRouter.get('/', validate({ query: schemas.auditQuery }), controller.audit);

module.exports = { usersRouter, auditRouter };
