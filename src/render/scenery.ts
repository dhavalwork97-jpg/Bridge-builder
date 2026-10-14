import { PHYSICS } from '../config';
import { rng } from '../math';
import type { Camera } from '../game/camera';
import type { LevelDef } from '../types';
import { groundHeightAt } from '../sim/terrain';

interface Palette { skyTop: string; skyBottom: string; sun: string; mtnFar: string; mtnNear: string; hill: string; rock: string; rockDark: string; grass: string; grassLight: string; water: string; waterDeep: string }

export const PALETTES: Record<number, Palette> = {
  1: { skyTop: '#4aa8ff', skyBottom: '#d8f1ff', sun: '#fff6b0', mtnFar: '#9bb8d9', mtnNear: '#7aa0c4', hill: '#6cc16a', rock: '#a98a6a', rockDark: '#7b6049', grass: '#4fb04f', grassLight: '#7fd96f', water: '#3fa7e0', waterDeep: '#1e6fa8' },
  2: { skyTop: '#5b9be8', skyBottom: '#ffe9c4', sun: '#fff0a0', mtnFar: '#a9a6c8', mtnNear: '#8a88b0', hill: '#7fb85c', rock: '#b08f6e', rockDark: '#7f6248', grass: '#6aa84a', grassLight: '#9bd45c', water: '#3b9bd2', waterDeep: '#1b6396' },
  3: { skyTop: '#6a6fd6', skyBottom: '#ffc7a0', sun: '#ffd88a', mtnFar: '#b08fb8', mtnNear: '#8b6c9c', hill: '#6c9a55', rock: '#9c7d68', rockDark: '#6e5445', grass: '#5d9a45', grassLight: '#8fc457', water: '#4a86c0', waterDeep: '#25497f' },
  4: { skyTop: '#39467a', skyBottom: '#f0a58c', sun: '#ffcf8a', mtnFar: '#6d6a98', mtnNear: '#4e4b78', hill: '#4e8048', rock: '#8a6f60', rockDark: '#5e473c', grass: '#4a8040', grassLight: '#76ad4e', water: '#37699f', waterDeep: '#183a66' },
};

/** Static scene layers are rendered once per level/resize into offscreen canvases. */
export class Scenery {
  private back: HTMLCanvasElement | null = null;
  private fore: HTMLCanvasElement | null = null;
  private palette: Palette;
  private clouds: { x: number; y: number; s: number; v: number }[] = [];

  constructor(private level: LevelDef) {
    this.palette = PALETTES[level.tier];
    const r = rng(level.id * 7919);
    for (let i = 0; i < 7; i++) this.clouds.push({ x: r(), y: 0.05 + r() * 0.3, s: 0.6 + r() * 0.9, v: 0.004 + r() * 0.01 });
  }
  get pal(): Palette { return this.palette; }

  build(cam: Camera, w: number, h: number, dpr: number): void {
    this.back = this.layer(w, h, dpr, (c) => this.drawBackdrop(c, w, h));
    this.fore = this.layer(w, h, dpr, (c) => this.drawTerrain(c, cam, w, h));
  }

  private layer(w: number, h: number, dpr: number, fn: (c: CanvasRenderingContext2D) => void): HTMLCanvasElement {
    const cv = document.createElement('canvas');
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d')!;
    c.scale(dpr, dpr);
    fn(c);
    return cv;
  }

  private drawBackdrop(c: CanvasRenderingContext2D, w: number, h: number): void {
    const p = this.palette, r = rng(this.level.id * 31);
    const g = c.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, p.skyTop); g.addColorStop(0.75, p.skyBottom); g.addColorStop(1, p.skyBottom);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    // sun with glow
    const sx = w * (0.15 + 0.7 * r()), sy = h * 0.18;
    const sg = c.createRadialGradient(sx, sy, 0, sx, sy, h * 0.28);
    sg.addColorStop(0, p.sun); sg.addColorStop(0.25, p.sun + 'cc'); sg.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = sg; c.fillRect(0, 0, w, h);
    // two mountain ranges (value noise silhouettes)
    const range = (base: number, amp: number, color: string, seed: number) => {
      const rr = rng(seed); const pts: number[] = [];
      for (let i = 0; i <= 12; i++) pts.push(rr());
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w; x += 6) {
        const t = (x / w) * 12, i = Math.floor(t), f = t - i;
        const v = pts[i] * (1 - f) + pts[Math.min(12, i + 1)] * f;
        c.lineTo(x, base - v * amp - Math.abs(Math.sin(x * 0.02 + seed)) * amp * 0.12);
      }
      c.lineTo(w, h); c.closePath(); c.fillStyle = color; c.fill();
    };
    range(h * 0.62, h * 0.22, p.mtnFar, this.level.id + 3);
    range(h * 0.72, h * 0.16, p.mtnNear, this.level.id + 11);
    // rolling hills
    c.fillStyle = p.hill; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) c.lineTo(x, h * 0.8 + Math.sin(x * 0.011 + this.level.id) * h * 0.025);
    c.lineTo(w, h); c.fill();
  }

  private drawTerrain(c: CanvasRenderingContext2D, cam: Camera, w: number, h: number): void {
    const p = this.palette, r = rng(this.level.id * 101);
    const S = cam.scale;
    for (const lm of this.level.landmasses) {
      const top = lm.top.map((pt) => cam.worldToScreen(pt));
      const bottom = h + 40;
      c.beginPath(); c.moveTo(top[0].x, bottom);
      for (const t of top) c.lineTo(t.x, t.y);
      c.lineTo(top[top.length - 1].x, bottom); c.closePath();
      const minY = Math.min(...top.map((t) => t.y));
      const g = c.createLinearGradient(0, minY, 0, bottom);
      g.addColorStop(0, p.rock); g.addColorStop(1, p.rockDark);
      c.fillStyle = g; c.fill();
      c.save(); c.clip();
      // strata + cracks + speckle
      const x0 = top[0].x, x1 = top[top.length - 1].x;
      for (let y = minY + S * 1.2; y < bottom; y += S * (1.1 + r() * 0.8)) {
        c.strokeStyle = `rgba(60,40,25,${0.12 + r() * 0.12})`; c.lineWidth = 1 + r() * 2;
        c.beginPath(); c.moveTo(x0, y);
        for (let x = x0; x <= x1; x += S * 0.8) c.lineTo(x, y + (r() - 0.5) * S * 0.35);
        c.stroke();
      }
      for (let i = 0; i < (x1 - x0) * 0.18; i++) {
        const x = x0 + r() * (x1 - x0), y = minY + r() * (bottom - minY);
        c.fillStyle = r() > 0.5 ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.1)';
        c.fillRect(x, y, 2 + r() * 4, 1 + r() * 2);
      }
      c.restore();
      // grass cap
      c.lineJoin = 'round'; c.lineCap = 'round';
      c.strokeStyle = p.grass; c.lineWidth = S * 0.7;
      c.beginPath(); top.forEach((t, i) => (i ? c.lineTo(t.x, t.y + S * 0.25) : c.moveTo(t.x, t.y + S * 0.25))); c.stroke();
      c.strokeStyle = p.grassLight; c.lineWidth = S * 0.22;
      c.beginPath(); top.forEach((t, i) => (i ? c.lineTo(t.x, t.y + S * 0.05) : c.moveTo(t.x, t.y + S * 0.05))); c.stroke();
    }
    // road on the approach landmasses, drawn on the surface
    this.drawApproachRoad(c, cam, 0, this.level.landmasses[0].top);
    this.drawApproachRoad(c, cam, 1, this.level.landmasses[this.level.landmasses.length - 1].top);
    // trees and rocks away from the roadway
    const tree = (x: number) => {
      const gy = groundHeightAt(this.level.landmasses, x);
      if (gy === -Infinity) return;
      const s = cam.worldToScreen({ x, y: gy }), sc = S * (0.8 + r() * 0.7);
      c.fillStyle = '#6b4a2f'; c.fillRect(s.x - sc * 0.08, s.y - sc * 1.1, sc * 0.16, sc * 1.1);
      for (let k = 0; k < 3; k++) {
        c.fillStyle = k % 2 ? '#2e8b45' : '#3aa655';
        c.beginPath(); c.moveTo(s.x - sc * (0.7 - k * 0.12), s.y - sc * (0.7 + k * 0.7)); c.lineTo(s.x + sc * (0.7 - k * 0.12), s.y - sc * (0.7 + k * 0.7)); c.lineTo(s.x, s.y - sc * (2 + k * 0.7)); c.closePath(); c.fill();
      }
    };
    const first = this.level.landmasses[0].top, last = this.level.landmasses[this.level.landmasses.length - 1].top;
    for (let i = 0; i < 6; i++) { tree(first[0].x + 0.5 + r() * 5); tree(last[last.length - 1].x - 0.5 - r() * 5); }
    // goal flag
    const gy = groundHeightAt(this.level.landmasses, this.level.goalX);
    const gp = cam.worldToScreen({ x: this.level.goalX + 1.5, y: gy });
    c.strokeStyle = '#ddd'; c.lineWidth = 3; c.beginPath(); c.moveTo(gp.x, gp.y); c.lineTo(gp.x, gp.y - S * 3.2); c.stroke();
    this.flagBase = { x: gp.x, y: gp.y - S * 3.2 };
    // aerial anchors get pylons
    for (const a of this.level.anchors) {
      const gy2 = groundHeightAt(this.level.landmasses, a.x);
      if (gy2 !== -Infinity && a.y > gy2 + 1) this.pylon(c, cam, a.x, gy2, a.y);
    }
    void w;
  }
  flagBase = { x: 0, y: 0 };

  private pylon(c: CanvasRenderingContext2D, cam: Camera, x: number, gy: number, ay: number): void {
    const S = cam.scale, base = cam.worldToScreen({ x, y: gy }), top = cam.worldToScreen({ x, y: ay });
    const wBase = S * 1.1, wTop = S * 0.35;
    c.strokeStyle = '#59616e'; c.lineWidth = Math.max(2, S * 0.12);
    c.beginPath(); c.moveTo(base.x - wBase / 2, base.y); c.lineTo(top.x - wTop / 2, top.y);
    c.moveTo(base.x + wBase / 2, base.y); c.lineTo(top.x + wTop / 2, top.y); c.stroke();
    c.lineWidth = Math.max(1, S * 0.06); c.strokeStyle = '#7b8594';
    const n = 6;
    for (let i = 0; i < n; i++) {
      const t0 = i / n, t1 = (i + 1) / n;
      const y0 = base.y + (top.y - base.y) * t0, y1 = base.y + (top.y - base.y) * t1;
      const hw0 = (wBase * (1 - t0) + wTop * t0) / 2, hw1 = (wBase * (1 - t1) + wTop * t1) / 2;
      c.beginPath(); c.moveTo(base.x - hw0, y0); c.lineTo(base.x + hw1, y1); c.moveTo(base.x + hw0, y0); c.lineTo(base.x - hw1, y1);
      c.moveTo(base.x - hw1, y1); c.lineTo(base.x + hw1, y1); c.stroke();
    }
  }

  private drawApproachRoad(c: CanvasRenderingContext2D, cam: Camera, side: number, top: { x: number; y: number }[]): void {
    const S = cam.scale;
    const pts = top.map((t) => cam.worldToScreen(t));
    c.lineCap = 'butt'; c.lineJoin = 'round';
    c.strokeStyle = '#3d424c'; c.lineWidth = S * 0.34;
    c.beginPath(); pts.forEach((t, i) => (i ? c.lineTo(t.x, t.y - S * 0.12) : c.moveTo(t.x, t.y - S * 0.12))); c.stroke();
    c.strokeStyle = '#f2c94c'; c.lineWidth = Math.max(1, S * 0.05); c.setLineDash([S * 0.5, S * 0.4]);
    c.beginPath(); pts.forEach((t, i) => (i ? c.lineTo(t.x, t.y - S * 0.12) : c.moveTo(t.x, t.y - S * 0.12))); c.stroke();
    c.setLineDash([]);
    void side;
  }

  /** Animated parts: sky layer, drifting clouds. */
  drawBack(c: CanvasRenderingContext2D, w: number, h: number, t: number): void {
    if (this.back) c.drawImage(this.back, 0, 0, w, h);
    c.fillStyle = 'rgba(255,255,255,0.85)';
    for (const cl of this.clouds) {
      const x = ((cl.x + t * cl.v) % 1.3) * w - 0.15 * w, y = cl.y * h, s = cl.s * h * 0.05;
      for (const [dx, dy, rr] of [[0, 0, 1.2], [1.2, -0.3, 1.5], [2.5, 0, 1.2], [1.2, 0.3, 1.6]]) {
        c.beginPath(); c.ellipse(x + dx * s, y + dy * s, rr * s, rr * s * 0.7, 0, 0, Math.PI * 2); c.fill();
      }
    }
  }
  drawFore(c: CanvasRenderingContext2D, w: number, h: number): void { if (this.fore) c.drawImage(this.fore, 0, 0, w, h); }

  drawFlag(c: CanvasRenderingContext2D, cam: Camera, t: number): void {
    const S = cam.scale, b = this.flagBase;
    c.fillStyle = '#e8453c';
    c.beginPath(); c.moveTo(b.x, b.y);
    for (let i = 0; i <= 8; i++) c.lineTo(b.x + (i / 8) * S * 1.6, b.y + Math.sin(t * 5 + i * 0.7) * S * 0.07 * (i / 8));
    for (let i = 8; i >= 0; i--) c.lineTo(b.x + (i / 8) * S * 1.6, b.y + S * 0.9 + Math.sin(t * 5 + i * 0.7) * S * 0.07 * (i / 8));
    c.closePath(); c.fill();
  }

  drawWater(c: CanvasRenderingContext2D, cam: Camera, w: number, h: number, t: number): void {
    const p = this.palette;
    const y0 = cam.worldToScreen({ x: 0, y: PHYSICS.waterY }).y;
    const g = c.createLinearGradient(0, y0, 0, h);
    g.addColorStop(0, p.water + 'dd'); g.addColorStop(1, p.waterDeep);
    c.fillStyle = g; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w; x += 8) c.lineTo(x, y0 + Math.sin(x * 0.03 + t * 1.6) * 3 + Math.sin(x * 0.07 - t * 2.1) * 1.5);
    c.lineTo(w, h); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(255,255,255,0.45)'; c.lineWidth = 2; c.beginPath();
    for (let x = 0; x <= w; x += 8) { const y = y0 + Math.sin(x * 0.03 + t * 1.6) * 3 + Math.sin(x * 0.07 - t * 2.1) * 1.5; x ? c.lineTo(x, y) : c.moveTo(x, y); }
    c.stroke();
  }
}

