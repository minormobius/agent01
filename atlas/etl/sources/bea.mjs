// bea.mjs — U.S. Bureau of Economic Analysis, Regional Economic Accounts.
//
// The BEA's county tables are the spine of this atlas: they are the only
// annual, complete, county-level measure of what an economy IS MADE OF —
// not just how big it is, but where the money comes from. The share of
// personal income arriving as wages, as a business owner's draw, as a
// dividend cheque, or as a government transfer is four different countries
// living inside the same map, and the BEA measures all four every year back
// to 1969.
//
// No API key. BEA publishes the whole table as a zipped CSV; the API needs a
// key and is rate-limited, and this needs the whole cross-section anyway.

import { get } from '../lib/fetch-cache.mjs';
import { listZip, readEntry } from '../lib/zip.mjs';
import { records, num } from '../lib/csv.mjs';

const BASE = 'https://apps.bea.gov/regional/zip/';

export const SOURCE = {
  id: 'bea-regional',
  publisher: 'U.S. Bureau of Economic Analysis',
  title: 'Regional Economic Accounts — CAINC4, CAINC30, CAEMP25N, CAGDP2',
  landing: 'https://www.bea.gov/data/economic-accounts/regional',
  url: `${BASE}CAINC4.zip`,
  licence: 'U.S. Government work — public domain (17 U.S.C. §105). BEA asks that the source be cited.',
  cadence: 'annual, released each November with a February revision',
  geography: 'U.S. counties and county equivalents (BEA combines a few independent cities with their surrounding county — see `combined` below)',
  cite: 'U.S. Bureau of Economic Analysis, "CAINC4: Personal Income by Major Component and Earnings by NAICS Industry" and "CAGDP2: Gross Domestic Product by County".',
};

/** LineCode → our measure key, per table. */
const LINES = {
  CAINC4: {
    10: 'income', 12: 'farm_income', 20: 'pop', 35: 'earnings',
    46: 'dividends', 47: 'transfers', 50: 'wages', 70: 'proprietors',
  },
  CAGDP2: {
    1: 'gdp', 3: 'gdp_agriculture', 6: 'gdp_mining', 12: 'gdp_manufacturing',
    50: 'gdp_finance', 59: 'gdp_professional', 68: 'gdp_eds_health', 83: 'gdp_government',
  },
  // CAINC30 is where the transfer story gets specific: means-tested income
  // maintenance, unemployment insurance and retirement are three very
  // different dependencies that a single "transfers" line hides.
  CAINC30: {
    60: 'income_maintenance', 70: 'unemployment_ins', 80: 'retirement_other',
  },
  // Jobs, not people: BEA counts full-time and part-time jobs by place of
  // work, so employment over population can exceed 1 in a commuter magnet.
  CAEMP25N: { 10: 'employment', 20: 'employment_wage_salary', 40: 'employment_proprietors' },
};

/**
 * Read one BEA regional table.
 * @param {string} table    e.g. 'CAINC4'
 * @param {number[]} years  which year columns to keep
 * @returns Map<geoid, Map<`${key}:${year}`, number>>
 */
export async function readTable(table, years) {
  const buf = await get(`${BASE}${table}.zip`, `BEA ${table}`);
  const entry = listZip(buf).find((e) => /ALL_AREAS.*\.csv$/i.test(e.name));
  if (!entry) throw new Error(`BEA ${table}: no ALL_AREAS csv in the archive`);
  const text = readEntry(buf, entry).toString('latin1');

  const wanted = LINES[table];
  const out = new Map();
  let kept = 0;
  for (const r of records(text)) {
    const key = wanted[+r.LineCode];
    if (!key) continue;
    const fips = (r.GeoFIPS || '').replace(/["\s]/g, '');
    // Real counties only: 5 digits, not a state total (xx000) and not one of
    // BEA's own region rollups (the 9xxxx block).
    if (!/^\d{5}$/.test(fips) || fips.endsWith('000') || fips.startsWith('9')) continue;
    let m = out.get(fips);
    if (!m) out.set(fips, m = new Map());
    for (const y of years) {
      const v = num(r[String(y)]);
      if (v != null) { m.set(`${key}:${y}`, v); kept++; }
    }
  }
  process.stderr.write(`  BEA ${table}: ${out.size} counties, ${kept} values\n`);
  return out;
}

/**
 * BEA reports a handful of areas as combinations that the Census draws
 * separately — Virginia's independent cities with their surrounding counties,
 * Maui + Kalawao, and so on. The combined value is filed under the leading
 * FIPS; the partner county would otherwise be a hole in the map, so we copy
 * the per-capita-style values across and leave the totals where BEA put them.
 * (A total copied into both halves would double-count on rollup, which is
 * exactly the kind of error a hierarchy is supposed to make impossible.)
 */
export const BEA_COMBINED = {
  '51901': ['51003', '51540'], '51903': ['51005', '51580'], '51907': ['51015', '51790', '51820'],
  '51911': ['51031', '51680'], '51913': ['51035', '51640'], '51918': ['51053', '51570', '51730'],
  '51919': ['51059', '51600', '51610'], '51921': ['51069', '51840'], '51923': ['51081', '51595'],
  '51929': ['51089', '51690'], '51931': ['51095', '51830'], '51933': ['51121', '51750'],
  '51939': ['51143', '51590'], '51941': ['51149', '51670'], '51942': ['51153', '51683', '51685'],
  '51944': ['51161', '51775'], '51945': ['51163', '51530', '51678'], '51947': ['51165', '51660'],
  '51949': ['51175', '51620'], '51951': ['51177', '51630'], '51953': ['51191', '51520'],
  '51955': ['51195', '51720'], '51958': ['51199', '51735'],
  '15901': ['15005', '15009'],
  '02063': ['02261'], '02066': ['02261'],
};
