#!/usr/bin/env node
// node cli.mjs <reports.csv> <residents.csv> <start-date>  → one JSON object (SPEC M6)
import { readFileSync } from 'node:fs';
import { parseReports, parseResidents, report } from './mod.mjs';

const [rp, rs, start] = process.argv.slice(2);
if (!rp || !rs || !/^\d{4}-\d{2}-\d{2}$/.test(start || '')) {
  console.error('usage: node cli.mjs <reports.csv> <residents.csv> <YYYY-MM-DD>');
  process.exit(2);
}
try {
  const out = report(parseReports(readFileSync(rp, 'utf8')), parseResidents(readFileSync(rs, 'utf8')), start);
  console.log(JSON.stringify(out));
} catch (e) {
  console.error(String(e.message || e));
  process.exit(1);
}
