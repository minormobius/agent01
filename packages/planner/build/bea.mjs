#!/usr/bin/env node
// BEA county tables -> data/derived/bea-county.json, Milwaukee County (55079) only.
// Each table keeps BEA's own LineCode and Description; suppressed cells stay as their
// BEA flag ("(D)" disclosure, "(NA)", "(NM)") rather than becoming zeros.
import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const FIPS = '55079';
const out = { geography: 'Milwaukee County, WI (FIPS 55079) — the county, not the city', source: 'BEA Regional Economic Accounts (sources.json: bea-regional)', tables: {} };

for (const t of ['CAINC1', 'CAINC30', 'CAINC5S', 'CAINC5N', 'CAEMP25N', 'CAGDP2']) {
  let header; const lines = {};
  for await (const row of readCsv(join(ROOT, `data/raw/bea/${t}.csv`))) {
    if (!header) { header = row; continue; }
    if ((row[0] || '').trim().replace(/"/g, '') !== FIPS) continue;
    const yrs = {};
    header.forEach((h, i) => { if (/^\d{4}$/.test(h)) { const v = row[i].trim(); yrs[h] = /^-?[\d.]+$/.test(v) ? Number(v) : v; } });
    lines[row[4].trim()] = { desc: row[6].trim(), unit: row[7].trim(), industry: row[5].trim(), values: yrs };
  }
  out.tables[t] = lines;
  console.log(t, Object.keys(lines).length, 'lines');
}
writeFileSync(join(ROOT, 'data/derived/bea-county.json'), JSON.stringify(out) + '\n');
