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

At 30s twice an hour the object is connected **12 hours a month instead of
720**, and collects **~88 matching posts an hour** — enough to fill the
2000-entry ring in ~23 hours, just inside the 24-hour window the def asks for.

**A feed like this is a mood, not an index.** If you ever need completeness, the
knobs are below and the arithmetic is in *The running cost* — but read it first,
because the binding constraint is requests, not duration, and it is not obvious.

Wake times are **jittered** (0.5×–1.5× the interval). Sampling at a fixed offset
past the hour would make the feed a permanent portrait of whatever the network
does in that one 20-second slot.

### Priming — the cold start, which was got wrong once

A feed registered *after* the last sample has an empty ring and waits a full
jittered interval — **up to 90 minutes** — before it sees anything, then shows
one sample's worth. Anyone who opens it sees an empty feed, which is
indistinguishable from a broken one. That is exactly what happened to the first
published feed.

So while a firehose feed holds fewer than **150** entries, the object wakes
every **minute** instead of every hour, for at most **6** wakes. Two guards keep
that honest:

- **the budget is per feed and persisted** — a feed whose filters genuinely
  match almost nothing gives up after six tries instead of sampling every minute
  forever. Whole-lifetime priming cost is ~4,800 frames, one-off.
- **opening an empty feed pulls the next sample forward** (to +2s), but only
  while that feed still has prime budget. Without the second condition a feed
  that matches nothing would turn *every read* into a sample and undo the duty
  cycle completely.

`clearBuffer()` resets the budget, so editing a feed's filters re-primes it —
the case where the ring was just emptied on purpose and the feed would otherwise
look broken for an hour and a half.

**An empty ring with a spent budget is repaired on load**, because it is a state
the code cannot reach: the budget is only spent while filling, and both things
that empty a ring reset it. Seeing the pair means a reset was lost somewhere, and
the feed is stranded — empty, with no budget to refill, and only the hourly
cadence to dig out with. A feed that still holds entries keeps its spent budget,
or one that legitimately stopped short of the target would re-prime on every
eviction.

`/status` reports `priming` and a per-feed `primes` count.

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

Definitions are re-read once per wake. **Editing a feed's filters clears its
buffer** — everything already ingested was admitted under the old rules, so
leaving it would mean adding a "no video" filter and still seeing a day of
video, which is the exact complaint this surface was built to fix.

**A matcher bug fix needs `MATCHER_VERSION`, because it is not a filter edit.**
Fixing what `packages/feedgen/match.js` admits changes nothing about any feed's
`filters`, so the flush above never fires and posts the old code should never
have admitted stay served after the fix ships. `load()` compares a stored
version against the exported constant and purges every ring when it moves,
resetting the prime budget so the feed refills in minutes rather than days.

That reset has to be **written**, not just assigned. The buffer deletes are
direct storage calls and commit with the invocation, but `primes` lives in
`reg`, which only `flush()` writes — and `load()` is not followed by a flush. In
between, the ring was purged while the prime budget stayed spent: the feed went
to zero with no budget left to refill it.
**Bump it in `match.js` whenever a change there alters what passes.**

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
| `SAMPLE_SECONDS` | 30 (clamped 2–60) | how long the socket may stay open per wake |
| `MAX_FRAMES_PER_SAMPLE` | 1100 (clamped 50–20000) | hard frame ceiling per wake — **this is the real cost dial** |
| `SAMPLE_EVERY_MINUTES` | 30 (clamped 1–360) | how often it wakes; jittered 0.5×–1.5× |
| ring buffer | ~2000 URIs/feed | nobody pages that deep. Granularity is one chunk, so it holds 2001–2400 |
| storage chunk | 400 entries/key | DO values cap at 128KB — 400 lands around 45KB |
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

**Membership is cached in DO storage, and that is load-bearing given eviction.**
The object is evicted between wakes, so `this.lists` starts empty on every wake.
Without a cached copy, one failed `getList` means that entire sample ingests
with *no* bot filtering — the filter silently does nothing for an hour. A stale
membership list is a much better fallback than none. Lists over
`LIST_PERSIST_MAX` (3000) are not cached, because a DO storage value caps at
128KB; they still work, they just re-fetch every wake.

### The alarm chain is the whole service, and it can get stuck

Everything here runs off one self-perpetuating alarm: `alarm()` re-arms itself
in a `finally`, and that is the only thing that ever wakes the object. If that
chain breaks, ingestion stops silently — `/status` and `getFeedSkeleton` keep
answering 200 off the persisted ring, so **a dead ingester looks exactly like a
quiet one.**

It broke once, for an hour. `fetch()` re-armed only when `getAlarm()` returned
`null`, and an alarm can be left set to a time in the **past** — a failed
invocation rolls back its writes (including its own re-arm), and a deploy can
orphan a pending alarm. `getAlarm()` then returns non-null forever, the re-arm
branch never fires, and nothing wakes the object again.

So an alarm more than `STUCK_ALARM_MS` (5 min) overdue is now treated as no
alarm at all. The grace window matters in both directions: too short and every
read resets the sampling cadence, undoing the duty cycle; too long and a dead
service stays dead. `/status` reports `nextAlarmAt` and `alarmOverdueMs` so this
is observable instead of inferred from frozen counters.

The 6-hourly cron is the outer backstop — it pokes `/status`, which now re-arms
a stuck alarm rather than admiring it.

**If sampling has stopped:** check `alarmOverdueMs` first. Any request to the
worker re-arms a stuck chain, so simply curling `/status` restarts it.

## The running cost

**Target: zero.** At the shipped defaults this surface fits inside the Workers
Paid included allowances, and it is budgeted against the *least* favourable
reading of an ambiguous billing rule rather than the convenient one.

Measured input: **38.8 post-creates/second**, of which **3.64%** match
txt for airports.

| Meter | At 800 frames/60min | Included | Headroom |
|---|---|---|---|
| Requests (inbound WS frames + alarms + reads) | ≤ 0.58M/mo | 1M/mo | 42% |
| Duration | ~3,600 GB-s/mo | 400,000 GB-s/mo | 99% |
| Rows written | ~3K/mo | 50M/mo | ~100% |
| Stored data | ~250 KB | 5 GB | ~100% |

That first row is a **ceiling, not an estimate**: 720 wakes × 800 frames is the
most this can spend no matter what the network does.

**Requests are the binding constraint, not duration.** That is the
counter-intuitive part. Duration is billed at 128 MB of wall-clock residency, so
even a *permanently* resident object only reaches 334,800 GB-s in a 31-day
month — it cannot exceed the 400,000 allowance on its own. Requests, however,
count **every inbound WebSocket frame**, and the firehose is 100M frames a month
if you hold it open.

### Size the sample to fill the ring inside its own window

The first budget optimised the wrong number. It capped at 800 frames/hour, which
gathers ~32 posts/hour: a 2000-entry ring takes **62 hours** to fill, so the feed
never held anything like the day of content its `firehose: 86400` asks for, and
looked permanently thin.

Meanwhile the network offers **5,600–8,900 matching posts an hour** for this
feed. At 800 frames we were sampling **0.57% of the candidates**. Nowhere near
any limit — just an over-tight self-imposed cap.

The number that matters is `ring ÷ window`: 2000 posts over 24 hours is 83
posts/hour, which at a ~4% match rate is ~2,080 frames/hour. Hence 1100 frames
twice an hour.

**And the cost being optimised was pennies.** Worst case, under the least
favourable reading of WebSocket billing, this is $0.09/month; under the
documented 20:1 ratio it is free. The cost curve, measured:

| cap/sample | frames/mo | posts/hr | worst-case | ring full in |
|---|---|---|---|---|
| 800 | 0.58M | 32 | $0.00 | 62 h |
| **1100 ×2/h** | **1.58M** | **88** | **$0.09** | **23 h** |
| 3000 | 2.16M | 120 | $0.17 | 17 h |
| 5000 | 3.60M | 200 | $0.39 | 10 h |

Two samples an hour rather than one longer one also spreads coverage across the
clock, so the feed is less a portrait of two moments a day.

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

### Time is not a budget — this was got wrong once

The first duty-cycled build bounded a sample by *time alone* and reasoned about
cost from a measured 38.8 creates/second. Both halves were wrong:

- **The rate is not a constant.** 38.8/s at one hour, **62/s** at another.
  Bluesky's volume swings with the clock, so a fixed 20-second window silently
  costs 60% more at a busy hour than the budget assumed.
- **The replay cursor was thinking left over from streaming.** It asked
  Jetstream for the last 60 seconds "to smooth the seam between samples" — but
  under a duty cycle there *is* no seam; the object is skipping 59 minutes on
  purpose. Measured on the live deploy, a 20-second sample ingested **4,994
  messages, about 129 seconds' worth** — roughly 4× its budget, spent on backlog
  nobody asked for.

Hence `MAX_FRAMES_PER_SAMPLE`, and no cursor. Whichever bound trips first ends
the sample, so the monthly ceiling is `wakes × cap` and does not depend on any
rate estimate being right. At a quiet hour the 20s window binds (~776 frames);
at a busy one the cap binds (800 frames in ~13s). Sample size self-equalises.

`/status` reports `lastSampleFrames` and `lastSampleEndedBy` (`time` | `frames`
| `closed` | `error`) so which bound is binding is observable rather than
inferred.

**Those counters are persisted, and have to be.** A duty-cycled object is
evicted between wakes by design — it is resident roughly 20 seconds an hour — so
anything held only in memory resets almost immediately. Kept in memory, `/status`
reported `lastSampleFrames: 0` and `samples: 0` while sampling was demonstrably
working, which reads as "it is broken" rather than "it is asleep, as intended".
Instrumentation that only survives while the object is hot is instrumentation
for a service that is never hot.

**To raise it:** `frames/month = wakes × cap`, and the request allowance is 1M.
At hourly wakes the arithmetic ceiling is ~1,380 frames/sample; 800 leaves
sensible room for feed reads and a busier network. Duration never becomes the
problem — it is under 3% at any of these settings.

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

### Which embeds are pictures

`app.bsky.embed.gallery` is what a post of **more than four images** became. It
is a *different* nsid from `app.bsky.embed.images` and spells its array `items`
rather than `images`, so a "no images" filter that only knows `embed.images`
passes every gallery post untouched.

That is not hypothetical: an adult image carousel reached this text-only feed
through exactly that gap, in a feed whose single most load-bearing filter is
"no pictures". `isImageEmbed()` in `match.js` now covers both spellings, on both
the hydrated and the raw-record paths, and the alt-text walkers read `items` as
well as `images` so an `alt_text` regex can see inside a gallery.

`b/thread/thread.js` hit the same lexicon split in the reader layer and
documents it; if a third place ever needs it, that is the moment to promote the
predicate rather than write it a third time.

**The general lesson:** a media filter keyed on a substring of `$type` is only
as complete as the list of nsids you knew about when you wrote it. New embed
types are how it silently gets less complete.

## Gotchas

- **`sort: top` is not available on a firehose input.** Ranking by likes needs
  counts the ingester does not have; firehose feeds serve newest-first.
- **No backfill, and a slow fill after priming.** A new feed primes to ~150
  entries within minutes (below), then fills at ~680 matches/day — about three
  days to a full 2000-entry ring. `SEED_FEEDS` pre-registers feeds so the ring
  is warming before anyone opens them.
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
