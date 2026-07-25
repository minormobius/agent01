# ar — ar.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Worker + Room Durable Object (WebSocket relay) + static assets (public/). Two-phone AR Laue diffraction at /crystal/.

## Facts

| | |
|---|---|
| Surface | `ar` |
| Dir | `ar/` |
| Endpoint | `ar.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/3d-crystal-diffraction-B5YhB` |
| Deploy | `.github/workflows/deploy-ar.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "ar"`.

## How it works

Worker + Room Durable Object (WebSocket relay) + static assets (public/). Two-phone AR Laue diffraction at /crystal/.

## Deploying

Pushes to `claude/3d-crystal-diffraction-B5YhB` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-ar.yml`](../.github/workflows/deploy-ar.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
