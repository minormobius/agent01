# pm — pm.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

> **2026-09-23: retired as a surface.** `pm.mino.mobi` was detached to free a slot under the
> `mino.mobi` zone's 100-custom-domain cap, and the registry entry, `wrangler.jsonc` and
> `deploy-pm.yml` were removed. This single-file app signs in with an app password (no
> origin-bound OAuth), so it keeps working at **`mino.mobi/pm/`**, which the root worker serves.
> Org's own PM tab (`org.mino.mobi/pm`, `org/src/pm/`) is the integrated port. Everything below
> is history.

Earned value project management. Gantt charts, S-curves, resource tracking, and Kanban—synced to PDS.

## Facts

| | |
|---|---|
| Surface | `pm` |
| Dir | `pm/` |
| Endpoint | `pm.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-pm.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "pm"`.

## How it works

Mino PM — earned-value project management. Static worker-assets (Worker `pm`).

## Deploy status

MANAGED — onboarded to Actions (deploy-pm.yml). First QB pass: brought an Action-less independent site onto the deploy conveyor. (Was deploying via CF git integration / manual wrangler; disconnect git once this Action is confirmed canonical.)

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-pm.yml`](../.github/workflows/deploy-pm.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
