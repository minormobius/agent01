/**
 * Retirement portfolio projection — year by year, tax-aware.
 *
 * Deterministic single-path projection in REAL dollars (today's purchasing power).
 * Returns are real returns; inflation isn't modeled per-bucket.
 *
 * Modeled:
 *   - Contributions during working years (per tax bucket)
 *   - Employer 401k match → traditional bucket
 *   - Withdrawals during retirement to meet target spend, in tax-efficient order:
 *     cash → taxable (LTCG) → traditional (ord income) → Roth (free)
 *   - Required Minimum Distributions from age 73 on traditional balance
 *   - Federal income tax on withdrawals (using current brackets, flat across years)
 *   - LTCG on taxable withdrawals (simplified: 50% of gross treated as gain)
 *
 * Not modeled (v1):
 *   - Social Security income (huge separate topic)
 *   - ACA premium subsidies / Medicare IRMAA
 *   - State tax on withdrawals
 *   - NIIT / Additional Medicare on investment income
 *   - Inflation indexing of brackets
 *   - Sequence-of-returns risk (use Monte Carlo wrapper for that)
 *   - Roth conversion ladder (v2 — engine surfaces low-bracket windows)
 *
 * Monte Carlo wrapper: a v2 add. Until then, run this function once with
 * a baseline real return (~5%) and once with a pessimistic one (~3%) to
 * sanity-check the spread.
 */

import { federalTax, ltcgTax, uniformLifetimeDivisor, STD_DED_2025 } from "./tax.js";

const DEFAULT_BUCKETS = {
  cash: 0,       // checking/savings/MM
  taxable: 0,    // taxable brokerage
  traditional: 0,// 401k/403b/trad IRA
  roth: 0,       // Roth IRA/Roth 401k
  hsa: 0,        // HSA (taxed like trad post-65 if non-medical)
};

const BUCKET_KEYS = Object.keys(DEFAULT_BUCKETS);

/**
 * Project a portfolio year by year.
 *
 * @param {object} inputs
 * @param {number} inputs.currentAge
 * @param {number} inputs.retireAge
 * @param {number} [inputs.endAge=95]
 * @param {object} inputs.balances    - { cash, taxable, traditional, roth, hsa }
 * @param {object} inputs.contributions - per-bucket annual contribution while working
 * @param {number} [inputs.employerMatch=0] - annual employer match (-> traditional)
 * @param {number} inputs.targetSpend - annual real $ spending target in retirement
 * @param {number} inputs.realReturn  - assumed real return (e.g. 0.05)
 * @param {string} inputs.filing      - filing status for tax calc
 * @param {number} [inputs.taxableBasisFrac=0.6] - fraction of taxable account that's basis
 *   (only the non-basis portion is taxed as LTCG when sold). Conservative default.
 * @returns {{
 *   rows: Array<object>,
 *   depleted: boolean,
 *   depletedAtAge: number|null,
 *   peakRealValue: number,
 *   peakAtAge: number,
 * }}
 */
export function projectPortfolio(inputs) {
  const {
    currentAge,
    retireAge,
    endAge = 95,
    balances: balancesIn,
    contributions = {},
    employerMatch = 0,
    targetSpend = 0,
    realReturn = 0.05,
    filing = "single",
    taxableBasisFrac = 0.6,
  } = inputs;

  // Defensive copy + fill in any missing buckets
  let balances = { ...DEFAULT_BUCKETS, ...(balancesIn || {}) };
  const contrib = { ...contributions };

  const rows = [];
  const startYear = new Date().getFullYear();
  let peakRealValue = 0;
  let peakAtAge = currentAge;
  let depletedAtAge = null;

  for (let age = currentAge; age <= endAge; age++) {
    const year = startYear + (age - currentAge);

    // 1) Returns applied to start-of-year balance for each bucket
    for (const k of BUCKET_KEYS) balances[k] *= (1 + realReturn);

    let yearContrib = 0;
    let yearGrossWithdraw = 0;
    let yearTax = 0;
    let yearRMD = 0;
    let netNeedRemaining = 0;
    let withdrawByBucket = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };

    if (age < retireAge) {
      // ── Working years: add contributions ─────────────────────────
      for (const k of BUCKET_KEYS) {
        const v = contrib[k] || 0;
        balances[k] += v;
        yearContrib += v;
      }
      // Employer match goes into traditional
      if (employerMatch > 0) {
        balances.traditional += employerMatch;
        yearContrib += employerMatch;
      }
    } else {
      // ── Retirement: spend target needed (after-tax) ──────────────
      let needed = targetSpend;
      const std = STD_DED_2025[filing] || STD_DED_2025.single;

      // RMD first (age 73+) — mandatory, taxed as ordinary income.
      // Use prior-year-end traditional balance (i.e., post-return this year).
      const div = uniformLifetimeDivisor(age);
      if (div && balances.traditional > 0) {
        const rmd = balances.traditional / div;
        balances.traditional -= rmd;
        withdrawByBucket.traditional += rmd;
        yearRMD = rmd;
        yearGrossWithdraw += rmd;
        const tax = federalTax(Math.max(0, rmd - std), filing);
        yearTax += tax;
        needed -= (rmd - tax); // may go negative; excess handled below
      }

      // If RMD over-shot the spend target, the excess net cash reinvests
      // into the taxable bucket — common case once trad balance is large.
      if (needed < 0) {
        balances.taxable += -needed;
        needed = 0;
      }

      // Cash first (no tax)
      if (needed > 0 && balances.cash > 0) {
        const take = Math.min(balances.cash, needed);
        balances.cash -= take;
        withdrawByBucket.cash += take;
        yearGrossWithdraw += take;
        needed -= take;
      }

      // Taxable brokerage: LTCG on (1 - basisFrac) of the withdrawn amount.
      // Solve for gross so that gross - ltcg(gain) = needed.
      if (needed > 0 && balances.taxable > 0) {
        let gross = needed; // initial guess
        for (let i = 0; i < 3; i++) {
          const gain = gross * (1 - taxableBasisFrac);
          // For LTCG stacking, treat existing income as ~0 (RMD net is small);
          // accurate enough for the deterministic projection.
          const tax = ltcgTax(gain, 0, filing);
          gross = needed + tax;
        }
        gross = Math.min(gross, balances.taxable);
        const gain = gross * (1 - taxableBasisFrac);
        const tax = ltcgTax(gain, 0, filing);
        balances.taxable -= gross;
        withdrawByBucket.taxable += gross;
        yearGrossWithdraw += gross;
        yearTax += tax;
        needed -= Math.max(0, gross - tax);
      }

      // Traditional: ordinary income tax. Solve for gross so that
      // gross - federalTax(gross-std, filing) = needed.
      if (needed > 0 && balances.traditional > 0) {
        let gross = needed / 0.78; // initial 22% effective guess
        for (let i = 0; i < 4; i++) {
          const tax = federalTax(Math.max(0, gross + yearRMD - std), filing) -
                       federalTax(Math.max(0, yearRMD - std), filing);
          gross = needed + Math.max(0, tax);
        }
        gross = Math.min(gross, balances.traditional);
        const tax = Math.max(
          0,
          federalTax(Math.max(0, gross + yearRMD - std), filing) -
            federalTax(Math.max(0, yearRMD - std), filing)
        );
        balances.traditional -= gross;
        withdrawByBucket.traditional += gross;
        yearGrossWithdraw += gross;
        yearTax += tax;
        needed -= Math.max(0, gross - tax);
      }

      // HSA: post-65 non-medical withdrawals taxed like traditional.
      // Treat exactly like traditional bucket for projection purposes.
      if (needed > 0 && balances.hsa > 0 && age >= 65) {
        let gross = needed / 0.78;
        for (let i = 0; i < 3; i++) {
          const tax = federalTax(Math.max(0, gross - std), filing);
          gross = needed + tax;
        }
        gross = Math.min(gross, balances.hsa);
        const tax = federalTax(Math.max(0, gross - std), filing);
        balances.hsa -= gross;
        withdrawByBucket.hsa += gross;
        yearGrossWithdraw += gross;
        yearTax += tax;
        needed -= Math.max(0, gross - tax);
      }

      // Roth last (free, tax-deferred growth preserved)
      if (needed > 0 && balances.roth > 0) {
        const take = Math.min(balances.roth, needed);
        balances.roth -= take;
        withdrawByBucket.roth += take;
        yearGrossWithdraw += take;
        needed -= take;
      }

      netNeedRemaining = needed;
    }

    const totalReal = BUCKET_KEYS.reduce((s, k) => s + balances[k], 0);
    if (totalReal > peakRealValue) {
      peakRealValue = totalReal;
      peakAtAge = age;
    }

    rows.push({
      age, year,
      balances: { ...balances },
      totalReal,
      yearContrib,
      yearGrossWithdraw,
      withdrawByBucket: { ...withdrawByBucket },
      yearRMD,
      yearTax,
      netNeedRemaining,
      retired: age >= retireAge,
    });

    if (totalReal <= 0 && depletedAtAge === null && age >= retireAge) {
      depletedAtAge = age;
    }
  }

  return {
    rows,
    depleted: depletedAtAge !== null,
    depletedAtAge,
    peakRealValue,
    peakAtAge,
  };
}
