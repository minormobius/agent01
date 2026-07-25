# zoom — zoom.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

SimCluster community viewer. Infinite-canvas visualization of feed communities with hex-packed profile pictures.

## Facts

| | |
|---|---|
| Surface | `zoom` |
| Dir | `zoom/` |
| Endpoint | `zoom.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-zoom.yml` |
| Uses | `feed.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "zoom"`.

## How it works

Vite/React build -> ./dist, Worker `zoom` with custom_domain zoom.mino.mobi (canvas/math/g/torus pattern). NB: zoom is a Worker, not a Pages project (verified: no Pages project named zoom).

## Deploy status

MANAGED — FIXED: config name corrected mino-zoom -> zoom so `wrangler deploy` updates the WORKER that owns zoom.mino.mobi (was deploying a separate stray Worker `mino-zoom` on workers.dev; the live `zoom` Worker languished ~2mo). custom_domain route now declared in config. CLEANUP: delete the orphan `mino-zoom` Worker in the dashboard.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-zoom.yml`](../.github/workflows/deploy-zoom.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
