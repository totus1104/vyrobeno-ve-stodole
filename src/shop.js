import { maxQuantity } from './shop-catalog.js';
import { readCart, writeCart } from './cart-state.js';

const money = new Intl.NumberFormat('cs-CZ', {
  style: 'currency',
  currency: 'CZK',
  maximumFractionDigits: 0,
});
let cart = readCart();
const cartPanel = document.querySelector('.shop-cart');
const items = document.querySelector('#cart-items');
const empty = document.querySelector('#cart-empty');
const status = document.querySelector('#cart-status');
const form = document.querySelector('#shop-checkout');
const totalLabel = document.querySelector('#cart-total');
const result = document.querySelector('#shop-result');
const returnLink = document.querySelector('#return-to-shop');
const fields = form.querySelector('fieldset');
const submitButton = form.querySelector('button[type=submit]');
let processing = false;
let live = false;
let lastSubmission;

function syncCheckout() {
  const shipping = form.elements.delivery.value === 'shipping';
  const pickup = form.querySelector('[name=payment][value=pickup]');
  pickup.disabled = shipping;
  if (shipping && pickup.checked) form.elements.payment.value = 'transfer';
  submitButton.disabled = processing || fields.disabled || !form.matches(':valid');
}

function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text) node.textContent = text;
  if (className) node.className = className;
  return node;
}

function button(text, className, label) {
  const node = element('button', text, className);
  node.type = 'button';
  if (label) node.setAttribute('aria-label', label);
  return node;
}

function total() {
  return [...cart].reduce((sum, [product, quantity]) => sum + product.price * quantity, 0);
}

function setQuantity(product, quantity) {
  if (processing || quantity > maxQuantity) return;
  if (quantity > 0) cart.set(product, quantity);
  else cart.delete(product);
  writeCart(cart);
  result.hidden = true;
  renderCart();
  status.textContent = quantity > 0
    ? `${product.name}: ${quantity} ks. Celkem ${money.format(total())}.`
    : `${product.name}: odebráno z košíku.`;
}

function renderCart() {
  items.replaceChildren();
  for (const [product, quantity] of cart) {
    const row = element('li', '', 'shop-item');
    const controls = element('div', '', 'shop-quantity');
    const less = button('−', '', `Snížit množství: ${product.name}`);
    const more = button('+', '', `Zvýšit množství: ${product.name}`);
    more.disabled = quantity >= maxQuantity;
    less.addEventListener('click', () => {
      setQuantity(product, quantity - 1);
      (items.querySelector(`[data-product="${product.id}"] button`) ?? items.querySelector('button') ?? returnLink).focus();
    });
    more.addEventListener('click', () => {
      setQuantity(product, quantity + 1);
      const buttons = items.querySelectorAll(`[data-product="${product.id}"] button`);
      (buttons[1]?.disabled ? buttons[0] : buttons[1])?.focus();
    });
    row.dataset.product = product.id;
    controls.append(less, element('span', `${quantity} ks`), more);
    row.append(element('strong', product.name), controls, element('span', money.format(product.price * quantity)));
    items.append(row);
  }
  empty.hidden = cart.size > 0;
  form.hidden = cart.size === 0;
  totalLabel.textContent = money.format(total());
}

form.addEventListener('input', syncCheckout);
form.addEventListener('change', syncCheckout);
window.addEventListener('pageshow', event => {
  if (!event.persisted) return;
  cart = readCart();
  renderCart();
  syncCheckout();
});

form.addEventListener('submit', async event => {
  event.preventDefault();
  if (processing || !cart.size) return;
  const data = Object.fromEntries(new FormData(form));
  const order = { ...data, items: [...cart].map(([product, quantity]) => ({ id: product.id, quantity })) };
  const details = JSON.stringify(order);
  // Keep the same key when retrying a submission whose response was lost.
  if (lastSubmission?.details !== details) lastSubmission = { details, key: crypto.randomUUID() };
  processing = true;
  submitButton.disabled = true;
  form.setAttribute('aria-busy', 'true');
  result.hidden = false;
  result.textContent = 'Ukládám objednávku…';
  try {
    const response = await fetch('./api/shop/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...order, key: lastSubmission.key }),
    });
    const saved = await response.json();
    if (!response.ok) throw new Error(saved.error || 'Objednávková služba je nedostupná.');
    result.textContent = live
      ? `Objednávka ${saved.number} za ${money.format(saved.total)} byla přijata. Vyčkejte na potvrzení termínu a ceny. Zatím nic neplaťte.`
      : `Zkušební objednávka ${saved.number} za ${money.format(saved.total)} byla uložena. E-maily zůstávají v místním náhledu.`;
    cart.clear();
    writeCart(cart);
    form.reset();
    lastSubmission = undefined;
    renderCart();
  } catch (error) {
    result.textContent = error instanceof TypeError || error instanceof SyntaxError
      ? 'Spojení se nezdařilo. Košík zůstal zachován. Zkuste odeslání zopakovat.'
      : error.message;
  } finally {
    processing = false;
    syncCheckout();
    form.removeAttribute('aria-busy');
  }
  result.focus();
});

cartPanel.hidden = false;
renderCart();
try {
  const response = await fetch('./api/shop/status');
  if (!response.ok) throw new Error();
  ({ live } = await response.json());
  document.querySelector('#shop-preview').hidden = live;
  fields.disabled = false;
  syncCheckout();
} catch {
  document.querySelector('#shop-intro').textContent = 'Objednávky jsou dočasně nedostupné.';
}
