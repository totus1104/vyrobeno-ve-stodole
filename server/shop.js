import { DatabaseSync } from 'node:sqlite';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import nodemailer from 'nodemailer';
import { catalogReady, maxQuantity, products } from '../src/shop-catalog.js';
import { normalizeIban, paymentQr } from './qr-payment.js';
import { formatOrderEmail } from './order-email-templates.js';

const emailPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/i;
const currency = new Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK', maximumFractionDigits: 0 });
const methodNames = { transfer: 'bankovní převod po potvrzení', pickup: 'platba při osobním předání' };
const deliveryNames = { pickup: 'Osobní odběr', shipping: 'Doručení' };
const orderNumber = id => String(id).padStart(6, '0');
const clean = value => typeof value === 'string' ? value.trim() : '';

export class ShopError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export async function openShop({ env = process.env, preview = false } = {}) {
  const live = !preview && env.SHOP_LIVE === '1';
  const directory = resolve(env.SHOP_DATA_DIR || '.shop-data');
  const iban = normalizeIban(env.SHOP_IBAN);
  const owner = env.SHOP_OWNER_EMAIL || (live ? '' : 'obchod@example.invalid');
  const from = env.SHOP_MAIL_FROM || (live ? '' : 'stodola@example.invalid');
  if (env.SHOP_IBAN && !iban) throw new Error('SHOP_IBAN musí obsahovat platný český IBAN.');
  if (live && (!catalogReady || !iban || !env.SHOP_SMTP_URL || !emailPattern.test(owner) || !emailPattern.test(from))) {
    throw new Error('Pro ostrý provoz doplňte schválený katalog, český IBAN, SMTP a adresy odesílatele i obchodu.');
  }

  await mkdir(directory, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(join(directory, live ? 'orders-live.sqlite' : 'orders-test.sqlite'));
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      request_key TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      payment TEXT NOT NULL,
      items TEXT NOT NULL,
      total INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      handover TEXT,
      final_total INTEGER
    );
    CREATE TABLE IF NOT EXISTS mail (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL REFERENCES orders(id),
      recipient TEXT NOT NULL,
      subject TEXT NOT NULL,
      body TEXT NOT NULL,
      qr BLOB,
      sent_at TEXT,
      claimed_at INTEGER
    );
  `);
  const spool = join(directory, 'outbox');
  const transport = nodemailer.createTransport(live ? env.SHOP_SMTP_URL : {
    streamTransport: true,
    buffer: true,
    newline: 'windows',
  });

  function transaction(work) {
    db.exec('BEGIN IMMEDIATE');
    try {
      const result = work();
      db.exec('COMMIT');
      return result;
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
  }

  function queue(id, recipient, subject, body, qr = null) {
    db.prepare('INSERT INTO mail (order_id, recipient, subject, body, qr) VALUES (?, ?, ?, ?, ?)')
      .run(id, recipient, subject, body, qr);
  }

  transaction(() => {
    const columns = db.prepare('PRAGMA table_info(orders)').all();
    if (!columns.some(column => column.name === 'delivery')) {
      db.exec("ALTER TABLE orders ADD COLUMN delivery TEXT NOT NULL DEFAULT 'pickup'");
    }
    if (!columns.some(column => column.name === 'address')) {
      db.exec('ALTER TABLE orders ADD COLUMN address TEXT');
    }
  });

  function place(input) {
    const name = clean(input?.name);
    const email = clean(input?.email).toLowerCase();
    const payment = clean(input?.payment);
    const delivery = clean(input?.delivery);
    const street = clean(input?.street);
    const city = clean(input?.city);
    const postcode = clean(input?.postcode);
    const key = clean(input?.key);
    if (!name || name.length > 100 || /[\r\n]/.test(name) || email.length > 254 || !emailPattern.test(email)) {
      throw new ShopError('Zkontrolujte jméno a e-mail.');
    }
    if (!Object.hasOwn(methodNames, payment)) {
      throw new ShopError('Zkontrolujte zvolený způsob platby.');
    }
    if (!Object.hasOwn(deliveryNames, delivery) || (delivery === 'shipping' && payment !== 'transfer')) {
      throw new ShopError('Zkontrolujte způsob předání. Pro doručení zvolte platbu převodem.');
    }
    if (!street || street.length > 150 || !city || city.length > 100 || /[\r\n]/.test(street + city) || !/^\d{3} ?\d{2}$/.test(postcode)) {
      throw new ShopError('Vyplňte úplnou doručovací adresu včetně pětimístného PSČ.');
    }
    const address = `${street}, ${postcode.replace(' ', '').replace(/^(\d{3})/, '$1 ')} ${city}`;
    if (!/^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(key)) {
      throw new ShopError('Obnovte stránku a zkuste objednávku odeslat znovu.');
    }
    if (!Array.isArray(input.items) || !input.items.length || input.items.length > products.length) {
      throw new ShopError('V košíku musí být alespoň jeden platný výrobek.');
    }
    const seen = new Set();
    const lines = input.items.map(item => {
      const product = products.find(entry => entry.id === item?.id);
      if (!product || seen.has(product.id) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > maxQuantity) {
        throw new ShopError('Zkontrolujte výrobky a množství v košíku.');
      }
      seen.add(product.id);
      return { id: product.id, name: product.name, price: product.price, quantity: item.quantity };
    });
    const total = lines.reduce((sum, item) => sum + item.price * item.quantity, 0);
    const saved = transaction(() => {
      const existing = db.prepare('SELECT id, total FROM orders WHERE request_key = ?').get(key);
      if (existing) return existing;
      if (live && db.prepare('SELECT count(*) AS count FROM orders WHERE email = ? AND created_at >= ?')
        .get(email, new Date(Date.now() - 3_600_000).toISOString()).count >= 5) {
        throw new ShopError('Z tohoto e-mailu už přišlo více objednávek. Zkuste to později.', 429);
      }
      const { lastInsertRowid: id } = db.prepare(`
        INSERT INTO orders (request_key, created_at, name, email, payment, items, total, delivery, address)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(key, new Date().toISOString(), name, email, payment, JSON.stringify(lines), total, delivery, address);
      const number = orderNumber(id);
      const summary = lines.map(line => `${line.quantity}× ${line.name} – ${currency.format(line.price * line.quantity)}`).join('\n');
      const details = `Objednávka ${number}\n\n${summary}\nCelkem za výrobky: ${currency.format(total)}\nPředání: ${deliveryNames[delivery]}\nDoručovací adresa: ${address}\nPlatba: ${methodNames[payment]}`;
      const receipt = formatOrderEmail('received', {
        number, name, summary: details, total: currency.format(total), address, payment: methodNames[payment], delivery: deliveryNames[delivery],
      });
      queue(id, email, receipt.subject, receipt.text);
      queue(id, owner, `Nová objednávka ${number} | Vyrobeno ve stodole`,
        `${details}\n\nZákazník: ${name}\nE-mail: ${email}`);
      return { id, total };
    });
    return { number: orderNumber(saved.id), total: saved.total };
  }

  async function confirm(id, handover, override) {
    const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
    if (!order || order.status !== 'pending') throw new ShopError('Potvrdit lze jen objednávku čekající na potvrzení.');
    const total = override ?? order.total;
    if (!clean(handover) || handover.length > 500 || !Number.isSafeInteger(total) || total < 1 || total > 1_000_000) {
      throw new ShopError('Zadejte místo a termín předání a platnou celkovou částku v celých Kč.');
    }
    if (order.payment === 'transfer' && !iban) {
      throw new ShopError('Pro potvrzení převodu nastavte SHOP_IBAN. Objednávka zůstává nepotvrzená.');
    }
    const number = orderNumber(id);
    const qr = iban ? await paymentQr(iban, total, number) : null;
    const email = formatOrderEmail(order.payment, {
      number,
      name: order.name,
      delivery: deliveryNames[order.delivery],
      address: order.address ?? '',
      deliveryAddress: order.delivery === 'shipping' ? `Doručovací adresa: ${order.address}` : '',
      payment: methodNames[order.payment],
      handover,
      total: currency.format(total),
      bankDetails: qr ? `IBAN: ${iban}\nVariabilní symbol: ${number}` : '',
      pickupInstructions: 'Plaťte při osobním předání, hotově' + (qr ? ' nebo převodem pomocí přiloženého QR kódu.' : '.'),
    });
    transaction(() => {
      const changed = db.prepare("UPDATE orders SET status = 'confirmed', handover = ?, final_total = ? WHERE id = ? AND status = 'pending'")
        .run(handover, total, id);
      if (!changed.changes) throw new ShopError('Objednávka už byla zpracována.');
      queue(id, order.email, email.subject, email.text, qr);
    });
    return { number, total, qr };
  }

  function advance(id, status) {
    const previous = status === 'paid' ? 'confirmed' : 'paid';
    const changed = db.prepare('UPDATE orders SET status = ? WHERE id = ? AND status = ?').run(status, id, previous);
    if (!changed.changes) throw new ShopError('Objednávka neexistuje nebo její stav tuto změnu neumožňuje.');
  }

  async function deliver() {
    let delivered = 0;
    let failed = 0;
    const earlier = Date.now() - 5 * 60_000;
    const pending = db.prepare('SELECT * FROM mail WHERE sent_at IS NULL AND (claimed_at IS NULL OR claimed_at < ?) ORDER BY id LIMIT 50').all(earlier);
    for (const message of pending) {
      const claimed = db.prepare('UPDATE mail SET claimed_at = ? WHERE id = ? AND sent_at IS NULL AND (claimed_at IS NULL OR claimed_at < ?)')
        .run(Date.now(), message.id, earlier);
      if (!claimed.changes) continue;
      try {
        const subject = live ? message.subject : `[ZKOUŠKA] ${message.subject}`;
        const text = live ? message.body : `Pouze místní zkouška. Platební údaje nepoužívejte.\n\n${message.body}`;
        const info = await transport.sendMail({
          from, to: { address: message.recipient, name: '' }, replyTo: owner, subject, text,
          attachments: message.qr ? [{ filename: 'qr-platba.png', content: Buffer.from(message.qr), contentType: 'image/png' }] : [],
        });
        if (!live) {
          await mkdir(spool, { recursive: true, mode: 0o700 });
          const file = join(spool, `${orderNumber(message.order_id)}-${message.id}.eml`);
          await writeFile(`${file}.tmp`, info.message, { mode: 0o600 });
          await rename(`${file}.tmp`, file);
        }
        db.prepare('UPDATE mail SET sent_at = ? WHERE id = ?').run(new Date().toISOString(), message.id);
        delivered++;
      } catch {
        db.prepare('UPDATE mail SET claimed_at = NULL WHERE id = ?').run(message.id);
        failed++;
      }
    }
    return { delivered, failed };
  }

  return {
    live, directory, place, confirm, advance, deliver,
    list: () => db.prepare('SELECT id, created_at, name, email, payment, total, final_total, status FROM orders ORDER BY id DESC').all(),
    get: id => db.prepare('SELECT * FROM orders WHERE id = ?').get(id),
    close: () => db.close(),
  };
}
