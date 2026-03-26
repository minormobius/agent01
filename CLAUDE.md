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

Details for each follow in dedicated sections below.

---

## Domain & Infrastructure

- **Domain**: `minomobi.com` (also `mino.mobi` — used in public-facing URLs)
- **Hosting**: Cloudflare Pages (auto-deploys from `main`)
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

**Deploy trigger**: Push to `main` (poll/**) or manual via `deploy-poll.yml`.

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

| Site | Dir | Stack | Deploy Target |
|------|-----|-------|---------------|
| **Bakery** | `bakery/` | React + Vite | Pages (bakery.mino.mobi) |
| **ATPolls** | `poll/` | React + Vite + Workers + D1 + DO | Pages + Worker (poll.mino.mobi) |

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

## Principles

1. **Don't break what's working.** Read before changing. Test before pushing.
2. **Minimal changes.** Fix what's broken, nothing more. No drive-by refactors.
3. **Headers matter.** COOP/COEP, HSTS, CSP -- get them right or features silently fail.
4. **Build order matters.** Poll monorepo: shared -> web -> deploy. Always.
5. **Push triggers actions.** Know what workflows fire before you push. A push to `time/posts/` posts to Bluesky. A push to `poll/` deploys the worker.
6. **Sandbox can't reach the internet.** All network operations (API calls, deploys, PDS writes) happen via GitHub Actions, not here.
7. **Feed and poll share D1.** The `atpolls-db` database serves both projects. Migrations live in `poll/apps/api/migrations/` but the feed worker references them too.
