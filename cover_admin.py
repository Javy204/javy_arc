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

import os, re, json, shutil, time, subprocess, webbrowser, threading
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlparse, parse_qs, unquote

PHOTOS = "photos"
TRASH = "_trash"
MASTERS = "_masters"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
COVERS_FILE = os.path.join(PHOTOS, "covers.json")
PORT = 8765
MAX = 1600

# ---------- helpers ----------
def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def parse_name(name):
    m = re.match(r"^\s*(\d+)\s*[-_.\s]*\s*(.+?)\s*$", name)
    return (int(m.group(1)), m.group(2).strip()) if m else (9999, name.strip())

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
                if os.path.isdir(subp) and not sub.startswith(".") and has_direct(subp):
                    files = imgs_direct(subp)
                    shoots.append({"key": f"{name}/{sub}", "title": parse_name(sub)[1],
                                   "count": len(files),
                                   "images": [{"file": f, "url": f"photos/{name}/{sub}/{f}"} for f in files]})
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
    magick = shutil.which("magick") or shutil.which("convert")
    if not magick:
        return
    try:
        r = subprocess.run([magick, "identify", "-format", "%[fx:max(w,h)]", path],
                           capture_output=True, text=True)
        dim = (r.stdout or "").strip()
        if dim.isdigit() and int(dim) > MAX:
            rel = os.path.relpath(path, PHOTOS)
            mp = os.path.join(MASTERS, rel)
            os.makedirs(os.path.dirname(mp), exist_ok=True)
            if not os.path.exists(mp):
                shutil.copy2(path, mp)
            subprocess.run([magick, path, "-auto-orient", "-resize", f"{MAX}x{MAX}>",
                            "-strip", "-quality", "82", path])
    except Exception:
        pass

def rebuild():
    out = subprocess.run(["python3", "build.py"], capture_output=True, text=True)
    return (out.returncode == 0, ((out.stdout or "") + (out.stderr or "")).strip()[-1200:])

def to_trash(full):
    stamp = time.strftime("%Y%m%d-%H%M%S")
    rel = os.path.relpath(full, PHOTOS)
    dest = os.path.join(TRASH, stamp, rel)
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    shutil.move(full, dest)
    return dest

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
    order = parse_name(os.path.basename(old))[0]
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

def act_new_folder(title, parent=None):
    base = safe_rel(parent) if parent else PHOTOS
    if not os.path.isdir(base):
        raise ValueError("nadřazená složka neexistuje")
    order = next_order(base)
    name = f"{order:02d} {title.strip()}"
    os.makedirs(os.path.join(base, name), exist_ok=False)

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
<title>JAVY — správa webu</title>
<style>
  *{box-sizing:border-box}
  body{margin:0;background:#0c0c0c;color:#fff;font-family:Arial,Helvetica,sans-serif}
  header{position:sticky;top:0;z-index:20;background:#0c0c0c;border-bottom:1px solid #262626;
         display:flex;align-items:center;gap:14px;padding:13px 22px;flex-wrap:wrap}
  header h1{font-size:15px;letter-spacing:.16em;text-transform:uppercase;margin:0;font-weight:700}
  header .hint{color:#8a8a8a;font-size:12px}
  .spacer{flex:1}
  input.txt{font:inherit;background:#161616;border:1px solid #333;color:#fff;padding:9px 11px;font-size:13px}
  button{font:inherit;font-weight:700;letter-spacing:.06em;text-transform:uppercase;font-size:11px;
         border:1px solid #444;background:#161616;color:#fff;padding:8px 12px;cursor:pointer}
  button.primary{background:#fff;color:#000;border-color:#fff}
  button:disabled{opacity:.4;cursor:default}
  button.mini{font-size:10px;padding:6px 9px}
  button.danger{border-color:#5a2020;color:#e88}
  #status{padding:6px 22px;color:#9ad;font-size:12px;min-height:18px;white-space:pre-line;border-bottom:1px solid #161616}
  ul#list{list-style:none;margin:0;padding:0}
  li.folder{border-bottom:1px solid #1c1c1c;background:#0c0c0c}
  li.folder.drag{opacity:.4}
  li.folder.over{border-top:2px solid #fff}
  .row{display:flex;align-items:center;gap:12px;padding:13px 22px}
  .grip{cursor:grab;color:#555;font-size:18px;user-select:none;width:16px;text-align:center}
  .grip:active{cursor:grabbing}
  .num{color:#555;font-size:12px;width:22px}
  .curthumb{width:44px;height:56px;object-fit:cover;filter:grayscale(1) contrast(1.2);background:#222}
  .fname{font-size:19px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
  .fmeta{color:#7a7a7a;font-size:12px;letter-spacing:.05em}
  .acts{margin-left:auto;display:flex;gap:6px;flex-wrap:wrap}
  .body{padding:0 22px 18px 50px;display:none}
  li.folder.open .body{display:block}
  .shoot-title{color:#9a9a9a;font-size:12px;letter-spacing:.12em;text-transform:uppercase;margin:10px 0 4px;display:flex;gap:10px;align-items:center}
  .grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:6px}
  .thumb{position:relative;aspect-ratio:3/4;background:#161616;cursor:pointer;overflow:hidden;border:2px solid transparent}
  .thumb img{width:100%;height:100%;object-fit:cover;filter:grayscale(1) contrast(1.15);display:block}
  .thumb:hover img{filter:none}
  .thumb .del{position:absolute;top:3px;right:3px;background:rgba(0,0,0,.6);border:0;color:#e88;font-size:11px;padding:3px 6px;opacity:0}
  .thumb:hover .del{opacity:1}
  .thumb.sel{border-color:#fff}
  .thumb.sel::after{content:"\2605 NÁHLED";position:absolute;left:0;right:0;bottom:0;background:#fff;color:#000;
                    font-size:10px;font-weight:700;letter-spacing:.08em;text-align:center;padding:3px 0}
  .drop{border:1px dashed #3a3a3a;padding:14px;text-align:center;color:#777;font-size:12px;margin:10px 0;cursor:pointer}
  .drop.hot{border-color:#fff;color:#fff;background:#141414}
  .empty-note{color:#666;font-size:12px;padding:4px 0}
</style></head><body>
<header>
  <h1>JAVY — správa webu</h1>
  <span class="hint">Přetáhni složky pro pořadí · rozbal pro fotky &amp; náhled</span>
  <span class="spacer"></span>
  <input class="txt" id="newName" placeholder="název nové složky">
  <button id="newBtn">+ nová složka</button>
</header>
<div id="status">Načítám…</div>
<ul id="list"></ul>
<script>
let DATA=[], COVERS={}, open=new Set(), dragIdx=null;
const $=s=>document.querySelector(s);
const enc=encodeURIComponent;
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function status(t){$('#status').textContent=t;}

function curCover(key,images){
  const sel=COVERS[key];
  if(sel){const h=images.find(im=>im.file===sel);if(h)return h;}
  return images[Math.min(2,images.length-1)];
}
function grid(key,images){
  const cur=images.length?curCover(key,images):null;
  return '<div class="grid">'+images.map(im=>
    '<div class="thumb'+(cur&&im.file===cur.file?' sel':'')+'" data-key="'+esc(key)+'" data-file="'+esc(im.file)+'">'+
    '<img loading="lazy" src="'+im.url+'" alt="">'+
    '<button class="del" data-delfolder="'+esc(key)+'" data-delfile="'+esc(im.file)+'">smazat</button>'+
    '</div>').join('')+'</div>';
}
function dropzone(folderKey){
  return '<div class="drop" data-drop="'+esc(folderKey)+'">+ přetáhni sem fotky (nebo klikni pro výběr)</div>';
}
function render(){
  const y=window.scrollY;
  $('#list').innerHTML=DATA.map((it,i)=>{
    const isOpen=open.has(it.key), opened=isOpen?' open':'';
    let head, body='';
    if(it.type==='shoot'){
      const cur=it.count?curCover(it.key,it.images):null;
      head='<img class="curthumb" src="'+(cur?cur.url:'')+'">'+
           '<div><div class="fname">'+esc(it.title)+'</div><div class="fmeta">'+it.count+' fotek</div></div>';
      if(isOpen) body=dropzone(it.key)+grid(it.key,it.images);
    }else if(it.type==='group'){
      head='<div class="curthumb" style="display:grid;place-items:center;color:#555;font-size:10px">SKUP.</div>'+
           '<div><div class="fname">'+esc(it.title)+'</div><div class="fmeta">skupina · '+it.shoots.length+' shootů</div></div>';
      if(isOpen) body=it.shoots.map(sh=>'<div class="shoot-title">'+esc(sh.title)+' · '+sh.count+' fotek</div>'+dropzone(sh.key)+grid(sh.key,sh.images)).join('');
    }else{
      head='<div class="curthumb" style="display:grid;place-items:center;color:#555;font-size:10px">—</div>'+
           '<div><div class="fname">'+esc(it.title)+'</div><div class="fmeta">prázdná</div></div>';
      if(isOpen) body='<div class="empty-note">Zatím žádné fotky.</div>'+dropzone(it.key);
    }
    return '<li class="folder'+opened+'" draggable="true" data-idx="'+i+'" data-key="'+esc(it.key)+'">'+
      '<div class="row">'+
        '<span class="grip">⠿</span><span class="num">'+String(i+1).padStart(2,'0')+'</span>'+head+
        '<div class="acts">'+
          '<button class="mini" data-toggle="'+esc(it.key)+'">'+(opened?'sbalit ▴':'fotky &amp; náhled ▾')+'</button>'+
          '<button class="mini" data-rename="'+esc(it.key)+'" data-title="'+esc(it.title)+'">přejmenovat</button>'+
          '<button class="mini danger" data-trash="'+esc(it.key)+'">smazat</button>'+
        '</div>'+
      '</div><div class="body">'+body+'</div></li>';
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
    if(!confirm('Přesunout fotku do koše?'))return;
    await post('/api/trash-photo',{folder:b.dataset.delfolder,name:b.dataset.delfile}); reload();
  });
  document.querySelectorAll('[data-rename]').forEach(b=>b.onclick=async()=>{
    const t=prompt('Nový název složky:',b.dataset.title); if(t==null||!t.trim())return;
    await post('/api/rename',{key:b.dataset.rename,title:t.trim()}); reload();
  });
  document.querySelectorAll('[data-trash]').forEach(b=>b.onclick=async()=>{
    if(!confirm('Přesunout celou složku „'+b.dataset.trash+'“ do koše?'))return;
    await post('/api/trash',{key:b.dataset.trash}); reload();
  });
  // drag reorder
  document.querySelectorAll('li.folder').forEach(li=>{
    li.ondragstart=e=>{dragIdx=+li.dataset.idx;li.classList.add('drag');e.dataTransfer.effectAllowed='move';};
    li.ondragend=()=>{li.classList.remove('drag');document.querySelectorAll('li.folder').forEach(x=>x.classList.remove('over'));};
    li.ondragover=e=>{e.preventDefault();li.classList.add('over');};
    li.ondragleave=()=>li.classList.remove('over');
    li.ondrop=async e=>{e.preventDefault();const to=+li.dataset.idx;
      if(dragIdx==null||dragIdx===to)return;
      const m=DATA.splice(dragIdx,1)[0];DATA.splice(to,0,m);dragIdx=null;render();
      status('Ukládám pořadí…');
      await post('/api/reorder',{order:DATA.map(x=>x.key)}); reload();
    };
  });
  // dropzones (upload)
  document.querySelectorAll('.drop').forEach(dz=>{
    const key=dz.dataset.drop;
    dz.onclick=()=>{const inp=document.createElement('input');inp.type='file';inp.multiple=true;inp.accept='image/*';
      inp.onchange=()=>uploadFiles(key,inp.files);inp.click();};
    dz.ondragover=e=>{e.preventDefault();dz.classList.add('hot');};
    dz.ondragleave=()=>dz.classList.remove('hot');
    dz.ondrop=e=>{e.preventDefault();dz.classList.remove('hot');uploadFiles(key,e.dataTransfer.files);};
  });
}

async function uploadFiles(folderKey,fileList){
  const files=[...fileList].filter(f=>/^image\//.test(f.type));
  if(!files.length)return;
  for(let i=0;i<files.length;i++){
    status('Nahrávám '+(i+1)+'/'+files.length+' do „'+folderKey+'“…');
    await fetch('/api/upload?folder='+enc(folderKey)+'&name='+enc(files[i].name),
      {method:'POST',headers:{'Content-Type':'application/octet-stream'},body:files[i]});
  }
  status('Zmenšuju a generuju…');
  await post('/api/rebuild',{}); reload();
}
async function post(path,obj){
  const r=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(obj)});
  const d=await r.json(); if(d&&d.log)status((d.ok?'✅ ':'⚠️ ')+d.log.split('\n').slice(-1)[0]); return d;
}
let coverT=null;
function saveCovers(){render();clearTimeout(coverT);coverT=setTimeout(async()=>{
  status('Ukládám náhledy…'); await post('/api/covers',{covers:COVERS});},400);}
async function reload(){
  const r=await fetch('/api/data'); const d=await r.json();
  DATA=d.items; COVERS=d.covers||{}; render();
  if(!/[✅⚠️]/.test($('#status').textContent)) status('Připraveno.');
}
$('#newBtn').onclick=async()=>{const t=$('#newName').value.trim();if(!t)return;
  await post('/api/new-folder',{title:t});$('#newName').value='';reload();};
$('#newName').addEventListener('keydown',e=>{if(e.key==='Enter')$('#newBtn').click();});
reload();
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

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/":
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if path == "/api/data":
            self._json({"items": scan(), "covers": load_covers()})
            return
        return super().do_GET()

    def do_POST(self):
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

            data = json.loads(self._body().decode("utf-8") or "{}")
            if path == "/api/covers":
                save_covers(data.get("covers", {}))
            elif path == "/api/reorder":
                act_reorder(data.get("order", []))
            elif path == "/api/rename":
                act_rename(data["key"], data["title"])
            elif path == "/api/new-folder":
                act_new_folder(data["title"], data.get("parent"))
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

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print("JAVY — správa webu běží na", url)
    print("Až budeš hotov/á, zavři tohle okno (Ctrl+C).")
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nKonec.")

if __name__ == "__main__":
    main()
