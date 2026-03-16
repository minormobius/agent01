# PDS Shell (`os/`)

Browser-based terminal for your ATProto Personal Data Server. Login with handle + app password, navigate your repo like a filesystem.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Browser                                            │
│                                                     │
│  xterm.js terminal                                  │
│    ├── ls, cd, cat, rm, find, du   ← XRPC per-call │
│    ├── blob, curl, echo, edit      ← XRPC per-call │
│    │                                                │
│    └── sync                        ← one-shot CAR   │
│          │                                          │
│          │  com.atproto.sync.getRepo                │
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
│          └── sql SELECT * FROM records WHERE ...    │
│                                                     │
└─────────────────────────────────────────────────────┘
          │
          │ HTTPS (XRPC)
          ▼
     User's PDS (bsky.social, self-hosted, etc.)
```

No backend. The user's PDS is the backend. Cloudflare serves static files.

## Commands

| Command | Description |
|---------|-------------|
| `ls [path]` | List collections or records |
| `cd <collection>` | Navigate into a collection |
| `cat <rkey>` | Display a record as JSON |
| `echo '{}' > path` | Create or update a record |
| `edit <rkey>` | Edit a record interactively |
| `rm <rkey>` | Delete a record |
| `find` | Walk all collections, show counts |
| `find -text "term"` | Search records by text |
| `du` | Repo disk usage summary |
| `whoami` | Session info |
| `blob ls/get/push` | Blob management |
| `curl <nsid>` | Raw XRPC calls |
| `sync` | Download full repo → CAR → DuckDB |
| `sync --stats` | Quick stats without full ingest |
| `sql <query>` | SQL over synced records |
| `history` | Command history |

## CAR Parser (`crates/car-parser/`)

Rust → WASM. Parses the binary CAR file from `getRepo` and extracts every record as NDJSON.

Implements from scratch (no ATProto library dependencies):
- **CAR v1**: varint-delimited blocks with CID keys
- **DAG-CBOR**: full CBOR decoder with tag-42 CID links
- **CID**: v0 and v1, multicodec + multihash
- **MST**: ATProto's Merkle Search Tree with prefix-compressed keys

### Build

```bash
cd os/crates/car-parser
rustup target add wasm32-unknown-unknown
cargo build --target wasm32-unknown-unknown --release
wasm-bindgen target/wasm32-unknown-unknown/release/pds_car_parser.wasm \
  --out-dir ../../src/wasm --target web --omit-default-module-path
```

### WASM API

```js
import init, { parseCarToNdjson, carStats } from './wasm/pds_car_parser.js';

await init(wasmUrl);

// Full parse → NDJSON string (one JSON line per record)
const ndjson = parseCarToNdjson(carBytes, did);

// Quick stats → JSON with collection counts
const stats = carStats(carBytes);
```

Each NDJSON line:
```json
{"collection":"app.bsky.feed.post","rkey":"3abc...","uri":"at://did:plc:.../app.bsky.feed.post/3abc...","cid":"fa3b...","size_bytes":412,"value":{...}}
```

## DuckDB Integration

After `sync`, the `records` table is available for SQL:

```sql
-- Count by collection
SELECT collection, count(*) as n FROM records GROUP BY collection ORDER BY n DESC

-- Search post text
SELECT rkey, json_extract_string(value, '$.text') as text
FROM records
WHERE collection = 'app.bsky.feed.post'
  AND text ILIKE '%biotech%'

-- Largest records
SELECT uri, size_bytes FROM records ORDER BY size_bytes DESC LIMIT 10
```

## Stack

- **Frontend**: Vite + React + xterm.js
- **WASM**: Rust + wasm-bindgen (116KB / 53KB gzipped)
- **SQL**: DuckDB-Wasm (loaded from CDN on first `sync`)
- **Hosting**: Cloudflare Pages (static, `wrangler.jsonc`)
- **Auth**: ATProto app passwords (direct PDS calls)

## Deploy

```bash
cd os && npm run build && npx wrangler deploy
```
