# JAVY — jak web hostovat a upravovat z prohlížeče

Cíl: dostat web online a pak **přidávat fotky / projekty / zápisy přes formulář v prohlížeči**,
bez sahání do kódu. Web je statický, takže content žije ve dvou souborech
(`photos/manifest.json` = sety/fotky, `journal.json` = zápisy) + obrázky ve složce `photos/`.
CMS (web editor) tyhle soubory upravuje za tebe.

Účty a hosting si musíš založit ty (nemůžu je vytvořit za tebe) — ale je to klikací, ~20 minut jednou.

---

## 1) GitHub (kód webu online) — jednou
1. Založ si zdarma účet na **github.com**.
2. Vytvoř nový **repository** (např. `javy-web`), nastav **Private** klidně.
3. Nahraj do něj **celou složku `javy`** (přetáhni soubory v "Add file → Upload files",
   nebo `git push`). Musí tam být `film.html`, `film.css`, `film.js`, složka `photos/`,
   `journal.json` a `.pages.yml`.

> Tip: ať je `film.html` domovská stránka, přejmenuj ho na **`index.html`**
> (řekni mi a udělám to za tebe + opravím odkazy).

## 2) Hosting (web naživo) — jednou, zdarma
Doporučuju **Cloudflare Pages** (zdarma, rychlé):
1. Účet na **dash.cloudflare.com** → **Workers & Pages → Create → Pages → Connect to Git**.
2. Vyber svůj repo `javy-web`.
3. **Build command:** nech prázdné. **Output directory:** `/` (root). → **Deploy**.
4. Za chvíli je web na adrese `https://javy-web.pages.dev` (později napojíme vlastní doménu).

(Funguje i Netlify nebo GitHub Pages — princip stejný.)

## 3) CMS = web editor — jednou
1. Jdi na **pagescms.org** → **Sign in with GitHub**.
2. Povol přístup k repu `javy-web`.
3. CMS si načte `.pages.yml` a ukáže ti dvě sekce: **Fotky / projekty** a **Journal**.

Hotovo. Od teď upravuješ web odkudkoliv z prohlížeče.

---

## Jak přidat obsah (každodenní práce)

### Nový photoshoot / projekt
1. V CMS → **Fotky / projekty** → otevři, v seznamu **Sety** klikni **Add**.
2. Vyplň: **ID** (krátké, bez mezer — např. `paris-night`), **Název**, **Datum**, **Typ**, **Credit**.
3. U **Fotky** nahraj snímky (klidně víc naráz).
4. **Save** → CMS to commitne a web se sám aktualizuje (~1 min).

### Nový zápis do journalu
1. V CMS → **Journal** → **Zápisy** → **Add**.
2. Vyplň **Datum**, **Titulek**, **Text** (prázdný řádek = nový odstavec). → **Save**.

### Smazat / přeskládat
- V seznamu jdou položky mazat i přetahovat (pořadí = pořadí na webu).

---

## Pár pravidel pro fotky
- Nahrávej rozumně velké JPG (ideálně dlouhá strana ~1600–2000 px). Web je bere tak, jak jsou.
- Pokud bys chtěl, aby se velké fotky samy zmenšovaly (rychlejší web), umím doplnit
  automatické zmenšování při nahrání nebo napojení na obrázkové CDN — řekni.

## Až bude web online
Pošli mi adresu (`*.pages.dev`) — projdu, že CMS ukládá cesty k fotkám přesně tak,
jak je web čeká, a případně to doladím. Taky pak napojíme **vlastní doménu**.
