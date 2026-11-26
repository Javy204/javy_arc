#!/usr/bin/env python3
# JAVY — lokální správa webu (klikací UI).
# Spouští se přes  sprava-webu.command  (dvojklik).
#
# Umí:
#   • nahrávat fotky (drag&drop) — uloží na disk a zmenší na 1600px
#   • řadit složky přetažením — přepíše číslování na disku (01, 02, …)
#   • novou složku, přejmenovat
#   • mazat fotky/složky (do koše _trash/ — vratné)
#   • vybrat náhledovou (cover) fotku
# Všechno se propisuje na disk a přegeneruje manifest (build.py).
# Pak už jen v GitHub Desktopu: Commit + Push.

import os, re, sys, json, shutil, time, subprocess, webbrowser, threading, secrets
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

PHOTOS = "photos"
TRASH = "_trash"
MASTERS = "_masters"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
COVERS_FILE = os.path.join(PHOTOS, "covers.json")
PORT = 8765
TOKEN = secrets.token_hex(16)   # proti cizím webům, které by zkusily volat správu na localhostu
MAX = 1600

# ---------- helpers ----------
def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def parse_name(name):
    m = re.match(r"^\s*(\d+)\s*[-_.\s]*\s*(.+?)\s*$", name)
    return (int(m.group(1)), m.group(2).strip()) if m else (9999, name.strip())

DATE_RE = re.compile(r"^\s*(\d{4})-(\d{2})(?:-(\d{2}))?\s*[-_.\s]\s*(.+?)\s*$")

def parse_shoot_name(name):
    """('2026-11-14', 'Název') pro datovaný shoot, jinak (None, 'Název')."""
    m = DATE_RE.match(name)
    if m:
        return "-".join(g for g in m.groups()[:3] if g), m.group(4)
    return None, parse_name(name)[1]

def imgs_direct(folder):
    fs = [f for f in os.listdir(folder) if f.lower().endswith(IMG_EXT) and not f.startswith(".")]
    fs.sort(key=natkey)
    return fs

def has_direct(folder):
    return any(f.lower().endswith(IMG_EXT) and not f.startswith(".") for f in os.listdir(folder))

def safe_rel(rel):
    """Vrátí bezpečnou cestu uvnitř photos/ nebo vyhodí ValueError."""
    rel = rel.replace("\\", "/").strip("/")
    base = os.path.abspath(PHOTOS)
    full = os.path.abspath(os.path.join(PHOTOS, rel))
    if full != base and not full.startswith(base + os.sep):
        raise ValueError("cesta mimo photos/")
    return full

def scan():
    items = []
    for name in sorted(os.listdir(PHOTOS)):
        folder = os.path.join(PHOTOS, name)
        if not os.path.isdir(folder) or name.startswith(".") or name.startswith("_"):
            continue
        if has_direct(folder):
            files = imgs_direct(folder)
            items.append({"key": name, "title": parse_name(name)[1], "type": "shoot",
                          "count": len(files),
                          "images": [{"file": f, "url": f"photos/{name}/{f}"} for f in files]})
        else:
            shoots = []
            for sub in sorted(os.listdir(folder)):
                subp = os.path.join(folder, sub)
                if os.path.isdir(subp) and not sub.startswith((".", "_")):
                    files = imgs_direct(subp)       # prázdný shoot se taky ukáže, ať se do něj dá nahrát
                    date, stitle = parse_shoot_name(sub)
                    shoots.append({"key": f"{name}/{sub}", "title": stitle, "date": date or "",
                                   "count": len(files),
                                   "images": [{"file": f, "url": f"photos/{name}/{sub}/{f}"} for f in files]})
            # stejné pořadí jako na webu: datované od nejnovějšího, pak ostatní podle čísla
            shoots.sort(key=lambda sh: (0, "".join(chr(255 - ord(c)) for c in sh["date"])) if sh["date"]
                        else (1, parse_name(os.path.basename(sh["key"]))[0]))
            if shoots:
                items.append({"key": name, "title": parse_name(name)[1], "type": "group", "shoots": shoots})
            else:
                items.append({"key": name, "title": parse_name(name)[1], "type": "empty", "count": 0})
    return items

def load_covers():
    try:
        with open(COVERS_FILE, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def save_covers(c):
    c = {k: v for k, v in c.items() if v}
    if c:
        with open(COVERS_FILE, "w", encoding="utf-8") as f:
            json.dump(c, f, ensure_ascii=False, indent=2)
    elif os.path.exists(COVERS_FILE):
        os.remove(COVERS_FILE)

def remap_covers(covers, old, new):
    if old == new:
        return covers
    out = {}
    for k, v in covers.items():
        if k == old:
            out[new] = v
        elif k.startswith(old + "/"):
            out[new + k[len(old):]] = v
        else:
            out[k] = v
    return out

def next_order(parent=PHOTOS):
    n = 0
    for name in os.listdir(parent):
        if os.path.isdir(os.path.join(parent, name)) and not name.startswith((".", "_")):
            n = max(n, parse_name(name)[0] if parse_name(name)[0] != 9999 else 0)
    return n + 1

def maybe_resize(path):
    """Zmenší fotku na MAX px (originál zazálohuje do _masters/). ImageMagick, jinak Pillow."""
    try:
        rel = os.path.relpath(path, PHOTOS)
        magick = shutil.which("magick") or shutil.which("convert")
        if magick:
            r = subprocess.run([magick, "identify", "-format", "%[fx:max(w,h)]", path],
                               capture_output=True, text=True)
            dim = (r.stdout or "").strip()
            big = dim.isdigit() and int(dim) > MAX
        else:
            from PIL import Image
            with Image.open(path) as im:
                big = max(im.size) > MAX
        if not big:
            return
        mp = os.path.join(MASTERS, rel)
        os.makedirs(os.path.dirname(mp), exist_ok=True)
        if not os.path.exists(mp):
            shutil.copy2(path, mp)
        if magick:
            subprocess.run([magick, path, "-auto-orient", "-resize", f"{MAX}x{MAX}>",
                            "-strip", "-quality", "82", path])
        else:
            from PIL import Image, ImageOps
            with Image.open(path) as im:
                im = ImageOps.exif_transpose(im)
                im.thumbnail((MAX, MAX))
                if path.lower().endswith((".jpg", ".jpeg")):
                    im.convert("RGB").save(path, quality=82, optimize=True)
                else:
                    im.save(path)
    except Exception:
        pass

def rebuild():
    out = subprocess.run([sys.executable, "build.py"], capture_output=True, text=True)
    return (out.returncode == 0, ((out.stdout or "") + (out.stderr or "")).strip()[-1200:])

def to_trash(full):
    stamp = time.strftime("%Y%m%d-%H%M%S")
    rel = os.path.relpath(full, PHOTOS)
    dest = os.path.join(TRASH, stamp, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(full, dest)
    return dest

# ---------- texty webu (site.json) ----------
SITE_FILE = "site.json"
SITE_TEXT_KEYS = ["name", "kicker", "est", "tagline", "about", "based", "shoots", "since", "footer"]

def load_site():
    try:
        with open(SITE_FILE, encoding="utf-8") as f:
            d = json.load(f)
            return d if isinstance(d, dict) else {}
    except Exception:
        return {}

def save_site(d):
    out = {k: str(d.get(k, "")).strip() for k in SITE_TEXT_KEYS}
    out["contacts"] = [
        {k: str(c.get(k, "")).strip() for k in ("label", "text", "href")}
        for c in d.get("contacts", []) if isinstance(c, dict) and str(c.get("label", "")).strip() and str(c.get("text", "")).strip()
    ]
    fm = d.get("fotomat", {})
    out["fotomat"] = {k: v for k, v in (fm.items() if isinstance(fm, dict) else [])
                      if re.fullmatch(r"[A-Za-z]+", str(k)) and k != "sat"
                      and isinstance(v, (int, float)) and not isinstance(v, bool)}
    with open(SITE_FILE, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
        f.write("\n")

# ---------- brána ARC (arc.js) ----------
ARC_FILE = "arc.js"
B64 = re.compile(r"^[A-Za-z0-9+/=]{4,}$")

def arc_state():
    try:
        with open(ARC_FILE, encoding="utf-8") as f:
            src = f.read()
    except Exception:
        return {"enabled": False, "url": ""}
    url = re.search(r'const ARC_URL = "([^"]*)";', src)
    return {"enabled": bool(re.search(r"const ARC_CFG = \{", src)), "url": url.group(1) if url else ""}

def act_arc(cfg, url):
    if not re.fullmatch(r"https?://[^\s\"'\\]+", url or ""):
        raise ValueError("adresa musí začínat http(s):// a nesmí obsahovat mezery ani uvozovky")
    if cfg is None:
        cfg_js = "null"
    else:
        if not (isinstance(cfg, dict) and all(isinstance(cfg.get(k), str) and B64.match(cfg[k]) for k in ("salt", "iv", "ct"))):
            raise ValueError("neplatná konfigurace hesla")
        cfg_js = '{ salt: "%s", iv: "%s", ct: "%s" }' % (cfg["salt"], cfg["iv"], cfg["ct"])
    with open(ARC_FILE, encoding="utf-8") as f:
        src = f.read()
    new, n1 = re.subn(r"const ARC_CFG = (?:null|\{[^}]*\});", lambda m: "const ARC_CFG = " + cfg_js + ";", src, count=1)
    new, n2 = re.subn(r'const ARC_URL = "[^"]*";', lambda m: 'const ARC_URL = "%s";' % url, new, count=1)
    if not (n1 and n2):
        raise ValueError("v arc.js jsem nenašel řádky ARC_CFG / ARC_URL (soubor byl upraven ručně?)")
    with open(ARC_FILE, "w", encoding="utf-8") as f:
        f.write(new)

# ---------- git / kontrola prostředí ----------
def git(*args, timeout=60):
    env = dict(os.environ, GIT_TERMINAL_PROMPT="0")
    try:
        r = subprocess.run(["git", *args], capture_output=True, text=True, timeout=timeout, env=env)
        return r.returncode, ((r.stdout or "") + (r.stderr or "")).strip()
    except FileNotFoundError:
        return 127, "git není nainstalovaný"
    except subprocess.TimeoutExpired:
        return 124, "git neodpověděl včas"

def env_status():
    checks = []
    def add(id_, label, ok, detail="", fix=""):
        checks.append({"id": id_, "label": label, "ok": bool(ok), "detail": detail, "fix": "" if ok else fix})
    add("python", "Python 3.8+", sys.version_info >= (3, 8), sys.version.split()[0], "Nainstaluj Python z python.org")
    try:
        import PIL  # noqa
        pil = True
    except Exception:
        pil = False
    magick = shutil.which("magick") or shutil.which("convert")
    add("images", "Zmenšování fotek a náhledy", pil or magick,
        "Pillow" if pil else ("ImageMagick" if magick else ""),
        "Spusť v Terminálu:  pip3 install pillow   (nebo nainstaluj ImageMagick: brew install imagemagick)")
    rc, out = git("--version")
    add("git", "Git", rc == 0, out if rc == 0 else "", "Nainstaluj Git (git-scm.com) nebo GitHub Desktop")
    if rc != 0:
        return checks, {"changes": 0, "ahead": 0}
    rc, _ = git("rev-parse", "--is-inside-work-tree")
    add("repo", "Složka je Git repozitář", rc == 0, "", "Naklonuj repozitář webu z GitHubu (GitHub Desktop → Clone)")
    if rc != 0:
        return checks, {"changes": 0, "ahead": 0}
    rc, url = git("remote", "get-url", "origin")
    add("remote", "Napojení na GitHub (origin)", rc == 0 and url, url if rc == 0 else "",
        "git remote add origin <adresa-repozitáře>")
    rc1, name = git("config", "user.name"); rc2, mail = git("config", "user.email")
    add("identity", "Jméno a e-mail pro commity", rc1 == 0 and rc2 == 0 and name and mail, f"{name} <{mail}>" if name and mail else "",
        'git config --global user.name "Jméno"  a  git config --global user.email "email@example.com"')
    _, st = git("status", "--porcelain")
    changes = len([l for l in st.splitlines() if l.strip()])
    ahead = 0
    rc, out = git("rev-list", "--count", "@{u}..HEAD")
    if rc == 0 and out.isdigit():
        ahead = int(out)
    return checks, {"changes": changes, "ahead": ahead}

def act_publish(message):
    message = (message or "").strip() or "Aktualizace webu"
    log = []
    rc, out = git("add", "-A")
    if rc != 0:
        return False, out
    rc, out = git("diff", "--cached", "--quiet")
    if rc == 1:
        rc, out = git("commit", "-m", message, timeout=120)
        if rc != 0:
            return False, "Commit se nepovedl:\n" + out
        log.append("Commit hotový.")
    else:
        log.append("Žádné nové změny k commitnutí.")
    rc, out = git("push", timeout=300)
    if rc != 0:
        # Z téhle správy se na GitHub bez uložených údajů přihlásit nedá — odesílání zvládne GitHub Desktop.
        opened = False
        if sys.platform == "darwin" and os.path.isdir("/Applications/GitHub Desktop.app"):
            opened = subprocess.run(["open", "-a", "GitHub Desktop", os.getcwd()]).returncode == 0
        hint = ("\n\nZměny jsou uložené (commit), jen se ještě nedostaly na GitHub — odsud se přihlásit nedá.\n"
                + ("Otevřel jsem ti GitHub Desktop: klikni nahoře na „Push origin“ a za chvíli je to na webu."
                   if opened else
                   "Otevři repozitář v GitHub Desktop a klikni nahoře na „Push origin“."))
        return False, "\n".join(log) + hint
    log.append("Odesláno na GitHub — web se aktualizuje do ~1 minuty.")
    return True, "\n".join(log)

# ---------- akce ----------
def act_reorder(order):
    covers = load_covers()
    tmp = []
    for i, name in enumerate(order):
        src = os.path.join(PHOTOS, name)
        if not os.path.isdir(src):
            continue
        t = os.path.join(PHOTOS, f"__reorder_tmp_{i}__")
        shutil.move(src, t)
        tmp.append((i, name, t))
    for i, oldname, t in tmp:
        title = parse_name(oldname)[1]
        newname = f"{i+1:02d} {title}"
        shutil.move(t, os.path.join(PHOTOS, newname))
        covers = remap_covers(covers, oldname, newname)
    save_covers(covers)

def act_rename(key, title):
    old = safe_rel(key)
    parent = os.path.dirname(old)
    base = os.path.basename(old)
    date = parse_shoot_name(base)[0]
    if date:
        num = f"{date} "
    else:
        order = parse_name(base)[0]
        num = f"{order:02d} " if order != 9999 else ""
    newbase = f"{num}{title.strip()}"
    new = os.path.join(parent, newbase)
    if os.path.abspath(new) == os.path.abspath(old):
        return
    if os.path.exists(new):
        raise ValueError("složka s tímto názvem už existuje")
    shutil.move(old, new)
    oldkey = os.path.relpath(old, PHOTOS).replace("\\", "/")
    newkey = os.path.relpath(new, PHOTOS).replace("\\", "/")
    save_covers(remap_covers(load_covers(), oldkey, newkey))

def act_new_folder(title, parent=None, date=None):
    base = safe_rel(parent) if parent else PHOTOS
    if not os.path.isdir(base):
        raise ValueError("nadřazená složka neexistuje")
    title = re.sub(r"[\\/:*?\"<>|]+", " ", title).strip()
    if not title:
        raise ValueError("chybí název")
    if date:
        if not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
            raise ValueError("datum musí být ve tvaru RRRR-MM-DD")
        name = f"{date} {title}"
    else:
        name = f"{next_order(base):02d} {title}"
    os.makedirs(os.path.join(base, name), exist_ok=False)

def act_to_group(key, title, date=None):
    """Plochou složku s fotkami změní na skupinu: fotky přesune do jednoho shootu uvnitř."""
    folder = safe_rel(key)
    files = imgs_direct(folder)
    if not files:
        raise ValueError("ve složce nejsou žádné fotky")
    title = re.sub(r"[\\/:*?\"<>|]+", " ", title).strip() or "Shoot"
    if date and not re.fullmatch(r"\d{4}-\d{2}-\d{2}", date):
        raise ValueError("datum musí být ve tvaru RRRR-MM-DD")
    sub = os.path.join(folder, f"{date} {title}" if date else f"01 {title}")
    os.makedirs(sub, exist_ok=False)
    for f in files:
        shutil.move(os.path.join(folder, f), os.path.join(sub, f))

def act_trash_folder(key):
    save_covers({k: v for k, v in load_covers().items()
                 if not (k == key or k.startswith(key + "/"))})
    to_trash(safe_rel(key))

def act_trash_photo(folder, name):
    full = os.path.join(safe_rel(folder), os.path.basename(name))
    if os.path.isfile(full):
        to_trash(full)

# ---------- HTTP ----------
PAGE = r"""<!doctype html><html lang="cs"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>JAVY — správa webu</title>
<style>
  :root{color-scheme:dark light;--bg:#0b0b0c;--panel:#141416;--panel2:#1a1a1d;--line:#26262a;--line2:#34343a;
        --fg:#f4f4f5;--mut:#9a9aa3;--dim:#6b6b74;--acc:#fff;--accfg:#0b0b0c;--ok:#5fd38d;--bad:#ff7a7a;--warn:#f2b94b;
        --r:12px;--sh:0 8px 30px rgba(0,0,0,.35)}
  @media (prefers-color-scheme:light){:root{--bg:#f6f6f4;--panel:#fff;--panel2:#f0f0ee;--line:#e4e4e0;--line2:#d2d2cc;
        --fg:#111;--mut:#5f5f66;--dim:#8d8d94;--acc:#111;--accfg:#fff;--ok:#1f9d55;--bad:#d33;--warn:#b97a00;--sh:0 8px 30px rgba(0,0,0,.12)}}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;-webkit-font-smoothing:antialiased}
  :focus-visible{outline:2px solid var(--acc);outline-offset:2px}
  header{position:sticky;top:0;z-index:30;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(14px);
         -webkit-backdrop-filter:saturate(1.4) blur(14px);border-bottom:1px solid var(--line);display:flex;align-items:center;gap:16px;padding:12px 24px;flex-wrap:wrap}
  .brand{display:flex;align-items:center;gap:10px;font-weight:700;letter-spacing:.14em;font-size:13px;text-transform:uppercase}
  .brand i{display:inline-grid;place-items:center;width:24px;height:24px;border:1.5px solid currentColor;border-radius:50%;font-style:normal;font-size:12px}
  nav.tabs{display:flex;gap:2px;background:var(--panel);border:1px solid var(--line);border-radius:10px;padding:3px}
  nav.tabs button{border:0;background:none;color:var(--mut);padding:7px 14px;border-radius:7px;font-weight:600;font-size:13px}
  nav.tabs button:hover{color:var(--fg)}
  nav.tabs button.on{background:var(--acc);color:var(--accfg)}
  .spacer{flex:1}
  #busy{width:14px;height:14px;border:2px solid var(--line2);border-top-color:var(--fg);border-radius:50%;opacity:0;transition:opacity .15s}
  #busy.on{opacity:1;animation:spin .7s linear infinite}
  @keyframes spin{to{transform:rotate(360deg)}}
  input.txt,textarea.txt{font:inherit;background:var(--panel);border:1px solid var(--line2);color:var(--fg);padding:9px 12px;border-radius:9px;min-width:0;transition:border-color .15s,box-shadow .15s}
  input.txt:focus,textarea.txt:focus{outline:none;border-color:var(--acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--acc) 18%,transparent)}
  textarea.txt{width:100%;min-height:150px;font:12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace;resize:vertical}
  button{font:inherit;font-weight:600;font-size:13px;border:1px solid var(--line2);background:var(--panel);color:var(--fg);padding:8px 14px;border-radius:9px;cursor:pointer;
         transition:transform .12s ease,background .15s,border-color .15s,opacity .15s}
  button:hover{background:var(--panel2);border-color:var(--dim)}
  button:active{transform:scale(.97)}
  button.primary{background:var(--acc);color:var(--accfg);border-color:var(--acc)}
  button.primary:hover{opacity:.88}
  button.mini{font-size:12px;padding:5px 10px;border-radius:8px}
  .addshoot{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:4px 0 12px}
  .addshoot input.txt{width:auto;min-width:0}
  .addshoot input[data-sname]{flex:1;min-width:160px}
  .hint{color:var(--mut);font-size:12px;margin:0 0 8px}
  button.danger{color:var(--bad)}
  button.danger:hover{border-color:var(--bad)}
  button:disabled{opacity:.4;cursor:default;pointer-events:none}
  .view{display:none;max-width:1180px;margin:0 auto;padding:22px 24px 90px} .view.on{display:block}
  .tools{display:flex;gap:8px;align-items:center;margin-bottom:16px;flex-wrap:wrap}
  .tools .hint{color:var(--mut);font-size:12.5px;margin-right:auto}
  ul#list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px}
  li.folder{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);overflow:hidden;transition:border-color .15s,opacity .15s,box-shadow .15s}
  li.folder:hover{border-color:var(--line2)}
  li.folder.drag{opacity:.35}
  li.folder.over{border-color:var(--acc);box-shadow:0 0 0 2px color-mix(in srgb,var(--acc) 30%,transparent)}
  .row{display:flex;align-items:center;gap:14px;padding:12px 16px}
  .grip{cursor:grab;color:var(--dim);font-size:16px;user-select:none;width:14px;text-align:center}
  .grip:active{cursor:grabbing}
  .num{color:var(--dim);font-size:12px;width:20px;font-variant-numeric:tabular-nums}
  .curthumb{width:46px;height:58px;object-fit:cover;border-radius:7px;background:var(--panel2);flex:0 0 auto;display:grid;place-items:center;color:var(--dim);font-size:10px}
  .fname{font-size:16px;font-weight:700;letter-spacing:.02em}
  .fmeta{color:var(--mut);font-size:12.5px}
  .acts{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
  .body{padding:2px 16px 16px 60px;display:none}
  li.folder.open .body{display:block}
  .shoot-title{color:var(--mut);font-size:12px;letter-spacing:.1em;text-transform:uppercase;margin:14px 0 6px;font-weight:600}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(112px,1fr));gap:8px}
  .thumb{position:relative;aspect-ratio:3/4;background:var(--panel2);cursor:pointer;overflow:hidden;border-radius:8px;outline:2px solid transparent;outline-offset:-2px;transition:outline-color .12s}
  .thumb img{width:100%;height:100%;object-fit:cover;display:block;transition:transform .25s ease}
  .thumb:hover img{transform:scale(1.04)}
  .thumb .del{position:absolute;top:5px;right:5px;background:rgba(0,0,0,.65);border:0;color:#ff9b9b;font-size:11px;padding:3px 7px;border-radius:6px;opacity:0}
  .thumb:hover .del,.thumb:focus-within .del{opacity:1}
  .thumb.sel{outline-color:var(--acc)}
  .thumb.sel::after{content:"★ NÁHLED";position:absolute;left:0;right:0;bottom:0;background:var(--acc);color:var(--accfg);font-size:10px;font-weight:700;letter-spacing:.08em;text-align:center;padding:3px 0}
  .drop{border:1.5px dashed var(--line2);border-radius:10px;padding:16px;text-align:center;color:var(--mut);font-size:13px;margin:8px 0 12px;cursor:pointer;transition:all .15s}
  .drop:hover,.drop.hot{border-color:var(--acc);color:var(--fg);background:var(--panel2)}
  .empty-note{color:var(--dim);font-size:13px;padding:4px 0}
  .skeleton{height:74px;border-radius:var(--r);background:linear-gradient(90deg,var(--panel) 25%,var(--panel2) 50%,var(--panel) 75%);background-size:200% 100%;animation:sh 1.2s infinite}
  @keyframes sh{to{background-position:-200% 0}}
  .panel{max-width:780px}
  .card{background:var(--panel);border:1px solid var(--line);border-radius:var(--r);padding:20px;margin-bottom:16px}
  .card h2{font-size:12px;letter-spacing:.14em;text-transform:uppercase;margin:0 0 4px;color:var(--mut);font-weight:700}
  .card p.note{color:var(--mut);font-size:13px;line-height:1.55;margin:4px 0 16px}
  .field{display:grid;grid-template-columns:170px 1fr;gap:12px;align-items:center;margin-bottom:10px}
  .field label{color:var(--mut);font-size:13px}
  .field input.txt{width:100%}
  .crow{display:grid;grid-template-columns:1fr 1fr 1.5fr auto;gap:8px;margin-bottom:8px}
  .crow input.txt{width:100%}
  .check{display:flex;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}
  .check:last-child{border-bottom:0}
  .check .dot{width:20px;height:20px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;flex:0 0 20px;margin-top:1px}
  .check .dot.ok{background:color-mix(in srgb,var(--ok) 22%,transparent);color:var(--ok)}
  .check .dot.bad{background:color-mix(in srgb,var(--bad) 22%,transparent);color:var(--bad)}
  .check .det{color:var(--dim);font-size:12.5px;margin-top:2px;word-break:break-all}
  .check .fix{color:var(--warn);font-size:12.5px;margin-top:5px;line-height:1.5}
  pre.log{background:var(--panel2);border:1px solid var(--line);padding:12px 14px;font:12px/1.5 ui-monospace,Menlo,monospace;white-space:pre-wrap;color:var(--mut);border-radius:10px;margin:14px 0 0}
  .row2{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
  .pill{display:inline-block;font-size:11px;font-weight:700;letter-spacing:.06em;padding:3px 9px;border-radius:99px;background:var(--panel2);color:var(--mut)}
  .pill.on{background:color-mix(in srgb,var(--ok) 22%,transparent);color:var(--ok)}
  #toasts{position:fixed;right:20px;bottom:20px;display:flex;flex-direction:column;gap:8px;z-index:100;max-width:min(420px,calc(100vw - 40px))}
  .toast{background:var(--panel);border:1px solid var(--line2);border-left:3px solid var(--mut);border-radius:10px;padding:11px 14px;box-shadow:var(--sh);font-size:13px;white-space:pre-line;animation:ti .2s ease}
  .toast.ok{border-left-color:var(--ok)} .toast.bad{border-left-color:var(--bad)}
  @keyframes ti{from{opacity:0;transform:translateY(8px)}}
  @media (max-width:720px){
    header{padding:10px 14px;gap:10px} .view{padding:16px 14px 80px}
    .field{grid-template-columns:1fr;gap:4px} .crow{grid-template-columns:1fr 1fr;} .crow button{grid-column:span 2}
    .body{padding-left:16px} .acts{width:100%;margin-left:0} .row{flex-wrap:wrap}
  }
  @media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}
</style></head><body>
<header>
  <div class="brand"><i>P</i>JAVY · správa</div>
  <nav class="tabs" role="tablist">
    <button data-tab="Photos" class="on">Fotky</button>
    <button data-tab="Site">Texty webu</button>
    <button data-tab="Adv">Pokročilé</button>
    <button data-tab="Publish">Publikovat</button>
  </nav>
  <span class="spacer"></span><span id="busy"></span><button class="mini" id="quitBtn" title="Vypne správu webu — v Terminálu pak nic nemusíš zavírat">Vypnout správu</button>
</header>

<div id="viewPhotos" class="view on">
  <div class="tools">
    <span class="hint">Přetáhni složky pro pořadí · rozbal pro fotky a výběr náhledu</span>
    <input class="txt" id="newName" placeholder="název nové složky">
    <button id="newBtn" class="primary">+ Nová složka</button>
  </div>
  <ul id="list"><li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li></ul>
</div>

<div id="viewSite" class="view"><div class="panel">
  <div class="card">
    <h2>Texty na webu</h2>
    <p class="note">Úvodní strana, About a Contact. Po uložení se web přegeneruje; na internet se dostane až přes záložku Publikovat.</p>
    <div id="siteFields"></div>
  </div>
  <div class="card">
    <h2>Kontakty</h2>
    <p class="note">Řádky v sekci Contact. Odkaz může být <code>https://…</code> nebo <code>mailto:…</code>.</p>
    <div id="contactRows"></div>
    <button class="mini" id="addContact">+ Přidat kontakt</button>
  </div>
  <div class="row2"><button class="primary" id="saveSite">Uložit texty</button></div>
</div></div>

<div id="viewAdv" class="view"><div class="panel">
  <div class="card">
    <h2>Brána do archivu (ARC) <span class="pill" id="arcPill">…</span></h2>
    <p class="note">Heslo, které se zadává na webu po napsání <code>arc</code> nebo trojkliku na ℗. Heslo se nikam neposílá a nikde se neukládá čitelně: v prohlížeči se jím zašifruje adresa archivu a do <code>arc.js</code> se zapíše jen výsledek.</p>
    <div class="field"><label>Adresa archivu</label><input class="txt" id="arcUrl" value="https://projects.javyarc.com"></div>
    <div class="field"><label>Nové heslo</label><input class="txt" id="arcPass" type="password" autocomplete="new-password"></div>
    <div class="field"><label>Heslo znovu</label><input class="txt" id="arcPass2" type="password" autocomplete="new-password"></div>
    <div class="row2"><button class="primary" id="arcSave">Nastavit heslo</button><button class="danger" id="arcOff">Vypnout bránu</button></div>
  </div>
  <div class="card">
    <h2>Výchozí vzhled FOTOMATU <span class="pill" id="fmPill">…</span></h2>
    <p class="note">Co uvidí všichni návštěvníci. Postup: na webu otevři FOTOMAT (nebo <code>/fotomat/</code>), stiskni <b>G</b>, doladit posuvníky, klikni <b>KOPÍROVAT</b> a výsledek vlož sem. Fotomat zůstává vždy černobílý.</p>
    <textarea class="txt" id="fmJson" spellcheck="false" placeholder='{ "exposure": 0.3, "contrast": 1.5, … }'></textarea>
    <div class="row2" style="margin-top:12px"><button class="primary" id="fmSave">Uložit vzhled</button><button id="fmReset">Vrátit na výchozí</button></div>
  </div>
</div></div>

<div id="viewPublish" class="view"><div class="panel">
  <div class="card">
    <h2>Publikovat na web</h2>
    <p class="note" id="pubInfo">Kontroluju…</p>
    <div class="row2">
      <input class="txt" id="pubMsg" style="flex:1;min-width:220px" placeholder="popis změny (volitelné), např. nový shoot">
      <button class="primary" id="pubBtn">Publikovat</button>
    </div>
    <pre class="log" id="pubLog" style="display:none"></pre>
  </div>
  <div class="card">
    <h2>Kontrola nastavení</h2>
    <p class="note">Všechno by mělo být zelené. U červených bodů je napsáno, co udělat.</p>
    <div id="checks"></div>
    <button class="mini" id="recheck" style="margin-top:12px">Zkontrolovat znovu</button>
  </div>
</div></div>
<div id="toasts" aria-live="polite"></div>

<script>
const TOKEN="__TOKEN__";
let DATA=[], COVERS={}, open=new Set(), dragIdx=null, inflight=0;
const $=s=>document.querySelector(s);
const enc=encodeURIComponent;
const HDR={'X-Admin-Token':TOKEN};
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function toast(t,kind,ms){const el=document.createElement('div');el.className='toast '+(kind||'');el.textContent=t;$('#toasts').appendChild(el);
  setTimeout(()=>el.remove(),ms||(kind==='bad'?9000:3800));return el;}
function busy(d){inflight=Math.max(0,inflight+d);$('#busy').classList.toggle('on',inflight>0);}
async function api(path,obj,raw){
  busy(1);
  try{
    const opt=obj===undefined?{headers:HDR}:{method:'POST',headers:raw?{...HDR,'Content-Type':'application/octet-stream'}:{...HDR,'Content-Type':'application/json'},body:raw?obj:JSON.stringify(obj)};
    const r=await fetch(path,opt); return await r.json();
  }catch(e){return {ok:false,log:'Server správy neodpovídá — je okno správy pořád otevřené?'};}
  finally{busy(-1);}
}
async function post(path,obj){const d=await api(path,obj); if(d&&d.log&&d.ok===false)toast(d.log,'bad'); return d;}
function thumbOf(u){return u.replace(/^photos\//,'photos/_thumbs/').replace(/\.[^./]+$/,'.webp');}
function imgTag(url,extra){return '<img loading="lazy" decoding="async" alt="" '+(extra||'')+' src="'+esc(thumbOf(url))+'" onerror="this.onerror=null;this.src=\''+esc(url).replace(/'/g,"\\'")+'\'">';}

function curCover(key,images){
  const sel=COVERS[key];
  if(sel){const h=images.find(im=>im.file===sel);if(h)return h;}
  return images[Math.min(2,images.length-1)];
}
function grid(key,images){
  const cur=images.length?curCover(key,images):null;
  return '<div class="grid">'+images.map(im=>
    '<div class="thumb'+(cur&&im.file===cur.file?' sel':'')+'" data-key="'+esc(key)+'" data-file="'+esc(im.file)+'">'+imgTag(im.url)+
    '<button class="del" data-delfolder="'+esc(key)+'" data-delfile="'+esc(im.file)+'">smazat</button></div>').join('')+'</div>';
}
function dropzone(k){return '<div class="drop" data-drop="'+esc(k)+'">+ Přetáhni sem fotky (nebo klikni pro výběr)</div>';}
const today=()=>new Date().toISOString().slice(0,10);
function shootForm(key,note){
  return '<div class="hint">'+note+'</div><div class="addshoot"><input class="txt" type="date" data-sdate value="'+today()+'">'+
    '<input class="txt" data-sname placeholder="název shootu, např. Rebrand">'+
    '<button class="mini" data-addshoot="'+esc(key)+'">Přidat shoot</button></div>';
}
function render(){
  const y=window.scrollY;
  if(!DATA.length){$('#list').innerHTML='<li class="folder"><div class="row"><div class="empty-note">Zatím tu nejsou žádné složky. Vytvoř první tlačítkem „Nová složka“.</div></div></li>';return;}
  $('#list').innerHTML=DATA.map((it,i)=>{
    const isOpen=open.has(it.key), opened=isOpen?' open':'';
    let head, body='';
    if(it.type==='shoot'){
      const cur=it.count?curCover(it.key,it.images):null;
      head=(cur?imgTag(cur.url,'class="curthumb"'):'<div class="curthumb">—</div>')+
           '<div><div class="fname">'+esc(it.title)+'</div><div class="fmeta">'+it.count+' fotek</div></div>';
      if(isOpen) body='<div class="addshoot"><button class="mini" data-togroup="'+esc(it.key)+'">Rozdělit na shooty…</button><span class="hint" style="margin:0">Z téhle složky udělá skupinu a dosavadní fotky dá do prvního shootu.</span></div>'+dropzone(it.key)+grid(it.key,it.images);
    }else if(it.type==='group'){
      head='<div class="curthumb">SKUP.</div><div><div class="fname">'+esc(it.title)+'</div><div class="fmeta">skupina · '+it.shoots.length+' shootů</div></div>';
      if(isOpen) body=shootForm(it.key,'Nový shoot se na webu řadí podle data — nejnovější je první a starší jsou v liště pod ním.')+it.shoots.map(sh=>'<div class="shoot-title">'+(sh.date?esc(sh.date)+' · ':'')+esc(sh.title)+' · '+sh.count+' fotek <button class="mini" data-rename="'+esc(sh.key)+'" data-title="'+esc(sh.title)+'">Přejmenovat</button> <button class="mini danger" data-trash="'+esc(sh.key)+'">Smazat</button></div>'+dropzone(sh.key)+grid(sh.key,sh.images)).join('');
    }else{
      head='<div class="curthumb">—</div><div><div class="fname">'+esc(it.title)+'</div><div class="fmeta">prázdná složka</div></div>';
      if(isOpen) body='<div class="empty-note">Zatím žádné fotky.</div>'+dropzone(it.key)+shootForm(it.key,'…nebo z ní udělej skupinu shootů (třeba pro fotky jedné kapely z různých dní):');
    }
    return '<li class="folder'+opened+'" draggable="true" data-idx="'+i+'" data-key="'+esc(it.key)+'">'+
      '<div class="row"><span class="grip" title="Přetáhni pro změnu pořadí">⠿</span><span class="num">'+String(i+1).padStart(2,'0')+'</span>'+head+
        '<div class="acts">'+
          '<button class="mini" data-toggle="'+esc(it.key)+'">'+(isOpen?'Sbalit':'Fotky a náhled')+'</button>'+
          '<button class="mini" data-rename="'+esc(it.key)+'" data-title="'+esc(it.title)+'">Přejmenovat</button>'+
          '<button class="mini danger" data-trash="'+esc(it.key)+'">Smazat</button>'+
        '</div></div><div class="body">'+body+'</div></li>';
  }).join('');
  window.scrollTo(0,y);
  bind();
}
function bind(){
  document.querySelectorAll('[data-toggle]').forEach(b=>b.onclick=()=>{const k=b.dataset.toggle;open.has(k)?open.delete(k):open.add(k);render();});
  document.querySelectorAll('.thumb').forEach(t=>t.onclick=e=>{
    if(e.target.classList.contains('del'))return;
    COVERS[t.dataset.key]=t.dataset.file; saveCovers();
  });
  document.querySelectorAll('[data-delfile]').forEach(b=>b.onclick=async e=>{
    e.stopPropagation();
    if(!confirm('Přesunout fotku do koše? (jde obnovit ze složky _trash)'))return;
    await post('/api/trash-photo',{folder:b.dataset.delfolder,name:b.dataset.delfile}); reload();
  });
  document.querySelectorAll('[data-addshoot]').forEach(b=>b.onclick=async()=>{
    const box=b.parentElement, t=box.querySelector('[data-sname]').value.trim(), dt=box.querySelector('[data-sdate]').value;
    if(!t){toast('Napiš název shootu.','bad');return;}
    const d=await post('/api/new-folder',{title:t,parent:b.dataset.addshoot,date:dt||null});
    if(d.ok)toast('Shoot vytvořen — nahraj do něj fotky.','ok'); reload();
  });
  document.querySelectorAll('[data-togroup]').forEach(b=>b.onclick=async()=>{
    const t=prompt('Jak se jmenuje shoot, ve kterém jsou dosavadní fotky?','Shoot 1'); if(t==null||!t.trim())return;
    const dt=prompt('Datum toho shootu (RRRR-MM-DD). Nech prázdné, když ho nevíš:','');
    if(dt==null)return;
    const d=await post('/api/to-group',{key:b.dataset.togroup,title:t.trim(),date:dt.trim()||null}); if(d.ok)toast('Hotovo — složka je teď skupina shootů.','ok'); reload();
  });
  document.querySelectorAll('[data-rename]').forEach(b=>b.onclick=async()=>{
    const t=prompt('Nový název složky:',b.dataset.title); if(t==null||!t.trim())return;
    const d=await post('/api/rename',{key:b.dataset.rename,title:t.trim()}); if(d.ok)toast('Přejmenováno.','ok'); reload();
  });
  document.querySelectorAll('[data-trash]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Přesunout celou složku „'+b.dataset.trash+'“ do koše? (jde obnovit ze složky _trash)'))return;
    const d=await post('/api/trash',{key:b.dataset.trash}); if(d.ok)toast('Složka je v koši.','ok'); reload();
  });
  document.querySelectorAll('li.folder[draggable]').forEach(li=>{
    li.ondragstart=e=>{if(e.target!==li){return;}dragIdx=+li.dataset.idx;li.classList.add('drag');e.dataTransfer.effectAllowed='move';};
    li.ondragend=()=>{li.classList.remove('drag');document.querySelectorAll('li.folder').forEach(x=>x.classList.remove('over'));};
    li.ondragover=e=>{if(dragIdx==null)return;e.preventDefault();li.classList.add('over');};
    li.ondragleave=()=>li.classList.remove('over');
    li.ondrop=async e=>{if(dragIdx==null)return;e.preventDefault();const to=+li.dataset.idx;
      if(dragIdx===to){dragIdx=null;return;}
      const m=DATA.splice(dragIdx,1)[0];DATA.splice(to,0,m);dragIdx=null;render();
      const d=await post('/api/reorder',{order:DATA.map(x=>x.key)}); if(d.ok)toast('Pořadí uloženo.','ok'); reload();
    };
  });
  document.querySelectorAll('.drop').forEach(dz=>{
    const key=dz.dataset.drop;
    dz.onclick=()=>{const inp=document.createElement('input');inp.type='file';inp.multiple=true;inp.accept='image/*';
      inp.onchange=()=>uploadFiles(key,inp.files);inp.click();};
    dz.ondragover=e=>{e.preventDefault();dz.classList.add('hot');};
    dz.ondragleave=()=>dz.classList.remove('hot');
    dz.ondrop=e=>{e.preventDefault();e.stopPropagation();dz.classList.remove('hot');uploadFiles(key,e.dataTransfer.files);};
  });
}
async function uploadFiles(folderKey,fileList){
  const files=[...fileList].filter(f=>/^image\//.test(f.type));
  if(!files.length){toast('Vyber obrázky (JPG, PNG, WebP).','bad');return;}
  let done=0,fail=0,next=0; const t=toast('Nahrávám 0/'+files.length+'…','',120000);
  async function worker(){
    while(next<files.length){
      const f=files[next++];
      const d=await api('/api/upload?folder='+enc(folderKey)+'&name='+enc(f.name),f,true);
      if(d&&d.ok)done++; else fail++;
      t.textContent='Nahrávám '+(done+fail)+'/'+files.length+'…';
    }
  }
  await Promise.all([worker(),worker(),worker()]);
  t.textContent='Zmenšuju a generuju náhledy…';
  const d=await api('/api/rebuild',{});
  t.remove();
  toast(fail?('Nahráno '+done+', selhalo '+fail+'.'):('Nahráno '+done+' fotek.'),fail?'bad':'ok');
  if(d&&d.ok===false)toast(d.log,'bad');
  reload();
}
let coverT=null;
function saveCovers(){render();clearTimeout(coverT);coverT=setTimeout(async()=>{
  const d=await post('/api/covers',{covers:COVERS}); if(d.ok)toast('Náhled uložen.','ok',1800);},400);}
async function reload(){
  const d=await api('/api/data'); if(!d||!d.items){toast((d&&d.log)||'Nepodařilo se načíst data.','bad');return;}
  DATA=d.items; COVERS=d.covers||{}; render();
}
$('#newBtn').onclick=async()=>{const t=$('#newName').value.trim();if(!t)return;
  const d=await post('/api/new-folder',{title:t}); if(d.ok){$('#newName').value='';toast('Složka vytvořena.','ok');} reload();};
$('#newName').addEventListener('keydown',e=>{if(e.key==='Enter')$('#newBtn').click();});

/* ---------- záložky ---------- */
function showTab(name){
  document.querySelectorAll('nav.tabs button').forEach(x=>x.classList.toggle('on',x.dataset.tab===name));
  document.querySelectorAll('.view').forEach(v=>v.classList.toggle('on',v.id==='view'+name));
  if(name==='Site')loadSite(); if(name==='Adv')loadAdv(); if(name==='Publish')loadStatus();
  try{history.replaceState(null,'','#'+name);}catch(e){}
}
document.querySelectorAll('nav.tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));

/* ---------- texty webu ---------- */
const SITE_FIELDS=[['name','Jméno / značka'],['kicker','Řádek nad názvem'],['est','Rok založení (vpravo)'],['tagline','Podtitul úvodu'],
  ['about','About — věta'],['based','Působiště'],['shoots','Typy focení'],['since','Od roku'],['footer','Patička']];
let SITE={contacts:[]};
function contactRow(c,i){
  return '<div class="crow">'+
    '<input class="txt" data-c="label" data-i="'+i+'" placeholder="štítek (EMAIL)" value="'+esc(c.label||'')+'">'+
    '<input class="txt" data-c="text" data-i="'+i+'" placeholder="text (@jmeno)" value="'+esc(c.text||'')+'">'+
    '<input class="txt" data-c="href" data-i="'+i+'" placeholder="odkaz (https://… nebo mailto:…)" value="'+esc(c.href||'')+'">'+
    '<button class="mini danger" data-cdel="'+i+'" aria-label="Smazat kontakt">✕</button></div>';
}
function renderSite(){
  $('#siteFields').innerHTML=SITE_FIELDS.map(([k,l])=>'<div class="field"><label>'+l+'</label><input class="txt" data-k="'+k+'" value="'+esc(SITE[k]||'')+'"></div>').join('');
  $('#contactRows').innerHTML=(SITE.contacts||[]).map(contactRow).join('');
  document.querySelectorAll('[data-k]').forEach(i=>i.oninput=()=>{SITE[i.dataset.k]=i.value;});
  document.querySelectorAll('[data-c]').forEach(i=>i.oninput=()=>{SITE.contacts[+i.dataset.i][i.dataset.c]=i.value;});
  document.querySelectorAll('[data-cdel]').forEach(b=>b.onclick=()=>{SITE.contacts.splice(+b.dataset.cdel,1);renderSite();});
}
async function loadSite(){const d=await api('/api/site');SITE=(d&&d.site)||{};SITE.contacts=SITE.contacts||[];renderSite();}
$('#addContact').onclick=()=>{SITE.contacts.push({label:'',text:'',href:''});renderSite();};
$('#saveSite').onclick=async()=>{
  const d=await post('/api/site',{site:SITE});
  if(d.ok)toast('Texty uloženy. Pro zveřejnění klikni na „Publikovat“.','ok');
};

/* ---------- pokročilé: ARC brána + FOTOMAT ---------- */
const b64=buf=>btoa(String.fromCharCode(...new Uint8Array(buf)));
async function makeArcConfig(password,url){
  const e=new TextEncoder(), salt=crypto.getRandomValues(new Uint8Array(16)), iv=crypto.getRandomValues(new Uint8Array(12));
  const km=await crypto.subtle.importKey('raw',e.encode(password),'PBKDF2',false,['deriveKey']);
  const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt,iterations:150000,hash:'SHA-256'},km,{name:'AES-GCM',length:256},false,['encrypt']);
  const ct=await crypto.subtle.encrypt({name:'AES-GCM',iv},key,e.encode(url));
  return {salt:b64(salt),iv:b64(iv),ct:b64(ct)};
}
async function loadAdv(){
  const d=await api('/api/arc'); if(d&&d.url){$('#arcUrl').value=d.url;}
  const p=$('#arcPill'); p.textContent=d&&d.enabled?'zapnuto':'vypnuto'; p.classList.toggle('on',!!(d&&d.enabled));
  const s=await api('/api/site'); const fm=(s&&s.site&&s.site.fotomat)||{}; const n=Object.keys(fm).length;
  $('#fmJson').value=n?JSON.stringify(fm,null,2):'';
  const fp=$('#fmPill'); fp.textContent=n?('vlastní · '+n+' hodnot'):'výchozí'; fp.classList.toggle('on',n>0);
}
$('#arcSave').onclick=async()=>{
  const url=$('#arcUrl').value.trim(),p1=$('#arcPass').value,p2=$('#arcPass2').value;
  if(!/^https?:\/\/[^\s"']+$/.test(url))return toast('Adresa musí začínat http(s)://','bad');
  if(p1.length<4)return toast('Heslo je moc krátké (min. 4 znaky).','bad');
  if(p1!==p2)return toast('Hesla se neshodují.','bad');
  if(!window.crypto||!crypto.subtle)return toast('Tento prohlížeč neumí šifrování — otevři správu přes http://127.0.0.1:8765','bad');
  const cfg=await makeArcConfig(p1,url);
  const d=await post('/api/arc',{cfg,url});
  if(d.ok){$('#arcPass').value='';$('#arcPass2').value='';toast('Heslo nastaveno. Teď klikni na „Publikovat“.','ok');loadAdv();}
};
$('#arcOff').onclick=async()=>{
  if(!confirm('Vypnout bránu? Na webu pak přestane fungovat vstup do archivu.'))return;
  const d=await post('/api/arc',{cfg:null,url:$('#arcUrl').value.trim()}); if(d.ok){toast('Brána vypnuta.','ok');loadAdv();}
};
$('#fmSave').onclick=async()=>{
  let obj; try{obj=JSON.parse($('#fmJson').value||'{}');}catch(e){return toast('Tohle není platný JSON — vlož přesně to, co zkopírovalo tlačítko KOPÍROVAT.','bad');}
  if(!obj||typeof obj!=='object'||Array.isArray(obj))return toast('Očekávám objekt { … }.','bad');
  const s=await api('/api/site'); const site=(s&&s.site)||{}; site.fotomat=obj;
  const d=await post('/api/site',{site}); if(d.ok){toast('Vzhled FOTOMATU uložen. Pro zveřejnění klikni na „Publikovat“.','ok');loadAdv();}
};
$('#fmReset').onclick=async()=>{
  const s=await api('/api/site'); const site=(s&&s.site)||{}; site.fotomat={};
  const d=await post('/api/site',{site}); if(d.ok){toast('FOTOMAT vrácen na výchozí vzhled.','ok');loadAdv();}
};

/* ---------- publikace + kontrola prostředí ---------- */
async function loadStatus(){
  $('#checks').innerHTML='<div class="empty-note">Kontroluju…</div>';
  const d=await api('/api/status'); if(!d||!d.checks)return;
  $('#checks').innerHTML=d.checks.map(c=>'<div class="check"><span class="dot '+(c.ok?'ok':'bad')+'">'+(c.ok?'✓':'!')+'</span><div>'+esc(c.label)+
    (c.detail?'<div class="det">'+esc(c.detail)+'</div>':'')+(c.fix?'<div class="fix">'+esc(c.fix)+'</div>':'')+'</div></div>').join('');
  const gitOk=d.checks.filter(c=>['git','repo','remote','identity'].includes(c.id)).every(c=>c.ok);
  $('#pubBtn').disabled=!gitOk;
  $('#pubInfo').textContent=!gitOk?'Publikování zatím nejde — oprav červené body níže.':
    (d.changes||d.ahead?('Čeká na publikování: '+d.changes+' změněných souborů'+(d.ahead?', '+d.ahead+' commit(ů) neodeslaných':'')+'.'):'Vše je publikované, nic nečeká.');
}
$('#recheck').onclick=loadStatus;
$('#pubBtn').onclick=async()=>{
  $('#pubBtn').disabled=true;$('#pubLog').style.display='block';$('#pubLog').textContent='Publikuju… (může to chvíli trvat)';
  const d=await api('/api/publish',{message:$('#pubMsg').value});
  $('#pubLog').textContent=(d.ok?'✅ ':'⚠️ ')+d.log; if(d.ok){$('#pubMsg').value='';toast('Publikováno.','ok');}
  loadStatus();
};

reload();
const h0=(location.hash||'').slice(1); if(['Site','Adv','Publish'].includes(h0))showTab(h0);
setInterval(()=>{fetch('/api/ping',{headers:HDR}).catch(()=>{});},5000);   // hlásí serveru, že je stránka otevřená
$('#quitBtn').onclick=async()=>{
  await fetch('/api/quit',{method:'POST',headers:HDR}).catch(()=>{});
  document.body.innerHTML='<div style="max-width:520px;margin:18vh auto;padding:0 24px;font:16px/1.5 system-ui;color:#999;text-align:center"><b style="color:#fff;font-size:20px">Správa je vypnutá.</b><br>Tuhle záložku můžeš zavřít. Příště ji zapneš dvojklikem na <code>sprava-webu.command</code>.</div>';
};
</script></body></html>"""

class Handler(SimpleHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _body(self):
        n = int(self.headers.get("Content-Length", 0))
        return self.rfile.read(n) if n else b""

    def _guard(self, api):
        host = (self.headers.get("Host") or "").lower()
        if host not in (f"127.0.0.1:{PORT}", f"localhost:{PORT}"):
            self._json({"ok": False, "log": "Nepovolený hostitel."}, 403)
            return False
        if api and self.headers.get("X-Admin-Token") != TOKEN:
            self._json({"ok": False, "log": "Chybí oprávnění — obnov stránku správy (F5)."}, 403)
            return False
        return True

    def do_GET(self):
        path = urlparse(self.path).path
        if not self._guard(path.startswith("/api/")):
            return
        if path == "/":
            body = PAGE.replace("__TOKEN__", TOKEN).encode("utf-8")
            self.send_response(200)
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/ping":                      # stránka správy se hlásí; bez ní se správa po chvíli sama vypne
            global LAST_PING
            LAST_PING = time.time()
            self._json({"ok": True})
            return
        if path == "/api/data":
            self._json({"items": scan(), "covers": load_covers()})
            return
        if path == "/api/site":
            self._json({"site": load_site()})
            return
        if path == "/api/arc":
            self._json(arc_state())
            return
        if path == "/api/status":
            checks, info = env_status()
            self._json({"checks": checks, **info})
            return
        return super().do_GET()

    def do_POST(self):
        if not self._guard(True):
            return
        parsed = urlparse(self.path)
        path, q = parsed.path, parse_qs(parsed.query)
        try:
            if path == "/api/upload":
                folder = unquote(q.get("folder", [""])[0])
                name = os.path.basename(unquote(q.get("name", ["foto.jpg"])[0]))
                dest_dir = safe_rel(folder)
                os.makedirs(dest_dir, exist_ok=True)
                target = os.path.join(dest_dir, name)
                stem, ext = os.path.splitext(name)
                k = 1
                while os.path.exists(target):
                    target = os.path.join(dest_dir, f"{stem}-{k}{ext}"); k += 1
                with open(target, "wb") as f:
                    f.write(self._body())
                maybe_resize(target)
                self._json({"ok": True})
                return

            if path == "/api/quit":
                self._json({"ok": True})
                threading.Timer(0.3, lambda: HTTPD and HTTPD.shutdown()).start()
                return
            data = json.loads(self._body().decode("utf-8") or "{}")
            if path == "/api/publish":
                ok, log = act_publish(data.get("message"))
                self._json({"ok": ok, "log": log})
                return
            if path == "/api/arc":
                act_arc(data.get("cfg"), data.get("url"))
                self._json({"ok": True, "log": "ARC nastaveno."})
                return
            if path == "/api/site":
                save_site(data.get("site", {}))
                ok, log = rebuild()
                self._json({"ok": ok, "log": "Texty uložené." if ok else log})
                return
            if path == "/api/covers":
                save_covers(data.get("covers", {}))
            elif path == "/api/reorder":
                act_reorder(data.get("order", []))
            elif path == "/api/rename":
                act_rename(data["key"], data["title"])
            elif path == "/api/to-group":
                act_to_group(data["key"], data["title"], data.get("date"))
            elif path == "/api/new-folder":
                act_new_folder(data["title"], data.get("parent"), data.get("date"))
            elif path == "/api/trash":
                act_trash_folder(data["key"])
            elif path == "/api/trash-photo":
                act_trash_photo(data["folder"], data["name"])
            elif path == "/api/rebuild":
                pass
            else:
                self.send_error(404); return
            ok, log = rebuild()
            self._json({"ok": ok, "log": log})
        except Exception as e:
            self._json({"ok": False, "log": str(e)}, 500)

    def log_message(self, *a):
        pass

LAST_PING = time.time()
HTTPD = None
IDLE_LIMIT = 180        # s bez signálu ze stránky správy → server se sám vypne (žádný zapomenutý proces)

def free_port():
    """Zůstala-li na portu stará správa (zapomenuté okno), ukonči ji; cizí program nech být."""
    lsof = shutil.which("lsof")
    if not lsof:
        return False
    r = subprocess.run([lsof, "-tiTCP:%d" % PORT, "-sTCP:LISTEN"], capture_output=True, text=True)
    pids = [int(x) for x in r.stdout.split() if x.isdigit() and int(x) != os.getpid()]
    ours = []
    for pid in pids:
        cmd = subprocess.run(["ps", "-o", "command=", "-p", str(pid)], capture_output=True, text=True).stdout
        if "cover_admin.py" in cmd:
            ours.append(pid)
    if not ours or len(ours) != len(pids):
        return False
    import signal
    for pid in ours:
        try: os.kill(pid, signal.SIGTERM)
        except OSError: pass
    time.sleep(1.2)
    return True

def watchdog():
    global LAST_PING
    last_tick = time.time()
    while True:
        time.sleep(5)
        now = time.time()
        if now - last_tick > 30:            # počítač spal → nepočítej to jako nečinnost
            LAST_PING = now
        last_tick = now
        if now - LAST_PING > IDLE_LIMIT:
            print("\nStránka správy je zavřená — správa se sama vypnula.")
            HTTPD.shutdown()
            return

def main():
    global HTTPD
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    try:
        HTTPD = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    except OSError:
        if free_port():
            print("Našel jsem starou běžící správu a vypnul ji.")
        try:
            HTTPD = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
        except OSError:
            print(f"Port {PORT} používá jiný program. Zavři okno, kde už správa běží, a zkus to znovu.")
            return
    url = f"http://127.0.0.1:{PORT}/"
    print("JAVY — správa webu běží na", url)
    print("Vypneš ji tlačítkem „Vypnout správu“ vpravo nahoře (nebo Ctrl+C). Zavřeš-li stránku, vypne se sama.")
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    threading.Thread(target=watchdog, daemon=True).start()
    try:
        HTTPD.serve_forever()
    except KeyboardInterrupt:
        pass
    print("Konec — správa je vypnutá, okno můžeš zavřít.")

if __name__ == "__main__":
    main()
