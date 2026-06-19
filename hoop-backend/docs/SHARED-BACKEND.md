# Sharing the backend — how the two of us both touch it

> **⚠️ Which seam? (updated after hoopy's `docs/roadmap.md`, event-sourcing branch.)**
> Hoopy has chosen the **ATProto-records seam**, not a direct client→DB API: the engine
> *publishes* `com.minomobi.hoop.story.{content,pulse,verdict}` to the **morphyx** repo and
> *consumes* (read-only projects) the client's `story.save`. Postgres stays the engine's
> **internal** source of truth; the client never touches it. So **the seam is repos, not a
> Worker→Neon connection.** The Worker→Hyperdrive→Neon topology described below is the
> *alternative* the backend engineer floated ("I can have the backend publish things
> instead") — kept here for reference, **not the current plan.** The live contract + the
> answers to hoopy's questions are in **`CLIENT-ANSWERS.md`**.

This answers "how do we set it up so we both can touch it." The backend already
exists (this repo: FastAPI + Postgres + a poller + Letta agents). The (alternative)
plan below is the one the code's `local_api.py` once anticipated — routes "mirrored for
the Cloudflare Worker so code ports over with only the data layer swapped." Under
hoopy's chosen seam, the shared touchpoint is instead the **morphyx repo + each player's
repo**; we still both push code to this monorepo.

## The topology

```
                         ┌──────────────────────────────────────┐
   players ─────────────►│  Cloudflare Worker  (hoop.mino.mobi)  │  ← Claude owns
   (hoop.mino.mobi/v096) │  player-facing API, deterministic SQL │     (ports runtime/ routes)
                         │  + serves the v096 client assets      │
                         └──────────────┬───────────────────────┘
                                        │ Hyperdrive (pooled PG)
                                        ▼
                         ┌──────────────────────────────────────┐
                         │   Neon Postgres   (the source of truth)│  ← SHARED. both connect.
                         │   schema = storage/schema.sql          │
                         └──────────────┬───────────────────────┘
                                        ▲ DATABASE_URL
                         ┌──────────────┴───────────────────────┐
   (a host you control)  │  Python services (this repo)          │  ← backend engineer owns
   fly / render / a VM   │  • poller/      world tick · cascade · │
                         │                 replenishment · rumor  │
                         │  • ingestion/   LLM pregen · QA · embed │
                         │  • agents/      Letta world/player      │
                         │  • review/      the human approval UI   │
                         └───────────────────────────────────────┘
```

The single shared thing is **Neon** (the database). Everything else is split by who
can run it. The monorepo is the other shared thing — all the code lives here.

## Who owns what

| Piece | Owner | Why |
|---|---|---|
| **Neon Postgres** (schema, data) | shared | the source of truth; both connect with the same `DATABASE_URL` |
| **poller / ingestion / agents / review** (Python) | backend engineer | long-running, LLM, Docker (Letta) — can't run in a Worker; needs a host |
| **player-facing API** (Cloudflare Worker, `hoop/worker.js`) | Claude | deterministic pure-SQL dispatch (no LLM) — the "Step 12" port of `runtime/`; I can write + push + it deploys via Actions |
| **the v096 client** (`hoop/v096/`) | Claude | already here; point it at the Worker routes |
| **the schema + the route contract** | shared | the seam we both build to (see Contract below) |

The split falls out of the backend's own rule (`hoop-backend/CLAUDE.md`): *no LLM in
the player hot path.* The hot path is deterministic SQL → it ports cleanly to a
Worker. The LLM/async/world-engine work stays Python on your host.

## What each of us can / can't run

- **Backend engineer (you):** can run Postgres + Python + Docker/Letta — so you own
  Neon, the poller, ingestion, the agents, the review UI, and verify them live.
- **Claude (me):** runs in an ephemeral sandbox with **no** Postgres, no Docker, no
  long-running services, and no Cloudflare/Neon credentials. I **can** write code
  (the Worker player-API, the client, SQL/migrations, the contract, tests) and push
  → Actions deploys the Worker. I **cannot** run the Python backend or do a live DB
  round-trip — so anything DB-touching I write, **you verify against Neon**. (This is
  the same constraint that means I can't test the ATProto write either; I port proven
  shapes and you confirm on deploy.)

## Setup — concrete steps

1. **Neon project.** You create (or share) one Neon Postgres project; apply
   `storage/schema.sql`. Hand me nothing secret — the connection string is a secret,
   it goes into the two places below, never the repo.
2. **Point the Python services at it.** `DATABASE_URL=postgres://…neon…` in your
   host's env (fly secrets / render env / `.env`). Run the API + poller there (or
   locally per `README.md` §"Run the whole system").
3. **Give the Worker a Hyperdrive binding to the same Neon.** In Cloudflare: create a
   Hyperdrive config over the Neon connection string; add the binding to
   `hoop/wrangler.jsonc`. The Worker then queries Neon at the edge with pooling. The
   connection string lives in Hyperdrive/secret, not in `wrangler.jsonc`.
4. **I port the player routes into `hoop/worker.js`** behind the Hyperdrive binding —
   `/api/state`, `/api/pool`, `/api/interact`, `/api/placements`, `/api/notifications`,
   `/api/longrest`, `/api/npc/*`, `/api/rumor`, … — 1:1 with `runtime/local_api.py`.
   Fully guarded: until the Hyperdrive binding exists they return `503 not configured`
   and the client falls back to its local/ATProto path, so nothing breaks meanwhile.
5. **Point the v096 client at the Worker routes** (a `HOOP_BACKEND` flag), keeping the
   ATProto/localStorage path as the offline fallback.

### Local dev — so anyone can touch it with one machine
`README.md` already has it: Docker Postgres on :5433 (`storage/schema.sql`), then
`uvicorn runtime.local_api:app --port 8100`. A `docker-compose.yml` (Postgres + API +
poller, `POLLER_STUB_LLM=1` to skip the model) would make this one command — say the
word and I'll add it. The Letta agents need a Letta server; the deterministic core
runs without it.

## The data contract (the seam)

It already exists as the FastAPI routes — the client just consumes them. The
player-facing reads/feed, mapped to the architecture:

| Contract role | Route(s) | Notes |
|---|---|---|
| world **pool** | `GET /api/pool` | already returns pool minus your `seen_ids` (server-side dedup) |
| character **fold** | `GET /api/state` · `GET /api/placements` · `GET /api/facts` · `GET /api/inventory` | the aggregate; or stream events and fold client-side — same result |
| **dispatch / crystallize** | `POST /api/interact` · `POST /api/dispatch` | the keystone; deterministic, no LLM |
| **notifications / retcon feed** | `GET /api/notifications?since=` | cursored, marks seen; populated by `notify_entity_change` |
| **retcon op** | `POST /api/entity/{id}/evolve` | in-place edit (same id) → diff rides the feed |
| **rumor mill** | `POST /api/rumor` · `GET /api/drift` | the spread + the player-facing surface |

The player-facing contract (dedup keystone, the fold, retcons) is also written up for
onlookers at **`hoop.mino.mobi/v096/records`**.

## Open items to align before wiring

- **Tier ranges disagree.** `hoop-backend/CLAUDE.md` says `revelation_tier` &
  `narrative_tier` are **1–3**; the latest `world_export` Claude loaded into v096 uses
  **1–5** (five decks). Pick one and make the bible + the export + the client agree —
  the deck spine (`hoop/v096/story/decks.js`) assumes 5.
- **Auth / identity.** The Worker already validates the shared `auth.mino.mobi`
  session (it does for presence). The backend keys players by `player_id`; we map that
  to the player's DID so the same identity spans the Worker, Neon, and the ATProto
  mirror.
- **Dispatch ownership.** Recommend dispatch stays **client-side** (deterministic,
  offline, no per-step round trip); the backend owns pool + replenishment + rumor +
  retcons. If you'd rather the server dispatch, that's a different split — say so.
