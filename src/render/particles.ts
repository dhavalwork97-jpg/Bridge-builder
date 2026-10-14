import type { Camera } from '../game/camera';
import type { MaterialId } from '../types';
import { MATERIALS } from '../config';

interface P { x: number; y: number; vx: number; vy: number; life: number; max: number; size: number; color: string; kind: 'dust' | 'spark' | 'drop' | 'confetti'; rot: number; vr: number }
interface Debris { x: number; y: number; vx: number; vy: number; rot: number; vr: number; len: number; thick: number; color: string; life: number }

/** Lightweight pooled particle effects; purely visual (never feeds back into physics). */
export class Particles {
  private ps: P[] = [];
  private debris: Debris[] = [];
  reduced = false;
  private rand = (() => { let s = 12345; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); })();

  clear(): void { this.ps.length = 0; this.debris.length = 0; }

  dust(x: number, y: number, speed: number): void {
    if (this.reduced || this.ps.length > 220) return;
    this.ps.push({ x, y, vx: -speed * 0.2 + (this.rand() - 0.5) * 0.6, vy: 0.4 + this.rand() * 0.6, life: 0, max: 0.6, size: 0.12 + this.rand() * 0.12, color: '210,200,180', kind: 'dust', rot: 0, vr: 0 });
  }
  sparks(x: number, y: number, n = 14): void {
    for (let i = 0; i < (this.reduced ? n / 3 : n); i++) {
      const a = this.rand() * Math.PI * 2, s = 2 + this.rand() * 5;
      this.ps.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + 2, life: 0, max: 0.5 + this.rand() * 0.4, size: 0.07, color: '255,210,90', kind: 'spark', rot: 0, vr: 0 });
    }
  }
  splash(x: number, y: number): void {
    for (let i = 0; i < (this.reduced ? 8 : 26); i++) {
      this.ps.push({ x: x + (this.rand() - 0.5) * 1.2, y, vx: (this.rand() - 0.5) * 4, vy: 3 + this.rand() * 6, life: 0, max: 1.0, size: 0.12, color: '220,240,255', kind: 'drop', rot: 0, vr: 0 });
    }
  }
  confetti(cx: number, cy: number): void {
    const cols = ['255,90,90', '255,210,70', '90,200,120', '90,160,255', '200,120,255'];
    for (let i = 0; i < (this.reduced ? 20 : 70); i++) {
      this.ps.push({ x: cx + (this.rand() - 0.5) * 6, y: cy + 4, vx: (this.rand() - 0.5) * 6, vy: 4 + this.rand() * 7, life: 0, max: 2.2, size: 0.18, color: cols[i % cols.length], kind: 'confetti', rot: this.rand() * 6, vr: (this.rand() - 0.5) * 12 });
    }
  }
  /** A member snapping: two halves tumble away with sparks. */
  snap(x: number, y: number, material: MaterialId): void {
    const m = MATERIALS[material];
    for (let i = 0; i < 2; i++) {
      this.debris.push({ x, y, vx: (i ? 1 : -1) * (0.8 + this.rand() * 1.5), vy: 1 + this.rand() * 2.5, rot: this.rand() * 3, vr: (this.rand() - 0.5) * 8, len: 0.5 + this.rand() * 0.8, thick: Math.max(0.08, m.thickness), color: m.color, life: 0 });
    }
    this.sparks(x, y, 12);
  }

  update(dt: number): void {
    for (const p of this.ps) {
      p.life += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.kind !== 'dust') p.vy -= 9.8 * dt * (p.kind === 'confetti' ? 0.25 : 1);
      if (p.kind === 'confetti') p.vx *= 1 - dt * 0.8;
    }
    this.ps = this.ps.filter((p) => p.life < p.max);
    for (const d of this.debris) { d.life += dt; d.x += d.vx * dt; d.y += d.vy * dt; d.vy -= 9.8 * dt; d.rot += d.vr * dt; }
    this.debris = this.debris.filter((d) => d.life < 3.5 && d.y > -25);
  }

  draw(c: CanvasRenderingContext2D, cam: Camera): void {
    for (const d of this.debris) {
      const p = cam.worldToScreen(d);
      c.save(); c.translate(p.x, p.y); c.rotate(d.rot); c.globalAlpha = Math.max(0, 1 - d.life / 3.5);
      c.fillStyle = d.color; c.fillRect(-d.len * cam.scale / 2, -d.thick * cam.scale / 2, d.len * cam.scale, d.thick * cam.scale);
      c.restore();
    }
    for (const p of this.ps) {
      const s = cam.worldToScreen(p), a = 1 - p.life / p.max;
      c.fillStyle = `rgba(${p.color},${(p.kind === 'dust' ? 0.4 : 0.9) * a})`;
      if (p.kind === 'confetti') { c.save(); c.translate(s.x, s.y); c.rotate(p.rot); c.fillRect(-3, -2, 6, 4); c.restore(); }
      else { c.beginPath(); c.arc(s.x, s.y, Math.max(1.2, p.size * cam.scale * (p.kind === 'dust' ? 1 + p.life * 2 : 1)), 0, Math.PI * 2); c.fill(); }
    }
    c.globalAlpha = 1;
  }
}
