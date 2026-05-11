/**
 * Retirement portfolio projection — year by year, tax-aware.
 *
 * Deterministic single-path projection in REAL dollars (today's purchasing power).
 * Returns are real returns; inflation isn't modeled per-bucket.
 *
 * Modeled:
 *   - Contributions during working years (per tax bucket)
 *   - Employer 401k match → traditional bucket
 *   - Social Security with claim-age adjustment (62-70), 85% of gross taxable as
 *     ordinary income (simplified — the actual provisional-income calc is
 *     roughly equivalent for retirees with meaningful other income)
 *   - Withdrawals during retirement to meet target spend, in tax-efficient order:
 *     cash → taxable (LTCG) → traditional (ord income) → HSA post-65 → Roth
 *   - Required Minimum Distributions from age 73 on traditional balance
 *   - Federal income tax via a single ordinary-income stack (RMD + traditional
 *     withdrawal + taxable SS all stack into one bracket pass per year)
 *   - LTCG on taxable withdrawals (simplified: 1-basisFrac treated as gain)
 *
 * Not modeled (v1):
 *   - ACA premium subsidies / Medicare IRMAA
 *   - State tax on withdrawals
 *   - NIIT / Additional Medicare on investment income
 *   - Inflation indexing of brackets
 *   - Sequence-of-returns risk (use monteCarloProject for that)
 *   - Roth conversion ladder (engine surfaces low-bracket windows; v2 simulates)
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

// Social Security claim-age multipliers (FRA = 67 for those born 1960+).
// Early-claim reductions: 5/9 of 1%/month for first 36 months (5%/yr) +
// 5/12 of 1%/month thereafter. Delayed-retirement credits: 8%/yr after FRA.
// We expose annual values; for partial years the engine clamps to nearest.
const SS_CLAIM_MULT = {
  62: 0.700, 63: 0.750, 64: 0.800, 65: 0.8667, 66: 0.9333,
  67: 1.000, 68: 1.080, 69: 1.160, 70: 1.240,
};

/**
 * Annual SS benefit (real $) given the user's FRA benefit estimate and claim age.
 * Pass benefitAtFRA in today's dollars (e.g. from the SSA statement). Returns 0
 * if either argument is missing or the age is invalid.
 */
export function ssBenefit(benefitAtFRA, claimAge) {
  if (!benefitAtFRA || !claimAge) return 0;
  const a = Math.max(62, Math.min(70, Math.round(claimAge)));
  const m = SS_CLAIM_MULT[a] ?? 1.0;
  return benefitAtFRA * m;
}

/**
 * Gross withdrawal needed to net `target` after marginal federal tax.
 * Iterates 5x — converges fast given monotone brackets.
 */
function grossForNet(target, baseOrd, std, filing) {
  if (target <= 0) return 0;
  let g = target / 0.78; // 22% effective guess
  for (let i = 0; i < 5; i++) {
    const marg = Math.max(
      0,
      federalTax(Math.max(0, baseOrd + g - std), filing) -
        federalTax(Math.max(0, baseOrd - std), filing)
    );
    g = target + marg;
  }
  return g;
}

/**
 * @param {object} inputs
 * @param {number} inputs.currentAge
 * @param {number} inputs.retireAge
 * @param {number} [inputs.endAge=95]
 * @param {object} inputs.balances    - { cash, taxable, traditional, roth, hsa }
 * @param {object} inputs.contributions - per-bucket annual contribution while working
 * @param {number} [inputs.employerMatch=0] - annual employer match (-> traditional)
 * @param {number} inputs.targetSpend - annual real $ spending target in retirement
 * @param {number} inputs.realReturn  - assumed real return (e.g. 0.05)
 * @param {string} inputs.filing
 * @param {number} [inputs.taxableBasisFrac=0.6] - share of taxable that's basis
 * @param {object} [inputs.socialSecurity] - { benefitAtFRA, claimAge, partnerBenefitAtFRA, partnerClaimAge }
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
    socialSecurity = {},
  } = inputs;

  let balances = { ...DEFAULT_BUCKETS, ...(balancesIn || {}) };
  const contrib = { ...contributions };
  const std = STD_DED_2025[filing] || STD_DED_2025.single;

  const rows = [];
  const startYear = new Date().getFullYear();
  let peakRealValue = 0;
  let peakAtAge = currentAge;
  let depletedAtAge = null;

  for (let age = currentAge; age <= endAge; age++) {
    const year = startYear + (age - currentAge);

    // 1) Returns
    for (const k of BUCKET_KEYS) balances[k] *= (1 + realReturn);

    let yearContrib = 0;
    let yearGrossWithdraw = 0;
    let yearTax = 0;
    let yearRMD = 0;
    let yearSS = 0;
    let withdrawByBucket = { cash: 0, taxable: 0, traditional: 0, roth: 0, hsa: 0 };

    if (age < retireAge) {
      // ── Working years: contributions ─────────────────────────────
      for (const k of BUCKET_KEYS) {
        const v = contrib[k] || 0;
        balances[k] += v;
        yearContrib += v;
      }
      if (employerMatch > 0) {
        balances.traditional += employerMatch;
        yearContrib += employerMatch;
      }
    } else {
      // ── Retirement ───────────────────────────────────────────────
      // Build the year's ordinary-income stack. We accumulate it as we
      // realize income (SS, RMD, traditional withdrawals); marginal tax
      // on each new layer is computed as the difference in federalTax
      // before vs after adding it.

      // Social Security income (real $). 85% counts as taxable ord income.
      // (Crude vs the full provisional-income calc, but matches the cap
      //  for most retirees with meaningful other income.)
      const grossSS = ssBenefit(socialSecurity.benefitAtFRA, socialSecurity.claimAge)
        * (age >= (socialSecurity.claimAge || 0) ? 1 : 0)
        + (filing === "mfj"
          ? ssBenefit(socialSecurity.partnerBenefitAtFRA, socialSecurity.partnerClaimAge)
            * (age >= (socialSecurity.partnerClaimAge || 0) ? 1 : 0)
          : 0);
      yearSS = grossSS;

      let ordStack = grossSS * 0.85;
      let needed = targetSpend - grossSS;
      // Tax on the SS-only ord stack
      const taxOnSS = federalTax(Math.max(0, ordStack - std), filing);
      yearTax += taxOnSS;
      needed += taxOnSS; // we'll cover the SS tax bill from withdrawals

      // RMD (age 73+) — mandatory, ord income, stacks on top of SS
      const div = uniformLifetimeDivisor(age);
      if (div && balances.traditional > 0) {
        const rmd = balances.traditional / div;
        balances.traditional -= rmd;
        withdrawByBucket.traditional += rmd;
        yearRMD = rmd;
        yearGrossWithdraw += rmd;
        const stackBefore = ordStack;
        ordStack += rmd;
        const marg = Math.max(
          0,
          federalTax(Math.max(0, ordStack - std), filing) -
            federalTax(Math.max(0, stackBefore - std), filing)
        );
        yearTax += marg;
        // RMD covers part of need (and brings its own tax)
        needed -= (rmd - marg);
      }

      // If SS + RMD over-shot the spend target, the excess net cash
      // reinvests into the taxable bucket — common case once trad gets big.
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

      // Taxable brokerage: LTCG on (1 - basisFrac) of the withdrawn amount
      if (needed > 0 && balances.taxable > 0) {
        let gross = needed;
        for (let i = 0; i < 3; i++) {
          const gain = gross * (1 - taxableBasisFrac);
          const tax = ltcgTax(gain, ordStack, filing);
          gross = needed + tax;
        }
        gross = Math.min(gross, balances.taxable);
        const gain = gross * (1 - taxableBasisFrac);
        const tax = ltcgTax(gain, ordStack, filing);
        balances.taxable -= gross;
        withdrawByBucket.taxable += gross;
        yearGrossWithdraw += gross;
        yearTax += tax;
        needed -= (gross - tax);
      }

      // Traditional withdrawals: stack onto ordStack
      if (needed > 0 && balances.traditional > 0) {
        const gross = Math.min(
          balances.traditional,
          grossForNet(needed, ordStack, std, filing)
        );
        const marg = Math.max(
          0,
          federalTax(Math.max(0, ordStack + gross - std), filing) -
            federalTax(Math.max(0, ordStack - std), filing)
        );
        balances.traditional -= gross;
        withdrawByBucket.traditional += gross;
        yearGrossWithdraw += gross;
        ordStack += gross;
        yearTax += marg;
        needed -= (gross - marg);
      }

      // HSA: post-65 non-medical withdrawals taxed like traditional
      if (needed > 0 && balances.hsa > 0 && age >= 65) {
        const gross = Math.min(
          balances.hsa,
          grossForNet(needed, ordStack, std, filing)
        );
        const marg = Math.max(
          0,
          federalTax(Math.max(0, ordStack + gross - std), filing) -
            federalTax(Math.max(0, ordStack - std), filing)
        );
        balances.hsa -= gross;
        withdrawByBucket.hsa += gross;
        yearGrossWithdraw += gross;
        ordStack += gross;
        yearTax += marg;
        needed -= (gross - marg);
      }

      // Roth last (tax-free, growth preserved)
      if (needed > 0 && balances.roth > 0) {
        const take = Math.min(balances.roth, needed);
        balances.roth -= take;
        withdrawByBucket.roth += take;
        yearGrossWithdraw += take;
        needed -= take;
      }
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
      yearSS,
      yearTax,
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
