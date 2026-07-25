# pod — pod.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../CLAUDE.md; the index of all surfaces is ../docs/SURFACES.md. -->

Podcast studio on ATProto: record in a WebRTC lobby (/room), edit multitrack clips and publish (/prod), listen per-show (/listen) or in a general RSS client (/app). Episodes, tracks and subscriptions are records + blobs on the author’s own PDS — no database; the worker only builds RSS feeds and stitches chunked audio blobs into streamable enclosures.

## Facts

| | |
|---|---|
| Surface | `pod` |
| Dir | `pod/` |
| Endpoint | `pod.mino.mobi` |
| Type | fullstack |
| Owning branch | `claude/podcast-studio-architecture-711cke` |
| Deploy | `.github/workflows/deploy-pod.yml` |
| Uses | — |
| Provides | — |

Machine-readable entry: [`deploy-registry.json`](../deploy-registry.json) → `surfaces[]` where `surface == "pod"`.

## How it works

Podcast studio. No central index, no editorial surface — the worker only constructs RSS and serves blobs. /room (WebRTC recording lobby) + /prod (multitrack clip editor → publish) + /listen?handle= (per-show viewer) + /app (general RSS podcast client). Per-publisher feeds at /u/<handle>/feed.xml are built live from each author's PDS; /enclosure stitches an episode's chunked blobs into one streamable URL. Everything (tracks/episodes/subscriptions) is a record+blobs on the author's own PDS — no D1. RoomCoordinator DO does signaling only.

## Deploy status

MANAGED — live (AUDIT 2026-07-16: pod.mino.mobi probe-verified 200; the domain has been attached since the 'pending attach' note was written).

## Deploying

Pushes to `claude/podcast-studio-architecture-711cke` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-pod.yml`](../.github/workflows/deploy-pod.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
