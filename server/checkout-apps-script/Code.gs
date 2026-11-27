const SHOP = {
  recipient: 'zrzek.10@gmail.com',
  siteOrigin: 'https://totus1104.github.io',
  catalogUrl: 'https://totus1104.github.io/vyrobeno-ve-stodole/katalog.json',
  catalogMirrorUrl: 'https://raw.githubusercontent.com/totus1104/vyrobeno-ve-stodole/refs/heads/main/katalog.json',
  supplier: 'Vyrobeno ve stodole',
  legalName: '',
  address: '',
  ico: '',
  iban: 'CZ4506000000000154876195',
  // Set to 'non-vat' only if confirmed. A VAT invoice needs tax settings and dates.
  taxMode: '',
  dueInDays: 14,
};
const PAYMENT_NAMES = { transfer: 'Bankovním převodem', pickup: 'Při převzetí' };
const DELIVERY_NAMES = { pickup: 'Osobní odběr', shipping: 'Doručení' };
const SAMPLE_IBAN = 'CZ9106000000000000000123';
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

// Run from the editor as the deployment owner to check access without creating an order.
function overitKatalog() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, [
    'https://www.googleapis.com/auth/script.external_request',
    'https://www.googleapis.com/auth/script.send_mail',
  ]);
  Logger.log(JSON.stringify(catalogStatus_()));
  Logger.log(`Zbývající počet příjemců e-mailů pro dnešek: ${MailApp.getRemainingDailyQuota()}.`);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify(catalogStatus_())).setMimeType(ContentService.MimeType.JSON);
}

function catalogStatus_() {
  try {
    const { catalog, source } = fetchCatalog_();
    return { ok: true, source, products: catalog.products.length, testInvoices: catalog.checkoutTestInvoices === true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function readCatalogFromUrl_(url) {
  let response;
  try {
    response = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true });
  } catch (error) {
    const reason = String(error.message || error);
    if (/permission|authoriz|oprávněn|autorizac|script\.external_request/i.test(reason)) {
      throw new Error('Apps Script nemá oprávnění ke službě UrlFetchApp. Spusťte overitKatalog v editoru pod účtem vlastníka.');
    }
    throw new Error('Google nedokázal navázat spojení s GitHubem.');
  }
  const status = response.getResponseCode();
  if (status !== 200) throw new Error(`GitHub vrátil pro katalog HTTP ${status}.`);
  let catalog;
  try {
    catalog = JSON.parse(response.getContentText());
  } catch {
    throw new Error('GitHub vrátil obsah, který není platný JSON.');
  }
  if (!Array.isArray(catalog?.products) || !Number.isSafeInteger(catalog.maxQuantity) || catalog.maxQuantity < 1) {
    throw new Error('V katalogu chybí platná pole products nebo maxQuantity.');
  }
  return catalog;
}

function fetchCatalog_() {
  let catalog;
  let source = 'GitHub Pages';
  try {
    catalog = readCatalogFromUrl_(SHOP.catalogUrl);
  } catch (primaryError) {
    source = 'GitHub';
    try {
      catalog = readCatalogFromUrl_(SHOP.catalogMirrorUrl);
    } catch (mirrorError) {
      throw new Error(primaryError.message === mirrorError.message
        ? primaryError.message
        : `GitHub Pages: ${primaryError.message} GitHub: ${mirrorError.message}`);
    }
  }
  if (catalog.catalogReady !== true && catalog.checkoutTestInvoices !== true) {
    throw new Error('V načteném katalogu není zapnutý ostrý prodej ani test faktur.');
  }
  return { catalog, source };
}

function loadCatalog_() {
  try {
    return fetchCatalog_().catalog;
  } catch (error) {
    console.warn(`Načtení katalogu selhalo: ${error.message || error.name || 'Error'}`);
    throw new CheckoutError('Aktuální katalog teď není k dispozici. Zkuste to prosím později.');
  }
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
  const subtotal = lines.reduce((sum, line) => sum + line.quantity * line.price, 0);
  let total = subtotal;
  if (order.delivery === 'shipping') {
    const shipping = catalog.checkoutShippingPrice;
    if (!Number.isSafeInteger(shipping) || shipping < 0) throw new CheckoutError(updated);
    const freeAbove = catalog.checkoutFreeShippingAbove;
    const price = Number.isSafeInteger(freeAbove) && subtotal > freeAbove ? 0 : shipping;
    lines.push({ name: 'Doprava', quantity: 1, price });
    total += price;
  }
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
      const catalog = loadCatalog_();
      const test = catalog.checkoutTestInvoices === true;
      if (!test) requireBillingSettings_();
      const pricing = priceOrder_(order, catalog);
      const now = new Date();
      const year = Utilities.formatDate(now, 'Europe/Prague', 'yyyy');
      const counterKey = `${test ? 'test-sequence' : 'sequence'}:${year}`;
      const next = Number(props.getProperty(counterKey) || 0) + 1;
      if (next > 999999) throw new Error('Invoice sequence exhausted');
      state = { number: year + String(next).padStart(6, '0'), time: now.toISOString(), digest, pricing, test };
      props.setProperties({ [counterKey]: String(next), [storageKey]: JSON.stringify(state) });
    }
    const test = state.test === true;
    const number = test ? `TEST-${state.number}` : state.number;
    const pricedOrder = { ...order, ...state.pricing };
    if (!state.ownerSent || !state.customerSent) {
      if (!test) requireBillingSettings_();
      const supplier = test ? { ...SHOP, legalName: '', address: '', ico: '', iban: SAMPLE_IBAN } : SHOP;
      const pdf = HtmlService.createHtmlOutput(invoiceHtml_(supplier, pricedOrder, state.number, state.time, test))
        .getAs('application/pdf').setName(`faktura-${number}.pdf`);
      if (!state.ownerSent) {
        const details = [order.name, order.email, order.street, `${order.postcode} ${order.city}`,
          DELIVERY_NAMES[order.delivery], PAYMENT_NAMES[order.payment], '',
          ...pricedOrder.lines.map(line => `${line.name} × ${line.quantity}: ${czk_(line.price * line.quantity)} Kč`),
          `Celkem: ${czk_(pricedOrder.total)} Kč`].join('\n');
        MailApp.sendEmail({
          to: SHOP.recipient, replyTo: order.email,
          subject: `Vyrobeno ve stodole – objednávka ${number}`,
          body: test ? `Přiložený doklad slouží jako náhled. Platbu prosím neprovádějte.\n\n${details}` : details,
          attachments: [pdf],
        });
        state.ownerSent = true;
        props.setProperty(storageKey, JSON.stringify(state));
      }
      if (!state.customerSent) {
        const paymentText = test
          ? 'V příloze najdete náhled dokladu. Platbu prosím neprovádějte.'
          : order.payment === 'transfer'
            ? 'V příloze najdete fakturu s platebními údaji a QR kódem.'
            : 'V příloze najdete fakturu. Objednávku uhradíte při převzetí.';
        MailApp.sendEmail({
          to: order.email, replyTo: SHOP.recipient,
          subject: `Potvrzení objednávky ${number} – Vyrobeno ve stodole`,
          body: `Dobrý den,\n\nděkuji za Vaši objednávku. ${paymentText}\n\nVyrobeno ve stodole`,
          attachments: [pdf],
        });
        state.customerSent = true;
        props.setProperty(storageKey, JSON.stringify(state));
      }
    }
    return { number, total: pricedOrder.total, test };
  } finally {
    lock.releaseLock();
  }
}

function requireBillingSettings_() {
  if (!SHOP.legalName.trim() || !SHOP.address.trim() ||
      !/^\d{8}$/.test(SHOP.ico) || SHOP.taxMode !== 'non-vat' || !normalizeCheckoutIban_(SHOP.iban)) {
    console.warn('Chybí platné fakturační údaje dodavatele.');
    throw new CheckoutError('Objednávku teď nelze dokončit. Zkuste to prosím později.');
  }
}

function checkoutReply_(requestId, response) {
  const message = JSON.stringify({ ...response, requestId }).replace(/</g, '\\u003c');
  return HtmlService.createHtmlOutput(`<script>window.top.postMessage(${message}, ${JSON.stringify(SHOP.siteOrigin)});</script>`)
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
