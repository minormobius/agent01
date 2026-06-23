//! Dungeon stocking: populates rooms with monsters, treasure, traps, and
//! specials per the OSE "Random Room Stocking" procedure (d6 per room).
//!
//! Monster encounter tables are transcribed from the OSE SRD page
//! "Dungeon Encounter By Level: 1–3". Trap and special examples are the
//! lists under "Designing a Dungeon § Example Room Traps / Example
//! Treasure Traps / Example Specials".
//!
//! OSE SRD content is Open Game Content under the Open Game License v1.0a.

use rand::Rng;
use rand::seq::SliceRandom;

use std::fmt;

// ---------- Treasure ----------

/// A pile of loot. Coin counts are in pieces of that denomination; gems and
/// jewellery are counts of items (value is not rolled in this pass).
#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct Treasure {
    pub cp: u32,
    pub sp: u32,
    pub ep: u32,
    pub gp: u32,
    pub pp: u32,
    pub gems: u32,
    pub jewellery: u32,
}

impl Treasure {
    pub fn is_empty(&self) -> bool {
        self.cp == 0 && self.sp == 0 && self.ep == 0
            && self.gp == 0 && self.pp == 0
            && self.gems == 0 && self.jewellery == 0
    }

    /// Approximate total value in gp (OSE coin rates: 1pp = 5gp, 1gp = 2ep,
    /// 1gp = 10sp, 1gp = 100cp). Gems and jewellery excluded — they have
    /// variable value that we don't roll here.
    pub fn gp_value(&self) -> u32 {
        self.cp / 100 + self.sp / 10 + self.ep / 2 + self.gp + self.pp * 5
    }
}

impl fmt::Display for Treasure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let mut parts: Vec<String> = Vec::new();
        if self.pp > 0 { parts.push(format!("{}pp", self.pp)); }
        if self.gp > 0 { parts.push(format!("{}gp", self.gp)); }
        if self.ep > 0 { parts.push(format!("{}ep", self.ep)); }
        if self.sp > 0 { parts.push(format!("{}sp", self.sp)); }
        if self.cp > 0 { parts.push(format!("{}cp", self.cp)); }
        if self.gems > 0 {
            parts.push(format!("{} gem{}", self.gems,
                if self.gems == 1 { "" } else { "s" }));
        }
        if self.jewellery > 0 {
            parts.push(format!("{} piece{} of jewellery", self.jewellery,
                if self.jewellery == 1 { "" } else { "s" }));
        }
        if parts.is_empty() {
            write!(f, "nothing")
        } else {
            write!(f, "{}", parts.join(", "))
        }
    }
}

// ---------- Monster ----------

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct Monster {
    pub name: &'static str,
    pub count: u32,
}

impl fmt::Display for Monster {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{} × {}", self.count, self.name)
    }
}

// ---------- Room contents ----------

#[derive(Clone, Debug)]
pub enum RoomContents {
    Empty    { treasure: Option<Treasure> },
    Monster  { monster: Monster,       treasure: Option<Treasure> },
    Trap     { description: &'static str, treasure: Option<Treasure> },
    Special  { description: &'static str },
}

impl RoomContents {
    /// Single-character glyph used for quick map overlays.
    pub fn glyph(&self) -> char {
        match self {
            RoomContents::Empty   { treasure: Some(_) } => '$',
            RoomContents::Empty   { .. }                => '.',
            RoomContents::Monster { .. }                => 'M',
            RoomContents::Trap    { .. }                => '^',
            RoomContents::Special { .. }                => '?',
        }
    }
}

impl fmt::Display for RoomContents {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            RoomContents::Empty { treasure } => match treasure {
                None    => write!(f, "Empty."),
                Some(t) => write!(f, "Empty, but an unguarded cache: {}.", t),
            },
            RoomContents::Monster { monster, treasure } => match treasure {
                None    => write!(f, "Monster: {}.", monster),
                Some(t) => write!(f, "Monster: {}. Treasure: {}.", monster, t),
            },
            RoomContents::Trap { description, treasure } => match treasure {
                None    => write!(f, "Trap — {}", description),
                Some(t) => write!(f, "Trap — {} Treasure: {}.", description, t),
            },
            RoomContents::Special { description } => {
                write!(f, "Special — {}", description)
            }
        }
    }
}

// ---------- Dice helper ----------

fn roll(rng: &mut impl Rng, n: u32, sides: u32) -> u32 {
    if sides == 0 || n == 0 { return 0; }
    (0..n).map(|_| rng.gen_range(1..=sides)).sum()
}

// ---------- Encounter tables ----------
//
// Columns of OSE "Dungeon Encounter By Level: 1–3" (d20). Each entry is
// (name, n, sides) where number-appearing = n·d·sides (the constant term
// is zero for every entry on this table).

struct Enc { name: &'static str, n: u32, s: u32 }

const fn e(name: &'static str, n: u32, s: u32) -> Enc { Enc { name, n, s } }

static LEVEL_1: [Enc; 20] = [
    e("Acolyte",          1, 8),
    e("Bandit",           1, 8),
    e("Fire Beetle",      1, 8),
    e("Dwarf",            1, 6),
    e("Gnome",            1, 6),
    e("Goblin",           2, 4),
    e("Green Slime",      1, 4),
    e("Halfling",         3, 6),
    e("Killer Bee",       1, 10),
    e("Kobold",           4, 4),
    e("Gecko Lizard",     1, 3),
    e("Orc",              2, 4),
    e("Giant Shrew",      1, 10),
    e("Skeleton",         3, 4),
    e("Cobra Snake",      1, 6),
    e("Crab Spider",      1, 4),
    e("Sprite",           3, 6),
    e("Stirge",           1, 10),
    e("Trader",           1, 8),
    e("Wolf",             2, 6),
];

static LEVEL_2: [Enc; 20] = [
    e("Oil Beetle",        1, 8),
    e("Berserker",         1, 6),
    e("Mountain Lion",     1, 4),
    e("Elf",               1, 4),
    e("Ghoul",             1, 6),
    e("Gnoll",             1, 6),
    e("Grey Ooze",         1, 1),
    e("Hobgoblin",         1, 6),
    e("Draco Lizard",      1, 4),
    e("Lizard Man",        2, 4),
    e("Neanderthal",       1, 10),
    e("Noble",             2, 6),
    e("Pixie",             2, 4),
    e("Robber Fly",        1, 6),
    e("Rock Baboon",       2, 6),
    e("Pit Viper",         1, 8),
    e("Black Widow Spider",1, 3),
    e("Troglodyte",        1, 8),
    e("Veteran",           2, 4),
    e("Zombie",            2, 4),
];

static LEVEL_3: [Enc; 20] = [
    e("White Ape",              1, 6),
    e("Basic Adventurers",      1, 4), // 1d4+4 — constant term omitted; bumped below
    e("Tiger Beetle",           1, 6),
    e("Bugbear",                2, 4),
    e("Carcass Crawler",        1, 3),
    e("Doppelgänger",           1, 6),
    e("Driver Ant",             2, 4),
    e("Gargoyle",               1, 6),
    e("Gelatinous Cube",        1, 1),
    e("Harpy",                  1, 6),
    e("Crystal Living Statue",  1, 6),
    e("Wererat",                1, 8),
    e("Medium",                 1, 4),
    e("Medusa",                 1, 3),
    e("Ochre Jelly",            1, 1),
    e("Ogre",                   1, 6),
    e("Shadow",                 1, 8),
    e("Tarantella Spider",      1, 3),
    e("Thoul",                  1, 6),
    e("Wight",                  1, 6),
];

fn encounter_table(level: u8) -> &'static [Enc; 20] {
    match level {
        1 => &LEVEL_1,
        2 => &LEVEL_2,
        _ => &LEVEL_3,
    }
}

fn roll_monster(level: u8, rng: &mut impl Rng) -> Monster {
    let table = encounter_table(level);
    let idx = rng.gen_range(0..20);
    let Enc { name, n, s } = table[idx];
    let mut count = roll(rng, n, s).max(1);
    // Level-3 entry 2 is "Basic Adventurers (1d4+4)" — bump to honour the +4.
    if level >= 3 && name == "Basic Adventurers" { count += 4; }
    Monster { name, count }
}

// ---------- Trap and special tables ----------
//
// Verbatim from OSE SRD "Designing a Dungeon" — example lists.

static ROOM_TRAPS: [&str; 6] = [
    "Falling block: inflicts 1d10 damage (save vs petrification to avoid).",
    "Gas: poisonous gas fills the room (save vs poison or die).",
    "Mist: harmless; looks like poison gas.",
    "Pit: opens beneath the characters' feet, inflicting falling damage.",
    "Scything blade: swings from the ceiling, attacking for 1d8 damage.",
    "Slide: opens beneath the characters' feet, sending them to a lower level.",
];

static TREASURE_TRAPS: [&str; 6] = [
    "Darts: 1d6 spring-loaded darts fire, 1d4 damage each.",
    "Flash of light: blindness for 1d8 turns (save vs spells).",
    "Hidden monster (e.g. a snake) released when the treasure is disturbed.",
    "Illusion of a monster: AC 9 [10], vanishes if hit; attacks knock PCs unconscious for 1d4 turns instead of killing.",
    "Spray: liquid coats the character; wandering-monster chance doubles for 1d6 hours.",
    "Sprung needle coated with poison (save vs poison or die).",
];

static SPECIALS: [&str; 8] = [
    "Alarm: entry alarm that attracts nearby guardians.",
    "Animating objects: inanimate objects attack if disturbed.",
    "Falling blocks: stone block falls to prevent passage.",
    "Illusions: illusionary passages, doors, or stairways.",
    "Shifting architecture: doors lock and the room rotates, rises, or falls.",
    "Strange waters: pool or fountain with weird, magical effects.",
    "Teleport: magical portal or teleporter to another area of the dungeon.",
    "Trapdoor: leading to a hidden area.",
];

// ---------- Treasure rolls ----------
//
// OSE ties treasure to monster type (types A–V) and, for unguarded caches,
// to dungeon level. We don't yet have monster stat blocks parsed, so v1 uses
// a dungeon-level-scaled coin pile plus a small gem/jewellery chance. That
// preserves the "deeper = richer" principle without pretending to faithfully
// reproduce the per-monster treasure types. Refine later once the monster
// DB is in place.

fn roll_treasure(level: u8, guarded: bool, rng: &mut impl Rng) -> Treasure {
    let mut t = Treasure::default();
    let scale = if guarded { 1 } else { 0 }; // unguarded: one tier down
    let tier = (level as i32 + scale as i32).max(1) as u8;

    match tier {
        1 => {
            t.sp = roll(rng, 1, 6) * 100;
            t.gp = roll(rng, 1, 6) * 10;
            if rng.gen_bool(0.10) { t.gems = roll(rng, 1, 4); }
        }
        2 => {
            t.sp = roll(rng, 2, 6) * 100;
            t.gp = roll(rng, 1, 6) * 100;
            if rng.gen_bool(0.20) { t.gems = roll(rng, 1, 6); }
            if rng.gen_bool(0.05) { t.jewellery = 1; }
        }
        _ => {
            t.sp = roll(rng, 1, 6) * 1000;
            t.gp = roll(rng, 2, 6) * 100;
            if rng.gen_bool(0.30) { t.gems = roll(rng, 1, 6); }
            if rng.gen_bool(0.10) { t.jewellery = roll(rng, 1, 2); }
            if rng.gen_bool(0.05) { t.pp = roll(rng, 1, 4) * 10; }
        }
    }
    t
}

// ---------- Stocker ----------

/// Roll stocking for `n_rooms` rooms at the given dungeon `level`.
/// Returns one `RoomContents` entry per room, in the same order as the
/// map's `rooms` vector.
pub fn stock_rooms(n_rooms: usize, level: u8, rng: &mut impl Rng) -> Vec<RoomContents> {
    (0..n_rooms).map(|_| stock_one(level, rng)).collect()
}

fn stock_one(level: u8, rng: &mut impl Rng) -> RoomContents {
    match rng.gen_range(1..=6) {
        1 | 2 => {
            // Empty — 1-in-6 chance of an unguarded cache.
            let treasure = if rng.gen_range(1..=6) == 1 {
                Some(roll_treasure(level, false, rng))
            } else { None };
            RoomContents::Empty { treasure }
        }
        3 | 4 => {
            // Monster — 3-in-6 chance of (guarded) treasure.
            let monster = roll_monster(level, rng);
            let treasure = if rng.gen_range(1..=6) <= 3 {
                Some(roll_treasure(level, true, rng))
            } else { None };
            RoomContents::Monster { monster, treasure }
        }
        5 => {
            // Special — no treasure.
            let description = *SPECIALS.choose(rng).expect("specials non-empty");
            RoomContents::Special { description }
        }
        _ => {
            // Trap — 2-in-6 chance of treasure. If treasure, it's a
            // treasure-trap; otherwise a room-trap.
            let has_treasure = rng.gen_range(1..=6) <= 2;
            let description = if has_treasure {
                *TREASURE_TRAPS.choose(rng).expect("treasure traps non-empty")
            } else {
                *ROOM_TRAPS.choose(rng).expect("room traps non-empty")
            };
            let treasure = if has_treasure {
                Some(roll_treasure(level, false, rng))
            } else { None };
            RoomContents::Trap { description, treasure }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rand::rngs::StdRng;
    use rand::SeedableRng;

    #[test]
    fn stocks_all_rooms() {
        let mut rng = StdRng::seed_from_u64(42);
        let contents = stock_rooms(9, 1, &mut rng);
        assert_eq!(contents.len(), 9);
    }

    #[test]
    fn treasure_display_lists_coins_in_descending_denomination() {
        let t = Treasure { gp: 10, sp: 5, ..Default::default() };
        assert_eq!(format!("{}", t), "10gp, 5sp");
    }

    #[test]
    fn empty_treasure_reports_empty() {
        let t = Treasure::default();
        assert!(t.is_empty());
        assert_eq!(t.gp_value(), 0);
    }

    #[test]
    fn gp_value_sums_coin_conversions() {
        let t = Treasure { cp: 200, sp: 50, ep: 4, gp: 7, pp: 3, ..Default::default() };
        // 200cp=2gp, 50sp=5gp, 4ep=2gp, 7gp=7gp, 3pp=15gp → 31gp
        assert_eq!(t.gp_value(), 31);
    }

    #[test]
    fn monster_rolls_are_at_least_one() {
        let mut rng = StdRng::seed_from_u64(1);
        for _ in 0..200 {
            let m = roll_monster(1, &mut rng);
            assert!(m.count >= 1, "monster count was {} for {}", m.count, m.name);
        }
    }
}
