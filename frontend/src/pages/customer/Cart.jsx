
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { menuImageSrc } from '../../api/modules';
import './Cart.css';

const CART_KEY = 'ubms_customer_cart';

function Cart() {
  const [cart, setCart] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem(CART_KEY)) || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(cart));
  }, [cart]);

  const updateQuantity = (id, change) => {
    setCart((currentCart) =>
      currentCart
        .map((item) =>
          item.id === id
            ? { ...item, quantity: item.quantity + change }
            : item
        )
        .filter((item) => item.quantity > 0)
    );
  };

  const removeItem = (id) => {
    setCart((currentCart) =>
      currentCart.filter((item) => item.id !== id)
    );
  };

  const subtotal = cart.reduce(
    (total, item) =>
      total + Number(item.price) * item.quantity,
    0
  );

  return (
    <div className="customer-cart">
      <header className="cart-header">
        <p className="eyebrow">UBUNTU BISTRO</p>
        <h2>Your Shopping Cart</h2>
        <p>Review your selected meals before checkout.</p>
      </header>

      <main className="cart-content">
        {cart.length === 0 ? (
          <section className="empty-cart">
            <h3>Your cart is empty</h3>
            <p>You haven't added any meals yet.</p>
            <Link to="/menu" className="cart-primary-button">
              Explore Menu
            </Link>
          </section>
        ) : (
          <>
            <section className="cart-items">
              {cart.map((item) => (
                <article className="cart-item" key={item.id}>
                  <img
                    src={menuImageSrc(item.image)}
                    alt={item.name}
                  />

                  <div className="cart-item-details">
                    <h3>{item.name}</h3>
                    <p>R {Number(item.price).toFixed(2)} each</p>

                    <div className="quantity-controls">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, -1)}
                        aria-label={`Decrease ${item.name} quantity`}
                      >
                        −
                      </button>

                      <span>{item.quantity}</span>

                      <button
                        type="button"
                        onClick={() => updateQuantity(item.id, 1)}
                        aria-label={`Increase ${item.name} quantity`}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="cart-item-total">
                    <strong>
                      R {(Number(item.price) * item.quantity).toFixed(2)}
                    </strong>

                    <button
                      type="button"
                      className="remove-item-button"
                      onClick={() => removeItem(item.id)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              ))}
            </section>

            <section className="cart-summary">
              <h3>Order Summary</h3>

              <div className="summary-row">
                <span>Subtotal</span>
                <strong>R {subtotal.toFixed(2)}</strong>
              </div>

              <div className="summary-row">
                <span>Total</span>
                <strong>R {subtotal.toFixed(2)}</strong>
              </div>

              <button
                type="button"
                className="checkout-button"
                disabled
                title="Checkout will be enabled in the next module."
              >
                Checkout (Coming Soon)
              </button>

              <Link to="/menu" className="continue-shopping">
                Continue Shopping
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

export default Cart;
