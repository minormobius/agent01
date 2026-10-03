// books.mjs — market-neutral cross-sectional books over many tapes, as
// registered in lab/plans-search-prereg-v3.json. Every W bars rank the assets
// by a score, go long the top K and short the bottom K, weight each side by
// 1/sigma (each side sums to 1), hold W bars. Costs at each rebalance on the
// change in weight; funding at the printed rate (a long pays, a short is paid).
import { sigma1 } from './strategies.mjs';

export const SCORES = {
  xs_momentum: ({ L }) => (b, i) => Math.log(b[i].c / b[i - L].c),
  xs_reversal: ({ L }) => (b, i) => -Math.log(b[i].c / b[i - L].c),
  funding_carry: ({ F }) => (b, i, fund) => { let s = 0; for (let j = i - F + 1; j <= i; j++) s += fund[j]; return -s / F; },
};
export const GRID3 = [
  { family: 'xs_momentum', L: 42, W: 42 }, { family: 'xs_momentum', L: 180, W: 42 },
  { family: 'xs_reversal', L: 6, W: 6 }, { family: 'xs_reversal', L: 42, W: 42 },
  { family: 'funding_carry', F: 18, W: 42 }, { family: 'funding_carry', F: 42, W: 42 },
];
export const label3 = (g) => `${g.family}(${Object.entries(g).filter(([k]) => k !== 'family').map(([k, v]) => `${k}=${v}`).join(',')})`;

// target weights at the close of bar i: {coin: signed weight}
export function weightsAt(tapes, funds, coins, score, i, K = 3) {
  const s = coins.map((c) => ({ c, v: score(tapes[c], i, funds[c]) })).filter((x) => Number.isFinite(x.v)).sort((a, b) => b.v - a.v);
  if (s.length < 2 * K) return {};
  const side = (xs, sgn) => { const inv = xs.map((x) => 1 / sigma1(tapes[x.c], i)), tot = inv.reduce((a, b) => a + b, 0); return xs.map((x, k) => [x.c, sgn * inv[k] / tot]); };
  return Object.fromEntries([...side(s.slice(0, K), 1), ...side(s.slice(-K), -1)]);
}

// run a book over bars [from, to); returns per-bar records {t, ret, cost, funding, gross, w}
export function runBook(tapes, funds, coins, g, { from, to, costBps }) {
  const score = SCORES[g.family](g), out = [];
  let w = {};
  for (let i = from; i < to; i++) {
    // the book formed at the close of bar i-1 earns bar i
    let gross = 0, fundBp = 0;
    for (const [c, x] of Object.entries(w)) { const b = tapes[c]; gross += x * (b[i].c / b[i - 1].c - 1) * 1e4; fundBp += x * funds[c][i]; }
    let cost = 0;
    if ((i - from) % g.W === 0) {
      const nw = weightsAt(tapes, funds, coins, score, i);
      for (const c of new Set([...Object.keys(w), ...Object.keys(nw)])) cost += Math.abs((nw[c] || 0) - (w[c] || 0)) * costBps[c];
      w = nw;
    }
    out.push({ t: tapes[coins[0]][i].t, gross, funding: -fundBp, cost: -cost, ret: gross - fundBp - cost });
  }
  return out;
}
const WEEK = 7 * 864e5;
export function weekly(rows) {
  const wk = new Map();
  for (const r of rows) { const k = Math.floor(r.t / WEEK); wk.set(k, (wk.get(k) || 0) + r.ret); }
  return [...wk.entries()].sort((a, b) => a[0] - b[0]);
}
export function tWeeks(vals) {
  const n = vals.length, m = vals.reduce((a, b) => a + b, 0) / n, sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / (n - 1));
  return { weeks: n, mean_bp_week: +m.toFixed(1), sd_bp_week: +sd.toFixed(1), t: +(m / (sd / Math.sqrt(n))).toFixed(2), total_bp: +(m * n).toFixed(0) };
}
export function corr(a, b) {
  const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n;
  let sab = 0, saa = 0, sbb = 0; for (let k = 0; k < n; k++) { sab += (a[k] - ma) * (b[k] - mb); saa += (a[k] - ma) ** 2; sbb += (b[k] - mb) ** 2; }
  return +(sab / Math.sqrt(saa * sbb)).toFixed(3);
}
