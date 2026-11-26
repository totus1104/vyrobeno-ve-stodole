// Upravte předmět a text. Výrazy v {{dvojitých závorkách}} se doplní z objednávky.
export const orderEmails = {
  received: {
    subject: 'Přijata objednávka {{number}} | Vyrobeno ve stodole',
    text: `Dobrý den,

děkuji za objednávku. Ozvu se s potvrzením dostupnosti, konečné ceny a termínu. Zatím prosím nic neplaťte.

{{summary}}

Karel | Vyrobeno ve stodole`,
  },
  transfer: {
    subject: 'Potvrzena objednávka {{number}} | Vyrobeno ve stodole',
    text: `Dobrý den,

potvrzuji objednávku {{number}}.

{{delivery}}: {{handover}}
{{deliveryAddress}}
Celkem: {{total}}

Platbu prosím proveďte převodem pomocí QR kódu v příloze. Údaje pro ruční zadání:
{{bankDetails}}

Karel | Vyrobeno ve stodole`,
  },
  pickup: {
    subject: 'Potvrzena objednávka {{number}} | Vyrobeno ve stodole',
    text: `Dobrý den,

potvrzuji objednávku {{number}}.

{{delivery}}: {{handover}}
{{deliveryAddress}}
Celkem: {{total}}

{{pickupInstructions}}

Karel | Vyrobeno ve stodole`,
  },
};

export function formatOrderEmail(type, fields) {
  const { subject, text } = orderEmails[type];
  const substitute = content => content.replace(/\{\{(\w+)\}\}/g, (marker, name) => (
    Object.hasOwn(fields, name) ? fields[name] : marker
  ));
  return { subject: substitute(subject), text: substitute(text) };
}
