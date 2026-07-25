# feed — feed.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

SimCluster — a Bluesky feed generator. Every 6h it fetches seed DIDs from a list, builds the mutual-follow graph, finds communities (Bron-Kerbosch cliques + shell peeling), then serves a ranked feed skeleton scored by cross-community engagement from the Constellation relay. Also the data API behind zoom.

## Facts

| | |
|---|---|
| Surface | `feed` |
| Dir | `workers/feed/` |
| Endpoint | `feed.mino.mobi` |
| Type | backend |
| Owning branch | `claude/landing-projects-takeover-pKkmW` |
| Deploy | `.github/workflows/deploy-feed.yml` |
| Uses | `atpolls-db` |
| Provides | `feed.mino.mobi` |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "feed"`.

## SimCluster feed + Zoom viewer

Two components: a **feed worker** that generates an algorithmic Bluesky feed, and a **visualization frontend** that renders the community graph.

## Feed Worker (`workers/feed/`)

**Live at**: `feed.mino.mobi`
**Stack**: Cloudflare Worker + D1 + KV
**Cron**: Every 6 hours (recompute communities)
**Deploy**: `.github/workflows/deploy-feed.yml` — pushes to `main` or `claude/document-projects-oPse6` touching `workers/feed/**` (or the feed migrations) deploy automatically.

### What It Does

Custom Bluesky feed generator using community detection on mutual-follow graphs.

1. **Community detection** (cron, every 6h): Fetches seed DIDs from a Bluesky list, builds mutual-follow graph, runs Bron-Kerbosch max clique finding + shell peeling, stores communities in D1.
2. **Feed serving** (HTTP): Discovers candidate posts via Constellation relay engagement signals, scores them, returns ranked feed skeleton.
3. **Visualization API** (HTTP): Serves community graph data for the Zoom viewer.

### Source Files

| File | Purpose | Lines |
|------|---------|-------|
| `src/index.ts` | HTTP routing + cron handler | 790 |
| `src/graph.ts` | Bron-Kerbosch, shell peeling, bridge detection | 205 |
| `src/constellation.ts` | Engagement signals from Constellation relay | 233 |
| `src/scoring.ts` | Post ranking algorithm | 92 |

### Scoring Formula

```
score = weightedEngagement * breadthMultiplier * bridgeMultiplier * recency
```

- **weightedEngagement**: Core members = 1.0x, shell members = 0.6x per engagement
- **breadthMultiplier**: 2.0x per community hit (cross-cluster resonance)
- **bridgeMultiplier**: 1.5x if engagers include bridge nodes
- **recency**: Exponential decay, 6-hour half-life

### API Endpoints

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

### D1 Tables (shared with poll)

- `feed_communities` — (id, label, core_size, total_size)
- `feed_community_members` — (community_id, did, shell, mutual_count)
- `feed_bridges` — (did, community_ids JSON)

### Wrangler Config

| Setting | Value |
|---------|-------|
| Compat date | 2026-02-20 |
| Compat flags | nodejs_compat |
| D1 | `atpolls-db` (shared with poll) |
| KV | `STATE` (67ce39f7715b47aab1187a5443f74e0e) |
| Custom domain | feed.mino.mobi |
| Cron | `0 */6 * * *` |

### Environment

- `FEED_URI`: `at://did:plc:oqyev6xmuwgbtpr6jgxh5xg3/app.bsky.feed.generator/simcluster`
- `PUBLISHER_DID`: `did:plc:oqyev6xmuwgbtpr6jgxh5xg3`
- `HOSTNAME`: `feed.mino.mobi`
- `CONSTELLATION_RELAY`: Bluesky Constellation relay URL
- `BLUESKY_SEED_LIST`: AT URI for seed DID list

## Zoom Viewer (`zoom/`)

**Live at**: `zoom.mino.mobi`
**Stack**: Pure HTML/JS + Canvas 2D (no build step)
**Deploy**: `.github/workflows/deploy-zoom.yml` — Cloudflare Pages, triggered by pushes to `main` or `claude/bluesky-anonymous-polls-*` touching `zoom/**`.

### What It Does

Interactive canvas visualization of SimCluster communities. Fetches data from `feed.mino.mobi` API.

### Features

- Radial sector layout sized by membership
- Shell-depth coloring per community
- Hex-packed member avatars (28px, fetched from Bluesky)
- Post engagement dots sized by interaction magnitude
- Bridge arcs connecting cross-community users
- Click-to-expand info panel with member list + thread viewer
- Pan/zoom/touch controls

### Files

| File | Lines | Purpose |
|------|-------|---------|
| `index.html` | 1227 | Main canvas visualization |
| `communities.html` | 1228 | Communities detail page |
| `wrangler.jsonc` | 8 | Cloudflare Pages config (`mino-zoom`, compat 2026-02-20) |

---


## Deploying

Pushes to `claude/landing-projects-takeover-pKkmW` or `main` that touch this surface's paths trigger [`.github/workflows/deploy-feed.yml`](../../.github/workflows/deploy-feed.yml).
The sandbox cannot reach Cloudflare — **push to a trigger branch, don't `wrangler deploy` locally**.
Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md) first, especially the golden rule:
the `wrangler.jsonc` `name` must be the worker that owns the live custom domain,
or the deploy goes green while the site never changes.
