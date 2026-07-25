# finance — fin.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Personal financial dashboard. Market data synced to ATProto records, rendered with dark-mode charts.

## Facts

| | |
|---|---|
| Surface | `finance` |
| Dir | `finance/` |
| Endpoint | `fin.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/speculative-feedback-playground-t0yiaq` |
| Deploy | `.github/workflows/deploy-finance.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "finance"`.

## How it works

Worker `fin` (main: worker.js + ASSETS) serving two apps from one dist/: the speculative-feedback playground at / (TS/React, Vite multipage) and the personal-finance planning SPA at /pm. worker.js does subtree-aware SPA fallback and reserves /api/* for the M2 backend (experiment store + server-side runs).

## Deploy status

MANAGED — onboarded to Actions (deploy-finance.yml). Surface taken over for the speculative-feedback research playground; the personal-finance SPA was relocated under /pm.

## Deploying

Pushes to `claude/speculative-feedback-playground-t0yiaq` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-finance.yml`](../.github/workflows/deploy-finance.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
