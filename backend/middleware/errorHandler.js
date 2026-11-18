const { AppError } = require('../utils/errors');

// Central error handler (System Design 4.3.1, Table 12).
// Users only ever see the friendly message; technical detail is logged.
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
    if (err instanceof AppError) {
        return res.status(err.status).json({
            error: {
                code: err.code,
                message: err.message,
                fields: err.fields,
                ...(err.details !== undefined && { details: err.details })
            }
        });
    }

    // Malformed JSON body
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({
            error: { code: 'VALIDATION_ERROR', message: 'The request body is not valid JSON.', fields: [] }
        });
    }

    if (err.type === 'entity.too.large') {
        return res.status(413).json({
            error: { code: 'PAYLOAD_TOO_LARGE', message: 'The request is too large.', fields: [] }
        });
    }

    console.error(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`, err);

    return res.status(500).json({
        error: { code: 'SERVER_ERROR', message: 'Something went wrong. Please try again.', fields: [] }
    });
}

module.exports = errorHandler;
