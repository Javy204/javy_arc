# noartmusic.com — rozbor pododstránek a funkcí

Prošlé naživo + vytažený zdrojový kód. Poznámky ke každé mechanice včetně
konkrétních parametrů, ať se to dá postavit bez dalšího reverse-engineeringu.

Celý stack: Webflow + **GSAP 3.15** + **Lenis** + **Swiper 12** + **three.js**
+ **Shopyflow** (Shopify) + **hls.js** (video z bunny.net) + Finsweet Attributes.
Custom JS je rozdělený na 14 modulů na `assets.slater.app/slater/20350/`,
část se lazy-importuje podle URL. Některé stránky (galerie, events) mají logiku
navíc v inline `<script>` přímo v HTML — ne ve Slateru.

---

## 1. Mapa stránek

| URL | Co to je |
|---|---|
| `/` | Home — loader, video hero, three.js globe |
| `/gallery` | **Nekonečná draggable mřížka** fotek/videí |
| `/products` | Shop — mřížka 5 sloupců, 29 produktů |
| `/products/<slug>` | Detail produktu — velikosti, add to cart |
| `/events` | Vertikální swiper artworků + synced meta |
| `/events/<slug>` | Detail eventu (6 eventů) |
| `/label` | Carousel vinylů (62 releasů) + audio + draggable pop-upy |
| `/tickets` | Mono tabulka termínů |
| `/about`, `/foundation`, `/contact` | Textové stránky |
| `/jobs`, `/jobs/<slug>` | Pozice (8 inzerátů) |
| `/sign-up`, `/delivery-returns`, `/terms-conditions` | Servisní |

**Důležité pro nás:** celý web je **na bílé** (`#fff`). Jediná tmavá věc je
video hero na homepage. Takže ta bílá cesta, kterou jsme zvolili, je vlastně
blíž originálu než ta tmavá, co jsem postavil první.

---

## 2. Globální patterny (na všech stránkách)

**Navigace** — žádné klasické menu. Vpravo nahoře **dvousloupcová mřížka odkazů**
s malými čtverečkovými bullety: EVENTS (5) / SHOP / LABEL / GALLERY / ABOUT /
TICKETS / MUSIC WEEK / FOUNDATION. Aktivní stránka má bullet **červený**.
U EVENTS je počet v závorce — dopočítává se z CMS listu:

```js
const n = list.querySelectorAll('.w-dyn-item').length;
document.querySelectorAll('[data-event-count]').forEach(t => t.textContent = `[${n}]`);
```

**Logo** vlevo nahoře je ručně psané „NoART" — u nás tomu odpovídá ten rohový
`VRgD` markem.

**Rohové značky** (`is-top-left`, `is-bottom-right` …) — malé L-čka v rozích
viewportu. To už máme jako `.mk`.

**Mono typografie na všechny meta údaje** — indexy `[01]`, datumy, ceny, LAT/LON,
lokální čas. Velká Inter-bold jen na titulky. Justified mono odstavce.

**Kurzor + scramble** — máme.

---

## 3. `/gallery` — nekonečná draggable mřížka ⭐

Nejzajímavější věc na celém webu a přesně to, co chceš pro galerii.
Kód je v inline scriptu na stránce (uložený v
`/private/tmp/.../scratchpad/gallery_grid.js`, ale rekonstruovatelný z popisu níž).

**Jak to funguje:**

1. Změří se jeden item (klon, `visibility:hidden`, do DOMu a hned zpět).
2. Spočítá se kolik sloupců/řádků pokryje viewport: `ceil(wrapper/item) + 1`.
3. Vyrobí se **4 kopie** listu, každá s `columns × rows` itemy (itemy se cyklí
   modulem přes originály), a rozmístí se do 2×2 dlaždice:
   `xPercent 0/100 × yPercent 0/100`.
4. Posun je na kontejneru přes `gsap.quickTo` s `modifiers` a `gsap.utils.wrap`
   — to dělá ten nekonečný efekt bez skoků:

```js
const wrapX = gsap.utils.wrap(-tileWidth, 0);
xTo = gsap.quickTo(collection, 'x', {
  duration: 1.2, ease: 'expo.out',
  modifiers: { x: gsap.utils.unitize(wrapX) },
});
```

5. Vstup přes **`Observer.create`** (`type: 'wheel,touch,pointer'`,
   `preventDefault: true`, `dragMinimum: 3`) → `onChangeX/Y`.
6. **Ambientní drift** — mřížka se sama pomalu sune, i když nic neděláš.
   Přes `gsap.ticker` s `deltaRatio()` (normalizace na 60 fps):
   `initialDriftX 0.3`, `initialDriftY 0.15`, `maxDriftSpeed 1.2`,
   `driftDecay 0.995`. Po swipu drift zdědí rychlost a pomalu vyhasíná.
   Pauzuje se při `isUserInteracting` a `isPopupOpen`.
7. `wheelSpeed 0.75`, `dragSpeed 1.25`.
8. Stav se píše do atributu: `data-infinite-grid-status="loading|idle|dragging"`
   (dá se na to navěsit CSS, např. cursor).

**Detekce kliku vs. tažení** (druhý inline script) — bez toho by každý drag
otevřel popup:

```js
const DRAG_THRESHOLD = 5; // px
// pointerdown: zapiš pressX/pressY
// pointermove: když |dx|>5 || |dy|>5 → isDragging = true
// pointerup: když isDragging → nic; jinak otevři popup
```

Popup se **vyjme z gridu a přesune v DOMu** (pamatuje si parent +
nextSibling, aby ho šlo vrátit) a stane se draggable oknem.

**Pro VRgD:** tohle je ideální na fotogalerii. Karta má
`data-cursor-text="more info"`, takže se to pěkne váže na náš scramble kurzor.

---

## 4. `/products` — shop ⭐

**Klíčové zjištění: merch není postavený ručně. Je to Shopify přes Shopyflow.**

Webflow drží jen design, Shopyflow (`cdn.shopyflow.io/2.1.0/shopyflow.js`)
si natáhne data ze Shopify a nahydratuje HTML. Všechno jsou deklarativní
`sf-*` atributy — žádný vlastní JS:

```html
<a sf-product="15666084151644"
   sf-option-filterable-size="S_&_M_&_L_&_XL_&_XS"
   sf-data-fetched="true" href="/products/riekerhaven-tee">
```

Vazby, které používají: `sf-product`, `sf-show-title`, `sf-show-price`,
`sf-show-desc`, `sf-show-image`, `sf-show-options`, `sf-show-prediscount-price`,
`sf-out-of-stock`, `sf-add-to-cart`, `sf-cart`, `sf-cart-popup`, `sf-cart-list`,
`sf-cart-item`, `sf-cart-item-remove`, `sf-cart-count`, `sf-cart-subtotal`,
`sf-change-quantity-inc/dec`, `sf-checkout`, `sf-current-size`,
`sf-current-title`, `sf-current-image`, `sf-option-filter`, `sf-filter-reset`.

**Co to znamená pro nás:** pokud budeme chtít reálně prodávat, nemá smysl psát
košík. Buď Shopify + podobný konektor, nebo Stripe Checkout / Snipcart. Na
GitHub Pages (statika, žádný backend) je to nutnost — platby musí řešit externí
služba. Design vrstvu si postavíme sami.

**Layout listingu:** 5 sloupců, produkt = fotka + `+` (quick add) + název +
cena v mono. Vlevo nahoře `NO ART SHOP`, vpravo nahoře filtr `AVAILABLE SIZE +`
(otevírá se přes `data-filter-open` / `data-filter-close`, jen
`display: flex/none`). Vpravo dole plovoucí tmavé `CART (0 ITEMS)`.

Karta má **dvě fotky** (`product-card_thumbnail_main` + `_secondary`) = swap na
hover, a `product-card_drawer-line is-1/is-2` = vysouvací zásuvka s velikostmi.

**Detail produktu** — 3 sloupce: vlevo mono bloky (MATERIALS / CARE /
SIZE & FITTING / DELIVERY & RETURNS), střed velká fotka, vpravo název, cena,
velikosti jako čtverečky, a **velké červené ADD TO CART**.

> Pěkný detail: červená je na celém webu skoupá, ale primární commerce akce ji
> dostane celou. Přesně ten princip, co teď máme — červená jen tam, kde má něco
> říct.

---

## 5. `/events` — vertikální swiper

Tři sloupce: vlevo `UPCOMING EVENTS` seznam `[1]`–`[5]` s vlajkami, střed
artworky, vpravo datumy. Střed je aktivní (ostrý), okolí vybledlé.

Implementace je překvapivě jednoduchá — jeden vertikální Swiper a dva meta listy:

```js
const cardsSwiper = new Swiper('[data-events-swiper-vertical]', {
  direction: 'vertical', slidesPerView: 'auto', spaceBetween: 20,
  centeredSlides: true, loop: !isMobile, mousewheel: true,
  navigation: { nextEl: '.swiper-button-next', prevEl: '.swiper-button-prev' },
});
// sync: na slideChange přehoď .is-active na i === swiper.realIndex
// klik na meta položku → cardsSwiper.slideToLoop(i)
```

Indexy `[01]`, `[02]` … se dopisují v JS, ne v CMS.

---

## 6. `/label` — vinyl carousel ⭐

Horizontální carousel vinylů, aktivní je barevný a **rotuje při přehrávání**,
okolní jsou odbarvené. Rám s tagem, ovládáním (prev/play/next/**shuffle**),
`[01] jméno + datum`, odkazy `ARTIST INFO ↘` / `LISTEN ↘`. Dole
`‹ PREV 1 / 62 NEXT ›` (Swiper `pagination.type: 'fraction'`).

**Swiper:** `loop: true`, `centeredSlides: true`, `slideToClickedSlide: true`,
`mousewheel: { forceToAxis: false, releaseOnEdges: true, thresholdDelta: 20, thresholdTime: 300 }`,
breakpointy 1.5 → 1.2 → 4 slidy.

**Navíc kolečko mimo swiper** taky posouvá, s vlastním throttlingem 400 ms —
bere `deltaX` i `deltaY` podle toho, co je větší.

**Shuffle** — náhodný `slideToLoop`, ve `do/while` aby nevyšel aktuální slide.

**Audio** (modul 61679):
- `preload = 'none'`, src se doplní z `data-src` až při prvním play (`ensureAudioSrc`)
- **exkluzivní přehrávání** — `pauseAllAudio()` zastaví všechny ostatní
- `.vinyl-player.is-playing` → CSS rotace vinylu
- ikony `.icon-play` / `.icon-pause` se přepínají třídou `is-hidden`
- na `slideChange` se audio pauzuje a popupy zavřou

**Draggable pop-upy** — nejlepší nápad na webu. Popup se při initu **přesune
do `<body>`** a stane se z něj okno, které se dá odtáhnout kamkoliv:

```js
document.querySelectorAll('[data-draggable]').forEach(el => {
  // zapamatuj si zdrojovou kartu a index slidu
  document.body.appendChild(el);
});
Draggable.create('[data-draggable]', { bounds: '.main-wrapper', inertia: true });
```

Otevírá se jen z **aktivního** slidu (`.swiper-slide-active`), páruje se přes
`data-slide-index` ↔ `data-swiper-slide-index`.

---

## 7. Home — three.js globe

Sekce `.section_globe`: drátěný glóbus na bílé — šedé kontinenty, tenká
síť rovnoběžek/meridiánů, **červené čtverečky = města**. Canvas 996×996.

- 23 lokací jako `data-lat` / `data-lon` / `data-city` / `data-country`
- filtry `data-globe-filter="all|upcoming"`
- přepínač `data-view-switch="grid"` (na mřížkové zobrazení)
- vpravo nahoře **LOCAL TIME + TIME ZONE** dané lokace, vlevo dole LAT/LON readout
- vlevo velký Inter-bold titulek, dole justified mono odstavec

Globus reaguje na hover markerů (`data-hover-lat` / `data-hover-long`).

---

## 8. `/tickets`

Nejjednodušší stránka — mono tabulka: vlajka, název, datum, čas, místo,
`TICKETS ↘`. Žádná dekorace. Funguje to výborně, stojí to na typografii.

---

## 9. Co bych z toho vzal pro VRgD

**Rovnou:**
1. **Galerie = nekonečná draggable mřížka.** Jednoznačně nejlepší mechanika
   a na bílé bude vypadat skvěle. Umím to postavit — GSAP máme vendorovaný
   včetně `Observer` a `Draggable`.
2. **Draggable pop-upy** místo klasického lightboxu. Sedí to k tomu
   „raw archiv" pocitu, který máš rád na portfoliu.
3. **Events jako vertikální swiper** se synced meta sloupci — čisté a levné.
   Chce to Swiper (dovendoruju) nebo se to dá napsat i bez něj.
4. **Tickets/termíny jako mono tabulka** — pokud to bude relevantní.

**S rozmyslem:**
5. **Merch** — technicky to znamená externí platby (Shopify/Stripe/Snipcart),
   protože GitHub Pages je statika. Design vrstvu udělám, ale napojení chce
   tvůj účet u té služby. Než to bude reálné, můžu postavit „lookbook" bez
   košíku.
6. **Globe** — vypadá dobře, ale je to three.js a hodně práce. Dává smysl jen
   když bude VRgD reálně cestovat po městech.

**Nebral bych:** vinyl carousel (specifický pro label), jobs.
