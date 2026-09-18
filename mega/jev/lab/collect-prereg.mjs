// collect-prereg.mjs — the forward test, run on a schedule.
//
// Pulls fresh 1h candles for the registered universe, applies the FROZEN rule
// from preregister.json, and appends any newly-completed prediction to
// prereg-results.json. It is idempotent: a window already recorded is never
// recorded again, so the file only ever grows and re-running is safe.
//
// It does not interpret. It records. The verdict comes from verdict() and is
// bound by the registered minimum sample, so a good-looking interim run
// cannot be cashed in early.
//
//   node mega/jev/lab/collect-prereg.mjs [--dry]
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { pearson, windows, verdict } from './prereg.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(here, 'preregister.json'), 'utf8'));
const OUT = join(here, 'prereg-results.json');
const DRY = process.argv.includes('--dry');
const { universe, K, gate_abs_r: GATE, horizon_bars: HB } = SPEC.rule;
const BAR_MS = 3600_000;

/**
 * The forward test begins when the registration was committed.
 *
 * `registered_utc` in the spec is a date, and midnight on that date is EARLIER
 * than the commit — which would let a window that closed that morning, while
 * the discovery work was still running, count as forward data. So the cutoff
 * here is the commit instant itself, from `git log -1 --format=%cI` on
 * 54531db6 ("jev lab: PRE-REGISTRATION of the 12h polarity rule"). Tightening
 * the cutoff can only discard predictions, never manufacture them, so it is
 * safe to do after the fact in a way that loosening it would not be.
 */
const REGISTERED_COMMIT = '54531db6b9dfe750b423b190166a9340d89adbb6';
const REGISTERED_AT = Date.parse('2026-09-18T22:29:14Z');

async function candles(coin, pages = 10) {
  const seen = new Map();
  let end = Date.now();
  for (let i = 0; i < pages; i++) {
    const body = { type: 'candleSnapshot',
      req: { coin, interval: '1h', startTime: end - 600 * BAR_MS, endTime: end } };
    const res = await fetch('https://api.hyperliquid.xyz/info', {
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

const store = existsSync(OUT)
  ? JSON.parse(readFileSync(OUT, 'utf8'))
  : { spec_id: SPEC.id, registered_utc: SPEC.registered_utc, registered_commit: REGISTERED_COMMIT,
      started_ms: REGISTERED_AT, started_utc: new Date(REGISTERED_AT).toISOString(),
      minimum_n: SPEC.minimum_n_before_any_claim, predictions: [] };
if (store.spec_id !== SPEC.id) {
  throw new Error(`results file is for ${store.spec_id}, spec is ${SPEC.id} — a new registration needs a new file`);
}
const known = new Set(store.predictions.map((p) => `${p.asset}@${p.closes_ms}`));

const series = {};
for (const a of universe) series[a] = await candles(a);
const len = Math.min(...universe.map((a) => series[a].length));
if (!len) { console.log('no candles returned; nothing to do'); process.exit(0); }

// Align on the shared tail so a window index means the same hours everywhere.
const px = {}, ts = {};
for (const a of universe) {
  const tail = series[a].slice(-len);
  px[a] = tail.map((c) => c.c);
  ts[a] = tail.map((c) => c.t);
}
// Pass the bar stamps so the grid is anchored to the clock, not to however
// many bars this particular fetch happened to return. Without that, a run an
// hour later records a DIFFERENT, overlapping set of windows.
const W = {};
for (const a of universe) W[a] = windows(px[a], SPEC, ts[a]);
const m = Math.min(...universe.map((a) => W[a].length));

let added = 0, skippedEarly = 0;
for (let t = K; t < m; t++) {
  const past = [], fwd = [];
  for (const a of universe) for (let k = t - K; k < t; k++) { past.push(W[a][k].past); fwd.push(W[a][k].fwd); }
  const r = pearson(past, fwd);
  if (r === null || Math.abs(r) < GATE) continue;

  for (const a of universe) {
    const w = W[a][t]; if (!w || w.past === 0) continue;
    // The forward leg closes HB bars after the window's pivot bar.
    const closes = ts[a][w.index + HB];
    if (!Number.isFinite(closes)) continue;
    // Only windows that closed AFTER the registration count as forward test.
    if (closes < REGISTERED_AT) { skippedEarly++; continue; }
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
store.verdict = verdict(store.predictions.map((p) => ({ ...p, side: p.side })), SPEC);

/**
 * How fast this actually accrues, and the correction that goes with it.
 *
 * The registration's own `known_weaknesses` says "12h windows accrue at 2 per
 * asset per day, so n >= 200 takes roughly 33 days". That is wrong twice over,
 * and measuring it against the 208-day history says so: a stride of 24 bars
 * puts one window per asset per DAY, not two (measured 0.993), and the |r|
 * gate passes only 64.7% of them. 1.75 predictions a day across three assets,
 * so n = 200 is about 114 days.
 *
 * The note is commentary, not a rule parameter, and the spec file stays frozen
 * regardless — a registration that gets edited when its schedule turns out
 * inconvenient is not a registration. So the correction is published here and
 * the collector just keeps running. A pre-registration you can cash in three
 * days would not have been worth writing.
 */
const MEASURED_PER_DAY = 1.75;
store.accrual = {
  measured_per_day: MEASURED_PER_DAY,
  measured_against: '208 days of 1h candles, BTC/ETH/SOL, the registered rule',
  spec_note_is_wrong: "known_weaknesses says 2 per asset per day and ~33 days; it is 1 per asset per day, the gate passes 64.7%, and n=200 is about 114 days. The spec file is left frozen.",
};
const remaining = Math.max(0, SPEC.minimum_n_before_any_claim - store.predictions.length);
store.eta_days = Math.round(remaining / MEASURED_PER_DAY);

console.log(`+${added} new prediction(s); ${skippedEarly} window(s) predate the registration and do not count`);
console.log(`total ${store.predictions.length} — ${store.verdict.status}`);
if (remaining) console.log(`at the measured ${MEASURED_PER_DAY}/day that is about ${store.eta_days} more days`);
if (DRY) { console.log('(dry run, nothing written)'); process.exit(0); }
writeFileSync(OUT, JSON.stringify(store, null, 1) + '\n');
console.log(`wrote ${OUT}`);
