# bakery — bake.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Flour blend calculator—protein math, hydration targets, blend ratios.

## Facts

| | |
|---|---|
| Surface | `bakery` |
| Dir | `bakery/` |
| Endpoint | `bake.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-bakery.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "bakery"`.

## Deploy status

AUDIT 2026-07-16: endpoint corrected bakery.mino.mobi -> bake.mino.mobi (probe-verified: bake 200, bakery unresolvable). wrangler.jsonc has NO custom_domain route — bake.mino.mobi is dashboard-attached (golden-rule risk; add a routes entry on next touch).

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-bakery.yml`](../.github/workflows/deploy-bakery.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
