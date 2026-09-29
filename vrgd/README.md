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
| `gallery.html` | Galerie — police knih, každý projekt jedna kniha. |
| `events.html` | Události — vertikální karusel. |
| `shop.html` | Lookbook — mřížka s filtrem velikostí. |
| `js/shared.js` | Společné pro všechny stránky: kurzor, scramble, menu, hodiny. |
| `js/main.js` | Jen index — loader, hero, WORK spotlight (`initSpotlight`), revealy, nav. |
| `js/gallery.js` | Jen galerie — police, otevírání knihy a listování. |
| `js/pages.js` | Podstránky events + shop. Každý blok se vypne, když jeho markup na stránce není. |
| `project.html` / `js/project.js` | Detail jednoho WORK projektu (`?p=<slug>`). Čte `assets/work.json`. |
| `assets/work.json` | **Obsah WORK.** Jeden objekt = jeden projekt (hero, media, preview, credits). |
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

## WORK — horizontální slide s blob-masked rámečkem

Sekce `#work` na indexu (`initSpotlight()` v `main.js`) + `project.html` pro
detail jednoho projektu (`?p=<slug>`, čte `js/project.js`). **Tohle prošlo
během jednoho sezení čtyřmi kompletně přepsanými verzemi** (3D válec →
Embla + scroll-scrubbed video → prostý grid → zpátky Embla + blob-masked
rámeček), takže než cokoli měnit, stojí za to vědět, proč to dřívější
verze zahodily — je to níž.

### Obsah — `assets/work.json`

Jeden projekt = jeden objekt v `projects`:

```json
{
  "slug": "bolt-food", "title": "Bolt Food", "meta": "CAMPAIGN / 2025",
  "headline": "...", "body": ["odstavec", "odstavec"],
  "hero": { "src": "assets/work/bolt-food/hero.webp" },
  "preview": "assets/work/bolt-food/preview.webp",
  "media": [{ "src": "...", "caption": "...", "full": true }],
  "credits": [{ "label": "Client", "value": "Bolt Food" }]
}
```

- **`hero`** — barevná fotka, jen na `project.html` (velký úvodní snímek).
- **`preview`** — černobílá, **na šířku** oříznutá verze, jen pro slide na
  indexu. Landscape zdroj je důležitý: portrétová fotka nacpaná do
  čtvercového plátna (viz níž) se ořízne skoro na nic. `young-fashion-stars`
  žádný landscape zdroj nemá (disk s materiálem nebyl při zpracování
  připojený) — jediný projekt, co na tohle doplácí.
- Chybí-li `preview`, spadne se na `hero.src`; chybí-li úplně obojí,
  vykreslí se halftone placeholder (`data-placeholder`, sdílená utilita).

**Aktuální obsah (2026): 4 skutečné klientské projekty** (Young Fashion
Stars pro Mattoni, Bolt Food, Mattoni Authentic, Foodora) — žádné
placeholdery. `project.html`/`project.js` jsem během tohohle sezení
neměnil, jede beze změny.

### Slide — Embla Carousel

Carousel jede na **Embla** (embla-carousel.com), vendorovaná v
`js/vendor/embla-carousel.umd.js`. Dřív tu byl ručně psaný 3D válec (GSAP
proxy transform + `Observer` drag) — vypadal zajímavě, ale drag logika
uměla nechat dva snímky rozjeté napůl tweenu naráz. Embla je zavedená
knihovna, se kterou tohle nehrozí; mechanicky fungovala spolehlivě celou
dobu ladění — cokoli se rozbíjelo, bylo vždycky ve vrstvě okolo (video),
ne v ní.

`.spotlight__stage` je Embla viewport (full-bleed, `overflow:hidden`),
`.spotlight__ring` kontejner (flex row), každý `.spotlight__item` je
**celá šířka viewportu** (ne šířka rámečku) s vycentrovaným
`.spotlight__frame` uvnitř — takže swap jede od kraje ke kraji obrazovky,
ne jen v úzkém boxu, a sousední projekty jsou vždy úplně mimo canvas
(clipnuté), nikdy nekoukají zpola do záběru.

Šipky/klávesy šipek/drag mění slide; klik na aktivní rámeček (jediný, co
je vůbec viditelný) naviguje na `project.html?p=<slug>` a nastaví
`view-transition-name: project-hero` na kliknutý rámeček — stejný pár
jméno nese `.project__hero` na cílové stránce, takže z toho `@view-
transition` (v `style.css` nahoře) udělá plynulé zvětšení. Návrat z
detailu pojmenuje celý `.spotlight` kontejner (existuje hned, ještě než
doběhne `fetch('assets/work.json')`), ne konkrétní kartu — přesnost na
kterou kartu by šla, ale riziko/komplikace za to nestálo.

### Rámeček — fotka oříznutá tvarem videa

**Rámeček není obdélník** a je **masivní** (`clamp(420px, 82vh, 1100px)`,
skoro celá výška viewportu) — tvar je siluetou smyčky chromového 3D
renderu (`assets/work-deco/blob-alpha.webm`, dnes 1600px zdroj z 1920p
exportu, dřív 720px — na velké ploše byl nízké rozlišení vidět). Kreslení
jede na **dvě vrstvy** na jednom viditelném canvasu:

1. **Tlumená celá fotka** (`ctx.globalAlpha = 0.22 + boost*0.6`) — foto je
   vždycky aspoň slabě vidět v celém rámečku.
2. **Ostrý akcent** — stejná fotka nakreslená znovu na samostatný scratch
   canvas, tam teprve `globalCompositeOperation = 'destination-in'` s
   aktuálním snímkem videa, a až tenhle výsledek se dokreslí navrch.

(Nejdřív existovala jen vrstva 2 samotná — foto bylo vidět jen tenkými
proužky skrz stuhy blobu, což čtenář správně pojmenoval jako "nahledy
nejsou moc videt". Dvouvrstvá verze je oprava tohohle, ne původní návrh.)

Stejný sdílený `<video>` (jeden decode) kreslí i do dvou malých canvasů v
šipkách (`.spotlight__arrow-blob`) — tam bez fotky/dim vrstvy, jen
samotný tvar.

**`boost`** (0 v klidu, až 1 v půlce přepnutí mezi projekty) je čistě
geometrický přepočet každý frame — vzdálenost nejbližšího slidu od středu
viewportu, `Math.min(1, minAbs * 2)` — **žádný stav**, jen čtení aktuální
pozice DOM elementů. Zvedá jas dim vrstvy, takže fotka při swipu viditelně
"vzplane". Tohle byla reakce na "nepůsobí to propojené, je to porad stejná
animace" — má to dělat dojem, že se celý blok při přechodu něčím děje, ne
jen že se vymění dlaždice.

**Proč WebM s reálnou alfou, ne živá kompozice z černobílé masky:**
Zdrojový export byl RGB klip + samostatný černobílý luma-matte klip (běžný
formát z 3D renderu, protože obyčejné video alfa kanál nemá). První verze
je skládala za běhu na canvasu (`getImageData`/`putImageData` každý
frame, luminance → alfa) — fungovalo to, ale byla to další vrstva kódu,
která mohla něco pokazit. `ffmpeg` (filtr `alphamerge`) teď spojí oba
klipy do **jednoho** VP9/WebM se skutečnou alfou napečenou přímo v
souboru:

```bash
ffmpeg -i rgb.mp4 -i mask.mp4 -filter_complex \
  "[0:v]fps=30,scale=1600:1600,format=yuva420p[rgb];[1:v]fps=30,scale=1600:1600,format=gray[a];[rgb][a]alphamerge" \
  -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 30 -auto-alt-ref 0 blob-alpha.webm
```

Zdrojové soubory (RGB + mask, ve 1080p/1920p/3840p) byly v
`assets/drive-download-20260929T140040Z-1-001/` — pokud tahle složka
zmizela, je potřeba je od uživatele znovu vyžádat, encode se dá zopakovat
z čehokoli vyššího než 1080p.

Canvas pak dělá jen `drawImage(video, ...)` — žádná pixelová smyčka na
samotné maskování (jen na tu dim/sharp dvouvrstvou kompozici výš).

**Proč video jen `autoplay loop`, ne navázané na scroll:** Předchozí verze
mapovala pozici scrollu na `currentTime` videa (scroll-scrub) a po
zastavení scrollu předávala řízení na `.play()`. Vypadalo to dobře na
papíře, ale v praxi se to opakovaně někde zaseklo — buď video, nebo (u
ještě starší verze) samotná canvas kompozice. **Teď video prostě běží
pořád dokola, neptá se na scroll ani na to, který slide je zrovna
aktivní.** Nula stavového automatu = nula míst, kde se to může zaseknout.
Render smyčka (`requestAnimationFrame`) jen furt dokola kreslí, co je
zrovna na videu vidět. `boost` výš je z tohohle pravidla výjimka jen
zdánlivě — taky nic neuchovává, jen čte DOM pozice za běhu.

**Šipky mají vlastní idle pulz** (`@keyframes spotlight-arrow-pulse`,
posunutý o 1.8s mezi prev/next, aby nedýchaly synchronně) — čistě CSS,
nezávislé na JS/videu, respektuje `prefers-reduced-motion`.

> Pokud se WORK bude ještě předělávat: hlavní ponaučení z týhle série je
> **nespojovat vizuální efekt (video, transformace) se stavem scrollu**,
> pokud to fakt není nutné. Cokoli navázané na scroll pozici mělo tendenci
> se rozbít v nějaké kombinaci rychlého scrollu / rychlého klikání /
> opuštění sekce uprostřed přechodu. Ambientní smyčka bez vazby na
> interakci se ukázala jako jediná verze, co se přestala rozbíjet.
>
> **Stav k 29. 9. 2026: mechanicky funguje (žádné console chyby, žádné
> zaseknutí), ale poslední zpětná vazba na vzhled byla "to je hruza" a
> uživatel chtěl řešit vzhled v novém chatu.** Než cokoli dalšího stavět
> na týhle verzi, stojí za to se zeptat, co konkrétně nesedí — jestli je
> to pořád ten samý blob motiv (možná unavuje po tolika iteracích na
> stejném assetu), kompozice dim+sharp vrstev, timing přechodu, nebo
> něco úplně jiného. Historie požadavků v tomhle sezení: 3D válec (moc
> rušivé pozadí) → Embla + scroll-scrub video (opakovaně se zasekávalo) →
> grid podle noartmusic.com/shop ("tohle jsem nechtěl, chci horizontální
> slide") → Embla + blob-masked rámeček, malý (nahledy nejsou videt) →
> stejné, ale masivní + dvouvrstvé (aktuální stav, "hruza"). Vzorec:
> každá jednotlivá oprava dostala kladnou/neutrální zpětnou vazbu v
> moment, kdy se ukázala, ale souhrnný dojem ze sekce jako celku zůstal
> negativní — možná stojí za úvahu úplně jiný směr než "video definuje
> tvar rámečku", ne další ladění týhle konkrétní implementace.

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
- **WORK** — Embla Carousel (drag/šipky), viz sekce WORK výš.

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

## Galerie — police knih

Každý projekt je **jedna kniha**. Klik na obálku ji přiblíží na fullscreen,
další klik listuje po dvojstranách. Zavírá `CLOSE` nebo `Esc`, listuje se
kliknutím do levé/pravé poloviny nebo šipkami.

### Jak přidat obsah

Všechno je v **`assets/gallery.json`**. Jedna kniha = jeden objekt, jedna
fotka = jedna položka v `pages`:

```json
{
  "title": "Night Shift", "meta": "FILM / 2025",
  "blurb": "Text na titulní stranu.",
  "cover": "assets/gallery/night-cover.jpg",
  "backCover": "assets/gallery/night-back.jpg",
  "pages": [
    { "src": "assets/gallery/night-01.jpg", "caption": "První setup" }
  ]
}
```

Fotky dej do `assets/gallery/`, ~1600 px na delší straně. Když `src` chybí
nebo soubor neexistuje, vykreslí se **halftone placeholder** — kniha funguje
i úplně prázdná, takže se dá plnit postupně.

`cover` je nepovinný — bez něj se na polici ukáže jen halftone plát s
názvem, a uvnitř knihy stejný placeholder na pravé straně otevírací
dvojstrany (tam, kde jinak sedí přední obálka). `backCover` je taky
nepovinný: bez něj dostane placeholder levá strana otevírací dvojstrany
(žádný text „END", ten tu už není).

**`caption` u stránky se nikde nezobrazuje** — jde jen do `alt` textu
obrázku, pro čtečky obrazovky. Kniha uvnitř nemá žádné popisky ani čísla
stran, jen fotky; title/meta/blurb žijí nad knihou (viz níž).

**Reálné příklady:** `assets/gallery/myfs/` (kniha „Mattoni Young Fashion
Stars") a `assets/gallery/boltfood/` (kniha „Bolt Food", recruitment film)
— obě `cover.webp` + číslované stránky + `back.webp`. Zbylých 6 knih
(Night Shift, Snake Height, Halftone Atlas, S*burban, Legacy Project, Raw
Archive) jsou zatím placeholdery — jména se náhodou shodují se starými
fiktivními WORK projekty z doby, než WORK dostal skutečný obsah (viz WORK
sekce výš), ale je to čistě shoda, gallery.json je nezávislý soubor.

**`pageAspect`** — nepovinné, `"W / H"` pro *jednu* stránku (default
`"3 / 4"`, jako dřív). Zdrojové stránky MYFS jsou čtvercové screenshoty
(2348×2348), takže má `"pageAspect": "1 / 1"` — bez toho by se čtverec
natlačil do portrétového rámu 3:4 a nahoře/dole by zbyly velké šedé pruhy
(prázdný plát tam, kde stránka nesahá). Rám knihy teď sedí na skutečný
obsah, ne obráceně.

**Stránky uvnitř knihy jedou na `object-fit: contain`, ne `cover`.** Tohle
jsou často hotové grafické rozvržení (text u okraje, mřížky fotek těsně u
sebe) — ořez by je mohl uříznout. `contain` vždy ukáže celou stránku,
doplněnou barvou plátu tam, kde nesedí poměr stran; čte se to jako paspartu,
ne jako chyba. `pageAspect` (viz výš) drží tenhle zbytkový lem malý —
`contain` je pojistka pro drobné odchylky, ne omluva pro špatně nastavený
poměr stran.

**Rozměr `.book` počítá obecný vzorec `šířka = min(maxŠířka, maxVýška ×
poměr)`** — stejný princip jako „vejde se do rámečku" u obrázku, jen ručně
v CSS, protože `aspect-ratio` samo o sobě neumí kombinovat limit šířky i
výšky najednou. `gallery.js` při otevření knihy nastaví `--book-ratio` a
`--book-ratio-num` (spread = `pageAspect × 2`) jako inline styl na `.book`;
bez nich (placeholder knihy) platí výchozí `1.5` = původní 3:4 stránka,
takže je to nulová změna pro cokoliv, co `pageAspect` nemá.

**Obálka na polici naopak jede na `cover`** (jako přebal knihy má být
plnokrevná), a když má skutečnou fotku, dostane spodní scrim + vynucený
světlý text popisku — aby název projektu zůstal čitelný nad jakoukoli
fotkou, v obou tématech. Placeholdery bez fotky (`:has(img)` je nezasáhne)
si drží normální barvu textu podle tématu.

### Jak je to udělané

**Uvnitř knihy je jen obsah** — žádný titulní plakát, žádné popisky, žádná
čísla stran. Stránkování kopíruje skutečný tisk: **obálka tvoří vlastní
otevírací dvojstranu** — zadní obálka vlevo (statické `verso`), přední
obálka vpravo (`front` prvního listu) — přesně jako plochý přebal, se kterým
pracuje tiskárna. Teprve **potom** začíná číslovaný obsah a párování jede
nastavo od první stránky: (1,2) (3,4) (5,6)… až po poslední stránku na
statickém konci (`endEl`). Skutečné title/meta/blurb žijí v `.reader__bar` /
`.reader__blurb` **nad** knihou, ne jako stránka uvnitř — proto to čte jako
knihu, ne jako UI se stránkami navíc.

Kniha je **stoh listů** (`.leaf`), každý s přední a zadní stranou
(`backface-visibility: hidden`, zadní předotočená o 180°). Listy sedí na
pravé polovině a jsou zavěšené na hřbetu (`transform-origin: left center`);
otočení o −180° je položí přesně na levou polovinu.

Pořadí řeší `z-index`: při letu se list zvedne nad všechno, po dosednutí
dostane finální hodnotu, takže otočená hromádka stohuje odshora a neotočená
odspodu.

Otevření není Flip — je to ruční FLIP výpočet: strana knihy má poměr 3/4,
tedy **přesně poměr obálky**, takže se obálka geometricky přesně zvětší do
**pravé** strany otevírací dvojstrany — tam, kde leží `front` prvního listu,
tedy přední obálka. Kotva zoomu je na 75 % šířky knihy.

> **Dvě pasti:**
>
> Na úzkých oknech tu byl jednostránkový režim, ve kterém list zavěšený na
> hřbetu odletěl mimo obrazovku a jeho **zadní strana se nikdy nezobrazila** —
> tedy polovina každé knihy. Teď se dvojstrana jen zmenší.
>
> Pravidla pro `[data-placeholder]` byla původně uvnitř bloku galerie a při
> jeho přepsání zmizela, což rozbilo plátky i na events a shop. Jsou proto
> nahoře jako **sdílená utilita**.

## Cache

`index.html` odkazuje `css/style.css?v=N` a `js/main.js?v=N`. **Při úpravě
stylu nebo JS bumpni to `N`** — prohlížeč i preview jinak servírují starou
verzi.

## Logo — dvě různé věci, snadno se to splete

**Velké logo** (hero, patička CONTACTS) je pořád inline SVG `<symbol
id="vrgd">` z `index.html`, přes `<use>`. Jeho `viewBox` je "0 0 2048
2048" — **čtvercový**, ale samotný wordmark uvnitř zabírá jen úzký pruh
(bbox zhruba x:351 y:739 š:1467 v:618). `.contacts__mark` proto NENÍ
obyčejné `width:100%;height:auto` — je oříznuté čistě CSS trikem
(`overflow:hidden` + `aspect-ratio` na kontejneru, `scale`+`translate` na
svg), protože **`<use>` na `<symbol>` vždycky nafitne CELÝ symbol viewBox
do wrapperu** (`preserveAspectRatio`), takže změna viewBoxu na samotném
`<svg>` wrapperu nekropuje — jen mění letterboxing. (Zkoušel jsem to,
rozbilo to i hero logo, je to zpátky.)

**Malé logo v navbaru** (`.navbar__mark`) je od nedávna **jiná věc** —
rastrové PNG→WebP (`assets/union-mark-black.webp` / `-white.webp`),
černobílá varianta podle toho, jestli je zrovna navbar `.on-invert` (ne
podle light/dark tématu — to jsou dvě různé věci, hero je tmavá plocha v
obou tématech). Nepoužívá `#vrgd` symbol vůbec.

## Texty

Copy v sekcích ABOUT a CONTACTS je zástupný — struktura sedí, obsah je na
výměnu. **WORK má od nedávna skutečný obsah** (4 klientské projekty, viz
sekce WORK výš) — copy tam psané v `work.json` je reálné, ne placeholder.
