//! Weapon catalog.
//!
//! Every weapon is an *item* with a mandatory `melee` profile — pistols,
//! rifles, crowbars, even plasma cutters can all be swung as clubs. A
//! weapon *may* additionally have a `ranged` profile, which unlocks
//! firing when the ammo/power/condition conditions are met. A weapon
//! with `ranged: None` is melee-only (e.g. a prybar); a weapon with
//! `ranged: Some(...)` can fire.
//!
//! Whether a weapon *can currently* fire is a runtime question (ammo,
//! charge, jams). The template only says whether firing is possible
//! *in principle*.

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum WeaponKind {
    AssaultRifle,
    /// Bare-bones starter rifle the survivor finds beside their cryo
    /// pod. Modest damage, fast cycle — enough to clear floor 1 with
    /// careful positioning before better weapons drop from creatures.
    SurvivalRifle,
    ScrapPistol,
    PlasmaRifle,
    AutoHammer,
    ClawedGauntlet,
    /// Standard maintenance wrench — first dedicated melee weapon.
    /// One-handed (so it pairs with a hand-lamp in the off hand) and
    /// has no ranged profile.
    Wrench,
    /// Mop — weak two-handed melee. Direct salvage from the closet,
    /// also a crafting component (decomposes into a haft + a fibrous
    /// head when used in recipes; for now treated atomically).
    Mop,
    /// Improvised heavy two-handed melee. Crafted from
    /// mop haft + wrench + duct tape.
    GreatClub,
    /// Short-range stun weapon. Charges modelled later; currently
    /// just a melee profile with a stun rider on hit (TBD).
    ShockProd,
}

/// Core attack profile — damage + log flavor. Both melee and ranged
/// profiles share this shape; ranged adds bullet-and-sound data on top.
///
/// Damage is a **range** rolled at attack time. A weapon that does a
/// flat `2` damage sets `damage_min == damage_max == 2`; a 1d4 wrench
/// sets `damage_min = 1, damage_max = 4`. The roll is uniform across
/// `[min, max]` inclusive — i.e. true 1dN, not Gaussian.
#[derive(Clone, Copy, Debug)]
pub struct AttackProfile {
    pub damage_min: i32,
    pub damage_max: i32,
    /// Log line on a non-lethal hit. `{target}` and `{damage}` expand.
    pub hit_message: &'static str,
    /// Log line on the killing blow. Same placeholders. Both lines are
    /// printed in sequence on a kill (hit first).
    pub kill_message: &'static str,
}

impl AttackProfile {
    /// Roll a damage value in `[damage_min, damage_max]` inclusive.
    /// For deterministic weapons (min == max) this is a no-op pull
    /// from the RNG that always returns the flat value.
    pub fn roll_damage(&self, rng: &mut ::rand::rngs::StdRng) -> i32 {
        use ::rand::Rng;
        if self.damage_min >= self.damage_max {
            self.damage_min
        } else {
            rng.gen_range(self.damage_min..=self.damage_max)
        }
    }

    /// `hit_message` and `kill_message` are i18n keys. The
    /// localized template carries `{target}` / `{damage}`
    /// placeholders that this helper substitutes on display.
    pub fn format_hit(&self, target: &str, damage: i32) -> String {
        crate::i18n::tr(self.hit_message)
            .replace("{target}", target)
            .replace("{damage}", &damage.to_string())
    }
    pub fn format_kill(&self, target: &str, damage: i32) -> String {
        crate::i18n::tr(self.kill_message)
            .replace("{target}", target)
            .replace("{damage}", &damage.to_string())
    }
}

/// Additional data that only ranged attacks care about.
#[derive(Clone, Copy, Debug)]
pub struct RangedProfile {
    pub attack: AttackProfile,
    /// Visible bullet speed in tiles/sec for the tracer animation.
    /// Damage is resolved via hit-scan at trigger pull.
    pub bullet_speed: f32,
    /// Minimum seconds between shots.
    pub fire_cooldown: f64,
    /// Max hit-scan range in tiles.
    pub hit_scan_range: f32,
    /// Path to the firing sound, loaded once at startup.
    pub fire_sound_path: &'static str,
}

#[derive(Clone, Copy, Debug)]
pub struct WeaponTemplate {
    pub name: &'static str,
    /// i18n key for the inventory / equipment screen flavor blurb.
    /// Per-weapon so the player sees something specific to the
    /// scrap pistol vs. the plasma rifle, instead of every
    /// `Weapon(_)` falling back to a single generic line.
    pub description: &'static str,
    /// 32×32 PNG path used both for the floor pickup and the
    /// inventory icon. Pre-loaded at startup via `ItemKind::ALL`
    /// (which enumerates every WeaponKind via `WeaponKind::ALL`).
    pub pickup_sprite: &'static str,
    /// Every weapon can be swung. Even the best gun is a terrible club,
    /// but it *is* a club.
    pub melee: AttackProfile,
    /// Ranged capability is optional. `None` → purely a melee weapon;
    /// `Some(...)` → can fire when the game-state conditions allow.
    pub ranged: Option<RangedProfile>,
    /// True when wielding this weapon also blocks the off-hand slot
    /// (e.g. rifle takes both hands). One-handed weapons (pistols,
    /// wrenches) leave the left hand free for a hand-lamp / shield.
    pub two_handed: bool,
}

impl WeaponKind {
    /// Every WeaponKind variant. Used by `ItemKind::ALL` to expose
    /// each weapon's pickup sprite to the renderer's pre-loader.
    pub const ALL: &'static [WeaponKind] = &[
        Self::SurvivalRifle,
        Self::AssaultRifle,
        Self::ScrapPistol,
        Self::PlasmaRifle,
        Self::AutoHammer,
        Self::ClawedGauntlet,
        Self::Wrench,
        Self::Mop,
        Self::GreatClub,
        Self::ShockProd,
    ];

    pub fn template(self) -> WeaponTemplate {
        match self {
            Self::SurvivalRifle => WeaponTemplate {
                name: "weapon.survival_rifle.name",
                description: "weapon.survival_rifle.description",
                pickup_sprite: "assets/original/items/rifle.png",
                melee: AttackProfile {
                    damage_min: 1, damage_max: 1,
                    hit_message:  "weapon.survival_rifle.melee.hit",
                    kill_message: "weapon.survival_rifle.melee.kill",
                },
                ranged: Some(RangedProfile {
                    attack: AttackProfile {
                        damage_min: 1, damage_max: 1,
                        hit_message:  "weapon.survival_rifle.ranged.hit",
                        kill_message: "weapon.survival_rifle.ranged.kill",
                    },
                    bullet_speed: 50.0,
                    fire_cooldown: 0.18,
                    hit_scan_range: 30.0,
                    fire_sound_path: "assets/sounds/guns/556 Single WAV.wav",
                }),
                two_handed: true,
            },
            Self::AssaultRifle => WeaponTemplate {
                name: "weapon.assault_rifle.name",
                description: "weapon.assault_rifle.description",
                pickup_sprite: "assets/original/items/rifle.png",
                melee: AttackProfile {
                    damage_min: 1, damage_max: 1,
                    hit_message:  "weapon.assault_rifle.melee.hit",
                    kill_message: "weapon.assault_rifle.melee.kill",
                },
                ranged: Some(RangedProfile {
                    attack: AttackProfile {
                        damage_min: 1, damage_max: 1,
                        hit_message:  "weapon.assault_rifle.ranged.hit",
                        kill_message: "weapon.assault_rifle.ranged.kill",
                    },
                    bullet_speed: 55.0,
                    fire_cooldown: 0.15,
                    hit_scan_range: 40.0,
                    fire_sound_path: "assets/sounds/guns/556 Single WAV.wav",
                }),
                two_handed: true,
            },
            Self::ScrapPistol => WeaponTemplate {
                name: "weapon.scrap_pistol.name",
                description: "weapon.scrap_pistol.description",
                pickup_sprite: "assets/original/items/rifle.png",
                melee: AttackProfile {
                    damage_min: 1, damage_max: 1,
                    hit_message:  "weapon.scrap_pistol.melee.hit",
                    kill_message: "weapon.scrap_pistol.melee.kill",
                },
                ranged: Some(RangedProfile {
                    attack: AttackProfile {
                        damage_min: 2, damage_max: 2,
                        hit_message:  "weapon.scrap_pistol.ranged.hit",
                        kill_message: "weapon.scrap_pistol.ranged.kill",
                    },
                    bullet_speed: 50.0,
                    fire_cooldown: 0.2,
                    hit_scan_range: 35.0,
                    fire_sound_path: "assets/sounds/guns/556 Single WAV.wav",
                }),
                // Pistol fires one-handed — leaves the off-hand free.
                two_handed: false,
            },
            Self::PlasmaRifle => WeaponTemplate {
                name: "weapon.plasma_rifle.name",
                description: "weapon.plasma_rifle.description",
                pickup_sprite: "assets/original/items/rifle.png",
                melee: AttackProfile {
                    damage_min: 1, damage_max: 1,
                    hit_message:  "weapon.plasma_rifle.melee.hit",
                    kill_message: "weapon.plasma_rifle.melee.kill",
                },
                ranged: Some(RangedProfile {
                    attack: AttackProfile {
                        damage_min: 3, damage_max: 3,
                        hit_message:  "weapon.plasma_rifle.ranged.hit",
                        kill_message: "weapon.plasma_rifle.ranged.kill",
                    },
                    bullet_speed: 65.0,
                    fire_cooldown: 0.25,
                    hit_scan_range: 50.0,
                    fire_sound_path: "assets/sounds/guns/556 Single WAV.wav",
                }),
                two_handed: true,
            },
            Self::AutoHammer => WeaponTemplate {
                name: "weapon.auto_hammer.name",
                description: "weapon.auto_hammer.description",
                pickup_sprite: "assets/original/items/rifle.png",
                melee: AttackProfile {
                    damage_min: 3, damage_max: 3,
                    hit_message:  "weapon.auto_hammer.melee.hit",
                    kill_message: "weapon.auto_hammer.melee.kill",
                },
                ranged: None,
                two_handed: true,
            },
            Self::ClawedGauntlet => WeaponTemplate {
                name: "weapon.clawed_gauntlet.name",
                description: "weapon.clawed_gauntlet.description",
                pickup_sprite: "assets/original/items/rifle.png",
                melee: AttackProfile {
                    damage_min: 2, damage_max: 2,
                    hit_message:  "weapon.clawed_gauntlet.melee.hit",
                    kill_message: "weapon.clawed_gauntlet.melee.kill",
                },
                ranged: None,
                two_handed: false,
            },
            Self::Wrench => WeaponTemplate {
                name: "weapon.wrench.name",
                description: "weapon.wrench.description",
                pickup_sprite: "assets/original/items/wrench.png",
                melee: AttackProfile {
                    // 1d4 — true uniform roll on attack.
                    damage_min: 1, damage_max: 4,
                    hit_message:  "weapon.wrench.melee.hit",
                    kill_message: "weapon.wrench.melee.kill",
                },
                ranged: None,
                // One-handed → leaves the off-hand free for a hand-lamp.
                two_handed: false,
            },
            Self::Mop => WeaponTemplate {
                name: "weapon.mop.name",
                description: "weapon.mop.description",
                pickup_sprite: "assets/original/items/mop.png",
                melee: AttackProfile {
                    // Lightweight bash, 1d3.
                    damage_min: 1, damage_max: 3,
                    hit_message:  "weapon.mop.melee.hit",
                    kill_message: "weapon.mop.melee.kill",
                },
                ranged: None,
                // Two-handed — the mop's a long awkward haft.
                two_handed: true,
            },
            Self::GreatClub => WeaponTemplate {
                // Crafted: mop haft + wrench + duct tape. Big, slow,
                // hits hard.
                name: "weapon.great_club.name",
                description: "weapon.great_club.description",
                pickup_sprite: "assets/original/items/wrench.png",
                melee: AttackProfile {
                    damage_min: 2, damage_max: 6,
                    hit_message:  "weapon.great_club.melee.hit",
                    kill_message: "weapon.great_club.melee.kill",
                },
                ranged: None,
                two_handed: true,
            },
            Self::ShockProd => WeaponTemplate {
                // Crafted: wrench OR mop haft + battery + wire +
                // duct tape. Charges + stun rider TBD - for now
                // it's a one-handed sparking baton.
                name: "weapon.shock_prod.name",
                description: "weapon.shock_prod.description",
                pickup_sprite: "assets/original/items/wrench.png",
                melee: AttackProfile {
                    damage_min: 1, damage_max: 2,
                    hit_message:  "weapon.shock_prod.melee.hit",
                    kill_message: "weapon.shock_prod.melee.kill",
                },
                ranged: None,
                two_handed: false,
            },
        }
    }

    pub fn name(self) -> &'static str {
        crate::i18n::tr(self.template().name)
    }
    /// Convenience: `Some(ranged)` if this weapon can fire at all.
    pub fn ranged(self) -> Option<RangedProfile> { self.template().ranged }
}
