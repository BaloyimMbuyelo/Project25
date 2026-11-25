const crypto = require('crypto');
const fs = require('fs/promises');
const path = require('path');
const sharp = require('sharp');

const settings = require('../config/settings');
const { badRequest } = require('./errors');

// Uploaded menu images (System Design 4.4.5, 4.8.4): checked by file
// signature (not the file name or browser-supplied type), resized on the
// server, re-encoded as WebP (which also strips EXIF data such as GPS) and
// saved under a random name.

const MENU_FOLDER = 'menu';
const PUBLIC_PREFIX = `/uploads/${MENU_FOLDER}/`;

// Magic numbers for the three allowed formats
function detectImageType(buffer) {
    if (!buffer || buffer.length < 12) return null;

    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpeg';

    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (png.every((byte, i) => buffer[i] === byte)) return 'png';

    if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';

    return null;
}

async function processMenuImage(buffer, maxPx = settings.MENU_IMAGE_MAX_PX) {
    if (!detectImageType(buffer)) {
        throw badRequest('Upload a JPEG, PNG or WebP image.', [
            { field: 'image', message: 'Upload a JPEG, PNG or WebP image.' }
        ]);
    }

    try {
        return await sharp(buffer, { limitInputPixels: 40_000_000, failOn: 'error' })
            .rotate() // respect the camera orientation before EXIF is removed
            .resize({ width: maxPx, height: maxPx, fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 80 })
            .toBuffer();
    } catch {
        throw badRequest('The image could not be read. Try a different file.', [
            { field: 'image', message: 'The image could not be read. Try a different file.' }
        ]);
    }
}

const menuDir = () => path.join(settings.UPLOAD_DIR, MENU_FOLDER);

// Returns the public path, e.g. /uploads/menu/item-12-3f9a1c2b7d.webp
async function saveMenuImage(itemId, webpBuffer) {
    await fs.mkdir(menuDir(), { recursive: true });
    const filename = `item-${itemId}-${crypto.randomBytes(8).toString('hex')}.webp`;
    await fs.writeFile(path.join(menuDir(), filename), webpBuffer, { flag: 'wx' });
    return `${PUBLIC_PREFIX}${filename}`;
}

// Only deletes files this module created (never paths outside the folder).
async function removeMenuImage(publicPath) {
    if (!publicPath || !publicPath.startsWith(PUBLIC_PREFIX)) return;

    const filename = path.basename(publicPath);
    if (!/^item-\d+-[0-9a-f]{16}\.webp$/.test(filename)) return;

    try {
        await fs.unlink(path.join(menuDir(), filename));
    } catch (error) {
        if (error.code !== 'ENOENT') console.error('Unable to remove old menu image:', error.message);
    }
}

module.exports = { PUBLIC_PREFIX, detectImageType, processMenuImage, saveMenuImage, removeMenuImage };
