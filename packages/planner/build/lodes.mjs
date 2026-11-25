#!/usr/bin/env node
// LODES -> data/derived/lodes.csv: jobs located in (wac) and held by residents of (rac)
// the City of Milwaukee and Milwaukee County, 2002-2023, by NAICS sector (CNS01-20) and
// monthly-earnings band (CE01 <=$1250, CE02 $1251-3333, CE03 >$3333).
//
// This is the bridge between the two geographies: MPROP is the city, QCEW/BEA are the
// county. LODES 8 tabulates every year on 2020 census blocks, so the city boundary is
// the same block set in every year (the city's 2020 extent — annexations are not tracked).
import { writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = join(ROOT, 'data/raw/lodes');
const CITY = '5553000', COUNTY = '55079';
const geo = new Map();
let h;
for await (const r of readCsv(join(D, 'wi_xwalk.csv.gz'))) {
  if (!h) { h = Object.fromEntries(r.map((k, i) => [k, i])); continue; }
  if (r[h.cty] !== COUNTY && r[h.stplc] !== CITY) continue;
  geo.set(r[h.tabblk2020], { city: r[h.stplc] === CITY, county: r[h.cty] === COUNTY });
}
const cityBlocks = [...geo.values()].filter(g => g.city).length;
const outside = [...geo.values()].filter(g => g.city && !g.county).length;
console.log(`blocks: city ${cityBlocks} (outside county: ${outside}), county ${[...geo.values()].filter(g => g.county).length}`);

const COLS = ['C000', 'CE01', 'CE02', 'CE03', ...Array.from({ length: 20 }, (_, i) => `CNS${String(i + 1).padStart(2, '0')}`)];
const rows = [['year', 'kind', 'geo', ...COLS]];
for (let y = 2002; y <= 2023; y++) for (const kind of ['wac', 'rac']) {
  const acc = { city: COLS.map(() => 0), county: COLS.map(() => 0) };
  let hh, key;
  for await (const r of readCsv(join(D, kind, `${y}.csv.gz`))) {
    if (!hh) { hh = r.map(k => k.trim()); key = hh[0]; continue; }
    const g = geo.get(r[0]); if (!g) continue;
    for (const [name, on] of Object.entries(g)) if (on) COLS.forEach((c, i) => { acc[name][i] += +r[hh.indexOf(c)]; });
  }
  for (const name of ['city', 'county']) rows.push([y, kind, name, ...acc[name]]);
  console.log(y, kind, 'city', acc.city[0], 'county', acc.county[0]);
}
writeFileSync(join(ROOT, 'data/derived/lodes.csv'), rows.map(r => r.join(',')).join('\n') + '\n');
