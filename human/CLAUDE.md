# human — human.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

human.mino.mobi — HUMAN MACHINERY, the bias arcade: an explorable museum of cognitive biases where every exhibit is a 60-second game rigged by your own brain (play → fail → learn → verify → wormhole)…

## Facts

| | |
|---|---|
| Surface | `human` |
| Dir | `human/` |
| Endpoint | `human.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/human-machinery-Hm7qX2` |
| Deploy | `.github/workflows/deploy-human.yml` |
| Uses | `atpolls-db` |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "human"`.

## How it works

human.mino.mobi — HUMAN MACHINERY, the bias arcade: an explorable museum of cognitive biases where every exhibit is a 60-second game rigged by your own brain (play → fail → learn → verify → wormhole). Launch wings: Perception (Stroop Sprint, Change Blindness Gallery), Judgment (Anchoring Auction, Framing Clinic, Sunk Cost Simulator), and The Contested Wing (failed replications as first-class exhibits). Every response feeds anonymous aggregate counters (human_stats on shared atpolls-db, migration 0033 — buckets pre-binned client-side, no ids/PII), so each exhibit reveals the LIVE visitor split alongside the original study's numbers and its replication badge (well-replicated / contested / failed-replication). Stimuli are all original (hand-drawn SVG scenes, own stimulus sets) — no licensed test batteries. API: /api/human/{health,event,summary,all}, CORS open. OG cards baked at build time by scripts/bake-human-og.mjs (pure-node PNG encoder + embedded bitmap font) into human/og/. Pure vanilla HTML/JS, no build step.

## Deploy status

MANAGED — new surface via deploy-human.yml (Worker `human`, custom_domain human.mino.mobi). Idempotent D1 migration (0033_human_stats) before deploy; health-check curl after.

## Deploying

Pushes to `claude/human-machinery-Hm7qX2` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-human.yml`](../.github/workflows/deploy-human.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
