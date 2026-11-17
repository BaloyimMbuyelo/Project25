
const express = require('express');

const {
    registerCustomer,
    login
} = require('../controllers/authController');

const router = express.Router();

// Customer registration
router.post('/register', registerCustomer);

// Customer and staff login
router.post('/login', login);

module.exports = router;
