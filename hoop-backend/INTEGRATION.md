# Bringing the story engine into hoop — strategy (proposal)

> Status: **proposal, for us to strategize against.** Nothing here is wired yet.
> Phase 0 (vendor + clean merge candidate) is done; everything below is sequenced
> but unbuilt. The big forks are in [§5](#5-decisions-to-settle-together).

## 1. Why these two halves fit

hoop and this backend are two ends of the **same** game, built apart:

| hoop (`hoop/`) — *our world* | hoop-backend (this dir) — *his story* |
|---|---|
| The **client + world**: an infinite, deterministic ship engine, a walkable foam map, presence, and "the map *is* the forum" (places + messages on ATProto). | The **content + narrative**: an LLM-pregenerated pool (npc/creature/item/lore/rumor/plot_beat/dialogue), tier ladders, crystallization, NPC dialogue trees, and offline world-evolution. |
| Already a **Cloudflare Worker**. | Its last unbuilt step is literally *"Step 12 — Cloudflare Worker: port of the local API, do when going online."* |
| `js/postal.js` mints **stable, hierarchical, Merkle-able chamber addresses** — NPCs/places bind to genome-stable `(chunk, ordinal)` slots, **infinitely**. | `runtime/placement.py` crystallizes one pool item onto a stable **`feature_key`** the first time a player touches it — but its world is a single hand-authored 31×15 station (`runtime/world_map.py`). |

The keystone: **hoop's chamber address is exactly the `feature_key` his
crystallization layer wants — except infinite instead of hand-authored.** His
engine already separates *shared geometry* from *per-player identity*; hoop
supplies an endless, deterministic, atproto-stable geometry. They were built to
meet.

And the design RFP we already wrote (`scripts/seed-hoop.mjs` — the Director,
Story-Arc, Character, Quest, Dungeon, Telemetry engines laid out as map nodes) is
the brief his backend is a partial, working answer to (see §4 for the coverage map).

## 2. The architecture once joined

```
OFFLINE (LLM, CI or local)            HOT PATH (no LLM)              SOCIAL (ATProto)
─────────────────────────             ──────────────────            ────────────────
bible → pregen → tier-label  ─pool→   hoop Worker /api/*      ⇄      hoop.place / .message
→ auto_qa → review                    (port of local_api.py)        (the forum threads,
        │                             • dispatch (tier+gate)         user-owned on PDS)
   content_items                      • crystallize → placement
   bible_chunks (pgvector,            • verbs: take/equip/talk
     offline only)                    • deterministic SQL → D1
                                              │
ASYNC poller (cron Worker/Action):    chamber address = feature_key
 telemetry → drift → world agent              ↑
 → delta cascade → retcon              hoop ship engine (js/postal.js)
```

Three lanes, mapped onto infrastructure we already run:

- **Offline LLM lane** → a GitHub Action (the repo already runs ~a dozen content
  pipelines this way). Produces approved `content_items`; the pgvector bible store
  is offline-only (it is **not** in his hot path), so it never needs Cloudflare.
- **Hot path** → the **hoop Cloudflare Worker**, extended with his `/api/*` routes
  ported from `runtime/local_api.py`, backed by **D1** (his hot path is already
  pure SQL — a Postgres→SQLite port, not a rewrite).
- **Social layer** → stays hoop's: the forum thread on a place is ATProto
  (`com.minomobi.hoop.message`); the **NPC dialogue tree** is the *authored*
  cousin of that thread. A place can carry both: a human conversation **and** a
  crystallized NPC. That coexistence is the whole pitch — "a game engine with a
  forum attached" — made literal.

## 3. Sequenced plan (low-risk first; each phase ships independently)

- **Phase 0 — vendored + green (done).** This snapshot is in; the hoop merge
  candidate (incl. v3-stitching) passes all 16 selftests.
- **Phase 1 — the `feature_key` bridge (offline spike, no deploy).** Make
  `runtime/world_map.py` consume a **hoop chamber export** (a fixed seed+region
  dumped from `js/postal.js`/`ship.js` to JSON) instead of the static station.
  Proves the keystone with zero risk. Deliverable: his playtester walks a *hoop*
  region.
- **Phase 2 — hot path on the Worker (his Step 12).** Port `local_api.py`'s
  `/api/{map,interact,placements,pool,longrest}` + the verbs to the hoop Worker
  over D1. New migrations, new tables (his schema, SQLite dialect). No LLM.
- **Phase 3 — content pipeline in CI.** A workflow runs `ingestion/` (bible →
  pregen → tier-label → auto_qa) and loads approved `content_items` into D1. Model
  choice is a decision (§5-B). Review UI runs locally or as a thin hosted page.
- **Phase 4 — client wiring.** `hoop/js/world.js` calls `/api/interact` on chamber
  touch → crystallize → render the dispatched content in the right rail (lore
  panel; NPC dialogue panel with gated choices) **next to** the existing forum
  thread.
- **Phase 5 — the world evolves (the Director).** Poller as a cron Worker:
  telemetry → `collective_drift` → world agent → human-gated delta cascade →
  in-place retcon + notifications. This is the closest thing to the seed's
  "Director" feedback loop.

## 4. Coverage vs. the seed-hoop RFP

What his backend already answers, and what's still open:

| Seed design node | Backend status |
|---|---|
| Story-Arc Engine | **Strong** — world bible + revelation/narrative tier ladders, drift→delta→retcon. |
| Character Engine | **Strong** — NPC content + dialogue trees + per-(player,NPC) relationship state. |
| World-Gen — The Ship | **Replaced by hoop** — his static map yields to hoop's infinite engine (Phase 1). |
| Player Telemetry | **Partial** — `telemetry` + `collective_drift` exist; the preference *vector* is not built. |
| The Director (feedback loop) | **Partial** — world-evolution loop exists; "bend every engine toward revealed taste" is not yet a closed loop. |
| Quest / Dungeon / Minigame / Creep-of-the-Week | **Gaps** — `dungeon_rule`/`plot_beat` types exist as hooks; the engines don't. Net-new work. |

So the synthesis gives us a working Story-Arc + Character + crystallization spine
for free, and a clear, named backlog (Director loop + Quest/Dungeon/Minigame/Creep).

## 5. Decisions — settled 2026-06-13

**A. Durable player-state store → Cloudflare D1.** Port his pure-SQL Postgres
   schema to SQLite/D1 — native to this stack (`atpolls-db`, `mino-scores`), hot
   path stays on-Worker, no external DB. pgvector is **offline-only** (bible
   embeddings, never in the hot path), so the SQLite port loses nothing. Phase 2
   writes new migrations in his schema, SQLite dialect. *(ATProto stays the home of
   the forum layer only — see D.)*

**B. Content pipeline model/host → decide later.** Design the Phase-3 pool loader
   **source-agnostic**: it ingests approved `content_items` (+ offline bible
   embeddings) from a well-defined artifact, regardless of whether they were minted
   by his local llama.cpp/OpenRouter run or a future GitHub Action (Workers
   AI/OpenAI). Don't hard-wire a model or host until we pick one.

**C. Scope of *this* merge candidate → vendor + strategy only.** This branch stays a
   clean, mergeable synthesis (hoop branches folded in + the collaborator's code
   vendored + this doc). **Phases 1+ land on a fresh branch.** No integration code
   here.

**D. Two narrative layers on one place → distinct tabs on the rail.** A place can
   carry both a human forum thread (ATProto `hoop.message`) and an authored NPC
   dialogue/lore. The right rail gets a **"forum" tab** (the multiplayer-social
   layer) and a **"story" tab** (the single-player-narrative layer) — cleanly
   separated, both anchored to the same chamber address.

## 6. Decision — supersede A: the backend is ATProto-native, DB-as-projection (2026-06-14)

**§5-A (durable store → D1) is downgraded.** There is **no source-of-truth DB.**
Truth lives in ATProto repos; any D1/KV is one possible *projection* — disposable,
rebuildable from the firehose. The cut: a database bundles a durable store (repos
give it), transactions (single-player turns don't need cross-repo ACID), and an
index (the only irreducible part — and a small-set scan dissolves it). Run the test
on the engine's queries and they're all point lookups or small-set scans, except
the cross-player Director aggregate — which is a rebuildable rollup, not truth.

Three lanes: **pool** → a service repo (`com.minomobi.hoop.story.content`); **per-
player save** → the player's own repo (`com.minomobi.hoop.story.save`, batched —
localStorage buffers the hot path, never a record per footstep); **global views**
→ a Jetstream consumer (Director rollup) + Constellation (the chamber address, bound
via `hoop.place` at-uris, becomes a queryable spatial index — "who crystallized
chamber X"). Full design + build status: **`hoop/story/ARCHITECTURE.md`**. The
engine is unchanged — pool-from-`pool.json` and pool-from-repo are byte-identical to
it; the procedural + localStorage path stays the guaranteed fallback (no ATProto, no
auth required to play). D1 is no longer a planned dependency, only a fallback option.
