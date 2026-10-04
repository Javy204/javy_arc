/* =========================================================
   VRgD — index page motion
   Cursor, scramble, menu and clock live in shared.js.
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(ScrollTrigger, SplitText, Flip, CustomEase, Observer);

  const { REDUCED, CAN_HOVER, $, $$ } = window.VRGD;

  /* =======================================================
     1. Smooth scroll — Lenis driven by the GSAP ticker
     ======================================================= */
  const lenis = new Lenis({ anchors: false, allowNestedScroll: true, lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  window.VRGD.lenis = lenis;   // lets shared.js pause it for the menu

  const scrollTo = (target) => lenis.scrollTo(target, { offset: 0, duration: 1.4 });

  /* The fixed chrome carries no backdrop, so it recolours itself whenever a
     dark surface is actually behind it. Any element can register as one. */
  function registerDarkSurface(el, when = () => true) {
    const navbar = $('[data-navbar]');
    const navH = navbar ? (parseFloat(getComputedStyle(navbar).minHeight) || 72) : 72;

    if (navbar) {
      ScrollTrigger.create({
        trigger: el,
        start: `top top+=${navH}`,
        end: 'bottom top',
        onToggle: (self) => { if (when()) navbar.classList.toggle('on-invert', self.isActive); }
      });
    }
    [$('.sidenav'), $('[data-spine]')].filter(Boolean).forEach((node) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => { if (when()) node.classList.toggle('on-invert', self.isActive); }
      });
    });
  }

  /* =======================================================
     2. Reveals
     Prose  → SplitText words, Flip from ragged to justified.
     Titles → word stagger rising into place.
     ======================================================= */
  function initReveals() {
    $$('[data-scramble-reveal]').forEach((root) => {
      const isHeading = /^H[1-4]$/.test(root.tagName);

      if (isHeading || REDUCED) {
        const split = new SplitText(root, { type: 'words', wordsClass: 'word' });
        gsap.from(split.words, {
          yPercent: 115,
          opacity: 0,
          duration: REDUCED ? 0.01 : 1,
          ease: 'expo.out',
          stagger: 0.035,
          scrollTrigger: { trigger: root, start: 'top 85%', once: true }
        });
        return;
      }

      // Prose: measure ragged-left, then Flip into justified.
      const blocks = $$('p', root).length ? $$('p', root) : [root];
      const split = new SplitText(blocks, { type: 'words', wordsClass: 'word' });

      ScrollTrigger.create({
        trigger: root,
        start: 'top 85%',
        once: true,
        onEnter() {
          split.words.forEach((w) => {
            const r = w.getBoundingClientRect();
            w.style.width = `${r.width}px`;
            w.style.whiteSpace = 'nowrap';
          });
          const state = Flip.getState(split.words);
          split.words.forEach((w) => { w.style.width = ''; w.style.whiteSpace = ''; });
          blocks.forEach((b) => { b.style.textAlign = 'justify'; });
          Flip.from(state, {
            duration: 1,
            ease: 'expo.out',
            stagger: { amount: 0.3, from: 'start' }
          });
        }
      });
    });
  }

  /* =======================================================
     3. Dithered backdrop — stands in until hero.mp4 exists
     ======================================================= */
  function initDither() {
    const canvas = $('[data-dither]');
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    const W = 180, H = 101;
    canvas.width = W; canvas.height = H;

    const BAYER = [
      [0, 8, 2, 10], [12, 4, 14, 6],
      [3, 11, 1, 9], [15, 7, 13, 5]
    ];
    const img = ctx.createImageData(W, H);
    let t = 0, raf = null, running = true;
    let dark = document.documentElement.getAttribute('data-theme') === 'dark';

    // Repaint once on a theme flip, even if the loop has already stopped.
    window.addEventListener('vrgd:theme', () => {
      dark = document.documentElement.getAttribute('data-theme') === 'dark';
      draw();
    });

    function draw() {
      t += 0.016;
      const d = img.data;
      for (let y = 0; y < H; y++) {
        const dy = (y / H - 0.5) * 2;
        for (let x = 0; x < W; x++) {
          const n =
            (Math.sin(x * 0.035 + t * 0.7) +
             Math.sin(y * 0.055 - t * 0.5) +
             Math.sin((x + y) * 0.022 + t) +
             Math.sin(Math.hypot(x - W / 2, y - H / 2) * 0.05 - t * 1.2)) / 4;

          // Soft lit blob at centre, dissolving to clean paper at the edges.
          const dx = (x / W - 0.5) * 2;
          const glow = Math.max(0, 1 - Math.hypot(dx, dy) * 0.92);
          const v = (0.5 + n * 0.5) * glow * glow * 0.85;

          const threshold = (BAYER[y & 3][x & 3] + 0.5) / 16;
          const i = (y * W + x) * 4;
          // Faint ink on the page ground — a texture, not a pattern. The
          // logotype must win in either theme.
          const shade = v > threshold * 1.25
            ? (dark ? 26 + Math.round(v * 26) : 231 - Math.round(v * 22))
            : (dark ? 11 : 244);
          d[i] = shade; d[i + 1] = shade; d[i + 2] = shade + (dark ? 1 : -2); d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
    }

    function frame() {
      if (!running) return;
      draw();
      raf = setTimeout(() => requestAnimationFrame(frame), 55); // ~18fps, on purpose
    }

    const stop = () => { running = false; clearTimeout(raf); };

    if (REDUCED) { frame(); stop(); return; }
    frame();

    // initHeroVideo owns loading and playback; the canvas just steps aside once
    // the footage can draw.
    const video = $('[data-hero-video]');
    if (video) {
      video.addEventListener('loadeddata', () => gsap.delayedCall(1.3, stop), { once: true });
    }

    ScrollTrigger.create({
      trigger: '.hero',
      start: 'top bottom', end: 'bottom top',
      onLeave: stop,
      onEnterBack: () => { if (!running && !$('[data-hero-video][data-ready="true"]')) { running = true; frame(); } }
    });
  }

  /* =======================================================
     4. Loader — counter, bar, then the plate opens to full bleed
     ======================================================= */
  function initLoader() {
    const media = $('[data-hero-media]');
    const loader = $('[data-loader]');

    const settle = () => {
      document.body.setAttribute('data-loading', 'false');
      lenis.start();
      ScrollTrigger.refresh();
    };

    if (!media) { settle(); return; }

    const items = $$('[data-loader-item]');
    const text = $('[data-loader-text]');
    const bar = $('[data-loader-bar]');
    const logo = $('[data-hero-logo]');
    const reveal = ['.navbar', '.sidenav', '.spine', '[data-hero-bottom]', '[data-hero-markers]'];

    // Second visit in this tab: skip straight to the resting state.
    if (sessionStorage.getItem('vrgdIntro') || REDUCED) {
      gsap.set(media, { width: '100vw', height: '100vh', autoAlpha: 1 });
      gsap.set(items, { autoAlpha: 0 });
      gsap.set(loader, { autoAlpha: 0 });
      gsap.set(logo, { scale: 1 });
      gsap.set(reveal, { autoAlpha: 1, y: 0 });
      settle();
      return;
    }

    lenis.stop();
    gsap.set(media, { width: 0, height: 0, autoAlpha: 0 });
    gsap.set(logo, { scale: 0.42 });

    const counter = { value: 0 };
    gsap.to(counter, {
      value: 100,
      duration: 2.1,
      ease: 'power2.inOut',
      onUpdate() {
        const v = Math.round(counter.value);
        if (text) text.textContent = `${v}%`;
        if (bar) bar.style.width = `${v}%`;
      }
    });

    const isMobile = window.matchMedia('(max-width: 767px)').matches;
    const tl = gsap.timeline({
      defaults: { ease: 'power4.inOut' },
      onComplete() { sessionStorage.setItem('vrgdIntro', '1'); settle(); }
    });

    tl.to(items, { autoAlpha: 1, duration: 0.6, ease: 'power2.out' })
      .to(media, { autoAlpha: 1, duration: 0.05 }, '-=0.3')
      .to(media, { width: '4rem', height: '4rem', duration: 0.6, ease: 'power4.out' }, '-=0.3')
      .to({}, { duration: 0.2 })
      .to(media, {
        width: isMobile ? '65vw' : '45vw',
        height: isMobile ? '65vw' : '25vw',
        duration: 0.8
      })
      .to(logo, { scale: 0.78, duration: 0.8 }, '<')
      .to({}, { duration: 0.25 })
      .to(media, { width: '100vw', height: '100vh', duration: 0.9 })
      .to(logo, { scale: 1, duration: 0.9 }, '<')
      .to(items, { autoAlpha: 0, duration: 0.5, ease: 'power2.in' }, '<')
      .to(loader, { autoAlpha: 0, duration: 0.5 }, '<')
      .to('.navbar', { autoAlpha: 1, y: 0, duration: 1, ease: 'power4.out' }, '-=0.35')
      .to('.sidenav', { autoAlpha: 1, duration: 1, ease: 'power4.out' }, '<')
      .to('.spine', { autoAlpha: 1, duration: 1.2, ease: 'power2.out' }, '<')
      .to('[data-hero-bottom]', { autoAlpha: 1, y: 0, duration: 1, ease: 'power4.out' }, '<+0.1')
      .to('[data-hero-markers]', { autoAlpha: 1, duration: 0.8, ease: 'power4.out' }, '<');
  }

  /* =======================================================
     4b. Hero footage — a plain muted loop.
     Attached only once we know the file is there, so a missing
     hero.mp4 leaves the halftone canvas in place.
     ======================================================= */
  function initHeroVideo() {
    const hero = $('.hero');
    const video = $('[data-hero-video]');
    const src = video?.getAttribute('data-src');
    if (!hero || !video || !src) return;

    fetch(src, { method: 'HEAD' })
      .then((res) => { if (res.ok) arm(); })
      .catch(() => {});

    function arm() {
      video.src = src;
      video.load();

      video.addEventListener('loadeddata', () => {
        video.play().catch(() => {});
        video.setAttribute('data-ready', 'true');

        // Footage turns the hero into a dark surface: the scrim darkens, the
        // logotype and lede go light, and the fixed chrome flips with it.
        hero.classList.add('has-video');
        registerDarkSurface(hero);
      }, { once: true });
    }
  }

  /* =======================================================
     5. Hero — parallax and the red plate drifting off register
     ======================================================= */
  function initHero() {
    const logo = $('[data-hero-logo]');
    if (!logo) return;

    if (!REDUCED) {
      gsap.to('[data-hero-parallax]', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'bottom bottom', end: 'bottom top', scrub: true }
      });
      // No scale here — the loader owns that channel and a scrub would fight it.
      gsap.to(logo, {
        yPercent: -18,
        autoAlpha: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'bottom bottom+=25%', end: 'bottom top', scrub: true }
      });
    }

    const r = $('.split--r', logo);
    if (!r || !CAN_HOVER || REDUCED) return;
    const setRX = gsap.quickTo(r, 'x', { duration: 0.9, ease: 'power3.out' });
    const setRY = gsap.quickTo(r, 'y', { duration: 0.9, ease: 'power3.out' });

    window.addEventListener('mousemove', (e) => {
      const dx = (e.clientX / window.innerWidth - 0.5) * 2;
      const dy = (e.clientY / window.innerHeight - 0.5) * 2;
      setRX(dx * 5); setRY(dy * 3.5);
    });
  }

  /* =======================================================
     6. Work — one big photo on a dark stage, chrome swirl behind it.
     The swirl (assets/work-deco/blob-packed.mp4) is pure background: it
     loops forever and only ever speeds up a touch during a change,
     so it ties the four projects together without doing anything
     loud. Changing project is one move: the next photo wipes in over
     the current one (clip-path, direction follows prev/next) while
     its image settles from a slight zoom and the title letters swap.
     Data comes from work.json, the same file project.js reads.
     ======================================================= */
  async function initSpotlight() {
    const root = $('[data-spotlight]');
    const video = $('[data-blob-video]', root || document);
    const frame = $('[data-spotlight-frame]', root || document);
    if (!root || !frame) return;

    // Arriving back from a project page: name this whole block so the
    // page's hero (always named project-hero) shrinks back into it.
    if (document.referrer.includes('project.html')) {
      root.style.viewTransitionName = 'project-hero';
    }

    let projects = [];
    try {
      const res = await fetch('assets/work.json');
      if (res.ok) projects = (await res.json()).projects || [];
    } catch { /* leaves the stage empty rather than break the page */ }
    if (!projects.length) return;

    const N = projects.length;
    const pad2 = (n) => String(n).padStart(2, '0');
    const workCount = $('[data-work-count]');
    if (workCount) workCount.textContent = `[${pad2(N)}]`;

    const metaEl = $('[data-spotlight-meta]', root);
    const countEl = $('[data-spotlight-count]', root);
    const titleEl = $('[data-spotlight-title]', root);
    const indexEl = $('[data-spotlight-index]', root);
    const layers = { a: $('[data-layer="a"]', frame), b: $('[data-layer="b"]', frame) };
    const imgOf = (k) => layers[k].firstElementChild;

    // WORK follows the page theme (white by default); it only goes dark while a swirl is shown.
    registerDarkSurface(root, () => root.classList.contains('has-swirl'));

    indexEl.innerHTML = projects.map((p, i) => `
      <li><button data-i="${i}" data-cursor-hover data-cursor-text="GO">
        <span class="mono">${pad2(i + 1)}</span><span class="spotlight__index-name">${p.title}</span><i></i>
      </button></li>`).join('');
    const indexBtns = $$('button', indexEl);

    const srcOf = (p) => p.preview || p.hero?.src;   // landscape, already B&W
    projects.forEach((p) => { new Image().src = srcOf(p); });   // warm the cache

    const setImg = (el, i) => {
      el.src = srcOf(projects[i]);
      const [fx, fy] = projects[i].focus || [.5, .5];
      el.style.objectPosition = `${fx * 100}% ${fy * 100}%`;
    };

    /* ---------- Swirl: two instances, background + depth-split front layer ----------
       One packed clip (chrome | matte, 1920 each), drawn up to twice (A and
       B, each with its own size / position / rotation / mirror / layering).
       The background canvas draws the chrome half behind the photo. The
       front layer (WebGL, over the photo, clipped to the frame) draws the
       same frame with the matte as alpha, but only where that instance's
       *depth field* says "in front". The clip has no real depth, so the
       field is synthetic and tunable per instance: a linear gradient
       (direction / offset), optionally a painted heightmap, optionally the
       chrome's own brightness. Everything is in the TUNE panel (button in
       the HUD, or key C). */
    const TUNE_KEY = 'vrgd-work-tune';
    const SW_DEFAULTS = {
      on: true, mirror: false, scale: 1, x: 0, y: 0, rot: 0, spin: 0, bright: 0.9,
      mode: 'split', frontOpacity: 1,
      depthAngle: 0, depthPos: 0, depthCut: 0.68, depthSoft: 0.1, depthLuma: 0, depthDrift: 0, depthInvert: false
    };
    // Tuned by hand in the TUNE panel (Copy JSON) and saved as the shipped look.
    const A_DEFAULTS = {
      ...SW_DEFAULTS,
      on: false, mode: 'behind', scale: 2.25, x: -0.5, y: -4, rot: 29, spin: -6.3, bright: 0.36,
      depthAngle: 360, depthPos: 0.8, depthCut: 0.31, depthSoft: 0.37, depthLuma: 0.12, depthDrift: -4.5
    };
    const B_DEFAULTS = {
      ...SW_DEFAULTS,
      on: false, mirror: true, scale: 0.57, x: 46.5, y: -3.5, rot: -29, spin: 0, bright: 0.36,
      depthAngle: 180, depthPos: 0.8, depthCut: 0.31, depthSoft: 0.37, depthLuma: 0.12, depthDrift: 4.5
    };
    const FRAME_DEFAULTS = { frameW: 61, frameAspect: 1.44, frameX: 0, frameY: -2, photoContrast: 0.99, photoBright: 1 };
    // "Re-mirror B from A" in the panel: B = A flipped left-to-right.
    const mirrorOf = (A) => ({
      ...A, on: true, mirror: !A.mirror, x: -A.x, rot: -A.rot, spin: -A.spin,
      depthAngle: (((180 - A.depthAngle) % 360) + 360) % 360, depthDrift: -A.depthDrift
    });
    const T = { A: { ...A_DEFAULTS }, B: { ...B_DEFAULTS }, speed: 1, depthSource: 'gradient', debugDepth: false, ...FRAME_DEFAULTS };
    try {
      const saved = JSON.parse(localStorage.getItem(TUNE_KEY) || '{}');
      if (saved.A) {
        Object.assign(T, saved, { A: { ...A_DEFAULTS, ...saved.A }, B: { ...B_DEFAULTS, ...(saved.B || {}) } });
      }
    } catch { /* ignore */ }
    const SWS = ['A', 'B'];
    const saveTune = () => { try { localStorage.setItem(TUNE_KEY, JSON.stringify(T)); } catch { /* ignore */ } };

    const bgCv = $('[data-bg]', root), flyCv = $('[data-fly]', root);
    const bgCtx = bgCv.getContext('2d');
    let W = 0, H = 0, dpr = 1;
    const tStart = performance.now();

    const applyLook = () => {
      frame.style.setProperty('--fw', T.frameW);
      frame.style.setProperty('--far', T.frameAspect);
      frame.style.setProperty('--fx', T.frameX);
      frame.style.setProperty('--fy', T.frameY);
      frame.style.setProperty('--pc', T.photoContrast);
      frame.style.setProperty('--pb', T.photoBright);
    };
    applyLook();

    let gl = null, glDraw = null, loadHeight = () => {}, hasHeight = false;
    if (!REDUCED) gl = flyCv.getContext('webgl', { antialias: false, premultipliedAlpha: true });
    if (gl) {
      const mk = (type, src) => { const x = gl.createShader(type); gl.shaderSource(x, src); gl.compileShader(x); return x; };
      const prog = gl.createProgram();
      gl.attachShader(prog, mk(gl.VERTEX_SHADER, 'attribute vec2 a; void main(){ gl_Position = vec4(a,0.,1.); }'));
      gl.attachShader(prog, mk(gl.FRAGMENT_SHADER, `precision highp float;
        uniform sampler2D uVid, uH;
        uniform vec2 uRes, uSec;
        uniform float uDpr, uRot, uMir, uBg, uMode, uFrontA, uSrc, uAng, uPos, uCut, uSoft, uLuma, uInv, uDebug;
        uniform vec4 uRect;
        uniform vec3 uSw;
        void main(){
          vec2 px = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y) / uDpr;
          float inR = step(uRect.x,px.x)*step(px.x,uRect.z)*step(uRect.y,px.y)*step(px.y,uRect.w);
          vec2 p = px - uSw.xy;
          float cs = cos(-uRot), sn = sin(-uRot);
          p = vec2(cs*p.x - sn*p.y, sn*p.x + cs*p.y);
          p.x *= uMir;
          vec2 v = p/uSw.z + .5;
          float inV = step(0.,v.x)*step(v.x,1.)*step(0.,v.y)*step(v.y,1.);
          float m = texture2D(uVid, vec2(.5+v.x*.5, v.y)).r * inV;
          vec3 c = texture2D(uVid, vec2(v.x*.5, v.y)).rgb * inV;

          // synthetic depth: gradient across the frame, or a painted heightmap
          vec2 fc = (uRect.xy+uRect.zw)*.5;
          float fs = max(uRect.z-uRect.x, uRect.w-uRect.y);
          vec2 q = (px-fc)/fs;
          float g = clamp(dot(q, vec2(cos(uAng), sin(uAng))) + .5 + uPos, 0., 1.);
          float h = texture2D(uH, px/uSec).r;
          float d = mix(g, h, uSrc);
          d = mix(d, dot(c, vec3(.299,.587,.114)), uLuma);
          d = mix(d, 1.-d, uInv);

          float depthA = smoothstep(uCut-uSoft, uCut+uSoft, d);
          float front = uMode < .5 ? 0. : (uMode < 1.5 ? 1. : depthA);
          float a = smoothstep(.35,.65,m) * front * uFrontA * inR;
          vec4 col = vec4(c*uBg*a, a);
          if (uDebug > .5) {
            float k = .45*inR;
            col = vec4(col.rgb*(1.-k) + vec3(d, .05, 1.-d)*.7*k, max(col.a, k));
          }
          gl_FragColor = col;
        }`));
      gl.linkProgram(prog); gl.useProgram(prog);
      gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const loc = gl.getAttribLocation(prog, 'a');
      gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      gl.enable(gl.BLEND);
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);   // premultiplied, so A and B stack
      const U = {};
      ['uVid', 'uH', 'uRes', 'uSec', 'uDpr', 'uRot', 'uMir', 'uBg', 'uMode', 'uFrontA', 'uSrc', 'uAng', 'uPos', 'uCut', 'uSoft',
        'uLuma', 'uInv', 'uDebug', 'uRect', 'uSw'].forEach((n) => { U[n] = gl.getUniformLocation(prog, n); });
      const mkTex = (unit) => {
        const t = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        return t;
      };
      const vidTex = mkTex(0), hTex = mkTex(1);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([128, 128, 128, 255]));

      loadHeight = (src) => {
        const im = new Image();
        im.onload = () => {
          gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hTex);
          gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
          hasHeight = true;
        };
        im.src = src;
      };
      // A heightmap dropped into the project shows up on its own.
      const HM = 'assets/work-deco/heightmap.png';
      fetch(HM, { method: 'HEAD' }).then((r) => { if (r.ok) loadHeight(HM); }).catch(() => {});

      // Clears, uploads the frame once, then stacks one draw per instance.
      glDraw = (r, t, list) => {
        gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
        if (!list.length) return;
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, vidTex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, hTex);
        gl.uniform1i(U.uVid, 0); gl.uniform1i(U.uH, 1);
        gl.uniform2f(U.uRes, flyCv.width, flyCv.height);
        gl.uniform2f(U.uSec, W, H);
        gl.uniform1f(U.uDpr, dpr);
        gl.uniform4f(U.uRect, r.x, r.y, r.x + r.w, r.y + r.h);
        gl.uniform1f(U.uSrc, T.depthSource === 'heightmap' && hasHeight ? 1 : 0);
        gl.uniform1f(U.uDebug, T.debugDepth ? 1 : 0);
        list.forEach((S) => {
          gl.uniform3f(U.uSw, W / 2 + S.x / 100 * W, H / 2 + S.y / 100 * H, Math.max(W, H) * S.scale);
          gl.uniform1f(U.uRot, (S.rot + S.spin * t) * Math.PI / 180);
          gl.uniform1f(U.uMir, S.mirror ? -1 : 1);
          gl.uniform1f(U.uBg, S.bright);
          gl.uniform1f(U.uMode, { behind: 0, front: 1, split: 2 }[S.mode] ?? 2);
          gl.uniform1f(U.uFrontA, S.frontOpacity);
          gl.uniform1f(U.uAng, (S.depthAngle + S.depthDrift * t) * Math.PI / 180);
          gl.uniform1f(U.uPos, S.depthPos);
          gl.uniform1f(U.uCut, S.depthCut);
          gl.uniform1f(U.uSoft, S.depthSoft);
          gl.uniform1f(U.uLuma, S.depthLuma);
          gl.uniform1f(U.uInv, S.depthInvert ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 3);
        });
      };
    }

    const frameRect = () => {
      const f = frame.getBoundingClientRect(), r = root.getBoundingClientRect();
      return { x: f.left - r.left, y: f.top - r.top, w: f.width, h: f.height };
    };
    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      W = root.clientWidth; H = root.clientHeight;
      [bgCv, flyCv].forEach((cv) => { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); });
      if (gl) gl.viewport(0, 0, flyCv.width, flyCv.height);
    };
    resize();
    new ResizeObserver(resize).observe(root);

    let flyOn = false;
    // The 12 MB clip is only fetched / decoded while a swirl is switched on.
    const wantsVideo = () => SWS.some((k) => T[k].on);
    let drawn = false;
    const render = () => {
      const live = SWS.map((k) => T[k]).filter((S) => S.on);
      const dark = live.length > 0;
      if (dark !== root.classList.contains('has-swirl')) root.classList.toggle('has-swirl', dark);
      if (!dark) {
        if (!video.paused) video.pause();
        if (drawn || flyOn) {
          bgCtx.setTransform(1, 0, 0, 1, 0, 0);
          bgCtx.clearRect(0, 0, bgCv.width, bgCv.height);
          if (glDraw) glDraw(frameRect(), 0, []);
          drawn = false; flyOn = false;
        }
        return;
      }
      if (!video.getAttribute('src')) { video.src = video.dataset.src; video.load(); }
      if (video.paused) video.play().catch(() => {});
      if (video.readyState < 2) return;
      const t = (performance.now() - tStart) / 1000;
      const vw = video.videoWidth / 2;
      bgCtx.setTransform(1, 0, 0, 1, 0, 0);
      bgCtx.globalCompositeOperation = 'source-over';
      bgCtx.globalAlpha = 1;
      bgCtx.clearRect(0, 0, bgCv.width, bgCv.height);
      drawn = true;
      live.forEach((S, i) => {
        const size = Math.max(W, H) * S.scale * dpr;
        bgCtx.setTransform(1, 0, 0, 1, 0, 0);
        bgCtx.translate((W / 2 + S.x / 100 * W) * dpr, (H / 2 + S.y / 100 * H) * dpr);
        bgCtx.rotate((S.rot + S.spin * t) * Math.PI / 180);
        bgCtx.scale(S.mirror ? -1 : 1, 1);
        bgCtx.globalAlpha = S.bright;
        bgCtx.globalCompositeOperation = i ? 'lighter' : 'source-over';   // two swirls add, not hide each other
        bgCtx.drawImage(video, 0, 0, vw, video.videoHeight, -size / 2, -size / 2, size, size);
      });
      if (glDraw) {
        const front = live.filter((S) => S.mode !== 'behind' || T.debugDepth);
        if (front.length) { glDraw(frameRect(), t, front); flyOn = true; }
        else if (flyOn) { glDraw(frameRect(), t, []); flyOn = false; }
      }
    };

    // Only burn decode while the section is on screen.
    let visible = false, raf = 0;
    const loop = () => { if (!visible) return; render(); raf = requestAnimationFrame(loop); };
    new IntersectionObserver(([e]) => {
      visible = e.isIntersecting;
      cancelAnimationFrame(raf);
      if (visible) { if (REDUCED) { render(); video.addEventListener('loadeddata', render, { once: true }); } else loop(); }
      else video.pause();
    }, { threshold: 0.01 }).observe(root);
    video.addEventListener('pause', () => { if (visible && wantsVideo()) video.play().catch(() => {}); });
    // `speed` is the user's setting; the project change briefly multiplies it.
    const setRate = (v) => { video.playbackRate = Math.max(0.0625, v * T.speed); };

    /* ---------- TUNE panel ---------- */
    const swirlSpec = (k) => [
      [`${k}.on`, 'Show this swirl', 'check'],
      [`${k}.mirror`, 'Flip left ↔ right', 'check'],
      [`${k}.scale`, 'Size', 0.3, 3, 0.01],
      [`${k}.x`, 'Position X', -80, 80, 0.5],
      [`${k}.y`, 'Position Y', -80, 80, 0.5],
      [`${k}.rot`, 'Rotation °', -180, 180, 1],
      [`${k}.spin`, 'Spin °/s', -20, 20, 0.1],
      [`${k}.bright`, 'Brightness', 0, 1, 0.01],
      [`${k}.mode`, 'Swirl is', 'select', [['behind', 'behind the photo'], ['front', 'in front of the photo'], ['split', 'split by depth']]],
      [`${k}.frontOpacity`, 'Front opacity', 0, 1, 0.01],
      [`${k}.depthAngle`, 'Depth: direction °', 0, 360, 1],
      [`${k}.depthPos`, 'Depth: offset', -0.8, 0.8, 0.01],
      [`${k}.depthCut`, 'Depth: cut (front above)', 0, 1, 0.005],
      [`${k}.depthSoft`, 'Depth: softness', 0.005, 0.5, 0.005],
      [`${k}.depthLuma`, 'Depth: chrome brightness', 0, 1, 0.01],
      [`${k}.depthDrift`, 'Depth: drift °/s', -30, 30, 0.1],
      [`${k}.depthInvert`, 'Depth: invert', 'check']
    ];
    const SPEC = [
      { title: 'Animation', open: true, rows: [['speed', 'Speed ×', 0.1, 3, 0.05]] },
      { title: 'Swirl A', rows: swirlSpec('A'), open: true },
      { title: 'Swirl B', rows: swirlSpec('B'), open: true, extra: '<button data-t="mirror">Re-mirror B from A</button>' },
      { title: 'Depth (both swirls)', open: false, rows: [
        ['depthSource', 'Source', 'select', [['gradient', 'linear gradient'], ['heightmap', 'heightmap image']]],
        ['debugDepth', 'Show depth map', 'check']
      ], extra: `<label class="tune__row"><span>Heightmap file</span><input type="file" accept="image/*" data-t="file"></label>
        <p class="tune__note">Or drop a PNG at assets/work-deco/heightmap.png — white = front, black = back.</p>` },
      { title: 'Photo', open: false, rows: [
        ['frameW', 'Width %', 25, 95, 1],
        ['frameAspect', 'Aspect (w / h)', 0.7, 2.6, 0.01],
        ['frameX', 'Position X', -40, 40, 0.5],
        ['frameY', 'Position Y', -40, 40, 0.5],
        ['photoContrast', 'Contrast', 0.8, 2.2, 0.01],
        ['photoBright', 'Brightness', 0.5, 1.4, 0.01]
      ] }
    ];
    const getV = (path) => path.split('.').reduce((o, k) => o[k], T);
    const setV = (path, v) => { const p = path.split('.'); const last = p.pop(); p.reduce((o, k) => o[k], T)[last] = v; };

    // Dev tool: hidden from visitors. Open the site with ?tune once to switch it on
    // for this browser (?tune=off switches it back off).
    let tuneOn = false;
    try {
      const q = new URLSearchParams(location.search).get('tune');
      if (q === 'off') localStorage.removeItem('vrgd-tune');
      else if (q !== null) localStorage.setItem('vrgd-tune', '1');
      tuneOn = localStorage.getItem('vrgd-tune') === '1';
    } catch { /* private mode */ }
    setRate(1);
    if (tuneOn) {
      const panel = document.createElement('aside');
      panel.className = 'tune mono';
      panel.setAttribute('data-lenis-prevent', '');
      panel.hidden = true;
      panel.innerHTML = `<header><span>TUNE</span><button data-t="close" aria-label="Close">×</button></header><div class="tune__body"></div>
        <footer><button data-t="copy">Copy JSON</button><button data-t="reset">Reset</button></footer>`;
      document.body.appendChild(panel);
      const body = $('.tune__body', panel);
      const inputs = {};
      SPEC.forEach((sec) => {
        const det = document.createElement('details');
        det.open = sec.open;
        det.innerHTML = `<summary>${sec.title}</summary>`;
        sec.rows.forEach(([key, label, a, b, c]) => {
          const row = document.createElement('label');
          row.className = 'tune__row';
          if (a === 'select') row.innerHTML = `<span>${label}</span><select>${b.map(([v, n]) => `<option value="${v}">${n}</option>`).join('')}</select>`;
          else if (a === 'check') row.innerHTML = `<span>${label}</span><input type="checkbox">`;
          else row.innerHTML = `<span>${label}</span><input type="range" min="${a}" max="${b}" step="${c}"><output></output>`;
          det.appendChild(row);
          inputs[key] = row;
        });
        if (sec.extra) det.insertAdjacentHTML('beforeend', sec.extra);
        body.appendChild(det);
      });
      const syncPanel = () => {
        Object.entries(inputs).forEach(([key, row]) => {
          const el = $('input,select', row), out = $('output', row), v = getV(key);
          if (el.type === 'checkbox') el.checked = !!v; else el.value = v;
          if (out) out.textContent = (+v).toFixed(2).replace(/\.?0+$/, '');
        });
      };
      const onEdit = (key) => {
        const el = $('input,select', inputs[key]);
        setV(key, el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value);
        applyLook(); setRate(rate.v); saveTune(); syncPanel();
      };
      Object.keys(inputs).forEach((key) => $('input,select', inputs[key]).addEventListener('input', () => onEdit(key)));
      panel.addEventListener('click', (e) => {
        const act = e.target.dataset?.t;
        if (act === 'close') panel.hidden = true;
        if (act === 'reset') {
          Object.assign(T, { A: { ...A_DEFAULTS }, B: { ...B_DEFAULTS }, speed: 1, depthSource: 'gradient', debugDepth: false, ...FRAME_DEFAULTS });
          applyLook(); setRate(rate.v); saveTune(); syncPanel();
        }
        if (act === 'mirror') { T.B = mirrorOf(T.A); saveTune(); syncPanel(); }
        if (act === 'copy') {
          const txt = JSON.stringify(T, null, 2);
          navigator.clipboard?.writeText(txt).then(() => { e.target.textContent = 'Copied'; setTimeout(() => { e.target.textContent = 'Copy JSON'; }, 1200); });
        }
      });
      $('[data-t="file"]', panel)?.addEventListener('change', (e) => {
        const f = e.target.files?.[0];
        if (!f) return;
        loadHeight(URL.createObjectURL(f));
        T.depthSource = 'heightmap';
        saveTune(); syncPanel();
      });
      syncPanel();

      const tuneBtn = document.createElement('button');
      tuneBtn.className = 'spotlight__tune';
      tuneBtn.textContent = 'TUNE';
      tuneBtn.setAttribute('aria-label', 'Open swirl / photo tuning panel');
      $('.spotlight__ctrl', root).prepend(tuneBtn);
      tuneBtn.addEventListener('click', () => { panel.hidden = !panel.hidden; });
      document.addEventListener('keydown', (e) => {
        if (e.key?.toLowerCase() !== 'c' || e.metaKey || e.ctrlKey || e.altKey) return;
        if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
        panel.hidden = !panel.hidden;
      });
    }
    const rate = { v: 1 };

    /* ---------- Title, split into letters ---------- */
    let chars = [];
    const setTitle = (text) => {
      titleEl.innerHTML = text.split(' ').map((w) =>
        `<span class="spotlight__word">${[...w].map((c) => `<span class="spotlight__char">${c}</span>`).join('')}</span>`).join(' ');
      chars = $$('.spotlight__char', titleEl);
    };
    const setInfo = (i, animate) => {
      const p = projects[i];
      if (animate) {
        window.VRGD.scramble(metaEl, p.meta, 0.6);
        window.VRGD.scramble(countEl, `${pad2(i + 1)} / ${pad2(N)}`, 0.5);
      } else {
        metaEl.textContent = p.meta;
        countEl.textContent = `${pad2(i + 1)} / ${pad2(N)}`;
      }
      indexBtns.forEach((b, k) => b.setAttribute('aria-current', String(k === i)));
    };
    const charsIn = (delay = 0) => gsap.fromTo(chars,
      { yPercent: 110 },
      { yPercent: 0, duration: 0.9, ease: 'expo.out', stagger: 0.022, delay });
    const charsOut = () => gsap.to(chars,
      { yPercent: -110, duration: 0.45, ease: 'power3.in', stagger: 0.01 });

    /* ---------- The change ---------- */
    let cur = 0, busy = false;
    // Two stacked <img>: `front` is what's showing, the other takes the next photo.
    let front = 'a';
    const other = () => (front === 'a' ? 'b' : 'a');

    async function change(to, dir) {
      if (busy || to === cur) return;
      busy = true;
      setInfo(to, true);

      const inK = other(), outK = front;
      const inL = layers[inK], outL = layers[outK];
      const inImg = imgOf(inK), outImg = imgOf(outK);
      setImg(inImg, to);
      try { await inImg.decode(); } catch { /* falls through, shows when ready */ }

      if (REDUCED) {
        gsap.set(inL, { clipPath: 'inset(0% 0% 0% 0%)', zIndex: 2 });
        gsap.set(outL, { zIndex: 1 });
        front = inK; cur = to; busy = false;
        setTitle(projects[to].title);
        return;
      }

      // The wipe edge lives on the layer, the zoom/drift on the <img> inside
      // it, so the edge stays a straight line while the picture settles.
      // Next comes in from the right, previous from the left.
      const from = dir > 0 ? 'inset(0% 0% 0% 100%)' : 'inset(0% 100% 0% 0%)';
      gsap.set(inL, { zIndex: 2, clipPath: from });
      gsap.set(inImg, { scale: 1.22, xPercent: dir * 7 });
      gsap.set(outL, { zIndex: 1 });

      gsap.timeline({ onComplete() {
        front = inK; cur = to; busy = false;
        gsap.set(outImg, { scale: 1, xPercent: 0 });
      } })
        .add(charsOut(), 0)
        .to(inL, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.0, ease: 'power3.inOut' }, 0)
        .to(inImg, { scale: 1, xPercent: 0, duration: 1.6, ease: 'power3.out' }, 0.1)
        .to(outImg, { scale: 1.08, xPercent: -dir * 5, duration: 1.0, ease: 'power3.inOut' }, 0)
        .to(rate, { v: 1.8, duration: 0.5, ease: 'power2.out', onUpdate: () => setRate(rate.v) }, 0)
        .to(rate, { v: 1, duration: 1.2, ease: 'power2.inOut', onUpdate: () => setRate(rate.v) }, 0.5)
        .add(() => { setTitle(projects[to].title); gsap.set(chars, { yPercent: 110 }); charsIn(); }, 0.55);
    }
    const step = (d) => change((cur + d + N) % N, d);

    /* ---------- Controls ---------- */
    $('[data-spotlight-prev]', root).addEventListener('click', () => step(-1));
    $('[data-spotlight-next]', root).addEventListener('click', () => step(1));
    indexBtns.forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.i;
      change(i, i > cur ? 1 : -1);
    }));

    function openProject() {
      if (busy) return;
      busy = true;
      // Frame is a real element, so the view transition grows it straight
      // into the project page's hero.
      frame.style.viewTransitionName = 'project-hero';
      const go = () => { location.href = `project.html?p=${projects[cur].slug}`; };
      if (REDUCED) return go();
      charsOut();
      gsap.delayedCall(0.35, go);
    }
    $('[data-spotlight-open]', root).addEventListener('click', openProject);

    // Click = open, horizontal drag = previous / next.
    let downX = null;
    frame.addEventListener('pointerdown', (e) => { downX = e.clientX; });
    frame.addEventListener('pointerup', (e) => {
      if (downX == null) return;
      const dx = e.clientX - downX; downX = null;
      if (Math.abs(dx) > 50) step(dx < 0 ? 1 : -1);
      else if (Math.abs(dx) < 8) openProject();
    });
    frame.addEventListener('pointercancel', () => { downX = null; });

    document.addEventListener('keydown', (e) => {
      if (!CAN_HOVER || !visible) return;
      if (e.key === 'ArrowRight') step(1);
      if (e.key === 'ArrowLeft') step(-1);
    });

    /* ---------- First look ---------- */
    setImg(imgOf('a'), 0);
    gsap.set(layers.a, { zIndex: 2 });
    setInfo(0, false);
    setTitle(projects[0].title);
    if (REDUCED) return;

    busy = true;
    gsap.set(chars, { yPercent: 110 });
    gsap.set(frame, { clipPath: 'inset(100% 0% 0% 0%)' });
    gsap.set(imgOf('a'), { scale: 1.2 });
    ScrollTrigger.create({
      trigger: root, start: 'top 65%', once: true,
      onEnter: () => {
        window.VRGD.scramble(metaEl, projects[0].meta, 0.6);
        gsap.timeline({ onComplete() { busy = false; } })
          .to(frame, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.3, ease: 'expo.inOut' }, 0)
          .to(imgOf('a'), { scale: 1, duration: 1.8, ease: 'expo.out' }, 0.1)
          .add(() => charsIn(), 0.5);
      }
    });
  }

  /* =======================================================
     6c. Logotype blend — press I to flip the big hero mark
     between sitting on the footage and inverting it.
     ======================================================= */
  function initLogoBlend() {
    const logo = $('[data-hero-logo]');
    const readout = $('[data-logo-mode]');
    if (!logo) return;

    const MODES = { normal: 'NORMAL', difference: 'DIFFERENCE' };
    let mode = 'normal';
    try {
      const saved = localStorage.getItem('vrgd-logo-blend');
      if (saved in MODES) mode = saved;
    } catch { /* private mode */ }

    let hide;
    const apply = (next, announce) => {
      mode = next;
      logo.setAttribute('data-logo-blend', mode);
      try { localStorage.setItem('vrgd-logo-blend', mode); } catch { /* ignore */ }

      if (!readout || !announce) return;
      window.VRGD.scramble(readout, MODES[mode], 0.5);
      hide?.kill();
      gsap.to(readout, { autoAlpha: 1, duration: 0.25, ease: 'power2.out' });
      hide = gsap.to(readout, { autoAlpha: 0, duration: 0.5, delay: 1.4, ease: 'power2.in' });
    };

    apply(mode, false);

    document.addEventListener('keydown', (e) => {
      if (e.key?.toLowerCase() !== 'i' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
      apply(mode === 'normal' ? 'difference' : 'normal', true);
    });
  }

  /* =======================================================
     7. Section nav — smooth anchors + active state everywhere
     ======================================================= */
  function initNav() {
    $$('[data-nav-link]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); scrollTo(a.getAttribute('href')); });
    });
    $('.navbar__mark')?.addEventListener('click', (e) => { e.preventDefault(); scrollTo(0); });

    // Every nav mode has its own NOW readout; all of them scramble together.
    const nowLabels = $$('[data-nav-now]');

    $$('main section[id], main footer[id]').forEach((section) => {
      // One section can drive several navs at once.
      const links = $$(`[data-nav-link][href="#${section.id}"]`);
      if (!links.length) return;

      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => {
          links.forEach((l) => l.setAttribute('data-active', self.isActive ? 'true' : 'false'));
          if (self.isActive) {
            const name = section.getAttribute('data-section') || section.id.toUpperCase();
            nowLabels.forEach((el) => window.VRGD.scramble(el, name, 0.55));
          }
        }
      });
    });
  }

  /* =======================================================
     8. Navbar backdrop + the jumpbar that pops in on scroll
     ======================================================= */
  function initChrome() {
    const navbar = $('[data-navbar]');
    const jumpbar = $('[data-jumpbar]');
    const hero = $('.hero');
    const sidenav = $('.sidenav');

    $$('.is-invert').forEach((el) => registerDarkSurface(el));

    // Side nav borrows the jumpbar's move: the NOW readout slides in past the
    // hero (and the list nudges over with it), then retracts back at the top.
    const now = $('[data-sidenav-now]');
    if (sidenav && now && hero) {
      const list = $('ul', sidenav);
      const engage = gsap.timeline({ paused: true })
        .fromTo(now, { autoAlpha: 0, x: 24 }, { autoAlpha: 1, x: 0, duration: 0.55, ease: 'expo.out' })
        .fromTo(list, { x: 16 }, { x: 0, duration: 0.6, ease: 'expo.out' }, '<');

      ScrollTrigger.create({
        trigger: hero,
        start: 'bottom 75%',
        onEnter: () => engage.play(),
        onLeaveBack: () => engage.reverse()
      });
    }

    // Jumpbar rides in past the hero and hides again at the very top.
    if (jumpbar && hero) {
      const show = gsap.to(jumpbar, {
        y: 0, autoAlpha: 1, duration: 0.6, ease: 'expo.out', paused: true
      });
      gsap.set(jumpbar, { autoAlpha: 0 });
      ScrollTrigger.create({
        trigger: hero,
        start: 'bottom 75%',
        onEnter: () => { jumpbar.removeAttribute('aria-hidden'); show.play(); },
        onLeaveBack: () => { show.reverse(); jumpbar.setAttribute('aria-hidden', 'true'); }
      });
    }
  }

  /* =======================================================
     8b. BETA nav switcher — remove once a winner is picked
     ======================================================= */
  function initNavSwitch() {
    const MODES = ['sidenav', 'topnav', 'jumpbar'];
    const root = document.documentElement;
    const buttons = $$('[data-navswitch-btn]');
    const wrap = $('[data-navswitch]');
    const toggle = $('[data-navswitch-toggle]');

    // Collapsed by default; the spark toggle opens the panel.
    if (wrap && toggle) {
      const setOpen = (open) => {
        wrap.setAttribute('data-open', String(open));
        toggle.setAttribute('aria-expanded', String(open));
      };
      setOpen(false);
      toggle.addEventListener('click', () => setOpen(wrap.getAttribute('data-open') !== 'true'));
      document.addEventListener('click', (e) => {
        if (!e.target.closest('[data-navswitch]')) setOpen(false);
      });
    }

    // The head script already set the mode; this only mirrors it into the UI.
    let mode = MODES.includes(root.getAttribute('data-nav')) ? root.getAttribute('data-nav') : 'sidenav';

    const apply = (m) => {
      if (!MODES.includes(m)) return;
      mode = m;
      root.setAttribute('data-nav', m);
      try { localStorage.setItem('vrgd-nav', m); } catch { /* private mode */ }
      buttons.forEach((b) => b.setAttribute('data-active', String(b.getAttribute('data-navswitch-btn') === m)));
      // The sidenav gutter changes the layout, so triggers need remeasuring.
      ScrollTrigger.refresh();
    };

    apply(mode);
    buttons.forEach((b) => b.addEventListener('click', () => apply(b.getAttribute('data-navswitch-btn'))));

    document.addEventListener('keydown', (e) => {
      if (e.key?.toLowerCase() !== 'n' || e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || '')) return;
      apply(MODES[(MODES.indexOf(mode) + 1) % MODES.length]);
    });
  }

  /* =======================================================
     9. The spine — a hairline the spark travels down as you scroll.
     Section nodes light up as they are passed; the spark spins
     idly and gets a kick from scroll velocity.
     ======================================================= */
  function initSpine() {
    const spine = $('[data-spine]');
    const fill = $('[data-spine-fill]');
    const spark = $('[data-spine-spark]');
    const nodeList = $('[data-spine-nodes]');
    if (!spine || !fill || !spark || !nodeList) return;

    const sections = $$('main section[id], main footer[id]');

    // Build one node per section at its share of the document height.
    const nodes = sections.map((section) => {
      // Dots only — the navs already name the section, and a label out here
      // would run into the content column.
      const li = document.createElement('li');
      li.innerHTML = '<i></i>';
      nodeList.appendChild(li);
      return { li, section };
    });

    const place = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      nodes.forEach(({ li, section }) => {
        const p = docH > 0 ? gsap.utils.clamp(0, 1, section.offsetTop / docH) : 0;
        li.style.top = `${p * 100}%`;
      });
    };
    place();
    ScrollTrigger.addEventListener('refreshInit', place);

    // Fill + spark position both track raw scroll progress.
    const setSparkY = gsap.quickTo(spark, 'y', { duration: 0.5, ease: 'power3.out' });
    let railH = spine.clientHeight;

    const onScroll = () => {
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const p = docH > 0 ? gsap.utils.clamp(0, 1, window.scrollY / docH) : 0;
      gsap.set(fill, { scaleY: p });
      setSparkY(p * railH);
      nodes.forEach(({ li, section }) => {
        const sp = docH > 0 ? section.offsetTop / docH : 0;
        li.setAttribute('data-passed', String(p >= sp - 0.005));
      });
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', () => { railH = spine.clientHeight; place(); onScroll(); });
    onScroll();

    // Active node mirrors whichever section the navs consider current.
    sections.forEach((section, i) => {
      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => nodes[i].li.setAttribute('data-active', String(self.isActive))
      });
    });

    if (REDUCED) return;

    // Idle spin, plus a nudge proportional to how hard you are scrolling.
    let spin = 0, kick = 0, lastY = window.scrollY;
    window.addEventListener('scroll', () => {
      kick = gsap.utils.clamp(-14, 14, (window.scrollY - lastY) * 0.35);
      lastY = window.scrollY;
    }, { passive: true });

    gsap.ticker.add(() => {
      const dr = gsap.ticker.deltaRatio();
      spin += (0.25 + kick) * dr;
      kick *= 0.9;
      gsap.set(spark, { rotation: spin });
    });
  }

  /* =======================================================
     10. Extra motion — scramble-in labels, clip-wiped plates
     ======================================================= */
  function initMicroMotion() {
    // Mono meta scrambles itself into place as it arrives.
    const labels = [
      ...$$('.section__head .mono'),
      ...$$('[data-scramble-in]')
    ];
    labels.forEach((el) => {
      // Read at reveal time, not here — this runs at boot, before async
      // bits like the WORK count (set once work.json resolves) have
      // necessarily landed, and capturing early meant scrambling back
      // to a stale snapshot the moment the label scrolled into view.
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => window.VRGD.scramble(el, el.textContent, 0.7)
      });
    });

    if (REDUCED) return;

    // Plates wipe up instead of just fading.
    $$('.asset__stage').forEach((el) => {
      el.setAttribute('data-clip', '');
      gsap.to(el, {
        clipPath: 'inset(0% 0% 0% 0%)',
        duration: 1.1,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // Typespec rows and contact columns arrive on a stagger.
    gsap.from('.typespec li', {
      y: 24, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.06,
      scrollTrigger: { trigger: '.typespec', start: 'top 88%', once: true }
    });
    gsap.from('.contacts__col', {
      y: 30, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.1,
      scrollTrigger: { trigger: '.contacts__grid', start: 'top 88%', once: true }
    });
    // The footer wordmark scales up as it comes into frame.
    gsap.from('.contacts__mark svg', {
      scaleY: 0.82, transformOrigin: 'bottom center', autoAlpha: 0,
      duration: 1.2, ease: 'expo.out',
      scrollTrigger: { trigger: '.contacts__mark', start: 'top 95%', once: true }
    });
  }

  /* =======================================================
     Boot
     ======================================================= */
  function boot() {
    /* Each module is isolated: one throwing must not take the rest of the page
       down with it. A ReferenceError in initChrome once stopped initLoader from
       running, which left the hero plate collapsed at 0x0 — the video played
       into nothing and the page looked blank. */
    const modules = [
      ['dither', initDither], ['heroVideo', initHeroVideo], ['hero', initHero],
      ['spotlight', initSpotlight], ['logoBlend', initLogoBlend], ['nav', initNav],
      ['chrome', initChrome], ['navSwitch', initNavSwitch], ['spine', initSpine],
      ['microMotion', initMicroMotion], ['reveals', initReveals], ['loader', initLoader]
    ];

    modules.forEach(([name, fn]) => {
      try { fn(); } catch (err) { console.error(`[vrgd] ${name} failed:`, err); }
    });

    // The loader owns un-hiding the page, so never leave it stuck on a throw.
    if (document.body.getAttribute('data-loading') === 'true') {
      document.body.setAttribute('data-loading', 'false');
      lenis.start();
    }
    ScrollTrigger.refresh();
  }

  if (document.fonts?.ready) document.fonts.ready.then(boot);
  else window.addEventListener('load', boot);
})();
