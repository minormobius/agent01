"""Generation fills the gates: persist requires/mechanics/dialogue + prompt asks for them."""

import uuid

import ingestion.pregen_pass as pg
from ingestion.pregen_pass import build_prompt, insert_pending
from runtime.dispatcher import dispatch
from runtime.state_gate import set_fact
from storage.content_store import execute, fetch_one, insert_content_item


def test_insert_persists_requires_mechanics_dialogue():
    cid = insert_content_item({
        "type": "item", "name": "Gated Blade", "description": "x" * 40,
        "mechanics": {"slot": "hand", "stats": {"atk": 3}},
        "requires": {"facts": {"flag.x": True}}, "approved": True,
    })
    row = fetch_one("SELECT content, requires FROM content_items WHERE id = %s", (cid,))
    assert row["requires"] == {"facts": {"flag.x": True}}
    assert row["content"]["mechanics"]["slot"] == "hand"
    execute("DELETE FROM content_items WHERE id = %s", (cid,))


def test_prompt_requests_gameplay_fields_per_type():
    item_p = build_prompt("item", {"raw_markdown": "W"}, 3)
    npc_p = build_prompt("npc", {"raw_markdown": "W"}, 3)
    lore_p = build_prompt("lore_fragment", {"raw_markdown": "W"}, 3)
    assert '"requires"' in item_p and '"mechanics"' in item_p
    assert '"dialogue"' in npc_p and '"requires"' in npc_p
    assert '"mechanics"' not in npc_p          # mechanics is item-only
    assert '"dialogue"' not in item_p          # dialogue is npc-only
    assert '"requires"' in lore_p and '"mechanics"' not in lore_p and '"dialogue"' not in lore_p


def test_insert_pending_threads_new_fields(monkeypatch):
    seen = []
    monkeypatch.setattr(pg, "insert_content_item", lambda item, season=1: seen.append(item) or "x")
    insert_pending([{
        "name": "Sword", "description": "d", "tags": ["t"],
        "mechanics": {"slot": "hand", "stats": {"atk": 2}},
        "requires": {"items": ["whetstone"]},
    }], "item", 1)
    it = seen[0]
    assert it["content"]["mechanics"]["slot"] == "hand"
    assert it["requires"] == {"items": ["whetstone"]}


def test_generated_gate_hides_until_satisfied(new_player):
    t = "ttype_" + uuid.uuid4().hex[:8]
    cid = insert_content_item({
        "type": t, "name": "Hidden", "description": "x" * 40,
        "requires": {"facts": {"flag.gen": True}}, "approved": True,
    })
    pid = new_player()
    assert dispatch(pid, "ctx", t, n=5) == []
    set_fact(pid, "flag.gen", True)
    assert {str(i["id"]) for i in dispatch(pid, "ctx", t, n=5)} == {cid}
    execute("DELETE FROM content_items WHERE id = %s", (cid,))
