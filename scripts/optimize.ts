/** Dev tool: search truss parameters for the cheapest safe reference design of a level. */
import { LEVELS } from '../src/levels/levels';
import { buildSolution, deckTruss, type Seg } from '../src/levels/solutions';
import { runHeadless } from '../src/sim/run';
import type { MaterialId } from '../src/types';

const id = Number(process.argv[2]);
const spans: number[][] = JSON.parse(process.argv[3]); // [[x0,y0,x1,y1],...]
const real = LEVELS.find((l) => l.id === id)!;
const lvl = { ...real, budget: 1e9 };
const allowed = real.materials;
const has = (m: MaterialId) => allowed.includes(m);
const chords = (['wood', 'steel', 'cable'] as MaterialId[]).filter(has);
const verts = (['wood', 'steel'] as MaterialId[]).filter(has);
const diags = verts;
let best: { cost: number; peak: number; desc: string } | undefined;
for (const panels of [2, 3, 4, 5, 6]) {
  for (const depth of [3, 5, 7]) {
    for (const chord of chords) for (const vert of verts) for (const diag of diags) {
      let ok = true;
      const segs: Seg[] = [];
      for (const [x0, y0, x1, y1] of spans) {
        const w = (x1 - x0) / panels;
        if (w > 8 || w < 1.8) { ok = false; break; }
        segs.push(...deckTruss(x0, y0, x1, y1, panels, depth, { chord, vert, diag }));
      }
      if (!ok) continue;
      const { graph, errors } = buildSolution(lvl, segs);
      if (errors.length) continue;
      if (best && graph.usedBudget >= best.cost) continue;
      const r = runHeadless(lvl, graph.nodes, graph.beams, 60);
      if (!r.won || r.broken > 0 || r.peakUtil > Number(process.env.PEAK ?? 0.8)) continue;
      best = { cost: graph.usedBudget, peak: r.peakUtil, desc: `panels=${panels} depth=${depth} chord=${chord} vert=${vert} diag=${diag}` };
    }
  }
}
console.log(`L${id}`, best ? JSON.stringify(best) : 'NONE');
