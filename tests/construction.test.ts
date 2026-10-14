import { describe, expect, it } from 'vitest';
import { BridgeGraph, segmentCost } from '../src/sim/graph';
import { Camera } from '../src/game/camera';
import { ConstructionController } from '../src/game/construction';
import { gapLevel } from './fixtures';

const anchor = (g: BridgeGraph, x: number, y: number) => g.nodeAt({ x, y }, 0.1)!;

describe('construction rules', () => {
  it('creates a valid connection and charges its cost', () => {
    const g = new BridgeGraph(gapLevel());
    const r = g.connect(anchor(g, 0, 0).id, { point: { x: 6, y: 0 } }, 'road');
    expect(r.ok).toBe(true);
    expect(g.beams).toHaveLength(1);
    expect(g.usedBudget).toBe(segmentCost('road', 6));
    expect(g.nodes.filter((n) => n.kind === 'junction')).toHaveLength(1);
  });
  it('rejects self connections', () => {
    const g = new BridgeGraph(gapLevel());
    const a = anchor(g, 0, 0);
    const r = g.connect(a.id, { nodeId: a.id }, 'road');
    expect(r).toEqual({ ok: false, reason: 'self' });
  });
  it('rejects duplicate connections in either direction', () => {
    const g = new BridgeGraph(gapLevel());
    const a = anchor(g, 0, 0), b = anchor(g, 0, -3);
    expect(g.connect(a.id, { nodeId: b.id }, 'wood').ok).toBe(true);
    expect(g.connect(a.id, { nodeId: b.id }, 'steel')).toEqual({ ok: false, reason: 'duplicate' });
    expect(g.connect(b.id, { nodeId: a.id }, 'steel')).toEqual({ ok: false, reason: 'duplicate' });
  });
  it('rejects invalid targets: too long, out of bounds, inside terrain, disallowed material', () => {
    const g = new BridgeGraph(gapLevel({ materials: ['road', 'wood'] }));
    const a = anchor(g, 0, 0);
    expect(g.connect(a.id, { point: { x: 12, y: 0 } }, 'road')).toEqual({ ok: false, reason: 'tooLong' });
    expect(g.connect(a.id, { point: { x: 5, y: 40 } }, 'wood')).toEqual({ ok: false, reason: 'tooLong' });
    expect(g.connect(a.id, { point: { x: 3, y: 9 } }, 'wood').ok).toBe(false);
    expect(g.connect(a.id, { point: { x: -1, y: -2 } }, 'wood')).toEqual({ ok: false, reason: 'insideTerrain' });
    expect(g.connect(a.id, { point: { x: 4, y: 0 } }, 'steel')).toEqual({ ok: false, reason: 'material' });
    expect(g.beams).toHaveLength(0);
  });
  it('enforces the budget and refunds on delete', () => {
    const g = new BridgeGraph(gapLevel({ budget: 700 }));
    const a = anchor(g, 0, 0);
    const r1 = g.connect(a.id, { point: { x: 5, y: 0 } }, 'road'); // 400
    expect(r1.ok).toBe(true);
    const mid = g.nodeAt({ x: 5, y: 0 }, 0.1)!;
    expect(g.connect(mid.id, { point: { x: 10, y: 0 } }, 'road')).toEqual({ ok: false, reason: 'budget' });
    expect(g.remainingBudget).toBe(300);
    if (r1.ok) g.removeBeam(r1.beamId);
    expect(g.remainingBudget).toBe(700);
    expect(g.nodes.filter((n) => n.kind === 'junction')).toHaveLength(0); // orphan pruned
  });
  it('undo and redo restore the exact graph', () => {
    const g = new BridgeGraph(gapLevel());
    const a = anchor(g, 0, 0);
    g.connect(a.id, { point: { x: 4, y: 0 } }, 'road');
    const mid = g.nodeAt({ x: 4, y: 0 }, 0.1)!;
    g.connect(mid.id, { point: { x: 8, y: 0 } }, 'road');
    const full = JSON.stringify(g.snapshot());
    expect(g.undo()).toBe(true);
    expect(g.beams).toHaveLength(1);
    expect(g.undo()).toBe(true);
    expect(g.beams).toHaveLength(0);
    expect(g.nodes.filter((n) => n.kind === 'junction')).toHaveLength(0);
    expect(g.canUndo).toBe(false);
    g.redo(); g.redo();
    expect(JSON.stringify(g.snapshot())).toBe(full);
    expect(g.canRedo).toBe(false);
  });
  it('a new action clears the redo stack; clearAll is undoable', () => {
    const g = new BridgeGraph(gapLevel());
    const a = anchor(g, 0, 0);
    g.connect(a.id, { point: { x: 4, y: 0 } }, 'road');
    g.undo();
    expect(g.canRedo).toBe(true);
    g.connect(a.id, { point: { x: 3, y: 0 } }, 'road');
    expect(g.canRedo).toBe(false);
    g.clearAll();
    expect(g.beams).toHaveLength(0);
    g.undo();
    expect(g.beams).toHaveLength(1);
  });
});

describe('pointer controller', () => {
  function setup(scale: number) {
    const g = new BridgeGraph(gapLevel());
    const cam = new Camera();
    cam.scale = scale; cam.offsetX = 100; cam.offsetY = 300;
    const log = { placed: 0, rejected: [] as string[] };
    const c = new ConstructionController(g, cam, { onChange() {}, onPlaced() { log.placed++; }, onRejected(r) { log.rejected.push(r); }, onSelect() {} });
    return { g, cam, c, log };
  }
  for (const scale of [8, 20, 55]) {
    it(`tap-tap builds exactly one beam at scale ${scale}`, () => {
      const { g, cam, c, log } = setup(scale);
      const a = cam.worldToScreen({ x: 0, y: 0 });
      const t = cam.worldToScreen({ x: 6, y: 0 });
      c.pointerDown(a, 1); c.pointerUp(a, 1);
      expect(c.pendingFrom).not.toBeNull();
      c.pointerDown(t, 2); c.pointerUp(t, 2);
      expect(log.placed).toBe(1);
      expect(g.beams).toHaveLength(1);
      expect(c.pendingFrom).toBeNull();
    });
    it(`drag builds exactly one beam at scale ${scale}`, () => {
      const { g, cam, c, log } = setup(scale);
      const a = cam.worldToScreen({ x: 0, y: 0 });
      const t = cam.worldToScreen({ x: 0, y: -3 });
      c.pointerDown(a, 5);
      c.pointerMove({ x: (a.x + t.x) / 2, y: (a.y + t.y) / 2 + 20 }, 5);
      c.pointerMove(t, 5);
      expect(c.preview()?.valid).toBe(true);
      c.pointerUp(t, 5);
      c.pointerUp(t, 5); // duplicate event must not place again
      expect(log.placed).toBe(1);
      expect(g.beams).toHaveLength(1);
    });
  }
  it('ignores a second finger while a gesture is active, and tapping a beam selects it for delete', () => {
    const { g, cam, c } = setup(30);
    const a = cam.worldToScreen({ x: 0, y: 0 });
    const b = cam.worldToScreen({ x: 0, y: -3 });
    c.pointerDown(a, 1);
    c.pointerDown(b, 2); c.pointerUp(b, 2);
    c.pointerUp(a, 1);
    expect(g.beams).toHaveLength(0);
    c.cancel();
    g.connect(g.nodeAt({ x: 0, y: 0 }, 0.1)!.id, { nodeId: g.nodeAt({ x: 0, y: -3 }, 0.1)!.id }, 'wood');
    const mid = cam.worldToScreen({ x: 0, y: -1.5 });
    c.pointerDown(mid, 3); c.pointerUp(mid, 3);
    expect(c.selectedBeam).not.toBeNull();
    expect(c.deleteSelected()).toBe(true);
    expect(g.beams).toHaveLength(0);
  });
  it('disabled controller never builds', () => {
    const { g, cam, c } = setup(20);
    c.enabled = false;
    const a = cam.worldToScreen({ x: 0, y: 0 });
    c.pointerDown(a, 1); c.pointerUp(a, 1);
    expect(g.beams).toHaveLength(0);
    expect(c.pendingFrom).toBeNull();
  });
});
