# polis — polis.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The city cascade (worker `polis`, custom_domain polis.mino.mobi) — MOVED OFF the root surface so it deploys with the world-engine suite. `/` is the cascade charter (civ über-macro → hinterland mesoscale → city micro); `/hinterland/` the region sim (full civ client: environment/tech/transport eras/envelope from /api/civ/sites, railroads at mechanisation, drowning rule)…

## Facts

| | |
|---|---|
| Surface | `polis` |
| Dir | `polis/` |
| Endpoint | `polis.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/civ-deploy-unification-vt35ju` |
| Deploy | `.github/workflows/deploy-polis.yml` |
| Uses | `civ` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "polis"`.

## How it works

The city cascade (worker `polis`, custom_domain polis.mino.mobi) — MOVED OFF the root surface so it deploys with the world-engine suite. `/` is the cascade charter (civ über-macro → hinterland mesoscale → city micro); `/hinterland/` the region sim (full civ client: environment/tech/transport eras/envelope from /api/civ/sites, railroads at mechanisation, drowning rule); `/continent.html` the whole-continent closed system; `/docs/` the theory. Assets-only worker; the deploy stages mappa/engine.js + climate-forcing.js under /mappa/ so the pages' runtime ES imports resolve on this origin. The OLD mino.mobi/polis/ (root surface) serves the pre-cascade site until the root branch catches up. Node selftest: polis/test/hinterland.selftest.mjs.

## Deploying

Pushes to `claude/civ-deploy-unification-vt35ju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-polis.yml`](../.github/workflows/deploy-polis.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
