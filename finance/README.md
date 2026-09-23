# fin.mino.mobi

The root is an **index** over everything on the surface. The headline entry is
[**The Financial Periodic Table**](https://fin.mino.mobi/elements/) at
`/elements`: a research project on all 118 elements, sized by the economy
each one stands under. For every element — how it is actually extracted, the
form it is really traded in (sulfur as sulfuric acid, nitrogen as ammonia,
titanium as white pigment), what a year of world extraction is worth, and the
first-order markets that cannot exist without it. The ratio between the last
two is the finding.

The dataset is [`ptable/elements.js`](ptable/elements.js); the attribution
rules, sources and limitations are in [`ptable/METHOD.md`](ptable/METHOD.md).
Upstream figures are mostly USGS Mineral Commodity Summaries 2026; downstream
figures are estimates under a stated rule, and every record carries a
confidence tier saying which is which.

Also on the surface:

- **[`/speclab`](https://fin.mino.mobi/speclab)** — the speculative-feedback
  playground: a research sandbox for how **prediction-market data streams**
  interact with **speculative-feedback dynamics** in a related asset market.
  Not a product, not a trading system: **paper / research only.** The one thing
  that stays stable is its **input/output contract** (see
  [`CONTRACTS.md`](CONTRACTS.md)); everything between *what goes in* and *what
  comes out* is swappable.
- **[`/pm`](https://fin.mino.mobi/pm)** — the personal-finance planning SPA.
- **[`/stocks`](https://fin.mino.mobi/stocks/)** — daily price archive and options reference.
- **[`/agimet`](https://fin.mino.mobi/agimet/)** — FRED labor-market dashboard.
- **[`/bogo`](https://fin.mino.mobi/bogo/)** — ice cream deals near you.

## Run it locally

```bash
cd finance
npm install
npm run dev        # http://localhost:5173  — index at /, table at /elements, speclab, pm
```

Other commands:

```bash
npm run build      # builds all four pages into dist/ (Vite multipage)
npm run typecheck  # tsc --noEmit
npm test           # vitest — leakage guarantee + contract schemas
npm run preview    # serve the production build
```

## What's here (milestone 1)

- **Contracts** (`src/contracts/`) — `InputBundle` / `OutputBundle` as versioned
  zod schemas; the sacred look-ahead guarantee in `src/harness/lookahead.ts`.
- **Synthetic data first** (`src/data/`) — coupled asset + PM streams from a
  **known, planted feedback structure**: regime switches at known steps, a tunable
  feedback sign + loop gain, and a PM stream that is either genuinely EXOGENOUS
  (knows the planted future) or ENDOGENOUS (a noisy, herding mirror). This is how
  we answer "did the machine work?" independently of "is there real signal?".
- **Models** (`src/models/`) — `BaselineAbstain` (the honest null) and
  `DivergenceRule` (trades the PM−asset implied-probability spread), in a
  `MODEL_REGISTRY`.
- **Harness** (`src/harness/`) — walk-forward with **purged + embargoed** splits;
  calibration (reliability + Brier, model **and** raw-PM baseline), abstention-aware
  P&L / Sharpe / drawdown, regime hit-rate.
- **UI** (`src/ui/`, `src/app/`) — Data explorer (with the **exogeneity toggle**),
  Model bench, Run, Results dashboard, and a session Experiment log + compare.

### On the roadmap (kept honest)

- **M2:** durable experiment store (Worker `/api` + D1), cross-device compare,
  **deflated Sharpe** + **PBO via CSCV** (the overfitting diagnostics, which only
  mean something across a config search — the Results view flags them as pending).
- **M3:** `HMMRegime` + `BrockHommesPM` (Rust/WASM where the numerics earn it),
  and the exogeneity toggle's empirical effect.
- **M4:** real-data adapter stubs (price feeds, Kalshi/Polymarket) behind the
  same `Dataset` interface.

## Architecture / deploy

Four pages build into one `dist/`, served by `worker.js` (Cloudflare Worker +
ASSETS binding):

```
/                      -> surface index  (dist/index.html)           [static]
/elements              -> periodic table (dist/elements/index.html)  [ptable/, plain ES modules]
/speclab, /speclab/*   -> playground     (dist/speclab/index.html)   [src/, TS/React]
/pm, /pm/*             -> finance SPA    (dist/pm/index.html)        [pm/src, JS/React]
/api/*                 -> speclab backend (experiment store + proxies)
```

`worker.js` does **subtree-aware SPA fallback** via its `SPA_ROOTS` list, so
`/pm/*` and `/speclab/*` deep links boot their own app rather than the root one.
Adding a fourth app means adding its prefix there. Deploys via
`.github/workflows/deploy-finance.yml` on push to this branch (worker name
`fin`, custom domain `fin.mino.mobi`).

---

## How to extend (each is a small, self-contained change)

### Add a **Model**
1. Create `src/models/myModel.ts` exporting a `Model` (an `info` with a
   `configSchema`, and a pure `predict(bundle, config, fitted?)`). Read only what
   the bundle exposes (`src/models/bundle-util.ts`) — no globals, no peeking. If
   it learns, return fitted state from `fit()`; never mutate.
2. Add one line to `MODEL_REGISTRY` in `src/models/registry.ts`.
   The model bench, run screen, and results pick it up automatically.

### Add a **Data Adapter**
1. Produce a `Dataset` (`src/data/dataset.ts`): a full `InputBundle` plus the
   hidden "world" (`nextReturn`, `eventOutcome`, and `regimeLabels` — `[]` for
   real data). The harness slices the bundle through `visibleBundle()` itself.
2. Register a preset in `src/data/datasets.ts` (or feed a config to your builder).
   Real sources go here too, behind this same interface.

### Add a **Metric**
1. Add the computation to `src/harness/metrics.ts` and a field to `Metrics`
   (`src/harness/types.ts`).
2. Surface it in `src/ui/screens/Results.tsx` (and the compare table).

### Add a **Regime**
Regimes are emitted by models as `regime_posterior` and (for synthetic data)
planted as ground truth in `src/data/synthetic.ts` (`RegimeSpec`). Add a
`RegimeSpec` to a dataset config; the regime timeline and hit-rate pick it up.

### Add a **Chart**
1. Create `src/ui/charts/MyChart.tsx` (Recharts or hand-rolled SVG) taking a
   `RunSeries` or `Dataset`.
2. Drop it into the relevant screen. Charts only read contract/harness objects.
