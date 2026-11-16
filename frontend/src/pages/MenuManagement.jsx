
import { useState } from 'react';
import './MenuManagement.css';

const initialMeals = [
  {
    id: 1,
    name: 'Grilled Chicken',
    description: 'Tender grilled chicken served with seasonal vegetables.',
    category: 'Main Course',
    price: 195,
    image: '/images/restaurant-pictures/grilled-chicken.jpeg',
    available: true,
  },
  {
    id: 2,
    name: 'Beef Burger',
    description: 'Juicy beef patty served with fresh lettuce and tomato.',
    category: 'Main Course',
    price: 120,
    image: '/images/restaurant-pictures/beef-burger.jpeg',
    available: true,
  },
  {
    id: 3,
    name: 'Creamy Pasta',
    description: 'Pasta prepared in a rich and creamy sauce.',
    category: 'Main Course',
    price: 145,
    image: '/images/restaurant-pictures/creamy-pasta.jpeg',
    available: true,
  },
  {
    id: 4,
    name: 'Garden Salad',
    description: 'Fresh seasonal vegetables with house dressing.',
    category: 'Starters',
    price: 95,
    image: '/images/restaurant-pictures/green-salad.jpeg',
    available: false,
  },
  {
    id: 5,
    name: 'Chocolate Cake',
    description: 'Rich chocolate cake served as a dessert.',
    category: 'Desserts',
    price: 75,
    image: '/images/restaurant-pictures/chocolate-cake.jpeg',
    available: true,
  },
];

const emptyForm = {
  name: '',
  description: '',
  category: 'Main Course',
  price: '',
  image: '',
};

function MenuManagement() {
  const [meals, setMeals] = useState(initialMeals);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('All');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const categories = [
    'All',
    'Main Course',
    'Starters',
    'Desserts',
    'Drinks',
  ];

  /* Search and category filtering */
  const filteredMeals = meals.filter((meal) => {
    const matchesSearch =
      meal.name.toLowerCase().includes(search.toLowerCase()) ||
      meal.description.toLowerCase().includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === 'All' ||
      meal.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  /* Open add form */
  function openAddForm() {
    setEditingId(null);
    setForm({ ...emptyForm });
    setShowForm(true);
  }

  /* Open edit form */
  function openEditForm(meal) {
    setEditingId(meal.id);

    setForm({
      name: meal.name,
      description: meal.description,
      category: meal.category,
      price: String(meal.price),
      image: meal.image || '',
    });

    setShowForm(true);
  }

  /* Close form */
  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm({ ...emptyForm });
  }

  /* Remove image URL */
  function removeImage() {
    setForm((current) => ({
      ...current,
      image: '',
    }));
  }

  /* Add or update meal */
  function handleSubmit(e) {
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

    if (imageUrl && !/^https?:\/\/\S+$/i.test(imageUrl) && !imageUrl.startsWith('/')) {
      alert('Please enter a valid image URL or local image path.');
      return;
    }

    const mealData = {
      name: form.name.trim(),
      description: form.description.trim(),
      category: form.category,
      price,
      image: imageUrl,
    };

    if (editingId !== null) {
      setMeals((current) =>
        current.map((meal) =>
          meal.id === editingId
            ? { ...meal, ...mealData }
            : meal
        )
      );
    } else {
      setMeals((current) => [
        ...current,
        {
          id: Date.now(),
          ...mealData,
          available: true,
        },
      ]);
    }

    closeForm();
  }

  /* Enable or disable meal */
  function toggleAvailability(id) {
    setMeals((current) =>
      current.map((meal) =>
        meal.id === id
          ? { ...meal, available: !meal.available }
          : meal
      )
    );
  }

  /* Delete meal */
  function deleteMeal(id) {
    if (window.confirm('Are you sure you want to delete this menu item?')) {
      setMeals((current) =>
        current.filter((meal) => meal.id !== id)
      );
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
            <button type="submit" className="add-meal-btn">
              {editingId !== null ? 'Update Meal' : 'Save Meal'}
            </button>

            <button
              type="button"
              className="cancel-btn"
              onClick={closeForm}
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
              {filteredMeals.map((meal) => (
                <tr key={meal.id}>
                  {/* Meal Image */}
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

                  {/* Meal Details */}
                  <td>
                    <strong>{meal.name}</strong>
                    <p className="meal-description">
                      {meal.description}
                    </p>
                  </td>

                  <td>{meal.category}</td>
                  <td>R {meal.price.toFixed(2)}</td>

                  {/* Availability */}
                  <td>
                    <span
                      className={`status ${
                        meal.available ? 'completed' : 'pending'
                      }`}
                    >
                      {meal.available ? 'Available' : 'Unavailable'}
                    </span>
                  </td>

                  {/* Actions */}
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
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default MenuManagement;
