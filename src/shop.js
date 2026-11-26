import { catalogReady, maxQuantity, checkoutShippingPrice, checkoutFreeShippingAbove, checkoutScriptUrl as scriptUrl } from './shop-catalog.js';
import { readCart, writeCart } from './cart-state.js';
import { postAppsScript } from './inquiry-mail.js';

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
const submitStatus = document.querySelector('#shop-submit-status');
let processing = false;
let canSubmit = false;
let live = false;
let lastSubmission;

function syncCheckout() {
  submitButton.disabled = processing || !canSubmit || !form.matches(':valid');
  if (scriptUrl) {
    totalLabel.textContent = money.format(totalWithDelivery(form.elements.delivery.value));
  }
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

function totalWithDelivery(delivery) {
  const subtotal = total();
  if (delivery !== 'shipping' || checkoutShippingPrice === null) return subtotal;
  const freeShipping = checkoutFreeShippingAbove !== null && subtotal > checkoutFreeShippingAbove;
  return subtotal + (freeShipping ? 0 : checkoutShippingPrice);
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
  syncCheckout();
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
  if (processing || !canSubmit || !cart.size || !form.reportValidity()) return;
  if (scriptUrl && !catalogReady) {
    const previewTotal = totalWithDelivery(form.elements.delivery.value);
    result.hidden = false;
    result.textContent = `Zkušební objednávka za ${money.format(previewTotal)} je v pořádku. Údaje zůstaly v prohlížeči.`;
    result.focus();
    return;
  }
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
    const saved = await submitOrder({ ...order, key: lastSubmission.key });
    result.textContent = scriptUrl
      ? `Objednávka ${saved.number} za ${money.format(saved.total)} byla přijata. Fakturu jsme odeslali e-mailem.`
      : live
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

async function submitOrder(order) {
  if (scriptUrl) {
    const expectedTotal = totalWithDelivery(order.delivery);
    const reply = await postAppsScript(scriptUrl, { ...order, expectedTotal }, 'Odeslání se nepodařilo potvrdit. Košík zůstal zachován. Zkuste odeslání zopakovat.');
    if (reply.ok !== true) throw new Error(reply.error || 'Objednávková služba je nedostupná.');
    return reply;
  }
  const response = await fetch('./api/shop/orders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(order),
  });
  const saved = await response.json();
  if (!response.ok) throw new Error(saved.error || 'Objednávková služba je nedostupná.');
  return saved;
}

// Editing the checkout does not require the order service.
fields.disabled = false;
syncCheckout();
cartPanel.hidden = false;
renderCart();
if (scriptUrl) {
  canSubmit = true;
  document.querySelector('#shop-preview').hidden = catalogReady;
  submitStatus.hidden = catalogReady;
  submitStatus.textContent = 'Zkušební režim. Odesláním ověříte vyplnění a celkovou cenu.';
  const shipping = form.querySelector('[value="shipping"]');
  shipping.disabled = checkoutShippingPrice === null;
  const shippingHint = checkoutShippingPrice === null
    ? 'Aktuálně je k dispozici osobní odběr.'
    : `Doprava stojí ${money.format(checkoutShippingPrice)}.`;
  const freeShippingHint = checkoutShippingPrice !== null && checkoutFreeShippingAbove !== null
    ? ` Při hodnotě výrobků nad ${money.format(checkoutFreeShippingAbove)} je doprava zdarma.`
    : '';
  document.querySelector('#shop-delivery-hint').textContent = shippingHint + freeShippingHint;
  document.querySelector('.shop-total').firstChild.textContent = 'Celkem ';
  form.querySelector('[value="transfer"]').parentElement.lastChild.textContent = ' Převodem (QR platba ve faktuře)';
  syncCheckout();
} else try {
  const response = await fetch('./api/shop/status', { signal: AbortSignal.timeout(5000) });
  if (!response.ok) throw new Error();
  const shopStatus = await response.json();
  if (typeof shopStatus?.live !== 'boolean') throw new Error();
  live = shopStatus.live;
  canSubmit = true;
  document.querySelector('#shop-preview').hidden = live;
  submitStatus.hidden = true;
  syncCheckout();
} catch {
  submitStatus.textContent = 'Objednávková služba není dostupná. Údaje můžete vyplnit na zkoušku, objednávku teď nelze odeslat.';
}
