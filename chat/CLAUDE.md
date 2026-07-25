# chat — chat.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Conversation-practice dojo. An AI partner (Workers AI Llama 3.3 70B) plays your counterpart and a theory-grounded rubric scores the exchange; multiplayer DO rooms are roadmap.

## Facts

| | |
|---|---|
| Surface | `chat` |
| Dir | `chat/` |
| Endpoint | `chat.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/conversation-practice-website-he3t8x` |
| Deploy | `.github/workflows/deploy-chat.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "chat"`.

## How it works

Conversation-practice dojo. Robo trainer (AI partner + theory-grounded scoring rubric) at /robo/, theory + rubric-development docs at /docs/, landing at /. Worker + Workers AI (llama-3.3-70b), no D1, no secrets beyond shared Cloudflare creds. Multiplayer (DO rooms, lobby, peer-rated scoreboard) is roadmap.

## Deploying

Pushes to `claude/conversation-practice-website-he3t8x` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-chat.yml`](../.github/workflows/deploy-chat.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
