# torus — torus.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Explorable 3D landscape with first-person controls. Local and networked multiplayer.

## Facts

| | |
|---|---|
| Surface | `torus` |
| Dir | `clock/` |
| Endpoint | `torus.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-torus.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "torus"`.

## How it works

Toroidal game family split out of the deprecated clock surface: corn, emsim, inpac, knotpac, pac, torpac, toruschess + a torus/index.html hub.

## Deploy status

MANAGED — additive launch via deploy-torus.yml (Worker `torus`). The toroidal games staged from clock/<toy>, not moved; g + clock still serve them.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-torus.yml`](../.github/workflows/deploy-torus.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
