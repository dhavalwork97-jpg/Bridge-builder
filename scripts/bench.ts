/** Measures solver cost per rendered frame (1/60 s of simulated time = 10 substeps x 2 iterations). */
import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS, buildSolution, deckTruss } from '../src/levels/solutions';
import { Simulation } from '../src/sim/solver';
import { gapLevel } from '../tests/fixtures';

function bench(name: string, sim: Simulation, frames = 600) {
  for (let i = 0; i < 60; i++) sim.step(); // warm-up
  const t0 = performance.now();
  for (let i = 0; i < frames; i++) sim.step();
  const per = (performance.now() - t0) / frames;
  console.log(`${name.padEnd(34)} beams=${String(sim.beams.length).padStart(3)}  ${per.toFixed(3)} ms/frame  (${(per / 16.67 * 100).toFixed(1)}% of a 60fps budget on this machine)`);
}
for (const id of [1, 6, 10, 18, 20]) {
  const lvl = LEVELS[id - 1];
  const { graph } = buildSolution(lvl, SOLUTIONS[id]);
  bench(`level ${id} reference`, new Simulation(lvl, graph.nodes, graph.beams));
}
// stress: a deliberately large truss (many small panels)
const big = gapLevel({ budget: 1e9 });
const { graph } = buildSolution(big, deckTruss(0, 0, 12, 0, 6, 3));
bench('12m truss, 6 panels', new Simulation(big, graph.nodes, graph.beams));
const hug = gapLevel({ budget: 1e9, buildArea: { minX: -1.5, maxX: 41.5, minY: -10, maxY: 6 }, anchors: [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 0, y: -3 }, { x: 40, y: -3 }], landmasses: [{ top: [{ x: -14, y: 0 }, { x: 0, y: 0 }] }, { top: [{ x: 40, y: 0 }, { x: 54, y: 0 }] }], goalX: 46 });
const h2 = buildSolution(hug, deckTruss(0, 0, 40, 0, 16, 3));
bench('40m truss, 16 panels (~60 beams)', new Simulation(hug, h2.graph.nodes, h2.graph.beams));
