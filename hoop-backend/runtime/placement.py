"""Placement / crystallization layer — still the hot path, still pure SQL + dispatch.

This is the answer to "the next time I interact with it, it's the same thing." A map
feature is anonymous terrain until a player first touches it. On that first touch we
pull ONE item from the content pool via the dispatcher (which applies the hard tier
gate and marks it seen), then freeze the binding in player_placements. Every later
interaction reads the frozen binding back — no new dispatch, same item, forever.

Because the first touch goes through dispatch(), it drains the player's unseen pool
exactly like any other discovery, so the watermark replenishment feed notices and
refills behind them — the placement layer needs no special wiring to feed it.

Leveling here is the deterministic half of the hybrid: each *new* crystallization
awards XP and power_tier is a pure function of XP. revelation_tier is left alone —
that is judged asynchronously by the player's Letta agent at long rest (off the hot
path). No LLM is called anywhere in this module.
"""

import json

from lib.log import get_logger
from runtime.dispatcher import dispatch, get_player_state
from runtime.world_map import feature_by_key
from storage.content_store import conn_ctx, execute, fetch_one

log = get_logger("placement")

# Power tier is a step function of XP. Index i = minimum XP to be at power_tier i+1.
POWER_THRESHOLDS = [0, 30, 80, 150, 250]  # tiers 1..5
# XP granted per brand-new crystallization, richer for deeper-tier finds.
XP_BASE = 10
XP_PER_REVELATION = 5


def _power_tier_for_xp(xp: int) -> int:
    tier = 1
    for i, threshold in enumerate(POWER_THRESHOLDS):
        if xp >= threshold:
            tier = i + 1
    return tier


def _render(item: dict) -> dict:
    """Shape a content row (or bound placement row) into what the client renders."""
    c = item.get("content") or {}
    return {
        "content_item_id": str(item["content_item_id"] if "content_item_id" in item else item["id"]),
        "type": item["type"],
        "name": c.get("name"),
        "description": c.get("description") or c.get("response") or "",
        "revelation_tier": item.get("revelation_tier"),
        "tags": item.get("tags") or [],
    }


def interact(player_id: str, feature_key: str, context: str = "") -> dict:
    """Crystallize (first touch) or recall (later touches) the item bound to a
    feature for this player. Returns {feature_key, status, item, leveled?}."""
    feature = feature_by_key(feature_key)
    if feature is None:
        return {"feature_key": feature_key, "status": "unknown_feature", "item": None}

    content_type = feature["type"]

    # Already crystallized? Recall the exact same item, bump the counter, done.
    existing = fetch_one(
        """
        SELECT pp.content_item_id, pp.interaction_count,
               ci.type, ci.content, ci.revelation_tier, ci.tags, ci.status
        FROM player_placements pp
        JOIN content_items ci ON ci.id = pp.content_item_id
        WHERE pp.player_id = %s AND pp.feature_key = %s
        """,
        (player_id, feature_key),
    )
    if existing:
        execute(
            "UPDATE player_placements SET interaction_count = interaction_count + 1, "
            "last_seen_at = now() WHERE player_id = %s AND feature_key = %s",
            (player_id, feature_key),
        )
        name = (existing.get("content") or {}).get("name")
        log.info(
            "RECALL  player=%s feature=%s -> '%s' (×%d, same item %s)",
            player_id, feature_key, name, existing["interaction_count"] + 1,
            str(existing["content_item_id"])[:8],
        )
        return {
            "feature_key": feature_key,
            "label": feature["label"],
            "status": "recalled",
            "interaction_count": existing["interaction_count"] + 1,
            # The bound item persists as the player's memory even if the world has
            # since retired it — but flag that so the client can render it as gone/
            # changed rather than as if it were still present.
            "retired": existing.get("status") != "active",
            "item": _render(existing),
        }

    # First touch: dispatch one pool item of this type at the player's tier and
    # freeze the binding. dispatch() marks it seen + logs telemetry + drains pool.
    log.info("FIRST TOUCH player=%s feature=%s type=%s — crystallizing…", player_id, feature_key, content_type)
    items = dispatch(player_id, context or feature["label"], content_type, n=1)
    if not items:
        # Pool is dry at this player's tier (often a deeper-tier feature reached
        # too early). Leave the feature uncrystallized so it can resolve later.
        log.warning(
            "WITHHELD player=%s feature=%s type=%s — no %s available at tier; stays uncrystallized",
            player_id, feature_key, content_type, content_type,
        )
        return {
            "feature_key": feature_key,
            "label": feature["label"],
            "status": "withheld",
            "content_type": content_type,
            "item": None,
        }

    item = items[0]
    leveled = _bind_and_level(player_id, feature_key, content_type, item)
    name = (item.get("content") or {}).get("name")
    msg = (
        "CRYSTALLIZE player=%s feature=%s -> '%s' (item %s, r%d) +%dxp xp=%d power=%d"
        % (player_id, feature_key, name, str(item["id"])[:8], item["revelation_tier"],
           leveled["xp_gain"], leveled["xp"], leveled["power_tier"])
    )
    if "leveled" in leveled:
        log.info("%s  ** POWER UP -> %d **", msg, leveled["leveled"]["to"])
    else:
        log.info(msg)
    return {
        "feature_key": feature_key,
        "label": feature["label"],
        "status": "crystallized",
        "interaction_count": 1,
        "item": _render(item),
        **leveled,
    }


def _bind_and_level(player_id: str, feature_key: str, content_type: str, item: dict) -> dict:
    """Freeze the binding, award XP, recompute power_tier — all in one txn."""
    gain = XP_BASE + XP_PER_REVELATION * (int(item["revelation_tier"]) - 1)
    with conn_ctx() as conn, conn.cursor() as cur:
        cur.execute(
            """
            INSERT INTO player_placements (player_id, feature_key, content_type, content_item_id)
            VALUES (%s, %s, %s, %s)
            ON CONFLICT (player_id, feature_key) DO NOTHING
            """,
            (player_id, feature_key, content_type, item["id"]),
        )
        cur.execute(
            "UPDATE player_state SET xp = xp + %s, updated_at = now() WHERE id = %s RETURNING xp, power_tier",
            (gain, player_id),
        )
        row = cur.fetchone()
        new_xp, old_power = row["xp"], row["power_tier"]
        new_power = _power_tier_for_xp(new_xp)
        powered_up = new_power > old_power
        if powered_up:
            cur.execute(
                "UPDATE player_state SET power_tier = %s WHERE id = %s", (new_power, player_id)
            )
            cur.execute(
                "INSERT INTO telemetry (player_id, event_type, payload) VALUES (%s, 'tier_increment', %s)",
                (player_id, json.dumps({"tier_type": "power_tier", "to": new_power, "via": "xp"})),
            )
        cur.execute(
            "INSERT INTO telemetry (player_id, event_type, content_item_id, payload) "
            "VALUES (%s, 'npc_interaction', %s, %s)",
            (player_id, item["id"], json.dumps({"feature_key": feature_key, "xp_gain": gain})),
        )
    out = {"xp": new_xp, "xp_gain": gain, "power_tier": new_power}
    if powered_up:
        out["leveled"] = {"axis": "power", "to": new_power}
    return out


def list_placements(player_id: str) -> list[dict]:
    """Every feature this player has crystallized — lets the client restore which
    parts of the map are 'known' (and what they are) after a reload."""
    rows = fetch_one(
        """
        SELECT coalesce(json_agg(json_build_object(
                 'feature_key', pp.feature_key,
                 'type', ci.type,
                 'name', ci.content ->> 'name',
                 'description', coalesce(ci.content ->> 'description', ci.content ->> 'response', ''),
                 'revelation_tier', ci.revelation_tier,
                 'interaction_count', pp.interaction_count
               ) ORDER BY pp.first_seen_at), '[]') AS placements
        FROM player_placements pp
        JOIN content_items ci ON ci.id = pp.content_item_id
        WHERE pp.player_id = %s
        """,
        (player_id,),
    )
    return (rows or {}).get("placements") or []
