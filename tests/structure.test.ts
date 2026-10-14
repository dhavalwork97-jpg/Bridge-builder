import { describe, expect, it } from 'vitest';
import { BridgeGraph } from '../src/sim/graph';
import { analyzeStructure } from '../src/sim/analysis';
import { runHeadless } from '../src/sim/run';
import { Simulation } from '../src/sim/solver';
import { rng } from '../src/math';
import { PHYSICS } from '../src/config';
import { buildSolution, deckTruss } from '../src/levels/solutions';
import { gapLevel } from './fixtures';
import type { BNode, BBeam } from '../src/types';

const finiteSim = (s: Simulation) =>
  s.nodes.every((n) => Number.isFinite(n.x) && Number.isFinite(n.y)) &&
  s.wheels.every((w) => Number.isFinite(w.x) && Number.isFinite(w.y)) &&
  s.beams.every((b) => Number.isFinite(b.force));

describe('structural solver', () => {
  it('an unsupported road span between fixed anchors can fail under a heavy vehicle', () => {
    const lvl = gapLevel({
      vehicle: 'dumper',
      anchors: [{ x: 0, y: 0 }, { x: 6, y: 0 }, { x: 0, y: -3 }, { x: 6, y: -3 }],
      landmasses: [
        { top: [{ x: -14, y: 0 }, { x: 0, y: 0 }] },
        { top: [{ x: 6, y: 0 }, { x: 26, y: 0 }] },
      ],
    });
    const graph = new BridgeGraph(lvl);
    const [left, right] = graph.nodes;
    expect(graph.connect(left.id, { nodeId: right.id }, 'road').ok).toBe(true);

    const result = runHeadless(lvl, graph.nodes, graph.beams, 40);
    expect(result.broken).toBeGreaterThan(0);
    expect(result.won).toBe(false);
    expect(result.sim.events.some((event) => event.type === 'break')).toBe(true);
  });
  it('a long road deck span between movable supported joints can fail under wheel load', () => {
    const lvl = gapLevel({
      vehicle: 'dumper',
      anchors: [{ x: 0, y: -3 }, { x: 6, y: -3 }],
      landmasses: [
        { top: [{ x: -14, y: 0 }, { x: 0, y: 0 }] },
        { top: [{ x: 6, y: 0 }, { x: 26, y: 0 }] },
      ],
    });
    const nodes: BNode[] = [
      { id: 1, x: 0, y: -3, kind: 'anchor', fixed: true },
      { id: 2, x: 6, y: -3, kind: 'anchor', fixed: true },
      { id: 3, x: 0, y: 0, kind: 'junction', fixed: false },
      { id: 4, x: 6, y: 0, kind: 'junction', fixed: false },
    ];
    const beams: BBeam[] = [
      { id: 1, a: 3, b: 4, material: 'road' },
      { id: 2, a: 1, b: 3, material: 'steel' },
      { id: 3, a: 2, b: 4, material: 'steel' },
    ];
    const result = runHeadless(lvl, nodes, beams, 40);
    expect(result.broken).toBeGreaterThan(0);
    expect(result.won).toBe(false);
    expect(result.sim.events.some((event) => event.type === 'break')).toBe(true);
  });
  it('a braced truss carries the test vehicle without breakage', () => {
    const lvl = gapLevel();
    const { graph, errors } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3, { chord: 'steel', vert: 'steel', diag: 'steel' }));
    expect(errors).toEqual([]);
    const r = runHeadless(lvl, graph.nodes, graph.beams, 40);
    expect(r.won).toBe(true);
    expect(r.broken).toBe(0);
    expect(r.peakUtil).toBeLessThan(1);
  });
  it('an overloaded wooden bridge fails: members break, forces stop, vehicle is lost', () => {
    const lvl = gapLevel({ vehicle: 'dumper' });
    const { graph } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3, { chord: 'wood', vert: 'wood', diag: 'wood' }));
    const r = runHeadless(lvl, graph.nodes, graph.beams, 40);
    expect(r.broken).toBeGreaterThan(0);
    expect(r.won).toBe(false);
    for (const b of r.sim.beams.filter((x) => x.broken)) expect(b.force).toBe(0);
    expect(r.sim.events.some((e) => e.type === 'break')).toBe(true);
  });
  const vShape = (material: 'steel' | 'cable') => {
    const lvl = gapLevel({ anchors: [{ x: -2, y: -3 }, { x: 2, y: -3 }], landmasses: [{ top: [{ x: -30, y: -30 }, { x: -29, y: -30 }] }] });
    const g = new BridgeGraph(lvl);
    const [a, b] = g.nodes;
    // free node above both anchors, held up from below
    const r1 = g.connect(a.id, { point: { x: 0, y: 0 } }, material);
    expect(r1.ok).toBe(true);
    const top = g.nodes.find((n) => n.kind === 'junction')!;
    expect(g.connect(b.id, { nodeId: top.id }, material).ok).toBe(true);
    return { lvl, g, top };
  };
  it('steel struts hold a node up from below (compression) but cables do not', () => {
    const steel = vShape('steel');
    const s1 = new Simulation(steel.lvl, steel.g.nodes, steel.g.beams);
    for (let i = 0; i < 240; i++) s1.step();
    const topSteel = s1.nodes.find((n) => !n.fixed)!;
    expect(topSteel.y).toBeGreaterThan(-0.5);
    expect(s1.beams.every((b) => b.force < 0)).toBe(true); // compression is negative

    const cab = vShape('cable');
    const s2 = new Simulation(cab.lvl, cab.g.nodes, cab.g.beams);
    for (let i = 0; i < 240; i++) s2.step();
    const topCable = s2.nodes.find((n) => !n.fixed)!;
    expect(topCable.y).toBeLessThan(-3); // slack cables cannot push: node drops below the anchors
    expect(s2.beams.every((b) => b.force >= -1e-6)).toBe(true);
  });
  it('a cable resists tension (hanging node stays up) with positive force', () => {
    const lvl = gapLevel({ anchors: [{ x: 0, y: 5 }, { x: 4, y: 5 }], landmasses: [{ top: [{ x: -30, y: -30 }, { x: -29, y: -30 }] }] });
    const g = new BridgeGraph(lvl);
    const [a, b] = g.nodes;
    g.connect(a.id, { point: { x: 2, y: 2 } }, 'cable');
    const n = g.nodes.find((x) => x.kind === 'junction')!;
    g.connect(b.id, { nodeId: n.id }, 'cable');
    const s = new Simulation(lvl, g.nodes, g.beams);
    for (let i = 0; i < 240; i++) s.step();
    expect(s.nodes.find((x) => !x.fixed)!.y).toBeGreaterThan(1.5);
    expect(s.beams.every((x) => x.force > 0)).toBe(true);
  });
  it('a manually broken member stops transmitting force', () => {
    const lvl = gapLevel({ anchors: [{ x: 0, y: 5 }, { x: 4, y: 5 }], landmasses: [{ top: [{ x: -30, y: -30 }, { x: -29, y: -30 }] }] });
    const g = new BridgeGraph(lvl);
    const [a, b] = g.nodes;
    g.connect(a.id, { point: { x: 2, y: 2 } }, 'steel');
    const n = g.nodes.find((x) => x.kind === 'junction')!;
    g.connect(b.id, { nodeId: n.id }, 'steel');
    const s = new Simulation(lvl, g.nodes, g.beams);
    for (let i = 0; i < 120; i++) s.step();
    const held = s.nodes.find((x) => !x.fixed)!.y;
    s.beams.forEach((x) => { x.broken = true; });
    for (let i = 0; i < 120; i++) s.step();
    expect(s.nodes.find((x) => !x.fixed)!.y).toBeLessThan(held - 3);
  });
  it('disconnected components fall freely and are reported as floating', () => {
    const lvl = gapLevel();
    const nodes: BNode[] = [
      ...lvl.anchors.map((p, i) => ({ id: i + 1, x: p.x, y: p.y, kind: 'anchor' as const, fixed: true })),
      { id: 10, x: 4, y: 3, kind: 'junction', fixed: false }, { id: 11, x: 7, y: 3, kind: 'junction', fixed: false },
    ];
    const beams: BBeam[] = [{ id: 1, a: 10, b: 11, material: 'steel' }];
    expect(analyzeStructure(lvl, nodes, beams).floatingBeams).toEqual([1]);
    const s = new Simulation(lvl, nodes, beams);
    for (let i = 0; i < 120; i++) s.step();
    expect(s.nodes.filter((n) => !n.fixed).every((n) => n.y < 3 - 5)).toBe(true);
    expect(finiteSim(s)).toBe(true);
  });
  it('load-path analysis reports missing road, gap and ok', () => {
    const lvl = gapLevel();
    const g = new BridgeGraph(lvl);
    expect(analyzeStructure(lvl, g.nodes, g.beams).hint).toBe('noRoad');
    const a = g.nodeAt({ x: 0, y: 0 }, 0.1)!;
    g.connect(a.id, { point: { x: 6, y: 0 } }, 'road');
    expect(analyzeStructure(lvl, g.nodes, g.beams).hint).toBe('roadGap');
    const mid = g.nodeAt({ x: 6, y: 0 }, 0.1)!;
    g.connect(mid.id, { nodeId: g.nodeAt({ x: 12, y: 0 }, 0.1)!.id }, 'road');
    const rep = analyzeStructure(lvl, g.nodes, g.beams);
    expect(rep.roadConnected).toBe(true);
    expect(rep.hint).toBe('ok');
  });
  it('stays finite and does not throw over random seeded layouts', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const rand = rng(seed);
      const lvl = gapLevel({ vehicle: (['truck', 'van', 'bus', 'dumper'] as const)[seed % 4] });
      const g = new BridgeGraph(lvl);
      for (let i = 0; i < 40; i++) {
        const from = g.nodes[Math.floor(rand() * g.nodes.length)];
        const mats = ['road', 'wood', 'steel', 'cable'] as const;
        g.connect(from.id, { point: { x: from.x + (rand() - 0.5) * 12, y: from.y + (rand() - 0.5) * 8 } }, mats[Math.floor(rand() * 4)]);
      }
      const sim = new Simulation(lvl, g.nodes, g.beams);
      for (let f = 0; f < 60 * 12; f++) { sim.step(); if (!finiteSim(sim)) break; }
      expect(finiteSim(sim)).toBe(true);
      expect(sim.numericError).toBe(false);
    }
  });
  it('is deterministic', () => {
    const lvl = gapLevel();
    const { graph } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3));
    const a = runHeadless(lvl, graph.nodes, graph.beams, 20);
    const b = runHeadless(lvl, graph.nodes, graph.beams, 20);
    expect(a.sim.wheels[0].x).toBe(b.sim.wheels[0].x);
    expect(a.peakUtil).toBe(b.peakUtil);
  });
  it('gravity ramp avoids a startup shock on an empty anchored beam', () => {
    const lvl = gapLevel();
    const g = new BridgeGraph(lvl);
    g.connect(g.nodeAt({ x: 0, y: 0 }, 0.1)!.id, { nodeId: g.nodeAt({ x: 0, y: -3 }, 0.1)!.id }, 'wood');
    const s = new Simulation(lvl, g.nodes, g.beams);
    for (let i = 0; i < Math.ceil(PHYSICS.vehicleStartDelay * 60) - 1; i++) s.step();
    expect(s.beams[0].util).toBeLessThan(0.5);
  });
});
