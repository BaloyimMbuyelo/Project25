import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { ordersApi } from '../../api/modules';
import { clearSession, getUser } from '../../auth/session';
import { ROLES } from '../../auth/permissions';
import { formatRand } from '../../utils/format';
import CustomerAccountBar from '../../components/CustomerAccountBar';
import { cartTotal, clearCart, loadCart } from './cartStore';
import './Checkout.css';

// Customer checkout (Analysis 11.1 and 13.1: select items -> review ->
// submit -> confirmation). Places an online Collection order with
// POST /api/v1/orders. The server re-prices every line and works out the
// total (FR-09, BR-02); it also refuses items that are no longer available
// (BR-01). Payment is taken by the cashier at collection (FR-18).

const MAX_QTY = 25;

function Checkout() {
  const navigate = useNavigate();
  const user = getUser();
  const [cart] = useState(loadCart);
  const [instructions, setInstructions] = useState('');
  const [notes, setNotes] = useState({});
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);

  if (user?.role !== ROLES.CUSTOMER) {
    return <Navigate to="/login?next=/checkout" replace />;
  }

  const total = cartTotal(cart);
  const tooMany = cart.find((item) => item.quantity > MAX_QTY);

  async function placeOrder(event) {
    event.preventDefault();
    if (tooMany) {
      setError(`You can order up to ${MAX_QTY} of one item. Change the quantity of ${tooMany.name} in your cart.`);
      return;
    }

    setSubmitting(true);
    setError('');
    setFieldErrors({});
    try {
      const response = await ordersApi.place({
        order_type: 'COLLECTION',
        special_instructions: instructions.trim() || undefined,
        lines: cart.map((item) => ({
          menu_item_id: item.id,
          quantity: item.quantity,
          notes: notes[item.id]?.trim() || undefined,
        })),
      });
      clearCart();
      navigate(`/my-orders/${encodeURIComponent(response.data.order_ref)}`, {
        replace: true,
        state: { placed: true },
      });
    } catch (err) {
      if (err.status === 401) {
        clearSession();
        navigate('/login?next=/checkout', { replace: true });
        return;
      }
      if (err.fields?.length) setFieldErrors(err.fieldErrors());
      // e.g. 409 "Beef Burger is no longer available."
      setError(err.message);
      setSubmitting(false);
    }
  }

  if (cart.length === 0) {
    return (
      <>
        <CustomerAccountBar />
        <main className="checkout-page">
          <section className="checkout-panel checkout-empty">
            <h2>Your cart is empty</h2>
            <p>Add some meals before checking out.</p>
            <Link to="/menu" className="checkout-primary">Explore menu</Link>
          </section>
        </main>
      </>
    );
  }

  return (
    <>
      <CustomerAccountBar />
      <main className="checkout-page">
        <header className="checkout-header">
          <p className="eyebrow">UBUNTU BISTRO</p>
          <h2>Checkout</h2>
          <p>Review your order, then place it. We&apos;ll have it ready for collection.</p>
        </header>

        <form className="checkout-layout" onSubmit={placeOrder} noValidate>
          <section className="checkout-panel" aria-labelledby="items-heading">
            <h3 id="items-heading">Your order</h3>
            <ul className="checkout-lines">
              {cart.map((item) => (
                <li key={item.id}>
                  <div className="checkout-line-top">
                    <span><strong>{item.quantity} ×</strong> {item.name}</span>
                    <span>{formatRand(Number(item.price) * item.quantity)}</span>
                  </div>
                  <label htmlFor={`note-${item.id}`} className="checkout-note-label">Note for the kitchen (optional)</label>
                  <input
                    id={`note-${item.id}`}
                    type="text"
                    maxLength={255}
                    placeholder="e.g. No onions"
                    value={notes[item.id] || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                  />
                </li>
              ))}
            </ul>
            <Link to="/cart" className="checkout-edit">Change items or quantities</Link>
          </section>

          <section className="checkout-panel" aria-labelledby="details-heading">
            <h3 id="details-heading">Collection details</h3>
            <dl className="checkout-details">
              <div><dt>Name</dt><dd>{user.full_name}</dd></div>
              <div><dt>Order type</dt><dd>Collection at the restaurant</dd></div>
              <div><dt>Payment</dt><dd>Pay when you collect (cash or card)</dd></div>
            </dl>

            <label htmlFor="instructions" className="checkout-note-label">Special instructions (optional)</label>
            <textarea
              id="instructions"
              rows={3}
              maxLength={255}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="e.g. Extra napkins, collecting at 18:30"
              aria-invalid={Boolean(fieldErrors.special_instructions)}
            />
            {fieldErrors.special_instructions && <p className="checkout-field-error">{fieldErrors.special_instructions}</p>}

            <div className="checkout-total">
              <span>Total</span>
              <strong>{formatRand(total)}</strong>
            </div>
            <p className="checkout-small">Prices include VAT. The final total is confirmed when you place the order.</p>

            {error && <div className="checkout-error" role="alert">⚠ {error}</div>}

            <button type="submit" className="checkout-primary" disabled={submitting}>
              {submitting ? 'Placing order…' : `Place order · ${formatRand(total)}`}
            </button>
          </section>
        </form>
      </main>
    </>
  );
}

export default Checkout;
