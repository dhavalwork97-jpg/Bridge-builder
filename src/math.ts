import type { Vec2 } from './types';

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const dist = (a: Vec2, b: Vec2): number => Math.hypot(b.x - a.x, b.y - a.y);
export const snap = (v: number, step: number): number => Math.round(v / step) * step;
export const isFiniteNum = (v: number): boolean => Number.isFinite(v) && Math.abs(v) < 1e6;

/** Deterministic PRNG (mulberry32) for procedural scenery and tests. */
export function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Linear interpolation of a polyline's height at x, or -Infinity outside its span. */
export function polylineY(pts: Vec2[], x: number): number {
  if (pts.length === 0 || x < pts[0].x || x > pts[pts.length - 1].x) return -Infinity;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    if (x >= a.x && x <= b.x) {
      const span = b.x - a.x;
      return span === 0 ? Math.max(a.y, b.y) : lerp(a.y, b.y, (x - a.x) / span);
    }
  }
  return -Infinity;
}

export function mixColor(c1: string, c2: string, t: number): string {
  const p = (c: string, i: number) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
  const r = Math.round(lerp(p(c1, 0), p(c2, 0), t));
  const g = Math.round(lerp(p(c1, 1), p(c2, 1), t));
  const b = Math.round(lerp(p(c1, 2), p(c2, 2), t));
  return `rgb(${r},${g},${b})`;
}
