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

/**
 * True when the interior of a proposed member passes through solid terrain.
 * Samples in world space rather than relying on screen/render geometry. Existing
 * wall anchors may sit below the surface; their contiguous endpoint contact is
 * allowed, but a separate interior run through terrain is rejected.
 */
export function segmentPassesThroughTerrain(landmasses: Landmass[], a: Vec2, b: Vec2): boolean {
  const length = Math.hypot(b.x - a.x, b.y - a.y);
  const steps = Math.max(2, Math.ceil(length / 0.2));
  const inside: boolean[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    inside.push(isInsideTerrain(landmasses, {
      x: a.x + (b.x - a.x) * t,
      y: a.y + (b.y - a.y) * t,
    }));
  }

  // Wall anchors are intentionally embedded in the terrain. Permit only the
  // contiguous run touching such an endpoint; do not permit a beam that enters
  // terrain from an ordinary surface/air endpoint.
  const startEmbedded = isInsideTerrain(landmasses, a);
  const endEmbedded = isInsideTerrain(landmasses, b);
  let first = 0, last = inside.length - 1;
  if (startEmbedded) while (first < last && inside[first]) first++;
  if (endEmbedded) while (last > first && inside[last]) last--;
  for (let i = first; i <= last; i++) {
    if (inside[i]) return true;
  }
  return false;
}
