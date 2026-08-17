/* =========================================================
   VRgD — shared motion layer
   Loaded by every page. Owns the cursor, scramble text,
   the clock and the fullscreen menu.
   ========================================================= */
(() => {
  'use strict';

  const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#$%&@';
  const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const CAN_HOVER = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* -------------------------------------------------------
     Scramble text — ~60% of glyphs churn, a few flash in the
     accent colour, then the string resolves.
     ------------------------------------------------------- */
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

  /* Pages register their smooth-scroll instance here so the
     menu can pause it without shared.js depending on Lenis. */
  window.VRGD = { scramble, REDUCED, CAN_HOVER, $, $$, lenis: null };

  /* -------------------------------------------------------
     Custom cursor
     ------------------------------------------------------- */
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

  /* -------------------------------------------------------
     Scramble on hover
     ------------------------------------------------------- */
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

  /* -------------------------------------------------------
     Fullscreen menu
     ------------------------------------------------------- */
  function initMenu() {
    const wrapper = $('[data-menu-wrapper]');
    const menu = $('[data-menu]');
    if (!wrapper || !menu) return;

    let animating = false, open = false;

    const openMenu = () => {
      if (animating || open) return;
      animating = true; open = true;
      wrapper.classList.add('is-open');
      window.VRGD.lenis?.stop();
      gsap.timeline({ onComplete: () => { animating = false; } })
        .to(wrapper, { opacity: 1, duration: 0.1, ease: 'power4.out' })
        .to(menu, { scale: 1, duration: 0.35, ease: 'expo.out' }, '>-0.05')
        .from('.menu__list a', { y: 40, autoAlpha: 0, duration: 0.6, ease: 'expo.out', stagger: 0.05 }, '<0.1');
    };

    const closeMenu = () => {
      if (animating || !open) return;
      animating = true; open = false;
      gsap.timeline({
        onComplete: () => { wrapper.classList.remove('is-open'); animating = false; window.VRGD.lenis?.start(); }
      })
        .to(menu, { scale: 0, duration: 0.25, ease: 'expo.in' })
        .to(wrapper, { opacity: 0, duration: 0.1, ease: 'power1.in' }, '>-0.05');
    };

    $$('[data-menu-button="open"]').forEach((b) => b.addEventListener('click', openMenu));
    $$('[data-menu-button="close"]').forEach((b) => b.addEventListener('click', closeMenu));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeMenu(); });

    // Same-page anchors close the menu and scroll; real page links just navigate.
    $$('[data-menu-link]').forEach((a) => {
      a.addEventListener('click', (e) => {
        e.preventDefault();
        closeMenu();
        gsap.delayedCall(0.45, () => {
          const t = a.getAttribute('href');
          window.VRGD.lenis ? window.VRGD.lenis.scrollTo(t, { duration: 1.4 }) : (location.hash = t);
        });
      });
    });

    window.VRGD.closeMenu = closeMenu;
  }

  /* -------------------------------------------------------
     Local time + year
     ------------------------------------------------------- */
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

  const boot = () => {
    initCursor();
    initScrambleHover();
    initMenu();
    initClock();
  };

  if (document.fonts?.ready) document.fonts.ready.then(boot);
  else window.addEventListener('load', boot);
})();
