#!/usr/bin/env node
// node cli.mjs <reports.csv> <residents.csv> <start-date>
import { readFileSync } from 'node:fs';
import { parseReports, parseResidents, moderate } from './mod.mjs';

const [repPath, resPath, start] = process.argv.slice(2);
if (!repPath || !resPath || !/^\d{4}-\d{2}-\d{2}$/.test(start ?? '')) {
  console.error('usage: node cli.mjs <reports.csv> <residents.csv> <start-date YYYY-MM-DD>');
  process.exit(2);
}
// One line on stderr and exit 1 for a missing file, missing column or bad date; no stack trace.
let out;
try {
  const reports = parseReports(readFileSync(repPath, 'utf8'));
  const residents = parseResidents(readFileSync(resPath, 'utf8'));
  out = moderate(reports, residents, start);
} catch (e) {
  console.error(`cli.mjs: ${e.message}`);
  process.exit(1);
}
console.log(JSON.stringify(out));
