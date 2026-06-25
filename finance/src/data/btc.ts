// Real BTC dataset adapter — same Dataset interface as the synthetic generator.
//
// The ASSET stream is REAL: daily BTC-USD OHLCV from Coinbase, proxied through
// the worker (/api/btc/candles). The PM stream has three provenances, labelled
// honestly in the UI:
//   - 'exo'  : a semi-synthetic exogenous overlay (knows the real future with a
//              tunable strength) — lets you exercise the full pipeline on REAL
//              prices today, and validates that the exogeneity estimator
//              recovers the construction.
//   - 'endo' : a semi-synthetic endogenous overlay (mirror of asset-implied).
//   - 'live' : the REAL, forward-accruing Kalshi BTC snapshots from D1. Sparse
//              until the hourly cron has run for a while; honest about it.
//
// regimeLabels is [] (no ground truth on real data) — the exogeneity verdict and
// calibration carry the weight instead.

import { BUNDLE_SCHEMA_VERSION } from "../contracts/schema";
import type { InputBundle, Observation, Stream } from "../contracts/schema";
import { Rng } from "../lib/rng";
import { sigmoid, clamp } from "../lib/stats";
import { assetImpliedProb, logReturns } from "../lib/implied";
import { fetchBtcCandles, fetchPmSnapshots } from "../lib/api";
import type { Dataset } from "./dataset";

export type PmMode = "exo" | "endo" | "live";

export interface BtcOptions {
  pmMode: PmMode;
  horizon: number; // days
  strike: number; // cumulative-return threshold
  pmInfoStrength: number;
  pmNoise: number;
  herding: number;
  impliedWindow: number;
}

export const DEFAULT_BTC: BtcOptions = {
  pmMode: "exo",
  horizon: 10,
  strike: 0.05,
  pmInfoStrength: 0.6,
  pmNoise: 0.05,
  herding: 0.6,
  impliedWindow: 20,
};

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

export async function fetchBtcDataset(opts: BtcOptions): Promise<Dataset> {
  const candles = await fetchBtcCandles();
  if (candles.length < 60) throw new Error("not enough BTC history returned");
  const price = candles.map((c) => c.close);
  const N = price.length;
  const decisionTimes = candles.map((c) => new Date(c.t * 1000).toISOString());
  const lr = logReturns(price); // length N-1, lr[i] for step i+1

  // realized event outcome decided at step t (resolves at t+horizon)
  const eventOutcomeArr: (boolean | null)[] = new Array(N);
  for (let t = 0; t < N; t++) {
    const r = t + opts.horizon < N ? price[t + opts.horizon] / price[t] - 1 : null;
    eventOutcomeArr[t] = r === null ? null : r > opts.strike;
  }

  // PM-implied probability per step
  const rng = new Rng(`btc|${opts.pmMode}|${opts.pmInfoStrength}|${opts.pmNoise}`);
  const pmImplied: (number | null)[] = new Array(N).fill(null);
  let pmProvenance = "";

  if (opts.pmMode === "exo") {
    pmProvenance = "semi-synthetic exogenous overlay (knows real future)";
    for (let t = 0; t < N; t++) {
      const fut = t + opts.horizon < N ? price[t + opts.horizon] / price[t] - 1 : 0;
      const vol = stdOf(lr.slice(Math.max(0, t - opts.impliedWindow), t)) || 0.03;
      const edge = (fut - opts.strike) / Math.max(1e-6, vol * Math.sqrt(opts.horizon));
      const informed = sigmoid(edge);
      const blended = opts.pmInfoStrength * informed + (1 - opts.pmInfoStrength) * 0.5;
      pmImplied[t] = clamp(blended + rng.gauss(0, opts.pmNoise), 0.001, 0.999);
    }
  } else if (opts.pmMode === "endo") {
    pmProvenance = "semi-synthetic endogenous overlay (mirror of asset-implied)";
    for (let t = 0; t < N; t++) {
      const known = price.slice(0, t + 1);
      const { prob } = assetImpliedProb(known, opts.impliedWindow, opts.horizon, opts.strike);
      const w = Math.min(8, t);
      let mom = 0;
      for (let k = 1; k <= w; k++) mom += lr[t - k] ?? 0;
      mom = w > 0 ? mom / w : 0;
      pmImplied[t] = clamp(prob + opts.herding * mom * 5 + rng.gauss(0, opts.pmNoise), 0.001, 0.999);
    }
  } else {
    // LIVE: align accrued Kalshi snapshots to the daily grid by nearest day.
    pmProvenance = "real Kalshi BTC snapshots (forward-accruing; sparse until the cron fills in)";
    try {
      const snaps = await fetchPmSnapshots();
      // pick the single most-snapshotted market as the representative series
      const byMarket = new Map<string, { ts: number; p: number }[]>();
      for (const s of snaps) {
        if (s.implied_prob == null) continue;
        const arr = byMarket.get(s.market) ?? [];
        arr.push({ ts: Date.parse(s.ts), p: s.implied_prob });
        byMarket.set(s.market, arr);
      }
      let best: { ts: number; p: number }[] = [];
      for (const arr of byMarket.values()) if (arr.length > best.length) best = arr;
      best.sort((a, b) => a.ts - b.ts);
      for (let t = 0; t < N; t++) {
        const day = candles[t].t * 1000;
        let chosen: number | null = null;
        for (const pt of best) if (pt.ts <= day + 86400000) chosen = pt.p;
        pmImplied[t] = chosen;
      }
    } catch {
      /* leave null — PM stream will be empty */
    }
  }

  const assetObs: Observation[] = price.map((p, t) => ({
    event_time: decisionTimes[t],
    knowledge_time: decisionTimes[t],
    value: p,
  }));
  const pmObs: Observation[] = [];
  for (let t = 0; t < N; t++) {
    if (pmImplied[t] == null) continue;
    pmObs.push({ event_time: decisionTimes[t], knowledge_time: decisionTimes[t], value: pmImplied[t] as number });
  }

  const eventId = "btc_cumret_gt_strike";
  const assetStream: Stream = {
    id: "BTC-USD",
    kind: "ASSET_PRICE",
    observations: assetObs,
    meta: blankMeta({ linked_asset_id: "BTC-USD", platform: "coinbase" }),
  };
  const pmStream: Stream = {
    id: "pm",
    kind: "PREDICTION_MARKET",
    observations: pmObs,
    meta: blankMeta({
      linked_asset_id: "BTC-USD",
      exogeneity: opts.pmMode === "exo" ? "EXOGENOUS" : opts.pmMode === "endo" ? "ENDOGENOUS" : "UNKNOWN",
      platform: opts.pmMode === "live" ? "kalshi" : "synthetic-overlay",
      resolution_source: opts.pmMode === "live" ? "Kalshi (CF Benchmarks BRTI)" : "synthetic-oracle",
      event_id: eventId,
      strike: opts.strike,
      linkage_note: pmProvenance,
    }),
  };

  const fullBundle: InputBundle = {
    bundle_schema_version: BUNDLE_SCHEMA_VERSION,
    decision_time: decisionTimes[N - 1],
    streams: [assetStream, pmStream],
  };

  return {
    id: `btc:${opts.pmMode}`,
    label: `Real BTC-USD · PM ${opts.pmMode} · ${N} days`,
    source: "real",
    config: opts as unknown as Record<string, unknown>,
    steps: N,
    decisionTimes,
    fullBundle,
    regimeLabels: [],
    regimeNames: [],
    nextReturn: (t) => (t + 1 < N ? price[t + 1] / price[t] - 1 : null),
    eventOutcome: (t) => eventOutcomeArr[t],
    strike: opts.strike,
    horizon: opts.horizon,
    linkedAssetId: "BTC-USD",
    pmStreamId: "pm",
    eventId,
    truth: { price, fundamental: [], pmImplied: pmImplied.map((x) => x ?? 0.5) },
  };
}

function stdOf(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = xs.reduce((a, b) => a + b, 0) / xs.length;
  const v = xs.reduce((a, b) => a + (b - m) * (b - m), 0) / xs.length;
  return Math.sqrt(v);
}
