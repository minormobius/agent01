# Repository Analysis — minomobi

*Generated 2026-02-26 by Claude during labglass-feature session.*

## What This Is

A multi-system personal knowledge and publishing platform built on ATProto. Static HTML/JS frontends deployed to Cloudflare Pages, data stored as ATProto records on a personal data server (PDS), GitHub Actions workflows automating publishing, data synchronization, and social posting. No SaaS backends — client-side apps reading/writing to decentralized infrastructure.

## System Inventory

| System | Directory | Purpose | Stack | Status |
|--------|-----------|---------|-------|--------|
| **The Mino Times** | `time/` | Biotech publication | Markdown → ATProto, marked.js | Fully functional |
| **LABGLASS** | `labglass/` | P2P data workbench | DuckDB-Wasm, Pyodide, WebGPU, OPFS | Active dev |
| **Phylo** | `phylo/` | Taxonomy explorer | OToL API → ATProto, canvas/text viewers | Functional |
| **Music** | `music/` | Step sequencer | Web Audio API, ATProto storage | Scaffolding |
| **Bakery** | `bakery/` | Flour calculator | React + Vite | Buildable |
| **Sweat** | `sweat/` | Fitness tracker | PWA, service worker | Minimal |

## Architecture Pattern

Every project follows the same shape:
1. **Static frontend** (vanilla JS, no framework except bakery's React)
2. **ATProto PDS as database** — records stored on user's personal data server
3. **GitHub Actions as automation** — push triggers posting, publishing, syncing
4. **Cloudflare Pages for hosting** — auto-deploy from `main`, no build step

## The Mino Times (`time/`)

ATProto-backed biotech publication. Articles are markdown with YAML frontmatter, stored as `com.whtwnd.blog.entry` records, rendered in a newspaper broadsheet layout.

### Content Pipeline
```
Research → Bluesky Thread → Article (ATProto) → Editorial Panel → Podcast
```

### Key Files
- `time/index.html` — Front page viewer (fetches records from PDS)
- `time/entry.html` — Single article viewer (markdown → HTML via marked.js)
- `time/js/atproto.js` — PDS client (handle → DID → PDS resolution)
- `time/entries/*.md` — Article source files
- `time/posts/*.md` — Bluesky thread drafts (trigger GitHub Action)
- `scripts/publish-whtwnd.py` — Publishes entries to PDS
- `src/post_thread.py` — Posts threads to Bluesky (multi-account)

### Published Content
Exobiology series (5 articles, Feb 19–23, 2026):
1. "The Leopard Spots of Jezero Crater" — Perseverance biosignatures
2. "The $11 Billion Tube" — Mars Sample Return history
3. "The Instrument Gap" — Europa Clipper, Enceladus, ocean worlds
4. "The Contamination Problem" — Planetary protection policy
5. "The Last Rung" — Life-detection confidence scales

Each article has editorial panel transcripts (Modulo × Morphyx discussion).

### Minophim
Two editorial voices with separate Bluesky accounts and emails:
- **Modulo** (`modulo.minomobi.com`) — Left-brain, data-first, Mars/Apollo/Jupiter archetype
- **Morphyx** (`morphyx.minomobi.com`) — Right-brain, relational, Venus/Bacchus/Saturn archetype

## LABGLASS (`labglass/`)

Browser-only data workbench. No server. DuckDB for SQL, Pyodide for Python, OPFS for persistence, WebRTC for collaboration.

### Key Files
- `labglass/index.html` — App shell
- `labglass/js/app.js` — Main orchestrator
- `labglass/js/duckdb.js` — DuckDB-Wasm init & SQL execution
- `labglass/js/pyodide-bridge.js` — Python environment (Pyodide)
- `labglass/js/notebook.js` — Notebook cell management (SQL, Python, Markdown, Viz)
- `labglass/js/storage.js` — OPFS abstraction
- `labglass/js/sensors.js` — Phone sensors (motion, GPS, camera, mic)
- `labglass/js/hardware.js` — Web Serial, Web Bluetooth
- `labglass/js/collab.js` — WebRTC peer-to-peer
- `labglass/js/webgpu-viz.js` — WebGPU visualization
- `labglass/js/capture.js` — WebCodecs session recording

### Capabilities
- **Notebook cells**: SQL, Python, Markdown, Visualization
- **File management**: Drag-and-drop CSV/Parquet/JSON/TSV/XLSX → OPFS → DuckDB tables
- **Hardware**: Accelerometer, gyroscope, GPS, camera, mic, magnetometer, ambient light, Web Serial, Web Bluetooth
- **Collaboration**: WebRTC P2P (manual SDP exchange)
- **Recording**: WebCodecs session capture

### Cross-Origin Isolation
Requires `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: require-corp` for SharedArrayBuffer (Pyodide needs this). Set via Cloudflare Workers (`labglass/worker.js`).

## Phylo (`phylo/`)

Syncs Open Tree of Life taxonomy → ATProto records → browser viewers.

### Key Files
- `phylo/index.html` — Canvas zoom viewer
- `phylo/tree.html` — Text tree viewer
- `scripts/sync-otol-to-atproto.py` — Sync pipeline (OToL → chunk → Wikidata enrich → PDS)

### Data Model
Collection: `com.minomobi.phylo.clade` (adaptive chunking, ~400 nodes/record)

### Synced Clades
| Clade | OTT ID | ~Nodes |
|-------|--------|--------|
| Mammalia | 244265 | 11,715 |
| Aves | 81461 | ~11,000 |

## GitHub Actions (`.github/workflows/`)

| Workflow | Trigger | Purpose |
|----------|---------|---------|
| `post-to-bluesky.yml` | Push to `time/posts/` | Post threads to Bluesky |
| `publish-whtwnd.yml` | Push to `time/entries/` | Publish articles to PDS |
| `sync-phylo.yml` | Push to tracked paths / manual | Sync OToL → ATProto |
| `query-otol.yml` | Push / manual | Test OToL API queries |
| `fetch-atproto-data.yml` | Push | Fetch external PDS records |
| `verify-phylo.yml` | Push | Verify phylo sync integrity |
| `write-test-recipe.yml` | Push | Test ATProto recipe writing |

## Domain & Infrastructure

- **Domain**: `minomobi.com`
- **Hosting**: Cloudflare Pages (auto-deploy from `main`)
- **Email**: Cloudflare Email Routing (tips@, editor@, modulo@, morphyx@)
- **Subdomains**: time, labglass, phylo, music, bakery, modulo, morphyx

## Secrets Required (GitHub)

- `BLUESKY_HANDLE` / `BLUESKY_APP_PASSWORD` — Publication account
- `BLUESKY_MODULO_HANDLE` / `BLUESKY_MODULO_APP_PASSWORD` — Modulo
- `BLUESKY_MORPHYX_HANDLE` / `BLUESKY_MORPHYX_APP_PASSWORD` — Morphyx

## Known Issues

1. **Batch write throttling** — Phylo sync hits 413 on large batches; falls back to individual writes
2. **WebRTC signaling** — Manual SDP exchange (no signaling server, by design)
3. **Minophim DIDs** — Placeholder strings in `modulo/.well-known/atproto-did` and `morphyx/.well-known/atproto-did`
4. **Bluesky secrets** — Workflows skip posting if secrets not configured
