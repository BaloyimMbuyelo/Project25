
import { useEffect, useRef, useState } from 'react';
import { menuApi, menuImageSrc } from '../api/modules';
import './MenuManagement.css';

// Menu management (FR-05, FR-06) on the protected /api/v1/menu API.
// Saving, availability, delete and photos need a Manager or Administrator.

const MAX_PHOTO_BYTES = 1024 * 1024;
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const emptyForm = {
  name: '',
  description: '',
  category_id: '',
  price: '',
};

function MenuManagement() {
  const [meals, setMeals] = useState([]);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  // Photo: the saved one, a newly chosen file and its preview
  const [currentImage, setCurrentImage] = useState(null);
  const [photoFile, setPhotoFile] = useState(null);
  const [photoPreview, setPhotoPreview] = useState('');
  const [removePhoto, setRemovePhoto] = useState(false);
  const fileInput = useRef(null);

  // Load categories and menu items from the API
  async function fetchMeals() {
    try {
      setError('');

      const [itemsResponse, categoriesResponse] = await Promise.all([
        menuApi.items(),
        menuApi.categories(),
      ]);

      setMeals(itemsResponse.data);
      setCategories(categoriesResponse.data);
    } catch (err) {
      setError(err.message || 'Could not connect to the backend.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMeals();
  }, []);

  // Release the preview URL when it changes or the page closes
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);

  // Search and category filtering
  const filteredMeals = meals.filter((meal) => {
    const matchesSearch =
      meal.name.toLowerCase().includes(search.toLowerCase()) ||
      (meal.description || '').toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === 'All' ||
      String(meal.category_id) === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  function resetPhoto() {
    setPhotoFile(null);
    setPhotoPreview('');
    setRemovePhoto(false);
    if (fileInput.current) fileInput.current.value = '';
  }

  // Open add form
  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm, category_id: categories[0] ? String(categories[0].category_id) : '' });
    setCurrentImage(null);
    resetPhoto();
    setShowForm(true);
  }

  // Open edit form
  function openEditForm(meal) {
    setEditingId(meal.menu_item_id);

    setForm({
      name: meal.name,
      description: meal.description || '',
      category_id: String(meal.category_id),
      price: String(meal.price),
    });

    setCurrentImage(meal.image_path);
    resetPhoto();
    setShowForm(true);
  }

  // Close form
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
    setCurrentImage(null);
    resetPhoto();
  }

  // Choose a photo (checked again by the server)
  function choosePhoto(event) {
    const file = event.target.files[0];
    if (!file) return;

    if (!PHOTO_TYPES.includes(file.type)) {
      alert('Please choose a JPEG, PNG or WebP photo.');
      event.target.value = '';
      return;
    }

    if (file.size > MAX_PHOTO_BYTES) {
      alert('The photo must be 1 MB or smaller.');
      event.target.value = '';
      return;
    }

    setPhotoFile(file);
    setPhotoPreview(URL.createObjectURL(file));
    setRemovePhoto(false);
  }

  function removeImage() {
    resetPhoto();
    setRemovePhoto(Boolean(currentImage));
  }

  const previewSrc = photoPreview || (!removePhoto && menuImageSrc(currentImage)) || '';

  // Add or update the menu item, then its photo
  async function handleSubmit(e) {
    e.preventDefault();

    const price = Number(form.price);

    if (
      !form.name.trim() ||
      !Number.isFinite(price) ||
      price <= 0 ||
      price > 999.99
    ) {
      alert('Please enter a valid meal name and a price between R0.01 and R999.99.');
      return;
    }

    if (!form.category_id) {
      alert('Please choose a category.');
      return;
    }

    const mealData = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      category_id: Number(form.category_id),
      price: Math.round(price * 100) / 100,
    };

    try {
      setSaving(true);
      setError('');

      const saved = editingId !== null
        ? await menuApi.update(editingId, mealData)
        : await menuApi.create(mealData);

      const itemId = saved.data.menu_item_id;

      if (photoFile) {
        await menuApi.uploadImage(itemId, photoFile);
      } else if (removePhoto) {
        await menuApi.removeImage(itemId);
      }

      await fetchMeals();
      closeForm();

      alert(
        editingId !== null
          ? 'Menu item updated successfully!'
          : 'Menu item added successfully!'
      );
    } catch (err) {
      alert(err.message || 'An error occurred while saving the meal.');
    } finally {
      setSaving(false);
    }
  }

  // Enable or disable a meal
  async function toggleAvailability(meal) {
    try {
      await menuApi.setAvailability(meal.menu_item_id, !meal.is_available);
      await fetchMeals();
    } catch (err) {
      alert(err.message || 'Could not update meal availability.');
    }
  }

  // Remove a meal from the menu (past orders keep it)
  async function deleteMeal(meal) {
    if (
      window.confirm(
        `Delete '${meal.name}'?\n\nThis removes the item from the menu. Past orders that include it are kept.\n\n` +
        'Tip: use Disable instead if it is only temporarily off the menu.'
      )
    ) {
      try {
        await menuApi.remove(meal.menu_item_id);
        await fetchMeals();
        alert('Menu item deleted successfully!');
      } catch (err) {
        alert(err.message || 'Could not delete menu item.');
      }
    }
  }

  return (
    <div className="menu-page">

      {/* Page Heading */}
      <div className="menu-heading">
        <div>
          <h2>Menu Management</h2>
          <p>
            Manage meals, descriptions, photos, prices and availability.
          </p>
        </div>

        <button
          type="button"
          className="add-meal-btn"
          onClick={openAddForm}
        >
          + Add New Meal
        </button>
      </div>

      {/* Summary Cards */}
      <div className="menu-summary">
        <div>
          <span>Total Menu Items</span>
          <h2>{meals.length}</h2>
        </div>

        <div>
          <span>Available Meals</span>
          <h2>{meals.filter((meal) => meal.is_available).length}</h2>
        </div>

        <div>
          <span>Unavailable Meals</span>
          <h2>{meals.filter((meal) => !meal.is_available).length}</h2>
        </div>
      </div>

      {/* Add and Edit Meal Form */}
      {showForm && (
        <form className="meal-form" onSubmit={handleSubmit}>
          <h3>
            {editingId !== null
              ? 'Edit Menu Item'
              : 'Add New Menu Item'}
          </h3>

          <label htmlFor="mealName">Meal Name</label>
          <input
            id="mealName"
            type="text"
            maxLength={50}
            placeholder="Enter meal name"
            value={form.name}
            onChange={(e) =>
              setForm({ ...form, name: e.target.value })
            }
            required
          />

          <label htmlFor="mealDescription">Meal Description</label>
          <textarea
            id="mealDescription"
            maxLength={255}
            placeholder="Describe the meal and its ingredients"
            value={form.description}
            onChange={(e) =>
              setForm({ ...form, description: e.target.value })
            }
            rows="3"
          />

          <label htmlFor="mealCategory">Category</label>
          <select
            id="mealCategory"
            value={form.category_id}
            onChange={(e) =>
              setForm({ ...form, category_id: e.target.value })
            }
            required
          >
            {categories.map((category) => (
              <option key={category.category_id} value={category.category_id}>
                {category.name}
              </option>
            ))}
          </select>

          <label htmlFor="mealPrice">Price (R)</label>
          <input
            id="mealPrice"
            type="number"
            min="0.01"
            max="999.99"
            step="0.01"
            placeholder="Enter meal price"
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: e.target.value })
            }
            required
          />
          <small>Price changes are logged.</small>

          {/* Food photo upload */}
          <label htmlFor="mealImage">
            Food Photo (optional)
          </label>

          <input
            id="mealImage"
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={choosePhoto}
          />

          <small>
            JPEG, PNG or WebP, up to 1 MB. Large photos are resized automatically.
          </small>

          {/* Image Preview */}
          {previewSrc && (
            <div className="image-preview">
              <p>Food Image Preview</p>

              <img
                src={previewSrc}
                alt="Meal preview"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
                onLoad={(e) => {
                  e.currentTarget.style.display = 'block';
                }}
              />

              <button
                type="button"
                className="remove-image-btn"
                onClick={removeImage}
              >
                Remove Image
              </button>
            </div>
          )}

          {/* Form Actions */}
          <div className="form-actions">
            <button
              type="submit"
              className="add-meal-btn"
              disabled={saving}
            >
              {saving
                ? 'Saving...'
                : editingId !== null
                  ? 'Update Meal'
                  : 'Save Meal'}
            </button>

            <button
              type="button"
              className="cancel-btn"
              onClick={closeForm}
              disabled={saving}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Restaurant Menu Table */}
      <div className="menu-table-panel">
        <div className="menu-table-heading">
          <div>
            <h3>Restaurant Menu</h3>
            <p>Manage your restaurant's menu items.</p>
          </div>

          <input
            type="search"
            placeholder="Search meals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Category Filter */}
        <div className="menu-filters">
          <label htmlFor="categoryFilter">
            Filter by category:
          </label>

          <select
            id="categoryFilter"
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
          >
            <option value="All">All</option>
            {categories.map((category) => (
              <option key={category.category_id} value={String(category.category_id)}>
                {category.name}
              </option>
            ))}
          </select>
        </div>

        {/* Meals Table */}
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Image</th>
                <th>Meal Name</th>
                <th>Category</th>
                <th>Price</th>
                <th>Availability</th>
                <th>Actions</th>
              </tr>
            </thead>

            <tbody>
              {loading ? (
                <tr>
                  <td colSpan="6">Loading menu items...</td>
                </tr>
              ) : error ? (
                <tr>
                  <td colSpan="6">{error}</td>
                </tr>
              ) : (
                <>
                  {filteredMeals.map((meal) => (
                    <tr key={meal.menu_item_id}>
                      <td>
                        {meal.image_path ? (
                          <img
                            className="meal-thumbnail"
                            src={menuImageSrc(meal.image_path)}
                            alt={meal.name}
                            onError={(e) => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <div className="meal-placeholder">
                            🍽️
                          </div>
                        )}
                      </td>

                      <td>
                        <strong>{meal.name}</strong>
                        <p className="meal-description">
                          {meal.description}
                        </p>
                      </td>

                      <td>{meal.category_name}</td>
                      <td>R {meal.price.toFixed(2)}</td>

                      <td>
                        <span
                          className={`status ${
                            meal.is_available ? 'completed' : 'pending'
                          }`}
                        >
                          {meal.is_available ? 'Available' : 'Unavailable'}
                        </span>
                      </td>

                      <td>
                        <div className="meal-actions">
                          <button
                            type="button"
                            className="table-action"
                            onClick={() => openEditForm(meal)}
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className="table-action"
                            onClick={() => toggleAvailability(meal)}
                          >
                            {meal.is_available ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            type="button"
                            className="delete-action"
                            onClick={() => deleteMeal(meal)}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}

                  {filteredMeals.length === 0 && (
                    <tr>
                      <td colSpan="6">
                        No matching meals found.
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MenuManagement;
