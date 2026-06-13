"""Inventory & equipment: take, item-gating, equip stats, unequip/drop cascade."""

from runtime.equipment import derive_stats, equip, get_equipment, unequip
from runtime.inventory import drop, list_inventory, take
from runtime.state_gate import meets
from storage.content_store import execute

MECH = "UPDATE content_items SET content = content || %s::jsonb WHERE id = %s"


def test_take_and_list(new_player, make_content):
    cid = make_content(type="item", name="Wrench")
    pid = new_player()
    take(pid, cid)
    items = list_inventory(pid)
    assert len(items) == 1 and items[0]["name"] == "Wrench"


def test_item_gate_unlocks_after_take(new_player, make_content):
    cid = make_content(type="item", name="Keycard", tags=["keycard"])
    pid = new_player()
    assert meets(pid, {"items": ["keycard"]}) is False
    take(pid, cid)
    assert meets(pid, {"items": ["keycard"]}) is True   # matched by tag
    assert meets(pid, {"items": ["Keycard"]}) is True   # and by name (case-insensitive)


def test_equip_applies_stats(new_player, make_content):
    cid = make_content(type="item", name="Plated Vest")
    execute(MECH, ('{"mechanics":{"slot":"body","stats":{"hp":10,"def":2}}}', cid))
    pid = new_player()
    inv = take(pid, cid)
    base = derive_stats(pid)
    res = equip(pid, str(inv["id"]))
    assert res.get("ok") and res["slot"] == "body"
    assert res["stats"]["hp_max"] == base["hp_max"] + 10
    assert res["stats"]["def"] == base["def"] + 2
    assert get_equipment(pid)["body"]["name"] == "Plated Vest"


def test_equip_non_equippable_item_errors(new_player, make_content):
    cid = make_content(type="item", name="Pebble")  # no mechanics/slot
    pid = new_player()
    inv = take(pid, cid)
    assert "error" in equip(pid, str(inv["id"]))


def test_equip_same_slot_swaps_and_restats(new_player, make_content):
    """Equipping a second item into an occupied slot replaces the first (ON CONFLICT),
    and derived stats reflect only the item now worn — not the sum of both."""
    a = make_content(type="item", name="Dull Blade")
    b = make_content(type="item", name="Keen Blade")
    execute(MECH, ('{"mechanics":{"slot":"hand","stats":{"atk":1}}}', a))
    execute(MECH, ('{"mechanics":{"slot":"hand","stats":{"atk":4}}}', b))
    pid = new_player()
    base = derive_stats(pid)
    equip(pid, str(take(pid, a)["id"]))
    equip(pid, str(take(pid, b)["id"]))
    assert get_equipment(pid)["hand"]["name"] == "Keen Blade"   # second won the slot
    assert derive_stats(pid)["atk"] == base["atk"] + 4          # only Keen counts, not 1+4


def test_unequip_and_drop_cascade(new_player, make_content):
    cid = make_content(type="item", name="Ring")
    execute(MECH, ('{"mechanics":{"slot":"finger","stats":{"atk":1}}}', cid))
    pid = new_player()
    iid = str(take(pid, cid)["id"])
    equip(pid, iid)
    assert get_equipment(pid).get("finger")
    unequip(pid, "finger")
    assert "finger" not in get_equipment(pid)
    equip(pid, iid)
    assert drop(pid, iid) is True
    assert list_inventory(pid) == []
    assert get_equipment(pid) == {}   # equipment row cascaded with the inventory row
