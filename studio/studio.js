/* ============================================================
   JAVY — STUDIO (nová podstránka)
   Mechanika podle lokasasmita.com:
   · měkký setrvačný scroll (jako Lenis) — kolečko neposouvá skokem,
     ale míří na cíl a dojíždí lerpem; fixed/sticky prvky drží
   · preloader s počítadlem 000→100 a černým setřením
   · index prací = číslo · sloupec náhledů · pevná legenda · velký náhled
   · přepnutí na detail a zpět jde přes stejné černé setření
   ŽELEZNÉ PRAVIDLO: fotky se nikdy neořezávají (viz CSS, všude
   přirozený poměr nebo scale-down).
   ============================================================ */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad2 = (n) => String(n).padStart(2, "0");

const rowsEl = $("#rows"), legendEl = $("#legend"), descEl = $("#panelDesc");
const prevA = $("#prevA"), prevB = $("#prevB");
const indexEl = $("#index"), shootEl = $("#shoot");

let SETS = [], rows = [], active = -1, prevTop = true;

/* ---------- data ---------- */
async function boot() {
  const pre = preloader();
  try {
    const res = await fetch("../photos/manifest.json", { cache: "no-cache" });
    const data = await res.json();
    SETS = (data.sets || []).map((s) => ({
      id: s.id,
      title: s.title,
      images: (s.images || (s.shoots && s.shoots[0] && s.shoots[0].images) || []).map((p) => "../" + p),
      cover: s.cover ? "../" + s.cover : null,
    }));
  } catch (e) {
    SETS = [];
  }
  render();
  pre.finish();
}

/* ---------- preloader: počítadlo + černé setření ---------- */
function preloader() {
  const el = $("#pre"), count = $("#preCount");
  let n = 0, done = false;
  const t = setInterval(() => {
    n = Math.min(100, n + Math.ceil(Math.random() * 7));
    count.textContent = pad2(n).padStart(3, "0");
    if (n >= 100) clearInterval(t);
  }, 55);
  return {
    finish() {
      if (done) return; done = true;
      clearInterval(t);
      // data jsou tu → počítadlo se rychle dopočítá do 100 a teprve pak setření
      const run = setInterval(() => {
        n = Math.min(100, n + 6);
        count.textContent = String(n).padStart(3, "0");
        if (n < 100) return;
        clearInterval(run);
        el.classList.add("go");                            // černá zajede zdola
        setTimeout(() => el.classList.add("done"), 640);   // …a odjede nahoru
        setTimeout(() => { el.classList.add("gone"); reveal(); }, 1400);
      }, 18);
    },
  };
}
/* stejné setření se používá i při přepnutí index ⇄ detail */
function wipe(swap) {
  const el = $("#pre");
  el.classList.remove("gone", "done");
  el.classList.add("go");
  setTimeout(() => { swap(); el.classList.add("done"); }, 640);
  setTimeout(() => { el.classList.add("gone"); el.classList.remove("go", "done"); reveal(); }, 1400);
}

/* ---------- index prací ---------- */
function render() {
  rowsEl.innerHTML = ""; rows = [];
  SETS.forEach((set, i) => {
    const row = document.createElement("section"); row.className = "row";
    const thumbs = pick(set.images, 3);
    row.innerHTML =
      `<div class="row-head"><div class="row-num">${pad2(i + 1)}</div><div class="row-name">${set.title}</div></div>` +
      `<div class="row-thumbs">` +
        thumbs.map((src, k) =>
          `<figure class="th" data-src="${src}"><img alt="" loading="lazy" src="${src}">` +
          `<figcaption class="th-cap">${set.title} — ${pad2(k + 1)}</figcaption></figure>`).join("") +
      `</div>`;
    row.addEventListener("click", () => openShoot(i));
    rowsEl.appendChild(row);
    const ths = $$(".th", row);
    ths.forEach((t) => t.addEventListener("mouseenter", () => showPreview(t.dataset.src)));
    rows.push({ el: row, set, thumbs: ths });
  });

  legendEl.innerHTML = SETS.map((s, i) => `<li data-i="${i}">${s.title}</li>`).join("");
  $$("#legend li").forEach((li) => {
    li.addEventListener("mouseenter", () => setActive(+li.dataset.i, true));
    li.addEventListener("click", () => openShoot(+li.dataset.i));
  });
  $("#ftCount").textContent = `${pad2(SETS.length)} SETŮ · ${SETS.reduce((n, s) => n + s.images.length, 0)} SNÍMKŮ`;
  onScroll();
}
function pick(arr, n) {
  if (arr.length <= n) return arr.slice();
  return Array.from({ length: n }, (_, i) => arr[Math.round((i * (arr.length - 1)) / (n - 1))]);
}

function setActive(i, fromLegend) {
  if (i === active) return;
  active = i;
  $$("#legend li").forEach((li, k) => li.classList.toggle("on", k === i));
  rows.forEach((r, k) => r.el.classList.toggle("on", k === i));
  const s = SETS[i]; if (!s) return;
  descEl.innerHTML = `${s.title}<span>${pad2(i + 1)} / ${pad2(SETS.length)} · ${s.images.length} SNÍMKŮ</span>`;
  showPreview(s.cover || s.images[0]);
}
/* velký náhled: dvě vrstvy, ať se fotky prolnou a neblikne to */
function showPreview(src) {
  if (!src) return;
  const on = prevTop ? prevB : prevA, off = prevTop ? prevA : prevB;
  if (on.src.endsWith(encodeURI(src.replace("../", "")))) return;
  on.src = src;
  on.classList.add("on"); off.classList.remove("on");
  prevTop = !prevTop;
}

/* ---------- detail shootu ---------- */
function openShoot(i) {
  const s = SETS[i]; if (!s) return;
  wipe(() => {
    $("#shootTitle").textContent = s.title;
    $("#shootMeta").innerHTML =
      `<div><dt>shoot</dt><dd>${pad2(i + 1)} / ${pad2(SETS.length)}</dd></div>` +
      `<div><dt>snímků</dt><dd>${s.images.length}</dd></div>` +
      `<div><dt>studio</dt><dd>javy</dd></div>` +
      `<div><dt>místo</dt><dd>praha</dd></div>`;
    $("#shootPhotos").innerHTML = s.images.map((src, k) =>
      `<figure class="sp"><img alt="" loading="lazy" src="${src}">` +
      `<figcaption>${pad2(k + 1)} / ${pad2(s.images.length)}</figcaption></figure>`).join("");
    indexEl.hidden = true; shootEl.hidden = false;
    scrollTo0();
  });
}
function backToIndex() {
  wipe(() => { shootEl.hidden = true; indexEl.hidden = false; scrollTo0(); });
}
$$("[data-go='index']").forEach((b) => b.addEventListener("click", (e) => { e.preventDefault(); if (!shootEl.hidden) backToIndex(); }));

/* ---------- měkký setrvačný scroll (chování jako Lenis) ---------- */
const soft = { target: 0, current: 0, on: matchMedia("(pointer: fine)").matches };
function scrollTo0() { soft.target = soft.current = 0; window.scrollTo(0, 0); }
if (soft.on) {
  addEventListener("wheel", (e) => {
    e.preventDefault();
    const max = document.documentElement.scrollHeight - innerHeight;
    soft.target = Math.max(0, Math.min(max, soft.target + e.deltaY));
  }, { passive: false });
  addEventListener("resize", () => { soft.target = soft.current = window.scrollY; });
}
let softRunning = false;
function frame() {
  if (soft.on) {
    if (Math.abs(soft.target - soft.current) > 0.5) {
      softRunning = true;
      soft.current += (soft.target - soft.current) * 0.09;   // dojezd = ten „měkký" pocit
      window.scrollTo(0, soft.current);
    } else {
      // v klidu se drž skutečné pozice — jinak by smyčka přebíjela scrollbar,
      // klávesy i programové skoky (a stránka by se nehnula)
      softRunning = false;
      soft.current = soft.target = window.scrollY;
    }
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

/* ---------- odkrývání + aktivní projekt podle scrollu ---------- */
function reveal() {
  const vh = innerHeight;
  $$(".th, .sp").forEach((el) => {
    const r = el.getBoundingClientRect();
    if (r.top < vh * 0.88 && r.bottom > 0) el.classList.add("in");
  });
}
function onScroll() {
  reveal();
  if (indexEl.hidden || !rows.length) return;
  const mid = innerHeight / 2;
  let best = 0, bd = Infinity;
  rows.forEach((r, i) => {
    const b = r.el.getBoundingClientRect();
    const d = Math.abs(b.top + b.height / 2 - mid);
    if (d < bd) { bd = d; best = i; }
  });
  setActive(best);
}
addEventListener("scroll", onScroll, { passive: true });
addEventListener("resize", reveal);

boot();
