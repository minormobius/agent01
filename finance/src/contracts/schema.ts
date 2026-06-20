// ============================================================================
// THE CONTRACTS — the two fixed, versioned artifacts of this codebase.
//
// zod schemas are the single source of truth; the TypeScript types are INFERRED
// from them (z.infer) so the runtime validator and the compile-time types can
// never drift. Everything else in the playground (data adapters, models,
// evaluators, charts) is pluggable around these. See CONTRACTS.md.
//
// Changing a contract is a deliberate, versioned event — bump
// BUNDLE_SCHEMA_VERSION and document the migration. Do not edit casually.
// ============================================================================

import { z } from "zod";

export const BUNDLE_SCHEMA_VERSION = "1.0.0";

// Times are ISO-8601 UTC strings ("2026-01-02T03:04:05.000Z"). asMs() is the
// one sanctioned way to get a comparable number out of one. Keeping a string at
// the boundary makes bundles self-documenting and trivially JSON-persistable.
export const ISOTime = z.string().datetime({ offset: false });
export type ISOTime = z.infer<typeof ISOTime>;

export function asMs(t: ISOTime): number {
  return Date.parse(t);
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const StreamKind = z.enum([
  "ASSET_PRICE",
  "PREDICTION_MARKET",
  "OPTIONS_IMPLIED",
  "POLL",
  "SURVEY",
  "REGIME_COVARIATE",
  "TEXT_SENTIMENT",
  "OTHER",
]);
export type StreamKind = z.infer<typeof StreamKind>;

export const Exogeneity = z.enum(["EXOGENOUS", "ENDOGENOUS", "UNKNOWN"]);
export type Exogeneity = z.infer<typeof Exogeneity>;

export const FeedbackSign = z.enum(["POS", "NEG", "NONE"]);
export type FeedbackSign = z.infer<typeof FeedbackSign>;

// ---------------------------------------------------------------------------
// INPUT contract
// ---------------------------------------------------------------------------

// Every observation carries BOTH when the thing happened (event_time) and when
// it became knowable (knowledge_time). The harness guarantees no model ever
// sees an observation whose knowledge_time > decision_time. This is sacred.
export const Observation = z.object({
  event_time: ISOTime,
  knowledge_time: ISOTime,
  value: z.number(),
  // Optional extra named fields for multi-valued observations (e.g. OHLC, a
  // bid/ask pair, an order-book snapshot).
  values: z.record(z.string(), z.number()).optional(),
});
export type Observation = z.infer<typeof Observation>;

export const StreamMeta = z.object({
  // generic
  linked_asset_id: z.string().nullable().default(null),
  // prediction-market specific (sparse; populate per kind)
  exogeneity: Exogeneity.default("UNKNOWN"), // FLIPPABLE in the UI
  platform: z.string().nullable().default(null),
  resolution_source: z.string().nullable().default(null),
  resolution_time: ISOTime.nullable().default(null),
  liquidity: z.number().nullable().default(null),
  depth: z.number().nullable().default(null),
  trader_concentration: z.number().min(0).max(1).nullable().default(null),
  // linkage
  linkage_note: z.string().nullable().default(null),
  // The event this contract is a bet on — pairs a PM stream with the asset
  // event a model can compute an asset-implied probability for. Used by
  // divergence models to line PM-implied against asset-implied for the SAME
  // event. (e.g. "asset return over horizon > strike".)
  event_id: z.string().nullable().default(null),
  strike: z.number().nullable().default(null),
});
export type StreamMeta = z.infer<typeof StreamMeta>;

export const Stream = z.object({
  id: z.string(),
  kind: StreamKind,
  observations: z.array(Observation),
  meta: StreamMeta,
});
export type Stream = z.infer<typeof Stream>;

export const InputBundle = z.object({
  bundle_schema_version: z.literal(BUNDLE_SCHEMA_VERSION),
  decision_time: ISOTime,
  streams: z.array(Stream),
});
export type InputBundle = z.infer<typeof InputBundle>;

// ---------------------------------------------------------------------------
// OUTPUT contract
// ---------------------------------------------------------------------------

// forward_distribution is a distribution-not-point: sizing is Kelly-shaped and
// needs dispersion, so mean AND dispersion are both always recoverable. Two
// encodings, both over a declared integer horizon (in dataset steps).
export const ReturnDist = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("normal"),
    horizon_steps: z.number().int().positive(),
    mean: z.number(),
    std: z.number().nonnegative(),
  }),
  z.object({
    kind: z.literal("sampled"),
    horizon_steps: z.number().int().positive(),
    samples: z.array(z.number()).min(1),
  }),
]);
export type ReturnDist = z.infer<typeof ReturnDist>;

export const Divergence = z.object({
  event_id: z.string(),
  linked_asset_id: z.string().nullable().default(null),
  pm_implied_prob: z.number().min(0).max(1),
  asset_implied_prob: z.number().min(0).max(1),
  spread: z.number(), // pm_implied_prob - asset_implied_prob
});
export type Divergence = z.infer<typeof Divergence>;

export const FeedbackEstimate = z.object({
  sign: FeedbackSign,
  loop_gain: z.number().nullable().default(null),
});
export type FeedbackEstimate = z.infer<typeof FeedbackEstimate>;

export const OutputBundle = z.object({
  bundle_schema_version: z.literal(BUNDLE_SCHEMA_VERSION),
  decision_time: ISOTime,
  // named regimes -> prob; validated to sum to ~1 (or empty when a model emits none)
  regime_posterior: z.record(z.string(), z.number()),
  forward_distribution: ReturnDist,
  divergence_signals: z.array(Divergence),
  position: z.number(), // signed size; 0.0 is a valid, first-class abstain
  abstain: z.boolean(), // explicit no-signal flag
  feedback_estimate: FeedbackEstimate,
  confidence: z.number().min(0).max(1).nullable().default(null),
  notes: z.string().nullable().default(null),
});
export type OutputBundle = z.infer<typeof OutputBundle>;

// ---------------------------------------------------------------------------
// Validators — the public, enforced boundary
// ---------------------------------------------------------------------------

export function parseInputBundle(x: unknown): InputBundle {
  return InputBundle.parse(x);
}

export function parseOutputBundle(x: unknown): OutputBundle {
  return OutputBundle.parse(x);
}

/** Regime posteriors, if non-empty, must sum to ~1. Returns the issue or null. */
export function regimePosteriorIssue(p: Record<string, number>): string | null {
  const keys = Object.keys(p);
  if (keys.length === 0) return null;
  let sum = 0;
  for (const k of keys) {
    const v = p[k];
    if (v < -1e-9 || v > 1 + 1e-9) return `regime "${k}" prob ${v} out of [0,1]`;
    sum += v;
  }
  if (Math.abs(sum - 1) > 1e-6) return `regime posterior sums to ${sum}, not 1`;
  return null;
}
