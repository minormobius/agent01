# answers — ask.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Ask anything. Answered by the ATmosphere—questions, answers, votes, and best-answer picks stored on PDS.

## Facts

| | |
|---|---|
| Surface | `answers` |
| Dir | `answers/` |
| Endpoint | `ask.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-answers.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "answers"`.

## How it works

"Answers — powered by ATProto". Static worker-assets. Live subdomain is ask.mino.mobi (worker `ask`); also bundled at mino.mobi/answers/. Has inline OAuth (answers/assets/answers.js) — migrate to shared oauth-client later.

## Deploy status

MANAGED — FIXED (zoom-bucket): the answers/ site is live at ask.mino.mobi via a worker named `ask` (not answers.mino.mobi). Config renamed mino-answers -> ask + custom_domain route, so the Action now updates the live worker (was deploying stray mino-answers; ask sat ~45 days). CLEANUP: delete the orphan `mino-answers` worker.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-answers.yml`](../.github/workflows/deploy-answers.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
