"""Capture marketing screenshots from the real game (vite dev server on :5199) by loading each
level's verified reference solution. Output: store/shots/*.png (3840x2160 @2x, UI hidden).
Usage: npx vite --port 5199 & python3 scripts/store-shots.py"""
import sys
from playwright.sync_api import sync_playwright

URL = 'http://localhost:5199/'
HIDE = '#hud,#toolbar,#testbar,#rotate,#toast{visibility:hidden !important}'

LOAD = """async (id) => {
  const L = await import('/src/levels/levels.ts');
  const S = await import('/src/levels/solutions.ts');
  const g = window.__bb;
  const lvl = L.LEVELS[id - 1];
  g.store.data.levels = Object.fromEntries(Array.from({length: 20}, (_, i) => [String(i + 1), {stars: 3, bestCost: 1}]));
  g.startLevel(lvl);
  const { graph, errors } = S.buildSolution(lvl, S.SOLUTIONS[id]);
  g.graph = graph; g.ctrl.setGraph(graph);
  // tight marketing framing: the bridge fills the frame instead of the whole gorge
  const ba = lvl.buildArea, W = lvl.goalX - 6;
  g.mode = 'build'; g.layout();
  g.cam.fit({ minX: -9, maxX: W + 9, minY: ba.minY + 2.5, maxY: ba.maxY + 3.5 }, g.w, g.h, { top: 0, bottom: 0, left: 0, right: 0 });
  g.scenery.build(g.cam, g.w, g.h, g.dpr);
  return errors;
}"""

def shot(page, name, level, progress=None, stress=False, wait_ms=0):
    errs = page.evaluate(LOAD, level)
    assert not errs, errs
    page.evaluate("window.__bb.stressView = %s" % ('true' if stress else 'false'))
    if progress is None:
        page.wait_for_timeout(600)           # build mode: parked vehicle
    else:
        page.evaluate("window.__bb.startTest()")
        for _ in range(400):
            page.wait_for_timeout(50)
            if page.evaluate("window.__bb.qa().progress") >= progress: break
        page.evaluate("window.__bb.paused = true")   # freeze the frame
    page.wait_for_timeout(wait_ms + 200)
    page.screenshot(path=f'store/shots/{name}.png')
    print('saved', name)

with sync_playwright() as p:
    b = p.chromium.launch()
    ctx = b.new_context(viewport={'width': 1920, 'height': 1080}, device_scale_factor=2)
    page = ctx.new_page()
    page.on('pageerror', lambda e: print('PAGEERROR', e))
    page.goto(URL); page.wait_for_timeout(800)
    page.add_style_tag(content=HIDE)
    only = sys.argv[1:]
    if only == ['sheet']:
        for l in range(1, 21): shot(page, f'sheet-{l:02d}', l, 0.5)
        b.close(); sys.exit()
    jobs = [('cable-stayed-l15', 15, 0.5, False), ('two-pylons-l16', 16, 0.45, False),
            ('three-spans-l10', 10, 0.5, False), ('island-l07', 7, 0.5, False),
            ('tower-l12', 12, 0.5, False), ('heavy-haul-l19', 19, 0.5, False),
            ('stress-l15', 15, 0.5, True), ('build-l12', 12, None, False)]
    for name, lvl, prog, stress in jobs:
        if only and name not in only: continue
        shot(page, name, lvl, prog, stress)
    b.close()
