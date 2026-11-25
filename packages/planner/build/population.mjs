#!/usr/bin/env node
// City of Milwaukee population -> data/derived/population.json
//   city:   decennial counts 1960-1990 (data/manual), Census estimates 2000-2024 (popest)
//   county: BEA CAINC1 line 2, 1969-2024 (needs build/bea.mjs first)
// Each estimate vintage is kept separately; where vintages overlap the later one is the
// headline and the disagreement is recorded, because the 2010 and 2020 censuses both
// revised the preceding decade.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const manual = JSON.parse(readFileSync(join(ROOT, 'data/manual/decennial-city.json'), 'utf8'));
const vintages = {};
for (const f of ['sub-est00int.csv', 'SUB-EST2020_ALL.csv', 'sub-est2024.csv']) {
  let h; const v = {};
  for await (const r of readCsv(join(ROOT, 'data/raw/popest', f))) {
    if (!h) { h = r.map(s => s.trim().toUpperCase()); continue; }
    const g = k => r[h.indexOf(k)];
    if (g('SUMLEV') !== '162' || g('STATE') !== '55' || g('PLACE') !== '53000') continue;
    h.forEach((k, i) => {
      let m;
      if ((m = k.match(/^POPESTIMATE(\d{4})$/))) v[m[1]] = +r[i];
      else if ((m = k.match(/^CENSUS(\d{4})POP$/))) v[`census${m[1]}`] = +r[i];
    });
  }
  if (!Object.keys(v).length) throw new Error(`${f}: Milwaukee city row not found`);
  vintages[f] = v;
}
const city = {}, overlap = {};
for (const [y, n] of Object.entries(manual.counts)) city[y] = { pop: n, src: 'decennial (manual)' };
for (const [f, v] of Object.entries(vintages)) for (const [y, n] of Object.entries(v)) {
  if (!/^\d{4}$/.test(y)) { const yy = y.slice(6); city[yy] = { pop: n, src: `decennial (${f})` }; continue; }
  if (city[y] && !city[y].src.startsWith('decennial')) (overlap[y] ||= {})[city[y].src] = city[y].pop;
  if (!city[y] || !city[y].src.startsWith('decennial')) city[y] = { pop: n, src: f };
}
let county = {};
const beaPath = join(ROOT, 'data/derived/bea-county.json');
if (existsSync(beaPath)) county = JSON.parse(readFileSync(beaPath, 'utf8')).tables.CAINC1['2'].values;
const out = {
  city: Object.fromEntries(Object.entries(city).sort()),
  vintageOverlap: overlap,
  county,
  note: 'City figures for 2000+ are July-1 estimates except census years, which are April-1 counts. County is BEA mid-year population.',
};
writeFileSync(join(ROOT, 'data/derived/population.json'), JSON.stringify(out, null, 1) + '\n');
console.log(Object.entries(out.city).map(([y, v]) => `${y}:${v.pop}`).join(' '));
