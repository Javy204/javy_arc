#!/usr/bin/env python3
# Vyrobí photos/manifest.json ze složek v /photos.
#
# Složky:
#   - photos/<NN název>/ = jeden shoot; fotky přímo uvnitř
#   - když složka místo fotek obsahuje PODSLOŽKY (NN název) = SKUPINA (projekt),
#     každá podsložka = jeden shoot uvnitř skupiny (např. kapela "the creaks").
#   - číslo na začátku = pořadí; zbytek = titulek (na webu velkými).
#
# Manifest je AUTOGENEROVANÝ — needituj ho ručně.

import os, re, json, shutil, subprocess, html, hashlib
from urllib.parse import quote, unquote

PHOTOS = "photos"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")

# ═══════════════════════════════════════════════════════════════
#  NÁHLEDOVÉ (COVER) FOTKY  ─ tady si zvolíš, co se ukáže jako náhled
# ═══════════════════════════════════════════════════════════════
# Klíč   = název složky (přesně jak se jmenuje ve photos/)
# Hodnota= ČÍSLO fotky v pořadí (1 = první, 2 = druhá …)  NEBO  část názvu souboru
#
# • Když složku nevyplníš, použije se automaticky 3. fotka.
# • U SKUPINY (víc shootů) piš klíč "skupina/shoot".
#   Volitelně "skupina" (jen název skupiny) = náhled celé skupiny ve WORK.
#
# Příklady (odmaž # a uprav):
COVERS = {
    # "05 elektra": 4,                    # 4. fotka jako náhled
    # "06 reina": "reina-12",             # fotka, jejíž název obsahuje "reina-12"
    # "01 the creaks": "rebrand_tojevpici-104",   # náhled celé skupiny ve WORK
    # "01 the creaks/01 rebrand": 2,      # náhled shootu "rebrand" uvnitř skupiny
    # "01 the creaks/02 live": "live-3",
}

# Volby z klikacího UI (photos/covers.json) mají přednost před ručním COVERS výše.
def _load_json_covers():
    try:
        with open(os.path.join(PHOTOS, "covers.json"), encoding="utf-8") as f:
            data = json.load(f)
            return data if isinstance(data, dict) else {}
    except Exception:
        return {}
COVERS = {**COVERS, **_load_json_covers()}
# ═══════════════════════════════════════════════════════════════

def resolve_cover(key, images):
    """Vrátí URL náhledové fotky pro daný klíč (dle COVERS), jinak 3. fotku."""
    if not images:
        return None
    sel = COVERS.get(key)
    default = images[min(2, len(images) - 1)]
    if sel is None:
        return default
    if isinstance(sel, bool):            # jistota (True/False není platná volba)
        return default
    if isinstance(sel, int):
        return images[max(1, min(sel, len(images))) - 1]
    needle = str(sel).lower()
    for u in images:
        if needle in unquote(u).lower():
            return u
    print(f"     ⚠️  cover pro '{key}': nenašel jsem fotku obsahující '{sel}' → beru 3. fotku")
    return default

def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "set"

def parse_name(name):
    m = re.match(r"^\s*(\d+)\s*[-_.\s]*\s*(.+?)\s*$", name)
    return (int(m.group(1)), m.group(2).strip()) if m else (9999, name.strip())

def images_in(folder):
    out = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(IMG_EXT) and not f.startswith("."):
                out.append(os.path.relpath(os.path.join(root, f), ".").replace("\\", "/"))
    out.sort(key=natkey)
    return [quote(p, safe="/") for p in out]

def has_images_direct(folder):
    return any(f.lower().endswith(IMG_EXT) and not f.startswith(".") for f in os.listdir(folder))

# Shoot ve skupině se může jmenovat s datem: "2026-11-14 Název" (nebo "2026-11 Název").
# Datované shooty se řadí od NEJNOVĚJŠÍHO, takže nový shoot stačí přidat a je první.
# Starší bez data ("01 Název") jdou až za nimi, podle čísla.
DATE_RE = re.compile(r"^\s*(\d{4})-(\d{2})(?:-(\d{2}))?\s*[-_.\s]\s*(.+?)\s*$")

def parse_shoot_name(name):
    m = DATE_RE.match(name)
    if m:
        return "-".join(g for g in m.groups()[:3] if g), m.group(4)
    return None, parse_name(name)[1]

def subshoots(folder, parent):
    dated, plain = [], []
    for name in sorted(os.listdir(folder)):
        sub = os.path.join(folder, name)
        if os.path.isdir(sub) and not name.startswith(".") and images_in(sub):
            date, title = parse_shoot_name(name)
            imgs = images_in(sub)
            shoot = {"id": slug(title), "title": title, "images": imgs,
                     "cover": resolve_cover(f"{parent}/{name}", imgs)}
            if date:
                shoot["date"] = date
                dated.append(shoot)
            else:
                plain.append((parse_name(name)[0], shoot))
    dated.sort(key=lambda sh: (sh["date"], sh["title"]), reverse=True)
    plain.sort(key=lambda x: (x[0], x[1]["title"]))
    return dated + [sh for _, sh in plain]

# ═══════════════════════════════════════════════════════════════
#  NÁHLEDY (photos/_thumbs/…webp, delší strana 720 px)
#  Mřížka ve WORKu tahá tyhle malé WebP místo plných JPG. Generují se
#  automaticky (jen chybějící/zastaralé); když chybí PIL i ImageMagick,
#  přeskočí se a web si prostě vezme plnou fotku.
# ═══════════════════════════════════════════════════════════════
THUMBS = os.path.join(PHOTOS, "_thumbs")
THUMB_MAX = 720

def make_thumbs():
    try:
        from PIL import Image, ImageOps
    except Exception:
        Image = None
    magick = shutil.which("magick") or shutil.which("convert")
    if Image is None and not magick:
        print("⚠️  náhledy přeskočeny (chybí Pillow i ImageMagick)")
        return
    made = 0
    wanted = set()
    for root, dirs, files in os.walk(PHOTOS):
        dirs[:] = [d for d in dirs if not d.startswith((".", "_"))]
        for f in files:
            if not f.lower().endswith(IMG_EXT) or f.startswith("."):
                continue
            src = os.path.join(root, f)
            rel = os.path.splitext(os.path.relpath(src, PHOTOS))[0] + ".webp"
            dst = os.path.join(THUMBS, rel)
            wanted.add(os.path.abspath(dst))
            if os.path.exists(dst) and os.path.getmtime(dst) >= os.path.getmtime(src):
                continue
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            try:
                if Image is not None:
                    with Image.open(src) as im:
                        im = ImageOps.exif_transpose(im).convert("RGB")
                        im.thumbnail((THUMB_MAX, THUMB_MAX))
                        im.save(dst, "WEBP", quality=72, method=4)
                else:
                    subprocess.run([magick, src, "-auto-orient", "-resize", f"{THUMB_MAX}x{THUMB_MAX}>",
                                    "-strip", "-quality", "72", dst], check=True, capture_output=True)
                made += 1
            except Exception as e:
                print(f"  ⚠️  náhled se nepovedl: {src} ({e})")
    removed = 0                                    # smazané fotky → smazat i náhled
    for root, _, files in os.walk(THUMBS):
        for f in files:
            p = os.path.abspath(os.path.join(root, f))
            if p not in wanted:
                os.remove(p); removed += 1
    if made or removed:
        print(f"náhledy: +{made} / -{removed}")

make_thumbs()


# ═══════════════════════════════════════════════════════════════
#  TEXTY WEBU (site.json → HTML)
#  Prvky s data-site="klíč" dostanou text ze site.json; seznam kontaktů
#  se vygeneruje mezi <!--site:contacts--> a <!--/site:contacts-->.
#  Do HTML se to zapisuje napevno (web zůstává statický, nic se
#  nedoplňuje za běhu). Bez site.json se nic nemění.
# ═══════════════════════════════════════════════════════════════
SITE_FILES = ["index.html"]

def bake_site():
    try:
        with open("site.json", encoding="utf-8") as f:
            site = json.load(f)
    except FileNotFoundError:
        return
    except Exception as e:
        print(f"⚠️  site.json se nedá přečíst ({e}) — texty webu nechávám beze změny")
        return
    el = re.compile(r'(<(\w+)\b[^>]*\bdata-site="(\w+)"[^>]*>)(.*?)(</\2>)', re.S)
    changed = []
    for fn in SITE_FILES:
        if not os.path.exists(fn):
            continue
        with open(fn, encoding="utf-8") as f:
            src = f.read()
        def put(m):
            key = m.group(3)
            val = site.get(key)
            if not isinstance(val, str):
                return m.group(0)
            return m.group(1) + html.escape(val, quote=False) + m.group(5)
        out = el.sub(put, src)
        rows = []
        for c in site.get("contacts", []):
            label, text, href = (str(c.get(k, "")).strip() for k in ("label", "text", "href"))
            if not (label and text):
                continue
            ext = ' target="_blank" rel="noopener"' if href.lower().startswith("http") else ""
            link = (f'<a href="{html.escape(href, quote=True)}"{ext}>{html.escape(text, quote=False)}</a>'
                    if href else html.escape(text, quote=False))
            rows.append(f'          <li><span>{html.escape(label, quote=False)}</span>{link}</li>\n')
        out = re.sub(r'(<!--site:contacts-->\n).*?(          <!--/site:contacts-->)',
                     lambda m: m.group(1) + "".join(rows) + m.group(2), out, flags=re.S)
        if out != src:
            with open(fn, "w", encoding="utf-8") as f:
                f.write(out)
            changed.append(fn)
    if changed:
        print("texty webu zapsány do: " + ", ".join(changed))

bake_site()


# ═══════════════════════════════════════════════════════════════
#  FOTOMAT: výchozí grading pro všechny návštěvníky (site.json → "fotomat")
#  Zapíše se do lab/fotomat.js mezi /*site:grade*/ a /*/site:grade*/.
#  Admin ho do site.json vloží z tlačítka KOPÍROVAT v tajném panelu (klávesa G).
# ═══════════════════════════════════════════════════════════════
def bake_grade():
    fn = os.path.join("lab", "fotomat.js")
    try:
        with open("site.json", encoding="utf-8") as f:
            grade = json.load(f).get("fotomat", {})
        with open(fn, encoding="utf-8") as f:
            src = f.read()
    except Exception:
        return
    if not isinstance(grade, dict):
        return
    clean = {k: v for k, v in grade.items() if re.fullmatch(r"[A-Za-z]+", str(k)) and k != "sat"
             and isinstance(v, (int, float)) and not isinstance(v, bool)}
    blob = json.dumps(dict(sorted(clean.items())), separators=(", ", ": "))
    out = re.sub(r"/\*site:grade\*/.*?/\*/site:grade\*/", lambda m: f"/*site:grade*/{blob}/*/site:grade*/", src, flags=re.S)
    if out != src:
        with open(fn, "w", encoding="utf-8") as f:
            f.write(out)
        print("výchozí grading FOTOMATU zapsán do lab/fotomat.js")

bake_grade()

# ═══════════════════════════════════════════════════════════════
#  CACHE-BUSTING: ?v=… u skriptů a stylesheetů v HTML = otisk obsahu souboru.
#  Změní se soubor → změní se otisk → prohlížeč si ho stáhne znovu.
#  (Nikdo už nemusí ručně zvyšovat čísla verzí.)
# ═══════════════════════════════════════════════════════════════
def bump_assets():
    pages = ["index.html", "fotomat/index.html", "arc/index.html", "studio/index.html"]
    ref = re.compile(r'((?:src|href)=")([^"?#:]+\.(?:js|css))\?v=[^"]*(")')
    changed = []
    for fn in pages:
        if not os.path.exists(fn):
            continue
        with open(fn, encoding="utf-8") as f:
            src = f.read()
        root = "" if '<base href="/"' in src else os.path.dirname(fn)
        def fix(m):
            path = os.path.normpath(os.path.join(root, m.group(2)))
            if not os.path.isfile(path):
                return m.group(0)
            with open(path, "rb") as f:
                h = hashlib.md5(f.read()).hexdigest()[:8]
            return f"{m.group(1)}{m.group(2)}?v={h}{m.group(3)}"
        out = ref.sub(fix, src)
        if out != src:
            with open(fn, "w", encoding="utf-8") as f:
                f.write(out)
            changed.append(fn)
    if changed:
        print("verze souborů (cache) aktualizovány v: " + ", ".join(changed))

bump_assets()

sets = []
skipped = []      # prázdné složky (bez fotek) — nahlásíme je na konci
for name in sorted(os.listdir(PHOTOS)):
    folder = os.path.join(PHOTOS, name)
    if not os.path.isdir(folder) or name.startswith(".") or name.startswith("_"):
        continue
    order, title = parse_name(name)
    entry = {"order": order, "id": slug(title), "title": title, "credit": ""}

    if has_images_direct(folder):
        entry["images"] = images_in(folder)          # jeden shoot
        entry["cover"] = resolve_cover(name, entry["images"])
    else:
        shoots = subshoots(folder, name)
        if not shoots:
            skipped.append(name)                       # prázdná složka → přeskoč a nahlas
            continue
        entry["shoots"] = shoots                       # skupina víc shootů
        # náhled celé skupiny ve WORK: buď z COVERS["skupina"], jinak cover 1. shootu
        all_imgs = [u for sh in shoots for u in sh["images"]]
        entry["cover"] = resolve_cover(name, all_imgs) if name in COVERS else shoots[0]["cover"]

    sets.append(entry)

sets.sort(key=lambda s: (s["order"], s["title"]))
for s in sets:
    del s["order"]

out = {
    "_comment": "AUTOGENEROVANO build.py ze slozek v /photos. NEEDITUJ rucne.",
    "sets": sets,
}
with open(os.path.join(PHOTOS, "manifest.json"), "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"OK — {len(sets)} položek:")
for s in sets:
    if "shoots" in s:
        print(f"  [skupina] {s['title']}  →  " + ", ".join(f"{sh['title']}({len(sh['images'])})" for sh in s["shoots"]))
    else:
        print(f"  {s['title']}  ({len(s['images'])} fotek)")

if skipped:
    print()
    print("⚠️  PŘESKOČENO (prázdné složky — nejsou v nich žádné fotky):")
    for name in skipped:
        print(f"     • {name}   →  nahraj do ní fotky (nebo podsložky se shooty) a spusť znovu")
