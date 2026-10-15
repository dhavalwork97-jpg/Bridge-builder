"""Record the CrazyGames preview videos from the real game (vite dev server on :5199).
Headless software rendering is far slower than real time, so the page clock is virtual: requestAnimationFrame and
performance.now are replaced and stepped 1/30 s per captured frame, giving true-speed motion (no fast-forward).
Plays two verified reference solutions crossing, UI hidden, no sound, no cursor.
Output: store/video/preview-landscape-1920x1080.mp4 and preview-portrait-1080x1620.mp4 (<= 20 s, no audio)
Usage: npx vite --port 5199 & python3 scripts/store-video.py   (needs ffmpeg)"""
import os, shutil, subprocess
from playwright.sync_api import sync_playwright

URL = 'http://localhost:5199/'
HIDE = '#hud,#toolbar,#testbar,#rotate,#toast{visibility:hidden !important} .screen{display:none !important}'
OUT = 'store/video'
TMP = '/tmp/claude-0/preview-frames'
FPS = 30
CLIPS = [15, 16]            # cable-stayed, two pylons
SETTLE_FRAMES = 20          # parked-vehicle build frame before the test starts
MAX_CLIP_FRAMES = 290       # 2 x ~9.7 s => under the 20 s limit

VCLOCK = """(() => {
  let t = 0, q = [];
  window.__vt = { step(dt) { t += dt; const cbs = q; q = []; cbs.forEach((cb) => cb(t)); } };
  window.requestAnimationFrame = (cb) => { q.push(cb); return q.length; };
  window.cancelAnimationFrame = () => {};
  performance.now = () => t;
})();"""

LOAD = """async (id) => {
  const L = await import('/src/levels/levels.ts');
  const S = await import('/src/levels/solutions.ts');
  const g = window.__bb;
  const lvl = L.LEVELS[id - 1];
  g.store.data.levels = Object.fromEntries(Array.from({length: 30}, (_, i) => [String(i + 1), {stars: 3, bestCost: 1}]));
  g.startLevel(lvl);
  const { graph, errors } = S.buildSolution(lvl, S.SOLUTIONS[id]);
  g.graph = graph; g.ctrl.setGraph(graph);
  g.mode = 'build'; g.layout();
  return errors;
}"""

def record(name, w, h):
    shutil.rmtree(TMP, ignore_errors=True); os.makedirs(TMP)
    n = 0
    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'])
        ctx = b.new_context(viewport={'width': w, 'height': h})
        page = ctx.new_page()
        page.add_init_script(VCLOCK)
        page.on('pageerror', lambda e: print('PAGEERROR', e))
        page.goto(URL); page.wait_for_timeout(500)
        page.add_style_tag(content=HIDE)

        def step(capture):
            nonlocal n
            page.evaluate(f'window.__vt.step({1000 / FPS})')
            if capture:
                page.screenshot(path=f'{TMP}/f{n:05d}.jpg', type='jpeg', quality=95); n += 1

        for _ in range(5): step(False)
        for lvl in CLIPS:
            errs = page.evaluate(LOAD, lvl); assert not errs, errs
            for _ in range(5): step(False)                 # let layout / scenery settle uncaptured
            for _ in range(SETTLE_FRAMES): step(True)
            page.evaluate('window.__bb.startTest()')
            for i in range(MAX_CLIP_FRAMES - SETTLE_FRAMES):
                step(True)
                if page.evaluate('window.__bb.qa().progress') >= 0.99: break
            for _ in range(8): step(True)                  # brief tail on the far bank
            print('clip', lvl, 'frames so far', n, '=', round(n / FPS, 1), 's')
        b.close()
    os.makedirs(OUT, exist_ok=True)
    dest = f'{OUT}/{name}.mp4'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-framerate', str(FPS), '-i', f'{TMP}/f%05d.jpg', '-an',
                    '-c:v', 'libx264', '-crf', '16', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', dest], check=True)
    print('saved', dest, round(os.path.getsize(dest) / 1e6, 2), 'MB', round(n / FPS, 1), 's')

record('preview-landscape-1920x1080', 1920, 1080)
record('preview-portrait-1080x1620', 1080, 1620)
