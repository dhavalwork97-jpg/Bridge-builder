import type { Vec2 } from '../types';

/** World (metres, +y up) <-> CSS-pixel screen transform. Pointer events must use CSS px. */
export class Camera {
  scale = 20;       // pixels per metre
  offsetX = 0;      // screen x of world x = 0
  offsetY = 0;      // screen y of world y = 0
  worldToScreen(p: Vec2): Vec2 { return { x: this.offsetX + p.x * this.scale, y: this.offsetY - p.y * this.scale }; }
  screenToWorld(p: Vec2): Vec2 { return { x: (p.x - this.offsetX) / this.scale, y: (this.offsetY - p.y) / this.scale }; }

  /** Fit a world rectangle into the viewport, leaving CSS-pixel margins for HUD panels. */
  fit(area: { minX: number; maxX: number; minY: number; maxY: number }, viewW: number, viewH: number, margin: { top: number; bottom: number; left: number; right: number }): void {
    const availW = Math.max(50, viewW - margin.left - margin.right);
    const availH = Math.max(50, viewH - margin.top - margin.bottom);
    const w = area.maxX - area.minX, h = area.maxY - area.minY;
    this.scale = Math.max(4, Math.min(availW / w, availH / h));
    const cx = margin.left + availW / 2, cy = margin.top + availH / 2;
    this.offsetX = cx - ((area.minX + area.maxX) / 2) * this.scale;
    this.offsetY = cy + ((area.minY + area.maxY) / 2) * this.scale;
  }
}

/** Convert a pointer event's client coordinates to CSS px relative to the canvas box. */
export function clientToCanvas(clientX: number, clientY: number, rect: { left: number; top: number }): Vec2 {
  return { x: clientX - rect.left, y: clientY - rect.top };
}
