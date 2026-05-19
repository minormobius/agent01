# minomobi — Production Operations

## Role

This branch is the **devops/production branch** for all minomobi web properties. Its job is site health: deployments work, pages load, workers respond, builds pass, PWAs install, headers are correct, and nothing is broken.

Content creation, research, editorial voice, and feature design happen elsewhere. This branch receives sites, stabilizes them, and keeps them running.

---

## Owned Projects

Three systems are under active production management on this branch:

### 1. ATPolls (`poll/`) — Bluesky Polling
### 2. SimCluster Feed (`workers/feed/`) + Zoom Viewer (`zoom/`) — Bluesky Feed Generator
### 3. Bluesky Post Pipeline (`src/post_thread.py` + `time/posts/`) — Multi-Account Publishing
### 4. Rite (`rite/`) — Sentence Editing Drill + Fodder Crowdsourcing
### 5. Airchat (`airchat/`) — Voice-first social on ATProto

Details for each follow in dedicated sections below.

---

## Shared ATProto Library (`packages/atproto/`)

**Three standalone JS modules** with no dependencies and no build step. Every project in this repo that talks to ATProto or Bluesky should import from here instead of reimplementing.

### How to Use

```js
// From any project (adjust relative path):
import { resolveHandle, resolvePds, PdsClient } from '../../packages/atproto/pds.js';
import { getAuthorFeed, getProfiles, getFollows } from '../../packages/atproto/bsky.js';
import { sealRecord, unsealRecord, deriveKek } from '../../packages/atproto/crypto.js';
```

### Modules

| Module | Purpose | Key Exports |
|--------|---------|-------------|
| **`pds.js`** | Identity resolution + authenticated PDS operations | `resolveHandle`, `resolvePds`, `generateTid`, `PdsClient` (login, getRecord, putRecord, createRecord, listRecords, deleteRecord, uploadBlob, getBlob) |
| **`bsky.js`** | Read-only Bluesky public API wrappers | `getProfiles`, `resolveHandles`, `getAuthorFeed`, `getLikes`, `getFollows`, `getListMembers`, `getPostThreadDepth` |
| **`crypto.js`** | Vault encryption (ECDH + AES-GCM + PBKDF2) | `deriveKek`, `generateIdentityKey`, `wrapPrivateKey`, `unwrapPrivateKey`, `deriveDek`, `encrypt`, `decrypt`, `sealRecord`, `unsealRecord`, `generateTierDek`, `wrapDekForMember`, `unwrapDekFromMember`, `toBase64`, `fromBase64` |

### Migration Path

Existing projects (org, crm, wave, photo, labglass, bakery, time, cards, etc.) each have their own copy of this code. **Do not bulk-rewrite them.** When you're already modifying a project's ATProto layer for other reasons, switch its imports to `packages/atproto/` at that time. New projects should use the shared library from the start.

### What Stays Project-Local

- **Poll's RSA blind signatures** (`poll/packages/shared/src/crypto/`) — domain-specific, not shared
- **Poll's OAuth flow** (`poll/apps/api/src/oauth/`) — unique BFF confidential client
- **Bounty's Ed25519 minting** — separate concern
- **Project-specific PDS collections/constants** — belong in the project

---

## Domain & Infrastructure

- **Domain**: `minomobi.com` (also `mino.mobi` — used in public-facing URLs)
- **Hosting**: Cloudflare Pages (auto-deploys from `main`; `photo.mino.mobi` deploys from `claude/atproto-arena-duckdb-8H9SQ`; cards deploys from `claude/wiki-card-game-oJbLE`; `answers/` deploys from `claude/yahoo-answers-atproto-brainstorm-B6vUR` — **LIVE DEPLOY**, every push ships)
- **Compute**: Cloudflare Workers + Durable Objects + D1
- **Email**: Cloudflare Email Routing — `tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com`
- **DNS**: Cloudflare — CNAME records for subdomains -> Pages deployments
- **ATProto**: PDS as backend for several apps (bakery, phylo, time, music, sweat)

---

## Project 1: ATPolls (`poll/`)

**Live at**: `poll.mino.mobi`
**Stack**: React + Vite SPA -> Cloudflare Worker + Durable Objects + D1
**Monorepo**: npm workspaces (`packages/shared`, `apps/web`, `apps/api`)

### What It Does

Bluesky polling with two modes:

- **Public (`public_like`)**: Vote by liking hidden Bluesky posts. Zero friction, zero auth on our side. Votes are public (likes are ATProto records). Results fetched live from `app.bsky.feed.getLikes`.
- **Anonymous (`anon_credential_v2`)**: RSA blind signatures (RFC 9474). Voter proves identity to get a credential, then submits an unlinkable ballot. Host cannot connect voter to vote.

### Architecture

```
Cloudflare Pages (React SPA) -> Cloudflare Worker (API)
                                      |-- Durable Objects (PollCoordinator, SurveyCoordinator)
                                      |-- D1 database (atpolls-db)
                                      +-- ATProto PDS (public bulletin board)
```

- **PollCoordinator DO**: One per poll. Serializes all writes — eligibility consumption, blind signing, ballot acceptance, tally, audit chain.
- **SurveyCoordinator DO**: Same pattern for multi-question surveys.
- **D1**: 11 migrations (0001-0011). Core tables: `polls`, `eligibility`, `ballots`, `sessions`, `tally_snapshots`, `audit_events`, `surveys`, `survey_*`.
- **Service PDS**: Dedicated Bluesky account publishes poll definitions, anonymized ballots (shuffled), and tallies as ATProto records (`com.minomobi.poll.*`).

### Key Files

| File | Purpose | Lines |
|------|---------|-------|
| `poll/CLAUDE.md` | **Read this first** — full implementation guide | 400 |
| `poll/PROTOCOL.md` | Cryptographic protocol design | 100+ |
| `apps/api/src/index.ts` | Worker entry, routing, CORS, OG injection | 532 |
| `apps/api/src/routes/polls.ts` | Poll CRUD, eligibility, publishing, Bluesky posting | 1219 |
| `apps/api/src/routes/auth.ts` | OAuth + app-password auth flows | 486 |
| `apps/api/src/routes/surveys.ts` | Survey CRUD | 763 |
| `apps/api/src/durable-objects/poll-coordinator.ts` | Per-poll state machine | 400+ |
| `packages/shared/src/crypto/index.ts` | RSA blind signatures, nullifier derivation | 323 |
| `packages/shared/src/types/index.ts` | Domain types | 243 |
| `packages/shared/src/atproto/index.ts` | PDS publisher | 150+ |

### Auth System

Two paths:
- **ATProto OAuth** (primary): PKCE + DPoP + PAR + `private_key_jwt`. Modules in `apps/api/src/oauth/`.
- **App-password** (fallback): `com.atproto.server.createSession` on user's PDS.

### Poll Lifecycle

```
draft -> open -> closed -> finalized
```

- **Draft**: Configure, sync eligible DIDs
- **Open**: Voting active. DO alarm set for `closes_at`.
- **Closed**: Post-close hooks fire (publish ballots/tally, reply to Bluesky post with results)
- **Finalized**: Irreversible. Automatic after post-close hooks.

### Eligibility Modes

`open` | `followers` | `mutuals` | `at_list` | `did_list`

### Build & Deploy

```bash
cd poll && npm install
npm run build          # shared -> web
npm test               # vitest (crypto + api)
npm run typecheck      # all packages
npm run deploy         # wrangler deploy
```

**Build order matters**: shared before web. Always.

**Deploy trigger**: Push to `main`, `claude/document-projects-oPse6`, or `claude/bluesky-anonymous-polls-*` (poll/**) or manual via `deploy-poll.yml`.

**Note**: `claude/document-projects-oPse6` is the current production branch for poll development.

**D1 migrations**: Via `d1-migrate.yml` workflow or `npx wrangler d1 execute`.

### Secrets (Worker)

`RSA_PRIVATE_KEY_JWK`, `RSA_PUBLIC_KEY_JWK`, `OAUTH_CLIENT_ID`, `OAUTH_SIGNING_PRIVATE_KEY_JWK`, `OAUTH_SIGNING_PUBLIC_KEY_JWK`, `ATPROTO_SERVICE_DID`, `ATPROTO_SERVICE_HANDLE`, `ATPROTO_SERVICE_PASSWORD`, `ATPROTO_SERVICE_PDS`

### Wrangler Config

| Setting | Value |
|---------|-------|
| Compat date | 2024-07-18 |
| Compat flags | nodejs_compat, sqlite |
| D1 | `atpolls-db` (fee2f25a-8b4a-4d46-b245-9d5da93c117d) |
| DO | PollCoordinator, SurveyCoordinator |
| Assets | `../../dist` (Vite-built frontend) |

---

## Project 2: SimCluster Feed + Zoom Viewer

Two components: a **feed worker** that generates an algorithmic Bluesky feed, and a **visualization frontend** that renders the community graph.

### Feed Worker (`workers/feed/`)

**Live at**: `feed.mino.mobi`
**Stack**: Cloudflare Worker + D1 + KV
**Cron**: Every 6 hours (recompute communities)

#### What It Does

Custom Bluesky feed generator using community detection on mutual-follow graphs.

1. **Community detection** (cron, every 6h): Fetches seed DIDs from a Bluesky list, builds mutual-follow graph, runs Bron-Kerbosch max clique finding + shell peeling, stores communities in D1.
2. **Feed serving** (HTTP): Discovers candidate posts via Constellation relay engagement signals, scores them, returns ranked feed skeleton.
3. **Visualization API** (HTTP): Serves community graph data for the Zoom viewer.

#### Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.ts` | HTTP routing + cron handler | 790 |
| `src/graph.ts` | Bron-Kerbosch, shell peeling, bridge detection | 205 |
| `src/constellation.ts` | Engagement signals from Constellation relay | 233 |
| `src/scoring.ts` | Post ranking algorithm | 92 |

#### Scoring Formula

```
score = weightedEngagement * breadthMultiplier * bridgeMultiplier * recency
```

- **weightedEngagement**: Core members = 1.0x, shell members = 0.6x per engagement
- **breadthMultiplier**: 2.0x per community hit (cross-cluster resonance)
- **bridgeMultiplier**: 1.5x if engagers include bridge nodes
- **recency**: Exponential decay, 6-hour half-life

#### API Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /.well-known/did.json` | DID document (did:web for feed verification) |
| `GET /xrpc/app.bsky.feed.getFeedSkeleton` | Main feed (paginated, scored) |
| `GET /xrpc/app.bsky.feed.describeFeedGenerator` | Feed metadata |
| `GET /xrpc/com.minomobi.feed.getCommunities` | Full community graph (for Zoom) |
| `GET /xrpc/com.minomobi.feed.getCommunityActivity` | Engagement heatmap (cached 10m) |
| `GET /xrpc/com.minomobi.feed.getPostThreadDepth` | Thread depth (cached 1h) |
| `GET /xrpc/com.minomobi.feed.getAvatars` | Avatar proxy (cached 6h) |
| `GET /health` | Community count |

#### D1 Tables (shared with poll)

- `feed_communities` — (id, label, core_size, total_size)
- `feed_community_members` — (community_id, did, shell, mutual_count)
- `feed_bridges` — (did, community_ids JSON)

#### Wrangler Config

| Setting | Value |
|---------|-------|
| Compat date | 2026-02-20 |
| Compat flags | nodejs_compat |
| D1 | `atpolls-db` (shared with poll) |
| KV | `STATE` (67ce39f7715b47aab1187a5443f74e0e) |
| Custom domain | feed.mino.mobi |
| Cron | `0 */6 * * *` |

#### Environment

- `FEED_URI`: `at://did:plc:oqyev6xmuwgbtpr6jgxh5xg3/app.bsky.feed.generator/simcluster`
- `PUBLISHER_DID`: `did:plc:oqyev6xmuwgbtpr6jgxh5xg3`
- `HOSTNAME`: `feed.mino.mobi`
- `CONSTELLATION_RELAY`: Bluesky Constellation relay URL
- `BLUESKY_SEED_LIST`: AT URI for seed DID list

### Zoom Viewer (`zoom/`)

**Live at**: `zoom.mino.mobi`
**Stack**: Pure HTML/JS + Canvas 2D (no build step)
**Deploy**: Cloudflare Pages (static)

#### What It Does

Interactive canvas visualization of SimCluster communities. Fetches data from `feed.mino.mobi` API.

#### Features

- Radial sector layout sized by membership
- Shell-depth coloring per community
- Hex-packed member avatars (28px, fetched from Bluesky)
- Post engagement dots sized by interaction magnitude
- Bridge arcs connecting cross-community users
- Click-to-expand info panel with member list + thread viewer
- Pan/zoom/touch controls

#### Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 1227 | Main canvas visualization |
| `communities.html` | 1228 | Communities detail page |
| `wrangler.jsonc` | 8 | Cloudflare Pages config (`mino-zoom`, compat 2026-02-20) |

---

## Project 3: Bluesky Post Pipeline

**Trigger**: Push markdown files to `time/posts/*.md`
**Workflow**: `.github/workflows/post-to-bluesky.yml`
**Script**: `src/post_thread.py` (356 lines, Python)

### What It Does

Auto-posts threaded content to Bluesky from markdown files. Supports 3 accounts: main (@minomobi.com), @modulo, @morphyx.

### Post Format

```markdown
---
Thread Title Here
---
Main post content (from main account)
---
Another main post (chains sequentially)
---
@modulo
Modulo's reply (branches from thread root)
---
@morphyx
Morphyx's reply (chains from modulo's)
```

### Constraints

- **300 chars** per post (Bluesky limit)
- **12 posts** max per thread
- **2s delay** between posts (rate limiting)
- Auto-converts `[text](url)` to Bluesky facets
- Auto-detects bare URLs

### Secrets

`BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD` (main, required)
`BLUESKY_MODULO_HANDLE`, `BLUESKY_MODULO_APP_PASSWORD` (optional)
`BLUESKY_MORPHYX_HANDLE`, `BLUESKY_MORPHYX_APP_PASSWORD` (optional)

### Danger Zone

**A push to `time/posts/` triggers real Bluesky posts.** Don't push test markdown there. The workflow fires on any push to `main` that touches `time/posts/**.md`.

---

## Project 4: Rite (`rite/`) — Sentence Editing Drill + Fodder

**Live at**: `rite.mino.mobi`
**Stack**: Cloudflare Worker (assets binding) + D1 + Workers AI
**Deploy**: `.github/workflows/deploy-rite.yml` — runs migrations, then `wrangler deploy`

Single Worker that hosts nine surfaces, all over the same shared `rite/lib/atproto/` pipeline (CAR fetch → WASM parse → thread chains → reading-level scoring):

- **`/`** — sentence editing drill. User is shown a verbose sentence; rewrites it; gets scored on fidelity (BGE embedding cosine vs. reference rewrites), brevity (vs. median reference word count), clarity (Flesch delta), and speed.
- **`/fodder/`** — Tinder-style swipe deck for crowdsourcing new corpus entries. Cron mines Project Gutenberg every 6h, asks Llama 3.1 8B for three rewrites, queues candidates as `pending`. Yes-votes promote a candidate to `approved` once it hits 5 yes & ≥70% ratio.
- **`/redact/`** — Redactle-style game over a Bluesky user's longest prose threads. Pulls their full repo as a CAR, finds prose chains, picks ≈45% of content words to censor, scores guesses.
- **`/ask/`** — semantic search over a profile's prose threads. Embeds each thread once via BGE, stores `(did, thread_id, text, embedding BLOB, x, y)` in D1, renders a 2D PCA map; query box highlights matching threads.
- **`/atlas/`** — multi-view analytics over the same threads (scatter chars × Flesch, Pareto by length, Pareto by difficulty, Flesch histogram). Pure deterministic scoring, no inference.
- **`/lexicon/`** — word-level lenses tagged against open lexicons (NRC Emotion, Brysbaert Concreteness, AFINN, SUBTLEX-US baseline). Frequency, TF-IDF distinctiveness, emotion-color, sentiment-color, concreteness gradient. Lexicons fetched + committed by `.github/workflows/fetch-lexicons.yml` to `rite/lexicon/data/*.json`; page falls back to inline mini-lexicons if the fetched files aren't present.
- **`/list/`** — semantic analysis over a Bluesky list. Resolves a list URL via `app.bsky.graph.getList`, fans out to `/api/ask/check` + `/api/ask/map` per member, aggregates each indexed member's cluster labels into list-level themes (words appearing in cluster labels of ≥ 2 members). Members not yet indexed get a deeplink to ask (`/ask/?handle=…`); an "Index all" button runs the same in-tab pullProfile→analyzeProfile→POST /api/ask/index pipeline sequentially per member.
- **`/web/`** — outbound link knowledge graph. Pulls a writer's CAR, extracts every external link facet (skipping bsky.app / *.bsky.social), builds a co-occurrence graph (two URLs share an edge whenever they appear in the same thread), runs PageRank, lays it out with Fruchterman-Reingold. The query box runs *personalized* PageRank seeded on URLs whose domain or anchor text matches — top-ranked URLs are the writer's strongest connections to that idea. Domain rollup toggle. Pure client-side; multi-CAR union on roadmap.
- **`/signal/`** — semantic map of what a writer *reposts* (their taste, vs `/ask/`'s voice). Pulls the CAR, walks every `app.bsky.feed.repost` record, hydrates each `subject.uri` target via `app.bsky.feed.getPosts` (25 URIs/call), drops self-reposts and image-only targets, BGE-embeds, stores in D1 keyed by `(subscriber_did, target_uri)`, then PCA + k-means + cluster labels in the same shape as `/ask/`. Capped at most-recent 3000 reposts per index round. Server endpoints: `/api/signal/{check,index,query,map,target}`. Schema keyed by subscriber+target so the same target post can sit in many subscribers' indexes — leaves room for cross-user signal analytics later.

### Architecture

```
rite/worker.js (single entry)
  ├── ASSETS binding   → static (index.html, fodder/index.html, corpus.json)
  ├── AI binding       → @cf/baai/bge-base-en-v1.5  (drill grading)
  │                       @cf/meta/llama-3.1-8b-instruct (fodder rewrites)
  └── DB binding (DB)  → atpolls-db (shared with poll + feed)

Cron 0 */6 * * * → mineGutenberg(): proxy through read.mino.mobi/gutenberg-proxy
                   → harvest verbose sentences → Llama → D1 'pending'
```

### Routes

| Route | Purpose |
|-------|---------|
| `GET /api/sentence` | Drill: random verbose sentence (or `?id=v007` for a specific one) |
| `POST /api/grade` | Drill: score user's edit |
| `GET /api/fodder/next` | Fodder: next batch of unvoted-by-this-voter pending candidates |
| `POST /api/fodder/vote` | Fodder: record `yes` / `no` / `skip` swipe |
| `GET /api/fodder/promoted` | Approved candidates in corpus.json shape (used by sync script) |
| `GET /api/fodder/stats` | Counts: pending / approved / rejected / total votes / total voters |
| `POST /api/fodder/admin/mine` | Manual mining trigger; requires `X-Admin-Key` matching `ADMIN_KEY` secret |

### Key Files

| File | Purpose |
|------|---------|
| `rite/worker.js` | All routes + cron handler (~620 lines, single file) |
| `rite/index.html` | Drill UI |
| `rite/fodder/index.html` | Swipe deck UI (vanilla JS, pointer events, no build) |
| `rite/corpus.json` | 45 hand-curated sentences with multiple references each |
| `rite/wrangler.jsonc` | Worker + ASSETS + AI + D1 + cron (0 */6 * * *) |
| `poll/apps/api/migrations/0014_fodder.sql` | D1 schema for `fodder_candidates`, `fodder_votes`, `fodder_state` |
| `scripts/sync-fodder-to-rite.mjs` | Pulls approved fodder back into `rite/corpus.json` (idempotent) |

### Deploy workflow (`deploy-rite.yml`)

Triggers on push to `main` or `claude/sentence-editing-drill-*` that touches `rite/**`. Steps:

1. Apply `poll/apps/api/migrations/0014_fodder.sql` to `atpolls-db` (idempotent — failure is treated as already-applied and continues).
2. `npx wrangler deploy` from `rite/` — uploads worker + assets, provisions `rite.mino.mobi`.
3. Best-effort POST to `/api/fodder/admin/mine` to seed the first batch (skipped silently if `RITE_ADMIN_KEY` secret isn't set).

Required secrets:
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already set, shared with poll/feed deploys.
- `RITE_ADMIN_KEY` (optional) — must match the worker's `ADMIN_KEY` to enable post-deploy seed.

### Crowdsource → drill sync

```bash
node scripts/sync-fodder-to-rite.mjs --dry      # preview new approvals
node scripts/sync-fodder-to-rite.mjs            # append to rite/corpus.json
git add rite/corpus.json && git commit && git push
```

Idempotent: candidate IDs (`f-2833-abc1234`) live in a different namespace from hand-curated rite IDs (`v001`).

### Cost on $5 Workers Paid

- Drill grading: ~1 neuron per submission (BGE batched).
- Fodder mining: ~11 neurons × 5 candidates × 4 cron runs/day = ~220 neurons/day.
- Voting: zero AI calls (pure D1).

10,000 free neurons/day comfortably covers everything.

---

## Project 5: Airchat (`airchat/`) — Voice-First Social

**Live at**: `airchat.mino.mobi`
**Stack**: Cloudflare Worker + D1 + OpenAI Whisper
**Deploy**: `.github/workflows/deploy-airchat.yml`

### What It Does

Voice posts on ATProto. Browser records audio (MediaRecorder API), worker proxies the audio through OpenAI Whisper for transcription, and the worker uploads the audio as a blob to the user's PDS + writes a `com.minomobi.airchat.voice` record referencing the blob. Reads are public (D1 cache of every whitelisted user's records, audio served via the author's PDS `com.atproto.sync.getBlob`). Writes are gated to a small whitelist.

### Architecture

```
Browser (MediaRecorder)  ─►  Cloudflare Worker (BFF)
                                       ├── OpenAI Whisper (transcribe)
                                       ├── user's PDS (uploadBlob + createRecord)
                                       └── D1 (sessions + whitelist + feed cache)
```

### Auth (v1)

App-password against the user's PDS via `com.atproto.server.createSession`. Worker stores the PDS access + refresh JWTs server-side in `airchat_sessions`; browser only holds an opaque `airchat_sid` httpOnly cookie (the BFF pattern). No PDS token ever reaches the browser. OAuth port (DPoP + PAR + private_key_jwt, mirroring poll's flow) is a follow-up.

### Lexicon

`com.minomobi.airchat.voice` — schema doc at `airchat/lexicons/voice.json`. Fields: `audio` (blob ref), `text` (transcript), `duration` (sec), `createdAt`, optional `reply.{parent,root}`, optional `lang[]`.

The bsky appview ignores non-`app.bsky.*` collections, so these records don't enter the firehose-indexable space. They live on the user's own PDS, paid for by the user; the blob is pinned as long as the record references it. We pay $0 for storage.

### Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/airchat/health` | Health + bindings check |
| GET | `/api/airchat/whitelist/check` | Public: is this DID on the whitelist? Optional session-aware |
| POST | `/api/airchat/auth/start` | App-password sign-in; returns session cookie |
| GET | `/api/airchat/auth/me` | Current session info |
| POST | `/api/airchat/auth/logout` | Drop session |
| POST | `/api/airchat/transcribe` | Audio body → Whisper → transcript |
| POST | `/api/airchat/post` | Multipart (audio + meta) → uploadBlob + createRecord + cache |
| GET | `/api/airchat/feed` | Public: feed of all whitelisted users' voices (paginated) |
| GET | `/api/airchat/voice` | Public: single voice record by URI |
| POST | `/api/airchat/admin/whitelist/{add,remove}` | Admin (X-Admin-Key) |
| GET | `/api/airchat/admin/whitelist/list` | Admin |

### D1 Tables (on shared `atpolls-db`)

- `airchat_whitelist (did PRIMARY KEY, handle, added_at, added_by, note)`
- `airchat_sessions (session_id PRIMARY KEY, did, handle, pds_url, access_jwt, refresh_jwt, access_expires_at, created_at, last_seen_at)`
- `airchat_voices (uri PRIMARY KEY, did, rkey, cid, pds_url, audio_cid, audio_mime, audio_size, duration_sec, text, reply_root_uri, reply_parent_uri, created_at, indexed_at)`

Migration: `poll/apps/api/migrations/0018_airchat.sql`.

### Required Secrets

- `OPENAI_API_KEY` — Whisper (`whisper-1` model)
- `ADMIN_KEY` — gates `/api/airchat/admin/*` for whitelist mgmt
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already in GH Actions

### Cost notes

- Whisper: $0.006/min. At 100 posts/day × 30s avg → ~$0.30/day. Per-request hard cap of 16 MB (Whisper's ceiling is 25 MB).
- Audio storage: $0 to us (lives on poster's PDS).
- Workers/D1: comfortably under free tier.

---

## Other Workers (Reference)

Not actively managed but documented for context:

| Worker | Dir | Purpose | Cron |
|--------|-----|---------|------|
| bsky-bot | `workers/bsky-bot/` | Notification listener (mention handler stub) | `*/5 * * * *` |
| cluster-batch | `workers/cluster-batch/` | Follow graph bulk fetcher for cluster viz | HTTP only |
| cards-mint | `workers/cards-mint/` | Ed25519 card signing for Wiki Cards game | HTTP only |

---

## Site Inventory (Full)

### Tier 1 — Build Step Required

These have `npm install` + build pipelines. Breakage here blocks deployment.

| Site | Dir | Stack | Build | Deploy Target |
|------|-----|-------|-------|---------------|
| **Bakery** | `bakery/` | React + Vite | `npm run build` → `dist/` | Pages (bakery.mino.mobi) |
| **ATPhoto** | `photo/` | React 19 + Vite 6 + DuckDB-WASM + Rust/WASM | `npm run build` → `dist/` | Pages (photo.mino.mobi) — deploys from `claude/atproto-arena-duckdb-8H9SQ` |
| **ATPolls** | `poll/` | React + Vite + Workers + D1 + DO | Monorepo: shared → web → api | Pages + Worker (poll.mino.mobi) |
| **Rite** | `rite/` | Worker + ASSETS + D1 + AI (no build, vanilla JS) | `wrangler deploy` (via `deploy-rite.yml`) | Worker (rite.mino.mobi) — drill at `/`, fodder at `/fodder/`, redact at `/redact/`, ask at `/ask/`, atlas at `/atlas/`, lexicon at `/lexicon/`. Shares `atpolls-db`. All five browser surfaces share `rite/lib/atproto/` (CAR + threads + reading level). |

**Poll specifics**:
- Workspace monorepo: `packages/shared`, `apps/web`, `apps/api`
- D1 database: `atpolls-db` (fee2f25a-8b4a-4d46-b245-9d5da93c117d)
- Durable Object: `PollCoordinator` (per-poll state machine)
- Migrations: `poll/apps/api/migrations/0001_init.sql` through `0004`
- Build order: `build:shared` → `build:web` → deploy worker
- Has its own `poll/CLAUDE.md` for implementation details

### Tier 2 — Static Sites with Wrangler Config

| Site | Dir | Notes |
|------|-----|-------|
| **Root** | `/` | Landing page, `wrangler.jsonc` at root |
| **Zoom** | `zoom/` | SimCluster visualizer (zoom.mino.mobi) |
| **Mino Times** | `time/` | PDS-backed article viewer, podcast RSS |
| **Phylo** | `phylo/` | Tree viewer, PDS-backed clade data |
| **LABGLASS** | `labglass/` | DuckDB + Pyodide, needs COOP/COEP headers |
| **Music** | `music/` | PWA, ATProto lexicons |
| **Sweat** | `sweat/` | PWA, ATProto lexicons |
| **Noise** | `noise/` | Visualization PWA |
| **Flows** | `flows/` | Network flow viz |
| **Read** | `read/` | RSVP reader, has worker.js |
| **Cards** | `cards/` | Deep Wikipedia card game |

### Tier 3 — Pure Static (No Config)

| Site | Dir |
|------|-----|
| **Cluster** | `cluster/` |
| **Density** | `density/` |
| **Echo** | `echo/` |
| **Judge** | `judge/` |
| **Novelty** | `novelty/` |
| **Seek** | `seek/` |
| **Ternary** | `ternary/` |

### Infrastructure-Only

| Dir | Purpose |
|-----|---------|
| `modulo/` | `.well-known/atproto-did` for @modulo.minomobi.com |
| `morphyx/` | `.well-known/atproto-did` for @morphyx.minomobi.com |
| `.well-known/` | Root domain ATProto DID |
| `functions/` | Serverless functions (cluster-batch, novelty, profile, seek-profiles, ternary, gutenberg-proxy) |

---

## GitHub Actions

| Workflow | Trigger | Deploys To |
|----------|---------|------------|
| `deploy-poll.yml` | Push to `main` (poll/**) or manual | Cloudflare Worker + Pages |
| `deploy-rite.yml` | Push to `main` or `claude/sentence-editing-drill-*` (rite/**) or manual | D1 migration + Cloudflare Worker (rite.mino.mobi) |
| `deploy-airchat.yml` | Push to `main` or `claude/sentence-editing-drill-*` (airchat/**) or manual | D1 migration + Cloudflare Worker (airchat.mino.mobi) |
| `fetch-lexicons.yml` | Push to scripts/fetch-lexicons.mjs, monthly cron, or manual | Downloads NRC / AFINN / Concreteness / SUBTLEX-US, commits JSON to `rite/lexicon/data/` |
| `post-to-bluesky.yml` | Push to `time/posts/` | Bluesky (3 accounts) |
| `publish-whtwnd.yml` | Push to `time/entries/` | PDS (WhiteWind records) |
| `sync-phylo.yml` | Push to tracked paths | PDS (phylo records) |
| `d1-migrate.yml` | Manual | D1 database |
| `anchor-cosines.yml` | Push/manual | Commits embeddings to repo |
| `score-deep-wiki.yml` | Push/manual | PDS (card catalog) |

**Key secrets** (GitHub Actions environment):
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
- `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`
- `BLUESKY_MODULO_HANDLE`, `BLUESKY_MODULO_APP_PASSWORD`
- `BLUESKY_MORPHYX_HANDLE`, `BLUESKY_MORPHYX_APP_PASSWORD`

---

## Build Commands

```bash
# Root (builds bakery)
npm run build

# Poll monorepo
cd poll && npm install && npm run build    # shared -> web
cd poll && npm run deploy                  # wrangler deploy
cd poll && npm run test                    # shared + api tests
cd poll && npm run typecheck               # all packages

# Bakery standalone
cd bakery && npm install && npm run build

# D1 migrations (poll)
npx wrangler d1 execute atpolls-db --file=poll/apps/api/migrations/0001_init.sql --remote
```

---

## Wrangler Compatibility Dates

| Project | Compat Date | Flags |
|---------|-------------|-------|
| Root | 2026-02-20 | -- |
| Bakery | 2026-02-20 | -- |
| Poll (Pages) | 2026-02-20 | -- |
| Poll (API) | 2024-07-18 | nodejs_compat, sqlite |
| Feed | 2026-02-20 | nodejs_compat |
| Zoom | 2026-02-20 | -- |
| Labglass | 2026-02-25 | -- |
| Read | 2026-03-14 | -- |
| bsky-bot | 2026-02-20 | nodejs_compat |
| cluster-batch | 2024-12-01 | -- |

---

## Common Failure Modes

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Poll deploy fails | Build order wrong | Must build shared before web |
| Feed returns empty | Constellation relay down | Falls back to member feeds automatically |
| Feed communities stale | Cron failed | Check worker logs, rerun manually via `/health` |
| Zoom blank canvas | feed.mino.mobi unreachable | Check feed worker health, CORS |
| labglass blank page | Missing COOP/COEP headers | Check `labglass/_headers` |
| PWA won't install | Bad manifest.json or sw.js | Validate manifest, check service worker registration |
| ATProto auth fails | Expired app password | Regenerate in Bluesky settings |
| Worker 500s | Compatibility date drift | Update wrangler compat date |
| D1 schema mismatch | Missing migration | Run `d1-migrate.yml` workflow |
| Bluesky post fails | >300 chars or >12 posts | Check thread format constraints |
| DID resolution fails | Missing `.well-known/atproto-did` | Verify file exists and contains correct DID |
| Post pipeline fires unexpectedly | Pushed .md to time/posts/ | Workflow triggers on any push to that path |

---

## Sandbox Constraints

- **Large file writes fail.** The Write tool chokes on files over ~800 lines in this sandbox. Use `bash cat >> file` in chunks, or build incrementally with Edit.
- **Prefer small incremental steps.** Write a skeleton first, then add features one at a time. Don't try to write an entire app in one tool call.
- **Test early.** Commit working increments rather than trying to land a complete feature in one shot.

---

## Principles

1. **Don't break what's working.** Read before changing. Test before pushing.
2. **Minimal changes.** Fix what's broken, nothing more. No drive-by refactors.
3. **Headers matter.** COOP/COEP, HSTS, CSP -- get them right or features silently fail.
4. **Build order matters.** Poll monorepo: shared -> web -> deploy. Always.
5. **Push triggers actions.** Know what workflows fire before you push. A push to `time/posts/` posts to Bluesky. A push to `poll/` deploys the worker.
6. **Sandbox can't reach the internet.** All network operations (API calls, deploys, PDS writes) happen via GitHub Actions, not here.
7. **Feed and poll share D1.** The `atpolls-db` database serves both projects. Migrations live in `poll/apps/api/migrations/` but the feed worker references them too.
