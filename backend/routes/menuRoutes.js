
const express = require('express');
const router = express.Router();

const { db } = require('../config/db');

// Get all menu items
router.get('/', async (req, res) => {
    try {
        const [meals] = await db.query(
            'SELECT * FROM menu_items ORDER BY id ASC'
        );

        res.status(200).json(meals);
    } catch (error) {
        console.error('Error fetching menu:', error.message);
        res.status(500).json({
            message: 'Failed to retrieve menu items.'
        });
    }
});

// Get one menu item
router.get('/:id', async (req, res) => {
    try {
        const [meals] = await db.query(
            'SELECT * FROM menu_items WHERE id = ?',
            [req.params.id]
        );

        if (meals.length === 0) {
            return res.status(404).json({
                message: 'Menu item not found.'
            });
        }

        res.json(meals[0]);
    } catch (error) {
        res.status(500).json({
            message: 'Failed to retrieve menu item.'
        });
    }
});

// Add a new menu item
router.post('/', async (req, res) => {
    try {
        const {
            name,
            description,
            category,
            price,
            image,
            available
        } = req.body;

        if (
            !name?.trim() ||
            !category?.trim() ||
            !Number.isFinite(Number(price)) ||
            Number(price) <= 0
        ) {
            return res.status(400).json({
                message: 'Please provide a valid name, category and price.'
            });
        }

        const [result] = await db.query(
            `INSERT INTO menu_items
            (name, description, category, price, image, available)
            VALUES (?, ?, ?, ?, ?, ?)`,
            [
                name.trim(),
                description || '',
                category,
                Number(price),
                image || '',
                available === undefined ? true : Boolean(available)
            ]
        );

        const [newMeal] = await db.query(
            'SELECT * FROM menu_items WHERE id = ?',
            [result.insertId]
        );

        res.status(201).json(newMeal[0]);
    } catch (error) {
        console.error('Error adding meal:', error.message);
        res.status(500).json({
            message: 'Failed to add menu item.'
        });
    }
});

// Update a menu item
router.put('/:id', async (req, res) => {
    try {
        const {
            name,
            description,
            category,
            price,
            image,
            available
        } = req.body;

        if (
            !name?.trim() ||
            !category?.trim() ||
            !Number.isFinite(Number(price)) ||
            Number(price) <= 0
        ) {
            return res.status(400).json({
                message: 'Please provide a valid name, category and price.'
            });
        }

        const [result] = await db.query(
            `UPDATE menu_items
             SET name = ?,
                 description = ?,
                 category = ?,
                 price = ?,
                 image = ?,
                 available = ?
             WHERE id = ?`,
            [
                name.trim(),
                description || '',
                category,
                Number(price),
                image || '',
                Boolean(available),
                req.params.id
            ]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Menu item not found.'
            });
        }

        const [updatedMeal] = await db.query(
            'SELECT * FROM menu_items WHERE id = ?',
            [req.params.id]
        );

        res.json(updatedMeal[0]);
    } catch (error) {
        console.error('Error updating meal:', error.message);
        res.status(500).json({
            message: 'Failed to update menu item.'
        });
    }
});

// Enable or disable a menu item
router.patch('/:id/availability', async (req, res) => {
    try {
        const { available } = req.body;

        if (typeof available !== 'boolean') {
            return res.status(400).json({
                message: 'Availability must be true or false.'
            });
        }

        const [result] = await db.query(
            'UPDATE menu_items SET available = ? WHERE id = ?',
            [available, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Menu item not found.'
            });
        }

        const [updatedMeal] = await db.query(
            'SELECT * FROM menu_items WHERE id = ?',
            [req.params.id]
        );

        res.json(updatedMeal[0]);
    } catch (error) {
        console.error('Error changing availability:', error.message);
        res.status(500).json({
            message: 'Failed to update availability.'
        });
    }
});

// Delete a menu item
router.delete('/:id', async (req, res) => {
    try {
        const [result] = await db.query(
            'DELETE FROM menu_items WHERE id = ?',
            [req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({
                message: 'Menu item not found.'
            });
        }

        res.json({
            message: 'Menu item deleted successfully.'
        });
    } catch (error) {
        console.error('Error deleting meal:', error.message);
        res.status(500).json({
            message: 'Failed to delete menu item.'
        });
    }
});

module.exports = router;
