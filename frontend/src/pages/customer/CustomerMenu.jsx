
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import './CustomerMenu.css';

const API_URL = 'http://localhost:5000/api/menu';
const CART_KEY = 'ubms_customer_cart';

function CustomerMenu() {
  const [menuItems, setMenuItems] = useState([]);
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const fetchMenu = async () => {
      try {
        setLoading(true);
        setError('');

        const response = await fetch(API_URL);

        if (!response.ok) {
          throw new Error('Unable to retrieve the restaurant menu.');
        }

        const data = await response.json();

        if (!Array.isArray(data)) {
          throw new Error('The menu response has an unexpected format.');
        }

        setMenuItems(
          data.filter((item) =>
            item.available === true ||
            item.available === 1 ||
            item.available === '1'
          )
        );
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchMenu();
  }, []);

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const addToCart = (item) => {
    setCart((currentCart) => {
      const existingItem = currentCart.find(
        (cartItem) => cartItem.id === item.id
      );

      if (existingItem) {
        return currentCart.map((cartItem) =>
          cartItem.id === item.id
            ? { ...cartItem, quantity: cartItem.quantity + 1 }
            : cartItem
        );
      }

      return [...currentCart, { ...item, quantity: 1 }];
    });
  };

  const cartCount = cart.reduce(
    (total, item) => total + item.quantity,
    0
  );

  return (
    <div className="customer-menu">
      <header className="customer-menu-header">
        <div>
          <p className="eyebrow">UBUNTU BISTRO</p>
          <h2>Discover Our Menu</h2>
          <p>Freshly prepared meals made with care.</p>
        </div>

        <Link to="/cart" className="customer-cart-link">
          View Cart ({cartCount})
        </Link>
      </header>

      {loading && (
        <p className="menu-message">Loading our menu...</p>
      )}

      {error && (
        <div className="menu-error" role="alert">
          {error}
          <button onClick={() => window.location.reload()}>
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && menuItems.length === 0 && (
        <p className="menu-message">
          No meals are currently available.
        </p>
      )}

      {!loading && !error && menuItems.length > 0 && (
        <section className="customer-menu-grid">
          {menuItems.map((item) => (
            <article className="customer-menu-card" key={item.id}>
              {item.image ? (
                <img
                  src={`http://localhost:5000${item.image}`}
                  alt={item.name}
                  className="customer-menu-image"
                />
              ) : (
                <div className="customer-menu-image-placeholder">
                  Ubuntu Bistro
                </div>
              )}

              <div className="customer-menu-details">
                <span className="customer-menu-category">
                  {item.category}
                </span>

                <h3>{item.name}</h3>

                <p>{item.description}</p>

                <div className="customer-menu-bottom">
                  <strong>
                    R {Number(item.price).toFixed(2)}
                  </strong>

                  <span className="available-label">
                    Available
                  </span>
                </div>

                <button
                  type="button"
                  className="add-to-cart-button"
                  onClick={() => addToCart(item)}
                >
                  Add to Cart
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}

export default CustomerMenu;
