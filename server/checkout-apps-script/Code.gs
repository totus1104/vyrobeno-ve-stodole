const SHOP = {
  recipient: 'zrzek.10@gmail.com',
  siteOrigin: 'https://totus1104.github.io',
  catalogUrl: 'https://totus1104.github.io/vyrobeno-ve-stodole/katalog.json',
  supplier: 'Vyrobeno ve stodole',
  legalName: '',
  address: '',
  ico: '',
  iban: '',
  // Set to 'non-vat' only if confirmed. A VAT invoice needs tax settings and dates.
  taxMode: '',
  dueInDays: 14,
};
const PAYMENT_NAMES = { transfer: 'Bankovním převodem', pickup: 'Při převzetí' };
const DELIVERY_NAMES = { pickup: 'Osobní odběr', shipping: 'Doručení' };
class CheckoutError extends Error {}

function doPost(event) {
  let requestId = '';
  try {
    const raw = event?.parameter?.payload;
    if (!raw || raw.length > 16000) return checkoutReply_(requestId, { ok: false });
    const data = JSON.parse(raw);
    if (!isUuid_(data?.requestId)) return checkoutReply_(requestId, { ok: false });
    requestId = data.requestId;
    const order = readOrder_(data);
    if (!order) return checkoutReply_(requestId, { ok: false, error: 'Zkontrolujte údaje a obsah košíku.' });
    if (!SHOP.legalName.trim() || !SHOP.address.trim() ||
        !/^\d{8}$/.test(SHOP.ico) || SHOP.taxMode !== 'non-vat' || !normalizeCheckoutIban_(SHOP.iban)) {
      return checkoutReply_(requestId, { ok: false, error: 'Objednávková služba se připravuje.' });
    }
    const receipt = sendOrder_(order, data.key);
    return checkoutReply_(requestId, { ok: true, ...receipt });
  } catch (error) {
    if (error instanceof CheckoutError) return checkoutReply_(requestId, { ok: false, error: error.message });
    console.error(`Odeslání objednávky selhalo. ${error.name || 'Error'}`);
    return checkoutReply_(requestId, {
      ok: false,
      error: 'Dokončení odeslání se nepodařilo potvrdit. Opakujte odeslání se stejnými údaji.',
    });
  }
}

function isUuid_(value) {
  return typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
}

function readOrder_(data) {
  const { name, email, street, city, postcode, delivery, payment } = data;
  const validText = (value, max) => typeof value === 'string' && value.trim() && value.length <= max && !/[\x00-\x1f\x7f]/.test(value);
  if (!validText(name, 100) || !validText(street, 150) || !validText(city, 100) ||
      !validText(email, 254) || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email.trim()) ||
      !validText(postcode, 6) || !/^\d{3} ?\d{2}$/.test(postcode) || !isUuid_(data.key) ||
      !Object.prototype.hasOwnProperty.call(PAYMENT_NAMES, payment) ||
      !Object.prototype.hasOwnProperty.call(DELIVERY_NAMES, delivery) ||
      !Array.isArray(data.items) || !data.items.length || !Number.isSafeInteger(data.expectedTotal) ||
      data.expectedTotal < 1 || data.expectedTotal > 1000000) return null;
  const seen = new Set();
  const items = [];
  for (const entry of data.items) {
    if (!validText(entry?.id, 100) || seen.has(entry.id) || !Number.isSafeInteger(entry.quantity) || entry.quantity < 1) return null;
    seen.add(entry.id);
    items.push({ id: entry.id, quantity: entry.quantity });
  }
  return {
    name: name.trim(), email: email.trim(), street: street.trim(), city: city.trim(),
    postcode: postcode.replace(' ', '').replace(/^(\d{3})/, '$1 '), delivery, payment, items, expectedTotal: data.expectedTotal,
  };
}

function loadCatalog_() {
  try {
    const response = UrlFetchApp.fetch(SHOP.catalogUrl, { followRedirects: false, headers: { 'Cache-Control': 'no-cache' } });
    if (response.getResponseCode() !== 200) throw new Error('Catalog HTTP error');
    const catalog = JSON.parse(response.getContentText());
    if (catalog.catalogReady === true && Array.isArray(catalog.products) && Number.isSafeInteger(catalog.maxQuantity) && catalog.maxQuantity > 0) return catalog;
  } catch (error) {
    console.warn(`Načtení katalogu selhalo. ${error.name || 'Error'}`);
  }
  throw new CheckoutError('Aktuální katalog teď není k dispozici. Zkuste to prosím později.');
}

function priceOrder_(order, catalog) {
  const updated = 'Nabídka nebo cena se změnila. Obnovte stránku a zkontrolujte košík.';
  const lines = [];
  for (const entry of order.items) {
    const product = catalog.products.find(item => item?.id === entry.id);
    if (!product || typeof product.name !== 'string' || !Number.isSafeInteger(product.price) || product.price < 1 ||
        entry.quantity > catalog.maxQuantity) throw new CheckoutError(updated);
    lines.push({ name: product.name, quantity: entry.quantity, price: product.price });
  }
  if (order.delivery === 'shipping') {
    const shipping = catalog.checkoutShippingPrice;
    if (!Number.isSafeInteger(shipping) || shipping < 0) throw new CheckoutError(updated);
    lines.push({ name: 'Doprava', quantity: 1, price: shipping });
  }
  const total = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  if (total !== order.expectedTotal) throw new CheckoutError(updated);
  return { lines, total };
}

function sendOrder_(order, key) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const props = PropertiesService.getScriptProperties();
    const storageKey = `order:${key}`;
    const digest = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(order), Utilities.Charset.UTF_8));
    const existing = props.getProperty(storageKey);
    let state = existing ? JSON.parse(existing) : null;
    if (state && state.digest !== digest) throw new Error('Order changed');
    if (!state) {
      const pricing = priceOrder_(order, loadCatalog_());
      const now = new Date();
      const year = Utilities.formatDate(now, 'Europe/Prague', 'yyyy');
      const counterKey = `sequence:${year}`;
      const next = Number(props.getProperty(counterKey) || 0) + 1;
      if (next > 999999) throw new Error('Invoice sequence exhausted');
      state = { number: year + String(next).padStart(6, '0'), time: now.toISOString(), digest, pricing };
      props.setProperties({ [counterKey]: String(next), [storageKey]: JSON.stringify(state) });
    }
    const pricedOrder = { ...order, ...state.pricing };
    if (!state.ownerSent || !state.customerSent) {
      const pdf = HtmlService.createHtmlOutput(invoiceHtml_(SHOP, pricedOrder, state.number, state.time))
        .getAs('application/pdf').setName(`faktura-${state.number}.pdf`);
      if (!state.ownerSent) {
        const details = [order.name, order.email, order.street, `${order.postcode} ${order.city}`,
          DELIVERY_NAMES[order.delivery], PAYMENT_NAMES[order.payment], '',
          ...pricedOrder.lines.map(line => `${line.name} × ${line.quantity}: ${czk_(line.price * line.quantity)} Kč`),
          `Celkem: ${czk_(pricedOrder.total)} Kč`].join('\n');
        MailApp.sendEmail({ to: SHOP.recipient, replyTo: order.email, subject: `Vyrobeno ve stodole – objednávka ${state.number}`, body: details, attachments: [pdf] });
        state.ownerSent = true;
        props.setProperty(storageKey, JSON.stringify(state));
      }
      if (!state.customerSent) {
        const paymentText = order.payment === 'transfer' ? 'Platební údaje a QR kód najdete ve faktuře.' : 'Objednávku uhradíte při převzetí.';
        MailApp.sendEmail({
          to: order.email, replyTo: SHOP.recipient,
          subject: `Potvrzení objednávky ${state.number} – Vyrobeno ve stodole`,
          body: `Dobrý den,\n\nděkuji za Vaši objednávku. V příloze najdete fakturu. ${paymentText}\n\nVyrobeno ve stodole`,
          attachments: [pdf],
        });
        state.customerSent = true;
        props.setProperty(storageKey, JSON.stringify(state));
      }
    }
    return { number: state.number, total: pricedOrder.total };
  } finally {
    lock.releaseLock();
  }
}

function checkoutReply_(requestId, response) {
  const message = JSON.stringify({ ...response, requestId }).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(`<script>window.top.postMessage(${message}, ${JSON.stringify(SHOP.siteOrigin)});</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
