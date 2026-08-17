# VRgD — web

Statický web, žádný build step. Otevře se přímo v prohlížeči přes lokální server.

```bash
python3 -m http.server 3336 --directory /Users/stepanjavorsky/vrgd-web
```

Pak `http://localhost:3336`. (V Claude Code je nakonfigurovaný jako preview server `vrgd`.)

## Co kde je

| Cesta | Obsah |
|---|---|
| `index.html` | Celá stránka. Logo je inline SVG `<symbol id="vrgd">`, používá se přes `<use>`. |
| `css/style.css` | Kompletní styl. Barvy a fonty jsou nahoře jako CSS proměnné. |
| `gallery.html` | Galerie — nekonečná draggable mřížka. |
| `js/shared.js` | Společné pro všechny stránky: kurzor, scramble, menu, hodiny. |
| `js/main.js` | Jen index — loader, hero, slider, revealy, nav. |
| `js/gallery.js` | Jen galerie — mřížka a pop-upy. |
| `assets/gallery.json` | **Obsah galerie.** Tady se přidávají fotky. |
| `js/vendor/` | GSAP 3.15 (+ ScrollTrigger, SplitText, Flip, Draggable, Inertia, CustomEase, Observer) a Lenis. Lokálně, nic se netahá z CDN. |
| `assets/fonts/` | Mea Culpa, Inter, Annie Use Your Telescope, Instrument Sans jako woff2. |
| `assets/VRgD.svg` | Původní logo. |

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

Navbar a side nav jedou na `mix-blend-mode: difference`, takže se nad
tmavými bloky **samy přebarví** — není potřeba nic přepínat.

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

Hero čeká na `assets/hero.mp4`. Dokud tam není, běží na pozadí generovaný
halftone dither plát (canvas, `initDither()` v `main.js`) — dokud video chybí,
vrací se 404 do konzole, což je v pořádku.

Jakmile soubor přibude, video se samo prolne přes plát a canvas se vypne:

```bash
cp /cesta/k/videu.mp4 /Users/stepanjavorsky/vrgd-web/assets/hero.mp4
```

Doporučeně H.264, tichý, ideálně pod ~10 MB a zaloopovatelný.

## Animace (odkoukané z noartmusic.com)

- **Loader** — počítadlo 0–100 %, červený progress bar, plát se rozevírá
  0 → 4rem → 45vw → celá obrazovka, logo škáluje s ním. Jednou za session
  (`sessionStorage`, klíč `vrgdIntro`).
- **Kurzor** — vlastní tečka + popisek, který se „scrambluje" podle
  `data-cursor-text` na hoverovaném prvku.
- **Scramble na hover** — odkazy s `data-scramble-hover`, část znaků problikne červeně.
- **Reveal** — proza se přes `SplitText` + `Flip` přesype z ragged do justified,
  nadpisy najíždějí po slovech.
- **Lenis** smooth scroll napojený na `ScrollTrigger`.
- **Slider** — drag s dojezdem (`Draggable` + `InertiaPlugin`).

Vše respektuje `prefers-reduced-motion` a bez JS se stránka zobrazí staticky
(skryté pre-roll stavy jsou schované pod `.js`).

## Navigace — tři varianty, jedna aktivní

Na indexu jsou postavené **tři navigace** a vždycky se zobrazuje **jen jedna**.
Režim drží atribut `data-nav` na `<html>`:

| Režim | Co to je |
|---|---|
| `sidenav` | Svislý seznam vpravo uprostřed (výchozí). |
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
