import { describe, expect, it } from 'vitest';
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS, buildSolution } from '../src/levels/solutions';
import { runHeadless } from '../src/sim/run';
import { analyzeStructure } from '../src/sim/analysis';
import { countMaterials, evaluate } from '../src/game/scoring';
import { VEHICLES } from '../src/config';
import { groundHeightAt } from '../src/sim/terrain';

describe('level data', () => {
  it('ships exactly 20 levels with unique sequential ids and 4 tiers of 5', () => {
    expect(LEVELS.map((l) => l.id)).toEqual(Array.from({ length: 20 }, (_, i) => i + 1));
    for (let t = 1; t <= 4; t++) expect(LEVELS.filter((l) => l.tier === t)).toHaveLength(5);
    expect(new Set(LEVELS.map((l) => l.name)).size).toBe(20);
  });
  for (const lvl of LEVELS) {
    it(`L${lvl.id} "${lvl.name}" has valid configuration`, () => {
      expect(lvl.budget).toBeGreaterThan(0);
      expect(lvl.goldBudget).toBeGreaterThan(0);
      expect(lvl.goldBudget).toBeLessThanOrEqual(lvl.budget);
      expect(lvl.materials.length).toBeGreaterThan(0);
      expect(lvl.materials).toContain('road');
      expect(VEHICLES[lvl.vehicle]).toBeDefined();
      expect(lvl.hint.length).toBeGreaterThan(10);
      expect(lvl.landmasses.length).toBeGreaterThanOrEqual(2);
      for (const lm of lvl.landmasses) for (let i = 1; i < lm.top.length; i++) expect(lm.top[i].x).toBeGreaterThan(lm.top[i - 1].x);
      expect(groundHeightAt(lvl.landmasses, lvl.startX)).not.toBe(-Infinity);
      expect(groundHeightAt(lvl.landmasses, lvl.goalX)).not.toBe(-Infinity);
      expect(lvl.goalX).toBeGreaterThan(lvl.startX);
      const ba = lvl.buildArea;
      for (const a of lvl.anchors) {
        expect(a.x).toBeGreaterThanOrEqual(ba.minX); expect(a.x).toBeLessThanOrEqual(ba.maxX);
        expect(a.y).toBeGreaterThanOrEqual(ba.minY); expect(a.y).toBeLessThanOrEqual(ba.maxY);
      }
      // anchors sit on the 0.5 m grid so players can reach them predictably
      for (const a of lvl.anchors) { expect(a.x * 2).toBeCloseTo(Math.round(a.x * 2), 9); expect(a.y * 2).toBeCloseTo(Math.round(a.y * 2), 9); }
    });
    it(`L${lvl.id} reference solution is buildable within budget, wins safely and earns 3 stars`, () => {
      const { graph, errors } = buildSolution(lvl, SOLUTIONS[lvl.id]);
      expect(errors).toEqual([]);
      expect(graph.usedBudget).toBeLessThanOrEqual(lvl.budget);
      expect(analyzeStructure(lvl, graph.nodes, graph.beams).hint).toBe('ok');
      const r = runHeadless(lvl, graph.nodes, graph.beams, 80);
      expect(r.won, `failed: ${r.reason}`).toBe(true);
      expect(r.broken).toBe(0);
      const ev = evaluate(lvl, { won: true, cost: graph.usedBudget, brokenCount: r.broken, peakUtil: r.peakUtil, beamCount: graph.beams.length, materialCounts: countMaterials(graph.beams) });
      expect(ev.costOk, `cost ${graph.usedBudget} vs gold ${lvl.goldBudget}`).toBe(true);
      expect(ev.challengeOk, `peak ${r.peakUtil.toFixed(2)} vs ${lvl.challenge.text}`).toBe(true);
      expect(ev.stars).toBe(3);
    }, 60000);
    it(`L${lvl.id} is not trivially solved by an empty build`, () => {
      const { graph } = buildSolution(lvl, []);
      const r = runHeadless(lvl, graph.nodes, graph.beams, 60);
      expect(r.won).toBe(false);
    }, 30000);
  }
  it('tiers escalate: later tiers have larger gaps or heavier vehicles on average', () => {
    const load = (t: number) => LEVELS.filter((l) => l.tier === t).reduce((s, l) => s + VEHICLES[l.vehicle].mass * (l.buildArea.maxX - l.buildArea.minX), 0);
    expect(load(2)).toBeGreaterThan(load(1));
    expect(load(3)).toBeGreaterThan(load(2) * 0.8);
    expect(load(4)).toBeGreaterThan(load(3));
  });
});

describe('scoring', () => {
  const lvl = LEVELS[1];
  const base = { won: true, cost: lvl.goldBudget, brokenCount: 0, peakUtil: 0.5, beamCount: 4, materialCounts: { road: 2, wood: 2 } };
  it('no stars when the vehicle does not arrive', () => {
    expect(evaluate(lvl, { ...base, won: false }).stars).toBe(0);
  });
  it('cost star requires being within gold budget AND no breakage', () => {
    expect(evaluate(lvl, { ...base, cost: lvl.goldBudget + 1, beamCount: 9 }).stars).toBe(1);
    expect(evaluate(lvl, { ...base, brokenCount: 1, beamCount: 9 }).stars).toBe(1);
    expect(evaluate(lvl, { ...base, beamCount: 9 }).stars).toBe(2);
    expect(evaluate(lvl, base).stars).toBe(3);
  });
  it('safety and material challenges are evaluated', () => {
    const safe = LEVELS.find((l) => l.challenge.type === 'safety')!;
    expect(evaluate(safe, { ...base, cost: 1, peakUtil: 0.99 }).challengeOk).toBe(false);
    const noWood = LEVELS.find((l) => l.challenge.type === 'noMaterial')!;
    expect(evaluate(noWood, { ...base, cost: 1, materialCounts: { wood: 1 } }).challengeOk).toBe(false);
    expect(evaluate(noWood, { ...base, cost: 1, materialCounts: { road: 3 } }).challengeOk).toBe(true);
  });
});
