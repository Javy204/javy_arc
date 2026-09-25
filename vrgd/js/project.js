/* =========================================================
   VRgD — project detail page
   Reads ?p=<slug> against assets/work.json and renders one
   project: hero, headline + body, media grid, credits, next.
   Cursor, scramble, menu and clock live in shared.js.
   ========================================================= */
(() => {
  'use strict';

  gsap.registerPlugin(ScrollTrigger);

  const { REDUCED, $, $$ } = window.VRGD;

  const root = $('[data-project]');
  if (!root) return;

  if (window.Lenis) {
    const lenis = new Lenis({ anchors: false, allowNestedScroll: true, lerp: 0.09 });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add((t) => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.VRGD.lenis = lenis;
  }

  /* -------------------------------------------------------
     Media. No caption, no cropping-by-surprise — full bleed,
     with the halftone plate as the fallback for anything not
     shot yet, same convention as the shelf and the cards.
     ------------------------------------------------------- */
  function frameMarkup(item, variant) {
    if (!item || !item.src) return `<div class="project__frame" data-placeholder="${variant}"></div>`;
    if (item.kind === 'video') {
      return `<div class="project__frame"><video src="${item.src}" autoplay muted loop playsinline${item.poster ? ` poster="${item.poster}"` : ''}></video></div>`;
    }
    return `<div class="project__frame"><img src="${item.src}" alt="${item.caption || ''}" loading="lazy"></div>`;
  }

  function notFound() {
    root.innerHTML = `
      <div class="project__missing">
        <h2 class="display">Not found.</h2>
        <a class="mono" href="index.html#work" data-cursor-hover data-cursor-text="←">← BACK TO WORK</a>
      </div>`;
  }

  async function init() {
    const slug = new URLSearchParams(location.search).get('p');
    let projects = [];
    try {
      const res = await fetch('assets/work.json');
      if (res.ok) projects = (await res.json()).projects || [];
    } catch { /* falls through to not-found */ }

    const index = projects.findIndex((p) => p.slug === slug);
    const project = projects[index];
    if (!project) { notFound(); return; }

    document.title = `${project.title} — VRgD`;

    $('[data-project-index]').textContent =
      `[${String(index + 1).padStart(2, '0')} / ${String(projects.length).padStart(2, '0')}]`;

    const hero = $('[data-project-hero]');
    hero.innerHTML = `
      ${frameMarkup(project.hero, (index % 6) + 1)}
      <div class="project__hero-bar">
        <h1 class="project__title">${project.title}</h1>
        <span class="mono is-dim">${project.meta || ''}</span>
      </div>`;

    $('[data-project-headline]').textContent = project.headline || '';
    $('[data-project-body]').innerHTML = (project.body || []).map((p) => `<p>${p}</p>`).join('');

    const mediaEl = $('[data-project-media]');
    mediaEl.innerHTML = (project.media || []).map((m, i) =>
      `<div class="project__media-item${m.full ? ' project__media-item--full' : ''}">
         ${frameMarkup(m, (i % 6) + 1)}
       </div>`
    ).join('');

    $('[data-project-credits]').innerHTML = (project.credits || []).map((c) =>
      `<div class="project__credit"><dt class="mono is-dim">${c.label}</dt><dd>${c.value}</dd></div>`
    ).join('');

    const nextLink = $('[data-project-next]');
    const next = projects.length > 1 ? projects[(index + 1) % projects.length] : null;
    if (next) {
      nextLink.href = `project.html?p=${next.slug}`;
      $('[data-project-next-title]').textContent = next.title;
    } else {
      nextLink.remove();
    }

    if (!REDUCED) {
      gsap.from($$('.project__media-item', mediaEl), {
        y: 40, autoAlpha: 0, duration: 0.9, ease: 'expo.out', stagger: 0.08,
        scrollTrigger: { trigger: mediaEl, start: 'top 85%', once: true }
      });
      gsap.from(['[data-project-headline]', '[data-project-body]'], {
        y: 24, autoAlpha: 0, duration: 0.8, ease: 'expo.out', stagger: 0.1,
        scrollTrigger: { trigger: '.project__intro', start: 'top 85%', once: true }
      });
    }
    ScrollTrigger.refresh();
  }

  if (document.fonts?.ready) document.fonts.ready.then(init);
  else window.addEventListener('load', init);
})();
