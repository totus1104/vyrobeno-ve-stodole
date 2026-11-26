const dialog = document.querySelector('.gallery-dialog');
const title = dialog.querySelector('h2');
const photo = dialog.querySelector('.gallery-dialog-photo');
const description = dialog.querySelector('.gallery-dialog-description');
const descriptionContent = description.querySelector('.gallery-description-content');
const pages = dialog.querySelector('.gallery-description-pages');
const [previous, next] = pages.querySelectorAll('button');
const pageLabel = pages.querySelector('span');
let opener;
let page = 0;
let pageCount = 1;

function showPage(index) {
  page = Math.max(0, Math.min(index, pageCount - 1));
  description.scrollLeft = page * description.clientWidth;
  pageLabel.textContent = `${page + 1} / ${pageCount}`;
  previous.setAttribute('aria-disabled', String(page === 0));
  next.setAttribute('aria-disabled', String(page === pageCount - 1));
}

function fitDescription() {
  descriptionContent.style.height = '';
  pages.hidden = true;
  if (description.hidden) return;

  // Overflowing text flows into pages the size of the available text area.
  if (description.scrollHeight > description.clientHeight) {
    pages.hidden = false;
    descriptionContent.style.height = `${description.clientHeight}px`;
  }
  pageCount = Math.max(1, Math.round(description.scrollWidth / description.clientWidth));
  showPage(0);
}

previous.addEventListener('click', () => showPage(page - 1));
next.addEventListener('click', () => showPage(page + 1));
window.addEventListener('resize', () => {
  if (dialog.open) fitDescription();
});

for (const item of document.querySelectorAll('.gallery-item')) {
  const image = item.querySelector('img');
  const name = item.querySelector('h2').textContent.trim();
  const template = item.querySelector('.gallery-description');
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'gallery-open';
  button.setAttribute('aria-label', `Zvětšit fotografii: ${name}`);
  button.setAttribute('aria-haspopup', 'dialog');
  item.append(button);

  button.addEventListener('click', () => {
    opener = button;
    title.textContent = name;

    const enlarged = image.cloneNode();
    enlarged.removeAttribute('loading');
    photo.replaceChildren(enlarged);

    const content = template.content.cloneNode(true);
    description.hidden = !content.textContent.trim();
    descriptionContent.replaceChildren(content);
    dialog.showModal();
    fitDescription();
  });
}

dialog.addEventListener('close', () => opener?.focus({ preventScroll: true }));
