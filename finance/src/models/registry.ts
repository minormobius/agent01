// MODEL_REGISTRY — the plug board. Adding a model is: write a Model, import it,
// add one line here. Nothing else in the playground needs to change.

import type { Model } from "./types";
import { BaselineAbstain } from "./baselineAbstain";
import { DivergenceRule } from "./divergenceRule";

export const MODEL_REGISTRY: Model[] = [BaselineAbstain, DivergenceRule];

export function getModel(name: string): Model | undefined {
  return MODEL_REGISTRY.find((m) => m.info.name === name);
}
