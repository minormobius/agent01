"""Dialogue trees + NPC relationship state: gating, effects, standing, reactivity."""

import json

from runtime.dialogue import choose, talk
from runtime.state_gate import adjust_rep, get_rep, meets
from storage.content_store import execute, fetch_one

TREE = {
    "start": "greet",
    "nodes": {
        "greet": {"says": "What do you want?", "choices": [
            {"id": "ask", "text": "Tell me about the hatch.",
             "effects": {"set_facts": {"flag.knows_hatch": True}, "adjust_standing": 1,
                         "adjust_rep": {"keepers": 1}}, "goto": "hatch"},
            {"id": "secret", "text": "[Trusted] The real secret?",
             "requires": {"min_standing": 1}, "effects": {"set_facts": {"flag.told_secret": True}},
             "goto": "secret"},
        ]},
        "hatch": {"says": "It runs warm. Don't go down there.",
                  "choices": [{"id": "back", "text": "...", "goto": "greet"}]},
        "secret": {"says": "Below seven, something breathes.",
                   "choices": [{"id": "bye", "text": "Leave.", "effects": {"end": True}, "goto": "greet"}]},
    },
}


def _npc_with_tree(make_content, tree=TREE):
    cid = make_content(type="npc", name="Warden")
    execute("UPDATE content_items SET content = content || %s::jsonb WHERE id = %s",
            (json.dumps({"dialogue": tree}), cid))
    return cid


def test_npc_without_tree_has_no_choices(new_player, make_content):
    cid = make_content(type="npc", name="Mute")
    r = talk(new_player(), cid)
    assert r["no_tree"] is True and r["choices"] == []


def test_talk_shows_only_currently_available_choices(new_player, make_content):
    cid = _npc_with_tree(make_content)
    pid = new_player()
    r = talk(pid, cid)
    ids = {c["id"] for c in r["choices"]}
    assert ids == {"ask"}            # 'secret' is gated by min_standing 1
    assert r["node"] == "greet"


def test_choose_applies_effects_and_advances(new_player, make_content):
    cid = _npc_with_tree(make_content)
    pid = new_player()
    after = choose(pid, cid, "ask")
    assert after["node"] == "hatch" and "warm" in after["says"]
    assert after["standing"] == 1
    assert meets(pid, {"facts": {"flag.knows_hatch": True}}) is True
    assert get_rep(pid, "keepers") == 1


def test_standing_unlocks_a_gated_branch(new_player, make_content):
    cid = _npc_with_tree(make_content)
    pid = new_player()
    choose(pid, cid, "ask")        # standing -> 1, now at 'hatch'
    choose(pid, cid, "back")       # back to greet
    r = talk(pid, cid)
    assert {c["id"] for c in r["choices"]} == {"ask", "secret"}   # 'secret' now visible
    end = choose(pid, cid, "secret")
    assert meets(pid, {"facts": {"flag.told_secret": True}}) is True


def test_choosing_an_unavailable_choice_is_rejected(new_player, make_content):
    cid = _npc_with_tree(make_content)
    pid = new_player()
    assert "error" in choose(pid, cid, "secret")   # gated; standing still 0


def test_dialogue_can_give_items(new_player, make_content):
    item = make_content(type="item", name="Keeper Token")
    tree = {"start": "g", "nodes": {"g": {"says": "Take this.", "choices": [
        {"id": "t", "text": "Thanks.", "effects": {"give_items": [item]}, "goto": "g"}]}}}
    cid = _npc_with_tree(make_content, tree)
    pid = new_player()
    choose(pid, cid, "t")
    from runtime.inventory import list_inventory
    assert any(i["name"] == "Keeper Token" for i in list_inventory(pid))


def test_reputation_unlocks_a_dialogue_choice(new_player, make_content):
    """min_rep gating: the same NPC offers more once you've earned faction standing —
    'how the world reacts to YOU' via reputation, not just per-NPC standing."""
    tree = {"start": "g", "nodes": {"g": {"says": "State your business.", "choices": [
        {"id": "open", "text": "[Keepers 2] Speak freely.",
         "requires": {"min_rep": {"keepers": 2}},
         "effects": {"set_facts": {"flag.keeper_confided": True}}, "goto": "g"}]}}}
    cid = _npc_with_tree(make_content, tree)
    pid = new_player()
    assert {c["id"] for c in talk(pid, cid)["choices"]} == set()   # rep 0 -> hidden
    adjust_rep(pid, "keepers", 2)
    assert {c["id"] for c in talk(pid, cid)["choices"]} == {"open"}
    choose(pid, cid, "open")
    assert meets(pid, {"facts": {"flag.keeper_confided": True}}) is True


def test_item_gates_a_dialogue_choice(new_player, make_content):
    """requires.items on a choice: an option only appears while the player carries
    the item (matched by name or tag, via the shared gate)."""
    item = make_content(type="item", name="Orsel's Seal", tags=["seal"])
    tree = {"start": "g", "nodes": {"g": {"says": "Show me you belong.", "choices": [
        {"id": "present", "text": "Present the seal.",
         "requires": {"items": ["seal"]}, "effects": {"adjust_standing": 1}, "goto": "g"}]}}}
    cid = _npc_with_tree(make_content, tree)
    pid = new_player()
    assert {c["id"] for c in talk(pid, cid)["choices"]} == set()   # no item -> hidden
    from runtime.inventory import take
    take(pid, item)
    assert {c["id"] for c in talk(pid, cid)["choices"]} == {"present"}


def test_npc_flag_set_then_gates_a_later_choice(new_player, make_content):
    """set_npc_flags effect + npc_flags requires: an NPC remembers something you did
    (per-NPC flag) and a later choice unlocks on it."""
    tree = {"start": "g", "nodes": {"g": {"says": "Well?", "choices": [
        {"id": "ask", "text": "Ask about the breach.",
         "effects": {"set_npc_flags": {"asked_breach": True}}, "goto": "g"},
        {"id": "followup", "text": "[Recalled] And the bodies?",
         "requires": {"npc_flags": {"asked_breach": True}},
         "effects": {"set_facts": {"flag.knows_bodies": True}}, "goto": "g"}]}}}
    cid = _npc_with_tree(make_content, tree)
    pid = new_player()
    assert {c["id"] for c in talk(pid, cid)["choices"]} == {"ask"}   # followup gated
    choose(pid, cid, "ask")
    assert {c["id"] for c in talk(pid, cid)["choices"]} == {"ask", "followup"}
    choose(pid, cid, "followup")
    assert meets(pid, {"facts": {"flag.knows_bodies": True}}) is True
