import { addAttachments, MAX_BYTES, validateContact } from './validation.js';
import { initHeroCarousel } from './carousel.js';
import { updateCartIcon } from './cart-state.js';
import { header, footer } from './layout.js';

// Static hosting can serve the source HTML without Vite's layout transform.
const content = document.querySelector('#obsah');
const filename = window.location.pathname.split('/').pop();
const currentPage = filename.endsWith('.html') ? filename : 'index.html';
if (!document.querySelector('.site-header')) {
  content.insertAdjacentHTML('beforebegin', header(currentPage));
}
if (!document.querySelector('.site-footer')) {
  content.insertAdjacentHTML('afterend', footer());
}

updateCartIcon();
window.addEventListener('pageshow', updateCartIcon);

const hero = document.querySelector('.hero');
if (hero) initHeroCarousel(hero);

// Match anchor/focus scrolling to the actual header height, including enlarged text.
const siteHeader = document.querySelector('.site-header');
const updateHeaderHeight = () => document.documentElement.style.setProperty('--header-height', `${Math.ceil(siteHeader.getBoundingClientRect().height)}px`);
updateHeaderHeight();
new ResizeObserver(updateHeaderHeight).observe(siteHeader);

const menuButton = document.querySelector('.menu-toggle');
const navigation = document.querySelector('#hlavni-navigace');
const mobile = window.matchMedia('(max-width: 767px)');
menuButton.hidden = false;
function closeMenu(restoreFocus = false) {
  menuButton.setAttribute('aria-expanded', 'false');
  navigation.hidden = mobile.matches;
  if (restoreFocus) menuButton.focus();
}
function syncMenu() {
  const focusWasInNavigation = navigation.contains(document.activeElement);
  closeMenu(mobile.matches && focusWasInNavigation);
  menuButton.hidden = !mobile.matches;
  if (!mobile.matches && document.activeElement === menuButton) navigation.querySelector('a').focus();
}
syncMenu();
mobile.addEventListener('change', syncMenu);
menuButton.addEventListener('click', () => {
  const open = menuButton.getAttribute('aria-expanded') !== 'true';
  menuButton.setAttribute('aria-expanded', String(open));
  navigation.hidden = !open;
});
document.addEventListener('keydown', event => {
  if (event.key === 'Escape' && mobile.matches && menuButton.getAttribute('aria-expanded') === 'true') closeMenu(true);
});
navigation.addEventListener('click', event => {
  if (mobile.matches && event.target.closest('a')) closeMenu();
});

const form = document.querySelector('#inquiry-form');
if (form) {
  const fields = { fullName: form.elements.fullName, email: form.elements.email, phone: form.elements.phone };
  const input = form.elements.attachments;
  const list = document.querySelector('#file-list');
  const attachmentError = document.querySelector('#attachments-error');
  const dismissAttachmentErrors = document.querySelector('#dismiss-attachment-errors');
  const result = document.querySelector('#form-result');
  let selectedFiles = [];
  let attachmentErrors = [];
  let submitted = false;

  function showFieldError(field, message = '') {
    document.querySelector(`#${field.id}-error`).textContent = message;
    if (message) field.setAttribute('aria-invalid', 'true');
    else field.removeAttribute('aria-invalid');
  }
  function renderAttachmentErrors() {
    attachmentError.textContent = attachmentErrors.join(' ');
    dismissAttachmentErrors.hidden = !attachmentErrors.length;
    if (attachmentErrors.length) input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }
  dismissAttachmentErrors.addEventListener('click', () => {
    attachmentErrors = [];
    renderAttachmentErrors();
    input.focus();
  });
  function formatBytes(bytes) {
    return `${new Intl.NumberFormat('cs-CZ', { maximumFractionDigits: 2 }).format(bytes / 1_000_000)} MB · ${new Intl.NumberFormat('cs-CZ').format(bytes)} B`;
  }
  function renderFiles() {
    list.replaceChildren();
    selectedFiles.forEach((file, index) => {
      const item = document.createElement('li');
      const info = document.createElement('span');
      info.className = 'file-info';
      info.textContent = file.name;
      const size = document.createElement('small');
      size.textContent = formatBytes(file.size);
      info.append(size);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'remove-file';
      remove.textContent = 'Odebrat';
      remove.setAttribute('aria-label', `Odebrat soubor ${file.name}`);
      remove.addEventListener('click', () => {
        selectedFiles.splice(index, 1);
        attachmentErrors = [];
        result.textContent = '';
        renderAttachmentErrors();
        renderFiles();
        const next = list.querySelectorAll('button');
        (next[Math.min(index, next.length - 1)] || input).focus();
      });
      item.append(info, remove);
      list.append(item);
    });
    document.querySelector('#attachment-total').textContent = selectedFiles.length
      ? `Vybrané přílohy: ${selectedFiles.length}. Celkem ${formatBytes(selectedFiles.reduce((total, file) => total + file.size, 0))} z ${MAX_BYTES / 1_000_000} MB.`
      : 'Zatím nejsou vybrány žádné přílohy.';
  }
  input.addEventListener('change', () => {
    const addition = addAttachments(selectedFiles, input.files);
    selectedFiles = addition.files;
    attachmentErrors = addition.errors;
    // Clear the native picker so the same file can be added again after removal.
    input.value = '';
    result.textContent = '';
    renderFiles();
    renderAttachmentErrors();
  });
  Object.entries(fields).forEach(([key, field]) => {
    field.addEventListener('blur', () => {
      if (submitted || field.value) showFieldError(field, validateContact(Object.fromEntries(Object.entries(fields).map(([name, element]) => [name, element.value])))[key]);
    });
    field.addEventListener('input', () => {
      result.textContent = '';
      if (field.hasAttribute('aria-invalid')) showFieldError(field);
    });
  });
  form.addEventListener('input', () => { result.textContent = ''; });
  form.addEventListener('formdata', ({ formData }) => {
    // Cross-origin referrers omit the project path on GitHub Pages.
    formData.set('_url', window.location.origin + window.location.pathname);
    // The picker is cleared after each selection. Send the files still shown in the list.
    formData.delete(input.name);
    selectedFiles.forEach((file, index) => formData.append(`attachment${index + 1}`, file));
  });
  form.addEventListener('submit', event => {
    submitted = true;
    result.textContent = '';
    const errors = validateContact(Object.fromEntries(Object.entries(fields).map(([key, field]) => [key, field.value])));
    for (const [key, field] of Object.entries(fields)) showFieldError(field, errors[key]);
    renderAttachmentErrors();
    const firstInvalid = Object.keys(errors)[0];
    if (firstInvalid || attachmentErrors.length) {
      event.preventDefault();
      (fields[firstInvalid] ?? input).focus();
      return;
    }
    result.textContent = 'Odesílám poptávku…';
  });
  document.querySelector('#form-fields').disabled = false;
  // Clear personal data retained by a browser's back/forward cache.
  window.addEventListener('pagehide', () => {
    form.reset();
    selectedFiles = [];
    attachmentErrors = [];
    submitted = false;
    for (const field of Object.values(fields)) showFieldError(field);
    renderFiles();
    renderAttachmentErrors();
    result.textContent = '';
  });
}
