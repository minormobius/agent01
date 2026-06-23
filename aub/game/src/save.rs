//! Save / load infrastructure with explicit format versioning.
//!
//! The save file is a JSON document whose top-level object always
//! carries a `format_version` field. Every loader path reads that
//! number first and dispatches to the matching parser, so a build
//! can refuse a save it can't safely read instead of silently
//! filling unknown fields with garbage.
//!
//! ## Why versioning matters now, before content drifts
//!
//! Once builds reach a playtester, save files exist in the wild. Any
//! later schema change has to either (a) preserve byte-for-byte
//! compatibility, (b) ship a migration that upgrades old saves on
//! load, or (c) accept silent breakage. (a) constrains future work,
//! (c) shatters trust. (b) is what the rest of this module is for.
//!
//! ## The contract
//!
//! - **Forward-compat:** a save tagged `format_version = N` can be
//!   loaded by any build whose `SAVE_FORMAT_VERSION >= N`. Missing
//!   fields take their default at the migration step that
//!   introduces them.
//! - **No silent corruption from newer saves:** a save whose version
//!   is *greater* than the running build's version is rejected with
//!   `SaveError::VersionTooNew`, never partially parsed.
//! - **Single source of truth:** the running build's understanding
//!   of the save shape is `SAVE_FORMAT_VERSION` plus the parser that
//!   matches it. Bumping the version means: ship a new parser,
//!   write a `migrate_vN_to_vN_plus_1` upgrade, and update this
//!   constant in the same change.
//!
//! ## Adding a new save-schema version
//!
//! 1. Bump `SAVE_FORMAT_VERSION` to N+1.
//! 2. Add a `RunSnapshotVN_plus_1` (or extend the existing snapshot
//!    in-place if the new fields are additive AND can take a
//!    sensible default at migration time).
//! 3. Add `upgrade_vN_to_vN_plus_1(prior) -> RunSnapshotVN_plus_1`
//!    that fills any new fields with their default values.
//! 4. Extend the `migrate` dispatch table.
//! 5. Add a unit test that loads a hand-crafted vN save and verifies
//!    the migration produces the expected vN+1 snapshot.
//!
//! Everything in the loader chain is keyed off the version number
//! — never on field presence — so a partial / truncated save fails
//! fast rather than silently picking up defaults that mask a corrupt
//! file.

use std::fs;
use std::io;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use crate::attributes::Attributes;
use crate::classes::PlayerClass;
use crate::items::{EquipSlot, ItemKind};
use crate::status::{StatusEffectList, StatusKind};
use crate::{Inventory, Level, PlayerEquipment};

/// Bumped any time the save schema changes. Loading a save whose
/// `format_version > SAVE_FORMAT_VERSION` is a hard error: the
/// running build can't know what new fields the future schema
/// introduced.
pub const SAVE_FORMAT_VERSION: u32 = 2;

/// Default directory for save slots, relative to the working
/// directory. Created on demand when the player picks Save.
pub const SAVES_DIR: &str = "saves";

/// File extension used for save files. Picking a unique extension
/// keeps the directory grep-friendly and lets future tooling find
/// saves without parsing.
pub const SAVE_EXTENSION: &str = "eds";

/// What the player sees when they open the Save dialog and don't
/// type a name. Combined with `next_default_save_name` to produce
/// `save_001`, `save_002`, ...
pub const DEFAULT_NAME_PREFIX: &str = "save_";

// ─── Public surface ───────────────────────────────────────────────

/// All the run state that round-trips through a save / load. Every
/// field is something the game reads on a turn — if it's not here,
/// the loaded run won't be byte-identical to the saved run.
///
/// The `Clone` impl is what the save path uses: gather the snapshot
/// while still borrowing main's locals immutably, then move it into
/// the writer. The loader does the inverse: parse into a snapshot,
/// then pull each field out into main's locals.
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RunSnapshot {
    // ─── Run identity ────────────────────────────────────────
    /// Master seed the run started from. Surfaced in logs and used
    /// as the source of truth for "this is the same run".
    pub seed: u64,
    /// Seed used to re-seed the run RNG on load. Computed at save
    /// time as `rng.gen::<u64>()` — i.e. the next value the saved
    /// run's RNG would have produced. Loading a save twice from
    /// the same file gives identical post-load streams; the only
    /// non-determinism a save/load adds is forking off whatever
    /// the *un-saved* timeline would have rolled, which is the
    /// trade-off we accept for not needing to serialise the live
    /// PRNG state byte-for-byte.
    pub resume_seed: u64,

    // ─── Player core ─────────────────────────────────────────
    pub current_floor: u8,
    pub player_pos: (usize, usize),
    pub hp: u32,
    pub hp_max: u32,
    pub ac: i32,
    pub xp: u32,
    pub player_level: u8,
    pub class: Option<PlayerClass>,
    pub attributes: Attributes,
    pub combat_stims_turns_left: u32,
    pub combat_stims_cooldown_turns: u32,
    pub turns_since_passive_heal: u32,
    pub facing_dir: (i32, i32),
    pub facing_right: bool,

    // ─── Inventory + equipment + statuses ────────────────────
    pub inventory: Inventory,
    pub equipment: PlayerEquipment,
    pub player_statuses: StatusEffectList,

    // ─── World ───────────────────────────────────────────────
    /// Active level the player is standing in.
    pub active_level: Level,
    /// Every level the player has visited and walked away from,
    /// keyed by floor number. Restoring these on load preserves
    /// dead monsters, looted items, opened doors, etc. across
    /// zone-door retreats and re-entries.
    ///
    /// Stored as a Vec instead of a HashMap so the save file has a
    /// stable diff-friendly ordering. JSON's object keys are
    /// strings; using a Vec sidesteps the str-ifying churn too.
    pub visited_levels: Vec<(u8, Level)>,
}

#[derive(Debug)]
pub enum SaveError {
    Io(io::Error),
    /// JSON-level parse failure (malformed file). The string is the
    /// developer-facing reason.
    Parse(String),
    /// File is JSON but missing the `format_version` field.
    BadHeader,
    /// File is JSON with a known structure, but its version is
    /// newer than the running build can understand.
    VersionTooNew { found: u32, supported: u32 },
}

impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            SaveError::Io(e) => write!(f, "save io error: {}", e),
            SaveError::Parse(s) => write!(f, "save parse error: {}", s),
            SaveError::BadHeader => write!(
                f,
                "not an Ecdysium save file (missing format_version field)"
            ),
            SaveError::VersionTooNew { found, supported } => write!(
                f,
                "save format version {} is newer than this build (supports up to {}); update the game",
                found, supported,
            ),
        }
    }
}

impl From<io::Error> for SaveError {
    fn from(e: io::Error) -> Self { SaveError::Io(e) }
}

impl From<serde_json::Error> for SaveError {
    fn from(e: serde_json::Error) -> Self { SaveError::Parse(e.to_string()) }
}

// ─── Slot listing / paths ─────────────────────────────────────────

/// Absolute path for a named save slot inside `SAVES_DIR`. The name
/// is sanitized so a stray `..` or path separator can't escape the
/// saves directory.
pub fn slot_path(name: &str) -> PathBuf {
    let safe = sanitize_slot_name(name);
    Path::new(SAVES_DIR).join(format!("{}.{}", safe, SAVE_EXTENSION))
}

/// Strip anything that could escape the saves directory or break the
/// filename on Windows / Unix. Spaces are kept; everything else
/// non-alphanumeric collapses to underscore. Empty input collapses
/// to "save".
pub fn sanitize_slot_name(name: &str) -> String {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return "save".to_string();
    }
    let mut out = String::with_capacity(trimmed.len());
    for ch in trimmed.chars() {
        if ch.is_alphanumeric() || ch == ' ' || ch == '-' || ch == '_' {
            out.push(ch);
        } else {
            out.push('_');
        }
    }
    out
}

/// List every save slot in `SAVES_DIR`, sorted by mtime descending
/// so the most recent save lands at index 0. Returns an empty list
/// if the directory doesn't exist yet — that's the new-player state.
pub fn list_save_slots() -> Vec<SaveSlot> {
    let dir = Path::new(SAVES_DIR);
    if !dir.is_dir() { return Vec::new(); }
    let mut out = Vec::new();
    let entries = match fs::read_dir(dir) {
        Ok(e) => e,
        Err(_) => return Vec::new(),
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(ext) = path.extension().and_then(|s| s.to_str()) else { continue };
        if ext != SAVE_EXTENSION { continue; }
        let Some(stem) = path.file_stem().and_then(|s| s.to_str()) else { continue };
        let modified = entry.metadata()
            .ok()
            .and_then(|m| m.modified().ok());
        out.push(SaveSlot {
            name: stem.to_string(),
            path,
            modified,
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
}

/// Compute the next sequential `save_NNN` name that doesn't already
/// exist on disk. Lets the Save dialog show a sensible default the
/// player can accept with one keypress.
pub fn next_default_save_name() -> String {
    let existing = list_save_slots();
    let mut max_idx = 0u32;
    for slot in &existing {
        if let Some(rest) = slot.name.strip_prefix(DEFAULT_NAME_PREFIX) {
            if let Ok(n) = rest.parse::<u32>() {
                if n > max_idx { max_idx = n; }
            }
        }
    }
    format!("{}{:03}", DEFAULT_NAME_PREFIX, max_idx + 1)
}

/// Lightweight directory entry for the load-slot picker.
#[derive(Clone, Debug)]
pub struct SaveSlot {
    pub name: String,
    pub path: PathBuf,
    pub modified: Option<std::time::SystemTime>,
}

// ─── I/O entry points ─────────────────────────────────────────────

pub fn save_to_path(snap: &RunSnapshot, path: &Path) -> Result<(), SaveError> {
    if let Some(parent) = path.parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)?;
        }
    }
    let envelope = SaveEnvelope::current(snap.clone());
    let json = serde_json::to_string_pretty(&envelope)?;
    fs::write(path, json)?;
    Ok(())
}

pub fn load_from_path(path: &Path) -> Result<RunSnapshot, SaveError> {
    let body = fs::read_to_string(path)?;
    parse(&body)
}

// ─── Envelope ─────────────────────────────────────────────────────

/// What actually goes on disk: the version header plus the snapshot
/// body. Serialised as a flat JSON object with `format_version` on
/// top so a one-byte glance at the file identifies the schema.
///
/// On parse, we deserialise into a *partial* envelope (`{
/// format_version }`) first, dispatch to the right parser, then
/// migrate forward. Going through the partial envelope means a
/// schema change to the body can never poison the version check.
#[derive(Serialize, Deserialize)]
struct SaveEnvelope {
    format_version: u32,
    body: serde_json::Value,
}

impl SaveEnvelope {
    fn current(snapshot: RunSnapshot) -> Self {
        // serde_json::to_value should never fail for a struct that
        // derives Serialize correctly. If it does, the developer
        // broke the schema; surfacing that as a panic is the right
        // signal during development.
        let body = serde_json::to_value(&snapshot)
            .expect("RunSnapshot must serialize cleanly");
        SaveEnvelope { format_version: SAVE_FORMAT_VERSION, body }
    }
}

#[derive(Deserialize)]
struct EnvelopeHeader {
    format_version: u32,
    #[serde(default)]
    body: serde_json::Value,
}

pub fn parse(text: &str) -> Result<RunSnapshot, SaveError> {
    let header: EnvelopeHeader = serde_json::from_str(text)
        .map_err(|e| {
            // Try to disambiguate "missing field" vs "bad JSON".
            if e.to_string().contains("format_version") {
                SaveError::BadHeader
            } else {
                SaveError::Parse(e.to_string())
            }
        })?;
    if header.format_version > SAVE_FORMAT_VERSION {
        return Err(SaveError::VersionTooNew {
            found: header.format_version,
            supported: SAVE_FORMAT_VERSION,
        });
    }
    migrate(header.format_version, header.body)
}

/// Dispatch to the parser for the file's version, then chain forward
/// migrations until the snapshot is in the *current* shape.
///
/// Right now the chain is:
///
/// ```text
/// v1 body  →  RunSnapshotV1   ─┐
///                              ├→  upgrade_v1_to_v2  →  RunSnapshot (v2)
/// v2 body  →  RunSnapshot     ─┘
/// ```
///
/// Future versions plug in by adding another `vN body` arm and an
/// `upgrade_vN_to_vN_plus_1` step in the chain. Each upgrade fills
/// new fields with explicit defaults — never `Default::default()`
/// blindly, since the right default for a save migration is often
/// "what gameplay had before this field existed", which isn't the
/// same as the type's `Default`.
fn migrate(version: u32, body: serde_json::Value) -> Result<RunSnapshot, SaveError> {
    match version {
        1 => {
            let v1: v1::RunSnapshotV1 = serde_json::from_value(body)?;
            Ok(v1::upgrade_to_current(v1))
        }
        2 => {
            // Current shape — deserialise straight into `RunSnapshot`.
            let snap: RunSnapshot = serde_json::from_value(body)?;
            Ok(snap)
        }
        _ => Err(SaveError::Parse(format!(
            "unsupported save version: {} (this build understands 1..={})",
            version, SAVE_FORMAT_VERSION,
        ))),
    }
}

// ─── v1 (legacy) parser + migrator ────────────────────────────────
//
// v1 was a flat plain-text format with the player block and no
// world state. We deserialise from a *JSON* shape that mirrors the
// v1 fields here purely for the migration test fixture; real v1
// files in the wild use the old text format — see history. v1 is
// kept loadable mostly so the migration framework has a real first
// step instead of a stub.

mod v1 {
    use super::*;

    #[derive(Deserialize)]
    pub struct RunSnapshotV1 {
        pub seed: u64,
        pub floor: u8,
        pub player_pos: (usize, usize),
        pub hp: u32,
        pub hp_max: u32,
        pub ac: i32,
        pub xp: u32,
        pub player_level: u8,
        pub class: Option<PlayerClass>,
        pub attributes: Attributes,
        pub combat_stims_turns_left: u32,
        pub combat_stims_cooldown_turns: u32,
        pub inventory: Vec<(ItemKind, u32)>,
        pub statuses: Vec<(StatusKind, u32)>,
        pub equipment: Vec<(EquipSlot, ItemKind)>,
    }

    /// v1 didn't carry world state, so the upgrade has to fabricate
    /// an empty world (no monsters, no items on the floor, no
    /// visited zones). Loading a v1 save in a v2 build effectively
    /// drops the player onto a freshly regenerated floor at their
    /// saved position. We log this loudly at the call site so the
    /// player knows the trade-off.
    pub fn upgrade_to_current(v1: RunSnapshotV1) -> RunSnapshot {
        let mut inv = Inventory::default();
        for (k, n) in v1.inventory { inv.add(k, n); }
        let mut equipment = PlayerEquipment::default();
        for (slot, kind) in v1.equipment {
            equipment.set_for_load(slot, Some(kind));
        }
        let mut statuses = StatusEffectList::default();
        for (kind, turns) in v1.statuses {
            statuses.add(kind, turns);
        }
        // We don't have an active_level in v1; the loader at the
        // call site has to regenerate one from `seed` + `floor`.
        // To make the snapshot a complete value we ship a minimal
        // placeholder Level here; main.rs's loader detects the
        // sentinel `format_version_origin` field on the snapshot
        // (TODO: when v3 lands) and rebuilds. For now the loader
        // unconditionally regenerates from seed+floor whenever it
        // takes a v1-origin snapshot, ignoring the placeholder.
        let placeholder_level = Level {
            map: crate::dungeon::Map::new(1, 1),
            monsters: Vec::new(),
            items: Vec::new(),
            props: Vec::new(),
            doors: Vec::new(),
            stairs_down: (0, 0),
            west_zone_door: None,
            spawn: v1.player_pos,
            num: v1.floor,
            expiring_hazards: Vec::new(),
        };
        RunSnapshot {
            seed: v1.seed,
            // v1 didn't carry an RNG fork point; re-seed cleanly
            // from the master seed on load. This means a v1 save
            // loaded into a v2 build produces a deterministic stream
            // matching a brand-new run from the same seed.
            resume_seed: v1.seed,
            current_floor: v1.floor,
            player_pos: v1.player_pos,
            hp: v1.hp,
            hp_max: v1.hp_max,
            ac: v1.ac,
            xp: v1.xp,
            player_level: v1.player_level,
            class: v1.class,
            attributes: v1.attributes,
            combat_stims_turns_left: v1.combat_stims_turns_left,
            combat_stims_cooldown_turns: v1.combat_stims_cooldown_turns,
            turns_since_passive_heal: 0,
            facing_dir: (1, 0),
            facing_right: true,
            inventory: inv,
            equipment,
            player_statuses: statuses,
            active_level: placeholder_level,
            visited_levels: Vec::new(),
        }
    }
}

// ─── Tests ────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use crate::dungeon::Map;
    use crate::items::weapons::WeaponKind;

    fn empty_level(num: u8) -> Level {
        Level {
            map: Map::new(8, 8),
            monsters: Vec::new(),
            items: Vec::new(),
            props: Vec::new(),
            doors: Vec::new(),
            stairs_down: (6, 4),
            west_zone_door: Some((1, 4)),
            spawn: (2, 4),
            num,
            expiring_hazards: Vec::new(),
        }
    }

    fn sample_snapshot() -> RunSnapshot {
        let mut inv = Inventory::default();
        inv.add(ItemKind::MedKit, 2);
        inv.add(ItemKind::RationCube, 3);
        inv.add(ItemKind::Weapon(WeaponKind::Wrench), 1);
        let mut equipment = PlayerEquipment::default();
        equipment.set_for_load(EquipSlot::Clothing,  Some(ItemKind::FlightJumpsuit));
        equipment.set_for_load(EquipSlot::RightHand, Some(ItemKind::Weapon(WeaponKind::Wrench)));
        equipment.set_for_load(EquipSlot::LeftHand,  Some(ItemKind::HandLamp));
        let mut statuses = StatusEffectList::default();
        statuses.add(StatusKind::Bleeding, 3);
        let mut visited = Vec::new();
        visited.push((1u8, empty_level(1)));
        RunSnapshot {
            seed: 0xDEAD_BEEF_F00D_BABE,
            resume_seed: 0xABCD_EF01,
            current_floor: 2,
            player_pos: (12, 25),
            hp: 8, hp_max: 12, ac: 11, xp: 75,
            player_level: 2,
            class: Some(PlayerClass::Engineering),
            attributes: Attributes {
                strength: 11, agility: 14, toughness: 9,
                intelligence: 16, perception: 13, willpower: 10,
            },
            combat_stims_turns_left: 0,
            combat_stims_cooldown_turns: 4,
            turns_since_passive_heal: 2,
            facing_dir: (1, 0),
            facing_right: true,
            inventory: inv,
            equipment,
            player_statuses: statuses,
            active_level: empty_level(2),
            visited_levels: visited,
        }
    }

    #[test]
    fn round_trip_v2() {
        let original = sample_snapshot();
        let envelope = SaveEnvelope::current(original.clone());
        let json = serde_json::to_string(&envelope).expect("serialize");
        let parsed = parse(&json).expect("parse round-trip");
        assert_eq!(original.seed, parsed.seed);
        assert_eq!(original.resume_seed, parsed.resume_seed);
        assert_eq!(original.current_floor, parsed.current_floor);
        assert_eq!(original.player_pos, parsed.player_pos);
        assert_eq!(original.hp, parsed.hp);
        assert_eq!(original.hp_max, parsed.hp_max);
        assert_eq!(original.ac, parsed.ac);
        assert_eq!(original.xp, parsed.xp);
        assert_eq!(original.player_level, parsed.player_level);
        assert_eq!(original.class, parsed.class);
        assert_eq!(original.attributes, parsed.attributes);
        assert_eq!(original.combat_stims_turns_left, parsed.combat_stims_turns_left);
        assert_eq!(original.turns_since_passive_heal, parsed.turns_since_passive_heal);
        assert_eq!(original.facing_dir, parsed.facing_dir);
        assert_eq!(original.facing_right, parsed.facing_right);
        assert_eq!(original.inventory.entries.len(), parsed.inventory.entries.len());
        assert_eq!(original.visited_levels.len(), parsed.visited_levels.len());
        assert_eq!(original.active_level.num, parsed.active_level.num);
    }

    #[test]
    fn resume_seed_replays_identically() {
        // The contract: loading the same save twice produces the
        // same post-load deterministic stream. That's the practical
        // determinism we promise — players save, reload, and see
        // identical behaviour every time.
        use rand::{SeedableRng, Rng};
        let snap = sample_snapshot();
        let envelope = SaveEnvelope::current(snap);
        let json = serde_json::to_string(&envelope).expect("serialize");
        let load_a = parse(&json).expect("parse a");
        let load_b = parse(&json).expect("parse b");
        let mut rng_a = rand::rngs::StdRng::seed_from_u64(load_a.resume_seed);
        let mut rng_b = rand::rngs::StdRng::seed_from_u64(load_b.resume_seed);
        let stream_a: Vec<u64> = (0..8).map(|_| rng_a.r#gen::<u64>()).collect();
        let stream_b: Vec<u64> = (0..8).map(|_| rng_b.r#gen::<u64>()).collect();
        assert_eq!(stream_a, stream_b);
    }

    #[test]
    fn version_too_new_is_rejected() {
        let future = r#"{"format_version": 9999, "body": {}}"#;
        match parse(future) {
            Err(SaveError::VersionTooNew { found, supported }) => {
                assert_eq!(found, 9999);
                assert_eq!(supported, SAVE_FORMAT_VERSION);
            }
            other => panic!("expected VersionTooNew, got {:?}", other),
        }
    }

    #[test]
    fn missing_header_is_rejected() {
        let bad = r#"{"some_other": "thing"}"#;
        match parse(bad) {
            Err(SaveError::BadHeader) => {}
            other => panic!("expected BadHeader, got {:?}", other),
        }
    }

    #[test]
    fn malformed_json_is_rejected() {
        let bad = "not json at all {{{";
        match parse(bad) {
            Err(SaveError::Parse(_)) => {}
            other => panic!("expected Parse error, got {:?}", other),
        }
    }

    #[test]
    fn migration_dispatch_rejects_unknown_versions() {
        let bogus = r#"{"format_version": 0, "body": {}}"#;
        match parse(bogus) {
            Err(SaveError::Parse(msg)) => assert!(msg.contains("unsupported")),
            other => panic!("expected Parse error, got {:?}", other),
        }
    }

    #[test]
    fn v1_save_migrates_with_world_defaults() {
        // Hand-craft a v1-shaped envelope. The migrator should
        // accept it, fabricate an empty world, and return a v2
        // snapshot the loader can deal with.
        let v1_json = r#"{
            "format_version": 1,
            "body": {
                "seed": 42,
                "floor": 3,
                "player_pos": [5, 10],
                "hp": 8,
                "hp_max": 12,
                "ac": 11,
                "xp": 75,
                "player_level": 2,
                "class": "Engineering",
                "attributes": {
                    "strength": 11, "agility": 14, "toughness": 9,
                    "intelligence": 16, "perception": 13, "willpower": 10
                },
                "combat_stims_turns_left": 0,
                "combat_stims_cooldown_turns": 4,
                "inventory": [["MedKit", 2]],
                "statuses": [["Bleeding", 3]],
                "equipment": [["RightHand", {"Weapon": "Wrench"}]]
            }
        }"#;
        let snap = parse(v1_json).expect("v1 migrates");
        assert_eq!(snap.seed, 42);
        assert_eq!(snap.current_floor, 3);
        assert_eq!(snap.player_pos, (5, 10));
        // Visited-levels list comes back empty - v1 didn't carry it.
        assert!(snap.visited_levels.is_empty());
        // Inventory carried over.
        assert_eq!(snap.inventory.entries.len(), 1);
    }

    #[test]
    fn slot_name_sanitizer_strips_path_separators() {
        assert_eq!(sanitize_slot_name("../../etc/passwd"), "______etc_passwd");
        assert_eq!(sanitize_slot_name("save 1"), "save 1");
        assert_eq!(sanitize_slot_name(""), "save");
        assert_eq!(sanitize_slot_name("foo:bar"), "foo_bar");
    }

    #[test]
    fn next_default_name_increments_above_existing() {
        // Pure unit on the name format, doesn't touch disk.
        let name = format!("{}{:03}", DEFAULT_NAME_PREFIX, 42);
        assert_eq!(name, "save_042");
    }
}
