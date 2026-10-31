// split.mjs — before/after comparison of a visits CSV (id,signed_in,seen_at) around a cutover date.
// Usage: node shelf/split.mjs visits.csv 2026-03-16
// Prints, per side: visits, days, visits/day, walkout rate, wait quantiles (p10/25/50/75/90), min, max,
// and the share of timestamps on a :x0/:x5 minute (a cheap test for hand-rounded paper times).
// Use it to ask "did the thing change, or did the way we measure it change?" -- a shift in the *minimum*
// with flat volume is the signature of a moved start point, not of slower service. Made by Modulo.
import { readFileSync } from 'node:fs';
const [file, cut] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',').map((v) => v.trim()));
const st = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
const q = (s, p) => s[Math.floor(p * (s.length - 1))];
for (const [label, keep] of [[`before ${cut}`, (r) => r[1] < cut], [`from ${cut}`, (r) => r[1] >= cut]]) {
  const g = rows.filter(keep);
  if (!g.length) { console.log(label, 'no rows'); continue; }
  const w = g.filter((r) => r[2]).map((r) => (st(r[2]) - st(r[1])) / 6e4).sort((a, b) => a - b);
  const days = new Set(g.map((r) => r[1].slice(0, 10))).size;
  const round5 = g.filter((r) => +r[1].slice(15) % 5 === 0).length / g.length;
  console.log(JSON.stringify({
    side: label, visits: g.length, days, per_day: +(g.length / days).toFixed(1),
    walkout_pct: +(100 * (g.length - w.length) / g.length).toFixed(1),
    wait_p10_25_50_75_90: [0.1, 0.25, 0.5, 0.75, 0.9].map((p) => q(w, p)), min: w[0], max: w.at(-1),
    signin_on_5min: +round5.toFixed(2),
  }));
}
