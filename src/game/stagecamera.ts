import { PerspectiveCamera, Vector3 } from 'three';
import type { Vec2 } from '../types';

/** What construction/overlay code needs from a camera: the build plane (z = 0) <-> CSS pixels. */
export interface CameraLike {
  readonly scale: number;
  worldToScreen(p: Vec2): Vec2;
  screenToWorld(p: Vec2): Vec2;
}

export interface FitArea { minX: number; maxX: number; minY: number; maxY: number }
export interface FitMargin { top: number; bottom: number; left: number; right: number }

/**
 * 2.5D camera: a gently tilted, narrow-FOV perspective camera looking at the side-on build plane.
 * Gameplay stays 2D; pointer input is mapped by intersecting the view ray with the plane z = 0, so
 * building is exact no matter how the camera is angled.
 */
export class StageCamera implements CameraLike {
  readonly three = new PerspectiveCamera(24, 1, 1, 600);
  /** Pixels per metre on the build plane at the focus point (average of x and y directions). */
  scale = 20;
  yaw = -0.2;     // radians, rotates the view around the vertical axis
  pitch = 0.2;    // radians, camera sits slightly above the plane
  distance = 40;
  readonly target = new Vector3();
  private w = 1;
  private h = 1;
  private baseOffX = 0;
  private baseOffY = 0;
  private shakeX = 0;
  private shakeY = 0;
  private readonly v = new Vector3();
  private readonly v2 = new Vector3();

  worldToScreen(p: Vec2): Vec2 {
    this.v.set(p.x, p.y, 0).project(this.three);
    return { x: (this.v.x + 1) * 0.5 * this.w, y: (1 - this.v.y) * 0.5 * this.h };
  }

  screenToWorld(p: Vec2): Vec2 {
    const nx = (p.x / this.w) * 2 - 1, ny = 1 - (p.y / this.h) * 2;
    const a = this.v.set(nx, ny, -1).unproject(this.three);
    const b = this.v2.set(nx, ny, 1).unproject(this.three);
    const dz = b.z - a.z;
    const t = Math.abs(dz) < 1e-9 ? 0 : -a.z / dz;
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  /** Fit a world rectangle (on the build plane) into the viewport, leaving CSS-pixel margins for HUD panels. */
  fit(area: FitArea, viewW: number, viewH: number, margin: FitMargin): void {
    this.w = Math.max(1, viewW); this.h = Math.max(1, viewH);
    const availW = Math.max(50, this.w - margin.left - margin.right);
    const availH = Math.max(50, this.h - margin.top - margin.bottom);
    this.three.aspect = this.w / this.h;
    this.target.set((area.minX + area.maxX) / 2, (area.minY + area.maxY) / 2, 0);
    const corners = [[area.minX, area.minY], [area.maxX, area.minY], [area.minX, area.maxY], [area.maxX, area.maxY]];
    let bw = 1, bh = 1, cx = 0, cy = 0;
    const measure = () => {
      this.place();
      this.three.clearViewOffset();
      this.three.updateProjectionMatrix();
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const [x, y] of corners) {
        const s = this.worldToScreen({ x, y });
        x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y);
      }
      bw = x1 - x0; bh = y1 - y0; cx = (x0 + x1) / 2; cy = (y0 + y1) / 2;
    };
    this.distance = 40;
    for (let i = 0; i < 6; i++) { measure(); this.distance *= Math.max(bw / availW, bh / availH); }
    measure();
    // shift the image so the fitted box is centred in the available rectangle
    const shiftX = margin.left + availW / 2 - cx, shiftY = margin.top + availH / 2 - cy;
    this.baseOffX = -shiftX; this.baseOffY = -shiftY;
    this.applyOffset();
    const p0 = this.worldToScreen({ x: this.target.x, y: this.target.y });
    const px = this.worldToScreen({ x: this.target.x + 1, y: this.target.y });
    const py = this.worldToScreen({ x: this.target.x, y: this.target.y + 1 });
    this.scale = Math.sqrt(Math.hypot(px.x - p0.x, px.y - p0.y) * Math.hypot(py.x - p0.x, py.y - p0.y));
  }

  /** Screen shake in CSS pixels (applied as a view offset so overlays stay aligned). */
  setShake(dx: number, dy: number): void {
    if (dx === this.shakeX && dy === this.shakeY) return;
    this.shakeX = dx; this.shakeY = dy;
    this.applyOffset();
  }

  private applyOffset(): void {
    this.three.setViewOffset(this.w, this.h, this.baseOffX - this.shakeX, this.baseOffY - this.shakeY, this.w, this.h);
    this.three.updateProjectionMatrix();
    this.three.updateMatrixWorld(true);
  }

  private place(): void {
    const cp = Math.cos(this.pitch);
    this.three.position.set(
      this.target.x + this.distance * Math.sin(this.yaw) * cp,
      this.target.y + this.distance * Math.sin(this.pitch),
      this.target.z + this.distance * Math.cos(this.yaw) * cp,
    );
    this.three.lookAt(this.target);
    this.three.updateMatrixWorld(true);
  }
}
