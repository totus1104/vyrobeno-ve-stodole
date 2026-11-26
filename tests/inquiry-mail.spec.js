import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';

const code = await readFile(new URL('../server/Code.gs', import.meta.url), 'utf8');
const inquiry = {
  requestId: '3ebccb86-2c46-491c-909e-d19940fb38c1',
  email: 'navstevnik@example.com',
  phone: '+420 123 456 789',
  description: 'Dubová lavice do předsíně.',
  attachments: [{ name: 'náčrt.pdf', data: 'JVBERg==' }],
};

function runScript(payload, sendEmail, log = { info() {}, warn() {} }) {
  const raw = JSON.stringify(payload);
  const script = runInNewContext(`${code}\n doPost({ parameter: { payload: raw } });`, {
    raw,
    console: log,
    MailApp: { sendEmail },
    Utilities: {
      formatDate: (_date, timeZone, format) => {
        expect(timeZone).toBe('Europe/Prague');
        expect(format).toBe('yyyy-MM-dd-HHmm');
        return '2026-11-26-1802';
      },
      base64DecodeWebSafe: data => Buffer.from(data, 'base64url'),
      newBlob: (data, type, name) => ({ data, type, getName: () => name }),
    },
    HtmlService: {
      XFrameOptionsMode: { ALLOWALL: 'ALLOWALL' },
      createHtmlOutput: script => ({ setXFrameOptionsMode: () => script }),
    },
  });
  return runInNewContext(script.replace(/^<script>|<\/script>$/g, ''), {
    window: { top: { postMessage: (message, origin) => ({ ...message, origin }) } },
  });
}

test('Apps Script odešle poptávku majiteli a potvrzení zákazníkovi', () => {
  const sent = [];
  const result = runScript({ ...inquiry, to: 'jiny-prijemce@example.com' }, message => sent.push(message));
  expect(result).toEqual({
    requestId: inquiry.requestId,
    ok: true,
    orderNumber: '2026-11-26-1802',
    origin: 'https://totus1104.github.io',
  });
  expect(sent).toHaveLength(2);
  expect(sent[0]).toMatchObject({
    to: 'zrzek.10@gmail.com',
    replyTo: inquiry.email,
    subject: 'Vyrobeno ve stodole: 2026-11-26-1802',
    body: 'Osobní údaje:\nemail: navstevnik@example.com\ntelefon: +420 123 456 789\n\nPopis:\nDubová lavice do předsíně.\n\nPřílohy:\nnáčrt.pdf',
  });
  expect(sent[0].attachments[0].data).toEqual(Buffer.from('%PDF'));
  expect(sent[0].attachments[0].type).toBe('application/pdf');
  expect(sent[1]).toEqual({
    to: inquiry.email,
    replyTo: 'zrzek.10@gmail.com',
    subject: 'Potvrzení přijetí poptávky – Vyrobeno ve stodole',
    body: 'Dobrý den,\n\nděkuji za Vaši zprávu. V následujících dnech Vás budu kontaktovat, abychom se dohodli na dalším zpracování Vašeho požadavku.\n\nVyrobeno ve stodole',
  });
});

test('výsledek poptávky určuje odeslání majiteli', () => {
  const sentTo = [];
  const warnings = [];
  const result = runScript(inquiry, message => {
    sentTo.push(message.to);
    if (message.to === inquiry.email) throw new Error(`Neplatný příjemce ${message.to}`);
  }, { warn: message => warnings.push(message) });
  expect(sentTo).toEqual(['zrzek.10@gmail.com', inquiry.email]);
  expect(result).toMatchObject({ ok: true });
  expect(warnings).toEqual([
    'Potvrzení k poptávce 2026-11-26-1802 se nepodařilo odeslat. Důvod: Neplatný příjemce [e-mail]',
  ]);

  sentTo.length = 0;
  const failed = runScript(inquiry, message => {
    sentTo.push(message.to);
    throw new Error('Poptávka nebyla odeslána');
  });
  expect(sentTo).toEqual(['zrzek.10@gmail.com']);
  expect(failed).toMatchObject({ ok: false });
});

test('Apps Script odmítne neplatný e-mail a překročení celkového limitu', () => {
  let sends = 0;
  const sendEmail = () => { sends += 1; };
  expect(runScript({ ...inquiry, email: 'spatny-email' }, sendEmail)).toMatchObject({ ok: false });
  const data = Buffer.alloc(5_000_001).toString('base64url');
  const attachments = [{ name: 'a.pdf', data }, { name: 'b.jpg', data }];
  expect(runScript({ ...inquiry, attachments }, sendEmail)).toMatchObject({ ok: false });
  expect(sends).toBe(0);
});
