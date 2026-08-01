# ATPhoto — audit of the top-level app

**Audited**: 2026-08-01 · **Scope**: `photo/index.html`, `photo/src/`, `photo/worker.js` —
the React explorer at `photo.mino.mobi/`. Not the standalone tools under
`public/` (`/glass`, `/glitch`, `/lens`, `/shop`, `/orb`, `/astro`, `/fractal`,
`/prism`, `/juice`), which are audited by their own selftests.

This replaces the 2026-04-07 review, which had drifted far enough from the code
to be misleading — see §4.

---

## What it is, as built today

Enter a Bluesky handle → download the whole repo as a CAR from the user's PDS →
parse it with Rust/WASM → filter to posts → load into DuckDB-Wasm → extract image
and video embeds by SQL → render a masonry grid. Multi-user, filterable, sortable.
Signed-in users can upload images and build albums on their own PDS. Three other
routes hang off the same bundle: `#/thread`, `#/sleuth`, `#/codescan`.

~4,900 lines of JS/JSX. Builds in 2.4s to a 295 kB JS bundle (91.5 kB gzip),
35 kB CSS, 119 kB CAR-parser WASM, and a 3 MB OCR WASM loaded only by
`/codescan`.

**What's genuinely good, and should survive any rewrite:** the viewport-unloading
grid (`<img>` unmounts beyond 2000px, freeing the decoded bitmap while the
aspect-ratio box holds layout), the shortest-column masonry weighted by aspect
ratio, the NDJSON pre-filter that drops ~95% of records before DuckDB sees them,
and the same-origin `/api/img` proxy in `worker.js` — which exists precisely
because `cdn.bsky.app` refuses cross-origin browser reads. Hold that last fact;
§1 is about the one place the app forgot it.

---

## 1. Colour extraction has never worked in production

**Severity: high — a whole feature is dead, and it costs bandwidth to stay dead.**

`lib/colors.js` sets `img.crossOrigin = 'anonymous'` and points at
`cdn.bsky.app`. That CDN returns **no `access-control-allow-origin` header**:

```
$ curl -sI -H "Origin: https://photo.mino.mobi" \
    "https://cdn.bsky.app/img/feed_thumbnail/plain/did:plc:z72i7…/bafkreifvw4…"
HTTP/2 200
content-type: image/webp
cache-control: max-age=604800, public
content-security-policy: script-src 'none'
…                                   ← no access-control-allow-origin
```

A CORS-mode image load without that header **fails**. So `onerror` fires,
`extractColors` resolves `null`, and the palette cache stays empty for every
image. The consequences cascade quietly:

- `computeEigenpalette()` returns `null` → the per-user palette dots never render.
- `colorsReady` is set to `true` anyway when the batch finishes → `FilterBar`
  shows the **Color** dropdown.
- Picking a colour calls `imageColorRegions()`, which returns `null` for every
  item, and the filter's `if (regions && !regions.has(…))` never rejects
  anything → **the colour filter silently does nothing**.
- Meanwhile the app has fetched *every thumbnail in the repo* at 6-way
  concurrency, on every sync, unprompted, and shown the user a progress
  counter for it.

The fix is one line and the machinery is already deployed: route the colour
sampler through `/api/img`, which this very surface built for this very reason
(read the header comment in `worker.js` — it says so). `worker.js` already
allowlists `*.bsky.app`, sets `access-control-allow-origin: *`, and caches at the
edge for a day:

```
$ curl -sI -H "Origin: https://photo.mino.mobi" \
    "https://photo.mino.mobi/api/img?u=https%3A%2F%2Fcdn.bsky.app%2F…"
HTTP/2 200
content-type: image/webp
access-control-allow-origin: *
x-orb-proxy: orb-img-proxy-v4-worker-main
```

Two things to fix alongside it: don't set `colorsReady = true` when the cache is
empty (offer the filter only when there is data behind it), and don't start the
extraction at all until the user opens the colour filter — 3,000 thumbnail
fetches is not a background task.

---

## 2. Sleuth's default Anthropic model is past its retirement date

**Severity: high for that route — likely a 404 on every request.**

`lib/llm.js` offers:

| | declared | status |
|---|---|---|
| Anthropic default | `claude-sonnet-4-20250514` | deprecated, **retirement date June 15 2026 — now passed** |
| Anthropic other | `claude-haiku-4-5-20251001` | active |
| OpenAI | `gpt-4o-mini`, `gpt-4o`, `gpt-4.1-mini`, `gpt-4.1-nano` | outside this audit's remit; over a year old, worth a look |

Current Claude IDs are `claude-opus-5`, `claude-sonnet-5`, `claude-haiku-4-5` —
note the current-generation IDs carry **no date suffix**. Recommended list:
`claude-opus-5` (default), `claude-sonnet-5`, `claude-haiku-4-5`.

I could not call the API from the sandbox to confirm the 404 (no key), so this
is from the published retirement schedule rather than an observed failure.

The browser-direct plumbing itself is correct: `anthropic-dangerous-direct-browser-access: true`
is set, and the SSE parsing handles both providers' formats. But see §7 on where
that key is stored.

---

## 3. The lightbox pulls originals from the user's PDS — 5.4× the bytes

**Severity: medium — slow for the viewer, and the cost lands on someone else's PDS.**

`imageUrl()` builds a `com.atproto.sync.getBlob` URL against the author's PDS,
so opening any image downloads the **original upload**. Measured on one real
post:

```
getBlob (what the lightbox loads):   1,554,074 bytes
cdn feed_fullsize (never used):        285,866 bytes
```

`cdn.bsky.app/img/feed_fullsize/plain/{did}/{cid}@jpeg` returns a
display-resolution JPEG at a fifth the size, from an edge cache, and the app
already knows how to build CDN URLs (`thumbUrl` does it for the grid). Use
`feed_fullsize` first and keep `getBlob` as the fallback — which is the same
two-tier pattern `ImageCard` already implements for thumbnails. Keep `getBlob`
as the only path for `arena`/`album` uploads; those have no CDN presence.

---

## 4. The review doc described a system that no longer exists

**Severity: medium — every line below sent a reader somewhere wrong.**

The previous version of this file (2026-04-07) stated:

| It said | Reality |
|---|---|
| Auth is app passwords via `com.atproto.server.createSession` | `lib/auth.js` wraps `packages/oauth-client/` against the shared `auth.mino.mobi` worker |
| "Session not persisted — refreshing logs you out" | OAuth session is restored on mount via `authInit()` |
| Hosting: Cloudflare Pages (static) | Workers-with-assets — `worker.js` + `assets` binding; `worker.js`'s own header comment says Pages conventions are a known dead end |
| Sleuth: CAR → embeddings (`bge-small-en-v1.5`) → vector search → RAG | Sleuth uses `listRecords` for the newest 1,000 posts and a **TF-IDF inverted index**. No CAR, no WASM, no DuckDB, no embeddings |
| Deploys from `claude/atproto-arena-duckdb-8H9SQ` | Now `claude/image-manipulation-platform-g5puxy` (registry is the authority) |
| Output: 285KB JS + 27KB CSS | 295 kB JS + 35 kB CSS |

The Sleuth row is the expensive one: it describes an architecture someone might
try to extend or debug, and the code for it is gone.

---

## 5. Dead code: 433 lines, plus one import that keeps a ghost alive

**Severity: low, but it is what made §4 possible.**

| File | Lines | Status |
|---|---|---|
| `lib/memory.js` | 238 | imported by nothing |
| `lib/vectorstore.js` | 78 | imported by nothing |
| `lib/embeddings.js` | 117 | imported by `dossier.js` — which never calls `embedQuery` |

`dossier.js` still branches on `if (vectors && vectors.length > 0)` for k-means
clustering, and `Sleuth.jsx` passes `vectors: null` unconditionally. So the
clustering path is unreachable, the transformers.js CDN import is never taken,
and roughly a third of `dossier.js` is decoration. Delete the two orphans and
the unused import; either wire clustering up or delete the branch.

---

## 6. Performance: the pipeline peaks at 3–4 copies of the repo

**Severity: medium on desktop, likely fatal on mobile Safari for a large repo.**

`syncUser` runs this chain, and each arrow is a live allocation:

```
chunks[]                 ← streamed CAR pieces
  → new Uint8Array(…)    ← a second full copy of the CAR (repo.js:38)
  → parseCar()           ← an NDJSON *string* — JS strings are UTF-16, so a
                           200 MB text payload occupies ~400 MB
  → ndjson.split('\n')   ← array of ~225k strings
  → kept.join('\n')      ← another full string
  → TextEncoder.encode() ← and again, as bytes, for registerFileBuffer
```

`carBytes = null` and `ndjson = null` are set at the right moments, which helps,
but the peak still stacks the CAR copy against the NDJSON string. Two cheap
wins: keep the streamed chunks and hand them to WASM without the concatenating
copy, and filter line-by-line into the encoder rather than materialising
`split` → `join` → `encode`. The right long-term shape is to stream the
parser's output straight into DuckDB.

Also sequential where it needn't be: `fetchEngagement` batches 25 URIs per call
and awaits each batch in turn. For 3,000 images that is 120 serial round trips
before "most liked" can sort. Four in flight would make it 30.

---

## 7. Third-party code executes in an origin holding an OAuth session and an API key

**Severity: worth a decision, not necessarily a change.**

`lib/duckdb.js` does `await import('https://cdn.jsdelivr.net/npm/@duckdb/duckdb-wasm@1.29.0/dist/duckdb-browser.mjs')`,
`index.html` maps `apache-arrow` to `jsdelivr/+esm`, and `lib/embeddings.js`
would import transformers.js the same way. None carry SRI, and there is no CSP
on the response (`curl -sI https://photo.mino.mobi/` returns no
`content-security-policy`). The same origin holds the `*.mino.mobi` OAuth
session cookie and `localStorage['sleuth_api_key']` — the user's own OpenAI or
Anthropic key, in plaintext.

That is a real, if unexciting, supply-chain surface: a compromised jsdelivr
response reads both. Options, cheapest first: pin with SRI where the module
format allows, vendor the DuckDB bundle into `public/vendor/` (there is already
a `public/vendor/ffmpeg/` precedent on this surface), or move the BYOK key to
`sessionStorage` with an explicit "this is stored in your browser" note in the
settings panel. At minimum the settings panel should say where the key lives.

---

## 8. Structural gaps — the ones the newer tools on this surface already solved

These are not bugs. They are the places where the original app is behind what
`/glass`, `/glitch`, `/lens` and `/shop` established afterwards, and they are
where "more thoroughly, with everything we have learned" actually points.

**No selftest.** Every other tool on this surface carries one, and
`scripts/preflight.mjs` runs them whenever `photo/` changes. The oldest and most
complex code here — the CAR pipeline, the SQL extraction, the CID conversion,
the median-cut quantiser, the TF-IDF index — has no proof at all. All of it is
pure and DOM-free enough to test under node. As a demonstration, the hand-rolled
CID conversion in `App.jsx` **is** correct — a real `bafkrei…` CID decodes to the
`01 55 12 20` prefix and re-encodes byte-identically — but nothing in the repo
says so, so nobody can change it safely.

**No shareable state.** `/glass` takes `?u=`, `/glitch` and `/shop` round-trip
their entire recipe through the URL, `/lens` the same. The flagship view cannot
share so much as a handle: sync `@someone`, filter to portraits with alt text,
and the URL is still `photo.mino.mobi/#/`. `#/sleuth/<handle>` shows the pattern
was understood; the gallery just never got it.

**`#/sleuth` is not linked from anywhere.** The header links Thread and CodeScan
only. A whole route — with the Dossier feature behind it — is reachable only by
typing the URL.

**No error boundary.** A WASM parse failure, a DuckDB init error, or one bad
record throws through React and white-screens the app. Wrap `GalleryView`,
`Sleuth`, `Thread` and `CodeScan` individually so one route's failure doesn't
take the others down.

**Keyboard and screen-reader access.** `photo-card` is a `<div>` with `onClick`
and no `role`/`tabIndex`/key handler, so the grid is unreachable by keyboard.
The lightbox has no Escape handler, no focus trap, and no `role="dialog"` —
opening it strands a keyboard user. `FilterBar` pills are real `<button>`s,
which is right; the grid and lightbox should match.

**Circular import.** `Grid.jsx` imports `thumbUrl`/`imageUrl` from `App.jsx`,
which imports `Grid.jsx`. ESM tolerates it; it should be a `lib/urls.js`.

---

## Ranked, with effort

| # | Fix | Effort | Why it ranks here |
|---|---|---|---|
| 1 | Route colour sampling through `/api/img`; gate extraction behind the filter | ~1h | A dead feature becomes a live one, and thousands of pointless fetches stop |
| 2 | Update the model list in `lib/llm.js` | ~10m | The default Anthropic model is past retirement |
| 3 | `feed_fullsize` in the lightbox, `getBlob` as fallback | ~30m | 5.4× less data, off someone else's PDS |
| 4 | Write `photo.selftest.mjs` over the pure core | ~half day | The precondition for changing anything else safely |
| 5 | Delete `memory.js`, `vectorstore.js`, the unused `embedQuery` import | ~15m | 433 lines that actively mislead |
| 6 | URL state for the gallery (handle + filters + sort) | ~2h | Brings the flagship view up to what every neighbouring tool does |
| 7 | Error boundary per route; link `#/sleuth`; keyboard + Escape on grid and lightbox | ~2h | Basic robustness and access |
| 8 | Code-split `Thread`/`Sleuth`/`CodeScan` behind `React.lazy` | ~1h | The gallery stops shipping the LLM client and Dossier to every visitor |
| 9 | Cut the copies out of the sync pipeline; parallelise `fetchEngagement` | ~half day | Mobile viability on large repos |
| 10 | Decide the CDN/SRI/BYOK-storage question and write it down | ~1h | It is a decision, not a defect — but it should be a made one |

Items 1–3 and 5 are contained and independently shippable. Item 4 should land
before 6 and 9, which change behaviour under load.

---

## What I could not verify from the sandbox

- **Item 2's 404.** Confirmed against the published retirement schedule, not by
  calling the API — no key here.
- **The sync pipeline under real load.** Chromium in this sandbox has no
  outbound network, so the CAR download, WASM parse and DuckDB ingest were read,
  not run. The memory analysis in §6 is from the code, not from a heap profile.
- **Mobile Safari specifically.** The OOM claim is inference from the allocation
  chain and `performance.memory` being Chrome-only; it wants a real device.

Everything else above was measured: the CORS headers, the byte sizes, the bundle
output, the dead imports, the CID round-trip, and the absent `#/sleuth` link.
