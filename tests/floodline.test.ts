import { describe, expect, it } from 'vitest';
import { PHYSICS } from '../src/config';
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS, buildSolution } from '../src/levels/solutions';
import { Simulation } from '../src/sim/solver';

describe('Floodline Rescue water model', () => {
  it('keeps the standard campaign waterline unchanged', () => {
    const sim = new Simulation(LEVELS[0], [], []);
    sim.time = 6;
    expect(sim.waterLevel).toBe(PHYSICS.waterY);
  });

  it('raises the rescue waterline deterministically from the normal starting level', () => {
    const sim = new Simulation(LEVELS[0], [], [], true);
    expect(sim.waterLevel).toBe(PHYSICS.waterY);
    sim.time = 6;
    expect(sim.waterLevel).toBeCloseTo(-4.2, 6);
    sim.time = 12;
    expect(sim.waterLevel).toBeCloseTo(0.6, 6);
    sim.time = 30;
    expect(sim.waterLevel).toBeCloseTo(0.6, 6);
  });

  it('allows the reference short-hop design to finish before the flood reaches the road', () => {
    const level = LEVELS[1];
    const { graph, errors } = buildSolution(level, SOLUTIONS[level.id]);
    expect(errors).toEqual([]);
    const sim = new Simulation(level, graph.nodes, graph.beams, true);
    for (let i = 0; i < 14 * 60 && sim.state === 'running'; i++) sim.step();
    expect(sim.state).toBe('won');
    expect(sim.time).toBeLessThan(12);
  });

  it('fails a rescue run when floodwater reaches a low vehicle wheel', () => {
    const sim = new Simulation(LEVELS[0], [], [], true);
    sim.time = 12;
    sim.wheels[0].x = 2; sim.wheels[0].y = 0.1;
    sim.wheels[1].x = 2; sim.wheels[1].y = 0.1;
    sim.step();
    expect(sim.state).toBe('failed');
    expect(sim.failReason).toBe('flood');
  });
});
