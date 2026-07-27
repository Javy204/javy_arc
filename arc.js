/* ============================================================
   JAVY — skrytý přístup do PROJECT ARCHIVE (projects.javyarc.com)
   Přídavný, izolovaný modul. Needituje nic z film.js/film.css.

   Spouštěče (všechny vedou na heslo):
     • napiš na stránce tajné slovo:  arc
     • 3× rychle klikni na ℗ značku v záhlaví
     • diskrétní odkaz „ARC" v patičce (Kontakt)

   Bezpečnost: cílová URL je ZAŠIFROVANÁ heslem (AES-GCM). Ze zdrojáku
   se URL nedá přečíst; brána se odemkne jen správným heslem.
   Skutečnou ochranu dělá vlastní přihlášení archivu — tohle je zábrana navíc.

   NASTAVENÍ HESLA: otevři soubor  arc-heslo.html  (dvojklik), zadej heslo,
   zkopíruj vygenerovaný řádek a vlož ho níže místo `null`.
   Heslo nikam nepiš v čitelné podobě.
   ============================================================ */
(function () {
  "use strict";

  // ⬇⬇⬇ SEM VLOŽ VÝSTUP Z arc-heslo.html (objekt {salt,iv,ct}). Dokud je null, brána je neaktivní.
  const ARC_CFG = { salt: "ELGu4GyP6wBCQb3VTTNdig==", iv: "hPfs864RBdBCMf0R", ct: "tUqJJkra3wdWvWpny231VETmevfJXivds0VB38ww5w+a3xtBsSU7ZFe3we8=" };
  // ⬆⬆⬆

  // Kam brána míří po správném hesle.
  //  • TEĎ: živá adresa archivu (funguje hned, i na telefonu po přihlášení do OpenAI/ChatGPT účtu).
  //  • AŽ nastavíš DNS pro subdoménu, změň na:  "https://projects.javyarc.com"
  //  • null  = použij adresu zašifrovanou v hesle (ARC_CFG).
  const ARC_URL = "https://javyarc-projects.stepanjavy.chatgpt.site";

  const SECRET_WORD = "arc";   // tajné slovo z klávesnice (malá písmena)

  /* ---- styl (injektovaný, ať nemusím sahat do film.css) ---- */
  const css = `
  .arc-modal{position:fixed;inset:0;z-index:9999;display:none;align-items:center;justify-content:center;
    background:rgba(6,6,6,.86);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
  .arc-modal.on{display:flex}
  .arc-card{width:min(92vw,420px);background:#0c0c0c;border:1px solid #2a2a2a;padding:30px 28px;
    font-family:Arial,Helvetica,sans-serif;color:#fff;text-align:left}
  .arc-card.shake{animation:arcShake .38s}
  @keyframes arcShake{0%,100%{transform:translateX(0)}20%{transform:translateX(-9px)}40%{transform:translateX(8px)}60%{transform:translateX(-6px)}80%{transform:translateX(4px)}}
  .arc-head{display:flex;align-items:center;gap:10px;margin-bottom:18px}
  .arc-mark{display:inline-grid;place-items:center;width:24px;height:24px;border:1.5px solid #fff;border-radius:50%;font-size:12px;font-weight:700}
  .arc-title{font-size:13px;letter-spacing:.22em;text-transform:uppercase;font-weight:700}
  .arc-sub{color:#7a7a7a;font-size:11px;letter-spacing:.06em;margin-bottom:20px;line-height:1.5}
  .arc-input{width:100%;background:transparent;border:0;border-bottom:1.5px solid #444;color:#fff;
    font:inherit;font-size:20px;font-weight:700;letter-spacing:.04em;padding:8px 2px;outline:none}
  .arc-input:focus{border-color:#fff}
  .arc-row{display:flex;gap:10px;margin-top:22px}
  .arc-btn{flex:1;font:inherit;font-weight:700;letter-spacing:.16em;text-transform:uppercase;font-size:12px;
    background:#fff;color:#000;border:0;padding:13px;cursor:pointer}
  .arc-btn.ghost{background:transparent;color:#fff;border:1px solid #444}
  .arc-err{color:#e88;font-size:11px;letter-spacing:.06em;min-height:15px;margin-top:12px}
  .arc-link{color:#5a5a5a;text-decoration:none;letter-spacing:.14em;transition:color .2s}
  .arc-link:hover{color:#fff}
  `;
  const styleEl = document.createElement("style");
  styleEl.textContent = css;
  document.head.appendChild(styleEl);

  /* ---- modal ---- */
  const modal = document.createElement("div");
  modal.className = "arc-modal";
  modal.innerHTML = `
    <div class="arc-card" role="dialog" aria-modal="true" aria-label="Project Archive">
      <div class="arc-head"><span class="arc-mark">P</span><span class="arc-title">Project Archive</span></div>
      <div class="arc-sub">Soukromý přístup. Zadej heslo.</div>
      <input class="arc-input" id="arcPass" type="password" autocomplete="off" spellcheck="false" aria-label="heslo" />
      <div class="arc-err" id="arcErr"></div>
      <div class="arc-row">
        <button class="arc-btn ghost" id="arcCancel">Zavřít</button>
        <button class="arc-btn" id="arcGo">Vstoupit</button>
      </div>
    </div>`;
  document.body.appendChild(modal);
  const passEl = modal.querySelector("#arcPass");
  const errEl = modal.querySelector("#arcErr");
  const card = modal.querySelector(".arc-card");

  function openModal() {
    errEl.textContent = "";
    passEl.value = "";
    modal.classList.add("on");
    setTimeout(() => passEl.focus(), 40);
  }
  function closeModal() { modal.classList.remove("on"); }
  function deny(msg) {
    errEl.textContent = msg;
    card.classList.remove("shake"); void card.offsetWidth; card.classList.add("shake");
    passEl.value = ""; passEl.focus();
  }

  /* ---- base64 helpers ---- */
  const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

  /* ---- odemčení: dešifruj URL heslem ---- */
  async function unlock(password) {
    if (!ARC_CFG) { deny("Heslo zatím není nastavené (arc-heslo.html)."); return; }
    if (!window.crypto || !crypto.subtle) { deny("Prohlížeč nepodporuje bezpečné dešifrování."); return; }
    try {
      const enc = new TextEncoder();
      const salt = fromB64(ARC_CFG.salt), iv = fromB64(ARC_CFG.iv), ct = fromB64(ARC_CFG.ct);
      const keyMat = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveKey"]);
      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt, iterations: 150000, hash: "SHA-256" },
        keyMat, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
      const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);  // špatné heslo → vyhodí chybu
      const url = new TextDecoder().decode(pt);
      if (!/^https?:\/\//.test(url)) { deny("Nesprávné heslo."); return; }
      closeModal();
      // otevři v téže záložce = spolehlivé i na mobilu (window.open po await bývá blokované)
      window.location.href = ARC_URL || url;
    } catch (e) {
      deny("Nesprávné heslo.");
    }
  }

  modal.querySelector("#arcGo").addEventListener("click", () => unlock(passEl.value));
  modal.querySelector("#arcCancel").addEventListener("click", closeModal);
  passEl.addEventListener("keydown", (e) => { if (e.key === "Enter") unlock(passEl.value); });
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape" && modal.classList.contains("on")) closeModal(); });

  /* ---- spouštěč 1: tajné slovo z klávesnice ---- */
  let buf = "";
  document.addEventListener("keydown", (e) => {
    if (modal.classList.contains("on")) return;
    if (e.key && e.key.length === 1 && /[a-z]/i.test(e.key)) {
      buf = (buf + e.key.toLowerCase()).slice(-SECRET_WORD.length);
      if (buf === SECRET_WORD) { buf = ""; openModal(); }
    }
  });

  /* ---- spouštěč 2: 3× klik na ℗ značku v záhlaví ---- */
  const mark = document.querySelector(".hud .mark");
  if (mark) {
    let clicks = 0, timer = null;
    mark.style.cursor = "default";
    mark.addEventListener("click", () => {
      clicks++;
      clearTimeout(timer);
      timer = setTimeout(() => { clicks = 0; }, 1100);
      if (clicks >= 3) { clicks = 0; openModal(); }
    });
  }

  /* ---- spouštěč 3: diskrétní pododkaz v patičce (Kontakt) ---- */
  const foot = document.querySelector(".s-contact .foot");
  if (foot) {
    const a = document.createElement("a");
    a.className = "arc-link";
    a.href = "#";
    a.textContent = " · ARC";
    a.title = "Project Archive";
    a.addEventListener("click", (e) => { e.preventDefault(); openModal(); });
    foot.appendChild(a);
  }
})();
