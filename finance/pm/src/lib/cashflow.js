/**
 * Annual cash flow engine — gross income → taxes → take-home → savings → surplus.
 *
 * Honest enough for planning. Not a substitute for actual paystubs.
 *
 * Modeled:
 *   - W-2 wages (salary + bonus) → pre-tax deferrals reduce taxable wages
 *   - RSU vest value → ordinary income; treated as if cash for tax purposes
 *     (your employer already withheld and sold-to-cover or you held the shares)
 *   - Other income → flat addition to AGI (1099, K-1 pass-through, interest)
 *   - FICA on gross wages including RSU vests
 *   - Federal: standard deduction → bracketed tax
 *   - State: flat effective rate × AGI (override available), no state-level
 *     deduction math — most users should just override with their actual figure
 *   - Post-tax savings (Roth, taxable brokerage) reduce surplus but not tax
 *
 * Not modeled (acknowledge in UI):
 *   - State-by-state quirks (PA flat, NJ exclude-401k, MA short-term cap gains, etc.)
 *   - AMT, NIIT, QBI
 *   - Itemizing (assume std deduction — /mort has the itemized model if needed)
 *   - Employer 401k match (added separately by /retire when projecting)
 */

import { federalTax, ficaTax, STD_DED_2025 } from "./tax.js";
import { stateInfo } from "./states.js";

/**
 * @param {object} inputs
 * @param {number} inputs.salary        - W-2 salary
 * @param {number} inputs.bonus         - W-2 bonus (cash)
 * @param {number} inputs.rsuValue      - Annualized $ value of RSU vests this year
 * @param {number} inputs.otherIncome   - 1099, K-1, interest/div, etc. — flat to AGI
 * @param {number} inputs.pretaxK401    - Traditional 401k / 403b contribution
 * @param {number} inputs.pretaxHSA     - HSA contribution (employee + employer)
 * @param {number} inputs.pretaxHealth  - Pre-tax health premium (employee share)
 * @param {number} inputs.pretaxOther   - Other pre-tax (FSA, transit, dependent care)
 * @param {number} inputs.postTaxRoth   - Roth 401k + Roth IRA contributions
 * @param {number} inputs.postTaxBrokerage - Annual taxable brokerage contributions
 * @param {number} inputs.postTaxOther  - 529, taxable HSA share, other after-tax
 * @param {string} inputs.filing
 * @param {string|null} inputs.stateFips
 * @param {number|null} [inputs.stateTaxOverride] - Override state tax owed ($/yr)
 * @returns {object} Detailed breakdown — see return shape inline.
 */
export function annualCashflow(inputs) {
  const {
    salary = 0, bonus = 0, rsuValue = 0, otherIncome = 0,
    pretaxK401 = 0, pretaxHSA = 0, pretaxHealth = 0, pretaxOther = 0,
    postTaxRoth = 0, postTaxBrokerage = 0, postTaxOther = 0,
    filing = "single", stateFips = null, stateTaxOverride = null,
  } = inputs;

  // Wages: salary + bonus + RSU value all count as W-2 wages for FICA + fed income tax.
  // (Pre-tax 401k and HSA reduce federal taxable wages but NOT FICA wages — HSA via
  // cafeteria plan does avoid FICA but most people just deduct, and the difference
  // is small enough to gloss for planning.)
  const grossWages = salary + bonus + rsuValue;
  const pretaxFedOnly = pretaxK401 + pretaxHealth + pretaxOther; // reduces fed taxable wages
  const pretaxAll = pretaxFedOnly + pretaxHSA;                    // reduces fed taxable wages
  const taxableWages = Math.max(0, grossWages - pretaxAll);

  const agi = taxableWages + otherIncome;

  const std = STD_DED_2025[filing] || STD_DED_2025.single;
  const taxableIncome = Math.max(0, agi - std);

  const fed = federalTax(taxableIncome, filing);
  const fica = ficaTax(grossWages, filing);

  let state = 0;
  if (stateTaxOverride !== null && stateTaxOverride !== undefined) {
    state = stateTaxOverride;
  } else if (stateFips) {
    const s = stateInfo(stateFips);
    if (s) state = agi * s.stateIncTaxRate;
  }

  const totalTax = fed + fica.total + state;
  // Take-home: gross less pre-tax less all taxes. Doesn't account for post-tax
  // savings yet — that comes out of take-home.
  const takeHome = grossWages - pretaxAll - fed - fica.total - state;

  const postTaxSavings = postTaxRoth + postTaxBrokerage + postTaxOther;
  const totalSavings = pretaxK401 + pretaxHSA + postTaxSavings;
  const afterSavings = takeHome - postTaxSavings;

  // Effective rates — useful for plotting
  const effFedRate = agi > 0 ? fed / agi : 0;
  const effTotalRate = grossWages + otherIncome > 0
    ? totalTax / (grossWages + otherIncome)
    : 0;

  return {
    // Inputs echoed (for chart legend etc.)
    grossWages, otherIncome,
    pretaxK401, pretaxHSA, pretaxHealth, pretaxOther, pretaxTotal: pretaxAll,
    postTaxRoth, postTaxBrokerage, postTaxOther, postTaxSavings,
    totalSavings,
    // Tax pipeline
    taxableWages, agi, std, taxableIncome,
    fed, ficaSS: fica.ss, ficaMedicare: fica.medicare, ficaAddlMedicare: fica.addl,
    ficaTotal: fica.total, state, totalTax,
    effFedRate, effTotalRate,
    // Cash
    takeHome, afterSavings,
    // Useful monthly figures
    monthly: {
      gross: (grossWages + otherIncome) / 12,
      takeHome: takeHome / 12,
      afterSavings: afterSavings / 12,
      tax: totalTax / 12,
      savings: totalSavings / 12,
    },
  };
}
