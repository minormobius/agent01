# Arena (`arena/`)

Read-only image explorer for ATProto repos. Enter a Bluesky handle, see every image they've posted — rendered as a masonry grid from their raw repo data.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│                                                     │
│  Search bar → handle input                          │
│    │                                                │
│    ├── resolveHandle (public.api.bsky.app)          │
│    │     → DID                                      │
│    ├── resolvePds (plc.directory)                    │
│    │     → PDS endpoint URL                         │
│    │                                                │
│    └── com.atproto.sync.getRepo (unauthenticated)   │
│          │                                          │
│          │  CAR bytes (streaming)                    │
│          ▼                                          │
│      Rust/WASM (116KB)                              │
│      ├── CAR v1 parser                              │
│      ├── DAG-CBOR decoder                           │
│      ├── CID v0/v1 parser                           │
│      └── MST walker                                 │
│          │                                          │
│          │  NDJSON                                   │
│          ▼                                          │
│      DuckDB-Wasm                                    │
│          │                                          │
│          └── SELECT embed.images FROM records       │
│               WHERE collection = 'app.bsky.feed.post│
│               AND embed.$type LIKE '%images%'       │
│          │                                          │
│          ▼                                          │
│      Masonry grid (CSS columns)                     │
│      ├── cdn.bsky.app thumbnails                    │
│      ├── Lightbox with full image via getBlob       │
│      └── Link back to original post                 │
│                                                     │
└─────────────────────────────────────────────────────┘
         │
         │ HTTPS (XRPC, unauthenticated)
         ▼
    User's PDS (bsky.network, self-hosted, etc.)
```

No backend. No auth required. The user's PDS is the data source. Cloudflare serves static files.

## Data Flow

1. **Resolve** — Handle → DID via `com.atproto.identity.resolveHandle` on public API, then DID → PDS URL via `plc.directory` DID document lookup
2. **Download** — Full repo as CAR file via `com.atproto.sync.getRepo` (public, no auth)
3. **Parse** — Rust/WASM parser decodes CAR → DAG-CBOR → NDJSON stream of all records
4. **Ingest** — DuckDB-Wasm loads NDJSON into a `records` table with `did` column for multi-user
5. **Query** — SQL extracts image blob CIDs from `app.bsky.feed.post` records with `embed.images` or `embed.media.images`
6. **Render** — CSS columns masonry grid, lazy-loaded thumbnails from Bluesky CDN, lightbox with PDS `getBlob` for full resolution

## Multi-User

DuckDB holds all synced repos in a single `records` table, partitioned by `did`. Sync multiple handles and the grid merges all their images chronologically. Each user's data replaces cleanly on re-sync (DELETE + INSERT by DID).

## Image Extraction SQL

```sql
SELECT
  did, rkey,
  json_extract_string(value, '$.text') as text,
  json_extract_string(value, '$.createdAt') as created_at,
  COALESCE(
    json_extract(value, '$.embed.images'),
    json_extract(value, '$.embed.media.images')
  ) as images_json
FROM records
WHERE collection = 'app.bsky.feed.post'
  AND (
    json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.images'
    OR json_extract_string(value, '$.embed.$type') = 'app.bsky.embed.recordWithMedia'
  )
ORDER BY created_at DESC
```

Each `images_json` array element contains `{ image: { ref: { $link: "<CID>" } }, alt, aspectRatio }`.

## Image URLs

- **Thumbnails**: `https://cdn.bsky.app/img/feed_thumbnail/plain/{did}/{cid}@jpeg` (Bluesky CDN, fast)
- **Full size**: `{pdsUrl}/xrpc/com.atproto.sync.getBlob?did={did}&cid={cid}` (protocol-native, any PDS)

## Stack

| Layer | Technology |
|-------|-----------|
| Hosting | Cloudflare Pages (static) |
| Framework | React 19 + Vite 6 |
| CAR parsing | Rust → WASM (shared with `os/`) |
| Query engine | DuckDB-Wasm (CDN) |
| Styling | Vanilla CSS (columns masonry) |

## Reused from `os/`

The Rust/WASM parser (`src/wasm/`) is copied from `os/src/wasm/`. Same binary — CAR v1 + DAG-CBOR + CID + MST walking, compiled to 116KB WASM. The DuckDB integration pattern is adapted from `os/` but simplified (no auth, no filesystem metaphor, just image extraction).

## Future

- **Channels** — Custom ATProto lexicon (`com.minomobi.arena.channel`) for curating image collections
- **Blocks** — Save individual images to channels, stored on user's PDS
- **SQL console** — Ad-hoc queries over the synced image data
- **Alt text search** — Full-text search over image descriptions via DuckDB
- **Collection browser** — Explore non-image collections (feeds, likes, lists)
- **Diff view** — Compare two users' posting patterns visually
