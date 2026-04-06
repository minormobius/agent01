# Edge PDS — ATProto Personal Data Server on Cloudflare

## What This Is

A Personal Data Server running on Cloudflare Workers + D1 + R2 + Durable Objects. Not a port of Cocoon (Go/Docker) — a ground-up implementation using the primitives we already operate.

This is the spiritual successor to `os/`. That project built a PDS *client* — a browser terminal that browses someone else's PDS like a filesystem. This project makes us the PDS *server*. The `os/` shell becomes the admin interface for our own data.

## Why — What Changes

### Today

```
┌──────────────┐     XRPC      ┌─────────────────┐
│ Our sites    │ ──────────→   │ bsky.social PDS  │
│ (time, phylo,│ ←──────────   │ (someone else's  │
│  bakery, poll│  rate-limited  │  infrastructure) │
│  music, etc) │               └─────────────────┘
├──────────────┤     XRPC      ┌─────────────────┐
│ GH Actions   │ ──────────→   │ Same PDS         │
│ (publish,    │  app-password  │ We're tenants    │
│  sync, post) │               └─────────────────┘
├──────────────┤
│ os/ shell    │ ──── browses someone else's PDS
└──────────────┘
```

- 12+ custom lexicons stored as a tenant on external PDS
- Rate-limited reads and writes (retry/backoff baked into every script)
- App passwords as the auth mechanism for automation
- No server-side logic on record changes
- Can't query across collections efficiently
- Blob storage owned by someone else

### With Edge PDS

```
┌──────────────┐     XRPC      ┌──────────────────────────┐
│ Our sites    │ ──────────→   │ pds.minomobi.com         │
│              │ ←──────────   │ (Cloudflare Worker)      │
│              │  no rate limit │                          │
├──────────────┤               │  D1  ── records, blocks  │
│ GH Actions   │ ──────────→   │  R2  ── blobs            │
│              │  service auth  │  DO  ── repo coordinator │
├──────────────┤               │  KV  ── session cache    │
│ os/ shell    │ ──── admin UI │                          │
├──────────────┤               │  Hooks:                  │
│ AT network   │ ←──────────   │  ├─ on record write →    │
│ (relays,     │  federation    │  │  trigger GH Action   │
│  other PDS)  │               │  ├─ on blob upload →     │
└──────────────┘               │  │  store in R2          │
                               │  └─ on sync request →    │
                               │     serve CAR from D1    │
                               └──────────────────────────┘
```

## What New Capabilities Get Unlocked

### 1. OS Shell Becomes Real

`os/` was a read-mostly client for someone else's PDS. With our own PDS:
- `echo '{}' > collection/rkey` writes to *our* D1, not a remote server
- `sync` exports *our* repo as CAR — we generate it, not download it
- `sql` queries run against *our* data with no network hop
- `container` shell can run server-side admin commands (migrations, bulk ops)
- The "No backend. The user's PDS is the backend." line in os/DESIGN.md becomes literally true — but now the PDS *is* our backend

### 2. Server-Side Compute on Record Writes

Poll already does this — Durable Objects react to ballot submissions with post-close hooks (publish to ATProto, post results to Bluesky). An edge PDS generalizes this:

| Write event | Triggered action |
|-------------|-----------------|
| New `com.whtwnd.blog.entry` | Regenerate time/ RSS feed, post to Bluesky |
| New `com.minomobi.phylo.clade` | Invalidate phylo/ cache, update tree index |
| New `exchange.recipe.recipe` | Index in bakery/ search, notify followers |
| New `com.minomobi.poll.def` | Initialize PollCoordinator DO |
| Blob uploaded | Optimize image, store in R2, generate thumbnail |

Today these triggers require GitHub Actions watching for pushes. With server-side hooks, they're instant.

### 3. Cross-Collection Queries

Today: each site queries its own collection via `listRecords` with pagination. No joins, no cross-collection search.

With D1 holding all records:
```sql
-- All records mentioning a specific DID across every collection
SELECT collection, rkey, value
FROM records
WHERE json_extract(value, '$.subject.uri') LIKE 'at://did:plc:abc%';

-- Timeline: all record types ordered by creation
SELECT collection, rkey, created_at
FROM records
ORDER BY created_at DESC
LIMIT 50;

-- Stats dashboard: records per collection per day
SELECT collection, date(created_at) as day, count(*) as n
FROM records
GROUP BY collection, day
ORDER BY day DESC;
```

This is what `os/` already does client-side with DuckDB after a full sync. An edge PDS makes it server-side and instant — no 30-second CAR download first.

### 4. Custom XRPC Endpoints

ATProto's standard XRPC methods (`com.atproto.repo.*`) are generic. Our own PDS can expose domain-specific endpoints:

```
# Standard ATProto (required for federation)
GET  /xrpc/com.atproto.repo.listRecords
GET  /xrpc/com.atproto.repo.getRecord
POST /xrpc/com.atproto.repo.createRecord

# Custom (our extensions)
GET  /xrpc/com.minomobi.time.feed          → RSS-style feed from blog entries
GET  /xrpc/com.minomobi.phylo.subtree      → pre-computed subtree queries
GET  /xrpc/com.minomobi.poll.results        → live poll results (DO state)
GET  /xrpc/com.minomobi.search.records      → full-text search across all collections
POST /xrpc/com.minomobi.batch.sync          → bulk record operations
```

### 5. Eliminate GitHub Actions as Write Path

Today:
```
push to time/entries/ → GitHub Action → Python script → authenticate to external PDS → write records
```

With edge PDS:
```
push to time/entries/ → GitHub Action → POST /xrpc/com.atproto.repo.putRecord → our D1
```

Or even simpler — the `os/` container shell running on our Workers can do it directly. No Python scripts, no external PDS authentication dance.

### 6. Blob Sovereignty

Images, media, attachments currently stored on bsky.social's blob storage. With R2:
- Blobs served from our Cloudflare CDN (fast, no rate limits)
- Full control over retention, optimization, thumbnailing
- `os/` `blob push` command finally has a destination
- WhiteWind entry images, recipe photos, card images — all on our infra

### 7. Federation Without Dependency

Our data participates in the AT network:
- Relays can subscribe to our repo changes via WebSocket
- Other PDS instances can sync from us
- Our DID documents point to `pds.minomobi.com` as the service endpoint
- `.well-known/atproto-did` files stop being placeholders and point to real DIDs on our PDS

If bsky.social goes down, our data is still accessible. Our sites still work.

### 8. Three Accounts, One Server

Main (`@minomobi.com`), Modulo (`@modulo.minomobi.com`), Morphyx (`@morphyx.minomobi.com`) — all on the same PDS. Cross-account operations (like post-to-bluesky with threaded replies from all three) become local function calls instead of three separate remote auth sessions.

## What We Already Have (Reuse Map)

| Component | Source | What it provides |
|-----------|--------|-----------------|
| **OAuth 2.1 + DPoP** | `poll/apps/api/src/oauth/` | Full confidential client: PAR, PKCE, ES256 client_assertion, DPoP proofs |
| **Session management** | `poll/apps/api/src/routes/auth.ts` | D1-backed sessions, cookie auth, token refresh |
| **Durable Objects** | `poll/apps/api/src/durable-objects/` | Serialized write coordination, alarms, state persistence |
| **D1 patterns** | `poll/apps/api/migrations/` | Schema design, indexes, JSON columns, audit chains |
| **ATProto publisher** | `poll/packages/shared/src/atproto/` | `createRecord`, `deleteRecord`, `listRecords`, token refresh |
| **XRPC client** | `os/src/lib/xrpc.js` | Full XRPC: auth, pagination, content negotiation, error handling |
| **CAR parser** | `os/crates/car-parser/` | Rust/WASM: CAR v1, DAG-CBOR, CID, MST — repo export |
| **DuckDB integration** | `os/src/lib/duckdb.js` | SQL over records (client-side analytics) |
| **Identity resolution** | `os/src/auth/oauth.js`, `time/js/atproto.js` | Handle → DID → PDS discovery chain |
| **Blind signatures** | `poll/packages/shared/src/crypto/` | RSA-PSS blind signing (RFC 9474) |
| **OG image gen** | `poll/apps/api/src/og/` | resvg-wasm SVG→PNG rendering |

## What Needs Building

### Must Have (PDS compliance)

| Component | Complexity | Notes |
|-----------|-----------|-------|
| **Record store** (D1) | Medium | Generic `records` + `blocks` tables. Cocoon schema is reference. |
| **Repo coordination** (DO) | Medium | One DO per account. Serializes writes, maintains MST root. Generalize from PollCoordinator. |
| **XRPC router** (Worker) | Low | Route `/xrpc/*` to handlers. Pattern exists in poll API. |
| **MST implementation** | Hard | Merkle Search Tree for repo integrity. `os/` CAR parser reads MSTs — need write path. Port Rust impl or do it in TS. |
| **Blob store** (R2) | Low | Upload → R2, serve via `/xrpc/com.atproto.sync.getBlob`. |
| **Auth provider** | Medium | `createSession`, `refreshSession` for our accounts. Flip side of what poll's OAuth already does. |
| **Repo export** (CAR) | Medium | Generate CAR from D1 records + MST. Inverse of `os/` parser. |
| **DID document serving** | Low | `/.well-known/did.json` with our signing keys and service endpoint. |

### Nice to Have (our extensions)

| Component | Unlocks |
|-----------|---------|
| **WebSocket subscription** | Relay integration, live `os/` shell updates |
| **Write hooks** (DO alarms) | Auto-publish, cross-site triggers |
| **Full-text search index** | `com.minomobi.search.records` endpoint |
| **Record-level caching** (KV) | Hot-path reads without D1 round-trip |
| **Batch operations** | Bulk import existing records from bsky.social |

## Cloudflare Primitives Mapping

```
Cocoon (Go/Docker)          →  Edge PDS (Cloudflare)
─────────────────               ─────────────────────
SQLite database             →  D1 (SQLite at edge)
Go HTTP server              →  Worker (request handler)
Filesystem blob storage     →  R2 (S3-compatible objects)
In-process mutex            →  Durable Object (serialized writes)
Let's Encrypt / Caddy       →  Cloudflare (automatic TLS)
Docker container            →  (not needed — serverless)
In-memory block cache       →  KV (edge-cached reads)
```

## D1 Schema (Reference)

Based on Cocoon's model, adapted for D1:

```sql
-- Accounts
CREATE TABLE repos (
  did           TEXT PRIMARY KEY,
  handle        TEXT UNIQUE NOT NULL,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  signing_key   BLOB NOT NULL,
  rev           TEXT NOT NULL,
  root_cid      BLOB,
  preferences   BLOB,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  deactivated   INTEGER NOT NULL DEFAULT 0
);

-- Records (all collections, all accounts)
CREATE TABLE records (
  did        TEXT NOT NULL,
  collection TEXT NOT NULL,
  rkey       TEXT NOT NULL,
  cid        TEXT NOT NULL,
  value      BLOB NOT NULL,  -- CBOR-encoded
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (did, collection, rkey)
);
CREATE INDEX idx_records_collection ON records(did, collection, created_at DESC);

-- MST blocks
CREATE TABLE blocks (
  did   TEXT NOT NULL,
  cid   BLOB NOT NULL,
  rev   TEXT NOT NULL,
  value BLOB NOT NULL,
  PRIMARY KEY (did, cid)
);
CREATE INDEX idx_blocks_rev ON blocks(did, rev);

-- Blobs (metadata — actual bytes in R2)
CREATE TABLE blobs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  did        TEXT NOT NULL,
  cid        TEXT NOT NULL,
  r2_key     TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  mime_type  TEXT,
  ref_count  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE UNIQUE INDEX idx_blobs_did_cid ON blobs(did, cid);

-- Sessions
CREATE TABLE sessions (
  session_id    TEXT PRIMARY KEY,
  did           TEXT NOT NULL,
  access_token  TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at    TEXT NOT NULL
);
CREATE INDEX idx_sessions_did ON sessions(did);

-- Event log (for subscription/relay)
CREATE TABLE events (
  seq        INTEGER PRIMARY KEY AUTOINCREMENT,
  did        TEXT NOT NULL,
  type       TEXT NOT NULL,  -- 'commit', 'identity', 'account'
  data       BLOB NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_events_did ON events(did);
```

## Architecture

```
                    pds.minomobi.com
                          │
                    ┌─────▼─────┐
                    │  Worker   │
                    │  (router) │
                    └─────┬─────┘
                          │
            ┌─────────────┼─────────────┐
            │             │             │
      ┌─────▼─────┐ ┌────▼────┐ ┌─────▼─────┐
      │ XRPC      │ │ .well-  │ │ WebSocket │
      │ handlers  │ │ known/* │ │ subscribe │
      └─────┬─────┘ └─────────┘ └─────┬─────┘
            │                          │
    ┌───────┼──────────┐               │
    │       │          │               │
┌───▼──┐ ┌─▼──┐ ┌────▼───┐    ┌─────▼──────┐
│  D1  │ │ R2 │ │   DO   │    │  DO        │
│      │ │    │ │  Repo  │    │  Relay     │
│records│ │blobs│ │Coord- │    │  (fan-out  │
│blocks │ │    │ │inator │    │   events)  │
│events │ │    │ │        │    │            │
└──────┘ └────┘ └────────┘    └────────────┘

DO RepoCoordinator (one per DID):
  - Serializes all writes for an account
  - Maintains MST root hash
  - Generates events for subscription
  - Triggers write hooks

DO RelayFanout:
  - Accepts WebSocket connections from relays
  - Streams events from the events table
  - Handles backpressure
```

## Migration Path

### Phase 1: Read-Only Mirror
- Deploy Worker at `pds.minomobi.com`
- Import existing records from bsky.social (use `os/` sync → CAR → parse → D1)
- Serve `listRecords`, `getRecord` from D1
- Sites switch reads to our PDS (faster, no rate limits)
- bsky.social remains authoritative

### Phase 2: Write Path
- Implement `createRecord`, `putRecord`, `deleteRecord`
- RepoCoordinator DO manages MST
- GitHub Actions write to our PDS instead of bsky.social
- `os/` shell writes locally
- Blob uploads go to R2

### Phase 3: Federation
- Implement `com.atproto.sync.getRepo` (CAR export from D1)
- WebSocket subscription for relays
- Update DID documents: service endpoint → `pds.minomobi.com`
- Register with relay network
- Our data is now part of the AT network, served from our infra

### Phase 4: Extensions
- Write hooks (DO alarms on record creation)
- Custom XRPC endpoints
- Full-text search
- Cross-collection analytics
- `os/` becomes the dashboard for all of it

## What This Doesn't Do

- **Not a general-purpose PDS host.** This serves our 3 accounts, not arbitrary signups.
- **Not replacing Bluesky.** We still federate with the network. Posts still appear on bsky.app.
- **Not a fork of Cocoon.** Different language (TS), different runtime (serverless), different storage (D1/R2). Cocoon's schema is reference material, not a dependency.

## Cost Estimate (Cloudflare)

All within free tier for our scale:
- **Workers**: 100K requests/day free → PDS traffic is nowhere near this
- **D1**: 5M reads/day, 100K writes/day free → comfortable
- **R2**: 10GB free, 1M Class B ops free → blobs fit easily
- **Durable Objects**: 1M requests/month free → 3 accounts = minimal
- **KV**: 100K reads/day free → session cache fits

Zero-cost until we're serving federation traffic at scale.
