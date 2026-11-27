import { checkoutScriptUrl, maxQuantity, products } from './shop-catalog.js';
import { readCart, writeCart } from './cart-state.js';
import { cartIcon } from './layout.js';
import { productPhotos } from './shop-photos.js';

const catalog = document.querySelector('#shop-products');
const detail = document.querySelector('#shop-product-detail');
const status = document.querySelector('#shop-cart-status');
const cartLink = document.querySelector('#go-to-cart');
const prices = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const buttons = new Map();

function updateOffer() {
  const cart = readCart();
  if (catalog) cartLink.hidden = cart.size === 0;
  for (const [product, button] of buttons) button.disabled = (cart.get(product) ?? 0) >= maxQuantity;
}

function addToCartButton(product, iconOnly = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = iconOnly ? 'button shop-add-icon' : 'button';
  if (iconOnly) {
    button.innerHTML = cartIcon;
    button.title = 'Přidat do košíku';
  } else {
    button.textContent = 'Přidat do košíku';
  }
  button.setAttribute('aria-label', 'Přidat do košíku: ' + product.name);
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
  return button;
}

function photo(src, alt, lazy = true) {
  const image = document.createElement('img');
  image.src = src;
  image.alt = alt;
  image.loading = lazy ? 'lazy' : 'eager';
  image.decoding = 'async';
  return image;
}

function productCard(product) {
  const article = document.createElement('article');
  article.className = 'shop-product';

  const link = document.createElement('a');
  link.className = 'shop-product-link';
  link.href = './produkt.html?id=' + encodeURIComponent(product.id);
  const title = document.createElement('h3');
  title.textContent = product.name;
  const images = productPhotos[product.id];

  if (images) {
    const picture = document.createElement('div');
    picture.className = 'shop-product-photo';
    const studio = photo(images.studio, '', false);
    const original = photo(images.originals[0].src, '');
    original.className = 'shop-product-original';
    picture.append(studio, original);
    link.append(picture);
  }
  link.append(title);

  const footer = document.createElement('div');
  footer.className = 'shop-product-footer';
  const price = document.createElement('strong');
  price.textContent = prices.format(product.price);
  footer.append(price, addToCartButton(product, true));
  article.append(link, footer);
  return article;
}

function showProductGallery(product, images) {
  const gallery = document.querySelector('#product-gallery');
  const viewer = document.querySelector('.product-viewer');
  const stage = viewer.querySelector('.product-viewer-stage');
  const position = viewer.querySelector('.product-viewer-position');
  const photos = [
    { src: images.studio, alt: product.name + ' ve studiu' },
    ...images.originals,
  ];
  const enlarged = document.createElement('img');
  stage.append(enlarged);
  viewer.querySelector('h2').textContent = product.name;
  let active = 0;
  let opener;

  function showPhoto(index) {
    active = (index + photos.length) % photos.length;
    const { src, alt, rotation = 0 } = photos[active];
    enlarged.src = src;
    enlarged.alt = alt;
    enlarged.dataset.rotation = rotation;
    enlarged.classList.toggle('product-gallery-original', active !== 0);
    position.textContent = `${active + 1} / ${photos.length}`;
  }

  for (const [index, { src, alt, rotation = 0 }] of photos.entries()) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'product-photo-open';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-label', `Zvětšit fotografii: ${alt}`);
    const image = photo(src, '', index !== 0);
    image.dataset.rotation = rotation;
    if (index) image.className = 'product-gallery-original';
    button.append(image);
    button.addEventListener('click', () => {
      opener = button;
      showPhoto(index);
      viewer.showModal();
    });
    gallery.append(button);
  }

  for (const button of viewer.querySelectorAll('[data-photo-step]')) {
    button.addEventListener('click', () => showPhoto(active + Number(button.dataset.photoStep)));
  }
  viewer.addEventListener('keydown', event => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    showPhoto(active + (event.key === 'ArrowLeft' ? -1 : 1));
  });
  viewer.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  gallery.hidden = false;
}

function showDetail() {
  const id = new URLSearchParams(window.location.search).get('id');
  const product = products.find(item => item.id === id);
  const title = document.querySelector('#product-title');
  const description = document.querySelector('#product-description');
  if (!product) {
    title.textContent = 'Výrobek se nepodařilo najít';
    description.textContent = 'Aktuální výrobky najdete v nabídce obchodu.';
    return;
  }

  title.textContent = product.name;
  document.title = product.name + ' | Vyrobeno ve stodole';
  description.textContent = product.description;
  const price = document.querySelector('#product-price');
  price.textContent = prices.format(product.price);
  price.hidden = false;
  const actions = document.querySelector('.product-actions');
  actions.prepend(addToCartButton(product));
  actions.hidden = false;

  const images = productPhotos[product.id];
  if (images) showProductGallery(product, images);
}

if (catalog) {
  catalog.append(...products.map(productCard));
  if (!products.length) status.textContent = 'Nabídku se nepodařilo načíst.';
}
if (detail) showDetail();
updateOffer();
window.addEventListener('pageshow', updateOffer);

if (catalog && !checkoutScriptUrl) try {
  const response = await fetch('./api/shop/status');
  if (!response.ok) throw new Error();
  if (typeof (await response.json())?.live !== 'boolean') throw new Error();
} catch {
  document.querySelector('#shop-intro').textContent = 'Objednávky jsou dočasně nedostupné.';
}
