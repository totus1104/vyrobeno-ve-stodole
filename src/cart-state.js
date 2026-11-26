import { maxQuantity, products } from './shop-catalog.js';

const storageKey = 'stodola-cart';

export function readCart() {
  try {
    const stored = JSON.parse(sessionStorage.getItem(storageKey)) ?? {};
    return new Map(products.flatMap(product => {
      const quantity = stored[product.id];
      return Number.isInteger(quantity) && quantity > 0 && quantity <= maxQuantity
        ? [[product, quantity]]
        : [];
    }));
  } catch {
    return new Map();
  }
}

export function writeCart(cart) {
  sessionStorage.setItem(storageKey, JSON.stringify(Object.fromEntries(
    [...cart].map(([product, quantity]) => [product.id, quantity]),
  )));
  updateCartIcon();
}

export function updateCartIcon() {
  const icon = document.querySelector('.header-cart');
  const badge = icon?.querySelector('.header-cart-count');
  if (!badge) return;
  const count = [...readCart().values()].reduce((sum, quantity) => sum + quantity, 0);
  badge.hidden = count === 0;
  badge.textContent = count;
  icon.setAttribute('aria-label', count ? `Košík, počet kusů: ${count}` : 'Košík');
}
