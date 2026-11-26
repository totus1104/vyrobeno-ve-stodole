import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { openShop } from './shop.js';

const [command, number, handover, amount] = process.argv.slice(2);
const id = /^\d{1,10}$/.test(number ?? '') ? Number(number) : 0;
const statuses = { pending: 'Čeká na potvrzení', confirmed: 'Potvrzena', paid: 'Zaplacena', handed: 'Předána' };
const usage = `Správa obchodu
  npm run shop -- list
  npm run shop -- show 000001
  npm run shop -- confirm 000001 "Stodola, 12. prosince v 16:00" [částka v Kč]
  npm run shop -- paid 000001
  npm run shop -- handed 000001
  npm run shop -- mail`;

let shop;
try {
  if (!['list', 'show', 'confirm', 'paid', 'handed', 'mail'].includes(command)) {
    console.log(usage);
  } else {
    shop = await openShop();
    if (command === 'list') {
      console.table(shop.list().map(order => ({
        číslo: String(order.id).padStart(6, '0'),
        jméno: order.name,
        platba: order.payment === 'transfer' ? 'Převod' : 'Při předání',
        'celkem Kč': order.final_total ?? order.total,
        stav: statuses[order.status],
      })));
    } else if (command === 'show') {
      const order = shop.get(id);
      if (!order) throw new Error('Objednávka nebyla nalezena.');
      console.log(`Objednávka ${number} · ${statuses[order.status]}`);
      console.log(`${order.name} <${order.email}>`);
      console.log(`Způsob předání: ${order.delivery === 'shipping' ? 'Doručení' : 'Osobní odběr'}`);
      if (order.address) console.log(`Doručovací adresa: ${order.address}`);
      console.table(JSON.parse(order.items));
      console.log(`Celkem ${order.final_total ?? order.total} Kč`);
      if (order.handover) console.log(`Předání: ${order.handover}`);
    } else if (command === 'confirm') {
      const order = await shop.confirm(id, handover, amount === undefined ? undefined : Number(amount));
      console.log(`Objednávka ${order.number} byla potvrzena.`);
      if (order.qr) {
        const file = join(shop.directory, `qr-${order.number}.png`);
        await writeFile(file, order.qr, { mode: 0o600 });
        console.log(`QR kód: ${file}`);
      }
    } else if (command !== 'mail') {
      shop.advance(id, command);
      console.log(`Objednávka ${number}: ${statuses[command]}.`);
    }
    if (command === 'confirm' || command === 'mail') {
      const { delivered, failed } = await shop.deliver();
      console.log(shop.live ? `Odeslané e-maily: ${delivered}.` : `Uložené zkušební e-maily: ${delivered}.`);
      if (failed) {
        console.error(`Nevyřízené e-maily: ${failed}. Po nápravě zopakujte npm run shop -- mail.`);
        process.exitCode = 1;
      }
    }
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  shop?.close();
}
