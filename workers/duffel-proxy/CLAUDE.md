# duffel-proxy — air.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

CORS/auth proxy for the Duffel flight-search API — holds the bearer token as a worker secret so the browser never sees it. Backs the flights explorer.

## Facts

| | |
|---|---|
| Surface | `duffel-proxy` |
| Dir | `workers/duffel-proxy/` |
| Endpoint | `air.mino.mobi` |
| Type | backend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-duffel-proxy.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "duffel-proxy"`.

## Deploy status

AUDIT 2026-07-16: endpoint corrected duffel-proxy -> air.mino.mobi (custom_domain route in wrangler.toml, probe-verified 200).

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-duffel-proxy.yml`](../../.github/workflows/deploy-duffel-proxy.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
