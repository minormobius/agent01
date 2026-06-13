"""Async/offline path (stubbed LLM): drift clustering, progress eval, input resolution."""

import uuid

from runtime.dispatcher import get_player_state
from storage.content_store import execute, fetch_one
from poller.job_handlers import (
    handle_cluster_drift,
    handle_evaluate_progress,
    handle_resolve_input,
)


def _tok() -> str:
    return uuid.uuid4().hex[:8]


# ── drift clustering (pg_trgm, no LLM) ────────────────────────────────────────

def test_drift_new_then_paraphrase_matches(new_player):
    tok = _tok()
    p1, p2 = new_player(), new_player()
    a = handle_cluster_drift({"player_id": p1, "payload": {
        "text": f"The {tok} hums beneath level nine when the lights dim", "drift_type": "rumor"}})
    assert a["clustered"] == "new"
    b = handle_cluster_drift({"player_id": p2, "payload": {
        "text": f"Beneath level nine the {tok} hums whenever the lights go dim", "drift_type": "rumor"}})
    assert b["clustered"] == "matched"
    assert b["player_count"] == 2
    execute("DELETE FROM collective_drift WHERE content ILIKE %s", (f"%{tok}%",))


def test_drift_distinct_text_starts_new_cluster(new_player):
    tok = _tok()
    r = handle_cluster_drift({"player_id": new_player(), "payload": {
        "text": f"Completely unrelated singular claim {tok} about nothing in particular", "drift_type": "rumor"}})
    assert r["clustered"] == "new" and r["player_count"] == 1
    execute("DELETE FROM collective_drift WHERE content ILIKE %s", (f"%{tok}%",))


# ── deterministic progress evaluation (long rest fallback) ────────────────────

def test_progress_advances_revelation_on_enough_crystallizations(new_player, make_content, place):
    pid = new_player()
    for i in range(3):                                   # _REVELATION_GATE[1] == 3
        place(pid, f"f{i}", make_content(type="npc"), "npc")
    res = handle_evaluate_progress({"type": "evaluate_progress", "player_id": pid, "payload": {}})
    assert res["source"] == "deterministic"
    axes = {a["axis"] for a in res["advanced"]}
    assert "revelation" in axes and "narrative" not in axes  # 3 < narrative gate (4)
    assert get_player_state(pid)["revelation_tier"] == 2


def test_progress_advances_nothing_when_idle(new_player):
    res = handle_evaluate_progress({"type": "evaluate_progress", "player_id": new_player(), "payload": {}})
    assert res["advanced"] == []


# ── typed input resolution (stub) ─────────────────────────────────────────────

def test_resolve_input_returns_notifiable_dialogue(new_player):
    pid = new_player()
    res = handle_resolve_input({"player_id": pid, "payload": {"text": "I pry the hatch open"}})
    assert res["notify"] is True and res["source"] == "stub"
    item = fetch_one("SELECT type, needs_review FROM content_items WHERE id = %s", (res["item_id"],))
    assert item["type"] == "dialogue" and item["needs_review"] is True
    execute("DELETE FROM content_items WHERE id = %s", (res["item_id"],))
