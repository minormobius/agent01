# The "doing-stuff" engine — gameplay systems plan

> Forward-looking design doc. Not for immediate execution — it sketches the
> architecture + phased milestones so a future session can build inventory,
> equipment, combat, dialogue, and player-scoped world reactivity on top of the
> existing engine, without ever breaking the no-LLM-in-hot-path rule.

## Context

The engine today is an **exploration + world-evolution** loop: crystallize fixed
content onto a map, level (power deterministically, revelation/narrative via the
agent), and watch the world drift/evolve offline. What's missing is the **verbs** —
the things a player *does* — and the player-scoped state those verbs read and write.
The user's framing is exactly right: every system here (inventory, equipment, combat,
dialogue, reactivity) reduces to one spine — **player-scoped state + deterministic,
state-gated dispatch.** Today the only gate is the three tiers; the general version
gates on arbitrary player state (items held, flags set, relationships, faction rep).
"How the world reacts to YOU" *is* that gate. The LLM stays exactly where it is —
offline pregen + async long-rest + the world agent — never in a player's turn.

NPC "relationship agents" collapse into **NPC relationship *state*** (per player×NPC),
not a live Letta agent; talking is reading that state + dispatching pre-generated
dialogue branches. (See the conversation for the full rationale.)

## The core abstraction: player-scoped state + a generic `requires` gate

Two new primitives unify everything:

1. **Player-scoped state** — `player_facts(player_id, key, value)`: flags, counters,
   and reputation (`flag.opened_hatch=true`, `rep.keepers=3`, `count.lurkers_killed=2`).
   Plus the existing `player_state`/`player_placements`/`player_inventory`/
   `player_npc_state` rows. This is the whole "what you've done" surface.
2. **A generic requirement gate** — content_items and dialogue choices carry an
   optional `requires` blob (e.g. `{"facts": {"flag.met_orsel": true}, "items":
   ["keycard"], "min_rep": {"keepers": 2}}`). One evaluator,
   `runtime/state_gate.py::meets(player_id, requires) -> bool`, is consulted by the
   dispatcher, the interaction layer, and the dialogue engine alike.

The current tier gate in `runtime/dispatcher.py` stays as the fast SQL prefilter;
`requires` is the richer per-candidate post-filter (and simple cases — a single fact
or item — can still be pushed into SQL). This is the minimal change that makes
*existing* content reactive, and it's the foundation every later phase builds on.

## Schema additions (one migration)

Add to `storage/schema.sql` (additive; `CREATE TABLE IF NOT EXISTS` + `ALTER … ADD
COLUMN IF NOT EXISTS`, same idempotent style as the `xp`/`player_placements` adds):

- `player_facts (player_id text, key text, value jsonb, updated_at, PRIMARY KEY (player_id, key))` — flags/counters/reputation.
- `player_inventory (id uuid, player_id, content_item_id uuid REFERENCES content_items, qty int, props jsonb, acquired_at)` — items the player carries (item *instances* derived from crystallized item content).
- `player_equipment (player_id, slot text, inventory_id uuid, PRIMARY KEY (player_id, slot))` — which inventory item fills each slot.
- `player_npc_state (player_id, npc_content_id uuid, standing int DEFAULT 0, flags jsonb, current_node text, updated_at, PRIMARY KEY (player_id, npc_content_id))` — the NPC "memory block": relationship history + dialogue position.
- `content_items.requires jsonb NOT NULL DEFAULT '{}'` — the gate (indexable; GIN later if needed).
- `player_state`: add `hp_current int`, `hp_max int` (combat needs persisted HP; max derived from power_tier + equipment but cached here).
- Item/creature **mechanics** live inside the existing `content.jsonb` (no column): items get `content.mechanics = {slot, stats:{atk,def,...}, effects:[...]}`; creatures get `content.mechanics = {hp, atk, def, abilities:[...]}`. No schema churn, and they ride through pregen/dispatch/crystallization unchanged.

## System-by-system

### 1. State + gate (the spine) — `runtime/state_gate.py`, extend `dispatcher.py`
- `get_facts(player_id) -> dict`, `set_fact / incr_fact`, `get_rep`, `adjust_rep`.
- `meets(player_id, requires) -> bool` evaluates facts/items/min_rep/min_tier.
- `dispatch()` filters candidates through `meets`; `placement.interact` already the choke point for "what you encounter," so gating there makes the *whole world* reactive with one change.
- Payoff immediately: existing content can be tagged `requires` so e.g. a lore fragment only appears once `flag.opened_hatch` is set.

### 2. Inventory & equipment — `runtime/inventory.py`, `runtime/equipment.py`
- Items already crystallize onto shelf/table features. Add a **"take" verb**: interacting with an item feature can move its crystallized `content_item` into `player_inventory` (the placement stays as "an emptied shelf"). Reuse `placement.interact`'s structure; add a `verb` param (`look`/`take`/`talk`/`attack`) routed by content type + UI action.
- `equip(player_id, inventory_id)` / `unequip` write `player_equipment`; `derive_stats(player_id)` sums `power_tier` baseline + equipped `content.mechanics.stats` → cached in `player_state.hp_max` etc.
- Inventory-gated content falls out of the gate for free (`requires.items`).

### 3. Combat — `runtime/combat.py` (deterministic, no LLM)
- Creatures carry `content.mechanics`. A `fight(player_id, creature_content_id)` runs a **deterministic turn loop** (player atk vs creature def, seeded RNG for variety) — pure SQL/Python, instant, fits the hot path.
- Outcomes write state: victory → `incr_fact("count.<type>_killed")`, optional loot into inventory, telemetry; defeat → HP to 0 → a "downed" consequence (respawn at spawn + a penalty fact, or a long-rest recovery — design decision below). Combat flavor text is pregen'd per creature, not generated live.
- Creature features on the map become encounters; gating + `mechanics` decide difficulty by tier.

### 4. Dialogue trees + NPC relationships — `runtime/dialogue.py`
- New content type **`dialogue_tree`**: `content = {npc_ref, nodes:{id:{says, choices:[{text, requires, effects, goto}]}}}` where `effects` = `{set_facts, give_items, adjust_rep, adjust_standing, end}`.
- `player_npc_state` tracks `current_node` + `flags` + `standing` per (player, NPC). `talk(player_id, npc_content_id)` returns the current node's `says` + the choices whose `requires` the player `meets`; `choose(player_id, npc, choice_id)` applies `effects` (writes facts/rep/standing/inventory) and advances `current_node`. **This is where "how the world reacts to YOU" is most visible** — the same NPC greets, helps, or refuses based on standing + facts.
- An NPC's dialogue_tree is bound to its crystallized `content_item` (the Jory *you* met), so evolution/notifications already compose.
- Freeform asides players type stay on the existing async path (`/api/input` → `resolve_input`); the tree handles the authored spine.

### 5. Player-scoped reactivity — emergent from the above
- **Faction reputation** is just `rep.<faction>` facts adjusted by dialogue/combat choices, read by the gate. Keeper NPCs warm or cold; Quiet content unlocking; merchants pricing.
- **Flags** (`opened_hatch`, `knows_about_level8`) gate plot beats, dialogue, and dispatch — turning the linear revelation ladder into a reactive web.

## How the LLM stays offline (unchanged discipline)
- **Offline pregen** (`ingestion/`): new generators author item `mechanics`, creature `mechanics`, and `dialogue_tree` graphs — same pregen → `auto_qa` → human/`needs_review` flow as today; `tier_labeler` extended to tag `requires` where appropriate.
- **Async** (`poller/`): freeform actions → `resolve_input`; the world agent already evolves NPCs/items (now also their mechanics/trees).
- **Hot path** stays pure SQL: gate eval, inventory moves, combat math, dialogue walks — all deterministic. No model call on any player route.

## New modules & endpoints (mirrors current `runtime/` + `local_api.py` style)
- `runtime/state_gate.py`, `inventory.py`, `equipment.py`, `combat.py`, `dialogue.py`.
- `runtime/local_api.py`: `/api/inventory`, `/api/item/{id}/take|drop`, `/api/equip`, `/api/combat/fight`, `/api/npc/{id}/talk`, `/api/npc/{id}/choose`, `/api/facts` (debug). All thin, DB-only.
- Client (`prototype/client.{html,css,js}`): inventory + equipment panels, an HP bar, a combat log, and a dialogue panel (NPC line + gated choice buttons). Per-player log already persists.
- `ingestion/`: `mechanics_gen.py`, `dialogue_gen.py` (or extend `pregen_pass.py` with the new types). Player-agent `player_state` memory-block **sync** lands here too (write current facts/inventory/standing digest into the block before agent turns) — now that there's something worth remembering.

## Phased milestones — SCOPED (build 1 → 2 → 4 → gen; combat deferred)
1. **Spine**: `player_facts` + `state_gate.meets` + dispatch/interact honoring `requires`. Makes existing content reactive. *Smallest, highest leverage — build first.*
2. **Inventory & equipment**: take verb, tables, derived stats (sans combat use), item-gated content.
3. ~~Combat~~ — **DEFERRED** (skip for now; `mechanics` schema still reserved so creatures can carry stats later).
4. **Dialogue + relationships**: `dialogue_tree` type, `player_npc_state`, talk/choose, dialogue UI. (NPC "memory.")
5. **Generation fills the gates** (in scope): the pregen/seed pipeline must emit `requires` blobs and `dialogue_tree` content, not just flat items — otherwise the gate is inert. Extend `ingestion/pregen_pass.py` + `tier_labeler.py` to author `requires` (referencing plausible facts/items) and add a dialogue-tree generator. Player-agent memory-block sync is optional/last.

Work the phases in order, committing each; **stop when the context window runs low** (partial progress banked per commit).

## Verification (per phase, following the existing test patterns in `tests/`)
- Unit: `state_gate.meets` truth tables; `derive_stats`; combat resolution determinism (seeded); dialogue choice gating + effect application; reputation read/write. All run with `POLLER_STUB_LLM=1`, no llama, via the `new_player`/`make_content`/`place` fixtures in `tests/conftest.py`.
- Integration: a "take" then equip then a gated lore fragment appears; a dialogue choice that requires an item/standing un/locks; a fight that flips a fact and drops loot; reputation change altering what an NPC dispatches.
- Manual: play in the client — pick up an item, equip it, talk to an NPC whose options change with standing, fight a creature, watch a flag unlock previously-withheld content.

## Open decisions to settle at build time
- **Combat depth**: lightweight stat-check + turn loop (recommended baseline) vs abilities/status-effects (extension). Schema (`mechanics`) accommodates both.
- **Death consequence**: respawn-with-penalty vs forced long-rest recovery vs permadeath-season. (Qud leans lethal; recommend respawn-with-penalty for the prototype.)
- **Dialogue authoring**: fully LLM-generated trees vs hand-authored spine + generated leaves. Recommend generated-then-reviewed, reusing the approval UI.
- **`requires` in SQL vs Python**: push simple item/fact gates into the dispatch SQL for speed; evaluate complex blobs in `meets`. Start in Python (correctness), optimize if the pool grows.
