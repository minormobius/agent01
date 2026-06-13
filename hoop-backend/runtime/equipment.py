"""Equipment + derived stats. Hot path, pure SQL/Python.

Items carry mechanics in their content jsonb: `content.mechanics = {slot, stats:{hp,
atk,def,...}}`. Equipping fills a slot; derived stats = a power-tier baseline plus the
sum of equipped items' stats, cached into player_state.hp_max (combat, deferred, reads
hp_current/hp_max).
"""

from storage.content_store import execute, fetch, fetch_one

BASE_HP, BASE_ATK, BASE_DEF = 20, 2, 1


def _equipped_mechanics(player_id: str) -> list[dict]:
    rows = fetch(
        """
        SELECT ci.content -> 'mechanics' AS m
        FROM player_equipment pe
        JOIN player_inventory pi ON pi.id = pe.inventory_id
        JOIN content_items ci ON ci.id = pi.content_item_id
        WHERE pe.player_id = %s
        """,
        (player_id,),
    )
    return [r["m"] for r in rows if isinstance(r["m"], dict)]


def derive_stats(player_id: str) -> dict:
    """Baseline (from power_tier) + equipped item stats. Persists hp_max; initializes
    hp_current on first derive."""
    p = fetch_one("SELECT power_tier, hp_current FROM player_state WHERE id = %s", (player_id,))
    if not p:
        return {}
    hp = BASE_HP + 5 * (p["power_tier"] - 1)
    atk = BASE_ATK + (p["power_tier"] - 1)
    dfn = BASE_DEF
    for m in _equipped_mechanics(player_id):
        st = m.get("stats") or {}
        hp += int(st.get("hp", 0))
        atk += int(st.get("atk", 0))
        dfn += int(st.get("def", 0))
    execute(
        "UPDATE player_state SET hp_max = %s, hp_current = COALESCE(hp_current, %s) WHERE id = %s",
        (hp, hp, player_id),
    )
    return {"hp_max": hp, "hp_current": p["hp_current"] if p["hp_current"] is not None else hp,
            "atk": atk, "def": dfn}


def equip(player_id: str, inventory_id: str) -> dict:
    row = fetch_one(
        """
        SELECT ci.content -> 'mechanics' ->> 'slot' AS slot, ci.content ->> 'name' AS name
        FROM player_inventory pi JOIN content_items ci ON ci.id = pi.content_item_id
        WHERE pi.id = %s AND pi.player_id = %s
        """,
        (inventory_id, player_id),
    )
    if not row:
        return {"error": "not in inventory"}
    if not row["slot"]:
        return {"error": f"'{row['name']}' is not equippable (no slot)"}
    execute(
        """
        INSERT INTO player_equipment (player_id, slot, inventory_id) VALUES (%s, %s, %s)
        ON CONFLICT (player_id, slot) DO UPDATE SET inventory_id = EXCLUDED.inventory_id
        """,
        (player_id, row["slot"], inventory_id),
    )
    return {"ok": True, "slot": row["slot"], "name": row["name"], "stats": derive_stats(player_id)}


def unequip(player_id: str, slot: str) -> dict:
    execute("DELETE FROM player_equipment WHERE player_id = %s AND slot = %s", (player_id, slot))
    return {"ok": True, "slot": slot, "stats": derive_stats(player_id)}


def get_equipment(player_id: str) -> dict:
    rows = fetch(
        """
        SELECT pe.slot, pe.inventory_id, ci.content ->> 'name' AS name
        FROM player_equipment pe
        JOIN player_inventory pi ON pi.id = pe.inventory_id
        JOIN content_items ci ON ci.id = pi.content_item_id
        WHERE pe.player_id = %s
        """,
        (player_id,),
    )
    return {r["slot"]: {"name": r["name"], "inventory_id": str(r["inventory_id"])} for r in rows}
