# hoop story — the ATProto-native backend (DB-as-projection)

> The inference-free story engine (`engine.js`) has **no source-of-truth database**. Truth lives in
> ATProto repos; every cache is a disposable projection you can nuke and rebuild. This is the strategy
> of record — it supersedes the "durable store → D1" line in `hoop-backend/INTEGRATION.md` §5-A (D1, if
> it ever appears, is now one possible *projection*, not the truth).

## Why no DB — the first-principles cut

A "database" is three things wearing one coat: a **durable store**, an **index** (data pre-arranged so
one question is fast), and a **transaction boundary**. They come apart:

- **Durability** → ATProto repos already give it. Truth = records.
- **Transactions** → story turns are single-player; one aggregate record per player is atomic in its own
  repo. No cross-repo ACID needed.
- **The index** → the only irreducible part, and it's *physics, not a vendor*: a query is fast only if
  the data was pre-arranged for it. A point lookup ("the record at this address") needs no index — that's
  `getRecord`. Everything else ("all unseen tier-≤2 *heal* NPCs", "who crystallized chamber X") needs a
  pre-arrangement. **A database is a cache of a question.**

Run that test on every query the engine makes and almost all of it is point lookups or *small-set* scans:

| Query | Kind | Needs a DB? |
|---|---|---|
| crystallize / recall a placement | point lookup `(player, feature_key)` | **No** — your repo / local |
| dispatch (filter pool by tier/tag/unseen) | small-set scan | **No** — cache the pool, filter in JS |
| facts / inventory / equipment / standing | tiny per-player set | **No** — your repo + local fold |
| semantic retrieval over the bible | kNN, small corpus | **No** — brute-force in a worker |
| **collective drift** (Director, cross-player) | global aggregate | **Yes — a disposable rollup, not truth** |

So for hoop as it stands you can shake the DB *entirely*. It only re-materializes when a question goes
**global + hot** (the Director), and even then it's a projection rebuilt from the firehose.

## The three lanes (and how the trio maps)

```
SHARED CONTENT (read-mostly)        PER-PLAYER (write, batched)        GLOBAL VIEWS (cross-everyone)
service repo:                       the player's own repo:             a Jetstream consumer (cron):
  com.minomobi.hoop.story.content     com.minomobi.hoop.story.save       fold our NSIDs → community
  ── engine loads via listRecords     ── snapshot() at checkpoints       signals (drift, telemetry)
     (a KV cache = projection)           localStorage buffers hot path  Constellation: backlinks by
  ── pregen lane WRITES these           never a record per footstep        the place at-uri → "who's
                                                                            been to chamber X"
```

- **Pool** → `story.content` records in a **service repo**. `story/atproto.js#loadPool` reconstitutes the
  engine's `content[]` from records with no transform (the record body *is* the `content_item`). Seed with
  `hoop/scripts/seed-story-pool.mjs`. Any worker/KV cache over it is a projection — rebuildable, nukeable.
- **Per-player save** → a `story.save` record in the **player's own repo** (user-owned, $0 to us). The
  engine's `MemoryStore` is the in-process projection: `restore()` on load, `putSave` at checkpoints. The
  hot path writes **localStorage**, not a record per action — the "presence is never a lexicon" rule
  (CLAUDE.md). ATProto is the *batched durable target*.
- **Global views** → a **Jetstream** consumer materializes cross-player signals for the Director; the
  result is a tiny rollup, rebuildable by replay. **Constellation** answers "who/what relates to X" —
  and because hoop binds `hoop.place` records to chamber addresses, a player save/event that *references
  the place at-uri* makes the **chamber a queryable spatial index for free** ("who crystallized this
  chamber"). The map-as-forum becomes map-as-database.

## The transport seam

`story/atproto.js` is transport-agnostic: it takes a `client` exposing the standard repo verbs
(`listRecordsFrom`, `getRecordFrom`, `putRecord`). The **same** mapping code runs over:
- `packages/atproto` **`PdsClient`** — node/seeder, authed (the seeder).
- the shared OAuth **`AuthClient.pds`** — browser authed writes (per-player save, when v3 wires auth).
- the built-in **`publicClient(pds)`** — browser unauthed reads (sourcing the pool; no login needed).

The engine never sees any of this: it consumes a `content[]` and a `store`. Pool-from-`pool.json` and
pool-from-repo are byte-identical to it (proven in `test/story-atproto.selftest.mjs`).

## Privacy note

ATProto records are public. A player's inventory / rep / standing would be world-readable — which may be
*fun* (public save files), but if any state must be private, encrypt it into the record:
`packages/atproto/crypto.js#sealRecord` (the airchat/vault pattern). The `save` blob is a single string,
so sealing it is a drop-in.

## Build status

| Piece | State |
|---|---|
| Lexicons `story.content` / `story.save` | ✅ `hoop/lexicons/` |
| Bridge `story/atproto.js` (pool ⇄ records, save ⇄ record, publicClient) | ✅ mock-tested, 11 checks |
| Seeder `scripts/seed-story-pool.mjs` | ✅ (`--dry` works; needs `HOOP_STORY_*` creds to write) |
| v3 sources the pool from the service repo (set `STORY_SERVICE.did`), bundled fallback | ✅ guarded |
| Per-player **save → player repo** via `AuthClient.pds` | ⏳ needs v3 auth wiring; `putSave` ready + tested |
| **Jetstream** consumer (Director rollup) + **Constellation** chamber index | ⏳ the global lane (next) |

The procedural + localStorage path is the guaranteed fallback: with no service repo and no auth, the
story tab still works fully. ATProto is additive truth, never a hard dependency (the borges discipline).
