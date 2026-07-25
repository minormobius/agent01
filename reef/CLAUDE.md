# reef — reef.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

reef.mino.mobi — Tinder-style crowd judging of procedurally generated voxel sea creatures (fish/eel/ray/jellyfish/turtle/coral/anemone; reef/js/species.js, seeded + connected + morphologically exaggerated at 15^3)…

## Facts

| | |
|---|---|
| Surface | `reef` |
| Dir | `reef/` |
| Endpoint | `reef.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/cube3d-browser-port-ufh9gy` |
| Deploy | `.github/workflows/deploy-reef.yml` |
| Uses | `atpolls-db` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "reef"`.

## How it works

reef.mino.mobi — Tinder-style crowd judging of procedurally generated voxel sea creatures (fish/eel/ray/jellyfish/turtle/coral/anemone; reef/js/species.js, seeded + connected + morphologically exaggerated at 15^3). Specimens are (species,seed) pairs regenerated client-side — D1 stores ONLY votes (reef_votes on shared atpolls-db, migration 0032, PK (specimen,voter), gen column versions the generator). API: /api/reef/{health,next,vote,stats,export}; /next mixes hot specimens (1-4 votes, so verdicts converge at 3+) with fresh random draws from an 800-seed/species universe; /export feeds the trainer. The votes gate the training corpus for the reef NCA — same architecture as the cube3D firmware network, trained by reef/train/train_reef.py (PyTorch-CPU reimplementation of the paper protocol: masked CE, random 56-88 step rollouts, kernel-mask reset, fire 0.5) via the manual train-reef.yml workflow (gen corpus -> fetch crowd rejects (yes-ratio<0.4 at >=3 votes dropped) -> train ~3h -> held-out majority-accuracy gate -> commits reef/model/{weights-reef.js,golden-reef.json,eval.json} back). Deck UI: single-card three.js voxel viewer (neutral pearl colouring to avoid bias), swipe/buttons/arrow keys, anonymous localStorage voter id, OG tags for sharing. Destined to power a reef biome in golem.

## Deploy status

MANAGED — new surface via deploy-reef.yml (Worker `reef`). Species selftest gate + idempotent D1 migration before deploy.

## Deploying

Pushes to `claude/cube3d-browser-port-ufh9gy` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-reef.yml`](../.github/workflows/deploy-reef.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
