
const express = require('express');

const controller = require('../controllers/authController');
const schemas = require('../validation/authSchemas');
const validate = require('../middleware/validate');
const { authenticate } = require('../middleware/authMiddleware');
const { createLoginLimiter } = require('../middleware/rateLimit');

const router = express.Router();
const loginLimiter = createLoginLimiter();
const signedIn = authenticate({ allowPasswordChange: true });

// Customer registration (P3)
router.post('/register', loginLimiter, validate({ body: schemas.register }), controller.registerCustomer);

// Customer portal and staff portal logins (P1) - rate limited per IP
router.post('/login', loginLimiter, validate({ body: schemas.login }), controller.login);
router.post('/staff-login', loginLimiter, validate({ body: schemas.login }), controller.staffLogin);

// Session
router.post('/logout', controller.logout);
router.get('/me', signedIn, controller.me);
router.post('/change-password', signedIn, validate({ body: schemas.changePassword }), controller.changePassword);

module.exports = router;
