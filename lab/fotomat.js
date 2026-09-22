/* ============================================================
   JAVY — FOTOMAT (scéna 03)
   Aparát je NAKRESLENÝ ve stejném jazyce jako zbytek webu: tvrdé černé
   plochy a vlasové linky na papíře, značka ℗ místo objektivu. Klik
   rozevře clonu a z objektivu vyteče živý obraz z kamery návštěvníka,
   přebarvený vlastním shaderem.

   Bez 3D a bez three.js: choreografii dělá GSAP, obraz čisté WebGL.
   Tajný panel (klávesa G nebo trojklik na popisek sekce) mění všech
   18 parametrů gradingu, ukládá je do localStorage a umí je vypsat.
   Stream z kamery nikam neodchází.
   ============================================================ */
(function () {
  "use strict";
  const $ = (s, r = document) => r.querySelector(s);
  const scene = $(".s-lab");
  if (!scene) return;

  /* ---- parametry gradingu: jeden seznam pro shader, panel i presety ---- */
  const PARAMS = [
    { k: "exposure", t: "EXPOZICE", min: -3, max: 3, step: .01, v: .25 },
    { k: "contrast", t: "KONTRAST", min: 0, max: 2.5, step: .01, v: 1.45 },
    { k: "gamma", t: "GAMA", min: .4, max: 2.2, step: .01, v: 1 },
    { k: "lift", t: "ZDVIH STÍNŮ", min: -.2, max: .3, step: .005, v: -.02 },
    { k: "gain", t: "ZISK SVĚTEL", min: .5, max: 1.8, step: .01, v: 1.06 },
    { k: "scurve", t: "S-KŘIVKA", min: 0, max: 1, step: .01, v: .35 },
    { k: "black", t: "ČERNÝ BOD", min: 0, max: .3, step: .005, v: .03 },
    { k: "white", t: "BÍLÝ BOD", min: .7, max: 1.1, step: .005, v: .97 },
    { k: "sat", t: "SYTOST", min: 0, max: 1.6, step: .01, v: 0 },
    { k: "temp", t: "TEPLOTA", min: -.3, max: .3, step: .005, v: 0 },
    { k: "tint", t: "ODSTÍN", min: -.3, max: .3, step: .005, v: 0 },
    { k: "grain", t: "ZRNO", min: 0, max: .6, step: .005, v: .16 },
    { k: "grainSize", t: "VELIKOST ZRNA", min: .5, max: 4, step: .1, v: 1.4 },
    { k: "halation", t: "HALACE", min: 0, max: 1.2, step: .01, v: .35 },
    { k: "sharp", t: "DOOSTŘENÍ", min: 0, max: 1.5, step: .01, v: .35 },
    { k: "vignette", t: "VINĚTACE", min: 0, max: 1.6, step: .01, v: .75 },
    { k: "vigSoft", t: "MĚKKOST VINĚTY", min: .2, max: 1.2, step: .01, v: .6 },
    { k: "barrel", t: "SOUDKOVITOST", min: -.4, max: .6, step: .005, v: .12 },
    { k: "dither", t: "DITHER (TERMOTISK)", min: 0, max: 1, step: .01, v: .9 },
    { k: "ditherSize", t: "VELIKOST BODU", min: 1, max: 6, step: .1, v: 2 },
  ];
  const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.k, p.v]));
  const LOOKS = {
    "TERMO": { dither: 1, ditherSize: 2, exposure: .3, contrast: 1.5, sat: 0, grain: .05, halation: .15, vignette: .5 },
    "KLUB": { dither: 0, exposure: .35, contrast: 1.7, sat: 0, grain: .22, halation: .5, vignette: 1, scurve: .5 },
    "BLESK": { dither: 0, exposure: .7, contrast: 1.5, sat: 0, grain: .12, halation: .9, vignette: .5, white: 1, gain: 1.2 },
    "FILM": { dither: 0, exposure: .1, contrast: 1.25, sat: .25, grain: .34, grainSize: 2.1, halation: .3, vignette: .8, temp: .06 },
    "SYROVÝ": { dither: 0, exposure: 0, contrast: 1, sat: 1, grain: .05, halation: 0, vignette: .25, scurve: 0, barrel: 0 },
  };

  const VERT = `attribute vec2 p; varying vec2 vUv;
    void main(){ vUv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }`;
  const FRAG = `precision highp float;
    uniform sampler2D tVid; uniform vec2 uCover, uVidRes; uniform float uTime, uHasVid;
    ${PARAMS.map((p) => `uniform float u_${p.k};`).join(" ")}
    varying vec2 vUv;
    float hash(vec2 q){ return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
    float bayer2(vec2 a){ a = floor(a); return fract(a.x / 2.0 + a.y * a.y * .75); }
    float bayer4(vec2 a){ return bayer2(.5 * a) * .25 + bayer2(a); }
    float bayer8(vec2 a){ return bayer4(.5 * a) * .25 + bayer2(a); }
    vec3 tap(vec2 q){ return texture2D(tVid, q).rgb; }
    void main(){
      vec2 uv = vUv - .5;
      uv *= 1.0 + u_barrel * dot(uv, uv);          // soudkovitost
      vec2 c = uv * uCover + .5;
      c.x = 1.0 - c.x;                              // zrcadlově
      if (uHasVid < .5 || c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) {
        gl_FragColor = vec4(0.027, 0.027, 0.024, 1.0); return;
      }
      vec3 col = tap(c);
      if (u_sharp > .001) {                         // doostření
        vec2 px = vec2(1.6) / max(uVidRes, vec2(1.));
        vec3 b = (tap(c + vec2(px.x, 0.)) + tap(c - vec2(px.x, 0.)) + tap(c + vec2(0., px.y)) + tap(c - vec2(0., px.y))) * .25;
        col += (col - b) * u_sharp;
      }
      col *= pow(2.0, u_exposure);
      col = (col - u_black) / max(.001, u_white - u_black);
      col = u_lift + col * (u_gain - u_lift);
      col = pow(max(col, 0.0), vec3(1.0 / max(.05, u_gamma)));
      col = (col - .5) * u_contrast + .5;
      col = mix(col, col * col * (3.0 - 2.0 * col), u_scurve);
      col.r *= 1.0 + u_temp; col.b *= 1.0 - u_temp; col.g *= 1.0 + u_tint;
      col = mix(vec3(dot(col, vec3(.2126, .7152, .0722))), col, u_sat);
      if (u_halation > .001) {                      // rozpité světlo kolem přepalů
        vec2 px = vec2(3.5) / max(uVidRes, vec2(1.));
        vec3 s = (tap(clamp(c + px, .001, .999)) + tap(clamp(c - px, .001, .999))
                + tap(clamp(c + vec2(px.x, -px.y), .001, .999)) + tap(clamp(c + vec2(-px.x, px.y), .001, .999))) * .25;
        col += max(0.0, dot(s, vec3(.2126, .7152, .0722)) - .62) * u_halation * vec3(1., .96, .92);
      }
      col += (hash(floor(gl_FragCoord.xy / max(.5, u_grainSize)) + fract(uTime) * 97.13) - .5) * u_grain;
      col *= mix(1.0, 1.0 - smoothstep(u_vigSoft * .35, 1.05, length(vUv - .5) * 1.42), clamp(u_vignette, 0., 1.6));
      col = clamp(col, 0.0, 1.0);
      if (u_dither > .001) {                        // rastr jako na termotisku: jen body, žádné půltóny
        float th = clamp(bayer8(gl_FragCoord.xy / max(1.0, u_ditherSize)) / 1.3125, 0.0, 1.0);
        float bw = step(th, dot(col, vec3(.2126, .7152, .0722)));
        col = mix(col, vec3(bw), u_dither);
      }
      gl_FragColor = vec4(col, 1.0);
    }`;

  /* ---- WebGL ---- */
  const cv = $("#fmGL");
  const gl = cv.getContext("webgl", { preserveDrawingBuffer: true, antialias: false });
  let U = {}, glOK = false;
  if (gl) {
    const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn("shader:", gl.getShaderInfoLog(s)); return s; };
    const prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);
    glOK = gl.getProgramParameter(prog, gl.LINK_STATUS);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, "p");
    gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    ["tVid", "uCover", "uVidRes", "uTime", "uHasVid"].forEach((n) => (U[n] = gl.getUniformLocation(prog, n)));
    PARAMS.forEach((p) => (U[p.k] = gl.getUniformLocation(prog, "u_" + p.k)));
    const tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    [[gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE],
     [gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR]]
      .forEach(([k, v]) => gl.texParameteri(gl.TEXTURE_2D, k, v));
    gl.uniform1i(U.tVid, 0);
    // BEZ TOHOHLE JE CELÝ OBRAZ VZHŮRU NOHAMA: WebGL má počátek textury vlevo
    // dole, kdežto video i obrázek ho mají vlevo nahoře.
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  }

  /* ---- stav ---- */
  let G = { ...DEFAULTS, ...LOOKS["TERMO"] };
  try { Object.assign(G, JSON.parse(localStorage.getItem("javy-grade") || "{}")); } catch (e) {}
  let video = null, stream = null, live = false, busy = false, shots = [];
  let testImg = null, mode = "strip", visible = false;
  const HINT = "podrž spoušť a stlač ji dolů";

  const host = $("#fm"), count = $("#fmCount"), flash = $("#fmFlash"), note = $("#fmNote");
  const shootB = $("#fmShoot"), saveA = $("#fmSave"), againB = $("#fmAgain");
  const pile = $("#fmPile"), slot = $("#fmSlot"), prog = $("#fmProg"), vfr = $("#fmVfr");
  const view = $("#fmView"), viewImg = $("#fmViewImg"), viewIdx = $("#fmViewIdx"), viewSave = $("#fmViewSave");
  const srcEl = () => testImg || video;
  const srcReady = () => { const e = srcEl(); return !!e && (e.tagName === "IMG" ? e.complete && e.naturalWidth : e.readyState >= 2); };
  const g = () => window.gsap;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));

  /* ---- kamera ---- */
  async function openCam() {
    if (live) return true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
    } catch (e) { note.textContent = "kameru se nepodařilo spustit — povol přístup v prohlížeči"; return false; }
    video = document.createElement("video");
    video.playsInline = true; video.muted = true; video.srcObject = stream;
    await video.play().catch(() => {});
    live = true; host.classList.add("live");
    if (mode === "strip") {                      // hledáček ukáže, co se opravdu ořízne
      vfr.hidden = false;
      if (g()) g().fromTo(vfr.querySelector(".vf-hole"),
        { scale: 1.12, opacity: 0 }, { scale: 1, opacity: 1, duration: .5, ease: "power3.out" });
    }
    return true;
  }
  function closeCam() {
    live = false; vfr.hidden = true;
    if (!testImg) host.classList.remove("live");
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video = null;
  }

  /* ============================================================
     FYZIKA — vypadlé proužky leží na hromadě, dají se chytit
     ============================================================ */
  const items = [];           // {el, body, data:{url, shots}}
  let engine = null, walls = [];
  function physics() {
    const M = window.Matter; if (!M || engine) return;
    engine = M.Engine.create(); engine.gravity.y = 1.15;
    buildWalls();
    // tahat myší jen na desktopu — na telefonu by to sebralo scrollování
    if (matchMedia("(pointer: fine)").matches) {
      const mouse = M.Mouse.create(pile);
      mouse.element.removeEventListener("wheel", mouse.mousewheel);
      mouse.element.removeEventListener("DOMMouseScroll", mouse.mousewheel);
      // Matter si u dotyků volá preventDefault → sebralo by to scrollování stránky
      mouse.element.removeEventListener("touchstart", mouse.mousedown);
      mouse.element.removeEventListener("touchmove", mouse.mousemove);
      mouse.element.removeEventListener("touchend", mouse.mouseup);
      M.Composite.add(engine.world, M.MouseConstraint.create(engine, { mouse, constraint: { stiffness: .16, render: { visible: false } } }));
    }
  }
  function buildWalls() {
    const M = window.Matter; if (!M || !engine) return;
    M.Composite.remove(engine.world, walls);
    const w = pile.clientWidth, h = pile.clientHeight, t = 200;
    walls = [
      M.Bodies.rectangle(w / 2, h + t / 2 - 2, w * 3, t, { isStatic: true }),
      M.Bodies.rectangle(-t / 2 + 2, h / 2, t, h * 3, { isStatic: true }),
      M.Bodies.rectangle(w + t / 2 - 2, h / 2, t, h * 3, { isStatic: true }),
    ];
    M.Composite.add(engine.world, walls);
  }
  function addPiece(url, data, x, y, w, h, vx, vy, ang) {
    const M = window.Matter; if (!M) return null;
    const el = document.createElement("div");
    el.className = "pc";
    el.style.width = w + "px"; el.style.height = h + "px";
    el.innerHTML = `<img alt="" src="${url}">`;
    pile.appendChild(el);
    const body = M.Bodies.rectangle(x, y, w, h, { restitution: .18, friction: .55, frictionAir: .012, angle: ang || 0 });
    M.Body.setVelocity(body, { x: vx || 0, y: vy || 0 });
    M.Body.setAngularVelocity(body, (Math.random() - .5) * .22);   // ať dopadají nakřivo, ne jako vojáci
    M.Composite.add(engine.world, body);
    const it = { el, body, data };
    items.push(it);
    // klik (ne tažení) otevře detail
    let dx = 0, dy = 0, sx = 0, sy = 0;
    el.addEventListener("pointerdown", (e) => { sx = e.clientX; sy = e.clientY; dx = dy = 0; });
    el.addEventListener("pointerup", (e) => {
      dx = Math.abs(e.clientX - sx); dy = Math.abs(e.clientY - sy);
      if (dx < 6 && dy < 6) openView(it);
    });
    return it;
  }
  function syncPhysics(dt) {
    const M = window.Matter; if (!M || !engine) return;
    M.Engine.update(engine, Math.min(32, dt));
    for (const it of items) {
      const { x, y } = it.body.position;
      it.el.style.transform = `translate(${x - it.el.offsetWidth / 2}px, ${y - it.el.offsetHeight / 2}px) rotate(${it.body.angle}rad)`;
    }
  }

  /* ---- vyjetí proužku ze štěrbiny ---- */
  function ejectStrip(made, data) {
    physics();
    const url = made.url;
    const ph = pile.clientHeight, pw = pile.clientWidth;
    const sz = fitPiece(made, data.shots.length), h = sz.h, w = sz.w;
    const sx = pw / 2, sy = ph - 6;
    const el = document.createElement("div");
    el.className = "pc"; el.style.width = w + "px"; el.style.height = h + "px";
    el.innerHTML = `<img alt="" src="${url}">`;
    el.style.transform = `translate(${sx - w / 2}px, ${sy}px)`;
    pile.appendChild(el);
    return new Promise((res) => {
      const tl = g() ? g().timeline() : null;
      if (!tl) { pile.removeChild(el); res(dropIt()); return; }
      tl.to(el, { y: -h * 0.02, duration: 1.05, ease: "power2.out",
                  onUpdate: () => { el.style.transform = `translate(${sx - w / 2}px, ${sy - h * (tl.progress())}px)`; } })
        .to({}, { duration: .12 })
        .add(() => { pile.removeChild(el); res(dropIt()); });
      function dropIt() {
        return addPiece(url, { ...data, nat: made }, sx, sy - h / 2, w, h,
                        (Math.random() - .5) * 2, -1.5, (Math.random() - .5) * .25);
      }
    });
  }

  /* ============================================================
     SKLÁDÁNÍ OBRÁZKŮ
     ============================================================ */
  function cropTo(x, im, dx, dy, dw, dh) {          // ořez na střed do cílového poměru
    const sr = im.width / im.height, dr = dw / dh;
    let sw = im.width, sh = im.height, sx = 0, sy = 0;
    if (sr > dr) { sw = im.height * dr; sx = (im.width - sw) / 2; }
    else { sh = im.width / dr; sy = (im.height - sh) / 2; }
    x.drawImage(im, sx, sy, sw, sh, dx, dy, dw, dh);
  }
  function loadAll(list) {
    return Promise.all(list.map((src) => new Promise((res) => { const im = new Image(); im.onload = () => res(im); im.src = src; })));
  }
  async function composeStrip(list) {
    const n = Math.max(1, list.length);          // výška podle POČTU políček, ne natvrdo 4
    const W = 520, pad = 22, gap = 12, fw = W - pad * 2, fh = Math.round(fw * 4 / 3);
    const H = pad + (fh + gap) * n + 64;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#f3f1ea"; x.fillRect(0, 0, W, H);
    const ims = await loadAll(list);
    ims.forEach((im, i) => cropTo(x, im, pad, pad + i * (fh + gap), fw, fh));
    x.fillStyle = "#0c0b09"; x.font = "700 15px Arial, Helvetica, sans-serif";
    x.fillText("JAVY · FOTOMAT", pad, H - 26);
    const d = new Date();
    x.textAlign = "right";
    x.fillText(`${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`, W - pad, H - 26);
    return { url: c.toDataURL("image/jpeg", .92), w: W, h: H };   // rozměry kvůli poměru stran
  }
  async function composePhoto(src) {                 // jedno políčko s papírovým okrajem
    const W = 460, pad = 18, fw = W - pad * 2, fh = Math.round(fw * 4 / 3), H = fh + pad * 2 + 34;
    const c = document.createElement("canvas"); c.width = W; c.height = H;
    const x = c.getContext("2d");
    x.fillStyle = "#f3f1ea"; x.fillRect(0, 0, W, H);
    const [im] = await loadAll([src]);
    cropTo(x, im, pad, pad, fw, fh);
    x.fillStyle = "#0c0b09"; x.font = "700 12px Arial, Helvetica, sans-serif";
    x.fillText("JAVY · FOTOMAT", pad, H - 14);
    return c.toDataURL("image/jpeg", .92);
  }

  /* ============================================================
     FOCENÍ
     ============================================================ */
  function grab() {
    draw();
    if (g()) g().fromTo(flash, { opacity: .9 }, { opacity: 0, duration: .4, ease: "power2.out" });
    return cv.toDataURL("image/jpeg", .93);
  }
  async function countdown(n) {
    count.hidden = false;
    for (let i = n; i > 0; i--) {
      count.textContent = String(i);
      if (g()) g().fromTo(count, { scale: .7, opacity: 0 }, { scale: 1, opacity: 1, duration: .3, ease: "back.out(2)" });
      await wait(850);
    }
    count.hidden = true;
  }
  async function runStrip() {
    if (busy || live) return; busy = true;
    if (!(await openCam())) { busy = false; return; }
    [...prog.children].forEach((i) => i.classList.remove("on"));
    note.textContent = "dívej se do kamery";
    await countdown(3);
    shots = [];
    for (let i = 0; i < 4; i++) {
      shots.push(grab());
      prog.children[i].classList.add("on");
      if (i < 3) { note.textContent = `snímek ${i + 1} / 4`; await wait(1400); }
    }
    note.textContent = "proužek jede ven…";
    const made = await composeStrip(shots);
    closeCam(); vfr.hidden = true;
    await ejectStrip(made, { url: made.url, shots: shots.slice() });
    note.textContent = "chyť ho, nebo na něj klikni · další focení spouští";
    busy = false;
  }
  async function runNeg() {
    if (busy || live) return; busy = true;
    if (!(await openCam())) { busy = false; return; }
    note.textContent = "zamiř se a stlač spoušť znovu"; shootB.hidden = false; busy = false;
  }
  async function shootNeg() {
    if (!live || busy) return; busy = true;
    await countdown(3);
    const url = grab();
    const im = new Image(); im.src = url;
    im.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
    $("#fmNeg").appendChild(im);
    host.classList.remove("live");
    saveA.href = url; saveA.hidden = false; againB.hidden = false; shootB.hidden = true;
    note.textContent = "hotovo"; closeCam(); busy = false; relReset();
  }
  shootB.addEventListener("click", shootNeg);
  againB.addEventListener("click", () => {
    $("#fmNeg").querySelectorAll("img").forEach((i) => i.remove());
    saveA.hidden = true; againB.hidden = true; shootB.hidden = true;
    note.textContent = HINT;
  });

  /* ============================================================
     DRÁTĚNÁ SPOUŠŤ
       Klikem do plochy se dřív fotilo omylem a nikdo netušil, kde se
       to spouští. Teď je to hmatatelné tlačítko: podržet palcem
       a stlačit dolů — poslední kus jde ztuha a na doraz to cvakne.
     ============================================================ */
  const rel = $("#fmRel"), relBtn = $("#fmRelBtn"), relLbl = $("#fmRelLbl");
  const relCap = rel.querySelector(".cap");
  const REL = 26;                      // dráha hlavice (px)
  let relDown = false, relFired = false, relY = 0, relMoved = false;

  // pozor: hlavicí hýbeme přímo přes style.transform, doskok řeší CSS přechod
  // (.crel.hold ho vypíná) — GSAP by si s ručním zápisem transformu tloukl
  function relSet(d) { relCap.style.transform = `translateX(-50%) translateY(${d.toFixed(1)}px)`; }
  function relReset() {
    relFired = false; relDown = false;
    rel.classList.remove("hold", "fired", "off");
    relLbl.textContent = "PODRŽ A STLAČ ↓";
    relSet(0);
  }
  async function relFire() {
    if (relFired || busy) return;
    relFired = true;
    relSet(REL);
    rel.classList.add("fired"); relLbl.textContent = "CVAK";
    if (g()) g().fromTo(rel, { y: 3 }, { y: 0, duration: .45, ease: "elastic.out(1, .35)" });
    try { navigator.vibrate && navigator.vibrate(18); } catch (e) {}
    rel.classList.add("off");
    if (mode === "strip") await runStrip();
    else if (!live) { await runNeg(); }
    else await shootNeg();
    relReset();
  }

  relBtn.addEventListener("pointerdown", (e) => {
    if (busy || relFired) return;
    relDown = true; relMoved = false; relY = e.clientY;
    rel.classList.add("hold"); relLbl.textContent = "TEĎ DOLŮ ↓";
    try { relBtn.setPointerCapture(e.pointerId); } catch (x) {}
  });
  relBtn.addEventListener("pointermove", (e) => {
    if (!relDown || relFired) return;
    const raw = Math.max(0, e.clientY - relY);
    if (raw > 3) relMoved = true;
    const t = Math.min(1, raw / (REL + 12));
    relSet(REL * (1 - Math.pow(1 - t, 1.8)));      // ke konci to jde ztuha
    if (t >= 1) relFire();
  });
  const relUp = () => {
    if (!relDown) return;
    relDown = false;
    if (relFired) return;
    rel.classList.remove("hold");
    relLbl.textContent = relMoved ? "AŽ NA DORAZ ↓" : "PODRŽ A STLAČ ↓";
    relSet(0);
    setTimeout(() => { if (!relDown && !relFired) relLbl.textContent = "PODRŽ A STLAČ ↓"; }, 1600);
  };
  relBtn.addEventListener("pointerup", relUp);
  relBtn.addEventListener("pointercancel", relUp);
  relBtn.addEventListener("click", (e) => e.preventDefault());
  relBtn.addEventListener("keydown", (e) => {      // klávesnice: stlač to za uživatele
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    if (busy || relFired) return;
    relSet(REL); relFire();
  });

  /* ============================================================
     DETAIL PROUŽKU — páska: svisle se posouvá tahem,
     vodorovným tahem se v místě prstu rozstřihne
     ============================================================ */
  const tape = $("#fmTape"), tapeIn = $("#fmTapeIn"), cutline = $("#fmCutline");
  const viewHint = $("#fmViewHint");
  let vItem = null, vShots = [], scrollY = 0, vel = 0, cutting = false;

  function buildTape() {
    const d = new Date();
    tapeIn.innerHTML = vShots.map((src, i) =>
        (i ? `<div class="seam"></div>` : "") + `<figure class="tf"><img alt="" src="${src}"></figure>`).join("") +
      `<div class="tape-foot"><span>JAVY · FOTOMAT</span><span>${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}</span></div>` +
      `<div class="tape-lead">↓ DO TISKÁRNY</div>`;
    scrollY = 0; vel = 0; applyScroll();
    viewHint.textContent = vShots.length > 1
      ? "chyť proužek a táhni · do strany = utrhnout fotku · dolů = do tiskárny"
      : "poslední fotka — chyť proužek a zatáhni dolů do tiskárny";
  }
  function maxScroll() { return Math.max(0, tapeIn.offsetHeight - tape.clientHeight); }
  let feeding = false, dragging = false;          // vtahování do tiskárny / prst na pásce
  const rubber = (d) => 190 * (1 - 1 / (1 + d / 150));   // čím dál taháš, tím větší odpor
  function applyScroll() {
    if (feeding) { tapeIn.style.transform = `translateX(-50%) translateY(${(-scrollY).toFixed(2)}px)`; return; }
    const m = maxScroll();
    scrollY = Math.max(-300, Math.min(m + 300, scrollY));
    const y = scrollY < 0 ? -rubber(-scrollY) : (scrollY > m ? m + rubber(scrollY - m) : scrollY);
    tapeIn.style.transform = `translateX(-50%) translateY(${(-y).toFixed(2)}px)`;
  }
  /* ============================================================
     TRHÁNÍ A TISK
       do strany za políčko  = perforace se natáhne a fotka se utrhne
       dolů celým proužkem   = podáváš ho do štěrbiny, ta ho vtáhne
     ============================================================ */
  const pslot = $("#fmPslot"), hand = $("#fmHand");
  const slotLbl = pslot.querySelector(".lbl"), slotSt = pslot.querySelector(".pst");
  const FEED = 62;                                  // o kolik musíš podat, než to tiskárna chytne
  function feedHot(on) {
    pslot.classList.toggle("hot", on);
    slotLbl.textContent = on ? "PUSŤ ↓" : "TISKÁRNA ▾";
    if (!pslot.classList.contains("feed")) slotSt.textContent = on ? "VLOŽ" : "READY";
  }
  /* lístek vyjede z tiskárny ven — ať je vidět, že fakt tiskne */
  function paperOut() {
    pslot.classList.remove("gone"); pslot.classList.add("out");
    setTimeout(() => pslot.classList.add("gone"), 1100);
    setTimeout(() => pslot.classList.remove("out", "gone"), 1700);
  }

  /* natržený okraj — nepravidelná pila, pokaždé jiná */
  function tornEdge(topToo) {
    const pts = [], n = 22;
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * 100;
      pts.push(`${x.toFixed(1)}% ${(2 + Math.random() * 4).toFixed(1)}%`);
    }
    const bottom = [];
    for (let i = n; i >= 0; i--) {
      const x = (i / n) * 100;
      bottom.push(`${x.toFixed(1)}% ${(96 - Math.random() * 4).toFixed(1)}%`);
    }
    return `polygon(${(topToo ? pts : ["0% 0%", "100% 0%"]).join(",")}, ${bottom.join(",")})`;
  }

  function slotRect() { return pslot.getBoundingClientRect(); }
  function overSlot(x, y) {
    const r = slotRect();
    return x > r.left - 40 && x < r.right + 40 && y > r.top - 50 && y < r.bottom + 40;
  }

  /* ---- vytištění: válečky si to vtáhnou ---- */
  async function printThing(list, fromEl) {
    const made = await composeStrip(list);
    const a = $("#fmViewSave");
    a.href = made.url;
    a.download = list.length > 1 ? "javy-fotomat-prouzek.jpg" : "javy-fotomat.jpg";
    pslot.classList.add("feed"); pslot.classList.remove("hot");
    slotSt.textContent = "TISKNE…";
    if (g() && fromEl) {
      const r = slotRect();
      await g().timeline()
        .to(fromEl, { x: "+=0", duration: .05 })
        .to(fromEl, {                                   // po krocích, jak jedou válečky
          left: r.left + r.width / 2 - fromEl.offsetWidth / 2 - view.getBoundingClientRect().left,
          top: r.top - view.getBoundingClientRect().top - 10,
          duration: .35, ease: "power2.inOut",
        })
        .to(fromEl, { scaleY: .04, opacity: .2, transformOrigin: "50% 100%", duration: .5, ease: "steps(8)" })
        .then();
    }
    pslot.classList.remove("feed");
    if (g()) g().fromTo(pslot, { y: 6 }, { y: 0, duration: .35, ease: "elastic.out(1, .4)" });
    paperOut(); slotSt.textContent = "HOTOVO";
    setTimeout(() => { if (!pslot.classList.contains("feed")) slotSt.textContent = "READY"; }, 1600);
    a.click();
    note.textContent = list.length > 1 ? "proužek vytištěn" : "snímek vytištěn";
  }

  /* ---- vtažení celého proužku: válečky ho po krocích spolknou ---- */
  async function feedStrip() {
    if (feeding || cutting || !vShots.length) return;
    feeding = true; vel = 0;
    const list = vShots.slice();
    const made = await composeStrip(list);
    const a = $("#fmViewSave");
    a.href = made.url; a.download = "javy-fotomat-prouzek.jpg";
    feedHot(false); pslot.classList.add("feed");
    slotSt.textContent = "TISKNE…";
    note.textContent = "podávám do tiskárny…";
    const konec = -(tapeIn.offsetHeight + 80);
    const tween = (to, dur, ease) => new Promise((res) => {
      if (!g()) { scrollY = to; applyScroll(); return res(); }
      const proxy = { v: scrollY };
      g().to(proxy, { v: to, duration: dur, ease,
        onUpdate: () => { scrollY = proxy.v; applyScroll(); }, onComplete: res });
    });
    await tween(konec, .95, "steps(14)");            // trhaně, jak jedou válečky
    pslot.classList.remove("feed");
    if (g()) g().fromTo(pslot, { y: 8 }, { y: 0, duration: .4, ease: "elastic.out(1, .4)" });
    paperOut(); slotSt.textContent = "HOTOVO";
    setTimeout(() => { if (!pslot.classList.contains("feed")) slotSt.textContent = "READY"; }, 1600);
    a.click();
    note.textContent = "proužek vytištěn";
    await tween(0, .75, "power3.out");               // a páska se vrátí nahoru
    feeding = false;
  }

  /* ---- trhání + podávání ---- */
  {
    let mode = null;          // "tear" | "feed" | "scroll"
    let idx = -1, startX = 0, startY = 0, frame = null, seamEl = null;
    let handShot = null, lastY = 0;
    const TEAR = 110;         // po kolika pixelech do strany to povolí

    tape.addEventListener("pointerdown", (e) => {
      if (cutting || feeding) return;
      if (!e.target.closest(".tape-in")) return;   // vedle papíru necháme scrollovat stránku
      const f = e.target.closest(".tf");
      startX = e.clientX; startY = e.clientY; lastY = e.clientY; vel = 0; dragging = true;
      mode = null; frame = f || null;
      idx = f ? [...tapeIn.querySelectorAll(".tf")].indexOf(f) : -1;
      try { tape.setPointerCapture(e.pointerId); } catch (x) {}
    });

    tape.addEventListener("pointermove", (e) => {
      if (!dragging) return;                       // páska se hýbe jen se stisknutým tlačítkem
      const dx = e.clientX - startX, dy = e.clientY - startY;
      if (!mode) {
        if (Math.hypot(dx, dy) < 8) return;
        // do strany za políčko = trhání, jinak posouvání/podávání
        mode = (frame && Math.abs(dx) > Math.abs(dy) * 1.2) ? "tear" : "scroll";
        if (mode === "tear" && vShots.length > 1) {
          frame.classList.add("pull");
          seamEl = idx > 0 ? frame.previousElementSibling : frame.nextElementSibling;
        } else if (mode === "tear") { mode = "scroll"; }
      }

      if (mode === "scroll") {
        scrollY -= e.clientY - lastY; vel = -(e.clientY - lastY); lastY = e.clientY;
        applyScroll();
        feedHot(-scrollY > FEED);                    // podal jsi proužek dost hluboko?
        return;
      }

      if (mode === "tear") {
        const t = Math.min(1, Math.abs(dx) / TEAR);
        const give = Math.sign(dx) * Math.abs(dx) * (1 - t * .45);      // odpor: čím dál, tím hůř
        frame.style.transform = `translateX(${give}px) rotate(${give * .03}deg)`;
        if (seamEl) {                                                   // perforace se natahuje
          seamEl.style.transform = `scaleY(${1 + t * 2.6})`;
          seamEl.style.opacity = String(1 - t * .5);
        }
        if (t >= 1) tearOff(e.clientX, e.clientY);
      }
    });

    function tearOff(x, y) {
      if (cutting) return; cutting = true;
      const src = vShots[idx];
      const rest = vShots.slice(0, idx).concat(vShots.slice(idx + 1));
      // trhnutí: zbytek pásky sebou cukne
      if (g()) {
        g().fromTo(tapeIn, { x: -6 }, { x: 0, duration: .45, ease: "elastic.out(1, .35)" });
        if (frame) g().to(frame, { opacity: 0, duration: .18 });
        if (seamEl) g().to(seamEl, { opacity: 0, duration: .15 });
      }
      // fotka je teď v ruce
      hand.hidden = false;
      hand.querySelector("img").src = src;
      hand.style.clipPath = tornEdge(idx > 0);
      const host = view.getBoundingClientRect();
      hand.style.left = (x - host.left - hand.offsetWidth / 2) + "px";
      hand.style.top = (y - host.top - hand.offsetHeight / 2) + "px";
      if (g()) g().fromTo(hand, { scale: 1.12, rotate: 0 }, { scale: 1, rotate: -3, duration: .3, ease: "power2.out" });
      handShot = src;
      vShots = rest;
      buildTape();
      note.textContent = "utrženo — hoď to do štěrbiny, nebo pusť dolů";
      mode = "hand";
      cutting = false;
    }

    tape.addEventListener("pointermove", (e) => {
      if (!dragging || mode !== "hand") return;
      const host = view.getBoundingClientRect();
      hand.style.left = (e.clientX - host.left - hand.offsetWidth / 2) + "px";
      hand.style.top = (e.clientY - host.top - hand.offsetHeight / 2) + "px";
      feedHot(overSlot(e.clientX, e.clientY));
    });

    const end = async (e) => {
      const wasMode = mode; mode = null; dragging = false;
      if (frame) { frame.classList.remove("pull"); frame.style.transform = ""; }
      if (seamEl) { seamEl.style.transform = ""; seamEl.style.opacity = ""; }
      frame = null; seamEl = null;

      if (wasMode === "tear") return;                       // nedotáhl — vrátí se samo

      if (wasMode === "hand") {
        const shot = handShot; handShot = null;
        if (overSlot(e.clientX, e.clientY)) {
          await printThing([shot], hand);
        } else {                                            // spadne do hromady
          const made = await composeStrip([shot]);
          const host = pile.getBoundingClientRect();
          dropPiece(made, [shot],
            Math.max(40, Math.min(pile.clientWidth - 40, e.clientX - host.left)),
            Math.max(30, e.clientY - host.top));
          note.textContent = "spadlo dolů";
        }
        hand.hidden = true; hand.style.clipPath = ""; feedHot(false);
        if (vItem && vShots.length) refreshItem(vItem, await composeStrip(vShots), vShots);
        if (!vShots.length) { closeView(); note.textContent = "proužek je rozebraný"; }
        return;
      }

      if (wasMode === "scroll" && pslot.classList.contains("hot")) { await feedStrip(); return; }
      feedHot(false);
    };
    tape.addEventListener("pointerup", end);
    tape.addEventListener("pointercancel", end);
  }

  /* dojezd po pustnutí */
  function tapeInertia() {
    if (view.hidden || feeding || dragging || Math.abs(vel) < .2) return;
    scrollY += vel; vel *= .92;
    if (scrollY < 0) { scrollY += (0 - scrollY) * .2; vel = 0; }
    const m = maxScroll();
    if (scrollY > m) { scrollY += (m - scrollY) * .2; vel = 0; }
    applyScroll();
  }

  function openView(it) {
    vItem = it; vShots = it.data.shots.slice();
    view.hidden = false;
    buildTape();
    hand.hidden = true;
    if (g()) {
      g().fromTo(view, { opacity: 0 }, { opacity: 1, duration: .28 });
      // POZOR: transform na pásce si řídí applyScroll, takže GSAP nesmí sahat
      // na transform — nájezd se dělá přes hodnotu posunu, ne přes yPercent.
      g().fromTo(tapeIn, { opacity: 0 }, { opacity: 1, duration: .4 });
      const proxy = { v: -70 };
      g().to(proxy, { v: 0, duration: .6, ease: "power3.out",
        onUpdate: () => { scrollY = proxy.v; applyScroll(); } });
    }
    setTimeout(applyScroll, 60);
  }
  function closeView() { view.hidden = true; vItem = null; }
  $("#fmViewClose").addEventListener("click", closeView);
  addEventListener("keydown", (e) => { if (!view.hidden && e.key === "Escape") closeView(); });

  /* ---- kousky v hromadě ---- */
  function fitPiece(nat, n) {                      // ← poměr stran bereme z hotového obrázku
    const ph = pile.clientHeight;
    const h = Math.max(70, Math.round(ph * (.12 * n + .07)));
    return { w: Math.round(h * (nat.w / nat.h)), h };
  }
  function dropPiece(made, shotsArr, atX, atY) {
    const { w, h } = fitPiece(made, shotsArr.length);
    addPiece(made.url, { url: made.url, nat: made, shots: shotsArr },
             atX != null ? atX : pile.clientWidth / 2 + (Math.random() - .5) * 80,
             atY != null ? atY : pile.clientHeight * .2,
             w, h, (Math.random() - .5) * 3.5, -1.5, (Math.random() - .5) * .5);
  }
  function refreshItem(it, made, shotsArr) {
    const M = window.Matter;
    it.data = { url: made.url, nat: made, shots: shotsArr };
    it.el.querySelector("img").src = made.url;
    const { w, h } = fitPiece(made, shotsArr.length);
    it.el.style.width = w + "px"; it.el.style.height = h + "px";
    if (M && engine) {
      const pos = it.body.position, ang = it.body.angle;
      M.Composite.remove(engine.world, it.body);
      it.body = M.Bodies.rectangle(pos.x, pos.y, w, h, { restitution: .18, friction: .55, frictionAir: .012, angle: ang });
      M.Composite.add(engine.world, it.body);
    }
  }

  /* ---- přepínač podoby ---- */
  const modes = $("#fmModes");
  modes.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]"); if (!b) return;
    mode = b.dataset.mode; host.dataset.mode = mode;
    [...modes.children].forEach((x) => x.classList.toggle("on", x === b));
  });

  /* ---- presety + tajný panel ---- */
  const looks = $("#fmLooks");
  looks.innerHTML = Object.keys(LOOKS).map((n, i) => `<button type="button" data-look="${n}"${i === 0 ? ' class="on"' : ""}>${n}</button>`).join("");
  looks.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-look]"); if (!b) return;
    G = { ...DEFAULTS, ...LOOKS[b.dataset.look] }; syncPanel(); save();
    [...looks.children].forEach((x) => x.classList.toggle("on", x === b));
  });
  const panel = $("#grade"), body = $("#gradeBody");
  body.innerHTML = PARAMS.map((p) =>
    `<div class="grade-row"><label for="g_${p.k}"><span>${p.t}</span><span id="v_${p.k}">${G[p.k]}</span></label>
     <input type="range" id="g_${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${G[p.k]}"></div>`).join("");
  PARAMS.forEach((p) => $("#g_" + p.k).addEventListener("input", (e) => {
    G[p.k] = parseFloat(e.target.value); $("#v_" + p.k).textContent = e.target.value; save();
  }));
  function syncPanel() { PARAMS.forEach((p) => { const el = $("#g_" + p.k); if (el) { el.value = G[p.k]; $("#v_" + p.k).textContent = String(G[p.k]); } }); }
  function save() { try { localStorage.setItem("javy-grade", JSON.stringify(G)); } catch (e) {} }
  $("#gradeTest").addEventListener("click", async () => {
    if (testImg) { testImg = null; if (!live) host.classList.remove("live"); $("#gradeTest").textContent = "TEST"; return; }
    try {
      const m = await fetch("photos/manifest.json", { cache: "no-cache" }).then((r) => r.json());
      const all = (m.sets || []).flatMap((x) => x.images || []);
      const im = new Image();
      im.onload = () => { testImg = im; host.classList.add("live"); $("#gradeTest").textContent = "TEST ✕"; draw(); };
      im.src = all[Math.floor(Math.random() * all.length)];
    } catch (e) {}
  });
  $("#gradeClose").addEventListener("click", () => (panel.hidden = true));
  $("#gradeReset").addEventListener("click", () => { G = { ...DEFAULTS }; syncPanel(); save(); });
  $("#gradeCopy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText(JSON.stringify(G, null, 2)); $("#gradeCopy").textContent = "ZKOPÍROVÁNO"; setTimeout(() => ($("#gradeCopy").textContent = "KOPÍROVAT"), 1400); }
    catch (e) { console.log(JSON.stringify(G, null, 2)); }
  });
  addEventListener("keydown", (e) => {
    if ((e.key === "g" || e.key === "G") && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test(e.target.tagName || "")) panel.hidden = !panel.hidden;
  });
  const label = $(".s-lab .p-row span");
  if (label) { let n = 0, t0 = 0; label.addEventListener("click", () => {
    const now = Date.now(); n = now - t0 < 700 ? n + 1 : 1; t0 = now;
    if (n >= 3) { n = 0; panel.hidden = !panel.hidden; } }); }
  syncPanel();

  /* ---- kreslení ---- */
  let t = 0;
  function draw() {
    if (!gl || !glOK) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    const w = Math.round(host.clientWidth * dpr), h = Math.round(host.clientHeight * dpr);
    if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; }
    gl.viewport(0, 0, w, h);
    if (srcReady()) {
      const e = srcEl();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, e);
      gl.uniform1f(U.uHasVid, 1);
      const ew = e.videoWidth || e.naturalWidth || 1280, eh = e.videoHeight || e.naturalHeight || 720;
      gl.uniform2f(U.uVidRes, ew, eh);
      const vr = ew / eh, sr = w / h;
      if (vr > sr) gl.uniform2f(U.uCover, sr / vr, 1); else gl.uniform2f(U.uCover, 1, vr / sr);
    } else gl.uniform1f(U.uHasVid, 0);
    gl.uniform1f(U.uTime, t);
    PARAMS.forEach((p) => gl.uniform1f(U[p.k], G[p.k]));
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  let last = 0;
  function loop(ts) {
    requestAnimationFrame(loop);       // naplánovat DŘÍV než cokoli jiného:
    const dt = last ? ts - last : 16.7; // jedna výjimka uvnitř by jinak smyčku zabila napořád
    last = ts; t += dt / 1000;
    try {
      if (!visible) return;
      if (live || testImg) draw();
      if (engine) syncPhysics(dt);
      tapeInertia();
    } catch (err) { console.warn("fotomat:", err); }
  }
  requestAnimationFrame(loop);
  // ladicí přístup (hodí se při doťukávání gradingu)
  window.__fotomat = {
    draw, get stav() { return { visible, live, test: !!testImg, kusu: items.length, G }; },
    // zkouška proužku bez kamery (bere se, co je zrovna na plátně)
    async zkouska() {
      const sh = [grab(), grab(), grab(), grab()];
      const url = await composeStrip(sh);
      await ejectStrip(url, { url, shots: sh });
      return items.length;
    },
  };

  addEventListener("resize", () => { if (engine) buildWalls(); });
  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (!visible && live) { closeCam(); note.textContent = HINT; busy = false; relReset(); }
  }), { threshold: .15 }).observe(scene);
})();
