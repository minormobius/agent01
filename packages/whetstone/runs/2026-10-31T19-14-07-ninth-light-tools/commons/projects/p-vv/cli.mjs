#!/usr/bin/env node
// node cli.mjs <dir> [--as-of YYYY-MM-DD]  → one JSON object on stdout (SPEC M6).
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { report } from './vv.mjs';

// D19: `--as-of D` and `--as-of=D` both work, anywhere on the line.
// D20: `--check` makes the exit code a gate (CI): 3 if any load problem, failed leaf or breached
// TPM, or coverage ratio below `--min-coverage R` (default 0). The JSON printed is unchanged.
const argv = process.argv.slice(2);
const flag = (name, takesValue) => {
  for (let k = 0; k < argv.length; k++) {
    if (argv[k] === name) { const v = takesValue ? argv[k + 1] : true; argv.splice(k, takesValue ? 2 : 1); return v ?? ''; }
    if (takesValue && argv[k].startsWith(name + '=')) { const v = argv[k].slice(name.length + 1); argv.splice(k, 1); return v; }
  }
  return undefined;
};
const asOf = flag('--as-of', true);
if (asOf !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(asOf)) { console.error('--as-of needs YYYY-MM-DD'); process.exit(2); }
const check = flag('--check', false);
const minCovArg = flag('--min-coverage', true);
const minCov = minCovArg === undefined ? 0 : Number(minCovArg);
if (!(minCov >= 0 && minCov <= 1)) { console.error('--min-coverage needs a number in [0, 1]'); process.exit(2); }
const dir = argv.find((a) => !a.startsWith('--'));
if (!dir) { console.error('usage: node cli.mjs <dir> [--as-of YYYY-MM-DD] [--check [--min-coverage R]]'); process.exit(2); }

// D13: a missing file is empty ([] for lists, null for plan). An empty or whitespace-only file is
// treated the same. A file that isn't valid JSON is an error (exit 1), not silently empty.
function read(name, empty) {
  const p = join(dir, name);
  if (!existsSync(p)) return empty;
  const t = readFileSync(p, 'utf8');
  if (t.trim() === '') return empty;
  try { return JSON.parse(t); } catch (e) { console.error(`${p}: ${e.message}`); process.exit(1); }
}
const data = {
  requirements: read('requirements.json', []), links: read('links.json', []),
  evidence: read('evidence.json', []), measures: read('measures.json', []),
  plan: read('plan.json', null), actuals: read('actuals.json', []),
};
const out = report(data, { asOf });
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
if (check) {
  const why = [];
  if (out.problems.length) why.push(`${out.problems.length} problem(s)`);
  if (out.coverage.failed) why.push(`${out.coverage.failed} failed leaf/leaves`);
  const breached = Object.keys(out.tpms).filter((k) => out.tpms[k].status === 'breached').sort();
  if (breached.length) why.push(`breached TPM: ${breached.join(', ')}`);
  if (out.coverage.ratio < minCov) why.push(`coverage ${out.coverage.ratio} < ${minCov}`);
  if (why.length) { console.error('vv check FAILED: ' + why.join('; ')); process.exit(3); }
}
