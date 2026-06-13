"""Deterministic content normalization: flag-key convention + dialogue dead-end repair."""

from runtime.dialogue_validate import validate_tree
from storage.content_normalize import (
    fix_fact_key, normalize_content, normalize_dialogue, normalize_requires,
)


def test_fix_fact_key_prefixes():
    assert fix_fact_key("flag:opened") == "flag.opened"
    assert fix_fact_key("count:kills") == "count.kills"
    assert fix_fact_key("rep:keepers") == "rep.keepers"
    assert fix_fact_key("flag.already") == "flag.already"   # untouched
    assert fix_fact_key("weird:thing") == "weird:thing"     # only known prefixes
    assert fix_fact_key("flag:a:b") == "flag.a:b"           # only the leading prefix colon


def test_normalize_requires_fixes_fact_keys_only():
    r = normalize_requires({"facts": {"flag:x": True}, "items": ["key:card"], "min_rep": {"keepers": 2}})
    assert r["facts"] == {"flag.x": True}
    assert r["items"] == ["key:card"]          # item tokens untouched
    assert r["min_rep"] == {"keepers": 2}      # factions untouched


def test_normalize_dialogue_fixes_keys_and_adds_exit():
    tree = {"start": "g", "nodes": {
        "g": {"says": "hi", "choices": [
            {"id": "a", "text": "x", "requires": {"facts": {"flag:seen": True}},
             "effects": {"set_facts": {"flag:done": True}}, "goto": "leaf"}]},
        "leaf": {"says": "end of the line", "choices": []},
    }}
    out = normalize_dialogue(tree)
    ch = out["nodes"]["g"]["choices"][0]
    assert ch["requires"]["facts"] == {"flag.seen": True}
    assert ch["effects"]["set_facts"] == {"flag.done": True}
    # the choiceless 'leaf' node now has a Leave/end choice
    leaf_choices = out["nodes"]["leaf"]["choices"]
    assert len(leaf_choices) == 1 and leaf_choices[0]["effects"]["end"] is True
    # …and that makes the validator's stuck_node warning go away
    assert not any(i.code == "stuck_node" for i in validate_tree(out))


def test_normalize_content_leaves_non_dialogue_alone():
    c = {"name": "Rock", "description": "a rock", "mechanics": {"slot": "hand"}}
    assert normalize_content(c) == c


def test_insert_normalizes_round_trip():
    from storage.content_store import execute, fetch_one, insert_content_item

    tree = {"start": "g", "nodes": {
        "g": {"says": "hi", "choices": [{"id": "a", "text": "x", "goto": "dead"}]},
        "dead": {"says": "stuck", "choices": []}}}
    cid = insert_content_item({
        "type": "npc",
        "content": {"name": "NormTest", "description": "x" * 30, "dialogue": tree},
        "requires": {"facts": {"flag:gateway": True}},
        "approved": False,
    })
    try:
        row = fetch_one("SELECT content, requires FROM content_items WHERE id = %s", (cid,))
        assert row["requires"]["facts"] == {"flag.gateway": True}             # gate key fixed
        dead = row["content"]["dialogue"]["nodes"]["dead"]["choices"]
        assert dead and dead[0]["effects"]["end"] is True                     # exit added
        assert validate_tree(row["content"]["dialogue"]) == []                # now clean
    finally:
        execute("DELETE FROM content_items WHERE id = %s", (cid,))
