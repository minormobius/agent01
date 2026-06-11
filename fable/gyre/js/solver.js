// The solver — flux's action-space sweep, ported to the torus. The ball is
// constrained to a surface, so the player still has exactly two degrees of
// freedom (heading ψ in the tangent plane × power) and the whole win-map /
// basin / fine-robustness machinery carries over intact. That was the point:
// the world went 3D, the oracle didn't have to change shape.

import { simulate, POWER_MIN, POWER_MAX } from './engine.js';

export function solve(w, opts = {}) {
  const na = opts.na ?? 96;
  const np = opts.np ?? 16;
  const grid = new Uint8Array(na * np);
  let wins = 0;
  for (let i = 0; i < na; i++) {
    const psi = (i / na) * Math.PI * 2;
    for (let j = 0; j < np; j++) {
      const pw = POWER_MIN + (j / (np - 1)) * (POWER_MAX - POWER_MIN);
      if (simulate(w, psi, pw).win) { grid[i * np + j] = 1; wins++; }
    }
  }
  if (wins === 0) return { solvable: false, na, np, grid, winFrac: 0 };

  // distance-to-edge transform over the win-map (angle wraps, power doesn't)
  const dist = new Float64Array(na * np).fill(1e9);
  const q = [];
  for (let id = 0; id < na * np; id++) if (grid[id] === 0) { dist[id] = 0; q.push(id); }
  for (let i = 0; i < na; i++) for (const j of [0, np - 1]) {
    const id = i * np + j;
    if (grid[id] === 1 && dist[id] > 0.5) { dist[id] = 0.5; q.push(id); }
  }
  let head = 0;
  while (head < q.length) {
    const id = q[head++];
    const i = (id / np) | 0, j = id % np;
    for (const [ni, nj] of [[(i + 1) % na, j], [(i - 1 + na) % na, j], [i, j + 1], [i, j - 1]]) {
      if (nj < 0 || nj >= np) continue;
      const nid = ni * np + nj;
      if (grid[nid] === 1 && dist[nid] > dist[id] + 1) { dist[nid] = dist[id] + 1; q.push(nid); }
    }
  }

  // basins (connected winning regions; angle wraps)
  const comp = new Int32Array(na * np).fill(-1);
  const basins = [];
  for (let id0 = 0; id0 < na * np; id0++) {
    if (grid[id0] !== 1 || comp[id0] !== -1) continue;
    const cid = basins.length;
    let size = 0, bestRob = -1, bestCell = id0;
    const stack = [id0]; comp[id0] = cid;
    while (stack.length) {
      const cur = stack.pop(); size++;
      if (dist[cur] > bestRob) { bestRob = dist[cur]; bestCell = cur; }
      const ci = (cur / np) | 0, cj = cur % np;
      for (const [ni, nj] of [[(ci + 1) % na, cj], [(ci - 1 + na) % na, cj], [ci, cj + 1], [ci, cj - 1]]) {
        if (nj < 0 || nj >= np) continue;
        const nid = ni * np + nj;
        if (grid[nid] === 1 && comp[nid] === -1) { comp[nid] = cid; stack.push(nid); }
      }
    }
    basins.push({ size, robust: bestRob, cell: bestCell });
  }
  basins.sort((a, b) => b.robust - a.robust || b.size - a.size);

  // refine to a FINE-robust canonical answer (survives float drift / engines)
  const cellPsi = (c) => (((c / np) | 0) / na) * Math.PI * 2;
  const cellPow = (c) => POWER_MIN + ((c % np) / (np - 1)) * (POWER_MAX - POWER_MIN);
  let bestCandidate = basins[0].cell, bestFine = -1;
  for (const b of basins.slice(0, 8)) {
    const f = fineScore(w, cellPsi(b.cell), cellPow(b.cell));
    if (f > bestFine) { bestFine = f; bestCandidate = b.cell; }
    if (bestFine >= 0.999) break;
  }
  const psi = cellPsi(bestCandidate), pw = cellPow(bestCandidate);
  const canonical = simulate(w, psi, pw, { trace: true, sample: 2 });

  const significant = basins.filter((b) => b.size >= 3).length;
  return {
    solvable: true, na, np, grid,
    winFrac: wins / (na * np),
    basins: basins.length,
    significantBasins: significant,
    biggestBasin: basins[0].size / (na * np),
    robustness: basins[0].robust,
    fineRobust: bestFine,
    answer: {
      psi, power: pw, win: canonical.win,
      bounces: canonical.bounces, gooSteps: canonical.gooSteps, steps: canonical.steps,
      windU: canonical.windU, windV: canonical.windV,
      trace: canonical.trace,
    },
  };
}

const A_OFF = [-0.8, -0.4, 0, 0.4, 0.8].map((d) => d * Math.PI / 180);
const P_OFF = [-1.0, -0.5, 0, 0.5, 1.0];
function fineScore(w, psi, pw) {
  let win = 0, total = 0;
  for (const da of A_OFF) for (const dp of P_OFF) {
    const p = pw + dp;
    if (p < POWER_MIN || p > POWER_MAX) continue;
    total++;
    if (simulate(w, psi + da, p).win) win++;
  }
  return total ? win / total : 0;
}
