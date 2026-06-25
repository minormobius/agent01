// SYNTHETIC DATA FIRST.
//
// Couples an asset price path to a prediction-market stream through a KNOWN,
// configurable feedback structure, so we can ask "did the machine work?"
// independently of "is there real signal?". A model that can't recover planted
// structure here should not be trusted on real data.
//
// What is planted, and tunable:
//   - regime switches at known steps, each with its own drift + feedback;
//   - a feedback SIGN and LOOP GAIN per regime: positive feedback amplifies
//     recent returns (a bubble/divergence regime), negative feedback reverts;
//   - a PM stream that is either genuinely EXOGENOUS (carries real, noisy
//     information about the planted future) or ENDOGENOUS (a noisy, herding
//     mirror of the asset that knows nothing the asset doesn't);
//   - adjustable noise, liquidity, trader concentration, and a covariate stream
//     published with a knowledge LAG (so the look-ahead guarantee is non-trivial).

import { BUNDLE_SCHEMA_VERSION } from "../contracts/schema";
import type { InputBundle, Observation, Stream } from "../contracts/schema";
import { Rng } from "../lib/rng";
import { sigmoid, clamp } from "../lib/stats";
import { assetImpliedProb } from "../lib/implied";
import type { Dataset } from "./dataset";

export interface RegimeSpec {
  id: string;
  label: string;
  startStep: number;
  drift: number; // per-step log drift
  loopGain: number; // feedback strength on recent momentum
  feedbackSign: 1 | -1; // +1 amplifies (bubble), -1 reverts
}

export interface SyntheticConfig {
  seed: string;
  steps: number;
  startDate: string; // ISO
  stepMs: number; // step interval
  horizon: number; // PM event horizon, in steps
  strike: number; // cumulative-return threshold for the event
  regimes: RegimeSpec[];
  // asset
  assetVol: number; // per-step return noise
  momentumWindow: number; // steps of recent returns the feedback reacts to
  reversion: number; // baseline pull of price back to fundamental
  fundamentalVol: number; // slow random-walk vol of the fundamental
  // prediction market
  pmExogeneity: "EXOGENOUS" | "ENDOGENOUS";
  pmInfoStrength: number; // 0..1; how much an exogenous PM knows the future
  pmNoise: number; // observation noise on the PM implied prob
  herding: number; // endogenous overshoot on recent momentum
  liquidity: number;
  traderConcentration: number; // 0..1
  // covariate
  covariateNoise: number;
  covariateLagSteps: number; // knowledge lag (>=1 makes look-ahead meaningful)
  impliedWindow: number; // trailing window for asset-implied estimates
}

export const DEFAULT_SYNTHETIC: SyntheticConfig = {
  seed: "demo-1",
  steps: 360,
  startDate: "2024-01-01T00:00:00.000Z",
  stepMs: 86400000,
  horizon: 10,
  strike: 0.05,
  regimes: [
    { id: "calm", label: "Calm", startStep: 0, drift: 0.0003, loopGain: 0.1, feedbackSign: -1 },
    { id: "bubble", label: "Bubble", startStep: 120, drift: 0.0015, loopGain: 0.9, feedbackSign: 1 },
    { id: "crash", label: "Crash", startStep: 230, drift: -0.002, loopGain: 0.7, feedbackSign: 1 },
    { id: "calm2", label: "Calm (after)", startStep: 290, drift: 0.0003, loopGain: 0.1, feedbackSign: -1 },
  ],
  assetVol: 0.012,
  momentumWindow: 8,
  reversion: 0.02,
  fundamentalVol: 0.004,
  pmExogeneity: "EXOGENOUS",
  pmInfoStrength: 0.7,
  pmNoise: 0.05,
  herding: 0.6,
  liquidity: 50000,
  traderConcentration: 0.3,
  covariateNoise: 0.4,
  covariateLagSteps: 1,
  impliedWindow: 20,
};

function regimeAt(regimes: RegimeSpec[], step: number): RegimeSpec {
  let active = regimes[0];
  for (const r of regimes) if (r.startStep <= step) active = r;
  return active;
}

function isoAt(cfg: SyntheticConfig, step: number): string {
  return new Date(Date.parse(cfg.startDate) + step * cfg.stepMs).toISOString();
}

export function generateSynthetic(cfg: SyntheticConfig): Dataset {
  const rng = new Rng(cfg.seed + "|asset");
  const pmRng = new Rng(cfg.seed + "|pm");
  const covRng = new Rng(cfg.seed + "|cov");
  const N = cfg.steps;

  const price: number[] = new Array(N);
  const fundamental: number[] = new Array(N);
  const logRet: number[] = new Array(N).fill(0);
  const regimeLabels: string[] = new Array(N);

  price[0] = 100;
  fundamental[0] = 100;
  regimeLabels[0] = regimeAt(cfg.regimes, 0).id;

  for (let t = 1; t < N; t++) {
    const reg = regimeAt(cfg.regimes, t);
    regimeLabels[t] = reg.id;
    // slow fundamental random walk
    fundamental[t] = fundamental[t - 1] * Math.exp(rng.gauss(0, cfg.fundamentalVol));
    // recent momentum signal
    const w = Math.min(cfg.momentumWindow, t);
    let mom = 0;
    for (let k = 1; k <= w; k++) mom += logRet[t - k];
    mom /= w;
    // pull back toward fundamental
    const gap = Math.log(fundamental[t - 1] / price[t - 1]);
    const lr =
      reg.drift +
      reg.feedbackSign * reg.loopGain * mom +
      cfg.reversion * gap +
      rng.gauss(0, cfg.assetVol);
    logRet[t] = lr;
    price[t] = price[t - 1] * Math.exp(lr);
  }

  // realized event outcome decided at step t (resolves at t+horizon)
  const eventOutcomeArr: (boolean | null)[] = new Array(N);
  for (let t = 0; t < N; t++) {
    const r = t + cfg.horizon < N ? price[t + cfg.horizon] / price[t] - 1 : null;
    eventOutcomeArr[t] = r === null ? null : r > cfg.strike;
  }

  // prediction-market implied probability per step
  const pmImplied: number[] = new Array(N);
  for (let t = 0; t < N; t++) {
    if (cfg.pmExogeneity === "EXOGENOUS") {
      // knows the planted future with strength pmInfoStrength, blended to 0.5
      const futureRet = t + cfg.horizon < N ? price[t + cfg.horizon] / price[t] - 1 : 0;
      const edge = (futureRet - cfg.strike) / Math.max(1e-6, cfg.assetVol * Math.sqrt(cfg.horizon));
      const informed = sigmoid(edge);
      const blended = cfg.pmInfoStrength * informed + (1 - cfg.pmInfoStrength) * 0.5;
      pmImplied[t] = clamp(blended + pmRng.gauss(0, cfg.pmNoise), 0.001, 0.999);
    } else {
      // ENDOGENOUS: a noisy, herding mirror of the asset-implied prob — no info
      // about the future beyond what the asset already shows.
      const known = price.slice(0, t + 1);
      const { prob } = assetImpliedProb(known, cfg.impliedWindow, cfg.horizon, cfg.strike);
      const w = Math.min(cfg.momentumWindow, t);
      let mom = 0;
      for (let k = 1; k <= w; k++) mom += logRet[t - k];
      mom = w > 0 ? mom / w : 0;
      pmImplied[t] = clamp(prob + cfg.herding * mom * 5 + pmRng.gauss(0, cfg.pmNoise), 0.001, 0.999);
    }
  }

  // ---- build the streams ----
  const decisionTimes = Array.from({ length: N }, (_, t) => isoAt(cfg, t));

  const assetObs: Observation[] = price.map((p, t) => ({
    event_time: decisionTimes[t],
    knowledge_time: decisionTimes[t],
    value: p,
  }));
  const pmObs: Observation[] = pmImplied.map((p, t) => ({
    event_time: decisionTimes[t],
    knowledge_time: decisionTimes[t],
    value: p,
  }));
  // covariate: regime-correlated signal, published with a knowledge lag.
  const covObs: Observation[] = regimeLabels.map((_, t) => {
    const reg = regimeAt(cfg.regimes, t);
    const signal = reg.feedbackSign * reg.loopGain + covRng.gauss(0, cfg.covariateNoise);
    const lagged = Math.min(N - 1, t + cfg.covariateLagSteps);
    return {
      event_time: decisionTimes[t],
      knowledge_time: decisionTimes[lagged],
      value: signal,
    };
  });

  const eventId = "asset_cumret_gt_strike";
  const assetStream: Stream = {
    id: "asset",
    kind: "ASSET_PRICE",
    observations: assetObs,
    meta: blankMeta({ linked_asset_id: "asset" }),
  };
  const pmStream: Stream = {
    id: "pm",
    kind: "PREDICTION_MARKET",
    observations: pmObs,
    meta: blankMeta({
      linked_asset_id: "asset",
      exogeneity: cfg.pmExogeneity,
      platform: "synthetic",
      resolution_source: "synthetic-oracle",
      liquidity: cfg.liquidity,
      depth: cfg.liquidity / 100,
      trader_concentration: cfg.traderConcentration,
      event_id: eventId,
      strike: cfg.strike,
      linkage_note: `PM on: cumulative return over ${cfg.horizon} steps > ${cfg.strike}`,
    }),
  };
  const covStream: Stream = {
    id: "covariate",
    kind: "REGIME_COVARIATE",
    observations: covObs,
    meta: blankMeta({ linked_asset_id: "asset", linkage_note: `published with ${cfg.covariateLagSteps}-step lag` }),
  };

  const fullBundle: InputBundle = {
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    decision_time: decisionTimes[N - 1],
    streams: [assetStream, pmStream, covStream],
  };

  const regimeNames: string[] = [];
  for (const id of regimeLabels) if (!regimeNames.includes(id)) regimeNames.push(id);

  return {
    id: `synthetic:${cfg.seed}`,
    label: `Synthetic · ${cfg.pmExogeneity.toLowerCase()} PM · seed ${cfg.seed}`,
    source: "synthetic",
    config: cfg as unknown as Record<string, unknown>,
    steps: N,
    decisionTimes,
    fullBundle,
    regimeLabels,
    regimeNames,
    nextReturn: (t) => (t + 1 < N ? price[t + 1] / price[t] - 1 : null),
    eventOutcome: (t) => eventOutcomeArr[t],
    strike: cfg.strike,
    horizon: cfg.horizon,
    linkedAssetId: "asset",
    pmStreamId: "pm",
    eventId,
    truth: { price, fundamental, pmImplied },
  };
}

function blankMeta(over: Partial<Stream["meta"]>): Stream["meta"] {
  return {
    linked_asset_id: null,
    exogeneity: "UNKNOWN",
    platform: null,
    resolution_source: null,
    resolution_time: null,
    liquidity: null,
    depth: null,
    trader_concentration: null,
    linkage_note: null,
    event_id: null,
    strike: null,
    ...over,
  };
}
