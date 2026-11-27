import { test, expect } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { addAttachments, validateContact, MAX_BYTES } from '../src/validation.js';

const routes = ['/', '/o-stodole.html', '/galerie.html', '/obchod.html', '/kontakt.html', '/kosik.html'];
const validContact = { fullName: 'Testovací návštěvník', email: 'navstevnik@example.com', phone: '+49 (30) 123-4567' };
const file = (name, size = 100) => ({ name, size });
const upload = (name, size = 100) => ({ name, mimeType: 'application/octet-stream', buffer: Buffer.alloc(size) });

async function openCarouselWithClock(page, reducedMotion = 'no-preference') {
  await page.emulateMedia({ reducedMotion });
  await page.clock.install({ time: new Date('2026-11-15T12:00:00Z') });
  await page.clock.pauseAt(new Date('2026-11-15T12:00:01Z'));
  await page.goto('/');
  // Timing checks do not need CSS transitions to run against the mocked clock.
  await page.addStyleTag({ content: '.hero, .hero-slide { animation: none !important; transition: none !important; }' });
}

test('fotografie se střídají po 5 s a ruční výběr je podrží 10 s', async ({ page }) => {
  await openCarouselWithClock(page);
  const active = page.locator('.hero-slide.is-active');
  const dots = page.locator('.hero-dot');
  await expect(dots).toHaveCount(4);
  await expect(active).toHaveAttribute('id', 'hero-slide-1');
  await page.clock.runFor(4999);
  await expect(active).toHaveAttribute('id', 'hero-slide-1');
  await page.clock.runFor(1);
  await expect(active).toHaveAttribute('id', 'hero-slide-2');
  await dots.nth(3).click();
  await expect(active).toHaveAttribute('id', 'hero-slide-4');
  await expect(dots.nth(3)).toHaveAttribute('aria-pressed', 'true');
  await page.clock.runFor(9999);
  await expect(active).toHaveAttribute('id', 'hero-slide-4');
  await page.clock.runFor(1);
  await expect(active).toHaveAttribute('id', 'hero-slide-1');
  await page.clock.runFor(5000);
  await expect(active).toHaveAttribute('id', 'hero-slide-2');
  // A second click, even on the active dot, starts a fresh ten-second hold.
  await dots.nth(1).click();
  await page.clock.runFor(5000);
  await dots.nth(1).click();
  await page.clock.runFor(9999);
  await expect(active).toHaveAttribute('id', 'hero-slide-2');
  await page.clock.runFor(1);
  await expect(active).toHaveAttribute('id', 'hero-slide-3');
});

test('fotografie respektují omezení pohybu a klávesnici bez tlačítka pozastavení', async ({ page }) => {
  await openCarouselWithClock(page, 'reduce');
  const active = page.locator('.hero-slide.is-active');
  const dots = page.locator('.hero-dot');
  await page.clock.runFor(20000);
  await expect(active).toHaveAttribute('id', 'hero-slide-1');
  await expect(page.locator('.hero-playback')).toHaveCount(0);
  await dots.first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(dots.nth(1)).toBeFocused();
  await expect(active).toHaveAttribute('id', 'hero-slide-2');
  await page.clock.runFor(20000);
  await expect(active).toHaveAttribute('id', 'hero-slide-2');
  await page.evaluate(() => {
    window.motionChangeDelivered = false;
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
      window.motionChangeDelivered = true;
    }, { once: true });
  });
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await expect.poll(async () => {
    await page.clock.runFor(16);
    return page.evaluate(() => window.motionChangeDelivered);
  }).toBe(true);
  await page.clock.runFor(10000);
  await expect(active).toHaveAttribute('id', 'hero-slide-3');
  await page.evaluate(() => {
    window.motionChangeDelivered = false;
    matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', () => {
      window.motionChangeDelivered = true;
    }, { once: true });
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect.poll(async () => {
    await page.clock.runFor(16);
    return page.evaluate(() => window.motionChangeDelivered);
  }).toBe(true);
  await page.clock.runFor(20000);
  await expect(active).toHaveAttribute('id', 'hero-slide-3');
  await dots.nth(2).focus();
  await page.keyboard.press('End');
  await expect(active).toHaveAttribute('id', 'hero-slide-4');
  await page.keyboard.press('Home');
  await expect(active).toHaveAttribute('id', 'hero-slide-1');
});

test('validace kontaktu a přesná hranice příloh', () => {
  expect(validateContact(validContact)).toEqual({});
  expect(validateContact({ ...validContact, phone: '' })).toEqual({});
  expect(validateContact({ ...validContact, phone: '   ' })).toEqual({});
  expect(Object.keys(validateContact({ fullName: ' ', email: 'a@', phone: 'abc' }))).toHaveLength(3);
  for (const phone of ['123456', '00420 123 456 789', '+1 (212) 555-0100']) expect(validateContact({ ...validContact, phone })).toEqual({});
  for (const phone of ['123', '+1234567890123456', '123abc456', '++420123456789']) expect(validateContact({ ...validContact, phone }).phone).toBeTruthy();
  for (const ext of ['pdf', 'JPG', 'jpeg', 'PNG', 'DOC', 'docx']) expect(addAttachments([], [file(`podklad.${ext}`)]).errors).toEqual([]);
  expect(addAttachments([], [file('limit.pdf', MAX_BYTES)]).files).toHaveLength(1);
  expect(addAttachments([], [file('velky.pdf', MAX_BYTES + 1)]).files).toHaveLength(0);
  const batch = addAttachments([file('drive.pdf', 5_000_000)], [file('pres-limit.png', 5_000_001), file('presne.docx', 5_000_000)]);
  expect(batch.files.map(item => item.name)).toEqual(['drive.pdf', 'presne.docx']);
  expect(batch.errors).toHaveLength(1);
  expect(addAttachments([], [file('virus.exe'), file('bez-pripony')]).errors).toHaveLength(2);
});

test('všechny stránky, metadata, odkazy a bez chyb JavaScriptu', async ({ page, request }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const titles = new Set();
  for (const route of routes) {
    const response = await page.goto(route);
    expect(response.status()).toBe(200);
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
    await expect(page.locator('html')).toHaveAttribute('lang', 'cs');
    await expect(page.locator('meta[name=description]')).toHaveAttribute('content', /.+/);
    await expect(page.locator('header [aria-current=page]')).toHaveCount(1);
    titles.add(await page.title());
    for (const href of await page.locator('a').evaluateAll(links => links.map(link => link.getAttribute('href')))) {
      if (href.startsWith('#')) { await expect(page.locator(href)).toHaveCount(1); continue; }
      if (href.startsWith('mailto:')) { expect(href).toBe('mailto:karel.kvasnicka42@gmail.com'); continue; }
      if (href.startsWith('tel:')) { expect(href).toBe('tel:+420731546321'); continue; }
      if (href === 'https://www.instagram.com/vyrobeno_ve_stodole/') continue;
      const result = await request.get(new URL(href, page.url()).href);
      expect(result.status()).toBe(200);
    }
  }
  expect(titles.size).toBe(routes.length);
  expect(errors).toEqual([]);
});

test('surové HTML v podsložce zobrazí logo, navigaci i patičku', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/publikovany-web/**', async route => {
    const name = new URL(route.request().url()).pathname.slice('/publikovany-web/'.length);
    const source = new URL(`../${name || 'index.html'}`, import.meta.url);
    if (name === 'src/styles.css') {
      // The mocked navigation can abort a view transition before the CSS loads.
      const css = await readFile(source, 'utf8');
      return route.fulfill({ contentType: 'text/css', body: css.replace('@view-transition { navigation: auto; }', '') });
    }
    return route.fulfill({ path: fileURLToPath(source) });
  });
  const logo = page.waitForResponse(response => response.url().endsWith('/src/assets/images/logo.png'));
  await page.goto('/publikovany-web/');
  expect((await logo).ok()).toBe(true);
  await expect(page.locator('.brand-logo')).toBeVisible();
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Úvod' })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('footer')).toHaveCount(1);
  await page.getByRole('navigation').getByRole('link', { name: 'Kontakt' }).click();
  await expect(page).toHaveURL(/publikovany-web\/kontakt\.html$/);
  await expect(page.getByRole('navigation').getByRole('link', { name: 'Kontakt' })).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});

test('mobilní navigace, Escape, focus, změna šířky a skutečný přechod', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await page.goto('/');
  const toggle = page.getByRole('button', { name: /Menu/ });
  const nav = page.getByRole('navigation', { name: 'Hlavní navigace' });
  const cart = page.getByRole('link', { name: 'Košík' });
  await expect(toggle).toHaveText('');
  const toggleBox = await toggle.boundingBox();
  const cartBox = await cart.boundingBox();
  expect(cartBox.x).toBeGreaterThanOrEqual(toggleBox.x + toggleBox.width);
  expect(cartBox.y).toBe(toggleBox.y);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await expect(nav).toBeHidden();
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(toggle).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('Tab');
  await expect(nav.getByRole('link', { name: 'Úvod' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(toggle).toBeFocused();
  await expect(nav).toBeHidden();
  await toggle.click();
  await nav.getByRole('link', { name: 'O stodole' }).click();
  await expect(page).toHaveURL(/o-stodole.html$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('O stodole');
  await page.setViewportSize({ width: 768, height: 1000 });
  await expect(toggle).toBeHidden();
  await expect(nav).toBeVisible();
});

test('galerie zachovává rozložení fotografií a otevírá jejich detail', async ({ page }) => {
  await page.goto('/galerie.html');
  await expect(page).toHaveTitle(/Galerie/);
  await expect(page.locator('header [aria-current=page]')).toHaveText('Galerie');
  await expect(page.locator('.gallery-item')).toHaveCount(7);
  await expect(page.locator('.gallery img')).toHaveCount(7);
  await expect(page.locator('.gallery p, .gallery hr')).toHaveCount(0);
  await expect(page.locator('.gallery-dialog')).not.toBeVisible();
  await expect(page.locator('main > hr')).toHaveCount(1);
  const galleryCta = page.locator('.cta');
  await expect(galleryCta.locator('h2')).toHaveText('Líbí se Vám moje práce?');
  await expect(galleryCta.getByRole('link', { name: 'Formulář' })).toHaveAttribute('href', './kontakt.html#form-title');
  await expect(galleryCta.getByRole('link', { name: 'Obchod' })).toHaveAttribute('href', './obchod.html');
  const photographs = page.locator('.gallery-item:has(img)');
  for (const photograph of await photographs.all()) {
    await photograph.scrollIntoViewIfNeeded();
    await expect.poll(() => photograph.locator('img').evaluate(img => img.complete && img.naturalWidth > 0)).toBe(true);
    const image = await photograph.locator('img').boundingBox();
    const title = await photograph.locator('figcaption').boundingBox();
    expect(title.y).toBeGreaterThanOrEqual(image.y);
    expect(title.y + title.height).toBeLessThanOrEqual(image.y + image.height + 1);
    const ratio = await photograph.locator('img').evaluate(img => img.naturalWidth / img.naturalHeight);
    expect(Math.abs(image.width / image.height - ratio)).toBeLessThan(0.01);
  }
  const first = await photographs.nth(0).boundingBox();
  const second = await photographs.nth(1).boundingBox();
  expect(Math.abs(first.y - second.y)).toBeLessThan(2);
  expect(second.x).toBeGreaterThan(first.x);

  await photographs.first().locator('template').evaluate(template => {
    template.content.querySelector('p').textContent = 'Ukázkový popis pro ověření.';
  });
  const firstButton = page.getByRole('button', { name: 'Zvětšit fotografii: Dubová lavice' });
  await firstButton.click();
  const detail = page.getByRole('dialog', { name: 'Dubová lavice' });
  await expect(detail).toBeVisible();
  await expect(detail.locator('img')).toHaveAttribute('src', await photographs.first().locator('img').getAttribute('src'));
  expect((await detail.locator('img').boundingBox()).width).toBeGreaterThan(first.width);
  await expect(detail.getByText('Ukázkový popis pro ověření.')).toBeVisible();
  const panel = detail.locator('.gallery-dialog-panel');
  await expect(detail).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await expect(panel).toHaveCSS('background-color', 'rgba(255, 255, 255, 0.6)');
  expect((await panel.boundingBox()).x).toBeGreaterThan((await detail.locator('img').boundingBox()).x);
  await expect(page.locator('html')).toHaveCSS('overflow-y', 'hidden');
  expect(await detail.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  await expect(detail.getByRole('button', { name: 'Zavřít' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(detail).not.toBeVisible();
  await expect(firstButton).toBeFocused();

  await page.setViewportSize({ width: 360, height: 780 });
  const secondButton = page.getByRole('button', { name: 'Zvětšit fotografii: Stolek pro Millennium Falcon' });
  await photographs.nth(1).locator('template').evaluate(template => template.content.replaceChildren());
  await secondButton.focus();
  await page.keyboard.press('Enter');
  const nextDetail = page.getByRole('dialog', { name: 'Stolek pro Millennium Falcon' });
  await expect(nextDetail).toBeVisible();
  await expect(nextDetail.locator('.gallery-dialog-description')).toBeHidden();
  await nextDetail.getByRole('button', { name: 'Zavřít' }).click();
  await expect(nextDetail).not.toBeVisible();
  await expect(secondButton).toBeFocused();

  await photographs.nth(1).locator('template').evaluate(template => {
    const paragraph = document.createElement('p');
    paragraph.textContent = 'Delší popis realizace pro ověření stránkování. '.repeat(50);
    template.content.append(paragraph);
  });
  await page.keyboard.press('Enter');
  await expect(nextDetail).toBeVisible();
  expect((await nextDetail.locator('.gallery-dialog-panel').boundingBox()).y)
    .toBeGreaterThan((await nextDetail.locator('img').boundingBox()).y);
  expect(await nextDetail.evaluate(element => element.scrollHeight <= element.clientHeight)).toBe(true);
  const pagination = nextDetail.getByRole('group', { name: 'Stránky popisu' });
  await expect(pagination).toBeVisible();
  await pagination.getByRole('button', { name: 'Další' }).click();
  await expect(pagination).toContainText('2 /');
  expect(await nextDetail.locator('.gallery-dialog-description').evaluate(element => element.scrollLeft)).toBeGreaterThan(0);
});

test('formulář ověřuje vstupy a zpracuje odpověď Google Apps Script', async ({ page }) => {
  const scriptUrl = 'https://script.google.com/macros/s/inquiry-mail-test/exec';
  let acceptInquiry = false;
  await page.route(scriptUrl, route => {
    const { requestId } = JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));
    const result = acceptInquiry
      ? { requestId, ok: true, orderNumber: '2026-11-26-1802' }
      : { requestId, ok: false, error: 'Zkušební chyba odeslání.' };
    return route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<script>window.top.postMessage(${JSON.stringify(result)}, ${JSON.stringify(new URL(page.url()).origin)});</script>`,
    });
  });
  await page.goto('/kontakt.html');
  await page.locator('#inquiry-form').evaluate((form, url) => { form.dataset.appsScriptUrl = url; }, scriptUrl);
  const requests = [];
  page.on('request', req => requests.push(`${req.method()} ${req.url()}`));
  await page.getByRole('button', { name: 'Odeslat formulář' }).click();
  await expect(page.locator('#full-name')).toBeFocused();
  await expect(page.locator('[aria-invalid=true]')).toHaveCount(2);
  await expect(page.locator('#phone')).not.toHaveAttribute('required');
  await page.locator('#full-name').fill(validContact.fullName);
  await page.locator('#email').fill('neplatny');
  await page.locator('#phone').fill('abc');
  await page.getByRole('button', { name: 'Odeslat formulář' }).click();
  await expect(page.locator('#email')).toBeFocused();
  await expect(page.locator('#email-error')).toContainText('platný e-mail');
  await expect(page.locator('#phone-error')).toHaveText('Zadejte platné telefonní číslo');
  await expect(page.locator('#email-error')).toHaveCSS('text-align', 'left');
  await expect(page.locator('#phone-error')).toHaveCSS('text-align', 'left');
  await page.locator('#email').fill(validContact.email);
  await page.locator('#phone').fill('');
  await page.locator('#description').fill('Testovací popis.');
  const picker = page.locator('#attachments');
  await picker.setInputFiles([upload('odebrana.pdf'), upload('fotka.jpg')]);
  await page.locator('.remove-file').first().click();
  await picker.setInputFiles([upload('nacrt.png'), upload('nepovoleny.exe')]);
  await page.getByRole('button', { name: 'Odeslat formulář' }).click();
  await expect(picker).toBeFocused();
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  await page.getByRole('button', { name: 'Pokračovat bez odmítnutých souborů' }).click();
  const [submission] = await Promise.all([
    page.waitForRequest(scriptUrl),
    page.getByRole('button', { name: 'Odeslat formulář' }).click(),
  ]);
  expect(submission.method()).toBe('POST');
  const payload = JSON.parse(new URLSearchParams(submission.postData()).get('payload'));
  expect(payload).toMatchObject({ email: validContact.email, phone: '', description: 'Testovací popis.' });
  expect(payload.attachments.map(file => file.name)).toEqual(['fotka.jpg', 'nacrt.png']);
  expect(Buffer.from(payload.attachments[0].data, 'base64url')).toEqual(Buffer.alloc(100));
  const result = page.locator('#form-result');
  await expect(result).toHaveText('Zkušební chyba odeslání.');
  await expect(page.locator('#email')).toHaveValue(validContact.email);
  await expect(page.locator('#file-list li')).toHaveCount(2);

  acceptInquiry = true;
  await page.getByRole('button', { name: 'Odeslat formulář' }).click();
  await expect(result).toHaveText('Poptávka byla odeslána. Číslo objednávky 2026-11-26-1802.');
  await expect(page.locator('#email')).toHaveValue('');
  await expect(page.locator('#file-list li')).toHaveCount(0);
});

test('přílohy: formáty, přírůstky, limit, odmítnutí, odebrání a opakovaný výběr', async ({ page }) => {
  await page.goto('/kontakt.html');
  const picker = page.locator('#attachments');
  for (const extension of ['PDF', 'jpg', 'JPEG', 'png', 'doc', 'DOCX']) await picker.setInputFiles(upload(`podklad.${extension}`));
  await expect(page.locator('#file-list li')).toHaveCount(6);
  await picker.setInputFiles(upload('nevhodny.exe'));
  await expect(page.locator('#attachments-error')).toContainText('nepodporovaný formát');
  await expect(page.locator('#file-list li')).toHaveCount(6);
  await page.getByRole('button', { name: 'Pokračovat bez odmítnutých souborů' }).click();
  await expect(picker).toBeFocused();
  await expect(page.locator('#attachments-error')).toBeEmpty();
  for (let index = 0; index < 6; index++) await page.locator('.remove-file').first().click();
  await expect(picker).toBeFocused();
  await picker.setInputFiles(upload('presny.pdf', MAX_BYTES));
  await expect(page.locator('#file-list li')).toHaveCount(1);
  await picker.setInputFiles(upload('navic.png', 1));
  await expect(page.locator('#attachments-error')).toContainText('překročila 10 MB');
  await expect(page.locator('#file-list li')).toHaveCount(1);
  await page.locator('.remove-file').click();
  await picker.setInputFiles(upload('velky.pdf', MAX_BYTES + 1));
  await expect(page.locator('#file-list li')).toHaveCount(0);
  await picker.setInputFiles([upload('prvni.pdf', 5_000_000), upload('druhy.docx', 5_000_000)]);
  await expect(page.locator('#file-list li')).toHaveCount(2);
  await expect(page.locator('#attachments-error')).toBeEmpty();
  await page.locator('.remove-file').last().click();
  await picker.setInputFiles(upload('druhy.docx', 5_000_000));
  await expect(page.locator('#file-list li')).toHaveCount(2);
  await picker.setInputFiles(upload('<b>text</b>.exe'));
  await expect(page.locator('#attachments-error b')).toHaveCount(0);
});

async function useLocalShopApi(page) {
  await page.route('**/katalog.json', async route => {
    const response = await route.fetch();
    const catalog = await response.json();
    await route.fulfill({ json: { ...catalog, checkoutScriptUrl: '' } });
  });
}

test('obchod přepočítává košík a uloží zkušební objednávku na serveru', async ({ page }) => {
  await useLocalShopApi(page);
  await page.goto('/obchod.html');
  const links = await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link').allTextContents();
  expect(links.slice(2).map(label => label.trim())).toEqual(['Galerie', 'Obchod', 'Kontakt ↗']);
  await page.getByRole('link', { name: 'Košík', exact: true }).click();
  await expect(page.locator('#cart-empty')).toBeVisible();
  await expect(page.locator('#shop-checkout')).toBeHidden();
  await page.getByRole('link', { name: 'Zpět do obchodu' }).click();
  await page.getByRole('button', { name: 'Přidat do košíku: Prkénko 1' }).click();
  await expect(page.getByRole('link', { name: 'Košík, počet kusů: 1' })).toBeVisible();
  await page.getByRole('link', { name: 'Přejít do košíku' }).click();
  await expect(page).toHaveURL(/kosik\.html$/);
  await page.reload();
  await page.getByRole('button', { name: 'Zvýšit množství: Prkénko 1' }).click();
  await expect(page.locator('#cart-total')).toHaveText(/980\sKč/);
  await page.getByRole('button', { name: 'Snížit množství: Prkénko 1' }).click();
  await expect(page.locator('#cart-total')).toHaveText(/490\sKč/);
  await page.getByRole('button', { name: 'Snížit množství: Prkénko 1' }).click();
  await expect(page.locator('#shop-checkout')).toBeHidden();
  await page.getByRole('link', { name: 'Zpět do obchodu' }).click();
  await page.getByRole('button', { name: 'Přidat do košíku: Stojan na víno 1' }).click();
  await page.getByRole('link', { name: 'Košík, počet kusů: 1' }).click();
  const checkout = page.locator('#shop-checkout');
  await checkout.getByLabel('Jméno a příjmení').fill('Jana Ukázková');
  await checkout.getByLabel('E-mail').fill('jana@example.com');
  const submit = checkout.getByRole('button', { name: 'Odeslat objednávku' });
  await expect(submit).toBeDisabled();
  await checkout.getByLabel('Ulice a číslo domu').fill('Ukázková 12');
  await checkout.getByLabel('Obec', { exact: true }).fill('Plzeň');
  await checkout.getByLabel('PSČ').fill('301 00');
  await checkout.getByRole('radio', { name: 'Doručení na uvedenou adresu' }).check();
  await expect(checkout.getByRole('radio', { name: 'Při převzetí' })).toBeChecked();
  const accepted = page.waitForResponse(response => response.url().endsWith('/api/shop/orders'));
  await submit.click();
  const response = await accepted;
  expect(response.status()).toBe(201);
  expect(response.request().postDataJSON()).toMatchObject({ delivery: 'shipping', payment: 'pickup' });
  expect(await response.json()).toMatchObject({ number: expect.stringMatching(/^\d{6}$/), total: 390 });
  await expect(page.locator('#shop-result')).toContainText(/Objednávka.*390\sKč.*byla uložena/);
  await expect(checkout).toBeHidden();
  await expect(page.getByRole('link', { name: 'Košík', exact: true })).toBeVisible();
});

test('produkt z nabídky otevře detail s fotkami a cenou pro košík', async ({ page }) => {
  await useLocalShopApi(page);
  await page.goto('/obchod.html');
  await expect(page.locator('.shop-product')).toHaveCount(6);
  const link = page.getByRole('link', { name: 'Prkénko 1', exact: true });
  const original = link.locator('.shop-product-original');
  await expect(original).toHaveCSS('opacity', '0');
  await link.hover();
  await expect(original).toHaveCSS('opacity', '1');
  await link.click();
  await expect(page).toHaveURL(/produkt\.html\?id=prkenko-1$/);
  await expect(page.getByRole('heading', { name: 'Prkénko 1', level: 1 })).toBeVisible();
  const gallery = page.locator('#product-gallery img');
  await expect(gallery).toHaveCount(3);
  for (const image of await gallery.all()) {
    await image.scrollIntoViewIfNeeded();
    await expect.poll(() => image.evaluate(node => node.naturalWidth)).toBeGreaterThan(0);
  }
  const thumbnail = page.getByRole('button', { name: 'Zvětšit fotografii: Pohled na pruhy dřeva a otvor' });
  await thumbnail.click();
  const viewer = page.getByRole('dialog', { name: 'Prkénko 1' });
  await expect(viewer.getByRole('status')).toHaveText('2 / 3');
  await expect(viewer.getByRole('img')).toHaveAccessibleName('Pohled na pruhy dřeva a otvor');
  await viewer.getByRole('button', { name: 'Další fotografie' }).click();
  await expect(viewer.getByRole('status')).toHaveText('3 / 3');
  await page.keyboard.press('ArrowRight');
  await expect(viewer.getByRole('status')).toHaveText('1 / 3');
  await viewer.getByRole('button', { name: 'Předchozí fotografie' }).click();
  await expect(viewer.getByRole('status')).toHaveText('3 / 3');
  await page.keyboard.press('Escape');
  await expect(viewer).toBeHidden();
  await expect(thumbnail).toBeFocused();
  await page.getByRole('button', { name: 'Přidat do košíku: Prkénko 1' }).click();
  await page.getByRole('link', { name: 'Přejít do košíku' }).click();
  await expect(page.locator('#cart-total')).toHaveText(/490\sKč/);
});

test('košík bez objednávkového serveru dovolí vyplnit údaje a zvolit platbu', async ({ page }) => {
  await useLocalShopApi(page);
  await page.route('**/api/shop/status', route => route.fulfill({ status: 404 }));
  const sent = [];
  page.on('request', request => {
    if (request.method() === 'POST') sent.push(request.url());
  });
  await page.goto('/obchod.html');
  await page.getByRole('button', { name: 'Přidat do košíku: Stojan na víno 1' }).click();
  await page.getByRole('link', { name: 'Přejít do košíku' }).click();
  const checkout = page.locator('#shop-checkout');
  await expect(checkout.locator('#shop-submit-status')).toContainText('Objednávková služba je momentálně nedostupná.');
  await checkout.getByLabel('Jméno a příjmení').fill('Jana Ukázková');
  await checkout.getByLabel('E-mail').fill('jana@example.com');
  await checkout.getByLabel('Ulice a číslo domu').fill('Ukázková 12');
  await checkout.getByLabel('Obec', { exact: true }).fill('Plzeň');
  const postcode = checkout.getByLabel('PSČ');
  await postcode.fill('301 00');
  const transfer = checkout.getByRole('radio', { name: 'Převodem po potvrzení (QR platba)' });
  const pickupPayment = checkout.getByRole('radio', { name: 'Při převzetí' });
  await transfer.check();
  await pickupPayment.check();
  await checkout.getByRole('radio', { name: 'Doručení na uvedenou adresu' }).check();
  await expect(pickupPayment).toBeChecked();
  await transfer.check();
  await checkout.getByRole('radio', { name: 'Osobní odběr' }).check();
  await expect(transfer).toBeChecked();
  await expect(checkout.getByRole('button', { name: 'Odeslat objednávku' })).toBeDisabled();
  await postcode.press('Enter');
  await expect(checkout).toBeVisible();
  expect(sent).toEqual([]);
});

test('zkušební košík ověří doručení a cenu bez odeslání údajů', async ({ page }) => {
  await page.route('**/katalog.json', route => route.fulfill({ json: {
    catalogReady: false, checkoutScriptUrl: 'https://script.google.com/macros/s/checkout-test/exec',
    checkoutShippingPrice: 100, checkoutFreeShippingAbove: 1000,
    products: [{ id: 'test', name: 'Zkušební výrobek', description: '', price: 1000 },
      { id: 'plus', name: 'Doplněk', description: '', price: 1 }],
  } }));
  const posts = [];
  page.on('request', request => { if (request.method() === 'POST') posts.push(request.url()); });
  await page.goto('/obchod.html');
  await page.getByRole('button', { name: 'Přidat do košíku: Zkušební výrobek' }).click();
  await page.getByRole('link', { name: 'Přejít do košíku' }).click();
  const form = page.locator('#shop-checkout');
  for (const [key, value] of Object.entries({ name: 'Jana Ukázková', email: 'jana@example.com', street: 'Ukázková 12', city: 'Plzeň', postcode: '30100' })) {
    await form.locator(`#shop-${key}`).fill(value);
  }
  const shipping = form.getByRole('radio', { name: 'Doručení na uvedenou adresu' });
  await shipping.check();
  await expect(page.locator('#cart-total')).toHaveText(/1\s100\sKč/);
  await form.getByRole('button', { name: 'Odeslat objednávku' }).click();
  await expect(page.locator('#shop-result')).toHaveText(/Celkem 1\s100\sKč\. Objednávku se nepodařilo odeslat/);
  await expect(form.locator('#shop-name')).toHaveValue('Jana Ukázková');

  await page.getByRole('link', { name: 'Zpět do obchodu' }).click();
  await page.getByRole('button', { name: 'Přidat do košíku: Doplněk' }).click();
  await page.getByRole('link', { name: 'Přejít do košíku' }).click();
  await shipping.check();
  await expect(page.locator('#cart-total')).toHaveText(/1\s001\sKč/);
  expect(posts).toEqual([]);
});

for (const sample of [true, false]) {
  test(`košík zobrazí potvrzení objednávky ${sample ? 'se vzorem' : 's fakturou a platebním QR kódem'}`, async ({ page }) => {
    const endpoint = 'https://script.google.com/macros/s/checkout-test/exec';
    await page.route('**/katalog.json', route => route.fulfill({ json: {
      catalogReady: !sample, checkoutTestInvoices: sample, checkoutScriptUrl: endpoint,
      checkoutShippingPrice: 100, checkoutFreeShippingAbove: 1000,
      products: [{ id: 'test', name: 'Zkušební výrobek', description: '', price: 1470 }],
    } }));
    await page.route(endpoint, route => {
      const order = JSON.parse(new URLSearchParams(route.request().postData()).get('payload'));
      expect(order).toMatchObject({ email: 'jana@example.com', delivery: 'shipping', payment: 'transfer', expectedTotal: 1470 });
      const number = sample ? 'TEST-2026000001' : '2026000001';
      const reply = JSON.stringify({ ok: true, number, total: 1470, test: sample, requestId: order.requestId });
      return route.fulfill({ contentType: 'text/html; charset=utf-8',
        body: `<script>window.top.postMessage(${reply}, ${JSON.stringify(new URL(page.url()).origin)});</script>` });
    });
    await page.goto('/obchod.html');
    await page.getByRole('button', { name: 'Přidat do košíku: Zkušební výrobek' }).click();
    await page.getByRole('link', { name: 'Přejít do košíku' }).click();
    await expect(page.getByRole('heading', { name: 'Položky v košíku' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Košík', exact: true })).toHaveCount(0);
    const form = page.locator('#shop-checkout');
    for (const [key, value] of Object.entries({ name: 'Jana Ukázková', email: 'jana@example.com', street: 'Ukázková 12', city: 'Plzeň', postcode: '30100' })) {
      await form.locator(`#shop-${key}`).fill(value);
    }
    await form.getByRole('radio', { name: 'Doručení na uvedenou adresu' }).check();
    await form.getByRole('radio', { name: /^Převodem/ }).check();
    await form.getByRole('button', { name: 'Odeslat objednávku' }).click();
    await expect(page.getByRole('heading', { name: 'Objednávka byla přijata' })).toBeFocused();
    await expect(page.locator('.shop-confirmation-icon')).toBeVisible();
    await expect(page.locator('#shop-confirmation-message')).toHaveText(sample
      ? 'Potvrzení objednávky jsem odeslal na váš e-mail. S platbou prosím vyčkejte na pokyny.'
      : 'Fakturu s QR kódem pro platbu jsem odeslal na váš e-mail.');
    await expect(page.getByText('Děkuji za nákup.')).toBeVisible();
    await expect(page.getByText('Košík je zatím prázdný.')).toBeHidden();
  });
}

for (const width of [360, 768, 1440]) {
  test(`rozložení všech stránek při ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    for (const route of routes) {
      await page.goto(route);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      if (route === '/') {
        const container = await page.locator('.header-inner').boundingBox();
        const photos = page.locator('.hero-slides');
        const photoBox = await photos.boundingBox();
        const headingBox = await page.locator('.hero-heading').boundingBox();
        const intro = await page.locator('.home-intro').boundingBox();
        for (const box of [photoBox, intro, await page.locator('.home-process').boundingBox()]) {
          expect(box.x).toBe(container.x);
          expect(box.width).toBe(container.width);
        }
        await expect(photos).toHaveCSS('background-color', await page.locator('body').evaluate(body => getComputedStyle(body).backgroundColor));
        expect(headingBox.y).toBeGreaterThanOrEqual(photoBox.y);
        expect(headingBox.y + headingBox.height).toBeLessThanOrEqual(photoBox.y + photoBox.height);
        for (const image of await photos.locator('img').all()) {
          await expect(image).toHaveCSS('object-fit', 'contain');
          await expect(image).toHaveCSS('mask-image', 'none');
        }
        for (const dot of await page.locator('.hero-dot').all()) {
          await dot.click();
          expect(await photos.locator('.is-active').boundingBox()).toEqual(photoBox);
          expect((await page.locator('.home-intro').boundingBox()).y).toBe(intro.y);
        }
        await page.locator('.hero-dot').first().click();
        await expect(page.locator('#process-title')).toHaveText('Jak to všechno vzniká?');
        if (width >= 768) {
          const lines = await page.locator('#process-title').evaluate(element => {
            const range = document.createRange();
            range.selectNodeContents(element);
            return range.getClientRects().length;
          });
          expect(lines).toBe(1);
        }
      }
      await page.screenshot({ path: `test-results/visual-${width}-${route === '/' ? 'index' : route.slice(1, -5)}.png`, fullPage: true, animations: 'disabled' });
    }
  });
}

test('zvětšení textu 200 %, focus a omezený pohyb', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.setViewportSize({ width: 360, height: 900 });
  for (const route of routes) {
    await page.goto(route);
    await page.addStyleTag({ content: 'html { font-size: 200%; }' });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(page.locator('.hero, .page-intro, .gallery, .contact-layout, .cart-layout')).toHaveCSS('animation-name', 'none');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Přeskočit na obsah' })).toBeFocused();
    expect(await page.locator('.skip-link').evaluate(el => getComputedStyle(el).outlineStyle)).not.toBe('none');
    await page.keyboard.press('Enter');
    await expect(page.locator('main')).toBeFocused();
    await page.screenshot({ path: `test-results/text-200-${route === '/' ? 'index' : route.slice(1, -5)}.png`, fullPage: true });
  }
});

test('bez JavaScriptu zůstává navigace i obsah a formulář nemůže odeslat data', async ({ browser }) => {
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 360, height: 800 } });
  const page = await context.newPage();
  await page.goto('http://127.0.0.1:4173/');
  await expect(page.locator('#hero-slide-1')).toBeVisible();
  await expect(page.locator('#hero-slide-2')).toBeHidden();
  await expect(page.locator('.hero-controls')).toBeHidden();
  await page.goto('http://127.0.0.1:4173/kontakt.html');
  await expect(page.getByRole('navigation', { name: 'Hlavní navigace' })).toBeVisible();
  await expect(page.locator('#full-name')).toBeDisabled();
  await expect(page.locator('button[type=submit]')).toBeDisabled();
  await context.close();
});

test('připnutá hlavička, odsazení obsahu a kontakty v černé patičce', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  for (const width of [360, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    const header = page.locator('.site-header');
    await page.evaluate(() => window.scrollTo({ top: 1200, behavior: 'instant' }));
    expect((await header.boundingBox()).y).toBe(0);
    await expect(header).toHaveCSS('position', 'sticky');
    if (width === 360) await page.getByRole('button', { name: /Menu/ }).click();
    await page.getByRole('navigation', { name: 'Hlavní navigace' }).getByRole('link', { name: /Kontakt/ }).click();
    await expect(page).toHaveURL(/kontakt.html$/);
    const footer = page.locator('footer');
    await expect(footer).toHaveCSS('background-color', 'rgb(0, 0, 0)');
    await expect(footer.locator('nav')).toHaveCount(0);
    await expect(footer.locator('address')).toContainText('E-mail');
    await expect(footer.locator('address')).toContainText('Telefon');
    await expect(footer.locator('address dd')).toHaveText(['Karel (Qasar) Kvasnička', 'karel.kvasnicka42@gmail.com', '+420 731 546 321', '@vyrobeno_ve_stodole', 'Plzeňský a Středočeský kraj']);
    await expect(footer).not.toContainText('Pracovní návrh');
    await footer.getByRole('link', { name: 'Zpět nahoru' }).click();
    const headerBox = await header.boundingBox();
    const mainBox = await page.locator('main').boundingBox();
    expect(mainBox.y).toBeGreaterThanOrEqual(headerBox.y + headerBox.height);
  }
});
