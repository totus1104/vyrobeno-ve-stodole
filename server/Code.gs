const RECIPIENT = 'zrzek.10@gmail.com';
const SITE_ORIGIN = 'https://totus1104.github.io';
const TIME_ZONE = 'Europe/Prague';
const MAX_ATTACHMENT_BYTES = 10000000;
const MAX_PAYLOAD_LENGTH = Math.ceil(MAX_ATTACHMENT_BYTES / 3) * 4 + 200000;
const MIME_TYPES = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
};

function doPost(event) {
  const raw = event && event.parameter && event.parameter.payload;
  let requestId = '';
  try {
    if (!raw || raw.length > MAX_PAYLOAD_LENGTH) throw new Error('Invalid payload');
    const inquiry = JSON.parse(raw);
    if (!inquiry || typeof inquiry.requestId !== 'string' || !/^[a-f0-9-]{36}$/.test(inquiry.requestId)) {
      throw new Error('Invalid request ID');
    }
    requestId = inquiry.requestId;
    const email = inquiry.email;
    const phone = inquiry.phone;
    const description = inquiry.description;
    if (typeof email !== 'string' || email.length > 254 || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(email) ||
        typeof phone !== 'string' || phone.length > 50 || /[\r\n]/.test(phone) ||
        typeof description !== 'string' || description.length > 10000) {
      return reply_({ requestId, ok: false, error: 'Zkontrolujte prosím kontaktní údaje a popis poptávky.' });
    }

    const attachments = readAttachments_(inquiry.attachments);
    if (attachments === null) {
      return reply_({ requestId, ok: false, error: 'Zkontrolujte formáty příloh a celkový limit 10 MB.' });
    }
    const orderNumber = Utilities.formatDate(new Date(), TIME_ZONE, 'yyyy-MM-dd-HHmm');
    const body = [
      'Osobní údaje:',
      `email: ${email}`,
      `telefon: ${phone || 'neuveden'}`,
      '',
      'Popis:',
      description || 'neuveden',
      '',
      'Přílohy:',
      attachments.map(file => file.getName()).join('\n') || 'bez příloh',
    ].join('\n');
    MailApp.sendEmail({
      to: RECIPIENT,
      replyTo: email,
      subject: `Vyrobeno ve stodole: ${orderNumber}`,
      body,
      attachments,
    });
    try {
      MailApp.sendEmail({
        to: email,
        replyTo: RECIPIENT,
        subject: 'Potvrzení přijetí poptávky – Vyrobeno ve stodole',
        body: [
          'Dobrý den,',
          '',
          'děkuji za Vaši zprávu. V následujících dnech Vás budu kontaktovat, abychom se dohodli na dalším zpracování Vašeho požadavku.',
          '',
          'Vyrobeno ve stodole',
        ].join('\n'),
      });
      console.info(`Google MailApp přijal potvrzení k poptávce ${orderNumber} k odeslání.`);
    } catch (error) {
      const reason = String(error.message || error)
        .replace(/[^\s<>@]+@[^\s<>@]+/g, '[e-mail]');
      console.warn(`Potvrzení k poptávce ${orderNumber} se nepodařilo odeslat. Důvod: ${reason}`);
    }
    return reply_({ requestId, ok: true, orderNumber });
  } catch (error) {
    return reply_({ requestId, ok: false, error: 'Poptávku se nepodařilo odeslat. Zkuste to znovu nebo mi napište e-mail.' });
  }
}

function readAttachments_(files) {
  if (!Array.isArray(files) || files.length > 250) return null;
  const attachments = [];
  let totalBytes = 0;
  for (const file of files) {
    if (!file || typeof file.name !== 'string' || typeof file.data !== 'string' || !/^[\w-]*={0,2}$/.test(file.data)) {
      return null;
    }
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_');
    const extension = /\.([a-z0-9]+)$/i.exec(name)?.[1].toLowerCase();
    if (name.length > 255 || !Object.prototype.hasOwnProperty.call(MIME_TYPES, extension)) return null;
    const bytes = Utilities.base64DecodeWebSafe(file.data);
    totalBytes += bytes.length;
    if (totalBytes > MAX_ATTACHMENT_BYTES) return null;
    attachments.push(Utilities.newBlob(bytes, MIME_TYPES[extension], name));
  }
  return attachments;
}

function reply_(message) {
  const json = JSON.stringify(message).replace(/</g, '\\u003c');
  const script = `<script>window.top.postMessage(${json}, ${JSON.stringify(SITE_ORIGIN)});</script>`;
  return HtmlService.createHtmlOutput(script).setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
