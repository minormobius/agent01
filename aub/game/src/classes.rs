//! Player departments — colonist training tracks the survivor woke
//! up assigned to. Each department influences stats, starting items,
//! and a signature ability.
//!
//! Themed around the colony's organisational chart: Engineering,
//! Security, Science, and Medical. Stats / abilities can be retuned
//! per-department independently; the bindings below are the current
//! vanilla values.

use crate::ItemKind;

/// Department the survivor was assigned to before the cascade.
/// Picks the starting kit + the passive / active signature.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PlayerClass {
    /// Engineering: ship maintenance, diagnostics, salvage. Sees more
    /// of a dark corridor than most; knows what's worth picking up.
    Engineering,
    /// Security: boarding actions, riot suppression, augmented muscle.
    /// Reinforced frame and combat stims for short bursts of overkill.
    Security,
    /// Science: sensor implants and lab-grade marksmanship. Not the
    /// strongest swing in the colony, but the steadiest trigger.
    Science,
    /// Medical: rad-resistant biotech and a hardened immune system.
    /// Treats irradiated tiles as a therapy bath instead of a hazard.
    Medical,
}

impl PlayerClass {
    /// Stable identifier returned in lieu of a literal — both
    /// accessors look up `tr` so call sites get the localized
    /// string for free. The `class.<id>.name` /
    /// `class.<id>.description` keys live in the i18n table.
    pub fn name(&self) -> &'static str {
        crate::i18n::tr(match self {
            PlayerClass::Engineering => "class.engineering.name",
            PlayerClass::Security    => "class.security.name",
            PlayerClass::Science     => "class.science.name",
            PlayerClass::Medical     => "class.medical.name",
        })
    }

    pub fn description(&self) -> &'static str {
        crate::i18n::tr(match self {
            PlayerClass::Engineering => "class.engineering.description",
            PlayerClass::Security    => "class.security.description",
            PlayerClass::Science     => "class.science.description",
            PlayerClass::Medical     => "class.medical.description",
        })
    }

    /// HP bonus for this department (can be negative). Added to `MAX_HP` at spawn.
    pub fn hp_bonus(&self) -> i32 {
        match self {
            PlayerClass::Engineering => 0,
            PlayerClass::Security    => 2,
            PlayerClass::Science     => -1,
            PlayerClass::Medical     => 1,
        }
    }

    /// Melee damage multiplier (as a percentage, where 100 = 1x).
    pub fn melee_dmg_mult(&self) -> i32 {
        match self {
            PlayerClass::Engineering => 100,
            PlayerClass::Security    => 150,
            PlayerClass::Science     => 80,
            PlayerClass::Medical     => 110,
        }
    }

    /// Ranged damage multiplier.
    pub fn ranged_dmg_mult(&self) -> i32 {
        match self {
            PlayerClass::Engineering => 100,
            PlayerClass::Security    => 100,
            PlayerClass::Science     => 130,
            PlayerClass::Medical     => 100,
        }
    }

    /// Starting inventory for this department.
    pub fn starting_items(&self) -> Vec<ItemKind> {
        match self {
            PlayerClass::Engineering => vec![ItemKind::RationCube],
            PlayerClass::Security    => vec![ItemKind::MedKit],
            PlayerClass::Science     => vec![ItemKind::RationCube],
            PlayerClass::Medical     => vec![ItemKind::MedKit, ItemKind::RationCube],
        }
    }

    /// Signature ability flavour text, shown on the department-select
    /// screen. Active abilities include their key binding in parens
    /// so the player sees it before committing.
    pub fn special_ability(&self) -> &'static str {
        match self {
            PlayerClass::Engineering =>
                "Schematic Sense: +2 vision, floor items announced on sight (passive)",
            PlayerClass::Security =>
                "Combat Stims (Z): burst strength at a power cost (active)",
            PlayerClass::Science =>
                "Bio-scanner: detect creatures through walls (passive)",
            PlayerClass::Medical =>
                "Rad-resistant Biotech: radiation tiles heal instead of hurt (passive)",
        }
    }
}
