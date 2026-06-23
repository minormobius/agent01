mod attributes;
mod audio;
mod classes;
mod creatures;
mod dungeon;
mod fov;
mod generator;
mod hazards;
mod i18n;
mod input;
mod items;
mod levelgen;
mod props;
mod recipes;
mod render;
mod save;
mod status;
mod telemetry;
mod stock;
mod tileset;
mod ui;

use macroquad::prelude::*;
use audio::{AudioBank, Sfx};
use ::rand::{Rng, SeedableRng};
use ::rand::rngs::StdRng;

use dungeon::Tile;
use generator::Generator;
use generator::sector::SectorGenerator;
use items::{ItemCategory, ItemKind, UseEffect};
use items::weapons::WeaponKind;
use render::pixel::{draw_dungeon, DoorView, ItemView, MonsterView, PropView, Sprites, HURT_DURATION, TILE_SIZE};
use stock::{stock_rooms, RoomContents};

// 60×30 tiles. At the default 32px tile size the window lands at ~1920×1024,
// but the renderer rescales as the user resizes the window.
pub(crate) const MAP_W: usize = 60;
pub(crate) const MAP_H: usize = 30;

/// Seconds a direction must be held before autorepeat starts. Matches typical
/// OS keyboard repeat delay so held keys feel natural.
const HOLD_DELAY: f64 = 0.22;
/// Seconds between repeated moves while a direction is held. Also paces
/// click-to-move. Each tick is ONE game turn, so this also sets the
/// monster-action cadence while the player is auto-walking.
const HOLD_RATE:  f64 = 0.15;

/// **Player-default vision radii** — the unlit baseline. The world
/// is mostly dark; what the survivor can see when carrying no light
/// source. `bright` = tile distance at which visibility holds at
/// 1.0; `dim` = the outer rim where visibility falls off to 0. Tiles
/// between the two ride a smoothstep gradient (see `fov.rs`).
///
/// With `BASE_BRIGHT_RADIUS = 0` the entire visible area sits in the
/// gradient zone — the player's own tile is fully lit and every
/// surrounding tile fades smoothly to dark by `BASE_DIM_RADIUS`. This
/// reads as "you can barely see, and what you can see is dim" — the
/// vibe an unlit cryo bay should give. Equipping a light source
/// widens both radii via `vision_radii`.
///
/// Tweak these to retune the vanilla "naked eye" behaviour.
const BASE_BRIGHT_RADIUS: usize = 0;
const BASE_DIM_RADIUS:    usize = 3;
/// Extra tiles of bright + dim radius granted to Engineering's
/// **Schematic Sense**. A flat +1 to both halves of FOV. Chosen over
/// a pulsing "items within N tiles" overlay because it's a cleaner
/// piece of feedback that also reads as the department's pitch: you
/// *see* more of the floor.
const ENGINEERING_BONUS_VISION: usize = 1;
const ZOOM: f32 = 2.0;

const FLASH_DURATION: f64 = 0.08;

// Weapon-specific numbers (bullet speed, fire cooldown, damage, range)
// now live on `items::weapons::WeaponTemplate`. The player's unarmed
// bump-attack damage stays as a top-level constant since it isn't tied
// to any weapon.
/// Base max HP (before department bonuses). Engineering sits at
/// this; other departments add/subtract via `PlayerClass::hp_bonus`,
/// and the effective max lives in `hp_max`.
const MAX_HP: u32 = 4;
const MONSTER_FLASH_DURATION: f64 = 0.1;
const PLAYER_MELEE_DAMAGE: i32 = 1;

/// How many player turns an Ion Sweep tile lingers before the floor
/// is safe to walk on again. Long enough that the sweep meaningfully
/// cuts off a chunk of the boss arena; short enough that it doesn't
/// permanently block routing around the boss for the rest of the
/// fight. Tweak here to retune.
const ION_SWEEP_LIFETIME: u32 = 4;

/// Base AC for any living thing that isn't wearing armor. Classic 5e
/// convention — roll d20 ≥ target AC to land a hit. The player wakes
/// up in their underwear at AC 10; every point above is earned by
/// equipping items whose template carries an `ac_bonus`.
const BASE_ARMOR_CLASS: i32 = 10;

/// Security Combat Stims duration (in player turns). +2 damage
/// while active.
const COMBAT_STIMS_DURATION_TURNS: u32 = 4;
/// Security Combat Stims cooldown after deactivation (in player turns).
const COMBAT_STIMS_COOLDOWN_TURNS: u32 = 6;

/// Passive HP regen cadence — every N player turns the survivor
/// gains 1 HP up to their cap. Tunes the "you can recover without
/// burning a med-kit" pacing; bump higher for grittier runs, lower
/// for forgiving exploration.
const PASSIVE_HEAL_TURNS: u32 = 5;


struct Projectile {
    pos: Vec2,
    vel: Vec2,
    /// Distance (in tiles) to the hit point. Despawns once traveled past.
    max_dist: f32,
    traveled: f32,
    /// Tracer color so player and enemy shots can be distinguished at
    /// a glance: warm yellow for the player, warm red for enemies.
    color: Color,
}

/// Per-monster AI state. Drives how `monster_turn` moves and when it
/// attacks this frame. Transitions are recomputed every turn based on
/// LOS, vision range, and the creature's template (kite distance).
#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
enum MonsterAiState {
    /// Haven't seen the player. Creature doesn't move or attack.
    Idle,
    /// Saw the player at some point but don't have LOS this turn.
    /// Moves toward `last_known_player`. If the creature never sees
    /// the player again it stays Alert forever — good enough for a
    /// floor that rarely lasts more than a few minutes real-time.
    Alert,
    /// Has LOS and is in vision range. Moves toward the player and
    /// attacks when in weapon range.
    Chase,
    /// Ranged kiter, player got too close. Moves one tile directly
    /// away from the player and skips the attack this turn.
    Flee,
}

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct Monster {
    kind: creatures::CreatureKind,
    x: usize,
    y: usize,
    hp: i32,
    /// When `Some`, the monster was killed at this time and is drawn as
    /// a white flash until `MONSTER_FLASH_DURATION` has elapsed.
    hit_at: Option<f64>,
    /// Current AI state. `Idle` = never seen the player (previously
    /// tracked via `awake: bool`); anything else means the creature
    /// is engaged and picks moves per-turn.
    ai_state: MonsterAiState,
    /// Last tile the player was seen on, used when giving chase.
    last_known_player: Option<(usize, usize)>,
    /// Has the *player* ever clapped eyes on this creature? Flipped
    /// true the first frame it enters the player's FOV, so the log
    /// message "You see a ..." fires exactly once per individual.
    spotted: bool,
    /// Number of turns this creature has *acted* on. Drives the
    /// Station Master's summon & Ion Sweep cadences. Increments once
    /// per monster_turn pass the creature is awake for.
    actions: u32,
    /// Has the Station Master transitioned to phase 2? Latches on the
    /// first turn its HP drops to ≤ 50% max. Unused on other kinds.
    phase2: bool,
    /// When Some((x,y)), the Station Master's Ion Sweep will trigger
    /// on its next turn, dropping a cross of Electrical Hazards
    /// centered on this tile. Set by the telegraph one turn earlier.
    telegraphed_sweep: Option<(usize, usize)>,
    /// Timestamp of the last non-fatal hit. Drives the renderer's
    /// hurt-animation pick. Distinct from `hit_at`, which only fires
    /// on the killing blow.
    last_hurt_at: Option<f64>,
    /// Timestamp of the creature's last attack (hit or miss). Drives
    /// the renderer's attack-animation pick.
    last_attack_at: Option<f64>,
    /// Timestamp of the creature's last successful move. Drives the
    /// renderer's walk-animation pick.
    last_move_at: Option<f64>,
    /// Status effects currently riding this creature. Same plumbing
    /// the player uses (`status::StatusEffectList`) — the AI consumes
    /// `Stunned` at the start of its turn to skip movement / attack.
    /// Future statuses (poison, bleeding) will tick HP from here too.
    statuses: status::StatusEffectList,
    /// How many consecutive turns the creature has gone without LOS
    /// to the player while in `Alert`. Resets to 0 the moment LOS
    /// returns. Once it exceeds the template's `memory_length`, the
    /// creature drops back to `Idle` and forgets `last_known_player`.
    turns_without_sight: u32,
}

impl Monster {
    /// Spawn a fresh monster at `(x, y)`. HP is rolled from the kind's
    /// template at the given dungeon level; all the "starts at rest"
    /// defaults (not awake, never spotted, no boss counters) come from
    /// this one place so adding another field is a one-line change.
    pub(crate) fn new(kind: creatures::CreatureKind, x: usize, y: usize, level_num: u8) -> Self {
        let hp = kind.stats_at_level(level_num).max_hp;
        Monster {
            kind, x, y, hp,
            hit_at: None,
            ai_state: MonsterAiState::Idle,
            last_known_player: None,
            spotted: false,
            actions: 0,
            phase2: false,
            telegraphed_sweep: None,
            last_hurt_at: None,
            last_attack_at: None,
            last_move_at: None,
            statuses: status::StatusEffectList::default(),
            turns_without_sight: 0,
        }
    }
}

pub(crate) struct LogLine {
    pub(crate) text: String,
}

// ItemKind + its data live in `items::`. Re-exported above.

#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct InventoryEntry {
    pub(crate) kind: ItemKind,
    pub(crate) count: u32,
}

#[derive(Default, Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct Inventory {
    pub(crate) entries: Vec<InventoryEntry>,
}

impl Inventory {
    fn add(&mut self, kind: ItemKind, n: u32) {
        if let Some(e) = self.entries.iter_mut().find(|e| e.kind == kind) {
            e.count += n;
        } else {
            self.entries.push(InventoryEntry { kind, count: n });
        }
    }
    /// Removes one of the given entry. Returns its kind if successful.
    fn consume_at(&mut self, idx: usize) -> Option<ItemKind> {
        let e = self.entries.get_mut(idx)?;
        let kind = e.kind;
        e.count -= 1;
        if e.count == 0 {
            self.entries.remove(idx);
        }
        Some(kind)
    }
}

/// What the player is currently wearing / wielding. One slot per
/// `EquipSlot` variant; missing slots are `None`. Two-handed items
/// anchor in `RightHand` and the helper `left_hand_blocked` reports
/// the implicit lock. The struct is the single source of truth —
/// the renderer's paper-doll signals and the weapon-fire WeaponKind
/// are both *derived* from it via accessor methods.
///
/// Serialization wraps the slots in a Vec so a save written before
/// the Throwable slot was added (10 entries) still loads cleanly:
/// missing tail slots default to `None`. The in-memory storage
/// always matches `EquipSlot::ALL`'s length so `slot_index` lookups
/// stay safe regardless of where the JSON came from.
#[derive(Clone, Default, Debug)]
pub(crate) struct PlayerEquipment {
    /// Indexed by `EquipSlot::ALL.iter().position()`. Don't access
    /// this field directly — use `get` / `set` so re-ordering the
    /// enum is safe.
    slots: [Option<ItemKind>; 15],
}

impl serde::Serialize for PlayerEquipment {
    fn serialize<S: serde::Serializer>(&self, serializer: S) -> Result<S::Ok, S::Error> {
        #[derive(serde::Serialize)]
        struct Wire<'a> { slots: &'a [Option<ItemKind>] }
        Wire { slots: &self.slots }.serialize(serializer)
    }
}

impl<'de> serde::Deserialize<'de> for PlayerEquipment {
    fn deserialize<D: serde::Deserializer<'de>>(deserializer: D) -> Result<Self, D::Error> {
        #[derive(serde::Deserialize)]
        struct Wire { slots: Vec<Option<ItemKind>> }
        let wire = Wire::deserialize(deserializer)?;
        let mut slots: [Option<ItemKind>; 15] = [None; 15];
        for (i, item) in wire.slots.into_iter().take(15).enumerate() {
            slots[i] = item;
        }
        Ok(PlayerEquipment { slots })
    }
}

impl PlayerEquipment {
    fn slot_index(slot: items::EquipSlot) -> usize {
        items::EquipSlot::ALL.iter()
            .position(|s| *s == slot)
            .expect("EquipSlot must be listed in EquipSlot::ALL")
    }
    pub(crate) fn get(&self, slot: items::EquipSlot) -> Option<ItemKind> {
        self.slots[Self::slot_index(slot)]
    }
    fn set(&mut self, slot: items::EquipSlot, kind: Option<ItemKind>) {
        self.slots[Self::slot_index(slot)] = kind;
    }
    /// Direct slot write, intentionally bypassing the equip / unequip
    /// flow's logging and AC bookkeeping. Reserved for the save-load
    /// path, which restores `player_ac` from the snapshot in one
    /// shot rather than re-computing it slot-by-slot.
    pub(crate) fn set_for_load(&mut self, slot: items::EquipSlot, kind: Option<ItemKind>) {
        self.set(slot, kind);
    }
    fn clear(&mut self) {
        for s in self.slots.iter_mut() { *s = None; }
    }
    /// WeaponKind currently in the right hand, or `None` if the
    /// hand is empty / holds something other than a weapon.
    pub(crate) fn right_hand_weapon(&self) -> Option<WeaponKind> {
        match self.get(items::EquipSlot::RightHand) {
            Some(ItemKind::Weapon(w)) => Some(w),
            _ => None,
        }
    }
    /// True when a two-handed item in the right hand prevents the
    /// left hand from holding anything.
    pub(crate) fn left_hand_blocked(&self) -> bool {
        self.get(items::EquipSlot::RightHand)
            .map(|k| k.template().two_handed)
            .unwrap_or(false)
    }

    /// Equip the inventory entry at `idx` into its primary slot.
    /// Convenience wrapper around `equip_from_inventory_into` for
    /// the inventory's letter-key "Equip" action, which doesn't
    /// know about alternate slots.
    pub(crate) fn equip_from_inventory(
        &mut self,
        idx: usize,
        inventory: &mut Inventory,
        player_ac: &mut i32,
        log: &mut Vec<LogLine>,
        now: f64,
    ) -> bool {
        let Some(kind) = inventory.entries.get(idx).map(|e| e.kind) else { return false };
        let Some(slot) = kind.template().equip_slot else { return false };
        self.equip_from_inventory_into(idx, slot, inventory, player_ac, log, now)
    }

    /// Equip the inventory entry at `idx` into `slot`. `slot` must
    /// be either the item's primary `equip_slot` or one of its
    /// `extra_equip_slots`. Two-handed items clear and return both
    /// hand slots; equipping anything into the off hand while a
    /// two-handed weapon is in the right hand auto-stows the
    /// two-handed weapon back into inventory first (the player
    /// almost always means "swap to this", not "fail because the
    /// right hand's full"). Belt pouch slots are refused without a
    /// `UtilityBelt` equipped. Returns true on success.
    pub(crate) fn equip_from_inventory_into(
        &mut self,
        idx: usize,
        slot: items::EquipSlot,
        inventory: &mut Inventory,
        player_ac: &mut i32,
        log: &mut Vec<LogLine>,
        now: f64,
    ) -> bool {
        let kind = match inventory.entries.get(idx) {
            Some(e) => e.kind,
            None => return false,
        };
        let template = kind.template();
        // The target slot must be either the item's primary slot
        // or one of its declared extras. Anything else is caller
        // error — refuse rather than slot the item into a place it
        // can't actually rest.
        let slot_ok = template.equip_slot == Some(slot)
            || template.extra_equip_slots.contains(&slot);
        if !slot_ok { return false; }

        // Belt pouches refuse contents unless a utility belt is
        // currently worn. Same UX as a closed door: log the reason,
        // leave the item in the bag.
        let is_belt_pouch = matches!(
            slot,
            items::EquipSlot::RightBelt | items::EquipSlot::LeftBelt,
        );
        if is_belt_pouch && self.get(items::EquipSlot::UtilityBelt).is_none() {
            add_log(log, i18n::tr("log.equip.no_utility_belt"), now);
            return false;
        }

        inventory.consume_at(idx);

        // Slots that get cleared as a side-effect of this equip,
        // returned to the inventory after the new item lands.
        let mut returned: Vec<ItemKind> = Vec::new();
        let take_off = |s: items::EquipSlot, eq: &mut Self, ac: &mut i32, ret: &mut Vec<ItemKind>| {
            if let Some(prev) = eq.get(s) {
                *ac -= prev.template().ac_bonus;
                eq.set(s, None);
                ret.push(prev);
            }
        };

        if template.two_handed
            && (slot == items::EquipSlot::RightHand || slot == items::EquipSlot::LeftHand)
        {
            take_off(items::EquipSlot::RightHand, self, player_ac, &mut returned);
            take_off(items::EquipSlot::LeftHand,  self, player_ac, &mut returned);
            self.set(items::EquipSlot::RightHand, Some(kind));
        } else {
            // Off-hand equip while the right hand holds something
            // two-handed: stow the two-hander first. The take_off
            // call below for the target slot then runs as normal,
            // and both displaced items get returned to inventory.
            if slot == items::EquipSlot::LeftHand && self.left_hand_blocked() {
                take_off(items::EquipSlot::RightHand, self, player_ac, &mut returned);
            }
            take_off(slot, self, player_ac, &mut returned);
            self.set(slot, Some(kind));
        }
        *player_ac += template.ac_bonus;
        for prev in &returned {
            inventory.add(*prev, 1);
        }

        let suffix = if template.ac_bonus > 0 {
            tr_fmt!("log.equip.ac_suffix", template.ac_bonus, *player_ac)
        } else { String::new() };
        let swap = if returned.is_empty() {
            String::new()
        } else {
            let names: Vec<&str> = returned.iter().map(|k| k.name()).collect();
            tr_fmt!("log.equip.replacing_suffix", names.join(", "))
        };
        // Per-item equip flavor when set; otherwise a generic line
        // built from the item name. Both forms end with a period so
        // the swap/AC clauses append cleanly.
        let headline = kind.equip_flavor()
            .map(|s| s.to_string())
            .unwrap_or_else(|| tr_fmt!("log.equip.generic", kind.name()));
        add_log(log, format!("{}{}{}", headline, swap, suffix), now);
        true
    }

    /// Take whatever's in `slot` off and put it back in the
    /// inventory. Returns true when something was actually unequipped.
    ///
    /// Unequipping the `UtilityBelt` also dumps the two pouch slots
    /// back into inventory — the pouches are tied to the belt, so
    /// without it they can't carry anything. The lamp's light
    /// disappears the moment the belt comes off, which is the
    /// gameplay-readable behaviour we want.
    pub(crate) fn unequip(
        &mut self,
        slot: items::EquipSlot,
        inventory: &mut Inventory,
        player_ac: &mut i32,
        log: &mut Vec<LogLine>,
        now: f64,
    ) -> bool {
        let Some(kind) = self.get(slot) else { return false };
        self.set(slot, None);
        *player_ac -= kind.template().ac_bonus;
        inventory.add(kind, 1);
        add_log(log, tr_fmt!("log.equip.unequip", kind.name()), now);
        if slot == items::EquipSlot::UtilityBelt {
            for pouch in [items::EquipSlot::RightBelt, items::EquipSlot::LeftBelt] {
                if let Some(item) = self.get(pouch) {
                    self.set(pouch, None);
                    *player_ac -= item.template().ac_bonus;
                    inventory.add(item, 1);
                    add_log(log,
                        tr_fmt!("log.equip.belt_dump", item.name()), now);
                }
            }
        }
        true
    }
}


/// `--test` helper — drop a single Station Master in a 2×2 patch
/// inside the player's starting room, centered if possible, so the
/// sprite and AI can be exercised without a real 5-floor run.
fn spawn_test_boss(level: &mut Level) {
    let room = match level.map.rooms.first() {
        Some(r) => r,
        None => return,
    };
    let (sx, sy) = level.spawn;
    // Walk tiles inside the room looking for a 2×2 walkable patch that
    // doesn't overlap the spawn. Start from the room's interior so the
    // boss lands near the middle, not against a wall.
    let kind = creatures::CreatureKind::StationMaster;
    let (bw, bh) = kind.tile_size();
    let fits = |map: &dungeon::Map, x0: usize, y0: usize| -> bool {
        for dy in 0..bh {
            for dx in 0..bw {
                let tx = x0 + dx as usize;
                let ty = y0 + dy as usize;
                if !map.in_bounds(tx as i32, ty as i32) { return false; }
                if !map.tile(tx, ty).is_walkable() { return false; }
                if (tx, ty) == (sx, sy) { return false; }
            }
        }
        true
    };
    let x_min = room.x + 1;
    let y_min = room.y + 1;
    let x_max = (room.x + room.width).saturating_sub(bw as usize + 1);
    let y_max = (room.y + room.height).saturating_sub(bh as usize + 1);
    let mut placed: Option<(usize, usize)> = None;
    for y in y_min..=y_max {
        for x in x_min..=x_max {
            if fits(&level.map, x, y) {
                placed = Some((x, y));
                break;
            }
        }
        if placed.is_some() { break; }
    }
    // Fallback: whole-map scan if the room was too tight.
    if placed.is_none() {
        'outer: for y in 0..level.map.height.saturating_sub(bh as usize) {
            for x in 0..level.map.width.saturating_sub(bw as usize) {
                if fits(&level.map, x, y) {
                    placed = Some((x, y));
                    break 'outer;
                }
            }
        }
    }
    let Some((bx, by)) = placed else { return };
    level.monsters.push(Monster::new(kind, bx, by, 1));
}

/// How long (in seconds of real time) each one-shot animation state
/// holds before the renderer reverts to idle/walk. Attack and hurt
/// are short, punchy windows; walk uses a longer one because the
/// monster-cadence gap (`HOLD_RATE`) is already this large and we
/// want the walk strip to play through every tile of a chase.
const ANIM_ATTACK_WINDOW: f64 = 0.25;
const ANIM_HURT_WINDOW:   f64 = 0.20;
const ANIM_WALK_WINDOW:   f64 = 0.20;

/// Decide which animation strip the renderer should prefer for this
/// monster right now. Priority: hurt flash beats attack beats walk
/// beats idle, so a monster that got hit while mid-attack plays the
/// hurt frames (the important thing to telegraph).
fn pick_monster_anim_state(m: &Monster, now: f64) -> render::pixel::CreatureAnimState {
    use render::pixel::CreatureAnimState;
    if let Some(t) = m.last_hurt_at {
        if now - t < ANIM_HURT_WINDOW { return CreatureAnimState::Hurt; }
    }
    if let Some(t) = m.last_attack_at {
        if now - t < ANIM_ATTACK_WINDOW { return CreatureAnimState::Attack; }
    }
    if let Some(t) = m.last_move_at {
        if now - t < ANIM_WALK_WINDOW { return CreatureAnimState::Walk; }
    }
    CreatureAnimState::Idle
}

/// True if the given tile is inside this monster's footprint. Single-
/// tile monsters collapse to the normal `m.x == tx && m.y == ty`
/// check; multi-tile monsters (e.g. the 2×2 Station Master) return
/// true for any of the `w × h` tiles anchored at `(m.x, m.y)`.
fn monster_occupies(m: &Monster, tx: usize, ty: usize) -> bool {
    let (w, h) = m.kind.tile_size();
    tx >= m.x && tx < m.x + w as usize
        && ty >= m.y && ty < m.y + h as usize
}

/// Build a fresh `AimState` for the F/T entry path. Auto-snaps the
/// cursor to the nearest valid hostile target when one's available,
/// so the player can press F-Enter to fire at the obvious threat
/// without nudging the cursor first. When no targets are in reach
/// the cursor lands on the player's tile in free-cursor mode, and
/// the player can arrow-walk it to wherever they want to point.
fn open_aim(
    kind: AimKind,
    from: (i32, i32),
    range: i32,
    radius: u32,
    monsters: &[Monster],
    lightmap: &[f32],
    map_width: usize,
) -> AimState {
    let cycle_targets = collect_aim_targets(monsters, from, range, lightmap, map_width);
    let (cursor, cycle_idx) = if let Some(&mi) = cycle_targets.first() {
        ((monsters[mi].x as i32, monsters[mi].y as i32), Some(0))
    } else {
        (from, None)
    };
    AimState { kind, cursor, range, radius, cycle_targets, cycle_idx }
}

/// Live monster indices that count as valid Tab-cycle targets for an
/// aim overlay: alive, inside the keyboard cursor's reach
/// (Chebyshev), and currently visible to the player. Returned in
/// strict distance-then-index order so successive Tab presses walk
/// outward from the player, predictable across frames. Returns the
/// raw indices into `monsters` — the caller materialises positions
/// from there.
fn collect_aim_targets(
    monsters: &[Monster],
    from: (i32, i32),
    range: i32,
    lightmap: &[f32],
    map_width: usize,
) -> Vec<usize> {
    let mut scored: Vec<(usize, i32)> = monsters.iter().enumerate()
        .filter_map(|(i, m)| {
            if m.hit_at.is_some() { return None; }
            let mx = m.x as i32;
            let my = m.y as i32;
            let cheb = (mx - from.0).abs().max((my - from.1).abs());
            if cheb > range { return None; }
            // Lit check — Tab snapping should respect the FOV mask
            // so the player can't auto-snap to a creature they
            // can't see. The mask is 0 outside FOV.
            let lit = lightmap.get(m.y * map_width + m.x).copied().unwrap_or(0.0);
            if lit <= 0.0 { return None; }
            Some((i, cheb))
        })
        .collect();
    scored.sort_by_key(|&(idx, dist)| (dist, idx));
    scored.into_iter().map(|(i, _)| i).collect()
}

/// True iff a door is currently open. The door's `open` field is the
/// persistent state — toggled by a deliberate `E` press while the
/// player is cardinal-adjacent. The proximity-based auto-open rule
/// has been retired; doors stay closed until the player opens them.
///
/// Centralised in a one-line helper so the FOV / monster path / LOS
/// / renderer call sites all keep a single grep target if the door
/// model gains more state (timers, NPC operators, etc.) later.
fn door_is_open(
    door: &dungeon::Door,
    _player: (usize, usize),
    _monsters: &[Monster],
) -> bool {
    door.open
}

/// True if `player` is one tile outside any part of the monster's
/// footprint (8-connected). Player *on* the monster returns false —
/// that state shouldn't be reachable since walking onto a monster
/// tile is blocked.
fn player_adjacent_to(m: &Monster, player: (usize, usize)) -> bool {
    let (pw, ph) = m.kind.tile_size();
    let (px, py) = (player.0 as i32, player.1 as i32);
    let (mx, my) = (m.x as i32, m.y as i32);
    if monster_occupies(m, player.0, player.1) { return false; }
    let in_x = px >= mx - 1 && px <= mx + pw as i32;
    let in_y = py >= my - 1 && py <= my + ph as i32;
    in_x && in_y
}

/// Apply damage to the player from any source — monsters, hazards,
/// future traps, whatever. Decrements HP (saturating at 0), stamps
/// `last_damage_time` so the hurt animation / i-frames catch it, and
/// plays a random grunt so the player always hears the hit. Callers
/// should still log their own flavor line.
fn hurt_player(
    hp: &mut u32,
    amount: u32,
    last_damage_time: &mut f64,
    audio_bank: &AudioBank,
    rng: &mut StdRng,
    now: f64,
) {
    if amount == 0 { return; }
    *hp = hp.saturating_sub(amount);
    *last_damage_time = now;
    audio::play(audio_bank, Sfx::PlayerHurt, rng);
}

/// Drop any loot the dead creature is owed. Two channels:
///
/// 1. **Unique drop** — the Station Master always drops the AdminKeycard,
///    a quest-critical item, at its upper-left footprint tile.
/// 2. **Signature weapon** — named enemies have a chance to drop their
///    themed weapon (Plasma Rifle from a Rogue Bot, etc.).
fn maybe_drop_weapon(
    kind: creatures::CreatureKind,
    at: (usize, usize),
    items: &mut Vec<(ItemKind, usize, usize)>,
    log: &mut Vec<LogLine>,
    rng: &mut StdRng,
    now: f64,
) {
    if matches!(kind, creatures::CreatureKind::StationMaster) {
        items.push((ItemKind::AdminKeycard, at.0, at.1));
        add_log(log, i18n::tr("log.drop.station_master_keycard"), now);
    }
    let Some(weapon) = kind.signature_weapon() else { return };
    let chance = kind.weapon_drop_chance();
    if chance <= 0.0 { return; }
    if chance < 1.0 && !rng.gen_bool(chance as f64) { return; }
    items.push((ItemKind::Weapon(weapon), at.0, at.1));
    add_log(log,
        tr_fmt!("log.drop.signature", kind.name(), weapon.name()),
        now);
}

/// Apply an XP gain from any source (kill, quest, discovery, etc.) and
/// trigger a level-up when the threshold is crossed. Level-ups raise
/// `hp_max` by 1, fully heal, and log the transition. Callers handle
/// their own flavor log — this function only owns XP + level-up.
fn gain_xp(
    xp: &mut u32,
    player_level: &mut u8,
    hp: &mut u32,
    hp_max: &mut u32,
    amount: u32,
    log: &mut Vec<LogLine>,
    now: f64,
) {
    *xp += amount;
    let new_level = (1 + (*xp / 100)) as u8;
    if new_level > *player_level {
        *player_level = new_level;
        *hp_max += 1;
        *hp = *hp_max;
        add_log(log, tr_fmt!("log.xp.level_up", player_level), now);
    }
}

/// Indices of inventory entries that should show up in the UI right
/// now, in display order: walk `ItemCategory::ALL` top-to-bottom and,
/// for each non-collapsed category, collect entries that belong to it.
/// The returned vec's order is what letter keys bind to.
fn visible_item_indices(
    inventory: &Inventory,
    collapsed: &std::collections::HashSet<ItemCategory>,
) -> Vec<usize> {
    let mut out = Vec::new();
    for cat in ItemCategory::ALL.iter() {
        if collapsed.contains(cat) { continue; }
        for (i, entry) in inventory.entries.iter().enumerate() {
            if entry.kind.category() == *cat {
                out.push(i);
            }
        }
    }
    out
}

/// Everything that a single dungeon floor contains. Regenerated on stairs
/// descent and on run restart.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct Level {
    pub(crate) map: dungeon::Map,
    pub(crate) monsters: Vec<Monster>,
    pub(crate) items: Vec<(ItemKind, usize, usize)>, // (item, x, y)
    /// Stationary, interactible objects (cryo tubes, lockers, terminals).
    /// Drawn after items but before the FOV mask so they fade with
    /// distance like other map features.
    pub(crate) props: Vec<props::Prop>,
    /// Bulkhead doors at corridor/room boundaries. Each carries an
    /// orientation toward the room interior; the renderer rotates
    /// the sprite from there. Doors don't block movement — they
    /// just animate open/closed based on player proximity.
    pub(crate) doors: Vec<dungeon::Door>,
    /// Tile the player steps onto to descend to the next floor.
    /// Doubles as the eastern zone door tile when one was carved.
    pub(crate) stairs_down: (usize, usize),
    /// Western zone-door tile, when level-gen successfully carved
    /// one. Used as the entry-spawn override on descent so the
    /// player "walks out" of the next zone's west door, completing
    /// the spinward illusion. `None` falls back to `spawn`.
    pub(crate) west_zone_door: Option<(usize, usize)>,
    pub(crate) spawn: (usize, usize),
    pub(crate) num: u8,
    /// Hazard tiles with a finite lifetime — currently the only
    /// source is the Station Master's Ion Sweep. Each entry's
    /// `turns_remaining` counter ticks down once per player turn;
    /// when it hits zero the underlying tile is reverted to the
    /// stored `restore` (always `Floor` today, but the field lets
    /// future hazards remember whatever they overwrote). Ambient
    /// hazards stamped onto the map by `place_hazards` are
    /// permanent and don't appear here.
    #[serde(default)]
    pub(crate) expiring_hazards: Vec<ExpiringHazard>,
}

/// A map tile that was set to a hazard (ElectricalHazard, etc.)
/// by a temporary effect (an Ion Sweep) and should revert after a
/// few player turns. Lives parallel to the map so the static tile
/// vector stays simple — the per-tile Floor/Wall enum doesn't grow
/// a duration field.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub(crate) struct ExpiringHazard {
    pub pos: (usize, usize),
    pub turns_remaining: u32,
    pub restore: dungeon::Tile,
}

/// Top-level flow state. The main loop dispatches based on this.
/// Launch order: `Title` → `Intro` → `RollStats` → `ClassSelect` →
/// `Playing`. Title's "Load Game" branch jumps straight to
/// `Playing` (the loaded snapshot already has class + stats baked
/// in). Death / restart returns to `Title` so the player can pick
/// "Load Game" instead of starting a fresh run.
enum Phase {
    /// Opening menu: New Game / Load Game.
    Title,
    Intro,
    RollStats,
    ClassSelect,
    Playing,
    GameOver,
}

/// Player actions. Each one consumes a turn and is followed by a monster
/// turn. Freelook (aim toggle, label toggle, weapon toggle) doesn't count.
#[derive(Clone, Copy)]
enum Action {
    Step(i32, i32),
    /// Discharge the equipped ranged weapon at the keyboard-aim
    /// cursor's current tile. Carries the target so the action
    /// handler doesn't need to peek at the aim overlay — by the
    /// time this action is committed, the overlay has already
    /// been torn down.
    Fire { target: (usize, usize) },
    Wait,
    /// Hurl the item assigned to the `Throwable` slot at the
    /// keyboard-aim cursor's tile. Resolution walks the affected
    /// radius, applies impact damage, and (for `explosive` items)
    /// places fire-pool tiles via `ExpiringHazard`. Non-explosive
    /// throws drop the item on the landing tile for pickup.
    Throw { target: (usize, usize) },
    /// Interact with a prop or door in one of the player's four
    /// cardinal neighbours (E key). Examines a description prop,
    /// drains a container into inventory, opens or refuses a door,
    /// etc. If nothing's adjacent, the action is dropped without
    /// consuming a turn. If two or more are adjacent, the input
    /// layer routes to `InteractAt(target)` after the player picks
    /// a direction.
    Interact,
    /// Direction-resolved interact — the target (prop or door
    /// index) is locked in before the action runs. Used after the
    /// multi-adjacent direction prompt picks a target.
    InteractAt(InteractTarget),
    /// Kick (K key) — push back the enemy in the player's facing
    /// direction by one tile. Costs a turn when it lands; dropped
    /// without consuming a turn if there's no enemy in front.
    Kick,
    /// Swap the right-hand weapon with whatever's in the
    /// `ReadyWeapon` stash. Costs one player turn. Empty slots
    /// swap through cleanly (e.g. swap a wielded weapon into the
    /// stash with no replacement coming back). No-op (no turn) if
    /// both slots are empty.
    SwapWeapon,
}

/// Which kind of attack the aim overlay is staging. `Fire` resolves
/// to the equipped ranged weapon's hit-scan; `Throw` resolves to a
/// thrown item with optional splash radius.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum AimKind {
    Fire,
    Throw,
}

/// Live aim overlay state. While `Some`, normal action input
/// (movement / wait / interact / etc.) is suppressed and the
/// arrow / Tab / Enter / Esc keys drive the cursor instead.
#[derive(Clone, Debug)]
struct AimState {
    kind: AimKind,
    /// Tile the player is currently targeting. Constrained to the
    /// map bounds; *not* automatically constrained to `range` —
    /// out-of-range is rendered dimly so the player can see the
    /// boundary without being snapped against it.
    cursor: (i32, i32),
    /// Tiles of reach. For `Fire` this is the weapon's hit-scan
    /// range; for `Throw` it's the item's base reach plus the
    /// thrower's Strength modifier. Used for the validity test
    /// (Chebyshev distance) and for filtering Tab-cycle targets.
    range: i32,
    /// Tiles around the cursor that get hit on resolve (Chebyshev
    /// distance). 0 = single-tile; 1 = 3×3 splash; etc. Drives the
    /// retro-green radius preview while aiming.
    radius: u32,
    /// Cached list of valid enemy targets — monster indices within
    /// `range` and inside the player's lightmap. Filled lazily on
    /// the first Tab press; reset on any free-cursor movement.
    cycle_targets: Vec<usize>,
    /// Position in `cycle_targets` of the current focus. `None`
    /// when in free-cursor mode (arrows / cursor edits move the
    /// cursor without snapping to an enemy).
    cycle_idx: Option<usize>,
}

/// Per-class + per-equipment field-of-view radii. Returns `(bright, dim)`.
///
/// Build-up:
/// 1. Start at the unlit baseline (`BASE_BRIGHT_RADIUS`, `BASE_DIM_RADIUS`).
/// 2. **Take the max** with every equipped item that's a light source —
///    multiple lamps don't stack; the brightest wins.
/// 3. Add the Engineering Schematic Sense bonus on top.
///
/// To retune the vanilla survivor: edit the BASE_* constants. To
/// retune a single light source: edit its `LightProfile` on the item
/// template. To add a new light source: set `light_source` on its
/// template and the lookup picks it up automatically.
fn vision_radii(
    class: Option<classes::PlayerClass>,
    equipment: &PlayerEquipment,
) -> (usize, usize) {
    let mut bright = BASE_BRIGHT_RADIUS;
    let mut dim    = BASE_DIM_RADIUS;
    // Scan every equipment slot for a light source. Belt-clipped
    // lamps still emit light, which is the whole point of the
    // utility belt; ReadyWeapon and Throwable items don't typically
    // have a `light_source`, so this is a no-op for those slots.
    for &slot in items::EquipSlot::ALL {
        let Some(kind) = equipment.get(slot) else { continue };
        let Some(light) = kind.template().light_source else { continue };
        bright = bright.max(light.bright_radius as usize);
        dim    = dim.max(light.dim_radius as usize);
    }
    if class == Some(classes::PlayerClass::Engineering) {
        bright += ENGINEERING_BONUS_VISION;
        dim    += ENGINEERING_BONUS_VISION;
    }
    (bright, dim)
}

/// Recompute the visible-tiles lightmap using the player's class- and
/// equipment-aware vision radii. Called on spawn, descent, game-over
/// reset, equipment changes, and every time the player moves.
fn recompute_lightmap(
    map: &dungeon::Map,
    pos: (usize, usize),
    class: Option<classes::PlayerClass>,
    equipment: &PlayerEquipment,
    doors: &[dungeon::Door],
    monsters: &[Monster],
) -> Vec<f32> {
    let (br, dr) = vision_radii(class, equipment);
    // Closed doors block FOV the same way walls do. The door tile
    // itself is still lit (so the player *sees* the door); only
    // tiles past it stay dark. `door_is_open` is the single source
    // of truth for which doors are currently passable.
    let closed_doors: Vec<(usize, usize)> = doors.iter()
        .filter(|d| !door_is_open(d, pos, monsters))
        .map(|d| d.pos)
        .collect();
    fov::compute_lightmap(map, pos, br, dr, &closed_doors)
}

/// Window-icon source. A 32×32 mutant frame; the loader rescales it
/// to all three required sizes (16 / 32 / 64) via nearest-neighbour
/// so the pixel art stays crisp. Swap the path here to retheme.
const WINDOW_ICON_PATH: &str = "assets/original/mutant/B1.png";

/// Load `WINDOW_ICON_PATH` and produce an `Icon` with the three sizes
/// macroquad expects. Sync (`window_conf` runs before the async game
/// loop), so we read raw bytes via `std::fs` and decode with the
/// already-vendored `image` crate. Any failure (file missing,
/// decode error, wrong byte count) falls back to `None` — the OS
/// supplies its default icon and the game still launches.
fn build_window_icon() -> Option<macroquad::miniquad::conf::Icon> {
    use macroquad::miniquad::conf::Icon;
    use image::imageops::{resize, FilterType};

    let bytes = std::fs::read(WINDOW_ICON_PATH).ok()?;
    let img = image::load_from_memory_with_format(&bytes, image::ImageFormat::Png)
        .ok()?
        .to_rgba8();

    let to_array = |w: u32, h: u32, target: &mut [u8]| -> Option<()> {
        let resized = resize(&img, w, h, FilterType::Nearest);
        let raw = resized.into_raw();
        if raw.len() != target.len() { return None; }
        target.copy_from_slice(&raw);
        Some(())
    };

    let mut small  = [0u8; 16 * 16 * 4];
    let mut medium = [0u8; 32 * 32 * 4];
    let mut big    = [0u8; 64 * 64 * 4];
    to_array(16, 16, &mut small)?;
    to_array(32, 32, &mut medium)?;
    to_array(64, 64, &mut big)?;
    Some(Icon { small, medium, big })
}

fn window_conf() -> Conf {
    Conf {
        window_title: "Ecdysium".to_owned(),
        window_width:  (MAP_W as f32 * TILE_SIZE) as i32,
        window_height: ((MAP_H as f32 + 1.0) * TILE_SIZE) as i32,
        window_resizable: true,
        icon: build_window_icon(),
        ..Default::default()
    }
}

/// Camera centred on the player's tile. Zoomed 2× so sprites take more
/// of the screen and the map scrolls.
fn compute_layout(player: (usize, usize)) -> (f32, f32, f32, f32) {
    let sw = screen_width();
    let sh = screen_height();
    let status_h = (sh * 0.04).max(20.0);
    let avail_h = (sh - status_h).max(1.0);
    let base_tile = (sw / MAP_W as f32)
        .min(avail_h / MAP_H as f32)
        .max(4.0);
    let tile = base_tile * ZOOM;
    let player_cx = (player.0 as f32 + 0.5) * tile;
    let player_cy = (player.1 as f32 + 0.5) * tile;
    let offset_x = sw * 0.5 - player_cx;
    let offset_y = avail_h * 0.5 - player_cy;
    (tile, offset_x, offset_y, status_h)
}

#[derive(Default)]
struct HoldTimer {
    pressed_at: Option<f64>,
    last_fire: f64,
}

impl HoldTimer {
    fn tick(&mut self, now: f64, down: bool, delay: f64, repeat: f64) -> bool {
        if !down { self.pressed_at = None; return false; }
        match self.pressed_at {
            None => { self.pressed_at = Some(now); self.last_fire = now; true }
            Some(start) => {
                if now - start >= delay && now - self.last_fire >= repeat {
                    self.last_fire = now;
                    true
                } else { false }
            }
        }
    }
}

fn add_log(log: &mut Vec<LogLine>, text: impl Into<String>, _now: f64) {
    // `_now` is reserved for a future "dim old log lines" pass —
    // call sites pass it so wiring it up later is parameter-free.
    log.push(LogLine { text: text.into() });
    while log.len() > 40 { log.remove(0); }
}

/// Outcome of a prop interaction. Examine / Terminal resolve in one
/// shot (their log line goes through `interact_with_prop`); Container
/// hands a `LootScreen` request up to the caller, which owns the
/// looting state machine.
enum PropInteractionResult {
    /// Already handled — caller can mark the turn taken.
    Done,
    /// Open the loot screen for the prop at this index. Caller is
    /// responsible for switching its UI state into looting mode and
    /// (typically) **not** consuming a turn for the open itself.
    OpenLoot,
}

/// Run a prop's interaction, except for Container which the caller
/// resolves via its loot screen. Examine logs the description;
/// Locked logs the lock's specific reason; Terminal stubs in a
/// flicker line until a real terminal handler lands. Same code path
/// is shared by both bump-into-prop and the E-key adjacency interact.
fn interact_with_prop(
    prop: &props::Prop,
    log: &mut Vec<LogLine>,
    now: f64,
) -> PropInteractionResult {
    let t = prop.template();
    match t.interaction {
        props::PropInteraction::Examine => {
            add_log(log, prop.display_description(), now);
            PropInteractionResult::Done
        }
        props::PropInteraction::Container => PropInteractionResult::OpenLoot,
        props::PropInteraction::Terminal => {
            add_log(log,
                tr_fmt!("log.interact.terminal_flickers", prop.display_name()),
                now);
            PropInteractionResult::Done
        }
        props::PropInteraction::Locked { reason } => {
            add_log(log, i18n::tr(reason), now);
            PropInteractionResult::Done
        }
    }
}

/// Run the interaction for `props[pi]`. Examine / Terminal / Locked
/// log their line and consume a turn (`*turn_taken = true`);
/// Container opens the loot overlay (no turn cost — the Take verb
/// inside the overlay drains items individually). Centralised so
/// the `Action::Interact` (auto-routed) and `Action::InteractAt`
/// (direction-resolved) branches share the same dispatch.
#[allow(clippy::too_many_arguments)]
fn resolve_prop_interact(
    pi: usize,
    level: &Level,
    _inventory: &mut Inventory,
    pending_item_prompt: &mut Option<EntryPrompt>,
    pending_loot_prompt: &mut Option<EntryPrompt>,
    looting: &mut Option<usize>,
    loot_scroll: &mut f32,
    show_inventory: &mut bool,
    show_equipment: &mut bool,
    log: &mut Vec<LogLine>,
    turn_taken: &mut bool,
    now: f64,
) {
    match interact_with_prop(&level.props[pi], log, now) {
        PropInteractionResult::Done => {
            *turn_taken = true;
        }
        PropInteractionResult::OpenLoot => {
            *looting = Some(pi);
            *pending_loot_prompt = None;
            *loot_scroll = 0.0;
            // Loot screen is mutually exclusive with inventory /
            // equipment — close the others before opening it.
            *show_inventory = false;
            *show_equipment = false;
            *pending_item_prompt = None;
        }
    }
}

/// `EntryPrompt` is the per-entry action prompt used by both the
/// inventory and the loot screens. Defined at module scope so
/// helpers like `resolve_prop_interact` can reference it.
struct EntryPrompt { entry_idx: usize, mode: ui::ItemPromptMode }

/// Resolve an `E`-press against an adjacent door. Locked doors log
/// the "need an access key" line and still consume a turn (matches
/// the Locked prop pattern); unlocked closed doors flip open;
/// already-open doors flip closed unless something is standing on
/// the tile. Every successful flip consumes a turn so monster AI
/// gets a tick to react.
fn resolve_door_interact(
    di: usize,
    doors: &mut [dungeon::Door],
    monsters: &[Monster],
    player: (usize, usize),
    log: &mut Vec<LogLine>,
    turn_taken: &mut bool,
    now: f64,
) {
    let door = &mut doors[di];
    if !door.open && door.locked {
        add_log(log, i18n::tr("log.door.locked"), now);
        *turn_taken = true;
        return;
    }
    if door.open {
        // Refuse to slam a door shut on a creature already standing
        // in the threshold; the player or a monster on the tile
        // would suddenly find itself blocked.
        let pos = door.pos;
        let occupied = pos == player
            || monsters.iter().any(|m|
                m.hit_at.is_none() && monster_occupies(m, pos.0, pos.1));
        if occupied {
            add_log(log, i18n::tr("log.door.something_in_way"), now);
            return;
        }
        door.open = false;
        add_log(log, i18n::tr("log.door.pulled_shut"), now);
    } else {
        door.open = true;
        add_log(log, i18n::tr("log.door.slides_open"), now);
    }
    *turn_taken = true;
}

/// What the `E`-key dispatcher can act on. Props (cryo tubes,
/// lockers, terminals) and doors (open / locked) live in different
/// vecs and have different handlers, so the disambiguator carries
/// the index plus a tag.
#[derive(Clone, Copy)]
pub(crate) enum InteractTarget {
    Prop(usize),
    Door(usize),
}

/// Every interactable the player can act on right now, paired
/// with the `(dx, dy)` direction from the player. Includes:
///
/// 1. **The player's own tile** (`(0, 0)`) when a passable prop
///    sits there — chests / crates / lockers can be looted while
///    standing inside them. This lands first in the list so the
///    "single target → act now" path picks it when nothing
///    adjacent competes; players expect E on a tile they share
///    with a crate to open the crate.
/// 2. The four cardinal neighbours.
///
/// Used by the interact pipeline to decide between "single target
/// → act now" and "multiple targets → ask which direction".
/// Returns props and doors merged into a single list; the consumer
/// dispatches off `InteractTarget`.
fn adjacent_interactables(
    props: &[props::Prop],
    doors: &[dungeon::Door],
    player: (usize, usize),
) -> Vec<(InteractTarget, (i32, i32))> {
    let mut out = Vec::new();
    // Self-tile prop comes first. Only props can occupy a player
    // tile (passable props like crates / lockers); doors are floor
    // tiles but stepping onto an open one and pressing E doesn't
    // logically interact with it, so doors are cardinal-only.
    if let Some(i) = props.iter().position(|p| p.pos == player) {
        out.push((InteractTarget::Prop(i), (0, 0)));
    }
    for (dx, dy) in [(0i32, -1i32), (0, 1), (-1, 0), (1, 0)] {
        let nx = player.0 as i32 + dx;
        let ny = player.1 as i32 + dy;
        if nx < 0 || ny < 0 { continue; }
        let target = (nx as usize, ny as usize);
        if let Some(i) = props.iter().position(|p| p.pos == target) {
            out.push((InteractTarget::Prop(i), (dx, dy)));
        } else if let Some(i) = doors.iter().position(|d| d.pos == target) {
            out.push((InteractTarget::Door(i), (dx, dy)));
        }
    }
    out
}

/// AC bonus granted by being adjacent to a wall on the side facing
/// the attacker. Models quarter-cover: you're peeking around a corner.
const COVER_AC_BONUS: i32 = 2;

/// Effective AC of a monster accounting for phase-2 cracked armor on
/// the Station Master. Every other kind returns the template value.
fn effective_armor_class(m: &Monster) -> i32 {
    let base = m.kind.armor_class();
    if m.phase2 { base - 2 } else { base }
}

/// Is `target` in cover *from* `attacker`? True when the cardinal-
/// aligned neighbor of `target` on the attacker-facing side is a
/// non-walkable tile (wall / void). Interpretation: you're braced
/// against the wall and peeking around it — the attacker's round has
/// to thread around the cover. Works both ways: monsters hugging a
/// wall get the bonus against player fire, too.
fn has_cover_from(
    map: &dungeon::Map,
    target: (usize, usize),
    attacker: (usize, usize),
) -> bool {
    let dx = (attacker.0 as i32 - target.0 as i32).signum();
    let dy = (attacker.1 as i32 - target.1 as i32).signum();
    if dx == 0 && dy == 0 { return false; }
    let is_solid = |ox: i32, oy: i32| -> bool {
        let nx = target.0 as i32 + ox;
        let ny = target.1 as i32 + oy;
        map.in_bounds(nx, ny) && !map.tile(nx as usize, ny as usize).is_walkable()
    };
    if dx != 0 && is_solid(dx, 0) { return true; }
    if dy != 0 && is_solid(0, dy) { return true; }
    false
}

/// Bresenham-ish line-of-sight. Tiles strictly between `from` and `to`
/// must be floor (not a wall) **and** not a closed door for LOS to
/// hold. `extra_blockers` is a list of `(x, y)` positions that
/// occlude sight in addition to walls — currently fed by closed
/// doors so monsters can't see (or shoot) the player through them.
fn has_los(
    map: &dungeon::Map,
    from: (usize, usize),
    to: (usize, usize),
    extra_blockers: &[(usize, usize)],
) -> bool {
    let (x0, y0) = (from.0 as i32, from.1 as i32);
    let (x1, y1) = (to.0 as i32, to.1 as i32);
    let dx = (x1 - x0).abs();
    let dy = (y1 - y0).abs();
    let steps = dx.max(dy);
    if steps == 0 { return true; }
    for i in 1..steps {
        let t = i as f32 / steps as f32;
        let x = (x0 as f32 + t * (x1 - x0) as f32).round() as i32;
        let y = (y0 as f32 + t * (y1 - y0) as f32).round() as i32;
        if !map.in_bounds(x, y) || !map.tile(x as usize, y as usize).is_walkable() {
            return false;
        }
        let (xu, yu) = (x as usize, y as usize);
        if extra_blockers.iter().any(|&p| p == (xu, yu)) {
            return false;
        }
    }
    true
}

/// 4-connected BFS from `start` to `goal`. Walls are impassable; tiles
/// where `is_blocked(x, y)` returns true are impassable *except* the
/// goal tile itself — so a path can terminate on a monster or player.
fn find_path<F: Fn(usize, usize) -> bool>(
    map: &dungeon::Map,
    start: (usize, usize),
    goal: (usize, usize),
    is_blocked: F,
) -> Vec<(usize, usize)> {
    use std::collections::VecDeque;
    if start == goal { return Vec::new(); }
    let (w, h) = (map.width, map.height);
    let idx = |x: usize, y: usize| y * w + x;
    let mut parent: Vec<Option<(usize, usize)>> = vec![None; w * h];
    let mut visited = vec![false; w * h];
    let mut queue: VecDeque<(usize, usize)> = VecDeque::new();
    queue.push_back(start);
    visited[idx(start.0, start.1)] = true;
    let mut found = false;
    while let Some((x, y)) = queue.pop_front() {
        if (x, y) == goal { found = true; break; }
        for &(dx, dy) in &[(0i32, -1i32), (1, 0), (0, 1), (-1, 0)] {
            let nx = x as i32 + dx;
            let ny = y as i32 + dy;
            if nx < 0 || ny < 0 || nx >= w as i32 || ny >= h as i32 { continue; }
            let (nxu, nyu) = (nx as usize, ny as usize);
            if visited[idx(nxu, nyu)] { continue; }
            if !map.tile(nxu, nyu).is_walkable() { continue; }
            if (nxu, nyu) != goal && is_blocked(nxu, nyu) { continue; }
            visited[idx(nxu, nyu)] = true;
            parent[idx(nxu, nyu)] = Some((x, y));
            queue.push_back((nxu, nyu));
        }
    }
    if !found { return Vec::new(); }
    let mut path = Vec::new();
    let mut cur = goal;
    while cur != start {
        path.push(cur);
        cur = match parent[idx(cur.0, cur.1)] {
            Some(p) => p,
            None => return Vec::new(),
        };
    }
    path.reverse();
    path
}

/// Ray from `origin` in `dir` direction (unit vector), returns (hit point
/// in tile coords, optional hit monster index). Stops at the first wall
/// or live monster tile.
/// Result of a hit-scan projectile resolving its path. `hit` is the
/// first creature the roll landed on (the bullet stops there); any
/// creatures the bullet passed THROUGH with a missed roll are listed
/// in `misses`, oldest first, so callers can log them by name.
pub struct HitScanResult {
    pub pos: Vec2,
    pub misses: Vec<usize>,
    pub hit: Option<usize>,
}

fn hit_scan(
    map: &dungeon::Map,
    monsters: &[Monster],
    origin: Vec2,
    dir: Vec2,
    max_dist: f32,
    rng: &mut StdRng,
) -> HitScanResult {
    if dir.length_squared() <= 0.0 {
        return HitScanResult { pos: origin, misses: Vec::new(), hit: None };
    }
    let steps = ((max_dist * 4.0).ceil() as i32).max(1);
    let step_vec = dir * (max_dist / steps as f32);
    let mut pos = origin;
    let mut misses: Vec<usize> = Vec::new();
    // Track the creature we're currently passing over so one monster
    // only gets rolled against once per shot, even though the ray
    // samples its tile on multiple sub-steps.
    let mut current: Option<usize> = None;

    for _ in 0..steps {
        pos += step_vec;
        let (x, y) = (pos.x, pos.y);
        if x < 0.0 || y < 0.0 || x >= MAP_W as f32 || y >= MAP_H as f32 {
            return HitScanResult { pos, misses, hit: None };
        }
        let tx = x as usize;
        let ty = y as usize;
        // Projectiles pass through anywhere the player can walk — so
        // hazard tiles, stairs, and the like don't stop a bullet. Only
        // walls and the like are opaque.
        if !map.tile(tx, ty).is_walkable() {
            return HitScanResult { pos, misses, hit: None };
        }
        let here = monsters.iter().position(|m|
            m.hit_at.is_none() && monster_occupies(m, tx, ty));
        if here != current {
            current = here;
            if let Some(i) = here {
                let roll = rng.gen_range(1..=20);
                // Cover against ranged fire: if the target is hugging
                // a wall on the shooter's side, +2 AC.
                let origin_tile = (origin.x as usize, origin.y as usize);
                let target_tile = (monsters[i].x, monsters[i].y);
                let ac_base = effective_armor_class(&monsters[i]);
                let ac = if has_cover_from(map, target_tile, origin_tile) {
                    ac_base + COVER_AC_BONUS
                } else {
                    ac_base
                };
                if roll >= ac {
                    return HitScanResult { pos, misses, hit: Some(i) };
                }
                misses.push(i);
            }
        }
    }
    HitScanResult { pos, misses, hit: None }
}

/// Play any per-creature movement sound on a successful step.
/// Currently only the Mutant Human has one — the tentacle squelch.
/// Add more arms as new creature movement sfx land.
fn play_creature_move_sfx(
    kind: creatures::CreatureKind,
    audio_bank: &AudioBank,
    rng: &mut StdRng,
) {
    if matches!(kind, creatures::CreatureKind::MutantHuman) {
        audio::play(audio_bank, Sfx::MutantMove, rng);
    }
}

/// Pick a neighbor tile that maximises distance from the player, for
/// kiters (Flee state). Tries 4-connected moves; returns the current
/// position when every option is blocked. Won't step onto the player
/// or another live monster, and won't step into a wall.
fn flee_step(level: &Level, idx: usize, player: (usize, usize)) -> (usize, usize) {
    let (mx, my) = (level.monsters[idx].x, level.monsters[idx].y);
    let (px, py) = (player.0 as i32, player.1 as i32);
    let current_dist = (mx as i32 - px).abs().max((my as i32 - py).abs());
    let mut best = (mx, my);
    let mut best_dist = current_dist;
    for &(dx, dy) in &[(0i32, -1i32), (0, 1), (-1, 0), (1, 0)] {
        let nx = mx as i32 + dx;
        let ny = my as i32 + dy;
        if !level.map.in_bounds(nx, ny) { continue; }
        let (nxu, nyu) = (nx as usize, ny as usize);
        if !level.map.tile(nxu, nyu).is_walkable() { continue; }
        if (nxu, nyu) == player { continue; }
        let blocked = level.monsters.iter().enumerate().any(|(j, m)|
            j != idx && m.hit_at.is_none() && monster_occupies(m, nxu, nyu));
        if blocked { continue; }
        // Closed doors block flee moves too. `door_is_open` is
        // the same single-source-of-truth helper the FOV / chase
        // pathing use, so behaviour stays consistent.
        let door_closed = level.doors.iter().any(|d|
            d.pos == (nxu, nyu) && !door_is_open(d, player, &level.monsters));
        if door_closed { continue; }
        let d = (nx - px).abs().max((ny - py).abs());
        if d > best_dist {
            best_dist = d;
            best = (nxu, nyu);
        }
    }
    best
}

/// Speed at which enemy bullets travel on-screen. Damage is already
/// resolved; the tracer is purely for "you can see the shot".
const ENEMY_BULLET_SPEED: f32 = 45.0;
/// Warm red tracer color for enemy rounds so they read distinctly
/// against the player's warm yellow.
fn enemy_tracer_color() -> Color { Color::new(1.0, 0.45, 0.35, 1.0) }

/// Resolve the Station Master's signature behavior for one turn.
/// Handles the 50% HP phase transition (latches `phase2`), executes
/// any telegraphed Ion Sweep queued from the previous turn, telegraphs
/// a new one every 5 actions, and attempts a mutated-attendant summon
/// every 3 actions (cap: 2 active minions).
///
/// Returns `true` when the turn is consumed by a signature move
/// (sweep fire or telegraph) — the caller should skip the normal
/// attack / chase step. Summon attempts and the phase flip don't
/// count, so the boss still gets to shoot on those beats.
fn resolve_boss_turn(
    level: &mut Level,
    idx: usize,
    player: (usize, usize),
    log: &mut Vec<LogLine>,
    now: f64,
) -> bool {
    let (px, py) = player;
    let max_hp = level.monsters[idx].kind.stats_at_level(level.num).max_hp;
    if !level.monsters[idx].phase2 && level.monsters[idx].hp * 2 <= max_hp {
        level.monsters[idx].phase2 = true;
        add_log(log,
            "The Station Master's casing splits, exposing a seething core.",
            now);
    }

    // Execute a previously-telegraphed Ion Sweep. Cross of
    // ElectricalHazard tiles: center + 4 cardinal neighbors. Walls
    // are skipped silently; if the player's standing on one of the
    // placed tiles, the existing hazard-entry pipeline handles the
    // shock+stun on their next step.
    if let Some((sx, sy)) = level.monsters[idx].telegraphed_sweep.take() {
        let cross = [(0i32,0i32), (1,0), (-1,0), (0,1), (0,-1)];
        let mut placed = 0;
        for (dx, dy) in cross {
            let tx = sx as i32 + dx;
            let ty = sy as i32 + dy;
            if !level.map.in_bounds(tx, ty) { continue; }
            let (txu, tyu) = (tx as usize, ty as usize);
            if level.map.tile(txu, tyu) == Tile::Floor {
                level.map.set_tile(txu, tyu, Tile::ElectricalHazard);
                placed += 1;
                // Register the tile so the per-turn tick will
                // revert it back to Floor after a few turns.
                // Refresh the timer if a previous sweep already
                // hit this tile - the player shouldn't be punished
                // by overlapping sweeps eating each other's
                // expirations.
                let pos = (txu, tyu);
                if let Some(existing) = level.expiring_hazards.iter_mut()
                    .find(|h| h.pos == pos)
                {
                    existing.turns_remaining = ION_SWEEP_LIFETIME;
                } else {
                    level.expiring_hazards.push(ExpiringHazard {
                        pos,
                        turns_remaining: ION_SWEEP_LIFETIME,
                        restore: Tile::Floor,
                    });
                }
            }
        }
        if placed > 0 {
            add_log(log,
                "Ion Sweep! A cross of arcing electricity slams into the deck.",
                now);
        }
        return true;
    }

    // Signature cadence: Ion Sweep telegraph every 5 actions takes
    // priority; summons every 3 actions slip in otherwise.
    let acts = level.monsters[idx].actions;
    if acts >= 5 && acts % 5 == 0 {
        level.monsters[idx].telegraphed_sweep = Some(player);
        add_log(log,
            "Sparks gather around the Station Master's eye. Something's coming.",
            now);
        return true;
    }
    if acts >= 3 && acts % 3 == 0 {
        // Cap at 2 simultaneous non-boss minions. Scan the boss's
        // 2×2 footprint border for a free tile.
        let live_non_boss = level.monsters.iter()
            .filter(|m| m.hit_at.is_none()
                   && !matches!(m.kind, creatures::CreatureKind::StationMaster))
            .count();
        if live_non_boss < 2 {
            let (bw, bh) = level.monsters[idx].kind.tile_size();
            let (bx, by) = (level.monsters[idx].x as i32, level.monsters[idx].y as i32);
            let mut spawned: Option<(usize, usize)> = None;
            'scan: for dx in -1..=bw as i32 {
                for dy in -1..=bh as i32 {
                    if dx > 0 && dx < bw as i32 && dy > 0 && dy < bh as i32 { continue; }
                    let tx = bx + dx;
                    let ty = by + dy;
                    if !level.map.in_bounds(tx, ty) { continue; }
                    let (txu, tyu) = (tx as usize, ty as usize);
                    if !level.map.tile(txu, tyu).is_walkable() { continue; }
                    if (txu, tyu) == (px, py) { continue; }
                    let blocked = level.monsters.iter().any(|m|
                        m.hit_at.is_none() && monster_occupies(m, txu, tyu));
                    if blocked { continue; }
                    spawned = Some((txu, tyu));
                    break 'scan;
                }
            }
            if let Some((sx, sy)) = spawned {
                // Summoned minions skip the "spot me first" intro —
                // they drop in already aware of and hostile to the player.
                let mut minion = Monster::new(
                    creatures::CreatureKind::MutantHuman, sx, sy, level.num,
                );
                minion.ai_state = MonsterAiState::Chase;
                minion.last_known_player = Some(player);
                minion.spotted = true;
                level.monsters.push(minion);
                add_log(log,
                    "The Station Master barks a command. A mutated attendant lurches from the shadows.",
                    now);
            }
        }
    }
    false
}

/// Resolve one monster turn for every live monster. Monsters wake up on
/// line-of-sight, then chase the last-known player position, attacking
/// on adjacency.

fn monster_turn(
    level: &mut Level,
    player: (usize, usize),
    player_ac: i32,
    hp: &mut u32,
    last_damage_time: &mut f64,
    log: &mut Vec<LogLine>,
    audio_bank: &AudioBank,
    player_statuses: &mut status::StatusEffectList,
    projectiles: &mut Vec<Projectile>,
    rng: &mut StdRng,
    now: f64,
) {
    let (px, py) = player;
    // Doors close when the player is more than one tile away
    // (Chebyshev) — same rule the renderer + FOV use. Closed doors
    // block monster vision and movement; the player auto-opens them
    // by stepping adjacent. Built once per turn so each monster
    // doesn't re-derive it.
    let closed_doors: Vec<(usize, usize)> = level.doors.iter()
        .filter(|d| !door_is_open(d, player, &level.monsters))
        .map(|d| d.pos)
        .collect();
    for i in 0..level.monsters.len() {
        if level.monsters[i].hit_at.is_some() { continue; }
        // Stun is consumed before any AI work — a stunned monster
        // doesn't transition states, doesn't move, doesn't attack.
        // It still ticks down the duration so it recovers next turn.
        if level.monsters[i].statuses.consume_stun() {
            continue;
        }
        let (mx, my) = (level.monsters[i].x, level.monsters[i].y);

        let monster = &level.monsters[i];
        let stats = monster.kind.stats_at_level(level.num);
        // Distance from the monster's nearest footprint tile to the
        // player — so 2×2 bosses still get correct vision / adjacency.
        let (tw, th) = monster.kind.tile_size();
        let dxa = ((px as i32) - (mx as i32))
            .max(0).max(mx as i32 + tw as i32 - 1 - px as i32);
        let dya = ((py as i32) - (my as i32))
            .max(0).max(my as i32 + th as i32 - 1 - py as i32);

        // ── FSM transition ─────────────────────────────────────────
        // Look for the player first. LOS + vision range determines
        // whether we see the player this turn; combine with the
        // creature's kite distance to pick Chase vs Flee. Idle drops
        // to Alert the moment we spot something, and stays Alert
        // after losing LOS so we keep walking to last_known_player.
        let tmpl = level.monsters[i].kind.template();
        let has_sight = dxa.max(dya) <= stats.vision_range
            && has_los(&level.map, (mx, my), (px, py), &closed_doors);
        if has_sight {
            level.monsters[i].last_known_player = Some((px, py));
            level.monsters[i].turns_without_sight = 0;
        } else {
            // Each turn away from sight ticks toward `memory_length`;
            // when it exceeds the template, the creature drops back
            // to Idle and forgets where the player went.
            level.monsters[i].turns_without_sight =
                level.monsters[i].turns_without_sight.saturating_add(1);
        }
        let prev = level.monsters[i].ai_state;
        let forgot = !has_sight
            && level.monsters[i].turns_without_sight > tmpl.memory_length;
        let new_state = if has_sight {
            let player_close = dxa.max(dya) <= tmpl.kite_distance;
            if stats.ranged_attacker && tmpl.kite_distance > 0 && player_close {
                MonsterAiState::Flee
            } else {
                MonsterAiState::Chase
            }
        } else if prev != MonsterAiState::Idle && !forgot {
            MonsterAiState::Alert
        } else {
            MonsterAiState::Idle
        };
        if forgot {
            // Reset memory so the creature really starts fresh next
            // time it spots the player.
            level.monsters[i].last_known_player = None;
            level.monsters[i].turns_without_sight = 0;
        }
        level.monsters[i].ai_state = new_state;
        if matches!(new_state, MonsterAiState::Idle) { continue; }
        level.monsters[i].actions += 1;

        // Boss (Station Master) signature moves — phase flip, summons,
        // Ion Sweep. Returns `true` when the special consumed the
        // turn and the normal attack/chase step should be skipped.
        if matches!(level.monsters[i].kind, creatures::CreatureKind::StationMaster)
            && resolve_boss_turn(level, i, (px, py), log, now)
        {
            continue;
        }

        // Fleeing creatures skip attacks and path directly away.
        if matches!(new_state, MonsterAiState::Flee) {
            let (fx, fy) = flee_step(&level, i, (px, py));
            if (fx, fy) != (mx, my) {
                level.monsters[i].x = fx;
                level.monsters[i].y = fy;
                level.monsters[i].last_move_at = Some(now);
                play_creature_move_sfx(level.monsters[i].kind, audio_bank, rng);
            }
            continue;
        }

        // Attack: ranged creatures may attack from a distance; melee
        // creatures only adjacent (using footprint-aware adjacency).
        // Alerted-but-no-LOS creatures can't attack regardless.
        let can_attack_now = has_sight && (if stats.ranged_attacker {
            dxa <= 5 && dya <= 5
        } else {
            player_adjacent_to(&level.monsters[i], (px, py))
        });

        if can_attack_now {
            let name = level.monsters[i].kind.name();
            level.monsters[i].last_attack_at = Some(now);
            // Cover: if there's a wall on the player's side facing the
            // monster, bump the target AC by +2 for this roll. Computed
            // per-attack because a moving monster's angle changes.
            let cover = has_cover_from(&level.map, (px, py), (mx, my));
            let effective_ac = if cover { player_ac + COVER_AC_BONUS } else { player_ac };
            // Swarm bonus: count adjacent live kin (8-connected) and
            // add `swarm_attack_bonus` per match. 0 for solo
            // creatures (most), +1 per neighbour-of-the-same-kind
            // for gruboids — encourages the player to break up the
            // pack rather than slug it out at close range.
            let swarm_bonus = if tmpl.swarm_attack_bonus != 0 {
                let kind = level.monsters[i].kind;
                let mut count: i32 = 0;
                for ddy in -1i32..=1 {
                    for ddx in -1i32..=1 {
                        if ddx == 0 && ddy == 0 { continue; }
                        let nx = mx as i32 + ddx;
                        let ny = my as i32 + ddy;
                        if nx < 0 || ny < 0 { continue; }
                        let (nxu, nyu) = (nx as usize, ny as usize);
                        let kin = level.monsters.iter().enumerate().any(|(j, m)|
                            j != i && m.hit_at.is_none() && m.kind == kind
                                && monster_occupies(m, nxu, nyu));
                        if kin { count += 1; }
                    }
                }
                count * tmpl.swarm_attack_bonus
            } else { 0 };
            let roll = rng.gen_range(1..=20) + swarm_bonus;
            let hit = roll >= effective_ac;

            // Visible tracer for ranged attacks — fires whether or not
            // the shot lands, so the player can tell they're being
            // shot at without watching the event log.
            if stats.ranged_attacker {
                // Origin: center of the (possibly multi-tile) monster.
                let (mw, mh) = level.monsters[i].kind.tile_size();
                let origin = vec2(
                    level.monsters[i].x as f32 + mw as f32 * 0.5,
                    level.monsters[i].y as f32 + mh as f32 * 0.5,
                );
                // Target: player's center. On a miss the bullet flies
                // a bit past so it visibly whizzes by.
                let player_center = vec2(px as f32 + 0.5, py as f32 + 0.5);
                let to_player = player_center - origin;
                let dir = to_player.normalize_or_zero();
                let target = if hit {
                    player_center
                } else {
                    // Offset ±1 tile perpendicular to the firing line
                    // so the miss tracer veers past the player rather
                    // than directly through them.
                    let perp = vec2(-dir.y, dir.x);
                    let jitter_sign = if rng.gen_bool(0.5) { 1.0 } else { -1.0 };
                    player_center + dir * 1.5 + perp * jitter_sign * 1.2
                };
                let dist = (target - origin).length().max(0.1);
                projectiles.push(Projectile {
                    pos: origin,
                    vel: dir * ENEMY_BULLET_SPEED,
                    max_dist: dist,
                    traveled: 0.0,
                    color: enemy_tracer_color(),
                });
            }

            if hit {
                // Phase-2 Station Master: damage doubles. Applied only
                // to the attack roll, not any subsequent checks.
                let phased = level.monsters[i].phase2;
                let base_dmg = stats.melee_damage;
                let dealt = if phased { (base_dmg * 2).max(1) } else { base_dmg };
                hurt_player(hp, dealt as u32, last_damage_time, audio_bank, rng, now);
                let key = if stats.ranged_attacker {
                    "log.combat.monster_hit_ranged"
                } else {
                    "log.combat.monster_hit_melee"
                };
                add_log(log, tr_fmt!(key, name, dealt), now);
                // On-hit status rider (e.g. Beetle poison, Spore
                // radiation). Applied only on a successful hit, so
                // missing still ties to AC as normal.
                if let Some((kind, turns)) = tmpl.on_hit_status {
                    player_statuses.add(kind, turns);
                    add_log(log, tr_fmt!("log.status.applied", kind.name()), now);
                }
            } else {
                let key = if stats.ranged_attacker {
                    "log.combat.monster_miss_ranged"
                } else {
                    "log.combat.monster_miss_melee"
                };
                add_log(log, tr_fmt!(key, name), now);
            }
            continue;
        }

        // Large monsters (footprint > 1×1) don't move yet — the
        // pathfinder is single-tile aware. Bosses stay put and rely
        // on ranged attacks / signature moves.
        if (tw, th) != (1, 1) { continue; }

        // Chase. BFS from monster to last-known player, treating other
        // live monsters and the player as blockers.
        let goal = level.monsters[i].last_known_player.unwrap_or((px, py));
        let path = {
            let monsters = &level.monsters;
            let props_ref = &level.props;
            let doors_ref = &closed_doors;
            find_path(&level.map, (mx, my), goal, |x, y| {
                (x == px && y == py)
                || monsters.iter().enumerate().any(|(j, m)|
                    j != i && m.hit_at.is_none() && monster_occupies(m, x, y))
                || props_ref.iter().any(|p| p.blocks(x, y))
                || doors_ref.iter().any(|&p| p == (x, y))
            })
        };
        if let Some(&next) = path.first() {
            let (nx, ny) = next;
            if (nx, ny) != (px, py)
                && !level.monsters.iter().enumerate().any(|(j, m)|
                    j != i && m.hit_at.is_none() && monster_occupies(m, nx, ny))
                && !level.props.iter().any(|p| p.blocks(nx, ny))
                && !closed_doors.iter().any(|&p| p == (nx, ny))
            {
                level.monsters[i].x = nx;
                level.monsters[i].y = ny;
                level.monsters[i].last_move_at = Some(now);
                play_creature_move_sfx(level.monsters[i].kind, audio_bank, rng);
            }
        }
    }
}

#[macroquad::main(window_conf)]
async fn main() {
    let args: Vec<String> = std::env::args().collect();
    // `--test` spawns the Station Master in the player's starting
    // room on floor 1 for sprite / AI testing without having to play
    // through five floors.
    let test_mode = args.iter().any(|a| a == "--test");
    // First non-flag arg is the seed. Anything prefixed with `--` is
    // reserved for future flags.
    let seed_arg = args.iter().skip(1)
        .find(|a| !a.starts_with("--"))
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(42);
    // Seed evolves across runs so each restart gets a different layout.
    let mut run_seed = seed_arg;
    // Open the telemetry log for this run. `init` is idempotent —
    // calling it again on death-restart (with a fresh seed) is a
    // no-op; the file already on disk keeps being appended to.
    // Set ECDYSIUM_TELEMETRY=off in the env to disable.
    telemetry::init(run_seed);
    telemetry::emit("run_open", serde_json::json!({
        "test_mode": test_mode,
    }));
    // Active keyboard bindings. Every gameplay key check goes
    // through `bindings.pressed(...)` / `bindings.down(...)` so the
    // pause-menu Keybindings entry can later remap inputs without
    // touching gameplay code. See `src/input.rs`.
    let bindings = input::Bindings::default_keyboard();
    let mut rng = StdRng::seed_from_u64(run_seed);

    // Mask is baked at the *current* radii so its gradient lines up
    // with what's actually being drawn this frame. We rebake it
    // whenever the radii change (see `last_vision_radii` below) —
    // cheap (a single 512×512 image) and only fires on equipment /
    // class changes, not per frame.
    let mut sprites = Sprites::build(BASE_BRIGHT_RADIUS, BASE_DIM_RADIUS).await;
    let audio_bank = AudioBank::load().await;

    // Build the opening level up-front so Intro has a world ready to go.
    let mut level = levelgen::generate_level(&mut rng, 1);
    levelgen::place_hazards(&mut level, &mut rng);
    // Zones the player has visited and walked away from. Keyed by
    // `Level::num`; populated when the player crosses an east /
    // west zone door, drained when they walk back. Persisting the
    // full `Level` lets a player retreat through the west door,
    // re-find the corridor they fled, and pick up where they left
    // off (kills stay dead, items stay looted, etc.). Cleared on
    // run-restart so a new survivor explores a fresh ship.
    let mut visited_levels: std::collections::HashMap<u8, Level> =
        std::collections::HashMap::new();
    if test_mode {
        spawn_test_boss(&mut level);
    }
    let mut px = level.spawn.0;
    let mut py = level.spawn.1;
    let mut hp: u32 = MAX_HP;
    // `hp_max` is the player's actual cap — class bonuses adjust it at
    // class-select time. Used everywhere we used to reference `MAX_HP`
    // for current-run logic, and drives how many bar sections render.
    let mut hp_max: u32 = MAX_HP;
    // Player's current armor class. Attacks against the player must
    // roll `d20 ≥ player_ac` to hit. Base 10 (naked); equipping any
    // item with `ac_bonus > 0` raises this until it's unequipped.
    let mut player_ac: i32 = BASE_ARMOR_CLASS;
    // The player's equipment — one slot per `EquipSlot` variant.
    // Replaces the old per-feature `equipped_body` / `equipped_weapon`
    // bools. WeaponKind is recovered from `RightHand` when the inv
    // / fire code asks for the wielded weapon.
    let mut equipment = PlayerEquipment::default();
    let mut last_damage_time: f64 = f64::NEG_INFINITY;
    let mut last_fire_time: Option<f64> = None;
    let mut last_move_time: f64 = f64::NEG_INFINITY;
    let mut last_path_step: f64 = f64::NEG_INFINITY;
    let mut facing_right = true;
    // Last cardinal step direction the player took, in `(dx, dy)`.
    // Used by directional verbs that need a "facing" — currently
    // `Action::Kick`. Defaults to east so the very first kick after
    // spawn has a sensible target. Updated on every successful step
    // (movement or bump).
    let mut facing_dir: (i32, i32) = (1, 0);
    let mut move_path: Vec<(usize, usize)> = Vec::new();
    let mut projectiles: Vec<Projectile> = Vec::new();
    let mut log: Vec<LogLine> = Vec::new();
    let mut inventory = Inventory::default();
    let mut show_inventory = false;
    let mut show_equipment = false;
    // Crafting screen state. `show_crafting` toggles the screen;
    // `crafting_focus` zooms into a recipe's detail view; the
    // quantity tuple `(current, max)` activates the modal "how many
    // to craft?" prompt over the detail view. All three peel back
    // through Esc, mirroring the inventory / equipment / loot pattern.
    let mut show_crafting = false;
    let mut crafting_focus: Option<usize> = None;
    let mut crafting_quantity: Option<(u32, u32)> = None;
    let mut crafting_scroll: f32 = 0.0;
    // Pause / system menu — sits at the same overlay level as the
    // inventory / equipment screens. Esc with no other overlay open
    // pops it up; selecting "Quit to Desktop" is the only path out
    // of the main loop. Keeps Q (and stray Esc) from closing the
    // whole game by accident.
    let mut show_pause_menu = false;
    let mut pause_selection: usize = 0;
    // Save-name text-entry overlay state. Activated from the pause
    // menu's "Save Game" option. The overlay collects a slot name
    // (with a sequential `save_NNN` default pre-filled), then the
    // commit handler writes the snapshot and clears the prompt.
    let mut show_save_prompt = false;
    let mut save_name_input: String = String::new();
    let mut save_name_cursor: usize = 0;
    // Load-slot picker overlay state. Lists every save in
    // `saves/`, most recent first. Selectable with up/down,
    // committed with Enter, dismissed with Esc.
    let mut show_load_picker = false;
    let mut load_slots: Vec<save::SaveSlot> = Vec::new();
    let mut load_selection: usize = 0;
    // Equipment screen sub-state. `None` → slot list view; `Some(slot)`
    // means the player has zoomed into a single slot (Examine /
    // Unequip when filled, item-pick list when empty). `examining`
    // toggles the description sub-screen for whatever's in `focus`.
    let mut equip_focus: Option<items::EquipSlot> = None;
    let mut equip_examining: bool = false;
    // Pixel scroll offset for the equipment screen — same shape as
    // `inv_scroll`. Reset to 0 whenever the focus changes so each
    // view starts at the top.
    let mut equip_scroll: f32 = 0.0;
    // Categories the player has collapsed in the inventory panel.
    // Keyed by ItemCategory so the renderer never has to know how
    // many categories exist — adding a new one just means it's
    // expanded by default until the player toggles it.
    let mut inv_collapsed: std::collections::HashSet<ItemCategory> =
        std::collections::HashSet::new();
    // Pixel offset into the scrolled inventory content. Clamped each
    // frame by `draw_inventory`.
    let mut inv_scroll: f32 = 0.0;
    // Per-entry action prompt — `EntryPrompt` is defined at module
    // scope so the helpers (`resolve_prop_interact`) and the inline
    // input handlers can share the same type. Used by both the
    // inventory and the loot screen; only the *context*
    // (Inventory vs Loot) differs at draw time.
    let mut pending_item_prompt: Option<EntryPrompt> = None;
    // Loot screen state. `Some(prop_idx)` means the loot overlay is
    // open and showing `level.props[prop_idx].contents`. Independent
    // of the inventory screen — the loot overlay layers over the
    // dungeon view directly (player can have inventory closed and
    // still be looting).
    let mut looting: Option<usize> = None;
    let mut loot_scroll: f32 = 0.0;
    let mut pending_loot_prompt: Option<EntryPrompt> = None;
    // Interact direction prompt. `Some(opts)` means the player just
    // pressed E with multiple interactable props adjacent — the
    // next direction key (arrow / numpad) picks which one. Each
    // entry is `(prop_idx, (dx, dy))`. While pending, all other
    // input is suppressed; Esc cancels.
    let mut pending_interact_dir: Option<Vec<(InteractTarget, (i32, i32))>> = None;
    // Live aim overlay state. `Some` means the player has pressed
    // F or T and is steering a target cursor; `None` is the default
    // "no aim active" gameplay state. While active, the standard
    // movement / interact / wait input gates are suppressed via
    // `overlay_open_now`, and the arrow / Tab / Enter / Esc keys
    // belong to the aim-mode handler instead.
    let mut aim: Option<AimState> = None;
    // Movement KeyCodes that are currently held but were also held at
    // the moment an overlay closed — we ignore them until they're
    // released once, so the keypress that closed the overlay doesn't
    // also spurn a character step.
    let mut input_suppressed: Vec<KeyCode> = Vec::new();
    // Last frame's `show_inventory` value, for detecting close events.
    let mut was_inventory_open = false;
    let mut player_statuses = status::StatusEffectList::default();
    // Initial lightmap is computed with no class picked yet — base
    // radii. Gets recomputed at class-confirm and on every move.
    let mut lightmap = recompute_lightmap(&level.map, (px, py), None, &equipment, &level.doors, &level.monsters);
    // Track the radii baked into `sprites.light_mask`. When this
    // tuple drifts from the live `vision_radii(...)`, we rebake.
    let mut last_vision_radii = vision_radii(None, &equipment);
    // Items the player has already laid eyes on this floor; tracked
    // so Engineering's Schematic Sense gets "You spot a MedKit." on
    // first sight without the log spamming every frame the item is
    // visible. Re-cleared per descent so deeper floors trigger the
    // same log fresh.
    let mut spotted_items: std::collections::HashSet<(usize, usize)> = std::collections::HashSet::new();
    let mut last_lightmap_pos = (px, py);
    // Security Combat Stims — both durations are in TURNS (player
    // actions), not seconds. Ready when both are 0; active when
    // `turns_left > 0`; cooling down otherwise.
    let mut combat_stims_turns_left:     u32 = 0;
    let mut combat_stims_cooldown_turns: u32 = 0;
    // Passive HP regeneration counter — ticks once per turn taken,
    // grants +1 HP when it hits `PASSIVE_HEAL_TURNS` and resets.
    // Lets the player recover without having to spend rare healing
    // items on every chip-damage encounter.
    let mut turns_since_passive_heal: u32 = 0;
    // Last tile the player triggered a hazard on. Cleared on stepping
    // off the hazard; used so hazards fire once-per-entry instead of
    // every frame while standing still.
    let mut last_hazard_trigger_pos: Option<(usize, usize)> = None;
    add_log(&mut log, tr_fmt!("log.spawn.awaken", level.num), 0.0);

    let mut t_up    = HoldTimer::default();
    let mut t_down  = HoldTimer::default();
    let mut t_left  = HoldTimer::default();
    let mut t_right = HoldTimer::default();

    let mut player_class: Option<classes::PlayerClass> = None;
    let mut class_selection_index: usize = 0;
    let class_options = [
        classes::PlayerClass::Engineering,
        classes::PlayerClass::Security,
        classes::PlayerClass::Science,
        classes::PlayerClass::Medical,
    ];

    // Player attributes — six 3d6 rolls. Initial value is rolled
    // up-front so the RollStats screen has something to display
    // before the first re-roll keypress.
    let mut player_stats = attributes::Attributes::roll_3d6(&mut rng);

    let mut xp: u32 = 0;
    // Player combat level (from XP). NOTE: distinct from `level.num`
    // (the dungeon floor number) — don't shadow the Level binding.
    let mut player_level: u8 = 1;

    // Launch order: Intro splash → RollStats → ClassSelect → Playing.
    // On death the run loops back to RollStats so the survivor rolls
    // a fresh statline; the Intro splash plays exactly once per
    // program launch.
    let mut phase = Phase::Title;
    // Title-screen state. Two options: New Game / Load Game; the
    // Load Game arm just opens the load-slot picker, so the title
    // doesn't need its own picker UI — it shares the pause-menu's.
    let mut title_selection: usize = 0;

    loop {
        let now = get_time();
        let dt = get_frame_time();

        // Globally actionable controls — apply in every phase. Esc
        // peels back one layer of overlay state at a time:
        //   - description sub-screen on equipment slot zoom
        //   - equipment slot zoom (back to slot list)
        //   - pending use/equip confirm prompt
        //   - any open overlay (closes it)
        //   - bare Esc with nothing else open quits the game
        // `overlay_open` / `confirm_open` were used to gate the
        // Q-quit shortcut, which we removed (a stray Q press could
        // end a run without warning). Quit now lives behind the
        // pause menu's explicit option, and the per-overlay Esc
        // cascade below handles the layered close-out — so neither
        // local is needed here anymore.
        if bindings.pressed(input::Action::Cancel) {
            if aim.is_some() {
                // Aim cancel peels back before the pause-menu fall-
                // through fires — Esc on an open aim overlay just
                // lowers the weapon, no turn taken, no menu pop.
                aim = None;
                add_log(&mut log, i18n::tr("log.aim.cancelled"), now);
            } else if pending_interact_dir.is_some() {
                pending_interact_dir = None;
            } else if crafting_quantity.is_some() {
                crafting_quantity = None;
            } else if pending_loot_prompt.is_some() {
                pending_loot_prompt = None;
            } else if pending_item_prompt.is_some() {
                pending_item_prompt = None;
            } else if show_equipment && equip_examining {
                equip_examining = false;
            } else if show_equipment && equip_focus.is_some() {
                equip_focus = None;
                equip_scroll = 0.0;
            } else if show_crafting && crafting_focus.is_some() {
                crafting_focus = None;
            } else if looting.is_some() {
                looting = None;
                loot_scroll = 0.0;
            } else if show_pause_menu {
                // Esc on the pause menu = resume.
                show_pause_menu = false;
            } else if show_inventory || show_equipment || show_crafting {
                show_inventory = false;
                show_equipment = false;
                show_crafting = false;
                crafting_focus = None;
                crafting_quantity = None;
                equip_focus = None;
                equip_examining = false;
                equip_scroll = 0.0;
            } else if matches!(phase, Phase::Playing) {
                // Bare Esc with nothing else open — open the pause
                // menu instead of quitting outright. Quit-to-desktop
                // is gated behind the menu's explicit option so a
                // stray Esc doesn't cost the player their run.
                show_pause_menu = true;
                pause_selection = 0;
            }
            // Other phases (Intro, RollStats, ClassSelect, GameOver)
            // ignore bare Esc here — they have their own input flow.
        }

        // ── Char-buffer hygiene ─────────────────────────────────────
        //
        // macroquad's `get_char_pressed` queue persists chars across
        // frames until they're drained. The save-name overlay is
        // the only thing that actually wants typed characters; if
        // any other phase / overlay leaves them in the queue,
        // they'll bleed into the save name the next time the prompt
        // opens (e.g. "save_001" arriving with "asdfghjkl" already
        // typed during gameplay grafted onto the end). Drain every
        // frame the prompt isn't active so the queue is always
        // empty when it does open.
        if !show_save_prompt {
            while get_char_pressed().is_some() {}
        }

        // ── Load-slot picker overlay (phase-agnostic) ───────────────
        //
        // The Load Game flow can fire from two places: the title
        // screen and the in-game pause menu. Putting the picker
        // input + draw BEFORE the phase match means both entry
        // points share the same handler, and the picker renders
        // on top of whichever phase is underneath (title art or
        // dungeon).
        if show_load_picker {
            let n = load_slots.len();
            if n > 0 {
                if bindings.pressed(input::Action::Up) {
                    load_selection = (load_selection + n - 1) % n;
                }
                if bindings.pressed(input::Action::Down) {
                    load_selection = (load_selection + 1) % n;
                }
            }
            if bindings.pressed(input::Action::Cancel) {
                show_load_picker = false;
            } else if bindings.pressed(input::Action::Confirm) && n > 0 {
                let slot = &load_slots[load_selection];
                telemetry::emit("load_attempt", serde_json::json!({
                    "slot": slot.name.clone(),
                }));
                match save::load_from_path(&slot.path) {
                    Ok(snap) => {
                        // Apply the snapshot. Every assignment
                        // here mirrors a field on `RunSnapshot`;
                        // adding a new persistent field means
                        // updating both the capture site (Save
                        // overlay below) and this apply block.
                        run_seed = snap.seed;
                        rng = StdRng::seed_from_u64(snap.resume_seed);
                        level = snap.active_level;
                        visited_levels.clear();
                        for (k, v) in snap.visited_levels {
                            visited_levels.insert(k, v);
                        }
                        let (sx, sy) = snap.player_pos;
                        if level.map.in_bounds(sx as i32, sy as i32)
                            && level.map.tile(sx, sy).is_walkable()
                        {
                            px = sx; py = sy;
                        } else {
                            // Saved tile no longer walkable - rare
                            // safety hatch. Drop on level.spawn so
                            // the player isn't stuck inside a wall.
                            px = level.spawn.0; py = level.spawn.1;
                        }
                        hp_max = snap.hp_max;
                        hp = snap.hp.min(hp_max);
                        player_ac = snap.ac;
                        xp = snap.xp;
                        player_level = snap.player_level;
                        player_class = snap.class;
                        player_stats = snap.attributes;
                        combat_stims_turns_left = snap.combat_stims_turns_left;
                        combat_stims_cooldown_turns = snap.combat_stims_cooldown_turns;
                        turns_since_passive_heal = snap.turns_since_passive_heal;
                        facing_dir = snap.facing_dir;
                        facing_right = snap.facing_right;
                        inventory = snap.inventory;
                        equipment = snap.equipment;
                        player_statuses = snap.player_statuses;
                        // Reset purely transient run-state that
                        // doesn't ride in the snapshot.
                        move_path.clear();
                        projectiles.clear();
                        last_hazard_trigger_pos = None;
                        spotted_items.clear();
                        looting = None;
                        pending_loot_prompt = None;
                        pending_interact_dir = None;
                        loot_scroll = 0.0;
                        last_damage_time = f64::NEG_INFINITY;
                        log.clear();
                        show_pause_menu = false;
                        lightmap = recompute_lightmap(
                            &level.map, (px, py),
                            player_class, &equipment,
                            &level.doors, &level.monsters,
                        );
                        last_lightmap_pos = (px, py);
                        add_log(&mut log,
                            tr_fmt!("log.load.success", slot.name, level.num),
                            now);
                        phase = Phase::Playing;
                        show_load_picker = false;
                    }
                    Err(e) => {
                        add_log(&mut log,
                            tr_fmt!("log.load.failure", e), now);
                        show_load_picker = false;
                    }
                }
            }
            let view: Vec<(String, Option<std::time::SystemTime>)> = load_slots.iter()
                .map(|s| (s.name.clone(), s.modified))
                .collect();
            ui::draw_load_picker(&view, load_selection);
            next_frame().await;
            continue;
        }

        match phase {
            Phase::ClassSelect => {
                show_mouse(true);
                // Arrow keys select class; Enter/Space/Click confirm.
                if bindings.pressed(input::Action::Up) {
                    class_selection_index = (class_selection_index + class_options.len() - 1) % class_options.len();
                }
                if bindings.pressed(input::Action::Down) {
                    class_selection_index = (class_selection_index + 1) % class_options.len();
                }
                if bindings.pressed(input::Action::Confirm)
                    || is_mouse_button_pressed(MouseButton::Left)
                {
                    player_class = Some(class_options[class_selection_index]);
                    // Apply class bonuses to starting inventory
                    let selected_class = class_options[class_selection_index];
                    for item in selected_class.starting_items() {
                        inventory.add(item, 1);
                    }
                    // Adjust max HP and starting HP by the class bonus.
                    let hp_bonus = selected_class.hp_bonus();
                    hp_max = ((MAX_HP as i32 + hp_bonus).max(1)) as u32;
                    hp = hp_max;
                    // ClassSelect always leads straight into the dungeon
                    // — the splash precedes ClassSelect, not follows it.
                    phase = Phase::Playing;
                }
                clear_background(Color::from_rgba(15, 20, 30, 255));
                ui::draw_class_select(&class_options, class_selection_index);
                next_frame().await;
                continue;
            }
            Phase::Title => {
                show_mouse(true);
                // The load-picker overlay is drawn on top of the
                // title art, so we keep title input gated behind
                // "no overlay open" the same way the pause menu
                // gates its own input.
                let overlay_blocking = show_load_picker;
                let nav_up = !overlay_blocking
                    && (bindings.pressed(input::Action::Up));
                let nav_dn = !overlay_blocking
                    && (bindings.pressed(input::Action::Down));
                let n = ui::TITLE_OPTIONS.len();
                if nav_up { title_selection = (title_selection + n - 1) % n; }
                if nav_dn { title_selection = (title_selection + 1) % n; }
                let confirm = !overlay_blocking
                    && (bindings.pressed(input::Action::Confirm)
                        || is_mouse_button_pressed(MouseButton::Left));
                if confirm {
                    match ui::TITLE_OPTIONS[title_selection] {
                        "title.option.new_game" => phase = Phase::Intro,
                        "title.option.load_game" => {
                            load_slots = save::list_save_slots();
                            load_selection = 0;
                            show_load_picker = true;
                        }
                        "title.option.quit_to_desktop" => break,
                        _ => {}
                    }
                }
                ui::draw_title(title_selection);
                next_frame().await;
                continue;
            }
            Phase::Intro => {
                show_mouse(true);
                // Any key or click advances to the stats roller. Intro
                // runs exactly once per program launch — death goes
                // back to the Title screen, not here.
                if get_last_key_pressed().is_some()
                    || is_mouse_button_pressed(MouseButton::Left)
                    || is_mouse_button_pressed(MouseButton::Right)
                {
                    phase = Phase::RollStats;
                }
                ui::draw_intro();
                next_frame().await;
                continue;
            }
            Phase::RollStats => {
                show_mouse(true);
                // R / Space → re-roll a fresh 3d6 set. Enter / Click →
                // confirm and advance to ClassSelect. Other keys are
                // ignored so a stray press doesn't accidentally skip
                // past the stats screen.
                let confirm = bindings.pressed(input::Action::Confirm)
                    || is_mouse_button_pressed(MouseButton::Left);
                let reroll = bindings.pressed(input::Action::Reroll);
                if reroll {
                    player_stats = attributes::Attributes::roll_3d6(&mut rng);
                } else if confirm {
                    phase = Phase::ClassSelect;
                }
                ui::draw_roll_stats(&player_stats);
                next_frame().await;
                continue;
            }
            Phase::GameOver => {
                show_mouse(true);
                if get_last_key_pressed().is_some()
                    || is_mouse_button_pressed(MouseButton::Left)
                    || is_mouse_button_pressed(MouseButton::Right)
                {
                    // New run: roll a fresh layout, full heal, clear log.
                    run_seed = run_seed.wrapping_add(1);
                    rng = StdRng::seed_from_u64(run_seed);
                    visited_levels.clear();
                    level = levelgen::generate_level(&mut rng, 1);
                    levelgen::place_hazards(&mut level, &mut rng);
                    px = level.spawn.0; py = level.spawn.1;
                    // hp_max will be re-applied when the player picks a
                    // class; reset to base here so the HUD doesn't show
                    // stale bonus sections during ClassSelect.
                    hp_max = MAX_HP;
                    hp = hp_max;
                    player_ac = BASE_ARMOR_CLASS;
                    move_path.clear();
                    projectiles.clear();
                    log.clear();
                    inventory = Inventory::default();
                    show_inventory = false;
                    show_equipment = false;
                    inv_collapsed.clear();
                    inv_scroll = 0.0;
                    pending_item_prompt = None;
                    input_suppressed.clear();
                    was_inventory_open = false;
                    last_hazard_trigger_pos = None;
                    equipment.clear();
                    combat_stims_turns_left = 0;
                    combat_stims_cooldown_turns = 0;
                    last_damage_time = f64::NEG_INFINITY;
                    last_fire_time = None;
                    last_move_time = f64::NEG_INFINITY;
                    player_statuses.clear();
                    xp = 0;
                    player_level = 1;
                    spotted_items.clear();
                    looting = None;
                    pending_loot_prompt = None;
                    pending_interact_dir = None;
                    loot_scroll = 0.0;
                    show_crafting = false;
                    crafting_focus = None;
                    crafting_quantity = None;
                    crafting_scroll = 0.0;
                    show_pause_menu = false;
                    pause_selection = 0;
                    turns_since_passive_heal = 0;
                    lightmap = recompute_lightmap(&level.map, (px, py), player_class, &equipment, &level.doors, &level.monsters);
                    last_lightmap_pos = (px, py);
                    add_log(&mut log, tr_fmt!("log.spawn.fresh", level.num), now);
                    player_class = None;
                    class_selection_index = 0;
                    // Roll a fresh statline for the new survivor; the
                    // RollStats screen lets the player re-roll before
                    // committing to a department.
                    player_stats = attributes::Attributes::roll_3d6(&mut rng);
                    // Back to Title so the player can choose New
                    // Game or Load Game after a death rather than
                    // being railroaded into rolling new stats.
                    title_selection = 0;
                    phase = Phase::Title;
                }
                ui::draw_game_over(level.num, &log);
                next_frame().await;
                continue;
            }
            Phase::Playing => { /* fall through */ }
        }

        // ── Playing-phase save-name overlay ─────────────────────────
        // The save-name prompt only ever opens from the in-game
        // pause menu, so it lives inside the Playing-phase code
        // path. (Title can't get here.) The load picker is more
        // global and was hoisted above the phase match — see the
        // pre-match overlay handler.
        if show_save_prompt {
            // Drain every char that arrived since the previous
            // frame. Macroquad buffers them, returning one per call
            // until None.
            while let Some(ch) = get_char_pressed() {
                // Filter to the same character set the slot-name
                // sanitizer keeps; rejecting at type-time gives the
                // player a cleaner experience than silently
                // mangling on save.
                if ch.is_control() { continue; }
                if !(ch.is_alphanumeric() || ch == ' ' || ch == '-' || ch == '_') { continue; }
                if save_name_input.chars().count() >= 48 { continue; }
                let byte_idx: usize = save_name_input.char_indices()
                    .nth(save_name_cursor)
                    .map(|(i, _)| i)
                    .unwrap_or(save_name_input.len());
                save_name_input.insert(byte_idx, ch);
                save_name_cursor += 1;
            }
            if bindings.pressed(input::Action::DeleteChar) && save_name_cursor > 0 {
                let prev = save_name_cursor - 1;
                let byte_idx = save_name_input.char_indices()
                    .nth(prev)
                    .map(|(i, _)| i)
                    .unwrap_or(0);
                save_name_input.remove(byte_idx);
                save_name_cursor = prev;
            }
            if bindings.pressed(input::Action::Cancel) {
                show_save_prompt = false;
            } else if bindings.pressed(input::Action::Confirm) {
                // Capture the snapshot. `resume_seed` is rolled
                // off the live RNG so a load + replay produces an
                // identical post-load stream every time.
                let resume_seed = rng.r#gen::<u64>();
                let snap = save::RunSnapshot {
                    seed: run_seed,
                    resume_seed,
                    current_floor: level.num,
                    player_pos: (px, py),
                    hp,
                    hp_max,
                    ac: player_ac,
                    xp,
                    player_level,
                    class: player_class,
                    attributes: player_stats,
                    combat_stims_turns_left,
                    combat_stims_cooldown_turns,
                    turns_since_passive_heal,
                    facing_dir,
                    facing_right,
                    inventory: inventory.clone(),
                    equipment: equipment.clone(),
                    player_statuses: player_statuses.clone(),
                    active_level: level.clone(),
                    visited_levels: visited_levels.iter()
                        .map(|(k, v)| (*k, v.clone()))
                        .collect(),
                };
                let path = save::slot_path(&save_name_input);
                telemetry::emit("save_attempt", serde_json::json!({
                    "slot": save_name_input.clone(),
                    "floor": level.num,
                }));
                match save::save_to_path(&snap, &path) {
                    Ok(()) => add_log(&mut log,
                        tr_fmt!("log.save.success", path.display()),
                        now),
                    Err(e) => add_log(&mut log,
                        tr_fmt!("log.save.failure", e), now),
                }
                show_save_prompt = false;
            }
            // Draw on top of whatever was on screen this frame
            // (the pause menu / dungeon underneath stays where it
            // was). Then yield without running any other input.
            ui::draw_save_prompt(&save_name_input, save_name_cursor);
            next_frame().await;
            continue;
        }

        // ── Playing phase ─────────────────────────────────────────────

        // Security Combat Stims toggle. Bound to Z (kept off the
        // WASD / hjkl movement cluster). Ready only when both the
        // active and cooldown counters are zero. Ticking happens
        // once per player action, down in the post-turn bookkeeping.
        if player_class == Some(classes::PlayerClass::Security)
            && bindings.pressed(input::Action::SignatureAbility)
            && !show_inventory
            && !show_equipment
        {
            if combat_stims_turns_left > 0 {
                // Manual early-out: player switches it off. Cooldown
                // starts from the full value — no refund for voluntarily
                // cutting it short.
                combat_stims_turns_left = 0;
                combat_stims_cooldown_turns = COMBAT_STIMS_COOLDOWN_TURNS;
                add_log(&mut log, i18n::tr("log.stims.deactivated"), now);
            } else if combat_stims_cooldown_turns == 0 {
                combat_stims_turns_left = COMBAT_STIMS_DURATION_TURNS;
                add_log(&mut log,
                    tr_fmt!("log.stims.activated", COMBAT_STIMS_DURATION_TURNS),
                    now);
            }
        }

        // Snapshot screen-open state **before** the toggle keys
        // (I / C) flip them, so the per-screen letter-input
        // handlers later in the frame can't be triggered by the
        // same keypress that opened the screen. Without this the
        // C-press that opens the crafting screen would also fire
        // the list's letter-c handler (selecting recipe index 2);
        // similarly I would auto-pick the 9th inventory entry.
        // (Tab opens equipment but isn't a letter, so equipment
        // doesn't need the same guard.)
        let inv_was_open = show_inventory;
        let crafting_was_open = show_crafting;

        // UI screen toggles. All three gate on `aim.is_none()` so the
        // aim overlay owns its keys exclusively — Tab in particular
        // collides with `CycleTarget` and `ToggleEquipment`, so we
        // route it to whichever context is active. The aim overlay is
        // exited via Esc or the same F/T key that opened it.
        if aim.is_none() && bindings.pressed(input::Action::ToggleInventory) {
            show_inventory = !show_inventory;
            show_equipment = false;
            show_crafting = false;
            crafting_focus = None;
            crafting_quantity = None;
            // Inventory and loot can't coexist — opening one closes
            // the other so input gates aren't ambiguous.
            looting = None;
            pending_loot_prompt = None;
        }
        if aim.is_none() && bindings.pressed(input::Action::ToggleEquipment) {
            show_equipment = !show_equipment;
            show_inventory = false;
            show_crafting = false;
            crafting_focus = None;
            crafting_quantity = None;
            looting = None;
            pending_loot_prompt = None;
            // Reset zoom + scroll every time the screen reopens so
            // the player sees the slot list fresh from the top.
            equip_focus = None;
            equip_examining = false;
            equip_scroll = 0.0;
        }
        // C: crafting screen. Suppressed whenever **any** screen is
        // already claiming letter-key input — including crafting
        // itself. While crafting is open, the C press belongs to
        // the recipe-list letter handler (selects the recipe at
        // letter index 2) rather than toggling the screen closed.
        // Use Esc to dismiss the crafting screen.
        let letter_screen_open = show_inventory
            || show_equipment
            || looting.is_some()
            || show_crafting;
        if aim.is_none()
            && bindings.pressed(input::Action::ToggleCrafting)
            && pending_item_prompt.is_none()
            && !letter_screen_open
        {
            show_crafting = true;
            show_inventory = false;
            show_equipment = false;
            looting = None;
            pending_loot_prompt = None;
            crafting_focus = None;
            crafting_quantity = None;
            crafting_scroll = 0.0;
        }

        // Recompute after the toggles — an overlay opened this frame
        // should still freeze action handling.
        let overlay_open_now = show_inventory
            || show_equipment
            || looting.is_some()
            || show_crafting
            || show_pause_menu
            || pending_interact_dir.is_some()
            || aim.is_some();

        // Layout pass #1 for input — needed for renderer scaling
        // computations later in the frame. Mouse aiming is gone; the
        // aim overlay drives off keyboard cursor state instead.
        let (tile, ox, oy, _status_h) = compute_layout((px, py));

        // Keyboard-only roguelike now — mouse cursor stays visible on
        // overlay screens (titles, menus) and out of the dungeon
        // viewport during play. No mouse-controlled aim or click-to-
        // move; every gameplay command is bound through `input::Action`.
        show_mouse(overlay_open_now || !matches!(phase, Phase::Playing));

        // Any movement key that was held at the moment an overlay
        // closed is "suppressed" until the player releases it. This
        // prevents the keypress that used an item (e.g. `a`) from also
        // nudging the character sideways one tile the frame after the
        // overlay closes.
        input_suppressed.retain(|&kc| is_key_down(kc));

        // Autorepeat timers — always ticked so state stays coherent, but
        // actions are only considered when no overlay is open. If an
        // overlay IS open, we pass `false` for `down` so the timers
        // reset cleanly while the player is menuing.
        let up    = !overlay_open_now && bindings.down_active(input::Action::Up,    &input_suppressed);
        let down  = !overlay_open_now && bindings.down_active(input::Action::Down,  &input_suppressed);
        let left  = !overlay_open_now && bindings.down_active(input::Action::Left,  &input_suppressed);
        let right = !overlay_open_now && bindings.down_active(input::Action::Right, &input_suppressed);
        let u = t_up   .tick(now, up,    HOLD_DELAY, HOLD_RATE);
        let d = t_down .tick(now, down,  HOLD_DELAY, HOLD_RATE);
        let l = t_left .tick(now, left,  HOLD_DELAY, HOLD_RATE);
        let r = t_right.tick(now, right, HOLD_DELAY, HOLD_RATE);

        // Determine this frame's player action. Manual movement beats
        // click-path, which beats firing, which beats wait. Manual input
        // also cancels any active path. All disabled while an overlay
        // (inventory / status) is open.
        let wait_pressed = !overlay_open_now
            && bindings.pressed(input::Action::Wait);
        // E key: interact with an adjacent prop (locker, cryo tube,
        // terminal). Suppressed while inventory or equipment is up
        // because both screens already bind E to "examine".
        let interact_pressed = !overlay_open_now
            && pending_item_prompt.is_none()
            && bindings.pressed(input::Action::Interact);
        // K key: kick the enemy in the player's facing direction.
        // Suppressed during overlays so K stays free as a letter
        // hotkey for inventory / equipment / loot screens.
        let kick_pressed = !overlay_open_now
            && pending_item_prompt.is_none()
            && bindings.pressed(input::Action::Kick);
        // Z: swap right-hand weapon with the ReadyWeapon stash. One
        // player turn; works with empty slots in either direction so
        // a wielded melee can park itself into Ready cleanly when
        // there's no ranged stashed yet.
        let swap_weapon_pressed = !overlay_open_now
            && pending_item_prompt.is_none()
            && bindings.pressed(input::Action::SwapWeapon);
        // The player can stage a ranged attack so long as some
        // ranged weapon is reachable — either wielded in the right
        // hand, or stashed in the ReadyWeapon slot (where Fire mode
        // will auto-swap it into hand on commit). The cooldown
        // applies regardless of which slot the ranged weapon sits in.
        let ranged_in_hand = equipment.right_hand_weapon()
            .and_then(|w| w.ranged());
        let ranged_in_stash = match equipment.get(items::EquipSlot::ReadyWeapon) {
            Some(ItemKind::Weapon(k)) => k.ranged(),
            _ => None,
        };
        let ranged_available = ranged_in_hand.or(ranged_in_stash);
        let fire_ready = match ranged_available {
            Some(ranged) => last_fire_time.map_or(true, |t| now - t >= ranged.fire_cooldown),
            None => false,
        };
        let has_any_ranged = ranged_available.is_some();
        // F: enter Fire aim mode if a ranged weapon is equipped + ready.
        // Guarded by `overlay_open_now` so the key stays a Focus hotkey
        // inside the crafting screen (same physical key, different
        // context). When already aiming, a second F press commits the
        // shot — handled in the aim-mode input block further down.
        //
        // `aim_just_opened` blocks the open-frame's same key from also
        // committing the shot the moment aim is set up. Cleared at the
        // top of every subsequent frame.
        let mut aim_just_opened = false;
        if !overlay_open_now
            && aim.is_none()
            && bindings.pressed(input::Action::FireAim)
        {
            if !has_any_ranged {
                // No ranged weapon in hand or in the stash — mirror
                // the throw flow's "Nothing assigned" log and skip
                // the aim overlay entirely.
                add_log(&mut log, i18n::tr("log.fire.no_ranged_weapon"), now);
            } else if !fire_ready {
                // Cooldown hasn't passed since the last shot. Don't
                // open the overlay — surfaces the gate to the player
                // explicitly instead of letting them aim at a
                // weapon that can't fire yet.
                add_log(&mut log, i18n::tr("log.fire.cooldown"), now);
            } else {
                let range = ranged_available
                    .map(|r| r.hit_scan_range as i32)
                    .unwrap_or(6);
                aim = Some(open_aim(
                    AimKind::Fire,
                    (px as i32, py as i32),
                    range,
                    0,
                    &level.monsters,
                    &lightmap,
                    level.map.width,
                ));
                aim_just_opened = true;
            }
        }
        // T: enter Throw aim mode if something's assigned to the
        // Throwable slot. Range = item base + thrower's Strength
        // modifier — first attribute-driven mechanic in the game.
        if !overlay_open_now
            && aim.is_none()
            && bindings.pressed(input::Action::ThrowAim)
        {
            if let Some(kind) = equipment.get(items::EquipSlot::Throwable) {
                let t = kind.template();
                let str_mod = attributes::Attributes::modifier(player_stats.strength);
                let reach  = (t.throw_range + str_mod).max(1);
                aim = Some(open_aim(
                    AimKind::Throw,
                    (px as i32, py as i32),
                    reach,
                    t.effect_radius,
                    &level.monsters,
                    &lightmap,
                    level.map.width,
                ));
                aim_just_opened = true;
            } else {
                add_log(&mut log, i18n::tr("log.throw.nothing_assigned"), now);
            }
        }

        // ── Pause menu input ──────────────────────────────────────
        // Up / Down (or W/S) to navigate; Enter or click to confirm.
        // Esc resumes (handled in the global Esc cascade above).
        // Sits before every other screen's input handler — while the
        // pause menu is up, no other screen's keys fire.
        if show_pause_menu {
            let nav_up = bindings.pressed(input::Action::Up);
            let nav_dn = bindings.pressed(input::Action::Down);
            let n = ui::PAUSE_OPTIONS.len();
            if nav_up { pause_selection = (pause_selection + n - 1) % n; }
            if nav_dn { pause_selection = (pause_selection + 1) % n; }
            let confirm = bindings.pressed(input::Action::Confirm)
                || is_mouse_button_pressed(MouseButton::Left);
            if confirm {
                match ui::PAUSE_OPTIONS[pause_selection] {
                    "pause.option.resume" => {
                        show_pause_menu = false;
                    }
                    "pause.option.save" => {
                        // Hand off to the save-name overlay. The
                        // pause menu closes; the prompt overlay
                        // takes over input until the player commits
                        // a name (or Escs out).
                        show_pause_menu = false;
                        save_name_input = save::next_default_save_name();
                        save_name_cursor = save_name_input.len();
                        show_save_prompt = true;
                        // Drain any chars queued THIS frame (e.g.
                        // a character key the player was holding
                        // when they hit Enter on Save Game). The
                        // top-of-loop drain caught earlier frames;
                        // this catches the confirm frame itself.
                        while get_char_pressed().is_some() {}
                    }
                    "pause.option.load" => {
                        // Hand off to the slot-picker overlay.
                        show_pause_menu = false;
                        load_slots = save::list_save_slots();
                        load_selection = 0;
                        show_load_picker = true;
                    }
                    "pause.option.keybindings" => {
                        // TBD: dedicated keybindings sub-screen.
                        // For now log a placeholder and resume.
                        add_log(&mut log,
                            i18n::tr("pause.keybindings.unimplemented"),
                            now);
                        show_pause_menu = false;
                    }
                    "pause.option.quit_to_desktop" => {
                        break;
                    }
                    _ => {}
                }
            }
        }

        // Inventory overlay input: category collapse keys, scroll, and
        // item-use letter keys (letters map to *visible* items only).
        //
        // **Snapshot the prompt state at the top of the frame** so a
        // letter press that *opens* the prompt (block A below) can't
        // also fall through to the prompt's own E-handler (block B)
        // in the same frame. Without the snapshot, pressing the E
        // letter for an item would open its action menu and instantly
        // skip past it into the description view.
        let inv_prompt_was_open = pending_item_prompt.is_some();
        if show_inventory && inv_was_open && !inv_prompt_was_open {
            // Section-collapse hotkeys: number row 1..=9 zipped with
            // ItemCategory::ALL in display order. Categories beyond
            // the 9th aren't reachable by hotkey (mouse / scroll
            // still works); categories that don't yet exist simply
            // don't bind their key.
            for (i, cat) in ItemCategory::ALL.iter().enumerate() {
                if input::digit_pressed(i) {
                    if !inv_collapsed.remove(cat) {
                        inv_collapsed.insert(*cat);
                    }
                }
            }
            let wheel_dy = mouse_wheel().1;
            if wheel_dy != 0.0 {
                inv_scroll -= wheel_dy * 24.0;
            }
            // Inventory rows include a wrapped description; use the
            // taller scroll step so each Up/Down press clears the
            // current entry's whole block.
            let step = ui::inventory_scroll_step();
            if bindings.pressed(input::Action::Up)   { inv_scroll -= step; }
            if bindings.pressed(input::Action::Down) { inv_scroll += step; }

            // Letter keys open the per-item action prompt. Even
            // passive tokens (keycard) get a prompt — Examine is
            // always available, so the popup serves as a "look at
            // this item" lens regardless of what else it can do.
            let visible = visible_item_indices(&inventory, &inv_collapsed);
            for (vi, &entry_idx) in visible.iter().enumerate() {
                if input::letter_pressed(vi) {
                    pending_item_prompt = Some(EntryPrompt {
                        entry_idx,
                        mode: ui::ItemPromptMode::Actions,
                    });
                    break;
                }
            }
        }

        // Item-action prompt: Examine / Use / Equip / Cancel. Runs
        // only while the inventory is open and an entry is pending.
        // Action availability mirrors the item's `useable` /
        // `equippable` flags — keys for unsupported actions are
        // ignored so the player can't "use" a jumpsuit or "equip"
        // a med kit.
        if show_inventory && inv_prompt_was_open {
            let prompt = pending_item_prompt.as_ref().unwrap();
            let idx = prompt.entry_idx;
            let mode = prompt.mode;
            // Examining → any key returns to Actions; Esc cancels
            // (handled at the top of the frame).
            if matches!(mode, ui::ItemPromptMode::Examining) {
                if get_last_key_pressed().is_some() {
                    pending_item_prompt = Some(EntryPrompt { entry_idx: idx, mode: ui::ItemPromptMode::Actions });
                }
            } else if bindings.pressed(input::Action::Interact) {
                // Examine — switch the popup to its description view.
                pending_item_prompt = Some(EntryPrompt { entry_idx: idx, mode: ui::ItemPromptMode::Examining });
            } else if (bindings.pressed(input::Action::Use)
                       || bindings.pressed(input::Action::Equip)
                       || bindings.pressed(input::Action::Ready))
                && idx < inventory.entries.len()
            {
                let want_equip = bindings.pressed(input::Action::Equip);
                let want_use   = bindings.pressed(input::Action::Use);
                let want_ready = bindings.pressed(input::Action::Ready);
                let kind = inventory.entries[idx].kind;
                let template = kind.template();
                let can_ready = template.extra_equip_slots
                    .contains(&items::EquipSlot::ReadyWeapon);
                let mut resolved = true;
                if want_ready && can_ready {
                    // Bypass the primary `equip_slot` and route the
                    // item straight into ReadyWeapon. Same machinery
                    // as the equipment-screen empty-slot pick so the
                    // AC / two-handed / swap-back-into-inventory
                    // bookkeeping all stays consistent.
                    resolved = equipment.equip_from_inventory_into(
                        idx, items::EquipSlot::ReadyWeapon,
                        &mut inventory,
                        &mut player_ac, &mut log, now,
                    );
                } else if want_equip && template.equippable {
                    // Single equip helper handles two-handed, swap-
                    // into-inventory, AC bookkeeping, log lines.
                    resolved = equipment.equip_from_inventory(
                        idx, &mut inventory,
                        &mut player_ac, &mut log, now,
                    );
                    let _ = kind; // referenced below for log/use paths
                } else if want_use && template.useable {
                    match kind.use_effect() {
                        UseEffect::Heal(amount) => {
                            inventory.consume_at(idx);
                            hp = (hp + amount).min(hp_max);
                            // Heal items always carry a use_flavor;
                            // fall back to a generic line if a future
                            // healing kind forgets to set one.
                            let line = kind.use_flavor().unwrap_or("You feel better.");
                            add_log(&mut log, line, now);
                        }
                        UseEffect::None => {
                            resolved = false;
                        }
                    }
                } else {
                    // Action key pressed but the item doesn't support
                    // it (e.g. U on a jumpsuit). Silent no-op — the
                    // popup stays open so the player can pick again.
                    resolved = false;
                }
                if resolved {
                    // The action prompt closes after a successful
                    // use/equip, but the inventory screen itself
                    // stays up — the player decides when to leave
                    // (Esc or `i` toggles it shut).
                    pending_item_prompt = None;
                    monster_turn(
                        &mut level, (px, py), player_ac,
                        &mut hp, &mut last_damage_time,
                        &mut log, &audio_bank, &mut player_statuses,
                        &mut projectiles, &mut rng, now,
                    );
                }
            }
        }

        // ── Loot screen input ────────────────────────────────────
        // Same shape as the inventory: letter keys pick an item;
        // selecting opens an Examine / Take prompt; Esc backs out
        // (handled at the top of the frame). Take moves the chosen
        // item into the player's inventory and removes it from the
        // container. The loot screen stays open until Esc so the
        // player can drain a locker without re-pressing E.
        if let Some(loot_idx) = looting {
            // Snapshot — same trick as the inventory section above:
            // a letter press that opens the loot prompt mustn't also
            // be re-read by the prompt's own E / T / Q handlers in
            // the same frame.
            let loot_prompt_was_open = pending_loot_prompt.is_some();
            if !loot_prompt_was_open {
                let wheel_dy = mouse_wheel().1;
                if wheel_dy != 0.0 { loot_scroll -= wheel_dy * 24.0; }
                // Same row+description shape as the inventory —
                // use the taller scroll step.
                let step = ui::inventory_scroll_step();
                if bindings.pressed(input::Action::Up)   { loot_scroll -= step; }
                if bindings.pressed(input::Action::Down) { loot_scroll += step; }

                let count = level.props.get(loot_idx)
                    .and_then(|p| p.contents.as_ref())
                    .map(|v| v.len())
                    .unwrap_or(0);

                // R: take everything in the container in one shot.
                // Drains contents into inventory, logs a tally, and
                // closes the loot screen.
                if bindings.pressed(input::Action::TakeAll) && count > 0 {
                    if let Some(prop) = level.props.get_mut(loot_idx) {
                        let prop_name = prop.display_name();
                        if let Some(items) = prop.contents.as_mut() {
                            let drained: Vec<ItemKind> = items.drain(..).collect();
                            for kind in &drained {
                                inventory.add(*kind, 1);
                            }
                            add_log(&mut log,
                                tr_fmt!("log.loot.empty_container", prop_name, drained.len()),
                                now);
                        }
                    }
                    looting = None;
                    pending_loot_prompt = None;
                    loot_scroll = 0.0;
                } else {
                    for i in 0..count {
                        if input::letter_pressed(i) {
                            pending_loot_prompt = Some(EntryPrompt {
                                entry_idx: i,
                                mode: ui::ItemPromptMode::Actions,
                            });
                            break;
                        }
                    }
                }
            } else {
                let prompt = pending_loot_prompt.as_ref().unwrap();
                let idx = prompt.entry_idx;
                let mode = prompt.mode;
                if matches!(mode, ui::ItemPromptMode::Examining) {
                    if get_last_key_pressed().is_some() {
                        pending_loot_prompt = Some(EntryPrompt {
                            entry_idx: idx,
                            mode: ui::ItemPromptMode::Actions,
                        });
                    }
                } else if bindings.pressed(input::Action::Interact) {
                    pending_loot_prompt = Some(EntryPrompt {
                        entry_idx: idx,
                        mode: ui::ItemPromptMode::Examining,
                    });
                } else if bindings.pressed(input::Action::TakeAll) {
                    if let Some(prop) = level.props.get_mut(loot_idx) {
                        let prop_name = prop.display_name();
                        if let Some(items) = prop.contents.as_mut() {
                            if idx < items.len() {
                                let kind = items.remove(idx);
                                inventory.add(kind, 1);
                                add_log(&mut log,
                                    tr_fmt!("log.loot.taken", kind.name()),
                                    now);
                                pending_loot_prompt = None;
                                if items.is_empty() {
                                    add_log(&mut log,
                                        tr_fmt!("log.loot.container_empty", prop_name),
                                        now);
                                }
                            }
                        }
                    }
                } else if bindings.pressed(input::Action::Equip) {
                    // Q: take + equip in one step. The item slides
                    // out of the container, lands in the player's
                    // inventory, and equip_from_inventory routes it
                    // into the matching slot (handling two-handed
                    // gates, displaced gear, and AC bookkeeping for
                    // free). No-op if the item isn't equippable.
                    let mut chosen: Option<ItemKind> = None;
                    if let Some(prop) = level.props.get_mut(loot_idx) {
                        if let Some(items) = prop.contents.as_mut() {
                            if idx < items.len()
                                && items[idx].template().equippable
                            {
                                chosen = Some(items.remove(idx));
                            }
                        }
                    }
                    if let Some(kind) = chosen {
                        inventory.add(kind, 1);
                        // Find the freshly-added entry's index. It's
                        // the first entry of that kind (`add` stacks
                        // existing entries, so a same-kind item lives
                        // at the previously-existing index — same
                        // semantics either way: equip *some* of that
                        // kind from inventory).
                        let entry_idx = inventory.entries.iter()
                            .position(|e| e.kind == kind)
                            .unwrap_or(0);
                        let _ = equipment.equip_from_inventory(
                            entry_idx, &mut inventory,
                            &mut player_ac, &mut log, now,
                        );
                        pending_loot_prompt = None;
                        // If the container's now empty, log it and
                        // bail out of loot mode.
                        let empty = level.props.get(loot_idx)
                            .and_then(|p| p.contents.as_ref())
                            .map(|v| v.is_empty())
                            .unwrap_or(true);
                        if empty {
                            if let Some(prop) = level.props.get(loot_idx) {
                                add_log(&mut log,
                                    tr_fmt!("log.loot.container_empty", prop.display_name()),
                                    now);
                            }
                        }
                    }
                }
            }
        }

        // ── Equipment screen input ───────────────────────────────
        // Three states share the screen:
        //   1. Slot list (no focus): a..j picks a slot.
        //   2. Slot zoom (focus set): e=Examine, u=Unequip on a
        //      filled slot; a..z picks a compatible item to equip
        //      on an empty slot.
        //   3. Examining: any key returns to slot zoom.
        if show_equipment {
            // Mouse wheel + arrow scroll — fed through the same
            // `equip_scroll` that `draw_equipment` clamps. Disabled
            // in Examining mode where the description is fixed.
            if !equip_examining {
                let wheel_dy = mouse_wheel().1;
                if wheel_dy != 0.0 { equip_scroll -= wheel_dy * 24.0; }
                let step = ui::overlay_scroll_step();
                if bindings.pressed(input::Action::Up)   { equip_scroll -= step; }
                if bindings.pressed(input::Action::Down) { equip_scroll += step; }
            }

            if equip_examining {
                if get_last_key_pressed().is_some() {
                    equip_examining = false;
                }
            } else if let Some(slot) = equip_focus {
                if equipment.get(slot).is_some() {
                    if bindings.pressed(input::Action::Interact) {
                        equip_examining = true;
                    } else if bindings.pressed(input::Action::Use) {
                        equipment.unequip(slot, &mut inventory,
                            &mut player_ac, &mut log, now);
                        equip_focus = None;
                        equip_scroll = 0.0;
                    }
                } else {
                    // Empty slot — pick a compatible item to equip.
                    // An item is compatible with a slot if it's the
                    // primary `equip_slot` *or* listed in
                    // `extra_equip_slots`. The flow below also
                    // routes a non-primary pick (e.g. a hand lamp
                    // dropped into the right belt) through the
                    // override version of `equip_from_inventory` so
                    // the lamp lands in the belt slot rather than
                    // its default LeftHand.
                    let compatible: Vec<usize> = inventory.entries.iter()
                        .enumerate()
                        .filter(|(_, e)| {
                            let t = e.kind.template();
                            t.equip_slot == Some(slot)
                                || t.extra_equip_slots.contains(&slot)
                        })
                        .map(|(i, _)| i)
                        .collect();
                    for (vi, &entry_idx) in compatible.iter().enumerate() {
                        if input::letter_pressed(vi) {
                            equipment.equip_from_inventory_into(
                                entry_idx, slot, &mut inventory,
                                &mut player_ac, &mut log, now,
                            );
                            equip_focus = None;
                            equip_scroll = 0.0;
                            break;
                        }
                    }
                }
            } else {
                // Slot list — letter selects a slot. Reset scroll so
                // the zoom view starts at the top.
                for (i, &slot) in items::EquipSlot::ALL.iter().enumerate() {
                    if input::letter_pressed(i) {
                        equip_focus = Some(slot);
                        equip_examining = false;
                        equip_scroll = 0.0;
                        break;
                    }
                }
            }
        }

        // ── Crafting screen input ────────────────────────────────
        // Three sub-states (mirror inventory + equipment):
        //   1. List view (`crafting_focus` = None): a..z picks a recipe.
        //   2. Detail view: F opens the quantity prompt; Esc backs out.
        //   3. Quantity prompt: Up/Down adjust, Enter confirms, Esc cancels.
        // Gated on `crafting_was_open` so the C-press that opened
        // the screen this frame doesn't also fire the list's
        // letter-c handler.
        if show_crafting && crafting_was_open {
            // Snapshot mirrors the inventory / loot pattern — a press
            // that opens a sub-state can't be re-read by that
            // sub-state's own handlers in the same frame.
            let craft_quantity_was_open = crafting_quantity.is_some();
            let craft_focus_was_open = crafting_focus.is_some();

            if craft_quantity_was_open {
                // Quantity prompt: adjust + confirm.
                if let Some((qty, max)) = crafting_quantity {
                    if bindings.pressed(input::Action::Up) && qty < max {
                        crafting_quantity = Some((qty + 1, max));
                    } else if bindings.pressed(input::Action::Down) && qty > 1 {
                        crafting_quantity = Some((qty - 1, max));
                    } else if bindings.pressed(input::Action::Confirm) {
                        // Resolve the craft. `recipes::craft` is
                        // defensive about counts; we only call it
                        // with a count we already validated.
                        if let Some(idx) = crafting_focus {
                            if let Some(recipe) = recipes::ALL.get(idx) {
                                let made = recipes::craft(&mut inventory, recipe, qty);
                                if made > 0 {
                                    add_log(&mut log,
                                        tr_fmt!("log.craft.success", made, recipe.name()),
                                        now);
                                }
                            }
                        }
                        crafting_quantity = None;
                    }
                }
            } else if craft_focus_was_open {
                // Detail view: F opens quantity prompt.
                if bindings.pressed(input::Action::Focus) {
                    if let Some(idx) = crafting_focus {
                        if let Some(recipe) = recipes::ALL.get(idx) {
                            let max = recipes::max_craftable(&inventory, recipe);
                            if max > 0 {
                                crafting_quantity = Some((1, max));
                            }
                        }
                    }
                }
            } else {
                // List view: arrow scroll + letter to focus.
                let wheel_dy = mouse_wheel().1;
                if wheel_dy != 0.0 { crafting_scroll -= wheel_dy * 24.0; }
                let step = ui::overlay_scroll_step();
                if bindings.pressed(input::Action::Up)   { crafting_scroll -= step; }
                if bindings.pressed(input::Action::Down) { crafting_scroll += step; }
                for i in 0..recipes::ALL.len() {
                    if input::letter_pressed(i) {
                        crafting_focus = Some(i);
                        break;
                    }
                }
            }
        }

        let mut action: Option<Action> = None;

        // ── Aim-mode input ────────────────────────────────────────
        // While `aim` is `Some`, the four arrows / Tab / Enter / Esc
        // form a tiny self-contained input scheme. Other gameplay
        // gates (movement, interact, wait) already gate themselves
        // behind `overlay_open_now`, which includes `aim.is_some()`,
        // so this block has exclusive ownership of those keys here.
        //
        // Tab cycles through valid enemy targets within range +
        // lit; arrows go back into free-cursor mode and nudge the
        // cursor by one tile. Enter commits the action; Esc
        // cancels with no turn cost.
        if let Some(mut a) = aim.take() {
            // Esc cancellation is handled by the global Esc cascade
            // at the top of the loop — by the time we get here, a
            // cancel press has already cleared `aim` and the take()
            // above returned None. So this block only runs on
            // arrow / Tab / commit input.
            //
            // Two modes:
            //
            // - **Snap mode** (`cycle_idx == Some`) — arrows step
            //   through `cycle_targets` (next/prev). Tab drops into
            //   free-cursor mode at the current cursor position.
            // - **Free mode** (`cycle_idx == None`) — arrows nudge
            //   the cursor one tile in their cardinal direction.
            //   Tab rebuilds the target list and snaps to the
            //   nearest valid hostile.
            //
            // Both modes treat Up/Left as "previous", Down/Right as
            // "next" while cycling — feels analogous to "scroll up
            // through a list" vs. "scroll down".
            if bindings.pressed(input::Action::CycleTarget) {
                if a.cycle_idx.is_some() {
                    // Snap → Free. Stay where we are; clear the
                    // cached target list so a future Tab rebuilds.
                    a.cycle_idx = None;
                    a.cycle_targets.clear();
                } else {
                    a.cycle_targets = collect_aim_targets(
                        &level.monsters,
                        (px as i32, py as i32),
                        a.range,
                        &lightmap,
                        level.map.width,
                    );
                    if let Some(&mi) = a.cycle_targets.first() {
                        a.cursor = (
                            level.monsters[mi].x as i32,
                            level.monsters[mi].y as i32,
                        );
                        a.cycle_idx = Some(0);
                    }
                }
            }
            // Arrows: cycle in snap mode, free-move in free mode.
            let up    = bindings.pressed(input::Action::Up);
            let down  = bindings.pressed(input::Action::Down);
            let left  = bindings.pressed(input::Action::Left);
            let right = bindings.pressed(input::Action::Right);
            if a.cycle_idx.is_some() {
                // Cycle through the cached target list. Multiple
                // arrows tapped on the same frame collapse to one
                // step — rare in practice, but keeps the cycle
                // monotone.
                if !a.cycle_targets.is_empty() {
                    let mut delta: i32 = 0;
                    if up || left   { delta -= 1; }
                    if down || right { delta += 1; }
                    if delta != 0 {
                        let n = a.cycle_targets.len() as i32;
                        let cur = a.cycle_idx.unwrap_or(0) as i32;
                        let next = ((cur + delta) % n + n) % n;
                        a.cycle_idx = Some(next as usize);
                        let mi = a.cycle_targets[next as usize];
                        a.cursor = (
                            level.monsters[mi].x as i32,
                            level.monsters[mi].y as i32,
                        );
                    }
                }
            } else {
                let mut moved = false;
                if up    { a.cursor.1 -= 1; moved = true; }
                if down  { a.cursor.1 += 1; moved = true; }
                if left  { a.cursor.0 -= 1; moved = true; }
                if right { a.cursor.0 += 1; moved = true; }
                if moved {
                    // Clamp to map bounds so the cursor can't
                    // wander off the world. We *don't* clamp to
                    // range — the renderer dims out-of-range tiles
                    // so the boundary is visible without trapping
                    // the cursor at it.
                    a.cursor.0 = a.cursor.0.clamp(0, level.map.width as i32 - 1);
                    a.cursor.1 = a.cursor.1.clamp(0, level.map.height as i32 - 1);
                }
            }
            // Enter / Fire-key / Throw-key commit. The same-key-commit
            // arms let a fire-and-fire-again flow feel natural: F to
            // aim, F again to send the shot. `aim_just_opened` skips
            // the F/T arms for one frame so the press that opened the
            // overlay can't also commit it instantly.
            let same_key_commit = !aim_just_opened
                && ((a.kind == AimKind::Fire  && bindings.pressed(input::Action::FireAim))
                    || (a.kind == AimKind::Throw && bindings.pressed(input::Action::ThrowAim)));
            let commit = bindings.pressed(input::Action::Confirm) || same_key_commit;
            if commit {
                let (cx, cy) = a.cursor;
                // Reject commits outside the range or off the map —
                // log a hint and stay in aim mode so the player can
                // re-aim without re-pressing F/T.
                let in_bounds = level.map.in_bounds(cx, cy);
                let within = in_bounds
                    && (cx - px as i32).abs().max((cy - py as i32).abs()) <= a.range;
                if in_bounds && within {
                    let tgt = (cx as usize, cy as usize);
                    action = Some(match a.kind {
                        AimKind::Fire  => Action::Fire  { target: tgt },
                        AimKind::Throw => Action::Throw { target: tgt },
                    });
                } else {
                    add_log(&mut log, i18n::tr("log.aim.out_of_range"), now);
                    aim = Some(a);
                }
            } else {
                aim = Some(a);
            }
        }
        // After the aim handler may have produced an action, re-eval
        // overlay state so the normal action chain still suppresses
        // input correctly. The `overlay_open_now` above already
        // included `aim.is_some()`, and if aim resolved to an
        // action it's now `None` — but movement key edges from this
        // frame have already been "consumed" by the aim handler's
        // arrow reads, so the original gating still holds. Nothing
        // further to do here.

        // Interact direction prompt — resolves *before* the rest of
        // the action chain so the resolving keypress can't also drive
        // movement. While the prompt is active, `overlay_open_now`
        // already suppresses every other input gate (movement / kick
        // / fire / wait), so we just poll the direction keys directly
        // here. A press in an unmatched cardinal logs a notice; either
        // way the prompt clears.
        //
        // Once the prompt clears, the player is typically still holding
        // the directional key for at least one more frame. Without
        // suppression, the autorepeat timer fires next frame and turns
        // the close-the-door verb into a step in that same direction —
        // walking the player into whatever they were trying to act on
        // (e.g. barricading themselves against monsters with a door
        // closure that fails because they step over the threshold
        // first). Latch every directional key currently held into
        // `input_suppressed` so movement waits until the player
        // releases and re-presses.
        if let Some(opts) = pending_interact_dir.as_ref() {
            // `direction_or_self_pressed` includes the wait keys
            // (`.` / Space / Kp5) as the (0, 0) "self" direction
            // so the player can pick the on-tile prop when both an
            // on-tile and an adjacent interactable are competing
            // for the prompt.
            if let Some(dir) = input::direction_or_self_pressed(&bindings) {
                let chosen = opts.iter().find(|&&(_, d)| d == dir).copied();
                if let Some((target, _)) = chosen {
                    action = Some(Action::InteractAt(target));
                } else {
                    add_log(&mut log, i18n::tr("log.interact.nothing_there"), now);
                }
                pending_interact_dir = None;
                for kc in bindings.movement_keys() {
                    if is_key_down(kc) && !input_suppressed.contains(&kc) {
                        input_suppressed.push(kc);
                    }
                }
            }
        }

        if      u { action = Some(Action::Step( 0, -1)); move_path.clear(); }
        else if d { action = Some(Action::Step( 0,  1)); move_path.clear(); }
        else if l { action = Some(Action::Step(-1,  0)); move_path.clear(); }
        else if r { action = Some(Action::Step( 1,  0)); move_path.clear(); }
        // Path step: one tile per HOLD_RATE window.
        if action.is_none() && !move_path.is_empty() && now - last_path_step >= HOLD_RATE {
            let next = *move_path.last().unwrap();
            action = Some(Action::Step(
                next.0 as i32 - px as i32,
                next.1 as i32 - py as i32,
            ));
            last_path_step = now;
            move_path.pop();
        }
        if action.is_none() && wait_pressed {
            action = Some(Action::Wait);
        }
        if action.is_none() && interact_pressed {
            action = Some(Action::Interact);
        }
        if action.is_none() && kick_pressed {
            action = Some(Action::Kick);
        }
        if action.is_none() && swap_weapon_pressed {
            action = Some(Action::SwapWeapon);
        }

        // Resolve the action (if any). Every resolved action ends with a
        // monster turn.
        if let Some(mut a) = action {
            // Stun: the action the player just picked is replaced by a
            // forced wait, and a stun charge is consumed. One log line
            // explains what happened so the player knows why their
            // keypress didn't translate to movement.
            if player_statuses.consume_stun() {
                add_log(&mut log, i18n::tr("log.stunned"), now);
                a = Action::Wait;
            }
            let mut turn_taken = false;
            match a {
                Action::Step(dx, dy) => {
                    let nx = px as i32 + dx;
                    let ny = py as i32 + dy;
                    if level.map.in_bounds(nx, ny)
                        && level.map.tile(nx as usize, ny as usize).is_walkable()
                    {
                        let (nxu, nyu) = (nx as usize, ny as usize);
                        // Closed door at the destination. Locked
                        // doors block the step entirely (turn-free
                        // log line, the player must find a key).
                        // Unlocked closed doors auto-open as the
                        // player shoves them; the rest of the Step
                        // handler then runs normally and the player
                        // walks onto the now-open tile.
                        let mut step_blocked_by_door = false;
                        if let Some(di) = level.doors.iter().position(|d|
                            d.pos == (nxu, nyu) && !d.open)
                        {
                            if level.doors[di].locked {
                                add_log(&mut log, i18n::tr("log.door.locked"), now);
                                move_path.clear();
                                step_blocked_by_door = true;
                            } else {
                                level.doors[di].open = true;
                                add_log(&mut log, i18n::tr("log.door.shoved_open"), now);
                            }
                        }
                        if step_blocked_by_door {
                            // Locked: skip the rest of Step. Falls
                            // through to the post-action turn tick
                            // with `turn_taken` still false, so no
                            // monster turn fires.
                        } else
                        // Bump into a blocking prop. For lightweight
                        // `Examine` props (cryo tube) we still log
                        // the description on contact. Container /
                        // Terminal interactions are deliberate —
                        // bumping silently blocks movement; the
                        // player must press E to open them.
                        if let Some(pi) = level.props.iter().position(|p|
                            p.blocks(nxu, nyu))
                        {
                            // Bumping fires the prop's *description*
                            // for Examine and Locked (so the player
                            // sees the flavour line on contact);
                            // Container / Terminal stay silent and
                            // require a deliberate E press.
                            let kind = level.props[pi].template().interaction;
                            if matches!(
                                kind,
                                props::PropInteraction::Examine
                                | props::PropInteraction::Locked { .. },
                            ) {
                                add_log(&mut log,
                                    level.props[pi].display_description(),
                                    now);
                                turn_taken = true;
                            }
                            // Container / Terminal: blocked silently.
                            // Don't consume a turn — the player can
                            // press E or step away without penalty.
                            move_path.clear();
                        } else if let Some(mi) = level.monsters.iter().position(|m|
                            m.hit_at.is_none() && monster_occupies(m, nxu, nyu))
                        {
                            // Swinging at a monster also re-points the
                            // player's facing toward it, so a follow-
                            // up kick lands on the same target.
                            if dx < 0 { facing_right = false; }
                            if dx > 0 { facing_right = true; }
                            facing_dir = (dx, dy);
                            // Bump attack. If a weapon is equipped, use
                            // its melee profile (pistol-whip / rifle-
                            // butt). Unarmed falls through to a basic
                            // PLAYER_MELEE_DAMAGE punch. Either way,
                            // the swing has to roll d20 ≥ target AC
                            // to actually land.
                            let kind = level.monsters[mi].kind;
                            let melee_attack = equipment.right_hand_weapon()
                                .map(|w| w.template().melee);
                            // Roll damage **once** so the same value
                            // shows up in the log line and in the HP
                            // subtraction. For 1d4-style weapons (the
                            // wrench) this produces a fresh number per
                            // swing; for flat-damage weapons it just
                            // returns the constant.
                            let (base_dmg, hit_line, kill_line) = match melee_attack {
                                Some(m) => {
                                    let rolled = m.roll_damage(&mut rng);
                                    (
                                        rolled,
                                        m.format_hit(kind.name(), rolled),
                                        m.format_kill(kind.name(), rolled),
                                    )
                                }
                                None => (
                                    PLAYER_MELEE_DAMAGE,
                                    tr_fmt!("log.combat.punch_hit", kind.name(), PLAYER_MELEE_DAMAGE),
                                    tr_fmt!("log.combat.punch_kill", kind.name()),
                                ),
                            };
                            // Apply department melee multiplier first,
                            // then the flat Security Combat Stims bonus.
                            // Round to the nearest integer so a 150%
                            // Security swing with base 1 becomes 2, not 1.
                            let mult = player_class.map_or(100, |c| c.melee_dmg_mult());
                            let scaled = ((base_dmg as i32) * mult + 50) / 100;
                            let mut dmg = if combat_stims_turns_left > 0
                                && player_class == Some(classes::PlayerClass::Security)
                            {
                                scaled + 2
                            } else {
                                scaled
                            };
                            // Default melee SFX — fires on every swing
                            // (hit or miss). Per-weapon overrides can
                            // land later by adding a new `Sfx::*` and
                            // matching on `WeaponKind` here.
                            audio::play(&audio_bank, Sfx::MeleeSwing, &mut rng);
                            let roll = rng.gen_range(1..=20);
                            // Cover from the player's angle. For a
                            // bump attack they're adjacent, so cover
                            // really only kicks in if the player is
                            // diagonal AND the monster is hugging a
                            // wall on that diagonal.
                            let monster_pos = (level.monsters[mi].x, level.monsters[mi].y);
                            let target_base = effective_armor_class(&level.monsters[mi]);
                            let target_ac = if has_cover_from(&level.map, monster_pos, (px, py)) {
                                target_base + COVER_AC_BONUS
                            } else {
                                target_base
                            };
                            if roll >= target_ac {
                                level.monsters[mi].hp -= dmg;
                                add_log(&mut log, hit_line, now);
                                if level.monsters[mi].hp <= 0 {
                                    level.monsters[mi].hit_at = Some(now);
                                    let gained = kind.kill_xp(level.num);
                                    telemetry::emit("monster_kill", serde_json::json!({
                                        "kind": format!("{:?}", kind),
                                        "method": "melee",
                                        "floor": level.num,
                                        "xp_gained": gained,
                                    }));
                                    add_log(&mut log,
                                        tr_fmt!("log.combat.kill_xp", kill_line, gained),
                                        now);
                                    gain_xp(&mut xp, &mut player_level, &mut hp, &mut hp_max, gained, &mut log, now);
                                    maybe_drop_weapon(
                                        kind,
                                        (level.monsters[mi].x, level.monsters[mi].y),
                                        &mut level.items, &mut log, &mut rng, now,
                                    );
                                } else {
                                    level.monsters[mi].last_hurt_at = Some(now);
                                }
                            } else {
                                add_log(&mut log,
                                    tr_fmt!("log.combat.glance", kind.name()),
                                    now);
                            }
                            move_path.clear();
                            turn_taken = true;
                        } else {
                            px = nxu;
                            py = nyu;
                            if dx < 0 { facing_right = false; }
                            if dx > 0 { facing_right = true; }
                            // Record the cardinal facing for the
                            // next directional verb (kick).
                            facing_dir = (dx, dy);
                            last_move_time = now;
                            turn_taken = true;
                        }
                    } else {
                        // Wall or OOB — don't spend a turn.
                        move_path.clear();
                    }
                }
                Action::Fire { target: (tx, ty) } => {
                    // Fire only fires if a ranged weapon is reachable
                    // — either already in hand, or stashed in
                    // ReadyWeapon. The aim-overlay open path
                    // (`has_any_ranged` gate) already enforces this;
                    // the auto-swap below handles the stashed case
                    // so the player can press F → Enter to fire
                    // through their pocket rifle without a separate
                    // Z keystroke first. The melee weapon they were
                    // wielding moves into ReadyWeapon for free as
                    // part of the same action.
                    if equipment.right_hand_weapon().and_then(|w| w.ranged()).is_none() {
                        let held = equipment.get(items::EquipSlot::RightHand);
                        let stashed = equipment.get(items::EquipSlot::ReadyWeapon);
                        equipment.set_for_load(items::EquipSlot::RightHand, stashed);
                        equipment.set_for_load(items::EquipSlot::ReadyWeapon, held);
                        if let Some(k) = stashed {
                            add_log(&mut log,
                                tr_fmt!("log.fire.drew", k.name()), now);
                        }
                    }
                    let weapon = equipment.right_hand_weapon()
                        .expect("Fire action without equipped weapon")
                        .template();
                    let ranged = weapon.ranged
                        .expect("Fire action on a weapon that can't fire");
                    last_fire_time = Some(now);
                    audio::play(&audio_bank, Sfx::WeaponFire, &mut rng);
                    let target = vec2(tx as f32 + 0.5, ty as f32 + 0.5);
                    let origin = vec2(px as f32 + 0.5, py as f32 + 0.5);
                    let dir = (target - origin).normalize_or_zero();
                    if dir.length_squared() > 0.0 {
                        let scan = hit_scan(
                            &level.map, &level.monsters, origin, dir,
                            ranged.hit_scan_range, &mut rng,
                        );
                        // Log every creature the round whistled past.
                        for &miss_i in &scan.misses {
                            let name = level.monsters[miss_i].kind.name();
                            add_log(&mut log,
                                tr_fmt!("log.combat.miss_ranged", name),
                                now);
                        }
                        if let Some(i) = scan.hit {
                            let kind = level.monsters[i].kind;
                            // Apply department ranged multiplier (130%
                            // Science etc.). Minimum 1 damage on any
                            // successful hit so a zero-roll roundoff
                            // doesn't make ranged attacks "tickle".
                            let mult = player_class.map_or(100, |c| c.ranged_dmg_mult());
                            let rolled = ranged.attack.roll_damage(&mut rng);
                            let dmg = ((rolled * mult + 50) / 100).max(1);
                            level.monsters[i].hp -= dmg;
                            add_log(&mut log,
                                ranged.attack.format_hit(kind.name(), dmg), now);
                            if level.monsters[i].hp <= 0 {
                                level.monsters[i].hit_at = Some(now);
                                let gained = kind.kill_xp(level.num);
                                telemetry::emit("monster_kill", serde_json::json!({
                                    "kind": format!("{:?}", kind),
                                    "method": "ranged",
                                    "floor": level.num,
                                    "xp_gained": gained,
                                }));
                                add_log(&mut log,
                                    tr_fmt!("log.combat.kill_xp",
                                        ranged.attack.format_kill(kind.name(), dmg),
                                        gained),
                                    now);
                                gain_xp(&mut xp, &mut player_level, &mut hp, &mut hp_max, gained, &mut log, now);
                                maybe_drop_weapon(
                                    kind,
                                    (level.monsters[i].x, level.monsters[i].y),
                                    &mut level.items, &mut log, &mut rng, now,
                                );
                            } else {
                                level.monsters[i].last_hurt_at = Some(now);
                            }
                        }
                        projectiles.push(Projectile {
                            pos: origin,
                            vel: dir * ranged.bullet_speed,
                            max_dist: (scan.pos - origin).length(),
                            traveled: 0.0,
                            color: Color::new(1.0, 0.95, 0.65, 1.0),
                        });
                    }
                    turn_taken = true;
                }
                Action::Wait => {
                    turn_taken = true;
                }
                Action::Throw { target: (tx, ty) } => 'throw: {
                    // Lift the item out of the Throwable slot.
                    // Belt-and-braces — by the time we get here the
                    // commit gate already rejected an empty slot, but
                    // if state drifts (a future bug?) bail without
                    // wasting a turn.
                    let Some(throwable_kind) = equipment.get(items::EquipSlot::Throwable) else {
                        add_log(&mut log, i18n::tr("log.throw.nothing_assigned"), now);
                        break 'throw;
                    };
                    let t = throwable_kind.template();
                    let radius = t.effect_radius;
                    let explosive = t.explosive;
                    // The Throwable slot is the *single source of
                    // truth* for what's in hand — clearing it here
                    // before applying damage means a death-loop in
                    // resolution (player kills self via splash, run
                    // ends) doesn't leak the item back into the
                    // post-death cleanup path.
                    equipment.set_for_load(items::EquipSlot::Throwable, None);
                    audio::play(&audio_bank, Sfx::WeaponFire, &mut rng);
                    add_log(&mut log,
                        tr_fmt!("log.throw.airborne", throwable_kind.name()), now);
                    telemetry::emit("throw_attempt", serde_json::json!({
                        "kind": format!("{:?}", throwable_kind),
                        "target": [tx, ty],
                        "radius": radius,
                        "explosive": explosive,
                    }));
                    // Walk every tile in the splash radius (Chebyshev),
                    // apply impact damage to anything occupying it,
                    // and — for explosives — drop a Fire Pool tile
                    // that lingers via the expiring-hazard pool.
                    let r = radius as i32;
                    for dy in -r..=r {
                        for dx in -r..=r {
                            let ax = tx as i32 + dx;
                            let ay = ty as i32 + dy;
                            if !level.map.in_bounds(ax, ay) { continue; }
                            let (axu, ayu) = (ax as usize, ay as usize);
                            // Impact damage to the player if they're
                            // standing in the splash. 1 dmg flat for
                            // now; future thrown items can read a
                            // template field for variable splash dmg.
                            if (axu, ayu) == (px, py) {
                                hurt_player(&mut hp, 1, &mut last_damage_time,
                                    &audio_bank, &mut rng, now);
                                add_log(&mut log,
                                    i18n::tr("log.throw.splash_self"), now);
                            }
                            // Impact damage to monsters in the splash.
                            // Whole footprint is checked so a 2×2 boss
                            // catches splash on any of its four tiles.
                            for mi in 0..level.monsters.len() {
                                if level.monsters[mi].hit_at.is_some() { continue; }
                                if !monster_occupies(&level.monsters[mi], axu, ayu) { continue; }
                                level.monsters[mi].hp -= 1;
                                let kind = level.monsters[mi].kind;
                                if level.monsters[mi].hp <= 0 {
                                    level.monsters[mi].hit_at = Some(now);
                                    let gained = kind.kill_xp(level.num);
                                    telemetry::emit("monster_kill", serde_json::json!({
                                        "kind": format!("{:?}", kind),
                                        "method": "throw",
                                        "floor": level.num,
                                        "xp_gained": gained,
                                    }));
                                    add_log(&mut log,
                                        tr_fmt!("log.throw.kill", kind.name()), now);
                                    gain_xp(&mut xp, &mut player_level, &mut hp, &mut hp_max,
                                        gained, &mut log, now);
                                    let drop_pos = (
                                        level.monsters[mi].x,
                                        level.monsters[mi].y,
                                    );
                                    maybe_drop_weapon(kind, drop_pos,
                                        &mut level.items, &mut log, &mut rng, now);
                                } else {
                                    level.monsters[mi].last_hurt_at = Some(now);
                                    add_log(&mut log,
                                        tr_fmt!("log.throw.hit", kind.name()), now);
                                }
                            }
                            // Drop a fire pool for explosives. Stamps
                            // only on Floor tiles (don't overwrite a
                            // ControlPanel or another hazard). The
                            // `restore` field carries the original
                            // tile so the tick reverts to whatever
                            // was there before — currently always
                            // Floor in practice.
                            if explosive {
                                let current = level.map.tile(axu, ayu);
                                if matches!(current, Tile::Floor) {
                                    level.map.set_tile(axu, ayu, Tile::FirePool);
                                    // N=3 so the pool persists for two
                                    // player turns including the throw
                                    // turn — the throw-turn entry
                                    // applies Burning, and a step onto
                                    // an unfilled splash tile the very
                                    // next turn still triggers.
                                    level.expiring_hazards.push(ExpiringHazard {
                                        pos: (axu, ayu),
                                        turns_remaining: 3,
                                        restore: current,
                                    });
                                }
                            }
                        }
                    }
                    // Non-explosive throws leave the item on the
                    // landing tile so the player can recover it.
                    // Explosives are consumed.
                    if !explosive && level.map.in_bounds(tx as i32, ty as i32)
                        && level.map.tile(tx, ty).is_walkable()
                    {
                        level.items.push((throwable_kind, tx, ty));
                    }
                    // Auto-replenish the throw hand. If the player is
                    // carrying another of the same kind, pull one out
                    // and slot it in — keeps a stack of molotovs at
                    // the ready so the player isn't bouncing through
                    // the inventory screen between every throw. The
                    // refill is silent (no log line); each subsequent
                    // throw still announces itself via
                    // `log.throw.airborne`. Only triggers for items
                    // whose template still wants the Throwable slot,
                    // so a thrown weapon (template equip_slot =
                    // RightHand) doesn't try to refill the throw
                    // hand from inventory.
                    if throwable_kind.template().equip_slot
                        == Some(items::EquipSlot::Throwable)
                    {
                        if let Some(idx) = inventory.entries.iter()
                            .position(|e| e.kind == throwable_kind)
                        {
                            inventory.consume_at(idx);
                            equipment.set_for_load(
                                items::EquipSlot::Throwable,
                                Some(throwable_kind),
                            );
                        }
                    }
                    turn_taken = true;
                }
                Action::Kick => {
                    // Find an adjacent (cardinal) live monster to
                    // kick. Priority: prefer the one in the player's
                    // facing direction, then fall through to any of
                    // the four cardinals so a kick always lands as
                    // long as something's bumping the player. Push
                    // direction is **away from the player** —
                    // computed from `(monster - player)`, not from
                    // `facing_dir` — so the target gets shoved
                    // outward regardless of how the player got there.
                    let order: [(i32, i32); 4] = [
                        facing_dir,
                        (1, 0), (-1, 0), (0, 1),
                    ];
                    // Dedupe so we don't double-check `facing_dir`
                    // when it overlaps one of the cardinal entries.
                    let mut seen: Vec<(i32, i32)> = Vec::with_capacity(4);
                    let mut found: Option<(usize, (i32, i32))> = None;
                    for &(dx, dy) in &order {
                        if seen.contains(&(dx, dy)) { continue; }
                        seen.push((dx, dy));
                        // Cardinal-only — diagonal kicks not supported.
                        if dx.abs() + dy.abs() != 1 { continue; }
                        let tx = px as i32 + dx;
                        let ty = py as i32 + dy;
                        if !level.map.in_bounds(tx, ty) { continue; }
                        let (txu, tyu) = (tx as usize, ty as usize);
                        if let Some(mi) = level.monsters.iter().position(|m|
                            m.hit_at.is_none() && monster_occupies(m, txu, tyu))
                        {
                            found = Some((mi, (dx, dy)));
                            break;
                        }
                    }
                    if let Some((mi, (dx, dy))) = found {
                        // Push direction = away-from-player axis.
                        // Equal to `(dx, dy)` since the monster is at
                        // `player + (dx, dy)`; spelled out here to
                        // make the intent obvious for future readers
                        // (e.g. when push distance scales with Strength).
                        let push = (dx, dy);
                        let monster_pos = (
                            level.monsters[mi].x as i32,
                            level.monsters[mi].y as i32,
                        );
                        let bx = monster_pos.0 + push.0;
                        let by = monster_pos.1 + push.1;
                        let in_bounds = level.map.in_bounds(bx, by);
                        let (bxu, byu) = if in_bounds {
                            (bx as usize, by as usize)
                        } else { (0, 0) };
                        let walkable = in_bounds
                            && level.map.tile(bxu, byu).is_walkable();
                        let on_player = (bxu, byu) == (px, py);
                        let blocked_by_monster = level.monsters.iter().enumerate()
                            .any(|(j, m)| j != mi && m.hit_at.is_none()
                                && monster_occupies(m, bxu, byu));
                        let blocked_by_prop = level.props.iter()
                            .any(|p| p.blocks(bxu, byu));
                        let kicked_kind = level.monsters[mi].kind;
                        // Kicking re-points the player's facing toward
                        // the target so a follow-up step / swing /
                        // kick lines up.
                        if dx < 0 { facing_right = false; }
                        if dx > 0 { facing_right = true; }
                        facing_dir = (dx, dy);
                        if in_bounds && walkable && !on_player
                            && !blocked_by_monster && !blocked_by_prop
                        {
                            level.monsters[mi].x = bxu;
                            level.monsters[mi].y = byu;
                            // 1-turn stun so the target can't just
                            // sprint back next turn — gives the
                            // player a tempo window.
                            level.monsters[mi].statuses
                                .add(status::StatusKind::Stunned, 1);
                            add_log(&mut log,
                                tr_fmt!("log.combat.kick_back", kicked_kind.name()),
                                now);
                        } else {
                            // Destination wedged — the kick still
                            // lands and stuns, the target just can't
                            // move. Slightly weaker flavour so the
                            // player understands the difference.
                            level.monsters[mi].statuses
                                .add(status::StatusKind::Stunned, 1);
                            add_log(&mut log,
                                tr_fmt!("log.combat.kick_pinned", kicked_kind.name()),
                                now);
                        }
                        turn_taken = true;
                    }
                    // No adjacent monster → action drops without a
                    // turn cost; player can step / swing instead.
                }
                Action::SwapWeapon => {
                    let r     = equipment.get(items::EquipSlot::RightHand);
                    let ready = equipment.get(items::EquipSlot::ReadyWeapon);
                    if r.is_none() && ready.is_none() {
                        // Both empty — nothing to swap, no turn spent.
                        add_log(&mut log, i18n::tr("log.swap.empty"), now);
                    } else {
                        // Direct swap. Neither slot contributes AC at
                        // present (weapons have ac_bonus=0); if a
                        // future weapon adds AC, the math here would
                        // need to subtract `r`'s bonus and add the
                        // new one. Stays a no-op for now.
                        equipment.set_for_load(items::EquipSlot::RightHand, ready);
                        equipment.set_for_load(items::EquipSlot::ReadyWeapon, r);
                        let new_in_hand = ready.map(|k| k.name())
                            .unwrap_or_else(|| i18n::tr("log.swap.empty_hand"));
                        let stashed = r.map(|k| k.name())
                            .unwrap_or_else(|| i18n::tr("log.swap.empty_hand"));
                        add_log(&mut log,
                            tr_fmt!("log.swap.done", new_in_hand, stashed), now);
                        turn_taken = true;
                    }
                }
                Action::Interact => {
                    // Single adjacent prop / door → act now. Two or
                    // more → open the direction prompt and wait for
                    // an arrow / numpad pick. Zero → drop silently.
                    let opts = adjacent_interactables(&level.props, &level.doors, (px, py));
                    match opts.len() {
                        0 => {}
                        1 => {
                            match opts[0].0 {
                                InteractTarget::Prop(pi) => {
                                    resolve_prop_interact(
                                        pi, &level, &mut inventory,
                                        &mut pending_item_prompt,
                                        &mut pending_loot_prompt,
                                        &mut looting, &mut loot_scroll,
                                        &mut show_inventory, &mut show_equipment,
                                        &mut log, &mut turn_taken, now,
                                    );
                                }
                                InteractTarget::Door(di) => {
                                    resolve_door_interact(
                                        di, &mut level.doors, &level.monsters,
                                        (px, py), &mut log, &mut turn_taken, now,
                                    );
                                }
                            }
                        }
                        _ => {
                            // If one of the options is the player's
                            // own tile (a crate they're standing on),
                            // surface the `.` key in the prompt so
                            // they can pick it; otherwise keep the
                            // shorter prompt.
                            let has_self = opts.iter().any(|(_, d)| *d == (0, 0));
                            let prompt_key = if has_self {
                                "log.interact.choose_dir_with_self"
                            } else {
                                "log.interact.choose_dir"
                            };
                            pending_interact_dir = Some(opts);
                            add_log(&mut log, i18n::tr(prompt_key), now);
                        }
                    }
                }
                Action::InteractAt(target) => {
                    match target {
                        InteractTarget::Prop(pi) => {
                            if pi < level.props.len() {
                                resolve_prop_interact(
                                    pi, &mut level, &mut inventory,
                                    &mut pending_item_prompt,
                                    &mut pending_loot_prompt,
                                    &mut looting, &mut loot_scroll,
                                    &mut show_inventory, &mut show_equipment,
                                    &mut log, &mut turn_taken, now,
                                );
                            }
                        }
                        InteractTarget::Door(di) => {
                            if di < level.doors.len() {
                                resolve_door_interact(
                                    di, &mut level.doors, &level.monsters,
                                    (px, py), &mut log, &mut turn_taken, now,
                                );
                            }
                        }
                    }
                }
            }
            if turn_taken {
                // Passive HP regen: every PASSIVE_HEAL_TURNS of any
                // action (move, swing, wait, kick, interact) tick a
                // single point of recovery up to the cap. Wait is
                // explicitly an action, so resting in place actually
                // restores HP — gives the player a recovery option
                // that doesn't burn through scarce healing items.
                turns_since_passive_heal += 1;
                if turns_since_passive_heal >= PASSIVE_HEAL_TURNS {
                    turns_since_passive_heal = 0;
                    if hp < hp_max {
                        hp += 1;
                    }
                }

                // Combat Stims tick: one turn is one action regardless
                // of whether the player moved, fired, or waited. When
                // the active counter drains, the cooldown engages;
                // when the cooldown drains, the ability announces
                // "Ready."
                if combat_stims_turns_left > 0 {
                    combat_stims_turns_left -= 1;
                    if combat_stims_turns_left == 0 {
                        combat_stims_cooldown_turns = COMBAT_STIMS_COOLDOWN_TURNS;
                        add_log(&mut log, i18n::tr("log.stims.expired"), now);
                    }
                } else if combat_stims_cooldown_turns > 0 {
                    combat_stims_cooldown_turns -= 1;
                    if combat_stims_cooldown_turns == 0 {
                        add_log(&mut log, i18n::tr("log.stims.ready"), now);
                    }
                }

                // Status tick happens before the monster turn so poison
                // / radiation / bleeding damage gets attributed to the
                // player's action that triggered it, and the player can
                // still go down from a DoT the moment they would act.
                let status_dmg = player_statuses.tick(&mut rng);
                if status_dmg > 0 {
                    let names = player_statuses.active_names();
                    hurt_player(&mut hp, status_dmg, &mut last_damage_time, &audio_bank, &mut rng, now);
                    if !names.is_empty() {
                        add_log(&mut log,
                            tr_fmt!("log.status.damage_named", status_dmg, names.join(", ")),
                            now);
                    } else {
                        add_log(&mut log,
                            tr_fmt!("log.status.damage_unnamed", status_dmg),
                            now);
                    }
                }
                // Expiring hazards (currently: Ion Sweep tiles)
                // tick down BEFORE the monster turn. That way a
                // brand-new sweep placed inside `monster_turn` gets
                // its full lifetime starting next turn, instead of
                // being one tick shorter than every other sweep.
                level.expiring_hazards.retain_mut(|h| {
                    h.turns_remaining -= 1;
                    if h.turns_remaining == 0 {
                        if level.map.in_bounds(h.pos.0 as i32, h.pos.1 as i32) {
                            level.map.set_tile(h.pos.0, h.pos.1, h.restore);
                        }
                        false
                    } else {
                        true
                    }
                });

                monster_turn(
                    &mut level,
                    (px, py),
                    player_ac,
                    &mut hp,
                    &mut last_damage_time,
                    &mut log,
                    &audio_bank,
                    &mut player_statuses,
                    &mut projectiles,
                    &mut rng,
                    now,
                );
            }
        }

        // Post-turn bookkeeping ────────────────────────────────────────

        // Item pickup: stepping onto an item adds it to inventory.
        let mut picked_items: Vec<ItemKind> = Vec::new();
        level.items.retain_mut(|(item, ix, iy)| {
            if *ix == px && *iy == py {
                picked_items.push(*item);
                false
            } else {
                true
            }
        });
        for item in picked_items {
            inventory.add(item, 1);
            add_log(&mut log, tr_fmt!("log.pickup.item", item.name()), now);
            telemetry::emit("item_pickup", serde_json::json!({
                "kind": format!("{:?}", item),
                "floor": level.num,
            }));
        }

        // Hazard triggers: fire once per entry onto a hazard tile. If
        // the player stands still, no further damage; if they step off
        // and back on, it retriggers. Behavior is driven by the
        // `HazardTemplate` lookup in `hazards.rs` — adding a new
        // hazard or retuning damage is a data edit there.
        let current_tile = level.map.tile(px, py);
        let hazard = hazards::hazard_template(current_tile);
        let fresh_entry = hazard.is_some() && last_hazard_trigger_pos != Some((px, py));
        if let (true, Some(h)) = (fresh_entry, hazard) {
            // Medical's Rad-resistant Biotech metabolises radiation
            // as a resource — radiation *heals* them instead of
            // hurting. Sole department-specific override; kept at the
            // call site so the hazard template stays generic for
            // future creatures that might apply a hazard to the floor
            // mid-fight.
            let is_rad = matches!(current_tile, Tile::RadiationZone);
            if is_rad && player_class == Some(classes::PlayerClass::Medical) {
                hp = (hp + 1).min(hp_max);
                add_log(&mut log, i18n::tr("log.hazard.medical_metabolize"), now);
            } else {
                let roll_land = h.damage_chance >= 1.0 || rng.gen_bool(h.damage_chance as f64);
                if h.damage > 0 && roll_land {
                    hurt_player(&mut hp, h.damage, &mut last_damage_time, &audio_bank, &mut rng, now);
                    // `entry_log` is an i18n key when set; empty
                    // string = silent (don't try to resolve).
                    if !h.entry_log.is_empty() {
                        add_log(&mut log, i18n::tr(h.entry_log), now);
                    }
                }
                if let Some((kind, turns)) = h.on_enter_status {
                    player_statuses.add(kind, turns);
                }
                if !h.secondary_log.is_empty() {
                    add_log(&mut log, i18n::tr(h.secondary_log), now);
                }
            }
            last_hazard_trigger_pos = Some((px, py));
        } else if hazard.is_none() {
            // Stepped off the hazard — clear so re-entry retriggers.
            last_hazard_trigger_pos = None;
        }

        // Victory condition: Control Panel on Level 5.
        // Two paths through the gate:
        //   1. Pure tabula rasa — everything on this floor is dead.
        //   2. Keycard bypass — player is carrying the AdminKeycard
        //      the boss dropped. Kills the minion-sweep grind.
        if level.num == 5 && level.map.tile(px, py) == Tile::ControlPanel {
            let has_keycard = inventory.entries.iter()
                .any(|e| e.kind == ItemKind::AdminKeycard);
            let all_dead = level.monsters.iter().all(|m| m.hit_at.is_some());
            if has_keycard || all_dead {
                if has_keycard {
                    add_log(&mut log, i18n::tr("log.panel.keycard_unlock"), now);
                }
                add_log(&mut log, i18n::tr("log.panel.override"), now);
                add_log(&mut log, i18n::tr("log.panel.escape"), now);
                phase = Phase::GameOver;
            } else {
                add_log(&mut log, i18n::tr("log.panel.locked"), now);
            }
        }

        // Zone-door transitions. Stepping onto the eastern zone
        // door (== `stairs_down`) advances spinward to the next
        // floor; stepping onto the western zone door retreats
        // anti-spinward to the previous one. The boss floor (num
        // 5) has no zone doors and uses its own ControlPanel
        // victory tile, so neither transition fires there.
        let going_east = level.num < 5 && (px, py) == level.stairs_down;
        let going_west = level.num > 1
            && level.west_zone_door == Some((px, py));
        if going_east || going_west {
            let next_num = if going_east { level.num + 1 } else { level.num - 1 };
            // Pull the destination from the visited stash if the
            // player has already been there, otherwise roll a
            // fresh one. Either way, swap it into the active slot
            // and shelve the level we just left so a later return
            // trip restores it.
            let next_level = visited_levels.remove(&next_num).unwrap_or_else(|| {
                let mut fresh = levelgen::generate_level(&mut rng, next_num);
                levelgen::place_hazards(&mut fresh, &mut rng);
                fresh
            });
            let prior = std::mem::replace(&mut level, next_level);
            visited_levels.insert(prior.num, prior);
            // Spawn one tile inward of the door we entered through
            // and pre-open that door so the player visibly steps
            // out of it (and so they don't immediately re-trigger
            // the same transition by being on the door tile).
            if going_east {
                if let Some((wx, wy)) = level.west_zone_door {
                    if let Some(d) = level.doors.iter_mut().find(|d| d.pos == (wx, wy)) {
                        d.open = true;
                    }
                    px = wx + 1;
                    py = wy;
                } else {
                    px = level.spawn.0;
                    py = level.spawn.1;
                }
            } else {
                let (ex, ey) = level.stairs_down;
                if let Some(d) = level.doors.iter_mut().find(|d| d.pos == (ex, ey)) {
                    d.open = true;
                }
                px = ex.saturating_sub(1);
                py = ey;
            }
            move_path.clear();
            projectiles.clear();
            last_damage_time = f64::NEG_INFINITY;
            last_hazard_trigger_pos = None;
            player_statuses.clear();
            spotted_items.clear();
            looting = None;
            pending_loot_prompt = None;
            pending_interact_dir = None;
            loot_scroll = 0.0;
            lightmap = recompute_lightmap(&level.map, (px, py), player_class, &equipment, &level.doors, &level.monsters);
            last_lightmap_pos = (px, py);
            let line = if going_east {
                tr_fmt!("log.descend.next", level.num)
            } else {
                tr_fmt!("log.descend.retreat", level.num)
            };
            add_log(&mut log, line, now);
            telemetry::emit("zone_transition", serde_json::json!({
                "direction": if going_east { "east" } else { "west" },
                "floor": level.num,
                "player_hp": hp,
                "player_xp": xp,
            }));
        }

        // Cull dead-flash monsters whose time is up.
        level.monsters.retain(|m| match m.hit_at {
            Some(t) => now - t < MONSTER_FLASH_DURATION,
            None => true,
        });

        // Transition to game over on HP=0.
        if hp == 0 {
            add_log(&mut log, i18n::tr("log.death"), now);
            telemetry::emit("player_death", serde_json::json!({
                "floor": level.num,
                "player_level": player_level,
                "xp": xp,
            }));
            phase = Phase::GameOver;
        }

        // Advance visual-only projectiles.
        projectiles.retain_mut(|p| {
            p.pos += p.vel * dt;
            p.traveled += p.vel.length() * dt;
            p.traveled < p.max_dist
        });

        // Face the aim cursor while it's active. Only horizontal
        // offset matters for the flip; vertical-only aim preserves
        // whatever direction the player was already facing.
        if let Some(a) = aim.as_ref() {
            if a.cursor.0 != px as i32 {
                facing_right = a.cursor.0 >= px as i32;
            }
        }

        // Recompute FOV on actual movement OR when the player's
        // effective vision radii change (equipped a hand-lamp,
        // unequipped one, etc.). Mask is rebaked alongside so its
        // gradient lines up with the new ring sizes.
        let current_radii = vision_radii(player_class, &equipment);
        let radii_changed = current_radii != last_vision_radii;
        if radii_changed {
            sprites.rebuild_light_mask(current_radii.0, current_radii.1);
            last_vision_radii = current_radii;
        }
        if (px, py) != last_lightmap_pos || radii_changed {
            lightmap = recompute_lightmap(&level.map, (px, py), player_class, &equipment, &level.doors, &level.monsters);
            last_lightmap_pos = (px, py);
        }

        // First-sight description: fire once per individual creature,
        // the moment it shows up in the player's FOV. We key off the
        // lightmap so a creature that stays hidden in darkness doesn't
        // trigger until it actually gets spotted.
        for m in level.monsters.iter_mut() {
            if m.spotted || m.hit_at.is_some() { continue; }
            if m.x >= level.map.width || m.y >= level.map.height { continue; }
            let lit = lightmap.get(m.y * level.map.width + m.x)
                .copied().unwrap_or(0.0);
            if lit > 0.0 {
                m.spotted = true;
                add_log(&mut log,
                    tr_fmt!("log.spot.creature", m.kind.name(), m.kind.description()),
                    now);
            }
        }

        // Engineering Schematic Sense: log every lit item on first
        // sight. Other departments see items fine too, but only
        // Engineering gets the "You spot a MedKit." callout — it's
        // the department's passive flavour that also rewards the
        // bonus vision radius.
        if player_class == Some(classes::PlayerClass::Engineering) {
            for &(kind, ix, iy) in &level.items {
                if spotted_items.contains(&(ix, iy)) { continue; }
                if ix >= level.map.width || iy >= level.map.height { continue; }
                let lit = lightmap.get(iy * level.map.width + ix)
                    .copied().unwrap_or(0.0);
                if lit > 0.0 {
                    spotted_items.insert((ix, iy));
                    add_log(&mut log,
                        tr_fmt!("log.spot.item", kind.name()),
                        now);
                }
            }
        }

        // Run anim plays while the player recently moved or auto-walks.
        let is_moving = now - last_move_time < HOLD_RATE * 1.6 || !move_path.is_empty();

        // Hurt animation follows last_damage_time.
        let hurt_progress = {
            let elapsed = now - last_damage_time;
            if elapsed >= 0.0 && elapsed < HURT_DURATION { Some(elapsed) } else { None }
        };

        // Aim cursor in *screen* coords, fed to the renderer for the
        // shoulder-rotation pose. Computed once per frame off the
        // current camera layout so it tracks the player tile.
        let aim_cursor = aim.as_ref().map(|a| {
            let cx = ox + (a.cursor.0 as f32 + 0.5) * tile;
            let cy = oy + (a.cursor.1 as f32 + 0.5) * tile;
            vec2(cx, cy)
        });

        // Layout pass #2 — after the step, so the camera's centred on
        // the post-move tile.
        let (tile, ox, oy, status_h) = compute_layout((px, py));

        let monster_views: Vec<MonsterView> = level.monsters.iter().map(|m| {
            let t = m.kind.template();
            // Awake creatures turn to face the player — source sprites
            // face left by default, so we set `facing_right = true`
            // (which becomes flip_x) when the player's center x is
            // strictly east of the monster's center x. Sleeping /
            // unaware creatures keep the default left-facing pose.
            let facing_right = if m.ai_state != MonsterAiState::Idle {
                let monster_center = m.x as f32 + t.tile_size.0 as f32 * 0.5;
                let player_center  = px as f32 + 0.5;
                player_center > monster_center
            } else {
                false
            };
            // Flash priority:
            //   - Dying (`hit_at` set) → solid white silhouette for
            //     the whole death-flash window.
            //   - Non-fatal hit (`last_hurt_at` recent) → white
            //     overlay that fades from 1.0 → 0.0 over the same
            //     window so landing shots read at a glance.
            let flash = if m.hit_at.is_some() {
                1.0
            } else if let Some(t) = m.last_hurt_at {
                let elapsed = now - t;
                if elapsed >= 0.0 && elapsed < MONSTER_FLASH_DURATION {
                    (1.0 - elapsed / MONSTER_FLASH_DURATION) as f32
                } else { 0.0 }
            } else { 0.0 };
            MonsterView {
                pos: (m.x, m.y),
                flash,
                sprite_idx: m.kind.sprite_index(),
                render_scale: t.render_scale,
                tile_size: t.tile_size,
                facing_right,
                anim_state: pick_monster_anim_state(m, now),
            }
        }).collect();

        let item_views: Vec<ItemView> = level.items.iter().map(|&(kind, x, y)| {
            let t = kind.template();
            ItemView {
                pos: (x, y),
                sprite: t.sprite,
                render_scale: t.render_scale,
            }
        }).collect();

        let prop_views: Vec<PropView> = level.props.iter().map(|p| {
            let t = p.template();
            PropView {
                pos: p.pos,
                footprint: t.footprint,
                anchor: t.anchor,
                sprite_path: t.sprite,
                animation: t.animation,
            }
        }).collect();

        // Doors are flipped open by a deliberate `E` press (see the
        // Action::Interact handler); the renderer just reflects the
        // persistent state. `door_is_open` stays the shared lookup
        // so FOV / monster AI / renderer all read the same answer.
        let door_views: Vec<DoorView> = level.doors.iter().map(|d| {
            DoorView {
                pos: d.pos,
                room_dir: d.room_dir,
                open: door_is_open(d, (px, py), &level.monsters),
                kind: d.kind,
            }
        }).collect();

        clear_background(Color::from_rgba(0, 0, 0, 255));
        // Paper-doll signals derived from equipment slots. Each layer
        // has a corresponding sheet on `Sprites::player`; the renderer
        // dispatches off these.
        // - jumpsuit    ↔ FlightJumpsuit in Clothing
        // - chest plate ↔ ChestPlate     in Body  (stacks over jumpsuit)
        // - right-hand layer ↔ which weapon (if any) is in RightHand
        // - lamp        ↔ HandLamp       in LeftHand
        let jumpsuit_visible = matches!(
            equipment.get(items::EquipSlot::Clothing),
            Some(ItemKind::FlightJumpsuit),
        );
        let chest_plate_visible = matches!(
            equipment.get(items::EquipSlot::Body),
            Some(ItemKind::ChestPlate),
        );
        let right_hand_weapon = equipment.right_hand_weapon();
        let lamp_visible = matches!(
            equipment.get(items::EquipSlot::LeftHand),
            Some(ItemKind::HandLamp),
        );
        draw_dungeon(
            &level.map, &sprites,
            (px, py), is_moving, facing_right,
            right_hand_weapon, lamp_visible,
            jumpsuit_visible, chest_plate_visible,
            match last_fire_time {
                Some(t) if now - t < FLASH_DURATION =>
                    1.0 - ((now - t) / FLASH_DURATION) as f32,
                _ => 0.0,
            },
            hurt_progress,
            aim_cursor,
            &monster_views,
            &item_views,
            &prop_views,
            &door_views,
            Some(level.stairs_down),
            &lightmap,
            current_radii.1,
            tile, ox, oy,
        );

        // Bullet tracers.
        let tracer_thick = (tile * 0.05).max(1.0);
        for p in &projectiles {
            let len = (p.vel.length() * dt).max(0.3);
            let dir = p.vel.normalize_or_zero();
            let tip_x = ox + p.pos.x * tile;
            let tip_y = oy + p.pos.y * tile;
            let tail_x = tip_x - dir.x * len * tile;
            let tail_y = tip_y - dir.y * len * tile;
            draw_line(tail_x, tail_y, tip_x, tip_y, tracer_thick, p.color);
        }

        // Keyboard aim overlay: retro-green target cursor on the
        // focused tile, plus a softer radius preview when an
        // area-effect throw is staged. Drawn over everything so the
        // player can read the cursor even on top of a creature.
        if let Some(a) = aim.as_ref() {
            // Vintage CRT terminal green — same hue as classic
            // roguelike target reticules and our "in-FOV but unlit"
            // wash, scaled brighter for foreground emphasis.
            let retro = Color::new(0.40, 1.00, 0.35, 0.95);
            let retro_soft = Color::new(0.40, 1.00, 0.35, 0.22);
            let thick = (tile * 0.07).max(1.0);
            // Radius preview — every tile inside the splash gets a
            // translucent green wash so the player sees the blast
            // footprint before committing.
            if a.radius > 0 {
                let r = a.radius as i32;
                for dy in -r..=r {
                    for dx in -r..=r {
                        let ax = a.cursor.0 + dx;
                        let ay = a.cursor.1 + dy;
                        if !level.map.in_bounds(ax, ay) { continue; }
                        let sx = ox + ax as f32 * tile;
                        let sy = oy + ay as f32 * tile;
                        draw_rectangle(sx, sy, tile, tile, retro_soft);
                    }
                }
            }
            // Distance to cursor as Chebyshev so we can dim the
            // reticule when the player aimed past their reach.
            let cheb = (a.cursor.0 - px as i32).abs()
                .max((a.cursor.1 - py as i32).abs());
            let in_range = cheb <= a.range;
            let outline = if in_range { retro } else {
                Color::new(0.95, 0.30, 0.30, 0.85)
            };
            // Box around the cursor tile.
            let bx = ox + a.cursor.0 as f32 * tile;
            let by = oy + a.cursor.1 as f32 * tile;
            draw_rectangle_lines(bx, by, tile, tile, thick * 1.5, outline);
            // Centre crosshair so the target tile reads even when
            // it's the same colour as the floor underneath.
            let cx = bx + tile * 0.5;
            let cy = by + tile * 0.5;
            let arm = tile * 0.22;
            draw_line(cx - arm, cy, cx + arm, cy, thick, outline);
            draw_line(cx, cy - arm, cx, cy + arm, thick, outline);
        }

        // Event log sidebar on the right — entries persist instead of fading.
        ui::draw_log_sidebar(&log, status_h);

        // Status strip. While the aim overlay is up, the hint flips
        // to the targeting controls so the player can find Tab /
        // arrows / Enter without reaching for a manual. Otherwise it
        // shows the standard movement + UI bindings.
        let font_size = (status_h * 0.75).max(12.0);
        let baseline = screen_height() - status_h * 0.25;
        let strip = if let Some(a) = aim.as_ref() {
            let verb = match a.kind {
                AimKind::Fire  => "Fire",
                AimKind::Throw => "Throw",
            };
            let mode = if a.cycle_idx.is_some() {
                "Arrows: cycle targets  |  Tab: free cursor"
            } else {
                "Arrows: move cursor  |  Tab: snap to enemy"
            };
            format!(
                "Floor {}  |  {} mode  |  {}  |  Enter: commit  |  Esc: cancel",
                level.num, verb, mode,
            )
        } else {
            format!(
                "Floor {}  |  WASD move  |  F fire  |  T throw  |  Z swap  |  I inv  |  Tab equip  |  C craft  |  Esc menu",
                level.num,
            )
        };
        draw_text(&strip, ox.max(8.0), baseline, font_size, ui::retro_green());

        ui::draw_health_bar(hp, hp_max, status_h);
        ui::draw_armor_badge(player_ac, status_h);

        // Department-ability HUD displays
        let mut ability_y = baseline - status_h * 0.5;

        // Science Bio-scanner: display detected creatures on HUD
        if player_class == Some(classes::PlayerClass::Science) {
            let scan_range = 10;
            let sensed_creatures: Vec<_> = level.monsters.iter()
                .filter(|m| m.hit_at.is_none()) // Only living creatures
                .filter_map(|m| {
                    let dx = (m.x as i32 - px as i32).abs();
                    let dy = (m.y as i32 - py as i32).abs();
                    if dx <= scan_range && dy <= scan_range {
                        let dist_sq = dx * dx + dy * dy;
                        if (dist_sq as f32).sqrt() <= scan_range as f32 {
                            Some((m.kind.name(), m.hp, m.x, m.y))
                        } else {
                            None
                        }
                    } else {
                        None
                    }
                })
                .collect();

            if !sensed_creatures.is_empty() {
                let scan_text = if sensed_creatures.len() == 1 {
                    format!("[BIO-SCANNER] {} creature detected", sensed_creatures.len())
                } else {
                    format!("[BIO-SCANNER] {} creatures detected", sensed_creatures.len())
                };
                draw_text(
                    &scan_text,
                    ox.max(8.0), ability_y, font_size * 0.8, Color::new(0.3, 0.8, 1.0, 1.0),
                );
                ability_y -= status_h * 0.35;
            }
        }

        // Security Combat Stims: display remaining turns and status.
        if player_class == Some(classes::PlayerClass::Security) {
            let (stims_text, color) = if combat_stims_turns_left > 0 {
                (
                    format!("[COMBAT STIMS] ACTIVE ({} turns remaining)", combat_stims_turns_left),
                    Color::new(1.0, 0.3, 0.3, 1.0),
                )
            } else if combat_stims_cooldown_turns > 0 {
                (
                    format!("[COMBAT STIMS] Recharging ({} turns)", combat_stims_cooldown_turns),
                    Color::new(0.8, 0.6, 0.3, 1.0),
                )
            } else {
                (
                    "[COMBAT STIMS] Ready (Press Z)".to_string(),
                    Color::new(0.3, 1.0, 0.3, 1.0),
                )
            };
            draw_text(&stims_text, ox.max(8.0), ability_y, font_size * 0.8, color);
        }

        // Overlays last, so they sit on top of the HUD.
        if let Some(loot_idx) = looting {
            if let Some(prop) = level.props.get(loot_idx) {
                let contents = prop.contents.as_deref().unwrap_or(&[]);
                let label = prop.display_name();
                ui::draw_loot_screen(&sprites, label, contents, &mut loot_scroll);
                if let Some(prompt) = &pending_loot_prompt {
                    if let Some(&kind) = contents.get(prompt.entry_idx) {
                        ui::draw_item_prompt(kind, prompt.mode, ui::ItemPromptContext::Loot);
                    } else {
                        pending_loot_prompt = None;
                    }
                }
            } else {
                // Prop went away (shouldn't happen in normal flow);
                // bail out of loot mode so the player isn't stuck.
                looting = None;
            }
        } else if show_inventory {
            ui::draw_inventory(&sprites, &inventory, &inv_collapsed, &mut inv_scroll);
            if let Some(prompt) = &pending_item_prompt {
                if let Some(entry) = inventory.entries.get(prompt.entry_idx) {
                    ui::draw_item_prompt(entry.kind, prompt.mode, ui::ItemPromptContext::Inventory);
                } else {
                    pending_item_prompt = None;
                }
            }
        } else if show_equipment {
            ui::draw_equipment(
                &sprites, &equipment, &inventory,
                equip_focus, equip_examining, &mut equip_scroll,
            );
        } else if show_crafting {
            ui::draw_crafting(
                &sprites, &inventory,
                crafting_focus, crafting_quantity,
                &mut crafting_scroll,
            );
        }
        // Pause menu always wins the topmost layer — we let it draw
        // *after* the other overlays so it'd cover them, but the
        // overlay-mutex logic in the input handlers means only the
        // pause menu is ever open at a time anyway.
        if show_pause_menu {
            ui::draw_pause_menu(pause_selection);
        }

        // If the inventory just closed (auto-close via Y, manual close
        // via Esc or I), any movement key still held gets latched as
        // "needs release" so it doesn't spill over into a step next
        // frame. Close also clears any stale pending confirm.
        if was_inventory_open && !show_inventory {
            for kc in bindings.movement_keys() {
                if is_key_down(kc) && !input_suppressed.contains(&kc) {
                    input_suppressed.push(kc);
                }
            }
            pending_item_prompt = None;
        }
        was_inventory_open = show_inventory;

        next_frame().await;
    }
}
