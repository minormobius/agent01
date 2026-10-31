#!/usr/bin/env node
// ledger.mjs — who carries a rota. Self-contained; reads any {"YYYY-MM-DD": [names...]} JSON.
//   node shelf/ledger.mjs rota.json [people.json]
// people.json (optional): [{name, fte, leave:[dates]}]. Weight = fte × days not on leave / DAYS,
// as in the clinic's POLICY.md; without it everyone named in the rota weighs 1.
// Prints per person: shifts vs weighted share, weekend shifts vs share, longest run of days on.
import { readFileSync } from 'node:fs';
const [rf, pf] = process.argv.slice(2);
const rota = JSON.parse(readFileSync(rf, 'utf8'));
const ds = Object.keys(rota).sort(), n = ds.length;
const wkd = (d) => [0, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
const people = pf ? JSON.parse(readFileSync(pf, 'utf8'))
  : [...new Set(Object.values(rota).flat())].map((name) => ({ name }));
const slots = ds.reduce((a, d) => a + rota[d].length, 0), wslots = ds.filter(wkd).reduce((a, d) => a + rota[d].length, 0);
const w = people.map((p) => (p.fte ?? 1) * ds.filter((d) => !(p.leave || []).includes(d)).length / n);
const W = w.reduce((a, b) => a + b, 0);
console.log('name        shifts  share   diff | wkend  share   diff | longest run');
people.forEach((p, i) => {
  const on = ds.map((d) => rota[d].includes(p.name));
  const t = on.filter(Boolean).length, we = ds.filter((d, j) => on[j] && wkd(d)).length;
  let run = 0, best = 0; for (const x of on) best = Math.max(best, (run = x ? run + 1 : 0));
  const s = slots * w[i] / W, sw = wslots * w[i] / W, f = (x) => x.toFixed(2).padStart(6);
  console.log(`${p.name.padEnd(10)} ${String(t).padStart(6)} ${f(s)} ${f(t - s)} | ${String(we).padStart(5)} ${f(sw)} ${f(we - sw)} | ${best}`);
});
