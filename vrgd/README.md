# VRgD — web

Statický web, žádný build step. Otevře se přímo v prohlížeči přes lokální server.

```bash
python3 /Users/stepanjavorsky/vrgd-web/serve.py 3336
```

Pak `http://localhost:3336`. (V Claude Code je nakonfigurovaný jako preview server `vrgd`.)

> **Nepoužívej `python3 -m http.server`.** Ignoruje hlavičku `Range` a na
> každý dotaz vrátí celý soubor. `<video>` se pak hlásí jako
> `seekable = [0, 0]` a **scroll-scrub hera mlčky nefunguje** — `currentTime`
> se nepohne, i když je video celé nabufferované. `serve.py` je obyčejný
> statický server, který Range umí. GitHub Pages ho umí taky, takže tohle
> je čistě lokální problém.

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
samy sebe: `initChrome()` v `main.js` navěsí na každý `.is-invert` blok
ScrollTrigger, a když je ten blok reálně za nimi, dostanou třídu `.on-dark`,
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

## Video v heru — scroll-scrub

Když `assets/hero.mp4` existuje, hero se **připne** (`.hero.has-scrub`,
`min-height: 320svh`) a scroll pozice se mapuje přímo na `video.currentTime` —
takže se záběr posune přesně o to, co odscrolluješ. Když soubor chybí, hero
zůstane vysoké jeden viewport a jede na něm halftone canvas. Nic se nemusí
přepínat.

Video se **nepřehrává samo** a nemá `loop` — je pauzované a jediné, co s ním
hýbe, je scroll. Kód je v `initHeroScrub()`:

- `currentTime` se **nenastavuje natvrdo** na každý scroll event, ale dohání
  cíl lerpem (`0.18`). Bez toho dekodér mlátí sebou a obraz trhá.
- Safari nedekóduje pro seek, dokud se přehrávání jednou nedotkneš — proto
  to jednou tiše `play()` a hned `pause()`.
- Scrub se zapne teprve po `HEAD` dotazu, že soubor existuje, a po
  `loadedmetadata`.

### Čím rozhoduje plynulost

Změřené na tomhle stroji (40 seeků, rozpočet jednoho frame při 60 fps je 16,7 ms):

| Verze | Průměr seeku | Nad rozpočtem |
|---|---|---|
| 4K (originál) | 54 ms | většina |
| 1080p | 13,2 ms | 10 / 40 |
| **720p (nasazeno)** | **9,9 ms** | **1 / 40** |

Takže **rozlišení rozhoduje víc než cokoli jiného** — 4K dekódování při seeku
je 3× nad rozpočtem a viditelně trhá. Aktuální `hero.mp4` je proto 720p
(8,9 MB). Video sedí za tmavým scrimem a pod logem, takže je to nepoznat.

Druhý faktor je **kolik pixelů scrollu padne na jeden frame**. Teď ~4,7 px
(dřív 20 px při krátkém videu, což byla ta krokovost). Řídí to
`min-height` u `.hero.has-scrub` — **kratší dráha = plynulejší**, ne naopak.

Převod na 720p jde vestavěným macOS nástrojem, ffmpeg není potřeba:

```bash
avconvert --source vstup.mp4 --preset Preset1280x720 --output hero.mp4 --replace
```

Presety: `Preset960x540`, `Preset1280x720`, `Preset1920x1080`. Kdybys chtěl
ještě lehčí, 540p vyjde kolem 5 MB.

**Co by pomohlo nad tohle:** export s **keyframe interval 1** (all-intra) —
teď je keyframe každé ~2 s, takže prohlížeč musí u seeku dozadu dekódovat až
50 framů. `avconvert` to neumí nastavit, chtělo by to ffmpeg nebo export
z Resolve.

## Starší poznámka k videu

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
(třída `.on-dark`).

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
