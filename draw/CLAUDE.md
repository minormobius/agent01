# canvas — canvas.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Massively multiplayer paint. Shared canvases with append-only stroke log, tamper-evident chain, and ATProto identity gating.

## Facts

| | |
|---|---|
| Surface | `canvas` |
| Dir | `draw/` |
| Endpoint | `canvas.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/pizza-cutting-game-7VvX2` |
| Deploy | `.github/workflows/deploy-canvas.yml` |
| Uses | `atpolls-db`, `scores.mino.mobi`, `auth.mino.mobi` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "canvas"`.

## How it works

draw+paint+mmo frontends are backed by poll worker /api/{draw,mmo}; curve+pizza submit to scores — all ABSOLUTE origins, so the frontends move cleanly. One deploy unit; backends stay in poll/scores. pizza is a standalone static canvas game (no backend beyond the shared scores+auth workers). DEFERRED: carve these dirs out of root once canvas.mino.mobi is the home.

## Deploy status

MANAGED — additive launch via deploy-canvas.yml (Worker `canvas`, custom_domain canvas.mino.mobi + thin canvas/index.html hub). Members STAGED from root, not moved; backends untouched (absolute origins). Root still serves canonical mino.mobi/<x>/.

## Deploying

Pushes to `claude/pizza-cutting-game-7VvX2` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-canvas.yml`](../.github/workflows/deploy-canvas.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
