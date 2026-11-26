import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';

const project = new URL('../../', import.meta.url);
const read = path => readFile(new URL(path, project), 'utf8');
const bundle = await build({
  stdin: {
    contents: `import qr from 'qrcode/lib/core/qrcode.js'; export const create = qr.create;`,
    resolveDir: fileURLToPath(project),
  },
  bundle: true,
  format: 'iife',
  globalName: 'CheckoutQr',
  platform: 'browser',
  write: false,
});

const license = await read('node_modules/qrcode/LICENSE');
const dijkstraLicense = await read('node_modules/dijkstrajs/LICENSE.md');
const server = await read('server/checkout-apps-script/Code.gs');
const invoice = await read('server/checkout-apps-script/Invoice.gs');
const code = [server, invoice, `/* qrcode\n${license}\n dijkstrajs\n${dijkstraLicense} */`, bundle.outputFiles[0].text].join('\n');
await writeFile(new URL('server/Checkout.gs', project), code, 'utf8');

if (process.argv.includes('--preview')) {
  const { chromium } = await import('playwright');
  const { products } = JSON.parse(await read('katalog.json'));
  const lines = products.slice(0, 2).map(({ name, price }, index) => ({ name, price, quantity: index === 0 ? 2 : 1 }));
  if (!lines.length) lines.push({ name: 'Ukázkový výrobek', price: 690, quantity: 1 });
  const html = runInNewContext(`${code}
    const order = { name: 'Jana Ukázková', email: 'jana@example.com', street: 'Ukázková 12', city: 'Plzeň', postcode: '301 00',
      payment: 'transfer', delivery: 'pickup', lines, total: lines.reduce((sum, item) => sum + item.price * item.quantity, 0) };
    invoiceHtml_({ ...SHOP, iban: 'CZ9106000000000000000123' }, order, '2026000001', '2026-11-26T17:02:00Z', true);`, {
    lines,
    Utilities: {
      formatDate: (date, timeZone, format) => {
        const local = new Intl.DateTimeFormat('cs-CZ', { timeZone, day: '2-digit', month: '2-digit', year: 'numeric' });
        const values = Object.fromEntries(local.formatToParts(date).map(part => [part.type, part.value]));
        return format === 'yyyy-MM-dd' ? `${values.year}-${values.month}-${values.day}` : `${values.day}.${values.month}.${values.year}`;
      },
      base64Encode: bytes => Buffer.from(bytes).toString('base64'),
    },
  });
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const page = await browser.newPage();
    await page.setContent(html);
    if (!await page.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)) throw new Error('Platební QR nelze zobrazit');
    const pdfDirectory = new URL('output/pdf/', project);
    await mkdir(pdfDirectory, { recursive: true });
    await page.pdf({ path: fileURLToPath(new URL('faktura-vzor.pdf', pdfDirectory)), preferCSSPageSize: true, printBackground: true });
  } finally {
    await browser.close();
  }
}
