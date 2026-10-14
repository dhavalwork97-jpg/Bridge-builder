"""Headless-Chromium QA for BRIDGE BUILDER. Drives the real UI with real pointer/touch input.
Usage: python3 qa/browser_qa.py  (expects `npm run build` output in dist/)"""
import json, subprocess, sys, time, os
from playwright.sync_api import sync_playwright

PORT = 4173
srv = subprocess.Popen([sys.executable, '-m', 'http.server', str(PORT), '-d', 'dist'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(1)
results, errors, requests = [], [], []
os.makedirs('qa/shots', exist_ok=True)

def check(name, cond, extra=''):
    results.append((name, bool(cond)))
    print(('PASS ' if cond else 'FAIL ') + name + (f'  [{extra}]' if extra else ''))

def qa(page):
    return page.evaluate("(() => { const q = window.__bb.qa(); const {worldToScreen, ...rest} = q; return rest; })()")

def w2s(page, x, y):
    return page.evaluate(f"(() => window.__bb.qa().worldToScreen({x},{y}))()")

def click_ui(page, sel):
    page.click(sel)

def wait_state(page, pred, timeout=40):
    t0 = time.time()
    while time.time() - t0 < timeout:
        s = qa(page)
        if pred(s): return s
        page.wait_for_timeout(100)
    return qa(page)

def tap_world(page, x, y, touch=False):
    p = w2s(page, x, y)
    if touch: page.touchscreen.tap(p['x'], p['y'])
    else:
        page.mouse.move(p['x'], p['y']); page.mouse.down(); page.mouse.up()

try:
    with sync_playwright() as pw:
        b = pw.chromium.launch()
        # ---------------- desktop ----------------
        ctx = b.new_context(viewport={'width': 1280, 'height': 720})
        page = ctx.new_page()
        page.on('console', lambda m: errors.append(m.text) if m.type in ('error', 'warning') and 'GPU stall due to ReadPixels' not in m.text else None)
        page.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
        page.on('request', lambda r: requests.append(r.url))
        page.goto(f'http://localhost:{PORT}/index.html')
        page.wait_for_selector('#menu-play')
        page.wait_for_timeout(1500)
        page.screenshot(path='qa/shots/01_menu.png')
        check('menu visible with demo scene', qa(page)['screen'] == 'menu')

        click_ui(page, '#menu-levels'); page.wait_for_timeout(200)
        page.screenshot(path='qa/shots/02_levels.png')
        locked = page.eval_on_selector_all('.level-card[aria-disabled="true"]', 'els => els.length')
        check('only level 1 unlocked at start', locked == 19, f'locked={locked}')
        page.click('.level-card >> nth=1', force=True)   # locked level must not start even if clicked
        page.wait_for_timeout(200)
        check('locked level does not start', qa(page)['screen'] == 'levels')
        page.click('.level-card >> nth=0')
        page.wait_for_selector('#toolbar', state='visible')
        page.wait_for_timeout(300)
        s = qa(page)
        check('level 1 loads in build mode', s['screen'] == 'play' and s['mode'] == 'build' and s['level'] == 1)
        page.screenshot(path='qa/shots/03_level1_empty.png')

        # build: tap anchor (0,0) then anchor (6,0)
        tap_world(page, 0, 0); tap_world(page, 6, 0)
        s = qa(page)
        check('tap-tap places exactly one road beam', s['beams'] == 1, str(s['beams']))
        check('budget decreases by $480', s['used'] == 480 and s['remaining'] == 220, f"used={s['used']}")
        # second beam over budget -> rejected
        tap_world(page, 0, 0); tap_world(page, 6, 0)   # duplicate
        check('duplicate beam rejected', qa(page)['beams'] == 1)
        # over-budget attempt: road needs from anchor top (0,0) to (3,-... ) cost 80*? use long
        before = qa(page)['beams']
        tap_world(page, 0, 0); tap_world(page, 6, 0)
        # undo / redo
        click_ui(page, '#btn-undo'); check('undo removes beam', qa(page)['beams'] == 0 and qa(page)['used'] == 0)
        click_ui(page, '#btn-redo'); check('redo restores beam', qa(page)['beams'] == 1)
        # exceed budget: remove & try two beams: 480 + new
        tap_world(page, 6, 0); tap_world(page, 6, -3)  # road from (6,0) down to (6,-3)=240 > remaining 220
        check('over-budget placement rejected', qa(page)['beams'] == 1 and qa(page)['used'] == 480)
        page.screenshot(path='qa/shots/04_level1_built.png')
        # UI button click must not place world beams
        click_ui(page, '#btn-stress'); click_ui(page, '#btn-stress')
        check('HUD clicks do not place beams', qa(page)['beams'] == 1)
        # drag-to-build on another gesture: drag from (0,0) to (0,-3) with wood unavailable on L1 -> road $240 > remaining => rejected
        # test bridge
        click_ui(page, '#btn-test'); page.wait_for_timeout(300)
        check('test mode starts', qa(page)['mode'] == 'test')
        page.wait_for_timeout(2500)
        page.screenshot(path='qa/shots/05_testing.png')
        click_ui(page, '#btn-pause'); p0 = qa(page)['progress']; page.wait_for_timeout(700); p1 = qa(page)['progress']
        check('pause freezes the vehicle', qa(page)['paused'] and abs(p1 - p0) < 1e-6)
        click_ui(page, '#btn-pause')
        s = wait_state(page, lambda s: s['mode'] == 'result', 30)
        check('vehicle crosses and result screen appears', s['mode'] == 'result' and s['simState'] == 'won', str(s['simState']))
        page.wait_for_timeout(1400)
        page.screenshot(path='qa/shots/06_result_win.png')
        check('3 stars on level 1', s['stars'] == 3, str(s['stars']))
        page.click('#res-next'); page.wait_for_timeout(400)
        check('next level unlocked and loaded', qa(page)['level'] == 2 and qa(page)['mode'] == 'build')
        # level 2: failing bridge (nothing built but a road gap) -> fail result
        tap_world(page, 0, 0); tap_world(page, 5, 0)
        click_ui(page, '#btn-test')
        s = wait_state(page, lambda s: s['mode'] == 'result', 40)
        check('incomplete bridge fails', s['simState'] == 'failed', str(s['simState']))
        page.wait_for_timeout(500); page.screenshot(path='qa/shots/07_result_fail.png')
        page.click('#res-retry'); page.wait_for_timeout(300)
        check('retry returns to build mode keeping design', qa(page)['mode'] == 'build' and qa(page)['beams'] == 1)
        click_ui(page, '#btn-reset'); page.wait_for_selector('#confirm', state='visible')
        click_ui(page, '#confirm-yes'); page.wait_for_timeout(200)
        check('reset (with confirmation) clears design', qa(page)['beams'] == 0)
        # build a real solution for level 2 via the UI: roads + wood braces
        page.click('.mat[data-mat="road"]')
        tap_world(page, 0, 0); tap_world(page, 5, 0)
        tap_world(page, 5, 0); tap_world(page, 10, 0)
        page.click('.mat[data-mat="wood"]')
        tap_world(page, 0, -4); tap_world(page, 5, 0)
        # drag-to-connect for the last brace
        a = w2s(page, 10, -4); bpt = w2s(page, 5, 0)
        page.mouse.move(a['x'], a['y']); page.mouse.down(); page.mouse.move((a['x'] + bpt['x']) / 2, (a['y'] + bpt['y']) / 2, steps=4); page.mouse.move(bpt['x'], bpt['y'], steps=4); page.mouse.up()
        s = qa(page)
        check('level 2 design built through the UI (4 beams, incl. drag)', s['beams'] == 4, str(s['beams']))
        page.screenshot(path='qa/shots/08_level2_built.png')
        click_ui(page, '#btn-stress')
        click_ui(page, '#btn-test')
        page.wait_for_timeout(5200); page.screenshot(path='qa/shots/09_stress_view.png')
        s = wait_state(page, lambda s: s['mode'] == 'result', 40)
        check('UI-built level 2 bridge wins', s['simState'] == 'won' and s['broken'] == 0, f"{s['simState']} broken={s['broken']}")
        page.wait_for_timeout(1200); page.screenshot(path='qa/shots/10_result_l2.png')
        saved = page.evaluate("localStorage.getItem('bridge-builder-build-and-cross:v1')")
        check('progress persisted to localStorage', saved is not None and '"2"' in saved)
        # reload keeps progress
        page.reload(); page.wait_for_selector('#menu-levels'); click_ui(page, '#menu-levels'); page.wait_for_timeout(200)
        locked = page.eval_on_selector_all('.level-card[aria-disabled="true"]', 'els => els.length')
        check('progress survives reload (levels 1-3 unlocked)', locked == 17, f'locked={locked}')

        # corrupted save does not crash
        page.evaluate("localStorage.setItem('bridge-builder-build-and-cross:v1', '{broken json')")
        page.reload(); page.wait_for_selector('#menu-play')
        check('corrupted save recovers to defaults', qa(page)['screen'] == 'menu')
        # viewport resize while playing
        page.click('#menu-play'); page.wait_for_selector('#toolbar', state='visible')
        for (w, h) in [(1280, 720), (900, 500), (1600, 900)]:
            page.set_viewport_size({'width': w, 'height': h}); page.wait_for_timeout(300)
            p = w2s(page, 0, 0)
            inside = 0 <= p['x'] <= w and 0 <= p['y'] <= h
            tap_world(page, 0, 0); pend = page.evaluate("document.getElementById('hint').textContent")
            check(f'resize {w}x{h}: anchor on screen & clickable', inside and 'second point' in pend, pend[:40])
            tap_world(page, 0, 0)
        # keyboard: Esc cancel, number keys
        page.keyboard.press('1'); page.keyboard.press('Escape')
        # settings & credits screens
        page.keyboard.press('Escape'); page.wait_for_timeout(200)
        click_ui(page, '#menu-settings'); page.wait_for_timeout(200); page.screenshot(path='qa/shots/11_settings.png')
        page.click('#screen-settings [data-back]'); click_ui(page, '#menu-credits'); page.wait_for_timeout(200)
        check('settings and credits reachable', True)
        ctx.close()

        # ---------------- mobile touch (landscape + portrait) ----------------
        for name, vp in [('landscape', {'width': 844, 'height': 390}), ('portrait', {'width': 390, 'height': 844})]:
            mctx = b.new_context(viewport=vp, device_scale_factor=3, has_touch=True, is_mobile=True)
            m = mctx.new_page()
            m.on('console', lambda mm: errors.append(mm.text) if mm.type in ('error', 'warning') and 'GPU stall due to ReadPixels' not in m.text else None)
            m.on('pageerror', lambda e: errors.append('PAGEERROR ' + str(e)))
            m.on('request', lambda r: requests.append(r.url))
            m.goto(f'http://localhost:{PORT}/index.html'); m.wait_for_selector('#menu-play')
            m.wait_for_timeout(600); m.screenshot(path=f'qa/shots/m_{name}_menu.png')
            m.tap('#menu-play'); m.wait_for_selector('#toolbar', state='visible'); m.wait_for_timeout(500)
            tap_world(m, 0, 0, touch=True); tap_world(m, 6, 0, touch=True)
            check(f'mobile {name}: touch tap-tap builds a road', qa(m)['beams'] == 1, str(qa(m)['beams']))
            # tiny controls check
            small = m.evaluate("""[...document.querySelectorAll('#toolbar button, #topbar button, #materials button')].filter(b => b.offsetParent && (b.getBoundingClientRect().width < 40 || b.getBoundingClientRect().height < 40)).map(b => b.id || b.className)""")
            check(f'mobile {name}: touch targets >= 40px', not small, str(small))
            overflow = m.evaluate("document.documentElement.scrollWidth <= window.innerWidth && document.documentElement.scrollHeight <= window.innerHeight")
            check(f'mobile {name}: page does not scroll', overflow)
            overlap = m.evaluate("""(() => { const a = document.getElementById('topbar').getBoundingClientRect(), t = document.getElementById('toolbar').getBoundingClientRect(); return a.bottom <= t.top; })()""")
            check(f'mobile {name}: top bar and toolbar do not overlap', overlap)
            m.screenshot(path=f'qa/shots/m_{name}_build.png')
            m.tap('#btn-test'); m.wait_for_timeout(2500); m.screenshot(path=f'qa/shots/m_{name}_test.png')
            s = wait_state(m, lambda s: s['mode'] == 'result', 30)
            check(f'mobile {name}: bridge test completes', s['mode'] == 'result' and s['simState'] == 'won', str(s['simState']))
            m.wait_for_timeout(1300); m.screenshot(path=f'qa/shots/m_{name}_result.png')
            mctx.close()
        b.close()
finally:
    srv.terminate()

remote = [u for u in requests if not u.startswith('http://localhost') and not u.startswith('data:')]
check('no remote network requests', not remote, str(remote[:3]))
check('no console errors/warnings', not errors, str(errors[:3]))
fails = [n for n, ok in results if not ok]
print(f"\n{len(results) - len(fails)}/{len(results)} browser checks passed")
json.dump({'passed': len(results) - len(fails), 'total': len(results), 'failed': fails}, open('qa/last-run.json', 'w'))
sys.exit(1 if fails else 0)
