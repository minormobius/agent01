// irs-migration.mjs — IRS Statistics of Income, county-to-county migration.
//
// WHY THIS IS THE MOST INTERESTING FILE IN THE ATLAS: everything else here is
// a property OF a county. This is a relation BETWEEN counties — roughly every
// household that filed a tax return from a different county than last year,
// with how many people moved and how much income moved with them. It is a
// weighted directed graph over the whole country, built from administrative
// records rather than a survey.
//
// If thirteen regions are going to emerge from anything, they should emerge
// partly from this: two counties that trade people are in the same place in a
// way that two counties with similar median incomes are not.
//
// Disclosure rules mean small flows are suppressed, so the graph is sparse in
// the rural interior. That is a property of the data, not a bug to smooth over.

import { get } from '../lib/fetch-cache.mjs';
import { records, num } from '../lib/csv.mjs';

const YEAR = '2122';                    // filing years 2021 → 2022
const IN  = `https://www.irs.gov/pub/irs-soi/countyinflow${YEAR}.csv`;
const OUT = `https://www.irs.gov/pub/irs-soi/countyoutflow${YEAR}.csv`;

export const SOURCE = {
  id: 'irs-soi-migration',
  publisher: 'Internal Revenue Service, Statistics of Income Division',
  title: `U.S. Population Migration Data, county-to-county flows, ${YEAR.slice(0, 2)}–${YEAR.slice(2)}`,
  landing: 'https://www.irs.gov/statistics/soi-tax-stats-migration-data',
  url: IN,
  licence: 'U.S. Government work — public domain (17 U.S.C. §105).',
  cadence: 'annual',
  geography: 'U.S. county-to-county pairs; flows below the disclosure threshold are suppressed',
  cite: 'Internal Revenue Service, Statistics of Income Division, "U.S. Population Migration Data" (county-to-county, filing years 2021–2022).',
  note: 'n1 = returns (≈ households), n2 = exemptions (≈ people), agi = adjusted gross income in thousands of dollars.',
};

const isCounty = (s, c) => /^\d{1,2}$/.test(s) && +s >= 1 && +s <= 56 && /^\d{1,3}$/.test(c) && +c > 0;
const fips = (s, c) => String(s).padStart(2, '0') + String(c).padStart(3, '0');

/**
 * @param {number} topK  keep only each county's K largest inbound and outbound
 *   flows. The full matrix is ~200k edges; the map needs the shape of the
 *   thing, and the tail is mostly single-household noise.
 */
export async function fetchFlows(topK = 12) {
  const edges = new Map();                  // "a>b" → { n1, n2, agi }
  const totals = new Map();                 // county → { in, out, in_agi, out_agi }
  const bump = (id, k, v) => {
    let t = totals.get(id);
    if (!t) totals.set(id, t = { in: 0, out: 0, in_agi: 0, out_agi: 0 });
    t[k] += v;
  };

  // In BOTH files the column families mean the same thing — y1 is the origin
  // and y2 the destination — even though the two files put them in a different
  // column ORDER. Reading by name rather than by position is why the inflow and
  // outflow passes agree instead of producing a transposed second graph.
  for (const [url, dir] of [[IN, 'in'], [OUT, 'out']]) {
    const text = (await get(url, `IRS SOI ${dir}flow`)).toString('latin1');
    for (const r of records(text)) {
      if (!isCounty(r.y1_statefips, r.y1_countyfips) || !isCounty(r.y2_statefips, r.y2_countyfips)) continue;
      const from = fips(r.y1_statefips, r.y1_countyfips);
      const to   = fips(r.y2_statefips, r.y2_countyfips);
      if (to === from) continue;
      const n2 = num(r.n2) || 0, agi = num(r.agi) || 0;
      const key = `${from}>${to}`;
      const cur = edges.get(key);
      // The two files describe the same flows from opposite ends. Take the
      // larger report rather than adding, or every edge doubles.
      if (!cur || n2 > cur.n2) edges.set(key, { n2, agi, n1: num(r.n1) || 0 });
    }
  }

  for (const [key, e] of edges) {
    const [from, to] = key.split('>');
    bump(from, 'out', e.n2); bump(from, 'out_agi', e.agi);
    bump(to, 'in', e.n2);   bump(to, 'in_agi', e.agi);
  }

  // prune to the top K per endpoint, keeping an edge if EITHER end wants it
  const byFrom = new Map(), byTo = new Map();
  for (const [key, e] of edges) {
    const [from, to] = key.split('>');
    if (!byFrom.has(from)) byFrom.set(from, []);
    if (!byTo.has(to)) byTo.set(to, []);
    byFrom.get(from).push([key, e.n2]);
    byTo.get(to).push([key, e.n2]);
  }
  const keep = new Set();
  for (const m of [byFrom, byTo]) {
    for (const list of m.values()) {
      list.sort((a, b) => b[1] - a[1]);
      for (const [k] of list.slice(0, topK)) keep.add(k);
    }
  }

  const out = [];
  for (const k of keep) {
    const e = edges.get(k), [from, to] = k.split('>');
    out.push([from, to, e.n2, Math.round(e.agi)]);
  }
  process.stderr.write(`  IRS SOI: ${edges.size} county pairs → ${out.length} kept (top ${topK} per endpoint)\n`);
  return { edges: out, totals };
}
