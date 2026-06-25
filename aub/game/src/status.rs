//! Status effects and debuffs.
//!
//! Temporary effects applied to creatures: poison, radiation, stunned,
//! bleeding, etc. Durations are measured in **turns**, not seconds —
//! Ecdysium is a turn-based game at heart, and ticking in seconds
//! meant a player who idled on the class-select screen burned through
//! Radiation. The main loop decrements each effect once per player
//! action by calling `StatusEffectList::tick()`.
//!
//! Each tick also returns an accumulated damage number so callers can
//! funnel it through `hurt_player` (shared grunt / hurt-anim plumbing).

use ::rand::{Rng, rngs::StdRng};

/// A temporary status effect applied to a creature.
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum StatusKind {
    /// Poison damage over time.
    Poison,
    /// Radiation exposure; slow HP damage.
    RadiationExposed,
    /// Stunned; the next action is skipped.
    Stunned,
    /// Bleeding; HP loss per action taken.
    Bleeding,
    /// Confused; future use — random action substitution.
    Confused,
    /// Blessed; future use — damage / resistance buff.
    Blessed,
    /// On fire — 1d4 HP damage per turn while active. Applied by
    /// stepping into a molotov fire pool tile; the status outlives
    /// the tile itself, so the target keeps burning a turn or two
    /// after they walk out of the splash.
    Burning,
}

impl StatusKind {
    pub fn name(&self) -> &'static str {
        crate::i18n::tr(match self {
            StatusKind::Poison           => "status.poison",
            StatusKind::RadiationExposed => "status.radiation_exposed",
            StatusKind::Stunned          => "status.stunned",
            StatusKind::Bleeding         => "status.bleeding",
            StatusKind::Confused         => "status.confused",
            StatusKind::Blessed          => "status.blessed",
            StatusKind::Burning          => "status.burning",
        })
    }

    /// Roll this turn's damage from this status. Most effects are
    /// deterministic; `Burning` is the lone variable-damage status
    /// (1d4 per turn) and uses the rng. Callers without an rng can
    /// pass a fresh seeded one — the only nondeterminism we add is
    /// the d4 roll.
    pub fn roll_damage(&self, rng: &mut StdRng) -> u32 {
        match self {
            StatusKind::Poison => 1,
            StatusKind::RadiationExposed => 1,
            StatusKind::Bleeding => 1,
            StatusKind::Burning => rng.gen_range(1..=4),
            _ => 0,
        }
    }

    /// Does this status prevent movement?
    pub fn blocks_movement(&self) -> bool {
        matches!(self, StatusKind::Stunned)
    }

    /// Does this status prevent actions?
    pub fn blocks_action(&self) -> bool {
        matches!(self, StatusKind::Stunned)
    }
}

/// A status effect with remaining duration (in **turns**).
#[derive(Clone, Copy, Debug, serde::Serialize, serde::Deserialize)]
pub struct StatusEffect {
    pub kind: StatusKind,
    pub turns_remaining: u32,
}

impl StatusEffect {
    pub fn new(kind: StatusKind, turns: u32) -> Self {
        StatusEffect { kind, turns_remaining: turns.max(1) }
    }
}

#[derive(Clone, Debug, Default, serde::Serialize, serde::Deserialize)]
pub struct StatusEffectList {
    effects: Vec<StatusEffect>,
}

impl StatusEffectList {
    /// Add or *refresh* a status. If an effect of the same kind already
    /// exists, the duration is replaced with the higher of the two so
    /// repeated exposures don't shorten the timer.
    pub fn add(&mut self, kind: StatusKind, turns: u32) {
        if let Some(e) = self.effects.iter_mut().find(|e| e.kind == kind) {
            e.turns_remaining = e.turns_remaining.max(turns.max(1));
        } else {
            self.effects.push(StatusEffect::new(kind, turns));
        }
    }

    /// Advance every effect by one turn. Returns the sum of DoT damage
    /// accumulated across all active effects *before* decrement. Expired
    /// effects are dropped. Takes an rng so variable-damage statuses
    /// (currently just `Burning`'s 1d4) can roll fresh each tick.
    pub fn tick(&mut self, rng: &mut StdRng) -> u32 {
        let dmg: u32 = self.effects.iter().map(|e| e.kind.roll_damage(rng)).sum();
        for e in self.effects.iter_mut() {
            e.turns_remaining = e.turns_remaining.saturating_sub(1);
        }
        self.effects.retain(|e| e.turns_remaining > 0);
        dmg
    }

    pub fn has(&self, kind: StatusKind) -> bool {
        self.effects.iter().any(|e| e.kind == kind)
    }

    pub fn blocks_movement(&self) -> bool {
        self.effects.iter().any(|e| e.kind.blocks_movement())
    }

    pub fn blocks_action(&self) -> bool {
        self.effects.iter().any(|e| e.kind.blocks_action())
    }

    /// Consume a stun — used by the main loop to pay for a skipped turn.
    /// Returns true if the player was stunned this turn (action wasted).
    pub fn consume_stun(&mut self) -> bool {
        if let Some(idx) = self.effects.iter().position(|e| e.kind == StatusKind::Stunned) {
            let e = &mut self.effects[idx];
            e.turns_remaining = e.turns_remaining.saturating_sub(1);
            if e.turns_remaining == 0 { self.effects.remove(idx); }
            true
        } else {
            false
        }
    }

    /// Names of every active status, for HUD display.
    pub fn active_names(&self) -> Vec<&'static str> {
        self.effects.iter().map(|e| e.kind.name()).collect()
    }

    /// `(kind, turns_remaining)` pairs for every active effect. Used
    /// by the save system to round-trip the player's status block.
    pub fn entries(&self) -> Vec<(StatusKind, u32)> {
        self.effects.iter()
            .map(|e| (e.kind, e.turns_remaining))
            .collect()
    }

    pub fn clear(&mut self) {
        self.effects.clear();
    }

    pub fn is_empty(&self) -> bool {
        self.effects.is_empty()
    }
}
