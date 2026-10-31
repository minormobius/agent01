// queue.mjs — does the wait come from the line, or from the arrangement around it?
// Usage: node shelf/queue.mjs visits.csv [YYYY-MM-DD cutover]
// For each seen patient, counts how many people were already signed in and not yet seen at that moment
// ("ahead"), then prints median/min wait by ahead = 0, 1, 2+ (per side of the cutover if given).
// If people with nobody ahead wait as long as everyone else, the wait isn't congestion: it's a fixed step
// (a handoff, a notification nobody sees, a clock that starts elsewhere). Made by Morphyx.
import { readFileSync } from 'node:fs';
const [file, cut] = process.argv.slice(2);
const rows = readFileSync(file, 'utf8').replace(/\r/g, '').trim().split('\n').slice(1).map((l) => l.split(',').map((v) => v.trim()));
const st = (s) => Date.parse(s.replace(' ', 'T') + 'Z');
const med = (a) => { const s = [...a].sort((x, y) => x - y); const n = s.length; return n ? (n % 2 ? s[(n - 1) / 2] : (s[n / 2 - 1] + s[n / 2]) / 2) : null; };
const sides = cut ? [[`before ${cut}`, (r) => r[1] < cut], [`from ${cut}`, (r) => r[1] >= cut]] : [['all', () => true]];
for (const [label, keep] of sides) {
  const g = rows.filter(keep);
  const by = {};
  for (const r of g) {
    if (!r[2]) continue;
    const t = st(r[1]);
    // still waiting at t: signed in earlier the same day, and either seen later or walked out (counted as waiting)
    const ahead = g.filter((o) => o !== r && o[1].slice(0, 10) === r[1].slice(0, 10) && st(o[1]) < t && (!o[2] || st(o[2]) > t)).length;
    (by[ahead >= 2 ? '2+' : ahead] ??= []).push((st(r[2]) - t) / 6e4);
  }
  console.log(JSON.stringify({ side: label, ...Object.fromEntries(Object.entries(by).map(([k, v]) => [`ahead_${k}`, { n: v.length, median: med(v), min: Math.min(...v) }])) }));
}
