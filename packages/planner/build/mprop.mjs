#!/usr/bin/env node
// MPROP 1975-2025 -> one canonical parcel panel + the city's annual property ledger.
//
//   data/work/mprop/<year>.ndjson.gz   canonical record per parcel-year (not committed; the model reads it)
//   data/derived/mprop-annual.json     citywide ledger per year (committed)
//   data/derived/mprop-tract.csv       per census tract per year (committed; tract vintages change by decade)
//   data/derived/mprop-exempt-crosswalk.json   the inferred pre-1984 letter-code map
//
// Normalisations, each one evidenced in data/derived/mprop-profile.json:
//   * exemption codes 1984-~2005 are stored /10 ("48" = 480 municipal): detected per year
//     as "no code >= 100", then scaled.
//   * exemption codes 1975-1983 are letters (P6, M2, A1 ...) with no surviving codebook.
//     They are mapped to a HOLDER by following each parcel to its 1984 numeric code and
//     taking the modal holder per letter; purity is recorded, and letters under 80% pure
//     map to 'unresolved'.
//   * owner-occupancy: an empty flag in a year that carries the column means "not".
// Things NOT repaired (see QUALITY below) are flagged in the output, not hidden.
import { readdirSync, writeFileSync, mkdirSync, createWriteStream } from 'node:fs';
import { createGzip } from 'node:zlib';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readCsv } from '../lib/csv.mjs';
import { resolve, record, exemptHolder } from '../lib/mprop-schema.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RAW = join(ROOT, 'data/raw/mprop');
const WORK = join(ROOT, 'data/work/mprop');
mkdirSync(WORK, { recursive: true });
const years = readdirSync(RAW).filter(f => /^\d{4}\.csv$/.test(f)).map(f => +f.slice(0, 4)).sort();

const RES_CLASSES = new Set([1, 5, 7]);
const QUALITY = {
  units_1977_1980: 'Class-1 NUMUNITS runs ~25% above adjacent years (230k vs ~180k); cause unknown. Units series is flagged, not corrected.',
  units_2019_2021: 'Non-residential classes (2, 4, 9) carry hotel rooms / beds as units (class 4 jumps 2k -> 64k). Headline housing units use classes 1/5/7 only.',
  exempt_value_pre_1984: 'Exempt parcels carry no exempt value before 1984. Public holdings are counted by parcel and lot area only.',
  exempt_value_2022: 'The published 2022 file has exempt value for only a fraction of exempt parcels ($0.7B vs ~$5B either side). Not imputed.',
  convey_date_2009_on: 'CONVEY_DATE is partly destroyed ("00:00.0", an Excel time-format export artefact) from ~2009, and absent from 2022. Sales counts are reliable only where fill is reported high.',
  exempt_codes_2004: '2004 uses an exemption numbering seen in no other year. Holders are assigned per parcel where 2003 and 2005 agree; ~225 parcels stay unresolved, and 2004 has no Housing Authority parcels at all (they carry no code that year). Treat 2004 holder counts as approximate.',
  exempt_lot_area: 'Lot area on exempt parcels is blank before 1977 and from 2020, and corrupt for some parcels from 2022. Holder acreage is published only for years flagged fields.exemptLotAreaUsable.',
  units_1975_1976: 'Residential-class units read 160k (1975) and 223k (1976), against ~235-245k from 1982 on. The early unit fields are incomplete; do not read a housing boom into 1975-1980.',
  geography: 'MPROP is the City of Milwaukee only. QCEW and BEA tables are Milwaukee County, which also includes the inner suburbs (~40% of county population).',
};

function conveyYM(s) {
  if (!s) return null;
  let m;
  if (/^\d{1,3}$/.test(s) && s !== '0') s = s.padStart(4, '0'); // YYMM with the leading zero dropped (2000s)
  if ((m = s.match(/^(\d{2})(\d{2})$/))) { const yy = +m[1], mm = +m[2]; if (mm < 1 || mm > 12) return null; return [yy > 30 ? 1900 + yy : 2000 + yy, mm]; }
  if ((m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/))) return [+m[3], +m[1]];
  if ((m = s.match(/^(\d{4})-(\d{2})-\d{2}/))) return [+m[1], +m[2]];
  return null;
}

// ---- pass 0: crosswalks for years whose exemption codes cannot be read directly ------------
// 1975-1983 use letters; 2004 uses a numbering that matches neither neighbour (its "30"
// holds the ~2.6k parcels that are tax-deed "530" in 2003 and 2005). Both are mapped by
// following each parcel to the nearest year with readable codes.
async function readYear(y) {
  let res; const recs = [];
  for await (const row of readCsv(join(RAW, `${y}.csv`))) {
    if (!res) { res = resolve(row); continue; }
    if (row.length === 1 && row[0] === '') continue;
    recs.push(record(row, res.map, y));
  }
  return { recs, res };
}

function normaliseCodes(recs) {
  const nums = recs.map(r => r.exmType).filter(c => c && /^\d+$/.test(c)).map(Number);
  const scaled = nums.length > 0 && nums.reduce((m, v) => Math.max(m, v), 0) < 100;
  for (const r of recs) {
    if (r.exmType && /^\d+$/.test(r.exmType)) {
      const c = Number(r.exmType) * (scaled ? 10 : 1);
      r.exmType = c === 0 ? null : String(c);
      r.holder = exemptHolder(r.exmType);
    }
  }
  return scaled;
}

const ERAS = [
  { id: 'letters-1975-1983', years: years.filter(y => y < 1984), ref: 1984 },
  { id: 'renumbered-2004', years: [2004], ref: 2005 },
];
// 2004's scheme is too coarse for a code-level map (its "40" splits rail/religious/state), so
// 2004 is resolved per parcel instead: an exempt 2004 parcel takes its holder when 2003 and
// 2005 agree on it; otherwise the code-level map is used if pure enough, else 'unresolved'.
const bracket2004 = {};
for (const y of [2003, 2005]) { const { recs } = await readYear(y); normaliseCodes(recs); bracket2004[y] = new Map(recs.map(r => [r.taxkey, r.holder])); }
const eraOf = y => ERAS.find(e => e.years.includes(y));
const crosswalk = {};
for (const era of ERAS) {
  const ref = await readYear(era.ref); normaliseCodes(ref.recs);
  const refHolder = new Map(ref.recs.map(r => [r.taxkey, r.holder]));
  const tally = {};
  for (const y of era.years) {
    const { recs } = await readYear(y);
    for (const r of recs) {
      if (!r.exmType || r.exmType === '0') continue;
      const h = refHolder.has(r.taxkey) ? String(refHolder.get(r.taxkey)) : `gone-by-${era.ref}`;
      ((tally[r.exmType] ||= {})[h] = (tally[r.exmType][h] || 0) + 1);
    }
  }
  const cw = crosswalk[era.id] = {};
  for (const [code, t] of Object.entries(tally)) {
    const n = Object.values(t).reduce((a, b) => a + b, 0);
    const known = Object.entries(t).filter(([h]) => !h.startsWith('gone-by') && h !== 'null');
    const kn = known.reduce((a, [, v]) => a + v, 0);
    const [best, bv] = known.sort((a, b) => b[1] - a[1])[0] || ['unresolved', 0];
    const purity = kn ? bv / kn : 0;
    cw[code] = { holder: purity >= 0.8 && kn >= 5 ? best : 'unresolved', purity: +purity.toFixed(3), parcelYears: n, matched: kn, votes: t };
  }
  crosswalk[era.id] = Object.fromEntries(Object.entries(cw).sort((a, b) => b[1].parcelYears - a[1].parcelYears));
}
writeFileSync(join(ROOT, 'data/derived/mprop-exempt-crosswalk.json'), JSON.stringify({
  method: 'Each parcel-year with an unreadable exemption code is matched by taxkey to the reference year (1984 for the letter era, 2005 for 2004); the code takes the modal holder if >=80% of matched parcel-years agree and >=5 matched, else "unresolved". "null" votes are parcels no longer exempt in the reference year.',
  crosswalk,
}, null, 1) + '\n');

// ---- pass 1: every year ----------------------------------------------------------------
const annual = {}; const tractRows = [['year', 'tract', 'parcels', 'land', 'impr', 'total', 'res_units', 'owner_occ_sf', 'sf', 'exempt_parcels', 'public_parcels', 'tax_deed_parcels', 'vacant_lots']];
const PUBLIC = new Set(['city', 'housing-authority', 'redevelopment', 'city-tax-deed', 'schools', 'county', 'state', 'federal']);
const median = a => { if (!a.length) return null; a.sort((x, y) => x - y); return a[a.length >> 1]; };

for (const y of years) {
  const { recs, res } = await readYear(y);
  const era = eraOf(y);
  let scaled = false;
  if (era) for (const r of recs) {
    if (r.exmType === '0') r.exmType = null;
    if (!r.exmType) { r.holder = null; continue; }
    const coded = crosswalk[era.id][r.exmType]?.holder ?? 'unresolved';
    if (y === 2004) { const a = bracket2004[2003].get(r.taxkey), b = bracket2004[2005].get(r.taxkey); r.holder = a && a === b ? a : coded; }
    else r.holder = coded;
  }
  else scaled = normaliseCodes(recs);
  if (res.map.ownerOcc !== undefined) for (const r of recs) if (r.ownerOcc === null) r.ownerOcc = false;

  const gz = createGzip(); const ws = createWriteStream(join(WORK, `${y}.ndjson.gz`)); gz.pipe(ws);
  const A = { parcels: recs.length, byClass: {}, holders: {}, housing: {}, sales: {}, fields: { missing: res.missing, exemptCodesScaled: scaled, exemptCodesCrosswalked: era?.id ?? null } };
  const sfVals = []; let sf = 0, sfOO = 0, resUnits = 0, newBuild = 0, newUnits = 0, convFill = 0, sales = 0, salesValue = 0;
  const tract = new Map();
  for (const r of recs) {
    gz.write(JSON.stringify(r) + '\n');
    const c = String(r.cls ?? 'none');
    const B = A.byClass[c] ||= { n: 0, land: 0, impr: 0, total: 0, units: 0, bldgArea: 0 };
    B.n++; B.land += r.land || 0; B.impr += r.impr || 0; B.total += r.total || 0; B.units += r.units || 0; B.bldgArea += r.bldgArea || 0;
    if (r.holder) { const H = A.holders[r.holder] ||= { n: 0, exemptValue: 0, lotArea: 0 }; H.n++; H.exemptValue += r.exmTotal || 0; H.lotArea += r.lotArea || 0; }
    if (RES_CLASSES.has(r.cls)) resUnits += r.units || 0;
    const isSF = r.cls === 1 && r.units === 1;
    if (isSF) { sf++; if (r.ownerOcc) sfOO++; if (r.total > 0) sfVals.push(r.total); }
    if (r.yrBuilt && r.yrBuilt >= y - 1 && r.yrBuilt <= y) { newBuild++; if (RES_CLASSES.has(r.cls)) newUnits += r.units || 0; }
    const cv = conveyYM(r.conveyDate);
    if (cv) { convFill++; if (cv[0] === y - 1) { sales++; if (r.conveyFee > 0) salesValue += r.conveyFee / 0.003; } }
    if (r.tract) {
      const t = tract.get(r.tract) || tract.set(r.tract, { p: 0, l: 0, i: 0, t: 0, u: 0, oo: 0, sf: 0, ex: 0, pub: 0, td: 0, vac: 0 }).get(r.tract);
      t.p++; t.l += r.land || 0; t.i += r.impr || 0; t.t += r.total || 0; if (RES_CLASSES.has(r.cls)) t.u += r.units || 0;
      if (isSF) { t.sf++; if (r.ownerOcc) t.oo++; }
      if (r.holder) t.ex++; if (PUBLIC.has(r.holder)) t.pub++; if (r.holder === 'city-tax-deed') t.td++;
      if (r.luGroup === 13 || r.landUse === 8880) t.vac++;
    }
  }
  gz.end(); await new Promise(ok => ws.on('finish', ok));
  A.housing = { resClassUnits: resUnits, singleFamily: sf, singleFamilyOwnerOccupied: res.map.ownerOcc !== undefined ? sfOO : null,
    medianSingleFamilyAssessed: median(sfVals), newStructures: newBuild, newResUnits: newUnits };
  A.sales = { conveyDateFill: +(convFill / recs.length).toFixed(3), conveyedPriorYear: sales,
    impliedPriceFromTransferFee: Math.round(salesValue), note: 'Wisconsin real estate transfer fee is $3 per $1,000 (0.3%); price = fee / 0.003.' };
  A.totals = Object.values(A.byClass).reduce((s, b) => ({ land: s.land + b.land, impr: s.impr + b.impr, total: s.total + b.total }), { land: 0, impr: 0, total: 0 });
  // exempt-parcel lot area: blank for most exempt parcels from 2020, and nonsense (10^10 sq ft)
  // in 2022+ for some. Withhold area wherever it cannot be trusted rather than publish a wrong acreage.
  const exR = recs.filter(r => r.holder), exZero = exR.filter(r => !r.lotArea).length, exHuge = exR.some(r => r.lotArea > 2e8);
  A.fields.exemptLotAreaUsable = exR.length > 0 && exZero / exR.length < 0.2 && !exHuge;
  if (!A.fields.exemptLotAreaUsable) for (const H of Object.values(A.holders)) H.lotArea = null;
  A.publicHeld = Object.entries(A.holders).filter(([h]) => PUBLIC.has(h)).reduce((s, [, v]) => ({ n: s.n + v.n, exemptValue: s.exemptValue + v.exemptValue, lotArea: s.lotArea == null || v.lotArea == null ? null : s.lotArea + v.lotArea }), { n: 0, exemptValue: 0, lotArea: 0 });
  annual[y] = A;
  for (const [k, t] of [...tract].sort()) tractRows.push([y, k, t.p, t.l, t.i, t.t, t.u, t.oo, t.sf, t.ex, t.pub, t.td, t.vac]);
  console.log(`${y} parcels=${recs.length} total=$${(A.totals.total / 1e9).toFixed(2)}B resUnits=${resUnits} public=${A.publicHeld.n} taxDeed=${A.holders['city-tax-deed']?.n ?? 0} medSF=${A.housing.medianSingleFamilyAssessed} sales=${sales} (fill ${A.sales.conveyDateFill})`);
}

writeFileSync(join(ROOT, 'data/derived/mprop-annual.json'), JSON.stringify({
  geography: 'City of Milwaukee', unit: 'nominal US dollars of assessed value (Wisconsin assesses at market value; the city revalues on its own cycle, so some year-on-year jumps are revaluations, not market moves)',
  holders: 'Exemption codes grouped by holder: city, housing-authority (HACM), redevelopment (RACM), city-tax-deed (foreclosed by the city), schools (MPS), county, state, federal, religious, education, hospital, nonprofit, rail-utility, streets, unresolved.',
  quality: QUALITY, years: annual,
}, null, 1) + '\n');
writeFileSync(join(ROOT, 'data/derived/mprop-tract.csv'), tractRows.map(r => r.join(',')).join('\n') + '\n');
