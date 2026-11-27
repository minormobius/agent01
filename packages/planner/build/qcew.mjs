#!/usr/bin/env node
// QCEW annual averages for Milwaukee County -> data/derived/qcew-county.csv (long format),
// and for the United States -> data/derived/qcew-us.csv (the national denominators).
//
// Two industry bases that do not splice cleanly: SIC 1975-2000 and NAICS 1990-2024. The
// 1990-2000 overlap is kept on purpose — it is the only honest bridge between them.
// Levels kept: total, by ownership, division/supersector, 2-digit, 3-digit.
// Ownership: 0 total covered, 1 federal, 2 state, 3 local government, 5 private.
// A suppressed cell (disclosure_code "N") is written with empty numbers, never as zero.
import { readdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const LEVEL = {
  sic:   { 26: 'total', 27: 'own', 28: 'division', 29: '2digit', 30: '3digit' },
  naics: { 70: 'total', 71: 'own', 72: 'domain', 73: 'supersector', 74: 'sector', 75: '3digit' },
  us:    { 10: 'total', 11: 'own', 12: 'domain', 13: 'supersector', 14: 'sector', 15: '3digit' },
};
const HEADER = ['basis', 'year', 'own', 'level', 'code', 'title', 'estabs', 'emp', 'wages', 'suppressed'];
const q = s => /[",]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;

// county (SIC + NAICS) -> qcew-county.csv; national NAICS -> qcew-us.csv (basis 'naics')
for (const [outFile, sets] of [['qcew-county.csv', [['sic', 'qcew-sic'], ['naics', 'qcew']]], ['qcew-us.csv', [['us', 'qcew-us']]]]) {
const rows = [HEADER];
for (const [basis, dir] of sets) {
  for (const f of readdirSync(join(ROOT, 'data/raw', dir)).filter(f => /^\d{4}\.csv$/.test(f)).sort()) {
    let h, n = 0;
    for await (const r of readCsv(join(ROOT, 'data/raw', dir, f))) {
      if (!h) { h = Object.fromEntries(r.map((k, i) => [k, i])); continue; }
      const lvl = LEVEL[basis][r[h.agglvl_code]];
      if (!lvl || r[h.size_code] !== '0') continue;
      const sup = r[h.disclosure_code] === 'N';
      rows.push([basis === 'us' ? 'naics' : basis, r[h.year], r[h.own_code], lvl, r[h.industry_code].replace(/^SIC_/, ''), q(r[h.industry_title].trim()),
        sup ? '' : r[h.annual_avg_estabs_count], sup ? '' : r[h.annual_avg_emplvl], sup ? '' : r[h.total_annual_wages], sup ? 1 : 0].join(','));
      n++;
    }
    if (!n) console.warn(`${dir}/${f}: no rows kept`);
  }
}
writeFileSync(join(ROOT, 'data/derived', outFile), rows.map(r => Array.isArray(r) ? r.join(',') : r).join('\n') + '\n');
console.log(`${outFile}: ${rows.length - 1} rows`);
}
