# CONTRACTS — the fixed boundary

This playground has exactly **two** fixed, versioned artifacts. Everything else —
data sources, models, metrics, regimes, charts — is pluggable around them. The
whole point of the project is that this boundary stays clean while the insides
are swapped freely.

- **Source of truth:** [`src/contracts/schema.ts`](src/contracts/schema.ts).
  The zod schemas are canonical; the TypeScript types are **inferred** from them
  (`z.infer`), so the runtime validator and the compile-time types can never
  drift.
- **Current version:** `BUNDLE_SCHEMA_VERSION = "1.0.0"`.

> Changing a contract is a deliberate, versioned event. Bump
> `BUNDLE_SCHEMA_VERSION`, document the migration here, and update any persisted
> run records. Do **not** edit a contract casually.

> **A note on the stack.** The brief suggested a Python/pydantic backend. The
> live surface (`fin.mino.mobi`) is a Cloudflare worker that can't host a Python
> server, and the only window onto this work is a functional website — so the
> deployable core is TypeScript end-to-end, with zod standing in for pydantic as
> the canonical schema. The contract spirit (one versioned boundary, validated at
> the edge) is unchanged.

## 1. `InputBundle` — what goes in

A point-in-time, time-aligned panel of typed **Streams** observed up to a
`decision_time`.

```
InputBundle {
  bundle_schema_version: "1.0.0"
  decision_time: ISOTime
  streams: Stream[]
}

Stream {
  id: string
  kind: ASSET_PRICE | PREDICTION_MARKET | OPTIONS_IMPLIED | POLL | SURVEY
       | REGIME_COVARIATE | TEXT_SENTIMENT | OTHER
  observations: Observation[]
  meta: StreamMeta
}

Observation {
  event_time: ISOTime       // when the thing happened / the value refers to
  knowledge_time: ISOTime    // when it became knowable
  value: number
  values?: Record<string, number>   // optional multi-field obs
}

StreamMeta {                  // sparse; populate per kind
  linked_asset_id: string | null
  exogeneity: EXOGENOUS | ENDOGENOUS | UNKNOWN   // FLIPPABLE in the UI
  platform, resolution_source, resolution_time
  liquidity, depth, trader_concentration         // market microstructure
  linkage_note
  event_id, strike            // ties a PM stream to the asset event it bets on
}
```

**Times** are ISO-8601 UTC strings (`...Z`). Use `asMs()` to compare.

### The look-ahead guarantee (sacred)

No model may ever observe a value whose `knowledge_time` is after the bundle's
`decision_time`. Enforced in
[`src/harness/lookahead.ts`](src/harness/lookahead.ts):

- `visibleBundle(full, decisionTime)` slices every stream to
  `knowledge_time <= decisionTime`.
- `assertNoLookahead(bundle)` re-checks it; the walk-forward harness calls it at
  **every** step.
- Pinned by [`tests/leakage.test.ts`](tests/leakage.test.ts). The synthetic
  covariate is published with a knowledge **lag**, so the guarantee is non-trivial
  and actually exercised.

## 2. `OutputBundle` — what comes out

What a model emits at a single `decision_time`.

```
OutputBundle {
  bundle_schema_version: "1.0.0"
  decision_time: ISOTime
  regime_posterior: Record<string, number>     // named regimes -> prob, sums to 1 (or empty)
  forward_distribution: ReturnDist              // over cumulative LOG return across horizon_steps
  divergence_signals: Divergence[]              // pm_implied_prob, asset_implied_prob, spread per event
  position: number                              // signed size; 0.0 is a valid, first-class abstain
  abstain: boolean                              // explicit no-signal flag
  feedback_estimate: { sign: POS|NEG|NONE, loop_gain: number | null }
  confidence: number | null
  notes: string | null
}

ReturnDist =
  | { kind: "normal",  horizon_steps, mean, std }
  | { kind: "sampled", horizon_steps, samples: number[] }
```

- `forward_distribution` is a **distribution, not a point** — sizing is
  Kelly-shaped and needs dispersion. Both encodings expose mean + dispersion +
  a CDF via [`src/contracts/dist.ts`](src/contracts/dist.ts). **Convention:** it
  describes the cumulative **log** return over `horizon_steps`; the linked event
  threshold is `log(1 + strike)`.
- **Abstention is cheap and first-class.** `position: 0` + `abstain: true` is the
  honest null and must not be penalized as if it were a wrong trade.

## Validators

`parseInputBundle(x)` / `parseOutputBundle(x)` throw on any violation.
`regimePosteriorIssue(p)` checks a non-empty posterior sums to ~1.

## What is NOT in the contract (deliberately pluggable)

Datasets ([`src/data/dataset.ts`](src/data/dataset.ts) `Dataset` interface),
models ([`src/models/types.ts`](src/models/types.ts) `Model` interface), metrics,
regimes, and charts. See the README for how to add each.
