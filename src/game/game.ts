import { BUILD, GAME, MATERIALS, MATERIAL_ORDER, PHYSICS, VEHICLES } from '../config';
import { LEVELS } from '../levels/levels';
import { SOLUTIONS, buildSolution } from '../levels/solutions';
import { Synth } from '../audio/synth';
import { createAdapter, type PlatformAdapter } from '../platform/adapter';
import { drawBeamHighlight, drawNodeRing, type DrawBeam } from '../render/entities';
import { Particles } from '../render/particles';
import { Stage3D, type StageNode } from '../render/stage3d';
import { analyzeStructure } from '../sim/analysis';
import { BridgeGraph, REJECT_TEXT, type RejectReason } from '../sim/graph';
import { Simulation } from '../sim/solver';
import { groundHeightAt, isInsideTerrain } from '../sim/terrain';
import type { LevelDef, MaterialId } from '../types';
import { StageCamera } from './stagecamera';
import { ConstructionController } from './construction';
import { FixedStepper } from './loop';
import { SaveStore } from './save';
import { countMaterials, evaluate, type Evaluation, type RunSummary } from './scoring';

type Screen = 'menu' | 'levels' | 'settings' | 'credits' | 'play';
type Mode = 'build' | 'test' | 'result';

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => document.getElementById(id) as T;
const money = (n: number): string => '$' + Math.round(n).toLocaleString('en-US');
const FAIL_TEXT: Record<string, string> = {
  flood: 'The flood overtook the supply truck. Launch sooner or simplify the bridge.', fell: 'The vehicle fell into the gorge.', stuck: 'The vehicle got stuck.', flipped: 'The vehicle flipped over.',
  timeout: 'The vehicle took too long.', numeric: 'The simulation became unstable.',
};
const STAR_PATH = 'M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6L2.5 9.4l6.6-.8z';

export class Game {
  private canvas = $<HTMLCanvasElement>('game');
  private ctx = this.canvas.getContext('2d')!;
  private cam = new StageCamera();
  private stage = new Stage3D($<HTMLCanvasElement>('gl'));
  private adapter: PlatformAdapter = createAdapter();
  // Platforms that own persistence (YouTube Playables) must not touch localStorage.
  private store = new SaveStore(LEVELS.length, this.adapter.usesPlatformSave ? null : undefined);
  private synth = new Synth();
  private particles = new Particles();
  private stepper = new FixedStepper();

  private screen: Screen = 'menu';
  private mode: Mode = 'build';
  private level: LevelDef = LEVELS[0];
  private graph = new BridgeGraph(LEVELS[0]);
  private ctrl: ConstructionController;
  private idle!: Simulation;       // supplies the parked vehicle pose in build mode
  private sim: Simulation | null = null;
  private demo: Simulation | null = null;
  private demoRestart = 0;

  private w = 0; private h = 0; private dpr = 1;
  private paused = false;
  private speed = 1;
  private time = 0;
  private last = 0;
  private endTimer = 0;
  private resultShown = false;
  private shake = 0;
  private dustTimer = 0;
  private lastProgress = -1;
  private toastTimer = 0;
  private hintOverride = '';
  private hintOverrideUntil = 0;
  private levelHintActive = true;
  private rotateDismissed = false;
  private pendingConfirm: (() => void) | null = null;
  private lastEval: Evaluation | null = null;
  private hoverNodeId: number | null = null;
  private beamPool: DrawBeam[] = [];
  private resizeQueued = false;
  private debug = /[?&]debug\b/.test(location.search);
  private frameMs = 16; private simMs = 0;
  private stressView = false;
  private floodlineActive = false;
  private floodHudSecond = -1;

  constructor() {
    this.ctrl = new ConstructionController(this.graph, this.cam, {
      onChange: () => this.onGraphChanged(),
      onPlaced: () => this.synth.place(),
      onRejected: (r) => this.reject(r),
      onSelect: () => { this.synth.select(); this.updateHud(); },
    });
    this.idle = new Simulation(this.level, [], []);
  }

  // ------------------------------------------------------------------ boot
  start(): void {
    this.adapter.loadingStart();
    const s = this.store.data.settings;
    this.synth.setMuted(s.muted);
    this.stressView = s.stressView;
    this.particles.reduced = s.reduceMotion;
    const platformReady = this.adapter.init({
      onPause: () => this.autoPause(),
      onResume: () => { /* player resumes manually */ },
      onMuteChange: (m) => { this.synth.setMuted(m); this.syncSettingsUi(); },
    }).then(() => this.hydratePlatformSave());
    this.buildStaticUi();
    this.bindEvents();
    this.loadDemo();
    this.setLevelContext(LEVELS[11], false);
    this.showScreen('menu');
    this.layout();
    if (this.adapter.usesPlatformSave) void platformReady.then(() => this.adapter.loadingStop());
    else this.adapter.loadingStop();
    requestAnimationFrame((t) => { this.last = t; this.adapter.firstFrameReady(); this.frame(t); });
  }

  /** Load progress from the platform's own save API (Playables), then refresh whatever is on screen. */
  private async hydratePlatformSave(): Promise<void> {
    if (!this.adapter.usesPlatformSave) return;
    this.store.useExternal((j) => this.adapter.writeSave(j));
    this.store.hydrate(await this.adapter.loadSave());
    const s = this.store.data.settings;
    this.stressView = s.stressView;
    this.particles.reduced = s.reduceMotion;
    this.syncSettingsUi();
    if (this.screen === 'menu') $('menu-stars').textContent = `\u2605 ${this.store.totalStars()} / ${LEVELS.length * 3}`;
    if (this.screen === 'levels') this.renderLevelGrid();
  }

  private buildStaticUi(): void {
    $('logo').innerHTML = `<svg viewBox="0 0 320 110" aria-hidden="true"><defs><linearGradient id="lg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffd166"/><stop offset="1" stop-color="#fca311"/></linearGradient></defs>
      <path d="M10 78H310" stroke="#3b4a6e" stroke-width="9" stroke-linecap="round"/>
      <path d="M30 78Q160 -22 290 78" stroke="url(#lg)" stroke-width="7" fill="none" stroke-linecap="round"/>
      ${[60, 90, 120, 150, 180, 210, 240].map((x) => { const t = (x - 30) / 260; const y = 78 - 4 * 50 * t * (1 - t) * 1.0 * 1.6; return `<line x1="${x}" y1="${78}" x2="${x}" y2="${y.toFixed(1)}" stroke="#ffd166" stroke-width="3"/>`; }).join('')}
      <rect x="140" y="62" width="40" height="14" rx="4" fill="#e8553d"/><rect x="164" y="54" width="18" height="14" rx="4" fill="#e8553d"/><circle cx="150" cy="78" r="6" fill="#16181d"/><circle cx="174" cy="78" r="6" fill="#16181d"/></svg>`;
    this.renderMaterialButtons();
  }

  private renderMaterialButtons(): void {
    const box = $('materials');
    box.innerHTML = '';
    for (const id of MATERIAL_ORDER) {
      if (!this.level.materials.includes(id)) continue;
      const m = MATERIALS[id];
      const b = document.createElement('button');
      b.className = 'mat'; b.type = 'button'; b.dataset.mat = id;
      b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', String(this.ctrl.material === id));
      b.innerHTML = `<i class="sw" style="background:${m.color}"></i><b>${m.label}</b><small>$${m.costPerMeter}/m</small>`;
      b.addEventListener('click', () => this.selectMaterial(id));
      box.appendChild(b);
    }
  }

  private selectMaterial(id: MaterialId): void {
    if (!this.level.materials.includes(id)) return;
    this.ctrl.material = id;
    this.synth.click();
    document.querySelectorAll<HTMLElement>('.mat').forEach((el) => el.setAttribute('aria-checked', String(el.dataset.mat === id)));
    this.updateHud();
  }

  // ------------------------------------------------------------------ events
  private bindEvents(): void {
    const on = (id: string, fn: () => void) => $(id).addEventListener('click', () => { this.synth.unlock(); this.synth.click(); fn(); });
    window.addEventListener('pointerdown', () => this.synth.unlock(), { passive: true });
    on('menu-play', () => this.startLevel(this.nextPlayable()));
    on('menu-rescue', () => this.startLevel(LEVELS[1], true));
    on('menu-levels', () => this.showScreen('levels'));
    on('menu-settings', () => this.showScreen('settings'));
    on('menu-credits', () => this.showScreen('credits'));
    document.querySelectorAll('[data-back]').forEach((b) => b.addEventListener('click', () => { this.synth.click(); this.showScreen('menu'); }));
    on('btn-menu', () => this.leaveToLevels());
    on('btn-undo', () => { if (this.graph.undo()) { this.ctrl.reset(); this.onGraphChanged(); } });
    on('btn-redo', () => { if (this.graph.redo()) { this.ctrl.reset(); this.onGraphChanged(); } });
    on('btn-delete', () => { if (this.ctrl.deleteSelected()) this.synth.remove(); });
    on('btn-reset', () => { if (this.graph.beams.length) this.confirm('Remove every beam you have built?', () => { this.graph.clearAll(); this.ctrl.reset(); this.onGraphChanged(); }); });
    on('btn-test', () => this.startTest());
    on('btn-stress', () => this.toggleStress());
    on('btn-sound', () => this.toggleSound());
    on('btn-pause', () => this.setPaused(!this.paused));
    on('btn-speed', () => { this.speed = this.speed === 1 ? 2 : 1; $('btn-speed').textContent = this.speed + '\u00d7'; });
    on('btn-restart', () => this.startTest());
    on('btn-edit', () => this.endTest());
    on('res-retry', () => { $('result').hidden = true; this.endTest(); });
    on('res-next', () => { const n = this.level.id + 1; $('result').hidden = true; if (n <= LEVELS.length) this.startLevel(LEVELS[n - 1]); });
    on('res-levels', () => { $('result').hidden = true; this.leaveToLevels(); });
    on('confirm-no', () => { $('confirm').hidden = true; this.pendingConfirm = null; });
    on('confirm-yes', () => { $('confirm').hidden = true; const f = this.pendingConfirm; this.pendingConfirm = null; f?.(); });
    on('rotate-dismiss', () => { this.rotateDismissed = true; $('rotate').hidden = true; });
    $('set-sound').addEventListener('change', (e) => { this.setMuted(!(e.target as HTMLInputElement).checked); });
    $('set-stress').addEventListener('change', (e) => { this.stressView = (e.target as HTMLInputElement).checked; this.store.setSettings({ stressView: this.stressView }); this.updateHud(); });
    $('set-motion').addEventListener('change', (e) => { const v = (e.target as HTMLInputElement).checked; this.particles.reduced = v; this.store.setSettings({ reduceMotion: v }); });
    on('set-reset', () => this.confirm('Erase all saved progress?', () => { this.store.data.levels = {}; this.store.persist(); this.toast('Progress erased'); this.renderLevelGrid(); }));

    const c = this.canvas;
    const pos = (e: PointerEvent) => { const r = c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    c.addEventListener('pointerdown', (e) => { if (this.screen !== 'play' || this.mode !== 'build') return; c.setPointerCapture(e.pointerId); e.preventDefault(); this.ctrl.pointerDown(pos(e), e.pointerId); this.levelHintActive = false; });
    c.addEventListener('pointermove', (e) => { if (this.screen !== 'play') return; const p = pos(e); this.ctrl.pointerMove(p, e.pointerId); const n = this.graph.nodeAt(this.cam.screenToWorld(p), BUILD.pickRadiusPx / this.cam.scale); this.hoverNodeId = n ? n.id : null; });
    c.addEventListener('pointerup', (e) => { if (this.screen !== 'play') return; this.ctrl.pointerUp(pos(e), e.pointerId); this.updateHud(); });
    c.addEventListener('pointercancel', () => this.ctrl.cancel());
    c.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') this.hoverNodeId = null; });
    c.addEventListener('contextmenu', (e) => e.preventDefault());
    // iOS Safari: stop pinch/double-tap page zoom
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('dblclick', (e) => e.preventDefault());

    window.addEventListener('keydown', (e) => this.onKey(e));
    window.addEventListener('resize', () => this.queueLayout());
    window.addEventListener('orientationchange', () => this.queueLayout());
    if ('ResizeObserver' in window) new ResizeObserver(() => this.queueLayout()).observe($('app'));
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); else { this.last = performance.now(); } });
  }

  private onKey(e: KeyboardEvent): void {
    if (e.ctrlKey || e.metaKey || e.altKey) { if ((e.key === 'z' || e.key === 'Z') && this.canBuild()) { e.preventDefault(); $('btn-undo').click(); } return; }
    const k = e.key;
    if (!$('confirm').hidden) { if (k === 'Escape') $('confirm-no').click(); return; }
    if (this.screen !== 'play') { if (k === 'Escape' && this.screen !== 'menu') this.showScreen('menu'); return; }
    const onButton = (e.target as HTMLElement)?.tagName === 'BUTTON';
    if (k === 'm' || k === 'M') this.toggleSound();
    else if (k === 's' || k === 'S') this.toggleStress();
    if (this.mode === 'build') {
      if (k >= '1' && k <= '4') { const allowed = MATERIAL_ORDER.filter((m) => this.level.materials.includes(m)); const m = allowed[Number(k) - 1]; if (m) this.selectMaterial(m); }
      else if (k === 'z' || k === 'Z') $('btn-undo').click();
      else if (k === 'y' || k === 'Y') $('btn-redo').click();
      else if (k === 'Delete' || k === 'Backspace') { e.preventDefault(); $('btn-delete').click(); }
      else if (k === 'Escape') { if (this.ctrl.pendingFrom !== null || this.ctrl.selectedBeam !== null) { this.ctrl.reset(); this.updateHud(); } else this.leaveToLevels(); }
      else if ((k === 't' || k === 'T' || (k === ' ' && !onButton)) ) { e.preventDefault(); this.startTest(); }
    } else if (this.mode === 'test') {
      if (k === 'p' || k === 'P' || (k === ' ' && !onButton)) { e.preventDefault(); this.setPaused(!this.paused); }
      else if (k === 'r' || k === 'R') this.startTest();
      else if (k === 'Escape') this.endTest();
    }
  }

  private canBuild(): boolean { return this.screen === 'play' && this.mode === 'build'; }

  // ------------------------------------------------------------------ navigation
  private showScreen(s: Screen): void {
    this.screen = s;
    for (const id of ['menu', 'levels', 'settings', 'credits']) $('screen-' + id).hidden = id !== s;
    $('hud').hidden = s !== 'play';
    $('result').hidden = true; $('confirm').hidden = true;
    if (s !== 'play') { this.adapter.gameplayStop(); this.sim = null; this.paused = false; if (!this.demo) this.loadDemo(); this.setLevelContext(LEVELS[11], false); this.layout(); }
    if (s === 'levels') this.renderLevelGrid();
    if (s === 'menu') $('menu-stars').textContent = `\u2605 ${this.store.totalStars()} / ${LEVELS.length * 3}`;
    if (s === 'settings') this.syncSettingsUi();
    this.updateRotateHint();
    const focus = s === 'menu' ? 'menu-play' : null;
    if (focus) $(focus).focus({ preventScroll: true });
  }

  private nextPlayable(): LevelDef {
    for (const l of LEVELS) if (this.store.isUnlocked(l.id) && !this.store.completed(l.id)) return l;
    return LEVELS[0];
  }

  private leaveToLevels(): void { this.showScreen('levels'); }

  startLevel(level: LevelDef, floodline = false): void {
    this.floodlineActive = floodline;
    this.floodHudSecond = -1;
    $('rescue-status').hidden = !floodline;
    if (!this.store.isUnlocked(level.id)) { this.toast('Complete the previous level to unlock this one.'); return; }
    this.sim = null; this.paused = false; this.mode = 'build'; this.endTimer = 0; this.resultShown = false; this.speed = 1;
    $('btn-speed').textContent = '1\u00d7';
    this.setLevelContext(level, true);
    this.ctrl.material = level.materials[0];
    this.ctrl.reset(); this.ctrl.enabled = true;
    this.particles.clear();
    this.levelHintActive = true;
    this.renderMaterialButtons();
    this.showScreen('play');
    this.applyMode();
    this.layout();
    this.updateHud();
    this.adapter.gameplayStart();
  }

  private setLevelContext(level: LevelDef, withGraph: boolean): void {
    this.level = level;
    if (withGraph) { this.graph = new BridgeGraph(level); this.ctrl.setGraph(this.graph); }
    this.stage.setLevel(level);
    this.idle = new Simulation(level, [], []);
  }

  private applyMode(): void {
    const build = this.mode === 'build';
    $('toolbar').hidden = !build;
    $('testbar').hidden = build;
    this.ctrl.enabled = build;
    this.updateHud();
  }

  // ------------------------------------------------------------------ testing
  startTest(): void {
    if (this.screen !== 'play') return;
    const report = analyzeStructure(this.level, this.graph.nodes, this.graph.beams);
    if (report.hint === 'noRoad') { this.reject(null, 'Lay a road across the gap before testing.'); return; }
    this.ctrl.reset();
    this.sim = new Simulation(this.level, this.graph.nodes, this.graph.beams, this.floodlineActive);
    this.stepper.reset();
    this.mode = 'test'; this.paused = false; this.endTimer = 0; this.resultShown = false; this.lastProgress = -1;
    this.particles.clear();
    $('result').hidden = true;
    $('test-state').textContent = 'TESTING'; $('test-state').classList.remove('paused');
    $('btn-pause').innerHTML = '&#10074;&#10074;';
    this.applyMode();
    this.synth.unlock();
    this.adapter.gameplayStart();
  }

  private endTest(): void {
    this.sim = null; this.mode = 'build'; this.paused = false; this.resultShown = false;
    this.particles.clear();
    $('result').hidden = true;
    this.applyMode();
  }

  private setPaused(p: boolean): void {
    if (this.mode !== 'test' || !this.sim || this.sim.state !== 'running') return;
    this.paused = p;
    $('test-state').textContent = p ? 'PAUSED' : 'TESTING';
    $('test-state').classList.toggle('paused', p);
    $('btn-pause').innerHTML = p ? '&#9654;' : '&#10074;&#10074;';
    if (p) this.adapter.gameplayStop(); else this.adapter.gameplayStart();
  }

  private autoPause(): void { if (this.mode === 'test') this.setPaused(true); else this.adapter.gameplayStop(); }

  private finishTest(): void {
    const sim = this.sim!;
    this.resultShown = true;
    const summary: RunSummary = {
      won: sim.state === 'won', cost: this.graph.usedBudget, brokenCount: sim.brokenCount, peakUtil: sim.peakUtil,
      beamCount: this.graph.beams.length, materialCounts: countMaterials(this.graph.beams),
    };
    const ev = evaluate(this.level, summary);
    this.lastEval = ev;
    this.mode = 'result';
    this.adapter.gameplayStop();
    if (ev.completed) { this.store.submit(this.level.id, ev.stars, summary.cost); this.adapter.reportScore(this.store.totalStars()); }
    const won = ev.completed;
    $('result-title').textContent = won ? (this.level.id === LEVELS.length ? 'All levels complete!' : 'Level complete!') : 'Bridge failed';
    const stars = $('result-stars'); stars.className = 'stars big'; stars.innerHTML = '';
    for (let i = 0; i < 3; i++) {
      const filled = i < ev.stars;
      stars.insertAdjacentHTML('beforeend', `<svg viewBox="0 0 24 24" ${filled ? 'class="pop" style="animation-delay:' + (0.25 + i * 0.25) + 's"' : ''}><path d="${STAR_PATH}" fill="${filled ? '#ffd166' : 'rgba(255,255,255,.14)'}" stroke="${filled ? '#b57400' : 'rgba(255,255,255,.3)'}" stroke-width="1"/></svg>`);
      if (filled) window.setTimeout(() => this.synth.star(i), 250 + i * 250);
    }
    $('result-detail').textContent = won
      ? `Cost ${money(summary.cost)} \u00b7 gold target ${money(this.level.goldBudget)} \u00b7 peak load ${Math.round(summary.peakUtil * 100)}%`
      : `${FAIL_TEXT[sim.failReason] ?? 'The vehicle did not make it.'} Cost ${money(summary.cost)}.`;
    const obj = $('result-objectives'); obj.innerHTML = '';
    const li = (ok: boolean, text: string) => obj.insertAdjacentHTML('beforeend', `<li class="${ok ? 'ok' : 'no'}" data-mark="${ok ? '\u2713' : '\u2717'}">${text}</li>`);
    li(won, 'Reach the other side');
    li(ev.costOk, `Cost at most ${money(this.level.goldBudget)} with no broken beams`);
    li(ev.challengeOk, this.level.challenge.text);
    const hasNext = won && this.level.id < LEVELS.length;
    $('res-next').hidden = !hasNext;
    $('result').hidden = false;
    (hasNext ? $('res-next') : $('res-retry')).focus({ preventScroll: true });
    if (won) this.synth.win(); else this.synth.fail();
  }

  // ------------------------------------------------------------------ HUD
  private onGraphChanged(): void { this.levelHintActive = false; this.updateHud(); }

  private reject(reason: RejectReason | null, text?: string): void {
    this.synth.error();
    this.hintOverride = text ?? (reason ? REJECT_TEXT[reason] : '');
    this.hintOverrideUntil = performance.now() + 2200;
    this.toast(this.hintOverride);
    this.updateHud();
  }

  private toast(msg: string): void {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => { t.hidden = true; }, 2000);
  }

  private confirm(text: string, onYes: () => void): void {
    $('confirm-text').textContent = text; this.pendingConfirm = onYes; $('confirm').hidden = false; $('confirm-no').focus({ preventScroll: true });
  }

  private contextHint(): string {
    if (this.mode !== 'build') return '';
    if (this.ctrl.pendingFrom !== null) return 'Now tap a second point (or empty space to add a joint). Tap the same point to cancel.';
    if (this.ctrl.selectedBeam !== null) return 'Beam selected: press Delete to remove it.';
    if (this.levelHintActive && this.graph.beams.length === 0) return this.level.hint;
    const rep = analyzeStructure(this.level, this.graph.nodes, this.graph.beams);
    switch (rep.hint) {
      case 'noRoad': return `Lay a road across the gap. Tap an anchor, then another point. Selected: ${MATERIALS[this.ctrl.material].label}.`;
      case 'roadGap': return "The road doesn't reach the far side yet.";
      case 'floating': return "Some beams aren't attached to the ground and will fall.";
      default: return 'Looks connected - press Test Bridge when ready.';
    }
  }

  private updateHud(): void {
    if (this.screen !== 'play') return;
    const g = this.graph, lvl = this.level;
    $('level-title').innerHTML = `${lvl.id}. ${lvl.name}<small>${VEHICLES[lvl.vehicle].label} \u00b7 Gold target ${money(lvl.goldBudget)}</small>`;
    const remaining = g.remainingBudget;
    $('budget-left').textContent = money(remaining);
    $('budget-detail').textContent = `used ${money(g.usedBudget)} \u00b7 ${g.beams.length} beams`;
    const frac = Math.min(1, g.usedBudget / lvl.budget);
    const bar = $('budget-bar'); bar.style.width = frac * 100 + '%'; bar.classList.toggle('low', frac > 0.85);
    ($('btn-undo') as HTMLButtonElement).disabled = !g.canUndo;
    ($('btn-redo') as HTMLButtonElement).disabled = !g.canRedo;
    ($('btn-delete') as HTMLButtonElement).disabled = this.ctrl.selectedBeam === null;
    ($('btn-reset') as HTMLButtonElement).disabled = g.beams.length === 0;
    const sv = $('btn-stress'); sv.setAttribute('aria-pressed', String(this.stressView));
    $('legend').hidden = !this.stressView;
    const snd = $('btn-sound'); snd.setAttribute('aria-pressed', String(this.synth.muted)); snd.textContent = this.synth.muted ? '\u00d7' : '\u266b';
    snd.setAttribute('aria-label', this.synth.muted ? 'Unmute' : 'Mute');
    const hint = performance.now() < this.hintOverrideUntil ? this.hintOverride : this.contextHint();
    $('hint').textContent = hint;
  }

  private toggleStress(): void { this.stressView = !this.stressView; this.store.setSettings({ stressView: this.stressView }); this.synth.click(); this.updateHud(); }
  private toggleSound(): void { this.setMuted(!this.synth.muted); }
  private setMuted(m: boolean): void { this.synth.setMuted(m); this.store.setSettings({ muted: m }); this.syncSettingsUi(); this.updateHud(); if (!m) { this.synth.unlock(); this.synth.click(); } }
  private syncSettingsUi(): void {
    ($('set-sound') as HTMLInputElement).checked = !this.synth.muted;
    ($('set-stress') as HTMLInputElement).checked = this.stressView;
    ($('set-motion') as HTMLInputElement).checked = this.particles.reduced;
  }

  private renderLevelGrid(): void {
    const grid = $('level-grid'); grid.innerHTML = '';
    const names = ['Learn the basics', 'Support & balance', 'Material mastery', 'Advanced engineering', 'Expert engineering', 'Master builder'];
    const tierCount = Math.max(...LEVELS.map((l) => l.tier));
    for (let tier = 1; tier <= tierCount; tier++) {
      const t = document.createElement('div'); t.className = 'tier-title'; t.style.gridColumn = '1 / -1'; t.textContent = `Tier ${tier} \u00b7 ${names[tier - 1]}`; grid.appendChild(t);
      for (const lvl of LEVELS.filter((l) => l.tier === tier)) {
        const unlocked = this.store.isUnlocked(lvl.id), rec = this.store.record(lvl.id);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'level-card' + (rec ? ' done' : '');
        b.setAttribute('aria-disabled', String(!unlocked));
        b.setAttribute('aria-label', `Level ${lvl.id}, ${lvl.name}, ${unlocked ? (rec ? rec.stars + ' stars' : 'unlocked') : 'locked'}`);
        const stars = [0, 1, 2].map((i) => `<svg viewBox="0 0 24 24"><path d="${STAR_PATH}" fill="${rec && i < rec.stars ? '#ffd166' : 'rgba(255,255,255,.16)'}"/></svg>`).join('');
        b.innerHTML = `<span class="num">${unlocked ? lvl.id : '\ud83d\udd12'}</span><span class="nm">${lvl.name}</span><span class="stars">${stars}</span>`;
        b.addEventListener('click', () => { this.synth.unlock(); this.synth.click(); this.startLevel(lvl); });
        grid.appendChild(b);
      }
    }
  }

  private updateRotateHint(): void {
    const portrait = this.h > this.w * 1.15;
    $('rotate').hidden = !(portrait && this.screen === 'play' && !this.rotateDismissed && this.w < 700);
  }

  // ------------------------------------------------------------------ layout
  private queueLayout(): void {
    if (this.resizeQueued) return;
    this.resizeQueued = true;
    requestAnimationFrame(() => { this.resizeQueued = false; this.layout(); });
  }

  private layout(): void {
    const rect = this.canvas.getBoundingClientRect();
    this.w = Math.max(1, rect.width); this.h = Math.max(1, rect.height);
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    const playing = this.screen === 'play';
    const topH = playing ? $('topbar').getBoundingClientRect().bottom + 38 : 20;
    const toolbar = this.mode === 'build' ? $('toolbar') : $('testbar');
    const botH = playing ? Math.max(0, this.h - toolbar.getBoundingClientRect().top) + 6 : 20;
    const ba = this.level.buildArea;
    const W = this.level.goalX - 6;
    this.cam.fit({ minX: -8, maxX: W + 8.5, minY: Math.min(ba.minY, PHYSICS.waterY - 2), maxY: ba.maxY + 1 }, this.w, this.h, { top: topH, bottom: botH, left: 6, right: 6 });
    this.stage.resize(this.w, this.h, this.dpr);
    this.updateRotateHint();
  }

  // ------------------------------------------------------------------ main loop
  private loadDemo(): void {
    const lvl = LEVELS[11];
    const { graph } = buildSolution(lvl, SOLUTIONS[lvl.id]);
    this.demo = new Simulation(lvl, graph.nodes, graph.beams);
    this.demoRestart = 0;
  }

  private frame(now: number): void {
    const t0 = performance.now();
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now; this.time += dt;
    this.update(dt);
    this.draw();
    const ms = performance.now() - t0;
    this.frameMs += (ms - this.frameMs) * 0.05;
    if (this.debug) this.updateDebug();
    requestAnimationFrame((t) => this.frame(t));
  }

  private update(dt: number): void {
    this.shake = Math.max(0, this.shake - dt * 3);
    this.particles.update(dt);
    if (this.screen !== 'play') {
      if (this.demo) {
        const n = this.stepper.advance(dt, false);
        for (let i = 0; i < n; i++) this.demo.step();
        if (this.demo.state !== 'running') { this.demoRestart += dt; if (this.demoRestart > 2) this.loadDemo(); }
      }
      return;
    }
    if (performance.now() > this.hintOverrideUntil && this.hintOverride) { this.hintOverride = ''; this.updateHud(); }
    const sim = this.sim;
    if (this.floodlineActive) {
      const remaining = Math.max(0, 14 - (sim?.time ?? 0));
      const second = Math.ceil(remaining);
      if (second !== this.floodHudSecond) {
        this.floodHudSecond = second;
        $('rescue-time').textContent = sim && this.mode !== 'build' ? `${second}s until flood peak` : 'Build first, then launch';
        $('rescue-time').classList.toggle('urgent', !!sim && this.mode !== 'build' && remaining <= 5);
      }
    }
    if (!sim || this.mode === 'build') return;
    const steps = this.stepper.advance(dt, this.paused, this.speed);
    const s0 = performance.now();
    for (let i = 0; i < steps; i++) sim.step();
    if (steps) this.simMs += (performance.now() - s0 - this.simMs) * 0.1;
    this.handleSimEvents(sim);
    this.effects(sim, dt);
    if (sim.progress !== this.lastProgress) { this.lastProgress = sim.progress; $('progress-bar').style.width = sim.progress * 100 + '%'; }
    if (sim.state !== 'running' && !this.resultShown && this.mode === 'test') {
      this.endTimer += dt;
      $('test-state').textContent = sim.state === 'won' ? 'SUCCESS' : 'FAILED';
      if (this.endTimer > (sim.state === 'won' ? 1.7 : 1.5)) this.finishTest();
    }
  }

  private handleSimEvents(sim: Simulation): void {
    for (const e of sim.events) {
      if (e.type === 'break') { this.particles.snap(e.x, e.y, e.material); this.synth.snap(); if (!this.particles.reduced) this.shake = 0.6; }
      else if (e.type === 'splash') { this.particles.splash(e.x, e.y); this.synth.splash(); }
      else if (e.type === 'win') { this.particles.confetti(this.level.goalX, groundHeightAt(this.level.landmasses, this.level.goalX)); }
    }
    sim.events.length = 0;
  }

  private effects(sim: Simulation, dt: number): void {
    if (this.paused) return;
    this.dustTimer -= dt;
    if (this.dustTimer <= 0) {
      this.dustTimer = 0.08;
      for (const w of sim.wheels) if (w.contact && Math.abs(w.vx) > 0.8) this.particles.dust(w.x, w.y - this.vehicleDef().wheelRadius, w.vx);
    }
    let worst = 0;
    for (const b of sim.beams) if (!b.broken && b.util > worst) worst = b.util;
    if (worst > 0.7 && sim.state === 'running') this.synth.creak(worst);
  }

  private vehicleDef() { return VEHICLES[this.level.vehicle]; }

  // ------------------------------------------------------------------ drawing
  private draw(): void {
    const c = this.ctx, w = this.w, h = this.h;
    c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    c.clearRect(0, 0, w, h);
    if (this.shake > 0) this.cam.setShake((Math.random() - 0.5) * this.shake * 10, (Math.random() - 0.5) * this.shake * 10);
    else this.cam.setShake(0, 0);

    const sim = this.screen === 'play' ? this.sim : this.demo;
    const building = this.screen === 'play' && this.mode === 'build';
    this.updateStage(sim, building);
    const vs = sim ?? this.idle;
    this.stage.setVehicle(this.vehicleDef(), {
      x: (vs.wheels[0].x + vs.wheels[1].x) / 2, y: (vs.wheels[0].y + vs.wheels[1].y) / 2,
      angle: vs.vehicleAngle, bodyOffset: vs.bodyOffset, spinRear: vs.wheels[0].spin, spinFront: vs.wheels[1].spin,
    });
    this.stage.render(this.cam, this.time);

    // 2D overlay: mission flood is drawn over the 3D water plane, then construction feedback.
    if (this.floodlineActive && this.screen === 'play' && this.mode !== 'build') this.drawFloodline(c, sim?.waterLevel ?? -9);
    // 2D overlay: build grid, hover/selection feedback, particles, placement preview
    if (building) this.drawGrid(c);
    if (building) this.drawBuildFeedback(c);
    this.particles.draw(c, this.cam);
    if (building) this.drawPreview(c);
  }

  private drawFloodline(c: CanvasRenderingContext2D, level: number): void {
    const left = this.cam.worldToScreen({ x: -12, y: level });
    const right = this.cam.worldToScreen({ x: this.level.goalX + 12, y: level });
    c.save();
    c.fillStyle = 'rgba(28, 150, 220, 0.28)';
    c.beginPath(); c.moveTo(left.x, left.y); c.lineTo(right.x, right.y); c.lineTo(this.w, this.h); c.lineTo(0, this.h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(117, 224, 255, 0.9)'; c.lineWidth = 2;
    c.beginPath();
    for (let i = 0; i <= 32; i++) {
      const x = left.x + (right.x - left.x) * i / 32;
      const y = left.y + Math.sin(i * 0.9 + this.time * 2.5) * 3;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke(); c.restore();
  }

  private drawGrid(c: CanvasRenderingContext2D): void {
    const ba = this.level.buildArea;
    c.fillStyle = 'rgba(255,255,255,0.28)';
    for (let x = Math.ceil(ba.minX); x <= ba.maxX; x += 1) {
      for (let y = Math.ceil(ba.minY); y <= ba.maxY; y += 1) {
        if (isInsideTerrain(this.level.landmasses, { x, y })) continue;
        const p = this.cam.worldToScreen({ x, y });
        c.fillRect(p.x - 1, p.y - 1, 2, 2);
      }
    }
  }

  /** Push the current structure (live simulation, demo, or the player's design) to the 3D stage. */
  private updateStage(sim: Simulation | null, building: boolean): void {
    let n = 0;
    const nodes: StageNode[] = [];
    const slot = (): DrawBeam => this.beamPool[n] ?? (this.beamPool[n] = { ax: 0, ay: 0, bx: 0, by: 0, material: 'road', util: 0, force: 0, rest: 1, len: 1 });
    if (sim && !building) {
      const used = new Set<number>();
      for (const b of sim.beams) {
        if (b.broken) continue;
        const A = sim.nodes[b.a], B = sim.nodes[b.b], d = slot();
        d.ax = A.x; d.ay = A.y; d.bx = B.x; d.by = B.y; d.material = b.material; d.util = b.util; d.force = b.force; d.rest = b.rest; d.len = b.len; d.selected = false; d.broken = false;
        n++; used.add(b.a); used.add(b.b);
      }
      sim.nodes.forEach((nd, i) => { if (nd.fixed || used.has(i)) nodes.push({ x: nd.x, y: nd.y, kind: nd.fixed ? 'anchor' : 'junction' }); });
    } else {
      for (const b of this.graph.beams) {
        const A = this.graph.node(b.a), B = this.graph.node(b.b);
        if (!A || !B) continue;
        const d = slot();
        const L = Math.hypot(B.x - A.x, B.y - A.y);
        d.ax = A.x; d.ay = A.y; d.bx = B.x; d.by = B.y; d.material = b.material; d.util = 0; d.force = 0; d.rest = L; d.len = L; d.selected = this.ctrl.selectedBeam === b.id; d.broken = false;
        n++;
      }
      for (const nd of this.graph.nodes) nodes.push({ x: nd.x, y: nd.y, kind: nd.kind });
    }
    this.stage.setStructure(this.beamPool, n, nodes, !building && this.screen === 'play' && this.stressView, this.time);
    this.drawnBeams = n;
  }
  private drawnBeams = 0;

  /** Selection highlight and node hover/pending rings (build mode only). */
  private drawBuildFeedback(c: CanvasRenderingContext2D): void {
    for (let i = 0; i < this.drawnBeams; i++) {
      const b = this.beamPool[i];
      if (b.selected) drawBeamHighlight(c, this.cam, b, MATERIALS[b.material].thickness);
    }
    for (const nd of this.graph.nodes) {
      const st = this.ctrl.pendingFrom === nd.id ? 'pending' : this.hoverNodeId === nd.id ? 'hover' : null;
      if (st) drawNodeRing(c, this.cam, nd.x, nd.y, nd.kind, st, this.time);
    }
  }

  private drawPreview(c: CanvasRenderingContext2D): void {
    const pv = this.ctrl.preview();
    if (!pv) return;
    const A = this.cam.worldToScreen(pv.from), B = this.cam.worldToScreen(pv.to);
    const col = pv.valid ? '#3ddc84' : '#ff5a5f';
    c.save();
    c.strokeStyle = col; c.globalAlpha = 0.9; c.lineWidth = Math.max(3, MATERIALS[this.ctrl.material].thickness * this.cam.scale); c.lineCap = 'round'; c.setLineDash([10, 8]);
    c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
    c.setLineDash([]); c.beginPath(); c.arc(B.x, B.y, 9, 0, Math.PI * 2); c.stroke();
    const text = pv.valid ? `${money(pv.cost)}` : `${money(pv.cost)} \u00b7 ${REJECT_TEXT[pv.reason!]}`;
    c.font = '700 13px system-ui, sans-serif';
    const tw = c.measureText(text).width + 14;
    const tx = Math.min(this.w - tw - 4, Math.max(4, B.x - tw / 2)), ty = Math.max(this.cam.worldToScreen({ x: 0, y: this.level.buildArea.maxY }).y, B.y - 38);
    c.globalAlpha = 0.95; c.fillStyle = 'rgba(15,24,48,.92)'; c.beginPath(); c.roundRect(tx, ty, tw, 24, 8); c.fill();
    c.strokeStyle = col; c.lineWidth = 1.5; c.stroke();
    c.fillStyle = '#fff'; c.textBaseline = 'middle'; c.fillText(text, tx + 7, ty + 12);
    c.restore();
  }

  private updateDebug(): void {
    const el = $('debug'); el.hidden = false;
    el.textContent = `${GAME.title}\nframe ${this.frameMs.toFixed(2)} ms (${(1000 / Math.max(0.1, this.frameMs)).toFixed(0)} fps cap)\nsim ${this.simMs.toFixed(2)} ms/step-batch\nbeams ${this.graph.beams.length} dpr ${this.dpr.toFixed(2)} scale ${this.cam.scale.toFixed(1)}\nmode ${this.screen}/${this.mode}${this.paused ? ' paused' : ''} gravity ${PHYSICS.gravity}`;
  }

  // ------------------------------------------------------------------ QA helpers (used by browser tests)
  qa() {
    return {
      screen: this.screen, mode: this.mode, level: this.level.id, beams: this.graph.beams.length, used: this.graph.usedBudget,
      remaining: this.graph.remainingBudget, simState: this.sim?.state ?? null, paused: this.paused, scale: this.cam.scale,
      worldToScreen: (x: number, y: number) => { const p = this.cam.worldToScreen({ x, y }); const r = this.canvas.getBoundingClientRect(); return { x: p.x + r.left, y: p.y + r.top }; },
      stars: this.lastEval?.stars ?? null, progress: this.sim?.progress ?? 0, broken: this.sim?.brokenCount ?? 0,
    };
  }
}
