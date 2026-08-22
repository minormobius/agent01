/* ken/lab/bt.mjs — Bradley–Terry (1952) by minorisation–maximisation.

   Turns pairwise verdicts into a scale with standard errors. Fits in a few
   dozen iterations; standard errors come from the observed information with
   one item pinned, because the likelihood is invariant to a shift in θ and
   the full information matrix is therefore singular. */
import { stats } from '../../packages/dataviz/index.mjs';

/** Wins matrix and the comparison graph. */
export function tally(verdicts) {
  const items = [...new Set(verdicts.flatMap((v) => [v.first, v.second]))].sort();
  const idx = new Map(items.map((it, i) => [it, i]));
  const k = items.length;
  const wins = Array.from({ length: k }, () => new Array(k).fill(0));
  for (const v of verdicts) {
    const a = idx.get(v.first), b = idx.get(v.second);
    const w = idx.get(v.winner);
    if (w === a) wins[a][b]++; else wins[b][a]++;
  }
  return { items, idx, wins, k };
}

/** Is every item reachable from every other? Without it there is no unique fit. */
export function connected({ wins, k }) {
  const seen = new Set([0]);
  const stack = [0];
  while (stack.length) {
    const i = stack.pop();
    for (let j = 0; j < k; j++) {
      if ((wins[i][j] + wins[j][i]) > 0 && !seen.has(j)) { seen.add(j); stack.push(j); }
    }
  }
  return seen.size === k;
}

/**
 * Fit. Returns θ on a log scale, centred at zero, with a standard error for
 * each item relative to the pinned reference.
 */
export function fitBradleyTerry(verdicts, { iters = 500, tol = 1e-10, prior = 0 } = {}) {
  const t = tally(verdicts);
  const { items, wins, k } = t;
  if (!connected(t)) throw new Error('bradleyTerry: the comparison graph is not connected');

  // `prior` adds a pseudo-win to each side of every observed pair. At 0 this is
  // the plain MLE, which does not exist when some item never wins; at 0.5 it is
  // the usual regularised fit. Left at 0 by default so the failure is visible.
  const obs = wins.map((row, i) => row.map((x, j) => (i !== j && (wins[i][j] + wins[j][i]) > 0 ? x + prior : x)));
  const n = Array.from({ length: k }, (_, i) =>
    Array.from({ length: k }, (_, j) => obs[i][j] + obs[j][i]));
  const w = obs.map((row) => row.reduce((a, b) => a + b, 0));
  if (w.some((x) => x === 0)) {
    // an item that never wins sends its θ to −∞; report rather than diverge
    const loser = items[w.indexOf(0)];
    throw new Error(`bradleyTerry: "${loser}" never wins, so its strength is unbounded below`);
  }

  let p = new Array(k).fill(1);
  for (let it = 0; it < iters; it++) {
    const next = p.map((_, i) => {
      let denom = 0;
      for (let j = 0; j < k; j++) if (j !== i && n[i][j] > 0) denom += n[i][j] / (p[i] + p[j]);
      return denom > 0 ? w[i] / denom : p[i];
    });
    const gm = Math.exp(next.reduce((a, x) => a + Math.log(x), 0) / k);
    const norm = next.map((x) => x / gm);
    const delta = Math.max(...norm.map((x, i) => Math.abs(x - p[i])));
    p = norm;
    if (delta < tol) break;
  }
  const theta = p.map((x) => Math.log(x));

  // observed information on θ, reference item pinned at index 0
  const info = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = 0; j < k; j++) {
      if (i === j || n[i][j] === 0) continue;
      const v = (p[i] * p[j]) / (p[i] + p[j]) ** 2;
      info[i][i] += n[i][j] * v;
      info[i][j] -= n[i][j] * v;
    }
  }
  const sub = info.slice(1).map((row) => row.slice(1));
  let se = new Array(k).fill(null);
  try {
    const cov = stats.invert(sub);
    se = [0, ...cov.map((row, i) => Math.sqrt(Math.max(0, row[i])))];
  } catch { /* leave null when the information matrix will not invert */ }

  return items
    .map((item, i) => ({
      item, theta: theta[i], se: se[i],
      wins: w[i], comparisons: n[i].reduce((a, b) => a + b, 0),
      winRate: w[i] / n[i].reduce((a, b) => a + b, 0),
    }))
    .sort((a, b) => b.theta - a.theta);
}

/**
 * Order sensitivity: the share of pairs whose two presentations disagree.
 * Under a judge with no position effect and no genuine indifference this is
 * zero; a non-zero rate bounds how finely the judge can discriminate.
 */
export function swapRate(verdicts) {
  const byPair = new Map();
  for (const v of verdicts) {
    const key = [v.first, v.second].sort().join('|');
    if (!byPair.has(key)) byPair.set(key, []);
    byPair.get(key).push(v);
  }
  const both = [...byPair.entries()].filter(([, vs]) => vs.length === 2);
  const flipped = both.filter(([, vs]) => vs[0].winner !== vs[1].winner);
  return {
    pairs: byPair.size,
    pairsShownBothWays: both.length,
    flipped: flipped.length,
    rate: both.length ? flipped.length / both.length : null,
    flippedPairs: flipped.map(([k]) => k),
  };
}
