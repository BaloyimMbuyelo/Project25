const { badRequest } = require('../utils/errors');

// Validate request parts against zod schemas (System Design 4.8.4).
// Parsed values (trimmed, coerced, unknown fields stripped) are placed on
// req.valid.body / req.valid.query / req.valid.params.
function validate(schemas) {
    return (req, res, next) => {
        req.valid = req.valid || {};
        const fields = [];

        for (const part of ['params', 'query', 'body']) {
            if (!schemas[part]) continue;

            const result = schemas[part].safeParse(req[part] ?? {});

            if (result.success) {
                req.valid[part] = result.data;
            } else {
                for (const issue of result.error.issues) {
                    fields.push({
                        field: issue.path.join('.') || part,
                        message: issue.message
                    });
                }
            }
        }

        if (fields.length > 0) {
            return next(badRequest(fields[0].message, fields));
        }

        next();
    };
}

module.exports = validate;
