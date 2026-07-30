# cron — minomobi-cron

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

The cron trampoline. GitHub’s schedule: triggers only ever fire from the default branch, so workflows living on feature branches never ran — this worker fires them on Cloudflare cron via workflow_dispatch instead, each at the ref that holds its state: bisk digest (daily 13:00), autopilot brief (13:30), finance sync (weekdays 21:30), lexicon fetch (monthly), and the ideas bot — post hourly, review every 6h, pull daily 06:00 — dispatched at the branch that owns the .github/ideas/ ledger.

## Facts

| | |
|---|---|
| Surface | `cron` |
| Dir | `workers/cron/` |
| Endpoint | `minomobi-cron` |
| Type | backend |
| Owning branch | `claude/minomobi-landing-page-vg37b8` |
| Deploy | `.github/workflows/deploy-cron.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "cron"`.

## Deploying

Pushes to `claude/minomobi-landing-page-vg37b8` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-cron.yml`](../../.github/workflows/deploy-cron.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
