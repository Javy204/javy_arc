# JAVY — portfolio

Statický web (HTML/CSS/JS), žádný build. Domovská stránka je **`index.html`**.

## Spuštění lokálně
Stačí servírovat složku jako statické soubory, např.:
```
python3 -m http.server 3334
```
a otevřít `http://localhost:3334`.

## Obsah (přidávání fotek / projektů / zápisů)
Veškerý obsah je v datech, ne v kódu:
- `photos/manifest.json` — sety / projekty (každý má seznam `images`)
- `journal.json` — zápisy
- fotky leží v `photos/<set>/full/`

Editovat se dá ručně, nebo přes **web editor (CMS)** — návod v **`SETUP-CMS.md`**
(konfigurace CMS je v `.pages.yml`).

## Struktura
```
index.html        domovská stránka (celý web)
film.css film.js  styl + logika
photos/           fotky + manifest.json
journal.json      zápisy
.pages.yml        konfigurace CMS (Pages CMS)
SETUP-CMS.md       návod na hosting + CMS
```

Masters (originály ve full rozlišení) se na web nenahrávají — drž je mimo repo.
