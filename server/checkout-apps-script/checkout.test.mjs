import { strict as assert } from 'node:assert';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import { runInNewContext } from 'node:vm';

const code = await readFile(new URL('../Checkout.gs', import.meta.url), 'utf8');
const input = {
  requestId: '12345678-1234-1234-1234-123456789012', key: '22345678-1234-1234-1234-123456789012',
  name: 'Jana Ukázková', email: 'jana@example.com', street: 'Ukázková 12', postcode: '30100', city: 'Plzeň',
  delivery: 'pickup', payment: 'transfer', items: [{ id: 'prkenko', quantity: 2, price: 1 }], expectedTotal: 1380,
};

test('košík vypočte cenu na serveru a při výpadku opakuje jen nedokončený e-mail', () => {
  const props = new Map();
  const messages = [];
  let failedCustomerMail = false;
  let catalog = {
    catalogReady: true, maxQuantity: 20, checkoutShippingPrice: null,
    products: [{ id: 'prkenko', name: 'Dubové servírovací prkénko', price: 690 }],
  };
  let fetches = 0;
  const submit = runInNewContext(`${code}
    Object.assign(SHOP, { taxMode: 'non-vat', legalName: 'Ukázkový dodavatel', address: 'Ukázková 1', ico: '12345678', iban: 'CZ9106000000000000000123' });
    (data) => sendOrder_(readOrder_(data), data.key);`, {
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
    HtmlService: { createHtmlOutput: html => ({ getAs: mime => ({ setName: filename => ({ mime, filename, html }) }) }) },
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
});
