#!/usr/bin/env python3
# Vyrobí photos/manifest.json ze složek v /photos.
# Pravidla:
#   - každá složka v /photos = jeden shoot
#   - název složky = "<pořadí> <název na webu>"  (např. "01 reina", "02 atelier v7")
#   - pořadí = číslo na začátku; název = zbytek (zobrazí se na webu)
#   - fotky = všechny obrázky uvnitř složky (řazené podle názvu)
# Manifest se generuje automaticky — needituj ho ručně.

import os, re, json
from urllib.parse import quote

PHOTOS = "photos"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp", ".gif")

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
                imgs.append(os.path.relpath(os.path.join(root, f), ".").replace("\\", "/"))
    imgs.sort(key=natkey)
    if not imgs:
        continue

    sets.append({
        "order": order,
        "id": slug(title),
        "title": title,
        "credit": "",
        "images": [quote(p, safe="/") for p in imgs],  # ošetří mezery v názvech
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

print(f"OK — {len(sets)} shootů:")
for s in sets:
    print(f"  {s['title']}  ({len(s['images'])} fotek, id={s['id']})")
