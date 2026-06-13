"""Hand-authored station map — the geometry the web client renders and walks.

The map is *shared world geometry*: walls, floor, doors, and the fixed positions
of interactable features (a shelf here, an NPC there). It is deliberately dumb and
static. What is NOT here is identity: a feature is just "a shelf" until a specific
player interacts with it, at which point the placement layer crystallizes one pool
item onto it (see runtime/placement.py). So geometry is shared; identity is
per-player and persistent.

feature_key is the stable handle the crystallization binding is keyed on — it must
never change for a given feature, or a player's frozen world would shift under them.

Terrain glyphs:  #=wall  .=floor  +=door (walkable, crystallizes on first pass)
Feature glyphs are impassable except doors; walking into one == interacting.
"""

# 31 wide × 15 tall. Three upper rooms (med bay · storage · crew quarters) joined by
# doors, a central corridor below them, and three lower rooms (reactor · sealed lab ·
# observation) reached down through the corridor. Vertical passages sit at x=5/15/25.
TERRAIN = [
    "###############################",  # 0
    "#.........#.........#.........#",  # 1   med bay  | storage  | crew quarters
    "#.........#.........#.........#",  # 2
    "#.........+.........+.........#",  # 3   doors at x=10 (bays) and x=20 (crew)
    "#.........#.........#.........#",  # 4
    "#.........#.........#.........#",  # 5
    "#####.#########.#########.#####",  # 6   passages down at x=5/15/25
    "#.............................#",  # 7   central corridor
    "#.............................#",  # 8
    "#####.#########.#########.#####",  # 9   passages down at x=5/15/25
    "#.........#.........#.........#",  # 10  reactor  | sealed lab | observation
    "#.........#.........#.........#",  # 11
    "#.........#.........#.........#",  # 12
    "#.........#.........#.........#",  # 13
    "###############################",  # 14
]

WALKABLE_TERRAIN = set(".+")  # everything else is solid

SPAWN = {"x": 4, "y": 3}

# Each feature sits on a floor tile. `type` selects which content pool the binding
# crystallizes from. Doors are walkable and crystallize the moment you step through.
FEATURES = [
    # ── med bay (upper-left) ──
    {"key": "medbay.shelf.a",  "x": 2,  "y": 2,  "glyph": "S", "type": "item",          "label": "a med-bay supply shelf"},
    {"key": "medbay.table",    "x": 5,  "y": 4,  "glyph": "T", "type": "item",          "label": "an examination table"},
    {"key": "medbay.console",  "x": 8,  "y": 2,  "glyph": "=", "type": "lore_fragment", "label": "a wall console, screen alive"},
    {"key": "medbay.keeper",   "x": 3,  "y": 5,  "glyph": "N", "type": "npc",           "label": "a figure in Keeper grey"},
    # ── doors between the upper rooms ──
    {"key": "door.bays",       "x": 10, "y": 3,  "glyph": "+", "type": "lore_fragment", "label": "the threshold between bays", "door": True},
    {"key": "door.crew",       "x": 20, "y": 3,  "glyph": "+", "type": "lore_fragment", "label": "the hatch to crew quarters", "door": True},
    # ── storage (upper-middle) ──
    {"key": "store.shelf.a",   "x": 14, "y": 2,  "glyph": "s", "type": "item",          "label": "a storage rack"},
    {"key": "store.shelf.b",   "x": 17, "y": 2,  "glyph": "s", "type": "item",          "label": "a storage rack, half-emptied"},
    {"key": "store.terminal",  "x": 14, "y": 4,  "glyph": "=", "type": "lore_fragment", "label": "a cargo terminal"},
    {"key": "store.lurker",    "x": 16, "y": 5,  "glyph": "c", "type": "creature",      "label": "something low and watchful"},
    # ── crew quarters (upper-right) ──
    {"key": "crew.locker",     "x": 23, "y": 2,  "glyph": "s", "type": "item",          "label": "a crew locker, dented"},
    {"key": "crew.bunk",       "x": 26, "y": 2,  "glyph": "T", "type": "item",          "label": "a stripped bunk"},
    {"key": "crew.steward",    "x": 27, "y": 4,  "glyph": "N", "type": "npc",           "label": "a steward in faded blue"},
    # ── reactor (lower-left) ──
    {"key": "reactor.shelf",   "x": 2,  "y": 11, "glyph": "s", "type": "item",          "label": "a parts rack, humming"},
    {"key": "reactor.core",    "x": 7,  "y": 12, "glyph": "=", "type": "lore_fragment", "label": "the reactor control console"},
    {"key": "shaft.hatch",     "x": 3,  "y": 13, "glyph": "?", "type": "plot_beat",      "label": "a maintenance hatch, faintly warm"},
    # ── sealed lab (lower-middle) ──
    {"key": "lab.console",     "x": 13, "y": 11, "glyph": "=", "type": "lore_fragment", "label": "a sealed-lab terminal"},
    {"key": "lab.shelf",       "x": 13, "y": 13, "glyph": "s", "type": "item",          "label": "a specimen shelf"},
    {"key": "lab.specimen",    "x": 17, "y": 12, "glyph": "c", "type": "creature",      "label": "something in a cracked tank"},
    # ── observation (lower-right) ──
    {"key": "obs.window",      "x": 23, "y": 11, "glyph": "=", "type": "lore_fragment", "label": "the observation window, the stars wrong"},
    {"key": "obs.steward",     "x": 27, "y": 12, "glyph": "N", "type": "npc",           "label": "a figure at the glass"},
]

_FEATURE_BY_KEY = {f["key"]: f for f in FEATURES}
_FEATURE_BY_POS = {(f["x"], f["y"]): f for f in FEATURES}


def feature_at(x: int, y: int) -> dict | None:
    return _FEATURE_BY_POS.get((x, y))


def feature_by_key(key: str) -> dict | None:
    return _FEATURE_BY_KEY.get(key)


def is_walkable(x: int, y: int) -> bool:
    """A tile is walkable if it is floor/door terrain and not blocked by a solid
    feature. Doors are walkable even though they are also features."""
    if y < 0 or y >= len(TERRAIN) or x < 0 or x >= len(TERRAIN[y]):
        return False
    if TERRAIN[y][x] not in WALKABLE_TERRAIN:
        return False
    f = feature_at(x, y)
    return f is None or bool(f.get("door"))


def map_payload() -> dict:
    """The full map the client renders. Static; identity is layered on per player
    from /api/placements."""
    return {"terrain": TERRAIN, "spawn": SPAWN, "features": FEATURES}
