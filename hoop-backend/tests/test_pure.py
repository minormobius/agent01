"""Pure-logic units — no DB, no network."""

from ingestion.pregen_pass import parse_items
from ingestion.tier_labeler import _clamp
from ingestion.world_parser import parse_markdown
from runtime.world_map import SPAWN, feature_at, is_walkable


# ── map geometry ──────────────────────────────────────────────────────────────

def test_spawn_is_walkable():
    assert is_walkable(SPAWN["x"], SPAWN["y"])


def test_walls_and_solid_features_block():
    assert not is_walkable(0, 0)                       # corner wall
    f = feature_at(2, 2)                               # medbay.shelf.a (solid item)
    assert f and not f.get("door")
    assert not is_walkable(f["x"], f["y"])             # solid feature blocks


def test_doors_are_walkable_features():
    door = feature_at(10, 3)                           # door.bays
    assert door and door.get("door")
    assert is_walkable(door["x"], door["y"])


# ── tier clamping (per-axis ranges) ───────────────────────────────────────────

def test_clamp_revelation_and_narrative_cap_at_3():
    assert _clamp("revelation_tier", 9) == 3
    assert _clamp("narrative_tier", 9) == 3
    assert _clamp("revelation_tier", 0) == 1


def test_clamp_power_caps_at_5_and_bad_input_floors():
    assert _clamp("power_tier", 99) == 5
    assert _clamp("power_tier", "nonsense") == 1


# ── generator output normalization ────────────────────────────────────────────

def test_parse_items_drops_nameless_and_unwraps():
    assert parse_items([{"name": "A"}, {"no": "name"}, "junk"], "npc") == [{"name": "A"}]
    assert parse_items({"items": [{"name": "B"}]}, "npc") == [{"name": "B"}]


# ── bible parser ──────────────────────────────────────────────────────────────

def test_parse_markdown_sections_and_title():
    b = parse_markdown("# Ashveil\n\nintro\n\n## The Quiet\n\nthey are calm")
    assert b["title"] == "Ashveil"
    assert "the-quiet" in b["sections"]
    assert "overview" in b["sections"]
