#!/usr/bin/env node
// Derive every statistic the page quotes, straight from data/. Nothing in
// index.html hardcodes a number — it all comes from data/stats.json, so the
// prose cannot drift from the series once the cron refreshes them.
//
//   node scripts/analyse.mjs
//
// Estimators come from packages/dataviz/stats.js (repo rule: import, don't
// reimplement). This runs in node only, so the cross-directory import is fine —
// the browser never loads it.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stats } from '../../packages/dataviz/index.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, '..', 'data');
const HOUR = 3600e3;

// Hyperliquid's published funding parameters, as of 2026-08. If Hyperliquid
// changes them the model error in the selftest will blow up and say so.
const BASELINE = 0.0000125;  // interest-rate term, per hour (0.01% per 8h)
const CLAMP    = 0.0005;     // premium clamp, ±5bp per hour

const read = (n) => JSON.parse(readFileSync(join(DATA, n), 'utf8'));
const times = (e) => { let t = e.t0; const o = []; for (const d of e.dt) { t += d; o.push(t); } return o; };

const fund = read('hl-btc-funding.json');
const ft = times(fund);
const premium = fund.p.map((v) => v / 1e8);
const funding = fund.f.map((v) => v / 1e8);

const spot = read('btc-1h.json');
const st = times(spot);
const close = new Map(st.map((t, i) => [t, spot.c[i] / 100]));

const round = (x, n = 6) => Number(x.toFixed(n));
const years = premium.length / 24 / 365;

// --- distribution ------------------------------------------------------------
const qs = [0, 0.01, 0.05, 0.25, 0.5, 0.75, 0.95, 0.99, 1];
const distribution = Object.fromEntries(
  qs.map((q) => [String(q), round(stats.quantile(premium, q), 8)]),
);

// --- the clamp ---------------------------------------------------------------
// funding = premium + clamp(BASELINE − premium, ±CLAMP). Inside the band the
// premium terms cancel exactly and funding is pinned at BASELINE regardless of
// what the premium does — that dead zone is the whole point of chart 2.
const model = premium.map((p) => p + Math.max(-CLAMP, Math.min(CLAMP, BASELINE - p)));
const modelErr = model.map((m, i) => Math.abs(m - funding[i]));
const pinned = funding.filter((f) => Math.abs(f - BASELINE) < 1e-9).length;

// The corridor identity holds against the TWAP of premium samples, but we only
// publish a single premium figure per hour. So the identity should hold WELL
// inside the corridor and fray at its edge, where the TWAP can cross a boundary
// the point figure did not. Measuring that gradient is how we show the
// reconstruction is sound rather than merely asserting it.
const pinRateByDepth = [1, 0.7, 0.5, 0.3].map((m) => {
  const sel = premium.map((p, i) => ({ p, f: funding[i] })).filter((r) => Math.abs(BASELINE - r.p) < CLAMP * m);
  const pin = sel.filter((r) => Math.abs(r.f - BASELINE) < 2e-7).length;
  return { withinBp: round(CLAMP * m * 1e4, 2), hours: sel.length, pinned: round(pin / sel.length, 4) };
});

// --- does premium track price? ----------------------------------------------
// Aligned log returns, then correlation at a range of leads and lags. The point
// of publishing this is that the forward numbers are ~0.
const aligned = [];
for (let i = 0; i < ft.length; i++) {
  const px = close.get(ft[i]);
  if (px) aligned.push({ t: ft[i], p: premium[i], px });
}
const logret = (a, b) => Math.log(b / a);

function corrAtLag(k) {
  const xs = [], ys = [];
  for (let i = 1; i < aligned.length; i++) {
    const j = i + k;
    if (j < 1 || j >= aligned.length) continue;
    xs.push(aligned[i].p);
    ys.push(logret(aligned[j - 1].px, aligned[j].px));
  }
  return round(stats.correlation(xs, ys), 4);
}

function corrWindow(w, forward) {
  const xs = [], ys = [];
  for (let i = 0; i < aligned.length; i++) {
    const j = forward ? i + w : i - w;
    if (j < 0 || j >= aligned.length) continue;
    xs.push(aligned[i].p);
    ys.push(forward ? logret(aligned[i].px, aligned[j].px) : logret(aligned[j].px, aligned[i].px));
  }
  return round(stats.correlation(xs, ys), 4);
}

const WINDOWS = [1, 6, 24, 72, 168];

// --- regime by calendar year -------------------------------------------------
const byYear = {};
ft.forEach((t, i) => {
  const y = new Date(t).getUTCFullYear();
  (byYear[y] ??= { hours: 0, premiumSum: 0, fundingSum: 0, positive: 0 });
  const b = byYear[y];
  b.hours++; b.premiumSum += premium[i]; b.fundingSum += funding[i];
  if (premium[i] > 0) b.positive++;
});
const regimes = Object.entries(byYear).map(([year, b]) => ({
  year: +year,
  hours: b.hours,
  meanPremium: round(b.premiumSum / b.hours, 8),
  fundingPaid: round(b.fundingSum, 6),
  annualised: round(b.fundingSum / (b.hours / 24 / 365), 6),
  sharePositive: round(b.positive / b.hours, 4),
}));

const cumulative = funding.reduce((s, x) => s + x, 0);

const out = {
  generated: new Date().toISOString(),
  span: { from: ft[0], to: ft.at(-1), hours: premium.length, years: round(years, 3) },
  parameters: { baseline: BASELINE, clamp: CLAMP, note: 'Hyperliquid, per hour' },
  premium: {
    mean: round(premium.reduce((s, x) => s + x, 0) / premium.length, 8),
    distribution,
    sharePositive: round(premium.filter((x) => x > 0).length / premium.length, 4),
  },
  clamp: {
    sharePinnedAtBaseline: round(pinned / funding.length, 4),
    shareOutsideBand: round(premium.filter((p) => Math.abs(p) > CLAMP).length / premium.length, 4),
    modelErrorMedian: round(stats.median(modelErr), 10),
    modelErrorP99: round(stats.quantile(modelErr, 0.99), 10),
    modelErrorMax: round(Math.max(...modelErr), 10),
    pinRateByDepth,
  },
  carry: {
    cumulative: round(cumulative, 6),
    annualised: round(cumulative / years, 6),
    shareLongsPaid: round(funding.filter((x) => x > 0).length / funding.length, 4),
  },
  correlation: {
    note: 'premium_t vs log return. lag<0 = past, lag>0 = future.',
    lags: Object.fromEntries([-6, -3, -1, 0, 1, 3, 6, 24].map((k) => [String(k), corrAtLag(k)])),
    trailing: Object.fromEntries(WINDOWS.map((w) => [String(w), corrWindow(w, false)])),
    forward: Object.fromEntries(WINDOWS.map((w) => [String(w), corrWindow(w, true)])),
    samples: aligned.length,
  },
  regimes,
};

writeFileSync(join(DATA, 'stats.json'), JSON.stringify(out, null, 1));
console.log(`data/stats.json — ${premium.length}h, ${years.toFixed(2)}y`);
console.log(`  premium mean ${(out.premium.mean * 1e4).toFixed(2)}bp, positive ${(out.premium.sharePositive * 100).toFixed(1)}%`);
console.log(`  funding pinned at baseline ${(out.clamp.sharePinnedAtBaseline * 100).toFixed(1)}% of hours`);
for (const d of pinRateByDepth) console.log(`    within ${d.withinBp}bp of baseline: ${(d.pinned * 100).toFixed(1)}% pinned (n=${d.hours})`);
console.log(`  carry ${(out.carry.annualised * 100).toFixed(2)}%/yr, longs paid ${(out.carry.shareLongsPaid * 100).toFixed(1)}% of hours`);
console.log(`  corr(premium, forward 168h return) = ${out.correlation.forward['168']}`);
for (const r of regimes) console.log(`  ${r.year}: mean premium ${(r.meanPremium * 1e4).toFixed(2)}bp, ann funding ${(r.annualised * 100).toFixed(1)}%, premium>0 ${(r.sharePositive * 100).toFixed(1)}%`);
