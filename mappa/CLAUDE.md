# mappa — mappa.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The world engine + atlas (worker `mappa`, custom_domain mappa.mino.mobi) — MOVED OFF the root surface so it deploys with the world-engine suite (third suite surface with civ + polis). Assets-only worker…

## Facts

| | |
|---|---|
| Surface | `mappa` |
| Dir | `mappa/` |
| Endpoint | `mappa.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/civ-deploy-unification-vt35ju` |
| Deploy | `.github/workflows/deploy-mappa.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "mappa"`.

## How it works

The world engine + atlas (worker `mappa`, custom_domain mappa.mino.mobi) — MOVED OFF the root surface so it deploys with the world-engine suite (third suite surface with civ + polis). Assets-only worker; the deploy stages packages/atproto/pds.js + packages/oauth-client/auth.js under /packages/ (viewer→world-share runtime imports) and excludes mappa/civ (ships on the civ surface) + engine-rs sources (pkg/ wasm is served). The OLD mino.mobi/mappa/ (root surface) serves until the root branch catches up. Note: mappa/civ/** and mappa/engine.js are deliberately co-watched with the civ surface — both deploys need them.

## Deploying

Pushes to `claude/civ-deploy-unification-vt35ju` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-mappa.yml`](../.github/workflows/deploy-mappa.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
