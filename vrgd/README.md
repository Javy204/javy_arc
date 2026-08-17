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
| `js/main.js` | Animační vrstva — 12 očíslovaných bloků, každý jedna funkce. |
| `js/vendor/` | GSAP 3.15 (+ ScrollTrigger, SplitText, Flip, Draggable, Inertia, CustomEase, Observer) a Lenis. Lokálně, nic se netahá z CDN. |
| `assets/fonts/` | Mea Culpa, Inter, Annie Use Your Telescope, Instrument Sans jako woff2. |
| `assets/VRgD.svg` | Původní logo. |

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

## Texty

Copy v sekcích ABOUT / WORK / CONTACTS je zástupný — struktura sedí, obsah je
na výměnu. Položky prací jsou v `index.html` jako `<article class="card">`.
