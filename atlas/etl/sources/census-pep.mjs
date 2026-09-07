// census-pep.mjs — U.S. Census Bureau, Population Estimates Program.
//
// The BEA tells you what a county earns. This tells you whether anyone is
// still moving there. The components of change — births, deaths, domestic
// migration, international migration — are the closest thing in official
// statistics to a revealed-preference vote, and they pull in different
// directions in ways that no single "population growth" number shows: a
// county can be growing on international migration while Americans leave it,
// and that is a completely different place from one growing on births.
//
// No API key: the Census API now requires one, but the bulk estimate files
// have always been open and are the same numbers.

import { get } from '../lib/fetch-cache.mjs';
import { records, num } from '../lib/csv.mjs';

const URL = 'https://www2.census.gov/programs-surveys/popest/datasets/2020-2024/counties/totals/co-est2024-alldata.csv';

export const SOURCE = {
  id: 'census-pep',
  publisher: 'U.S. Census Bureau, Population Division',
  title: 'County Population Totals and Components of Change: 2020–2024',
  landing: 'https://www.census.gov/programs-surveys/popest.html',
  url: URL,
  licence: 'U.S. Government work — public domain (17 U.S.C. §105).',
  cadence: 'annual, vintage released each March',
  geography: 'U.S. counties and county equivalents',
  cite: 'U.S. Census Bureau, Population Division, "County Population Totals and Components of Change: 2020-2024" (Vintage 2024).',
};

/** @returns {{values: Map<string, Map<string, number>>, years: number[]}} */
export async function fetchMeasures() {
  const text = (await get(URL, 'Census PEP components of change')).toString('latin1');
  const values = new Map();
  // The vintage's terminal year is read off the header rather than assumed, so
  // pointing this at next year's file needs no code change.
  let last = 0;
  for (const r of records(text)) {
    if (r.SUMLEV !== '050') continue;                    // 050 = county
    for (const k of Object.keys(r)) {
      const m = /^POPESTIMATE(\d{4})$/.exec(k);
      if (m) last = Math.max(last, +m[1]);
    }
    break;
  }
  const first = last - 4;
  for (const r of records(text)) {
    if (r.SUMLEV !== '050') continue;
    const fips = r.STATE + r.COUNTY;
    const m = new Map();
    m.set(`pop_census:${last}`, num(r[`POPESTIMATE${last}`]));
    m.set(`pop_census:${first}`, num(r[`POPESTIMATE${first}`]));
    // Cumulative components over the whole vintage: single years are noisy at
    // county size, and the 2020 column covers a partial year.
    let births = 0, deaths = 0, dom = 0, intl = 0, ok = false;
    for (let y = first + 1; y <= last; y++) {
      const b = num(r[`BIRTHS${y}`]), d = num(r[`DEATHS${y}`]);
      const dm = num(r[`DOMESTICMIG${y}`]), im = num(r[`INTERNATIONALMIG${y}`]);
      if (b == null) continue;
      births += b; deaths += d || 0; dom += dm || 0; intl += im || 0; ok = true;
    }
    if (ok) {
      m.set(`births:${last}`, births); m.set(`deaths:${last}`, deaths);
      m.set(`net_domestic_migration:${last}`, dom);
      m.set(`net_international_migration:${last}`, intl);
    }
    values.set(fips, m);
  }
  process.stderr.write(`  Census PEP: ${values.size} counties, components ${first + 1}–${last}\n`);
  return { values, years: [first, last], window: [first + 1, last] };
}
