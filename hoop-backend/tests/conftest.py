"""Pytest fixtures for the world engine.

Tests run against the real local pgvector DB (no separate test DB) but stay isolated
by working on throwaway player ids and content items with unique markers, cleaned up
on teardown. LLM is stubbed (POLLER_STUB_LLM=1, set before any poller import) so the
whole suite runs with llama offline.
"""

import os

# Must be set before job_handlers / replenishment / cascade import (they read it at
# import time). conftest is imported before the test modules, so this lands in time.
os.environ.setdefault("POLLER_STUB_LLM", "1")

import uuid

import pytest

from storage.content_store import execute, fetch_one, insert_content_item


def _uid(prefix: str) -> str:
    return f"{prefix}_{uuid.uuid4().hex[:10]}"


@pytest.fixture
def new_player():
    """Factory for throwaway player ids; all created players are cleaned up after."""
    created: list[str] = []

    def make(**state) -> str:
        pid = _uid("t_player")
        from runtime.dispatcher import get_player_state

        get_player_state(pid)  # creates the row at tier 1
        if state:
            cols = ", ".join(f"{k} = %s" for k in state)
            execute(f"UPDATE player_state SET {cols} WHERE id = %s", (*state.values(), pid))
        created.append(pid)
        return pid

    yield make

    for pid in created:
        execute("DELETE FROM player_equipment WHERE player_id = %s", (pid,))
        for tbl in ("player_placements", "telemetry", "notifications", "player_inputs",
                    "pool_depth", "player_facts", "player_inventory", "player_npc_state"):
            execute(f"DELETE FROM {tbl} WHERE player_id = %s", (pid,))
        execute("DELETE FROM player_state WHERE id = %s", (pid,))


@pytest.fixture
def make_content():
    """Factory for throwaway content_items (live + approved by default). Cleaned up."""
    created: list[str] = []

    def make(type="item", name=None, description="A test thing, sufficiently long to pass QA.",
             tags=None, revelation_tier=1, narrative_tier=1, power_tier=1,
             approved=True, needs_review=False) -> str:
        cid = insert_content_item({
            "type": type,
            "content": {"name": name or _uid("Item"), "description": description},
            "tags": tags or [],
            "revelation_tier": revelation_tier,
            "narrative_tier": narrative_tier,
            "power_tier": power_tier,
            "approved": approved,
            "needs_review": needs_review,
        })
        created.append(cid)
        return cid

    yield make

    for cid in created:
        # Drop everything that FK-references the content before the content itself.
        execute("DELETE FROM player_placements WHERE content_item_id = %s", (cid,))
        execute("DELETE FROM player_inventory WHERE content_item_id = %s", (cid,))
        execute("DELETE FROM player_npc_state WHERE npc_content_id = %s", (cid,))
        execute("DELETE FROM content_items WHERE id = %s", (cid,))


@pytest.fixture
def place():
    """Factory to crystallize a binding directly (player, feature_key) -> content id."""
    created: list[tuple[str, str]] = []

    def make(player_id: str, feature_key: str, content_id: str, content_type: str = "npc"):
        execute(
            "INSERT INTO player_placements (player_id, feature_key, content_type, content_item_id) "
            "VALUES (%s, %s, %s, %s) ON CONFLICT (player_id, feature_key) DO NOTHING",
            (player_id, feature_key, content_type, content_id),
        )
        created.append((player_id, feature_key))
        return feature_key

    yield make

    for pid, fk in created:
        execute("DELETE FROM player_placements WHERE player_id = %s AND feature_key = %s", (pid, fk))
