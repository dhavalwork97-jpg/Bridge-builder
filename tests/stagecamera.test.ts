import { describe, expect, it } from 'vitest';
import { StageCamera } from '../src/game/stagecamera';

describe('StageCamera pointer coordinate mapping', () => {
  it.each([
    { width: 1280, height: 720 },
    { width: 844, height: 390 },
    { width: 390, height: 844 },
  ])('round-trips world points through the fitted viewport ($width x $height)', ({ width, height }) => {
    const camera = new StageCamera();
    camera.fit(
      { minX: -2, maxX: 14, minY: -8, maxY: 4 },
      width,
      height,
      { top: 48, bottom: 72, left: 12, right: 12 },
    );
    for (const point of [{ x: 0, y: 0 }, { x: 6, y: -3 }, { x: 12, y: 0 }]) {
      const screen = camera.worldToScreen(point);
      const world = camera.screenToWorld(screen);
      expect(world.x).toBeCloseTo(point.x, 5);
      expect(world.y).toBeCloseTo(point.y, 5);
    }
  });

  it('keeps screen and world mapping aligned after screen shake', () => {
    const camera = new StageCamera();
    camera.fit(
      { minX: -2, maxX: 14, minY: -8, maxY: 4 },
      844,
      390,
      { top: 48, bottom: 72, left: 12, right: 12 },
    );
    camera.setShake(4, -3);
    const point = { x: 5, y: -2 };
    const world = camera.screenToWorld(camera.worldToScreen(point));
    expect(world.x).toBeCloseTo(point.x, 5);
    expect(world.y).toBeCloseTo(point.y, 5);
  });
});
