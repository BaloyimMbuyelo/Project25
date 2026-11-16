
import { useState } from 'react';
import './MenuManagement.css';

const initialMeals = [
  { id: 1, name: 'Grilled Chicken', category: 'Main Course', price: 185, available: true },
  { id: 2, name: 'Beef Burger', category: 'Main Course', price: 120, available: true },
  { id: 3, name: 'Creamy Pasta', category: 'Main Course', price: 145, available: true },
  { id: 4, name: 'Garden Salad', category: 'Starters', price: 95, available: false },
  { id: 5, name: 'Chocolate Cake', category: 'Desserts', price: 75, available: true },
];

function MenuManagement() {
  const [meals, setMeals] = useState(initialMeals);
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    category: 'Main Course',
    price: '',
  });

  const filteredMeals = meals.filter(meal =>
    meal.name.toLowerCase().includes(search.toLowerCase())
  );

  function addMeal(e) {
    e.preventDefault();

    if (!form.name.trim() || Number(form.price) <= 0) {
      alert('Please enter a meal name and a valid price.');
      return;
    }

    setMeals([...meals, {
      ...form,
      id: Date.now(),
      price: Number(form.price),
      available: true,
    }]);

    setForm({ name: '', category: 'Main Course', price: '' });
    setShowForm(false);
  }

  function toggleAvailability(id) {
    setMeals(meals.map(meal =>
      meal.id === id
        ? { ...meal, available: !meal.available }
        : meal
    ));
  }

  function deleteMeal(id) {
    if (window.confirm('Are you sure you want to delete this meal?')) {
      setMeals(meals.filter(meal => meal.id !== id));
    }
  }

  return (
    <div className="menu-page">
      <div className="menu-heading">
        <div>
          <h2>Menu Management</h2>
          <p>Manage restaurant meals, categories and pricing.</p>
        </div>

        <button
          className="add-meal-btn"
          onClick={() => setShowForm(!showForm)}
        >
          + Add New Meal
        </button>
      </div>

      <div className="menu-summary">
        <div>
          <span>Total Menu Items</span>
          <h2>{meals.length}</h2>
        </div>
        <div>
          <span>Available Meals</span>
          <h2>{meals.filter(m => m.available).length}</h2>
        </div>
        <div>
          <span>Unavailable Meals</span>
          <h2>{meals.filter(m => !m.available).length}</h2>
        </div>
      </div>

      {showForm && (
        <form className="meal-form" onSubmit={addMeal}>
          <h3>Add New Menu Item</h3>

          <label>Meal Name</label>
          <input
            type="text"
            placeholder="Enter meal name"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            required
          />

          <label>Category</label>
          <select
            value={form.category}
            onChange={e => setForm({ ...form, category: e.target.value })}
          >
            <option>Main Course</option>
            <option>Starters</option>
            <option>Desserts</option>
            <option>Drinks</option>
          </select>

          <label>Price (R)</label>
          <input
            type="number"
            min="0.01"
            step="0.01"
            placeholder="Enter price"
            value={form.price}
            onChange={e => setForm({ ...form, price: e.target.value })}
            required
          />

          <div className="form-actions">
            <button type="submit" className="add-meal-btn">
              Save Meal
            </button>
            <button
              type="button"
              className="cancel-btn"
              onClick={() => setShowForm(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="menu-table-panel">
        <div className="menu-table-heading">
          <h3>Restaurant Menu</h3>
          <input
            type="search"
            placeholder="Search meals..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
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
              {filteredMeals.map(meal => (
                <tr key={meal.id}>
                  <td><strong>{meal.name}</strong></td>
                  <td>{meal.category}</td>
                  <td>R {meal.price.toFixed(2)}</td>
                  <td>
                    <span className={`status ${meal.available ? 'completed' : 'pending'}`}>
                      {meal.available ? 'Available' : 'Unavailable'}
                    </span>
                  </td>
                  <td>
                    <button
                      className="table-action"
                      onClick={() => toggleAvailability(meal.id)}
                    >
                      {meal.available ? 'Disable' : 'Enable'}
                    </button>
                    <button
                      className="delete-action"
                      onClick={() => deleteMeal(meal.id)}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              ))}

              {filteredMeals.length === 0 && (
                <tr>
                  <td colSpan="5">No matching meals found.</td>
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
