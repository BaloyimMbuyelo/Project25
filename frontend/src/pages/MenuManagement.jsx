
import { useState } from 'react';
import './MenuManagement.css';

const initialMeals = [
  { id: 1, name: 'Grilled Chicken', category: 'Main Course', price: 185, available: true },
  { id: 2, name: 'Beef Burger', category: 'Main Course', price: 120, available: true },
  { id: 3, name: 'Creamy Pasta', category: 'Main Course', price: 145, available: true },
  { id: 4, name: 'Garden Salad', category: 'Starters', price: 95, available: false },
  { id: 5, name: 'Chocolate Cake', category: 'Desserts', price: 75, available: true },
];

const emptyForm = {
  name: '',
  category: 'Main Course',
  price: '',
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

  const filteredMeals = meals.filter((meal) => {
    const matchesSearch = meal.name
      .toLowerCase()
      .includes(search.toLowerCase());

    const matchesCategory =
      categoryFilter === 'All' ||
      meal.category === categoryFilter;

    return matchesSearch && matchesCategory;
  });

  function openAddForm() {
    setEditingId(null);
    setForm(emptyForm);
    setShowForm(true);
  }

  function openEditForm(meal) {
    setEditingId(meal.id);
    setForm({
      name: meal.name,
      category: meal.category,
      price: String(meal.price),
    });
    setShowForm(true);
  }

  function handleSubmit(e) {
    e.preventDefault();

    const price = Number(form.price);

    if (!form.name.trim() || !Number.isFinite(price) || price <= 0) {
      alert('Please enter a meal name and a valid price.');
      return;
    }

    if (editingId !== null) {
      setMeals((currentMeals) =>
        currentMeals.map((meal) =>
          meal.id === editingId
            ? {
                ...meal,
                name: form.name.trim(),
                category: form.category,
                price,
              }
            : meal
        )
      );
    } else {
      const newMeal = {
        id: Date.now(),
        name: form.name.trim(),
        category: form.category,
        price,
        available: true,
      };

      setMeals((currentMeals) => [...currentMeals, newMeal]);
    }

    closeForm();
  }

  function closeForm() {
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm);
  }

  function toggleAvailability(id) {
    setMeals((currentMeals) =>
      currentMeals.map((meal) =>
        meal.id === id
          ? { ...meal, available: !meal.available }
          : meal
      )
    );
  }

  function deleteMeal(id) {
    const confirmed = window.confirm(
      'Are you sure you want to delete this menu item?'
    );

    if (confirmed) {
      setMeals((currentMeals) =>
        currentMeals.filter((meal) => meal.id !== id)
      );
    }
  }

  return (
    <div className="menu-page">

      {/* Page heading */}
      <div className="menu-heading">
        <div>
          <h2>Menu Management</h2>
          <p>
            Manage restaurant meals, categories, pricing and availability.
          </p>
        </div>

        <button className="add-meal-btn" onClick={openAddForm}>
          + Add New Meal
        </button>
      </div>

      {/* Summary cards */}
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

      {/* Add and edit form */}
      {showForm && (
        <form className="meal-form" onSubmit={handleSubmit}>
          <h3>
            {editingId !== null ? 'Edit Menu Item' : 'Add New Menu Item'}
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

          <label htmlFor="mealCategory">Category</label>
          <select
            id="mealCategory"
            value={form.category}
            onChange={(e) =>
              setForm({ ...form, category: e.target.value })
            }
          >
            {categories.filter((category) => category !== 'All').map(
              (category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              )
            )}
          </select>

          <label htmlFor="mealPrice">Price (R)</label>
          <input
            id="mealPrice"
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Enter price"
            value={form.price}
            onChange={(e) =>
              setForm({ ...form, price: e.target.value })
            }
            required
          />

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

      {/* Menu table */}
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

        {/* Category filter */}
        <div className="menu-filters">
          <label htmlFor="categoryFilter">Filter by category:</label>

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

        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
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
                  <td>
                    <strong>{meal.name}</strong>
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
                  <td colSpan="5">
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
