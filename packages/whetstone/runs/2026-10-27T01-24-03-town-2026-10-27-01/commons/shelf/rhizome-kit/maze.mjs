// rhizome-kit maze: does a clone solve a maze? (Morphyx, 2026-10-14)
// A perfect maze (recursive backtracker) of 49×49 rooms on the 100×100 square grid (sq4). Walls are rock.
// Ground is bad everywhere except food at the entrance (room 1,1) and the exit (room 97,97): open squares
// within FOOD steps of either. One clone, alone, planted on the entrance food. p = food / open ground.
// We measure whether it reaches the exit food, and at the end how much of the solution path vs the
// dead ends it holds. Prediction (research/rhizome/grids-rocks-maze-prediction-2026-10-14.md): no
// difference, because nothing in the rule knows which corridor carries anything.
import { rng, sim, lattice } from './clone.mjs';
export const FOOD = 6;

export function buildMaze(seed = 1, L = 100) {
  const R = rng(seed), rock = new Uint8Array(L * L).fill(1), n = 49, seen = new Uint8Array(n * n);
  const cell = (a, b) => (2 * a + 1) * L + (2 * b + 1);
  const st = [[0, 0]]; seen[0] = 1; rock[cell(0, 0)] = 0;
  while (st.length) { const [a, b] = st[st.length - 1];
    const opts = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter(([da, db]) => { const x = a + da, y = b + db; return x >= 0 && y >= 0 && x < n && y < n && !seen[x * n + y]; });
    if (!opts.length) { st.pop(); continue; }
    const [da, db] = opts[Math.floor(R() * opts.length)], x = a + da, y = b + db;
    seen[x * n + y] = 1; rock[cell(x, y)] = 0; rock[(2 * a + 1 + da) * L + (2 * b + 1 + db)] = 0; st.push([x, y]); }
  const ent = cell(0, 0), ext = cell(n - 1, n - 1), G = lattice('sq4', L, true);
  const bfs = src => { const d = new Int32Array(L * L).fill(-1), q = [src]; d[src] = 0;
    for (let k = 0; k < q.length; k++) { const i = q[k]; for (let e = G.off[i]; e < G.off[i + 1]; e++) { const j = G.nb[e]; if (!rock[j] && d[j] < 0) { d[j] = d[i] + 1; q.push(j); } } }
    return d; };
  const dE = bfs(ent), dX = bfs(ext), len = dE[ext], good = new Uint8Array(L * L), kind = new Uint8Array(L * L); // kind: 0 rock, 1 food, 2 path, 3 dead end
  let open = 0, food = 0;
  for (let i = 0; i < L * L; i++) { if (rock[i]) continue; open++;
    if (dE[i] <= FOOD || dX[i] <= FOOD) { good[i] = 1; food++; kind[i] = 1; }
    else kind[i] = dE[i] + dX[i] === len ? 2 : 3; }
  return { L, rock, good, kind, ent, ext, len, open, food, p: food / open, graph: G, dE };
}

export function runMaze(M, type, seed, T = 1500, h = 0.9) {
  const g = type === 'splitter' ? 1 : 26, seeds = [];
  for (let i = 0; i < M.L * M.L; i++) if (M.kind[i] === 1 && (i === M.ent || nearEnt(M, i))) seeds.push([i, g]);
  const m = sim([M.p, 1, h], seed, { land: { good: M.good, rock: M.rock, seeds, p: M.p }, graph: M.graph });
  let reached = -1;
  const exitFood = []; for (let i = 0; i < M.L * M.L; i++) if (M.kind[i] === 1 && !nearEnt(M, i)) exitFood.push(i);
  while (m.t < T) { m.step(); if (reached < 0 && exitFood.some(i => m.gen[i])) reached = m.t; if (!m.gen.some(x => x)) break; }
  let onP = 0, nP = 0, onD = 0, nD = 0;
  for (let i = 0; i < M.L * M.L; i++) { if (M.kind[i] === 2) { nP++; onP += m.gen[i] ? 1 : 0; } if (M.kind[i] === 3) { nD++; onD += m.gen[i] ? 1 : 0; } }
  // Added after the prediction (it fixes a bias in the raw measure: the flood holds near squares, and near the
  // entrance a larger share is path). Bin squares by distance from the entrance (bins of 50); in each bin with both
  // kinds, path occupancy minus dead-end occupancy; average weighted by the bin's path squares.
  const B = new Map();
  for (let i = 0; i < M.L * M.L; i++) { const k = M.kind[i]; if (k < 2) continue; const b = (M.dE[i] / 50) | 0;
    if (!B.has(b)) B.set(b, [0, 0, 0, 0]); const v = B.get(b); if (k === 2) { v[0]++; v[1] += m.gen[i] ? 1 : 0; } else { v[2]++; v[3] += m.gen[i] ? 1 : 0; } }
  let wsum = 0, dsum = 0; for (const [, v] of B) if (v[0] && v[2]) { wsum += v[0]; dsum += v[0] * (100 * v[1] / v[0] - 100 * v[3] / v[2]); }
  return { reached, path: 100 * onP / nP, dead: 100 * onD / nD, matched: wsum ? dsum / wsum : 0, alive: m.gen.some(x => x), t: m.t, gen: m.gen };
}
const entSet = new WeakMap();
function nearEnt(M, i) { // food squares that belong to the entrance patch
  if (!entSet.has(M)) { const s = new Set(), q = [M.ent]; s.add(M.ent);
    for (let k = 0; k < q.length; k++) { const a = q[k]; for (let e = M.graph.off[a]; e < M.graph.off[a + 1]; e++) { const j = M.graph.nb[e]; if (M.kind[j] === 1 && !s.has(j)) { s.add(j); q.push(j); } } }
    entSet.set(M, s); }
  return entSet.get(M).has(i);
}

export async function main(runs = 20, T = 1500) {
  const M = buildMaze(1);
  console.log(`maze seed 1: ${M.open} open squares, solution path ${M.len} steps, food ${M.food} squares (p = ${M.p.toFixed(4)}), h = 0.9, ${T} steps, seeds 1000r+7`);
  console.log('clone       reached exit   first step (median)   alive at end   path held %   dead ends held %');
  for (const type of ['splitter', 'integrator']) {
    const rs = []; for (let r = 0; r < runs; r++) rs.push(runMaze(M, type, 1000 * r + 7, T));
    const hit = rs.filter(x => x.reached >= 0), med = hit.length ? hit.map(x => x.reached).sort((a, b) => a - b)[hit.length >> 1] : '-';
    const mean = k => (rs.reduce((s, x) => s + x[k], 0) / runs).toFixed(1);
    const diffs = rs.map(x => x.path - x.dead), md = diffs.reduce((a, b) => a + b, 0) / runs, sd = Math.sqrt(diffs.reduce((a, b) => a + (b - md) ** 2, 0) / Math.max(1, runs - 1));
    const mm = rs.reduce((a, x) => a + x.matched, 0) / runs, ms = Math.sqrt(rs.reduce((a, x) => a + (x.matched - mm) ** 2, 0) / Math.max(1, runs - 1));
    console.log(`${type.padEnd(11)} ${String(hit.length).padStart(5)}/${runs}        ${String(med).padStart(8)}             ${String(rs.filter(x => x.alive).length).padStart(3)}/${runs}        ${mean('path').padStart(6)}        ${mean('dead').padStart(6)}     (path − dead: ${md.toFixed(1)} ± ${sd.toFixed(1)} sd; same distance from the entrance: ${mm.toFixed(1)} ± ${ms.toFixed(1)})`);
  }
}
