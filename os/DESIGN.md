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
| `container` | Launch container shell (bash + claude-code) |
| `set-key <key>` | Save Anthropic API key for container |

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

## Container Shell (`api/`)

Real bash shell in the browser via Cloudflare Containers. Run Claude Code, git, node — anything you'd run in a terminal.

### Architecture

```
Browser (xterm.js)                    Cloudflare Edge
┌─────────────────┐     WebSocket     ┌──────────────────────┐
│  Terminal.jsx    │ ←──────────────→  │  Worker (api/)       │
│                  │                   │  ├── WS upgrade      │
│  Dual mode:      │                   │  └── route to DO     │
│  ├── PDS shell   │                   │                      │
│  │   (XRPC)     │                   │  ContainerShell (DO) │
│  └── Container   │                   │  └── container.fetch │
│      (WebSocket) │                   │                      │
│                  │                   │  Container (Docker)  │
│  ws-transport.js │                   │  ├── bash + PTY      │
│                  │                   │  ├── git, node       │
└─────────────────┘                   │  ├── claude-code     │
                                      │  └── pty-server.js   │
                                      └──────────────────────┘
```

### How it works

1. User types `container` in PDS shell (after `set-key` with Anthropic API key)
2. Frontend opens WebSocket → Worker → Durable Object → Container
3. Container runs a Docker image with node-pty, spawns bash
4. All terminal I/O streams through the WebSocket — real PTY, real bash
5. Container sleeps after 10 min idle, wakes on reconnect (2-3s cold start)
6. `exit` or Ctrl+D returns to PDS shell

### Container contents

- **bash** — real shell with full job control
- **git** — clone, commit, push
- **node 22** — npm, full Node.js runtime
- **claude-code** — `@anthropic-ai/claude-code` CLI
- **python3** — for PDS scripts (publish, sync)

### Commands

| Command | Description |
|---------|-------------|
| `container` | Launch container shell |
| `container --api-key=KEY` | Launch with explicit API key |
| `set-key <key>` | Save Anthropic API key (localStorage) |

### Deploy

```bash
cd os/api && npm install && npx wrangler deploy
```

### Limits

- Ephemeral disk — state lost when container sleeps
- Cold start ~2-3s depending on image size
- Container sleeps after 10 min idle
- Max 10 concurrent instances (configurable)

## Stack

- **Frontend**: Vite + React + xterm.js
- **Container Backend**: Cloudflare Workers + Containers + Durable Objects
- **WASM**: Rust + wasm-bindgen (116KB / 53KB gzipped)
- **SQL**: DuckDB-Wasm (loaded from CDN on first `sync`)
- **Hosting**: Cloudflare Pages (static, `wrangler.jsonc`)
- **Auth**: ATProto app passwords (direct PDS calls)

## Deploy

```bash
# Frontend (Pages)
cd os && npm run build && npx wrangler deploy

# Container API (Worker + Container)
cd os/api && npm install && npx wrangler deploy
```
