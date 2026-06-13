"""Player notifications for world changes — shared by the API and the poller.

Kept neutral (only depends on the DB layer) so both runtime/local_api.py (entity
evolution) and poller/replenishment.py (cascade regen) can tell the players who hold
a crystallized entity that the thing they know has changed, carrying the diff.
"""

import json

from storage.content_store import execute, fetch


def notify_entity_change(item_id, name, kind, summary,
                         before=None, after=None, added=None) -> int:
    """Notify every player who has this entity crystallized (a placement points at
    it). The diff rides in the payload — `added` for an enrich, `before`/`after` for
    a regen — so the client can show what's new without the player wandering back.
    Returns how many players were notified."""
    holders = fetch(
        "SELECT DISTINCT player_id FROM player_placements WHERE content_item_id = %s", (item_id,)
    )
    if not holders:
        return 0
    payload = json.dumps({
        "entity": name, "kind": kind, "summary": summary,
        "added": added, "before": before, "after": after,
    })
    for h in holders:
        execute(
            "INSERT INTO notifications (player_id, type, payload) VALUES (%s, 'entity_changed', %s)",
            (h["player_id"], payload),
        )
    return len(holders)
