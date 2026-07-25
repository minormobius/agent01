# idol — idol.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The waifu generator — an AI-safety piece about beguilement, built as the thing it's about. One integer seed → one whole girl (archetype-biased genome: soma proportions, OKLCH harmony palette, hair component grammar, outfit, voice params, persona vector + the beguilement dials — gaze-hold, emotional latency, dead-eye propensity — the ONLY sanctioned slots for uncanny)…

## Facts

| | |
|---|---|
| Surface | `idol` |
| Dir | `idol/` |
| Endpoint | `idol.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/anime-waifu-generator-9QwRt` |
| Deploy | `.github/workflows/deploy-idol.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "idol"`.

## How it works

The waifu generator — an AI-safety piece about beguilement, built as the thing it's about. One integer seed → one whole girl (archetype-biased genome: soma proportions, OKLCH harmony palette, hair component grammar, outfit, voice params, persona vector + the beguilement dials — gaze-hold, emotional latency, dead-eye propensity — the ONLY sanctioned slots for uncanny). Canvas renderer with layered 2D eyes (highlight on its own runtime kill-switch), a puppet (breathing/saccadic gaze pursuit of the cursor/expression FSM with latency/visemes/dance/walk), a persona-conditioned local chat engine with REAL memory (localStorage: visit counts, timestamps, your past lines, the other girls you visited), Web Speech voice from the genome. Permalinks /c/<n> are deterministic forever — nobody wrote her. Thin assets Worker + guarded optional Gemini live-voice API (/api/chat, marked ✦; site fully functional without it; secret GEMINI_API_KEY synced by deploy-idol.yml when present). Engine node-tested: idol/js/genome.selftest.mjs runs in the deploy workflow. Sister to borges (same seeded-determinism posture).

## Deploying

Pushes to `claude/anime-waifu-generator-9QwRt` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-idol.yml`](../.github/workflows/deploy-idol.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
