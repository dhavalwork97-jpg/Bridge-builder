import { mixColor } from '../math';
import type { CameraLike } from '../game/stagecamera';
import type { MaterialId } from '../types';

export interface DrawBeam {
  ax: number; ay: number; bx: number; by: number;
  material: MaterialId;
  util: number; force: number; rest: number; len: number;
  selected?: boolean; broken?: boolean;
}

const WARN = '#ffd23f', HOT = '#ff3b30';

/** Gradual stress colouring: base -> yellow (50%) -> red (100%). */
export function stressTint(base: string, util: number): string {
  if (util <= 0.45) return base;
  if (util < 0.8) return mixColor(base, WARN, (util - 0.45) / 0.35);
  return mixColor(WARN, HOT, Math.min(1, (util - 0.8) / 0.25));
}
/** Stress-view heat: tension red, compression blue, grey when unloaded. */
export function heatColor(force: number, util: number): string {
  const t = Math.min(1, util);
  return force >= 0 ? mixColor('#9aa3ad', '#ff3b30', t) : mixColor('#9aa3ad', '#2f7bff', t);
}

/** Overlay (2D canvas on top of the 3D stage): ring around a node being hovered or used as the start of a beam. */
export function drawNodeRing(c: CanvasRenderingContext2D, cam: CameraLike, x: number, y: number, kind: 'anchor' | 'junction', state: 'pending' | 'hover', time: number): void {
  const p = cam.worldToScreen({ x, y }), S = cam.scale;
  const r = (kind === 'anchor' ? 0.3 : 0.22) * S;
  c.beginPath(); c.arc(p.x, p.y, r + 7 + (state === 'pending' ? Math.sin(time * 8) * 2 : 0), 0, Math.PI * 2);
  c.fillStyle = state === 'pending' ? 'rgba(255,160,0,0.4)' : 'rgba(255,255,255,0.35)'; c.fill();
  c.strokeStyle = state === 'pending' ? '#ff9f0a' : '#fff'; c.lineWidth = 2; c.stroke();
}

/** Overlay: highlight the selected beam. */
export function drawBeamHighlight(c: CanvasRenderingContext2D, cam: CameraLike, b: DrawBeam, thickness: number): void {
  const A = cam.worldToScreen({ x: b.ax, y: b.ay }), B = cam.worldToScreen({ x: b.bx, y: b.by });
  const th = Math.max(2, thickness * cam.scale);
  c.lineCap = 'round';
  c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = th + 8; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
  c.strokeStyle = '#ff8a00'; c.lineWidth = th + 4; c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke();
}
