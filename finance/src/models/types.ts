// THE MODEL PLUG INTERFACE.
//
// A model maps an InputBundle -> OutputBundle. It may NOT reach outside the
// bundle for data: no globals, no hidden mutable state, no peeking. Any learned
// parameters flow EXPLICITLY through fit() -> predict(fitted), so a model is a
// pure function of (bundle, config, fitted). The harness owns the train/test
// split; the model never sees the test future.

import type { InputBundle, OutputBundle } from "../contracts/schema";

export interface ParamSpec {
  key: string;
  label: string;
  type: "number" | "boolean" | "select";
  default: number | boolean | string;
  min?: number;
  max?: number;
  step?: number;
  options?: { value: string; label: string }[];
  help?: string;
}

export type ModelConfig = Record<string, number | boolean | string>;

export interface ModelInfo {
  name: string; // registry key, stable
  title: string;
  blurb: string;
  configSchema: ParamSpec[];
}

export interface Model<S = unknown> {
  info: ModelInfo;
  /** Optional learning. Pure: returns fitted state; does not mutate the model. */
  fit?(train: InputBundle[], outcomes: (boolean | null)[], config: ModelConfig): S;
  /** Pure prediction from the bundle alone (+ explicit fitted state). */
  predict(bundle: InputBundle, config: ModelConfig, fitted?: S): OutputBundle;
}

export function defaultConfig(info: ModelInfo): ModelConfig {
  const c: ModelConfig = {};
  for (const p of info.configSchema) c[p.key] = p.default;
  return c;
}
