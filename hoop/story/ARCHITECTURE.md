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

## The rumor outbox (player → engine)

A fourth flow, opposite in direction to the three above: the player **writes upstream to the engine**.
`com.minomobi.hoop.story.rumor` is an **append-only, write-only outbox in the player's own repo** — when
you spread word of a figure you've met, the client `createRecord`s a rumor (rkey = TID) that names its
`subject` (a content id) **by reference**. The client never reads its own rumors back; there is no
client-side rumor consumer by design.

The **engine** (hoopy) tails this collection off the firehose and **may** answer through channels the
client *already* consumes: a `story.verdict` (a retcon/notice, possibly aimed at other players) or new
shared `story.content`. So a rumor is the player's lightweight *signal*; the engine decides whether and how
it lands. This keeps the untrusted-input boundary where it belongs — an arbitrary player's record can never
directly mutate another player's story; only an **engine-authored** verdict/content can, and those pass the
`review.js` gate. Cross-player propagation (and direct player-vs-player) is deliberately left to the engine
as a future surface.

Why its own lexicon and not a `rumors[]` field on `story.save`: a rumor is an **event** (append-only,
time-ordered, applied-then-forgotten), the opposite of the save's **latest-wins aggregate** (rewritten
whole at each checkpoint). Putting an event stream inside the aggregate is O(n) write-amplification and
burns the `stateJson` budget; a TID-keyed collection is the right shape (the same one `story.verdict` uses).
The save holds at most a cursor, never rumor bodies.

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
| Lexicons `story.content` / `story.save` / `story.pulse` / `story.verdict` | ✅ `hoop/lexicons/` |
| **Rumor outbox** `story.rumor` (player → engine; write-only, append-only, by-reference) + `story/atproto.js#putRumor` + the "☷ spread word" encounter action | ✅ `hoop/lexicons/`; client wired in `hoop/v098/`; **engine consume + cross-player = hoopy's side / future PvP** |
| Auth scope: `com.minomobi.hoop.story.rumor` in the ceiling (`scope.ts`) **and** hoop's narrow `HOOP_SCOPE` (login) | ✅ `deploy-auth.yml` wired to this branch (ships the ceiling) + hoop requests it at login; players re-sign-in to mint it. `spreadRumor` falls back to `ensureScope` for older sessions |
| Bridge `story/atproto.js` (pool ⇄ records, save ⇄ record, own-repo read, publicClient) | ✅ mock-tested, 13 checks |
| Seeder `scripts/seed-story-pool.mjs` | ✅ **live** — 23 records on morphyx |
| v3 sources the pool from morphyx (public `listRecords`), bundled fallback | ✅ **live** |
| Per-player **save → player's repo** via `AuthClient.pds` (sign-in, batched, ⟲ reset) | ✅ wired; verify OAuth/write on deploy |
| Auth scope: `com.minomobi.hoop.story.save` in `workers/auth` `scope.ts` | ✅ deployed (one-shot) |
| **Director** — global lane: `story/director.js` fold kernel (cross-player pulse) | ✅ node-tested, 11 checks |
| Director live shell: `scripts/hoop-director.mjs` (Jetstream replay) + `hoop-director.yml` cron | ✅ wired; cron fires on `main` only; verify on deploy |
| v3 reads the pulse → "🌐 world pulse" HUD line | ✅ guarded (shows once the Director has run) |
| **Constellation** chamber backlinks (place at-uri → "who's been here") | ⏳ optional (the pulse already covers chamber heat via folded saves) |

### v096 — wiring the bible in (the generation lane)

The bible (`hoop-backend/ingestion/chapter1_bible.md`) stops being a thing a human hand-copies into the
pool and becomes prompt context a model reads directly. **All inference is offline/async in
`hoop-backend/` today; v096 adds a LIVE, in-worker generation lane** for personal side-quests — but the
player hot path (`engine.js`) stays inference-free, and every new path is additive + guarded (borges
discipline). Hybrid canon: a **shared authored spine** (service repo) + **per-player side-quests** frozen
to the player's own repo.

| Piece | State |
|---|---|
| Lexicon `story.content` tier cap 3→5 + provenance (`lane`/`provider`/`genState`) | ✅ `hoop/lexicons/` |
| Auth scope: `com.minomobi.hoop.story.content` (player writes own side-quests) | ✅ in `scope.ts`; redeploy auth (one-shot) |
| **Filter projection** `story/filter.js` — the totally-filterable quasi-DB (lane/provider/tier views; spine-wins merge; provenance stamp) | ✅ node-tested, 24 checks |
| **Spine match** `story/spine.js` — chunk-characteristics ⇄ content by cosine kNN; thickness gap drives "generate a thicker arc"; deterministic `lexicalEmbed` fallback, neural embedder injected | ✅ node-tested, 19 checks |
| **Segregated adapter** `story/llm/` — Gemini 2.5 Flash (borges hook) + `local` seam (huwupy) + hard off-switch; never throws | ✅ node-tested, 23 checks (routing/parse via injected fetch) |
| Bible vendored → `story/bible.md` (worker fetches via ASSETS; re-sync from `hoop-backend/ingestion/chapter1_bible.md`, never fork — the `vendor/auth.js` rule) | ✅ |
| Prompt builder `story/prompt.js` (bible + chunk thickness + nearby pool → {system,prompt,schema} + repair pass) | ✅ node-tested (in sidequest suite) |
| Orchestrator `story/sidequest.js` — generate → stamp → review.js/gates.js/validate.js GATE → one repair → return; `persistSidequest` to the player's repo | ✅ node-tested, 25 checks (mock adapter + client) |
| Worker `/api/story/{health,embed,sidequest}` — additive + fully guarded (a throw never breaks assets) | ✅ wired in `worker.js`; verify on deploy (needs `GEMINI_API_KEY`) |
| `deploy-hoop.yml` syncs `GEMINI_API_KEY` worker secret + curls `/api/story/health` | ✅ |
| Browser **UI hook** (v096 surface): `✨ weave` → `v096/story/genquest.js` builds a `ChunkProfile`, POSTs `/api/story/sidequest`, folds the approved arc into the live pool (`store.addContent`) + crystallizes its principal | ✅ wired in `hoop/v096/`; node-tested 16 checks; proof by eye on deploy |
| `MemoryStore.addContent` (fold a generated item into the live pool) | ✅ in `story/engine.js` (canonical + v096) |
| Persist: localStorage (v096 has no auth) + optional repo freeze via `freezeResult` when a session exists | ✅ guarded; repo freeze is additive |
| **Data-flow website** `v096/architecture.html` — interactive SVG of the whole system (click-for-detail) | ✅ live at `hoop.mino.mobi/v096/architecture.html` |
| **Steering** (phase 3): the worker reads the `pulse` (cached ~5min, guarded), `prompt.steerFromPulse()` biases the arc toward where the playerbase is | ✅ node-tested; live once the Director has written a pulse |
| **Rich profile** (phase 3): `genquest.profileFromChunk()` — whole-chunk building programme + lived population + society edges → a thick `ChunkProfile` | ✅ node-tested; wired into `v096` `weaveHere` |

### Hoopy's world_export — first-class content (the authoring tool's shape)

His authoring tool emits a `world_export` (a `content_pool` of creature/item/lore_fragment/npc/plot_beat/**rumor** + a `story_bible`). It's now the canonical content model; v096 sources its pool from it.

| Piece | State |
|---|---|
| `story/import.js` — `worldExport → content_item[]`: axis map (his r/n/p → revelation/narrative/power), tier-string→int, flat→`content`, requires gate-strings/`{flag,item}`→`{facts,items}`, carries `refs`/`revelation_hint`/`produces` | ✅ node-tested, 21 checks |
| `rumor` first-class — `KNOWN_TYPES` (review.js) + lexicon enum + dispatch | ✅ |
| `gates.js` reads `produces.sets` as declared producers + an `external` (world/runtime flags) **assumed-satisfiable boundary** | ✅ |
| `WORLD_FACTS`/`worldExternal()` — the journey-flags his pool gates on, produced by the runtime/storyboard outside the pool | ✅ (migrates into storyboard producers as they're set) |
| **His real 75-record export passes the full review/gates/validate gate** | ✅ (`import.selftest`: 0 conflicts with the manifest; correctly BLOCKs without it) |
| `scripts/extract-hoopy-export.mjs` → `v096/story/world_export.json` (from his gallery, pending his machine export) | ✅ |
| v096 sources its pool from `world_export.json` via the importer (`pool.json` fallback); generation emits the same enriched shape (`refs`/`revelation_hint`/`rumor`/chained-item `requires`) | ✅ |

The procedural + localStorage path is the guaranteed fallback: with no service repo and no auth, the
story tab still works fully. ATProto is additive truth, never a hard dependency (the borges discipline).
