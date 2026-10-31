// eval/plans-adapt.mjs — fit locally, stay vigilant, refit (lab/plans-adapt-prereg.json).
//
//   node mega/jev/eval/plans-adapt.mjs [--out mega/jev/lab/plans-adapt.json]
//
// A walk forward over 15 assets' 4h tapes. At each refit, per asset, the
// strategist deploys whichever of v1's 18 configurations earned the most R over
// the trailing L bars (or stands aside); vigilance can call an early refit when
// the deployed strategy stops behaving as it did when fitted. Every choice uses
// only bars before it. The null refits to random configurations on the same
// schedule. No model calls.
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { loadTape, toBars } from '../lab/tape.mjs';
import { FAMILIES, GRID, label, runStrategy, costsFor, sigma1 } from '../lab/strategies.mjs';
import { simulate } from '../lab/plans.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const REG = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-adapt-prereg.json'), 'utf8'));
const V1 = JSON.parse(readFileSync(join(here, '..', 'lab', 'plans-search-prereg.json'), 'utf8'));
const outI = process.argv.indexOf('--out'), out = outI > 0 ? process.argv[outI + 1] : null;
const COINS = [...V1.data.dev_assets, ...V1.data.holdout_assets];
const START = 600, END = 5000, EVERY = 42, WEEK = 7 * 864e5;

const tapes = {}, sigs = GRID.map((g) => FAMILIES[g.family](g)), runs = {};
for (const c of COINS) {
  const b = toBars(await loadTape(c, { interval: '4h' }));
  tapes[c] = Object.assign(b.slice(0, END), { barMin: b.barMin });
  // each configuration run continuously: the record the strategist scores (only trades closed before T)
  runs[c] = sigs.map((s) => runStrategy(tapes[c], s, { from: 200, to: END, costs: costsFor(c) }).filter((p) => p.filled));
}

let fit = function (c, T, L) {
  let best = null;
  for (let k = 0; k < GRID.length; k++) {
    const w = runs[c][k].filter((p) => p.entryBar >= T - L && p.exitBar < T);
    if (w.length < 3) continue;
    const sum = w.reduce((a, p) => a + p.R, 0);
    if (sum > 0 && (!best || sum > best.sum)) {
      const m = sum / w.length, sd = Math.max(0.5, Math.sqrt(w.reduce((a, p) => a + (p.R - m) ** 2, 0) / Math.max(1, w.length - 1)));
      best = { k, sum, mu: m, sd, n: w.length };
    }
  }
  return best;
};
function mulberry(a) { return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// one asset's walk. chooser(c, T) -> {k, mu, sd} | null
function walkAsset(c, L, vigil, chooser) {
  const b = tapes[c], costs = costsFor(c), trades = [], log = { refits: 0, aside: 0, cusum: 0, vol: 0, picks: {} };
  let T = START;
  while (T < END) {
    const f = chooser(c, T, L); log.refits++;
    let refitAt = Math.min(END, T + EVERY);
    if (!f) { log.aside++; T = refitAt; continue; }
    log.picks[label(GRID[f.k])] = (log.picks[label(GRID[f.k])] || 0) + 1;
    const sig = sigs[f.k], s0 = sigma1(b, T);
    let i = T, S = 0;
    while (i < refitAt) {
      const sp = sig(b, i);
      if (!sp) { i++; continue; }
      const r = simulate(b, i, sp, costs);
      i = Math.max(i + 1, r.exitBar ?? i + 1);
      if (!r.filled) continue;
      trades.push({ coin: c, side: r.side, R: r.R, exitT: b[Math.min(r.exitBar, END - 1)].t, k: f.k });
      if (vigil) {
        S = Math.max(0, S + (f.mu - r.R) - 0.5 * f.sd);
        const v = sigma1(b, Math.min(i, END - 1)) / s0;
        if (S > 4 * f.sd) { log.cusum++; refitAt = i; break; }
        if (v < 0.5 || v > 2) { log.vol++; refitAt = i; break; }
      }
    }
    T = Math.max(refitAt, i);
  }
  return { trades, log };
}
function weeklyT(trades) {
  const wk = new Map();
  for (const p of trades) { const w = Math.floor(p.exitT / WEEK); wk.set(w, (wk.get(w) || 0) + p.R); }
  const ks = [...wk.keys()], lo = Math.min(...ks), hi = Math.max(...ks), v = [];
  for (let w = lo; w <= hi; w++) v.push(wk.get(w) || 0);
  const m = v.reduce((a, x) => a + x, 0) / v.length, sd = Math.sqrt(v.reduce((a, x) => a + (x - m) ** 2, 0) / (v.length - 1));
  return { weeks: v.length, sumR: +(m * v.length).toFixed(1), t: +(m / (sd / Math.sqrt(v.length))).toFixed(2) };
}
const meanR = (ts) => (ts.length ? +(ts.reduce((a, p) => a + p.R, 0) / ts.length).toFixed(3) : null);
function runVariant(L, vigil, chooser) {
  const all = [], logs = {};
  for (const c of COINS) { const r = walkAsset(c, L, vigil, chooser); all.push(...r.trades); logs[c] = r.log; }
  return { all, logs };
}

// --contrarian (EXPLORATORY, trial #49, thought of after seeing the registered result):
// the strategist deploys the configuration with the WORST trailing record (a negative sum)
const contrarian = process.argv.includes('--contrarian');
if (contrarian) {
  const fit0 = fit;
  fit = (c, T, L) => {
    let worst = null;
    for (let k = 0; k < GRID.length; k++) {
      const w = runs[c][k].filter((p) => p.entryBar >= T - L && p.exitBar < T);
      if (w.length < 3) continue;
      const sum = w.reduce((a, p) => a + p.R, 0);
      if (sum < 0 && (!worst || sum < worst.sum)) { const m = sum / w.length; worst = { k, sum, mu: 0, sd: Math.max(0.5, Math.sqrt(w.reduce((a, p) => a + (p.R - m) ** 2, 0) / Math.max(1, w.length - 1))), n: w.length }; }
    }
    return worst;
  };
  void fit0;
}
const report = { registration: REG.id, exploratory: contrarian ? 'contrarian strategist, trial #49, not registered' : null, ran: new Date().toISOString(), variants: {} };
const mid = tapes.BTC[Math.floor((START + END) / 2)].t;
console.log('variant              trades  sumR  weekly t  longs R  shorts R  aside%  early refits (cusum/vol)   null sumR (20 seeds)    z     WORKS');
for (const L of REG.variants.L) for (const vig of [false, true]) {
  const { all, logs } = runVariant(L, vig, fit);
  const refits = Object.values(logs).reduce((a, l) => a + l.refits, 0), aside = Object.values(logs).reduce((a, l) => a + l.aside, 0), rate = aside / refits;
  const nulls = [];
  for (let s = 1; s <= 20; s++) {
    const rng = mulberry(s * 7919 + L);
    const randomChooser = (c, T, L2) => { if (rng() < rate) return null; const k = Math.floor(rng() * GRID.length), w = runs[c][k].filter((p) => p.entryBar >= T - L2 && p.exitBar < T); const m = w.length ? w.reduce((a, p) => a + p.R, 0) / w.length : 0, sd = Math.max(0.5, w.length > 1 ? Math.sqrt(w.reduce((a, p) => a + (p.R - m) ** 2, 0) / (w.length - 1)) : 0.5); return { k, mu: m, sd }; };
    nulls.push(runVariant(L, vig, randomChooser).all.reduce((a, p) => a + p.R, 0));
  }
  const nm = nulls.reduce((a, b) => a + b, 0) / nulls.length, nsd = Math.sqrt(nulls.reduce((a, b) => a + (b - nm) ** 2, 0) / (nulls.length - 1));
  const wt = weeklyT(all), z = (wt.sumR - nm) / nsd, lo = meanR(all.filter((p) => p.side > 0)), sh = meanR(all.filter((p) => p.side < 0));
  const works = wt.t >= 2.39 && z >= 1.645 && lo >= 0 && sh >= 0;
  const halves = [all.filter((p) => p.exitT < mid), all.filter((p) => p.exitT >= mid)].map((h) => ({ trades: h.length, ...weeklyT(h) }));
  const picks = {}; for (const l of Object.values(logs)) for (const [k, n] of Object.entries(l.picks)) picks[k] = (picks[k] || 0) + n;
  const name = `L=${L} vigilance ${vig ? 'on' : 'off'}`;
  report.variants[name] = { trades: all.length, ...wt, longs_meanR: lo, shorts_meanR: sh, aside_rate: +rate.toFixed(3), early_refits: { cusum: Object.values(logs).reduce((a, l) => a + l.cusum, 0), vol: Object.values(logs).reduce((a, l) => a + l.vol, 0) }, null: { mean_sumR: +nm.toFixed(1), sd: +nsd.toFixed(1), z: +z.toFixed(2) }, halves, picks: Object.entries(picks).sort((a, b) => b[1] - a[1]), works };
  const v = report.variants[name];
  console.log(`${name.padEnd(20)} ${String(all.length).padStart(6)} ${String(wt.sumR).padStart(6)} ${String(wt.t).padStart(9)} ${String(lo).padStart(8)} ${String(sh).padStart(9)} ${(rate * 100).toFixed(0).padStart(6)}%  ${String(v.early_refits.cusum).padStart(6)} / ${String(v.early_refits.vol).padEnd(14)} ${String(v.null.mean_sumR).padStart(8)} ± ${String(v.null.sd).padEnd(8)} ${String(v.null.z).padStart(6)}   ${works ? 'YES' : 'no'}`);
}
if (out) writeFileSync(out, JSON.stringify(report, null, 1));
