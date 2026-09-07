#!/usr/bin/env node
// Selftest for the perp surface. Run by scripts/preflight.mjs when perp/ changes
// and by the deploy workflow before wrangler ever runs.
//
//   node test/perp.selftest.mjs
//
// It proves the committed series are structurally sound, that stats.json still
// agrees with them, and — the interesting one — that Hyperliquid's published
// funding is still reproducible from its published premium by the clamp formula.
// If Hyperliquid changes its funding parameters, that last check is what says so.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Script } from 'node:vm';
import { stats } from '../../packages/dataviz/index.mjs';

const DATA = join(dirname(fileURLToPath(import.meta.url)), '..', 'data');
const read = (n) => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const times = (e) => { let t = e.t0; const o = []; for (const d of e.dt) { t += d; o.push(t); } return o; };
const HOUR = 3600e3, DAY = 86400e3;

let failures = 0;
function check(name, ok, detail = '') {
  if (ok) console.log(`  ok   ${name}${detail ? ' — ' + detail : ''}`);
  else { console.log(`  FAIL ${name}${detail ? ' — ' + detail : ''}`); failures++; }
}

console.log('perp selftest\n');

// ---------------------------------------------------------------- series ----
const SERIES = [
  ['btc-1d.json', DAY, ['o', 'h', 'l', 'c']],
  ['btc-6h.json', 6 * HOUR, ['o', 'h', 'l', 'c']],
  ['btc-1h.json', HOUR, ['o', 'h', 'l', 'c']],
  ['hl-btc-funding.json', HOUR, ['p', 'f']],
];

for (const [file, step, cols] of SERIES) {
  const e = read(file);
  const t = times(e);
  check(`${file} decodes`, t.length > 100, `${t.length} rows`);
  check(`${file} columns are equal length`, cols.every((c) => e[c].length === t.length));
  check(`${file} timestamps strictly increase`, t.every((v, i) => i === 0 || v > t[i - 1]));
  check(`${file} timestamps are ${step / HOUR}h-aligned`, t.every((v) => v % step === 0));
  check(`${file} has no non-finite values`, cols.every((c) => e[c].every(Number.isFinite)));
  const stale = (Date.now() - t.at(-1)) / DAY;
  check(`${file} is fresh`, stale < 4, `newest row is ${stale.toFixed(1)}d old`);
}

// OHLC must actually bracket: low <= min(open,close) and high >= max(open,close)
for (const file of ['btc-1d.json', 'btc-6h.json', 'btc-1h.json']) {
  const e = read(file);
  let bad = 0;
  for (let i = 0; i < e.o.length; i++) {
    if (e.l[i] > Math.min(e.o[i], e.c[i]) || e.h[i] < Math.max(e.o[i], e.c[i])) bad++;
  }
  check(`${file} OHLC brackets correctly`, bad === 0, bad ? `${bad} broken candles` : 'all candles');
}

// ------------------------------------------------------- the clamp model ----
const fund = read('hl-btc-funding.json');
const st = read('stats.json');
const premium = fund.p.map((v) => v / 1e8);
const funding = fund.f.map((v) => v / 1e8);
const { baseline: I, clamp: C } = st.parameters;

const err = premium.map((p, i) => Math.abs(p + Math.max(-C, Math.min(C, I - p)) - funding[i]));
const medianErr = stats.median(err);
const p99Err = stats.quantile(err, 0.99);

// The formula is reproduced from a single premium figure while the venue uses a
// TWAP of samples through the hour, so exactness is not expected — but the
// median must stay tight. A jump here means the venue changed its parameters.
// 0.05bp is loose enough to absorb the TWAP-vs-point-figure gap and tight
// enough that a change to Hyperliquid's baseline or clamp width trips it.
check('funding is reproducible from premium via the clamp',
  medianErr < 5e-6, `median error ${(medianErr * 1e4).toFixed(5)}bp`);
check('clamp model has a bounded tail',
  p99Err < 1e-3, `p99 error ${(p99Err * 1e4).toFixed(3)}bp`);

// Inside the corridor funding must be EXACTLY the baseline. That identity holds
// against the TWAP of premium samples, while we hold one figure per hour — so
// the right assertion is not "always" but "more reliably the deeper you go".
// A flat or inverted gradient would mean the corridor story is wrong.
const depth = st.clamp.pinRateByDepth;
check('pin rate rises as premium sits deeper inside the corridor',
  depth.every((d, i) => i === 0 || d.pinned >= depth[i - 1].pinned - 0.01),
  depth.map((d) => `${d.withinBp}bp:${(d.pinned * 100).toFixed(0)}%`).join('  '));
check('deep inside the corridor, funding is pinned to the baseline',
  depth.at(-1).pinned > 0.92, `${(depth.at(-1).pinned * 100).toFixed(1)}% within ${depth.at(-1).withinBp}bp`);

// ------------------------------------------------------------ stats.json ----
check('stats.json row count matches the series', st.span.hours === premium.length,
  `${st.span.hours} vs ${premium.length}`);
const recomputedCum = funding.reduce((s, x) => s + x, 0);
check('stats.json cumulative carry matches', Math.abs(recomputedCum - st.carry.cumulative) < 1e-4,
  `${(st.carry.cumulative * 100).toFixed(2)}%`);
const recomputedShare = premium.filter((x) => x > 0).length / premium.length;
check('stats.json share-positive matches', Math.abs(recomputedShare - st.premium.sharePositive) < 1e-3);
check('stats.json covers every calendar year in the series',
  st.regimes.length === new Set(times(fund).map((t) => new Date(t).getUTCFullYear())).size);

// The page asserts premium has no forward predictive power; if that ever stops
// being true the prose is wrong and should be rewritten rather than silently kept.
const maxForward = Math.max(...Object.values(st.correlation.forward).map(Math.abs));
check('premium still has no forward predictive power', maxForward < 0.15,
  `max |corr| over forward windows = ${maxForward.toFixed(3)}`);

// ---------------------------------------------------------------- assets ----
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
const app = readFileSync(join(ROOT, 'app.js'), 'utf8');
check('index.html loads app.js as a module', /<script type="module" src="\/app\.js">/.test(html));
check('app.js parses', (() => { try { new Script(app); return true; } catch (e) { return false; } })());
for (const id of ['tiles', 'asof', 'reso', 'pricecv', 'premcv', 'tip', 'corrtable', 'regimetable', 'recent', 'pricelegend']) {
  check(`index.html defines #${id}`, html.includes(`id="${id}"`));
}
for (const f of ['btc-1d.json', 'hl-btc-funding.json', 'stats.json']) {
  check(`app.js fetches data/${f}`, app.includes(f));
}
// every external fetch must be bounded, or a hung endpoint strands the UI
const bareFetch = [...app.matchAll(/[^d]fetch\('https:/g)].length;
check('external fetches all go through timedFetch', bareFetch === 0,
  bareFetch ? `${bareFetch} unbounded fetch(https:) call(s)` : 'none unbounded');

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
