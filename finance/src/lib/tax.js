/**
 * Federal income tax engine — 2025 brackets (post-OBBBA).
 *
 * Used as the keystone for every financial planning tool on fin.mino.mobi.
 * Honest enough for projections, not a substitute for a CPA.
 *
 * What's in scope:
 *   - Federal ordinary income tax (single, MFJ, HoH, MFS)
 *   - Standard deductions
 *   - SALT cap per OBBBA (2025-2029 elevated, sunsets to $10k in 2030)
 *   - Mortgage interest acquisition-debt cap ($750k)
 *
 * What's NOT modeled (caller responsibility if needed):
 *   - AMT, NIIT, additional Medicare tax
 *   - Long-term capital gains brackets (separate function in this file)
 *   - State income tax (states.js carries flat effective rates)
 *   - Self-employment / SECA
 *   - QBI deduction
 *   - Inflation indexing of brackets across future years (we use 2025 flat)
 *
 * Usage:
 *   import { federalTax, marginalRate, saltCapForYear } from '/lib/tax.js';
 */

// ─── Constants ────────────────────────────────────────────────────────

export const FED_BRACKETS_2025 = {
  single: [[0,0.10],[11925,0.12],[48475,0.22],[103350,0.24],[197300,0.32],[250525,0.35],[626350,0.37]],
  mfj:    [[0,0.10],[23850,0.12],[96950,0.22],[206700,0.24],[394600,0.32],[501050,0.35],[751600,0.37]],
  hoh:    [[0,0.10],[17000,0.12],[64850,0.22],[103350,0.24],[197300,0.32],[250500,0.35],[626350,0.37]],
  mfs:    [[0,0.10],[11925,0.12],[48475,0.22],[103350,0.24],[197300,0.32],[250525,0.35],[375800,0.37]],
};

export const STD_DED_2025 = { single: 15750, mfj: 31500, hoh: 23625, mfs: 15750 };

export const FILING_LABEL = {
  single: 'Single',
  mfj: 'Married filing jointly',
  hoh: 'Head of household',
  mfs: 'Married filing separately',
};

// Long-term capital gains 2025 brackets (taxable-income thresholds).
export const LTCG_BRACKETS_2025 = {
  single: [[0,0.00],[48350,0.15],[533400,0.20]],
  mfj:    [[0,0.00],[96700,0.15],[600050,0.20]],
  hoh:    [[0,0.00],[64750,0.15],[566700,0.20]],
  mfs:    [[0,0.00],[48350,0.15],[300000,0.20]],
};

// SALT cap per OBBBA (2025). Elevated 2025-2029, sunsets to $10k in 2030.
// MAGI phase-down: cap reduced by 30% of MAGI excess above threshold, floor $10k.
// MFS uses halved cap, halved threshold, halved floor.
export const SALT_CAP_BASE = { 2025: 40000, 2026: 40400, 2027: 40804, 2028: 41212, 2029: 41624 };
export const SALT_PHASE_THRESH = { 2025: 500000, 2026: 505000, 2027: 510050, 2028: 515151, 2029: 520303 };
export const SALT_SUNSET_CAP = 10000;

// Mortgage interest deduction acquisition-debt cap (TCJA, retained by OBBBA).
export const MORT_INT_CAP = 750000;
export const MORT_INT_CAP_MFS = 375000;

// ─── SALT cap ─────────────────────────────────────────────────────────

/**
 * Effective SALT deduction cap for a given year and taxpayer.
 * @param {number} year - calendar year
 * @param {number} magi - modified AGI (used for phase-down)
 * @param {string} filing - 'single' | 'mfj' | 'hoh' | 'mfs'
 * @returns {number} cap in dollars
 */
export function saltCapForYear(year, magi, filing) {
  const isMFS = filing === 'mfs';
  let cap = SALT_CAP_BASE[year];
  if (cap === undefined) {
    return isMFS ? SALT_SUNSET_CAP / 2 : SALT_SUNSET_CAP;
  }
  let thresh = SALT_PHASE_THRESH[year] || 500000;
  let floor = SALT_SUNSET_CAP;
  if (isMFS) { cap /= 2; thresh /= 2; floor /= 2; }
  if (magi > thresh) {
    cap = Math.max(floor, cap - 0.30 * (magi - thresh));
  }
  return cap;
}

// ─── Federal income tax ───────────────────────────────────────────────

/**
 * Compute federal ordinary income tax on a given taxable income.
 * @param {number} taxableIncome
 * @param {string} filing - 'single' | 'mfj' | 'hoh' | 'mfs'
 * @param {Array<[number, number]>} [brackets] - override; defaults to 2025
 * @returns {number} tax owed in dollars
 */
export function federalTax(taxableIncome, filing, brackets) {
  if (taxableIncome <= 0) return 0;
  const b = brackets || FED_BRACKETS_2025[filing] || FED_BRACKETS_2025.single;
  let tax = 0;
  for (let i = 0; i < b.length; i++) {
    const [thresh, rate] = b[i];
    const nextThresh = b[i + 1] ? b[i + 1][0] : Infinity;
    if (taxableIncome > thresh) {
      tax += (Math.min(taxableIncome, nextThresh) - thresh) * rate;
    } else break;
  }
  return tax;
}

/**
 * Marginal tax rate (the rate the next dollar of income would face).
 * @param {number} taxableIncome
 * @param {string} filing
 * @param {Array<[number, number]>} [brackets]
 * @returns {number} rate as decimal (e.g. 0.24)
 */
export function marginalRate(taxableIncome, filing, brackets) {
  const b = brackets || FED_BRACKETS_2025[filing] || FED_BRACKETS_2025.single;
  for (let i = b.length - 1; i >= 0; i--) {
    if (taxableIncome >= b[i][0]) return b[i][1];
  }
  return 0;
}

/**
 * Long-term capital gains tax. Stacks on top of ordinary taxable income.
 * @param {number} ltcgGain - amount of LTCG
 * @param {number} ordinaryTaxableIncome - taxable ordinary income (used as base for stacking)
 * @param {string} filing
 * @returns {number} LTCG tax owed
 */
export function ltcgTax(ltcgGain, ordinaryTaxableIncome, filing) {
  if (ltcgGain <= 0) return 0;
  const b = LTCG_BRACKETS_2025[filing] || LTCG_BRACKETS_2025.single;
  let remaining = ltcgGain;
  let tax = 0;
  let cursor = Math.max(0, ordinaryTaxableIncome);
  for (let i = 0; i < b.length && remaining > 0; i++) {
    const [thresh, rate] = b[i];
    const nextThresh = b[i + 1] ? b[i + 1][0] : Infinity;
    if (cursor + remaining <= thresh) continue; // entire gain is below this bracket's lower edge
    const bracketTop = nextThresh;
    const inBracketStart = Math.max(cursor, thresh);
    const inBracketEnd = Math.min(cursor + remaining, bracketTop);
    const portion = Math.max(0, inBracketEnd - inBracketStart);
    tax += portion * rate;
    cursor += portion;
    remaining -= portion;
  }
  return tax;
}

// ─── Itemized deduction helpers ───────────────────────────────────────

/**
 * Compute deductible mortgage interest given annual interest paid and original loan size.
 * Pro-rates against the $750k acquisition-debt cap.
 * @param {number} annualInterest
 * @param {number} loanAmount - original loan balance
 * @param {string} [filing]
 * @returns {number}
 */
export function deductibleMortgageInterest(annualInterest, loanAmount, filing) {
  const cap = filing === 'mfs' ? MORT_INT_CAP_MFS : MORT_INT_CAP;
  if (loanAmount <= cap) return annualInterest;
  return annualInterest * (cap / loanAmount);
}

/**
 * Itemized deduction with SALT cap applied.
 * @param {object} inputs
 * @param {number} inputs.year
 * @param {number} inputs.magi
 * @param {string} inputs.filing
 * @param {number} inputs.stateIncomeTax - state income tax owed for the year
 * @param {number} inputs.propertyTax - property tax for the year
 * @param {number} inputs.mortgageInterest - already-deductible mortgage interest (post pro-ration)
 * @param {number} [inputs.other] - other itemizables (charity, deductible medical above 7.5% AGI, etc.)
 * @returns {{ salt: number, mortgageInterest: number, other: number, total: number, saltUncapped: number, saltCap: number }}
 */
export function itemizedDeduction({ year, magi, filing, stateIncomeTax, propertyTax, mortgageInterest, other }) {
  const saltUncapped = (stateIncomeTax || 0) + (propertyTax || 0);
  const saltCap = saltCapForYear(year, magi, filing);
  const salt = Math.min(saltUncapped, saltCap);
  const oth = other || 0;
  const mort = mortgageInterest || 0;
  return {
    salt, saltUncapped, saltCap,
    mortgageInterest: mort,
    other: oth,
    total: salt + mort + oth,
  };
}

/**
 * Federal tax benefit of a given itemized package vs the alternative
 * (the better of standard deduction or a baseline itemized package).
 * Computes full-bracket federal tax both ways and returns the difference.
 *
 * @param {object} inputs
 * @param {number} inputs.magi
 * @param {string} inputs.filing
 * @param {number} inputs.withItemized - itemized deduction WITH the change (e.g. with the home)
 * @param {number} [inputs.baselineItemized] - itemized deduction WITHOUT the change
 * @returns {{ benefit: number, taxBaseline: number, taxWith: number, baselineDeduction: number, withDeduction: number, itemizes: boolean }}
 */
export function deductionBenefit({ magi, filing, withItemized, baselineItemized }) {
  const std = STD_DED_2025[filing] || STD_DED_2025.single;
  const baseItem = baselineItemized || 0;
  const baselineDeduction = Math.max(std, baseItem);
  const withDeduction = Math.max(std, withItemized || 0);
  const taxBaseline = federalTax(Math.max(0, magi - baselineDeduction), filing);
  const taxWith = federalTax(Math.max(0, magi - withDeduction), filing);
  return {
    benefit: Math.max(0, taxBaseline - taxWith),
    taxBaseline,
    taxWith,
    baselineDeduction,
    withDeduction,
    itemizes: (withItemized || 0) > std,
  };
}
