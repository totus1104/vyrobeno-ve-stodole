import QRCode from 'qrcode';

export function normalizeIban(value = '') {
  const iban = value.replace(/\s/g, '').toUpperCase();
  if (!/^CZ\d{22}$/.test(iban)) return '';
  const rearranged = iban.slice(4) + '1235' + iban.slice(2, 4);
  return BigInt(rearranged) % 97n === 1n ? iban : '';
}

export function paymentPayload(iban, amount, reference) {
  if (!normalizeIban(iban) || !Number.isSafeInteger(amount) || amount <= 0 || !/^\d{1,10}$/.test(reference)) {
    throw new Error('Neplatné údaje pro QR platbu.');
  }
  return `SPD*1.0*ACC:${normalizeIban(iban)}*AM:${amount}.00*CC:CZK*X-VS:${reference}`;
}

export function paymentQr(iban, amount, reference) {
  return QRCode.toBuffer(paymentPayload(iban, amount, reference), { width: 360, margin: 4 });
}
