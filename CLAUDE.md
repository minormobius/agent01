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
### 6. Read (`read/`) — Deep-read sub-sites for medieval tales + the Pendragon comparative hub

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

## OAuth Strategy — read this before adding auth to any site

There is a **dedicated, shared OAuth worker** at `workers/auth/` deployed to `auth.mino.mobi`. New sites that need Bluesky auth use it. A few existing sites are grandfathered into their own thing — leave them alone unless you're actively refactoring.

### Canonical architecture

```
┌─────────────────────────┐         ┌──────────────────────────────────┐
│  Any static site        │         │  workers/auth/  →  auth.mino.mobi│
│  (bakery, photo, wave,  │         │                                  │
│  wiki, your-new-site)   │         │  • /client-metadata.json         │
│                         │         │  • /oauth/start                  │
│  import { AuthClient }  │ ──────► │  • /oauth/callback               │
│    from packages/       │         │  • /api/me, /api/refresh         │
│         oauth-client/   │         │  • /pds/* (DPoP-bound proxy)     │
│         auth.js         │         │                                  │
│                         │ ◄────── │  D1: mino-auth-db (sessions,     │
│  Bearer <session_id>    │         │       oauth_keypair, states)     │
└─────────────────────────┘         └──────────────────────────────────┘
```

- **`workers/auth/`** — Cloudflare Worker (1.2k LOC TS) that holds the confidential OAuth client: PKCE + DPoP + PAR + `private_key_jwt`. Signing keypair is auto-generated into D1 on first `/client-metadata.json` request — no manual secret config. Sessions are opaque `Bearer` tokens; the worker holds the DPoP-bound PDS refresh token and minted access tokens on the site's behalf and proxies PDS calls through `/pds/*`.
- **`packages/oauth-client/auth.js`** — 9.7 KB browser-side library, no deps, no build. Exports `AuthClient` with `login(handle, {scope})`, `init()`, `getUser()`, `logout()`, and `auth.pds.{createRecord, putRecord, listRecords, deleteRecord, uploadBlob, getBlob}`. PDS calls go through the worker, so the browser never sees a token that talks to a PDS directly.
- **Deploy workflow**: `.github/workflows/deploy-auth.yml` — triggers on `main` or `claude/implement-oauth-bsky-JgUdn` touching `workers/auth/**`. The workflow auto-creates `mino-auth-db` on first run via `wrangler d1 create` (the `TODO_CREATE_DATABASE` placeholder in `workers/auth/wrangler.jsonc` is intentional — `sed`-patched at deploy time, not committed back).

### Per-site permission shaping — yes, this is supported

The worker accepts a `scope` parameter on every OAuth start and stores it per-session:

```js
const auth = new AuthClient();
// Default (identity + generic write):
await auth.login('alice.bsky.social');                       // 'atproto transition:generic'

// Custom: identity-only (no writes):
await auth.login('alice.bsky.social', { scope: 'atproto' });

// Custom: writes scoped to one lexicon + a blob type:
await auth.login('alice.bsky.social', {
  scope: 'atproto repo:com.example.thing blob:image/*',
});
```

Constraint: the worker's `client-metadata.json` declares the **umbrella scope** (currently `atproto transition:generic` — see `workers/auth/src/index.ts:182`). Sites can request narrower scopes within that umbrella. To exceed it — e.g. add a new `blob:` type that's outside `transition:generic` — bump the metadata scope. The ATProto auth server enforces the metadata as the ceiling.

When tightening a site's scope, prefer the narrowest scope that lets the feature work. The reward shows up in the Bluesky consent screen, which lists exactly what the site can do.

### Adding a new site to the shared OAuth worker

Three steps:

1. **Allowlist the origin**. Add `https://your-site.mino.mobi` to `ALLOWED_ORIGINS` in `workers/auth/src/index.ts:21-30`. (The wildcard `*.mino.mobi` check on line 36 catches subdomains, but list the explicit origin so future devs can see who's using the worker.)
2. **Import the client lib**. From your site: `import { AuthClient } from '../../packages/oauth-client/auth.js'`. Do **not** hand-roll an `auth.js` — photo/wave/wiki did, and they each diverge slightly. Use the shared lib.
3. **Pick a scope**. Default is `atproto transition:generic`. If you can get away with less, pass `{ scope }` to `login()`.

That's it. Push to a branch matching `deploy-auth.yml`'s trigger glob to update `ALLOWED_ORIGINS`; push your site's branch to deploy the frontend.

### Grandfathered exceptions (don't extend these to new sites)

| Site | OAuth | Why it's separate | Migration cost |
|------|-------|-------------------|----------------|
| **poll** | Own BFF at `poll/apps/api/src/oauth/` | Shipped before `workers/auth/` existed. The auth worker was *extracted from* poll (see the file headers: "Extracted from poll/apps/api/src/oauth/..."). | **Hard.** Poll *is* the OAuth BFF for itself and its sub-rooms (mmo, draw, paint). Migrating means redesigning session storage and likely deprecating poll's `/api/auth/*` route surface. |
| **airchat** | Own OAuth at `airchat/oauth/` | Cloned poll's modules to vanilla JS when airchat needed to ship; `airchat/oauth/jwt.js` says "Port of poll's apps/api/src/oauth/jwt.ts". | **Medium.** Custom scope (`atproto repo:com.minomobi.airchat.voice blob:audio/*`) is already a scope the auth worker can grant. Migration = (1) bump auth worker's umbrella to cover `blob:audio/*`, (2) use `auth.pds.uploadBlob()` through the proxy, (3) drop `airchat/oauth/`. Worth doing on the next airchat refactor. |
| **mmo, draw, paint** | Call poll's `/api/{draw,mmo}/oauth/start` | These backends live *inside* poll's worker — they're rooms in poll's house, not separate sites. | **Tied to poll.** Migrating them means migrating poll or moving them out of poll's worker first. |

**Mental model**: sites that have their own Worker doing BFF-style OAuth are grandfathered. Sites that are static frontends (or could be static + a thin Worker) should use `workers/auth/`. When in doubt, use the shared worker.

### Migration status of the rest

**Already on the shared worker** (`packages/oauth-client/auth.js`):

| Site | How it uses the lib |
|------|---------------------|
| bakery | imports `AuthClient` directly (`bakery/src/atproto.js`) |
| photo | `photo/src/lib/auth.js` is a thin wrapper around `AuthClient` — exports the function-shaped API (`init`, `login`, `logout`, `authFetch`, etc.) so call sites are unchanged |
| wave | `wave/src/lib/auth.ts` is the same wrapper pattern in TS (`authInit`, `authLogin`, `authLogout`, `authFetch`, `AuthUser`) |
| wiki | `wiki/src/lib/auth.ts` is the same wrapper pattern in TS |

Why a wrapper instead of changing every call site to `new AuthClient()` directly? Diff minimization, stable surface area inside the project, and a single place to swap the implementation if the shared lib's API evolves. New projects should still call `new AuthClient()` directly — the wrapper is a migration aid for projects with existing call sites.

**Still doing it themselves** (have inline OAuth code in HTML/JS rather than a clean `auth.ts` file):

| Site | Where the OAuth bits live | Migration effort |
|------|---------------------------|------------------|
| labglass | `labglass/js/atproto.js` | Trivial once you isolate the OAuth section |
| music | inline in `music/index.html` (~1228 lines, OAuth around line 1228+) | Medium — needs un-mixing from page JS |
| sweat | inline in `sweat/index.html` (OAuth around line 385+) | Medium |
| answers | `answers/assets/answers.js` + `answers/docs.html` | Medium |
| cluster | inline in `cluster/index.html` (OAuth around line 634+) | Medium |
| org | `org/src/pds.ts` (auth + PDS mixed) | Medium |

Bakery is the reference for direct usage: `bakery/src/atproto.js` imports the shared lib. Photo/wave/wiki are references for the wrapper pattern.

### What to never do

- **Never reimplement OAuth in a new site.** Use the shared worker.
- **Never commit the patched `database_id` back to `workers/auth/wrangler.jsonc`.** The `TODO_CREATE_DATABASE` literal is intentional — the deploy workflow handles it.
- **Never widen the umbrella scope in `client-metadata.json` casually.** Every site that uses the worker inherits the ceiling. Add new scopes only when a real feature needs them.

---

## Domain & Infrastructure

- **Domain**: `minomobi.com` (also `mino.mobi` — used in public-facing URLs)
- **Hosting**: Cloudflare Pages + Workers
- **Compute**: Cloudflare Workers + Durable Objects + D1
- **Email**: Cloudflare Email Routing — `tips@`, `editor@`, `modulo@`, `morphyx@minomobi.com`
- **DNS**: Cloudflare — CNAME records for subdomains → Pages deployments
- **ATProto**: PDS as backend for several apps (bakery, phylo, time, music, sweat)

---

## Deployment Model (read this — it's how everything ships)

**Every push to your Claude feature branch ships to production**, provided a `deploy-*.yml` workflow has a trigger glob that matches your branch and your changes touch its `paths:`. The human (`majormobius@gmail.com`) deploys *off Claude feature branches directly*, not just off `main`. There is no staging environment.

What this means for you:

1. **Find your project's workflow first.** Before touching code, locate `.github/workflows/deploy-<project>.yml`. The `on.push.branches` list tells you which branches deploy that project. The `on.push.paths` list tells you what file changes wake it up.
2. **Match your branch name to an existing trigger glob, or add yours.** If you're working on a branch the workflow doesn't recognize, your commits won't ship. Either rename the branch to match (e.g. `claude/sentence-editing-drill-*` for rite), or open a small PR adding your branch to the trigger list.
3. **Prefer the workflow over local `wrangler deploy`.** The workflows hold the canonical build steps, secrets, D1 migration order, and post-deploy hooks. Local `wrangler deploy` skips migrations and post-deploy seeding and will drift.
4. **The user pushes to feature branches deliberately.** If you see them push to `claude/foo-Xy7Pq` directly, that *is* the prod deploy for that surface. Don't "fix" it by merging to main first.
5. **`workflow_dispatch` is your manual trigger.** Every deploy workflow has `workflow_dispatch:` so the human (or you, via the GitHub MCP tools) can fire a deploy out-of-band.

### Per-project deploy workflow map

| Project | Workflow | Triggers on (branches) | Path glob |
|---------|----------|------------------------|-----------|
| Root / landing | none (Cloudflare Pages auto from `main`) | `main` | `/` |
| Poll | `.github/workflows/deploy-poll.yml` | `main`, `claude/bluesky-anonymous-polls-*`, `claude/document-projects-oPse6`, `claude/polygon-drawing-game-*`, `claude/bluesky-thread-analysis-*`, `claude/prepare-merge-candidates-*` | `poll/**` |
| Rite | `.github/workflows/deploy-rite.yml` | `main`, `claude/sentence-editing-drill-*` | `rite/**` + fodder/ask/signal migrations |
| Airchat | `.github/workflows/deploy-airchat.yml` | `main`, `claude/sentence-editing-drill-*` | `airchat/**` + airchat migrations |
| Feed worker | `.github/workflows/deploy-feed.yml` | `main`, `claude/document-projects-oPse6` | `workers/feed/**` + feed migrations |
| Zoom viewer | `.github/workflows/deploy-zoom.yml` | `main`, `claude/bluesky-anonymous-polls-*` | `zoom/**` |
| Photo | `.github/workflows/deploy-photo.yml` | `main`, `claude/atproto-arena-duckdb-*` | `photo/**` |
| Bakery | `.github/workflows/deploy-bakery.yml` | `main`, `claude/implement-oauth-bsky-JgUdn` | `bakery/**` |
| Cards | `.github/workflows/deploy-cards.yml` | `main`, **`claude/*`** (any Claude branch) | `cards/**` |
| Clock | `.github/workflows/deploy-clock.yml` | `main`, **`claude/*`** (any Claude branch) | `clock/**` |
| Read | `.github/workflows/deploy-read.yml` | `main`, `claude/eye-tracking-exploration-*` | `read/**` |
| Auth worker | `.github/workflows/deploy-auth.yml` | `main`, `claude/implement-oauth-bsky-JgUdn` | `workers/auth/**` |
| Bounty | `.github/workflows/deploy-bounty.yml` | `main`, `claude/megaproject-dashboard-*` | `bounty/**` |
| Fred proxy | `.github/workflows/deploy-fred-proxy.yml` | `main`, `claude/mortgage-calculator-rP4lK` | `workers/fred-proxy/**` |
| Bisk | `.github/workflows/deploy-bisk.yml` | `main`, `claude/prepare-merge-candidates-*` | `bisk/**` |
| Borges | `.github/workflows/deploy-borges.yml` | `main`, `claude/pendragon-endless-book-*`, `claude/pendragon-next-source-*` | `borges/**` |

When designing a deploy for a new project, copy the closest existing workflow — they encode the build-order quirks (poll's `shared → web → api`, rite's "migrate before deploy", airchat's similar) and the right secret names.

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

**Deploy**: `.github/workflows/deploy-poll.yml` — see the trigger glob list there for the live set of branches. Currently includes `claude/bluesky-anonymous-polls-*`, `claude/document-projects-oPse6`, `claude/polygon-drawing-game-*`, `claude/bluesky-thread-analysis-*`, `claude/prepare-merge-candidates-*`. Workflow also runs every migration in `poll/apps/api/migrations/` (idempotent) before `wrangler deploy`.

**D1 migrations**: Preferred path is to let `deploy-poll.yml` apply them on push. Manual fallback: `d1-migrate.yml` workflow or `npx wrangler d1 execute atpolls-db --file=... --remote` (requires Cloudflare credentials — does not work from the Claude sandbox; run via Actions or your laptop).

### Secrets (Worker)

`RSA_PRIVATE_KEY_JWK`, `RSA_PUBLIC_KEY_JWK`, `OAUTH_CLIENT_ID`, `OAUTH_SIGNING_PRIVATE_KEY_JWK`, `OAUTH_SIGNING_PUBLIC_KEY_JWK`, `ATPROTO_SERVICE_DID`, `ATPROTO_SERVICE_HANDLE`, `ATPROTO_SERVICE_PASSWORD`, `ATPROTO_SERVICE_PDS`

### Wrangler Config

| Setting | Value |
|---------|-------|
| Compat date | 2024-07-18 |
| Compat flags | nodejs_compat, sqlite |
| D1 | `atpolls-db` (fee2f25a-8b4a-4d46-b245-9d5da93c117d) — shared with feed, rite, airchat |
| D1 (optional) | `mmopaint-db` (6687b33c-c09c-4bb9-b216-0c84067dfb74) — provisioned by `create-mmo-db.yml` |
| DO | `PollCoordinator`, `SurveyCoordinator`, `MmoCanvas` |
| Assets | `../../dist` (Vite-built frontend) |
| Migrations | `0001`–`0023` and growing. Number sequentially; if you collide with another in-flight branch, the *later* merge renumbers (see `070f919`). |

---

## Project 2: SimCluster Feed + Zoom Viewer

Two components: a **feed worker** that generates an algorithmic Bluesky feed, and a **visualization frontend** that renders the community graph.

### Feed Worker (`workers/feed/`)

**Live at**: `feed.mino.mobi`
**Stack**: Cloudflare Worker + D1 + KV
**Cron**: Every 6 hours (recompute communities)
**Deploy**: `.github/workflows/deploy-feed.yml` — pushes to `main` or `claude/document-projects-oPse6` touching `workers/feed/**` (or the feed migrations) deploy automatically.

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
**Deploy**: `.github/workflows/deploy-zoom.yml` — Cloudflare Pages, triggered by pushes to `main` or `claude/bluesky-anonymous-polls-*` touching `zoom/**`.

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

### Auth

**OAuth only** (app-password removed). Confidential-client ATProto OAuth — PKCE + DPoP + PAR + `private_key_jwt`. Ported from poll's `apps/api/src/oauth/` to vanilla JS in `airchat/oauth/`. Keypair auto-generates in `airchat_oauth_keypair` (D1, singleton) on first `/client-metadata.json` request — no manual secret config. PDS calls are made with `Authorization: DPoP <token>` plus a fresh DPoP proof per request. Browser only ever holds an opaque `airchat_sid` httpOnly cookie.

**Minimum-privilege scope**: `atproto repo:com.minomobi.airchat.voice blob:audio/*` — the token can write our voice lexicon + upload audio blobs, nothing else (no `transition:generic`).

App-pw helper dispatches (`pdsAuthCall`, `ensureFreshAccess`) remain so legacy app-pw sessions degrade gracefully (force re-auth on first refresh failure).

### Whitelist

Two layers:
- **`airchat_whitelist` D1 table** — durable; seeded from `airchat/whitelist.txt` (handles, DIDs, `list:` entries) on every deploy.
- **`LIVE_WHITELIST_LISTS` in worker.js** — bluesky lists treated as live source of truth. On every auth check, if the DID isn't in the table, we fetch the list (cached 5 min per worker isolate) and check membership. A hit auto-inserts the DID for O(1) future checks. Adding to the bsky list grants access in ≤5 min without a redeploy; removal does NOT auto-revoke (manual DELETE required).

### Migration history

- `0018_airchat.sql` — whitelist, sessions, voices feed cache.
- `0019_airchat_oauth.sql` — OAuth keypair singleton + ephemeral states + `airchat_sessions` columns (`auth_method`, `dpop_key_jwk`, `oauth_scope`).

### Lexicon

`com.minomobi.airchat.voice` — schema doc at `airchat/lexicons/voice.json`. Fields: `audio` (blob ref), `text` (transcript), `duration` (sec), `createdAt`, optional `reply.{parent,root}`, optional `lang[]`.

The bsky appview ignores non-`app.bsky.*` collections, so these records don't enter the firehose-indexable space. They live on the user's own PDS, paid for by the user; the blob is pinned as long as the record references it. We pay $0 for storage.

### Routes

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/airchat/health` | Health + bindings check |
| GET | `/api/airchat/whitelist/check` | Public: is this DID on the whitelist? Optional session-aware |
| POST | `/api/airchat/auth/start` | App-password sign-in; returns session cookie |
| POST | `/api/airchat/auth/oauth/start` | Start OAuth flow; returns auth URL to redirect to |
| GET | `/api/airchat/auth/oauth/callback` | OAuth callback (auth server redirects here); establishes session + 302s to `/` |
| GET | `/client-metadata.json` | OAuth client metadata + public key (served from D1 keypair) |
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
- `airchat_oauth_keypair (id=1 singleton, private_key_jwk, public_key_jwk, kid, created_at)` — auto-generated on first `/client-metadata.json` request
- `airchat_oauth_states (state PRIMARY KEY, code_verifier, dpop_key_jwk, did, pds_url, auth_server_url, token_endpoint, dpop_nonce, return_to, created_at, expires_at)` — ephemeral, 5-minute TTL

Migrations: `poll/apps/api/migrations/0018_airchat.sql` + `0019_airchat_oauth.sql`.

### Required Secrets

- `OPENAI_API_KEY` — Whisper (`whisper-1` model)
- `ADMIN_KEY` — gates `/api/airchat/admin/*` for whitelist mgmt
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — already in GH Actions

### Cost notes

- Whisper: $0.006/min. At 100 posts/day × 30s avg → ~$0.30/day. Per-request hard cap of 16 MB (Whisper's ceiling is 25 MB).
- Audio storage: $0 to us (lives on poster's PDS).
- Workers/D1: comfortably under free tier.

---

## Project 6: Read (`read/`) — Deep-read sub-sites for medieval tales

**Live at**: `read.mino.mobi/<tale>/` and `read.mino.mobi/pendragon/`
**Stack**: Pure static HTML/JS (vanilla, no build step) + Cloudflare Workers for assets
**Deploy**: `.github/workflows/deploy-read.yml` — pushes to `main` or `claude/eye-tracking-exploration-*` or `claude/arthurian-legend-history-*` touching `read/**` deploy automatically.

A family of deep-reading sub-sites for medieval tales — currently Welsh and Middle English. Four annotated tales (`gawain/`, `culhwch/`, `orfeo/`, `pwyll/`) and a comparative hub (`pendragon/`). The pattern is intentionally rigid: each annotated tale carries the same seven layers and exposes the same shape of data, so the cross-tale layer at Pendragon can read across all of them without coupling.

### The seven-layer apparatus (per tale)

Every annotated tale has its own sub-directory at `read/<slug>/` with these files. New tales follow the same skeleton.

| File | Role | What it contains |
|---|---|---|
| `index.html` | The reader's frame | Topbar nav (one tab per layer: Read, Storybook, Characters, Character web, Story graph, Motifs, Mythograph), `<section>` per view, footer with manuscript provenance + crossref to `/pendragon/` |
| `styles.css` | Shared visual language | Earthy palette, `--gold`, `--gold-soft`, `--ink`, serif body / sans nav. The four annotated tales share styling conventions; minor variations OK. |
| `tale.js` | Layer 1 + 2: source text + translation | `window.<TALE> = { tale: { meta, sources, roadmap, passages: [...] } }`. Each passage has `title`, `segments[]`, each segment has `w` (Welsh / source), `e` (English), optional `n` (footnote). |
| `characters.js` | Layer 3: cast cards + web | `window.<TALE>.characters = { intro, roles: [{id,label,color}], cast: [{id,name,role,blurb,appears:[1..N],rel:[{to,label}]}] }`. The Character web view force-lays this graph; principals get larger nodes. |
| `analysis.js` | Layer 4: Propp story graph | `window.<TALE>.propp = { intro, acts: [{id,label,color}], moves: [{sym,name,act,passage,gloss,realized}], absent: {note, groups, verdict} }`. |
| `motifs.js` | Layer 5: motif index | `window.<TALE>.motifs = { intro, taletypes: [...], classes, classOrder, list: [{code,name,cls,conf,gloss,passages}] }`. `conf` ∈ {high, med, spec} → well-attested / interpretive / speculative. |
| `storybook.js` | Layer 7: paged retelling | `window.<TALE>.book = { meta: {kicker, note}, spreads: [{title, sub?, text, illus}] }`. `illus` is a free-text art brief for the illustration pipeline. |
| `app.js` | The renderer | View-switching, parallel-text renderer, character grid, character web (Fruchterman-Reingold), Propp spine + cards, motif rows, mythograph (force sim with movement spine), storybook (paged spreads with dropcap, prev/next, image plate). Layer 6 (Mythograph) is computed from layers 1–5 in `buildMythograph()`. |
| `img/spread-NN.png` | Storybook artwork | Generated and committed by the illustration workflow (see below). Never hand-committed. |

The `window.<TALE>` global namespace lets each tale's files load independently. `<TALE>` matches the tale slug uppercased: `window.GAWAIN`, `window.CULHWCH`, `window.ORFEO`, `window.PWYLL`.

### The illustration pipeline (data-driven, one registry)

| File | Role |
|---|---|
| `scripts/illustrate/tales.mjs` | The registry. One entry per tale: `{ bookGlobal, storyFile, imgDir, house, pins, triggers }`. `pins` is a dictionary of character/setting descriptions; `triggers` is `[[regex, key], …]` matched against the spread's `illus` brief — every regex match contributes its pin to the final prompt. |
| `scripts/illustrate.mjs` | The runner. CLI: `--tale <slug> --spreads "missing"\|"all"\|"0,5,12" --quality low\|medium\|high --model gpt-image-1\|dall-e-3 --dry --list`. PNG existence is the idempotency sentinel: re-running is a no-op once every spread is on disk. Falls back from gpt-image-1 to dall-e-3 if the org isn't verified. |
| `.github/workflows/illustrate.yml` | Matrix over every registered tale. Auto-fires when any `read/*/storybook.js`, the runner, the registry, or this workflow changes (and on `workflow_dispatch`). Each matrix leg generates only that tale's missing spreads, commits them, self-deploys `read/`. The push step pull-rebases on contention because sibling legs may push concurrently. |

Adding a new tale to the illustration pipeline is one new entry in `tales.mjs` and one new slug in the matrix `tale: [...]` list. No new script, no new workflow.

### The Pendragon comparative hub (`read/pendragon/`)

The cross-tale comparative layer. Pure-data reader over each tale's annotation files plus its own historiography content.

| File | Role |
|---|---|
| `data.js` | Timeline (40 entries), in-world chronology, evolutionary tree edges, wiki entries, fae sections, papers list. |
| `crosswalk.js` | The four-tales-side-by-side data: which Propp functions and Thompson motifs each tale realises. Add a fifth tale by extending the per-row columns here. |
| `app.js` | Renders Method, Timeline, In-world, Constantine III theory, Evolutionary tree (SVG phylogeny), Wiki (search + cat filters), Fae, Papers, plus the home-page crosswalk. |

The Method page (`#method`) is the documentation of this whole apparatus — read it before adding a new tale or refactoring the per-tale layers. It also explains the vision for why each layer is shaped the way it is. **If you change the per-tale apparatus shape, update the Method page to match.**

### Conventions and pitfalls

- **Branch naming.** Read work has historically lived on `claude/arthurian-legend-history-*` (current four tales) or `claude/eye-tracking-exploration-*` (older work). Both branches are wired into `deploy-read.yml`. New branches need their glob added to the workflow's `on.push.branches` list.
- **The drop-cap regex.** `app.js`'s `dropCap` is `/^((?:<[^>]+>)*\s*[“"'(]?\s*)(\S)/` — the `(?:<[^>]+>)*` prefix is **load-bearing**: it skips over leading `<em>` / `<strong>` tags so the drop-cap lands on the first letter, not the `<`. The earlier version (without the tag-skip) silently corrupts any spread whose text begins with markup. Sister tales (`gawain`, `culhwch`, `orfeo`) currently have the older regex; they happen not to trigger the bug because none of their spreads start with `<em>`. Bring them into line if you touch their `app.js`.
- **No PNGs by hand.** Storybook images come from the illustration pipeline. Pushing a `read/<slug>/storybook.js` change with new spreads (or deleting a PNG) causes the workflow to generate the missing image(s). Don't commit hand-drawn or manually downloaded PNGs into `img/` unless you also delete them from the workflow's purview.
- **Edit `tale.js` movement by movement.** Each commit per movement deploys; each push gives you a live URL to proof against. Resist the urge to dump all of a translation in one commit — the proofing loop is part of the quality.
- **Cross-tale references.** When you add a motif to `motifs.js`, check whether it appears in sister tales and add a `cross` note pointing at them (search existing motifs for `cross:` to see the pattern). The motif index is the spine of cross-tale comparison.
- **Mythograph is computed.** Don't add a separate `mythograph.js` data file — the Mythograph view is built from `tale.js` + `characters.js` + `analysis.js` + `motifs.js` in `buildMythograph()` inside `app.js`. If a node type is missing, add it to those source files, not to a new data file.
- **`window.PENDRAGON.crosswalk` is the only data file at `/pendragon/` that needs touching when a tale is added.** Add the tale's motif and Propp coverage rows; the SVG layout falls out of the data.

### Adding a fifth tale — the canonical recipe

1. Pick a tale; find a CC-BY-SA or public-domain reading text in the original. Document the manuscript line.
2. `cp -r read/pwyll/ read/<newslug>/` (Pwyll is the most recent, follows the current conventions). Then strip the data files to skeletons.
3. Translate movement by movement. Each commit deploys; review on the live URL.
4. Write `characters.js`, then `analysis.js`, then `motifs.js`. The Mythograph view picks them up for free.
5. Write `storybook.js` — spreads with `illus` art briefs.
6. Register the new tale in `scripts/illustrate/tales.mjs` (`bookGlobal`, paths, house style, pins, regex triggers). Add the slug to `.github/workflows/illustrate.yml`'s matrix.
7. Add a `<a class="tale-card">` to `read/pendragon/index.html` home, extend `read/pendragon/crosswalk.js` with the new column. The Method page's "How to add a fifth tale" section is the user-facing version of this list — update it too.

### Required secrets

- `OPENAI_API_KEY` — for the illustration pipeline (Workers Action secret).
- `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — for `deploy-read.yml` and the self-deploy step in `illustrate.yml`.

### Cost notes

- Image generation: gpt-image-1 medium quality ≈ $0.04 / spread; a 31-spread tale ≈ $1.25 total, one-time. Re-running with no new spreads costs nothing (the missing-PNG sentinel exits early).
- Hosting: well under Cloudflare free tier.

---

## Project 7: Bisk (`bisk/`) — SimCluster Daily Digest

**Live at**: `bisk.mino.mobi`
**Stack**: Cloudflare Worker (assets binding) + a daily GitHub-Action cron
**Deploy**: `.github/workflows/deploy-bisk.yml` (wrangler deploy on push to `bisk/**`)

A fork of `/time`'s newspaper aesthetic that publishes a **deterministic** daily digest of a Bluesky SimCluster list. No inference, no auth — a read-only public-API pipeline.

- **`scripts/build-bisk-digest.mjs`** — the engine. Reads the list from `bisk/config.json` (`listUri`), uses `packages/atproto/bsky.js` (`getListMembers`, `getProfiles`) + a rich author-feed fetch, hydrates every replied thread, and writes `bisk/data/<date>.json` + `latest.json` + `index.json`. Sections: **Top Chickens** (top-3 by likes, 24h), **Delvers** (deepest thread by true nesting depth, embedded via weft's threadbeast), **Weather** (AFINN sentiment + 8-axis NRC emotion radar + represented×overrepresented distinctive words, over member posts incl. deep-thread replies), **Scenes** (are.na-style image wall).
- **`.github/workflows/bisk-digest.yml`** — cron `0 13 * * *` → build → commit `bisk/data` → **self-deploy via wrangler**. Two gotchas baked in: (1) `schedule:` only fires from the **default branch**, so this must be on `main`; (2) the digest deploys itself because a `GITHUB_TOKEN` push doesn't trigger `deploy-bisk`.
- Editorial voices (Modulo/Morphyx) are a planned phase-2 layer on top of the deterministic base.

---

## Project 8: Borges (`borges/`) — The Book of Sand, an endless book

**Live at**: `borges.mino.mobi`
**Stack**: Pure static HTML/JS (vanilla, no build step) + a thin routing Worker (assets binding)
**Deploy**: `.github/workflows/deploy-borges.yml` — `npx wrangler deploy` on push to `main` or `claude/pendragon-endless-book-*` / `claude/pendragon-next-source-*` touching `borges/**`. Provisions `borges.mino.mobi`. No D1, no AI, no secrets beyond the shared Cloudflare credentials.

An **endless book**, after Borges' *El libro de arena*. The frame: seven maintenance robots aboard the slow barque *Tabard*, each named for one of the seven wandering stars (the classical planets) and bearing its medieval planetary temperament + an alchemical metal + a ship-office that fits. They pass the endless night between galaxies telling tales in a medieval-English oral voice, remixing the old motifs and Propp structures **for laughs** (they have every story cold in their training); and because a machine is a structured thing, each **publishes a full mythograph to the ship's intranet — the Tabard — at a permalink before the telling**.

### How it works — and why it's the read/pendragon apparatus run forward

The book is **generated, not authored**: a seeded, combinatorial engine (`js/prng.js` mulberry32 + xmur3) so every page number `n` yields the same tale on any machine, for ever. That determinism is what makes a permalink (`/t/<n>`) meaningful and the mythograph postable *before* the telling. The page-number space is unbounded → the book is endless; Next/Prev/Random/goto walk it.

Crucially, each generated tale is shaped **limb-for-limb like the annotated tales on `read.mino.mobi`** (`tale.passages`, `characters{roles,cast}`, `propp{acts,moves,absent}`, `motifs{taletypes,classOrder,classes,list}`) so the **same** Propp story-graph, Thompson motif index, character-web, and force-directed **mythograph** renderers (ported from `read/<tale>/app.js`) light it up unchanged. The read/ apparatus is analysis (backward); borges is the same apparatus as a generator (forward). The "for-laughs" subversions — cross-cultural motif transplants, inverted Propp functions, absurd magical agents, order-scrambles — are flagged in the spec, mirroring read/'s `propp.absent` ("what the teller shook loose").

### The seven tellers (`js/tellers.js`)

Luna ☽ (silver, navigator/dream-logs), Mercury ☿ (quicksilver, signals/translator — the great remixer, highest `remix`), Venus ♀ (copper, green-deck gardens), Sol ☉ (gold, fusion-heart), Mars ♂ (iron, forge/hull-welder — terse hammer-strokes), Jupiter ♃ (tin, governor/justice), Saturn ♄ (lead, chronometer/cold-hull — numbers the tales). Each carries voice banks (proem/connect/signature/close) overlaid on a shared house voice, plus affinities steering culture, frame, Propp emphasis and motif classes.

### Key files

| File | Role |
|------|------|
| `index.html` | General Prologue: the voyage, the seven-teller gallery, the Tabard board (entry) |
| `tale.html` | Per-tale reader — 7 tabs: Telling / the Tabard (spec) / Cast / Character web / Story graph / Motifs / Mythograph |
| `js/lexicon.js` | Culture packs (12 cross-cultural wardrobes), Propp function library w/ oral realize-templates + `invert` variants, tale-type frames, Thompson motif atoms, archetype roles |
| `js/generate.js` | The engine: `n` → whole tale (teller, culture±graft, frame, cast, woven prose telling, multi-beat motifs w/ plant→payoff, flagged remixes) |
| `js/frame.js` | The meta-story: the immortalism meditation (the 12-facet "Argument"), the 21 teller-pairs, and `interstitial(n)` — the "aboard the Tabard" card that traces a lunar-month wheel (waxing→full→waning→dark) of crew tension. Deterministic from `n`. |
| `js/render.js` | Reader: ported read/ graph renderers + prose telling + interstitial card + Tabard spec + per-teller theming + endless nav |
| `worker.js` | `/t/<n>` & `/tale` → `tale.html`; else assets. Pretty permalinks; uses **root-absolute** asset paths so `/t/<n>` resolves |

### Pitfalls / conventions

- **Determinism is load-bearing.** Don't introduce `Date.now()` / unseeded `Math.random()` into the *generator* (the nav's "random page" picker is the only allowed unseeded roll, and it just chooses which deterministic page to open). Breaking determinism breaks every permalink.
- **Root-absolute asset paths** in the HTML (`/css/…`, `/js/…`) — the pretty `/t/<n>` URL has a `/t/` base, so relative paths would 404.
- The engine attaches to `globalThis` (not just `window`), so it unit-tests in plain node — see `borges/README.md`.
- Generated tales reuse the read/ data shapes on purpose. If you change a renderer, keep parity with the read/ apparatus the user pointed at.

---

## Geometry pack (`/geometry/` + siblings) — interactive math explainers

Single-file static canvas pages on extremal-geometry results, sharing a scaffold (crumb → mino.mobi, accent colour, sister crossref, tabs, docs). Hub at `/geometry/` (sortable resemblance table + roadmap in `geometry/IDEAS.md`). Members: `erdos`, `guthkatz`, `hadwiger`, `runner`, `kakeya`, `capset`, `szemeredi-trotter`, `heilbronn`, `borsuk`, `viazovska`; plus the adjacent `/elements/` periodic-table mandala. Pure static — deploy with the root Pages site. When adding one: follow `geometry/IDEAS.md` anti-patterns, validate the math in the commit body, add to the root `index.html` PROJECTS array, and re-run `scripts/generate-search-catalog.mjs` + `scripts/generate-og-card.mjs`.

## ask — landing-page semantic search

`functions/search.js` (Pages Function, `POST /search`) answers fuzzy "which site does X" queries by stuffing the **whole** ~90-site catalogue into a Workers AI Llama 3.3 70B prompt (no vector DB — the corpus is ~4k tokens). Catalogue is generated from the PROJECTS array by `scripts/generate-search-catalog.mjs`. Frontend widget is inline in `index.html`. Uses the root project's existing `AI` binding (same as `functions/novelty.js`).

## Tangled remix pipeline (`/<site>/` → forkable repos)

Publishes self-contained sites as forkable ("remixable") repos on [tangled](https://tangled.org) (git-on-ATProto). Proven on erdos; the live knot host is `tangled.org` (not the Cloudflare-fronted `knot1.tangled.sh`), repo path is `<owner>/<repo>`, push over SSH forcing IPv4.

- **`bootstrap-tangled-key.yml`** — generates the deploy keypair on a runner, stores the private half as the `TANGLED_SSH_KEY` secret via `gh` (needs a one-time fine-grained PAT `SECRETS_PAT` with Secrets:write), prints the public half to paste into tangled Settings → Keys.
- **`mirror-tangled.yml`** — *works*: force-pushes a self-contained site to its tangled template repo on every change. Vars `TANGLED_HANDLE` (owner) + `TANGLED_KNOT` (`tangled.org`).
- **`remixify.yml` + `scripts/tangled-ensure-repo.mjs`** — **WIP, do not rely on**: `putRecord`s a `sh.tangled.repo` record then pushes. Incomplete — it copies `repoDid` and skips the knot's real XRPC registration, so repos get conflated. Needs the create XRPC the tangled UI fires (capture via DevTools). Dormant on `main` (push trigger scoped to the feature branch).
- `scripts/publish-to-tangled.sh`, `scripts/setup-tangled-key.sh` — local-machine equivalents of the workflows.

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
- D1 database: `atpolls-db` (fee2f25a-8b4a-4d46-b245-9d5da93c117d), plus `mmopaint-db` for the mmopaint canvas (optional binding, falls back to `DB`)
- Durable Objects: `PollCoordinator`, `SurveyCoordinator`, `MmoCanvas`
- Migrations: `poll/apps/api/migrations/0001_init.sql` through `0023_mmopaint.sql` (and counting). Sequence is the source of truth for application order — never reuse numbers.
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

The full set of workflows lives under `.github/workflows/`. Deploy workflows are also summarized in the **Per-project deploy workflow map** above; this section covers the non-deploy automation (provisioning, syncing, publishing, scoring). When in doubt, **read the workflow file** — these are short, declarative, and the source of truth.

### Deploy workflows (see deploy map above)

`deploy-poll.yml`, `deploy-rite.yml`, `deploy-airchat.yml`, `deploy-feed.yml`, `deploy-zoom.yml`, `deploy-photo.yml`, `deploy-bakery.yml`, `deploy-cards.yml`, `deploy-clock.yml`, `deploy-read.yml`, `deploy-auth.yml`, `deploy-bounty.yml`, `deploy-fred-proxy.yml`, `deploy-bisk.yml`, `deploy-borges.yml`

### Provisioning / one-shots

| Workflow | Purpose |
|----------|---------|
| `create-mmo-db.yml` | Creates the `mmopaint-db` D1 database and binds it to the poll worker. Run once per environment. |
| `create-kv-namespace.yml` | Provisions Cloudflare KV namespaces. |
| `d1-migrate.yml` | Manual D1 migration runner — fallback when `deploy-*.yml` migration step isn't enough. |

### Content + data pipelines (these write to PDS, Bluesky, or commit data back to the repo)

| Workflow | Trigger | Side effect |
|----------|---------|-------------|
| `post-to-bluesky.yml` | Push to `time/posts/**.md` | **Posts to real Bluesky** (3 accounts). Danger zone — see Project 3. |
| `publish-whtwnd.yml` | Push to `time/entries/**` | Writes WhiteWind records to PDS. |
| `publish-answers-categories.yml` | Push tracked paths | Publishes Yahoo Answers ATProto categories. |
| `sync-phylo.yml` | Push tracked paths | Writes phylo records to PDS. |
| `sync-finance.yml` | Push tracked paths | Syncs finance datasets. |
| `sync-pm.yml` | Push tracked paths | Syncs project-management data. |
| `verify-phylo.yml` | Push/manual | Verifies phylo PDS state. |
| `register-feed-generator.yml` | Manual | One-time registration of the SimCluster feed generator on Bluesky. |
| `score-deep-wiki.yml` | Push/manual | Scores Wiki Cards, writes catalog to PDS. |
| `anchor-cosines.yml` | Push/manual | Commits embedding anchors back to the repo. |
| `build-complementarity.yml` | Push/manual | Builds complementarity dataset. |
| `build-cult-basis.yml` | Push to `scripts/build-cult-basis.mjs`, manual | Rebuilds `wars/cult/basis.*` artifacts. |
| `fetch-lexicons.yml` | Push, monthly cron, manual | Downloads NRC / AFINN / Concreteness / SUBTLEX-US; commits JSON to `rite/lexicon/data/`. |
| `fetch-atproto-data.yml` | Manual / scheduled | Pulls ATProto records into the repo. |
| `fetch-flavor-data.yml` | Manual / scheduled | Pulls flavor/recipe data. |
| `fetch-lexicon-json.yml` | Manual / scheduled | Earlier lexicon variant (kept for back-compat). |
| `fetch-yum-wikipedia.yml` | Manual / scheduled | Wikipedia scraping for yum/recipe dataset. |
| `query-otol.yml` | Manual | Queries Open Tree of Life. |
| `mine-fodder.yml` | Cron (every 6h) | Mines Project Gutenberg for rite/fodder candidates. |
| `write-test-recipe.yml` | Manual / test | Recipe-writing smoke test. |
| `bisk-digest.yml` | Cron (daily 13:00 UTC, **default branch only**) + dispatch | Builds the SimCluster digest, commits `bisk/data`, self-deploys bisk.mino.mobi. |
| `mirror-tangled.yml` | Push to `erdos/**` / dispatch | Force-pushes a self-contained site to its forkable tangled repo over SSH. |
| `bootstrap-tangled-key.yml` | Manual | Generates the tangled deploy keypair on a runner; stores private half as `TANGLED_SSH_KEY` (needs one-time `SECRETS_PAT`). |
| `remixify.yml` | Manual / marker push | **WIP** — writes a `sh.tangled.repo` record + pushes; incomplete (skips knot XRPC registration). |

### Key secrets (GitHub Actions environment)

- **Cloudflare**: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID` — used by every `deploy-*.yml`.
- **Bluesky posting**: `BLUESKY_HANDLE`/`_APP_PASSWORD` (main), and `_MODULO_`/`_MORPHYX_` variants.
- **Rite/Airchat extras**: `OPENAI_API_KEY` (Whisper), `RITE_ADMIN_KEY`, `ADMIN_KEY` (airchat).
- **Poll worker secrets** (set via `wrangler secret put`, not Actions env): see Project 1 list — `RSA_*`, `OAUTH_*`, `ATPROTO_SERVICE_*`.

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

## Working in this sandbox (capabilities audit)

You're running in Claude Code's managed remote-execution environment — an ephemeral container with the repo cloned fresh. Container is reclaimed after inactivity; anything worth keeping has to be committed and pushed.

### What works

- **File ops at any size**: `Read`, `Edit`, `Write` all work on large files. Prefer `Edit` for changes to existing files (sends only the diff); `Write` is fine for new files or full rewrites. The "800-line ceiling" warning from earlier CLAUDE.md revisions is no longer accurate — multi-thousand-line merges and edits land cleanly.
- **Git**: clone, branch, merge, commit, push to `origin` — all work. Push has retry-with-exponential-backoff guidance baked into the harness prompt.
- **GitHub via MCP**: `mcp__github__*` tools (scoped to `minormobius/agent01`) let you read PRs, post comments, list commits, create branches, open PRs, run secret scans, etc. **Use these instead of trying to install `gh`** — there is no `gh` CLI.
- **WebFetch / WebSearch**: public-internet reads work. Useful for checking docs, looking up library APIs, reading public Bluesky posts.
- **Subagents**: `Explore` for read-only multi-file search; `Plan` for architecture; `general-purpose` for catch-all. Spawn in parallel when work is independent.
- **Bash**: full local shell, multi-line, background runs, hooks.

### What does NOT work from here

- **No `wrangler deploy` to Cloudflare.** The sandbox can't authenticate to the Cloudflare API. Push to a deploy-triggering branch and let the Action run it.
- **No live Bluesky / PDS writes** (createSession, uploadBlob, createRecord). Same reason — auth secrets live in GH Actions, not here.
- **No remote D1 writes** (`wrangler d1 execute --remote`). Use `d1-migrate.yml` or let `deploy-*.yml` apply migrations.
- **No `gh` CLI / `hub` CLI** — use the GitHub MCP tools.
- **No persistent state between sessions.** Anything not committed is gone.

### Practical pattern

The deploy workflows ARE your network. The shape of a normal feature loop is:

```
1. Edit files locally in the sandbox.
2. Commit + push to a Claude feature branch whose name matches a deploy workflow's trigger glob.
3. The workflow fires, builds, migrates, deploys. The user reviews the live site.
4. (Optional) merge to main.
```

If step 2's branch doesn't match any trigger glob, the deploy won't fire and the change won't ship. Either rename the branch or edit the workflow's `branches:` list (small, low-risk PR).

---

## Principles

1. **Don't break what's working.** Read before changing. Test before pushing.
2. **Minimal changes.** Fix what's broken, nothing more. No drive-by refactors.
3. **Headers matter.** COOP/COEP, HSTS, CSP — get them right or features silently fail.
4. **Build order matters.** Poll monorepo: shared → web → deploy. Always.
5. **Push triggers Actions, and Actions ship to prod.** Know which workflow your push wakes up before you push it. A push to `time/posts/` posts to Bluesky. A push to `poll/` from `claude/bluesky-anonymous-polls-*` deploys the poll worker. A push to `cards/` from *any* `claude/*` branch deploys cards. See the deploy map above.
6. **Deploys belong in GitHub Actions, not in your bash session.** The sandbox can't reach Cloudflare/Bluesky/PDS — that's by design, and the deploy workflows already hold the right secrets, build steps, and migration ordering. If you find yourself wanting to `wrangler deploy` from here, you actually want to push to a branch the workflow recognizes.
7. **Feed, poll, rite, airchat share D1 (`atpolls-db`).** Migrations live in `poll/apps/api/migrations/` and apply to every consumer. Number sequentially; if two branches collide on the same migration number, the later merge renumbers (see commit `070f919` for the pattern).
8. **The user pushes to feature branches deliberately.** When you see commits land on a `claude/foo-*` branch and the site updates, that's the intended deploy path — not a mistake to "fix" by retargeting to `main`.
