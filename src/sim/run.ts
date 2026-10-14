import { PHYSICS } from '../config';
import type { BBeam, BNode, LevelDef } from '../types';
import { Simulation } from './solver';

export interface RunResult {
  sim: Simulation;
  won: boolean;
  reason: string;
  time: number;
  peakUtil: number;
  broken: number;
}

/** Headless deterministic run used by tests, the level solvability check and benchmarks. */
export function runHeadless(level: LevelDef, nodes: BNode[], beams: BBeam[], maxTime = PHYSICS.timeout, onFrame?: (s: Simulation) => void): RunResult {
  const sim = new Simulation(level, nodes, beams);
  const maxFrames = Math.ceil(maxTime / PHYSICS.fixedDt);
  for (let i = 0; i < maxFrames && sim.state === 'running'; i++) {
    sim.step();
    onFrame?.(sim);
  }
  // let the vehicle settle after a win so we also catch late failures of the structure
  return { sim, won: sim.state === 'won', reason: sim.failReason, time: sim.time, peakUtil: sim.peakUtil, broken: sim.brokenCount };
}
