#!/usr/bin/env node
// Rebuild every derived table from data/raw/, in dependency order, then validate.
//   node fetch.mjs && node build/all.mjs  (data, then the simulator's backtest and gate)
import { spawnSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const B = dirname(fileURLToPath(import.meta.url));
const steps = [
  ['node', 'profile-mprop.mjs'], ['node', 'mprop.mjs'], ['node', 'bea.mjs'], ['node', 'qcew.mjs'],
  ['node', 'population.mjs'], ['node', 'lodes.mjs'], ['python3', '-I', 'io.py'], ['node', 'validate.mjs'],
  ['node', '../sim/backtest.mjs'], ['node', '../sim/multipliers.mjs'], ['node', '../planner.selftest.mjs'],
];
for (const [cmd, ...args] of steps) {
  const file = args.at(-1);
  console.log(`\n── ${file}`);
  const r = spawnSync(cmd, [...args.slice(0, -1), join(B, file)], { stdio: ['ignore', 'inherit', 'inherit'] });
  if (r.status !== 0) { console.error(`${file} failed (${r.status})`); process.exit(1); }
}
