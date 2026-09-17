/* =========================================================
   VRgD — gallery as a shelf of books
   Shelf of covers -> click zooms one cover into a fullscreen
   spread -> each further click turns a leaf.
   Cursor, scramble, menu and clock live in shared.js.
   ========================================================= */
(() => {
  'use strict';

  const { REDUCED, $, $$ } = window.VRGD;

  const shelf   = $('[data-shelf]');
  const reader  = $('[data-reader]');
  const bookEl  = $('[data-book]');
  const leavesEl = $('[data-book-leaves]');
  const versoEl = $('[data-book-verso]');
  const endEl   = $('[data-book-end]');
  if (!shelf || !reader || !bookEl) return;

  /* Smooth scroll for the shelf, same feel as the rest of the site. */
  if (window.Lenis) {
    const lenis = new Lenis({ anchors: false, lerp: 0.09 });
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.VRGD.lenis = lenis;
  }

  let books = [];
  let openIndex = -1;      // which book is open
  let leaves = [];         // leaf elements of the open book
  let turned = 0;          // how many leaves are turned
  let busy = false;        // one turn at a time

  /* -------------------------------------------------------
     Page art. No caption, no page number, no cropping — just the
     page, full bleed, so an open spread reads as an actual book
     and not a UI. A missing photo falls back to the halftone
     plate, so a book reads fine before any stills exist.
     ------------------------------------------------------- */
  function pageArt(src, alt, variant) {
    if (!src) return `<div class="leaf__art" data-placeholder="${variant}"></div>`;
    return `<div class="leaf__art"><img src="${src}" alt="${alt || ''}" loading="lazy"></div>`;
  }
  function faceMarkup(page, variant) {
    if (!page) return '<div class="leaf__face leaf__face--blank"></div>';
    return pageArt(page.src, page.caption, variant);
  }

  // book.pageAspect is "W / H" for ONE page (default 3 / 4) — the same ratio
  // a single open page renders at, so the shelf thumbnail (the book's title
  // screen before you've even opened it) can match it instead of forcing
  // every cover into one fixed mould.
  function pageRatioOf(book) {
    const [pw, ph] = String(book.pageAspect || '3 / 4').split('/').map((x) => parseFloat(x));
    return (pw > 0 && ph > 0) ? pw / ph : 0.75;
  }

  /* -------------------------------------------------------
     Shelf
     ------------------------------------------------------- */
  function buildShelf() {
    shelf.innerHTML = '';
    books.forEach((book, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = 'tome';
      el.setAttribute('role', 'listitem');
      el.setAttribute('data-tome', String(i));
      el.setAttribute('data-cursor-hover', '');
      el.setAttribute('data-cursor-text', 'open');
      el.style.setProperty('--cover-ratio', String(pageRatioOf(book)));
      el.innerHTML = `
        <span class="tome__cover"${book.cover ? '' : ` data-placeholder="${(i % 6) + 1}"`}>
          ${book.cover ? `<img src="${book.cover}" alt="">` : ''}
          <span class="tome__label"><h3>${book.title}</h3></span>
        </span>
        <span class="tome__meta">
          <span class="mono is-dim">${book.meta || ''}</span>
          <span class="mono is-dim">${String(book.pages.length).padStart(2, '0')} PP</span>
        </span>`;
      el.addEventListener('click', () => open(i, el));
      shelf.appendChild(el);
    });

    const count = $('[data-shelf-count]');
    if (count) count.textContent = `[${String(books.length).padStart(2, '0')}]`;
  }

  /* -------------------------------------------------------
     Build the opened book
     ------------------------------------------------------- */
  function buildBook(book) {
    const pages = book.pages || [];
    const n = Math.ceil(pages.length / 2);

    // The page frame matches the actual source images instead of forcing
    // every book into the same portrait mould. Doubling a single page's
    // ratio gives the two-page spread ratio that .book actually renders at
    // (see the width formula in style.css).
    const spreadRatio = pageRatioOf(book) * 2;
    bookEl.style.setProperty('--book-ratio', `${spreadRatio} / 1`);
    bookEl.style.setProperty('--book-ratio-num', String(spreadRatio));

    // Real print pagination (matched against the actual book proof): the
    // covers form their own opening spread — back cover left, front cover
    // right, exactly like the flat cover sheet a printer works from — and
    // ONLY THEN does content start, pairing flush from page one: (1,2)
    // (3,4) (5,6)… An earlier version let the cover eat page 1's spot on
    // the hinge, which quietly shifted every pair off by one.
    versoEl.innerHTML = pageArt(book.backCover, `${book.title} — back cover`, 6);

    leavesEl.innerHTML = '';
    leaves = [];
    for (let i = 0; i < n; i++) {
      // Leaf 0 is the cover leaf: front = front cover, back = page 1. Every
      // leaf after it carries two content pages, shifted by that one page.
      const front = i === 0 ? { src: book.cover, caption: book.title } : pages[2 * i - 1];
      const back  = i === 0 ? pages[0] : pages[2 * i];
      const leaf = document.createElement('div');
      leaf.className = 'leaf';
      leaf.innerHTML =
        `<div class="leaf__face leaf__face--front">${faceMarkup(front, (2 * i) % 6 + 1)}</div>
         <div class="leaf__face leaf__face--back">${faceMarkup(back, (2 * i + 1) % 6 + 1)}</div>`;
      leavesEl.appendChild(leaf);
      leaves.push(leaf);
    }
    // Leaf 0 sits on top of the unturned pile.
    leaves.forEach((leaf, i) => gsap.set(leaf, { rotateY: 0, zIndex: n - i }));
    turned = 0;

    // Whatever page didn't fit into a leaf pair lands here — for an even
    // page count (the normal case) that's simply the last page.
    const lastPage = pages[2 * n - 1];
    endEl.innerHTML = pageArt(lastPage?.src, lastPage?.caption, 1);
    paint();
  }

  function paint() {
    const total = leaves.length + 1;
    const c = $('[data-reader-count]');
    if (c) c.textContent = `${String(turned + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;
    $('[data-turn="-1"]').disabled = turned === 0;
    $('[data-turn="1"]').disabled = turned >= leaves.length;
  }

  /* -------------------------------------------------------
     Turning. z-index is lifted for the flight and settled on
     landing, so the turned pile stacks the right way round.
     ------------------------------------------------------- */
  function turn(dir) {
    if (busy) return;
    const n = leaves.length;
    const i = dir > 0 ? turned : turned - 1;
    if (i < 0 || i >= n) return;

    const leaf = leaves[i];
    busy = true;
    gsap.set(leaf, { zIndex: n + 1 + i });

    gsap.to(leaf, {
      rotateY: dir > 0 ? -180 : 0,
      duration: REDUCED ? 0.01 : 0.85,
      ease: 'power2.inOut',
      onComplete() {
        gsap.set(leaf, { zIndex: dir > 0 ? i + 1 : n - i });
        turned += dir;
        busy = false;
        paint();
      }
    });
  }

  /* -------------------------------------------------------
     Open / close. The cover morphs into the RIGHT-hand page of
     the opening spread — leaf 0's front IS the front cover (see
     buildBook), paired with the back cover on the left. A book
     page is 3/4, exactly the cover's ratio, so the zoom lines
     up geometrically.
     ------------------------------------------------------- */
  function open(index, tomeEl) {
    if (openIndex !== -1) return;
    openIndex = index;
    buildBook(books[index]);

    reader.hidden = false;
    window.VRGD.lenis?.stop();
    document.body.style.overflow = 'hidden';

    const cover = $('.tome__cover', tomeEl).getBoundingClientRect();
    const rect = bookEl.getBoundingClientRect();
    const scale = cover.width / (rect.width / 2);
    // 75%/50% is the centre of the right-hand page — where the front cover is.
    const rx = rect.left + rect.width * 0.75;
    const ry = rect.top + rect.height / 2;

    gsap.set(reader, { autoAlpha: 0 });
    gsap.to(reader, { autoAlpha: 1, duration: 0.25, ease: 'power2.out' });
    gsap.fromTo(bookEl,
      { transformOrigin: '75% 50%', scale, x: cover.left + cover.width / 2 - rx, y: cover.top + cover.height / 2 - ry },
      { scale: 1, x: 0, y: 0, duration: REDUCED ? 0.01 : 0.9, ease: 'expo.out' });

    $('[data-reader-title]').textContent = books[index].title;
    $('[data-reader-meta]').textContent = books[index].meta || '';
    const blurb = $('[data-reader-blurb]');
    if (blurb) blurb.textContent = books[index].blurb || '';
    $('[data-reader-close]').focus();
  }

  function close() {
    if (openIndex === -1 || busy) return;
    const tomeEl = $(`[data-tome="${openIndex}"]`);
    const done = () => {
      reader.hidden = true;
      openIndex = -1;
      document.body.style.overflow = '';
      window.VRGD.lenis?.start();
      tomeEl?.focus();
    };

    if (REDUCED || !tomeEl) { done(); return; }

    const cover = $('.tome__cover', tomeEl).getBoundingClientRect();
    const rect = bookEl.getBoundingClientRect();
    const scale = cover.width / (rect.width / 2);
    const rx = rect.left + rect.width * 0.75;
    const ry = rect.top + rect.height / 2;

    gsap.to(bookEl, {
      transformOrigin: '75% 50%', scale,
      x: cover.left + cover.width / 2 - rx,
      y: cover.top + cover.height / 2 - ry,
      duration: 0.6, ease: 'expo.inOut'
    });
    gsap.to(reader, { autoAlpha: 0, duration: 0.3, delay: 0.2, ease: 'power2.in', onComplete: done });
  }

  /* -------------------------------------------------------
     Controls
     ------------------------------------------------------- */
  $$('[data-turn]').forEach((b) =>
    b.addEventListener('click', () => turn(Number(b.getAttribute('data-turn')))));
  $('[data-reader-close]').addEventListener('click', close);

  document.addEventListener('keydown', (e) => {
    if (openIndex === -1) return;
    if (e.key === 'Escape') { close(); return; }
    if (e.key === 'ArrowRight') { e.preventDefault(); turn(1); }
    if (e.key === 'ArrowLeft')  { e.preventDefault(); turn(-1); }
  });

  /* -------------------------------------------------------
     Boot
     ------------------------------------------------------- */
  async function init() {
    try {
      const res = await fetch('assets/gallery.json');
      if (res.ok) books = (await res.json()).books || [];
    } catch { /* falls through to the stand-in below */ }

    // Never render an empty shelf — the mechanic should still be visible.
    if (!books.length) {
      books = Array.from({ length: 4 }, (_, i) => ({
        title: `Untitled ${i + 1}`, meta: '—',
        pages: Array.from({ length: 6 }, (_, p) => ({ src: null, caption: `Page ${p + 1}` }))
      }));
    }

    buildShelf();

    // Section head meta scrambles in, as elsewhere on the site.
    $$('.section__head .mono').forEach((el) => window.VRGD.scramble(el, el.textContent, 0.7));
  }

  if (document.fonts?.ready) document.fonts.ready.then(init);
  else window.addEventListener('load', init);
})();
