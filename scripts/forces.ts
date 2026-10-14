import { MATERIALS } from '../src/config';
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS, buildSolution } from '../src/levels/solutions';
import { Simulation } from '../src/sim/solver';
// Disable breaking so we can see the force envelope of a design.
for (const m of Object.values(MATERIALS)) { m.maxTension = 1e9; m.maxCompression = m.maxCompression === 0 ? 0 : 1e9; }
const id = Number(process.argv[2]);
const lvl = LEVELS.find((l) => l.id === id)!;
const { graph } = buildSolution(lvl, SOLUTIONS[id]);
const sim = new Simulation(lvl, graph.nodes, graph.beams);
const maxT = new Map<number, number>(), maxC = new Map<number, number>();
for (let i = 0; i < 60 * 25 && sim.state === 'running'; i++) {
  sim.step();
  for (const b of sim.beams) {
    maxT.set(b.id, Math.max(maxT.get(b.id) ?? 0, b.force));
    maxC.set(b.id, Math.min(maxC.get(b.id) ?? 0, b.force));
  }
}
console.log('state', sim.state, sim.failReason, 't', sim.time.toFixed(1));
for (const b of sim.beams) {
  const A = sim.nodes[b.a], B = sim.nodes[b.b];
  console.log(`${b.material.padEnd(5)} #${String(b.id).padEnd(2)} (${A.x.toFixed(1)},${A.y.toFixed(1)})-(${B.x.toFixed(1)},${B.y.toFixed(1)}) maxT=${((maxT.get(b.id) ?? 0) / 1000).toFixed(1)} kN maxC=${((maxC.get(b.id) ?? 0) / 1000).toFixed(1)} kN`);
}
