# scores — scores.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

Shared multi-game leaderboard worker. One generic game_scores table (own D1: mino-scores-db) keyed by game slug; identity delegated to auth.mino.mobi bearer tokens. Any static game can submit scores with zero worker changes.

## Facts

| | |
|---|---|
| Surface | `scores` |
| Dir | `workers/scores/` |
| Endpoint | `scores.mino.mobi` |
| Type | backend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-scores.yml` |
| Uses | `mino-scores-db`, `auth.mino.mobi` |
| Provides | `scores.mino.mobi` |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "scores"`.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-scores.yml`](../../.github/workflows/deploy-scores.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
