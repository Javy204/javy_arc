/* ============================================================
   JAVY — STUDIO (v5 — POSTER)
   Squished Arial fit-to-width, scroll cesta (pinned+overlap),
   WORK = natáhlý index + reveal -> filmový pás.
   ============================================================ */

const $ = (s) => document.querySelector(s);
const journey = $("#journey");
const dotsNav = $("#dots");
const crumb = $("#crumb");
const counter = $("#counter");
const back = $("#back");
const stage = $("#stage");
const viewport = $("#viewport");
const reel = $("#reel");
const strip = $("#strip");
const stripBg = $("#stripBg");
const groupEl = $("#group");
const groupList = $("#groupList");
const groupReveal = $("#groupReveal");
const gLayers = [$("#gRevA"), $("#gRevB")];
let gLayer = 0, gAccum = 0;
const workIndex = $("#workIndex");
const workReveal = $("#workReveal");
const wrLayers = [$("#wrA"), $("#wrB")];
let wrIdx = 0;
const wpRow = $("#wpRow");
const workH = $("#workH");
const whTrack = $("#whTrack");
const workFilm = $("#workFilm");
let wfActs = [], vHint = null;
let whEls = [], whDist = 0, whTargetX = 0, whCurX = 0, whActive = -1;
const sWork = $("#sWork");
const workMeta = $("#workMeta");
const journalList = $("#journalList");
const journalEntry = $("#journalEntry");
const journalBack = $("#journalBack");
const light = $("#light");
const lightImg = $("#lightImg");
const lightId = $("#lightId");
const lightClose = $("#lightClose");

const pad2 = (n) => String(n).padStart(2, "0");
const clampN = (x, a, b) => Math.max(a, Math.min(b, x));

let JOURNAL = [];   // načte se z journal.json

let SETS = [];
let wiEls = [], wiSlots = [], workActive = -1;
let workMode = localStorage.getItem("javy-workmode") || "A";   // "A" film/overlap · "B" film/magazín · "C" horizontální pás
let SCENES = [], SCENE_NAMES = [];
let ITEMS = [], FRAMES = [], centers = [];
let targetX = 0, currentX = 0, minX = 0, maxX = 0;
let vw = window.innerWidth || document.documentElement.clientWidth;
let lightIndex = -1;

/* ---- data ---- */
async function loadData() {
  try {
    const data = await (await fetch("photos/manifest.json", { cache: "no-store" })).json();
    SETS = (data.sets || []).map((s) => {
      if (s.shoots) {
        return { ...s, isGroup: true, shoots: s.shoots.map((sh) => ({ ...sh, credit: s.credit || "", count: (sh.images || []).length })) };
      }
      return { ...s, images: s.images || [], count: (s.images || []).length };
    });
  } catch (e) { console.warn("manifest se nenačetl", e); SETS = []; }
  try {
    const jd = await (await fetch("journal.json", { cache: "no-store" })).json();
    JOURNAL = jd.entries || [];
  } catch (e) { console.warn("journal se nenačetl", e); JOURNAL = []; }
}

/* ---- přednačtení fotek ----
   preview = obrázek, který se ukáže hned (reveal ve WORK / ve skupině).
   Musí odpovídat indexu v setWorkActive / setGroupActive: min(2, len-1). */
function previewURL(imgs) { return imgs && imgs.length ? imgs[Math.min(2, imgs.length - 1)] : null; }
// náhled: cover zvolený v build.py (manifest), jinak fallback na 3. fotku
function coverOf(obj) { return (obj && obj.cover) || previewURL(obj && obj.images) || null; }

function collectPreviewURLs() {
  const out = [];
  SETS.forEach((s) => {
    if (s.isGroup) { const g = coverOf(s); if (g) out.push(g); s.shoots.forEach((sh) => { const u = coverOf(sh); if (u) out.push(u); }); }
    else { const u = coverOf(s); if (u) out.push(u); }
  });
  return [...new Set(out)];
}

function collectAllURLs() {
  const out = [];
  SETS.forEach((s) => {
    if (s.isGroup) s.shoots.forEach((sh) => (sh.images || []).forEach((u) => out.push(u)));
    else (s.images || []).forEach((u) => out.push(u));
  });
  return [...new Set(out)];
}

// přednačte pole URL, hlásí průběh; resolvne po dojetí (nebo po timeoutu)
function preloadImages(urls, onProgress, maxMs) {
  return new Promise((resolve) => {
    const total = urls.length;
    if (!total) { onProgress && onProgress(1, 0); resolve(); return; }
    let loaded = 0, finished = false;
    const finish = () => { if (finished) return; finished = true; resolve(); };
    const done = () => { loaded++; onProgress && onProgress(loaded, total); if (loaded >= total) finish(); };
    urls.forEach((u) => { const img = new Image(); img.onload = done; img.onerror = done; img.src = u; });
    if (maxMs) setTimeout(finish, maxMs);   // pojistka: nikdy nezasekni loader
  });
}

// na pozadí (po loaderu) dohraje zbytek fotek po dávkách, ať se neucpe síť
function warmInBackground(urls, batch) {
  let i = 0; const n = batch || 6;
  const next = () => {
    if (i >= urls.length) return;
    const slice = urls.slice(i, i + n); i += n;
    let left = slice.length;
    slice.forEach((u) => { const img = new Image(); img.onload = img.onerror = () => { if (--left === 0) setTimeout(next, 120); }; img.src = u; });
  };
  next();
}

/* ---- fit-to-width (squished/stretched přes šířku) ---- */
function fitText() {
  document.querySelectorAll(".fit, .wi, .wh-name-i, .wf-name-i").forEach((el) => {
    const parent = el.parentElement;
    const pw = parent.clientWidth;
    const tw = el.scrollWidth;     // layout šířka (transform ji neovlivní)
    if (tw > 0 && pw > 0) el.style.transform = `scaleX(${(pw / tw).toFixed(4)})`;
  });
}

/* ---- WORK: scrollovatelný index + sticky reveal ---- */
// telefon = jiný layout WORKu (fotky v přirozeném poměru, míň náhledů) — jedno místo pravdy
const PHONE_Q = window.matchMedia("(max-width: 720px)");
const isPhone = () => PHONE_Q.matches;
/* ============================================================
   LAYOUTY BĚHU FOTEK POD HEREM (přepínač L)
   „pics" = kolik fotek celkem (1. je hero), zbytek se skládá pod něj.
   Kolážové layouty se NEOŘEZÁVAJÍ: velikost se počítá z poměru stran
   (viz sizeCollagePh), překryv dělá záporný horní okraj a scroll je
   zase rozjíždí od sebe (rychlost `sp`), zaostřená fotka jde navrch.
   w = zlomek šířky sloupce (odtud se velikost počítá — jinak portréty
   vyjdou úzké), maxH = strop výšky ve zlomku okna, ov = překryv ve zlomku
   okna, x = 0 vlevo … 1 vpravo v rámci volného místa, sp = rychlost odjezdu.
   ============================================================ */
const LAYOUTS = {
  S: {                       // klidný sloupec, žádný překryv (původní chování)
    name: "SLOUPEC", collage: false, pics: { phone: 2, desk: 5 },
  },
  K: {                       // koláž: fotky bloudí do stran a nesymetricky se překrývají
    name: "KOLÁŽ", collage: true, pics: { phone: 4, desk: 5 },
    ph: (rnd, k, phone) => ({
      w:    (phone ? 0.62 : 0.34) + rnd(0) * (phone ? 0.26 : 0.20),
      maxH: phone ? 0.60 : 0.86,
      // bloudění místo střídání krajů: sousední fotky jsou blízko sebe → reálně se překryjí
      x:    0.5 + 0.5 * Math.sin(k * 2.3 + rnd(1) * 6.28),
      ov:   k === 0 ? 0 : (phone ? 0.06 : 0.20) + rnd(2) * (phone ? 0.08 : 0.16),
      sp:   (k % 2 ? 1 : -1) * ((phone ? 14 : 22) + rnd(3) * (phone ? 12 : 20)),
    }),
  },
  D: {                       // kaskáda: schodiště napříč, silnější překryv
    name: "KASKÁDA", collage: true, pics: { phone: 5, desk: 7 },
    ph: (rnd, k, phone) => ({
      w:    (phone ? 0.60 : 0.32) + rnd(0) * (phone ? 0.20 : 0.14),
      maxH: phone ? 0.56 : 0.80,
      x:    ((k * 0.34) % 1.2 > 1 ? 2 - (k * 0.34) % 1.2 : (k * 0.34) % 1.2),
      ov:   k === 0 ? 0 : (phone ? 0.12 : 0.28) + rnd(1) * 0.08,
      sp:   (phone ? -20 : -34) + k * (phone ? 12 : 20),
    }),
  },
  T: {                       // stoh: fotky skoro na sobě, scroll je rozevírá nejvíc
    name: "STOH", collage: true, pics: { phone: 5, desk: 7 },
    ph: (rnd, k, phone) => ({
      w:    (phone ? 0.70 : 0.40) + rnd(0) * (phone ? 0.20 : 0.18),
      maxH: phone ? 0.64 : 0.90,
      x:    0.5 + (k % 2 ? 1 : -1) * (0.10 + rnd(1) * 0.18),
      ov:   k === 0 ? 0 : (phone ? 0.20 : 0.38) + rnd(2) * 0.08,
      sp:   (k % 2 ? 1 : -1) * ((phone ? 22 : 38) + rnd(3) * (phone ? 10 : 18)),
    }),
  },
};
const LAYOUT_ORDER = ["S", "K", "D", "T"];
let wfLayout = LAYOUTS[new URLSearchParams(location.search).get("wl")] ? new URLSearchParams(location.search).get("wl")
             : (LAYOUTS[localStorage.getItem("javy-wflayout")] ? localStorage.getItem("javy-wflayout") : "K");
// stabilní pseudonáhoda: stejný akt + stejná fotka = vždy stejné rozložení (nepřeskakuje mezi rendery)
function seeded(a, k) {
  return (s) => { const x = Math.sin((a + 1) * 12.9898 + (k + 1) * 78.233 + (s + 1) * 37.719) * 43758.5453; return x - Math.floor(x); };
}
// fotky setu (u skupiny ber první shoot) + rovnoměrný výběr n snímků napříč shootem
function imagesOf(set) { return set.images || (set.shoots && set.shoots[0] && set.shoots[0].images) || []; }
function sampleImages(imgs, n) {
  if (imgs.length <= n) return imgs.slice();
  const out = [];
  for (let i = 0; i < n; i++) out.push(imgs[Math.round((i * (imgs.length - 1)) / (n - 1))]);
  return out;
}

function renderWorkIndex() {
  workIndex.innerHTML = ""; wiEls = []; wiSlots = [];
  SETS.forEach((set, i) => {
    const slot = document.createElement("div"); slot.className = "wi-slot";
    const w = document.createElement("div"); w.className = "wi"; w.textContent = set.title; w.dataset.i = i;
    w.addEventListener("mouseenter", () => setWorkActive(i));
    w.addEventListener("click", () => openShoot(i));
    slot.appendChild(w);
    // varianta A: řádek náhledů (místo rezervované vždy, plní se až při zaostření)
    const th = document.createElement("div"); th.className = "wi-thumbs";
    sampleImages(imagesOf(set), 5).forEach((src) => {
      const im = document.createElement("img");
      im.loading = "lazy"; im.alt = ""; im.src = src;
      th.appendChild(im);
    });
    slot.appendChild(th);
    workIndex.appendChild(slot); wiEls.push(w); wiSlots.push(slot);
  });
  workMeta.textContent = `${SETS.length} SETS · ${SETS.reduce((n, s) => n + (s.count || imagesOf(s).length), 0)} SHOTS`;
  renderWorkH();
  layoutWork();
}
/* ---- WORK vodorovně: alba jako panely, svislý scroll je posouvá do strany ---- */
function renderWorkH() {
  whTrack.innerHTML = ""; whEls = [];
  SETS.forEach((set, i) => {
    const imgs = imagesOf(set);
    const it = document.createElement("div"); it.className = "wh-item";
    const shots = set.count || imgs.length;
    it.innerHTML =
      `<div class="wh-frame"><img class="wh-ph" alt="" src="${coverOf(set) || imgs[0] || ""}"></div>` +
      `<div class="wh-name"><span class="wh-name-i">${set.title}</span></div>` +
      `<div class="wh-meta"><span>${pad2(i + 1)} / ${pad2(SETS.length)}</span><span>${shots} SHOTS${set.isGroup ? " · SKUPINA" : ""}</span></div>`;
    it.addEventListener("click", () => openShoot(i));
    whTrack.appendChild(it); whEls.push(it);
    // šířka panelu = poměr stran fotky × výška → fotka celá, nic oříznutého
    const img = it.querySelector(".wh-ph");
    const applyW = () => { sizeWhItem(it, img); layoutWork(); fitText(); };
    img.addEventListener("load", applyW);
    if (img.complete && img.naturalWidth) applyW();
  });
}
function sizeWhItem(it, img) {
  const H = 0.58 * (window.innerHeight || 860);
  const a = (img.naturalWidth && img.naturalHeight) ? img.naturalWidth / img.naturalHeight : 0.72;
  it.style.width = Math.round(H * a) + "px";
}
function layoutWork() {
  if (workMode !== "C") { sWork.style.height = "auto"; return; }   // film módy: výška z obsahu
  // svislá dráha = kolik je potřeba nascrollovat, aby pás projel celý do strany
  const vw = window.innerWidth || 1280;
  whEls.forEach((it) => sizeWhItem(it, it.querySelector(".wh-ph")));   // přepočet šířek (i po resize)
  // okraje tak, aby první i poslední panel mohly dojet přesně na střed
  if (whEls.length) {
    whTrack.style.paddingLeft = Math.max(0, vw / 2 - whEls[0].offsetWidth / 2) + "px";
    whTrack.style.paddingRight = Math.max(0, vw / 2 - whEls[whEls.length - 1].offsetWidth / 2) + "px";
  }
  whDist = Math.max(0, whTrack.scrollWidth - vw);
  sWork.style.height = (window.innerHeight + whDist) + "px";
  if (whEls.length) applyPanelDepth();
}
// mapuje pozici sekce ve svislém scrollu na posun pásu do strany (1:1, bez driftu)
function updateWorkH(vh) {
  if (!whEls.length) return;
  const r = sWork.getBoundingClientRect();
  const p = whDist > 0 ? clampN(-r.top / whDist, 0, 1) : 0;
  whTargetX = -p * whDist;
}
// aktivní = panel nejblíž středu obrazovky (počítá se i během dojíždění)
function updateWhActive() {
  const cx = (window.innerWidth || 1280) / 2;
  let best = -1, bd = Infinity;
  whEls.forEach((el, k) => {
    const b = el.getBoundingClientRect();
    const d = Math.abs(b.left + b.width / 2 - cx);
    if (d < bd) { bd = d; best = k; }
  });
  if (best >= 0 && best !== whActive) {
    whActive = best;
    whEls.forEach((el, k) => el.classList.toggle("active", k === best));
    // crumb přepiš jen když je WORK reálně na obraze (připnutý nahoře), ne na intru
    const pinned = sWork.getBoundingClientRect().top <= 1;
    if (pinned && stage.hidden && groupEl.hidden) crumb.textContent = `WORK / ${SETS[best].title.toUpperCase()}`;
  }
}
// hloubka: panel u středu velký, ke krajům menší; fotka uvnitř rámu parallaxuje
function applyPanelDepth() {
  const cx = (window.innerWidth || 1280) / 2;
  whEls.forEach((el) => {
    const b = el.getBoundingClientRect();
    const d = clampN((b.left + b.width / 2 - cx) / cx, -1.4, 1.4);  // -1 vlevo … +1 vpravo
    const t = Math.min(Math.abs(d), 1);
    const e = t * t * (3 - 2 * t);                    // smoothstep – měkký náběh
    const frame = el.firstElementChild;               // .wh-frame: střed velký (1.14), kraje malé (0.82)
    if (frame) frame.style.transform = `scale(${(1.14 - e * 0.32).toFixed(3)})`;
  });
}
function stepWorkH() {
  if (workMode !== "C" || !whEls.length) return;
  if (whCurX === whTargetX) { if (whActive < 0) { updateWhActive(); applyPanelDepth(); } return; }
  whCurX += (whTargetX - whCurX) * 0.16;
  if (Math.abs(whTargetX - whCurX) < 0.2) whCurX = whTargetX;
  whTrack.style.transform = `translate3d(${whCurX.toFixed(1)}px,0,0)`;
  updateWhActive();
  applyPanelDepth();
}
const arCache = {};
let revealAR = 0;   // poměr stran (š/v) aktivní fotky; 0 = zatím neznámé → panuj svisle
// plynulý doběh náhledové fotky (setrvačnost místo lineárního 1:1 sledování scrollu)
let revealTargetP = 0.5, revealCurP = 0.5, revealAxisY = true, revealSnap = true;
const REVEAL_EASE = 0.035;   // menší = větší odpor/pomalejší doběh
function setRevealImage(url) {
  if (!url) { revealAR = 0; return; }
  if (arCache[url]) { revealAR = arCache[url]; return; }
  revealAR = 0;
  const im = new Image();
  im.onload = () => { if (im.naturalHeight) { arCache[url] = im.naturalWidth / im.naturalHeight; revealAR = arCache[url]; } };
  im.src = url;
}
function setWorkActive(i) {
  if (i === workActive) return;
  workActive = i;
  const set = SETS[i];
  const cover = coverOf(set) || coverOf(set.shoots && set.shoots[0]) || "";
  setRevealImage(cover);
  // crossfade: novou fotku dej na druhou vrstvu a prolni (žádný tvrdý blik)
  wrIdx = 1 - wrIdx;
  const topL = wrLayers[wrIdx], otherL = wrLayers[1 - wrIdx];
  topL.style.backgroundImage = `url("${cover}")`;
  topL.classList.add("on"); otherL.classList.remove("on");
  workReveal.classList.add("on");
  revealSnap = true;   // pozici nové vrstvy nastav rovnou (fade ji odhalí až pak)
  wiEls.forEach((w, k) => w.classList.toggle("active", k === i));
  if (stage.hidden) crumb.textContent = `WORK / ${set.title.toUpperCase()}`;
}
// spočítej CÍLOVOU pozici projetí; samotný pohyb dojíždí plynule v step() (setrvačnost)
function panReveal(wr, vh) {
  let pitch = wr.height * 2;
  if (wiEls.length > 1) {
    const a = wiEls[0].getBoundingClientRect(), b = wiEls[1].getBoundingClientRect();
    const pp = Math.abs(b.top - a.top);
    if (pp > 4) pitch = pp;
  }
  const offset = (wr.top + wr.height / 2) - vh / 2;   // + pod středem, − nad středem
  let p = 0.5 - offset / pitch;                        // vstup zdola → 0 (vršek), střed → .5, odchod nahoru → 1 (spodek)
  p = Math.max(0, Math.min(1, p));
  revealTargetP = 0.08 + 0.84 * p;                     // mírně zúžený rozsah = klidnější, nenaráží na kraj
  const cr = workReveal.getBoundingClientRect();
  const contAR = cr.height ? cr.width / cr.height : 1;
  revealAxisY = !revealAR || revealAR < contAR;         // fotka užší než rám → přebývá výška → svisle
}
/* ============================================================
   WORK — SCROLL FILM (přepínač V)
   Každý shoot = akt ve svislém scrollu: hero full-bleed + jméno přes,
   pak editorial běh fotek. Parallax (typ vs obraz jinou rychlostí) + reveal.
   ============================================================ */
let wfPhone = null;    // pro jakou šířku je film aktuálně vyrenderovaný
let cPhs = [];         // kolážové fotky napříč všemi akty: {el, img, act, h, maxW, x, ov, sp}
function renderWorkFilm() {
  if (!workFilm) return;
  wfPhone = isPhone();
  const L = LAYOUTS[wfLayout] || LAYOUTS.K;
  workFilm.innerHTML = ""; wfActs = []; cPhs = [];
  SETS.forEach((set, i) => {
    const imgs = imagesOf(set);
    const pics = sampleImages(imgs, wfPhone ? L.pics.phone : L.pics.desk);
    const hero = pics[0] || coverOf(set) || "";
    const r = pics.slice(1);
    const shots = set.count || imgs.length;
    const act = document.createElement("section"); act.className = "act";
    let run = "";
    if (L.collage) {
      run = r.map((src, k) => `<div class="wf-ph cph" style="z-index:${k + 1}"><img alt="" src="${src}"></div>`).join("");
    } else {
      if (r[0]) run += `<div class="wf-ph wf-solo reveal"><img alt="" src="${r[0]}"></div>`;
      if (r[1] || r[2]) run += `<div class="wf-row">${r[1] ? `<div class="wf-ph reveal"><img alt="" src="${r[1]}"></div>` : ""}${r[2] ? `<div class="wf-ph reveal"><img alt="" src="${r[2]}"></div>` : ""}</div>`;
      if (r[3]) run += `<div class="wf-ph wf-tail reveal"><img alt="" src="${r[3]}"></div>`;
    }
    act.innerHTML =
      `<figure class="wf-hero reveal"><img alt="" src="${hero}"><figcaption class="wf-name"><span class="wf-name-i">${set.title}</span></figcaption></figure>` +
      `<div class="wf-run${L.collage ? " collage" : ""}">${run}</div>` +
      `<div class="wf-meta reveal">${pad2(i + 1)} / ${pad2(SETS.length)} · ${shots} SHOTS${set.isGroup ? " · SKUPINA" : ""} · OTEVŘÍT ↗</div>`;
    act.querySelectorAll(".wf-hero, .wf-ph, .wf-meta").forEach((el) => el.addEventListener("click", () => openShoot(i)));
    workFilm.appendChild(act); wfActs.push(act);
    if (L.collage) {
      act.querySelectorAll(".cph").forEach((el, k) => {
        const rec = Object.assign({ el, img: el.querySelector("img"), act }, L.ph(seeded(i, k), k, wfPhone));
        cPhs.push(rec);
        const apply = () => sizeCollagePh(rec);
        rec.img.addEventListener("load", apply);
        if (rec.img.complete && rec.img.naturalWidth) apply();
      });
    }
  });
}
/* velikost kolážové fotky: nikdy neořezávat — z poměru stran dopočítej šířku,
   a když se nevejde do sloupce, zmenši výšku (ne ořízni). */
function sizeCollagePh(rec) {
  const par = rec.el.parentElement; if (!par) return;
  // POZOR: clientWidth je včetně paddingu, ale margin-left se počítá od obsahové
  // hrany — bez odečtení paddingu fotky přetečou vpravo a telefon jde do stran.
  const cs = getComputedStyle(par);
  const cw = par.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
  const vh = window.innerHeight || 860;
  if (cw <= 0) return;
  const im = rec.img;
  const ar = (im.naturalWidth && im.naturalHeight) ? im.naturalWidth / im.naturalHeight : 0.72;
  let w = rec.w * cw;                       // velikost se řídí šířkou sloupce…
  if (w / ar > rec.maxH * vh) w = rec.maxH * vh * ar;   // …a strop výšky hlídá, ať se vejde do okna
  rec.el.style.width = Math.round(w) + "px";
  rec.el.style.marginLeft = Math.round(rec.x * Math.max(0, cw - w)) + "px";
  rec.el.style.marginTop = rec.ov ? Math.round(-rec.ov * vh) + "px" : "0px";
}
function sizeCollage() { cPhs.forEach(sizeCollagePh); }
// reveal při vstupu do obrazu + parallax (typ a obraz jedou různou rychlostí)
function updateFilm(vh) {
  if (!workFilm || !wfActs.length) return;
  workFilm.querySelectorAll(".reveal").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.82 && r.bottom > vh * 0.05) el.classList.add("in");
  });
  const phone = isPhone();
  workFilm.querySelectorAll(".wf-hero").forEach((h) => {
    const r = h.getBoundingClientRect();
    const prog = (r.top + r.height / 2 - vh / 2) / vh;   // -1 … +1
    const img = h.querySelector("img"); if (img) img.style.transform = phone ? "" : `translateY(${(prog * -7).toFixed(1)}%)`;
    const name = h.querySelector(".wf-name"); if (name) name.style.transform = `translateY(${(prog * (phone ? -18 : -46)).toFixed(0)}px)`;
  });
  updateCollage(vh);
}
/* koláž: fotky se při scrollu rozjíždějí od sebe (různá rychlost) a ta,
   která je nejblíž středu obrazovky, jde navrch — takže je vždycky celá vidět */
function updateCollage(vh) {
  if (!cPhs.length) return;
  let best = null, bd = Infinity;
  for (const rec of cPhs) {
    const r = rec.el.getBoundingClientRect();
    if (r.bottom < -vh * 0.5 || r.top > vh * 1.5) { rec.el.classList.remove("front", "near"); continue; }
    const prog = (r.top + r.height / 2 - vh / 2) / vh;          // -1 … +1
    rec.el.style.transform = `translateY(${(prog * rec.sp).toFixed(1)}px)`;
    const d = Math.abs(prog);
    rec.el.classList.toggle("near", d < 0.75);
    if (d < bd) { bd = d; best = rec; }
  }
  for (const rec of cPhs) rec.el.classList.toggle("front", rec === best && bd < 0.75);
}
function applyWorkMode() {
  const film = workMode === "A" || workMode === "B";
  document.body.classList.toggle("wf-film", film);
  document.body.classList.toggle("wf-A", workMode === "A");
  document.body.classList.toggle("wf-B", workMode === "B");
  if (film) { sWork.style.height = "auto"; }
  else { layoutWork(); }
  if (vHint) vHint.textContent = `V — ${workMode === "A" ? "FILM / OVERLAP" : workMode === "B" ? "FILM / MAGAZÍN" : "HORIZONTÁLNĚ"}   ·   L — ${(LAYOUTS[wfLayout] || LAYOUTS.K).name}`;
  fitText();
  requestAnimationFrame ? setTimeout(() => { fitText(); updateJourney(); }, 30) : updateJourney();
}
function cycleWorkLayout() {
  const i = LAYOUT_ORDER.indexOf(wfLayout);
  wfLayout = LAYOUT_ORDER[(i + 1) % LAYOUT_ORDER.length];
  localStorage.setItem("javy-wflayout", wfLayout);
  renderWorkFilm();
  applyWorkMode();
  setTimeout(() => { sizeCollage(); updateFilm(window.innerHeight); }, 40);
}
function cycleWorkMode() {
  workMode = workMode === "A" ? "B" : workMode === "B" ? "C" : "A";
  localStorage.setItem("javy-workmode", workMode);
  applyWorkMode();
}

// plynulý doběh pozice náhledu (volá se každý tick z step()) — už NEPOUŽITO (nahrazeno filmem)
function stepReveal() {
  return;
  if (journey.hidden || !stage.hidden || !groupEl.hidden) return;
  if (!workReveal.classList.contains("on")) return;
  if (revealSnap) { revealCurP = revealTargetP; revealSnap = false; }
  else revealCurP += (revealTargetP - revealCurP) * REVEAL_EASE;
  const pos = (revealCurP * 100).toFixed(2) + "%";
  wrLayers[wrIdx].style.backgroundPosition = revealAxisY ? `50% ${pos}` : `${pos} 50%`;
}
function updateWorkFocus(vh) {
  const r = sWork.getBoundingClientRect();
  if (r.bottom < vh * 0.15 || r.top > vh * 0.85) return;   // WORK mimo obraz
  let best = -1, bd = Infinity, bestRect = null;
  wiEls.forEach((w, k) => {
    const wr = w.getBoundingClientRect();
    const d = Math.abs((wr.top + wr.height / 2) - vh / 2);
    if (d < bd) { bd = d; best = k; bestRect = wr; }
  });
  if (best >= 0) setWorkActive(best);
}

/* ---- journal ---- */
function renderJournal() {
  journalList.innerHTML = "";
  JOURNAL.forEach((e, i) => {
    const li = document.createElement("li");
    li.innerHTML = `<span class="jl-date">${e.date}</span><span class="jl-title">${e.title}</span><span class="jl-arrow">↗</span>`;
    li.addEventListener("click", () => openEntry(i));
    journalList.appendChild(li);
  });
}
function openEntry(i) {
  const e = JOURNAL[i];
  $("#jeDate").textContent = e.date;
  $("#jeTitle").textContent = e.title;
  const paras = Array.isArray(e.body) ? e.body : String(e.body || "").split(/\n\n+/);
  $("#jeBody").innerHTML = paras.map((p) => `<p>${p}</p>`).join("");
  journalEntry.hidden = false; back.hidden = false;
}
journalBack.addEventListener("click", () => { journalEntry.hidden = true; if (stage.hidden) back.hidden = true; });

/* ---- dots ---- */
function buildDots() {
  SCENES = [...journey.querySelectorAll(".scene")];
  SCENE_NAMES = SCENES.map((s) => s.dataset.name);
  dotsNav.innerHTML = "";
  SCENES.forEach((s, i) => {
    const b = document.createElement("button");
    b.dataset.label = s.dataset.name;
    b.addEventListener("click", () => journey.scrollTo({ top: i * journey.clientHeight, behavior: "smooth" }));
    dotsNav.appendChild(b);
  });
}

/* ---- scroll parallax + zoom-cover ---- */
function updateJourney() {
  const vh = journey.clientHeight || 1;
  const rects = SCENES.map((s) => s.getBoundingClientRect());
  let centerIdx = 0;
  for (let i = 0; i < SCENES.length; i++) {
    const scene = SCENES[i];
    const r = rects[i];
    const enterP = i === 0 ? 1 : clampN(1 - r.top / vh, 0, 1);
    const coverP = (i < SCENES.length - 1) ? clampN(1 - rects[i + 1].top / vh, 0, 1) : 0;
    const inner = scene.querySelector(".scene-inner");
    if (inner) {
      inner.style.transform = `scale(${(1 - coverP * 0.07).toFixed(4)}) translateY(${(-coverP * 30).toFixed(1)}px)`;
      inner.style.opacity = ((0.32 + 0.68 * enterP) * (1 - coverP * 0.6)).toFixed(3);
    }
    scene.querySelectorAll(".par").forEach((el) => {
      const rise = +(el.dataset.rise || 0), exit = +(el.dataset.exit || rise * 1.4);
      el.style.transform = `translate3d(0, ${((1 - enterP) * rise - coverP * exit).toFixed(1)}px, 0)`;
    });
    if (r.top <= vh / 2 && r.bottom >= vh / 2) centerIdx = i;
  }
  [...dotsNav.children].forEach((d, i) => d.classList.toggle("on", i === centerIdx));
  if (stage.hidden && SCENES[centerIdx] && SCENES[centerIdx].id !== "sWork")
    crumb.textContent = (SCENE_NAMES[centerIdx] || "35mm").toUpperCase();
  if (workMode === "C") updateWorkH(vh); else updateFilm(vh);
}

/* ---- WORK -> pás ---- */
let currentGroup = null;
let coverEls = [], gFocus = -1, zoomOutAccum = 0;
let drum = null, itemEls = [], gTargetAngle = 0, gCurrentAngle = 0, gSnapT = 0;
const STEP = 52, DRUMR = "42vh";

function openShoot(idx) {
  const set = SETS[idx];
  if (set.isGroup) { openGroup(set); return; }
  currentGroup = null;
  buildStrip(set); enterStrip();
}
function enterStrip() {
  journey.hidden = true; dotsNav.hidden = true; groupEl.hidden = true;
  stage.hidden = false; back.hidden = false;
  measure();
  const startX = clamp(vw / 2 - (centers[0] || 0));
  currentX = startX - 720; targetX = startX;
  reel.classList.remove("unrolling"); void reel.offsetWidth; reel.classList.add("unrolling");
  setTimeout(() => { measure(); targetX = clamp(vw / 2 - (centers[0] || 0)); }, 140);
}
function backFromStrip() {
  stage.hidden = true;
  if (currentGroup) openGroup(currentGroup);
  else { journey.hidden = false; dotsNav.hidden = false; back.hidden = true; updateJourney(); }
}

/* ---- GROUP: výběr shootů = velká slova + reveal (jako WORK) ---- */
function openGroup(set) {
  currentGroup = set;
  journey.hidden = true; dotsNav.hidden = true; stage.hidden = true;
  groupEl.hidden = false; back.hidden = false;
  renderGroupIndex(set.shoots);
  gFocus = -1; gCurrentAngle = 0; gTargetAngle = 0;
  gGo(0);
}
function renderGroupIndex(shoots) {
  groupList.innerHTML = ""; coverEls = []; itemEls = [];
  drum = document.createElement("div");
  drum.className = "drum";
  shoots.forEach((sh, i) => {
    const item = document.createElement("div");
    item.className = "drum-item";
    const w = document.createElement("div");
    w.className = "dw";
    w.textContent = sh.title;
    item.appendChild(w);
    item.addEventListener("click", () => (i === gFocus ? coverZoom(i) : gGo(i)));
    drum.appendChild(item);
    itemEls.push(item);
    coverEls.push(w);
  });
  groupList.appendChild(drum);
  positionDrum();
}
// rozmístí slova po plášti válce (další shoot je vždy níž, „přijede" zdola)
function positionDrum() {
  itemEls.forEach((it, i) => {
    it.style.transform = `translate(-50%, -50%) rotateX(${-i * STEP}deg) translateZ(${DRUMR})`;
  });
}
// otoč buben na daný shoot
function gGo(i) {
  i = Math.max(0, Math.min(coverEls.length - 1, i));
  gTargetAngle = i * STEP;
  setGroupActive(i);
}
function gMove(d) { gGo(gFocus + d); }
function setGroupActive(i) {
  if (!currentGroup || i < 0 || i === gFocus) return;
  gFocus = i;
  const sh = currentGroup.shoots[i];
  // crossfade fotky za textem
  gLayer = 1 - gLayer;
  const top = gLayers[gLayer], other = gLayers[1 - gLayer];
  top.style.backgroundImage = `url("${coverOf(sh) || ""}")`;
  top.classList.add("on");
  other.classList.remove("on");
  itemEls.forEach((it, k) => it.classList.toggle("active", k === i));
  crumb.textContent = `${currentGroup.title.toUpperCase()} / ${sh.title.toUpperCase()}`;
  counter.textContent = `${pad2(i + 1)} / ${pad2(coverEls.length)}`;
}
// plynulé otáčení válce + hloubka (mizení, rozostření, zmenšení dozadu)
function stepDrum() {
  if (!itemEls.length || !drum) return;
  gCurrentAngle += (gTargetAngle - gCurrentAngle) * 0.12;
  drum.style.transform = `rotateX(${gCurrentAngle.toFixed(2)}deg)`;
  itemEls.forEach((it, i) => {
    const c = Math.cos((gCurrentAngle - i * STEP) * Math.PI / 180);
    const cl = Math.max(0, c);
    it.style.opacity = (cl * cl).toFixed(3);
    it.style.filter = `blur(${((1 - cl) * 2.4).toFixed(2)}px)`;
    it.firstChild.style.transform = `scale(${(0.8 + 0.2 * cl).toFixed(3)})`;
  });
  // fotku/crumb přepni podle nejbližšího shootu (i během plynulého scrollu)
  const near = Math.max(0, Math.min(coverEls.length - 1, Math.round(gCurrentAngle / STEP)));
  if (near !== gFocus) setGroupActive(near);
}
function coverZoom(i) {
  if (i < 0 || !currentGroup) return;
  buildStrip(currentGroup.shoots[i]);
  enterStrip();
}
function backFromGroup() {
  groupEl.hidden = true; journey.hidden = false; dotsNav.hidden = false; back.hidden = true; currentGroup = null; updateJourney();
}
// scroll (nahoru/dolů i do strany) přepíná mezi shooty s crossfade
groupEl.addEventListener("wheel", (e) => {
  if (groupEl.hidden) return;
  e.preventDefault();
  const d = (Math.abs(e.deltaY) >= Math.abs(e.deltaX)) ? e.deltaY : e.deltaX;
  const maxA = (coverEls.length - 1) * STEP;
  gTargetAngle = Math.max(0, Math.min(maxA, gTargetAngle + d * 0.32));
  // po zastavení scrollu dojeď na nejbližší shoot
  clearTimeout(gSnapT);
  gSnapT = setTimeout(() => {
    const i = Math.max(0, Math.min(coverEls.length - 1, Math.round(gTargetAngle / STEP)));
    gTargetAngle = i * STEP;
  }, 130);
}, { passive: false });

back.addEventListener("click", () => {
  if (!light.hidden) { closeLight(); return; }
  if (!journalEntry.hidden) { journalEntry.hidden = true; if (stage.hidden && groupEl.hidden) back.hidden = true; return; }
  if (!stage.hidden) { backFromStrip(); return; }
  if (!groupEl.hidden) { backFromGroup(); return; }
});

/* ---- build strip ---- */
function buildStrip(set) {
  strip.innerHTML = ""; ITEMS = []; FRAMES = [];
  stripBg.textContent = set.title;   // parallax název za fotkami
  for (let i = 0; i < set.count; i++) {
    const f = document.createElement("div");
    f.className = "frame"; f.style.minWidth = "26vh";
    f.innerHTML = `<img ${i < 10 ? "" : 'loading="lazy"'} src="${set.images[i]}" alt="${set.title} ${pad2(i + 1)}" /><span class="num">${pad2(i + 1)}</span><span class="dot"></span>`;
    strip.appendChild(f);
    const item = { type: "frame", set, i, full: set.images[i], el: f, global: i + 1, total: set.count };
    ITEMS.push(item); FRAMES.push(item);
    const fi = FRAMES.length - 1;
    f.addEventListener("click", () => { if (!dragMoved) openLight(fi); });
    f.querySelector("img").addEventListener("load", scheduleMeasure);
  }
}
let measureQueued = false;
function scheduleMeasure() { if (measureQueued) return; measureQueued = true; setTimeout(() => { measureQueued = false; measure(); }, 30); }
function measure() {
  vw = window.innerWidth || document.documentElement.clientWidth;
  centers = ITEMS.map((it) => it.el.offsetLeft + it.el.offsetWidth / 2);
  maxX = vw / 2 - (centers[0] || 0);
  minX = vw / 2 - (centers[centers.length - 1] || 0);
  if (minX > maxX) minX = maxX;
  targetX = clamp(targetX); currentX = clamp(currentX);
}
function clamp(x) { return Math.max(minX, Math.min(maxX, x)); }

/* jemný snap na nejbližší snímek po zastavení */
let snapTimer = null;
function scheduleSnap() { if (snapTimer) clearTimeout(snapTimer); snapTimer = setTimeout(snapToNearest, 360); }
function snapToNearest() {
  if (stage.hidden || !ITEMS.length || dragging) return;
  const screenC = vw / 2 - currentX;
  let best = -1, bd = Infinity;
  for (let k = 0; k < centers.length; k++) { const d = Math.abs(centers[k] - screenC); if (d < bd) { bd = d; best = k; } }
  if (best >= 0) targetX = clamp(vw / 2 - centers[best]);
}

/* ---- strip input ---- */
viewport.addEventListener("wheel", (e) => {
  if (stage.hidden) return;
  e.preventDefault();
  let d = e.deltaY, dx = e.deltaX;
  if (e.deltaMode === 1) { d *= 16; dx *= 16; } else if (e.deltaMode === 2) { d *= window.innerHeight; }
  // ve skupině: scroll nahoru na začátku pásu = zoom zpět na přehled
  if (currentGroup && targetX >= maxX - 1 && d < 0) {
    zoomOutAccum += -d;
    if (zoomOutAccum > 140) { zoomOutAccum = 0; backFromStrip(); }
    return;
  }
  zoomOutAccum = 0;
  targetX = clamp(targetX - (d + dx) * 1.15);
  scheduleSnap();
}, { passive: false });
let dragging = false, dragStartX = 0, dragStartTarget = 0, dragMoved = false, lastDX = 0, vel = 0;
viewport.addEventListener("pointerdown", (e) => { if (stage.hidden) return; dragging = true; dragMoved = false; dragStartX = e.clientX; dragStartTarget = targetX; vel = 0; lastDX = 0; viewport.setPointerCapture(e.pointerId); });
viewport.addEventListener("pointermove", (e) => { if (!dragging) return; const dx = e.clientX - dragStartX; if (Math.abs(dx) > 4) dragMoved = true; vel = dx - lastDX; lastDX = dx; targetX = clamp(dragStartTarget + dx); });
function endDrag() { if (!dragging) return; dragging = false; targetX = clamp(targetX + vel * 6); scheduleSnap(); }
viewport.addEventListener("pointerup", endDrag);
viewport.addEventListener("pointercancel", endDrag);

document.addEventListener("keydown", (e) => {
  if ((e.key === "v" || e.key === "V") && light.hidden && stage.hidden && groupEl.hidden && journalEntry.hidden) { cycleWorkMode(); return; }
  if ((e.key === "l" || e.key === "L") && light.hidden && stage.hidden && groupEl.hidden && journalEntry.hidden) { cycleWorkLayout(); return; }
  if (!light.hidden) { if (e.key === "Escape") closeLight(); else if (e.key === "ArrowRight") stepLight(1); else if (e.key === "ArrowLeft") stepLight(-1); return; }
  if (!journalEntry.hidden) { if (e.key === "Escape") { journalEntry.hidden = true; if (stage.hidden && groupEl.hidden) back.hidden = true; } return; }
  if (!groupEl.hidden) {
    if (e.key === "Escape") backFromGroup();
    else if (e.key === "ArrowRight") gMove(1);
    else if (e.key === "ArrowLeft") gMove(-1);
    else if (e.key === "ArrowDown" || e.key === "Enter") coverZoom(gFocus);
    return;
  }
  if (!stage.hidden) {
    const sp = Math.min(window.innerWidth * 0.5, 520);
    if (e.key === "Escape") backFromStrip();
    else if (e.key === "ArrowRight" || e.key === "ArrowDown") { e.preventDefault(); targetX = clamp(targetX - sp); }
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") { e.preventDefault(); targetX = clamp(targetX + sp); }
  }
});

/* ---- strip render loop ---- */
let curNearest = -1;
function step() {
  stepWorkH();
  if (!groupEl.hidden) { stepDrum(); return; }
  if (stage.hidden || !ITEMS.length) return;
  vw = window.innerWidth || document.documentElement.clientWidth;
  currentX += (targetX - currentX) * 0.18;
  if (Math.abs(targetX - currentX) < 0.1) currentX = targetX;
  reel.style.transform = `translate3d(${currentX}px,0,0)`;
  stripBg.style.transform = `translate(${(currentX * 0.4).toFixed(1)}px, -50%)`;   // type-parallax (pomaleji)
  const screenC = vw / 2 - currentX;
  let nearest = -1, nd = Infinity;
  for (let k = 0; k < ITEMS.length; k++) {
    const dist = Math.abs(centers[k] - screenC);
    if (dist < nd) { nd = dist; nearest = k; }
    if (dist < vw * 0.9) {
      const norm = Math.min(dist / (vw * 0.55), 1);
      ITEMS[k].el.style.transform = `translateY(${norm * 22}px) scale(${1 - norm * 0.16})`;
      ITEMS[k].el.style.opacity = (1 - norm * 0.55).toFixed(3);
    }
  }
  if (nearest !== curNearest && nearest >= 0) {
    curNearest = nearest;
    ITEMS.forEach((it) => it.el.classList.remove("focus"));
    const it = ITEMS[nearest];
    it.el.classList.add("focus");
    crumb.textContent = `${it.set.title.toUpperCase()} · SCROLL →`;
    counter.textContent = it.type === "frame" ? `${pad2(it.global)} / ${pad2(it.total)}` : `— ${it.set.type} —`;
  }
}

/* ---- lightbox ---- */
function openLight(fi) { lightIndex = fi; paintLight(); light.hidden = false; }
function paintLight() { const it = FRAMES[lightIndex]; lightImg.src = it.full; const cr = (it.set.credit || "").toUpperCase(); lightId.textContent = `${it.set.title.toUpperCase()} · ${pad2(it.i + 1)}/${pad2(it.set.count)}${cr ? " · " + cr : ""}`; }
function stepLight(d) { lightIndex = (lightIndex + d + FRAMES.length) % FRAMES.length; paintLight(); }
function closeLight() { light.hidden = true; }
lightClose.addEventListener("click", closeLight);
lightImg.addEventListener("click", () => stepLight(1));

/* ---- loader: ultra minimal (progress linka) ---- */
function initLoader() {
  const loader = $("#loader"), fill = $("#barFill"), pct = $("#loadPct");
  if (!loader) return { set() {}, finish() {} };
  let shown = 0, target = 0, done = false, hidden = false, tick = null;
  function render() { fill.style.width = shown.toFixed(1) + "%"; if (pct) pct.textContent = String(Math.floor(shown)).padStart(3, "0"); }
  function hide() {
    if (hidden) return; hidden = true; if (tick) clearInterval(tick);
    setTimeout(() => { loader.classList.add("done"); setTimeout(() => loader.remove(), 480); }, 140);
  }
  tick = setInterval(() => {
    // zobrazený progres plynule dojíždí ke skutečnému (target)
    shown += (Math.max(shown, target) - shown) * 0.14;
    if (shown > 99.4 && done) shown = 100;
    render();
    if (done && shown >= 100) hide();
  }, 30);
  render();
  const api = {
    set(p) { target = Math.max(target, Math.min(99, p)); },      // reálný průběh (0–99)
    finish() { if (done) return; done = true; target = 100; },   // hotovo → dojed na 100
  };
  loader.addEventListener("click", () => api.finish());
  document.addEventListener("keydown", (e) => { if (!done && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); api.finish(); } });
  return api;
}

/* ---- go ---- */
const loader = initLoader();
journey.addEventListener("scroll", updateJourney, { passive: true });
window.addEventListener("resize", () => { if (wfPhone !== null && wfPhone !== isPhone()) renderWorkFilm(); sizeCollage(); updateFilm(window.innerHeight); fitText(); layoutWork(); if (!groupEl.hidden) positionDrum(); else if (!stage.hidden) measure(); else updateJourney(); });
(async () => {
  loader.set(4);
  await loadData();                       // manifest + journal
  loader.set(12);
  renderWorkIndex();
  renderWorkFilm();
  renderJournal();
  buildDots();
  // dočasný přepínač variant WORK (na porovnání) — klávesa V
  vHint = document.createElement("div");
  vHint.style.cssText = "position:fixed;left:14px;bottom:12px;z-index:60;font:700 10px/1 Arial,sans-serif;letter-spacing:.14em;color:#888;mix-blend-mode:difference;pointer-events:none";
  document.body.appendChild(vHint);
  applyWorkMode();
  fitText();
  updateJourney();
  setTimeout(fitText, 120);   // po dosednutí fontů
  setInterval(step, 16);

  // využij čas loaderu: přednačti VŠECHNY preview fotky (progres = reálný postup)
  const previews = collectPreviewURLs();
  await preloadImages(previews, (n, total) => loader.set(12 + (total ? (n / total) * 88 : 88)), 9000);
  loader.finish();

  // po loaderu potichu dohraj celé pásy fotek → otevření shootu je pak okamžité
  const rest = collectAllURLs().filter((u) => !previews.includes(u));
  warmInBackground(rest);
})();
