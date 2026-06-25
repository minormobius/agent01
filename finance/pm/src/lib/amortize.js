/**
 * Mortgage amortization with optional PITI + PMI components.
 *
 * Pure function: takes inputs, returns a row-per-month schedule plus monthly
 * recurring component summary. UI/rendering is the caller's job.
 *
 * Usage:
 *   import { amortize } from '/lib/amortize.js';
 *   const result = amortize({ price: 450000, loan: 360000, annualRate: 0.065, months: 360 });
 *   // result.rows[i] = { m, payment, principal, interest, balance, equity, cumInterest, cumPrincipal, pmi }
 *   // result.pi (principal+interest), result.monthlyTax, result.monthlyIns, ...
 */

export const DEFAULT_PMI_RATE = 0.0055;  // 0.55%/yr of original loan
export const DEFAULT_PMI_LTV_END = 0.78; // remove at 78% LTV (HPA standard)

/**
 * @param {object} inputs
 * @param {number} inputs.price        - Home price (used for tax/LTV)
 * @param {number} inputs.loan         - Loan principal
 * @param {number} inputs.annualRate   - APR as decimal (e.g. 0.065)
 * @param {number} inputs.months       - Loan term in months (e.g. 360)
 * @param {number} [inputs.propTaxRate=0]   - Annual property tax rate as decimal (0.01 = 1%)
 * @param {number} [inputs.insAnnual=0]     - Homeowner's insurance $/yr
 * @param {number} [inputs.hoa=0]           - HOA $/mo
 * @param {number} [inputs.util=0]          - Utilities $/mo
 * @param {object} [inputs.pmi]             - PMI config
 * @param {boolean} [inputs.pmi.enabled=false]
 * @param {number}  [inputs.pmi.rate=DEFAULT_PMI_RATE]      - Annual rate of original loan
 * @param {number}  [inputs.pmi.ltvEnd=DEFAULT_PMI_LTV_END] - Remove when balance/price reaches this
 */
export function amortize(inputs) {
  const {
    price = 0, loan = 0, annualRate = 0, months = 0,
    propTaxRate = 0, insAnnual = 0, hoa = 0, util = 0,
    pmi = {},
  } = inputs;

  const r = annualRate / 12;
  const monthlyTax = (price * propTaxRate) / 12;
  const monthlyIns = insAnnual / 12;

  // P&I monthly
  let pi;
  if (r === 0) {
    pi = months ? loan / months : 0;
  } else {
    pi = loan * (r * Math.pow(1 + r, months)) / (Math.pow(1 + r, months) - 1);
  }
  if (!isFinite(pi)) pi = 0;

  const downPct = price > 0 ? (price - loan) / price : 0;
  const pmiEnabled = pmi.enabled && downPct < 0.20 && loan > 0;
  const pmiRate = pmi.rate ?? DEFAULT_PMI_RATE;
  const pmiLTVEnd = pmi.ltvEnd ?? DEFAULT_PMI_LTV_END;
  const baseMonthlyPMI = pmiEnabled ? (loan * pmiRate) / 12 : 0;

  const rows = [];
  let balance = loan;
  let cumInterest = 0;
  let cumPrincipal = 0;
  let pmiEndsAt = null;

  for (let m = 1; m <= months; m++) {
    const interestPart = balance * r;
    let principalPart = pi - interestPart;
    if (principalPart > balance) principalPart = balance;
    balance -= principalPart;
    if (balance < 0.005) balance = 0;
    cumInterest += interestPart;
    cumPrincipal += principalPart;

    let pmiThisMonth = 0;
    if (pmiEnabled && pmiEndsAt === null) {
      const ltv = price > 0 ? balance / price : 0;
      if (ltv > pmiLTVEnd) {
        pmiThisMonth = baseMonthlyPMI;
      } else {
        pmiEndsAt = m;
      }
    }

    rows.push({
      m,
      payment: pi + pmiThisMonth + monthlyTax + monthlyIns + hoa + util,
      principal: principalPart,
      interest: interestPart,
      balance,
      equity: price - balance,
      cumInterest,
      cumPrincipal,
      pmi: pmiThisMonth,
    });
  }

  return {
    pi, monthlyTax, monthlyIns, hoa, util,
    pmiEnabled, baseMonthlyPMI, pmiEndsAt,
    rows,
    cumInterest,
    totalPaid: pi * months,
  };
}

/**
 * Sum interest paid in each loan-year (12 months grouped).
 * @param {Array<{interest:number}>} rows - amortize().rows
 * @param {number} years
 * @returns {number[]} length=years
 */
export function yearlyInterest(rows, years) {
  const out = [];
  for (let y = 0; y < years; y++) {
    let sum = 0;
    for (let m = y * 12; m < (y + 1) * 12 && m < rows.length; m++) sum += rows[m].interest;
    out.push(sum);
  }
  return out;
}
