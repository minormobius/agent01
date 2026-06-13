"""Cascade + regen feed preserve crystallized entity identity (never orphan)."""

import uuid

from poller.cascade import triage_content_pool
from poller.replenishment import regen_in_place
from storage.content_store import fetch_one


def _tok() -> str:
    return uuid.uuid4().hex[:8]


def test_regen_in_place_keeps_id_and_name_and_notifies(new_player, make_content, place):
    cid = make_content(type="npc", name="Keepme", description="The original account of things.")
    pid = new_player()
    place(pid, "store.shelf.a", cid, "npc")

    row = fetch_one(
        "SELECT id, type, content, revelation_tier, narrative_tier, power_tier "
        "FROM content_items WHERE id = %s", (cid,)
    )
    res = regen_in_place([row])
    assert res["regenerated"] == 1 and res["notified"] == 1

    item = fetch_one("SELECT content, status, needs_review FROM content_items WHERE id = %s", (cid,))
    assert item["status"] == "active" and item["needs_review"] is True   # same id, back live
    assert item["content"]["name"] == "Keepme"                           # identity preserved
    assert item["content"]["description"] != "The original account of things."  # rewritten

    note = fetch_one(
        "SELECT type, payload FROM notifications WHERE player_id = %s ORDER BY created_at DESC LIMIT 1", (pid,)
    )
    assert note["type"] == "entity_changed" and note["payload"]["kind"] == "regen"


def test_cascade_triage_never_retires_held_items(new_player, make_content, place):
    tag = "ttag_" + _tok()
    held = make_content(type="npc", tags=[tag])
    unheld = make_content(type="npc", tags=[tag])
    pid = new_player()
    place(pid, "store.shelf.a", held, "npc")

    retired = triage_content_pool({"invalidates_tags": [tag], "summary": "the world shifts"})

    # held -> needs_regen (regenerates in place), never retired
    assert fetch_one("SELECT status FROM content_items WHERE id = %s", (held,))["status"] == "needs_regen"
    assert str(held) not in retired
    # unheld is untouched-but-flagged under the stub verdict path
    u = fetch_one("SELECT status, needs_review FROM content_items WHERE id = %s", (unheld,))
    assert u["status"] == "active" and u["needs_review"] is True
