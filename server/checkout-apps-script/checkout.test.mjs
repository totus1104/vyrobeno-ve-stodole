import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const code = await readFile(new URL('../Checkout.gs', import.meta.url), 'utf8');
const manifest = JSON.parse(await readFile(new URL('./appsscript.json', import.meta.url), 'utf8'));
const input = {
  requestId: '12345678-1234-1234-1234-123456789012', key: '22345678-1234-1234-1234-123456789012',
  name: 'Jana Ukázková', email: 'jana@example.com', street: 'Ukázková 12', postcode: '30100', city: 'Plzeň',
  delivery: 'pickup', payment: 'transfer', items: [{ id: 'prkenko', quantity: 2, price: 1 }], expectedTotal: 1380,
};

test('diagnostika katalogu ověří záložní zdroj a rozliší oprávnění od chyby HTTP', () => {
  let primaryStatus = 200;
  let mirrorStatus = 200;
  let authorized = true;
  const logs = [];
  const { verify, status } = runInNewContext(`${code}\n({ verify: overitKatalog, status: doGet });`, {
    ScriptApp: { AuthMode: { FULL: 'FULL' }, requireScopes: (mode, scopes) => {
      assert.equal(mode, 'FULL');
      assert.deepEqual([...scopes], manifest.oauthScopes);
      if (!authorized) throw new Error('Google consent required');
    } },
    UrlFetchApp: { fetch: url => {
      if (!authorized) throw new Error('Required permissions: script.external_request');
      return {
        getResponseCode: () => url.includes('github.io') ? primaryStatus : mirrorStatus,
        getContentText: () => JSON.stringify({ products: [{}], maxQuantity: 20, checkoutTestInvoices: true }),
      };
    } },
    MailApp: { getRemainingDailyQuota: () => 10 },
    Logger: { log: message => logs.push(message) },
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: value => ({ setMimeType: () => value }) },
  });
  verify();
  assert.deepEqual(JSON.parse(logs[0]), { ok: true, source: 'GitHub Pages', products: 1, testInvoices: true });
  assert.match(logs[1], /10/);
  primaryStatus = 403;
  assert.deepEqual(JSON.parse(status()), { ok: true, source: 'GitHub', products: 1, testInvoices: true });
  mirrorStatus = 404;
  assert.match(JSON.parse(status()).error, /HTTP 403.*HTTP 404/);
  authorized = false;
  assert.match(JSON.parse(status()).error, /nemá oprávnění ke službě UrlFetchApp/);
  assert.throws(verify, /Google consent required/);
});

test('doprava je zdarma až po překročení 1 000 Kč', () => {
  const priceOrder = runInNewContext(`${code}\npriceOrder_;`, {});
  for (const [subtotal, shipping] of [[999, 100], [1000, 100], [1001, 0]]) {
    const catalog = {
      maxQuantity: 20, checkoutShippingPrice: 100, checkoutFreeShippingAbove: 1000,
      products: [{ id: 'test', name: 'Zkušební výrobek', price: subtotal }],
    };
    const order = { delivery: 'shipping', items: [{ id: 'test', quantity: 1 }], expectedTotal: subtotal + shipping };
    const { total, lines } = priceOrder(order, catalog);
    assert.equal(total, subtotal + shipping);
    assert.equal(lines.at(-1).price, shipping);
  }
});

test('košík vypočte cenu na serveru a při výpadku opakuje jen nedokončený e-mail', () => {
  const props = new Map();
  const messages = [];
  let failedCustomerMail = false;
  let catalog = {
    catalogReady: true, maxQuantity: 20, checkoutShippingPrice: null,
    products: [{ id: 'prkenko', name: 'Dubové servírovací prkénko', price: 690 }],
  };
  let fetches = 0;
  const { submit, handle } = runInNewContext(`${code}
    Object.assign(SHOP, { taxMode: 'non-vat', legalName: 'Ukázkový dodavatel', address: 'Ukázková 1', ico: '12345678', iban: 'CZ9106000000000000000123' });
    ({
      submit(data) { return sendOrder_(readOrder_(data), data.key); },
      handle(data) {
        Object.assign(SHOP, { legalName: '', address: '', ico: '', iban: '', taxMode: '' });
        return doPost({ parameter: { payload: JSON.stringify(data) } });
      }
    });`, {
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    PropertiesService: { getScriptProperties: () => ({
      getProperty: key => props.get(key),
      setProperty: (key, value) => props.set(key, value),
      setProperties: entries => Object.entries(entries).forEach(([key, value]) => props.set(key, value)),
    }) },
    UrlFetchApp: { fetch: url => {
      fetches += 1;
      assert.equal(url, 'https://totus1104.github.io/vyrobeno-ve-stodole/katalog.json');
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(catalog) };
    } },
    Utilities: {
      formatDate: (_date, _zone, format) => ({ yyyy: '2026', 'yyyy-MM-dd': '2026-11-26', 'dd.MM.yyyy': '26.11.2026' })[format],
      base64Encode: bytes => Buffer.from(bytes).toString('base64'),
      DigestAlgorithm: { SHA_256: 'SHA_256' }, Charset: { UTF_8: 'UTF_8' },
      computeDigest: (_algorithm, input) => createHash('sha256').update(input).digest(),
      base64EncodeWebSafe: bytes => Buffer.from(bytes).toString('base64url'),
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: html => ({
        getAs: mime => ({ setName: filename => ({ mime, filename, html }) }),
        setXFrameOptionsMode: () => html,
      }),
    },
    MailApp: { sendEmail: message => {
      if (message.to === input.email && !failedCustomerMail) {
        failedCustomerMail = true;
        throw new Error('Dočasný výpadek');
      }
      messages.push(message);
    } },
  });
  assert.throws(() => submit({ ...input, expectedTotal: 2 }), /cena se změnila/);
  assert.throws(() => submit(input), /Dočasný výpadek/);
  catalog = { ...catalog, products: [] };
  const completed = submit(input);
  assert.equal(completed.number, '2026000001');
  assert.equal(completed.total, 1380);
  submit(input);
  assert.equal(fetches, 2);
  assert.deepEqual(messages.map(message => message.to), ['zrzek.10@gmail.com', input.email]);
  assert.deepEqual(messages[0].attachments[0], messages[1].attachments[0]);
  assert.equal(messages[0].attachments[0].mime, 'application/pdf');
  assert.match(messages[0].attachments[0].html, /data:image\/gif;base64/);
  assert.match(messages[0].attachments[0].html, /<td>Dubové servírovací prkénko<\/td><td>2<\/td><td>690,00<\/td><td>1 380,00<\/td>/);
  assert.match(messages[0].body, /Celkem: 1 380,00 Kč/);

  catalog = { ...catalog, checkoutShippingPrice: 90, products: [
    { id: 'prkenko', name: 'Prkénko', price: 800 },
    { id: 'miska', name: 'Nová miska', price: 250 },
  ] };
  const next = submit({
    ...input, key: '32345678-1234-1234-1234-123456789012', delivery: 'shipping', expectedTotal: 1940,
    items: [...input.items, { id: 'miska', quantity: 1 }],
  });
  assert.equal(next.total, 1940);
  assert.equal(fetches, 3);
  const nextInvoice = messages[3].attachments[0].html;
  assert.match(nextInvoice, /<td>Nová miska<\/td><td>1<\/td><td>250,00<\/td><td>250,00<\/td>/);
  assert.match(nextInvoice, /<td>Doprava<\/td><td>1<\/td><td>90,00<\/td><td>90,00<\/td>/);
  assert.match(nextInvoice, /1 940,00 Kč/);

  const demoOrder = { ...input, key: '42345678-1234-1234-1234-123456789012', expectedTotal: 1600 };
  assert.match(handle(demoOrder), /Objednávku teď nelze dokončit/);
  catalog = { ...catalog, catalogReady: false, checkoutTestInvoices: true };
  const demo = handle(demoOrder);
  assert.match(demo, /"ok":true,"number":"TEST-2026000001","total":1600,"test":true/);
  const demoMessages = messages.slice(-2);
  assert.deepEqual(demoMessages.map(message => message.to), ['zrzek.10@gmail.com', input.email]);
  assert.equal(demoMessages[1].subject, 'Potvrzení objednávky TEST-2026000001 – Vyrobeno ve stodole');
  for (const { attachments: [pdf] } of demoMessages) {
    assert.equal(pdf.filename, 'faktura-TEST-2026000001.pdf');
    assert.match(pdf.html, /VZOR - NEPLAŤTE/);
    assert.doesNotMatch(pdf.html, /doplněn|CELKEM K ÚHRADĚ/i);
    assert.match(pdf.html, /data:image\/gif;base64/);
  }
  assert.match(demoMessages[1].body, /Platbu prosím neprovádějte/);
  assert.equal(props.get('sequence:2026'), '2');
  assert.equal(props.get('test-sequence:2026'), '1');
});
