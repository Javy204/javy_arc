/* =========================================================
   VRgD — infinite draggable gallery
   4 tiled clones of the list + wrapped x/y on the collection,
   driven by Observer, with an ambient drift that never stops.
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(Observer, Draggable, InertiaPlugin);

  const { REDUCED, $, $$ } = window.VRGD;

  const wrapper    = $('[data-ig-init]');
  const collection = $('[data-ig-collection]');
  const sourceList = $('[data-ig-list]');
  if (!wrapper || !collection || !sourceList) return;

  /* --- tuning ------------------------------------------- */
  const WHEEL_SPEED   = 0.75;
  const DRAG_SPEED    = 1.25;
  const DRIFT_X       = 0.30;   // px per 60fps frame
  const DRIFT_Y       = 0.15;
  const MAX_DRIFT     = 1.20;   // cap after a throw
  const DRIFT_DECAY   = 0.995;  // closer to 1 = coasts longer
  const CLICK_SLOP    = 5;      // px of movement still counted as a click
  const TILE_COPIES   = 4;      // 2 x 2

  let items = [];
  let tileW = 0, tileH = 0;
  let currentX = 0, currentY = 0;
  let xTo, yTo, observer, driftTicker, resizeTimer;
  let driftVX = DRIFT_X, driftVY = DRIFT_Y;
  let interacting = false, popupOpen = false;

  const setStatus = (s) => wrapper.setAttribute('data-ig-status', s);

  /* =======================================================
     1. Content — from assets/gallery.json
     ======================================================= */
  function makeItem(entry, index) {
    const item = document.createElement('div');
    item.className = 'ig__item';
    item.setAttribute('data-ig-item', '');
    item.setAttribute('role', 'listitem');

    const card = document.createElement('div');
    card.className = 'ig__card';
    card.setAttribute('data-ig-card', '');
    card.setAttribute('data-index', String(index));
    card.setAttribute('data-cursor-hover', '');
    card.setAttribute('data-cursor-text', 'more info');

    if (entry.src) {
      const img = document.createElement('img');
      img.className = 'ig__img';
      img.src = entry.src;
      img.alt = entry.title || '';
      img.loading = index < 8 ? 'eager' : 'lazy';
      // A missing file falls back to the halftone plate rather than a broken icon.
      img.addEventListener('error', () => {
        img.remove();
        card.setAttribute('data-placeholder', String((index % 6) + 1));
      }, { once: true });
      card.appendChild(img);
    } else {
      card.setAttribute('data-placeholder', String((index % 6) + 1));
    }

    const idx = document.createElement('span');
    idx.className = 'ig__idx mono';
    idx.textContent = `[${String(index + 1).padStart(2, '0')}]`;
    card.appendChild(idx);

    item.appendChild(card);
    return item;
  }

  /* =======================================================
     2. Popups — built once, keyed by index, parked on <body>
     so the grid clones never duplicate them.
     ======================================================= */
  const popups = new Map();
  let activePopup = null;

  function buildPopup(entry, index) {
    const pop = document.createElement('div');
    pop.className = 'ig-popup';
    pop.setAttribute('data-ig-popup', String(index));

    pop.innerHTML = `
      <div class="ig-popup__bar">
        <span class="mono">[${String(index + 1).padStart(2, '0')}]</span>
        <span class="mono is-dim ig-popup__grab">DRAG ME</span>
        <button class="ig-popup__close mono" data-ig-popup-close aria-label="Close">CLOSE</button>
      </div>
      <div class="ig-popup__stage" data-placeholder="${(index % 6) + 1}"></div>
      <div class="ig-popup__meta">
        <h2>${entry.title || 'Untitled'}</h2>
        <span class="mono is-dim">${entry.meta || ''}</span>
      </div>
      ${entry.body ? `<p class="ig-popup__body">${entry.body}</p>` : ''}
    `;

    if (entry.src) {
      const stage = pop.querySelector('.ig-popup__stage');
      const img = document.createElement('img');
      img.src = entry.src;
      img.alt = entry.title || '';
      img.loading = 'lazy';
      img.addEventListener('error', () => img.remove(), { once: true });
      stage.appendChild(img);
      stage.removeAttribute('data-placeholder');
    }

    document.body.appendChild(pop);
    popups.set(index, pop);

    Draggable.create(pop, {
      bounds: document.body,
      inertia: true,
      trigger: pop.querySelector('.ig-popup__bar'),
      cursor: 'grab',
      activeCursor: 'grabbing'
    });
    return pop;
  }

  function openPopup(index) {
    const pop = popups.get(index);
    if (!pop) return;
    if (activePopup && activePopup !== pop) closePopup();

    activePopup = pop;
    popupOpen = true;
    setStatus('paused');

    // Land it near the middle, slightly offset per item so repeats feel placed.
    const jitter = ((index % 5) - 2) * 26;
    gsap.set(pop, {
      x: jitter, y: jitter * 0.6, scale: 0.92, autoAlpha: 0,
      zIndex: 700, display: 'flex'
    });
    gsap.to(pop, { scale: 1, autoAlpha: 1, duration: 0.45, ease: 'expo.out' });
  }

  function closePopup() {
    if (!activePopup) return;
    const pop = activePopup;
    activePopup = null;
    popupOpen = false;
    setStatus('idle');
    gsap.to(pop, {
      scale: 0.94, autoAlpha: 0, duration: 0.25, ease: 'power2.in',
      onComplete: () => gsap.set(pop, { display: 'none' })
    });
  }

  document.addEventListener('click', (e) => {
    if (e.target.closest('[data-ig-popup-close]')) closePopup();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePopup(); });

  /* =======================================================
     3. Build the tiled grid
     ======================================================= */
  function buildGrid() {
    if (observer) observer.kill();
    if (driftTicker) { gsap.ticker.remove(driftTicker); driftTicker = null; }
    setStatus('loading');

    collection.innerHTML = '';

    // Measure one cell off-screen.
    const probe = items[0].cloneNode(true);
    probe.style.cssText = 'position:absolute;visibility:hidden;pointer-events:none';
    wrapper.appendChild(probe);
    const { width: cellW, height: cellH } = probe.getBoundingClientRect();
    probe.remove();
    if (!cellW || !cellH) return;

    const columns = Math.max(1, Math.ceil(wrapper.clientWidth / cellW) + 1);
    const rows    = Math.max(1, Math.ceil(wrapper.clientHeight / cellH) + 1);
    const perList = columns * rows;

    const frag = document.createDocumentFragment();
    for (let copy = 0; copy < TILE_COPIES; copy++) {
      const list = document.createElement('div');
      list.className = 'ig__list';
      list.setAttribute('data-ig-list', '');
      list.style.setProperty('--ig-columns', columns);
      if (copy > 0) list.setAttribute('aria-hidden', 'true');

      for (let i = 0; i < perList; i++) {
        const clone = items[i % items.length].cloneNode(true);
        if (copy > 0) clone.setAttribute('aria-hidden', 'true');
        list.appendChild(clone);
      }
      frag.appendChild(list);
    }
    collection.appendChild(frag);
    requestAnimationFrame(placeTiles);
  }

  function placeTiles() {
    const lists = $$('[data-ig-list]', collection);
    if (lists.length < TILE_COPIES) return;

    const listRect = lists[0].getBoundingClientRect();
    const cellRect = lists[0].firstElementChild.getBoundingClientRect();
    tileW = listRect.width;
    tileH = listRect.height;

    // 2 x 2 so any wrap direction always has a neighbour ready.
    gsap.set(lists[0], { xPercent: 0,   yPercent: 0 });
    gsap.set(lists[1], { xPercent: 100, yPercent: 0 });
    gsap.set(lists[2], { xPercent: 0,   yPercent: 100 });
    gsap.set(lists[3], { xPercent: 100, yPercent: 100 });

    const wrapX = gsap.utils.wrap(-tileW, 0);
    const wrapY = gsap.utils.wrap(-tileH, 0);

    currentX = wrapX((wrapper.clientWidth - tileW) * 0.5);
    currentY = wrapY((wrapper.clientHeight - cellRect.height) * 0.5);

    // The wrap lives in modifiers, so the tween never sees a jump.
    xTo = gsap.quickTo(collection, 'x', {
      duration: 1.2, ease: 'expo.out',
      modifiers: { x: gsap.utils.unitize(wrapX) }
    });
    yTo = gsap.quickTo(collection, 'y', {
      duration: 1.2, ease: 'expo.out',
      modifiers: { y: gsap.utils.unitize(wrapY) }
    });

    gsap.set(collection, { x: currentX, y: currentY });
    requestAnimationFrame(() => setStatus('idle'));

    observer = Observer.create({
      target: wrapper,
      type: 'wheel,touch,pointer',
      preventDefault: true,
      dragMinimum: 3,
      onPress()   { interacting = true; setStatus('dragging'); },
      onRelease() { interacting = false; setStatus(popupOpen ? 'paused' : 'idle'); },
      onStop()    { interacting = false; setStatus(popupOpen ? 'paused' : 'idle'); },
      onChangeX(self) { move(self, 'x'); },
      onChangeY(self) { move(self, 'y'); }
    });

    startDrift();
  }

  function move(self, axis) {
    const isWheel = self.event?.type === 'wheel';
    const speed = isWheel ? WHEEL_SPEED : DRAG_SPEED;
    const delta = (axis === 'x' ? self.deltaX : self.deltaY) * speed * (isWheel ? -1 : 1);

    if (axis === 'x') { currentX += delta; xTo(currentX); }
    else              { currentY += delta; yTo(currentY); }

    // A throw hands its momentum to the drift, capped so it stays calm.
    const v = gsap.utils.clamp(-MAX_DRIFT, MAX_DRIFT, delta * 0.05);
    if (axis === 'x') driftVX = v || driftVX;
    else              driftVY = v || driftVY;
  }

  /* =======================================================
     4. Ambient drift — the grid is never quite still
     ======================================================= */
  function startDrift() {
    if (REDUCED) return;
    if (driftTicker) gsap.ticker.remove(driftTicker);

    driftTicker = () => {
      if (interacting || popupOpen) return;
      const dr = gsap.ticker.deltaRatio(); // normalise to 60fps

      currentX += driftVX * dr;
      currentY += driftVY * dr;
      xTo(currentX);
      yTo(currentY);

      // Ease back toward the gentle baseline instead of stopping dead.
      driftVX += (DRIFT_X - driftVX) * (1 - DRIFT_DECAY);
      driftVY += (DRIFT_Y - driftVY) * (1 - DRIFT_DECAY);
    };
    gsap.ticker.add(driftTicker);
  }

  /* =======================================================
     5. Click vs drag — without this every throw opens a popup
     ======================================================= */
  let pressX = 0, pressY = 0, dragged = false, pressed = false;

  wrapper.addEventListener('pointerdown', (e) => {
    if (!e.target.closest('[data-ig-card]')) return;
    pressX = e.clientX; pressY = e.clientY;
    dragged = false; pressed = true;
  });

  wrapper.addEventListener('pointermove', (e) => {
    if (!pressed) return;
    if (Math.abs(e.clientX - pressX) > CLICK_SLOP ||
        Math.abs(e.clientY - pressY) > CLICK_SLOP) dragged = true;
  });

  wrapper.addEventListener('pointerup', (e) => {
    if (!pressed) return;
    pressed = false;
    const card = e.target.closest('[data-ig-card]');
    if (!card || dragged) return;
    openPopup(Number(card.getAttribute('data-index')));
  });

  /* =======================================================
     6. Boot
     ======================================================= */
  async function init() {
    let entries = [];
    try {
      const res = await fetch('assets/gallery.json');
      if (res.ok) entries = (await res.json()).items || [];
    } catch { /* falls through to the placeholder set below */ }

    // Never render an empty grid — the mechanic should still be visible.
    if (!entries.length) {
      entries = Array.from({ length: 12 }, (_, i) => ({ title: `Untitled ${i + 1}`, meta: '—' }));
    }

    items = entries.map(makeItem);
    entries.forEach(buildPopup);
    gsap.set('.ig-popup', { display: 'none', autoAlpha: 0 });

    const count = $('[data-ig-count]');
    if (count) count.textContent = `[${String(entries.length).padStart(2, '0')}]`;

    sourceList.remove();
    buildGrid();

    window.addEventListener('resize', () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(buildGrid, 200);
    });
  }

  if (document.fonts?.ready) document.fonts.ready.then(init);
  else window.addEventListener('load', init);
})();
