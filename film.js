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
const workIndex = $("#workIndex");
const workReveal = $("#workReveal");
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
let wiEls = [], workActive = -1;
let SCENES = [], SCENE_NAMES = [];
let ITEMS = [], FRAMES = [], centers = [];
let targetX = 0, currentX = 0, minX = 0, maxX = 0;
let vw = window.innerWidth || document.documentElement.clientWidth;
let lightIndex = -1;

/* ---- data ---- */
async function loadData() {
  try {
    const data = await (await fetch("photos/manifest.json", { cache: "no-store" })).json();
    SETS = (data.sets || []).map((s) => ({ ...s, images: s.images || [], count: (s.images || []).length }));
  } catch (e) { console.warn("manifest se nenačetl", e); SETS = []; }
  try {
    const jd = await (await fetch("journal.json", { cache: "no-store" })).json();
    JOURNAL = jd.entries || [];
  } catch (e) { console.warn("journal se nenačetl", e); JOURNAL = []; }
}

/* ---- fit-to-width (squished/stretched přes šířku) ---- */
function fitText() {
  document.querySelectorAll(".fit, .wi").forEach((el) => {
    const parent = el.parentElement;
    const pw = parent.clientWidth;
    const tw = el.scrollWidth;     // layout šířka (transform ji neovlivní)
    if (tw > 0 && pw > 0) el.style.transform = `scaleX(${(pw / tw).toFixed(4)})`;
  });
}

/* ---- WORK: scrollovatelný index + sticky reveal ---- */
function renderWorkIndex() {
  workIndex.innerHTML = ""; wiEls = [];
  SETS.forEach((set, i) => {
    const slot = document.createElement("div"); slot.className = "wi-slot";
    const w = document.createElement("div"); w.className = "wi"; w.textContent = set.title; w.dataset.i = i;
    w.addEventListener("mouseenter", () => setWorkActive(i));
    w.addEventListener("click", () => openShoot(i));
    slot.appendChild(w); workIndex.appendChild(slot); wiEls.push(w);
  });
  workMeta.textContent = `${SETS.length} SETS · ${SETS.reduce((n, s) => n + s.count, 0)} SHOTS`;
  layoutWork();
}
function layoutWork() {
  // výška sekce = obsah listu (sticky fotka + prostor na proscrollování slov)
  sWork.style.height = workIndex.scrollHeight + "px";
}
function setWorkActive(i) {
  if (i === workActive) return;
  workActive = i;
  const set = SETS[i];
  workReveal.style.backgroundImage = `url("${set.images[Math.min(2, set.images.length - 1)]}")`;
  workReveal.classList.add("on");
  wiEls.forEach((w, k) => w.classList.toggle("active", k === i));
  if (stage.hidden) crumb.textContent = `WORK / ${set.title.toUpperCase()}`;
}
function updateWorkFocus(vh) {
  const r = sWork.getBoundingClientRect();
  if (r.bottom < vh * 0.15 || r.top > vh * 0.85) return;   // WORK mimo obraz
  let best = -1, bd = Infinity;
  wiEls.forEach((w, k) => {
    const wr = w.getBoundingClientRect();
    const d = Math.abs((wr.top + wr.height / 2) - vh / 2);
    if (d < bd) { bd = d; best = k; }
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
  updateWorkFocus(vh);
}

/* ---- WORK -> pás ---- */
function openShoot(idx) {
  buildStrip(SETS[idx]);
  enterStrip();
}
function enterStrip() {
  journey.hidden = true; dotsNav.hidden = true;
  stage.hidden = false; back.hidden = false;
  measure();
  const startX = clamp(vw / 2 - (centers[0] || 0));
  currentX = startX - 720; targetX = startX;
  reel.classList.remove("unrolling"); void reel.offsetWidth; reel.classList.add("unrolling");
  setTimeout(() => { measure(); targetX = clamp(vw / 2 - (centers[0] || 0)); }, 140);
}
function backFromStrip() {
  stage.hidden = true; journey.hidden = false; dotsNav.hidden = false; back.hidden = true;
  updateJourney();
}
back.addEventListener("click", () => {
  if (!journalEntry.hidden) { journalEntry.hidden = true; if (stage.hidden) back.hidden = true; return; }
  backFromStrip();
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
  if (!light.hidden) { if (e.key === "Escape") closeLight(); else if (e.key === "ArrowRight") stepLight(1); else if (e.key === "ArrowLeft") stepLight(-1); return; }
  if (!journalEntry.hidden) { if (e.key === "Escape") { journalEntry.hidden = true; if (stage.hidden) back.hidden = true; } return; }
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
function paintLight() { const it = FRAMES[lightIndex]; lightImg.src = it.full; lightId.textContent = `${it.set.title.toUpperCase()} · ${pad2(it.i + 1)}/${pad2(it.set.count)} · ${(it.set.credit || "").toUpperCase()}`; }
function stepLight(d) { lightIndex = (lightIndex + d + FRAMES.length) % FRAMES.length; paintLight(); }
function closeLight() { light.hidden = true; }
lightClose.addEventListener("click", closeLight);
lightImg.addEventListener("click", () => stepLight(1));

/* ---- loader: ultra minimal (progress linka) ---- */
function initLoader() {
  const loader = $("#loader"), fill = $("#barFill"), pct = $("#loadPct");
  if (!loader) return;
  let prog = 0, done = false, tick = null;
  function render() { fill.style.width = prog + "%"; if (pct) pct.textContent = String(Math.floor(prog)).padStart(3, "0"); }
  function complete() {
    if (done) return; done = true; if (tick) clearInterval(tick);
    prog = 100; render();
    setTimeout(() => { loader.classList.add("done"); setTimeout(() => loader.remove(), 480); }, 160);
  }
  tick = setInterval(() => {
    if (done) return;
    prog = Math.min(100, prog + 1.3 + Math.random() * 2.2);
    render();
    if (prog >= 100) complete();
  }, 40);
  loader.addEventListener("click", () => { if (!done) complete(); });
  document.addEventListener("keydown", (e) => { if (!done && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); complete(); } });
  render();
}

/* ---- go ---- */
initLoader();
journey.addEventListener("scroll", updateJourney, { passive: true });
window.addEventListener("resize", () => { fitText(); layoutWork(); if (!stage.hidden) measure(); else updateJourney(); });
(async () => {
  await loadData();
  renderWorkIndex();
  renderJournal();
  buildDots();
  fitText();
  updateJourney();
  setTimeout(fitText, 120);   // po dosednutí fontů
  setInterval(step, 16);
})();
