"""The spine: player facts/reputation + the generic requirement gate."""

import uuid

from runtime.dispatcher import dispatch
from runtime.state_gate import (
    adjust_rep, get_facts, get_rep, incr_fact, meets, set_fact,
)
from storage.content_store import execute


def _ut() -> str:
    return "ttype_" + uuid.uuid4().hex[:8]


def test_facts_set_get_incr_and_rep(new_player):
    pid = new_player()
    assert get_facts(pid) == {}
    set_fact(pid, "flag.opened_hatch", True)
    assert get_facts(pid)["flag.opened_hatch"] is True
    assert incr_fact(pid, "count.lurkers_killed", 2) == 2
    assert incr_fact(pid, "count.lurkers_killed", 3) == 5
    assert get_rep(pid, "keepers") == 0
    assert adjust_rep(pid, "keepers", 4) == 4
    assert get_rep(pid, "keepers") == 4


def test_meets_truth_table(new_player):
    pid = new_player()
    assert meets(pid, {}) is True
    assert meets(pid, None) is True
    assert meets(pid, {"facts": {"flag.x": True}}) is False
    set_fact(pid, "flag.x", True)
    assert meets(pid, {"facts": {"flag.x": True}}) is True
    assert meets(pid, {"min_rep": {"keepers": 1}}) is False
    adjust_rep(pid, "keepers", 2)
    assert meets(pid, {"min_rep": {"keepers": 1}}) is True
    assert meets(pid, {"items": ["keycard"]}) is False  # nothing in inventory
    # all clauses must hold (AND)
    assert meets(pid, {"facts": {"flag.x": True}, "min_rep": {"keepers": 1}}) is True
    assert meets(pid, {"facts": {"flag.x": True}, "min_rep": {"keepers": 9}}) is False


def test_dispatch_hides_gated_content_until_fact_set(new_player, make_content):
    t = _ut()
    gated = make_content(type=t)
    execute("UPDATE content_items SET requires = %s WHERE id = %s",
            ('{"facts": {"flag.k": true}}', gated))
    pid = new_player()
    assert dispatch(pid, "ctx", t, n=5) == []          # gated out, nothing else of this type
    set_fact(pid, "flag.k", True)
    got = {str(i["id"]) for i in dispatch(pid, "ctx", t, n=5)}
    assert gated in got                                 # now reachable


def test_dispatch_ungated_content_unaffected(new_player, make_content):
    t = _ut()
    a = make_content(type=t)
    b = make_content(type=t)
    pid = new_player()
    ids = {str(i["id"]) for i in dispatch(pid, "ctx", t, n=10)}
    assert a in ids and b in ids                        # empty requires -> always available
