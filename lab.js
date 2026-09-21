/* ============================================================
   JAVY — LAB (scéna 03). Tři hravé pokusy, přepínají se záložkami:
     BLESK         — fotky schované ve tmě, kurzor/prst je kužel světla
     TEMNÁ KOMORA  — fotka se vyvolává pod rukou jako v misce s vývojkou
     FOTOMAT       — kamera návštěvníka v mém gradingu, spoušť, uložení

   Samostatný modul: nesahá do film.js ani film.css. Běží vždycky jen
   aktivní pokus a jen když je scéna na obrazovce (kvůli výkonu a kameře).
   ============================================================ */
(function () {
  "use strict";

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const scene = $(".s-lab");
  if (!scene) return;

  const HINTS = {
    blesk: "POHNI MYŠÍ NEBO PRSTEM — VE TMĚ SE NĚCO SKRÝVÁ",
    komora: "PŘEJEĎ PO PAPÍRU A FOTKA SE VYVOLÁ",
    fotomat: "TVOJE KAMERA V MÉM GRADINGU — NIC SE NEODESÍLÁ",
  };

  let PHOTOS = [];        // cesty k fotkám z archivu
  let active = "blesk";
  let visible = false;

  /* ---- fotky: vezmi je z manifestu portfolia (ne natvrdo) ---- */
  async function loadPhotos() {
    try {
      const m = await fetch("photos/manifest.json", { cache: "no-cache" }).then((r) => r.json());
      const all = [];
      (m.sets || []).forEach((s) => (s.images || (s.shoots || []).flatMap((x) => x.images) || []).forEach((u) => all.push(u)));
      PHOTOS = all;
    } catch (e) { PHOTOS = []; }
  }
  const randPhoto = () => PHOTOS.length ? PHOTOS[Math.floor(Math.random() * PHOTOS.length)] : "";

  /* ============================================================
     1) BLESK
     ============================================================ */
  const bl = {
    wrap: $("#blWrap"), box: $("#blImgs"),
    mx: 0.5, my: 0.5, tx: 0.5, ty: 0.5, idle: true, t: 0, raf: 0,
    build() {
      if (!PHOTOS.length || this.box.children.length) return;
      // rozházené, ale pokaždé stejné rozmístění (pevná mřížka s posunem)
      const spots = [
        [6, 8, 26], [34, 2, 30], [66, 10, 28], [12, 46, 24],
        [42, 40, 32], [72, 52, 26], [24, 72, 22], [56, 76, 26],
      ];
      const pick = [];
      for (let i = 0; i < spots.length; i++) pick.push(PHOTOS[Math.floor((i * PHOTOS.length) / spots.length)]);
      this.box.innerHTML = spots.map(([x, y, w], i) =>
        `<img alt="" loading="lazy" src="${pick[i]}" style="left:${x}%;top:${y}%;width:${w}%;height:auto">`).join("");
    },
    point(e) {
      const r = this.wrap.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      this.tx = (p.clientX - r.left) / r.width;
      this.ty = (p.clientY - r.top) / r.height;
      this.idle = false;
    },
    step(dt) {
      // bez myši se kužel sám pomalu prochází, ať to nevypadá mrtvě
      if (this.idle) {
        this.t += dt / 1000;
        this.tx = 0.5 + 0.30 * Math.sin(this.t * 0.42);
        this.ty = 0.5 + 0.24 * Math.sin(this.t * 0.63 + 1.1);
      }
      this.mx += (this.tx - this.mx) * 0.12;
      this.my += (this.ty - this.my) * 0.12;
      const r = Math.round(Math.min(this.wrap.clientWidth, this.wrap.clientHeight) * 0.34);
      this.wrap.style.setProperty("--mx", (this.mx * 100).toFixed(2) + "%");
      this.wrap.style.setProperty("--my", (this.my * 100).toFixed(2) + "%");
      this.box.style.setProperty("--mx", (this.mx * 100).toFixed(2) + "%");
      this.box.style.setProperty("--my", (this.my * 100).toFixed(2) + "%");
      this.box.style.setProperty("--r", r + "px");
    },
    start() { this.build(); },
    stop() {},
  };
  bl.wrap.addEventListener("pointermove", (e) => bl.point(e));
  bl.wrap.addEventListener("pointerdown", (e) => bl.point(e));
  bl.wrap.addEventListener("pointerleave", () => { bl.idle = true; bl.t = 0; });
  bl.wrap.addEventListener("touchmove", (e) => { bl.point(e); }, { passive: true });

  /* ============================================================
     2) TEMNÁ KOMORA
     ============================================================ */
  const km = {
    tray: $("#kmTray"), photo: $("#kmPhoto"), cv: $("#kmMask"),
    timeEl: $("#kmTime"), pctEl: $("#kmPct"), next: $("#kmNext"),
    ctx: null, drawing: false, t0: 0, pct: 0, done: false, last: { x: 0, y: 0 },
    fresh() {
      this.photo.src = randPhoto();
      const r = this.tray.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cv.width = Math.max(1, Math.round(r.width * dpr));
      this.cv.height = Math.max(1, Math.round(r.height * dpr));
      this.ctx = this.cv.getContext("2d");
      this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      this.ctx.globalCompositeOperation = "source-over";
      this.ctx.fillStyle = "#f3f1ea";                 // nevyvolaný papír
      this.ctx.fillRect(0, 0, r.width, r.height);
      this.t0 = 0; this.pct = 0; this.done = false;
      this.timeEl.textContent = "0.0 S"; this.pctEl.textContent = "0 %";
    },
    at(e) {
      const r = this.tray.getBoundingClientRect();
      const p = e.touches ? e.touches[0] : e;
      return { x: p.clientX - r.left, y: p.clientY - r.top };
    },
    rub(e) {
      if (!this.ctx || this.done) return;
      const p = this.at(e);
      if (!this.t0) this.t0 = performance.now();
      const R = Math.max(26, Math.min(this.tray.clientWidth, this.tray.clientHeight) * 0.11);
      this.ctx.globalCompositeOperation = "destination-out";
      // táhni čáru mezi snímky, ať nevznikají díry při rychlém pohybu
      const steps = Math.max(1, Math.round(Math.hypot(p.x - this.last.x, p.y - this.last.y) / (R * 0.4)));
      for (let i = 0; i <= steps; i++) {
        const x = this.last.x + (p.x - this.last.x) * (i / steps);
        const y = this.last.y + (p.y - this.last.y) * (i / steps);
        const g = this.ctx.createRadialGradient(x, y, 0, x, y, R);
        g.addColorStop(0, "rgba(0,0,0,.55)");
        g.addColorStop(1, "rgba(0,0,0,0)");
        this.ctx.fillStyle = g;
        this.ctx.beginPath(); this.ctx.arc(x, y, R, 0, 6.2832); this.ctx.fill();
      }
      this.last = p;
    },
    measure() {
      if (!this.ctx || this.done) return;
      // vzorkuj řídce, celý canvas by byl zbytečně drahý
      const w = 40, h = 26;
      const tmp = document.createElement("canvas"); tmp.width = w; tmp.height = h;
      const c = tmp.getContext("2d");
      c.drawImage(this.cv, 0, 0, w, h);
      const d = c.getImageData(0, 0, w, h).data;
      let clear = 0;
      for (let i = 3; i < d.length; i += 4) if (d[i] < 120) clear++;
      this.pct = Math.round((clear / (w * h)) * 100);
      this.pctEl.textContent = this.pct + " %";
      if (this.pct >= 88) { this.done = true; this.pctEl.textContent = "VYVOLÁNO"; }
    },
    step() {
      if (this.t0 && !this.done) this.timeEl.textContent = ((performance.now() - this.t0) / 1000).toFixed(1) + " S";
    },
    start() { if (!this.ctx) this.fresh(); },
    stop() {},
  };
  const kmDown = (e) => { km.drawing = true; km.last = km.at(e); km.rub(e); };
  const kmMove = (e) => { if (km.drawing) { km.rub(e); e.preventDefault(); } };
  const kmUp = () => { km.drawing = false; km.measure(); };
  km.tray.addEventListener("pointerdown", kmDown);
  km.tray.addEventListener("pointermove", kmMove);
  addEventListener("pointerup", kmUp);
  km.tray.addEventListener("pointerleave", kmUp);
  km.next.addEventListener("click", () => km.fresh());

  /* ============================================================
     3) FOTOMAT
     ============================================================ */
  const fm = {
    stage: $("#fmStage"), cv: $("#fmCanvas"), shot: $("#fmShot"),
    startBtn: $("#fmStart"), shootBtn: $("#fmShoot"), saveEl: $("#fmSave"),
    againBtn: $("#fmAgain"), note: $("#fmNote"),
    video: null, stream: null, ctx: null, grain: null, on: false,
    makeGrain() {
      const c = document.createElement("canvas"); c.width = c.height = 128;
      const x = c.getContext("2d"), img = x.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const v = 110 + Math.random() * 90;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255;
      }
      x.putImageData(img, 0, 0); this.grain = c;
    },
    async open() {
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
      } catch (e) {
        this.note.textContent = "KAMERU SE NEPODAŘILO SPUSTIT — POVOL PŘÍSTUP V PROHLÍŽEČI";
        return;
      }
      this.video = document.createElement("video");
      this.video.playsInline = true; this.video.muted = true;
      this.video.srcObject = this.stream;
      await this.video.play().catch(() => {});
      this.ctx = this.cv.getContext("2d");
      if (!this.grain) this.makeGrain();
      this.on = true;
      this.startBtn.hidden = true; this.shootBtn.hidden = false;
      this.note.textContent = "KAMERA BĚŽÍ JEN U TEBE — NIC SE NIKAM NEODESÍLÁ";
    },
    close() {
      this.on = false;
      if (this.stream) this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null; this.video = null;
      this.startBtn.hidden = false; this.shootBtn.hidden = true;
    },
    draw() {
      if (!this.on || !this.video || this.video.readyState < 2) return;
      const W = this.cv.width = this.stage.clientWidth;
      const H = this.cv.height = this.stage.clientHeight;
      const c = this.ctx;
      // vyplň plochu obrazem z kamery (zrcadlově, jak to lidi čekají)
      const vr = this.video.videoWidth / this.video.videoHeight, sr = W / H;
      let dw = W, dh = H;
      if (vr > sr) dw = H * vr; else dh = W / vr;
      c.save();
      c.filter = "grayscale(1) contrast(1.75) brightness(1.06)";
      c.translate(W, 0); c.scale(-1, 1);
      c.drawImage(this.video, (W - dw) / 2, (H - dh) / 2, dw, dh);
      c.restore();
      // zrno
      c.save(); c.globalAlpha = 0.09; c.globalCompositeOperation = "overlay";
      for (let y = 0; y < H; y += 128) for (let x = 0; x < W; x += 128) c.drawImage(this.grain, x, y);
      c.restore();
      // vinětace
      const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.25, W / 2, H / 2, Math.max(W, H) * 0.72);
      g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,.78)");
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    },
    shoot() {
      const url = this.cv.toDataURL("image/jpeg", 0.92);
      this.shot.src = url; this.shot.hidden = false;
      this.saveEl.href = url; this.saveEl.hidden = false;
      this.againBtn.hidden = false; this.shootBtn.hidden = true;
      this.on = false;
    },
    again() {
      this.shot.hidden = true; this.saveEl.hidden = true; this.againBtn.hidden = true;
      this.shootBtn.hidden = false; this.on = !!this.stream;
    },
    start() {},
    stop() { this.close(); this.again(); },
  };
  fm.startBtn.addEventListener("click", () => fm.open());
  fm.shootBtn.addEventListener("click", () => fm.shoot());
  fm.againBtn.addEventListener("click", () => fm.again());

  /* ============================================================
     přepínač + smyčka
     ============================================================ */
  const MODES = { blesk: bl, komora: km, fotomat: fm };
  function show(name) {
    if (!MODES[name]) return;
    MODES[active] && MODES[active].stop();
    active = name;
    $$(".lab-panel").forEach((p) => p.classList.toggle("on", p.dataset.panel === name));
    $$("#labTabs button").forEach((b) => b.classList.toggle("on", b.dataset.lab === name));
    $("#labHint").textContent = HINTS[name] || "";
    MODES[name].start();
  }
  $$("#labTabs button").forEach((b) => b.addEventListener("click", () => show(b.dataset.lab)));

  // běží jen když je scéna vidět (šetří výkon a hlavně vypne kameru)
  new IntersectionObserver((es) => {
    es.forEach((e) => {
      visible = e.isIntersecting;
      if (!visible && active === "fotomat") fm.close();
    });
  }, { threshold: 0.12 }).observe(scene);

  let last = 0;
  function loop(t) {
    const dt = last ? Math.min(64, t - last) : 16.7; last = t;
    if (visible) {
      if (active === "blesk") bl.step(dt);
      else if (active === "komora") km.step();
      else if (active === "fotomat") fm.draw();
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  addEventListener("resize", () => { if (active === "komora") km.fresh(); });

  loadPhotos().then(() => { bl.build(); if (active === "komora") km.fresh(); });
})();
