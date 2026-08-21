# hose — hose.mino.mobi

<!-- SEEDED by scripts/gen-surface-docs.mjs from deploy-registry.json.
     This file is now HAND-OWNED — edit it directly; the script will not
     overwrite it. It is the instruction set for THIS surface. Repo-wide rules
     live in ../../CLAUDE.md; the index of all surfaces is ../../docs/SURFACES.md. -->

A Bluesky feed-generator service whose input is the firehose itself. Headless —
no static assets, no database, one Durable Object.

## Facts

| | |
|---|---|
| Surface | `hose` |
| Dir | `workers/hose/` |
| Endpoint | `hose.mino.mobi` |
| Service DID | `did:web:hose.mino.mobi` |
| Type | backend |
| Owning branch | `claude/txt-airports-bluesky-feed-pu4pbh` |
| Deploy | `.github/workflows/deploy-hose.yml` |
| Uses | — |
| Provides | `hose.mino.mobi` |

Machine-readable entry: [`deploy-registry.json`](../../deploy-registry.json) → `surfaces[]` where `surface == "hose"`.

## Why this exists at all

`b.mino.mobi/feedgen` already builds and serves custom feeds, statelessly, for
free. This surface exists because there is one shape of feed it structurally
cannot serve.

A feed like **txt for airports** is defined almost entirely by *subtraction*:
not politics, not porn, not video, not a reply, not a quote, not in this bot
list, not in a language I don't read. The only positive requirement is that the
text contains a space. There is no search term for "everything else", and no
list or author that enumerates it — so a stateless evaluator that has to *ask*
the AppView a question has nothing to ask.

The only way to serve that feed is to see every post and subtract. That means
holding the firehose open, which means state, which means this surface.

**The dividing line:** a feed you can express as a query (search, list, author)
belongs on `b`. A feed you can only express as a subtraction belongs here. The
ingester ignores any registered feed whose def has no `firehose` input, so the
two never fight over the same feed.

## How it works

One Durable Object (`FirehoseIngest`, singleton, id `main`) holds one WebSocket
to Jetstream, filtered server-side to `app.bsky.feed.post`. Every `create`
commit is normalised and run through each registered feed's filters *as it
arrives*; matches append to that feed's ring buffer. `getFeedSkeleton` pages the
ring. Nothing is recomputed at read time.

```
jetstream ──▶ FirehoseIngest.onMessage ──▶ fromCommit() ──▶ passes(def.filters)
                                                                   │
                                          ring buffer (2000/feed) ◀┘
                                                   │
      getFeedSkeleton ──▶ DO /page ──▶ newest-first slice inside the def's window
```

### Where a feed's definition comes from

Resolved from the owner's PDS, in this order:

1. **`com.minomobi.feedgen.def`** at the same rkey as the generator record —
   what `b.mino.mobi/feedgen` publishes.
2. **`skyfeedBuilder`** still sitting on the `app.bsky.feed.generator` record —
   what every feed built in SkyFeed already has, converted on the fly by
   [`packages/feedgen/skyfeed.js`](../../packages/feedgen/skyfeed.js).

(2) is the migration story, and it is the whole point: SkyFeed went
unmaintained, but the definitions it wrote are still records on their owners'
PDSs. A feed moves here by repointing **one field** (`did`) on a record its
owner already controls. Same feed URL, same likes, same subscribers.

Definitions are re-read every 5 minutes. **Editing a feed's filters clears its
buffer** — everything already ingested was admitted under the old rules, so
leaving it would mean adding a "no video" filter and still seeing a day of
video, which is the exact complaint this surface was built to fix.

### One predicate, two shapes

The filter implementation is **not** in this directory. It is
[`packages/feedgen/match.js`](../../packages/feedgen/match.js), shared with
`b/feedgen/pipeline.js`, because the same filters must run over two input
shapes that have nothing in common:

| | shape | engagement counts |
|---|---|---|
| `b` preview / search-list-author inputs | hydrated `postView` | real |
| here | raw Jetstream commit | **unknown — the post is one second old** |

Both normalise to one record shape and call one `passes()`. If those ever
diverge, a feed's preview on `b` silently stops describing what this service
serves. `packages/feedgen/feedgen.selftest.mjs` walks the txt-for-airports
filter chain one filter at a time against both shapes and asserts they agree —
**run it before touching either side.**

Unknown counts are `null`, and an engagement filter facing `null` *defers*
rather than guessing. `needsHydration(def)` tells `worker.js` to fetch real
counts for the page it is about to serve — only for the page, and only when the
def actually asks for engagement.

### Bounds, and why each one is there

| Bound | Value | Why |
|---|---|---|
| ring buffer | 2000 URIs/feed | nobody pages that deep; the cap is what makes memory predictable |
| storage chunk | 400 entries/key | DO values cap at 128KB — 400 lands around 45KB |
| replay on reconnect | ≤ 5 min | a cold object should catch up in seconds, not chew through a day |
| list membership | ≤ 5000 DIDs, 1h TTL | a runaway list degrades one filter, not the ingester |
| idle feed drop | 7 days | a feed nobody opens stops costing anything |
| def re-read | 5 min | fast enough that an edit feels live |

**A list that fails to load is skipped, not treated as empty.** Silently
emptying somebody's feed because a `getList` call 500'd is worse than briefly
leaving a bot in it.

## The running cost

This object is **deliberately never idle.** A 30-second alarm keeps it resident
so the WebSocket stays up, and re-arms itself in a `finally`. The cron in
`wrangler.jsonc` is only a backstop that restarts the chain if it is ever
broken.

That heartbeat is the bill. Everything else here is bounded on purpose so the
cost cannot surprise. If this surface ever needs to be switched off, deleting
the worker stops it — and every feed pointing at `did:web:hose.mino.mobi` goes
dark, so repoint the records first.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/did.json` | the service DID document — what feed records point at |
| `GET /xrpc/app.bsky.feed.getFeedSkeleton` | the feed (`?feed=`, `?limit=`, `?cursor=` as an integer offset) |
| `GET /xrpc/app.bsky.feed.describeFeedGenerator` | the firehose feeds currently registered |
| `GET /api/import?feed=<at-uri\|bsky.app url>` | convert a live SkyFeed feed to a def and show what the port drops — publishes nothing |
| `GET /status` | connection, counters, per-feed buffer depth, list sizes, converter warnings |
| `GET /health` | 200 only when connected *and* an event arrived in the last 60s; 503 otherwise |

`/health` is intentionally strict — a connected socket with no traffic is a
dead feed. It is 503 on a cold start, which is why the deploy workflow reports
it separately and does not fail on it. The **domain binding** check is the one
that fails the deploy.

## Porting a feed

```bash
node workers/hose/port-skyfeed.mjs <at-uri | bsky.app feed url> [--video] [--out DIR]
```

Reads the live generator record, converts it, and writes the two records that
make the feed real. Read-only against the network — it never writes to a PDS,
because that needs the owner's credentials and is their call. `--video` appends
the `media / video / none` filter SkyFeed never had.

Conversion is lossy in a **loud** way: anything that doesn't map comes back in
`warnings` rather than being dropped quietly. `image_count` is the one to watch
— SkyFeed spells "how many images" as removable buckets, and only the
combination that removes every non-zero bucket is exactly "no images".

## Gotchas

- **`sort: top` is not available on a firehose input.** Ranking by likes needs
  counts the ingester does not have; firehose feeds serve newest-first.
- **No backfill.** A newly registered feed starts empty and fills from live
  traffic. `SEED_FEEDS` in `wrangler.jsonc` pre-registers feeds at startup so
  their ring is warm before anyone opens them — use it rather than explaining
  an empty feed.
- **Reposts never appear.** A repost is its own `app.bsky.feed.repost` record
  and this service only ingests posts, so `removeReposts` is a no-op here.
- The def's `limit` does not bound the ring — `MAX_PER_FEED` does.

## Deploying

Pushes to `claude/txt-airports-bluesky-feed-pu4pbh` that touch `workers/hose/**`
or `packages/feedgen/**` trigger
[`.github/workflows/deploy-hose.yml`](../../.github/workflows/deploy-hose.yml).
The sandbox cannot reach Cloudflare — **push to the trigger branch, don't
`wrangler deploy` locally**.

Note the `paths:` includes `packages/feedgen/**`: the shared matcher is bundled
into this worker, so a change there must redeploy this surface or the two ends
drift. It is imported as `../../packages/feedgen/*.js` and bundled by wrangler
from the checked-out repo — nothing is staged.

Read [`docs/DEPLOYS.md`](../../docs/DEPLOYS.md), especially the golden rule: the
`wrangler.jsonc` `name` must be the worker that owns the live custom domain, or
the deploy goes green while the site never changes. The workflow enforces it —
it fails unless `hose.mino.mobi/.well-known/did.json` comes back naming
`did:web:hose.mino.mobi`.
