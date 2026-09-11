//! The transition rule, which is a table of crafting recipes.
//!
//! After Matt Henderson's "A cellular automaton from Minecraft crafting
//! recipes" (2026-09-11). The recipes are Minecraft's — facts about a game,
//! written out here in our own form. **No Mojang assets are used anywhere in
//! this surface**: the item art is drawn by our own code, and this table is
//! typed out rather than lifted from the game's data files.
//!
//! The tree is deliberately the one the video reaches: seed the grid with oak
//! logs, oak planks and cobblestone, and everything below is downstream of
//! those three. Which is why the whole table needs a legend of only four
//! ingredients — every recipe here takes planks, logs, cobblestone or sticks
//! and nothing else.
//!
//! ## Yields are the whole ecology
//!
//! A recipe that returns more items than it consumes is a *source*. One log
//! becomes four planks; two planks become four sticks; three planks become six
//! slabs. In the video's final histogram the ranking is sticks, cobblestone,
//! cobblestone slabs, planks, oak slabs — which is very nearly the ranking of
//! these yields, and is the evidence that the extra outputs really do get
//! placed rather than dropped. Without them the grid would only ever lose
//! items and would grind to a halt; with them it fills up, which is what the
//! video shows happening.

/// Cell value 0 is an empty slot, so item ids start at 1.
pub const EMPTY: u16 = 0;

/// Every item, in id order (id = index + 1). The first three are the seed
/// stock; the rest can only arrive by being crafted.
pub const ITEMS: &[&str] = &[
    // -- seeded --------------------------------------------------------
    "oak_log",
    "oak_planks",
    "cobblestone",
    // -- the first rung ------------------------------------------------
    "stick",
    // -- wood ----------------------------------------------------------
    "crafting_table",
    "chest",
    "oak_slab",
    "oak_stairs",
    "oak_door",
    "oak_trapdoor",
    "oak_fence",
    "oak_fence_gate",
    "oak_pressure_plate",
    "oak_button",
    "oak_sign",
    "bowl",
    "oak_boat",
    "ladder",
    // -- stone ---------------------------------------------------------
    "cobblestone_slab",
    "cobblestone_stairs",
    "cobblestone_wall",
    "furnace",
    "lever",
    // -- tools ---------------------------------------------------------
    "wooden_sword",
    "wooden_shovel",
    "wooden_pickaxe",
    "wooden_axe",
    "wooden_hoe",
    "stone_sword",
    "stone_shovel",
    "stone_pickaxe",
    "stone_axe",
    "stone_hoe",
];

/// The only four ingredients in the whole table. `.` is an empty slot, and it
/// has to be *actually* empty on the grid for the recipe to match — the hole
/// in the middle of a chest is part of the chest's shape.
const LEGEND: &[(char, &str)] = &[
    ('L', "oak_log"),
    ('P', "oak_planks"),
    ('C', "cobblestone"),
    ('S', "stick"),
];

/// (output, yield, rows). Rows are the recipe's *trimmed* shape — no padding
/// to 3×3 — because on a grid with no crafting table there is nothing for the
/// padding to be relative to. The shape is matched wherever it fits.
const TABLE: &[(&str, u8, &[&str])] = &[
    // ---- the two that make everything else possible ------------------
    ("oak_planks",          4, &["L"]),
    ("stick",               4, &["P",
                                 "P"]),

    // ---- wood --------------------------------------------------------
    ("crafting_table",      1, &["PP",
                                 "PP"]),
    ("chest",               1, &["PPP",
                                 "P.P",
                                 "PPP"]),
    ("oak_slab",            6, &["PPP"]),
    ("oak_stairs",          4, &["P..",
                                 "PP.",
                                 "PPP"]),
    ("oak_door",            3, &["PP",
                                 "PP",
                                 "PP"]),
    ("oak_trapdoor",        2, &["PPP",
                                 "PPP"]),
    ("oak_fence",           3, &["PSP",
                                 "PSP"]),
    ("oak_fence_gate",      1, &["SPS",
                                 "SPS"]),
    ("oak_pressure_plate",  1, &["PP"]),
    // One plank in, one button out. Left in the table and banned by default,
    // because unbanned it is a cancer: it turns every plank on the grid into a
    // button, and buttons are an ingredient in nothing. "and banned buttons".
    ("oak_button",          1, &["P"]),
    ("oak_sign",            3, &["PPP",
                                 "PPP",
                                 ".S."]),
    ("bowl",                4, &["P.P",
                                 ".P."]),
    ("oak_boat",            1, &["P.P",
                                 "PPP"]),
    ("ladder",              3, &["S.S",
                                 "SSS",
                                 "S.S"]),

    // ---- stone ---------------------------------------------------------
    ("cobblestone_slab",    6, &["CCC"]),
    ("cobblestone_stairs",  4, &["C..",
                                 "CC.",
                                 "CCC"]),
    ("cobblestone_wall",    6, &["CCC",
                                 "CCC"]),
    ("furnace",             1, &["CCC",
                                 "C.C",
                                 "CCC"]),
    ("lever",               1, &["S",
                                 "C"]),

    // ---- tools ---------------------------------------------------------
    ("wooden_sword",        1, &["P", "P", "S"]),
    ("wooden_shovel",       1, &["P", "S", "S"]),
    ("wooden_pickaxe",      1, &["PPP",
                                 ".S.",
                                 ".S."]),
    ("wooden_axe",          1, &["PP.",
                                 "PS.",
                                 ".S."]),
    ("wooden_hoe",          1, &["PP.",
                                 ".S.",
                                 ".S."]),
    ("stone_sword",         1, &["C", "C", "S"]),
    ("stone_shovel",        1, &["C", "S", "S"]),
    ("stone_pickaxe",       1, &["CCC",
                                 ".S.",
                                 ".S."]),
    ("stone_axe",           1, &["CC.",
                                 "CS.",
                                 ".S."]),
    ("stone_hoe",           1, &["CC.",
                                 ".S.",
                                 ".S."]),
];

/// Items the grid is seeded with. Everything else has to be made.
pub const SEEDS: &[&str] = &["oak_log", "oak_planks", "cobblestone"];

/// Banned before anyone touches a control. One entry, and it is the one he
/// named.
pub const BANNED_BY_DEFAULT: &[&str] = &["oak_button"];

#[derive(Clone, Debug)]
pub struct Recipe {
    /// index into `ITEMS`, + 1
    pub out: u16,
    pub yield_: u8,
    pub w: u8,
    pub h: u8,
    /// w*h cells, row major, EMPTY where the recipe needs an empty slot
    pub cells: Vec<u16>,
    /// index into TABLE — mirrored variants share it, so the UI can show one
    /// entry per recipe rather than two
    pub source: u16,
    pub mirrored: bool,
}

impl Recipe {
    pub fn at(&self, x: u8, y: u8) -> u16 { self.cells[y as usize * self.w as usize + x as usize] }
    pub fn ingredients(&self) -> usize { self.cells.iter().filter(|&&c| c != EMPTY).count() }
}

pub fn item_id(name: &str) -> Option<u16> {
    ITEMS.iter().position(|&n| n == name).map(|i| i as u16 + 1)
}

pub fn item_name(id: u16) -> &'static str {
    if id == EMPTY { "" } else { ITEMS[id as usize - 1] }
}

fn legend_id(c: char) -> u16 {
    if c == '.' { return EMPTY; }
    match LEGEND.iter().find(|(ch, _)| *ch == c) {
        Some((_, name)) => item_id(name).expect("legend names an item that is not in ITEMS"),
        None => panic!("recipe shape uses a character that is not in the legend"),
    }
}

/// Build the recipe list, mirrored variants included.
///
/// Minecraft matches a shaped recipe mirrored left-to-right — a wooden axe is
/// the same axe facing either way — so the automaton does too, or half the
/// axes the grid stumbles into would be invisible to it. A palindromic shape
/// is not duplicated.
pub fn all() -> Vec<Recipe> {
    let mut out = Vec::with_capacity(TABLE.len() * 2);
    for (i, &(name, yield_, rows)) in TABLE.iter().enumerate() {
        let h = rows.len() as u8;
        let w = rows[0].chars().count() as u8;
        assert!(w >= 1 && w <= 3 && h >= 1 && h <= 3, "{name}: a crafting grid is 3×3");
        let mut cells = Vec::with_capacity((w * h) as usize);
        for r in rows {
            assert_eq!(r.chars().count(), w as usize, "{name}: ragged shape");
            for c in r.chars() { cells.push(legend_id(c)); }
        }
        let base = Recipe {
            out: item_id(name).unwrap_or_else(|| panic!("{name} is crafted but not in ITEMS")),
            yield_, w, h, cells, source: i as u16, mirrored: false,
        };
        let mut flipped = base.clone();
        flipped.mirrored = true;
        for y in 0..h as usize {
            for x in 0..w as usize {
                flipped.cells[y * w as usize + x] = base.cells[y * w as usize + (w as usize - 1 - x)];
            }
        }
        let distinct = flipped.cells != base.cells;
        out.push(base);
        if distinct { out.push(flipped); }
    }
    out
}
