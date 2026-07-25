# cable — cable.mino.mobi, cable.ascential.work

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Progressive cable-drawing solver for custom instrument cabling. Walks the 7-layer stack (component → connector → pin set → cable → pin → connector → board), propagating constraints across layers. Pure static (vanilla JS, no build): catalog.js → solver.js → drawing.js → app.js, attached to globalThis so the solver unit-tests in node. Worker `cable` owns cable.mino.mobi

## Facts

| | |
|---|---|
| Surface | `cable` |
| Dir | `cable/` |
| Endpoint | `cable.mino.mobi, cable.ascential.work` |
| Type | frontend |
| Owning branch | `claude/cable-definition-website-yrwv41` |
| Deploy | `.github/workflows/deploy-cable.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "cable"`.

## How it works

Progressive cable-drawing solver for custom instrument cabling. Walks the 7-layer stack (component → connector → pin set → cable → pin → connector → board), propagating constraints across layers. Pure static (vanilla JS, no build): catalog.js → solver.js → drawing.js → app.js, attached to globalThis so the solver unit-tests in node. Worker `cable` owns cable.mino.mobi; 2nd custom_domain route cable.ascential.work (alias; separate ascential.work zone — shared CLOUDFLARE_API_TOKEN already has Routes:Edit there, per ocr/ai-edu).

## Deploying

Pushes to `claude/cable-definition-website-yrwv41` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-cable.yml`](../.github/workflows/deploy-cable.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
