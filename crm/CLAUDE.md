# crm — crm.mino.mobi (pending attach)

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Vault CRM. Encrypted contact records sealed to PDS with ECDH + AES-GCM; tiered sharing for team members.

## Facts

| | |
|---|---|
| Surface | `crm` |
| Dir | `crm/` |
| Endpoint | `crm.mino.mobi (pending attach)` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-crm.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "crm"`.

## How it works

Vault CRM SPA (Vite + tsc -> ./dist, Worker `crm`). Currently served via root bundle at mino.mobi/crm/; own subdomain not attached.

## Deploy status

MANAGED (domain pending) — onboarded to Actions (deploy-crm.yml) as an ADDITIVE own-worker deploy. Non-breaking: still served via its current path; attach the custom domain in the Cloudflare dashboard to complete the carve-out, then drop from the root bundle.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-crm.yml`](../.github/workflows/deploy-crm.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
