// Run records — the unit the experiment store persists and the compare screen
// diffs. Self-contained and JSON-serializable.

import type { ModelConfig } from "../models/types";

export interface ReliabilityBin {
  pMean: number; // mean predicted prob in the bin
  oMean: number; // observed frequency
  count: number;
}

export interface Metrics {
  // calibration (the primary honesty metric) — model forward prob vs the SAME
  // event's realized outcome, and the raw PM stream as a baseline to beat.
  brierModel: number | null;
  brierPm: number | null;
  reliabilityModel: ReliabilityBin[];
  reliabilityPm: ReliabilityBin[];
  nScored: number;

  // economic (forward-looking; never optimized in-sample)
  totalReturn: number;
  sharpe: number; // over all steps (abstain contributes 0)
  activeSharpe: number; // over non-abstaining steps only
  maxDrawdown: number;
  nActive: number;
  abstainRate: number;
  tradeWinRate: number | null; // fraction of active steps with positive P&L

  // regime (vs ground truth when present)
  regimeHitRate: number | null;

  // measured exogeneity of the PM vs asset-implied (lead-lag); null if too few points
  exogeneityScore: number | null;
  exogeneityLag: number | null;
  exogeneityVerdict: string | null;
}

export interface RunSeries {
  decisionTimes: string[];
  equity: number[];
  pnl: number[];
  position: number[];
  abstain: boolean[];
  modelProb: (number | null)[];
  pmProb: (number | null)[];
  assetImplied: (number | null)[];
  spread: (number | null)[];
  outcome: (boolean | null)[];
  regimePred: (string | null)[];
  regimeTruth: string[];
  price: number[];
  fundamental: number[];
}

export interface RunRecord {
  id: string;
  createdAt: string;
  modelName: string;
  modelConfig: ModelConfig;
  datasetId: string;
  datasetLabel: string;
  datasetConfig: Record<string, unknown>;
  contractVersion: string;
  steps: number;
  regimeNames: string[];
  metrics: Metrics;
  series: RunSeries;
}
