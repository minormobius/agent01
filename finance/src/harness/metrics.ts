// Evaluation metrics. Calibration is treated as the primary honesty metric:
// both inputs and outputs are probabilities, so it is directly measurable and
// hard to game. Economic metrics are abstention-aware.

import { mean, sharpe as sharpeRatio } from "../lib/stats";
import type { ReliabilityBin, Metrics } from "./types";

export function brier(probs: number[], outcomes: boolean[]): number | null {
  if (probs.length === 0) return null;
  let s = 0;
  for (let i = 0; i < probs.length; i++) {
    const o = outcomes[i] ? 1 : 0;
    s += (probs[i] - o) * (probs[i] - o);
  }
  return s / probs.length;
}

export function reliabilityCurve(
  probs: number[],
  outcomes: boolean[],
  bins = 10,
): ReliabilityBin[] {
  const acc = Array.from({ length: bins }, () => ({ p: 0, o: 0, n: 0 }));
  for (let i = 0; i < probs.length; i++) {
    const p = Math.min(0.999999, Math.max(0, probs[i]));
    const b = Math.min(bins - 1, Math.floor(p * bins));
    acc[b].p += p;
    acc[b].o += outcomes[i] ? 1 : 0;
    acc[b].n += 1;
  }
  return acc
    .filter((a) => a.n > 0)
    .map((a) => ({ pMean: a.p / a.n, oMean: a.o / a.n, count: a.n }));
}

export function maxDrawdown(equity: number[]): number {
  let peak = equity.length ? equity[0] : 0;
  let mdd = 0;
  for (const e of equity) {
    if (e > peak) peak = e;
    const dd = peak - e;
    if (dd > mdd) mdd = dd;
  }
  return mdd;
}

export interface MetricInputs {
  pnl: number[];
  abstain: boolean[];
  equity: number[];
  // paired probability/outcome arrays (only where an outcome resolved)
  modelProbs: number[];
  modelOutcomes: boolean[];
  pmProbs: number[];
  pmOutcomes: boolean[];
  // regime
  regimePred: (string | null)[];
  regimeTruth: string[];
}

export function computeMetrics(inp: MetricInputs): Metrics {
  const activePnl: number[] = [];
  let wins = 0;
  for (let i = 0; i < inp.pnl.length; i++) {
    if (!inp.abstain[i]) {
      activePnl.push(inp.pnl[i]);
      if (inp.pnl[i] > 0) wins++;
    }
  }
  const nActive = activePnl.length;
  const totalReturn = inp.equity.length ? inp.equity[inp.equity.length - 1] : 0;

  // regime hit-rate over steps where both a prediction and ground truth exist
  let rHit = 0;
  let rN = 0;
  for (let i = 0; i < inp.regimePred.length; i++) {
    const truth = inp.regimeTruth[i];
    const pred = inp.regimePred[i];
    if (pred != null && truth != null && truth !== "") {
      rN++;
      if (pred === truth) rHit++;
    }
  }

  return {
    brierModel: brier(inp.modelProbs, inp.modelOutcomes),
    brierPm: brier(inp.pmProbs, inp.pmOutcomes),
    reliabilityModel: reliabilityCurve(inp.modelProbs, inp.modelOutcomes),
    reliabilityPm: reliabilityCurve(inp.pmProbs, inp.pmOutcomes),
    nScored: inp.modelProbs.length,
    totalReturn,
    sharpe: sharpeRatio(inp.pnl),
    activeSharpe: sharpeRatio(activePnl),
    maxDrawdown: maxDrawdown(inp.equity),
    nActive,
    abstainRate: inp.abstain.length ? 1 - nActive / inp.abstain.length : 0,
    tradeWinRate: nActive > 0 ? wins / nActive : null,
    regimeHitRate: rN > 0 ? rHit / rN : null,
  };
}

export { mean };
