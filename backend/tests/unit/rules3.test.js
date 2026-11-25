// Unit tests for menu images and menu change tracking (no database needed).
const sharp = require('sharp');

const { detectImageType, processMenuImage } = require('../../utils/images');
const { diffItem } = require('../../services/menuService');
const { db } = require('../../config/db');

afterAll(() => db.end());

const solid = (width, height, format, options = {}) =>
    sharp({ create: { width, height, channels: 3, background: { r: 30, g: 61, b: 47 } } })[format](options).toBuffer();

describe('image type is taken from the file contents (4.8.4)', () => {
    test('JPEG, PNG and WebP are recognised by their signatures', async () => {
        expect(detectImageType(await solid(10, 10, 'jpeg'))).toBe('jpeg');
        expect(detectImageType(await solid(10, 10, 'png'))).toBe('png');
        expect(detectImageType(await solid(10, 10, 'webp'))).toBe('webp');
    });

    test('other files are rejected, whatever they are called', async () => {
        expect(detectImageType(await solid(10, 10, 'gif'))).toBeNull();
        expect(detectImageType(Buffer.from('<?php echo "not an image"; ?>'))).toBeNull();
        expect(detectImageType(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>'))).toBeNull();
        expect(detectImageType(Buffer.alloc(4))).toBeNull();
    });
});

describe('uploaded photos are resized and re-encoded on the server (4.4.5)', () => {
    test('large photos are scaled to fit 800 px and saved as WebP', async () => {
        const out = await processMenuImage(await solid(2000, 1000, 'jpeg'));
        const meta = await sharp(out).metadata();
        expect(meta.format).toBe('webp');
        expect([meta.width, meta.height]).toEqual([800, 400]);
    });

    test('small photos are not enlarged', async () => {
        const meta = await sharp(await processMenuImage(await solid(300, 200, 'png'))).metadata();
        expect([meta.width, meta.height]).toEqual([300, 200]);
    });

    test('EXIF data (e.g. camera, GPS) is removed', async () => {
        const withExif = await sharp({ create: { width: 50, height: 50, channels: 3, background: 'white' } })
            .withExif({ IFD0: { Copyright: 'Secret Location Ltd' } })
            .jpeg()
            .toBuffer();
        expect((await sharp(withExif).metadata()).exif).toBeDefined();

        const meta = await sharp(await processMenuImage(withExif)).metadata();
        expect(meta.exif).toBeUndefined();
    });

    test('non-images and damaged images give friendly 400 errors', async () => {
        await expect(processMenuImage(Buffer.from('hello world, definitely not an image')))
            .rejects.toMatchObject({ status: 400, message: 'Upload a JPEG, PNG or WebP image.' });

        const broken = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(200, 7)]);
        await expect(processMenuImage(broken))
            .rejects.toMatchObject({ status: 400, message: 'The image could not be read. Try a different file.' });
    });
});

describe('menu change tracking for the audit trail (P9)', () => {
    test('only changed fields are recorded', () => {
        const before = { name: 'Bunny Chow', description: 'Quarter loaf', category_id: 1, is_available: 1, price: '95.00' };
        expect(diffItem(before, { ...before, is_available: true, price: 99 })).toEqual({});
        expect(diffItem(before, { ...before, name: 'Bunny Chow (Lamb)', is_available: false })).toEqual({
            name: { from: 'Bunny Chow', to: 'Bunny Chow (Lamb)' },
            is_available: { from: true, to: false }
        });
    });
});
