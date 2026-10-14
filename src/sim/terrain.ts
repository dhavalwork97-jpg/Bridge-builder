import type { Landmass, Vec2 } from '../types';
import { polylineY } from '../math';

export interface Segment { ax: number; ay: number; bx: number; by: number }

const FLOOR_Y = -40;

/** Static collision segments: each landmass top surface plus its two vertical side walls. */
export function terrainSegments(landmasses: Landmass[]): Segment[] {
  const segs: Segment[] = [];
  for (const lm of landmasses) {
    const t = lm.top;
    for (let i = 0; i < t.length - 1; i++) segs.push({ ax: t[i].x, ay: t[i].y, bx: t[i + 1].x, by: t[i + 1].y });
    const first = t[0], last = t[t.length - 1];
    segs.push({ ax: first.x, ay: first.y, bx: first.x, by: FLOOR_Y });
    segs.push({ ax: last.x, ay: last.y, bx: last.x, by: FLOOR_Y });
  }
  return segs;
}

/** Highest solid surface at x (or -Infinity if open air). */
export function groundHeightAt(landmasses: Landmass[], x: number): number {
  let h = -Infinity;
  for (const lm of landmasses) h = Math.max(h, polylineY(lm.top, x));
  return h;
}

export function isInsideTerrain(landmasses: Landmass[], p: Vec2): boolean {
  const h = groundHeightAt(landmasses, p.x);
  return h !== -Infinity && p.y < h - 1e-6;
}
