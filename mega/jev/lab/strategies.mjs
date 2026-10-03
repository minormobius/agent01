// strategies.mjs — plan families for slow bars (4h), and the walk that scores
// a fixed strategy. Registered in lab/plans-search-prereg.json before any
// result: the families, the grid, the splits and the pass bars are there.
//
// Each family turns (bars, i, params) into a plan spec in lab/plans.mjs's
// format (side, entry, tgt, stp, trail, max), or null when it has no signal.
// Decided at the close of bar i; filled at the next open by simulate().
import { simulate, tally, COSTS } from './plans.mjs';

const SIG_N = 120;
export function sigma1(b, i, n = SIG_N) {
  let s = 0, s2 = 0, k = 0;
  for (let j = Math.max(1, i - n + 1); j <= i; j++) { const r = Math.log(b[j].c / b[j - 1].c) * 1e4; s += r; s2 += r * r; k++; }
  if (k < 2) return 1;
  const m = s / k; return Math.max(1, Math.sqrt((s2 - k * m * m) / (k - 1)));
}
const hiPrev = (b, i, n) => { let m = -Infinity; for (let j = Math.max(0, i - n); j < i; j++) m = Math.max(m, b[j].h); return m; };
const loPrev = (b, i, n) => { let m = Infinity; for (let j = Math.max(0, i - n); j < i; j++) m = Math.min(m, b[j].l); return m; };
const meanC = (b, i, n) => { let s = 0, k = 0; for (let j = Math.max(0, i - n + 1); j <= i; j++, k++) s += b[j].c; return s / k; };
const trailPlan = (c, side, w, max) => ({ side, entry: { type: 'market', px: c }, tgt: null, stp: c * (1 - side * w / 1e4), trail: w, max });

export const FAMILIES = {
  breakout: ({ N, k }) => (b, i) => {
    const c = b[i].c, w = k * sigma1(b, i) * Math.sqrt(N);
    if (c > hiPrev(b, i, N)) return trailPlan(c, 1, w, 3 * N);
    if (c < loPrev(b, i, N)) return trailPlan(c, -1, w, 3 * N);
    return null;
  },
  momentum: ({ N, k }) => (b, i) => {
    if (i < N) return null;
    const s1 = sigma1(b, i), sN = s1 * Math.sqrt(N), r = Math.log(b[i].c / b[i - N].c) * 1e4;
    if (Math.abs(r) < sN) return null;
    return trailPlan(b[i].c, Math.sign(r), k * sN, N);
  },
  reversion: ({ N, zt }) => (b, i) => {
    const s1 = sigma1(b, i), m = meanC(b, i, N), c = b[i].c, z = Math.log(c / m) * 1e4 / (s1 * Math.sqrt(N / 3));
    if (Math.abs(z) < zt) return null;
    const side = z > 0 ? -1 : 1;
    return { side, entry: { type: 'market', px: c }, tgt: m, stp: c * (1 - side * s1 * Math.sqrt(N) / 1e4), max: N, revertTarget: true };
  },
};
export const GRID = [
  ...[30, 90, 180].flatMap((N) => [1, 2].map((k) => ({ family: 'breakout', N, k }))),
  ...[30, 90, 180].flatMap((N) => [1, 2].map((k) => ({ family: 'momentum', N, k }))),
  ...[6, 30, 90].flatMap((N) => [2, 3].map((zt) => ({ family: 'reversion', N, zt }))),
];
export const label = (g) => `${g.family}(${Object.entries(g).filter(([k]) => k !== 'family').map(([k, v]) => `${k}=${v}`).join(',')})`;

export function costsFor(coin) {
  const hs = { BTC: 0.1, ETH: 0.1, SOL: 0.3 }[coin] ?? 1.0, sl = { BTC: 1, ETH: 1, SOL: 2 }[coin] ?? 3;
  return { ...COSTS, halfSpreadBps: hs, stopSlipBps: sl };
}

// Walk a fixed strategy over bars [from, to): take every signal, one plan at a
// time; with no signal, look again at the next bar. Plans opened before `to`
// run to their own exit (they may read bars past `to`, never past the tape).
export function runStrategy(bars, signal, { from = 200, to = bars.length - 1, costs = COSTS } = {}) {
  const plans = [];
  for (let i = from; i < to;) {
    const sp = signal(bars, i);
    if (!sp) { i++; continue; }
    sp.key = sp.side > 0 ? 'long' : 'short';
    const r = simulate(bars, i, sp, costs);
    r.spec = sp; r.t = bars[i].t;
    plans.push(r);
    i = Math.max(i + 1, r.exitBar ?? i + 1);
  }
  return plans;
}
// t of the mean net per trade, over any set of plans
export function tNet(plans) {
  const v = plans.filter((p) => p.filled).map((p) => p.netBp);
  if (v.length < 2) return { n: v.length, net: v.reduce((a, b) => a + b, 0), mean: v[0] || 0, t: null };
  const m = v.reduce((a, b) => a + b, 0) / v.length, sd = Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
  return { n: v.length, net: +(m * v.length).toFixed(1), mean: +m.toFixed(2), t: +(m / (sd / Math.sqrt(v.length))).toFixed(2) };
}
export { tally };
