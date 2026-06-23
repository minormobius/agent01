//! Hazard tile templates.
//!
//! The four hazard variants (`RadiationZone`, `ElectricalHazard`,
//! `CollapseHazard`, `AcidPool`) used to be hardcoded in three places —
//! the render module (for overlay + glow colors + prop sprite), `main.rs`
//! (for damage + status on entry), and `dungeon.rs` (as Tile variants).
//! This module collapses the display + mechanics half of that into a
//! single `HazardTemplate` so adding or retuning a hazard is a data
//! edit, not a grep-and-patch across files.
//!
//! The tile enum itself stays in `dungeon.rs` — this module only
//! catalogs the hazards that exist as templates.

use macroquad::prelude::Color;

use crate::dungeon::Tile;
use crate::status::StatusKind;

/// Identifies a hazard prop sprite for the renderer. The actual
/// `Texture2D` handle lives on `Sprites`, keyed off this enum.
/// When adding a new prop: add the variant, the `Texture2D` field
/// on `Sprites`, and load it in `Sprites::build`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum HazardProp {
    /// Yellow fissile-waste drum for `Tile::RadiationZone`.
    RadBarrel,
}

/// Everything about a hazard: how it looks, how it hurts.
#[derive(Clone, Copy, Debug)]
pub struct HazardTemplate {
    /// Flat translucent overlay drawn on the tile. `None` when the
    /// hazard has prop art that replaces the overlay.
    pub overlay: Option<Color>,
    /// Soft radial glow color. `None` disables the glow.
    pub glow: Option<Color>,
    /// Prop sprite centered on the tile. `None` until art exists.
    pub prop: Option<HazardProp>,
    /// HP damage on fresh entry. 0 = no damage this entry.
    pub damage: u32,
    /// Probability the damage lands (models CollapseHazard's coin
    /// flip). Most hazards use 1.0.
    pub damage_chance: f32,
    /// Status applied on fresh entry, as `(kind, turns)`. None = no
    /// status. Currently unused by the four tiles (we stripped the
    /// DoT tails during the difficulty pass) but kept for creatures
    /// that'll push hazards onto the floor mid-fight.
    pub on_enter_status: Option<(StatusKind, u32)>,
    /// Event-log line when damage lands. **i18n key** — the
    /// caller resolves it through `tr` at display time. If the
    /// damage roll fails (CollapseHazard misses), no line is
    /// logged. Empty key string = silent.
    pub entry_log: &'static str,
    /// Event-log line when the hazard deals no damage but still
    /// matters (Electrical's stun message fires on every entry).
    /// Also an i18n key. Empty = silent.
    pub secondary_log: &'static str,
}

/// Lookup the template for a tile. Returns `None` for non-hazard
/// tiles (floor, walls, stairs, control panel).
pub fn hazard_template(tile: Tile) -> Option<HazardTemplate> {
    match tile {
        Tile::RadiationZone => Some(HazardTemplate {
            // No flat overlay — the barrel prop carries the read.
            overlay: None,
            glow: Some(Color::new(0.30, 1.00, 0.40, 0.55)),
            prop: Some(HazardProp::RadBarrel),
            damage: 1,
            damage_chance: 1.0,
            on_enter_status: None,
            entry_log: "log.hazard.radiation_burn",
            secondary_log: "",
        }),
        Tile::ElectricalHazard => Some(HazardTemplate {
            overlay: Some(Color::new(0.55, 0.80, 1.00, 0.32)),
            glow: Some(Color::new(0.40, 0.85, 1.00, 0.60)),
            prop: None,
            damage: 1,
            damage_chance: 1.0,
            // Stun doesn't scale with hazard damage — it's a lost
            // action, a different currency. One turn stays through
            // the difficulty pass.
            on_enter_status: Some((StatusKind::Stunned, 1)),
            entry_log: "log.hazard.electric_stun",
            secondary_log: "",
        }),
        Tile::CollapseHazard => Some(HazardTemplate {
            overlay: Some(Color::new(0.75, 0.55, 0.30, 0.32)),
            glow: Some(Color::new(1.00, 0.55, 0.25, 0.45)),
            prop: None,
            damage: 1,
            damage_chance: 0.5,
            on_enter_status: None,
            entry_log: "log.hazard.collapse",
            secondary_log: "",
        }),
        Tile::AcidPool => Some(HazardTemplate {
            overlay: Some(Color::new(0.75, 1.00, 0.20, 0.40)),
            glow: Some(Color::new(0.85, 1.00, 0.25, 0.55)),
            prop: None,
            damage: 1,
            damage_chance: 1.0,
            on_enter_status: None,
            entry_log: "log.hazard.acid_burn",
            secondary_log: "",
        }),
        Tile::FirePool => Some(HazardTemplate {
            // Warm orange splash — sits in the same family as the
            // CollapseHazard rust glow, but brighter and pushed
            // toward pure flame. The radial glow does the heavy
            // lifting; the overlay is a thinner wash so you can
            // still read the underlying floor.
            overlay: Some(Color::new(1.00, 0.55, 0.15, 0.36)),
            glow: Some(Color::new(1.00, 0.50, 0.10, 0.65)),
            prop: None,
            // The pool itself deals no instant damage on entry —
            // the molotov's *impact* 1-point hit lives on the throw
            // resolution path (so a target dropped right where the
            // bottle lands feels the whump even if they then walk
            // out before the next turn). The pool only applies the
            // `Burning` status; the d4 roll lands on the next
            // status tick, matching "1 on impact, 1d4 next turn".
            damage: 0,
            damage_chance: 1.0,
            on_enter_status: Some((StatusKind::Burning, 1)),
            entry_log: "log.hazard.fire_pool",
            secondary_log: "",
        }),
        _ => None,
    }
}

