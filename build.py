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

import os, re, json
from urllib.parse import quote

PHOTOS = "photos"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")

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

def subshoots(folder):
    subs = []
    for name in sorted(os.listdir(folder)):
        sub = os.path.join(folder, name)
        if os.path.isdir(sub) and not name.startswith(".") and images_in(sub):
            order, title = parse_name(name)
            subs.append((order, {"id": slug(title), "title": title, "images": images_in(sub)}))
    subs.sort(key=lambda x: (x[0], x[1]["title"]))
    return [s for _, s in subs]

sets = []
for name in sorted(os.listdir(PHOTOS)):
    folder = os.path.join(PHOTOS, name)
    if not os.path.isdir(folder) or name.startswith(".") or name.startswith("_"):
        continue
    order, title = parse_name(name)
    entry = {"order": order, "id": slug(title), "title": title, "credit": ""}

    if has_images_direct(folder):
        entry["images"] = images_in(folder)          # jeden shoot
    else:
        shoots = subshoots(folder)
        if not shoots:
            continue
        entry["shoots"] = shoots                       # skupina víc shootů

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
