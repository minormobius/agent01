// The solver — the interestingness oracle, living inside the simulation.
//
// It sweeps the 2D action space (launch angle × power), simulates each launch,
// and builds a boolean win-map. From that map it reads everything the rest of
// the site needs:
//   • solvable?           — does ANY launch win
//   • basins              — connected winning regions (angle wraps around)
//   • robustness          — how forgiving the best basin is (its inscribed
//                           radius): a wide basin is easy, a sliver is precise
//   • canonical answer    — the most-interior launch of the best basin, re-run
//                           with a trace. Being interior makes it basin-ROBUST,
//                           so the Rust and JS engines never disagree on it.
//   • trajectory richness — bounces / goo time / path length of that answer
// Difficulty and interest are graded from these by difficulty.js.

import { simulate, POWER_MIN, POWER_MAX } from './engine.js';

export function solve(w, opts = {}) {
  const na = opts.na ?? 96;   // angle resolution
  const np = opts.np ?? 18;   // power resolution
  const grid = new Uint8Array(na * np);
  let wins = 0;
  for (let i = 0; i < na; i++) {
    const ang = (i / na) * Math.PI * 2;
    for (let j = 0; j < np; j++) {
      const pw = POWER_MIN + (j / (np - 1)) * (POWER_MAX - POWER_MIN);
      if (simulate(w, ang, pw).win) { grid[i * np + j] = 1; wins++; }
    }
  }
  if (wins === 0) return { solvable: false, na, np, grid, winFrac: 0 };

  // distance transform: distance (in cells) from each win cell to nearest
  // non-win cell or power-edge. Angle dimension wraps; power dimension does not.
  const INF = 1e9;
  const dist = new Float64Array(na * np).fill(INF);
  const q = [];
  // Seed the BFS from every non-win cell (distance 0).
  for (let id = 0; id < na * np; id++) if (grid[id] === 0) { dist[id] = 0; q.push(id); }
  // A basin hugging the min/max power rail isn't fully forgiving — seed those
  // winning edge cells at a small distance so robustness reflects the clamp.
  for (let i = 0; i < na; i++) for (const j of [0, np - 1]) {
    const id = i * np + j;
    if (grid[id] === 1 && dist[id] > 0.5) { dist[id] = 0.5; q.push(id); }
  }
  // BFS (4-neighbour, angle wraps)
  let head = 0;
  while (head < q.length) {
    const id = q[head++];
    const i = (id / np) | 0, j = id % np;
    const nb = [[(i + 1) % na, j], [(i - 1 + na) % na, j], [i, j + 1], [i, j - 1]];
    for (const [ni, nj] of nb) {
      if (nj < 0 || nj >= np) continue;
      const nid = ni * np + nj;
      if (grid[nid] === 1 && dist[nid] > dist[id] + 1) { dist[nid] = dist[id] + 1; q.push(nid); }
    }
  }

  // connected components (basins) over win cells
  const comp = new Int32Array(na * np).fill(-1);
  const basins = [];
  for (let i = 0; i < na; i++) for (let j = 0; j < np; j++) {
    const id = i * np + j;
    if (grid[id] !== 1 || comp[id] !== -1) continue;
    const cid = basins.length;
    let size = 0, bestRob = -1, bestCell = id;
    const stack = [id]; comp[id] = cid;
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

  // Coarse robustness can be fooled by chaos — a cell that looks interior at
  // 3.75°/cell may flip within a fraction of a degree. So among the top basin
  // candidates, pick the one whose center is most robust at FINE scale, and
  // store THAT as the canonical answer. Fine-robust ⇒ survives float drift, so
  // the JS and Rust engines never disagree on it, and "watch the solver" is
  // reliable.
  const cellAng = (c) => (((c / np) | 0) / na) * Math.PI * 2;
  const cellPow = (c) => POWER_MIN + ((c % np) / (np - 1)) * (POWER_MAX - POWER_MIN);
  let bestCandidate = basins[0].cell, bestFine = -1;
  for (const b of basins.slice(0, 8)) {
    const f = fineScore(w, cellAng(b.cell), cellPow(b.cell));
    if (f > bestFine) { bestFine = f; bestCandidate = b.cell; }
    if (bestFine >= 0.999) break;
  }
  const ang = cellAng(bestCandidate), pw = cellPow(bestCandidate);
  const canonical = simulate(w, ang, pw, { trace: true, sample: 2 });

  const significant = basins.filter((b) => b.size >= 3).length;
  return {
    solvable: true, na, np, grid,
    winFrac: wins / (na * np),
    basins: basins.length,
    significantBasins: significant,
    biggestBasin: basins[0].size / (na * np),
    robustness: basins[0].robust,            // coarse inscribed radius (feeds "precision")
    fineRobust: bestFine,                    // fraction of a fine neighbourhood that wins
    answer: { angle: ang, power: pw, win: canonical.win, bounces: canonical.bounces, gooSteps: canonical.gooSteps, steps: canonical.steps, trace: canonical.trace },
  };
}

// Fraction of a fine (angle, power) neighbourhood around a launch that wins.
const A_OFF = [-0.8, -0.4, 0, 0.4, 0.8].map((d) => d * Math.PI / 180);
const P_OFF = [-2.2, -1.1, 0, 1.1, 2.2];
function fineScore(w, ang, pw) {
  let win = 0, total = 0;
  for (const da of A_OFF) for (const dp of P_OFF) {
    const p = pw + dp;
    if (p < POWER_MIN || p > POWER_MAX) continue;
    total++;
    if (simulate(w, ang + da, p).win) win++;
  }
  return total ? win / total : 0;
}
