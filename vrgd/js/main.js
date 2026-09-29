/* =========================================================
   VRgD — index page motion
   Cursor, scramble, menu and clock live in shared.js.
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(ScrollTrigger, SplitText, Flip, CustomEase, Observer, Draggable, InertiaPlugin);

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
  function registerDarkSurface(el) {
    const navbar = $('[data-navbar]');
    const navH = navbar ? (parseFloat(getComputedStyle(navbar).minHeight) || 72) : 72;

    if (navbar) {
      ScrollTrigger.create({
        trigger: el,
        start: `top top+=${navH}`,
        end: 'bottom top',
        onToggle: (self) => navbar.classList.toggle('on-invert', self.isActive)
      });
    }
    [$('.sidenav'), $('[data-spine]')].filter(Boolean).forEach((node) => {
      ScrollTrigger.create({
        trigger: el,
        start: 'top center',
        end: 'bottom center',
        onToggle: (self) => node.classList.toggle('on-invert', self.isActive)
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
     6. Work spotlight — one project at a time, full-bleed, swiped with
     Embla Carousel (embla-carousel.com — vendored, js/vendor/embla-
     carousel.umd.js). The previous version hand-rolled a 3D ring with
     a GSAP-tweened transform proxy and a GSAP Observer for drag; it
     looked neat but the neighbouring frames left half-visible at the
     sides read as clutter, and the custom drag logic could leave two
     frames mid-tween at once. Embla is a maintained library plenty of
     production sites already ship, and only the active frame is ever
     on screen. Data comes straight from work.json (the same file
     project.js reads), so the index and the project pages can never
     list a different set of projects.
     ======================================================= */
  async function initSpotlight() {
    const root = $('[data-spotlight]');
    const stage = $('[data-spotlight-stage]', root || document);
    if (!root || !stage || !window.EmblaCarousel) return;

    // Arriving back from a project page: name this whole block so the
    // page's hero (always named project-hero, see project.html's CSS)
    // shrinks back into it — the same pairing the outward click sets up
    // on just the one clicked frame, mirrored for the return trip. The
    // container is used (not a single carousel item) because it exists
    // immediately, before work.json has even loaded.
    if (document.referrer.includes('project.html')) {
      root.style.viewTransitionName = 'project-hero';
    }

    let projects = [];
    try {
      const res = await fetch('assets/work.json');
      if (res.ok) projects = (await res.json()).projects || [];
    } catch { /* leaves the stage empty rather than break the page */ }
    if (!projects.length) return;

    const workCount = $('[data-work-count]');
    if (workCount) workCount.textContent = `[${String(projects.length).padStart(2, '0')}]`;

    // The homepage carousel always shows the grayscale, landscape-cropped
    // 'preview' image (falls back to the project hero if one is missing),
    // never the color hero itself — that's saved for the project page.
    stage.innerHTML = `<div class="spotlight__ring" data-spotlight-ring>${projects.map((p, i) => {
      const src = p.preview || p.hero?.src;
      return `
      <div class="spotlight__item" role="listitem" data-index="${i}">
        <div class="spotlight__frame"${src ? '' : ` data-placeholder="${(i % 6) + 1}"`} data-cursor-hover data-cursor-text="VIEW">
          ${src ? `<img src="${src}" alt="">` : ''}
        </div>
      </div>`;
    }).join('')}</div>`;

    const items = $$('.spotlight__item', stage);
    const titleEl = $('[data-spotlight-title]');
    const countEl = $('[data-spotlight-count]');
    const N = items.length;

    const embla = window.EmblaCarousel(stage, {
      loop: true,
      duration: REDUCED ? 1 : 22
    });

    let prevIndex = 0;
    function updateUI() {
      const index = embla.selectedScrollSnap();
      items.forEach((item, i) => item.setAttribute('data-active', String(i === index)));
      if (!REDUCED) {
        // +1 apart (looped) reads as "forward", -1 as "backward" — a jump of
        // more than one slide (rapid clicks) just defaults to forward.
        const dir = ((prevIndex - index + N) % N) === 1 ? -1 : 1;
        gsap.fromTo(titleEl, { xPercent: dir * 12, autoAlpha: 0 }, { xPercent: 0, autoAlpha: 1, duration: 0.5, ease: 'power3.out' });
      }
      window.VRGD.scramble(titleEl, `PROJECT ${projects[index].title}`.toUpperCase(), 0.6);
      if (countEl) countEl.textContent = `${String(index + 1).padStart(2, '0')} / ${String(N).padStart(2, '0')}`;
      prevIndex = index;
    }

    embla.on('select', updateUI);
    embla.on('reInit', updateUI);
    updateUI();

    // The swipe/click used to just slide the frame in and out — now the
    // whole block reads as one thing in motion: the photo drifts and
    // racks focus against its own frame (a parallax depth cue, not a
    // flat crossfade), the title and the deco ribbons carry a little of
    // the same movement, and a fast flick leaves a brief rubbery skew
    // that settles back out — all driven off Embla's own public
    // 'scroll'/'settle' events, no dependence on its internal engine.
    if (!REDUCED) {
      const decoLeft = $('.spotlight__deco--left', root);
      const decoRight = $('.spotlight__deco--right', root);
      const images = items.map((item) => item.querySelector('.spotlight__frame img'));

      const PARALLAX = 14;  // % of frame width the image drifts against its frame
      const SKEW_MAX = 5;   // degrees, clamped
      const SKEW_K = 40;    // velocity -> skew multiplier
      let lastProgress = 0;

      function tick() {
        const stageRect = stage.getBoundingClientRect();
        if (!stageRect.width) return;

        let activeProgress = 0;
        let minAbs = Infinity;

        items.forEach((item, i) => {
          const r = item.getBoundingClientRect();
          // 0 when resting dead centre, ±1 a full frame away either side.
          const progress = (r.left - stageRect.left) / stageRect.width;
          const abs = Math.min(Math.abs(progress), 1);
          const img = images[i];
          if (img) {
            img.style.transform = `scale(${1.15 + abs * 0.15}) translateX(${-progress * PARALLAX}%)`;
            img.style.filter = abs > 0.02 ? `blur(${abs * 6}px)` : '';
          }
          if (abs < minAbs) { minAbs = abs; activeProgress = progress; }
        });

        const velocity = activeProgress - lastProgress;
        lastProgress = activeProgress;
        const skew = Math.max(-SKEW_MAX, Math.min(SKEW_MAX, velocity * SKEW_K));
        items.forEach((item) => { item.style.transform = `skewX(${skew}deg)`; });

        if (decoLeft) decoLeft.style.transform = `translateY(-50%) translateX(${activeProgress * -18}px) rotate(${activeProgress * -3}deg)`;
        if (decoRight) decoRight.style.transform = `translateY(-50%) translateX(${activeProgress * 18}px) rotate(${activeProgress * 3}deg)`;
      }

      embla.on('scroll', tick);
      embla.on('settle', () => {
        // Hard reset rather than a tween — by 'settle' the velocity that
        // drove the skew is already ~0, so the snap is imperceptible and
        // this avoids fighting the next drag's raw style writes.
        items.forEach((item) => { item.style.transform = ''; });
      });
      tick();
    }

    $('[data-spotlight-prev]')?.addEventListener('click', () => embla.scrollPrev());
    $('[data-spotlight-next]')?.addEventListener('click', () => embla.scrollNext());

    items.forEach((item) => {
      // Only the visible frame is clickable — the item itself is now a
      // full-width lane (see .spotlight__stage) mostly empty space
      // either side of it.
      const frame = item.querySelector('.spotlight__frame');
      frame?.addEventListener('click', () => {
        const i = Number(item.getAttribute('data-index'));
        // Embla only leaves the active slide reachable in the viewport
        // (the rest sit fully clipped offscreen), so a click here is
        // always on the current project — no "recentre first" step.
        // The active frame carries its own box into the project page's
        // hero — same box-grow language the boot loader opens with.
        frame.style.viewTransitionName = 'project-hero';
        location.href = `project.html?p=${projects[i].slug}`;
      });
    });

    document.addEventListener('keydown', (e) => {
      if (!CAN_HOVER) return;
      if (e.key === 'ArrowRight') embla.scrollNext();
      if (e.key === 'ArrowLeft') embla.scrollPrev();
    });

    if (!REDUCED) {
      // Work fills the screen once it's the thing actually in view (see
      // .section--work's min-height: 100vh) — the fixed navbar steps
      // aside for as long as that's true, in either scroll direction,
      // and the carousel settles into its resting position once, the
      // moment it takes over.
      const section = root.closest('.section--work');
      const navbar = $('[data-navbar]');
      // Whichever nav mode is actually live at this width — topnav rides
      // inside .navbar already, so only sidenav and jumpbar need their own
      // handling too.
      const sidenav = $('.sidenav');
      const jumpbar = $('.jumpbar');
      if (section && (navbar || sidenav || jumpbar)) {
        // A 160px buffer on both edges — the section is tall enough (see
        // .section--work) to afford it — so the chrome hides/returns a
        // beat before/after the exact pixel where the section meets the
        // viewport edge, instead of needing pixel-perfect scroll landing.
        ScrollTrigger.create({
          trigger: section,
          start: 'top top+=160',
          end: 'bottom top-=160',
          onToggle: (self) => {
            const hide = self.isActive;
            if (navbar) gsap.to(navbar, {
              yPercent: hide ? -140 : 0, autoAlpha: hide ? 0 : 1,
              duration: 0.5, ease: 'power3.inOut', overwrite: 'auto'
            });
            if (sidenav) gsap.to(sidenav, {
              xPercent: hide ? 140 : 0, autoAlpha: hide ? 0 : 1,
              duration: 0.5, ease: 'power3.inOut', overwrite: 'auto'
            });
            if (jumpbar) gsap.to(jumpbar, {
              yPercent: hide ? 140 : 0, autoAlpha: hide ? 0 : 1,
              duration: 0.5, ease: 'power3.inOut', overwrite: 'auto'
            });
          }
        });

        // The magnet: once scrolling brings the section within 400px of
        // sitting flush with the viewport (from either direction), Lenis
        // pulls the rest of the way to a clean alignment — a brief snap
        // when you're already basically there, not a jump from afar.
        // Fires once per crossing (onEnter/onEnterBack), never mid-browse.
        const magnetize = () => lenis.scrollTo(section, { offset: 0, duration: 0.8 });
        ScrollTrigger.create({
          trigger: section,
          start: 'top top+=400',
          end: 'bottom top-=400',
          onEnter: magnetize,
          onEnterBack: magnetize
        });
      }

      gsap.from(root, {
        autoAlpha: 0, y: 40, scale: 0.94, duration: 1.1, ease: 'expo.out',
        scrollTrigger: { trigger: section || root, start: 'top 75%', once: true }
      });
    }
  }

  /* =======================================================
     6b. Work deco — the two ribbon renders beside the spotlight
     are a video, not a still: an RGB clip plus a white-on-black
     luma matte, composited onto a canvas each frame (plain <video>
     carries no alpha channel). Scrubbed to scroll position while
     the section is being approached or browsed, then handed off to
     play on its own once scrolling actually stops — the handoff is
     seamless because playback just continues from whatever frame
     the scrub left it on, no jump to rewind.
     ======================================================= */
  function initSpotlightDeco() {
    const root = $('[data-spotlight]');
    const canvasLeft = $('[data-deco-canvas="left"]', root || document);
    const canvasRight = $('[data-deco-canvas="right"]', root || document);
    const rgbVideo = $('[data-deco-rgb]', root || document);
    const maskVideo = $('[data-deco-mask]', root || document);
    if (!root || !canvasLeft || !canvasRight || !rgbVideo || !maskVideo) return;

    const SIZE = 800; // internal render resolution — plenty for a decorative element
    [canvasLeft, canvasRight].forEach((c) => { c.width = SIZE; c.height = SIZE; });
    const leftCtx = canvasLeft.getContext('2d');
    const rightCtx = canvasRight.getContext('2d');
    const maskBuffer = document.createElement('canvas');
    maskBuffer.width = SIZE; maskBuffer.height = SIZE;
    const maskCtx = maskBuffer.getContext('2d');

    // The matte is plain black/white video (no real alpha of its own) —
    // read it back and copy its luminance into the alpha channel once
    // per frame, shared by both sides before either one draws.
    function updateMaskBuffer() {
      maskCtx.setTransform(1, 0, 0, 1, 0, 0);
      maskCtx.clearRect(0, 0, SIZE, SIZE);
      maskCtx.drawImage(maskVideo, 0, 0, SIZE, SIZE);
      const frame = maskCtx.getImageData(0, 0, SIZE, SIZE);
      const d = frame.data;
      for (let i = 0; i < d.length; i += 4) d[i + 3] = d[i];
      maskCtx.putImageData(frame, 0, 0);
    }

    function drawSide(ctx, flip) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, SIZE, SIZE);
      if (flip) { ctx.translate(SIZE, 0); ctx.scale(-1, 1); }
      ctx.drawImage(rgbVideo, 0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'destination-in';
      ctx.drawImage(maskBuffer, 0, 0, SIZE, SIZE);
      ctx.globalCompositeOperation = 'source-over';
    }

    if (REDUCED) {
      // No scroll-scrub, no idle autoplay — just one settled frame.
      const paintOnce = () => {
        updateMaskBuffer();
        drawSide(leftCtx, false);
        drawSide(rightCtx, true);
      };
      if (rgbVideo.readyState >= 2) paintOnce();
      else rgbVideo.addEventListener('loadeddata', paintOnce, { once: true });
      return;
    }

    (function render() {
      updateMaskBuffer();
      drawSide(leftCtx, false);
      drawSide(rightCtx, true);
      requestAnimationFrame(render);
    })();

    let playing = false;
    let idleTimer = null;
    let rampTween = null;
    // Browsers refuse a playbackRate much below 1/16 (throws, doesn't
    // clamp), so that's the floor for "as close to stopped as allowed."
    const MIN_RATE = 0.0625;
    function setRate(rate) {
      try { rgbVideo.playbackRate = maskVideo.playbackRate = rate; } catch { /* out of range on this browser — leave it */ }
    }

    // Handing off to autoplay is a ramp, not a jump — playbackRate eases
    // up over a beat so the clip visibly picks up speed rather than
    // snapping straight to normal playback the instant scrolling stops.
    function enterIdlePlay() {
      if (playing) return;
      playing = true;
      const proxy = { rate: MIN_RATE };
      setRate(proxy.rate);
      rgbVideo.play().catch(() => {});
      maskVideo.play().catch(() => {});
      rampTween?.kill();
      rampTween = gsap.to(proxy, {
        rate: 1, duration: 1.4, ease: 'sine.inOut',
        onUpdate: () => setRate(proxy.rate)
      });
    }
    function exitIdlePlay() {
      if (!playing) return;
      playing = false;
      rampTween?.kill();
      rampTween = null;
      rgbVideo.pause();
      maskVideo.pause();
      setRate(1);
    }
    function scrubTo(progress) {
      const duration = rgbVideo.duration;
      if (!Number.isFinite(duration)) return;
      const t = Math.max(0, Math.min(1, progress)) * duration;
      rgbVideo.currentTime = t;
      maskVideo.currentTime = t;
    }
    function armIdle() {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(enterIdlePlay, 600);
    }

    const section = root.closest('.section--work');

    // The actual approach: 0 the moment .section--work's top edge
    // appears at the bottom of the viewport, 1 once that edge reaches
    // the top — a full viewport of scroll distance mapped straight onto
    // the clip, so the video is genuinely under the scrollbar's control
    // while arriving. Scrubbing only lives here; leaving/re-entering
    // WORK is handled by the wider trigger below so that scrolling
    // further through the (taller-than-viewport) section once already
    // arrived doesn't read as "leaving" and cut the clip off.
    ScrollTrigger.create({
      trigger: section || root,
      start: 'top bottom',
      end: 'top top',
      onUpdate: (self) => {
        if (!self.isActive) return;
        exitIdlePlay();
        scrubTo(self.progress);
        armIdle();
      },
      onEnter: armIdle,
      onEnterBack: armIdle
    });

    // Same window as the navbar-hide/magnet triggers above — the video
    // only actually stops once WORK has genuinely left the screen in
    // either direction, not the moment the approach above finishes.
    if (section) {
      ScrollTrigger.create({
        trigger: section,
        start: 'top top+=160',
        end: 'bottom top-=160',
        onLeave: exitIdlePlay,
        onLeaveBack: exitIdlePlay
      });
    }
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

    $$('.is-invert').forEach(registerDarkSurface);

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
      const text = el.textContent;
      ScrollTrigger.create({
        trigger: el,
        start: 'top 92%',
        once: true,
        onEnter: () => window.VRGD.scramble(el, text, 0.7)
      });
    });

    if (REDUCED) return;

    // Plates wipe up instead of just fading.
    $$('.asset__stage').forEach((el) => {
      el.setAttribute('data-clip', '');
      gsap.to(el, {
        clipPath: 'inset(0% 0 0 0)',
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
      ['spotlight', initSpotlight], ['spotlightDeco', initSpotlightDeco], ['logoBlend', initLogoBlend], ['nav', initNav],
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
