const pages = [['index.html', 'Úvod'], ['o-stodole.html', 'O stodole'], ['galerie.html', 'Galerie'], ['obchod.html', 'Obchod'], ['kontakt.html', 'Kontakt']];
const path = file => file === 'index.html' ? './' : `./${file}`;

export function header(current) {
  return `<a class="skip-link" href="#obsah">Přeskočit na obsah</a>
  <header class="site-header"><div class="container header-inner">
    <a class="brand header-brand" href="./" aria-label="Vyrobeno ve stodole — úvod"><span class="brand-logo" role="img" aria-label="Vyrobeno ve stodole"></span></a>
    <button class="menu-toggle" type="button" aria-label="Menu" aria-expanded="false" aria-controls="hlavni-navigace" hidden>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
    </button>
    <nav id="hlavni-navigace" aria-label="Hlavní navigace">${pages.map(([file, label]) => `<a href="${path(file)}"${current === file ? ' aria-current="page"' : ''}>${label}${file === 'kontakt.html' ? '<span aria-hidden="true"> ↗</span>' : ''}</a>`).join('')}</nav>
    <a class="header-cart" href="./kosik.html" aria-label="Košík"${current === 'kosik.html' ? ' aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M2 4h3l2.4 11h12l2-8H6"/><circle cx="9" cy="19" r="1.2"/><circle cx="18" cy="19" r="1.2"/></svg>
      <span class="header-cart-count" aria-hidden="true" hidden></span>
    </a>
  </div></header>`;
}

export function footer() {
  return `<footer class="site-footer"><div class="container footer-main"><div class="footer-brand"><a class="brand" href="./">Vyrobeno<span>ve stodole.</span></a><p>Zakázková výroba z masivního dřeva.</p></div><address aria-label="Kontaktní údaje"><dl class="footer-contacts"><div><dt>Jméno a příjmení</dt><dd>Karel (Qasar) Kvasnička</dd></div><div><dt>E-mail</dt><dd><a href="mailto:karel.kvasnicka42@gmail.com">karel.kvasnicka42@gmail.com</a></dd></div><div><dt>Telefon</dt><dd><a href="tel:+420731546321">+420 731 546 321</a></dd></div><div><dt>Instagram</dt><dd><a href="https://www.instagram.com/vyrobeno_ve_stodole/">@vyrobeno_ve_stodole</a></dd></div><div><dt>Oblast působnosti</dt><dd>Plzeňský kraj</dd></div></dl></address></div><div class="container footer-bottom"><span>Vyrobeno ve stodole</span><a href="#obsah">Zpět nahoru ↑</a></div></footer>`;
}
