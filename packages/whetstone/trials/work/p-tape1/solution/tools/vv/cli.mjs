#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { load, lint, trace, status, coverage, tpm, earned } from './vv.mjs';
const args = process.argv.slice(2);
const dir = args.find((a) => !a.startsWith('--')) || '.';
const i = args.indexOf('--as-of');
const read = (f, d) => (existsSync(join(dir, f)) ? JSON.parse(readFileSync(join(dir, f), 'utf8')) : d);
const list = read('requirements.json', []), links = read('links.json', []), evidence = read('evidence.json', []);
const measures = read('measures.json', []), plan = read('plan.json', null), actuals = read('actuals.json', []);
const dates = [...evidence.map((e) => e.at), ...actuals.map((a) => a.at), ...measures.flatMap((m) => (m.history || []).map((h) => h.at))].sort();
const asOf = i >= 0 ? args[i + 1] : dates.at(-1) || new Date().toISOString().slice(0, 10);
const { reqs, problems } = load(list);
const st = status(reqs, links, evidence, { asOf });
const lints = Object.fromEntries(reqs.map((r) => [r.id, lint(r)]).filter(([, c]) => c.length));
console.log(JSON.stringify({
  asOf, problems, lint: lints, coverage: coverage(reqs, st), orphans: trace(reqs, links).orphans, status: st,
  tpms: Object.fromEntries(measures.map((m) => [m.id, tpm(m, { asOf })])),
  evm: plan ? earned(reqs, links, evidence, plan, actuals, { asOf }) : null,
}));
