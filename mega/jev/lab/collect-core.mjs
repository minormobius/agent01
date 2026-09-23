// collect-core.mjs — the forward-test collector, with no host in it.
//
// The same code runs in node (collect-prereg.mjs, from a CI schedule) and in a
// Cloudflare Worker (mega/worker.js `scheduled`, from a cron trigger). It
// therefore uses nothing but `fetch`: no fs, no process, no node builtins.
// Whoever calls it supplies the spec and the existing record, and gets back a
// new record — reading and writing the store is the host's job.
//
// It does not interpret. It records. The verdict is computed by `verdict()`
// and is bound by the registered minimum sample, so a good-looking interim run
// cannot be cashed in early.
import { pearson, windows, verdict } from './prereg.mjs';

const BAR_MS = 3600_000;

/**
 * The forward test begins when the registration was COMMITTED, not at midnight
 * on the date it names. Midnight is earlier than the commit, which would let a
 * window that closed that morning — while the discovery work was still running
 * — count as forward data. From `git log -1 --format=%cI 54531db6`.
 */
export const REGISTERED_COMMIT = '54531db6b9dfe750b423b190166a9340d89adbb6';
export const REGISTERED_AT = Date.parse('2026-09-18T22:29:14Z');

/**
 * How fast this accrues, measured rather than quoted.
 *
 * The registration's own `known_weaknesses` says "2 per asset per day … about
 * 33 days". Measured against 208 days of history: a 24-bar stride puts ONE
 * window per asset per day (0.993) and the |r| gate passes 64.7% of them, so
 * it is 1.75 a day and n = 200 is about 114 days. The spec file stays frozen;
 * a registration edited when its schedule turns out inconvenient is not one.
 */
export const MEASURED_PER_DAY = 1.75;

/** Pull 1h candles, newest-last, paging backwards until nothing new arrives. */
export async function candles(coin, pages = 10, fetchImpl = fetch) {
  const seen = new Map();
  let end = Date.now();
  for (let i = 0; i < pages; i++) {
    const body = { type: 'candleSnapshot',
      req: { coin, interval: '1h', startTime: end - 600 * BAR_MS, endTime: end } };
    const res = await fetchImpl('https://api.hyperliquid.xyz/info', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (!res.ok) throw new Error(`hyperliquid ${res.status} for ${coin}`);
    const rows = await res.json();
    if (!rows?.length) break;
    let fresh = 0;
    for (const c of rows) if (!seen.has(c.t)) { seen.set(c.t, c); fresh++; }
    if (!fresh) break;
    end = rows[0].t - 1;
  }
  return [...seen.keys()].sort((a, b) => a - b).map((t) => ({ t, c: Number(seen.get(t).c) }));
}

/** A fresh, empty record for a spec. */
export function emptyStore(spec) {
  return {
    spec_id: spec.id,
    registered_utc: spec.registered_utc,
    registered_commit: REGISTERED_COMMIT,
    started_ms: REGISTERED_AT,
    started_utc: new Date(REGISTERED_AT).toISOString(),
    minimum_n: spec.minimum_n_before_any_claim,
    predictions: [],
  };
}

/**
 * Apply the frozen rule to fresh candles and append anything newly closed.
 *
 * Idempotent: a window already in `store` is never added twice, so running
 * this more often than the grid moves adds nothing and costs nothing. Returns
 * `{ store, added, skippedEarly }` and never mutates the input.
 *
 * `registeredAt` exists so the selftest can run the collector against a
 * stubbed exchange without waiting for real future bars. It defaults to the
 * frozen commit instant and NEITHER host passes it — a run that moved the
 * cutoff earlier would count discovery-era windows as forward data, which is
 * the one thing this whole file exists to prevent.
 */
export async function collect(spec, prev, { fetchImpl = fetch, pages = 10, registeredAt = REGISTERED_AT } = {}) {
  const { universe, K, gate_abs_r: GATE, horizon_bars: HB } = spec.rule;
  const store = prev ? { ...prev, predictions: [...prev.predictions] } : emptyStore(spec);
  if (store.spec_id !== spec.id) {
    throw new Error(`record is for ${store.spec_id}, spec is ${spec.id} — a new registration needs a new file`);
  }
  const known = new Set(store.predictions.map((p) => `${p.asset}@${p.closes_ms}`));

  const series = {};
  for (const a of universe) series[a] = await candles(a, pages, fetchImpl);
  const len = Math.min(...universe.map((a) => series[a].length));
  if (!len) return { store, added: 0, skippedEarly: 0, empty: true };

  // Align on the shared tail so a window index means the same hours everywhere.
  const px = {}, ts = {};
  for (const a of universe) {
    const tail = series[a].slice(-len);
    px[a] = tail.map((c) => c.c);
    ts[a] = tail.map((c) => c.t);
  }
  // Stamps passed so the grid is anchored to the CLOCK, not to however many
  // bars this fetch happened to return. Without that, a run an hour later
  // records a different — and overlapping — set of windows.
  const W = {};
  for (const a of universe) W[a] = windows(px[a], spec, ts[a]);
  const m = Math.min(...universe.map((a) => W[a].length));

  let added = 0, skippedEarly = 0;
  for (let t = K; t < m; t++) {
    const past = [], fwd = [];
    for (const a of universe) for (let k = t - K; k < t; k++) { past.push(W[a][k].past); fwd.push(W[a][k].fwd); }
    const r = pearson(past, fwd);
    if (r === null || Math.abs(r) < GATE) continue;

    for (const a of universe) {
      const w = W[a][t]; if (!w || w.past === 0) continue;
      const closes = ts[a][w.index + HB];
      if (!Number.isFinite(closes)) continue;
      if (closes < registeredAt) { skippedEarly++; continue; }
      const key = `${a}@${closes}`;
      if (known.has(key)) continue;
      const side = Math.sign(r) * Math.sign(w.past);
      store.predictions.push({
        asset: a, closes_ms: closes, closes_utc: new Date(closes).toISOString(),
        r: Number(r.toFixed(4)), past: Number(w.past.toFixed(2)), fwd: Number(w.fwd.toFixed(2)),
        side, correct: side === Math.sign(w.fwd), earnedBps: Number((side * w.fwd).toFixed(2)),
      });
      known.add(key);
      added++;
    }
  }
  store.predictions.sort((a, b) => a.closes_ms - b.closes_ms);
  store.updated_utc = new Date().toISOString();
  store.verdict = verdict(store.predictions, spec);
  store.accrual = {
    measured_per_day: MEASURED_PER_DAY,
    measured_against: '208 days of 1h candles, BTC/ETH/SOL, the registered rule',
    spec_note_is_wrong: 'known_weaknesses says 2 per asset per day and ~33 days; it is 1 per asset per day, '
      + 'the gate passes 64.7%, and n=200 is about 114 days. The spec file is left frozen.',
  };
  const remaining = Math.max(0, spec.minimum_n_before_any_claim - store.predictions.length);
  store.eta_days = Math.round(remaining / MEASURED_PER_DAY);
  return { store, added, skippedEarly };
}
