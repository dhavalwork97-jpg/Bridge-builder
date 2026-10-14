import type { LevelDef } from '../src/types';

/** A 12 m flat gap with top and wall anchors; budget generous unless overridden. */
export function gapLevel(over: Partial<LevelDef> = {}): LevelDef {
  return {
    id: 99, name: 'fixture', tier: 1, hint: '',
    landmasses: [
      { top: [{ x: -14, y: 0 }, { x: 0, y: 0 }] },
      { top: [{ x: 12, y: 0 }, { x: 26, y: 0 }] },
    ],
    anchors: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 0, y: -3 }, { x: 12, y: -3 }],
    buildArea: { minX: -1.5, maxX: 13.5, minY: -10, maxY: 6 },
    startX: -8, goalX: 18, budget: 99999, goldBudget: 5000,
    materials: ['road', 'wood', 'steel', 'cable'], vehicle: 'truck',
    challenge: { type: 'safety', ratio: 1, text: '' },
    ...over,
  };
}
