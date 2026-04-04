/**
 * Strategy data models.
 *
 * Starting with DecisionMatrix — a weighted scoring grid where
 * org members independently score options against criteria,
 * with optional blind-reveal workflow.
 *
 * The Strategy app will grow to include OKRs, SWOT, risk registers, etc.
 */

import type { VaultBlobRef } from "../blobs";

// ── Strategy Tab System (grows over time) ──

export type StrategyTab = "decisions";

export const STRATEGY_TABS: { id: StrategyTab; label: string }[] = [
  { id: "decisions", label: "Decisions" },
];

// ── Decision Matrix ──

export type MatrixStatus = "draft" | "scoring" | "revealed" | "decided";

export interface Criterion {
  id: string;
  name: string;
  /** Weight 1-10 */
  weight: number;
  description?: string;
}

export interface Option {
  id: string;
  name: string;
  description?: string;
}

/** One member's score for one option on one criterion (1-5 scale) */
export interface Score {
  criterionId: string;
  optionId: string;
  value: number; // 1-5
  note?: string;
}

/** A complete set of scores from one member */
export interface ScoreCard {
  memberDid: string;
  memberHandle?: string;
  scores: Score[];
  submittedAt: string;
}

export interface DecisionMatrix {
  title: string;
  description?: string;
  status: MatrixStatus;
  criteria: Criterion[];
  options: Option[];
  /** Each member's independent scores */
  scoreCards: ScoreCard[];
  /** Final chosen option (set when status → decided) */
  chosenOptionId?: string;
  chosenRationale?: string;
  /** Attachments — supporting docs, spreadsheets, etc. */
  attachments?: VaultBlobRef[];
  createdAt: string;
  updatedAt?: string;
}

export interface DecisionRecord {
  rkey: string;
  matrix: DecisionMatrix;
  authorDid: string;
  orgRkey: string;
}

// ── Helpers ──

let _idCounter = 0;
export function newId(): string {
  return `${Date.now().toString(36)}-${(++_idCounter).toString(36)}`;
}

/** Compute weighted score for an option across all criteria */
export function computeWeightedScore(
  matrix: DecisionMatrix,
  optionId: string,
  scoreCard?: ScoreCard,
): number {
  if (!scoreCard) return 0;
  let totalWeight = 0;
  let weightedSum = 0;
  for (const c of matrix.criteria) {
    totalWeight += c.weight;
    const score = scoreCard.scores.find(
      (s) => s.criterionId === c.id && s.optionId === optionId,
    );
    if (score) weightedSum += score.value * c.weight;
  }
  return totalWeight > 0 ? weightedSum / totalWeight : 0;
}

/** Compute aggregate score across all scorecards */
export function computeAggregateScore(
  matrix: DecisionMatrix,
  optionId: string,
): number {
  if (matrix.scoreCards.length === 0) return 0;
  const total = matrix.scoreCards.reduce(
    (sum, sc) => sum + computeWeightedScore(matrix, optionId, sc),
    0,
  );
  return total / matrix.scoreCards.length;
}

/** Rank options by aggregate score, highest first */
export function rankOptions(
  matrix: DecisionMatrix,
): { option: Option; score: number }[] {
  return matrix.options
    .map((o) => ({ option: o, score: computeAggregateScore(matrix, o.id) }))
    .sort((a, b) => b.score - a.score);
}

/** Status display labels */
export const STATUS_LABELS: Record<MatrixStatus, string> = {
  draft: "Draft",
  scoring: "Scoring",
  revealed: "Revealed",
  decided: "Decided",
};

export const STATUS_COLORS: Record<MatrixStatus, string> = {
  draft: "var(--text-dim)",
  scoring: "var(--warning)",
  revealed: "var(--accent)",
  decided: "var(--success)",
};
