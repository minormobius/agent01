// BaselineAbstain — always abstains. The honest null: position 0, no divergence
// signal, flat forward distribution. Every other model has to beat doing nothing.

import { BUNDLE_SCHEMA_VERSION } from "../contracts/schema";
import type { OutputBundle, InputBundle } from "../contracts/schema";
import type { Model, ModelInfo } from "./types";

const info: ModelInfo = {
  name: "BaselineAbstain",
  title: "Baseline · Abstain",
  blurb: "Always stands aside. The honest null and the abstention baseline.",
  configSchema: [
    {
      key: "horizon",
      label: "Horizon (steps)",
      type: "number",
      default: 10,
      min: 1,
      max: 60,
      step: 1,
      help: "Declared horizon of the (flat) forward distribution.",
    },
  ],
};

export const BaselineAbstain: Model = {
  info,
  predict(bundle: InputBundle, config): OutputBundle {
    const horizon = Number(config.horizon ?? 10);
    return {
      bundle_schema_version: BUNDLE_SCHEMA_VERSION,
      decision_time: bundle.decision_time,
      regime_posterior: {},
      forward_distribution: { kind: "normal", horizon_steps: horizon, mean: 0, std: 1e-6 },
      divergence_signals: [],
      position: 0,
      abstain: true,
      feedback_estimate: { sign: "NONE", loop_gain: null },
      confidence: null,
      notes: "abstain",
    };
  },
};
