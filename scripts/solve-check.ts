import { LEVELS } from '../src/levels/levels';
import { SOLUTIONS, buildSolution } from '../src/levels/solutions';
import { runHeadless } from '../src/sim/run';

const only = process.argv[2] ? Number(process.argv[2]) : undefined;
for (const real of LEVELS) {
  if (only && real.id !== only) continue;
  const lvl = { ...real, budget: 1e9 }; // design check ignores the budget; budgets are verified in tests
  const { graph, errors } = buildSolution(lvl, SOLUTIONS[lvl.id]);
  const r = runHeadless(lvl, graph.nodes, graph.beams, 60);
  const worst = [...r.sim.beams].sort((a, b) => b.util - a.util)[0];
  const brokenIds = r.sim.beams.filter((b) => b.broken).map((b) => `${b.material[0]}${b.id}`).join(',');
  console.log(`L${lvl.id} ${lvl.name.padEnd(16)} ${lvl.vehicle.padEnd(6)} ${r.won ? 'WIN ' : 'FAIL'} ${r.reason.padEnd(8)} t=${r.time.toFixed(1)} cost=${graph.usedBudget} (gold ${lvl.goldBudget}, budget ${real.budget}) peak=${r.peakUtil.toFixed(2)} broken=${r.broken}${brokenIds ? ' [' + brokenIds + ']' : ''} beams=${graph.beams.length} errs=${errors.length ? errors.slice(0, 2).join('; ') : 0} worst=${worst?.material}`);
}
