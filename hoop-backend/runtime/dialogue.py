"""Dialogue trees + NPC relationships — deterministic, no LLM (hot path).

An NPC carries its tree inline in `content.dialogue = {start, nodes:{id:{says,
choices:[{id, text, requires, effects, goto}]}}}`, so it composes with
crystallization (the Jory *you* met has his tree). Per-(player, NPC) relationship
state lives in `player_npc_state` (standing, flags, current_node) — the "NPC memory
block". Talking reads the current node and shows only the choices whose `requires`
the player's state satisfies; choosing applies the choice's `effects` (facts, rep,
standing, npc flags, items) and advances the node. This is where "how the world
reacts to YOU" is most visible: the same NPC opens up or shuts down by standing/flags.

A choice's `requires` is the normal gate (facts/items/min_rep via state_gate) PLUS
two NPC-scoped extras: `min_standing` and `npc_flags`.
`effects` = {set_facts, adjust_rep, adjust_standing, set_npc_flags, give_items, end}.
"""

import json

from lib.log import get_logger
from runtime.state_gate import adjust_rep, load_gate_state, meets_state, set_fact
from storage.content_store import execute, fetch_one

log = get_logger("dialogue")


def _npc(npc_content_id: str) -> dict | None:
    return fetch_one(
        "SELECT id, type, content FROM content_items WHERE id = %s AND status = 'active'",
        (npc_content_id,),
    )


def _get_state(player_id: str, npc_content_id: str, start: str | None) -> dict:
    st = fetch_one(
        "SELECT standing, flags, current_node FROM player_npc_state "
        "WHERE player_id = %s AND npc_content_id = %s",
        (player_id, npc_content_id),
    )
    if st:
        return st
    return fetch_one(
        "INSERT INTO player_npc_state (player_id, npc_content_id, current_node) "
        "VALUES (%s, %s, %s) RETURNING standing, flags, current_node",
        (player_id, npc_content_id, start),
    )


def _visible(gstate: dict, npc_state: dict, choice: dict) -> bool:
    req = choice.get("requires") or {}
    if not meets_state(gstate, req):
        return False
    if req.get("min_standing") is not None and npc_state["standing"] < req["min_standing"]:
        return False
    for k, v in (req.get("npc_flags") or {}).items():
        if (npc_state["flags"] or {}).get(k) != v:
            return False
    return True


def _tree(npc: dict) -> dict | None:
    return (npc["content"] or {}).get("dialogue")


def talk(player_id: str, npc_content_id: str) -> dict:
    """Current NPC line + the choices the player can currently take."""
    npc = _npc(npc_content_id)
    if not npc or npc["type"] != "npc":
        return {"error": "not an npc"}
    name = (npc["content"] or {}).get("name")
    tree = _tree(npc)
    if not tree or not tree.get("nodes"):
        return {"npc": name, "says": (npc["content"] or {}).get("description") or
                "They regard you in silence.", "choices": [], "no_tree": True}
    start = tree.get("start") or next(iter(tree["nodes"]))
    st = _get_state(player_id, npc_content_id, start)
    node_id = st["current_node"] or start
    node = tree["nodes"].get(node_id) or tree["nodes"][start]
    gstate = load_gate_state(player_id)
    choices = [
        {"id": c["id"], "text": c["text"]}
        for c in node.get("choices", []) if _visible(gstate, st, c)
    ]
    return {"npc": name, "standing": st["standing"], "says": node.get("says", ""),
            "node": node_id, "choices": choices}


def choose(player_id: str, npc_content_id: str, choice_id: str) -> dict:
    """Apply a choice's effects and advance; returns the resulting talk() view."""
    npc = _npc(npc_content_id)
    if not npc or npc["type"] != "npc":
        return {"error": "not an npc"}
    tree = _tree(npc) or {}
    nodes = tree.get("nodes") or {}
    start = tree.get("start") or (next(iter(nodes)) if nodes else None)
    st = _get_state(player_id, npc_content_id, start)
    node = nodes.get(st["current_node"] or start) or {}
    gstate = load_gate_state(player_id)
    choice = next(
        (c for c in node.get("choices", []) if c["id"] == choice_id and _visible(gstate, st, c)),
        None,
    )
    if not choice:
        return {"error": "choice unavailable"}

    eff = choice.get("effects") or {}
    for k, v in (eff.get("set_facts") or {}).items():
        set_fact(player_id, k, v)
    for faction, n in (eff.get("adjust_rep") or {}).items():
        adjust_rep(player_id, faction, n)
    flags = dict(st["flags"] or {})
    flags.update(eff.get("set_npc_flags") or {})
    given = []
    if eff.get("give_items"):
        from runtime.inventory import take
        for item_id in eff["give_items"]:
            take(player_id, item_id)
            given.append(item_id)
    goto = choice.get("goto") or start
    execute(
        "UPDATE player_npc_state SET standing = standing + %s, flags = %s, "
        "current_node = %s, updated_at = now() WHERE player_id = %s AND npc_content_id = %s",
        (eff.get("adjust_standing", 0), json.dumps(flags), goto, player_id, npc_content_id),
    )
    log.info("DIALOGUE player=%s npc=%s choice=%s -> node=%s (standing %+d)",
             player_id, str(npc_content_id)[:8], choice_id, goto, eff.get("adjust_standing", 0))

    result = talk(player_id, npc_content_id)
    result.update({"chose": choice["text"], "ended": bool(eff.get("end")), "gave_items": given})
    return result
