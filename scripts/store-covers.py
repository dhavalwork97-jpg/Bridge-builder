"""Compose store covers from store/shots/*.png. Title text only (CrazyGames rules: no borders, no
badges/'Play' text, no store logos). Output: store/covers/*.png. Usage: python3 scripts/store-covers.py"""
import os
from playwright.sync_api import sync_playwright

TITLE = ('BRIDGE', 'BUILDER')
HERO = os.path.abspath('store/shots/cable-stayed-l15.png')
# (file, w, h, background-position-x in %, bg zoom (% of shot width), title size px, title top %)
COVERS = [('cover-landscape-1920x1080', 1920, 1080, 50, 100, 190, 5),
          ('cover-portrait-800x1200', 800, 1200, 61, 100, 150, 5),
          ('cover-square-800x800', 800, 800, 52, 160, 125, 4)]

HTML = """<!doctype html><meta charset=utf-8><style>
html,body{margin:0;width:%(w)dpx;height:%(h)dpx;overflow:hidden}
.bg{position:absolute;inset:0;background:url('file://%(hero)s') %(px)s%% 100%%/auto %(zoom)s%% no-repeat;}
.shade{position:absolute;inset:0;background:linear-gradient(180deg,rgba(18,22,52,.55) 0%%,rgba(18,22,52,.0) 42%%)}
h1{position:absolute;left:0;right:0;top:%(top)s%%;margin:0;text-align:center;font:800 %(fs)dpx/0.92 Poppins,Inter,sans-serif;
 letter-spacing:.02em;color:#ffd166;text-shadow:0 6px 0 #b4561c,0 10px 24px rgba(0,0,0,.45);text-transform:uppercase}
h1 span{display:block;color:#fff;text-shadow:0 6px 0 #3b4a8a,0 10px 24px rgba(0,0,0,.45)}
</style><div class=bg></div><div class=shade></div><h1>%(a)s<span>%(b)s</span></h1>"""

os.makedirs('store/covers', exist_ok=True)
with sync_playwright() as p:
    b = p.chromium.launch()
    for name, w, h, px, zoom, fs, top in COVERS:
        pg = b.new_page(viewport={'width': w, 'height': h})
        # zoom is relative to the viewport height-fit: size the bg by height so the bridge stays large
        html = HTML % dict(w=w, h=h, hero=HERO, px=px, zoom=zoom, fs=fs, top=top, a=TITLE[0], b=TITLE[1])
        if w == 1920:  # landscape: plain cover fit
            html = html.replace("auto %d%%" % zoom, "cover")
        tmp = os.path.abspath(f'store/.tmp-{name}.html'); open(tmp, 'w').write(html); pg.goto('file://' + tmp); pg.wait_for_timeout(500); os.remove(tmp)
        pg.screenshot(path=f'store/covers/{name}.png'); print('saved', name)
    b.close()
