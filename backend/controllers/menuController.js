const service = require('../services/menuService');

// ---------- /api/v1/menu ----------

async function categories(req, res) {
    res.json({ data: await service.listCategories() });
}

async function createCategory(req, res) {
    const data = await service.createCategory(req.user, req.valid.body);
    res.status(201).json({ data, message: 'Category added' });
}

async function updateCategory(req, res) {
    const data = await service.updateCategory(req.user, req.valid.params.id, req.valid.body);
    res.json({ data, message: 'Category updated' });
}

async function setCategoryStatus(req, res) {
    const data = await service.setCategoryActive(req.user, req.valid.params.id, req.valid.body.is_active);
    res.json({ data, message: data.is_active ? 'Category reactivated' : 'Category deactivated' });
}

async function items(req, res) {
    res.json({ data: await service.listItems(req.valid.query) });
}

async function item(req, res) {
    res.json({ data: await service.getItem(req.valid.params.id) });
}

async function createItem(req, res) {
    const data = await service.createItem(req.user, req.valid.body);
    res.status(201).json({ data, message: 'Menu item added successfully' });
}

async function updateItem(req, res) {
    const data = await service.updateItem(req.user, req.valid.params.id, req.valid.body);
    res.json({ data, message: 'Menu item updated successfully' });
}

async function setAvailability(req, res) {
    const data = await service.setAvailability(req.user, req.valid.params.id, req.valid.body.is_available);
    res.json({ data, message: data.is_available ? `${data.name} is available` : `${data.name} is unavailable` });
}

async function deleteItem(req, res) {
    await service.deleteItem(req.user, req.valid.params.id);
    res.json({ data: null, message: 'Menu item removed. Past orders that include it are kept.' });
}

async function uploadImage(req, res) {
    const data = await service.uploadImage(req.user, req.valid.params.id, req.file.buffer);
    res.json({ data, message: 'Photo uploaded' });
}

async function removeImage(req, res) {
    const data = await service.removeImage(req.user, req.valid.params.id);
    res.json({ data, message: 'Photo removed' });
}

// ---------- Read-only /api/menu (old shape, kept for the current customer menu) ----------

const legacyShape = (item) => ({
    id: item.menu_item_id,
    name: item.name,
    description: item.description,
    category: item.category_name,
    price: item.price,
    image: item.image_path,
    available: item.is_available ? 1 : 0,
    updated_at: item.updated_at
});

async function legacyList(req, res) {
    res.json((await service.listItems()).map(legacyShape));
}

async function legacyItem(req, res) {
    res.json(legacyShape(await service.getItem(req.valid.params.id)));
}

module.exports = {
    categories,
    createCategory,
    updateCategory,
    setCategoryStatus,
    items,
    item,
    createItem,
    updateItem,
    setAvailability,
    deleteItem,
    uploadImage,
    removeImage,
    legacyList,
    legacyItem
};
