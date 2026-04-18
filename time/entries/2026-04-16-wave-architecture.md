---
title: "Wave: Architecture of a Canvas-Native Encrypted Editor on ATProto"
subtitle: "How Wave renders markdown directly to canvas, encrypts everything end-to-end, and stores it all on your PDS"
createdAt: "2026-04-16T12:00:00.000Z"
visibility: "public"
---

Wave is a collaborative notes and document editor built entirely on the AT Protocol. Every document, every message, every encryption key lives as a record on the participants' Personal Data Servers. There is no central backend. No database we control. The application is a static site that talks directly to PDS instances.

This note describes how it works — the rendering pipeline, the encryption layer, the data model, and the design decisions behind each.

## The Stack

Wave is a React single-page application deployed to Cloudflare Pages. It has one unusual dependency: a Rust crate compiled to WebAssembly that handles markdown parsing and canvas rendering.

```
React SPA (TypeScript)
  ├── Canvas renderer (Rust → WASM)
  │     ├── pulldown-cmark (CommonMark parser)
  │     ├── Layout engine (word wrap, headings, lists, code blocks, kanban)
  │     ├── Painter (Canvas2D via web-sys)
  │     └── Edit state (cursor, selection, input handling)
  ├── Crypto layer (Web Crypto API)
  │     ├── ECDH P-256 identity keys
  │     ├── AES-GCM-256 content encryption
  │     └── PBKDF2 vault passphrase derivation
  └── ATProto layer (PDS client)
        ├── Record CRUD (getRecord, putRecord, listRecords)
        ├── Identity resolution (DID → PDS)
        └── Jetstream (WebSocket live updates)
```

No server-side compute. No Workers. No database. The PDS *is* the database.

## Canvas-Native Rendering

Most markdown editors work in one of two ways: render HTML and overlay a textarea, or use a contenteditable div. Wave does neither. It parses markdown with pulldown-cmark, lays out text directly using a custom layout engine, and paints everything to a `<canvas>` element using the Canvas 2D API.

### Why Canvas?

Three reasons:

1. **Pixel-perfect control.** We decide exactly where every glyph goes. No CSS inheritance surprises, no browser rendering differences, no contenteditable cursor jank.

2. **Source offset tracking.** Every rendered word carries its byte offset in the original markdown source. Click on a word and we know exactly which bytes in the markdown you clicked. This makes WYSIWYG editing on rendered markdown possible without an intermediate AST.

3. **Custom block types.** Kanban boards, checklists with toggle-able checkboxes, wikilink chips — these render as native canvas elements, not HTML widgets jammed into a contenteditable container.

### The Rendering Pipeline

```
Markdown source
  → pulldown-cmark into_offset_iter()
    → (Event, Range<usize>) stream
      → Layout engine (word wrap, position, font selection)
        → Vec<RenderItem> (text, rect, line, circle, checkbox, hit region)
          → Painter (Canvas2D draw calls)
```

The key insight is `into_offset_iter()`. Standard pulldown-cmark gives you `Event::Text("hello")`. The offset iterator gives you `Event::Text("hello")` *plus* `Range { start: 42, end: 47 }` — the exact byte range in the original markdown. Every `RenderItem::Text` carries `src_offset` and `src_len`, so we can map between screen coordinates and source bytes in both directions.

### Layout Engine

The layout engine (`layout.rs`) processes the event stream and produces a flat list of `RenderItem` variants:

- **Text** — positioned text with font, color, baseline, and source offset
- **Rect** / **StrokeRect** — filled or stroked rectangles (code blocks, blockquotes, kanban cards)
- **Line** — horizontal rules, underlines
- **Circle** — bullet points
- **Checkbox** — interactive task list items
- **HitRegion** — invisible click targets (links, wikilinks, checkboxes)

Word wrapping happens at layout time using `measureText()` on the canvas context. The engine tracks a cursor position (`x`, `y`) and advances it as items are emitted, wrapping to the next line when `x + word_width` exceeds the available width.

### WYSIWYG Editing

The editor works directly on the rendered canvas. When you type, you're editing the markdown source — but what you see is the rendered output updating in real time.

The mechanism:

1. A hidden `<textarea>` sits off-screen and captures all keyboard input (including IME composition, paste, mobile keyboards).
2. Click events on the canvas map viewport coordinates → document coordinates → source byte offsets using `offset_at_position()`, which iterates render items and uses character-by-character `measureText()` for sub-word precision.
3. The `EditState` struct in Rust tracks cursor position (as a byte offset into the markdown source), selection range, and cursor blink state.
4. On every input event, the markdown source is modified at the cursor position, the document is re-laid out, and the canvas is repainted. This is fast enough for interactive typing because layout and paint together take under 2ms for typical documents.
5. `cursor_position()` maps the cursor's source byte offset back to canvas `(x, y)` coordinates for rendering the blinking cursor line.

Format operations (bold, italic, heading, code, link) work by wrapping the selection with markdown syntax — `**` for bold, `*` for italic, etc. — then re-laying out.

## Encryption

Wave uses three layers of key material:

### Identity Keys (ECDH P-256)

Every user generates an ECDH P-256 key pair on first use. The private key is wrapped with AES-KW using a key derived from the user's vault passphrase via PBKDF2-SHA256 (600,000 iterations). Both the wrapped private key and the raw public key are stored as ATProto records on the user's PDS.

```
Passphrase → PBKDF2 → KEK (Key Encryption Key)
KEK + Private Key → AES-KW → Wrapped Private Key → PDS record
```

### Tier DEKs (AES-GCM-256)

Each organization has tiers (like "member", "admin", "owner"). Each tier has a Data Encryption Key (DEK) — a symmetric AES-GCM-256 key. Content encrypted with a tier's DEK is readable by anyone at that tier level or above.

The DEK is distributed via keyrings: for each member, the DEK is wrapped using ECDH key agreement between the inviter's private key and the member's public key. The wrapped DEK and the writer's public key are stored together so any member can unwrap.

```
Inviter Private Key + Member Public Key → ECDH → Shared Secret
Shared Secret → HKDF → Wrapping Key
Wrapping Key + Tier DEK → AES-KW → Wrapped DEK
(Wrapped DEK, Writer Public Key) → Keyring record on PDS
```

### Content Encryption

Every message and document edit is encrypted with the channel's tier DEK:

```
Plaintext → JSON.stringify → TextEncoder → AES-GCM encrypt(DEK, random IV)
(IV, Ciphertext) → ATProto record on author's PDS
```

Decryption requires the tier DEK, which requires unwrapping from the keyring, which requires the user's ECDH private key, which requires the vault passphrase.

## Data Model

Everything is ATProto records. The collections:

| Collection | Purpose | Stored On |
|---|---|---|
| `com.minomobi.vault.wrappedIdentity` | AES-KW wrapped ECDH private key | User's PDS |
| `com.minomobi.vault.encryptionKey` | Raw ECDH public key | User's PDS |
| `com.minomobi.vault.org` | Organization definition (name, tiers) | Founder's PDS |
| `com.minomobi.vault.membership` | Member ↔ org ↔ tier binding | Founder's PDS |
| `com.minomobi.vault.keyring` | Wrapped tier DEKs per member | Founder's PDS |
| `com.minomobi.vault.orgBookmark` | "I joined this org" pointer | Member's PDS |
| `com.minomobi.wave.channel` | Channel within an org | Founder's PDS |
| `com.minomobi.wave.thread` | Thread (chat or doc) within a channel | Author's PDS |
| `com.minomobi.wave.op` | Operation (message or doc edit) | Author's PDS |

The critical design decision: **ops live on the author's PDS, not the org founder's**. This means each participant's contributions are stored on their own server. Loading a thread requires fetching ops from every member's PDS. This is slower than a centralized database but means no single party controls the data.

### Public Notes

Wave also supports unencrypted "public notes" — documents stored as plain JSON on the author's PDS with `keyringRkey: "public"`. These don't require vault unlock or org membership. They're personal documents that happen to use ATProto as storage.

## Live Updates

When viewing a thread, Wave opens a WebSocket connection to the Bluesky Jetstream relay. It subscribes to commit events from all org members, filtered to Wave collections. When a member posts a new op, it appears in real time without polling.

## Wikilinks and the Knowledge Graph

Wave supports `[[wikilinks]]` — references between documents. The WASM module exports `parseWikilinks()` which extracts link targets from markdown. The React layer builds a graph of note stubs (title, rkey, links, backlinks) and renders it as a force-directed graph visualization using Canvas 2D.

Clicking a node in the graph navigates to that document. Backlinks are computed by inverting the forward link map. The result is a personal wiki where documents reference each other and the connection structure is visible.

## What's Next

The current architecture loads all member data sequentially — iterate members, fetch each one's threads, then ops. The next step is parallelizing these fetches and showing the app shell immediately while records stream in progressively. The PDS API supports pagination but not streaming, so the optimization is `Promise.all()` across members rather than sequential `for` loops.

The canvas renderer could also support collaborative cursors — multiple users editing the same document with their cursor positions broadcast via Jetstream. The source-offset tracking makes this straightforward: each remote cursor is just a byte offset rendered as a colored line.

The encryption layer supports key rotation via epoch numbers on keyrings, but the rotation UI isn't built yet. When a member is removed, a new epoch should be created with fresh DEKs wrapped for remaining members only.

Wave is open infrastructure. Every component — the WASM markdown engine, the crypto primitives, the PDS client — is a building block that works independently. The canvas renderer can render any markdown. The crypto layer can encrypt any data. The PDS client can talk to any ATProto server. Wave is what happens when you compose them.
