"""Pool replenishment (Step 11) — the feeds the poller drains when idle.

Two distinct *feeds* of generation work, run every idle tick by run_feeds():

  1. watermark feed (per-player) — sync_pool_depth() recomputes each player's
     available depth from the *actual* dispatchable pool, then the most-depleted
     slot below its low_watermark gets topped back up toward target_depth.

  2. regen feed (global) — content_items the cascade marked status='needs_regen'
     after a world delta/retcon. We generate fresh replacements of the same
     type/tier and retire the stale originals. This is the "regeneration after
     retcon" path the cascade defers to us ("picked up by replenishment naturally").

Replenishment-generated items go live immediately: approved=true (no human gate)
but needs_review=true (retroactive spot-check). Only the initial pregen pass is
human-gated. auto_qa is the sole pre-flight filter.

POLLER_STUB_LLM=1 makes generation return deterministic filler instead of calling
llama, so the whole feed lifecycle is exercisable with the model offline.
"""

import json
import os

from ingestion.auto_qa import auto_qa
from lib.log import get_logger
from runtime.notifications import notify_entity_change
from storage.content_store import execute, fetch, fetch_one, get_current_bible

log = get_logger("replenish")

STUB_LLM = os.environ.get("POLLER_STUB_LLM", "").strip().lower() in (
    "1", "true", "yes", "on",
)

# Cap per-tick generation so a deeply-drained slot doesn't stall the poller on one
# huge llama call — the feed just tops up a bit more on each subsequent idle tick.
MAX_BATCH = 12

# Only these types are kept topped up — the ones a player can actually DISCOVER
# (crystallize onto map features, or be served by dispatch). 'dialogue' is excluded:
# those are resolve_input outputs (write-only, never dispatched), so pre-generating
# them just burns the model. See runtime/world_map.py for what maps to features.
DISCOVERABLE_TYPES = ("npc", "creature", "item", "lore_fragment", "plot_beat", "rumor")


# ─── Shared generation ──────────────────────────────────────────────────────

def _seen_names(player_id: str, content_type: str, limit: int = 8) -> list[str]:
    """A sample of item names this player has already seen, for freshness/dedup."""
    rows = fetch(
        """
        SELECT ci.content ->> 'name' AS name
        FROM content_items ci
        WHERE ci.type = %s
          AND ci.id = ANY(SELECT unnest(seen_ids) FROM player_state WHERE id = %s)
        ORDER BY random()
        LIMIT %s
        """,
        (content_type, player_id, limit),
    )
    return [r["name"] for r in rows if r["name"]]


def _generate(content_type: str, tier: int, count: int, avoid: list[str], bible: dict) -> list[dict]:
    """Generate `count` fresh items of a type/tier. Stub-aware. Returns raw dicts."""
    if STUB_LLM:
        return [
            {
                "name": f"{content_type}-stub-r{tier}-{i}",
                "description": (
                    f"A procedurally-stubbed {content_type} for revelation tier {tier}. "
                    "Placeholder generated with the model offline; flagged for review."
                ),
                "tags": ["stub", content_type, f"tier{tier}"],
                "world_refs": [],
            }
            for i in range(count)
        ]

    from lib.llm import call_llm_json, GENERATOR_SYSTEM

    prompt = f"""You are generating content for a game world.

Output ONLY valid JSON, no preamble, no markdown fences.

World context (see the Revelation Tiers ladder for what each stage means):
{bible["markdown"]}

Content type: "{content_type}"
Revelation tier: {tier} (of 3 — Stage 1 The Surface, Stage 2 The Crack, Stage 3 The Depth)
Generate items that fit revelation Stage {tier} specifically: they should read as
content a player at that depth of understanding would encounter.
Player has already encountered items like: {json.dumps(avoid)}

Generate exactly {count} NEW items that feel fresh given the above and stay
consistent with the world. Do NOT repeat the names, themes, or specific details of
the already-encountered items.

Each item is a JSON object with fields:
- "name": str
- "description": str (2-4 sentences, consistent with the world)
- "tags": [str] (3-6 tags drawn from world concepts)
- "world_refs": [str] (which world sections this references)

Output format: a JSON array of {count} objects. An ARRAY. Nothing else. Omit whitespace outside of strings."""
    raw = call_llm_json(prompt, system=GENERATOR_SYSTEM, think=True)
    if isinstance(raw, dict):
        # Model sometimes wraps the array, e.g. {"items": [...]}.
        raw = next((v for v in raw.values() if isinstance(v, list)), [raw])
    return [it for it in raw if isinstance(it, dict)]


def _insert_live(item: dict, content_type: str, tiers: tuple[int, int, int]) -> str:
    """Insert a fresh item live (approved, needs_review) at explicit
    (revelation, narrative, power) tiers — so refills land at the level they're
    meant for, not a hardcoded default."""
    from storage.content_store import insert_content_item

    revelation, narrative, power = tiers
    return insert_content_item(
        {
            "type": content_type,
            "content": {"name": item.get("name"), "description": item.get("description")},
            "tags": item.get("tags", []),
            "world_refs": item.get("world_refs", []),
            "revelation_tier": revelation,
            "narrative_tier": narrative,
            "power_tier": power,
            "approved": True,         # live immediately
            "needs_review": True,     # retroactive spot-check
        }
    )


# ─── Feed 1: watermark (per-player) ─────────────────────────────────────────

def sync_pool_depth(player_id: str | None = None) -> int:
    """Recompute pool_depth.available from the real dispatchable pool.

    `available` is the count of approved, active, *unseen* items the dispatcher
    could actually serve this player — so it applies the same hard gate the
    dispatcher does on ALL three tier axes (revelation, narrative, power), even
    though pool_depth only *buckets* by revelation_tier (that's the schema PK, and
    the discovery-depth axis along which a pool runs dry). Gating the count on only
    revelation would overcount for a narrative/power-poor player and hide a dry
    pool from the watermark. Computing this here (rather than decrementing in the
    hot path) keeps the dispatcher pure SQL. Returns the number of slots upserted.
    """
    cols = "id, revelation_tier, narrative_tier, power_tier"
    players = (
        [fetch_one(f"SELECT {cols} FROM player_state WHERE id = %s", (player_id,))]
        if player_id
        else fetch(f"SELECT {cols} FROM player_state WHERE left(id, 2) <> '__'")
    )
    # Drop any stale rows for types we no longer top up (e.g. dialogue from before
    # this filter existed), so check_watermarks can't keep picking them.
    execute("DELETE FROM pool_depth WHERE content_type <> ALL(%s)", (list(DISCOVERABLE_TYPES),))
    slots = 0
    for p in players:
        if not p:
            continue
        counts = fetch(
            """
            SELECT ci.type AS content_type, ci.revelation_tier, count(*) AS available
            FROM content_items ci
            WHERE ci.approved = true
              AND ci.status = 'active'
              AND ci.type = ANY(%s)
              AND ci.revelation_tier <= %s
              AND ci.narrative_tier  <= %s
              AND ci.power_tier      <= %s
              AND ci.id <> ALL(SELECT unnest(seen_ids) FROM player_state WHERE id = %s)
            GROUP BY ci.type, ci.revelation_tier
            """,
            (list(DISCOVERABLE_TYPES), p["revelation_tier"], p["narrative_tier"], p["power_tier"], p["id"]),
        )
        for c in counts:
            execute(
                """
                INSERT INTO pool_depth (player_id, content_type, revelation_tier, available)
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (player_id, content_type, revelation_tier)
                DO UPDATE SET available = EXCLUDED.available
                """,
                (p["id"], c["content_type"], c["revelation_tier"], c["available"]),
            )
            slots += 1
    return slots


def check_watermarks() -> dict | None:
    """Sync depths, then replenish the single most-depleted slot below watermark."""
    sync_pool_depth()
    low = fetch_one(
        """
        SELECT pd.*,
               ps.narrative_tier AS player_narrative_tier,
               ps.power_tier     AS player_power_tier
        FROM pool_depth pd
        JOIN player_state ps ON ps.id = pd.player_id
        WHERE pd.available < pd.low_watermark
          AND pd.revelation_tier <= ps.revelation_tier
          AND pd.content_type = ANY(%s)
        ORDER BY pd.available ASC
        LIMIT 1
        """,
        (list(DISCOVERABLE_TYPES),),
    )
    if not low:
        return None
    log.info("watermark LOW %s r%d for %s: available=%d < low=%d -> replenishing",
             low["content_type"], low["revelation_tier"], low["player_id"],
             low["available"], low["low_watermark"])
    return replenish_slot(low)


def replenish_slot(slot: dict) -> dict:
    """Top a depleted (player, type, tier) slot back up toward target_depth."""
    content_type = slot["content_type"]
    tier = slot["revelation_tier"]
    needed = min(slot["target_depth"] - slot["available"], MAX_BATCH)
    if needed <= 0:
        return {"replenished": 0, "slot_type": content_type, "tier": tier}

    bible = get_current_bible() or {"markdown": ""}
    avoid = _seen_names(slot["player_id"], content_type)
    raw = _generate(content_type, tier, needed, avoid, bible)
    items = auto_qa(raw, bible, seen_names={n.lower() for n in avoid})

    # Mint at the player's actual narrative/power tiers (not a default), so the
    # refill is appropriate to where this player is, not just their revelation depth.
    tiers = (tier, slot["player_narrative_tier"], slot["player_power_tier"])
    for item in items:
        _insert_live(item, content_type, tiers)

    # Bump for immediate in-tick consistency; next sync recomputes from truth anyway.
    execute(
        """
        UPDATE pool_depth SET available = available + %s, last_replenished_at = now()
        WHERE player_id = %s AND content_type = %s AND revelation_tier = %s
        """,
        (len(items), slot["player_id"], content_type, tier),
    )
    log.info(
        "replenished %s r%d for %s: +%d (asked %d, %d dropped by QA, %s)",
        content_type, tier, slot["player_id"], len(items), needed,
        len(raw) - len(items), "stub" if STUB_LLM else "llama",
    )
    return {"replenished": len(items), "slot_type": content_type, "tier": tier}


# ─── Feed 2: regeneration (global, post-retcon) ─────────────────────────────

def regen_in_place(rows: list[dict]) -> dict:
    """Regenerate needs_regen rows IN PLACE — rewrite each item's description on the
    SAME content_item id, keeping its name (its identity) and tiers, then flag it
    active + needs_review. Crucial: a crystallized entity must keep its id so players'
    placements stay bound to it (the old retire+replace orphaned them). Players holding
    a regenerated entity are notified with the before/after diff.

    Batched by (type, tiers) so one llama call covers a group; if QA drops some, the
    surplus rows simply stay needs_regen and get picked up on a later tick."""
    bible = get_current_bible() or {"markdown": ""}
    groups: dict[tuple[str, int, int, int], list] = {}
    for row in rows:
        key = (row["type"], row["revelation_tier"], row["narrative_tier"], row["power_tier"])
        groups.setdefault(key, []).append(row)

    regenerated = notified = 0
    for (content_type, revelation, _nar, _pow), group in groups.items():
        avoid = [(r["content"] or {}).get("name") for r in group if (r["content"] or {}).get("name")]
        raw = _generate(content_type, revelation, len(group), avoid, bible)
        fresh = auto_qa(raw, bible)
        for row, new in zip(group, fresh):  # zip stops short; leftover rows stay needs_regen
            old = row["content"] or {}
            content = {"name": old.get("name"), "description": new.get("description")}  # keep identity
            execute(
                "UPDATE content_items SET content = %s, tags = %s, status = 'active', "
                "needs_review = true WHERE id = %s",
                (json.dumps(content), new.get("tags", []), row["id"]),
            )
            regenerated += 1
            notified += notify_entity_change(
                row["id"], content["name"], "regen",
                "The world shifted, and this changed with it.",
                before=old.get("description"), after=content["description"],
            )
    return {"regenerated": regenerated, "notified": notified}


def check_regen_feed(limit: int = MAX_BATCH) -> dict | None:
    """Drain items the cascade marked needs_regen, regenerating each in place.
    Global, not per-player: the cascade flags items pool-wide after a canon change."""
    stale = fetch(
        """
        SELECT id, type, content, revelation_tier, narrative_tier, power_tier
        FROM content_items
        WHERE status = 'needs_regen'
        ORDER BY revelation_tier, type
        LIMIT %s
        """,
        (limit,),
    )
    if not stale:
        return None
    result = regen_in_place(stale)
    log.info("regen: %d regenerated in place (%d holders notified)",
             result["regenerated"], result["notified"])
    return result


# ─── Orchestration ──────────────────────────────────────────────────────────

def run_feeds() -> dict | None:
    """Drain one unit of feed work per idle tick. Regen first (retcon fallout is a
    correctness issue), then the watermark top-up. Returns whichever fired, or None."""
    return check_regen_feed() or check_watermarks()
