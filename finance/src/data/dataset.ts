// The DATASET adapter boundary.
//
// A Dataset is everything the harness needs to run a walk-forward backtest:
//   - a full InputBundle (the harness slices it per decision_time via
//     visibleBundle(), so the dataset may contain observations not yet knowable),
//   - the realized "world" the models are NOT allowed to see: next-step returns,
//     event outcomes, and (for synthetic data) ground-truth regime labels.
//
// The synthetic generator produces a Dataset. Real-data adapters (M4) implement
// this SAME interface — with regimeLabels = [] (no ground truth) and outcomes
// drawn from realized prices. Nothing past this boundary knows whether the data
// is synthetic or real.

import type { InputBundle } from "../contracts/schema";

export interface Dataset {
  id: string;
  label: string;
  source: "synthetic" | "real";
  /** opaque, JSON-serializable description of how this dataset was produced */
  config: Record<string, unknown>;
  steps: number;

  /** ISO decision time for each step t in [0, steps). */
  decisionTimes: string[];

  /** Full streams; the harness slices to knowledge_time <= decision_time. */
  fullBundle: InputBundle;

  // ---- the world (hidden from models) ----
  /** ground-truth regime id per step; [] when unknown (real data). */
  regimeLabels: string[];
  /** distinct regime ids, in first-appearance order. */
  regimeNames: string[];

  /** simple return P[t+1]/P[t]-1; null at the last step. */
  nextReturn(step: number): number | null;
  /** did the event decided at step t resolve true (cum return over horizon > strike)? null if unresolved. */
  eventOutcome(step: number): boolean | null;

  /** the linked event the PM stream is a bet on. */
  strike: number;
  horizon: number;
  linkedAssetId: string;
  pmStreamId: string | null;
  eventId: string;

  /** optional hidden series for ground-truth overlays in the results view. */
  truth?: {
    price: number[];
    fundamental: number[];
    pmImplied: number[];
  };
}
