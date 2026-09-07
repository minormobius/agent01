#!/usr/bin/env node
// build-data.mjs — assemble the county data stream from its primary sources.
//
//   node atlas/etl/build-data.mjs            # everything
//   node atlas/etl/build-data.mjs --us       # one nation's block
//
// Nothing here needs an API key. Raw archives are cached outside the repo
// ($ATLAS_CACHE); the committed output is the derived, rounded, columnar file.
//
// WHAT IT WRITES, into atlas/data/:
//   us-counties.json    ids + `stock:year` columns + the vintage of each stock
//   ca-divisions.json   the same shape for Canada
//   migration.json      the IRS county-to-county flow graph
//   sources.json        every source, its licence, its citation, its cadence
//
// Only STOCKS are stored. Every rate on the map is derived from these at the
// level being displayed — see packages/geohier/hier.js for why.

import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readTable, SOURCE as BEA, BEA_COMBINED } from './sources/bea.mjs';
import { fetchMeasures as fetchPEP, SOURCE as PEP } from './sources/census-pep.mjs';
import { fetchMeasures as fetchERS, SOURCE as ERS } from './sources/usda-ers.mjs';
import { fetchFlows, SOURCE as IRS } from './sources/irs-migration.mjs';
import { fetchMeasures as fetchStatCan, SOURCE as SC } from './sources/statcan.mjs';
import { fetchMeasures as fetchINEGI, SOURCE as INEGI } from './sources/inegi.mjs';
import { GEO_SOURCES } from './sources/geography.mjs';
import { RESOURCE_SOURCES } from './build-resources.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DATA = join(ROOT, 'data');

// Decade slices, so the map can ask what has been diverging from what since
// 1969 rather than only what is true now. A ratio of two years cancels the
// national deflator, which is why these are stored raw and undeflated.
const HISTORY = [1969, 1979, 1989, 1999, 2009, 2019];
const HISTORY_STOCKS = new Set(['income', 'pop', 'transfers', 'dividends', 'wages', 'employment', 'gdp']);

const round = (v, k) => {
  if (v == null || !Number.isFinite(v)) return null;
  // Stocks are big and their last digits are noise; rates are derived from
  // them, so keep ~7 significant figures and let the file get smaller.
  if (Math.abs(v) >= 1e6) return Math.round(v);
  if (Math.abs(v) >= 1e3) return Math.round(v * 10) / 10;
  return Math.round(v * 1000) / 1000;
};

// -------------------------------------------------------------- the U.S. ---

async function buildUS() {
  process.stderr.write('\nUnited States — counties\n');
  const years = new Set(HISTORY);
  const tables = {};
  const latest = {};

  for (const t of ['CAINC4', 'CAINC30', 'CAEMP25N', 'CAGDP2']) {
    // Ask for a generous year window and record which ones actually came back,
    // so a new BEA vintage is picked up by re-running rather than by editing.
    const ask = [...new Set([...HISTORY, ...Array.from({ length: 12 }, (_, i) => 2015 + i)])];
    tables[t] = await readTable(t, ask);
    for (const m of tables[t].values()) {
      for (const k of m.keys()) {
        const [stock, y] = k.split(':');
        latest[stock] = Math.max(latest[stock] || 0, +y);
      }
    }
  }

  const pep = await fetchPEP();
  const ers = await fetchERS();
  const flows = await fetchFlows();

  // The universe is the Census county list, so the map and the data agree on
  // what a county is. A BEA-only or PEP-only county would be a hole.
  const places = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8'));
  const ids = Object.keys(places).filter((id) => id.startsWith('US:') && places[id].level === 'county').sort();
  const fipsOf = (id) => id.slice(3);
  const at = Object.create(null);
  ids.forEach((id, i) => { at[id] = i; });

  const series = Object.create(null);
  const put = (stock, year, id, v) => {
    const key = `${stock}:${year}`;
    if (!series[key]) series[key] = new Array(ids.length).fill(null);
    const i = at[id];
    if (i !== undefined) series[key][i] = round(v);
  };

  // BEA. Where BEA reports a combined area, record which lead county carries
  // the total so the map can show the pair's rate on both halves and say so,
  // rather than leaving 31 white holes across Virginia.
  const combined = {};
  for (const [lead, members] of Object.entries(BEA_COMBINED)) {
    for (const mfips of members) {
      if (at['US:' + mfips] !== undefined && at['US:' + members[0]] !== undefined) {
        combined['US:' + mfips] = 'US:' + members[0];
      }
    }
  }
  let beaCombinedFills = 0;
  for (const t of Object.keys(tables)) {
    for (const [fips, m] of tables[t]) {
      for (const [k, v] of m) {
        const [stock, y] = k.split(':');
        const year = +y;
        if (year !== latest[stock] && !(HISTORY_STOCKS.has(stock) && years.has(year))) continue;
        const combined = BEA_COMBINED[fips];
        if (combined) {
          // BEA files some Virginia city/county pairs under a synthetic code.
          // Put the whole total on the FIRST member and leave the others null:
          // splitting it would invent numbers, and copying it would double the
          // state on rollup.
          put(stock, year, 'US:' + combined[0], v);
          beaCombinedFills++;
          continue;
        }
        put(stock, year, 'US:' + fips, v);
      }
    }
  }

  // Census PEP
  const pepYear = pep.years[1];
  for (const [fips, m] of pep.values) {
    for (const [k, v] of m) {
      const [stock, y] = k.split(':');
      put(stock, +y, 'US:' + fips, v);
    }
  }
  // USDA ERS
  for (const [fips, m] of ers.values) for (const [k, v] of m) {
    const [stock, y] = k.split(':');
    put(stock, +y, 'US:' + fips, v);
  }

  // IRS totals (the edges go to their own file)
  for (const [fips, t] of flows.totals) {
    put('migration_in', 2022, 'US:' + fips, t.in);
    put('migration_out', 2022, 'US:' + fips, t.out);
    put('migration_in_agi', 2022, 'US:' + fips, t.in_agi);
    put('migration_out_agi', 2022, 'US:' + fips, t.out_agi);
  }

  // The vintage of every stock, so the UI can footnote it instead of implying
  // that a 2022 employment figure is a 2024 one.
  const vintage = {};
  for (const key of Object.keys(series)) {
    const [stock, y] = key.split(':');
    vintage[stock] = Math.max(vintage[stock] || 0, +y);
  }
  vintage.rucc = 2023;
  Object.assign(vintage, {
    migration_in: 2022, migration_out: 2022, migration_in_agi: 2022, migration_out_agi: 2022,
    births: pepYear, deaths: pepYear, net_domestic_migration: pepYear, net_international_migration: pepYear,
  });

  const doc = {
    format: 'atlas-data/1',
    built: new Date().toISOString().slice(0, 10),
    nation: 'US', level: 'county', label: 'United States — counties and county equivalents',
    ids,
    current: vintage,
    combined,
    combinedNote: 'BEA reports some Virginia independent cities together with the county that surrounds them, and Kalawao with Maui. The pair’s figure is stored on the lead county; the other member points at it here, and the map shows the combined area’s rate on both.',
    gaps: {
      'US:72': 'Puerto Rico’s 78 municipios are drawn but carry no BEA or Census PEP series — neither agency publishes county-equivalent economic accounts for them in these tables.',
      'US:78': 'The U.S. Virgin Islands’ three districts are drawn but carry no BEA or Census PEP series.',
    },
    history: HISTORY,
    historyStocks: [...HISTORY_STOCKS],
    pepWindow: pep.window,
    ruccLabels: ers.labels,
    series,
  };
  writeFileSync(join(DATA, 'us-counties.json'), JSON.stringify(doc));
  const filled = Object.values(series).reduce((n, c) => n + c.filter((v) => v != null).length, 0);
  process.stderr.write(`  -> us-counties.json  ${ids.length} counties, ${Object.keys(series).length} columns, ${filled} values, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB\n`);
  process.stderr.write(`     BEA combined-area rows filed on their lead county: ${beaCombinedFills}\n`);

  const edges = { format: 'atlas-flows/1', source: 'irs-soi-migration', year: '2021-2022',
    fields: ['from', 'to', 'people', 'agi_thousands'], edges: flows.edges };
  writeFileSync(join(DATA, 'migration.json'), JSON.stringify(edges));
  process.stderr.write(`  -> migration.json    ${flows.edges.length} edges, ${(JSON.stringify(edges).length / 1024).toFixed(0)} KB\n`);
}

// ------------------------------------------------------------- Canada -----

async function buildCA() {
  process.stderr.write('\nCanada — census divisions\n');
  const sc = await fetchStatCan();
  const places = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8'));
  const ids = Object.keys(places).filter((id) => id.startsWith('CA:') && places[id].level === 'county').sort();
  const at = Object.create(null);
  ids.forEach((id, i) => { at[id] = i; });

  const series = Object.create(null);
  for (const [cduid, m] of sc.values) {
    const i = at['CA:' + cduid];
    if (i === undefined) continue;
    for (const [k, v] of m) {
      if (!series[k]) series[k] = new Array(ids.length).fill(null);
      series[k][i] = round(v);
    }
  }
  const vintage = {};
  for (const key of Object.keys(series)) { const [s, y] = key.split(':'); vintage[s] = +y; }

  const doc = {
    format: 'atlas-data/1', built: new Date().toISOString().slice(0, 10),
    nation: 'CA', level: 'county', label: 'Canada — census divisions',
    ids, current: vintage, history: [], historyStocks: [], series,
    note: 'Statistics Canada publishes these as rates and medians, not as stocks, so they are shown at census-division level only — a province’s median income must come from Statistics Canada, not from averaging its divisions.',
  };
  writeFileSync(join(DATA, 'ca-divisions.json'), JSON.stringify(doc));
  process.stderr.write(`  -> ca-divisions.json ${ids.length} divisions, ${Object.keys(series).length} columns, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB\n`);
}

// ------------------------------------------------------------- Mexico -----

async function buildMX() {
  process.stderr.write('\nMexico — municipios\n');
  const mx = await fetchINEGI();
  const places = JSON.parse(readFileSync(join(DATA, 'places.json'), 'utf8'));
  const ids = Object.keys(places).filter((id) => id.startsWith('MX:') && places[id].level === 'county').sort();
  const at = Object.create(null);
  ids.forEach((id, i) => { at[id] = i; });

  const series = Object.create(null);
  let matched = 0;
  for (const [cve, m] of mx.values) {
    const i = at['MX:' + cve];
    if (i === undefined) continue;
    matched++;
    for (const [k, v] of m) {
      if (!series[k]) series[k] = new Array(ids.length).fill(null);
      series[k][i] = round(v);
    }
  }
  const vintage = {};
  for (const key of Object.keys(series)) { const [st, y] = key.split(':'); vintage[st] = +y; }

  const doc = {
    format: 'atlas-data/1', built: new Date().toISOString().slice(0, 10),
    nation: 'MX', level: 'county', label: 'Mexico — municipios and alcaldías',
    ids, current: vintage, history: [], historyStocks: [], series,
  };
  writeFileSync(join(DATA, 'mx-municipios.json'), JSON.stringify(doc));
  process.stderr.write(`  -> mx-municipios.json ${ids.length} municipios, ${matched} matched, ${Object.keys(series).length} columns, ${(JSON.stringify(doc).length / 1024).toFixed(0)} KB\n`);
}

// ------------------------------------------------------------- sources ----

function writeSources() {
  const all = [BEA, PEP, ERS, IRS, SC, INEGI].map((s) => ({ ...s, kind: 'data' }))
    .concat(GEO_SOURCES.map((s) => ({ ...s, kind: 'boundaries' })))
    .concat(RESOURCE_SOURCES);
  const doc = { format: 'atlas-sources/1', built: new Date().toISOString().slice(0, 10), sources: all };
  writeFileSync(join(DATA, 'sources.json'), JSON.stringify(doc, null, 1));
  process.stderr.write(`\n-> sources.json      ${all.length} sources\n`);
}

async function main() {
  mkdirSync(DATA, { recursive: true });
  if (!existsSync(join(DATA, 'places.json'))) {
    throw new Error('run atlas/etl/build-geo.mjs first — the data build takes its universe of places from it');
  }
  const only = process.argv.slice(2);
  const want = (k) => only.length === 0 || only.includes('--' + k);
  if (want('us')) await buildUS();
  if (want('ca')) await buildCA();
  if (want('mx')) await buildMX();
  writeSources();
}

main().catch((e) => { console.error(e); process.exit(1); });
