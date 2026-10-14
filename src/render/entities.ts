import { MATERIALS } from '../config';
import { mixColor } from '../math';
import type { Camera } from '../game/camera';
import type { MaterialId, VehicleDef, Vec2 } from '../types';

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

export function drawBeam(c: CanvasRenderingContext2D, cam: Camera, b: DrawBeam, stressView: boolean, time: number): void {
  const m = MATERIALS[b.material];
  const A = cam.worldToScreen({ x: b.ax, y: b.ay }), B = cam.worldToScreen({ x: b.bx, y: b.by });
  const S = cam.scale, th = Math.max(2, m.thickness * S);
  const base = stressView ? heatColor(b.force, b.util) : stressTint(m.color, b.util);
  c.lineCap = 'round'; c.lineJoin = 'round';
  if (b.selected) { c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = th + 8; line(c, A, B); c.strokeStyle = '#ff8a00'; c.lineWidth = th + 4; line(c, A, B); }
  const overload = b.util > 0.95 && !b.broken;
  const wobble = overload ? Math.sin(time * 60) * 0.8 : 0;
  switch (b.material) {
    case 'cable': {
      c.strokeStyle = stressView ? base : stressTint('#2b2b33', b.util);
      c.lineWidth = Math.max(1.5, th);
      c.beginPath(); c.moveTo(A.x, A.y);
      if (b.len < b.rest * 0.9995) { // slack: visible sag
        const sag = Math.sqrt(Math.max(0, b.rest * b.rest - b.len * b.len)) * 0.5 * S;
        c.quadraticCurveTo((A.x + B.x) / 2, (A.y + B.y) / 2 + sag * 1.6, B.x, B.y);
      } else c.lineTo(B.x + wobble, B.y);
      c.stroke();
      break;
    }
    case 'road': {
      c.strokeStyle = '#1f2229'; c.lineWidth = th + 3; line(c, A, B);
      c.strokeStyle = stressView ? base : stressTint('#4a4f5a', b.util); c.lineWidth = th; line(c, A, B);
      c.strokeStyle = 'rgba(255,255,255,0.22)'; c.lineWidth = Math.max(1, th * 0.12);
      const n = normal(A, B, th * 0.36); line(c, { x: A.x + n.x, y: A.y + n.y }, { x: B.x + n.x, y: B.y + n.y });
      c.strokeStyle = '#f2c94c'; c.lineWidth = Math.max(1, th * 0.1); c.setLineDash([S * 0.35, S * 0.3]); line(c, A, B); c.setLineDash([]);
      break;
    }
    case 'wood': {
      c.strokeStyle = '#4a2f17'; c.lineWidth = th + 3; line(c, A, B);
      c.strokeStyle = stressView ? base : stressTint('#b9803f', b.util); c.lineWidth = th; line(c, A, B);
      c.strokeStyle = 'rgba(70,40,15,0.55)'; c.lineWidth = Math.max(1, th * 0.12);
      for (const o of [-0.22, 0.2]) { const n = normal(A, B, th * o); line(c, { x: A.x + n.x, y: A.y + n.y }, { x: B.x + n.x, y: B.y + n.y }); }
      break;
    }
    case 'steel': {
      c.strokeStyle = '#1d2f45'; c.lineWidth = th + 3; line(c, A, B);
      c.strokeStyle = stressView ? base : stressTint('#5b8bb8', b.util); c.lineWidth = th; line(c, A, B);
      c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = Math.max(1, th * 0.16);
      const n = normal(A, B, -th * 0.25); line(c, { x: A.x + n.x, y: A.y + n.y }, { x: B.x + n.x, y: B.y + n.y });
      break;
    }
  }
  if (overload) { c.strokeStyle = 'rgba(255,60,40,0.6)'; c.lineWidth = th + 6; c.globalAlpha = 0.35 + 0.25 * Math.sin(time * 30); line(c, A, B); c.globalAlpha = 1; }
}

function line(c: CanvasRenderingContext2D, A: Vec2, B: Vec2): void { c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.stroke(); }
function normal(A: Vec2, B: Vec2, d: number): Vec2 {
  const dx = B.x - A.x, dy = B.y - A.y, l = Math.hypot(dx, dy) || 1;
  return { x: (-dy / l) * d, y: (dx / l) * d };
}

export function drawNode(c: CanvasRenderingContext2D, cam: Camera, x: number, y: number, kind: 'anchor' | 'junction', state: 'idle' | 'pending' | 'hover', time: number): void {
  const p = cam.worldToScreen({ x, y }), S = cam.scale;
  const r = (kind === 'anchor' ? 0.3 : 0.22) * S;
  if (state !== 'idle') {
    c.beginPath(); c.arc(p.x, p.y, r + 7 + (state === 'pending' ? Math.sin(time * 8) * 2 : 0), 0, Math.PI * 2);
    c.fillStyle = state === 'pending' ? 'rgba(255,160,0,0.4)' : 'rgba(255,255,255,0.35)'; c.fill();
    c.strokeStyle = state === 'pending' ? '#ff9f0a' : '#fff'; c.lineWidth = 2; c.stroke();
  }
  c.beginPath(); c.arc(p.x, p.y, r, 0, Math.PI * 2);
  c.fillStyle = kind === 'anchor' ? '#ffcf4a' : '#f4f6f8'; c.fill();
  c.strokeStyle = kind === 'anchor' ? '#8a5d00' : '#3a3f48'; c.lineWidth = Math.max(1.5, r * 0.25); c.stroke();
  if (kind === 'anchor') { c.beginPath(); c.arc(p.x, p.y, r * 0.35, 0, Math.PI * 2); c.fillStyle = '#8a5d00'; c.fill(); }
}

export interface VehicleDraw { x: number; y: number; angle: number; bodyOffset: number; spinRear: number; spinFront: number }

/** Procedural vehicle. Local frame: metres, +x forward, +y up, origin at the axle midpoint. */
export function drawVehicle(c: CanvasRenderingContext2D, cam: Camera, v: VehicleDef, d: VehicleDraw, kind: string): void {
  const S = cam.scale, p = cam.worldToScreen({ x: d.x, y: d.y });
  c.save();
  c.translate(p.x, p.y); c.rotate(-d.angle); c.scale(S, -S);
  const r = v.wheelRadius, hb = v.wheelBase / 2;
  const rise = r * 0.55 + d.bodyOffset; // chassis bottom above axle line
  // wheels (behind body for depth) with suspension springs
  const wheel = (cx: number, spin: number) => {
    c.save(); c.translate(cx, 0);
    c.fillStyle = '#16181d'; c.beginPath(); c.arc(0, 0, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#9aa0aa'; c.beginPath(); c.arc(0, 0, r * 0.55, 0, Math.PI * 2); c.fill();
    c.rotate(-spin); c.strokeStyle = '#5e646f'; c.lineWidth = r * 0.12;
    for (let i = 0; i < 5; i++) { c.rotate((Math.PI * 2) / 5); c.beginPath(); c.moveTo(0, 0); c.lineTo(r * 0.5, 0); c.stroke(); }
    c.fillStyle = '#d7dbe2'; c.beginPath(); c.arc(0, 0, r * 0.14, 0, Math.PI * 2); c.fill();
    c.restore();
  };
  const spring = (cx: number) => {
    c.strokeStyle = '#c9ced6'; c.lineWidth = 0.05; c.beginPath(); c.moveTo(cx, r * 0.2);
    const top = rise, n = 5;
    for (let i = 1; i <= n; i++) c.lineTo(cx + (i % 2 ? 0.09 : -0.09), r * 0.2 + ((top - r * 0.2) * i) / n);
    c.stroke();
  };
  spring(-hb); spring(hb);
  c.fillStyle = v.color;
  const rr = (x: number, y: number, w: number, h: number, rad: number, fill: string) => {
    c.fillStyle = fill; c.beginPath();
    c.moveTo(x + rad, y); c.lineTo(x + w - rad, y); c.quadraticCurveTo(x + w, y, x + w, y + rad);
    c.lineTo(x + w, y + h - rad); c.quadraticCurveTo(x + w, y + h, x + w - rad, y + h);
    c.lineTo(x + rad, y + h); c.quadraticCurveTo(x, y + h, x, y + h - rad);
    c.lineTo(x, y + rad); c.quadraticCurveTo(x, y, x + rad, y); c.closePath(); c.fill();
  };
  const L = v.bodyLength, H = v.bodyHeight, x0 = -L / 2 + 0.05 * L;
  const window_ = (x: number, y: number, w: number, h: number) => rr(x, y, w, h, 0.07, '#bfe6ff');
  if (kind === 'truck') {
    rr(x0, rise, L * 0.6, H * 0.55, 0.08, '#8a5a35');            // cargo bed
    rr(x0 + 0.1, rise + H * 0.45, L * 0.55, H * 0.28, 0.06, '#c58d57'); // cargo
    rr(x0 + L * 0.58, rise, L * 0.4, H * 0.5, 0.1, v.color);       // hood
    rr(x0 + L * 0.58, rise + H * 0.3, L * 0.27, H * 0.7, 0.12, v.color); // cab
    window_(x0 + L * 0.62, rise + H * 0.58, L * 0.19, H * 0.32);
  } else if (kind === 'van') {
    rr(x0, rise, L * 0.95, H * 0.95, 0.18, v.color);
    rr(x0 + L * 0.66, rise + H * 0.5, L * 0.26, H * 0.36, 0.08, '#bfe6ff');
    rr(x0 + L * 0.05, rise + H * 0.3, L * 0.5, H * 0.1, 0.03, 'rgba(255,255,255,0.8)');
  } else if (kind === 'bus') {
    rr(x0, rise, L * 0.95, H, 0.2, v.color);
    rr(x0, rise + H * 0.28, L * 0.95, H * 0.08, 0, 'rgba(0,0,0,0.25)');
    for (let i = 0; i < 6; i++) window_(x0 + L * (0.07 + i * 0.13), rise + H * 0.55, L * 0.1, H * 0.3);
    rr(x0 + L * 0.84, rise + H * 0.55, L * 0.1, H * 0.34, 0.06, '#bfe6ff');
  } else { // dumper
    c.save(); c.translate(x0 + L * 0.03, rise + H * 0.15); c.rotate(0.06);
    rr(0, 0, L * 0.62, H * 0.7, 0.1, '#6e4aaa'); c.restore();
    rr(x0 + L * 0.5, rise, L * 0.5, H * 0.55, 0.1, v.color);
    rr(x0 + L * 0.62, rise + H * 0.35, L * 0.34, H * 0.65, 0.12, v.color);
    window_(x0 + L * 0.7, rise + H * 0.62, L * 0.2, H * 0.28);
  }
  // headlight + tail light
  c.fillStyle = '#fff3a0'; c.beginPath(); c.arc(x0 + L * 0.97, rise + H * 0.22, 0.09, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#e03131'; c.beginPath(); c.arc(x0 - 0.0, rise + H * 0.2, 0.07, 0, Math.PI * 2); c.fill();
  wheel(-hb, d.spinRear); wheel(hb, d.spinFront);
  c.restore();
}

