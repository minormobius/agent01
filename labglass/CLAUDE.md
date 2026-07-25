# labglass — glass.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Peer-to-peer biotech data workbench. SQL and Python running entirely in the browser.

## Facts

| | |
|---|---|
| Surface | `labglass` |
| Dir | `labglass/` |
| Endpoint | `glass.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-labglass.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "labglass"`.

## How it works

DuckDB + Pyodide biotech data workbench. Static worker-assets (Worker `glass`). Needs COOP/COEP headers (labglass/_headers). Different registrable domain (minomobi.com) — outside the .mino.mobi SSO cookie.

## Deploy status

MANAGED — onboarded to Actions (deploy-labglass.yml). First QB pass: brought an Action-less independent site onto the deploy conveyor. (Was deploying via CF git integration / manual wrangler; disconnect git once this Action is confirmed canonical.)

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-labglass.yml`](../.github/workflows/deploy-labglass.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
