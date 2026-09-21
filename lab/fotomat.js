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
  }

  /* ---- stav ---- */
  let G = { ...DEFAULTS, ...LOOKS["TERMO"] };
  try { Object.assign(G, JSON.parse(localStorage.getItem("javy-grade") || "{}")); } catch (e) {}
  let video = null, stream = null, live = false, busy = false, shots = [];
  let testImg = null;                      // testovací snímek pro ladění gradingu bez kamery
  const srcEl = () => testImg || video;
  const srcReady = () => { const e = srcEl(); return !!e && (e.tagName === "IMG" ? e.complete && e.naturalWidth : e.readyState >= 2); };
  let mode = "strip", visible = false;

  const host = $("#fm"), count = $("#fmCount"), flash = $("#fmFlash"), note = $("#fmNote");
  const shootB = $("#fmShoot"), saveA = $("#fmSave"), againB = $("#fmAgain");
  const stripEl = $("#fmStrip");
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
    return true;
  }
  function closeCam() {
    live = false; host.classList.remove("live");
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video = null;
  }
  function reset() {
    busy = false; shots = [];
    closeCam();
    [...stripEl.children].forEach((li, i) => { li.classList.remove("on"); li.innerHTML = `<i>${i + 1}</i>`; });
    $("#fmNeg").querySelectorAll("img").forEach((im) => im.remove());
    shootB.hidden = true; saveA.hidden = true; againB.hidden = true;
    count.hidden = true;
    note.textContent = "klikni do plochy";
  }

  /* ---- jeden snímek ---- */
  function grab() {
    draw();
    if (g()) g().fromTo(flash, { opacity: .9 }, { opacity: 0, duration: .4, ease: "power2.out" });
    return cv.toDataURL("image/jpeg", .93);
  }

  /* ---- odpočet ---- */
  async function countdown(n) {
    count.hidden = false;
    for (let i = n; i > 0; i--) {
      count.textContent = String(i);
      if (g()) g().fromTo(count, { scale: .7, opacity: 0 }, { scale: 1, opacity: 1, duration: .3, ease: "back.out(2)" });
      await wait(900);
    }
    count.hidden = true;
  }

  /* ---- 1) PROUŽEK: čtyři snímky za sebou ---- */
  async function runStrip() {
    if (busy) return; busy = true;
    if (!(await openCam())) { busy = false; return; }
    note.textContent = "dívej se do kamery";
    await countdown(3);
    for (let i = 0; i < 4; i++) {
      const url = grab();
      shots.push(url);
      const li = stripEl.children[i];
      li.innerHTML = "";
      const im = new Image(); im.src = url; li.appendChild(im);
      if (g()) g().fromTo(im, { opacity: 0, scale: 1.08 }, { opacity: 1, scale: 1, duration: .45, ease: "power2.out" });
      if (i < 3) { note.textContent = `snímek ${i + 1} / 4`; await wait(1500); }
    }
    note.textContent = "hotovo — proužek je tvůj";
    saveA.href = await composeStrip(shots);
    saveA.download = "javy-fotomat-prouzek.jpg";
    saveA.textContent = "ULOŽIT PROUŽEK ↓";
    saveA.hidden = false; againB.hidden = false;
    closeCam();
    busy = false;
  }

  /* složení proužku: papír, čtyři políčka pod sebou, patička */
  function composeStrip(list) {
    return new Promise((res) => {
      const W = 520, pad = 22, gap = 12, fw = W - pad * 2, fh = Math.round(fw * 4 / 3);   // políčka na výšku
      const H = pad + (fh + gap) * 4 + 64;
      const c = document.createElement("canvas"); c.width = W; c.height = H;
      const x = c.getContext("2d");
      x.fillStyle = "#f3f1ea"; x.fillRect(0, 0, W, H);
      let done = 0;
      list.forEach((src, i) => {
        const im = new Image();
        im.onload = () => {
          // ořez na střed do formátu na výšku (jinak by se obraz zmáčkl)
          const sr = im.width / im.height, dr = fw / fh;
          let sw = im.width, sh = im.height, sx = 0, sy = 0;
          if (sr > dr) { sw = im.height * dr; sx = (im.width - sw) / 2; }
          else { sh = im.width / dr; sy = (im.height - sh) / 2; }
          x.drawImage(im, sx, sy, sw, sh, pad, pad + i * (fh + gap), fw, fh);
          if (++done === list.length) {
            x.fillStyle = "#0c0b09";
            x.font = "700 15px Arial, Helvetica, sans-serif";
            x.fillText("JAVY · FOTOMAT", pad, H - 26);
            const d = new Date();
            const s2 = `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}.${d.getFullYear()}`;
            x.textAlign = "right"; x.fillText(s2, W - pad, H - 26);
            res(c.toDataURL("image/jpeg", .92));
          }
        };
        im.src = src;
      });
    });
  }

  /* ---- 2) POLÍČKO: živý náhled a spoušť ručně ---- */
  async function runNeg() {
    if (busy) return; busy = true;
    if (!(await openCam())) { busy = false; return; }
    note.textContent = "zmáčkni spoušť";
    shootB.hidden = false;
    busy = false;
  }
  shootB.addEventListener("click", async () => {
    if (!live) return;
    await countdown(3);
    const url = grab();
    const im = new Image(); im.src = url;
    im.style.cssText = "position:absolute;inset:0;width:100%;height:100%;object-fit:cover";
    $("#fmNeg").appendChild(im);
    host.classList.remove("live");
    saveA.href = url; saveA.download = "javy-fotomat.jpg"; saveA.textContent = "ULOŽIT ↓";
    saveA.hidden = false; againB.hidden = false; shootB.hidden = true;
    note.textContent = "hotovo";
    closeCam();
  });

  againB.addEventListener("click", () => { reset(); });

  /* ---- spuštění kliknutím do plochy ---- */
  host.addEventListener("click", (e) => {
    if (busy || live || e.target.closest(".fm-bar")) return;
    if (shots.length || $("#fmNeg").querySelector("img")) return;
    mode === "strip" ? runStrip() : runNeg();
  });

  /* ---- přepínač podoby ---- */
  const modes = $("#fmModes");
  modes.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-mode]"); if (!b) return;
    mode = b.dataset.mode;
    host.dataset.mode = mode;
    [...modes.children].forEach((x) => x.classList.toggle("on", x === b));
    reset();
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
    if (testImg) { testImg = null; host.classList.remove("live"); $("#gradeTest").textContent = "TEST"; return; }
    try {
      const m = await fetch("photos/manifest.json", { cache: "no-cache" }).then((r) => r.json());
      const all = (m.sets || []).flatMap((x) => x.images || []);
      const im = new Image(); im.crossOrigin = "anonymous";
      im.onload = () => { testImg = im; host.classList.add("live"); $("#gradeTest").textContent = "TEST ✕"; };
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
  function loop() {
    t += 1 / 60;
    if (visible && (live || testImg)) draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (!visible && (live || shots.length)) reset();   // při odchodu ze scény vypni kameru
  }), { threshold: .15 }).observe(scene);
})();
