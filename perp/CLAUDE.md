# perp — perp.mino.mobi

Learning surface for perpetual futures. Two linked time-series charts: BTC-USD
spot, and what the Hyperliquid BTC perpetual costs to hold.

## Facts

| | |
|---|---|
| Surface | `perp` |
| Dir | `perp/` |
| Endpoint | `perp.mino.mobi` |
| Type | frontend (static assets + a thin worker) |
| Owning branch | `claude/futures-finance-learning-r7p47e` |
| Deploy | `.github/workflows/deploy-perp.yml` |
| Data refresh | `.github/workflows/refresh-perp-data.yml` (daily, **commits and deploys**) |
| Uses | — (no D1, no DO, no KV, no secrets, no auth) |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "perp"`.

## What it is

A perpetual future has no expiry, so the arbitrage that drags a dated future
onto spot at delivery does not exist. The tether is **funding**: an hourly cash
transfer between longs and shorts. The surface exists to make that mechanism
visible on real data.

Chart 1 is BTC-USD spot from Coinbase. Chart 2 is the thing worth looking at —
the Hyperliquid perp's hourly **premium** and **funding rate**, drawn against
the clamp corridor:

```
funding = premium + clamp(baseline − premium, ±5bp)      baseline = 0.00125%/hr
```

Inside that corridor the two premium terms cancel and funding is *exactly* the
baseline, whatever the premium does. There is no restoring force in the band —
which is why the funding line is flat as a table until the premium escapes it,
and why the perp can sit away from spot indefinitely.

## How it works

No build step, no dependencies, no framework. `index.html` + `app.js` + static
JSON. Canvas for marks (28k hourly points is a slideshow as SVG nodes), DOM for
the crosshair so pointer movement never triggers a redraw.

| Path | What |
|---|---|
| `data/btc-{1d,6h,1h}.json` | Coinbase BTC-USD candles; 1d from 2015-07-20, 1h from HL genesis |
| `data/hl-btc-funding.json` | Hyperliquid hourly premium + funding, from 2023-05-12 |
| `data/stats.json` | every statistic the page's prose quotes, derived |
| `scripts/backfill.mjs` | paginating fetcher, incremental by default (`--full` to refetch) |
| `scripts/analyse.mjs` | derives `stats.json`; estimators from `packages/dataviz/stats.js` |
| `test/perp.selftest.mjs` | series integrity + the clamp identity |

### Things that will bite you

- **The prose quotes no hardcoded numbers.** Every figure in `index.html` is a
  `<span id="…">` filled from `data/stats.json`. If you want to state a new fact
  about the data, derive it in `analyse.mjs` first. This is deliberate: the
  series refresh daily and hand-typed numbers would rot silently.
- **Both upstreams paginate, differently.** Coinbase caps at **300
  aggregations** per request and returns newest-first; Hyperliquid caps at
  **500 hours** and returns oldest-first from `startTime`. That asymmetry is
  most of `backfill.mjs`.
- **Encoding is integer column arrays** — delta-encoded timestamps, prices in
  cents, rates in units of 1e-8. An object-per-row float form of the hourly
  series is roughly 6× the bytes. `decodeCandles`/`decodeFunding` in `app.js`
  are the exact inverse of the encoders; change one and you must change both.
- **The clamp identity is not exact, and that is expected.** Hyperliquid
  computes funding from a *time-weighted average* of premium samples through the
  hour, while the API publishes one premium figure per hour. Reconstructing
  funding from that figure works ~96% of the time deep inside the corridor and
  only ~72% at its edge, because near the boundary the hidden average crosses
  where the published figure did not. The selftest asserts that **gradient**
  rather than exactness — a flat or inverted gradient means the corridor story
  is wrong, and a jump in median error means Hyperliquid changed its parameters.
- **The live tail must stay bounded.** External fetches go through `timedFetch`
  with an `AbortSignal`. Without it a hung endpoint never rejects, the `await`
  never returns, and the page sits on "checking…" forever. The selftest greps
  for unbounded `fetch('https:` calls.
- **The refresh workflow deploys inline.** A push made with `GITHUB_TOKEN` does
  not fire other workflows, so `refresh-perp-data.yml` cannot rely on
  `deploy-perp.yml` picking up its commit. It runs `wrangler deploy` itself.

## Colour

Candles are **blue-up / red-down**, not the usual green/red: green-versus-red is
the least colourblind-legible pair in common use, and the palette's validated
diverging poles are blue↔red. Premium and funding take categorical slots 1 and 2
(blue/orange), which pass every CVD gate in both light and dark. Both series are
in basis points per hour — one unit, **one axis**; never add a second y-scale.

## Deploying

Pushes to `claude/futures-finance-learning-r7p47e` that touch `perp/**` trigger
[`.github/workflows/deploy-perp.yml`](../.github/workflows/deploy-perp.yml).
The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**. `perp.mino.mobi` was verified unclaimed on
2026-08-26 (HTTP 502, no worker bound), so the **first** deploy creates the DNS
record and the custom-domain binding, which can take a few minutes to
propagate. Confirm the deploy log prints `perp.mino.mobi (custom domain)` —
per the golden rule in [`docs/DEPLOYS.md`](../docs/DEPLOYS.md), a green run
alone proves nothing.
