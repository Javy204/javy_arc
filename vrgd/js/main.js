/* =========================================================
   VRgD — motion layer
   GSAP 3.15 + Lenis. Vanilla, no build step.
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(ScrollTrigger, SplitText, Flip, CustomEase, Observer, Draggable, InertiaPlugin);

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAN_HOVER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* =======================================================
     1. Smooth scroll — Lenis driven by the GSAP ticker
     ======================================================= */
  const lenis = new Lenis({ anchors: false, allowNestedScroll: true, lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);

  const scrollTo = (target) => lenis.scrollTo(target, { offset: 0, duration: 1.4 });

  /* =======================================================
     2. Scramble text — shared routine
     Mirrors the reference site: ~60% of glyphs churn, a few
     of them flash in the accent colour, then resolve.
     ======================================================= */
  function scramble(el, finalText, duration = 0.65, color = 'var(--red)') {
    if (el._tw) el._tw.kill();
    if (!finalText) { el.textContent = ''; return; }

    const churn = [];
    for (let i = 0; i < finalText.length; i++) {
      if (finalText[i] !== ' ' && Math.random() < 0.6) churn.push(i);
    }
    const STEP = 0.06;
    let last = 0;
    const proxy = { value: 0 };

    el._tw = gsap.to(proxy, {
      value: 1,
      duration,
      ease: 'power1.out',
      onUpdate() {
        const now = el._tw.time();
        if (proxy.value < 0.75) {
          if (now - last < STEP) return;
          last = now;
          const chars = finalText.split('');
          churn.forEach((i) => {
            const g = GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
            chars[i] = Math.random() < 0.15 ? `<span style="color:${color}">${g}</span>` : g;
          });
          el.innerHTML = chars.join('');
        } else {
          el.textContent = finalText;
        }
      },
      onComplete() { el.textContent = finalText; }
    });
  }

  /* =======================================================
     3. Custom cursor — position + contextual scrambled label
     ======================================================= */
  function initCursor() {
    const cursor = $('[data-cursor]');
    const label = $('[data-cursor-text-target]');
    if (!cursor || !CAN_HOVER) return;

    const setX = gsap.quickTo(cursor, 'x', { duration: 0.4, ease: 'power3.out' });
    const setY = gsap.quickTo(cursor, 'y', { duration: 0.4, ease: 'power3.out' });

    let x = 0, y = 0, moved = false, lastTarget = null;

    const sync = () => {
      const hit = document.elementFromPoint(x, y)?.closest('[data-cursor-hover]');
      const atEdge = cursor.getBoundingClientRect().right >= window.innerWidth - 90;
      cursor.setAttribute('data-cursor', hit ? (atEdge ? 'active-edge' : 'active') : '');
      if (label && hit !== lastTarget) {
        scramble(label, hit?.getAttribute('data-cursor-text') || '', 0.5);
        lastTarget = hit;
      }
    };

    window.addEventListener('mousemove', (e) => {
      x = e.clientX; y = e.clientY; moved = true;
      setX(x); setY(y);
      requestAnimationFrame(sync);
    });
    window.addEventListener('scroll', () => { if (moved) requestAnimationFrame(sync); }, { passive: true });
  }

  /* =======================================================
     4. Scramble on hover — nav / links
     ======================================================= */
  function initScrambleHover() {
    $$('[data-scramble-hover="link"]').forEach((link) => {
      const targets = $$('[data-scramble-hover="target"]', link);
      if (!targets.length) return;
      const entries = targets.map((el) => ({ el, text: el.textContent }));
      link.addEventListener('mouseenter', () => {
        entries.forEach(({ el, text }) => scramble(el, text, 0.65));
      });
    });
  }

  /* =======================================================
     5. Reveals
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
     6. Dithered backdrop — stands in until hero.mp4 exists
     Low-res value noise pushed through a 4x4 Bayer matrix,
     upscaled with image-rendering: pixelated.
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

    function frame() {
      if (!running) return;
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

          // Soft lit blob at centre, dissolving to black at the edges.
          const dx = (x / W - 0.5) * 2;
          const glow = Math.max(0, 1 - Math.hypot(dx, dy) * 0.92);
          const v = (0.5 + n * 0.5) * glow * glow * 0.85;

          const threshold = (BAYER[y & 3][x & 3] + 0.5) / 16;
          const i = (y * W + x) * 4;
          // Faint ink on paper — a texture, not a pattern. The logotype must win.
          const shade = v > threshold * 1.25 ? 231 - Math.round(v * 22) : 244;
          d[i] = shade; d[i + 1] = shade; d[i + 2] = shade - 2; d[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      raf = setTimeout(() => requestAnimationFrame(frame), 55); // ~18fps, on purpose
    }

    const stop = () => { running = false; clearTimeout(raf); };

    if (REDUCED) { frame(); stop(); return; }
    frame();

    // Hand over to real footage — but only if it has been dropped in.
    const video = $('[data-hero-video]');
    const src = video?.getAttribute('data-src');
    if (video && src) {
      video.addEventListener('canplay', () => {
        video.setAttribute('data-ready', 'true');
        video.play().catch(() => {});
        gsap.delayedCall(1.3, stop);
      }, { once: true });

      // Probe first so a missing file is a silent 404, not a media error.
      fetch(src, { method: 'HEAD' })
        .then((res) => { if (res.ok) { video.src = src; video.load(); } })
        .catch(() => {});
    }

    // Pause when the hero leaves the viewport.
    ScrollTrigger.create({
      trigger: '.hero',
      start: 'top bottom', end: 'bottom top',
      onLeave: stop,
      onEnterBack: () => { if (!running && !$('[data-hero-video][data-ready="true"]')) { running = true; frame(); } }
    });
  }

  /* =======================================================
     7. Loader — counter, bar, then the plate opens to full bleed
     ======================================================= */
  function initLoader() {
    const media = $('[data-hero-media]');
    const items = $$('[data-loader-item]');
    const text = $('[data-loader-text]');
    const bar = $('[data-loader-bar]');
    const loader = $('[data-loader]');
    const reveal = ['.navbar', '.sidenav', '[data-hero-bottom]', '[data-hero-markers]'];

    const settle = () => {
      document.body.setAttribute('data-loading', 'false');
      lenis.start();
      ScrollTrigger.refresh();
    };

    const logo = $('[data-hero-logo]');

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
      .to('[data-hero-bottom]', { autoAlpha: 1, y: 0, duration: 1, ease: 'power4.out' }, '<+0.1')
      .to('[data-hero-markers]', { autoAlpha: 1, duration: 0.8, ease: 'power4.out' }, '<');
  }

  /* =======================================================
     8. Hero — parallax, logo drift, chromatic split
     ======================================================= */
  function initHero() {
    const logo = $('[data-hero-logo]');
    if (!REDUCED) {
      gsap.to('[data-hero-parallax]', {
        yPercent: 12,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
      // No scale here — the loader owns that channel and a scrub would fight it.
      gsap.to(logo, {
        yPercent: -18,
        autoAlpha: 0.2,
        ease: 'none',
        scrollTrigger: { trigger: '.hero', start: 'top top', end: 'bottom top', scrub: true }
      });
    }

    // A single red plate drifting off register — the one bit of colour.
    const r = logo && $('.split--r', logo);
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
     9. Work slider — drag with inertia + progress bar
     ======================================================= */
  function initSlider() {
    const track = $('[data-slider-track]');
    const wrap = $('[data-slider]');
    const progress = $('[data-slider-progress]');
    if (!track || !wrap) return;

    let bounds = { minX: 0, maxX: 0 };

    const measure = () => {
      const overflow = track.scrollWidth - wrap.clientWidth;
      bounds = { minX: -Math.max(0, overflow), maxX: 0 };
      return bounds;
    };
    measure();

    // The thumb is 18% wide, so a full pass is (100-18)/18 = 455.6% of itself.
    const TRAVEL = ((100 - 18) / 18) * 100;
    const paint = () => {
      if (!progress) return;
      const span = Math.abs(bounds.minX) || 1;
      const p = Math.min(1, Math.abs(gsap.getProperty(track, 'x')) / span);
      progress.style.transform = `translateX(${p * TRAVEL}%)`;
    };

    const drag = Draggable.create(track, {
      type: 'x',
      inertia: true,
      edgeResistance: 0.9,
      bounds,
      onDrag: paint,
      onThrowUpdate: paint,
      cursor: 'grab',
      activeCursor: 'grabbing'
    })[0];

    window.addEventListener('resize', () => {
      measure();
      gsap.set(track, { x: gsap.utils.clamp(bounds.minX, 0, gsap.getProperty(track, 'x')) });
      drag.applyBounds(bounds);
      paint();
    });

    // Cards drift in as the section arrives.
    if (!REDUCED) {
      gsap.from($$('.card', track), {
        y: 60, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { trigger: wrap, start: 'top 80%', once: true }
      });
    }
  }

  /* =======================================================
     10. Fullscreen menu
     ======================================================= */
  function initMenu() {
    const wrapper = $('[data-menu-wrapper]');
    const menu = $('[data-menu]');
    if (!wrapper || !menu) return;

    let animating = false, open = false;

    const openMenu = () => {
      if (animating || open) return;
      animating = true; open = true;
      wrapper.classList.add('is-open');
      lenis.stop();
      gsap.timeline({ onComplete: () => { animating = false; } })
        .to(wrapper, { opacity: 1, duration: 0.1, ease: 'power4.out' })
        .to(menu, { scale: 1, duration: 0.35, ease: 'expo.out' }, '>-0.05')
        .from('.menu__list a', { y: 40, autoAlpha: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05 }, '<0.1');
    };

    const closeMenu = () => {
      if (animating || !open) return;
      animating = true; open = false;
      gsap.timeline({
        onComplete: () => { wrapper.classList.remove('is-open'); animating = false; lenis.start(); }
      })
        .to(menu, { scale: 0, duration: 0.25, ease: 'expo.in' })
        .to(wrapper, { opacity: 0, duration: 0.1, ease: 'power1.in' }, '>-0.05');
    };

    $$('[data-menu-button="open"]').forEach((b) => b.addEventListener('click', openMenu));
    $$('[data-menu-button="close"]').forEach((b) => b.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    $$('[data-menu-link]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        closeMenu();
        gsap.delayedCall(0.45, () => scrollTo(a.getAttribute('href')));
      });
    });
  }

  /* =======================================================
     11. Section nav — smooth anchors + active state
     ======================================================= */
  function initNav() {
    $$('[data-nav-link]').forEach((a) => {
      a.addEventListener('click', (e) => { e.preventDefault(); scrollTo(a.getAttribute('href')); });
    });
    $('.navbar__mark')?.addEventListener('click', (e) => { e.preventDefault(); scrollTo(0); });

    $$('main section[id], main footer[id]').forEach((section) => {
      const link = $(`[data-nav-link][href="#${section.id}"]`);
      if (!link) return;
      ScrollTrigger.create({
        trigger: section,
        start: 'top 55%',
        end: 'bottom 55%',
        onToggle: (self) => link.setAttribute('data-active', self.isActive ? 'true' : 'false')
      });
    });
  }

  /* =======================================================
     12. Small print — local time, year
     ======================================================= */
  function initClock() {
    const nodes = $$('[data-local-time]');
    const year = $('[data-year]');
    if (year) year.textContent = String(new Date().getFullYear());
    if (!nodes.length) return;
    const tick = () => {
      const now = new Date().toLocaleTimeString('en-GB', {
        timeZone: 'Europe/Prague', hour12: false
      });
      nodes.forEach((n) => { n.textContent = now; });
    };
    tick();
    setInterval(tick, 1000);
  }

  /* =======================================================
     Boot
     ======================================================= */
  function boot() {
    initCursor();
    initScrambleHover();
    initDither();
    initHero();
    initSlider();
    initMenu();
    initNav();
    initClock();
    initReveals();
    initLoader();
    ScrollTrigger.refresh();
  }

  if (document.fonts?.ready) {
    document.fonts.ready.then(boot);
  } else {
    window.addEventListener('load', boot);
  }
})();
