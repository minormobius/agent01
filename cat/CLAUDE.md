# cat — cat.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Cats from the firehose. A live stream of cat photos posted to Bluesky, filtered by hashtag and image.

## Facts

| | |
|---|---|
| Surface | `cat` |
| Dir | `cat/` |
| Endpoint | `cat.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-cat.yml` |
| Uses | `atpolls-db` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "cat"`.

## Deploy status

AUDIT 2026-07-16: cat.mino.mobi UNREACHABLE (TLS/DNS fails while 60 sibling domains respond) — domain likely never attached / detached. wrangler.jsonc (worker `cat-firehose`) declares no custom_domain route. Fix: add routes entry + attach in dashboard.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-cat.yml`](../.github/workflows/deploy-cat.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
