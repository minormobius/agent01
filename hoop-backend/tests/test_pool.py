"""Replenishment watermark accounting (no LLM needed for these checks)."""

from poller.replenishment import DISCOVERABLE_TYPES, sync_pool_depth
from storage.content_store import fetch


def test_dialogue_excluded_from_watermark(new_player, make_content):
    pid = new_player()
    make_content(type="dialogue")   # write-only type, never dispatched
    make_content(type="npc")
    sync_pool_depth(pid)
    types = {r["content_type"] for r in fetch(
        "SELECT DISTINCT content_type FROM pool_depth WHERE player_id = %s", (pid,))}
    assert "dialogue" not in DISCOVERABLE_TYPES
    assert "dialogue" not in types
    assert "npc" in types  # a discoverable type IS tracked


def test_sync_counts_only_unseen_gated_items(new_player, make_content):
    import uuid
    t = "ttype_" + uuid.uuid4().hex[:8]
    # not in DISCOVERABLE_TYPES, so even though we make items, no slot is tracked.
    make_content(type=t)
    pid = new_player()
    sync_pool_depth(pid)
    rows = fetch("SELECT content_type FROM pool_depth WHERE player_id = %s AND content_type = %s", (pid, t))
    assert rows == []  # arbitrary types aren't replenished
