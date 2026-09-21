/* ============================================================
   JAVY — FOTOMAT (scéna 03)
   Nejdřív 3D foťák na černé. Klik = nájezd objektivem dovnitř a
   z hledáčku začne koukat obraz z kamery návštěvníka, přebarvený
   mým gradingem (vlastní shader, ne CSS filtry).

   Tajný panel: klávesa G nebo trojklik na popisek „03 — FOTOMAT".
   Mění všechny parametry gradingu, ukládá se do localStorage a
   tlačítkem KOPÍROVAT vypadne JSON, který jde zapsat jako výchozí.

   Model: lab/camera.glb (Draco). Stream z kamery nikam neodchází.
   ============================================================ */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const $ = (s, r = document) => r.querySelector(s);
const scene = $(".s-lab");

/* ---- parametry gradingu: jeden seznam pro shader, panel i presety ---- */
const PARAMS = [
  { k: "exposure", t: "EXPOZICE", min: -3, max: 3, step: .01, v: 0.25 },
  { k: "contrast", t: "KONTRAST", min: 0, max: 2.5, step: .01, v: 1.45 },
  { k: "gamma", t: "GAMA", min: .4, max: 2.2, step: .01, v: 1.0 },
  { k: "lift", t: "ZDVIH STÍNŮ", min: -.2, max: .3, step: .005, v: -0.02 },
  { k: "gain", t: "ZISK SVĚTEL", min: .5, max: 1.8, step: .01, v: 1.06 },
  { k: "scurve", t: "S-KŘIVKA", min: 0, max: 1, step: .01, v: 0.35 },
  { k: "black", t: "ČERNÝ BOD", min: 0, max: .3, step: .005, v: 0.03 },
  { k: "white", t: "BÍLÝ BOD", min: .7, max: 1.1, step: .005, v: 0.97 },
  { k: "sat", t: "SYTOST", min: 0, max: 1.6, step: .01, v: 0.0 },
  { k: "temp", t: "TEPLOTA", min: -.3, max: .3, step: .005, v: 0.0 },
  { k: "tint", t: "ODSTÍN", min: -.3, max: .3, step: .005, v: 0.0 },
  { k: "grain", t: "ZRNO", min: 0, max: .6, step: .005, v: 0.16 },
  { k: "grainSize", t: "VELIKOST ZRNA", min: .5, max: 4, step: .1, v: 1.4 },
  { k: "halation", t: "HALACE", min: 0, max: 1.2, step: .01, v: 0.35 },
  { k: "sharp", t: "DOOSTŘENÍ", min: 0, max: 1.5, step: .01, v: 0.35 },
  { k: "vignette", t: "VINĚTACE", min: 0, max: 1.6, step: .01, v: 0.75 },
  { k: "vigSoft", t: "MĚKKOST VINĚTY", min: .2, max: 1.2, step: .01, v: 0.6 },
  { k: "barrel", t: "SOUDKOVITOST", min: -.4, max: .6, step: .005, v: 0.12 },
];
const DEFAULTS = Object.fromEntries(PARAMS.map((p) => [p.k, p.v]));

const LOOKS = {
  "KLUB":   { exposure: .35, contrast: 1.7, sat: 0, grain: .22, halation: .5, vignette: 1.0, scurve: .5 },
  "BLESK":  { exposure: .7, contrast: 1.5, sat: 0, grain: .12, halation: .9, vignette: .5, white: 1.0, gain: 1.2 },
  "FILM":   { exposure: .1, contrast: 1.25, sat: .25, grain: .34, grainSize: 2.1, halation: .3, vignette: .8, temp: .06 },
  "SYROVÝ": { exposure: 0, contrast: 1.0, sat: 1.0, grain: .05, halation: 0, vignette: .25, scurve: 0, barrel: 0 },
};

const FRAG = `
precision highp float;
uniform sampler2D tVid;
uniform vec2 uCover;      // korekce poměru stran
uniform vec2 uVidRes;     // rozlišení videa (pro odběry sousedních pixelů)
uniform float uTime, uHasVid;
${PARAMS.map((p) => `uniform float u_${p.k};`).join("\n")}
varying vec2 vUv;

float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
vec3 sampleVid(vec2 uv){ return texture2D(tVid, uv).rgb; }

void main(){
  vec2 uv = (vUv - .5);
  // soudkovité zkreslení (jako širokoúhlý objektiv)
  float r2 = dot(uv, uv);
  uv *= 1.0 + u_barrel * r2;
  vec2 c = uv * uCover + .5;
  c.x = 1.0 - c.x;                       // zrcadlově, jak to lidi čekají

  if (uHasVid < .5 || c.x < 0.0 || c.x > 1.0 || c.y < 0.0 || c.y > 1.0) {
    gl_FragColor = vec4(0.027, 0.027, 0.024, 1.0); return;
  }

  vec3 col = sampleVid(c);

  // doostření (3 odběry kolem)
  if (u_sharp > .001) {
    vec2 px = vec2(1.6) / max(uVidRes, vec2(1.0));
    vec3 blur = (sampleVid(c + vec2(px.x, 0.)) + sampleVid(c - vec2(px.x, 0.)) +
                 sampleVid(c + vec2(0., px.y)) + sampleVid(c - vec2(0., px.y))) * .25;
    col += (col - blur) * u_sharp;
  }

  col *= pow(2.0, u_exposure);
  col = (col - u_black) / max(.001, u_white - u_black);      // černý a bílý bod
  col = u_lift + col * (u_gain - u_lift);                    // zdvih / zisk
  col = pow(max(col, 0.0), vec3(1.0 / max(.05, u_gamma)));
  col = (col - .5) * u_contrast + .5;                        // kontrast
  vec3 sc = col * col * (3.0 - 2.0 * col);                   // S-křivka
  col = mix(col, sc, u_scurve);

  col.r *= 1.0 + u_temp; col.b *= 1.0 - u_temp;              // teplota
  col.g *= 1.0 + u_tint;                                      // odstín
  float l = dot(col, vec3(.2126, .7152, .0722));
  col = mix(vec3(l), col, u_sat);                             // sytost (0 = čb)

  // halace: rozpité světlo kolem přepalů
  if (u_halation > .001) {
    vec2 px = vec2(3.5) / max(uVidRes, vec2(1.0));
    vec3 s = vec3(0.0);
    s += sampleVid(clamp(c + px * vec2(1.,1.), 0.001, .999));
    s += sampleVid(clamp(c + px * vec2(-1.,1.), 0.001, .999));
    s += sampleVid(clamp(c + px * vec2(1.,-1.), 0.001, .999));
    s += sampleVid(clamp(c + px * vec2(-1.,-1.), 0.001, .999));
    s *= .25;
    float sl = dot(s, vec3(.2126, .7152, .0722));
    col += max(0.0, sl - .62) * u_halation * vec3(1.0, .96, .92);
  }

  // zrno
  float g = hash(floor(gl_FragCoord.xy / max(.5, u_grainSize)) + fract(uTime) * 97.13) - .5;
  col += g * u_grain;

  // vinětace
  float v = 1.0 - smoothstep(u_vigSoft * .35, 1.05, length(vUv - .5) * 1.42);
  col *= mix(1.0, v, clamp(u_vignette, 0.0, 1.6));

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}`;

const VERT = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;

function init() {
  const host = $("#fm"), cv = $("#fmGL"), veil = $("#fmVeil"), enter = $("#fmEnter");
  const vf = $("#fmVf"), print = $("#fmPrint"), flash = $("#fmFlash"), note = $("#fmNote"), fade = $("#fmFade");
  const shootB = $("#fmShoot"), saveA = $("#fmSave"), againB = $("#fmAgain");

  /* ---- hodnoty gradingu ---- */
  let G = { ...DEFAULTS };
  try { Object.assign(G, JSON.parse(localStorage.getItem("javy-grade") || "{}")); } catch (e) {}

  const renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, alpha: false });
  renderer.setClearColor(0x070706, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  /* ---- scéna 1: foťák ---- */
  const s3 = new THREE.Scene();
  const cam3 = new THREE.PerspectiveCamera(38, 1, .1, 100);
  cam3.position.set(0, .45, 4.0);
  // bez prostředí vypadá černé tělo jako placka — PMREM dodá odlesky
  const pmrem = new THREE.PMREMGenerator(renderer);
  s3.environment = pmrem.fromScene(new RoomEnvironment(), 0.03).texture;
  s3.add(new THREE.AmbientLight(0xffffff, .25));
  const key = new THREE.DirectionalLight(0xffffff, 3.2); key.position.set(3, 4, 3); s3.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 3.4); rim.position.set(-4, 1.5, -3); s3.add(rim);
  const fill = new THREE.DirectionalLight(0xffd9b0, 1.1); fill.position.set(-2, -2, 2); s3.add(fill);

  let model = null, modelReady = false;
  const draco = new DRACOLoader().setDecoderPath("https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/libs/draco/");
  new GLTFLoader().setDRACOLoader(draco).load("lab/camera.glb", (g) => {
    model = g.scene;
    model.traverse((o) => {
      if (o.isMesh) o.material = new THREE.MeshStandardMaterial({ color: 0x1b1b17, metalness: .82, roughness: .28, envMapIntensity: 1.3 });
    });
    const box = new THREE.Box3().setFromObject(model);
    const c = box.getCenter(new THREE.Vector3());
    model.position.sub(c);
    s3.add(model); modelReady = true;
  }, undefined, () => { note.textContent = "3D model se nenačetl — fotomat funguje i tak"; });

  /* ---- scéna 2: hledáček ---- */
  const s2 = new THREE.Scene();
  const cam2 = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    tVid: { value: null }, uCover: { value: new THREE.Vector2(1, 1) },
    uVidRes: { value: new THREE.Vector2(1280, 720) }, uTime: { value: 0 }, uHasVid: { value: 0 },
  };
  PARAMS.forEach((p) => (uniforms["u_" + p.k] = { value: G[p.k] }));
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), new THREE.ShaderMaterial({
    vertexShader: VERT, fragmentShader: FRAG, uniforms,
  }));
  s2.add(quad);

  /* ---- kamera zařízení ---- */
  let video = null, stream = null, tex = null, live = false, phase = "idle";
  async function openCam() {
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 } }, audio: false });
    } catch (e) {
      note.textContent = "kameru se nepodařilo spustit — povol přístup v prohlížeči";
      return false;
    }
    video = document.createElement("video");
    video.playsInline = true; video.muted = true; video.srcObject = stream;
    await video.play().catch(() => {});
    tex = new THREE.VideoTexture(video);
    tex.colorSpace = THREE.SRGBColorSpace;
    uniforms.tVid.value = tex; uniforms.uHasVid.value = 1;
    uniforms.uVidRes.value.set(video.videoWidth || 1280, video.videoHeight || 720);
    live = true; return true;
  }
  function closeCam() {
    live = false; uniforms.uHasVid.value = 0;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video = null;
    if (tex) { tex.dispose(); tex = null; }
  }

  /* ---- nájezd do objektivu ---- */
  let anim = null;
  const easeInOut = (t) => (t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const HOME = new THREE.Vector3(0, .45, 4.0);
  /* kam dojede pohled: očnice hledáčku. Model je vycentrovaný a zvětšený tak,
     že nejdelší rozměr = 2, takže se dá zamířit zlomkem rozměrů. */
  const EYE = { x: -0.30, y: 0.30, z: -0.30 };   // vlevo nahoře na zádech těla
  function eyePoint() {
    const b = new THREE.Box3().setFromObject(model || new THREE.Object3D());
    const sz = b.getSize(new THREE.Vector3());
    return new THREE.Vector3(sz.x * EYE.x, sz.y * EYE.y, sz.z * EYE.z);
  }
  function backToIdle() {                     // couvnutí zpět k foťáku
    phase = "zoom";
    vf.hidden = true; shootB.hidden = true;
    fade.classList.remove("on");
    const from = cam3.position.clone(), t0 = performance.now(), dur = 800;
    anim = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      cam3.position.lerpVectors(from, HOME, easeInOut(p));
      cam3.lookAt(0, 0, 0);
      if (p >= 1) { anim = null; phase = "idle"; veil.classList.remove("gone"); }
    };
  }
  function enterFotomat() {
    if (phase !== "idle") return;
    phase = "zoom";
    veil.classList.add("gone");
    const t0 = performance.now(), dur = 2600;
    const startR = Math.hypot(cam3.position.x, cam3.position.z), startY = cam3.position.y;
    const startA = Math.atan2(cam3.position.x, cam3.position.z);
    const eye = eyePoint();
    let camPromise = null, faded = false;
    anim = () => {
      const p = Math.min(1, (performance.now() - t0) / dur);
      // model během nájezdu srovnej do výchozí polohy, ať oblet vždycky
      // skončí za zády (jinak by záleželo na tom, kde ho klik zastihne)
      if (model) model.rotation.y += (0 - model.rotation.y) * .06;

      const A_END = startA + Math.PI * 1.12;     // oblet ~200° dozadu
      const R_END = 1.6;
      if (p < .62) {
        // 1. fáze: foťák se obletí a pohled se přiblíží
        const q = easeInOut(p / .62);
        const a = startA + (A_END - startA) * q;
        const r = startR + (R_END - startR) * q;
        cam3.position.set(Math.sin(a) * r, startY + (.16 - startY) * q, Math.cos(a) * r);
        cam3.lookAt(0, 0, 0);
      } else {
        // 2. fáze: dojezd k očnici hledáčku (zastav těsně za tělem, ne uvnitř)
        const q = easeInOut((p - .62) / .38);
        const from = new THREE.Vector3(Math.sin(A_END) * R_END, .16, Math.cos(A_END) * R_END);
        const to = new THREE.Vector3(eye.x, eye.y, eye.z - .55);
        cam3.position.lerpVectors(from, to, q);
        cam3.lookAt(eye.x, eye.y, eye.z);
      }
      if (!camPromise && p > .25) camPromise = openCam();
      if (p > .86 && !faded) { faded = true; fade.classList.add("on"); }
      if (p >= 1) {
        anim = null;
        (camPromise || Promise.resolve(false)).then((ok) => {
          if (ok) {
            phase = "live"; vf.hidden = false; shootB.hidden = false;
            setTimeout(() => fade.classList.remove("on"), 60);
          } else { fade.classList.remove("on"); backToIdle(); }
        });
      }
    };
  }
  enter.addEventListener("click", enterFotomat);
  host.addEventListener("click", (e) => { if (phase === "idle" && e.target === cv) enterFotomat(); });

  /* ---- spoušť ---- */
  shootB.addEventListener("click", () => {
    if (phase !== "live") return;
    flash.classList.remove("go"); void flash.offsetWidth; flash.classList.add("go");
    renderer.render(s2, cam2);
    const url = renderer.domElement.toDataURL("image/jpeg", .93);
    print.src = url; print.hidden = false;
    saveA.href = url; saveA.hidden = false; againB.hidden = false; shootB.hidden = true;
    phase = "shot";
  });
  againB.addEventListener("click", () => {
    print.hidden = true; saveA.hidden = true; againB.hidden = true;
    shootB.hidden = false; phase = live ? "live" : "idle";
    if (!live) { veil.classList.remove("gone"); vf.hidden = true; }
  });

  /* ---- volba vzhledu ---- */
  const looksHost = $("#fmLooks");
  looksHost.innerHTML = Object.keys(LOOKS).map((n, i) => `<button type="button" data-look="${n}"${i === 0 ? ' class="on"' : ""}>${n}</button>`).join("");
  looksHost.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-look]"); if (!b) return;
    Object.assign(G, DEFAULTS, LOOKS[b.dataset.look]);
    push(); syncPanel(); save();
    [...looksHost.children].forEach((x) => x.classList.toggle("on", x === b));
  });
  Object.assign(G, DEFAULTS, LOOKS["KLUB"]);

  /* ---- tajný panel ---- */
  const panel = $("#grade"), body = $("#gradeBody");
  body.innerHTML = PARAMS.map((p) =>
    `<div class="grade-row"><label for="g_${p.k}"><span>${p.t}</span><span id="v_${p.k}">${G[p.k]}</span></label>
     <input type="range" id="g_${p.k}" min="${p.min}" max="${p.max}" step="${p.step}" value="${G[p.k]}"></div>`).join("");
  PARAMS.forEach((p) => {
    const el = $("#g_" + p.k);
    el.addEventListener("input", () => {
      G[p.k] = parseFloat(el.value);
      $("#v_" + p.k).textContent = el.value;
      uniforms["u_" + p.k].value = G[p.k];
      save();
    });
  });
  function syncPanel() {
    PARAMS.forEach((p) => { const el = $("#g_" + p.k); if (el) { el.value = G[p.k]; $("#v_" + p.k).textContent = String(G[p.k]); } });
  }
  function push() { PARAMS.forEach((p) => (uniforms["u_" + p.k].value = G[p.k])); }
  function save() { try { localStorage.setItem("javy-grade", JSON.stringify(G)); } catch (e) {} }
  $("#gradeClose").addEventListener("click", () => (panel.hidden = true));
  $("#gradeReset").addEventListener("click", () => { G = { ...DEFAULTS }; push(); syncPanel(); save(); });
  $("#gradeCopy").addEventListener("click", async () => {
    const txt = JSON.stringify(G, null, 2);
    try { await navigator.clipboard.writeText(txt); $("#gradeCopy").textContent = "ZKOPÍROVÁNO"; setTimeout(() => ($("#gradeCopy").textContent = "KOPÍROVAT"), 1400); }
    catch (e) { console.log(txt); }
  });
  addEventListener("keydown", (e) => {
    if ((e.key === "g" || e.key === "G") && !e.metaKey && !e.ctrlKey && !/input|textarea/i.test((e.target.tagName || ""))) panel.hidden = !panel.hidden;
  });
  // trojklik na popisek sekce = stejné jako G (funguje i na telefonu)
  const label = [...document.querySelectorAll(".s-lab .p-row span")][0];
  if (label) {
    let n = 0, t0 = 0;
    label.style.cursor = "default";
    label.addEventListener("click", () => {
      const now = Date.now(); n = now - t0 < 700 ? n + 1 : 1; t0 = now;
      if (n >= 3) { n = 0; panel.hidden = !panel.hidden; }
    });
  }
  push(); syncPanel();
  renderer.render(s2, cam2);   // smoke test: kdyby shader neprošel, vyskočí to hned

  /* ---- rozměry + smyčka ---- */
  function size() {
    const w = host.clientWidth, h = host.clientHeight;
    renderer.setPixelRatio(Math.min(2, devicePixelRatio || 1));
    renderer.setSize(w, h, false);
    cam3.aspect = w / h; cam3.updateProjectionMatrix();
    fitCover(w, h);
  }
  function fitCover(w, h) {
    if (!video || !video.videoWidth) { uniforms.uCover.value.set(1, 1); return; }
    const vr = video.videoWidth / video.videoHeight, sr = w / h;
    // uv se násobí -> menší hodnota = větší přiblížení v dané ose
    if (vr > sr) uniforms.uCover.value.set(sr / vr, 1);
    else uniforms.uCover.value.set(1, vr / sr);
  }
  addEventListener("resize", size);
  size();

  let visible = false;
  new IntersectionObserver((es) => es.forEach((e) => {
    visible = e.isIntersecting;
    if (!visible && (phase === "live" || phase === "shot")) {
      closeCam(); phase = "idle"; veil.classList.remove("gone"); vf.hidden = true;
      shootB.hidden = true; againB.hidden = true; saveA.hidden = true; print.hidden = true;
      cam3.position.set(0, .45, 4.0); cam3.lookAt(0, 0, 0);
    }
  }), { threshold: .15 }).observe(scene);

  let mx = 0, my = 0;
  host.addEventListener("pointermove", (e) => {
    const r = host.getBoundingClientRect();
    mx = ((e.clientX - r.left) / r.width - .5) * 2;
    my = ((e.clientY - r.top) / r.height - .5) * 2;
  });

  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = clock.getDelta();
    if (!visible) return;
    uniforms.uTime.value += dt;
    if (anim) anim();
    if (phase === "live" || phase === "shot") {
      if (video && video.videoWidth) fitCover(host.clientWidth, host.clientHeight);
      renderer.render(s2, cam2);
    } else {
      if (modelReady && model) {
        model.rotation.y += dt * .25;                        // pomalu se otáčí
        model.rotation.x += (my * .18 - model.rotation.x) * .05;   // lehce reaguje na myš
        model.position.x += (mx * .12 - model.position.x) * .05;
      }
      renderer.render(s3, cam3);
    }
  });
}

/* spustit až po deklaracích výše (jinak by init sáhl na DEFAULTS v mrtvé zóně) */
if (scene) init();
