# duck — duck.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Two WebGPU games on one worker (`duck`, custom_domain duck.mino.mobi). Pure-static, no build, no secrets. (1) duck.mino.mobi/ — the spin-gravity DUCK FLIGHT SIM: fly an aerodynamic duck under uniform Earth gravity vs. the co-rotating frame of an O'Neill cylinder (centrifugal ω²r + Coriolis −2Ω×v), navigate a gate course, land on the pad…

## Facts

| | |
|---|---|
| Surface | `duck` |
| Dir | `duck/` |
| Endpoint | `duck.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/feature-merge-candidate-l4dkwq` |
| Deploy | `.github/workflows/deploy-duck.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "duck"`.

## How it works

Two WebGPU games on one worker (`duck`, custom_domain duck.mino.mobi). Pure-static, no build, no secrets. (1) duck.mino.mobi/ — the spin-gravity DUCK FLIGHT SIM: fly an aerodynamic duck under uniform Earth gravity vs. the co-rotating frame of an O'Neill cylinder (centrifugal ω²r + Coriolis −2Ω×v), navigate a gate course, land on the pad. (2) duck.mino.mobi/golf/ — O'NEILL LINKS, Coriolis golf: a twin-screen course DESIGNER (3D preview + 2D plan editor: drag tee/pin/hazards, share a permalink) + PLAY surface where centrifugal gravity + Coriolis bend every shot and break every putt. Both reuse hoop's canonical 8 km/0.8 g hull and the shared rotating-frame kernel; golf ballistics (drag + Magnus) reduce exactly to the proven free particle. Node-tested: duck/test/{physics,course,golf}.selftest.mjs all gate the deploy.

## Deploying

Pushes to `claude/feature-merge-candidate-l4dkwq` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-duck.yml`](../.github/workflows/deploy-duck.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
