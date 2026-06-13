"""Player-scoped state + the generic requirement gate — the spine of the
"doing-stuff" engine.

Everything the world reacts to about a player — flags, counters, reputation, items
held — is read and written here, and `meets()` is the ONE evaluator the dispatcher,
the interaction layer, and the dialogue engine all consult. Pure SQL, no LLM: this is
hot-path code. "How the world reacts to YOU" is exactly `meets(player_id, requires)`.

A `requires` blob (on a content_item or a dialogue choice) looks like:
    {"facts": {"flag.opened_hatch": true}, "items": ["keycard"], "min_rep": {"keepers": 2}}
Empty {} = always available, so existing content is unaffected until gates are authored.
"""

import json

from storage.content_store import execute, fetch, fetch_one

REP_PREFIX = "rep."


# ── facts: flags / counters / reputation ──────────────────────────────────────

def get_facts(player_id: str) -> dict:
    """All of a player's facts as {key: value} (jsonb auto-decoded to Python)."""
    return {
        r["key"]: r["value"]
        for r in fetch("SELECT key, value FROM player_facts WHERE player_id = %s", (player_id,))
    }


def get_fact(player_id: str, key: str, default=None):
    r = fetch_one("SELECT value FROM player_facts WHERE player_id = %s AND key = %s", (player_id, key))
    return r["value"] if r else default


def set_fact(player_id: str, key: str, value) -> None:
    execute(
        """
        INSERT INTO player_facts (player_id, key, value) VALUES (%s, %s, %s)
        ON CONFLICT (player_id, key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
        """,
        (player_id, key, json.dumps(value)),
    )


def incr_fact(player_id: str, key: str, by: int = 1) -> int:
    """Add to a numeric fact (read-modify-write; single-player turns aren't concurrent)."""
    new = int(get_fact(player_id, key, 0) or 0) + by
    set_fact(player_id, key, new)
    return new


def get_rep(player_id: str, faction: str) -> int:
    return int(get_fact(player_id, REP_PREFIX + faction, 0) or 0)


def adjust_rep(player_id: str, faction: str, by: int) -> int:
    return incr_fact(player_id, REP_PREFIX + faction, by)


# ── inventory presence (for item-gated content) ───────────────────────────────

def inventory_tokens(player_id: str) -> set[str]:
    """Lowercased item names + tags the player is carrying — what `requires.items`
    matches against (so a gate can ask for 'keycard' by name or by tag)."""
    rows = fetch(
        """
        SELECT ci.content ->> 'name' AS name, ci.tags
        FROM player_inventory pi JOIN content_items ci ON ci.id = pi.content_item_id
        WHERE pi.player_id = %s
        """,
        (player_id,),
    )
    toks: set[str] = set()
    for r in rows:
        if r["name"]:
            toks.add(r["name"].lower())
        for t in (r["tags"] or []):
            toks.add(t.lower())
    return toks


# ── the gate ──────────────────────────────────────────────────────────────────

def load_gate_state(player_id: str) -> dict:
    """Fetch everything `meets_state` needs in one shot, so a candidate list can be
    filtered without re-querying per item."""
    return {"facts": get_facts(player_id), "items": inventory_tokens(player_id)}


def meets_state(state: dict, requires: dict | None) -> bool:
    """Pure predicate: does this pre-loaded state satisfy `requires`?"""
    if not requires:
        return True
    facts = state["facts"]
    for k, expected in (requires.get("facts") or {}).items():
        if facts.get(k) != expected:
            return False
    items = state["items"]
    for tok in (requires.get("items") or []):
        if str(tok).lower() not in items:
            return False
    for faction, minv in (requires.get("min_rep") or {}).items():
        if int(facts.get(REP_PREFIX + faction) or 0) < minv:
            return False
    return True


def meets(player_id: str, requires: dict | None) -> bool:
    """Convenience single-check (loads state internally)."""
    if not requires:
        return True
    return meets_state(load_gate_state(player_id), requires)
