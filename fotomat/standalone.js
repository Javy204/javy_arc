/* Samostatná stránka /fotomat/ — jediná věc navíc oproti hlavnímu webu:
   jakmile si návštěvník aspoň jednou vytiskne proužek, objeví se dole
   nenápadný odkaz na celé portfolio. Do lab/fotomat.js se nesahá —
   čte se jen jeho veřejný stav přes window.__fotomat.stav(). */
(function () {
  "use strict";
  const link = document.getElementById("fmReveal");
  if (!link) return;

  const timer = setInterval(() => {
    const api = window.__fotomat;
    const st = api && api.stav;
    if (!st || !(st.kusu > 0)) return;
    clearInterval(timer);
    link.hidden = false;
    requestAnimationFrame(() => link.classList.add("on"));
  }, 800);
})();
