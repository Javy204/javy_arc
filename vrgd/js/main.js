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

    // initHeroScrub owns loading and playback; the canvas just steps aside once
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
     4b. Scroll-driven playback
     The hero pins and scroll position maps straight onto the
     video's currentTime, so the shot advances by exactly the
     amount you scrolled. A lerp keeps seeking from stuttering.
     ======================================================= */
  function initHeroScrub() {
    const hero = $('.hero');
    const stage = $('[data-hero-stage]');
    const video = $('[data-hero-video]');
    if (!hero || !stage || !video || REDUCED) return;

    const src = video.getAttribute('data-src');
    if (!src) return;

    // Only arm the scrub once we know the file is actually there and decodable.
    fetch(src, { method: 'HEAD' })
      .then((res) => { if (res.ok) arm(); })
      .catch(() => {});

    function arm() {
      video.removeAttribute('loop');
      video.src = src;
      video.load();

      video.addEventListener('loadedmetadata', () => {
        const duration = video.duration;
        if (!duration || !isFinite(duration)) return;

        // Safari will not decode for seeking until playback has been touched.
        video.play().then(() => video.pause()).catch(() => {});

        video.setAttribute('data-ready', 'true');
        hero.classList.add('has-scrub');
        ScrollTrigger.refresh();

        let target = 0;

        ScrollTrigger.create({
          trigger: hero,
          start: 'top top',
          end: 'bottom bottom',
          pin: stage,
          pinSpacing: false,
          scrub: true,
          onUpdate: (self) => { target = self.progress * duration; }
        });

        // Chase the target instead of snapping to it — a raw currentTime write
        // on every scroll event makes the decoder thrash. And never queue a
        // seek while one is still in flight; that is what causes the stutter.
        gsap.ticker.add(() => {
          if (video.readyState < 2 || video.seeking) return;
          const now = video.currentTime;
          const delta = target - now;
          if (Math.abs(delta) < 0.004) return;          // deadzone: already there
          video.currentTime = now + delta * 0.18;
        });
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
      // Both of these ride the tail of the hero, so they read the same whether
      // the hero is one viewport or pinned across several.
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
     6. Work slider — drag with inertia + progress bar
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

    if (!REDUCED) {
      gsap.from($$('.card', track), {
        y: 60, autoAlpha: 0, duration: 1, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { trigger: wrap, start: 'top 80%', once: true }
      });
    }
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

    // No backdrop. Instead the chrome flips its own colours whenever an
    // inverted section is actually behind it.
    const sidenav = $('.sidenav');
    const spine = $('[data-spine]');
    $$('.is-invert').forEach((dark) => {
      if (navbar) {
        ScrollTrigger.create({
          trigger: dark,
          start: `top top+=${parseFloat(getComputedStyle(navbar).minHeight) || 72}`,
          end: 'bottom top',
          onToggle: (self) => navbar.classList.toggle('on-invert', self.isActive)
        });
      }
      [sidenav, spine].filter(Boolean).forEach((el) => {
        ScrollTrigger.create({
          trigger: dark,
          start: 'top center',
          end: 'bottom center',
          onToggle: (self) => el.classList.toggle('on-invert', self.isActive)
        });
      });
    });

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
    $$('.card__thumb, .asset__stage').forEach((el) => {
      el.setAttribute('data-clip', '');
      gsap.to(el, {
        clipPath: 'inset(0% 0 0 0)',
        duration: 1.1,
        ease: 'expo.out',
        scrollTrigger: { trigger: el, start: 'top 88%', once: true }
      });
    });

    // List rows nudge in from the left.
    gsap.from('.about__list li', {
      x: -28, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.07,
      scrollTrigger: { trigger: '.about__list', start: 'top 85%', once: true }
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
    initDither();
    initHeroScrub();
    initHero();
    initSlider();
    initNav();
    initChrome();
    initNavSwitch();
    initSpine();
    initMicroMotion();
    initReveals();
    initLoader();
    ScrollTrigger.refresh();
  }

  if (document.fonts?.ready) document.fonts.ready.then(boot);
  else window.addEventListener('load', boot);
})();
