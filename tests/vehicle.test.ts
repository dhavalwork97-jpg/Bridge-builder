import { describe, expect, it } from 'vitest';
import { BridgeGraph } from '../src/sim/graph';
import { runHeadless } from '../src/sim/run';
import { Simulation } from '../src/sim/solver';
import { FixedStepper } from '../src/game/loop';
import { buildSolution, deckTruss } from '../src/levels/solutions';
import { PHYSICS } from '../src/config';
import { gapLevel } from './fixtures';

describe('vehicle', () => {
  it('crosses a valid bridge and destination detection fires', () => {
    const lvl = gapLevel();
    const { graph } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3));
    const r = runHeadless(lvl, graph.nodes, graph.beams, 40);
    expect(r.won).toBe(true);
    expect(r.sim.rearWheel.x).toBeGreaterThanOrEqual(lvl.goalX);
    expect(r.sim.progress).toBe(1);
    expect(r.sim.events.some((e) => e.type === 'win')).toBe(true);
  });
  it('wheels follow the road surface (rests one radius above deck) and load the bridge', () => {
    const lvl = gapLevel({ anchors: [{ x: 0, y: 0 }, { x: 12, y: 0 }, { x: 0, y: -3 }, { x: 12, y: -3 }] });
    const { graph } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3));
    const sim = new Simulation(lvl, graph.nodes, graph.beams);
    let sawLoad = false;
    while (sim.state === 'running' && sim.time < 20) {
      sim.step();
      const w = sim.rearWheel;
      if (w.x > 3 && w.x < 9 && w.beam >= 0) {
        sawLoad = true;
        expect(w.y).toBeGreaterThan(-0.6); // stays on the (slightly deflected) deck
      }
    }
    expect(sawLoad).toBe(true);
    expect(Math.min(...sim.beams.map((b) => Math.min(b.force, 0)))).toBeLessThan(-500); // members carry real load
  });
  it('a missing road section makes the vehicle lose support and fall', () => {
    const lvl = gapLevel();
    const g = new BridgeGraph(lvl);
    const r = runHeadless(lvl, g.nodes, g.beams, 40);
    expect(r.won).toBe(false);
    expect(r.reason).toBe('fell');
    expect(r.sim.rearWheel.y).toBeLessThan(PHYSICS.killY + 1);
  });
  it('a road that stops short of the far bank fails', () => {
    const lvl = gapLevel();
    const g = new BridgeGraph(lvl);
    g.connect(g.nodeAt({ x: 0, y: 0 }, 0.1)!.id, { point: { x: 6, y: 0 } }, 'road');
    const r = runHeadless(lvl, g.nodes, g.beams, 40);
    expect(r.won).toBe(false);
  });
  it('a bridge that breaks under load can drop the vehicle', () => {
    const lvl = gapLevel({ vehicle: 'dumper' });
    const { graph } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3, { chord: 'wood', vert: 'wood', diag: 'wood' }));
    const r = runHeadless(lvl, graph.nodes, graph.beams, 60);
    expect(r.broken).toBeGreaterThan(0);
    expect(r.won).toBe(false);
    expect(['fell', 'stuck', 'flipped', 'timeout']).toContain(r.reason);
  });
  it('pause/resume does not corrupt the simulation (stepper + sim identical to uninterrupted run)', () => {
    const lvl = gapLevel();
    const { graph } = buildSolution(lvl, deckTruss(0, 0, 12, 0, 3, 3));
    const a = new Simulation(lvl, graph.nodes, graph.beams);
    const b = new Simulation(lvl, graph.nodes, graph.beams);
    for (let i = 0; i < 400; i++) a.step();
    const stepper = new FixedStepper();
    let steps = 0, frame = 0;
    while (steps < 400) {
      frame++;
      const paused = frame > 100 && frame < 400; // long pause in the middle
      const n = stepper.advance(1 / 60, paused);
      for (let i = 0; i < n && steps < 400; i++) { b.step(); steps++; }
    }
    expect(b.wheels[0].x).toBe(a.wheels[0].x);
    expect(b.time).toBeCloseTo(a.time, 9);
  });
  it('stepper clamps huge frame deltas and drops backlog', () => {
    const s = new FixedStepper();
    expect(s.advance(5, false)).toBeLessThanOrEqual(8);
    expect(s.advance(1 / 60, true)).toBe(0);
    expect(s.advance(0, false)).toBe(0);
    expect(s.advance(1 / 60, false)).toBe(1);
  });
});
