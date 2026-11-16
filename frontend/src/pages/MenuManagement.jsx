
import { useEffect, useState } from 'react';
import './MenuManagement.css';

const API_URL = 'http://localhost:5000/api/menu';

const emptyForm = {
  name: '',
  description: '',
  category: 'Main Course',
  price: '',
  image: '',
};

function MenuManagement() {
  const [meals, setMeals] = useState([]);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const categories = [
    'All',
    'Main Course',
    'Starters',
    'Desserts',
    'Drinks',
  ];

  // Load menu items from MySQL through the backend API
  async function fetchMeals() {
    try {
      setError('');

      const response = await fetch(API_URL);

      if (!response.ok) {
        throw new Error('Unable to retrieve menu items.');
      }

      const data = await response.json();

      const formattedMeals = data.map((meal) => ({
        ...meal,
        price: Number(meal.price),
        available: Boolean(meal.available),
      }));

      setMeals(formattedMeals);
    } catch (err) {
      setError(err.message || 'Could not connect to the backend.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchMeals();
  }, []);

  // Search and category filtering
  const filteredMeals = meals.filter((meal) => {
    const matchesSearch =
      meal.name.toLowerCase().includes(search.toLowerCase()) ||
      (meal.description || '').toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === 'All' ||
      meal.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  // Open add form
  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  // Open edit form
  function openEditForm(meal) {
    setEditingId(meal.id);

    setForm({
      name: meal.name,
      description: meal.description || '',
      category: meal.category,
      price: String(meal.price),
      image: meal.image || '',
    });

    setShowForm(true);
  }

  // Close form
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  // Remove image URL
  function removeImage() {
    setForm((current) => ({
      ...current,
      image: '',
    }));
  }

  // Add or update meal in MySQL
  async function handleSubmit(e) {
    e.preventDefault();

    const price = Number(form.price);
    const imageUrl = form.image.trim();

    if (
      !form.name.trim() ||
      !Number.isFinite(price) ||
      price <= 0
    ) {
      alert('Please enter a valid meal name and price.');
      return;
    }

    if (
      imageUrl &&
      !/^https?:\/\/\S+$/i.test(imageUrl) &&
      !imageUrl.startsWith('/')
    ) {
      alert('Please enter a valid image URL or local image path.');
      return;
    }

    const existingMeal = meals.find(
      (meal) => meal.id === editingId
    );

    const mealData = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      price,
      image: imageUrl,
      available: editingId !== null
        ? existingMeal.available
        : true,
    };

    try {
      setSaving(true);
      setError('');

      const url = editingId !== null
        ? `${API_URL}/${editingId}`
        : API_URL;

      const method = editingId !== null ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(mealData),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Unable to save menu item.');
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

  // Enable or disable meal in MySQL
  async function toggleAvailability(id) {
    const meal = meals.find((item) => item.id === id);

    if (!meal) return;

    try {
      const response = await fetch(`${API_URL}/${id}/availability`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          available: !meal.available,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Unable to update availability.');
      }

      await fetchMeals();
    } catch (err) {
      alert(err.message || 'Could not update meal availability.');
    }
  }

  // Delete meal from MySQL
  async function deleteMeal(id) {
    if (
      window.confirm('Are you sure you want to delete this menu item?')
    ) {
      try {
        const response = await fetch(`${API_URL}/${id}`, {
          method: 'DELETE',
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(result.message || 'Unable to delete menu item.');
        }

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
            Manage meals, descriptions, images, prices and availability.
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
          <h2>{meals.filter((meal) => meal.available).length}</h2>
        </div>

        <div>
          <span>Unavailable Meals</span>
          <h2>{meals.filter((meal) => !meal.available).length}</h2>
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
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value })
            }
          >
            {categories
              .filter((category) => category !== 'All')
              .map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
          </select>

          <label htmlFor="mealPrice">Price (R)</label>
          <input
            id="mealPrice"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Enter meal price"
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: e.target.value })
            }
            required
          />

          {/* Food Image URL */}
          <label htmlFor="mealImage">
            Food Image URL or Local Image Path (optional)
          </label>

          <input
            id="mealImage"
            type="text"
            placeholder="/images/restaurant-pictures/food.jpeg"
            value={form.image}
            onChange={(e) =>
              setForm({ ...form, image: e.target.value })
            }
          />

          <small>
            Use a project image path or a direct image URL.
          </small>

          {/* Image Preview */}
          {form.image.trim() && (
            <div className="image-preview">
              <p>Food Image Preview</p>

              <img
                src={form.image.trim()}
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
            {categories.map((category) => (
              <option key={category} value={category}>
                {category}
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
                    <tr key={meal.id}>
                      <td>
                        {meal.image ? (
                          <img
                            className="meal-thumbnail"
                            src={meal.image}
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

                      <td>{meal.category}</td>
                      <td>R {meal.price.toFixed(2)}</td>

                      <td>
                        <span
                          className={`status ${
                            meal.available ? 'completed' : 'pending'
                          }`}
                        >
                          {meal.available ? 'Available' : 'Unavailable'}
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
                            onClick={() => toggleAvailability(meal.id)}
                          >
                            {meal.available ? 'Disable' : 'Enable'}
                          </button>

                          <button
                            type="button"
                            className="delete-action"
                            onClick={() => deleteMeal(meal.id)}
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
