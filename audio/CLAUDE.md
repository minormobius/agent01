# audio — audio.mino.mobi (pending attach)

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Audio Rooms — a voice-room app (Vite monorepo web + worker with a RoomCoordinator Durable Object for signaling). Deployed to workers.dev; audio.mino.mobi not yet attached.

## Facts

| | |
|---|---|
| Surface | `audio` |
| Dir | `audio/` |
| Endpoint | `audio.mino.mobi (pending attach)` |
| Type | fullstack |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-audio.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "audio"`.

## How it works

Audio Rooms — voice-room app. Vite monorepo (apps/web -> audio/dist) + Worker `audio-rooms-api` with Durable Object RoomCoordinator. Domain audio.mino.mobi not yet attached; first deploy stands up the worker+DO at workers.dev. Attach domain in dashboard to launch.

## Deploy status

MANAGED (domain pending) — onboarded to Actions (deploy-audio.yml) as an ADDITIVE own-worker deploy. Non-breaking: still served via its current path; attach the custom domain in the Cloudflare dashboard to complete the carve-out, then drop from the root bundle.

## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-audio.yml`](../.github/workflows/deploy-audio.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
