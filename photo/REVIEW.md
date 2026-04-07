# ATPhoto — Project Review & Handoff Notes

**Reviewed**: 2026-04-07
**Branch**: `claude/photo-project-review-pc94c`
**Status**: ~95% complete. Builds clean. Ready for iteration.

---

## What This Is

A client-side Bluesky image explorer. No backend — downloads a user's full ATProto repo as a CAR file, parses it with Rust/WASM, loads it into DuckDB-Wasm, and renders every image as a masonry grid. Also has an AI chat mode (Sleuth) and authenticated upload/album features (Arena).

Live at `photo.mino.mobi` (deploys from `claude/atproto-arena-duckdb-8H9SQ`).

---

## Architecture Summary

```
Handle input → resolveHandle → resolvePds → getRepo (CAR stream)
  → Rust/WASM parse → NDJSON → pre-filter (95% reduction) → DuckDB ingest
  → SQL extraction → masonry grid (CDN thumbnails + PDS getBlob lightbox)
```

Everything runs in the browser. The user's PDS is the only external data source.

---

## Stack

| Layer | Tech |
|-------|------|
| Framework | React 19 + Vite 6 |
| CAR parsing | Rust → WASM (116KB, `src/wasm/`) |
| Query engine | DuckDB-Wasm (CDN, `@duckdb/duckdb-wasm@1.29.0`) |
| Embeddings | transformers.js (`bge-small-en-v1.5`, 384 dims) |
| LLM | BYOK — direct browser calls to OpenAI/Anthropic |
| Hosting | Cloudflare Pages (static) |
| Auth | ATProto app passwords (`com.atproto.server.createSession`) |

---

## Source Layout

```
photo/src/
├── main.jsx              # React root (10 lines)
├── App.jsx               # Main component + GalleryView (~700 lines)
├── App.css               # All styles
├── components/
│   ├── Grid.jsx          # Masonry grid, infinite scroll, viewport unloading
│   ├── FilterBar.jsx     # Aspect ratio, alt text, color, date, source filters
│   ├── Sleuth.jsx        # AI search — repo → embed → RAG → LLM stream
│   ├── Dossier.jsx       # Multi-pass LLM personality analysis
│   ├── Thread.jsx        # Bluesky thread viewer
│   ├── LoginButton.jsx   # PDS auth modal
│   ├── UploadButton.jsx  # Drag-drop image upload
│   ├── Albums.jsx        # Album CRUD on PDS
│   └── HandleTypeahead.jsx # Autocomplete via Bluesky API
├── lib/
│   ├── resolve.js        # Handle → DID → PDS URL
│   ├── repo.js           # CAR download + WASM parse
│   ├── duckdb.js         # DuckDB init, ingest, image/video extraction, raw SQL
│   ├── auth.js           # Session management + auto-refresh authFetch
│   ├── pds.js            # Blob upload, record CRUD, album/image collections
│   ├── engagement.js     # Likes/reposts fetching
│   ├── embeddings.js     # transformers.js wrapper (batch embed)
│   ├── vectorstore.js    # In-memory cosine similarity search
│   ├── llm.js            # OpenAI + Anthropic streaming, RAG message builder
│   ├── dossier.js        # Multi-pass clustering + narrative synthesis
│   ├── colors.js         # Dominant color extraction, eigenpalette
│   └── thread.js         # Thread navigation
└── wasm/
    ├── pds_car_parser.js       # WASM bindings
    ├── pds_car_parser.d.ts     # Type declarations
    ├── pds_car_parser_bg.wasm  # Compiled Rust binary (116KB)
    └── pds_car_parser_bg.wasm.d.ts
```

**~4,200 lines of JS/JSX total.**

---

## Build

```bash
cd photo && npm install && npm run build   # → dist/
```

Builds in ~1s. Output: 285KB JS + 27KB CSS + 119KB WASM. Dev server on port 5177.

---

## Three Modes

### 1. Gallery (default, `#/`)
- Enter a handle → download repo → extract images → masonry grid
- Multi-user: sync multiple handles, images merge chronologically
- Filters: aspect ratio, alt text, color palette, date range, source (post vs upload)
- Sort: newest, oldest, most-liked
- Lightbox with full-res PDS getBlob
- Color extraction + eigenpalette computation
- Engagement metrics (likes/reposts) loaded on demand

### 2. Sleuth (`#/sleuth`)
- Same repo download pipeline
- Posts embedded with `bge-small-en-v1.5` via transformers.js
- Vector search (cosine similarity) for semantic post lookup
- RAG chat — top-k posts injected as context for LLM
- Dossier mode — multi-pass LLM analysis (clustering, theme synthesis)
- BYOK: user provides their own OpenAI or Anthropic API key

### 3. Thread (`#/thread`)
- Thread viewer for Bluesky conversation trees

---

## Auth & Arena (Authenticated Features)

Login via app password → `createSession` on user's PDS. Auth state is module-level (not persisted across reloads). `authFetch` auto-refreshes on 401.

When logged in, users can:
- **Upload images** to their PDS as `com.minomobi.arena.image` records
- **Create albums** as `com.minomobi.arena.album` records
- Uploaded images appear in the grid alongside post images (filterable by source)

TID generation for rkeys: microseconds since epoch + 10 random bits, base-36 encoded.

---

## Things That Work Well

1. **Memory management** — Pre-filters NDJSON before DuckDB ingest (95% reduction). Grid cards unmount `<img>` when >2000px off-screen to free decoded bitmaps.
2. **Multi-user** — DuckDB table partitioned by DID. Clean replace on re-sync.
3. **CDN thumbnails with PDS fallback** — Fast grid load, full-res in lightbox.
4. **Video support** — Extracts `app.bsky.embed.video` records alongside images.
5. **CID resolution** — Handles multiple ref formats (`$link`, `link`, string).

---

## Things To Watch

1. **No shared library usage** — `lib/resolve.js`, `lib/auth.js`, `lib/pds.js` duplicate code from `packages/atproto/`. Per CLAUDE.md migration policy, switch imports to shared lib when modifying these files.

2. **Session not persisted** — Auth state lives in a module variable. Refreshing the page logs you out. Could store encrypted session in localStorage if this becomes friction.

3. **App.jsx is large** — ~700 lines with GalleryView doing a lot. If adding features, consider extracting the lightbox and sync logic into hooks.

4. **DuckDB CDN version pinned** — `@duckdb/duckdb-wasm@1.29.0`. Fine for now but worth updating periodically.

5. **No error boundary** — A WASM parse failure or DuckDB error will crash the whole app. React error boundaries would help graceful recovery.

6. **SQL injection surface** — `ingestNdjson` uses string interpolation for DID in SQL. Currently escaped with `replace(/'/g, "''")` which is adequate for DIDs but worth noting.

7. **Deploys from a different branch** — Production is on `claude/atproto-arena-duckdb-8H9SQ`, not `main`. Keep this in mind for merge strategy.

---

## Ideas From IDEAS.md Worth Prioritizing

- **Alt text analytics** — Low effort, high value. DuckDB already has the data.
- **Posting calendar** — GitHub-style heatmap from `createdAt`. Pure SQL + canvas.
- **SQL console** — Collapsible query box. DuckDB `query()` export already exists.
- **Export** — ZIP download of filtered images. Straightforward with existing filter pipeline.

---

## What I'd Tackle First

If building on this, the highest-leverage next steps are:

1. **Migrate `lib/` imports to `packages/atproto/`** — `resolve.js` and `pds.js` overlap significantly with the shared library. Auth is more custom but could partially migrate.
2. **Add an error boundary** — Wrap GalleryView and Sleuth so WASM/DuckDB failures don't white-screen.
3. **Pick one IDEAS.md feature** (alt text analytics or posting calendar) and ship it — proves the DuckDB pipeline extends easily.
