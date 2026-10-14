import { SCORING } from '../config';
import type { BBeam, Challenge, LevelDef, MaterialId } from '../types';

export interface RunSummary {
  won: boolean;
  cost: number;
  brokenCount: number;
  peakUtil: number;
  beamCount: number;
  materialCounts: Partial<Record<MaterialId, number>>;
}

export interface Evaluation {
  stars: 0 | 1 | 2 | 3;
  completed: boolean;
  costOk: boolean;
  challengeOk: boolean;
}

export function countMaterials(beams: BBeam[]): Partial<Record<MaterialId, number>> {
  const out: Partial<Record<MaterialId, number>> = {};
  for (const b of beams) out[b.material] = (out[b.material] ?? 0) + 1;
  return out;
}

export function challengeMet(c: Challenge, s: RunSummary): boolean {
  switch (c.type) {
    case 'maxBeams': return s.beamCount <= c.value;
    case 'noMaterial': return (s.materialCounts[c.material] ?? 0) === 0;
    case 'onlyMaterials': return (Object.keys(s.materialCounts) as MaterialId[]).every((m) => c.materials.includes(m));
    case 'safety': return s.peakUtil <= c.ratio;
  }
}

/**
 * Star 1: the vehicle reached the destination.
 * Star 2: ...at or below the gold budget AND with no member breaking (a cheap bridge that
 *         fails parts on the way is not rewarded).
 * Star 3: ...meeting the level's optional challenge (also requires nothing broke).
 */
export function evaluate(level: LevelDef, s: RunSummary): Evaluation {
  if (!s.won) return { stars: 0, completed: false, costOk: false, challengeOk: false };
  const noBreak = !SCORING.requireNoBreakForCostStar || s.brokenCount === 0;
  const costOk = noBreak && s.cost <= level.goldBudget;
  const challengeOk = noBreak && challengeMet(level.challenge, s);
  const stars = (1 + (costOk ? 1 : 0) + (challengeOk ? 1 : 0)) as 1 | 2 | 3;
  return { stars, completed: true, costOk, challengeOk };
}
