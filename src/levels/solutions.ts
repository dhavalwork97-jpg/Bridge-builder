/**
 * Reference solutions. They serve two purposes: (1) proof that every level is mechanically
 * solvable within its budget (tests/levels.test.ts runs each one through the real simulation),
 * and (2) documentation of intended designs. They are not shown to players.
 */
import { BridgeGraph } from '../sim/graph';
import type { LevelDef, MaterialId } from '../types';

export type Seg = [number, number, number, number, MaterialId];

interface TrussOpts { deck?: MaterialId; chord?: MaterialId; vert?: MaterialId; diag?: MaterialId }

/**
 * Warren truss with verticals between two supports. Top chord is the road deck (linear from
 * (x0,yA) to (x1,yB)); the bottom chord runs `depth` below, anchored to wall anchors at both ends.
 */
export function deckTruss(x0: number, yA: number, x1: number, yB: number, panels: number, depth: number, o: TrussOpts = {}): Seg[] {
  const deck = o.deck ?? 'road', chord = o.chord ?? 'steel', vert = o.vert ?? 'steel', diag = o.diag ?? 'steel';
  const g = (v: number) => Math.round(v * 2) / 2; // keep joints on the 0.5 m build grid
  const X = (i: number) => g(x0 + ((x1 - x0) * i) / panels);
  const Y = (i: number) => g(yA + ((yB - yA) * i) / panels);
  const segs: Seg[] = [];
  for (let i = 0; i < panels; i++) {
    segs.push([X(i), Y(i), X(i + 1), Y(i + 1), deck]);
    segs.push([X(i), Y(i) - depth, X(i + 1), Y(i + 1) - depth, chord]);
    if (i % 2 === 0) segs.push([X(i), Y(i) - depth, X(i + 1), Y(i + 1), diag]);
    else segs.push([X(i), Y(i), X(i + 1), Y(i + 1) - depth, diag]);
  }
  for (let i = 1; i < panels; i++) segs.push([X(i), Y(i), X(i), Y(i) - depth, vert]);
  return segs;
}

/** Cable-stayed deck: road chain with stays from one aerial anchor to each deck joint. */
export function stayedDeck(xsIn: number[], yDeck: (x: number) => number, towerX: number, towerY: number, stayXsIn: number[], opts: { stay?: MaterialId } = {}): Seg[] {
  const g = (v: number) => Math.round(v * 2) / 2;
  const xs = xsIn.map(g), stayXs = stayXsIn.map(g);
  const segs: Seg[] = [];
  for (let i = 0; i < xs.length - 1; i++) segs.push([xs[i], yDeck(xs[i]), xs[i + 1], yDeck(xs[i + 1]), 'road']);
  for (const x of stayXs) segs.push([towerX, towerY, x, yDeck(x), opts.stay ?? 'cable']);
  return segs;
}

/** Place a list of segments, in any order, through the real construction rules. */
export function buildSolution(level: LevelDef, segs: Seg[]): { graph: BridgeGraph; errors: string[] } {
  const graph = new BridgeGraph(level);
  const errors: string[] = [];
  let pending = segs.slice();
  for (let pass = 0; pass < segs.length + 1 && pending.length; pass++) {
    const next: Seg[] = [];
    for (const [x1, y1, x2, y2, m] of pending) {
      let from = graph.nodeAt({ x: x1, y: y1 }, 0.05);
      let tx = x2, ty = y2;
      if (!from) { from = graph.nodeAt({ x: x2, y: y2 }, 0.05); tx = x1; ty = y1; }
      if (!from) { next.push([x1, y1, x2, y2, m]); continue; }
      const r = graph.connect(from.id, { point: { x: tx, y: ty } }, m);
      if (!r.ok) errors.push(`${m} ${x1},${y1}->${x2},${y2}: ${r.reason}`);
    }
    if (next.length === pending.length) { for (const s of next) errors.push(`unreachable segment ${s.join(',')}`); break; }
    pending = next;
  }
  return { graph, errors };
}

type TP = [panels: number, depth: number, chord: MaterialId, vert: MaterialId, diag: MaterialId];
/** Truss over each span with shared parameters. */
const spans = (list: number[][], [p, d, chord, vert, diag]: TP): Seg[] =>
  list.flatMap(([x0, y0, x1, y1]) => deckTruss(x0, y0, x1, y1, p, d, { chord, vert, diag }));
const S = (...a: Seg[][]): Seg[] => a.flat();

/** Parameters found with scripts/optimize.ts (cheapest design that wins, breaks nothing, peaks <= 80%). */
export const SOLUTIONS: Record<number, Seg[]> = {
  1: [[0, 0, 6, 0, 'road']],
  2: [[0, 0, 5, 0, 'road'], [5, 0, 10, 0, 'road'], [0, -4, 5, 0, 'wood'], [10, -4, 5, 0, 'wood']],
  3: spans([[0, 2, 12, 0]], [3, 5, 'wood', 'wood', 'wood']),
  4: spans([[0, 0, 14, 0]], [2, 3, 'wood', 'wood', 'steel']),
  5: spans([[0, 0, 14, 3]], [2, 3, 'wood', 'wood', 'steel']),
  6: spans([[0, 0, 18, 0]], [3, 3, 'wood', 'wood', 'steel']),
  7: spans([[0, 0, 10.5, 0], [13.5, 0, 24, 0]], [2, 5, 'wood', 'wood', 'wood']),
  8: spans([[0, 0, 16, -4]], [3, 3, 'wood', 'steel', 'steel']),
  9: spans([[0, 0, 12, 0]], [2, 3, 'wood', 'wood', 'wood']),
  10: spans([[0, 0, 8.5, 0], [11.5, 0, 18.5, 0], [21.5, 0, 30, 0]], [2, 5, 'cable', 'wood', 'wood']),
  11: spans([[0, 0, 18, 0]], [3, 3, 'cable', 'steel', 'steel']),
  // Cable-stayed decks: stays fan out from the aerial anchor above the island.
  12: S(
    stayedDeck([0, 2.5, 5, 8, 11], () => 0, 12, 8, [2.5, 5, 8]),
    stayedDeck([13, 16, 19, 21.5, 24], () => 0, 12, 8, [16, 19, 21.5]),
  ),
  13: spans([[0, 0, 14, 0]], [2, 3, 'cable', 'steel', 'steel']),
  14: spans([[0, 3, 16, -1]], [3, 3, 'cable', 'steel', 'steel']),
  15: S(
    stayedDeck([0, 2.5, 5, 7.5, 10], () => 0, 11, 8, [2.5, 5, 7.5]),
    stayedDeck([12, 14.5, 17, 19.5, 22], () => 0, 11, 8, [14.5, 17, 19.5]),
  ),
  16: spans([[0, 0, 10, 0], [12, 0, 22, 0], [24, 0, 34, 0]], [2, 3, 'cable', 'wood', 'steel']),
  17: spans([[0, 0, 12, 2.5], [14, 2.5, 26, 5]], [2, 3, 'cable', 'wood', 'steel']),
  18: spans([[0, 0, 8, 0], [10, 0, 17, 0], [19, 0, 26, 0], [28, 0, 36, 0]], [2, 3, 'cable', 'steel', 'steel']),
  19: spans([[0, 0, 18, 0]], [3, 5, 'cable', 'steel', 'steel']),
  20: spans([[0, 3, 13, 1], [15, 1, 28, -1]], [2, 3, 'steel', 'steel', 'steel']),
};
