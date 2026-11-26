import { catalogReady, checkoutScriptUrl, maxQuantity, products } from './shop-catalog.js';
import { readCart, writeCart } from './cart-state.js';

const catalog = document.querySelector('#shop-products');
const status = document.querySelector('#shop-cart-status');
const cartLink = document.querySelector('#go-to-cart');
const prices = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const buttons = new Map();

function updateOffer() {
  const cart = readCart();
  cartLink.hidden = cart.size === 0;
  for (const [product, button] of buttons) button.disabled = (cart.get(product) ?? 0) >= maxQuantity;
}

for (const product of products) {
  const article = document.createElement('article');
  article.className = 'shop-product';
  for (const [tag, value] of [['h3', product.name], ['p', product.description], ['strong', prices.format(product.price)]]) {
    const node = document.createElement(tag);
    node.textContent = value;
    article.append(node);
  }
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'button';
  button.textContent = 'Přidat do košíku';
  button.setAttribute('aria-label', `Přidat do košíku: ${product.name}`);
  button.addEventListener('click', () => {
    const cart = readCart();
    const quantity = (cart.get(product) ?? 0) + 1;
    if (quantity > maxQuantity) return;
    cart.set(product, quantity);
    try {
      writeCart(cart);
      updateOffer();
      status.textContent = `${product.name}: v košíku ${quantity} ks.`;
    } catch {
      status.textContent = 'Košík se nepodařilo uložit. Zkontrolujte nastavení prohlížeče.';
    }
  });
  buttons.set(product, button);
  article.append(button);
  catalog.append(article);
}

updateOffer();
window.addEventListener('pageshow', updateOffer);
function showPreview() {
  document.querySelector('#shop-preview').hidden = false;
  document.querySelector('#products-title').textContent = 'Ukázka nabídky';
}

if (checkoutScriptUrl) {
  if (!catalogReady) showPreview();
} else try {
  const response = await fetch('./api/shop/status');
  if (!response.ok) throw new Error();
  if (!(await response.json()).live) showPreview();
} catch {
  document.querySelector('#shop-intro').textContent = 'Objednávky jsou dočasně nedostupné.';
}
