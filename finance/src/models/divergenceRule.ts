// DivergenceRule — a pure cross-market signal.
//
// For the linked event ("cumulative return over horizon > strike") it compares:
//   pm_implied   = the prediction market's stated probability (raw PM stream),
//   asset_implied = its own estimate from the asset price path (trailing-window
//                   Normal model of log-returns).
// The spread (pm - asset) is the signal. If the PM is informative (EXOGENOUS),
// a positive spread says the asset is underpricing an up-move -> go long; a
// negative spread -> go short. When |spread| is below the entry threshold the
// model ABSTAINS (a first-class, cheap, common outcome). It claims nothing about
// regimes or feedback — that is for other models.

import { BUNDLE_SCHEMA_VERSION } from "../contracts/schema";
import type { OutputBundle, InputBundle, Divergence } from "../contracts/schema";
import { assetImpliedProb } from "../lib/implied";
import { clamp } from "../lib/stats";
import type { Model, ModelInfo } from "./types";
import { firstAssetStream, firstPmStream, valueSeries, latestValue } from "./bundle-util";

const info: ModelInfo = {
  name: "DivergenceRule",
  title: "Divergence Rule",
  blurb: "Trades the spread between PM-implied and asset-implied probability of the same event.",
  configSchema: [
    { key: "horizon", label: "Horizon (steps)", type: "number", default: 10, min: 1, max: 60, step: 1 },
    {
      key: "window",
      label: "Implied window",
      type: "number",
      default: 20,
      min: 5,
      max: 120,
      step: 1,
      help: "Trailing returns used to estimate asset-implied drift/vol.",
    },
    {
      key: "entry",
      label: "Entry threshold (|spread|)",
      type: "number",
      default: 0.08,
      min: 0,
      max: 0.5,
      step: 0.01,
      help: "Below this absolute PM−asset spread, abstain.",
    },
    {
      key: "gain",
      label: "Sizing gain",
      type: "number",
      default: 4,
      min: 0,
      max: 20,
      step: 0.5,
      help: "Maps spread -> signed position (then clipped to ±1).",
    },
  ],
};

export const DivergenceRule: Model = {
  info,
  predict(bundle: InputBundle, config): OutputBundle {
    const horizon = Number(config.horizon ?? 10);
    const window = Number(config.window ?? 20);
    const entry = Number(config.entry ?? 0.08);
    const gain = Number(config.gain ?? 4);

    const asset = firstAssetStream(bundle);
    const pm = firstPmStream(bundle);
    const flat = (notes: string): OutputBundle => ({
      bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      decision_time: bundle.decision_time,
      regime_posterior: {},
      forward_distribution: { kind: "normal", horizon_steps: horizon, mean: 0, std: 1e-6 },
      divergence_signals: [],
      position: 0,
      abstain: true,
      feedback_estimate: { sign: "NONE", loop_gain: null },
      confidence: null,
      notes,
    });

    if (!asset || !pm) return flat("missing asset or PM stream");
    const prices = valueSeries(asset);
    if (prices.length < window + 2) return flat("insufficient price history");

    const strike = pm.meta.strike ?? 0.05;
    const eventId = pm.meta.event_id ?? "linked_event";
    const pmImplied = latestValue(pm);
    if (pmImplied === null) return flat("no PM observation yet");

    const { prob: assetImplied, drift, vol } = assetImpliedProb(prices, window, horizon, strike);
    const spread = pmImplied - assetImplied;

    const divergence: Divergence = {
      event_id: eventId,
      linked_asset_id: pm.meta.linked_asset_id ?? asset.id,
      pm_implied_prob: clamp(pmImplied, 0, 1),
      asset_implied_prob: clamp(assetImplied, 0, 1),
      spread,
    };

    // Forward distribution: cumulative LOG return over the horizon, Normal.
    const forward = {
      kind: "normal" as const,
      horizon_steps: horizon,
      mean: horizon * drift,
      std: Math.max(1e-6, Math.sqrt(horizon) * vol),
    };

    if (Math.abs(spread) < entry) {
      return {
        bundle_schema_version: BUNDLE_SCHEMA_VERSION,
        decision_time: bundle.decision_time,
        regime_posterior: {},
        forward_distribution: forward,
        divergence_signals: [divergence],
        position: 0,
        abstain: true,
        feedback_estimate: { sign: "NONE", loop_gain: null },
        confidence: Math.abs(spread),
        notes: `spread ${spread.toFixed(3)} below entry ${entry}`,
      };
    }

    const position = clamp(gain * spread, -1, 1);
    return {
      bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      decision_time: bundle.decision_time,
      regime_posterior: {},
      forward_distribution: forward,
      divergence_signals: [divergence],
      position,
      abstain: false,
      feedback_estimate: { sign: "NONE", loop_gain: null },
      confidence: clamp(Math.abs(spread), 0, 1),
      notes: `spread ${spread.toFixed(3)} -> position ${position.toFixed(3)}`,
    };
  },
};
