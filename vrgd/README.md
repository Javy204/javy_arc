# VRgD — web

Statický web, žádný build step. Otevře se přímo v prohlížeči přes lokální server.

```bash
python3 /Users/stepanjavorsky/vrgd-web/serve.py 3336
```

Pak `http://localhost:3336`. (V Claude Code je nakonfigurovaný jako preview server `vrgd`.)

> **Nepoužívej `python3 -m http.server`.** Ignoruje hlavičku `Range` a na
> každý dotaz vrátí celý soubor, takže se `<video>` chová divně (hlásí se
> jako `seekable = [0, 0]`). `serve.py` je obyčejný statický server, který
> Range umí. GitHub Pages ho umí taky, takže jde čistě o lokální problém.

## Co kde je

| Cesta | Obsah |
|---|---|
| `index.html` | Celá stránka. Logo je inline SVG `<symbol id="vrgd">`, používá se přes `<use>`. |
| `css/style.css` | Kompletní styl. Barvy a fonty jsou nahoře jako CSS proměnné. |
| `gallery.html` | Galerie — nekonečná draggable mřížka. |
| `events.html` | Události — vertikální karusel. |
| `shop.html` | Lookbook — mřížka s filtrem velikostí. |
| `js/shared.js` | Společné pro všechny stránky: kurzor, scramble, menu, hodiny. |
| `js/main.js` | Jen index — loader, hero, slider, revealy, nav. |
| `js/gallery.js` | Jen galerie — mřížka a pop-upy. |
| `js/pages.js` | Podstránky events + shop. Každý blok se vypne, když jeho markup na stránce není. |
| `assets/gallery.json` | **Obsah galerie.** Tady se přidávají fotky. |
| `js/vendor/` | GSAP 3.15 (+ ScrollTrigger, SplitText, Flip, Draggable, Inertia, CustomEase, Observer) a Lenis. Lokálně, nic se netahá z CDN. |
| `assets/fonts/` | Mea Culpa, Inter, Annie Use Your Telescope, Instrument Sans jako woff2. |
| `assets/VRgD.svg` | Původní logo. |

## Tmavý režim

Přepíná se **v hlavičce** (půlený čtvereček + `LIGHT` / `DARK`). Volba se
pamatuje v `localStorage` pod `vrgd-theme` a platí i na galerii. Dokud si
uživatel nevybere sám, jede se podle **`prefers-color-scheme`** systému — a
pokud si systém přepne za běhu, web to sleduje.

Režim se nastavuje **inline scriptem v `<head>`, tedy před prvním vykreslením**
(jinak by světlá varianta probliknula).

**Celý trik:** `--paper` je *vždy* podklad stránky a `--ink` *vždy* barva
značky. Tmavý režim jen prohodí jejich hodnoty, takže všechna pravidla ve
stylu fungují dál bez úprav:

```css
:root                      { --paper: #f4f4f2; --ink: #0a0a0a; }
:root[data-theme="dark"]   { --paper: #0b0b0b; --ink: #f2f2ef; }
```

Kvůli tomu **nesmí být v CSS barvy natvrdo** — všechno jde přes tokeny
(`--muted`, `--plate`, `--plate2`, `--dotink`, `--shadow`, `--line`, `--hair`).
Když přidáváš barvu, přidej si token, ne literál.

Dvě věci se s tématem musí přepnout zvlášť:

- **`--blend`** (`multiply` ↔ `screen`) — používá to zrno a červený
  misregister loga. Na tmavém by `multiply` nebylo vidět.
- **Dither canvas** v `initDither()` kreslí pixely v JS, takže si čte
  `data-theme` a na událost `vrgd:theme` se překreslí.

> Výjimka: **kurzor má barvu natvrdo** (`#f4f4f2`). Jede na
> `mix-blend-mode: difference`, kde se světlá značka invertuje proti
> jakémukoli podkladu — takže je vidět v obou režimech a token by to rozbil.

`.is-invert` bloky jsou invertované *vůči stránce*, takže na světlém tématu
jsou tmavé a na tmavém světlé. Třída `.on-invert` na navigaci (dřív `.on-dark`)
proto znamená „nad invertovaným blokem", ne „nad tmavým".

## Barevné schéma — papírová bílá

Web je celý sladěný do bílé (`--paper #f4f4f2`) s inkoustovou typografií
(`--ink #0a0a0a`). Barvy jsou v `style.css` nahoře jako proměnné.

**Invert bloky** — tmavé plochy jsou záměrně jen dvě, jako rytmický zlom:
panel „Primary logotype — reversed" v ASSETS a celá patička CONTACTS.
Dělá to třída **`.is-invert`**, která překlopí `--bg` / `--fg` / `--line`;
stačí ji přidat na jakýkoli blok. Fullscreen menu je taky invertované.

> Pozor: pokud prvek nastavuje `background` natvrdo (jako `.asset__stage`
> přes `--plate`), musí se v `.is-invert` variantě přepsat explicitně —
> jinak vyhraje pořadím v souboru.

Navbar a side nav **nemají žádný podklad ani blur**. Místo toho si přebarví
samy sebe: `registerDarkSurface()` v `main.js` navěsí na každou tmavou plochu
ScrollTrigger, a když je ten blok reálně za nimi, dostanou třídu `.on-invert`,
která překlopí jejich `--nav-fg` z inkoustu na papír.

Proti dřívějšímu `mix-blend-mode: difference` to má dvě výhody: nepotřebuje
to žádný panel pod textem, a **červená zůstane červená** (pod `difference` se
rozpadala na cyanovou, takže tam nešly použít červené tečky aktivní sekce).

**Červená (`--red #ff2b29`) je použitá záměrně skoupě** — jen progress
linka v loaderu, tečka aktivní sekce v nav, vzorník v ASSETS a jemný
misregister loga v heru (`.split--r`, multiply, opacity .18). Když bude
chtít ubrat/přidat, je to těch pár míst.

## Fonty podle loga

Každé písmeno lockupu má vlastní rodinu — ve stylu jsou jako `.glyph--v/r/g/d`:

- **V** → Mea Culpa (`--f-script`)
- **R** → Inter 800 (`--f-inter`)
- **g** → Annie Use Your Telescope (`--f-hand`)
- **D** → Instrument Sans 700 (`--f-sans`)

## Video v heru

Hero video je **prostý muted loop** — žádný scroll-scrub. Napojí se teprve
po `HEAD` dotazu, že `assets/hero.mp4` existuje; když chybí, zůstane běžet
halftone canvas a nic se nemusí přepínat.

> Scroll-scrub (scroll řídil `currentTime`) tu byl a **je odstraněný** —
> působil moc citlivě. Kdyby se někdy vracel, je v historii commitů
> „hero video se prehrava, ne scrubuje".

**Video dělá z hera tmavou plochu.** Jakmile se rozjede, dostane hero třídu
`.has-video`, která:

- ztmaví scrim po okrajích místo bílého závoje uprostřed (ten přes záběr
  dělal divný bledý flek, hlavně na světlém tématu),
- přepne logotyp, lede a rohové značky na světlé — **v obou tématech**,
  protože záběr je svůj vlastní kontext, ne součást palety,
- zaregistruje hero přes `registerDarkSurface()`, takže se navbar, side nav
  i spina samy přebarví, stejně jako nad `.is-invert` bloky.

**Převod videa na web** (vestavěný macOS nástroj, ffmpeg netřeba):

```bash
avconvert --source vstup.mp4 --preset Preset1280x720 --output hero.mp4 --replace
```

Rozlišení rozhoduje o zátěži víc než délka — 4K je zbytečné, video sedí za
scrimem a pod logem. Presety: `Preset960x540`, `Preset1280x720`,
`Preset1920x1080`.

## Shop — lookbook bez košíku

Stránka `shop.html`: mřížka produktů s **funkčním filtrem velikostí** a swapem fotky
na hover (dva plátky pod sebou, druhý se prolne).

**Košík tu záměrně není.** GitHub Pages je statika, platby musí řešit externí
služba (Shopify/Stripe/Snipcart) — a předstírat košík, který nic neudělá, je
horší než ho nemít. Každá položka je proto `mailto:` poptávka a nahoře stojí,
že jde o lookbook.

Filtr čte `data-sizes` na položce a schová nesedící přes `hidden` (tedy
`display: none`, takže se mřížka přeskládá). Počet v hlavičce sekce se
přepočítá; když nic nezbude, ukáže se hláška.

Přidání produktu = jedno `<a class="prod" data-shop-item data-sizes="S M L">`
do `[data-shop-grid]`. Až bude reálný obchod, tahle vrstva zůstane a napojí se
na ni jen data a checkout.

## Klávesa I — blend logotypu

Na landing page přepíná **klávesa `I`** velké logo mezi dvěma režimy:

- **NORMAL** — plná výplň (bílá přes záběr, jinak inkoustová)
- **DIFFERENCE** — `mix-blend-mode: difference`, logo invertuje to, co je pod ním

Volba se pamatuje v `localStorage` (`vrgd-logo-blend`) a při přepnutí krátce
probliskne popisek režimu pod logem.

Dvě věci, na kterých to stojí:

- **Blend je na `.hero__logo`, ne na vnitřním spanu.** `.hero__logo` má
  `z-index`, takže je vlastní stacking context — blend nastavený uvnitř by
  viděl jen své sourozence, ne video pod sebou.
- **`.hero__stage` má `isolation: isolate`**, aby difference sahal jen na
  záběr v heru a ne dál po stránce.

V difference režimu se skryje červený misregister (`.split--r`) — dva efekty
přes sebe se perou.

## Events — vertikální karusel

Stránka `events.html`: tři sloupce — jména vlevo, artworky uprostřed, data vpravo.
Aktivní se drží ve všech třech zároveň.

Postavené na **`Observer`**, ne na Swiperu, aby nepřibyla další závislost.
Kolečko a tah posunou o jeden krok, klik na jméno skočí přímo.

**Sloupec jmen se generuje z karet** (`initEvents()`), takže se čísla a názvy
nemůžou rozejít s obsahem. Přidání eventu = jedna `<article data-events-card>`
do `[data-events-stage]` plus jedno `<li>` s datem; zbytek dopočítá JS.

Rozestup karet řídí `SPACING`, hloubku stohu `scale` a `autoAlpha` v
`layout()`.

## Animace (odkoukané z noartmusic.com)

- **Loader** — počítadlo 0–100 %, červený progress bar, plát se rozevírá
  0 → 4rem → 45vw → celá obrazovka, logo škáluje s ním. Jednou za session
  (`sessionStorage`, klíč `vrgdIntro`).
- **Kurzor** — spark (viz níž) + popisek, který se „scrambluje" podle
  `data-cursor-text` na hoverovaném prvku. Na hoveru se zvětší a otočí o 90°.
- **Scramble na hover** — odkazy s `data-scramble-hover`, část znaků problikne červeně.
- **Reveal** — proza se přes `SplitText` + `Flip` přesype z ragged do justified,
  nadpisy najíždějí po slovech.
- **Lenis** smooth scroll napojený na `ScrollTrigger`.
- **Slider** — drag s dojezdem (`Draggable` + `InertiaPlugin`).

Vše respektuje `prefers-reduced-motion` a bez JS se stránka zobrazí staticky
(skryté pre-roll stavy jsou schované pod `.js`).

## Spark a spina — motiv, který provází webem

Z moodboardu je vzatá **čtyřcípá hvězdička** (dlouhá vodorovná ramena, kratší
diagonály, prohnutý pas). Je v obou stránkách jako `<symbol id="spark">`
a používá se na třech místech, aby držela web pohromadě:

1. **Spina** — hairline v levém okraji (`left: max(13px, pad*.42)`, tedy mimo
   textové sloupce). Vyplňuje se podle scrollu a **spark po ní putuje** na
   pozici odpovídající tvému postupu. Točí se sám pomalu a dostane kopanec
   podle scroll velocity (`kick`, dojezd `*0.9`).
2. **Uzly** — jeden na každou sekci, umístěné na `section.offsetTop / docH`.
   Projité se rozsvítí, aktivní se zvětší a zčervená. Bez popisků záměrně —
   názvy sekcí říká navigace a text by tady lezl do obsahu.
3. **Kurzor** a **tlačítko beta přepínače** (kde se při otevření otočí o 90°).

Spina se přebarvuje nad tmavými bloky stejným mechanismem jako navigace
(třída `.on-invert`).

> Marquee pásy s textem tu byly a **jsou odstraněné** — nahradil je tenhle
> motiv. Kdyby se někdy vracely, jsou v historii commitu „trvale viditelna
> navigace + vic motion".

## Navigace — tři varianty, jedna aktivní

Na indexu jsou postavené **tři navigace** a vždycky se zobrazuje **jen jedna**.
Režim drží atribut `data-nav` na `<html>`:

| Režim | Co to je |
|---|---|
| `sidenav` | Svislý seznam vpravo uprostřed (výchozí, favorit). Má chování jumpbaru: NOW readout, který za herem vyjede zprava a nahoře se zasune, hover fill a červená tečka aktivní sekce. |
| `topnav` | Trvale viditelná mřížka odkazů v hlavičce, à la noartmusic. |
| `jumpbar` | Tmavý pill, který vyjede zdola za herem. |

Přepíná se **beta přepínačem vlevo nahoře** (SIDE / TOP / JUMP), nebo klávesou
**N**. Volba se pamatuje v `localStorage` pod `vrgd-nav`.

Režim se nastavuje **inline scriptem v `<head>`, tedy před prvním vykreslením** —
jinak by na moment probliknuly všechny tři naráz.

Odsazení sekcí vpravo (`--gutter`) existuje jen kvůli side navu, takže se
zapíná jen v režimu `sidenav`; v ostatních má obsah plnou šířku.

Pod 768 px se všechny tři skrývají a nastupuje hamburger s fullscreen menu.

> **Až se rozhodneš**, který režim zůstane: smaž blok `.navswitch` v
> `index.html`, sekci `.navswitch` ve `style.css`, funkci `initNavSwitch()`
> v `main.js`, a nech v CSS jen pravidla schovávající ty dvě nepoužité.

## Struktura — co je kde

**Index** nese jen `hero`, `about`, `work`, `assets`, `contacts`. Trvalé
navigace (side nav / topnav / jumpbar) proto mají **čtyři položky**: ABOUT,
WORK, CONTACTS, GALLERY.

**EVENTS a SHOP jsou samostatné stránky** — `events.html` a `shop.html`.
Dostaneš se na ně:

- ze patičky indexu, sloupec **MORE**
- z fullscreen menu (má plný index, tyhle o stupeň tišeji přes `data-tier="2"`)
- z lišty **ELSEWHERE** na dně každé podstránky

Číslování je stabilní a nezávislé na tom, kde sekce leží:
`01 ABOUT · 02 WORK · 03 ASSETS · 04 CONTACTS · 05 EVENTS · 06 SHOP · 07 GALLERY`

### Podstránky

Sdílejí `shared.js` (kurzor, scramble, menu, hodiny) a `pages.js` (Lenis +
karusel + filtr). Nemají loader ani spinu — jsou to jednoúčelové stránky.

> **Dvě pasti, na které jsem narazil:**
>
> Skrytý pre-roll stav navbaru byl `.js .navbar { opacity: 0 }` a odhaloval ho
> **loader, který je jen na indexu**. Na podstránkách tedy lišta zůstávala
> neviditelná (postihovalo to i galerii). Teď je to scopnuté na
> `body[data-loading="true"]`.
>
> `initHeadings()` scrambluje mono v hlavičkách sekcí — a přepisovalo to
> počty, které dopočítá `initShop`/`initEvents`. Proto **headings běží v
> `pages.js` jako poslední** a text čte až v `onEnter`.

Podstránky nemají trvalou lištu, takže se jim hamburger zobrazuje i na
desktopu (`body[data-page] .menu-button`).

## Galerie — jak přidat fotky

Obsah je v **`assets/gallery.json`**. Jedna položka = jedna dlaždice:

```json
{ "title": "Night Shift", "meta": "FILM / 2025",
  "src": "assets/gallery/night-shift.jpg",
  "body": "Popisek do pop-upu." }
```

Fotky dej do `assets/gallery/`, ~1600 px na delší straně. Když `src` chybí
nebo soubor neexistuje, vykreslí se místo fotky **halftone placeholder** —
mřížka funguje i úplně prázdná, takže se dá plnit postupně.

**Jak to funguje:** ze seznamu se vyrobí jedna buňka, změří se, spočítá se
kolik jich pokryje viewport (`+1` na okraj), a z toho se udělají **4 kopie
poskládané do dlaždice 2 × 2**. Posun jde na kontejneru přes `gsap.quickTo`
s `gsap.utils.wrap` v `modifiers` — proto to roluje nekonečně bez skoků.
Vstup obsluhuje `Observer` (kolečko, touch, drag).

**Mřížka se nikdy nezastaví** — ambientní drift přes `gsap.ticker`
(`deltaRatio()` normalizuje na 60 fps). Po hodu zdědí rychlost a plynule se
vrátí k základní. Pauzuje při tažení a při otevřeném pop-upu.

Ladicí konstanty jsou pohromadě na začátku `gallery.js`:
`WHEEL_SPEED`, `DRAG_SPEED`, `DRIFT_X/Y`, `MAX_DRIFT`, `DRIFT_DECAY`.

**Pop-upy** jsou draggable okna — vyrobí se jednou, leží na `<body>` (proto je
klonování mřížky nezduplikuje) a otevírají se podle `data-index`. `CLOSE`
nebo `Escape` zavírá.

> `CLICK_SLOP = 5` px rozhoduje klik vs. tažení. Bez toho by ti každé
> přetažení mřížky otevřelo pop-up.

Stav mřížky je v atributu `data-ig-status="loading|idle|dragging|paused"` —
dá se na něj navěsit CSS.

## Cache

`index.html` odkazuje `css/style.css?v=N` a `js/main.js?v=N`. **Při úpravě
stylu nebo JS bumpni to `N`** — prohlížeč i preview jinak servírují starou
verzi.

## Texty

Copy v sekcích ABOUT / WORK / CONTACTS je zástupný — struktura sedí, obsah je
na výměnu. Položky prací jsou v `index.html` jako `<article class="card">`.
