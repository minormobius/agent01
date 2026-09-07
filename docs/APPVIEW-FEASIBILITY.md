# Building an AppView — feasibility

**Date:** 2026-09-05
**Question:** what does it take to build a Bluesky AppView? Can it be frontend-only, and if not, how demanding is the backend?
**Answer in one line:** three of the four things people mean by "AppView" are frontend-only or nearly so and fit this repo's stack today; the fourth is a 16 TB pet server and a 24/7 on-call rotation, and it is off-strategy here.

---

## 1. What an AppView actually is

In ATProto the write side and read side are split:

- **PDS** — holds a user's repo. Authoritative. Federated. Anyone can read public records from one over CORS, no auth.
- **Relay** — crawls every PDS and emits one firehose of every commit on the network.
- **AppView** — subscribes to the firehose, indexes everything into its own database, and serves the `app.bsky.*` read endpoints (`getTimeline`, `getPostThread`, `getAuthorFeed`, `searchPosts`, notifications…). Bluesky runs the one at `public.api.bsky.app`.

So an AppView is **a read-side aggregator**: it exists to answer questions no single repo can answer. "How many likes does this post have" is a network-wide reverse index. "What's in my timeline" is a fan-in across every account I follow. That aggregation is the entire cost. Everything else is a client.

The load-bearing consequence: **you only need to build an AppView for the questions that need global knowledge.** Most of what a social app does is not that.

## 2. The four tiers

| Tier | What it is | Backend | Marginal cost | Where this repo already is |
|---|---|---|---|---|
| **0** | Client on Bluesky's public AppView | none | £0 | ~20 surfaces (empathy, judge, cluster, seek, ternary…) |
| **1** | **Frontend-only AppView** — own index built in the browser from PDSes + public indexes | none | £0 | `b/disk`, `b/dyad`, `b/spark`, `wave` |
| **2** | **Scoped AppView** — a real index, but of a slice of the network | Worker + DO + D1 | ~£0 on the existing bill | `workers/feed`, `b/squares` |
| **3** | **Full-network AppView** — drop-in replacement for `public.api.bsky.app` | dedicated hardware | ~$200/mo + months | nothing, and deliberately |

## 3. Tier 1 — yes, frontend-only is real

This is the answer people don't expect. A browser can assemble a genuinely independent view of the network because three public services already do the aggregation, for free, for every lexicon:

| Need | Service | Notes |
|---|---|---|
| source records | any PDS, `com.atproto.repo.listRecords` / `com.atproto.sync.getRepo` | CORS-open, unauthenticated for public data. `packages/atproto/pds.js` wraps it |
| **backlinks** — who liked this, who replied, who follows X | **Constellation** (`constellation.microcosm.blue`) | a global backlink index as plain JSON. Works for *every* lexicon, including your own. Runs on a Raspberry Pi at <2 GiB/day — that is how cheap this problem is when you index only links |
| live events | **Jetstream v2** WebSocket | straight into the browser, unauthenticated. The `dids` filter takes **up to 10,000 accounts and filters server-side**, so a personal timeline is one socket rather than one request per follow. This is the piece that removes the backend |
| hydration (profiles, embeds) | `public.api.bsky.app` | use it as a CDN for display data while your own logic does the ranking |
| local analytics over it all | DuckDB-WASM | `b/disk` already loads Arrow + DuckDB from CDN and queries in-tab |

`workers/feed` already calls Constellation server-side for engagement signals. Nothing about that call needs a server.

**What you get:** your own ranking, your own moderation stance, your own thread assembly, your own lexicons, your own definition of "timeline". That is what "our own AppView" usually means in practice.

**What you do not get, and cannot:**

- **Full-text search across the network.** Needs an inverted index over everything. No way around a backend.
- **Cheap cold start on a wide graph.** A timeline over 300 follows is 300 `listRecords` calls. Tens of seconds, and rate limits bite. Mitigate with IndexedDB caching, a seeded cursor (`b/spark` synthesises a TID to seek into a repo — steal that), and bounded concurrency.
- **Notifications while the tab is closed.** Fan-in needs a server that is awake.
- **History older than ~36 hours.** Inside that window it is free (next section); outside it, the archive needs a key and a synchronous zstd, so it is the worker's job. Backfilling one busy repo in-browser is fine; backfilling a thousand is not.

### Jetstream v2 changes where the line falls

This is worth separating out, because it moves the boundary between tiers and it
is easy to miss: **Jetstream v2 replays history, not just the live tail.** It
keeps a compressed archive of the whole network and serves it through the same
JSON shape as the live stream, so a consumer starts in the past and cuts over to
real time in one loop, with the seam deduplicated for it. `afterSeq: 0` means
"from the beginning of the archive". That is the backfill problem — the one that
costs 16 TB and a month of crawling at Tier 3 — offered as an API.

The catch is exactly one thing, and it decides the architecture:

| | Transport | Auth | Metered |
|---|---|---|---|
| **live tail** | WebSocket `subscribeEvents` | **none** | no |
| **replay** | WebSocket + HTTP (plan, download, tail) | **API key** | **yes, in bytes** |
| **snapshot** | HTTP only | **API key** | **yes, in bytes** |

An API key in a static page is a published key, so the archive belongs behind a
worker route that holds the secret.

**But most people never need the archive.** The live tail's `cursor` also accepts
a unix-microsecond timestamp, which the server translates to the nearest seq — so
the recent past replays over the same unauthenticated socket, and cuts over to
live with no seam. Measured 2026-09-05:

| Ask | Result |
|---|---|
| 6h back, no DID filter | 929,657 events in 40s (~23k/s); caught up to live in ~30s |
| 6h back, 90 accounts | 494 posts; caught up to live in **under 10s** |
| 24h back, 90 accounts | 1,635 posts, backfill done in seconds |

**The window is ~36 hours** — 12h, 24h, 30h and 36h were all honoured to the
minute; 48h, 72h and 168h all came back at ~36.8h. And here is the trap: past the
window the server **clamps silently**. No error, no warning, no flag on the
stream. A client that offers "last week" and renders what arrives will show a day
and a half and look perfectly correct.

So the line is not live-vs-history. It is **inside the window vs outside it**:

- **≤36h of history: Tier 1.** No key, no account, no backend, no fan-out.
- **>36h: Tier 1.5.** The byte-metered archive, behind a worker holding the key.

For a timeline app, 36 hours is usually the whole product.

Two practical notes for this repo:

- **Our Jetstream consumers are on v1.** `wave/src/jetstream.ts` and `b/disk`
  both hardcode `jetstream2.us-east.bsky.network` — a legacy host, `/subscribe`,
  `wantedDids`/`wantedCollections`, microsecond cursors, flat event shape. v2 is
  `jetstream.<region>`, `/xrpc/network.bsky.jetstream.subscribeEvents`,
  `dids`/`collections`/`kinds`, `seq` cursors, and every event wrapped in
  `{$type, payload}`. This widens **F-11** in
  [`SOCIAL-STACK-AUDIT.md`](SOCIAL-STACK-AUDIT.md) from "hardcoded host" to
  "hardcoded *legacy* host": `packages/atproto/jetstream.js` is the v2 client to
  migrate onto.
- **The archive needs a synchronous zstd, which browsers do not have.** Segments
  are zstd-compressed, and the official `@bsky/jetstream` SDK abstracts a runtime
  for exactly this reason: its Node branch uses `zlib.zstdDecompressSync`, and its
  browser branch ships **no default at all** ("may throw where the platform has no
  zstd"; sha256 likewise, because WebCrypto is async-only and the archive's `cid`
  getter is sync). So deep history could not run in the page even if the key were
  free. It can run in a Worker: `nodejs_compat` on workerd provides both —
  verified locally with `wrangler dev`, a zstd round-trip and a sync sha256. Two
  independent reasons the archive lives in the worker, not the browser.
- **Delivery is at-least-once and the cursor is inclusive**, in replay and live
  alike, so every consumer must be idempotent — key on the record's `at://` URI.
  Account-level events (`identity`, `account`, `sync`) carry no collection and
  are delivered even to a collection-filtered consumer on purpose; drop them and
  you will miss account deletions.

### The key does not have to be ours

"An API key in a static page is a published key" is true of *our* key. It says
nothing about **the user's own key**, which is a different object entirely: they
mint it, it lives in their browser, it spends their quota, and it is never
published to anyone. `b/sleuth` already ships this pattern ("bring your own API
key"), so it is house style, not a novelty.

That reframes the whole archive question, and every link was checked on
2026-09-05:

| Link | Status |
|---|---|
| Getting a key | Free, Bluesky auth, manual at [bsky.network/account](https://bsky.network/account). **No minting API** — `createApiKey`-style NSIDs all 404, so it is one paste per user, forever |
| Browser → archive, cross-origin | `access-control-allow-origin: *`, with `Authorization`, `Range` and `If-Range` in `allow-headers` — a deliberate decision to admit browsers |
| Seeing your own budget | `Headwind-Quota-Refill-Bytes`, `-Period-Seconds`, `-Burst-Bytes` are in `access-control-expose-headers`, so a page can show the user their own spend |
| zstd in the browser | Segments are dictionary-compressed. `fzstd` (pure JS) **throws `invalid zstd data`** on a dictionary frame — measured. `@bokuweb/zstd-wasm` documents dictionary support |
| The dictionary | `getZstdDictionary` returns 64 KiB **unauthenticated**, ETag `zstd-dict-20260811`, magic `37a430ec` — a real zstd dictionary, free to fetch |
| Decoding `.jss` | `@bsky/jetstream` ships a browser branch on purpose. Its `#runtime` condition resolves `node`→node, `default`→browser, and the browser defaults throw text that *is* the instruction: "supply your own Decompressor via Jetstream options (decompressor)". `live()` never touches them; only `snapshot()/replay()` do |

So a fully client-side AppView — live, the 36h window, **and** deep archive — is
buildable today with no server at all, provided the user brings their own key.
Bluesky appears to have designed for exactly this: the CORS policy, the exposed
quota headers, the unauthenticated dictionary and the injectable browser runtime
are not accidents.

**What our worker's key is actually for**, then: our own server-side jobs. It is
not the path for users, and routing users through it would only pool everyone's
spend onto one quota while making us the custodian of a credential nobody needed
us to hold.

One correction to §6 below, from measurement: a dictionary mismatch throws
`Dictionary mismatch` rather than producing plausible garbage. Silent corruption
remains the risk in a hand-written entropy decoder; it is not the risk here.

## 4. Tier 2 — a scoped AppView, which is where the value is

Index a *slice*: a set of DIDs, one community, one lexicon namespace. Jetstream filters server-side via `wantedDids` / `wantedCollections`, so you only receive your slice.

Shape on this stack: a Durable Object holds the Jetstream socket, filters, and writes to D1; a Worker serves the read endpoints. This is exactly `workers/feed` (cron + D1 + KV + Constellation) already, just generalised.

Constraints to respect:
- **D1 is ~10 GB per database** and `atpolls-db` is already shared by poll, feed, rite, airchat. A new index gets **its own D1**, with a retention policy written down before it ships, not after.
- A DO holding a WebSocket bills for duration. Filter hard; one DO for the surface, not one per client.
- Jetstream's host is hardcoded across the repo (`jetstream2.us-east.bsky.network`) — flagged as **F-11** in [`SOCIAL-STACK-AUDIT.md`](SOCIAL-STACK-AUDIT.md). Any new consumer should take a fallback list.

Cost: effectively zero above the current bill. Effort: days, not months. **This is the recommendation.**

## 5. Tier 3 — the full-network AppView

Don't write one. [`zeppelin-social/bluesky-appview`](https://github.com/zeppelin-social/bluesky-appview) packages Bluesky's own AppView for self-hosting, and [`backfill-bsky`](https://github.com/zeppelin-social/backfill-bsky) does the historical load. Blacksky maintains a performance-optimised fork.

Note that the numbers below predate Jetstream v2's replay, which is the part of
Tier 3 they mostly measure — a full-network backfill is now a metered download
rather than a crawl you build. Storage, the indexer's throughput problem, and
everything in §6 are unchanged.

Real numbers, from the person who did it ([futur.blue, 2025-06](https://whtwnd.com/futur.blue/3ls7sbvpsqc2w)):

| | |
|---|---|
| Machine | Hetzner auction box — Ryzen 9 5950X, 8×3.84 TB SSD, 128 GB RAM ("really only the storage is needed") |
| Storage in use | **16 TB** as of mid-2025, growing |
| RAM in steady state | under 32 GB; backfill wants more |
| Cost | **~$200/mo**, almost all storage |
| Backfill | ~1 month hand-rolled; **~3 days** with `backfill-bsky` |
| Total effort | **~6 months**, including ~7 rewrites of the indexer |
| Firehose rate | ~400 events/s baseline, ~4,000 peak |
| Data lost | a few hundred thousand to a few million records out of tens of billions |

Dependencies are not small: Postgres (with a custom `pg_repack`), Redis, PgBouncer, OpenSearch, a PLC mirror, plus the indexer and label-muncher services.

For scale context, Bluesky's own AppView runs two ScyllaDB clusters (one per coast), 8 nodes each, 384 threads / 1.5 TB RAM / 360 TB NVMe **per node**. You need one cluster's worth of capability, not two, but that is the shape of the thing you are approximating.

**The hardest part is not storage or backfill — it is keeping up.** The reference indexer tops out around 200 events/s against a network doing 400 sustained and 4,000 at peak. Fall behind and you don't just lag: the relay's replay window is finite, you drop off the end of it, and you are back to backfill. Their fix was moving the indexer from Node to Deno for a ~4× throughput win. That is the flavour of problem you are signing up for.

## 6. What everyone underestimates

Ranked by how badly it bites, independent of tier:

1. **Moderation is not a feature, it's the substrate.** Labels from labelers (`com.atproto.label.subscribeLabels`), takedowns, blocks, mutes, mutelists. Blocks are bidirectional and enforced *on read* — they prune threads, hide replies in both directions, and suppress notifications. Get this wrong and it is a safety incident, not a bug. At Tier 3 you are serving a full mirror of the network's content from your own IP, which makes takedown compliance and the worst of the network **your** legal problem. This alone is the argument against Tier 3 here.
2. **Viewer state.** Every response is personalised — `viewer: {like, repost, following, blocking, muted}`. Hydration does N graph lookups per response. This is what turns a storage problem into a database problem.
3. **Write amplification on counts.** Likes outnumber posts by roughly an order of magnitude, and every one mutates a counter somewhere.
4. **Identity churn.** Handle changes, DID rotation, `plc.directory` rate limits. Zeppelin ships a PLC mirror because "decent odds you'll get rate limited" otherwise.
5. **Lexicon drift.** `app.bsky.*` keeps moving. A drop-in replacement is a permanent maintenance commitment to chasing someone else's schema. A *scoped* AppView over your own lexicons has no such treadmill.
6. **Thread assembly.** `getPostThread` walks up parents and down replies with block/mute pruning at every node. Deceptively expensive.

## 7. Recommendation for this repo

Tier 1 and Tier 2 — and they compose. A frontend-only AppView surface (`packages/atproto/pds.js` + a new `constellation.js` helper + the Jetstream client + DuckDB-WASM, OAuth through `auth.mino.mobi` for writes) is a normal week's work here and costs nothing to run. Where a specific question turns out to need global knowledge, promote *that question* to a scoped Tier-2 index in a Worker, the way `workers/feed` did for community detection.

Tier 3 is the first thing this repo would own that needs a pet server, a process that must never fall behind, and a moderation posture with legal exposure. 86 surfaces currently share one Cloudflare account and no 24/7 anything. That is a deliberate property worth keeping.

**Built on this branch:** `bsky.mino.mobi` ([`bsky/`](../bsky/)) is the Tier-1 surface, with the Tier-1.5 replay route stubbed and inert; `packages/atproto/constellation.js` and `packages/atproto/jetstream.js` are the two shared helpers it needed. What remains: add `constellation.js` to `packages/atproto/` — done — and migrate `wave` and `b/disk` off the v1 host onto the shared v2 client.

---

### Verified vs. not

Verified from the repo: the existing Jetstream, Constellation, DuckDB-WASM and repo-scan usage; D1 sharing; surface counts. Verified from public sources on the date above: the zeppelin/backfill tooling, the self-host numbers, Jetstream volumes, Constellation's API and footprint. **Since verified (2026-09-05):** Constellation's `/links`, `/links/all` and `/links/count/distinct-dids` were queried live and the helper's numbers check out; Jetstream v2's `planSnapshot` and `listSegments` return `401 invalid bearer credential` without a key, confirming the auth boundary above. The Jetstream v2 live tail was then driven end to end from node: the subprotocol handshake, the `{$type, payload}` envelope, `seq` cursors, deletes arriving without a record, and the `dids` filter holding across 90 accounts on one socket. `bsky.mino.mobi` is deployed and its run log binds the custom domain. The timestamp-cursor backfill, its ~36h boundary and its silent clamp were then measured directly, as were the rates in the table above; workerd's zstd and sync sha256 were verified with a local `wrangler dev`. **Still not verified:** the page in a real browser, the archive path itself (no API key), and no cost was modelled against the actual Cloudflare bill. The Tier-3 figures are one operator's report from mid-2025 and the network has grown since; treat them as a floor.

### Sources

- [Jetstream v2 docs](https://bsky.network/docs/jetstream/) and [Network Replay](https://bsky.network/docs/jetstream-replay/) — the v2 filters, limits, event envelope, and the API-key/metering rules
- [Introducing Jetstream](https://docs.bsky.app/blog/jetstream) · [Jetstream: shrinking the firehose by >99%](https://jazco.dev/2024/09/24/jetstream/) — 232 GB/day → 41 GB/day, event rates
- [Constellation](https://constellation.microcosm.blue/) · [microcosm](https://www.microcosm.blue/) · [microcosm-rs](https://github.com/at-microcosm/microcosm-rs/tree/main/constellation) — the backlink index
- [zeppelin-social/bluesky-appview](https://github.com/zeppelin-social/bluesky-appview) · [backfill-bsky](https://github.com/zeppelin-social/backfill-bsky) · [blacksky fork](https://github.com/blacksky-algorithms/atproto)
- [in and out, quick appview adventure — futur.blue](https://whtwnd.com/futur.blue/3ls7sbvpsqc2w) — the $200/mo, 16 TB, 6-month account
- [How to self-host all of Bluesky (except the AppView) — alice.bsky.sh](https://alice.bsky.sh/post/3laega7icmi2q)
