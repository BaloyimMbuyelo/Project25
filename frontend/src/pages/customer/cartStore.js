// The customer's cart lives in this browser (localStorage) until checkout.
// Same key and item shape as CustomerMenu.jsx and Cart.jsx:
// { id, name, description, category, price, image, quantity }.

export const CART_KEY = 'ubms_customer_cart';

export function loadCart() {
  try {
    const saved = JSON.parse(localStorage.getItem(CART_KEY));
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function clearCart() {
  try {
    localStorage.removeItem(CART_KEY);
  } catch {
    // storage unavailable - nothing to clear
  }
}

export const cartTotal = (cart) =>
  cart.reduce((total, item) => total + Number(item.price) * item.quantity, 0);
