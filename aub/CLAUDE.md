# aub — aub.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Ecdysium (aubrika/ecdysium) — a Rust + macroquad sci-fi horror roguelike vendored under aub/game and compiled to wasm32-unknown-unknown. Assets-only worker `aub` serving a static dist (web shell + macroquad JS bundle + game assets + the wasm), assembled at deploy time by deploy-aub.yml. Only upstream change is a getrandom `js` feature for the wasm target…

## Facts

| | |
|---|---|
| Surface | `aub` |
| Dir | `aub/` |
| Endpoint | `aub.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/game-website-deploy-2ffuu2` |
| Deploy | `.github/workflows/deploy-aub.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "aub"`.

## How it works

Ecdysium (aubrika/ecdysium) — a Rust + macroquad sci-fi horror roguelike vendored under aub/game and compiled to wasm32-unknown-unknown. Assets-only worker `aub` serving a static dist (web shell + macroquad JS bundle + game assets + the wasm), assembled at deploy time by deploy-aub.yml. Only upstream change is a getrandom `js` feature for the wasm target. Save/load no-ops in-browser (std::fs unavailable) but the game plays.

## Deploying

Pushes to `claude/game-website-deploy-2ffuu2` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-aub.yml`](../.github/workflows/deploy-aub.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
