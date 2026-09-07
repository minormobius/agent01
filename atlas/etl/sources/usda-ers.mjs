// usda-ers.mjs — USDA Economic Research Service, Rural-Urban Continuum Codes.
//
// The single most useful control variable on a county map. Almost every
// econometric contrast in the United States is partly a metro/non-metro
// contrast, and a regionalisation that does not know which counties are rural
// will simply rediscover the cities. RUCC is a nine-level ordinal: 1-3 metro by
// size, 4-9 non-metro by size and by adjacency to a metro area.

import { get } from '../lib/fetch-cache.mjs';
import { records, num } from '../lib/csv.mjs';

const URL = 'https://ers.usda.gov/sites/default/files/_laserfiche/DataFiles/53251/Ruralurbancontinuumcodes2023.csv';

export const SOURCE = {
  id: 'usda-ers-rucc',
  publisher: 'USDA Economic Research Service',
  title: 'Rural-Urban Continuum Codes, 2023',
  landing: 'https://www.ers.usda.gov/data-products/rural-urban-continuum-codes/',
  url: URL,
  licence: 'U.S. Government work — public domain (17 U.S.C. §105).',
  cadence: 'decennial, revised after each census',
  geography: 'U.S. counties and county equivalents',
  cite: 'U.S. Department of Agriculture, Economic Research Service, "Rural-Urban Continuum Codes" (2023 revision).',
};

export async function fetchMeasures() {
  const text = (await get(URL, 'USDA ERS rural-urban continuum')).toString('utf8');
  const values = new Map();
  const labels = {};
  for (const r of records(text)) {
    const fips = (r.FIPS || '').padStart(5, '0');
    if (!/^\d{5}$/.test(fips)) continue;
    let m = values.get(fips);
    if (!m) values.set(fips, m = new Map());
    if (r.Attribute === 'RUCC_2023') m.set('rucc:2023', num(r.Value));
    if (r.Attribute === 'Description') labels[String(m.get('rucc:2023'))] = r.Value;
  }
  process.stderr.write(`  USDA ERS: ${values.size} counties\n`);
  return { values, labels };
}
