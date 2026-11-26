import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openShop } from './shop.js';
import { paymentPayload } from './qr-payment.js';

test('objednávky, potvrzení, QR a zkušební e-maily', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'stodola-orders-'));
  const env = { SHOP_DATA_DIR: directory };
  const order = {
    key: randomUUID(), name: 'Jana Ukázková', email: 'jana@example.invalid', payment: 'transfer',
    delivery: 'shipping', street: 'Ukázková 12', city: 'Plzeň', postcode: '30100',
    items: [{ id: 'prkenko', quantity: 2, price: 1 }],
  };
  const shop = await openShop({ env });
  assert.throws(() => shop.place({ ...order, postcode: '30' }), /adresu/);
  assert.throws(() => shop.place({ ...order, payment: 'pickup' }), /převodem/);
  assert.throws(() => shop.place({ ...order, items: [{ id: 'unknown', quantity: 1 }] }), /množství/);
  const receipt = shop.place(order);
  assert.equal(receipt.total, 1380);
  assert.equal(shop.get(1).address, 'Ukázková 12, 301 00 Plzeň');
  assert.deepEqual(shop.place(order), receipt);
  assert.equal(shop.list().length, 1);
  await assert.rejects(shop.confirm(1, 'Stodola, pátek 16:00'), /SHOP_IBAN/);
  assert.equal(shop.get(1).status, 'pending');
  assert.deepEqual(await shop.deliver(), { delivered: 2, failed: 0 });
  const pickup = shop.place({ ...order, key: randomUUID(), payment: 'pickup', delivery: 'pickup' });
  assert.equal((await shop.confirm(Number(pickup.number), 'Stodola, pátek 16:00')).qr, null);
  shop.close();

  // Fictional account used only to exercise the IBAN checksum and QR payload.
  const testIban = 'CZ1306000000000000123456';
  const configured = await openShop({ env: { ...env, SHOP_IBAN: testIban } });
  try {
    const confirmed = await configured.confirm(1, 'Stodola, sobota 10:00', 1400);
    assert.equal(confirmed.total, 1400);
    assert.equal(confirmed.qr.subarray(1, 4).toString(), 'PNG');
    assert.equal(paymentPayload(testIban, 1400, receipt.number), 'SPD*1.0*ACC:CZ1306000000000000123456*AM:1400.00*CC:CZK*X-VS:000001');
    await assert.rejects(configured.confirm(1, 'Znovu'), /Potvrdit lze jen/);
    assert.deepEqual(await configured.deliver(), { delivered: 4, failed: 0 });
    assert.deepEqual(await configured.deliver(), { delivered: 0, failed: 0 });
    const outbox = join(directory, 'outbox');
    const emails = await Promise.all((await readdir(outbox)).map(file => readFile(join(outbox, file), 'utf8')));
    assert.equal(emails.filter(email => email.includes('filename=qr-platba.png')).length, 1);
    assert.ok(emails.some(email => email.includes('To: obchod@example.invalid')));
    assert.ok(emails.some(email => email.includes('To: jana@example.invalid') && email.includes('301 00')));
    assert.ok(emails.every(email => !email.includes('{{number}}') && !email.includes('{{summary}}')));
    configured.advance(1, 'paid');
    configured.advance(1, 'handed');
    assert.equal(configured.get(1).status, 'handed');
  } finally {
    configured.close();
  }
});
