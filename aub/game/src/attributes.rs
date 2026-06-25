//! Six-stat attribute block used by both the player and every
//! creature on the map. Mirrors the classic D&D ability roster:
//!
//! - **Strength** — melee damage, push / kick force.
//! - **Agility** — to-hit / dodge, sneaking, lockpicking.
//! - **Toughness** — HP, save vs. environmental damage.
//! - **Intelligence** — crafting, salvage, schematic reading.
//! - **Perception** — vision range, trap-sense, ranged to-hit.
//! - **Willpower** — save vs. fear / stun / mind effects.
//!
//! Player stats roll 3d6 per attribute on character creation; the
//! roll-stats screen lets the player re-roll until satisfied.
//! Creatures default to a flat 10 across the board for now —
//! introduce per-template overrides on `CreatureTemplate::attributes`
//! when individual mob profiles want to diverge.
//!
//! ## Bonus / penalty curve
//!
//! Symmetric around 9–12 = 0, matching the curve the user requested:
//!
//! | Score   | Modifier |
//! |---------|----------|
//! | 18+     | +3       |
//! | 16–17   | +2       |
//! | 13–15   | +1       |
//! | 9–12    | 0        |
//! | 6–8     | −1       |
//! | 4–5     | −2       |
//! | 3       | −3       |
//!
//! `Attributes::modifier(score)` returns the i32 bonus.

use ::rand::{Rng, rngs::StdRng};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub struct Attributes {
    pub strength:     u8,
    pub agility:      u8,
    pub toughness:    u8,
    pub intelligence: u8,
    pub perception:   u8,
    pub willpower:    u8,
}

impl Attributes {
    /// Default block — every score 10 (no bonuses, no penalties).
    /// What every creature template starts at; a future per-creature
    /// override just sets the fields that matter.
    pub const FLAT_10: Self = Self {
        strength:     10,
        agility:      10,
        toughness:    10,
        intelligence: 10,
        perception:   10,
        willpower:    10,
    };

    /// Roll a fresh attribute block — 3d6 per stat, range `[3, 18]`.
    /// Used at character creation and every time the player presses
    /// the re-roll key on the stats screen.
    pub fn roll_3d6(rng: &mut StdRng) -> Self {
        let mut roll = || -> u8 {
            let a = rng.gen_range(1..=6);
            let b = rng.gen_range(1..=6);
            let c = rng.gen_range(1..=6);
            (a + b + c) as u8
        };
        Self {
            strength:     roll(),
            agility:      roll(),
            toughness:    roll(),
            intelligence: roll(),
            perception:   roll(),
            willpower:    roll(),
        }
    }

    /// D&D-style modifier curve for a single attribute score.
    /// Symmetric around 9–12 = 0: every two points above 12 add +1
    /// up to +3 at 18, and every two points below 9 subtract one
    /// down to −3 at 3 or lower. Tweak the thresholds here to
    /// retune the whole game's bonus economy in one place.
    pub fn modifier(score: u8) -> i32 {
        match score {
            0..=3   => -3,
            4..=5   => -2,
            6..=8   => -1,
            9..=12  =>  0,
            13..=15 =>  1,
            16..=17 =>  2,
            _       =>  3,   // 18+
        }
    }

    /// Iterate (label, value) pairs in display order. Labels are
    /// localized via the i18n table (`attr.<id>` keys); the
    /// roll-stats UI just renders whatever this returns.
    pub fn rows(&self) -> [(&'static str, u8); 6] {
        [
            (crate::i18n::tr("attr.strength"),     self.strength),
            (crate::i18n::tr("attr.agility"),      self.agility),
            (crate::i18n::tr("attr.toughness"),    self.toughness),
            (crate::i18n::tr("attr.intelligence"), self.intelligence),
            (crate::i18n::tr("attr.perception"),   self.perception),
            (crate::i18n::tr("attr.willpower"),    self.willpower),
        ]
    }
}
