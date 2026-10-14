import { describe, expect, it } from 'vitest';
import { Camera, clientToCanvas } from '../src/game/camera';

describe('camera / pointer transform', () => {
  it('round-trips world <-> screen at many scales and offsets', () => {
    for (const scale of [4, 9.5, 20, 47, 120]) {
      const cam = new Camera();
      cam.scale = scale; cam.offsetX = 37.3; cam.offsetY = 411.7;
      for (const p of [{ x: 0, y: 0 }, { x: -13.5, y: 4.25 }, { x: 31, y: -9 }]) {
        const back = cam.screenToWorld(cam.worldToScreen(p));
        expect(back.x).toBeCloseTo(p.x, 9);
        expect(back.y).toBeCloseTo(p.y, 9);
      }
    }
  });
  it('fit() keeps the whole build area inside the margins for several viewports', () => {
    const area = { minX: -1.5, maxX: 25.5, minY: -9, maxY: 7 };
    const margin = { top: 60, bottom: 90, left: 10, right: 10 };
    for (const [w, h] of [[390, 844], [844, 390], [1280, 720], [2560, 1440]]) {
      const cam = new Camera();
      cam.fit(area, w, h, margin);
      const tl = cam.worldToScreen({ x: area.minX, y: area.maxY });
      const br = cam.worldToScreen({ x: area.maxX, y: area.minY });
      expect(tl.x).toBeGreaterThanOrEqual(margin.left - 0.5);
      expect(br.x).toBeLessThanOrEqual(w - margin.right + 0.5);
      expect(tl.y).toBeGreaterThanOrEqual(margin.top - 0.5);
      expect(br.y).toBeLessThanOrEqual(h - margin.bottom + 0.5);
    }
  });
  it('client coordinates map to CSS px independent of device pixel ratio', () => {
    const rect = { left: 12, top: 30 };
    // CSS px coordinates never include DPR; the canvas backing store is scaled separately.
    expect(clientToCanvas(112, 130, rect)).toEqual({ x: 100, y: 100 });
  });
});
