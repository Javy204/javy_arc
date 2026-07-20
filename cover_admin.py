#!/usr/bin/env python3
# Lokální klikací UI pro výběr náhledových (cover) fotek složek.
# Spouští se přes  vyber-nahledy.command  (dvojklik).
# Uloží výběr do photos/covers.json a rovnou přegeneruje manifest (build.py).

import os, re, json, subprocess, webbrowser, threading, time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PHOTOS = "photos"
IMG_EXT = (".jpg", ".jpeg", ".png", ".webp")
COVERS_FILE = os.path.join(PHOTOS, "covers.json")
PORT = 8765

def natkey(s):
    return [int(t) if t.isdigit() else t.lower() for t in re.split(r"(\d+)", s)]

def imgs_direct(folder):
    fs = [f for f in os.listdir(folder) if f.lower().endswith(IMG_EXT) and not f.startswith(".")]
    fs.sort(key=natkey)
    return fs

def has_direct(folder):
    return any(f.lower().endswith(IMG_EXT) and not f.startswith(".") for f in os.listdir(folder))

def scan():
    items = []
    for name in sorted(os.listdir(PHOTOS)):
        folder = os.path.join(PHOTOS, name)
        if not os.path.isdir(folder) or name.startswith(".") or name.startswith("_"):
            continue
        if has_direct(folder):
            files = imgs_direct(folder)
            if not files:
                continue
            items.append({"key": name, "title": name, "type": "shoot",
                          "images": [{"file": f, "url": f"photos/{name}/{f}"} for f in files]})
        else:
            shoots = []
            for sub in sorted(os.listdir(folder)):
                subp = os.path.join(folder, sub)
                if os.path.isdir(subp) and not sub.startswith(".") and has_direct(subp):
                    files = imgs_direct(subp)
                    shoots.append({"key": f"{name}/{sub}", "title": sub,
                                   "images": [{"file": f, "url": f"photos/{name}/{sub}/{f}"} for f in files]})
            if shoots:
                items.append({"key": name, "title": name, "type": "group", "shoots": shoots})
    return items

def load_covers():
    try:
        with open(COVERS_FILE, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {}

PAGE = """<!doctype html><html lang="cs"><head><meta charset="utf-8">
<title>JAVY — výběr náhledů</title>
<style>
  * { box-sizing: border-box; }
  body { margin:0; background:#0c0c0c; color:#fff; font-family:Arial,Helvetica,sans-serif; }
  header { position:sticky; top:0; z-index:10; background:#0c0c0c; border-bottom:1px solid #262626;
           display:flex; align-items:center; gap:16px; padding:14px 22px; }
  header h1 { font-size:15px; letter-spacing:.16em; text-transform:uppercase; margin:0; font-weight:700; }
  header .hint { color:#8a8a8a; font-size:12px; letter-spacing:.04em; }
  header .spacer { flex:1; }
  button.save { font:inherit; font-weight:700; letter-spacing:.14em; text-transform:uppercase; font-size:12px;
                background:#fff; color:#000; border:0; padding:11px 20px; cursor:pointer; }
  button.save:disabled { opacity:.5; cursor:default; }
  #status { padding:0 22px; color:#9ad; font-size:12px; min-height:18px; white-space:pre-line; }
  .folder { border-bottom:1px solid #1c1c1c; }
  .folder > summary { cursor:pointer; list-style:none; padding:16px 22px; display:flex; align-items:center; gap:14px; }
  .folder > summary::-webkit-details-marker { display:none; }
  .fname { font-size:20px; font-weight:700; text-transform:uppercase; letter-spacing:.04em; }
  .fmeta { color:#7a7a7a; font-size:12px; letter-spacing:.06em; }
  .curthumb { width:46px; height:60px; object-fit:cover; filter:grayscale(1) contrast(1.2); background:#222; margin-left:auto; }
  .curtxt { color:#666; font-size:11px; margin-left:auto; }
  .shoot-title { padding:6px 22px 2px; color:#9a9a9a; font-size:12px; letter-spacing:.14em; text-transform:uppercase; }
  .grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(120px,1fr)); gap:6px; padding:8px 22px 22px; }
  .thumb { position:relative; aspect-ratio:3/4; background:#161616; cursor:pointer; overflow:hidden; border:2px solid transparent; }
  .thumb img { width:100%; height:100%; object-fit:cover; filter:grayscale(1) contrast(1.15); display:block; }
  .thumb:hover img { filter:none; }
  .thumb.sel { border-color:#fff; }
  .thumb.sel::after { content:"★ NÁHLED"; position:absolute; left:0; bottom:0; right:0; background:#fff; color:#000;
                      font-size:10px; font-weight:700; letter-spacing:.1em; text-align:center; padding:3px 0; }
  .empty { padding:22px; color:#666; }
</style></head><body>
<header>
  <h1>JAVY — výběr náhledů</h1>
  <span class="hint">Rozbal složku → klikni na fotku, která má být náhled.</span>
  <span class="spacer"></span>
  <button class="save" id="save">Uložit vše</button>
</header>
<div id="status"></div>
<div id="list"><div class="empty">Načítám…</div></div>
<script>
let DATA=[], COVERS={}, dirty=false;
const $=s=>document.querySelector(s);
function basename(u){ return decodeURIComponent(u.split('/').pop()); }
function curCover(key, images){
  const sel = COVERS[key];
  if(sel){ const hit = images.find(im=>im.file===sel); if(hit) return hit; }
  return images[Math.min(2, images.length-1)]; // default = 3. fotka
}
function pick(key, file){ COVERS[key]=file; dirty=true; render(); $('#save').disabled=false; }
function grid(key, images){
  const cur = curCover(key, images);
  return '<div class="grid">'+images.map(im=>
    '<div class="thumb'+(im.file===cur.file?' sel':'')+'" onclick="pick(\\''+key.replace(/'/g,"\\\\'")+'\\',\\''+im.file.replace(/'/g,"\\\\'")+'\\')">'+
    '<img loading="lazy" src="'+im.url+'" alt=""></div>').join('')+'</div>';
}
function render(){
  const scrollY=window.scrollY;
  $('#list').innerHTML = DATA.map(it=>{
    if(it.type==='shoot'){
      const cur=curCover(it.key,it.images);
      return '<details class="folder"><summary>'+
        '<span class="fname">'+it.title+'</span>'+
        '<span class="fmeta">'+it.images.length+' fotek</span>'+
        '<img class="curthumb" src="'+cur.url+'"></summary>'+ grid(it.key,it.images) +'</details>';
    }
    // skupina
    const body = it.shoots.map(sh=>{
      const cur=curCover(sh.key,sh.images);
      return '<div class="shoot-title">'+sh.title+'  ·  '+sh.images.length+' fotek</div>'+ grid(sh.key,sh.images);
    }).join('');
    return '<details class="folder"><summary>'+
      '<span class="fname">'+it.title+'</span>'+
      '<span class="fmeta">skupina · '+it.shoots.length+' shootů</span>'+
      '<span class="curtxt">rozbal a vyber náhled u každého shootu</span></summary>'+ body +'</details>';
  }).join('');
  window.scrollTo(0,scrollY);
}
async function load(){
  const r=await fetch('/api/data'); const d=await r.json();
  DATA=d.items; COVERS=d.covers||{}; render(); $('#save').disabled=true;
}
$('#save').addEventListener('click', async ()=>{
  $('#save').disabled=true; $('#status').textContent='Ukládám a generuju…';
  const r=await fetch('/api/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({covers:COVERS})});
  const d=await r.json();
  $('#status').textContent = (d.ok?'✅ Uloženo. ':'⚠️ Chyba. ')+(d.log||'');
  dirty=false;
});
window.addEventListener('beforeunload', e=>{ if(dirty){ e.preventDefault(); e.returnValue=''; } });
load();
</script></body></html>"""

class Handler(SimpleHTTPRequestHandler):
    def _json(self, obj, code=200):
        body = json.dumps(obj, ensure_ascii=False).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self):
        if self.path == "/" or self.path.startswith("/?"):
            body = PAGE.encode("utf-8")
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        if self.path == "/api/data":
            self._json({"items": scan(), "covers": load_covers()})
            return
        return super().do_GET()

    def do_POST(self):
        if self.path != "/api/save":
            self.send_error(404); return
        n = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(n).decode("utf-8"))
            covers = payload.get("covers", {})
            covers = {k: v for k, v in covers.items() if v}   # vyhoď prázdné
            with open(COVERS_FILE, "w", encoding="utf-8") as f:
                json.dump(covers, f, ensure_ascii=False, indent=2)
            out = subprocess.run(["python3", "build.py"], capture_output=True, text=True)
            log = (out.stdout or "") + (out.stderr or "")
            self._json({"ok": out.returncode == 0, "log": log.strip()[-800:]})
        except Exception as e:
            self._json({"ok": False, "log": str(e)}, 500)

    def log_message(self, *a):
        pass   # ticho v konzoli

def main():
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    httpd = ThreadingHTTPServer(("127.0.0.1", PORT), Handler)
    url = f"http://127.0.0.1:{PORT}/"
    print("JAVY — výběr náhledů běží na", url)
    print("Vyber náhledy v prohlížeči, dej Uložit. Až budeš hotov/á, zavři toto okno (Ctrl+C).")
    threading.Timer(0.7, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nKonec.")

if __name__ == "__main__":
    main()
