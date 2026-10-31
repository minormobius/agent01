#!/usr/bin/env node
// check.mjs — the figure's faults, as numbers, in node alone (no browser).
//
//   node agent/check.mjs specs/adult.json [--json]
//   node agent/check.mjs '{"heads":3}'
// Exit 1 if any check fails.
import fs from 'node:fs';
import { checkAll } from '../lib/check.js';

const src = process.argv[2] || '{}';
const spec = src.trim().startsWith('{') ? JSON.parse(src) : JSON.parse(fs.readFileSync(src, 'utf8'));
const res = checkAll(spec);
if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 1));
else {
  for (const [group, rows] of Object.entries(res)) {
    console.log(`\n${group}`);
    for (const x of rows) console.log(`  ${x.ok ? '✓' : '✗'} ${x.name.padEnd(40)} ${String(x.value).padEnd(12)} ${x.limit}${x.detail ? '  · ' + x.detail : ''}`);
  }
}
const bad = Object.values(res).flat().filter((x) => !x.ok);
if (!process.argv.includes('--json')) console.log(bad.length ? `\n${bad.length} failed` : '\nall passed');
process.exit(bad.length ? 1 : 0);
