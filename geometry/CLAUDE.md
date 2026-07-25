# math — math.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Hub for the extremal-geometry pack. Family-resemblance table sortable by era, technique, status — and an explicit roadmap of next entries (szemerédi–trotter, heilbronn, borsuk, viazovska, ...). Read this first if you want the lay of the series.

## Facts

| | |
|---|---|
| Surface | `math` |
| Dir | `geometry/` |
| Endpoint | `math.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-math.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "math"`.

## How it works

Math/explainer pack (grows beyond geometry): hub geometry/ + scattered top-level explainer dirs + elements/. conjectures/ is a math-NATIVE new member (data-driven index of 193 open conjectures ranked by difficulty — the modelled odds each still stands in 2126 — with per-conjecture context pages, plus the CONJECTURE MACHINE at /generate: a generator that mints new statements from the same grammar and an executable REALITY ENGINE that actually runs them over small cases before a solvability oracle rates them; engine.selftest.mjs + reality.selftest.mjs gate both. Canonical URL math.mino.mobi/conjectures/, NOT served by root — no cross-link rewrite needed since it uses relative links). DEFERRED on-split work: the OTHER (root-shared) members cross-link by ABSOLUTE https://mino.mobi/<x>/ URLs — rewrite those to relative in all members + the hub, THEN carve these dirs out of root.serves + deploy-root.yml paths so root stops shipping them.

## Deploy status

MANAGED — additive launch via deploy-math.yml (Worker `math`, custom_domain math.mino.mobi). Members are STAGED from root at build time, not moved; root still serves the canonical mino.mobi/<x>/ URLs so nothing breaks.

## The geometry pack (`/geometry/` + siblings) — interactive math explainers

Single-file static canvas pages on extremal-geometry results, sharing a scaffold (crumb → mino.mobi, accent colour, sister crossref, tabs, docs). Hub at `/geometry/` (sortable resemblance table + roadmap in `geometry/IDEAS.md`). Members: `erdos`, `guthkatz`, `hadwiger`, `runner`, `kakeya`, `capset`, `szemeredi-trotter`, `heilbronn`, `borsuk`, `viazovska`; plus the adjacent `/elements/` periodic-table mandala. Pure static — deploy with the root Pages site. When adding one: follow `geometry/IDEAS.md` anti-patterns, validate the math in the commit body, add to the root `index.html` PROJECTS array, and re-run `scripts/generate-search-catalog.mjs` + `scripts/generate-og-card.mjs`.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-math.yml`](../.github/workflows/deploy-math.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
