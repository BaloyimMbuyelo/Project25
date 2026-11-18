// Application error carrying an HTTP status and a user-facing message.
// The central error handler turns it into the standard error envelope:
// { error: { code, message, fields[], details } }  (System Design 4.3.1)
class AppError extends Error {
    constructor(status, message, { code, fields = [], details } = {}) {
        super(message);
        this.name = 'AppError';
        this.status = status;
        this.code = code || defaultCode(status);
        this.fields = fields;
        this.details = details;
    }
}

function defaultCode(status) {
    switch (status) {
        case 400: return 'VALIDATION_ERROR';
        case 401: return 'UNAUTHENTICATED';
        case 403: return 'FORBIDDEN';
        case 404: return 'NOT_FOUND';
        case 409: return 'CONFLICT';
        default: return 'SERVER_ERROR';
    }
}

const badRequest = (message, fields, details) =>
    new AppError(400, message, { fields, details });
const forbidden = (message = "You don't have access to this page.") =>
    new AppError(403, message);
const notFound = (message) => new AppError(404, message);
const conflict = (message, details) => new AppError(409, message, { details });

module.exports = { AppError, badRequest, forbidden, notFound, conflict };
