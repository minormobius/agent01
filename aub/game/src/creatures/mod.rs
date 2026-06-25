//! Creature catalog — one data template per `CreatureKind`.
//!
//! Each variant returns a `CreatureTemplate` that holds every piece of
//! static per-creature data: stats baselines, render scale, XP/loot,
//! description, and an `AnimationSet` pointing at a parent directory
//! of PNG tiles authored per-creature.
//!
//! ## Sprite authoring
//!
//! Each creature has its own directory under `assets/creatures/` (e.g.
//! `assets/creatures/mutant_human/`). Inside that directory, drop
//! individual tile PNGs named by letter-column + number-row, like
//! `A1.png`, `B3.png` — the same labels the `slice_atlas` tool writes.
//!
//! The `AnimationSet` then lists, for each animation category, the
//! sequence of tile labels that make up that animation:
//!
//! ```ignore
//! AnimationSet {
//!     dir: "assets/creatures/mutant_human",
//!     idle: Some(AnimationSource::Files(&["A1", "A2"])), // per-PNG-per-frame
//!     walk: Some(AnimationSource::Strip { file: "walk.png", frames: 4 }),
//!     ..AnimationSet::empty_in("assets/creatures/mutant_human")
//! }
//! ```
//!
//! Animations are optional — missing files don't crash, they just
//! don't play. If `idle` is `None` or its tiles are missing, the
//! renderer falls back to a colored placeholder.

use rand::Rng;

/// A list of tile labels (filenames without the `.png` extension) that
/// together make up one animation. Loader resolves each to
/// `<dir>/<label>.png` at startup.
pub type FrameLabels = &'static [&'static str];

/// How an animation's frames are stored on disk. `Files` is the
/// legacy "one PNG per frame" layout (e.g. `A1.png`, `A2.png`).
/// `Strip` is a single PNG containing `frames` cells laid out
/// horizontally; the loader slices it into individual frame
/// textures at startup so the renderer keeps using its existing
/// per-frame pipeline. `Quadrants` is a single PNG holding one
/// 2×2-tile creature; the loader slices it into four quadrant
/// textures (UL, UR, LR, LL) so a multi-tile monster can be drawn
/// from one source image instead of four separate tile PNGs.
#[derive(Clone, Copy, Debug)]
pub enum AnimationSource {
    Files(FrameLabels),
    Strip { file: &'static str, frames: u32 },
    Quadrants { file: &'static str },
}

/// Per-creature animation manifest. Point `dir` at a folder full of
/// PNG tiles and list each animation's frames by source; anything
/// you don't have yet stays `None`.
#[derive(Clone, Copy, Debug)]
pub struct AnimationSet {
    /// Parent directory containing the creature's tile PNGs.
    pub dir: &'static str,
    /// Idle loop — most creatures have this one.
    pub idle:   Option<AnimationSource>,
    /// Walk / chase cycle.
    pub walk:   Option<AnimationSource>,
    /// Played briefly on taking damage.
    pub hurt:   Option<AnimationSource>,
    /// Played when the creature's own attack animates.
    pub attack: Option<AnimationSource>,
    /// Played on death before the critter vanishes (hit-flash is
    /// still layered on top generically).
    pub death:  Option<AnimationSource>,
}

impl AnimationSet {
    /// Empty manifest rooted at a directory — useful as a default for
    /// creatures still awaiting art. All animations `None`.
    pub const fn empty_in(dir: &'static str) -> Self {
        Self { dir, idle: None, walk: None, hurt: None, attack: None, death: None }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum CreatureKind {
    ScavengerDrone,
    MutantHuman,
    SwarmBeetle,
    RogueBot,
    MutantCrab,
    RadiationSpore,
    StationMaster,
    /// Slithering pest, no known catalogued analogue. Soft (1 HP)
    /// but gains a bite-attack bonus per adjacent kin, so a swarm
    /// is dangerous even though any one of them dies in a single
    /// hit. First-zone introduction creature; spawns in 1d6 packs.
    Gruboid,
    /// Dog-sized soldier ant from the hydroponics breach. Currently
    /// the floor-1 critter while the Gruboid art is being reworked;
    /// shares the same "fragile but comes in packs with a swarm
    /// bonus" feel.
    Ant,
}

impl CreatureKind {
    /// Every creature kind, in a stable order. The sprite loader
    /// iterates this at startup to build one `LoadedCreature` per
    /// variant; `sprite_index()` returns each kind's position here.
    pub const ALL: &'static [CreatureKind] = &[
        CreatureKind::ScavengerDrone,
        CreatureKind::MutantHuman,
        CreatureKind::SwarmBeetle,
        CreatureKind::RogueBot,
        CreatureKind::MutantCrab,
        CreatureKind::RadiationSpore,
        CreatureKind::StationMaster,
        CreatureKind::Gruboid,
        CreatureKind::Ant,
    ];

    /// Stable numeric id matching this kind's index in `ALL`. Used by
    /// the renderer to look up the creature's loaded textures without
    /// importing `CreatureKind` into `pixel.rs`.
    pub fn sprite_index(self) -> usize {
        match self {
            CreatureKind::ScavengerDrone => 0,
            CreatureKind::MutantHuman    => 1,
            CreatureKind::SwarmBeetle    => 2,
            CreatureKind::RogueBot       => 3,
            CreatureKind::MutantCrab     => 4,
            CreatureKind::RadiationSpore => 5,
            CreatureKind::StationMaster  => 6,
            CreatureKind::Gruboid        => 7,
            CreatureKind::Ant            => 8,
        }
    }
}

/// Combat-relevant stats for a single creature instance at a given
/// dungeon level. Derived from `CreatureTemplate` + the level.
#[derive(Clone, Copy, Debug)]
pub struct CreatureStats {
    pub max_hp: i32,
    pub melee_damage: i32,
    pub vision_range: i32,
    pub ranged_attacker: bool,
}

/// All static data for a creature kind. Returned by value from
/// `CreatureKind::template()` — the struct is `Copy` and small, so
/// there's no point fussing with static lifetimes.
#[derive(Clone, Copy, Debug)]
pub struct CreatureTemplate {
    pub name: &'static str,
    pub description: &'static str,
    /// HP at dungeon level 1; scales up at deeper floors.
    pub base_hp: i32,
    pub melee_damage: i32,
    pub vision_range: i32,
    pub ranged_attacker: bool,
    /// Armor class — attacks must roll `d20 >= ac` (meets it, beats
    /// it) to land. Raise for armored / tough / nimble creatures.
    pub armor_class: i32,
    /// Footprint of this creature in dungeon tiles, `(width, height)`.
    /// Most critters are `(1, 1)`. Multi-tile monsters (e.g. 2×2
    /// bosses) occupy the `w × h` rectangle anchored at `(m.x, m.y)`
    /// as its upper-left corner. Their animation frames are laid out
    /// in the `animations` list as groups of `w*h` labels per frame,
    /// in clockwise order starting from the upper-left quadrant.
    pub tile_size: (u32, u32),
    /// Animation manifest — a directory of tile PNGs plus which
    /// labels form each animation. See `AnimationSet` for the shape.
    pub animations: AnimationSet,
    /// Fraction of a tile the sprite occupies on-screen. 1.0 fills the
    /// tile; < 1.0 shrinks and centers within the tile footprint.
    pub render_scale: f32,
    /// XP awarded for a kill at dungeon level 1.
    pub kill_xp_base: u32,
    /// Loot value at dungeon level 1.
    pub loot_base: u32,
    /// Status effect applied to the player on a successful hit,
    /// `(kind, turns)`. `None` = plain HP damage, no rider.
    /// Fires on top of the normal damage roll — the attack still
    /// has to beat AC for the status to apply.
    pub on_hit_status: Option<(crate::status::StatusKind, u32)>,
    /// Preferred minimum distance from the player for ranged
    /// kiters. When the player gets within this distance (in tiles,
    /// Chebyshev), the creature flees instead of attacking. Only
    /// meaningful when `ranged_attacker` is true; ignored for melee.
    pub kite_distance: i32,
    /// Six-stat attribute block. Defaults to `Attributes::FLAT_10`
    /// across the board for now; per-creature overrides plug in
    /// when individual mob profiles want to diverge (e.g. a brute
    /// with high Strength, a sniper with high Perception). Player
    /// stats roll separately on the Roll-Stats screen.
    pub attributes: crate::attributes::Attributes,
    /// Pursuit memory in **player turns**. After this many turns
    /// without re-acquiring LOS to the player, the creature drops
    /// from `Alert` back to `Idle` — forgetting the player's last
    /// known position. Tune low for distractible / dim creatures
    /// (gruboids: 5), high for relentless trackers.
    pub memory_length: u32,
    /// Bite / claw bonus to the d20 to-hit roll for **each adjacent
    /// live creature of the same kind**. `0` for solo fighters; `1`
    /// for swarmers (gruboid). Counted across the 8-neighbourhood
    /// at attack time, so a gruboid hemmed in by three of its kin
    /// rolls at +3.
    pub swarm_attack_bonus: i32,
    /// How many of this kind appear when a room rolls them. `(1, 1)`
    /// for solo encounters; `(min, max)` for pack creatures —
    /// `roll_at_level` rolls a uniform integer in `[min, max]`.
    /// Gruboids ship as `(1, 6)` (a clean 1d6 swarm).
    pub pack_size: (u32, u32),
}

/// Tunable per-creature fields loaded from
/// `assets/data/creatures.json`. Mirrors the balance-levers half
/// of `CreatureTemplate`; identity / asset references (name +
/// description i18n keys, animations, tile footprint, render
/// scale, attributes block) stay in the source-side template arm.
/// Adjusting an entry here and restarting is a stat tweak with no
/// recompile.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct CreatureData {
    pub base_hp: i32,
    pub melee_damage: i32,
    pub vision_range: i32,
    pub ranged_attacker: bool,
    pub armor_class: i32,
    pub kill_xp_base: u32,
    pub loot_base: u32,
    pub on_hit_status: Option<(crate::status::StatusKind, u32)>,
    pub kite_distance: i32,
    pub memory_length: u32,
    pub swarm_attack_bonus: i32,
    pub pack_size: (u32, u32),
}

const CREATURE_STATS_JSON: &str = include_str!("../../assets/data/creatures.json");

fn creature_data_table() -> &'static std::collections::HashMap<&'static str, CreatureData> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static TABLE: OnceLock<HashMap<&'static str, CreatureData>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let parsed: serde_json::Value = serde_json::from_str(CREATURE_STATS_JSON)
            .expect("creatures.json must be valid JSON");
        let object = parsed.as_object()
            .expect("creatures.json must be a JSON object");
        let mut m: HashMap<&'static str, CreatureData> = HashMap::new();
        for (k, v) in object {
            if k.starts_with('_') { continue; }
            let stats: CreatureData = serde_json::from_value(v.clone())
                .unwrap_or_else(|e|
                    panic!("creatures.json `{}`: {}", k, e));
            let leaked: &'static str = Box::leak(k.clone().into_boxed_str());
            m.insert(leaked, stats);
        }
        m
    })
}

fn creature_data(id: &str) -> CreatureData {
    *creature_data_table().get(id)
        .unwrap_or_else(|| panic!("creatures.json: missing entry `{}`", id))
}

/// Compose a `CreatureTemplate` from JSON-loaded stats plus
/// the in-source identity fields (i18n keys, asset paths,
/// per-creature attributes / tile footprint / render scale).
fn template_from_data(
    id: &'static str,
    name_key: &'static str,
    description_key: &'static str,
    tile_size: (u32, u32),
    animations: AnimationSet,
    render_scale: f32,
    attributes: crate::attributes::Attributes,
) -> CreatureTemplate {
    let s = creature_data(id);
    CreatureTemplate {
        name: name_key,
        description: description_key,
        base_hp: s.base_hp,
        melee_damage: s.melee_damage,
        vision_range: s.vision_range,
        ranged_attacker: s.ranged_attacker,
        armor_class: s.armor_class,
        tile_size,
        animations,
        render_scale,
        kill_xp_base: s.kill_xp_base,
        loot_base: s.loot_base,
        on_hit_status: s.on_hit_status,
        kite_distance: s.kite_distance,
        attributes,
        memory_length: s.memory_length,
        swarm_attack_bonus: s.swarm_attack_bonus,
        pack_size: s.pack_size,
    }
}

impl CreatureKind {
    /// The one-stop data lookup for a creature kind. Everywhere else
    /// pulls from this — individual accessors (`name`, etc.) are thin
    /// wrappers for ergonomic use.
    pub fn template(self) -> CreatureTemplate {
        match self {
            Self::ScavengerDrone => template_from_data(
                "scavenger_drone",
                "creature.scavenger_drone.name",
                "creature.scavenger_drone.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/original/scavenger",
                    idle: Some(AnimationSource::Files(&["scavenger_idle"])),
                    ..AnimationSet::empty_in("assets/original/scavenger")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::MutantHuman => template_from_data(
                "mutant_human",
                "creature.mutant_human.name",
                "creature.mutant_human.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/original/mutant",
                    idle: Some(AnimationSource::Files(&["A1", "B1", "C1", "D1"])),
                    ..AnimationSet::empty_in("assets/original/mutant")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::SwarmBeetle => template_from_data(
                "swarm_beetle",
                "creature.swarm_beetle.name",
                "creature.swarm_beetle.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/scificritters",
                    idle: Some(AnimationSource::Files(&["A5"])),
                    ..AnimationSet::empty_in("assets/scificritters")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::RogueBot => template_from_data(
                "rogue_bot",
                "creature.rogue_bot.name",
                "creature.rogue_bot.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/scificritters",
                    idle: Some(AnimationSource::Files(&["A4"])),
                    ..AnimationSet::empty_in("assets/scificritters")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::MutantCrab => template_from_data(
                "mutant_crab",
                "creature.mutant_crab.name",
                "creature.mutant_crab.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/scificritters",
                    idle: Some(AnimationSource::Files(&["D4"])),
                    ..AnimationSet::empty_in("assets/scificritters")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::RadiationSpore => template_from_data(
                "radiation_spore",
                "creature.radiation_spore.name",
                "creature.radiation_spore.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/creatures/radiation_spore",
                    idle: Some(AnimationSource::Files(&["A1", "A2"])),
                    ..AnimationSet::empty_in("assets/creatures/radiation_spore")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::StationMaster => template_from_data(
                "station_master",
                "creature.station_master.name",
                "creature.station_master.description",
                (2, 2),
                AnimationSet {
                    dir: "assets/original/engineer",
                    // Single 64×64 source image sliced into four 32×32
                    // quadrants (UL, UR, LR, LL) to fill the 2×2 footprint.
                    idle: Some(AnimationSource::Quadrants { file: "engineer.png" }),
                    ..AnimationSet::empty_in("assets/original/engineer")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::Gruboid => template_from_data(
                "gruboid",
                "creature.gruboid.name",
                "creature.gruboid.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/original/grubus",
                    idle: Some(AnimationSource::Strip {
                        file: "grubus_idle.png",
                        frames: 2,
                    }),
                    ..AnimationSet::empty_in("assets/original/grubus")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
            Self::Ant => template_from_data(
                "ant",
                "creature.ant.name",
                "creature.ant.description",
                (1, 1),
                AnimationSet {
                    dir: "assets/original/ant",
                    // Single static idle frame for now — `Files(&["ant_idle"])`
                    // resolves to `assets/original/ant/ant_idle.png`.
                    idle: Some(AnimationSource::Files(&["ant_idle"])),
                    ..AnimationSet::empty_in("assets/original/ant")
                },
                1.0,
                crate::attributes::Attributes::FLAT_10,
            ),
        }
    }

    pub fn name(self) -> &'static str {
        crate::i18n::tr(self.template().name)
    }
    pub fn description(self) -> &'static str {
        crate::i18n::tr(self.template().description)
    }
    pub fn animations(self) -> AnimationSet { self.template().animations }
    pub fn render_scale(self) -> f32 { self.template().render_scale }
    pub fn armor_class(self) -> i32 { self.template().armor_class }
    pub fn tile_size(self) -> (u32, u32) { self.template().tile_size }

    /// Signature weapon this creature wields when it matters. Returned
    /// from `weapon_drop_chance()` at some probability on kill so the
    /// player can scavenge the arsenal of the ship's defenders.
    pub fn signature_weapon(self) -> Option<crate::items::weapons::WeaponKind> {
        use crate::items::weapons::WeaponKind;
        match self {
            Self::RogueBot        => Some(WeaponKind::PlasmaRifle),
            Self::MutantCrab      => Some(WeaponKind::ClawedGauntlet),
            Self::MutantHuman     => Some(WeaponKind::ScrapPistol),
            Self::StationMaster   => Some(WeaponKind::AutoHammer),
            Self::ScavengerDrone  => None,
            Self::SwarmBeetle     => None,
            Self::RadiationSpore  => None,
            Self::Gruboid         => None,
            Self::Ant             => None,
        }
    }

    /// Chance (0.0-1.0) to drop the signature weapon on kill. Boss
    /// always drops; named enemies are coin flips; mooks never do.
    pub fn weapon_drop_chance(self) -> f32 {
        match self {
            Self::StationMaster => 1.0,
            Self::RogueBot      => 0.5,
            Self::MutantCrab    => 0.35,
            Self::MutantHuman   => 0.2,
            _ => 0.0,
        }
    }

    /// HP and combat stats at a given dungeon level. HP gets a small
    /// bump per floor; other stats are static for now.
    pub fn stats_at_level(self, dungeon_level: u8) -> CreatureStats {
        let t = self.template();
        let bump = (dungeon_level as i32 - 1).max(0);
        CreatureStats {
            max_hp: (t.base_hp + bump / 2).max(1),
            melee_damage: t.melee_damage,
            vision_range: t.vision_range,
            ranged_attacker: t.ranged_attacker,
        }
    }

    /// XP awarded on kill, scaling +5 per floor past level 1.
    pub fn kill_xp(self, dungeon_level: u8) -> u32 {
        self.template().kill_xp_base
            + (dungeon_level as u32).saturating_sub(1) * 5
    }

    /// Loot value on kill, scaling +10 per floor past level 1.
    pub fn loot_value(self, dungeon_level: u8) -> u32 {
        self.template().loot_base
            + (dungeon_level as u32).saturating_sub(1) * 10
    }

    /// Weighted random roll of what kind of creature shows up on a
    /// given floor. Shallow floors favour common critters; deep floors
    /// mix in the rare stuff.
    pub fn roll_at_level(dungeon_level: u8, rng: &mut impl Rng) -> Self {
        let roll = rng.gen_range(1..=100);
        match dungeon_level {
            // Floor 1 is the ant infestation: mutated soldier ants
            // from the hydroponics breach, swarm-bonus mood-setter
            // for the cryo-bay awakening. (Was gruboid; swapped to
            // ants while the gruboid art is being reworked.)
            1 => Self::Ant,
            // Gruboids stand in for the beetle/crab and mutant humans
            // for the rogue bot/spore while that art is unavailable;
            // weights are preserved from the original mix.
            2 => {
                if roll <= 25 { Self::ScavengerDrone }
                else if roll <= 55 { Self::MutantHuman }
                else { Self::Gruboid } // 45%: former beetle + crab
            }
            _ => {
                if roll <= 15 { Self::ScavengerDrone }
                else if roll <= 60 { Self::MutantHuman } // 45%: own share + former rogue bot + spore
                else { Self::Gruboid }                   // 40%: former beetle + crab
            }
        }
    }
}
