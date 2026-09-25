/* =========================================================
   VRgD — WORK spotlight tuning panel
   Dev-only. Loads on every page (tiny, inert) but only draws
   itself when the URL carries ?panel — drag the sliders, the
   page updates live via the same --deco-w/--item-w/etc custom
   properties style.css already reads, then hand the printed
   values back and they get baked in as the new CSS defaults.
   ========================================================= */
(() => {
  'use strict';
  if (!/[?&]panel(=|&|$)/.test(location.search)) return;

  const FIELDS = [
    { key: '--deco-w',       label: 'deco width',   unit: 'vw', min: 10,  max: 90,   step: 1 },
    { key: '--deco-max',     label: 'deco max',     unit: 'px', min: 200, max: 1800, step: 10 },
    { key: '--deco-offset',  label: 'deco offset',  unit: 'vw', min: -20, max: 5,    step: 0.5 },
    { key: '--deco-opacity', label: 'deco opacity', unit: '',   min: 0,   max: 1,    step: 0.02 },
    { key: '--item-w',       label: 'frame width',  unit: 'vw', min: 20,  max: 70,   step: 1 },
    { key: '--item-max',     label: 'frame max',    unit: 'px', min: 300, max: 1200, step: 10 },
    { key: '--section-h',    label: 'section height', unit: 'vh', min: 90, max: 200, step: 5 }
  ];

  const root = document.documentElement;
  const current = (key) => parseFloat(getComputedStyle(root).getPropertyValue(key)) || 0;

  const panel = document.createElement('div');
  panel.style.cssText = `
    position: fixed; z-index: 99999; top: 16px; right: 16px; width: 260px;
    background: rgba(12,12,12,.92); color: #f2f2ef; backdrop-filter: blur(6px);
    font: 11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace;
    border: 1px solid rgba(255,255,255,.15); border-radius: 8px;
    padding: 12px; display: grid; gap: 10px; box-shadow: 0 10px 40px rgba(0,0,0,.4);
  `;

  const title = document.createElement('div');
  title.textContent = 'WORK — tune panel';
  title.style.cssText = 'font-weight:700; letter-spacing:.04em; text-transform:uppercase; opacity:.85;';
  panel.appendChild(title);

  FIELDS.forEach((f) => {
    const row = document.createElement('label');
    row.style.cssText = 'display:grid; gap:3px;';

    const head = document.createElement('div');
    head.style.cssText = 'display:flex; justify-content:space-between; opacity:.8;';
    const name = document.createElement('span');
    name.textContent = f.label;
    const out = document.createElement('span');
    out.textContent = current(f.key) + f.unit;
    head.append(name, out);

    const input = document.createElement('input');
    input.type = 'range';
    input.min = f.min; input.max = f.max; input.step = f.step;
    input.value = current(f.key);
    input.style.cssText = 'width:100%; accent-color:#ff2b29;';
    input.addEventListener('input', () => {
      root.style.setProperty(f.key, input.value);
      out.textContent = input.value + f.unit;
    });

    row.append(head, input);
    panel.appendChild(row);
  });

  const printBtn = document.createElement('button');
  printBtn.textContent = 'Print current values';
  printBtn.style.cssText = `
    margin-top: 4px; padding: 7px; background: #f2f2ef; color: #0a0a0a;
    border: 0; border-radius: 4px; cursor: pointer; font: inherit; font-weight: 700;
  `;
  const output = document.createElement('textarea');
  output.readOnly = true;
  output.style.cssText = `
    width: 100%; height: 120px; background: #0a0a0a; color: #7fff9a;
    border: 1px solid rgba(255,255,255,.15); border-radius: 4px; padding: 6px;
    font: inherit; resize: vertical; display: none;
  `;
  printBtn.addEventListener('click', () => {
    const lines = FIELDS.map((f) => `  ${f.key}: ${current(f.key)};`).join('\n');
    output.value = `:root {\n${lines}\n}`;
    output.style.display = 'block';
    output.select();
  });

  panel.append(printBtn, output);
  document.body.appendChild(panel);
})();
