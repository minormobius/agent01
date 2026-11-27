#!/usr/bin/env node
// Gate for packages/planner. Reads committed files only (data/derived/), so it runs in CI
// without the raw cache. Fails if:
//   * the derived data stops passing build/validate.mjs
//   * a historical year's books stop balancing (the model must reproduce each calibrated
//     year exactly — the identity that every forecast is built on)
//   * FLQ coefficients leave [0, 1], or a regional coefficient exceeds its national one
//   * Type II job multipliers leave [1, 3] (outside that the model is broken, not bold).
//     Gated only for sectors with >= 1,000 county jobs: agriculture and mining have ~50 jobs
//     each in Milwaukee County, and one job's worth of output there is noise (2009 AG reads 3.98).
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { YEARS, nat, cty } from './sim/data.mjs';
import { calibrate, solveEconomy, sum } from './sim/model.mjs';
import { SECTORS, N } from './sim/sectors.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
let fails = 0; const t = (ok, msg) => { if (!ok) { fails++; console.log('FAIL', msg); } };

const v = spawnSync('node', [join(HERE, 'build/validate.mjs')], { encoding: 'utf8' });
t(v.status === 0, `build/validate.mjs: ${v.stdout.trim().split('\n').slice(-3).join(' / ')}`);

t(YEARS.length >= 20, `model years ${YEARS.length} < 20`);
for (const y of YEARS) {
  const c = calibrate(y);
  const x = solveEconomy(c);
  const err = Math.max(...x.map((xi, i) => Math.abs(xi - c.x[i]) / Math.max(1, c.x[i])));
  t(err < 1e-9, `${y}: replay with observed residual demand misses by ${err}`);
  t(c.d.every(d => d >= -1e-6), `${y}: negative exogenous demand ${c.d.map(d => d.toFixed(0))}`);
  t(c.r.every(row => row.every(r => r >= 0 && r <= 1)), `${y}: FLQ factor outside [0,1]`);
  t(c.Ar.every((row, i) => row.every((a, j) => a <= nat[y].A[i][j] + 1e-12)), `${y}: regional coefficient above national`);
  const E0 = sum(x.map((xi, i) => c.pi[i] ? xi / c.pi[i] : 0));
  SECTORS.forEach((s, i) => {
    if (s.noJobs || !c.pi[i] || cty[y].emp[i] < 1000) return;
    const d = c.d.slice(); d[i] += c.pi[i];
    const E1 = sum(solveEconomy({ ...c, d }).map((xi, j) => c.pi[j] ? xi / c.pi[j] : 0));
    t(E1 - E0 >= 1 && E1 - E0 <= 3, `${y} ${s.id}: Type II job multiplier ${(E1 - E0).toFixed(2)} outside [1, 3]`);
  });
}
console.log(fails ? `${fails} failures` : `planner selftest: ${YEARS.length} years balance, coefficients and multipliers in range`);
process.exitCode = fails ? 1 : 0;
