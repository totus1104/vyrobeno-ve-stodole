const deploymentUrl = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
const googleOrigin = /^https:\/\/(?:script\.google\.com|(?:[\w-]+-)?script\.googleusercontent\.com)$/;

function encodeAttachment(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',', 2)[1];
      const data = base64.replaceAll('+', '-').replaceAll('/', '_');
      resolve({ name: file.name, data });
    };
    reader.onerror = () => reject(new Error('Přílohu se nepodařilo načíst. Zkuste ji přidat znovu.'));
    reader.readAsDataURL(file);
  });
}

export async function sendInquiry(url, contact, files) {
  if (!deploymentUrl.test(url)) {
    throw new Error('Odesílání formuláře teď není k dispozici. Napište mi prosím na e-mail uvedený na této stránce.');
  }

  const attachments = await Promise.all(files.map(encodeAttachment));
  const message = await postAppsScript(url, { ...contact, attachments }, 'Odeslání se nepodařilo potvrdit. Poptávka mohla dorazit. Stav si prosím ověřte e-mailem.');
  if (message.ok === true && /^\d{4}-\d{2}-\d{2}-\d{4}$/.test(message.orderNumber)) return message.orderNumber;
  throw new Error(message.error || 'Poptávku se nepodařilo odeslat. Zkuste to znovu nebo mi napište e-mail.');
}

export function postAppsScript(url, data, timeoutMessage) {
  if (!deploymentUrl.test(url)) throw new Error('Adresa objednávkové služby není správně nastavená.');
  const requestId = crypto.randomUUID();
  const frame = document.createElement('iframe');
  frame.name = `submission-${requestId}`;
  frame.title = 'Potvrzení odeslání formuláře';
  frame.hidden = true;

  const transport = document.createElement('form');
  transport.hidden = true;
  transport.action = url;
  transport.method = 'post';
  transport.target = frame.name;
  const payload = document.createElement('input');
  payload.type = 'hidden';
  payload.name = 'payload';
  payload.value = JSON.stringify({ ...data, requestId });
  transport.append(payload);

  // A form navigation lets Apps Script answer from its sandboxed iframe after Google's redirects.
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error(timeoutMessage));
    }, 120_000);

    function cleanup() {
      window.clearTimeout(timeout);
      window.removeEventListener('message', receive);
      frame.remove();
      transport.remove();
    }

    function receive(event) {
      const message = event.data;
      if (!googleOrigin.test(event.origin) || message?.requestId !== requestId) return;
      cleanup();
      resolve(message);
    }

    window.addEventListener('message', receive);
    document.body.append(frame, transport);
    transport.submit();
    transport.remove();
  });
}
