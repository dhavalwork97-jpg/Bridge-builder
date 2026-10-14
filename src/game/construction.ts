import { BUILD } from '../config';
import type { MaterialId, Vec2 } from '../types';
import type { CameraLike } from './stagecamera';
import { BridgeGraph, type RejectReason } from '../sim/graph';

export interface Preview {
  from: Vec2;
  to: Vec2;
  valid: boolean;
  cost: number;
  reason?: RejectReason;
}

export interface ConstructionEvents {
  onChange(): void;
  onPlaced(cost: number): void;
  onRejected(reason: RejectReason): void;
  onSelect(): void;
}

const DRAG_THRESHOLD_PX = 10;

/**
 * Pointer-driven construction. Works with one unified pointer stream (mouse, touch, pen).
 * Two ways to build: drag from a node to a target, or tap a node then tap a target.
 * All coordinates are CSS pixels relative to the canvas; the Camera maps them to world metres,
 * so hit-testing always agrees with what is drawn.
 */
export class ConstructionController {
  material: MaterialId = 'road';
  /** Node picked as the start of the next beam (tap-to-connect mode). */
  pendingFrom: number | null = null;
  selectedBeam: number | null = null;
  enabled = true;
  private drag: { pointerId: number; fromId: number; startPx: Vec2; moved: boolean } | null = null;
  private tapBeam: { pointerId: number; beamId: number } | null = null;
  private hoverPx: Vec2 | null = null;

  constructor(private graph: BridgeGraph, private cam: CameraLike, private ev: ConstructionEvents) {}

  setGraph(g: BridgeGraph): void { this.graph = g; this.reset(); }
  reset(): void { this.pendingFrom = null; this.selectedBeam = null; this.drag = null; this.tapBeam = null; this.hoverPx = null; }

  private pickNode(px: Vec2) {
    return this.graph.nodeAt(this.cam.screenToWorld(px), BUILD.pickRadiusPx / this.cam.scale);
  }

  pointerDown(px: Vec2, pointerId = 0): void {
    if (!this.enabled) return;
    if (this.drag || this.tapBeam) return; // ignore additional fingers while one is active
    this.hoverPx = px;
    const node = this.pickNode(px);
    if (node) {
      this.drag = { pointerId, fromId: node.id, startPx: px, moved: false };
      return;
    }
    const beam = this.graph.beamAt(this.cam.screenToWorld(px), BUILD.beamPickRadiusPx / this.cam.scale);
    if (beam && this.pendingFrom === null) this.tapBeam = { pointerId, beamId: beam.id };
    else this.drag = { pointerId, fromId: -1, startPx: px, moved: false };
  }

  pointerMove(px: Vec2, pointerId = 0): void {
    this.hoverPx = px;
    const d = this.drag;
    if (d && d.pointerId === pointerId && !d.moved && Math.hypot(px.x - d.startPx.x, px.y - d.startPx.y) > DRAG_THRESHOLD_PX) d.moved = true;
  }

  pointerUp(px: Vec2, pointerId = 0): void {
    if (!this.enabled) { this.cancel(); return; }
    if (this.tapBeam && this.tapBeam.pointerId === pointerId) {
      this.selectedBeam = this.selectedBeam === this.tapBeam.beamId ? null : this.tapBeam.beamId;
      this.tapBeam = null;
      this.ev.onSelect();
      return;
    }
    const d = this.drag;
    if (!d || d.pointerId !== pointerId) return;
    this.drag = null;
    const world = this.cam.screenToWorld(px);
    const upNode = this.pickNode(px);
    if (d.moved && d.fromId >= 0) {
      // drag-to-connect (exactly one placement per gesture)
      this.tryConnect(d.fromId, upNode ? { nodeId: upNode.id } : { point: world });
      this.pendingFrom = null;
      return;
    }
    // tap handling
    this.selectedBeam = null;
    if (this.pendingFrom === null) {
      this.pendingFrom = d.fromId >= 0 ? d.fromId : null;
      this.ev.onSelect();
      return;
    }
    if (upNode && upNode.id === this.pendingFrom) { this.pendingFrom = null; this.ev.onSelect(); return; }
    const from = this.pendingFrom;
    if (this.tryConnect(from, upNode ? { nodeId: upNode.id } : { point: world })) this.pendingFrom = null;
    else this.ev.onSelect();
  }

  cancel(): void { this.drag = null; this.tapBeam = null; this.pendingFrom = null; this.ev.onSelect(); }

  private tryConnect(fromId: number, target: { nodeId: number } | { point: Vec2 }): boolean {
    const r = this.graph.connect(fromId, target, this.material);
    if (r.ok) { this.selectedBeam = null; this.ev.onPlaced(r.cost); this.ev.onChange(); return true; }
    this.ev.onRejected(r.reason);
    return false;
  }

  deleteSelected(): boolean {
    if (this.selectedBeam === null) return false;
    const ok = this.graph.removeBeam(this.selectedBeam);
    this.selectedBeam = null;
    if (ok) this.ev.onChange();
    this.ev.onSelect();
    return ok;
  }

  /** Live preview line for rendering (drag in progress, or tap-mode with hover). */
  preview(): Preview | null {
    const fromId = this.drag && this.drag.fromId >= 0 && this.drag.moved ? this.drag.fromId : this.pendingFrom;
    if (fromId === null || !this.hoverPx) return null;
    const from = this.graph.node(fromId);
    if (!from) return null;
    const world = this.cam.screenToWorld(this.hoverPx);
    const hoverNode = this.pickNode(this.hoverPx);
    const target = hoverNode ? { nodeId: hoverNode.id } : { point: world };
    const to = this.graph.resolveTarget(target);
    if (!to) return null;
    const v = this.graph.validate(fromId, target, this.material);
    return { from: { x: from.x, y: from.y }, to: { x: to.x, y: to.y }, valid: v.ok, cost: v.cost, reason: v.ok ? undefined : v.reason };
  }
}
