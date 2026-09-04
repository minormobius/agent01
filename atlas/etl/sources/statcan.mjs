// statcan.mjs — Statistics Canada, 2021 Census Profile at census-division level.
//
// Canada's census divisions are its county equivalent, and the Census Profile
// is the one file that carries the same characteristics for all 293 of them.
// Characteristics are matched BY NAME rather than by CHARACTERISTIC_ID: the
// ids are stable within a census but not across them, and a silently shifted
// id would repaint the map with the wrong variable and look completely normal.

import { get } from '../lib/fetch-cache.mjs';
import { extract } from '../lib/zip.mjs';
import { records, num } from '../lib/csv.mjs';

const URL = 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/details/download-telecharger/comp/GetFile.cfm?Lang=E&FILETYPE=CSV&GEONO=004';

export const SOURCE = {
  id: 'statcan-census-profile',
  publisher: 'Statistics Canada',
  title: 'Census Profile, 2021 Census of Population — census divisions (98-401-X2021004)',
  landing: 'https://www12.statcan.gc.ca/census-recensement/2021/dp-pd/prof/index.cfm',
  url: URL,
  licence: 'Statistics Canada Open Licence — reproduction permitted with attribution; Statistics Canada does not endorse this product.',
  cadence: 'quinquennial (census years)',
  geography: 'Canadian census divisions',
  cite: 'Statistics Canada, Census Profile, 2021 Census of Population, Catalogue no. 98-316-X2021001.',
  note: 'Canadian dollars are NOT converted to U.S. dollars anywhere in this atlas — a cross-border income comparison needs a purchasing-power adjustment this project does not yet have.',
};

// name pattern → our measure key. First match wins, and each must match at most
// one characteristic or the build fails loudly rather than picking one.
const WANT = [
  [/^Population, 2021$/i,                                            'pop'],
  [/^Population percentage change, 2016 to 2021$/i,                  'pop_change_pct'],
  [/^Population density per square kilometre$/i,                     'pop_density'],
  [/^Median age of the population$/i,                                'median_age'],
  [/^Median total income of household in 2020 \(\$\)$/i,             'median_household_income'],
  [/^Average total income of household in 2020 \(\$\)$/i,            'mean_household_income'],
  [/^Median employment income in 2020 among recipients \(\$\)$/i,    'median_employment_income'],
  [/^Employment rate$/i,                                             'employment_rate'],
  [/^Unemployment rate$/i,                                           'unemployment_rate'],
  [/^Prevalence of low income based on the Low-income measure, after tax \(LIM-AT\) \(%\)$/i, 'low_income_rate'],
];

export async function fetchMeasures() {
  const buf = await get(URL, 'StatCan 2021 Census Profile — census divisions');
  const files = extract(buf, /_data\.csv$/i);
  const name = Object.keys(files)[0];
  if (!name) throw new Error('StatCan: no data CSV inside the archive');
  const text = files[name].toString('latin1');

  const values = new Map();
  const matchedIds = new Map();                    // key → CHARACTERISTIC_ID seen
  for (const r of records(text)) {
    const geo = (r.ALT_GEO_CODE || r.GEO_CODE || '').trim();
    if (!/^\d{4}$/.test(geo)) continue;            // 4-digit CDUID
    const label = (r.CHARACTERISTIC_NAME || '').trim();
    for (const [re, key] of WANT) {
      if (!re.test(label)) continue;
      const id = r.CHARACTERISTIC_ID;
      if (matchedIds.has(key) && matchedIds.get(key) !== id) {
        throw new Error(`StatCan: "${label}" matched ${key} under two ids (${matchedIds.get(key)}, ${id}) — tighten the pattern`);
      }
      matchedIds.set(key, id);
      const v = num(r.C1_COUNT_TOTAL ?? r.C1_COUNT_TOTAL_SEX_TOTAL);
      if (v != null) {
        let m = values.get(geo);
        if (!m) values.set(geo, m = new Map());
        m.set(`${key}:2021`, v);
      }
      break;
    }
  }
  const missing = WANT.filter(([, k]) => !matchedIds.has(k)).map(([, k]) => k);
  process.stderr.write(`  StatCan: ${values.size} census divisions, ${matchedIds.size}/${WANT.length} characteristics`);
  process.stderr.write(missing.length ? ` (missing: ${missing.join(', ')})\n` : '\n');
  return { values, matchedIds: Object.fromEntries(matchedIds) };
}
