# LABGLASS — ATProto Integration Design

## Overview

LABGLASS is a peer-to-peer biotech data workbench running entirely in the browser. It currently stores notebooks locally (OPFS) and shares them ephemerally via WebRTC. This document describes how LABGLASS will integrate with the AT Protocol to give notebooks durable, portable, user-owned storage on personal data servers (PDS).

**The pitch**: Your notebook lives on your PDS. Anyone can read it. You can fork anyone else's. No accounts on our server — because there is no server.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                    LABGLASS (browser)                │
│                                                     │
│  ┌──────────┐  ┌──────────┐  ┌────────────────────┐ │
│  │ DuckDB   │  │ Pyodide  │  │ Notebook Manager   │ │
│  │ (SQL)    │  │ (Python) │  │ (cells, execution) │ │
│  └────┬─────┘  └────┬─────┘  └────────┬───────────┘ │
│       │              │                 │             │
│       └──────────────┴────────┬────────┘             │
│                               │                      │
│  ┌────────────────────────────┴──────────────────┐   │
│  │              atproto.js (auth + CRUD)          │   │
│  │  • Login (handle + app password → session)     │   │
│  │  • Save notebook → PDS records                 │   │
│  │  • Load notebook ← PDS records                 │   │
│  │  • Browse notebooks (any user's PDS)           │   │
│  └───────────────────────┬───────────────────────┘   │
│                          │                           │
└──────────────────────────┼───────────────────────────┘
                           │ HTTPS (fetch)
              ┌────────────┴────────────┐
              │    User's PDS           │
              │  (bsky.social or self-  │
              │   hosted)               │
              │                         │
              │  com.minomobi.labglass  │
              │    .notebook  (entry)   │
              │    .cell      (cells)   │
              └─────────────────────────┘
```

## Data Model

### Why Split Records?

A notebook with 20 cells, each containing code + output, easily exceeds ATProto's ~1 MiB record limit. Following Leaflet's proven pattern, we split into:

1. **Notebook entry** — metadata + ordered cell list (lightweight, under 10 KB)
2. **Cell records** — individual cells with source code and text output (each under 50 KB typical)
3. **Blobs** — chart images, large outputs (up to 50 MB each)

This gives us:
- **Granular updates**: Edit one cell without rewriting the whole notebook
- **Forkability**: Copy specific cells from someone else's notebook
- **Size headroom**: Each cell has its own 1 MiB budget
- **Partial loading**: Show notebook structure before loading all cell content

### Lexicons

#### `com.minomobi.labglass.notebook`

The notebook envelope. Contains title, description, and an ordered list of AT-URIs pointing to cell records.

```json
{
  "lexicon": 1,
  "id": "com.minomobi.labglass.notebook",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["title", "cells", "createdAt"],
        "properties": {
          "title":       { "type": "string", "maxLength": 1000 },
          "description": { "type": "string", "maxLength": 10000 },
          "createdAt":   { "type": "string", "format": "datetime" },
          "updatedAt":   { "type": "string", "format": "datetime" },
          "visibility":  { "type": "string", "enum": ["public", "url", "author"], "default": "public" },
          "tags":        { "type": "array", "items": { "type": "string", "maxLength": 100 }, "maxLength": 20 },
          "forkedFrom":  { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "cells":       {
            "type": "array",
            "description": "Ordered list of AT-URIs to cell records",
            "items": { "type": "string", "format": "at-uri" },
            "maxLength": 500
          }
        }
      }
    }
  }
}
```

#### `com.minomobi.labglass.cell`

An individual notebook cell. Contains source code, cell type, and optionally inline text output. Large outputs (images, dataframes) go to blobs.

```json
{
  "lexicon": 1,
  "id": "com.minomobi.labglass.cell",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["cellType", "source", "createdAt"],
        "properties": {
          "cellType":    { "type": "string", "enum": ["sql", "python", "markdown", "viz"] },
          "source":      { "type": "string", "maxLength": 100000 },
          "name":        { "type": "string", "maxLength": 500 },
          "createdAt":   { "type": "string", "format": "datetime" },
          "position":    { "type": "integer", "minimum": 0 },
          "textOutput":  { "type": "string", "maxLength": 100000, "description": "Plain text output from last execution" },
          "figureBlob":  { "type": "blob", "accept": ["image/png", "image/svg+xml"], "maxSize": 5000000 }
        }
      }
    }
  }
}
```

### Record Key Strategy

Both collections use **TID** (timestamp-based) keys. This gives chronological sorting for free and avoids collision on the user's PDS.

### Notebook → PDS Mapping

When saving a notebook:
1. Each cell becomes a `com.minomobi.labglass.cell` record
2. The notebook entry's `cells` array holds AT-URIs to those cell records
3. Cell order is determined by array position (not the `position` field, which is advisory)

When loading:
1. Fetch the notebook record (lightweight)
2. Resolve each cell AT-URI in parallel (batch fetch)
3. Render cells in the order specified by the `cells` array

### Forking

To fork someone else's notebook:
1. Read their notebook entry + all cells from their PDS
2. Create copies of each cell in your PDS (new TIDs)
3. Create a notebook entry with `forkedFrom` pointing to the original (AT-URI + CID)
4. The fork is fully independent — edits don't affect the original

## Authentication

ATProto auth uses **app passwords** (not the main account password). The flow:

1. User enters their handle (e.g., `alice.bsky.social`) and an app password
2. LABGLASS resolves handle → DID → PDS endpoint
3. Creates a session via `com.atproto.server.createSession`
4. Gets back `accessJwt` (short-lived) and `refreshJwt` (long-lived)
5. Stores both in `sessionStorage` (cleared on tab close)
6. Refreshes `accessJwt` automatically when it expires

**No credentials are stored persistently.** App passwords can be revoked at any time from the user's Bluesky settings.

## Privacy

ATProto currently has **no private data mechanism**. All PDS records are publicly accessible. The `visibility` field is advisory — LABGLASS will honor it in the UI (hiding "author"-only notebooks from browse results), but technically anyone can read any record directly from the PDS.

The Private Data Working Group is developing solutions. Until then: don't store sensitive data in PDS notebooks.

## Feature Roadmap

### Phase 1 (This PR)
1. **ATProto auth** — Login dialog, session management, JWT refresh
2. **Lexicon definitions** — JSON schema files in `labglass/lexicons/`
3. **Save to PDS** — Serialize current notebook → PDS records
4. **Load from PDS** — Fetch notebook + cells → populate editor
5. **Browse notebooks** — List notebooks from any handle

### Phase 2 (Future)
- Fork notebooks from other users
- Dataset blob storage (CSV/Parquet as PDS blobs)
- Notebook version history (copy-on-write pattern)
- Collaborative editing via ATProto firehose subscriptions
- Publish notebook as Mino Times article (markdown cells → blog entry)

## Files

```
labglass/
├── js/
│   └── atproto.js          # NEW — Auth, CRUD, identity resolution
├── lexicons/
│   └── com/minomobi/labglass/
│       ├── notebook.json    # NEW — Notebook entry lexicon
│       └── cell.json        # NEW — Cell record lexicon
├── index.html               # MODIFIED — Login UI, save/load buttons
├── js/app.js                # MODIFIED — Wire ATProto into app lifecycle
├── js/notebook.js           # MODIFIED — Import/export via ATProto
└── css/labglass.css         # MODIFIED — Login dialog, notebook browser styles
```

## Constraints & Decisions

| Decision | Rationale |
|----------|-----------|
| **sessionStorage, not localStorage** | Credentials don't survive tab close — safer for shared devices |
| **TID record keys** | Chronological sorting, no collision risk |
| **Cells as separate records** | Follows Leaflet pattern; avoids 1 MiB limit; enables granular forking |
| **No server** | Pure client-side ATProto — same philosophy as LABGLASS itself |
| **No build step** | Plain JS modules, no bundler — matches existing codebase |
| **Advisory visibility** | Mirrors WhiteWind's approach; real privacy requires protocol-level support |
