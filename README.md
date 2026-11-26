# JAVY — portfolio (javyarc.com)

Statický web (HTML/CSS/JS), žádný build krok na straně hostingu. Hostuje se na
GitHub Pages z větve `main` (doména v `CNAME`).

## Spuštění lokálně
```
python3 -m http.server 3334
```
a otevřít `http://localhost:3334`.

## Jak se přidává a mění obsah
Zdrojem pravdy jsou **složky ve `photos/`**, ne žádný JSON:

- `photos/NN název/` = jeden shoot (fotky přímo uvnitř). Číslo na začátku = pořadí, zbytek = titulek.
- `photos/NN název/NN shoot/` = **skupina** (projekt s víc shooty, např. kapela).
- `photos/manifest.json` a `photos/_thumbs/` jsou **generované** (`build.py`) — needitovat ručně.

Nejjednodušší cesta: dvojklik na **`sprava-webu.command`** → otevře se klikací správa
(nahrávání fotek přetažením, řazení, přejmenování, mazání do koše `_trash/`, výběr náhledu).
Správa je jen lokální (`127.0.0.1:8765`), bez hesla a nic nepublikuje.

Ručně: nahraj fotky do složky a dvojklik na **`prep.command`** (zmenší na 1600 px, originály
zazálohuje do `_masters/`, vygeneruje náhledy a manifest). Totéž dělá `python3 build.py`.

Potřebuje: Python 3, ideálně Pillow (`pip3 install pillow`) nebo ImageMagick (zmenšování, náhledy).

## Publikace
Po úpravách: **Commit + Push** (GitHub Desktop nebo `git`). GitHub Pages web nasadí do ~1 minuty.
Do repa patří `photos/` (zmenšené fotky + `_thumbs/`), nepatří tam `_masters/` ani `_trash/` (jsou v `.gitignore`).

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
build.py             manifest + náhledy ze složek ve photos/
cover_admin.py       lokální klikací správa (spouští sprava-webu.command)
```

## Tajné vstupy (jen pro správce)
- **FOTOMAT grading:** klávesa `G` nebo 3× klik na nadpis FOTOMAT. Nastavení se pamatuje jen v tomhle prohlížeči;
  pro všechny návštěvníky se musí přepsat výchozí hodnoty v `lab/fotomat.js` (`LOOKS`/`PARAMS`).
- **Beta menu (verze WORKu):** 3× klik na „JAVY" v záhlaví.
- **Brána do archivu:** napsat `arc` na klávesnici nebo 3× kliknout na ℗.
