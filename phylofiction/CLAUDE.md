# phylofiction — phylofiction.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Seeded deterministic tree-of-life generator: a Rust/WASM evolution engine (engine-rs/, artifact committed by build-phylofiction-wasm.yml) drives a microbial phylogeny that any page-seed reproduces identically. Static reader (assets worker `phylofiction` owns phylofiction.mino.mobi); all computation client-side, no D1/DO/secrets. JS engine mirrored against the wasm in test/parity.test.mjs.

## Facts

| | |
|---|---|
| Surface | `phylofiction` |
| Dir | `phylofiction/` |
| Endpoint | `phylofiction.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/phylofiction-world-generation-3zd33u` |
| Deploy | `.github/workflows/deploy-phylofiction.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "phylofiction"`.

## How it works

Seeded deterministic tree-of-life generator: a Rust/WASM evolution engine (engine-rs/, artifact committed by build-phylofiction-wasm.yml) drives a microbial phylogeny that any page-seed reproduces identically. Static reader (assets worker `phylofiction` owns phylofiction.mino.mobi); all computation client-side, no D1/DO/secrets. JS engine mirrored against the wasm in test/parity.test.mjs.

## Deploying

Pushes to `claude/phylofiction-world-generation-3zd33u` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-phylofiction.yml`](../.github/workflows/deploy-phylofiction.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
