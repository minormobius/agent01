# ATPhoto — audit of the top-level app, and what came of it

**Audited**: 2026-08-01 · **Acted on**: 2026-08-01 · **Scope**: `photo/index.html`,
`photo/src/`, `photo/worker.js` — the React app at `photo.mino.mobi/`. Not the
standalone tools under `public/`, which are covered by their own selftests.

The audit's findings are below with their outcomes. Ten of the eleven are fixed;
the eleventh is a decision that has been made and written down rather than a
defect to close. Two further bugs — latent, never reported — fell out of writing
the selftest, and are recorded at the end.

---

## What changed structurally

**`/` is now the surface's index.** Fourteen tools had accumulated here with no
way in: the front page went straight to the explorer and everything else was
reachable only by typing a URL you had to already know. `#/sleuth` was linked
from nowhere at all. The landing page is `src/components/Landing.jsx` over a
hand-written `src/lib/catalogue.js`; the explorer moved to `#/explore`.

That pairs with code splitting: the landing page is the only eager route, so a
visitor to the front page no longer downloads DuckDB, the CAR parser, the LLM
client and an OCR engine on the way to a list of links.

| Bundle | Before | After |
|---|---|---|
| eager (what `/` costs) | 295 kB | 204 kB |
| explorer | — | 42 kB, on demand |
| sleuth | — | 25 kB, on demand |
| thread | — | 16 kB, on demand |
| codescan | — | 15 kB, on demand |

---

## The findings

### 1. Colour extraction had never worked — **fixed**

`lib/colors.js` set `crossOrigin = 'anonymous'` and pointed at `cdn.bsky.app`,
which returns no `access-control-allow-origin`. Every CORS-mode load failed, the
palette cache stayed empty, and `colorsReady` was set to `true` regardless — so
the Color filter appeared in the UI and silently matched everything, after the
app had downloaded every thumbnail in the repo to achieve it.

Three changes: the sampler's URLs go through `proxied()` (the `/api/img` worker
route this surface built for exactly this reason); sampling is opt-in behind a
button rather than automatic on every sync; and `extractColorsForImages` now
returns how many images it actually sampled, so the filter appears only when
there is a palette behind it and says so plainly when there is not.

### 2. Sleuth's default Anthropic model was past retirement — **fixed**

`claude-sonnet-4-20250514` → the current list is `claude-opus-5`,
`claude-sonnet-5`, `claude-haiku-4-5`, defaulting to Sonnet 5. Current-generation
Claude IDs carry no date suffix; `lib/llm.js` says so in a comment so the next
person doesn't add one back.

### 3. The lightbox pulled originals from the author's PDS — **fixed**

Measured: `getBlob` 1,554,074 bytes against the CDN's `feed_fullsize` at 285,866
for the same picture. The lightbox now asks the CDN first and falls back to
`getBlob` on error — the same two-tier pattern the grid already used, and the
only path for uploads, which have no CDN rendition. ~1.2 MB saved per image
opened, off a stranger's server.

### 4. No selftest — **fixed**

`photo/photo.selftest.mjs`, run by `scripts/preflight.mjs` whenever `photo/`
changes. It covers the CID conversion, the image-URL rules (including the CORS
rule, as an assertion rather than a comment), the filter and sort logic, the URL
state round trip, the NDJSON prefilter byte-for-byte against the implementation
it replaced, the catalogue's integrity against the filesystem, and the
search/palette/thread core.

Getting it written required extracting the pure logic out of the components,
which is most of the value: `lib/cid.js`, `lib/urls.js`, `lib/filters.js`,
`lib/urlstate.js`, `lib/catalogue.js`. That also killed the `App.jsx` ↔
`Grid.jsx` circular import.

### 5. 433 lines of dead code — **fixed**

`lib/memory.js` and `lib/vectorstore.js` deleted; `lib/embeddings.js` deleted
along with the unreachable k-means path in `lib/dossier.js` that was its only
caller. Sleuth had passed `vectors: null` unconditionally since it moved to
`listRecords` + TF-IDF, so the clustering branch had been dark for months —
long enough to be described in this very document as how the tool worked.

### 6. No shareable URL state — **fixed**

`lib/urlstate.js`. The gallery's handles, filters and sort now live in the hash:

```
#/explore?u=alice.bsky.social&aspect=portrait&alt=has&sort=most-liked
```

Handles named in the URL are synced on arrival, so a shared link is a shared
*view*. Written with `replaceState` — toggling a filter pill is not navigation.
Deliberately readable rather than compact; it is five parameters, not a hundred,
and someone should be able to edit it by hand.

### 7. Robustness and access — **fixed**

`ErrorBoundary` per route, so a WASM parse failure in the explorer shows a
message inside the explorer instead of white-screening the index. Grid cards are
real tab stops with `role="button"` and Enter/Space handling. The lightbox got
`role="dialog"`, an Escape handler, and focus that moves in on open and returns
on close.

### 8. Code splitting — **fixed**

See the table above.

### 9. The sync pipeline's copies — **fixed**

`downloadRepo` allocates once against `content-length` and fills in place
instead of collecting chunks and concatenating (that alone was a second full
copy of the CAR). `filterPostsToBytes` replaces the
`split` → `filter` → `join` → `encode` chain with a single indexOf walk that
encodes straight into a growing byte buffer, removing an array of ~225,000
substrings and two more full copies. `ingestNdjson` takes those bytes directly.
The selftest holds the new implementation byte-for-byte against the old one.

`fetchEngagement` now runs four batches concurrently instead of strictly
serially, and skips uploaded images, which have no post to ask about — 120
serial round trips for a 3,000-image repo becomes 30 waves.

### 10. Third-party CDN code — **decided, not closed**

DuckDB-Wasm and apache-arrow load from jsdelivr at runtime and cannot carry SRI
(there is no integrity attribute for a dynamic `import()` or an import map),
in an origin holding the `*.mino.mobi` OAuth cookie.

The decision: accept the dependency, reduce the blast radius. The BYOK API key
moved from `localStorage` to `sessionStorage` — a compromised CDN response can
now reach one tab's key rather than a permanent one — and the settings panel
says where the key is kept and that requests go straight to the provider.
Vendoring DuckDB into `public/vendor/`, as `ffmpeg` already is, remains the real
fix; it is ~30 MB of wasm and wants its own change. Reasoning is written into
`photo/CLAUDE.md` so the next person inherits a decision rather than a smell.

### 11. The stale review — **fixed by rewriting it**

This document. The previous version described app-password auth, Pages hosting,
an embeddings/RAG Sleuth and a deploy branch three handovers old.

---

## Two bugs the selftest found on its first run

Both were latent — no report, no symptom anyone had traced — and both were
uncovered by testing extracted code against its own claims.

**`ensureCid` misread one blob reference in sixteen.** It asked "does this start
with `b` or `Q` and run past 40 characters?" *before* checking for a bare
sha-256 hex. A digest whose first nibble is `b` satisfies that, so roughly 1/16
of hex-form refs were declared already-a-CID and passed through unconverted,
producing a URL the PDS rejects. The two forms are unambiguous in the other
order (a digest is exactly 64 hex characters; a raw CIDv1 is 59), so the fix is
the ordering.

**`cidFromRef` could return a function.** The `$link` fallback chain ended
`?? ref.link ?? (typeof ref === 'string' ? ref : null)` — but `'abc'.link` is
`String.prototype.link`, a legacy HTML-wrapper method every string carries. A
bare-string blob ref therefore yielded a *function*, which would have been
stringified into an image URL. The string case is now checked first, and
`duckdb.js`'s two hand-rolled copies of the same chain were replaced with calls
to it.

---

## What is still open

- **Vendoring DuckDB** (finding 10's real fix).
- **The sync pipeline on a real device.** The allocation analysis is from the
  code; nobody has profiled a large repo on mobile Safari. `performance.memory`
  is Chrome-only, so `lib/memory.js`'s old budget maths never worked there
  either — which is part of why it was deleted rather than kept.
- **The OpenAI model list** in `lib/llm.js` is over a year old. Out of scope for
  this pass, which only checked the Claude IDs against the published schedule.
- **`#/codescan` and `#/thread` have no selftest coverage** beyond `thread.js`'s
  parser. Their components are still doing work that could be pulled into `lib/`.

## What was verified, and how

Measured: the missing CORS header, the 1.5 MB/286 kB blob comparison, the bundle
split, the catalogue against the filesystem, and every assertion in
`photo.selftest.mjs`. Driven in a headless browser against the production build:
the landing page, all four lazy routes, the home link, the theme toggle,
keyboard tab order, and a shared URL-state link surviving a reload — with no
console errors.

Not verified: a real sync against a real repo (the sandbox's browser has no
outbound network), so the pipeline changes are proved by the selftest and by
reading, not by a live download. Finding 2's 404 is from the published
retirement schedule; there is no API key here to observe it.

---

## Postscript, 2026-08-01: two of the four left

The audit above treats `#/thread` and `#/sleuth` as part of this surface. They
are not, and were not: both read Bluesky **text**, and were here only because
this is where they got written. They moved to `b.mino.mobi`, the surface that
collects the Bluesky tools — `worker.js` 301s the old paths and
`src/lib/route.js` translates the old fragment deep links.

So finding 4's "no selftest" and finding 8's code-splitting table both describe
a surface that is now three routes rather than five. The coverage went with the
code: `b/thread/thread.selftest.mjs` and `b/sleuth/sleuth.selftest.mjs`.
