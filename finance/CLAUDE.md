# finance — fin.mino.mobi

<!-- HAND-OWNED. gen-surface-docs.mjs seeded this file once and will not
     overwrite it. Repo-wide rules live in ../CLAUDE.md; the index of all
     surfaces is ../docs/SURFACES.md. -->

Three apps behind one worker. The root is **the financial periodic table** — a
research dataset on how each of the 118 elements is extracted, what form it is
actually traded in, and the size of the economy that extraction stands under.

## Facts

| | |
|---|---|
| Surface | `finance` |
| Dir | `finance/` |
| Endpoint | `fin.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/financial-periodic-table-8mp7tj` |
| Deploy | `.github/workflows/deploy-finance.yml` |
| Uses | shared D1 `atpolls-db` (tables prefixed `spec_`) |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "finance"`.

## The three apps

| Route | App | Stack | Source |
|---|---|---|---|
| `/` | financial periodic table | plain ES modules, no framework | `ptable/`, `index.html` |
| `/speclab` | speculative-feedback research playground | TS + React | `src/`, `speclab/index.html` |
| `/pm` | personal-finance planning SPA | JS + React | `pm/` |

Plus `/stocks`, `/bogo`, `/agimet` — static pages copied verbatim from
`public/` — and `/api/*`, which belongs to speclab (experiment store in D1 and
the Coinbase/Kalshi proxies; hourly cron writes `spec_pm_snapshots`).

Vite builds all three into one `dist/`; `worker.js` serves it with
**subtree-aware SPA fallback**. `SPA_ROOTS` in `worker.js` is the whole of that
mechanism: a 404 under a listed prefix boots that app's own index, so
`/pm/networth` survives a refresh instead of landing on the periodic table.
**Mount a fourth app and you must add its prefix there**, or its deep links
will silently render the root app with a 200.

## The periodic table

The interesting part is the dataset, not the rendering.

| File | What it is |
|---|---|
| `ptable/elements.js` | **the research dataset** — 118 hand-written records. The only place the figures live. |
| `ptable/METHOD.md` | **read this before changing a number.** The attribution rules, the sources, the known limitations. |
| `ptable/layout.js` | grid geometry, the three log scales, formatters. Pure — imported by both the browser and the selftest. |
| `ptable/main.js` | DOM rendering. No framework and no dependency; that is deliberate. |
| `ptable/styles.css` | roles as CSS custom properties |
| `ptable/ptable.selftest.mjs` | dataset invariants — `preflight` runs it when `finance/` changes |

Three things to know before editing:

- **`prod` and `price` must be on the same basis**, named in `basis`. Fluorine
  is priced per tonne of CaF₂, potassium per tonne of K₂O, chromium per tonne of
  gross chromite. Upstream value is always `prod × price`, never stored, so a
  basis mismatch is a silently wrong number rather than a crash. The selftest
  catches an orphaned price; it cannot catch a mismatched basis, so check it
  yourself.
- **The ramp hexes live in `styles.css`, not in JS.** Dark mode *flips the
  anchor* — low values sit near the dark surface and high values are the bright
  end — which is the reverse of light mode. Doing that with CSS custom
  properties means an OS theme change needs no listener and no re-render. Every
  step is paired with the ink that clears 4.5:1 on it, so don't re-step one
  without re-checking contrast.
- **`--ramp-ink-N` and `--ink-N` are different things.** The first is the label
  colour for ramp step N; the second is the theme's text hierarchy. They
  collided once and made every muted string on the page invisible in dark mode.

## Deploy status

MANAGED — onboarded to Actions (`deploy-finance.yml`). Surface taken over for
the financial periodic table; speclab moved from `/` to `/speclab`, the PM SPA
stays at `/pm`.

## Deploying

Pushes to `claude/financial-periodic-table-8mp7tj` that touch `finance/**`
trigger [`.github/workflows/deploy-finance.yml`](../.github/workflows/deploy-finance.yml),
which runs `npm install && npm run build`, applies
`poll/apps/api/migrations/0031_speclab.sql` to `atpolls-db` (idempotent), then
`wrangler deploy`.

The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**. Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first,
especially the golden rule: the `wrangler.jsonc` `name` (`fin`) must be the
worker that owns `fin.mino.mobi`, and that domain must appear in `routes` as a
`custom_domain`. Otherwise the run goes green and the live site never changes.
**Verify by confirming the deploy log binds `fin.mino.mobi (custom domain)`.**

Local check before pushing:

```bash
cd finance
npm install && npm run build          # all three apps into dist/
node ptable/ptable.selftest.mjs       # dataset invariants
npm test                              # speclab contract + leakage tests
npx vite preview                      # look at the pages
npx wrangler dev --local              # ...but routing needs the real worker
rm -rf dist .wrangler                 # see below before running repo preflight
```

**`vite preview` does not run `worker.js`.** It serves `dist/` directly, so it
cannot see anything wrong with the fallback — which is how `/pm/networth`
shipped as a blank page. `wrangler dev --local` runs the worker under miniflare,
needs no Cloudflare credentials, and reproduces routing bugs in one `curl`.
**Run it before pushing any change to `worker.js` or `SPA_ROOTS`**, and check a
deep link under each mount, not just the mount points:

```bash
for p in / /pm/ /pm/networth /speclab/ /speclab/whatever /unknown /pmx; do
  printf '%-18s %s bytes\n' "$p" "$(curl -s localhost:8787$p | wc -c)"
done
```

A 200 with a zero-byte body is the failure to watch for: Workers Static Assets
answers `/pm/index.html` with a 307 to `/pm/`, so fetching the index path and
restatusing it to 200 yields an empty page. Fetch the directory instead.

`dist/` is gitignored but `scripts/catalogue-coverage.mjs` walks the working
tree, not the index — so a local build leaves six "UNDECLARED endpoint"
failures (`finance/dist`, `finance/dist/pm`, …) in `node scripts/preflight.mjs`
until you delete it. CI checks out clean and never sees them.
