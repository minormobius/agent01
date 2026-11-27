#!/usr/bin/env node
// What the model believes: for each sector, add one job's worth of outside demand (d) and
// solve. The ratio of total county jobs created to the jobs added directly is that sector's
// Type II employment multiplier (intermediate purchases + household re-spending, net of
// leakage to the rest of the country). Published so the numbers can be argued with:
// regional studies usually put metro Type II job multipliers around 1.3-2.5, highest for
// capital-intensive manufacturing and headquarters, lowest for retail and food service.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SECTORS, N } from './sectors.mjs';
import { calibrate, solveEconomy, sum } from './model.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = {};
for (const y of [2005, 2012, 2019, 2023]) {
  const c = calibrate(y); const x0 = solveEconomy(c); const E0 = sum(x0.map((x, i) => c.pi[i] ? x / c.pi[i] : 0));
  out[y] = {};
  SECTORS.forEach((s, i) => {
    if (s.noJobs || !c.pi[i]) return;
    const d = c.d.slice(); d[i] += c.pi[i];               // one job's output of new outside demand
    const x1 = solveEconomy({ ...c, d });
    const E1 = sum(x1.map((x, j) => c.pi[j] ? x / c.pi[j] : 0));
    out[y][s.id] = +(E1 - E0).toFixed(3);
  });
}
mkdirSync(join(ROOT, 'data/derived/sim'), { recursive: true });
writeFileSync(join(ROOT, 'data/derived/sim/multipliers.json'), JSON.stringify({ what: 'Type II employment multipliers: total county jobs per job of new outside demand in the sector', years: out }, null, 1) + '\n');
console.log('sector   ' + Object.keys(out).join('   '));
for (const s of SECTORS) if (out[2012][s.id] != null) console.log(s.id.padEnd(8) + Object.keys(out).map(y => out[y][s.id].toFixed(2).padStart(7)).join(''));
