/* =========================================================
   VRgD — subpage motion (events.html, shop.html)
   Cursor, scramble, menu and clock live in shared.js.
   Each block bails out if its markup is not on the page, so
   one file serves every subpage.
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(ScrollTrigger, Observer);

  const { REDUCED, $, $$ } = window.VRGD;

  /* Smooth scroll, same feel as the index. */
  const lenis = new Lenis({ anchors: false, allowNestedScroll: true, lerp: 0.09 });
  lenis.on('scroll', ScrollTrigger.update);
  gsap.ticker.add((t) => lenis.raf(t * 1000));
  gsap.ticker.lagSmoothing(0);
  window.VRGD.lenis = lenis;

  /* Section head meta scrambles itself into place, as on the index. */
  function initHeadings() {
    $$('.section__head .mono').forEach((el) => {
      ScrollTrigger.create({
        trigger: el, start: 'top 95%', once: true,
        // Read the text on enter, not on create — initShop/initEvents fill the
        // counters after this runs, and capturing early scrambled back to the
        // stale placeholder.
        onEnter: () => window.VRGD.scramble(el, el.textContent, 0.7)
      });
    });
  }

    /* =======================================================
       6b. Events — vertical carousel with two synced meta columns.
       Built on Observer rather than pulling in another slider.
       ======================================================= */
    function initEvents() {
      const root = $('[data-events]');
      const stage = $('[data-events-stage]');
      if (!root || !stage) return;

      const cards = $$('[data-events-card]', stage);
      const namesList = $('[data-events-names]');
      const dates = $$('[data-events-dates] li');
      if (!cards.length) return;

      // Names column is generated from the cards so the two can never drift.
      cards.forEach((card, i) => {
        const li = document.createElement('li');
        li.innerHTML = `<span class="events__bullet"></span>[${String(i + 1).padStart(2, '0')}] ${card.querySelector('h3').textContent}`;
        li.addEventListener('click', () => go(i));
        namesList?.appendChild(li);
      });
      const names = $$('li', namesList);

      const count = $('[data-events-count]');
      if (count) count.textContent = `[${String(cards.length).padStart(2, '0')}]`;

      const SPACING = 104;  // px between stacked cards — enough that neighbours peek
      let index = 0;

      function layout(animate) {
        cards.forEach((card, i) => {
          const off = i - index;
          const away = Math.abs(off);
          gsap.to(card, {
            yPercent: -50,
            y: off * SPACING,
            scale: Math.max(0.72, 1 - away * 0.11),
            autoAlpha: away === 0 ? 1 : Math.max(0, 0.42 - (away - 1) * 0.18),
            zIndex: cards.length - away,
            duration: animate ? 0.75 : 0,
            ease: 'expo.out',
            overwrite: 'auto'
          });
        });
        names.forEach((li, i) => li.setAttribute('data-active', String(i === index)));
        dates.forEach((li, i) => li.setAttribute('data-active', String(i === index)));
      }

      function go(next) {
        const clamped = gsap.utils.clamp(0, cards.length - 1, next);
        if (clamped === index) return;
        index = clamped;
        layout(true);
      }

      layout(false);

      if (REDUCED) return;

      // Wheel and drag move one step at a time; the section keeps its own scroll
      // once an edge is reached, so the page never feels trapped.
      Observer.create({
        target: stage,
        type: 'wheel,touch',
        tolerance: 40,
        preventDefault: false,
        onUp: () => go(index - 1),
        onDown: () => go(index + 1)
      });

      gsap.from(cards, {
        y: 40, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06,
        scrollTrigger: { trigger: root, start: 'top 80%', once: true },
        onComplete: () => layout(false)
      });
    }

    /* =======================================================
       6bb. Shop — lookbook grid with a working size filter.
       No cart: a static host cannot take payment, so each item
       is an enquiry link until a real store is wired up.
       ======================================================= */
    function initShop() {
      const grid = $('[data-shop-grid]');
      const bar = $('[data-shop-filter]');
      if (!grid || !bar) return;

      const items = $$('[data-shop-item]', grid);
      const buttons = $$('button', bar);
      const empty = $('[data-shop-empty]');
      const count = $('[data-shop-count]');

      const setCount = (n) => {
        if (count) count.textContent = `[${String(n).padStart(2, '0')}]`;
      };
      setCount(items.length);

      function filter(size) {
        let shown = 0;
        items.forEach((item) => {
          const sizes = (item.getAttribute('data-sizes') || '').split(/\s+/);
          const match = size === 'all' || sizes.includes(size);
          item.hidden = !match;
          if (match) shown++;
        });

        buttons.forEach((b) => b.setAttribute('data-active', String(b.getAttribute('data-size') === size)));
        if (empty) empty.hidden = shown > 0;
        setCount(shown);

        if (!REDUCED && shown) {
          gsap.fromTo(items.filter((i) => !i.hidden),
            { autoAlpha: 0, y: 14 },
            { autoAlpha: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.04, overwrite: true });
        }
        ScrollTrigger.refresh();
      }

      buttons.forEach((b) => b.addEventListener('click', () => filter(b.getAttribute('data-size'))));

      if (!REDUCED) {
        gsap.from(items, {
          y: 40, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.06,
          scrollTrigger: { trigger: grid, start: 'top 82%', once: true }
        });
      }
    }

  /* =======================================================
     Boot — isolated so one failing block cannot blank the page
     ======================================================= */
  /* headings runs LAST on purpose: it scrambles the section-head meta, and the
     counters there are filled in by initEvents/initShop. Scrambling first
     captured the "[00]" placeholder and wrote it back over the real count. */
  const modules = [
    ['events', initEvents], ['shop', initShop], ['headings', initHeadings]
  ];
  const boot = () => {
    modules.forEach(([name, fn]) => {
      try { fn(); } catch (err) { console.error(`[vrgd] ${name} failed:`, err); }
    });
    ScrollTrigger.refresh();
  };

  if (document.fonts?.ready) document.fonts.ready.then(boot);
  else window.addEventListener('load', boot);
})();
