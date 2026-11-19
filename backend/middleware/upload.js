const multer = require('multer');
const settings = require('../config/settings');
const { AppError } = require('../utils/errors');

// Single image upload held in memory (max 1 MB), then checked and resized by
// utils/images.js before anything is written to disk.
const parser = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: settings.MENU_IMAGE_MAX_BYTES,
        files: 1,
        fields: 5,
        parts: 6
    }
}).single('image');

function menuImageUpload(req, res, next) {
    parser(req, res, (error) => {
        if (!error) {
            if (!req.file) {
                return next(new AppError(400, 'Choose an image to upload.', {
                    fields: [{ field: 'image', message: 'Choose an image to upload.' }]
                }));
            }
            return next();
        }

        if (error instanceof multer.MulterError) {
            const tooBig = error.code === 'LIMIT_FILE_SIZE';
            const mb = (settings.MENU_IMAGE_MAX_BYTES / (1024 * 1024)).toFixed(0);
            const message = tooBig
                ? `Image must be ${mb} MB or smaller.`
                : 'Upload one image in the "image" field.';
            return next(new AppError(400, message, { fields: [{ field: 'image', message }] }));
        }

        return next(error);
    });
}

module.exports = { menuImageUpload };
