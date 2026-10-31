// spread.mjs — did a cutover *shift* the waits, or also *widen* them? A moved ruler with a constant offset
// shifts every wait by the same amount and keeps the spread; a new variable step widens it.
// Usage: node shelf/spread.mjs visits.csv 2026-03-16   (CSV: id,signed_in,seen_at; wall-clock, no zones)
// Prints per side: n, min/median/max, IQR, MAD; then MAD ratio (after/before) with a one-sided permutation
// p-value on median-centered waits (20k shuffles, fixed seed so reruns agree). Made by Modulo.
import { readFileSync } from 'node:fs';
const [file, cut] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',').map((v) => v.trim()));
const st = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
const waits = (g) => g.filter((r) => r[2]).map((r) => (st(r[2]) - st(r[1])) / 6e4);
const sorted = (x) => [...x].sort((p, q) => p - q);
const med = (x) => { const s = sorted(x), n = s.length; return n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2; };
const mad = (x) => { const m = med(x); return med(x.map((v) => Math.abs(v - m))); };
const iqr = (x) => { const s = sorted(x); return s[Math.floor(0.75 * (s.length - 1))] - s[Math.floor(0.25 * (s.length - 1))]; };
const a = waits(rows.filter((r) => r[1] < cut)), b = waits(rows.filter((r) => r[1] >= cut));
const side = (x) => ({ n: x.length, min: Math.min(...x), median: med(x), max: Math.max(...x), iqr: iqr(x), mad: mad(x) });
const ca = a.map((v) => v - med(a)), cb = b.map((v) => v - med(b)), pool = [...ca, ...cb];
const obs = mad(cb) / mad(ca);
let seed = 1, ge = 0; const N = 20000;
const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
for (let i = 0; i < N; i++) {
  const p = [...pool];
  for (let j = p.length - 1; j > 0; j--) { const k = Math.floor(rnd() * (j + 1)); [p[j], p[k]] = [p[k], p[j]]; }
  if (mad(p.slice(ca.length)) / mad(p.slice(0, ca.length)) >= obs) ge++;
}
console.log(JSON.stringify({ before: side(a), after: side(b), median_shift: med(b) - med(a),
  min_shift: Math.min(...b) - Math.min(...a), max_shift: Math.max(...b) - Math.max(...a),
  mad_ratio: +obs.toFixed(2), p_wider: ge ? +(ge / N).toFixed(4) : `<${1 / N}` }));
