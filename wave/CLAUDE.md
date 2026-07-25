# wave — wave.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Team messaging. Channels, threads, and collaborative documents with real-time Jetstream sync.

## Facts

| | |
|---|---|
| Surface | `wave` |
| Dir | `wave/` |
| Endpoint | `wave.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-wave.yml` |
| Uses | `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "wave"`.

## How it works

Wave SPA (Vite + tsc -> ./dist, Worker `wave`). Uses shared oauth-client wrapper (wave/src/lib/auth.ts) -> auth.mino.mobi.

## Deploy status

MANAGED — onboarded to Actions (deploy-wave.yml). First QB pass: brought an Action-less independent site onto the deploy conveyor. (Was deploying via CF git integration / manual wrangler; disconnect git once this Action is confirmed canonical.)

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-wave.yml`](../.github/workflows/deploy-wave.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
