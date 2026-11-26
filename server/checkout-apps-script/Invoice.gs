function normalizeCheckoutIban_(value) {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^CZ\d{22}$/.test(iban)) return '';
  const digits = iban.slice(4) + '1235' + iban.slice(2, 4);
  let remainder = 0;
  for (const digit of digits) remainder = (remainder * 10 + Number(digit)) % 97;
  return remainder === 1 ? iban : '';
}

function paymentQrGif_(iban, amount, number) {
  if (!normalizeCheckoutIban_(iban) || !Number.isSafeInteger(amount) || amount < 1 || !/^\d{1,10}$/.test(number)) {
    throw new Error('Invalid QR payment details');
  }
  const payload = `SPD*1.0*ACC:${normalizeCheckoutIban_(iban)}*AM:${amount}.00*CC:CZK*X-VS:${number}`;
  const { size, data } = CheckoutQr.create([{ data: payload, mode: 'alphanumeric' }], { errorCorrectionLevel: 'M' }).modules;
  const scale = 4;
  const width = (size + 8) * scale;
  const dimension = [width & 255, width >> 8];
  // Two-color GIF. Clear the LZW dictionary before each pixel to keep every code three bits long.
  const raster = [];
  let bits = 0;
  let length = 0;
  function code(value) {
    bits |= value << length;
    length += 3;
    if (length >= 8) {
      raster.push(bits & 255);
      bits >>= 8;
      length -= 8;
    }
  }
  for (let y = 0; y < width; y++) {
    for (let x = 0; x < width; x++) {
      const row = Math.floor(y / scale) - 4;
      const col = Math.floor(x / scale) - 4;
      const dark = row >= 0 && row < size && col >= 0 && col < size && data[row * size + col];
      code(4);
      code(dark ? 1 : 0);
    }
  }
  code(5);
  if (length) raster.push(bits);
  const bytes = [71, 73, 70, 56, 57, 97, ...dimension, ...dimension, 128, 0, 0, 255, 255, 255, 0, 0, 0,
    44, 0, 0, 0, 0, ...dimension, ...dimension, 0, 2];
  for (let i = 0; i < raster.length; i += 255) {
    const block = raster.slice(i, i + 255);
    bytes.push(block.length, ...block);
  }
  bytes.push(0, 59);
  return Utilities.base64Encode(bytes.map(value => value > 127 ? value - 256 : value));
}

function czk_(amount) {
  return amount.toFixed(2).replace(/\B(?=(\d{3})+\.)/g, ' ').replace('.', ',');
}

function invoiceHtml_(supplier, order, number, issuedAt, sample = false) {
  const e = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
  const date = (value, format) => Utilities.formatDate(value, 'Europe/Prague', format);
  const issued = new Date(issuedAt);
  const localDate = date(issued, 'yyyy-MM-dd');
  const deadline = new Date(`${localDate}T12:00:00Z`);
  deadline.setUTCDate(deadline.getUTCDate() + supplier.dueInDays);
  const transfer = order.payment === 'transfer';
  const iban = normalizeCheckoutIban_(supplier.iban);
  const qr = transfer && iban ? paymentQrGif_(iban, order.total, number) : '';
  const lines = order.lines.map(line => `<tr>
    <td>${e(line.name)}</td><td>${line.quantity}</td><td>${czk_(line.price)}</td><td>${czk_(line.price * line.quantity)}</td>
  </tr>`).join('');
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Faktura ${e(number)}</title><style>
    @page { size: A4; margin: 16mm; }
    * { box-sizing: border-box; }
    body { margin: 0; font: 10pt Arial, sans-serif; color: #161616; line-height: 1.38; }
    h1 { font-size: 14pt; margin: 0; } h2 { font-size: 10pt; margin: 0 0 4pt; }
    p { margin: 0 0 3pt; }
    .heading, .parties, .items, .payment { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .heading td { padding-bottom: 8pt; vertical-align: bottom; }
    .heading td:last-child { text-align: right; }
    .parties td { width: 50%; border: 1px solid #aaa; padding: 8pt; vertical-align: top; overflow-wrap: anywhere; }
    .parties td:first-child { white-space: pre-line; }
    .items { margin-top: 13pt; }
    .items th, .items td { border-bottom: 1px solid #bbb; padding: 5pt; text-align: right; }
    .items th:first-child { width: 49%; }
    .items th:first-child, .items td:first-child { text-align: left; overflow-wrap: anywhere; }
    .items thead { background: #eee; }
    .items tfoot { display: table-row-group; }
    .items tfoot td { border-top: 2px solid #222; border-bottom: 2px solid #222; font-size: 11pt; font-weight: bold; }
    .items tr { break-inside: avoid; }
    .payment { margin-top: 13pt; }
    .payment td { vertical-align: middle; padding: 7pt; border: 1px solid #aaa; }
    .payment td:first-child { width: 103pt; text-align: center; }
    img { width: 88pt; height: 88pt; display: block; margin: 0 auto; }
    .sample { border: 1px solid #777; padding: 5pt; text-align: center; font-weight: bold; margin: 0 0 8pt; }
    .tax { margin-top: 9pt; color: #333; }
    .tax-summary { width: 100%; border-collapse: collapse; table-layout: fixed; margin-top: 9pt; }
    .tax-summary th, .tax-summary td { border: 1px solid #aaa; padding: 4pt 6pt; text-align: left; }
    </style></head><body>
    ${sample ? '<p class="sample">VZOR - NEPLAŤTE. QR kód obsahuje ukázkový účet.</p>' : ''}
    <table class="heading"><tr><td><h1>${e(supplier.supplier)}</h1></td><td><h1>FAKTURA č. ${e(number)}</h1></td></tr></table>
    <table class="parties"><tr><td><h2>Dodavatel</h2><p><strong>${e(supplier.legalName || supplier.supplier)}</strong></p><p>${e(supplier.address || 'Adresa bude doplněna')}</p><p>IČO: ${e(supplier.ico || 'bude doplněno')}</p>${sample ? '<p>DIČ: dle daňového režimu</p>' : ''}<p>E-mail: ${e(supplier.recipient)}</p></td>
    <td><h2>Odběratel</h2><p><strong>${e(order.name)}</strong></p><p>${e(order.street)}</p><p>${e(order.postcode)} ${e(order.city)}</p><p>E-mail: ${e(order.email)}</p></td></tr>
    <tr><td><p>Datum vystavení: <strong>${date(issued, 'dd.MM.yyyy')}</strong></p><p>Datum splatnosti: <strong>${transfer ? date(deadline, 'dd.MM.yyyy') : 'při převzetí'}</strong></p>${sample ? '<p>Datum uskutečnění plnění: bude doplněno</p>' : ''}<p>Forma úhrady: <strong>${e(PAYMENT_NAMES[order.payment])}</strong></p></td>
    <td><p>Číslo objednávky: <strong>${e(number)}</strong></p><p>Variabilní symbol: <strong>${e(number)}</strong></p><p>Předání: <strong>${e(DELIVERY_NAMES[order.delivery])}</strong></p></td></tr></table>
    <table class="items"><thead><tr><th>Označení položky</th><th>Množství</th><th>J. cena (Kč)</th><th>Celkem (Kč)</th></tr></thead>
    <tbody>${lines}</tbody>
    <tfoot><tr><td colspan="3">CELKEM K ÚHRADĚ</td><td>${czk_(order.total)} Kč</td></tr></tfoot></table>
    <table class="payment"><tr>${qr ? `<td><img src="data:image/gif;base64,${qr}" alt="QR platba"><strong>QR platba</strong></td>` : ''}<td><h2>${transfer ? 'Platební údaje' : 'Úhrada při převzetí'}</h2>
    ${transfer ? `<p>IBAN: <strong>${e(iban || 'bude doplněn')}</strong></p><p>Částka: <strong>${czk_(order.total)} Kč</strong></p><p>Variabilní symbol: <strong>${e(number)}</strong></p>` : '<p>Platbu provedete při převzetí.</p>'}</td></tr></table>
    ${sample ? '<table class="tax-summary"><tr><th>Rekapitulace DPH</th><th>Základ v Kč</th><th>Sazba</th><th>DPH v Kč</th><th>Celkem s DPH</th></tr><tr><td colspan="5">Údaje budou doplněny podle daňového režimu dodavatele.</td></tr></table>' : '<p class="tax">Dodavatel není plátcem DPH.</p>'}
    </body></html>`;
}
