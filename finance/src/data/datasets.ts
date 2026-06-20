// Dataset registry — named presets plus a builder over the synthetic config.
// Each preset exercises a different planted structure so the playground has
// something interesting from the first run. Real-data adapters (M4) register
// here too, behind the same Dataset interface.

import { DEFAULT_SYNTHETIC, generateSynthetic } from "./synthetic";
import type { SyntheticConfig } from "./synthetic";
import type { Dataset } from "./dataset";

export interface DatasetPreset {
  key: string;
  label: string;
  blurb: string;
  config: SyntheticConfig;
}

export const DATASET_PRESETS: DatasetPreset[] = [
  {
    key: "exogenous-bubble",
    label: "Exogenous PM · planted bubble",
    blurb:
      "The PM genuinely knows the planted future (info strength 0.7). A bubble regime is planted at step 120, a crash at 230. A cross-market model should find exploitable divergence.",
    config: { ...DEFAULT_SYNTHETIC, seed: "exo-bubble", pmExogeneity: "EXOGENOUS", pmInfoStrength: 0.7 },
  },
  {
    key: "endogenous-mirror",
    label: "Endogenous PM · noisy mirror",
    blurb:
      "Same price dynamics, but the PM is a herding mirror of the asset — no independent information. The honest result here is: little to no exploitable edge. The null you must respect.",
    config: { ...DEFAULT_SYNTHETIC, seed: "endo-mirror", pmExogeneity: "ENDOGENOUS", herding: 0.8 },
  },
  {
    key: "weak-exogenous",
    label: "Weak exogenous PM",
    blurb:
      "An exogenous PM that only weakly knows the future (info strength 0.3) under heavier noise — closer to a realistic, marginal signal.",
    config: {
      ...DEFAULT_SYNTHETIC,
      seed: "weak-exo",
      pmExogeneity: "EXOGENOUS",
      pmInfoStrength: 0.3,
      pmNoise: 0.08,
    },
  },
];

export function presetDataset(key: string): Dataset {
  const p = DATASET_PRESETS.find((x) => x.key === key) ?? DATASET_PRESETS[0];
  return generateSynthetic(p.config);
}

export function buildDataset(config: SyntheticConfig): Dataset {
  return generateSynthetic(config);
}
