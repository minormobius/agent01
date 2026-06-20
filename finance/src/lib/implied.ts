// Asset-implied probability of the linked event, estimated from a price path.
//
// The event is "cumulative simple return over `horizon` steps exceeds `strike`".
// Model log-returns over a trailing window as i.i.d. Normal(drift, vol^2); then
// cumulative log-return over the horizon ~ Normal(horizon*drift, horizon*vol^2),
// and the event is log-cum-return > log(1+strike).
//
// Used by BOTH the synthetic generator (endogenous PM = noisy mirror of this)
// and the DivergenceRule model (its asset-implied leg), so the two never drift.

import { normalCdf } from "../contracts/dist";
import { mean, std } from "./stats";

export function logReturns(prices: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i - 1] > 0 && prices[i] > 0) out.push(Math.log(prices[i] / prices[i - 1]));
  }
  return out;
}

export interface ImpliedResult {
  prob: number;
  drift: number;
  vol: number;
}

/**
 * @param prices  full known price series up to and including the decision step
 * @param window  trailing window of returns to estimate drift/vol from
 */
export function assetImpliedProb(
  prices: number[],
  window: number,
  horizon: number,
  strike: number,
): ImpliedResult {
  const lr = logReturns(prices);
  const tail = lr.slice(Math.max(0, lr.length - window));
  const drift = mean(tail);
  const vol = std(tail, 1);
  const logStrike = Math.log(1 + strike);
  const m = horizon * drift;
  const s = Math.sqrt(horizon) * vol;
  const prob = s <= 0 ? (m > logStrike ? 1 : 0) : 1 - normalCdf(logStrike, m, s);
  return { prob, drift, vol };
}
