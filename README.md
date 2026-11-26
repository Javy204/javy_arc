# JAVY — portfolio (javyarc.com)

Statický web (HTML/CSS/JS), žádný build krok na straně hostingu. Hostuje se na
GitHub Pages z větve `main` (doména v `CNAME`).

## Spuštění lokálně
```
python3 -m http.server 3334
```
a otevřít `http://localhost:3334`.

## Správa webu bez AI (klikací UI)
Dvojklik na **`sprava-webu.command`** (macOS) nebo **`sprava-webu.bat`** (Windows) → otevře se

Správa se vypíná tlačítkem **Vypnout správu** vpravo nahoře. Když zavřeš stránku v prohlížeči, vypne se sama do tří minut. Když někde zůstala viset stará, nový start ji sám ukončí, takže žádné `Ctrl+C` ani hledání starých oken není potřeba.
správa v prohlížeči (`127.0.0.1:8765`, jen lokálně, bez hesla; ostatní weby na ni nemají přístup). Záložky:

1. **Fotky** — nahrávání přetažením (automaticky se zmenší a vyrobí se náhledy), řazení složek,
   přejmenování, mazání do koše `_trash/`, výběr náhledové fotky.
2. **Texty webu** — úvod, About, kontakty, patička (ukládá se do `site.json`).
3. **Pokročilé** — nové heslo do brány archivu (ARC; zapíše se do `arc.js`) a výchozí vzhled FOTOMATU
   pro všechny návštěvníky (vložíš výstup tlačítka KOPÍROVAT z tajného panelu `G`).
4. **Publikovat** — kontrola prostředí (Python, Pillow/ImageMagick, Git, napojení na GitHub)
   a tlačítko **Publikovat** (commit + push). Web se na GitHub Pages aktualizuje do ~1 minuty.

Verze souborů v HTML (`?v=…`, cache) se přepisují automaticky podle obsahu souboru (`build.py`).

### Zdroje obsahu
- `photos/NN název/` = jeden shoot, `photos/NN název/NN shoot/` = skupina (projekt s víc shooty). Číslo = pořadí.
  - Skupina s víc shooty (např. The Creaks): podsložky pojmenuj `RRRR-MM-DD Název` (jde i `RRRR-MM Název`). Na webu se otevře **nejnovější** shoot a ostatní jsou v panelu dole. Dole je výsuvný panel „OLDER SHOOTS“: chytneš ho a potáhneš nahoru, přes obrazovku se plynule vysune mozaika ostatních shootů po letech (zavře se tažením dolů, Esc nebo výběrem shootu). Seznam WORK a vodorovné scrollování v shootu zůstávají beze změny. Nový shoot přidáš v administraci (u skupiny „Přidat shoot“), stávající složku změníš na skupinu tlačítkem „Rozdělit na shooty…“.
- Skrytý vstup do administrace na webu: napiš na klávesnici `admin` (nebo třikrát klikni na patičku). Otevře `http://127.0.0.1:8765/`, takže to funguje jen na počítači, kde běží `sprava-webu.command`.
- `site.json` = texty a kontakty. Do `index.html` se zapisují přes `build.py` (prvky `data-site="klíč"`
  a blok `<!--site:contacts-->`); web zůstává čistě statický.
- `photos/manifest.json` a `photos/_thumbs/` jsou **generované** (`build.py`) — needitovat ručně.

Ručně (bez UI): nahraj fotky do složky a spusť `prep.command` (nebo `python3 build.py`).

## Předání jinému člověku / nové zařízení
1. Nainstalovat **Python 3** (python.org) a **GitHub Desktop** (nebo Git); volitelně `pip3 install pillow`.
2. V GitHub Desktop: přihlásit se (účet s právem zápisu do repa) → *Clone* repozitáře `Javy204/javy_arc`.
3. Dvojklik na `sprava-webu.command` / `.bat` → záložka **Publikovat & nastavení** ukáže, co ještě chybí.
4. Publikování nejde bez přihlášení k GitHubu: jednou v GitHub Desktop kliknout Push, pak funguje i z UI.

Domény a hosting: GitHub Pages z větve `main`, doména v `CNAME`. Brána archivu a FOTOMAT (viz níže)
se nastavují v kódu — viz „Tajné vstupy".

## Struktura
```
index.html           hlavní stránka (celé portfolio)
film.css film.js     styl + logika hlavní stránky
lab/fotomat.js       FOTOMAT (fotobudka s kamerou, WebGL grading, tiskárna)
fotomat/             samostatná stránka javyarc.com/fotomat/ (sdílí film.css a lab/fotomat.js)
arc.js, arc/         brána do archivu projects.javyarc.com + stránka javy.arc
arc-heslo.html       generátor nového hesla pro bránu (výstup vložit do arc.js, ARC_CFG)
studio/              starší redesign (odkazovaný z beta menu)
vrgd/                kopie webu VRgD (kopíruje se z jiného projektu, neupravovat zde)
photos/              fotky + manifest.json + _thumbs/
build.py             manifest + náhledy + texty ze site.json
cover_admin.py       lokální klikací správa (sprava-webu.command / .bat)
site.json            texty a kontakty webu (edituje se v UI)
```

## Tajné vstupy (jen pro správce)
- **FOTOMAT grading:** klávesa `G` nebo 3× klik na nadpis FOTOMAT. Nastavení se pamatuje jen v tomhle prohlížeči;
  pro všechny návštěvníky se musí přepsat výchozí hodnoty v `lab/fotomat.js` (`LOOKS`/`PARAMS`).
- **Beta menu (verze WORKu):** 3× klik na „JAVY" v záhlaví.
- **Brána do archivu:** napsat `arc` na klávesnici nebo 3× kliknout na ℗.
