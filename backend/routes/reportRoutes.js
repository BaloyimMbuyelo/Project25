const express = require('express');

const service = require('../services/reportService');
const validate = require('../middleware/validate');
const { authenticateToken, authorizeRoles } = require('../middleware/authMiddleware');
const { z, isoDate, positiveId } = require('../validation/common');
const { ROLES } = require('../utils/roles');

const router = express.Router();

const params = z.object({
    type: z.enum(['orders', 'payments', 'reservations', 'stock'], {
        errorMap: () => ({ message: 'Report type must be orders, payments, reservations or stock.' })
    })
});

const query = z.object({
    from: isoDate("Choose a 'From' date."),
    to: isoDate("Choose a 'To' date."),
    format: z.enum(['json', 'csv']).optional(),
    order_type: z.enum(['DINE_IN', 'COLLECTION']).optional(),
    payment_method_id: z.coerce.number().pipe(positiveId('payment method')).optional()
});

// Reports are for the Manager and Administrator (Table 30)
router.get(
    '/:type',
    authenticateToken,
    authorizeRoles(ROLES.MANAGER, ROLES.ADMIN),
    validate({ params, query }),
    async (req, res) => {
        const result = await service.generateReport(req.user, req.valid.params.type, req.valid.query, req.ip);

        if (result.csv) {
            res.setHeader('Content-Type', 'text/csv; charset=utf-8');
            res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
            return res.send(result.csv);
        }

        res.json({ data: result });
    }
);

module.exports = router;
