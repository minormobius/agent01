# cron — minomobi-cron

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

The cron trampoline, and as of 2026-07-30 a NO-OP: it has never dispatched anything, because GITHUB_PAT was never set and every fire is a silent 401. Its purpose stands — GitHub's schedule: fires only from the default branch, so a pipeline on a feature branch never sees it — but the daily jobs it was believed to drive have in fact been running off their own schedule: on main. It fires bisk digest (13:00), autopilot brief (13:30), finance sync (weekdays 21:30), lexicon fetch (monthly), and the ideas bot (post hourly, review 6-hourly, pull daily), each at the ref holding its state — once CRON_GITHUB_PAT exists. /health reports dispatchReady, and deploy-cron fails red until it is true.

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

## It has never worked, and that is the first thing to fix

Measured 2026-07-30: **zero `workflow_dispatch` runs on `bisk-digest.yml`,
`autopilot-brief.yml`, `sync-finance.yml` or `ideas-post.yml` — ever.** The
worker was deployed, its crons were registered, `/health` answered, and it fired
nothing, for its entire life.

`GITHUB_PAT` was never set. `src/index.js` said to set it "after first deploy"
by hand; nobody did; every dispatch was a 401 into `console.error`. A green
deploy and a healthy endpoint hid it, which is the golden rule's lesson wearing
different clothes: **green is not proof, and neither is deployed.**

The premise also needs correcting. GitHub's `schedule:` is not dead on this repo.
It fires **only from the default branch** — which is the real reason a pipeline
living on a feature branch never sees it — and on `main` it is dependable for
daily cadence and lossy for hourly (`autopilot-brief` ran six days running;
`ideas-post`'s hourly schedule delivered 3 runs out of ~14). So this worker earns
its keep for **hourly work and for anything whose state lives off `main`**, and
not for the reason originally written down.

**To make it work, once:** create a fine-grained PAT scoped to this repo with
**Actions: write** and nothing else, add it as the repository secret
`CRON_GITHUB_PAT`, and re-run `deploy-cron.yml`. From then on the deploy pushes
it to the worker on every run, so a redeploy cannot silently drop it.

Do **not** point it at `OS_AGENT_GITHUB_TOKEN` or `SECRETS_PAT` to save the
trouble. Those carry contents-write and secrets-write; this needs one permission.
