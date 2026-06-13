"""Hot path: dispatch tier-gating + crystallization + deterministic XP leveling."""

import uuid

import pytest

import runtime.placement as P
from runtime.dispatcher import dispatch, get_player_state
from runtime.placement import _power_tier_for_xp, POWER_THRESHOLDS


def _utype() -> str:
    return "ttype_" + uuid.uuid4().hex[:8]


def _synthetic_feature(monkeypatch, ftype, key="tfeat"):
    feat = {"key": key, "type": ftype, "label": "a test fixture"}
    monkeypatch.setattr(P, "feature_by_key", lambda k: feat if k == key else None)
    return key


# ── dispatch hard gate ────────────────────────────────────────────────────────

def test_dispatch_revelation_gate(new_player, make_content):
    t = _utype()
    lo = make_content(type=t, revelation_tier=1)
    hi = make_content(type=t, revelation_tier=3)
    pid = new_player()  # revelation_tier 1
    ids = {str(i["id"]) for i in dispatch(pid, "ctx", t, n=10)}
    assert lo in ids and hi not in ids


def test_dispatch_narrative_and_power_gates(new_player, make_content):
    t = _utype()
    ok = make_content(type=t, revelation_tier=1, narrative_tier=1, power_tier=1)
    nar = make_content(type=t, revelation_tier=1, narrative_tier=3)
    pwr = make_content(type=t, revelation_tier=1, power_tier=3)
    pid = new_player()
    ids = {str(i["id"]) for i in dispatch(pid, "ctx", t, n=10)}
    assert ok in ids and nar not in ids and pwr not in ids


def test_dispatch_marks_seen(new_player, make_content):
    t = _utype()
    make_content(type=t)
    pid = new_player()
    got = dispatch(pid, "ctx", t, n=1)
    assert got
    seen = get_player_state(pid)["seen_ids"]
    assert got[0]["id"] in seen
    # a second dispatch can't re-serve the seen item
    assert dispatch(pid, "ctx", t, n=5) == []


# ── crystallization ───────────────────────────────────────────────────────────

def test_crystallize_then_recall_is_stable(monkeypatch, new_player, make_content):
    t = _utype()
    cid = make_content(type=t, name="Stable Thing")
    _synthetic_feature(monkeypatch, t)
    pid = new_player()

    first = P.interact(pid, "tfeat")
    assert first["status"] == "crystallized"
    assert first["item"]["content_item_id"] == cid

    again = P.interact(pid, "tfeat")
    assert again["status"] == "recalled"
    assert again["item"]["content_item_id"] == cid          # SAME thing
    assert again["interaction_count"] == 2


def test_recall_flags_retired_entity_but_keeps_memory(monkeypatch, new_player, make_content):
    from storage.content_store import execute

    t = _utype()
    cid = make_content(type=t, name="Doomed")
    _synthetic_feature(monkeypatch, t)
    pid = new_player()
    crystallized = P.interact(pid, "tfeat")
    assert crystallized["status"] == "crystallized"

    execute("UPDATE content_items SET status = 'retired' WHERE id = %s", (cid,))
    recalled = P.interact(pid, "tfeat")
    assert recalled["status"] == "recalled"
    assert recalled["retired"] is True
    assert recalled["item"]["content_item_id"] == cid  # the memory persists


def test_recall_active_entity_not_flagged_retired(monkeypatch, new_player, make_content):
    t = _utype()
    make_content(type=t)
    _synthetic_feature(monkeypatch, t)
    pid = new_player()
    P.interact(pid, "tfeat")
    assert P.interact(pid, "tfeat")["retired"] is False


def test_withhold_when_pool_dry(monkeypatch, new_player):
    t = _utype()  # no content of this type exists
    _synthetic_feature(monkeypatch, t)
    pid = new_player()
    r = P.interact(pid, "tfeat")
    assert r["status"] == "withheld" and r["item"] is None


def test_unknown_feature(new_player):
    assert P.interact(new_player(), "no.such.feature")["status"] == "unknown_feature"


# ── deterministic leveling ────────────────────────────────────────────────────

def test_power_tier_thresholds():
    assert _power_tier_for_xp(0) == 1
    assert _power_tier_for_xp(POWER_THRESHOLDS[1] - 1) == 1
    assert _power_tier_for_xp(POWER_THRESHOLDS[1]) == 2
    assert _power_tier_for_xp(10 ** 6) == len(POWER_THRESHOLDS)


def test_crystallize_awards_tier_scaled_xp(monkeypatch, new_player, make_content):
    t = _utype()
    make_content(type=t, revelation_tier=3)  # deeper tier -> more xp
    _synthetic_feature(monkeypatch, t)
    pid = new_player(revelation_tier=3)       # player must be deep enough to see it
    r = P.interact(pid, "tfeat")
    assert r["xp_gain"] == 10 + 5 * (3 - 1)   # XP_BASE + XP_PER_REVELATION*(tier-1)
    assert get_player_state(pid)["xp"] == r["xp_gain"]


def test_xp_crossing_threshold_levels_power(monkeypatch, new_player, make_content):
    t = _utype()
    # tier-1 items give 10xp each; threshold to power 2 is POWER_THRESHOLDS[1].
    for _ in range(POWER_THRESHOLDS[1] // 10 + 1):
        make_content(type=t)
    pid = new_player()
    leveled = False
    for i in range(POWER_THRESHOLDS[1] // 10 + 1):
        feat = _synthetic_feature(monkeypatch, t, key=f"f{i}")
        r = P.interact(pid, feat)
        leveled = leveled or ("leveled" in r)
    assert leveled
    assert get_player_state(pid)["power_tier"] >= 2
