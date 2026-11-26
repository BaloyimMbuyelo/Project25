
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { menuApi, menuImageSrc } from '../../api/modules';
import './CustomerMenu.css';

const CART_KEY = 'ubms_customer_cart';

// The menu API (docs/API.md) uses menu_item_id / category_name / image_path.
// Map to the shape this page and the saved cart already use.
const toCartShape = (item) => ({
  id: item.menu_item_id,
  name: item.name,
  description: item.description,
  category: item.category_name,
  price: item.price,
  image: item.image_path,
});

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

        // Shared API client: uses the deployed API address (VITE_API_URL),
        // not localhost, so the page also works on phones and the live site.
        const { data } = await menuApi.items({ available_only: true });

        if (!Array.isArray(data)) {
          throw new Error('The menu response has an unexpected format.');
        }

        setMenuItems(data.map(toCartShape));
      } catch (err) {
        setError(err.message || 'Unable to retrieve the restaurant menu.');
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
                  src={menuImageSrc(item.image)}
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
