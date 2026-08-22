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

One Durable Object (`FirehoseIngest`, singleton, id `main`). Every
`SAMPLE_EVERY_MINUTES` it wakes, opens a WebSocket to Jetstream filtered
server-side to `app.bsky.feed.post`, listens for `SAMPLE_SECONDS`, closes, and
goes back to sleep. Each `create` commit seen during that window is normalised
and run through every registered feed's filters as it arrives; matches append to
that feed's ring buffer. `getFeedSkeleton` pages the ring — nothing is
recomputed at read time, and **reading a feed never opens the firehose**, or a
popular feed would undo the duty cycle by itself.

```
  every ~60min ──▶ open jetstream ──┐
                                    │  20s
   fromCommit() ◀── onMessage ◀─────┘
        │
   passes(def.filters) ──▶ chunked ring (~2000/feed) ──▶ flush changed chunk ──▶ sleep
                                       │
   getFeedSkeleton ──▶ DO /page ──▶ newest-first slice inside the def's window
```

### It samples; it does not drink all of it

Measured, the post firehose is **38.8 creates/second** — 100M messages a month —
and a socket held open permanently means a Durable Object that is never evicted,
which alone consumes ~84% of the account's entire duration allowance. For an
ambient feed nobody reads exhaustively, paying to observe every post on Bluesky
is a bad trade.

At the default 20s/hour the object is connected **4 hours a month instead of
720**, sees ~0.5% of the network, and still collects **~680 matching posts a
day** — more than anyone scrolls. The ring turns over completely every ~3 days.

**A feed like this is a mood, not an index.** If you ever need completeness, the
knobs are below and the arithmetic is in *The running cost* — but read it first,
because the binding constraint is requests, not duration, and it is not obvious.

Wake times are **jittered** (0.5×–1.5× the interval). Sampling at a fixed offset
past the hour would make the feed a permanent portrait of whatever the network
does in that one 20-second slot.

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
| `SAMPLE_SECONDS` | 20 (clamped 2–60) | how long the socket is open per wake — **this is the cost dial** |
| `SAMPLE_EVERY_MINUTES` | 60 (clamped 1–360) | how often it wakes; jittered 0.5×–1.5× |
| ring buffer | ~2000 URIs/feed | nobody pages that deep. Granularity is one chunk, so it holds 2001–2400 |
| storage chunk | 400 entries/key | DO values cap at 128KB — 400 lands around 45KB |
| replay on reconnect | ≤ 60 s | a long replay would deliver exactly the messages sampling declined to pay for |
| list membership | ≤ 5000 DIDs | a runaway list degrades one filter, not the ingester |
| idle feed drop | 7 days | a feed nobody opens stops costing anything |
| def re-read | once per wake | a filter edit is live within one sample interval |

### Writes are incremental, and that is structural

The ring is chunked by an **absolute, monotonic chunk index**, not by position in
a flat array. That is the whole trick: appending touches exactly one storage key,
and ageing a chunk out is a `delete`, not a rewrite.

A flat array trimmed from the front renumbers every element, so every chunk goes
dirty and the entire buffer is rewritten each flush. That is what this used to
do — 5 keys every 30 seconds — and it would have been **305 keys every 30
seconds** had the window ever been widened to a real 24 hours, which is over half
the account's row-write allowance for a single feed. Nothing failed when it did
that, which is why `hose.selftest.mjs` counts keys written rather than trusting
the buffer to look right.

`clearBuffer()` deliberately does **not** reset `head`: a reused chunk 0 would
collide with a key already scheduled for deletion.

**If you ever change the key format, migrate on load.** The first build padded
the chunk index to 3 digits and this one pads to 6. Both parse to the same
index while being different keys, and `:004` sorts *after* `:000004` — so a
stale chunk would shadow the fresh one on every load and could never be removed,
because deletion maps indices through the current `chunkKey()`. `load()`
therefore reads any width, prefers the current one, rewrites what it rescued and
deletes the rest via `f.staleKeys`. Both halves are gated by selftests.

**A list that fails to load is skipped, not treated as empty.** Silently
emptying somebody's feed because a `getList` call 500'd is worse than briefly
leaving a bot in it.

## The running cost

**Target: zero.** At the shipped defaults this surface fits inside the Workers
Paid included allowances, and it is budgeted against the *least* favourable
reading of an ambiguous billing rule rather than the convenient one.

Measured input: **38.8 post-creates/second**, of which **3.64%** match
txt for airports.

| Meter | At 20s/60min | Included | Headroom |
|---|---|---|---|
| Requests (inbound WS frames + alarms + reads) | ~0.56M/mo | 1M/mo | 44% |
| Duration | ~3,600 GB-s/mo | 400,000 GB-s/mo | 99% |
| Rows written | ~3K/mo | 50M/mo | ~100% |
| Stored data | ~250 KB | 5 GB | ~100% |

**Requests are the binding constraint, not duration.** That is the
counter-intuitive part. Duration is billed at 128 MB of wall-clock residency, so
even a *permanently* resident object only reaches 334,800 GB-s in a 31-day
month — it cannot exceed the 400,000 allowance on its own. Requests, however,
count **every inbound WebSocket frame**, and the firehose is 100M frames a month
if you hold it open.

### The rule I could not resolve

Cloudflare documents a **20:1 ratio** on inbound WebSocket messages, but only
describes the case where clients connect *to* a Durable Object. Here the object
is the *client*, connecting out to Jetstream. Nothing in the docs covers that
direction, so the sample budget assumes the worst case (**1:1**). If it turns
out to be 20:1, there is 20× more headroom than the table shows and
`SAMPLE_SECONDS` can rise accordingly.

**Settle it from the dashboard**, don't guess: Workers & Pages → usage. Durable
Object requests will read roughly **19K/day** (1:1) or **~1K/day** (20:1) at the
current defaults. Before changing anything, check there.

### What raising the dial costs

Connection time scales everything linearly: `frames/month = seconds_connected ×
38.8`. Against a 1M request allowance, the ceiling is about **7 hours of
connection a month** at the 1:1 assumption — so 20s/hour (4h) is comfortable,
30s/hour (6h) is the practical limit, and anything at or above 20s/30min goes
over. Duration never becomes the problem; it is under 3% at every one of those
settings.

### The other thing occupying the allowance

The duration allowance is **account-wide**. This repo has Durable Objects in
`pod`, `games`, `hoop`, `poll`, `ar`, `os`, `audio` and `bsky-bot`. They are
request-driven room coordinators rather than always-on, but an open lobby is
resident too. Duty-cycling this object took it from consuming 84% of that shared
allowance to under 1%, which is most of the reason to do it.

### Switching it off

Deleting the worker stops all of it — and every feed pointing at
`did:web:hose.mino.mobi` goes dark, so repoint those records first. To pause
ingestion without breaking feeds, set `SAMPLE_SECONDS` low and redeploy; the
served ring stays up until its entries age out of the def's window.

## Endpoints

| Endpoint | Purpose |
|---|---|
| `GET /.well-known/did.json` | the service DID document — what feed records point at |
| `GET /xrpc/app.bsky.feed.getFeedSkeleton` | the feed (`?feed=`, `?limit=`, `?cursor=` as an integer offset) |
| `GET /xrpc/app.bsky.feed.describeFeedGenerator` | the firehose feeds currently registered |
| `GET /api/import?feed=<at-uri\|bsky.app url>` | convert a live SkyFeed feed to a def and show what the port drops — publishes nothing |
| `GET /status` | connection, counters, per-feed buffer depth, list sizes, converter warnings |
| `GET /health` | 200 when a sample completed within 2.5x the wake interval; 503 otherwise |

`/health` asks *has it sampled recently*, **not** *is the socket open* — the
socket is supposed to be shut almost all the time, so connection state is a
terrible health signal here. The window allows for the upper end of the wake
jitter plus one missed wake. It is 503 on a cold start until the first sample
finishes (~25s), which is why the deploy workflow reports it separately and does
not fail on it. The **domain binding** check is the one that fails the deploy.

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
- **No backfill, and now a slow fill.** A newly registered feed starts empty and
  fills only during sample windows — at ~680 matches/day it takes about three
  days to fill a 2000-entry ring. `SEED_FEEDS` in `wrangler.jsonc` pre-registers
  feeds at startup so the ring is warming before anyone opens them.
- **The def's `seconds` window rarely binds.** The ring cap is reached first
  unless a feed's filters are very tight. A def saying 86400 usually means "the
  last ~2000 matches", which at the shipped duty cycle is roughly three days.
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
