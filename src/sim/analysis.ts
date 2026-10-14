import type { BBeam, BNode, LevelDef } from '../types';
import { MATERIALS } from '../config';
import { terrainSegments, type Segment } from './terrain';

export type StructureHint = 'ok' | 'noRoad' | 'roadGap' | 'floating';

export interface StructureReport {
  hint: StructureHint;
  roadConnected: boolean;
  /** Members belonging to components with no anchor (they will simply fall). */
  floatingBeams: number[];
}

function distToSeg(px: number, py: number, s: Segment): number {
  const ex = s.bx - s.ax, ey = s.by - s.ay;
  const l2 = ex * ex + ey * ey || 1;
  const t = Math.max(0, Math.min(1, ((px - s.ax) * ex + (py - s.ay) * ey) / l2));
  return Math.hypot(px - (s.ax + ex * t), py - (s.ay + ey * t));
}

/** Which landmass an anchor belongs to (nearest surface within 0.75 m), or -1 for aerial anchors. */
function landmassOf(level: LevelDef, n: BNode): number {
  let best = -1, bd = 0.75;
  level.landmasses.forEach((lm, i) => {
    for (const s of terrainSegments([lm])) {
      const d = distToSeg(n.x, n.y, s);
      if (d < bd) { bd = d; best = i; }
    }
  });
  return best;
}

/**
 * Load-path analysis: are the start and destination landmasses linked by a chain of road
 * members (landmasses act as rigid ground), and does every member connect to the ground?
 */
export function analyzeStructure(level: LevelDef, nodes: BNode[], beams: BBeam[]): StructureReport {
  const parent = new Map<string, string>();
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k);
    let r = k;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(k, r);
    return r;
  };
  const union = (a: string, b: string) => { parent.set(find(a), find(b)); };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  // ground connectivity (all materials): anchors in the same landmass are one rigid body
  for (const n of nodes) {
    if (!n.fixed) continue;
    const lm = landmassOf(level, n);
    union(`n${n.id}`, lm >= 0 ? `g${lm}` : `g-air`);
  }
  // road-only connectivity
  const roadParent = new Map<string, string>();
  const rfind = (k: string): string => {
    if (!roadParent.has(k)) roadParent.set(k, k);
    let r = k;
    while (roadParent.get(r) !== r) r = roadParent.get(r)!;
    roadParent.set(k, r);
    return r;
  };
  const runion = (a: string, b: string) => { roadParent.set(rfind(a), rfind(b)); };
  for (const n of nodes) {
    if (!n.fixed) continue;
    const lm = landmassOf(level, n);
    if (lm >= 0) runion(`n${n.id}`, `g${lm}`);
  }
  let roadCount = 0;
  for (const b of beams) {
    union(`n${b.a}`, `n${b.b}`);
    if (MATERIALS[b.material].drivable) { runion(`n${b.a}`, `n${b.b}`); roadCount++; }
  }
  const startLm = level.landmasses.findIndex((lm) => lm.top[0].x <= level.startX && lm.top[lm.top.length - 1].x >= level.startX);
  const goalLm = level.landmasses.findIndex((lm) => lm.top[0].x <= level.goalX && lm.top[lm.top.length - 1].x >= level.goalX);
  const roadConnected = startLm >= 0 && goalLm >= 0 && rfind(`g${startLm}`) === rfind(`g${goalLm}`);

  const groundRoots = new Set<string>();
  for (const n of nodes) if (n.fixed) groundRoots.add(find(`n${n.id}`));
  const floating: number[] = [];
  for (const b of beams) {
    if (!byId.has(b.a)) continue;
    if (!groundRoots.has(find(`n${b.a}`))) floating.push(b.id);
  }
  const hint: StructureHint = roadCount === 0 ? 'noRoad' : !roadConnected ? 'roadGap' : floating.length ? 'floating' : 'ok';
  return { hint, roadConnected, floatingBeams: floating };
}
