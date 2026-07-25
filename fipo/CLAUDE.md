# fipo — fipo.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

The bad sci-fi pitch archive. /pitch — the pitch-GENOME engine (fipo/pitch/engine.js): a deterministic seeded sampler (xmur3+mulberry32, a seed is a permalink) over the phase space of earnest failure…

## Facts

| | |
|---|---|
| Surface | `fipo` |
| Dir | `fipo/` |
| Endpoint | `fipo.mino.mobi` |
| Type | frontend |
| Owning branch | `claude/fipo-pitch-genome-Qm7Xp2` |
| Deploy | `.github/workflows/deploy-fipo.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "fipo"`.

## How it works

The bad sci-fi pitch archive. /pitch — the pitch-GENOME engine (fipo/pitch/engine.js): a deterministic seeded sampler (xmur3+mulberry32, a seed is a permalink) over the phase space of earnest failure. The genome is dependency-ordered: soul axes (earnestness/competence/ambition/sincerity/budget, bimodal sincerity) → era (7 period-locked eras) → milieu (12 studio ecosystems) → CAUSAL ORDER (title/poster/ripoff/star/toy/vision/footage/gimmick-first — historically load-bearing) → derivation (ripoff target + transcription distance + loss) → novum → dramatis (derived miscasting) → geometry of stakes (stakes rank × venue rank; the gap IS the scale-misjudgment mode) → THE COMMITMENT (one forced bizarre specific choice) → derived title (17 era-locked patterns), tagline, logline, comps. 13 rule-based failure-mode detectors with deadpan reasons = the judge-embryo. THE PROJECTION (fipo/poster/project.js, phase 3 engine LIVE): a versioned prompt template (PROMPT_VERSION, currently v2) assembled from genome-traced slots — era-locked medium descriptors (never evaluative words; the selftest bans bad/cheesy/camp/schlock from every slot), one-sheet composition grammar, flaw taxonomy sampled as CONFIGURATIONS not adjectives ('the heroine’s hands are slightly too small'), and the BRIEF FIDELITY knob (faithful / genre-confused / spoils-the-twist / advertises-a-different-movie — the 'bad projection of an okay movie' category). Text is composited, never generated: the typography pass (studio/director/cast names, billing block, era mark, rating) is fully deterministic and renders as the poster card on /pitch. Paintings render via render-fipo-posters.yml (dispatch-only, gpt-image-1, OPENAI_API_KEY) into fipo/poster/img/<seed>.png with genome+prompt logs in fipo/poster/prompts/ (A/B-testable per prompt version). Two test paintings (seeds 54, 94) rendered via the public pollinations endpoint confirmed the second-tier region holds. Selftests gate deploy: engine.selftest.mjs (15) + project.selftest.mjs (15). Phase 2 (the judge — pairwise, genome-in-context, coverage-as-objective) planned.

## Deploy status

MANAGED — new surface via deploy-fipo.yml (Worker `fipo`, custom_domain fipo.mino.mobi). Assets-only static worker; engine selftest gates the deploy.

## Deploying

Pushes to `claude/fipo-pitch-genome-Qm7Xp2` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-fipo.yml`](../.github/workflows/deploy-fipo.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
