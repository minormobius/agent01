# photo — photo.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Photo explorer. Every image from any handle, rendered as a filterable masonry grid with engagement analytics.

## Facts

| | |
|---|---|
| Surface | `photo` |
| Dir | `photo/` |
| Endpoint | `photo.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/feature-merge-candidate-l4dkwq` |
| Deploy | `.github/workflows/deploy-photo.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "photo"`.

## Deploying

Pushes to `claude/feature-merge-candidate-l4dkwq` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-photo.yml`](../.github/workflows/deploy-photo.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
