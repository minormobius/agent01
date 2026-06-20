// WALK-FORWARD harness with purged + embargoed splits.
//
// For each test step t (after a warmup), the harness:
//   1. slices the full dataset to what was knowable at decisionTimes[t]
//      (visibleBundle) and re-asserts the look-ahead guarantee;
//   2. for models that learn, refits on a PURGED + EMBARGOED expanding window
//      whose label windows cannot overlap the test point (no leakage across the
//      horizon-length label window);
//   3. predicts, then records P&L (position applied to the realized next-step
//      return), calibration probabilities, and regime predictions.
//
// Models are scored forward-looking only; nothing here optimizes on in-sample
// P&L. CSCV/PBO + deflated Sharpe (which quantify overfitting across a config
// search) land in M2.

import { asMs } from "../contracts/schema";
import { probAbove } from "../contracts/dist";
import { visibleBundle, assertNoLookahead } from "./lookahead";
import { computeMetrics } from "./metrics";
import type { Dataset } from "../data/dataset";
import type { Model, ModelConfig } from "../models/types";
import type { RunRecord, RunSeries } from "./types";
import { latestValue, firstPmStream } from "../models/bundle-util";

export interface SplitConfig {
  warmup: number; // skip the first N steps (need price history)
  embargo: number; // steps embargoed before each test point
  refitEvery: number; // refit cadence for models with fit()
  scheme: "expanding" | "rolling";
  trainWindow: number; // rolling-window length (ignored when expanding)
}

export const DEFAULT_SPLIT: SplitConfig = {
  warmup: 30,
  embargo: 5,
  refitEvery: 20,
  scheme: "expanding",
  trainWindow: 120,
};

/**
 * Training step indices for a test at `testStep`. A training step s carries a
 * label window [s, s+horizon]; to avoid overlap with the test decision we keep
 * only s with s + horizon < testStep - embargo (the PURGE), then EMBARGO another
 * `embargo` steps. Rolling keeps only the most recent `trainWindow` of those.
 */
export function purgedTrainIndices(
  testStep: number,
  horizon: number,
  split: SplitConfig,
): number[] {
  const hi = testStep - split.embargo - horizon; // exclusive upper bound
  const loBase = split.warmup;
  const lo = split.scheme === "rolling" ? Math.max(loBase, hi - split.trainWindow) : loBase;
  const out: number[] = [];
  for (let s = lo; s < hi; s++) out.push(s);
  return out;
}

export interface RunArgs {
  dataset: Dataset;
  model: Model;
  config: ModelConfig;
  split?: SplitConfig;
  onProgress?: (frac: number) => void;
}

export function runBacktest(args: RunArgs): RunRecord {
  const { dataset, model, config } = args;
  const split = args.split ?? DEFAULT_SPLIT;
  const N = dataset.steps;
  const logStrike = Math.log(1 + dataset.strike);

  const decisionTimes: string[] = [];
  const position: number[] = [];
  const abstain: boolean[] = [];
  const pnl: number[] = [];
  const equity: number[] = [];
  const modelProb: (number | null)[] = [];
  const pmProb: (number | null)[] = [];
  const assetImplied: (number | null)[] = [];
  const spread: (number | null)[] = [];
  const outcome: (boolean | null)[] = [];
  const regimePred: (string | null)[] = [];
  const regimeTruth: string[] = [];

  let fitted: unknown = undefined;
  let cum = 0;

  for (let t = split.warmup; t < N; t++) {
    const dt = dataset.decisionTimes[t];
    const bundle = visibleBundle(dataset.fullBundle, dt);
    assertNoLookahead(bundle); // sacred — belt and suspenders

    // refit (purged + embargoed) for models that learn
    if (model.fit && (fitted === undefined || (t - split.warmup) % split.refitEvery === 0)) {
      const idx = purgedTrainIndices(t, dataset.horizon, split);
      const trainBundles = idx.map((s) => visibleBundle(dataset.fullBundle, dataset.decisionTimes[s]));
      const trainOutcomes = idx.map((s) => dataset.eventOutcome(s));
      fitted = model.fit(trainBundles, trainOutcomes, config);
    }

    const out = model.predict(bundle, config, fitted);

    // P&L: signed position applied to the realized next-step return.
    const r = dataset.nextReturn(t);
    const stepPnl = r === null ? 0 : out.position * r;
    cum += stepPnl;

    decisionTimes.push(dt);
    position.push(out.position);
    abstain.push(out.abstain);
    pnl.push(stepPnl);
    equity.push(cum);

    // calibration probabilities for the linked event
    const div = out.divergence_signals.find((d) => d.event_id === dataset.eventId);
    let mp: number | null = null;
    if (div) {
      mp = div.asset_implied_prob;
    } else if (out.forward_distribution.kind === "normal" && out.forward_distribution.std > 1e-4) {
      mp = probAbove(out.forward_distribution, logStrike);
    } else if (out.forward_distribution.kind === "sampled") {
      mp = probAbove(out.forward_distribution, logStrike);
    }
    modelProb.push(mp);
    assetImplied.push(div ? div.asset_implied_prob : null);
    spread.push(div ? div.spread : null);

    // raw PM baseline: the PM is always making an implicit forecast
    const pm = firstPmStream(bundle);
    const pmv = div ? div.pm_implied_prob : latestValue(pm);
    pmProb.push(pmv);

    outcome.push(dataset.eventOutcome(t));

    const keys = Object.keys(out.regime_posterior);
    if (keys.length > 0) {
      let best = keys[0];
      for (const k of keys) if (out.regime_posterior[k] > out.regime_posterior[best]) best = k;
      regimePred.push(best);
    } else {
      regimePred.push(null);
    }
    regimeTruth.push(dataset.regimeLabels[t] ?? "");

    if (args.onProgress && (t % 25 === 0 || t === N - 1)) {
      args.onProgress((t - split.warmup + 1) / (N - split.warmup));
    }
  }

  // paired arrays for calibration (only resolved outcomes)
  const mPairsP: number[] = [];
  const mPairsO: boolean[] = [];
  const pPairsP: number[] = [];
  const pPairsO: boolean[] = [];
  for (let i = 0; i < outcome.length; i++) {
    const o = outcome[i];
    if (o === null) continue;
    if (modelProb[i] != null) {
      mPairsP.push(modelProb[i] as number);
      mPairsO.push(o);
    }
    if (pmProb[i] != null) {
      pPairsP.push(pmProb[i] as number);
      pPairsO.push(o);
    }
  }

  const metrics = computeMetrics({
    pnl,
    abstain,
    equity,
    modelProbs: mPairsP,
    modelOutcomes: mPairsO,
    pmProbs: pPairsP,
    pmOutcomes: pPairsO,
    regimePred,
    regimeTruth,
  });

  const priceFull = dataset.truth?.price ?? assetValueSeries(dataset);
  const fundamentalFull = dataset.truth?.fundamental ?? [];
  const series: RunSeries = {
    decisionTimes,
    equity,
    pnl,
    position,
    abstain,
    modelProb,
    pmProb,
    assetImplied,
    spread,
    outcome,
    regimePred,
    regimeTruth,
    price: priceFull.slice(split.warmup),
    fundamental: fundamentalFull.slice(split.warmup),
  };

  return {
    id: `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
    createdAt: new Date().toISOString(),
    modelName: model.info.name,
    modelConfig: config,
    datasetId: dataset.id,
    datasetLabel: dataset.label,
    datasetConfig: dataset.config,
    contractVersion: dataset.fullBundle.bundle_schema_version,
    steps: N,
    regimeNames: dataset.regimeNames,
    metrics,
    series,
  };
}

function assetValueSeries(dataset: Dataset): number[] {
  const asset = dataset.fullBundle.streams.find((s) => s.kind === "ASSET_PRICE");
  if (!asset) return [];
  return [...asset.observations]
    .sort((a, b) => asMs(a.event_time) - asMs(b.event_time))
    .map((o) => o.value);
}
