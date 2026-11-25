#!/usr/bin/env node
// Cross-checks on data/derived/. Every check states what would be wrong if it failed.
// Exit 1 on any failure. Runs on committed files only, so it works without data/raw/.
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const D = f => join(ROOT, 'data/derived', f);
const json = f => JSON.parse(readFileSync(D(f), 'utf8'));
const split = l => [...l.matchAll(/("(?:[^"]|"")*"|[^,]*)(,|$)/g)].slice(0, -1).map(m => m[1].replace(/^"|"$/g, '').replace(/""/g, '"'));
const csv = f => { const [h, ...rs] = readFileSync(D(f), 'utf8').trim().split('\n').map(split); return rs.map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
let fails = 0, passes = 0;
const check = (ok, what) => { if (ok) passes++; else { fails++; console.log('FAIL', what); } };
const near = (a, b, tol) => Math.abs(a - b) <= tol * Math.max(Math.abs(a), Math.abs(b), 1);

// --- MPROP --------------------------------------------------------------------------------
const mp = json('mprop-annual.json').years;
const years = Object.keys(mp).map(Number);
check(years.length === 50 && !years.includes(1981), `MPROP has 50 years, 1975-2025 without 1981 (got ${years.length})`);
for (const y of years) {
  const a = mp[y];
  check(a.parcels > 150000 && a.parcels < 170000, `${y}: parcel count ${a.parcels} outside 150k-170k — a truncated or mis-parsed file`);
  const byClass = Object.values(a.byClass).reduce((s, b) => s + b.n, 0);
  check(byClass === a.parcels, `${y}: class counts (${byClass}) do not sum to parcels (${a.parcels})`);
  check(near(a.totals.land + a.totals.impr, a.totals.total, 0.01), `${y}: land + improvements != total assessed (${a.totals.land + a.totals.impr} vs ${a.totals.total})`);
  const unresolved = a.holders.unresolved?.n || 0, exempt = Object.values(a.holders).reduce((s, h) => s + h.n, 0);
  check(unresolved / exempt < 0.06, `${y}: ${unresolved}/${exempt} exempt parcels have no resolved holder`);
  check(a.holders['city-tax-deed']?.n > 500, `${y}: fewer than 500 city tax-deed parcels — exemption codes probably mis-read`);
}
for (let i = 1; i < years.length; i++) {
  const [p, c] = [mp[years[i - 1]].parcels, mp[years[i]].parcels];
  check(near(p, c, 0.02), `${years[i]}: parcel count moved >2% in a year (${p} -> ${c})`);
}

// --- QCEW ---------------------------------------------------------------------------------
const q = csv('qcew-county.csv');
const tot = (basis, y) => +q.find(r => r.basis === basis && r.year === String(y) && r.level === 'total')?.emp;
for (let y = 1990; y <= 2000; y++) check(near(tot('sic', y), tot('naics', y), 0.01), `QCEW ${y}: SIC and NAICS county totals disagree by >1% (${tot('sic', y)} vs ${tot('naics', y)})`);
for (const basis of ['sic', 'naics']) for (const y of new Set(q.filter(r => r.basis === basis).map(r => r.year))) {
  const owns = q.filter(r => r.basis === basis && r.year === y && r.level === 'own' && r.suppressed === '0');
  if (owns.length === 4) check(near(owns.reduce((s, r) => s + +r.emp, 0), tot(basis, y), 0.001), `QCEW ${basis} ${y}: ownership sectors do not sum to total`);
}

// --- LODES vs QCEW: two independent counts of county jobs ---------------------------------
const lo = csv('lodes.csv');
for (const r of lo.filter(r => r.kind === 'wac' && r.geo === 'county')) {
  // LODES counts jobs held at the start of Q2 (a person with two jobs counts twice); QCEW is
  // the annual-average employment level. They run 0-7% apart, widest in 2020 and 2022. >8% means a broken join.
  check(near(+r.C000, tot('naics', r.year), 0.08), `${r.year}: LODES county jobs ${r.C000} vs QCEW ${tot('naics', r.year)} differ by >8%`);
  const city = lo.find(c => c.year === r.year && c.kind === 'wac' && c.geo === 'city');
  check(+city.C000 < +r.C000, `${r.year}: city jobs exceed county jobs`);
}

// --- BEA input-output: columns must balance -----------------------------------------------
for (const f of ['io-use-summary.json', 'io-use-sector.json']) {
  const t = json(f).years;
  for (const [y, tab] of Object.entries(t)) {
    const row = n => tab.rows.find(r => r.name === n);
    const ti = row('Total Intermediate'), va = row('Total Value Added'), out = row('Total Industry Output');
    let bad = 0;
    const nInd = tab.cols.findIndex(c => c.name === 'Total Intermediate'); // industries precede final uses
    tab.cols.slice(0, nInd).forEach((c, j) => { if (!near(ti.v[j] + va.v[j], out.v[j], 0.002)) bad++; });
    check(ti && va && out && nInd > 10 && bad === 0, `${f} ${y}: ${bad} industry columns where intermediate + value added != output`);
  }
}

// --- population ---------------------------------------------------------------------------
const pop = json('population.json');
for (const [y, v] of Object.entries(pop.city)) {
  check(v.pop > 500000 && v.pop < 800000, `city population ${y} = ${v.pop} implausible`);
  if (pop.county[y]) check(v.pop < pop.county[y], `${y}: city population exceeds county`);
}

console.log(`${passes} checks passed, ${fails} failed`);
process.exitCode = fails ? 1 : 0;
