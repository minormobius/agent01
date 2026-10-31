// shelf/clinic-eras.mjs — before/after summary of a visits CSV around a cutover date.
// usage: node shelf/clinic-eras.mjs <visits.csv> [cutover=2026-03-16] [--days]
// Prints, per era: visits/seen/walkouts, wait min/p25/median/p75/max (median-of-halves-free:
// type-7 linear quantiles), SD, counts under/over thresholds; Fisher exact (two-sided) on walkouts;
// what the ORIGINAL buggy dashboard showed per week (string sort, upper middle, walkouts dropped);
// with --days, a per-day table (first/last sign-in, n, walkouts, min/median wait).
// Self-contained: does not import the dashboard, so it is an independent check of it.
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}$/.test(a));
const cut = args.find((a) => /^\d{4}-\d{2}-\d{2}$/.test(a)) ?? '2026-03-16';
if (!file) { console.error('usage: node shelf/clinic-eras.mjs <visits.csv> [cutover] [--days]'); process.exit(2); }

const lines = readFileSync(file, 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter((l) => l.trim());
const cols = lines[0].split(',').map((c) => c.trim());
const rows = lines.slice(1).map((l) => Object.fromEntries(l.split(',').map((v, i) => [cols[i], v.trim()])));
const ms = (t) => Date.parse(t.replace(' ', 'T') + ':00Z');
const wait = (r) => (ms(r.seen_at) - ms(r.signed_in)) / 60000;
const q = (s, p) => { const h = (s.length - 1) * p, lo = Math.floor(h); return s[lo] + (h - lo) * ((s[lo + 1] ?? s[lo]) - s[lo]); };
const med = (s) => (s.length ? q(s, 0.5) : null);
const sd = (xs) => { const m = xs.reduce((a, b) => a + b, 0) / xs.length; return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1)); };
const lnf = (n) => { let s = 0; for (let i = 2; i <= n; i++) s += Math.log(i); return s; };
function fisher(a, b, c, d) { // two-sided, sum of tables no more likely than observed
  const r1 = a + b, r2 = c + d, c1 = a + c, n = r1 + r2;
  const p = (x) => Math.exp(lnf(r1) + lnf(r2) + lnf(c1) + lnf(n - c1) - lnf(n) - lnf(x) - lnf(r1 - x) - lnf(c1 - x) - lnf(r2 - c1 + x));
  const p0 = p(a); let t = 0;
  for (let x = Math.max(0, c1 - r2); x <= Math.min(r1, c1); x++) { const px = p(x); if (px <= p0 * (1 + 1e-9)) t += px; }
  return t;
}

const eras = { paper: rows.filter((r) => r.signed_in.slice(0, 10) < cut), tablet: rows.filter((r) => r.signed_in.slice(0, 10) >= cut) };
const out = {};
for (const [name, rs] of Object.entries(eras)) {
  const w = rs.filter((r) => r.seen_at).map(wait).sort((a, b) => a - b);
  out[name] = { visits: rs.length, seen: w.length, walkouts: rs.length - w.length, days: new Set(rs.map((r) => r.signed_in.slice(0, 10))).size,
    min: w[0], p25: q(w, 0.25), median: med(w), p75: q(w, 0.75), max: w.at(-1), sd: +sd(w).toFixed(1), waits: w };
}
console.log(`cutover ${cut}`);
for (const [k, e] of Object.entries(out)) {
  const { waits, ...rest } = e; console.log(k.padEnd(7), JSON.stringify(rest));
}
const P = out.paper, T = out.tablet;
console.log('ratios tablet/paper  p25 %s  median %s  p75 %s', (T.p25 / P.p25).toFixed(2), (T.median / P.median).toFixed(2), (T.p75 / P.p75).toFixed(2));
const lt = T.min, gt = P.max;
console.log(`waits < ${lt} (tablet min):  paper ${P.waits.filter((x) => x < lt).length}/${P.seen}  tablet ${T.waits.filter((x) => x < lt).length}/${T.seen}`);
console.log(`waits > ${gt} (paper max):   paper ${P.waits.filter((x) => x > gt).length}/${P.seen}  tablet ${T.waits.filter((x) => x > gt).length}/${T.seen}`);
console.log(`walkouts ${P.walkouts}/${P.visits} -> ${T.walkouts}/${T.visits}  Fisher two-sided p = ${fisher(P.walkouts, P.visits - P.walkouts, T.walkouts, T.visits - T.walkouts).toFixed(4)}`);

// Pre-cutover trend: is the jump a step, or the end of a drift? OLS slope of wait on day index
// (calendar days with visits) within the paper era, with a seeded permutation p (20k shuffles).
// Also the median of the last 3 paper days, to set against the tablet median. — Modulo
{
  const seen = eras.paper.filter((r) => r.seen_at), dl = [...new Set(seen.map((r) => r.signed_in.slice(0, 10)))].sort();
  const x = seen.map((r) => dl.indexOf(r.signed_in.slice(0, 10))), y = seen.map(wait);
  const slope = (xs, ys) => { const mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
    let s = 0, t = 0; for (let i = 0; i < xs.length; i++) { s += (xs[i] - mx) * (ys[i] - my); t += (xs[i] - mx) ** 2; } return t ? s / t : 0; };
  const b = slope(x, y); let seed = 1, ge = 0; const N = 20000;
  const rnd = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
  for (let k = 0; k < N; k++) { const yy = [...y]; for (let i = yy.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [yy[i], yy[j]] = [yy[j], yy[i]]; } if (Math.abs(slope(x, yy)) >= Math.abs(b) - 1e-12) ge++; }
  const last3 = seen.filter((r) => dl.slice(-3).includes(r.signed_in.slice(0, 10))).map(wait).sort((a, b) => a - b);
  console.log(`paper-era trend: ${b.toFixed(3)} min/day-with-visits, ${(b * (dl.length - 1)).toFixed(1)} min across ${dl.length} days, permutation p = ${(ge / N).toFixed(3)}; last 3 paper days median ${med(last3)} (n ${last3.length}) vs tablet ${T.median}`);
}

// what the original dashboard showed: walkouts dropped, Sunday weeks, string sort, element floor(n/2)
// Correct weeks start Monday; the old dashboard's started Sunday. Bucket each separately so a file with
// weekend visits isn't silently misreported. (The clinic file has none, so here the two line up.) — Morphyx
const wk = (t, mon) => { const d = new Date(t.slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (mon ? (d.getUTCDay() + 6) % 7 : d.getUTCDay())); return d.toISOString().slice(0, 10); };
const bucket = (mon) => { const m = new Map(); for (const r of rows) { const k = wk(r.signed_in, mon); if (!m.has(k)) m.set(k, []); if (r.seen_at) m.get(k).push(wait(r)); } return m; };
const right = bucket(true), oldW = bucket(false);
const weekend = rows.filter((r) => [0, 6].includes(new Date(r.signed_in.slice(0, 10) + 'T00:00:00Z').getUTCDay())).length;
console.log(`week(Mon)    correct | old week(Sun)  old-dash   [weekend visits: ${weekend}]`);
const rk = [...right.keys()].sort(), ok = [...oldW.keys()].sort();
for (let i = 0; i < Math.max(rk.length, ok.length); i++) {
  const n = rk[i] ? [...right.get(rk[i])].sort((a, b) => a - b) : null, s = ok[i] ? [...oldW.get(ok[i])].sort() : null;
  console.log((rk[i] ?? '').padEnd(10), String(n ? med(n) : '').padStart(8), ' |', (ok[i] ?? '').padEnd(10), String(s ? s[Math.floor(s.length / 2)] : '').padStart(8));
}

if (args.includes('--days')) {
  const days = new Map();
  for (const r of rows) { const d = r.signed_in.slice(0, 10); if (!days.has(d)) days.set(d, []); days.get(d).push(r); }
  console.log('day         dow first last  n  walk  minW  medW');
  for (const d of [...days.keys()].sort()) {
    const rs = days.get(d), t = rs.map((r) => r.signed_in.slice(11)).sort(), w = rs.filter((r) => r.seen_at).map(wait).sort((a, b) => a - b);
    const dow = 'SunMonTueWedThuFriSat'.slice(new Date(d + 'T00:00:00Z').getUTCDay() * 3).slice(0, 3);
    console.log(d, dow, t[0], t.at(-1), String(rs.length).padStart(2), String(rs.length - w.length).padStart(4), String(w[0]).padStart(5), String(med(w)).padStart(5));
  }
}
