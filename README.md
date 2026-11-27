# Vyrobeno ve stodole — první fáze

Lokální web českého zakázkového truhlářství. HTML, CSS a JavaScript s Vite. Obchod používá objednávkovou službu v Node.js a databázi SQLite.

## Spuštění

Otevřete tuto složku `web-faze-1` ve Visual Studio Code a spusťte v jejím terminálu:

```sh
npm install
npm run dev
```

Závislosti jsou při předání již nainstalované. Pro současnou instalaci stačí `npm run dev`. Použitý Node.js: 24.22.3. Otevřete lokální adresu vypsanou Vitem, obvykle http://127.0.0.1:5173/.

```sh
npm run build
npm run preview
```

Build vytvoří sedm stránek ve složce `dist`. Zdrojové HTML otevírejte přes Vite, nikoli přímo přes `file://`. Sestavený web včetně objednávkového API spustíte přes `npm start`.

Při přímém zveřejnění zdrojových souborů na statickém hostingu, například GitHub Pages, doplní hlavičku a patičku prohlížeč z `src/main.js` a `src/layout.js`. Košík a formulář lze vyzkoušet i bez serveru. Odeslání objednávky se povolí až po ověření objednávkové služby spuštěné přes Node.js. Poptávky z kontaktní stránky odesílá samostatný Google Apps Script.

## Stránky a úpravy

- `index.html` — úvod s hlavním nadpisem na průsvitném bílém podkladu přes čtyři střídající se snímky. Pod ním je představení a pět kroků spolupráce podle Word podkladu.
- `o-stodole.html` — úplný příběh a přístup obsahově podle dokumentu v pořadí Cesta k řemeslu, Moje dílna (přeškrtnutá) stodola, Jak pracuji. Tři místa pro fotografie se na počítači střídají vlevo a vpravo; na mobilu následuje u každého bloku text a fotografie. Slovo dílna je natočené i s přeškrtnutím. Pohled do stodoly dostává širší pravý sloupec a formát 16 : 10. Část Jak pracuji má jeden společný obrázek vlevo a všechny tři textové části vpravo. Jak pracuji obsahuje Materiál, Spolupráci s osobní domluvou a Možnosti výroby s otevřenou komunikací, bez číslování. Zmínku o e-shopu podle upřesnění uživatele nahrazuje odkaz na Galerii. Závěrečná výzva k poptávce je zachovaná. Texty Spolupráce a Možnosti výroby mají sloučené související odstavce a kompaktnější rozestupy bez změny obsahu.
- `galerie.html` — sedm fotografií s názvy na průsvitném bílém podkladu. Výběrem fotografie se otevře detail se zvětšeným snímkem, názvem a případným popisem. Popis zapište do odstavce uvnitř `<template class="gallery-description">` u příslušné fotografie. Můžete přidat i další odstavce. Prázdný popis se v detailu nezobrazuje.
- `kontakt.html` — kontaktní údaje, pokyny k nezávazné poptávce a formulář odesílaný přes Google Apps Script. Povinné údaje vysvětluje titulek hvězdičky při najetí myší a atribut `required`. Telefon je nepovinný, vyplněné číslo se validuje.
- `obchod.html` — katalog s přidáváním do košíku. Položky a ceny jsou v `katalog.json`.
- `produkt.html?id=…` — samostatný detail zvoleného výrobku. Fotky pro nabídku a detail se přiřazují podle ID v `src/shop-photos.js`.
- `kosik.html` — samostatný košík s osobními údaji, doručovací adresou, výběrem odběru či doručení a platbou. Ikona v hlavičce ukazuje počet kusů.
- `src/layout.js` — společná hlavička, navigace a patička, vkládané Vitem při vývoji i sestavení.
- `src/styles.css` — paleta, typografie, rozložení, responzivita a omezení pohybu.
- `src/main.js` — mobilní navigace, zapojení úvodního přepínání snímků a chování formuláře.
- `src/carousel.js` — automatické střídání čtyř snímků, ruční výběr a klávesové ovládání.
- `src/validation.js` — validace kontaktu a příloh.
- `src/typography.js` — při zpracování HTML ve Vite automaticky doplňuje nezalomitelné mezery za české jednopísmenné předložky a spojky (a, i, k, o, s, u, v, z včetně velkých písmen); atributy a obsah formulářových vstupů nemění.

Hlavní sekce stránek oddělují stejné jemné linky přes celou šířku; galerie má linku pouze před závěrečnou výzvou. Vzhled po úpravě: bílé pozadí obsahových sekcí, hnědé texty, patkové nadpisy Georgia a běžné texty Arial. Černá patička obsahuje béžové kontaktní údaje místo navigace; jméno, e-mail, telefon a oblast působnosti byly doplněny podle údajů uživatele. Hlavička zůstává připnutá při posouvání na počítači i mobilu. Odsazení při přechodu na obsah se přizpůsobuje její skutečné výšce i při zvětšení textu nebo otevření menu. Úvod používá stejnou šířku obsahového sloupce jako ostatní stránky. Fotografie se zobrazují celé ve společném rámu, jehož volná plocha má stejnou barvu jako pozadí webu. Hlavní nadpis snímky překrývá na bílém podkladu s 60% krytím. Postup spolupráce tvoří souvislá svislá časová osa s pěti očíslovanými kroky pod sebou: Nápad, Domluva, Dohoda, Výroba a Předání. Na počítači zůstává jednořádkový nadpis „Jak to všechno vzniká?“ v levém sloupci při posouvání a kroky se čtou vpravo. Při zvětšení textu se nadpis smí zalomit kvůli čitelnosti. Na mobilu je nadpis nad osou. Celé texty podle dokumentu zůstávají viditelné.

## Poptávkový formulář na GitHub Pages

Skript [`server/Code.gs`](server/Code.gs) odesílá poptávky na `zrzek.10@gmail.com`. Předmět používá datum a čas v pásmu `Europe/Prague`. Adresa zákazníka je v těle zprávy i v poli `Reply-To`. Vybrané soubory do 10 MB celkem připojuje jako přílohy e-mailu.

Po odeslání poptávky majiteli skript odešle zákazníkovi samostatné potvrzení. Pokud potvrzení selže, skript to zaznamená v protokolu a formulář potvrdí přijetí poptávky.

1. Na [Google Apps Script](https://script.google.com/) vytvořte projekt, vložte obsah `server/Code.gs` do editoru a uložte ho.
2. Zvolte **Nasadit → Nové nasazení → Webová aplikace**. Nastavte **Spustit jako → Já** a **Kdo má přístup → Kdokoli**. Při prvním nasazení povolte vlastnímu skriptu odesílání e-mailů. [Nasazení webové aplikace](https://developers.google.com/apps-script/guides/web#deploy_a_script_as_a_web_app)
3. Vložte adresu nasazení končící `/exec` do atributu `data-apps-script-url` formuláře v `kontakt.html`. Při přímém publikování přes GitHub Pages nahrajte `kontakt.html`, `src/main.js` a `src/inquiry-mail.js`. Při publikování sestaveného webu spusťte `npm run build` a nasaďte obsah `dist`.
4. Otevřete zveřejněnou stránku Kontakt a odešlete zkušební poptávku s fotkou. Ověřte potvrzení na stránce, důležité údaje a přílohu v doručeném e-mailu.

Po úpravě `Code.gs` nasazujte novou verzi přes **Nasadit → Spravovat nasazení**, aby zůstala stejná adresa `/exec`. Pokud se změní doména webu, upravte ve skriptu hodnotu `SITE_ORIGIN`. Potvrzení ze skutečného nasazení je nastavené pro aktuální doménu GitHub Pages.

## Košík na GitHub Pages

Samostatný skript pro košík sestavíte ve složce `web-faze-1` příkazem `node server/checkout-apps-script/build.mjs`. Výstup `server/Checkout.gs` obsahuje kód, šablonu faktury a knihovnu QR kódů. Pro vytvoření ukázkového PDF v `output/pdf` přidejte `--preview`.

Před připojením košíku doplňte v `server/checkout-apps-script/Code.gs` fakturační jméno, adresu, IČO a český IBAN. Splatnost je nastavená na 14 dní a lze ji upravit. `taxMode` nastavte na `non-vat` pouze pro potvrzeného neplátce DPH. Sazby DPH a datum uskutečnění plnění pro plátce ještě vyžadují doplnění. V `katalog.json` schvalte produkty a ceny pomocí `catalogReady`. Doprava stojí `checkoutShippingPrice` Kč a je zdarma, pokud hodnota výrobků přesáhne `checkoutFreeShippingAbove` Kč. Hodnota `null` u ceny dopravy vypíná zasílání, u hranice vypíná dopravu zdarma.

1. Sestavte nový `Checkout.gs` a vložte ho do **samostatného** projektu Google Apps Script. Nasaďte webovou aplikaci s volbami **Provést jako → Já** a **Kdo má přístup → Kdokoli**. Schvalte oprávnění k odesílání e-mailů a načítání veřejného katalogu přes `UrlFetchApp`.
2. Vložte adresu `/exec` do `checkoutScriptUrl` v `katalog.json`. Na GitHub Pages publikujte `katalog.json` v kořeni webu spolu s aktualizovanými soubory košíku a katalogu. Sestavení přes Vite ho přidá do kořene `dist`.
3. Ověřte zkušební objednávku a obě PDF přílohy. Převod používá QR platbu SPAYD s částkou v Kč, IBANem a variabilním symbolem shodným s číslem dokladu. Při platbě při převzetí uvádí faktura odpovídající způsob úhrady.

Při změně výrobků, popisů nebo cen stačí zveřejnit nový `katalog.json`. Košík i skript čtou tentýž veřejný soubor. Skript ověří celkovou cenu a při rozdílu požádá o obnovení košíku. Na faktuře uvádí každý výrobek s množstvím, jednotkovou cenou a cenou za řádek. Při doručení přidá dopravu samostatně.

S nastaveným `checkoutScriptUrl` a `checkoutTestInvoices: true` se celý průchod objednávky provede přes Apps Script. Oba e-maily skutečně odejdou, objednávky mají vlastní číselnou řadu a PDF je označené **VZOR - NEPLAŤTE**. Platba převodem má ukázkový QR kód. Pro tento režim může `catalogReady` zůstat `false`. Před ostrým prodejem nastavte `checkoutTestInvoices: false` a `catalogReady: true` a doplňte fakturační údaje v Apps Scriptu. Pokud jsou obě hodnoty `false`, košík ověřuje formulář a cenu bez odeslání údajů.

Adresu nasazení `/exec` lze otevřít v prohlížeči. Vrátí stav katalogu, zdroj a počet výrobků, případně popis chyby. Skript čte přednostně GitHub Pages a při chybě načtení použije soubor `katalog.json` z větve `main` repozitáře GitHub.

Pokud chybí oprávnění pro `UrlFetchApp`, zobrazte soubor `appsscript.json` v nastavení projektu Apps Scriptu. Použijte `oauthScopes` z `server/checkout-apps-script/appsscript.json` a zachovejte ostatní nastavení projektu. Uložte projekt, vyberte v editoru `overitKatalog` a spusťte ji pod účtem vlastníka nasazení. Funkce vyžádá oprávnění k přístupu ke katalogu a k odesílání pošty, pak ověří načtení a e-mailovou kvótu bez vytvoření objednávky. Po úspěšném ověření aktualizujte stávající nasazení na novou verzi.

Číslování dokladů a stav odeslání se ukládají ve vlastnostech projektu Apps Script. Při aktualizaci kódu používejte novou verzi téhož nasazení. Kód pro kontaktní formulář je v samostatném projektu.

## Objednávky a QR platby na serveru Node.js

Vyžaduje Node.js 24. Pro místní zkoušku spusťte `npm run dev` a otevřete stránku Obchod. Objednávka se uloží do SQLite ve složce `.shop-data`. Zprávy pro zákazníka a truhláře se v testovacím režimu ukládají jako soubory `.eml` do `.shop-data/outbox`.

Objednávky spravujte v druhém terminálu ze složky projektu:

```sh
npm run shop -- list
npm run shop -- show 000001
npm run shop -- confirm 000001 "Stodola, 12. prosince v 16:00"
npm run shop -- paid 000001
npm run shop -- handed 000001
```

Číslo v příkazech nahraďte číslem uložené objednávky. Příkaz `show` zobrazí zvolený způsob předání i adresu. U potvrzení můžete za termín přidat konečnou částku v celých Kč včetně sjednané dopravy. Převod i platbu při převzetí lze vybrat pro doručení i osobní odběr. U doručení s platbou při převzetí upřesněte způsob úhrady při domluvě se zákazníkem. Převod lze potvrdit až po nastavení českého IBANu. Potvrzení převodu obsahuje QR kód a čitelné údaje pro ruční platbu. Při osobním odběru lze potvrdit hotovost i bez IBANu. Po jeho nastavení se k potvrzení připojí také QR kód pro platbu při předání. Platbu v bankovnictví zkontrolujte před ručním označením příkazem `paid`. Samostatný PNG najdete po potvrzení v adresáři s databází.

Texty e-mailů upravíte v `server/order-email-templates.js`. U každé varianty (`received` pro přijetí, `transfer` pro potvrzení převodu, `pickup` pro potvrzení platby při předání) můžete změnit předmět `subject` a tělo `text`. Výrazy jako `{{number}}`, `{{name}}`, `{{total}}`, `{{address}}`, `{{payment}}` nebo `{{delivery}}` systém nahradí údaji objednávky. V e-mailu o přijetí funguje `{{summary}}` pro celý souhrn. V potvrzení můžete použít `{{handover}}` pro termín, `{{bankDetails}}` pro platební údaje a `{{pickupInstructions}}` pro pokyny k platbě při předání. Po úpravě restartujte server. Změny se použijí u nově vytvořených zpráv.

Při uvádění webu do provozu doplňte schválený katalog v `katalog.json` a nastavte jeho příznak `catalogReady`. V souboru `.env.shop` nebo prostředí serveru připravte `SHOP_IBAN`, `SHOP_OWNER_EMAIL`, `SHOP_MAIL_FROM` a `SHOP_SMTP_URL`. Po ověření nastavení provozujte sestavený web přes `npm start` s `SHOP_LIVE=1` a trvalým adresářem pro `SHOP_DATA_DIR` mimo veřejné soubory. Tento režim má vlastní databázi a skutečně odesílá e-maily. Vite vývoj a náhled používají vždy testovací režim. Server i terminál pro správu musí v ostrém provozu používat stejné nastavení a stejný trvalý adresář. Neodeslané zprávy lze po odstranění příčiny znovu zkusit příkazem `npm run shop -- mail`.

Systémové ověření objednávek, generování QR a testovací pošty spustíte příkazem `node --test --test-isolation=none server/shop.test.js`.

## Střídání úvodních fotografií

Čtyři snímky se v cyklu mění po 5 sekundách s jemným prolínáním. Kliknutí na tečku okamžitě vybere snímek a podrží jej 10 sekund; poté se přepne na následující snímek a vrátí k pětisekundovým intervalům. Každé další kliknutí spustí nových 10 sekund, i při výběru již aktivního snímku. Ovládání tvoří pouze tečky bez tlačítka pozastavení. Tečky podporují Tab, Enter, mezerník, šipky vlevo/vpravo a Home/End. Při systémovém omezení pohybu je automatika vypnutá; ruční výběr tečkami zůstává dostupný. Při přepnutí na jinou kartu se zbývající čas uchová. Bez JavaScriptu zůstane první snímek a ovládací prvky jsou skryté.

Na Úvodu se střídá dubová postel, knihovna s pracovním stolem, nářadí a stolek pro Millennium Falcon. Webové fotky jsou v `src/assets/images`, podklady k úpravám v `../Obrázky/Editované`. Při výměně fotografie zachovejte ID snímku kvůli propojení s tečkami a upravte alternativní text i rozměry.

## Provedené ověření

Sestavení ověří příkaz `npm run build`. Příkaz `npm test` spouští kontroly v lokálně nainstalovaném Microsoft Edge prostřednictvím Playwrightu:

- Přesné přepnutí po 5 sekundách, desetisekundové podržení po ruční volbě, opakované kliknutí, návrat ze čtvrtého snímku na první, omezený pohyb a klávesnice.
- HTTP dostupnost a přímé otevření každé stránky, všechny odkazy, titulky, meta popisy, čeština a označení aktuální navigace; bez chyb JavaScriptu.
- Mobilní menu kliknutím a klávesnicí, Escape, focus, přechod na stránku a změna šířky na desktop.
- Galerie: načtení sedmi snímků, zachování jejich poměru stran, překryvné názvy, jedna závěrečná linka a otevření detailu s názvem, větší fotografií a volitelným popisem.
- Změny množství a přepočet součtu v košíku, volba platby a uložení zkušební objednávky na serveru.
- Prázdná a neplatná povinná pole, mezinárodní telefony, focus na první chybu a zpracování odpovědi Apps Script. Testy ověřují předmět, tělo, adresu pro odpověď a přílohy s náhradou za službu `MailApp`.
- Všechny povolené přípony, postupné přidávání, nepovolený formát, přesných 10 000 000 bajtů, překročení o jediný bajt, nadlimitní jednotlivý soubor i součet, odebrání a opakovaný výběr stejného souboru.
- Všechny stránky při šířkách 360, 768 a 1440 px bez vodorovného přetékání; snímky jsou v ignorované složce `test-results`.
- Zvětšení textu na 200 % při 360 px, omezený pohyb, viditelný focus a přeskočení na obsah.
- Obsah a mobilní navigace bez JavaScriptu, zablokované odesílání formuláře.
- Připnutá hlavička po posunutí stránky na mobilu i počítači, navigace z připnuté hlavičky, odsazení začátku obsahu a kontaktní údaje místo navigace v černé patičce.

Proběhla také vizuální kontrola snímků mobilního a desktopového rozložení. Testy používají bezhlavý Microsoft Edge, nikoli fyzický mobil. Safari a Firefox nebyly v tomto prostředí ověřeny. Přechody mezi stránkami fungují jako postupné vylepšení podle podpory prohlížeče.

Opakování kontrol:

```sh
npm run build
npm test
```

Testy vyžadují nainstalovaný Microsoft Edge. Automaticky spustí a ukončí náhled sestaveného webu na portu 4173. Při úpravách zdrojů nejprve znovu sestavte web. Vývojový náhled se ukončí pomocí Ctrl+C.

## Podklady pro další fázi

- Údaje provozovatele pro produkční web; kontaktní jméno, telefon, e-mail a oblast působnosti jsou již doplněné.
- Logo, portrét a fotografie dílny.
- Fotografie skutečných realizací, jejich názvy, zadání, řešení, materiály a výsledek.
- Schválené finální texty, sociální odkazy a potvrzení rozsahu výroby, dopravy, předání a montáže.

## Fáze 2 — fotografie a vizuální úpravy

Fáze 1 je uzavřená. Uživatel zahájil fázi 2 zaměřenou na fotografie a vizuální úpravy webu.

- Upravené obrázky před vložením do webu: `../Obrázky/Editované/`. Při vložení je přesuňte do `src/assets/images/`; veškeré obrázky používané webem patří do této složky.
- Společná složka pro fotografie používané na webu: `src/assets/images/`.
- Fotografii i její umístění určuje uživatel. Snímky nevkládat ani nevybírat předem.
- Při zapracování připravit webovou kopii vybraného snímku, vhodné rozměry, formát a alternativní text. Zdrojové soubory ponechat beze změn.

Podkladový Word dokument ani ostatní původní soubory nebyly upravovány.
