# Reading a repo: every CAR reader in the monorepo, and what to do about each

Audited 2026-11-27, when rite's seven repo tools moved off the WASM parser.
**The rule this document argues for:** stream the download, decode only the
blocks you need, keep only the fields you read. A repo is mostly likes and
follows, and a post is mostly media metadata no text tool reads.

## The two patterns

**Bad: buffer, parse everything, split.** Collect every chunk, concatenate,
copy into WASM memory, have the Rust parser (`os/crates/car-parser/`) decode
EVERY block and serialise EVERY record to one NDJSON string, then
`ndjson.split('\n')` and `JSON.parse` the lines you want. Measured on a 95 MB /
246k-record repo (`minormobius.bsky.social`):
- **1.77 GB peak renderer memory** for one rite/atlas read in Chromium;
- 8.3 s in node, +1.4 GB RSS, and a ~243 MB NDJSON string.

**Good: the sieve** (`packages/atproto/car.js`, `createSieve` / `sieveRepo`).
- **Streams:** one network chunk plus an incomplete block at a time.
- **No MST walk:** MST prefix compression is node-local, so key→CID is
  collected from whatever nodes stream past and joined at the end.
- **Anchored sniff:** a block is decoded only if it contains the wanted
  `$type` *with its CBOR length header*. A like's `subject.uri` contains
  `app.bsky.feed.post` too, but never behind `0x72`.
- **Reducers:** a per-collection reducer keeps only what the caller reads,
  and that is where media is discarded.

Same repo, same outputs, field for field and thread for thread:
- **296 MB** peak renderer;
- 1.6 s in node, +114 MB;
- 123k of 312k blocks decoded.

`createReader` / `streamRepo` in the same file are palm's posts-only form.

## Every reader

| # | Where | Surface (owner) | Pattern | Uses | Status |
|---|---|---|---|---|---|
| 1 | `rite/lib/atproto/index.js` `pullProfile` → redact, ask, atlas, lexicon, list, web, signal | rite (this branch) | was BAD | post text, createdAt, reply/quote targets, embed `$type`, link facets, external cards; signal: reposts only | **fixed 2026-11-27**: sieve, media discarded, signal decodes no posts |
| 2 | `b/lathe/runtime.js` `archive` source | b (this branch) | BAD on a cache miss | text, createdAt, facets, image CIDs + alt, reply DID | **next**: sieve with lathe's `normRepoPost` as the reducer |
| 3 | `b/coin/lexicon.js` (`virgin` rule) | b (this branch) | BAD, first run per week | post text only (→ a word Set) | **next**: sieve, reducer = text |
| 4 | `lab/www/open-tab/index.html:185` | lab (`claude/lab-www`) | WORST: `JSON.parse` on every line, no prefilter | `rkey` + `text` | quick fix: prefilter; right fix: vendor the sieve into `lab/_kit/` (the lab content gate pins the parser import, `lab-smoke.selftest.mjs`) |
| 5 | `photo/src/lib/repo.js`, `Explorer.jsx` | photo (`claude/usda-fruit-paintings-dashboard-kxn1c1`) | half-fixed: preallocates from content-length, still NDJSON of everything | posts with media embeds → DuckDB | sieve for posts, a reducer that keeps media embeds in the WASM's JSON shape (`$link` CIDs); medium risk, DuckDB expects the full value |
| 6 | `os/src/lib/repo.js`, `terminal/commands/sync.js` | os (`claude/codex-container-auth-sngj6k`) | everything, by design (a SQL console over the whole repo) | everything | keep the WASM; adopt photo's preallocation, drop the `split('\n')` that only counts lines (`sync.js:74`) |
| 7 | `b/palm/car-stream.js` | b | GOOD (the reference) | posts | now synced byte-identical by `sync-dataviz.mjs` (it had drifted) |
| 8 | `b/orbit/repo-scan.js` | b | GOOD | like/repost/post tallies for a ring | could move onto `createSieve`; no hurry |
| 9 | `b/days/repoindex.js` | b | GOOD | MST keys counted into days; posts | fine |
| 10 | `silk/word/car.mjs` | silk (`claude/spiderweb-physarium-agent-ta17v4`) | GOOD, independent decoder | post type/text/createdAt/reply | a sixth copy of varint/CID/CBOR; fold into the package when next touched |
| 11 | `scripts/lib/portrait.mjs`, `scripts/lab-dossier.mjs` | node | GOOD (`streamRepo`) | posts | fine |
| 12 | `packages/whetstone/run.mjs:75` | node | buffers then `readCar` | posts | one-line switch to `streamRepo` |
| 13 | `packages/homunculus/harvest.mjs` + `car.mjs` | node | own decoder, decodes every record of every collection | posts (+ counts) | `createSieve` with a reducer that keeps langs, reply root, quote uri, facets |
| 14 | `studio/tools/lecture-record.mjs` | node, offline | decodes every block | posts, likes, reposts, follows | `createSieve` for those four; low value (offline) |
| 15 | `b/palm/build-baseline.mjs` | node | `createReader` | posts | fine |

Nothing under `workers/` reads a CAR. `bsky/lib/archive.js` mentions
car-stream but replays Jetstream archives.

## Copies

- **The WASM parser** ships as five byte-identical copies (md5 `2e364a54…`):
  `rite/lib/atproto/wasm/`, `photo/src/wasm/`, `os/src/wasm/`, `lab/_kit/wasm/`
  and `imp/ab/_kit/wasm/`. The last has no importer. `b/lib/atproto/` is a
  sixth, staged from rite at deploy for lathe and coin. **rite's copy must
  stay until lathe and coin move off it.**
- **The sieve** is canonical at `packages/atproto/car.js`, served as
  `b/palm/car-stream.js` and `rite/lib/atproto/car.js`, all three checked by
  `scripts/sync-dataviz.mjs --check`, which preflight runs. Edit the package,
  then `--write`.

## Order of work

1. ~~rite~~ (done).
2. lathe and coin. Both are on b, owned here. Once both move, b's deploy
   stops staging rite's WASM, and rite's `wasm/` can go.
3. lab/open-tab: needs its owner and a lab gate change.
4. photo: needs its owner.
5. os tidy-ups, then the node scripts.
