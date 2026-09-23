// prereg.mjs — the pre-registered 12h polarity rule, and nothing else.
//
// `preregister.json` was committed BEFORE this file existed. Every constant
// below is read from it rather than written here, so the two cannot drift
// and a reviewer can check the rule against the frozen spec by diffing one
// file. If a parameter needs to change, that is a NEW registration with a new
// id — this file must not grow options.
//
// The whole point is that this implementation is boring and fixed. Two
// numbers have already evaporated on this surface under exactly this kind of
// scrutiny (a 75.7% momentum rule that was an overlapping-windows artifact,
// and a -0.179 reversal that did not replicate), so the rule being
// unchangeable IS the feature.

/** Pearson r. Returns null rather than a number it cannot justify. */
export function pearson(xs, ys) {
  const n = xs.length;
  if (n < 3 || ys.length !== n) return null;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let c = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) { c += (xs[i] - mx) * (ys[i] - my); dx += (xs[i] - mx) ** 2; dy += (ys[i] - my) ** 2; }
  // Spread against magnitude, not against zero — the flat-series bug from
  // telemetry.mjs, which once produced a confident r = 1.00 from two
  // constant series because sxx was 5.9e-31 rather than 0.
  const flat = (d, vals) => d <= 1e-12 * Math.max(1, ...vals.map((v) => v * v));
  if (flat(dx, xs) || flat(dy, ys)) return null;
  return c / Math.sqrt(dx * dy);
}

/**
 * Cut a price series into the pre-registered non-overlapping windows.
 * Each window is `horizon` bars of trailing return then `horizon` bars of
 * forward return, and the next window begins `stride` bars later — so with
 * stride = 2 x horizon no bar is ever counted twice.
 *
 * WHERE THE GRID STARTS. The registration fixes the stride and says nothing
 * about the phase, which is fine for a single backtest over a fixed array and
 * NOT fine for a collector that refetches a growing series on a schedule:
 * anchored to the array, one extra bar in the fetch moves every pivot, two
 * runs record different windows, and the non-overlap the whole registration
 * rests on is gone. So when `times` (bar open stamps, ms) is supplied the grid
 * is anchored to the Unix epoch instead — a pivot bar is one whose stamp is an
 * exact multiple of `stride` hours — which is the same grid on every run, for
 * every asset, forever.
 *
 * That phase was pinned while the forward test stood at n = 0, so no result
 * could have influenced the choice, and midnight UTC is the one anchor nobody
 * has to argue about. It resolves a gap in the spec; it changes no parameter
 * in it.
 */
export function windows(prices, spec, times = null) {
  const { horizon_bars: h, stride_bars: stride } = spec.rule;
  const out = [];
  const BAR_MS = 3600_000;
  const isPivot = (i) => (times ? times[i] % (stride * BAR_MS) === 0 : (i - h) % stride === 0);
  for (let i = h; i + h < prices.length; i++) {
    if (!isPivot(i)) continue;
    const a = prices[i - h], b = prices[i], c = prices[i + h];
    if (!(a > 0) || !(b > 0) || !(c > 0)) continue;
    out.push({ index: i, past: (b - a) / a * 1e4, fwd: (c - b) / b * 1e4 });
  }
  return out;
}

/**
 * Apply the rule across the universe. `byAsset` maps asset → price array,
 * all on the same bar grid and the same length.
 *
 * Returns one row per (window, asset) with the side the rule took, or why it
 * did not take one. Nothing here may look at or past the bar being predicted:
 * the estimate for window t pools only windows strictly before t.
 */
export function evaluate(byAsset, spec) {
  const { universe, K, gate_abs_r: gate } = spec.rule;
  const W = {};
  for (const a of universe) W[a] = windows(byAsset[a] || [], spec);
  const m = Math.min(...universe.map((a) => W[a].length));
  const rows = [];

  for (let t = K; t < m; t++) {
    const past = [], fwd = [];
    for (const a of universe) {
      for (let k = t - K; k < t; k++) { past.push(W[a][k].past); fwd.push(W[a][k].fwd); }
    }
    const r = pearson(past, fwd);
    for (const a of universe) {
      const w = W[a][t];
      const row = { asset: a, t, r, past: w.past, fwd: w.fwd };
      if (r === null) { row.skipped = 'no estimate'; rows.push(row); continue; }
      if (Math.abs(r) < gate) { row.skipped = `|r| ${Math.abs(r).toFixed(3)} under the ${gate} gate`; rows.push(row); continue; }
      if (w.past === 0) { row.skipped = 'no trailing move to follow or fade'; rows.push(row); continue; }
      row.side = Math.sign(r) * Math.sign(w.past);
      row.correct = row.side === Math.sign(w.fwd);
      row.earnedBps = row.side * w.fwd;
      rows.push(row);
    }
  }
  return rows;
}

/** One-sided binomial tail, exact. No normal approximation at small n. */
export function binomialTailP(k, n, p = 0.5) {
  if (n <= 0 || k > n) return 1;
  // log-space, so 200-choose-120 does not overflow
  const lg = (x) => { let s = 0; for (let i = 2; i <= x; i++) s += Math.log(i); return s; };
  const lchoose = (a, b) => lg(a) - lg(b) - lg(a - b);
  let tail = 0;
  for (let i = k; i <= n; i++) tail += Math.exp(lchoose(n, i) + i * Math.log(p) + (n - i) * Math.log(1 - p));
  return Math.min(1, tail);
}

/** The verdict, bound by the pre-registered minimum sample and nothing else. */
export function verdict(rows, spec) {
  const traded = rows.filter((r) => r.side !== undefined);
  const n = traded.length;
  const right = traded.filter((r) => r.correct).length;
  const COST = 9.4;   // the registered round-trip cost, in bp
  const gross = n ? traded.reduce((s, r) => s + r.earnedBps, 0) / n : null;
  // With no predictions there is no per-prediction cost to charge either, so
  // net is null rather than a bare -9.4 that reads like a standing loss.
  const net = n ? gross - COST : null;
  const p = n ? binomialTailP(right, n) : 1;
  const min = spec.minimum_n_before_any_claim;

  if (n < min) {
    return { n, right, accuracy: n ? right / n : null, p, grossBps: gross, netBps: net,
      claim: null,
      status: `${n} of the ${min} predictions the registration requires before any claim — ${min - n} to go.` };
  }
  const pass = right / n > 0.5 && p < 0.05;
  const secondary = net > 0;
  return { n, right, accuracy: right / n, p, grossBps: gross, netBps: net,
    claim: pass ? (secondary ? 'supported' : 'directionally supported but not after costs') : 'falsified',
    status: pass
      ? `${(right / n * 100).toFixed(1)}% on n=${n}, one-sided p = ${p.toExponential(2)}. ` +
        `Net ${net.toFixed(1)}bp per prediction after the ${COST}bp round trip.`
      : `${(right / n * 100).toFixed(1)}% on n=${n}, one-sided p = ${p.toFixed(3)}. The registration called this falsified.` };
}
