
const { db } = require('../config/db');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Customer registration
const registerCustomer = async (req, res) => {
    try {
        const { full_name, email, password, phone } = req.body;

        if (!full_name || !email || !password) {
            return res.status(400).json({
                message: 'Full name, email and password are required.'
            });
        }

        if (password.length < 8) {
            return res.status(400).json({
                message: 'Password must contain at least 8 characters.'
            });
        }

        const [existingUsers] = await db.query(
            'SELECT user_id FROM users WHERE email = ?',
            [email]
        );

        if (existingUsers.length > 0) {
            return res.status(409).json({
                message: 'An account with this email already exists.'
            });
        }

        const [customerRoles] = await db.query(
            'SELECT role_id FROM roles WHERE role_name = ?',
            ['Customer']
        );

        if (customerRoles.length === 0) {
            return res.status(500).json({
                message: 'Customer role has not been configured.'
            });
        }

        const passwordHash = await bcrypt.hash(password, 12);

        const [result] = await db.query(
            `INSERT INTO users
            (role_id, full_name, email, password_hash, phone)
            VALUES (?, ?, ?, ?, ?)`,
            [
                customerRoles[0].role_id,
                full_name.trim(),
                email.trim().toLowerCase(),
                passwordHash,
                phone || null
            ]
        );

        return res.status(201).json({
            message: 'Customer account created successfully.',
            user_id: result.insertId
        });

    } catch (error) {
        console.error('Customer registration error:', error.message);

        return res.status(500).json({
            message: 'Unable to register customer.'
        });
    }
};

// Customer and staff login
const login = async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                message: 'Email and password are required.'
            });
        }

        const [users] = await db.query(
            `SELECT
                users.user_id,
                users.full_name,
                users.email,
                users.password_hash,
                users.status,
                roles.role_name
            FROM users
            INNER JOIN roles ON users.role_id = roles.role_id
            WHERE users.email = ?`,
            [email.trim().toLowerCase()]
        );

        if (users.length === 0) {
            return res.status(401).json({
                message: 'Invalid email or password.'
            });
        }

        const user = users[0];

        if (user.status !== 'ACTIVE') {
            return res.status(403).json({
                message: 'This account is inactive.'
            });
        }

        const passwordMatches = await bcrypt.compare(
            password,
            user.password_hash
        );

        if (!passwordMatches) {
            return res.status(401).json({
                message: 'Invalid email or password.'
            });
        }

        if (!process.env.JWT_SECRET) {
            console.error('JWT_SECRET is not configured.');

            return res.status(500).json({
                message: 'Authentication is not configured.'
            });
        }

        const token = jwt.sign(
            {
                user_id: user.user_id,
                email: user.email,
                role: user.role_name
            },
            process.env.JWT_SECRET,
            { expiresIn: '8h' }
        );

        return res.status(200).json({
            message: 'Login successful.',
            token,
            user: {
                user_id: user.user_id,
                full_name: user.full_name,
                email: user.email,
                role: user.role_name
            }
        });

    } catch (error) {
        console.error('Login error:', error.message);

        return res.status(500).json({
            message: 'Unable to log in.'
        });
    }
};

module.exports = {
    registerCustomer,
    login
};
