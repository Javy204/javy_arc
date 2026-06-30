#!/usr/bin/env python3
# Vyrobí photos/manifest.json ze složek v /photos.
#
# Pravidla složek:
#   - každá složka v /photos = jeden shoot
#   - název složky = "<pořadí> <název na webu>"  (např. "01 reina", "04 elektra")
#   - pořadí = číslo na začátku; název = zbytek (zobrazí se na webu)
#   - fotky = všechny obrázky uvnitř (řazené podle názvu)
#
# Zmenšování:
#   - PŘI BUILDU NA CLOUDFLARE (env CF_PAGES) velké fotky zmenší na ~1600 px,
#     aby web zůstal svižný (originály v repu zůstávají nedotčené lokálně).
#   - lokálně se NIC nezmenšuje (originály na disku se nemění).
#
# Manifest je AUTOGENEROVANÝ — needituj ho ručně.

import os, re, json
from urllib.parse import quote

PHOTOS = "photos"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
MAXPX = 1600

ON_CF = bool(os.environ.get("CF_PAGES"))
try:
    from PIL import Image
    HAVE_PIL = True
except Exception:
    HAVE_PIL = False

def maybe_resize(path):
    """Na Cloudflare zmenší velké fotky na MAXPX (jinak nedělá nic)."""
    if not (ON_CF and HAVE_PIL):
        return
    try:
        im = Image.open(path)
        if max(im.size) <= MAXPX:
            return
        ext = os.path.splitext(path)[1].lower()
        if ext in (".jpg", ".jpeg"):
            im = im.convert("RGB")
            im.thumbnail((MAXPX, MAXPX))
            im.save(path, "JPEG", quality=82, optimize=True)
        elif ext == ".png":
            im.thumbnail((MAXPX, MAXPX))
            im.save(path, optimize=True)
        elif ext == ".webp":
            im.thumbnail((MAXPX, MAXPX))
            im.save(path, "WEBP", quality=82)
    except Exception as e:
        print("  (resize přeskočen)", path, e)

def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def slug(s):
    s = re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")
    return s or "set"

sets = []
for name in sorted(os.listdir(PHOTOS)):
    folder = os.path.join(PHOTOS, name)
    if not os.path.isdir(folder) or name.startswith(".") or name.startswith("_"):
        continue
    m = re.match(r"^\s*(\d+)\s*[-_.\s]*\s*(.+?)\s*$", name)
    order, title = (int(m.group(1)), m.group(2).strip()) if m else (9999, name.strip())

    imgs = []
    for root, _, files in os.walk(folder):
        for f in files:
            if f.lower().endswith(IMG_EXT) and not f.startswith("."):
                p = os.path.join(root, f)
                maybe_resize(p)
                imgs.append(os.path.relpath(p, ".").replace("\\", "/"))
    imgs.sort(key=natkey)
    if not imgs:
        continue

    sets.append({
        "order": order,
        "id": slug(title),
        "title": title,
        "credit": "",
        "images": [quote(p, safe="/") for p in imgs],
    })

sets.sort(key=lambda s: (s["order"], s["title"]))
for s in sets:
    del s["order"]

out = {
    "_comment": "AUTOGENEROVANO build.py ze slozek v /photos. NEEDITUJ rucne. Poradi = cislo na zacatku nazvu slozky; nazev = zbytek.",
    "sets": sets,
}
with open(os.path.join(PHOTOS, "manifest.json"), "w") as f:
    json.dump(out, f, ensure_ascii=False, indent=2)

print(f"OK — {len(sets)} shootů" + (" (resize ON)" if (ON_CF and HAVE_PIL) else " (jen manifest)") + ":")
for s in sets:
    print(f"  {s['title']}  ({len(s['images'])} fotek)")
