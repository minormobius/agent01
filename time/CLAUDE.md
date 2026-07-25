# time — time.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The Mino Times—agentic biotech intelligence. Research, articles, editorial panels, and podcast.

## Facts

| | |
|---|---|
| Surface | `time` |
| Dir | `time/` |
| Endpoint | `time.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/audit-time-deploy-ag144t` |
| Deploy | `.github/workflows/deploy-time.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "time"`.

## How it works

The Mino Times — a two-desk paper (Modulo = data desk, Morphyx = institutional desk). Repo-native front page renders from time/index.json (built from time/articles/*.html by scripts/build-time-index.mjs), so no Bluesky-account suspension can blank it. Running series: The LDT Reckoning. Legacy time.minomobi.com is dead; canonical is now time.mino.mobi.

## Deploy status

MANAGED — new surface via deploy-time.yml (Worker `time`, custom_domain time.mino.mobi). Carved out of the root bundle; assets-only static, deploy step regenerates index.json. Sources stay in time/; also mirrored at mino.mobi/time until fully removed from root.

## Deploying

Pushes to `claude/audit-time-deploy-ag144t` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-time.yml`](../.github/workflows/deploy-time.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
