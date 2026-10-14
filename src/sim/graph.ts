import { BUILD, MATERIALS } from '../config';
import { dist, snap } from '../math';
import type { BBeam, BNode, GraphSnapshot, LevelDef, MaterialId, Vec2 } from '../types';
import { isInsideTerrain, segmentPassesThroughTerrain } from './terrain';

export type RejectReason =
  | 'self' | 'duplicate' | 'budget' | 'material' | 'tooLong' | 'tooShort'
  | 'outOfBounds' | 'insideTerrain' | 'maxBeams' | 'missingNode';

export const REJECT_TEXT: Record<RejectReason, string> = {
  self: 'Pick a different point.',
  duplicate: 'A beam already connects those points.',
  budget: 'Not enough budget.',
  material: 'That material is not allowed here.',
  tooLong: 'Too long - add a support point in between.',
  tooShort: 'Too short.',
  outOfBounds: 'Outside the build area.',
  insideTerrain: "Can't build inside the ground.",
  maxBeams: 'Too many beams.',
  missingNode: 'Missing node.',
};

export const segmentCost = (material: MaterialId, length: number): number =>
  Math.round(length * MATERIALS[material].costPerMeter);

export type ConnectResult =
  | { ok: true; beamId: number; createdNodeId: number | null; cost: number }
  | { ok: false; reason: RejectReason };

export type Target = { nodeId: number } | { point: Vec2 };
export type Validation =
  | { ok: true; cost: number; length: number }
  | { ok: false; reason: RejectReason; cost: number };

/** Editable bridge graph with budget accounting and snapshot-based undo/redo. */
export class BridgeGraph {
  nodes: BNode[] = [];
  beams: BBeam[] = [];
  private nextNodeId = 1;
  private nextBeamId = 1;
  private undoStack: GraphSnapshot[] = [];
  private redoStack: GraphSnapshot[] = [];

  constructor(public readonly level: LevelDef) {
    this.nodes = this.level.anchors.map((p) => ({ id: this.nextNodeId++, x: p.x, y: p.y, kind: 'anchor' as const, fixed: true }));
  }

  get usedBudget(): number { return this.beams.reduce((s, b) => s + this.beamCost(b), 0); }
  get remainingBudget(): number { return this.level.budget - this.usedBudget; }

  node(id: number): BNode | undefined { return this.nodes.find((n) => n.id === id); }

  beamLength(b: BBeam): number {
    const a = this.node(b.a), c = this.node(b.b);
    return a && c ? dist(a, c) : 0;
  }
  beamCost(b: BBeam): number { return segmentCost(b.material, this.beamLength(b)); }

  /** Nearest node within radius (metres), or undefined. */
  nodeAt(p: Vec2, radius: number): BNode | undefined {
    let best: BNode | undefined, bd = radius;
    for (const n of this.nodes) {
      const d = dist(n, p);
      if (d <= bd) { bd = d; best = n; }
    }
    return best;
  }

  /** Nearest beam to p within radius (metres), or undefined. */
  beamAt(p: Vec2, radius: number): BBeam | undefined {
    let best: BBeam | undefined, bd = radius;
    for (const b of this.beams) {
      const a = this.node(b.a), c = this.node(b.b);
      if (!a || !c) continue;
      const dx = c.x - a.x, dy = c.y - a.y;
      const len2 = dx * dx + dy * dy || 1;
      const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2));
      const d = Math.hypot(p.x - (a.x + dx * t), p.y - (a.y + dy * t));
      if (d <= bd) { bd = d; best = b; }
    }
    return best;
  }

  /** Resolve a world point to snapped build coordinates. */
  snapPoint(p: Vec2): Vec2 {
    return { x: snap(p.x, BUILD.gridStep), y: snap(p.y, BUILD.gridStep) };
  }

  /** Where a target would land: an existing node or a fresh snapped junction. */
  resolveTarget(target: Target): { x: number; y: number; existing: BNode | undefined } | undefined {
    if ('nodeId' in target) {
      const n = this.node(target.nodeId);
      return n ? { x: n.x, y: n.y, existing: n } : undefined;
    }
    const near = this.nodeAt(target.point, BUILD.nodeSnapRadius);
    if (near) return { x: near.x, y: near.y, existing: near };
    const sp = this.snapPoint(target.point);
    return { x: sp.x, y: sp.y, existing: undefined };
  }

  validate(fromId: number, target: Target, material: MaterialId): Validation {
    const from = this.node(fromId);
    const to = this.resolveTarget(target);
    if (!from || !to) return { ok: false, reason: 'missingNode', cost: 0 };
    const length = Math.hypot(to.x - from.x, to.y - from.y);
    const cost = segmentCost(material, length);
    const fail = (reason: RejectReason): Validation => ({ ok: false, reason, cost });
    if (!this.level.materials.includes(material)) return fail('material');
    if (to.existing && to.existing.id === fromId) return fail('self');
    if (length < BUILD.minBeamLength) return fail(length < 0.01 ? 'self' : 'tooShort');
    if (length > MATERIALS[material].maxLength) return fail('tooLong');
    const ex = to.existing;
    if (ex && this.beams.some((b) => (b.a === fromId && b.b === ex.id) || (b.b === fromId && b.a === ex.id))) return fail('duplicate');
    if (!ex) {
      const ba = this.level.buildArea;
      if (to.x < ba.minX || to.x > ba.maxX || to.y < ba.minY || to.y > ba.maxY) return fail('outOfBounds');
      if (isInsideTerrain(this.level.landmasses, { x: to.x, y: to.y })) return fail('insideTerrain');
    }
    if (this.beams.length >= BUILD.maxBeams) return fail('maxBeams');
    if (cost > this.remainingBudget) return fail('budget');
    return { ok: true, cost, length };
  }

  connect(fromId: number, target: Target, material: MaterialId): ConnectResult {
    const v = this.validate(fromId, target, material);
    if (!v.ok) return { ok: false, reason: v.reason };
    const to = this.resolveTarget(target)!;
    this.pushUndo();
    let toId: number, created: number | null = null;
    if (to.existing) toId = to.existing.id;
    else {
      toId = this.nextNodeId++;
      created = toId;
      this.nodes.push({ id: toId, x: to.x, y: to.y, kind: 'junction', fixed: false });
    }
    const beamId = this.nextBeamId++;
    this.beams.push({ id: beamId, a: fromId, b: toId, material });
    return { ok: true, beamId, createdNodeId: created, cost: v.cost };
  }

  /** Remove a beam (its cost is refunded implicitly) and prune orphaned junctions. */
  removeBeam(beamId: number): boolean {
    if (!this.beams.some((b) => b.id === beamId)) return false;
    this.pushUndo();
    this.beams = this.beams.filter((b) => b.id !== beamId);
    this.pruneOrphans();
    return true;
  }

  private pruneOrphans(): void {
    const used = new Set<number>();
    for (const b of this.beams) { used.add(b.a); used.add(b.b); }
    this.nodes = this.nodes.filter((n) => n.kind === 'anchor' || used.has(n.id));
  }

  clearAll(): boolean {
    if (this.beams.length === 0) return false;
    this.pushUndo();
    this.beams = [];
    this.pruneOrphans();
    return true;
  }

  snapshot(): GraphSnapshot {
    return { nodes: this.nodes.map((n) => ({ ...n })), beams: this.beams.map((b) => ({ ...b })), nextNodeId: this.nextNodeId, nextBeamId: this.nextBeamId };
  }
  restore(s: GraphSnapshot): void {
    this.nodes = s.nodes.map((n) => ({ ...n }));
    this.beams = s.beams.map((b) => ({ ...b }));
    this.nextNodeId = s.nextNodeId;
    this.nextBeamId = s.nextBeamId;
  }

  private pushUndo(): void {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 200) this.undoStack.shift();
    this.redoStack = [];
  }
  get canUndo(): boolean { return this.undoStack.length > 0; }
  get canRedo(): boolean { return this.redoStack.length > 0; }
  undo(): boolean {
    const s = this.undoStack.pop();
    if (!s) return false;
    this.redoStack.push(this.snapshot());
    this.restore(s);
    return true;
  }
  redo(): boolean {
    const s = this.redoStack.pop();
    if (!s) return false;
    this.undoStack.push(this.snapshot());
    this.restore(s);
    return true;
  }
}
