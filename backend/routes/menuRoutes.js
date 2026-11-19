const express = require('express');

const controller = require('../controllers/menuController');
const schemas = require('../validation/menuSchemas');
const { idParam } = require('../validation/common');
const validate = require('../middleware/validate');
const { menuImageUpload } = require('../middleware/upload');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { AppError } = require('../utils/errors');
const { ROLES } = require('../utils/roles');

// ---------- /api/v1/menu (System Design Table 11) ----------
// Reading the menu is public; every change needs a Manager or Administrator
// (Table 30) and is audited.
const v1 = express.Router();
const managers = [authenticateToken, authorizeRoles(ROLES.MANAGER, ROLES.ADMIN)];

v1.get('/categories', controller.categories);
v1.post('/categories', ...managers, validate({ body: schemas.categoryBody }), controller.createCategory);
v1.put('/categories/:id', ...managers, validate({ params: idParam, body: schemas.categoryBody }), controller.updateCategory);
v1.patch('/categories/:id/status', ...managers, validate({ params: idParam, body: schemas.categoryStatus }), controller.setCategoryStatus);

v1.get('/items', validate({ query: schemas.listQuery }), controller.items);
v1.get('/items/:id', validate({ params: idParam }), controller.item);
v1.post('/items', ...managers, validate({ body: schemas.itemBody }), controller.createItem);
v1.put('/items/:id', ...managers, validate({ params: idParam, body: schemas.itemBody }), controller.updateItem);
v1.patch('/items/:id/availability', ...managers, validate({ params: idParam, body: schemas.availability }), controller.setAvailability);
v1.delete('/items/:id', ...managers, validate({ params: idParam }), controller.deleteItem);
v1.post('/items/:id/image', ...managers, validate({ params: idParam }), menuImageUpload, controller.uploadImage);
v1.delete('/items/:id/image', ...managers, validate({ params: idParam }), controller.removeImage);

// ---------- /api/menu (old address, read-only) ----------
// Kept so the current customer menu keeps working until it moves to
// /api/v1/menu/items. Changes through the old address are refused.
const legacy = express.Router();

legacy.get('/', controller.legacyList);
legacy.get('/:id', validate({ params: idParam }), controller.legacyItem);
legacy.all('/{*rest}', () => {
    throw new AppError(410, 'Menu changes have moved to /api/v1/menu/items and need a Manager or Administrator login.', {
        code: 'MOVED'
    });
});

module.exports = { menuV1Router: v1, legacyMenuRouter: legacy };
