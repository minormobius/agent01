# civ — civ.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Coevolutionary agent-based civilization simulation on a mappa world (worker civ, custom_domain civ.mino.mobi). `/` is the WORLD-ENGINE HUB — landing page over the whole suite (civ dashboard at /dash/, playback/development/FRED subpages, and cross-links to mappa, polis, rite/names, rite/org); unification strategy in civ/STRATEGY.md. Headless-first engine in mappa/civ/…

## Facts

| | |
|---|---|
| Surface | `civ` |
| Dir | `civ/` |
| Endpoint | `civ.mino.mobi` |
| Type | backend |
| Owning branch | `claude/civ-deploy-unification-vt35ju` |
| Deploy | `.github/workflows/deploy-civ.yml` |
| Uses | — |
| Provides | `civ` |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "civ"`.

## How it works

Coevolutionary agent-based civilization simulation on a mappa world (worker civ, custom_domain civ.mino.mobi). `/` is the WORLD-ENGINE HUB — landing page over the whole suite (civ dashboard at /dash/, playback/development/FRED subpages, and cross-links to mappa, polis, rite/names, rite/org); unification strategy in civ/STRATEGY.md. Headless-first engine in mappa/civ/; CORS-open no-key API /api/civ/run + /api/civ/sweep + /api/civ/sites (the civ→polis foundings handoff). Names spoken by rite/names culture packs (mappa/civ/names.js — hence rite/names/engine.js in paths). Bundles mappa/engine.js. No secrets, no D1.

## Deploying

Pushes to `claude/civ-deploy-unification-vt35ju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-civ.yml`](../.github/workflows/deploy-civ.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
