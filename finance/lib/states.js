/**
 * US state data for financial planning tools.
 *
 * Each row: [abbr, fips, name, propTaxRate%, avgInsAnnual$, avgUtilMonthly$, stateIncTaxRate%]
 *
 *   - propTaxRate: median effective property tax rate (Tax Foundation 2023)
 *   - avgInsAnnual: average homeowner's premium $/yr (NAIC dwelling-fire/HO reports)
 *   - avgUtilMonthly: average residential utilities $/mo (EIA blended)
 *   - stateIncTaxRate: rough effective state income tax rate at mid-high income
 *     — for SALT calc, scale by AGI as a starting estimate; users should override
 *     with their actual state tax owed for accuracy
 *
 * Usage:
 *   import { STATES, getStateByFips, getStateByAbbr } from '/lib/states.js';
 */

export const STATES = [
  ['AL','01','Alabama',       0.40, 1900, 380, 4.0],
  ['AK','02','Alaska',        1.07, 1100, 380, 0.0],
  ['AZ','04','Arizona',       0.63, 1450, 290, 2.5],
  ['AR','05','Arkansas',      0.64, 2200, 340, 4.4],
  ['CA','06','California',    0.75, 1450, 320, 7.0],
  ['CO','08','Colorado',      0.55, 2300, 280, 4.4],
  ['CT','09','Connecticut',   1.79, 1500, 400, 5.5],
  ['DE','10','Delaware',      0.61, 1100, 320, 5.0],
  ['DC','11','District of Columbia', 0.62, 1300, 290, 7.0],
  ['FL','12','Florida',       0.91, 3700, 320, 0.0],
  ['GA','13','Georgia',       0.92, 1750, 340, 4.5],
  ['HI','15','Hawaii',        0.32,  700, 410, 7.0],
  ['ID','16','Idaho',         0.67, 1100, 280, 5.0],
  ['IL','17','Illinois',      2.08, 1500, 320, 4.95],
  ['IN','18','Indiana',       0.84, 1500, 320, 3.05],
  ['IA','19','Iowa',          1.52, 1750, 320, 4.0],
  ['KS','20','Kansas',        1.41, 2800, 320, 5.0],
  ['KY','21','Kentucky',      0.83, 1850, 320, 4.0],
  ['LA','22','Louisiana',     0.56, 3000, 380, 4.0],
  ['ME','23','Maine',         1.24, 1100, 340, 6.0],
  ['MD','24','Maryland',      1.05, 1400, 320, 5.0],
  ['MA','25','Massachusetts', 1.14, 1700, 380, 5.0],
  ['MI','26','Michigan',      1.38, 1500, 320, 4.25],
  ['MN','27','Minnesota',     1.11, 2300, 280, 6.5],
  ['MS','28','Mississippi',   0.79, 2100, 360, 4.7],
  ['MO','29','Missouri',      1.01, 2200, 320, 4.7],
  ['MT','30','Montana',       0.74, 1500, 280, 5.0],
  ['NE','31','Nebraska',      1.63, 3100, 290, 5.5],
  ['NV','32','Nevada',        0.59, 1100, 300, 0.0],
  ['NH','33','New Hampshire', 1.93, 1100, 340, 0.0],
  ['NJ','34','New Jersey',    2.23, 1300, 350, 5.5],
  ['NM','35','New Mexico',    0.67, 1700, 280, 4.5],
  ['NY','36','New York',      1.40, 1500, 350, 6.0],
  ['NC','37','North Carolina',0.82, 1500, 300, 4.5],
  ['ND','38','North Dakota',  0.98, 1900, 290, 2.0],
  ['OH','39','Ohio',          1.59, 1300, 310, 3.5],
  ['OK','40','Oklahoma',      0.89, 4000, 320, 4.5],
  ['OR','41','Oregon',        0.93,  950, 270, 8.0],
  ['PA','42','Pennsylvania',  1.49, 1200, 320, 3.07],
  ['RI','44','Rhode Island',  1.40, 1500, 380, 4.5],
  ['SC','45','South Carolina',0.57, 1750, 320, 4.5],
  ['SD','46','South Dakota',  1.17, 2100, 290, 0.0],
  ['TN','47','Tennessee',     0.67, 1900, 320, 0.0],
  ['TX','48','Texas',         1.68, 3000, 360, 0.0],
  ['UT','49','Utah',          0.57, 1100, 270, 4.55],
  ['VT','50','Vermont',       1.83, 1100, 340, 5.5],
  ['VA','51','Virginia',      0.87, 1400, 310, 5.0],
  ['WA','53','Washington',    0.87, 1300, 240, 0.0],
  ['WV','54','West Virginia', 0.57, 1300, 300, 4.5],
  ['WI','55','Wisconsin',     1.61, 1200, 310, 5.0],
  ['WY','56','Wyoming',       0.61, 1200, 280, 0.0],
];

const BY_FIPS = Object.fromEntries(STATES.map(s => [s[1], s]));
const BY_ABBR = Object.fromEntries(STATES.map(s => [s[0], s]));

/**
 * Get state tuple by FIPS code.
 * @param {string} fips - 2-digit FIPS code (e.g. '06' for California)
 * @returns {[string, string, string, number, number, number, number] | undefined}
 */
export function getStateByFips(fips) {
  return BY_FIPS[fips];
}

/**
 * Get state tuple by 2-letter abbreviation.
 * @param {string} abbr
 */
export function getStateByAbbr(abbr) {
  return BY_ABBR[abbr];
}

/**
 * Convenient object-form accessor.
 * @param {string} fips
 * @returns {{ abbr, fips, name, propTaxRate, avgInsAnnual, avgUtilMonthly, stateIncTaxRate } | null}
 */
export function stateInfo(fips) {
  const s = BY_FIPS[fips];
  if (!s) return null;
  return {
    abbr: s[0], fips: s[1], name: s[2],
    propTaxRate: s[3] / 100,
    avgInsAnnual: s[4],
    avgUtilMonthly: s[5],
    stateIncTaxRate: s[6] / 100,
  };
}
