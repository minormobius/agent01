# CLAUDE.md

Only the non-obvious things. Architecture, layout, and commands are in `README.md`
(and the code); don't duplicate them here.

## The one rule

**No LLM in the player hot path.** Move/look/interact/crystallize/power-level are
deterministic pure-SQL dispatch of pre-generated content; the API only reads/writes
Postgres. LLM work lives offline (`ingestion/`) or async in the poller (`poller/`).
Don't add a model call to a player-facing route.

## Easy to get wrong

- **Tiers**: `revelation_tier` & `narrative_tier` are **1-3** (the bible's ladders);
  `power_tier` is **1-5**. Not all 1-5.
- **Entity edits must be in place** (same `content_item` id). A held entity that's
  retired+replaced (e.g. the `needs_regen` regen feed) orphans players' crystallized
  placements. Enrich/regen edit the row; never swap the id.
- **`/no_think` makes the reasoning model skip tool calls.** Agent turns that must call
  tools (world review) → `send_message(..., no_think=False)`.
- **Letta won't reload an agent's system prompt**; new tools need attaching. After
  changing either: `python -m agents.world_agent --recreate` (also reseeds
  `canonical_facts` from the bible — how you roll back a memory-pollution incident).
  Player agents self-heal tools via `sync_player_tools`.

## Operational

- **Restart after code changes** — running API/poller hold stale code (new endpoints →
  restart API; feed/world-tick changes → restart poller).
- Kill a port's listener **by port**: `lsof -ti:8100 | xargs kill -9` (a uvicorn
  `--reload` child won't match `ps | grep uvicorn`).
- `POLLER_STUB_LLM=1` → poller LLM work returns deterministic stubs (tests, offline runs).
- Letta tools run in a Docker sandbox: self-contained functions (imports inside body),
  no host env except injected `WORLD_API_URL`, reach the API at `host.docker.internal`.
- Env is `uv`-managed (`.venv/bin/python`, 3.12). No `pip` in the venv — `uv pip install`.
- Web client: separate html/css/js, never inline.
- psycopg: literal `%` in non-parameterized SQL must be `%%`; put `LIKE` patterns in params.
