# wars — war.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

War factor analysis. Correlates of War dataset visualized by type, region, duration, and casualties.

## Facts

| | |
|---|---|
| Surface | `wars` |
| Dir | `wars/` |
| Endpoint | `war.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-wars.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "wars"`.

## How it works

War Factor Analysis — Correlates of War dataset explorer. Static worker-assets (Worker `wars-minomobi`). Live at war.mino.mobi (probe-verified); also bundled at mino.mobi/wars.

## Deploy status

MANAGED — FIXED (zoom-bucket): config renamed wars-minomobi -> war + custom_domain route (war.mino.mobi). Was deploying stray worker wars-minomobi. CLEANUP: delete the orphan `wars-minomobi` worker.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-wars.yml`](../.github/workflows/deploy-wars.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
