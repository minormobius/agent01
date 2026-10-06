#!/usr/bin/env node
// node cli.mjs <dir> [--as-of YYYY-MM-DD]  -> one JSON report on stdout
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { report, isDate } from './vv.mjs';

function fail(msg) { process.stderr.write(`cli.mjs: ${msg}\n`); process.exit(1); }
const USAGE = 'usage: node cli.mjs <dir> [--as-of YYYY-MM-DD]';

const args = process.argv.slice(2);
let dir, asOf;
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--as-of' || a.startsWith('--as-of=')) {
    asOf = a === '--as-of' ? args[++i] : a.slice(8);
    if (!isDate(asOf)) fail(`--as-of needs a YYYY-MM-DD date, got ${JSON.stringify(asOf)}`);
  } else if (dir === undefined) dir = a;
  else fail(`unexpected argument ${JSON.stringify(a)}\n${USAGE}`);
}
if (dir === undefined) fail(USAGE);
if (!existsSync(dir) || !statSync(dir).isDirectory()) fail(`no such directory: ${dir}`);

function read(name, empty) {
  const p = join(dir, name);
  if (!existsSync(p)) return empty;
  let txt = readFileSync(p, 'utf8');
  if (txt.charCodeAt(0) === 0xfeff) txt = txt.slice(1);
  if (txt.trim() === '') return empty; // DECISION: an empty file is the same as a missing one
  try { return JSON.parse(txt); } catch (e) { fail(`${name}: not valid JSON (${e.message})`); }
}

const data = {
  requirements: read('requirements.json', []),
  links: read('links.json', []),
  evidence: read('evidence.json', []),
  measures: read('measures.json', []),
  plan: read('plan.json', null),
  actuals: read('actuals.json', []),
};
let out;
try { out = report(data, { asOf }); } catch (e) { fail(e.message); }
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
