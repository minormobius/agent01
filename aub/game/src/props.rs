//! Stationary, interactible objects that sit on top of map tiles.
//!
//! Props are the "third layer" of the world after the dungeon (`Map`)
//! and its inhabitants (`Monster`, items). They differ from hazard
//! tiles in two ways:
//!
//!   1. **They are sprites, not tiles.** A prop's visual footprint can
//!      extend across multiple tile cells (e.g. a 32×64 cryo tube that
//!      anchors at one floor tile but also paints over the wall tile
//!      directly above it). The map underneath stays a `Tile::Wall` /
//!      `Tile::Floor` — props just draw on top in a separate pass.
//!   2. **They carry data.** A prop can hold a description (cryo tube,
//!      console screen text), an inventory of contained items (locker,
//!      crate), or a terminal state (computer, control panel). The
//!      `PropInteraction` enum covers what a "bump" or "use" does;
//!      lockers and terminals plug into the same rendering and
//!      placement plumbing as cryo tubes by picking a different variant.
//!
//! ## Adding a new prop
//!
//! 1. Add a variant to `PropKind`.
//! 2. Return a `PropTemplate` for it from `PropKind::template()`. The
//!    template owns: name, description, sprite path, footprint in tiles,
//!    anchor (which tile cell `pos` refers to), whether it blocks
//!    movement, and what `PropInteraction` a bump triggers.
//! 3. Pre-load the sprite in `Sprites::build` (it walks `PropKind::ALL`).
//! 4. Place a `Prop { kind, pos, contents: None }` in the relevant
//!    `Level` during generation.
//!
//! Containers (lockers) populate `Prop::contents` on placement; the
//! interaction path opens the contents into the player's inventory.
//! Terminals re-use the same struct and just trigger a different
//! interaction — the dispatch happens in the bump handler in `main.rs`.

use crate::items::{ItemKind, weapons::WeaponKind};

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
pub enum PropKind {
    /// Empty cryo-tube — the one the survivor wakes up in. 32×64
    /// (1 tile wide, 2 tall). Anchored at the bottom tile; the top
    /// half overlaps the wall tile to its north so the tube reads as
    /// floor-to-ceiling. Animated diagnostic readout drives the lid.
    CryoTube,
    /// Occupied cryo-tube — same shell as `CryoTube` but a colonist
    /// is suspended inside, vitals nominal. The tube's panel reports
    /// the player has no permission to access its systems, so the
    /// `interaction` is `Locked` rather than `Examine`.
    CryoTubeOccupied,
    /// Unlocked supply locker. 32×64 like the cryo tube, but the
    /// sprite sheet packs two 32×64 frames side by side that the
    /// renderer alternates between for an idle animation. Contains
    /// loot the player drains into inventory on interact.
    LockerUnlocked,
    /// Storage crate. 1x1 tile, blocks movement, contents drain on
    /// interact. Default contents: 1d6 random junk items, with a
    /// 20% chance of an additional non-junk drop. Spawned with
    /// some probability per room during level generation.
    StorageCrate,
    /// Deactivated custodian bot. 1×1, blocks movement, flavour-
    /// only Examine interaction. Slumped against the janitor
    /// closet's locker for now; later could be reactivable as a
    /// quest prop.
    CustodibotDeactivated,
}

/// Tunable per-prop fields loaded from `assets/data/props.json`.
/// Identity / structural fields (name + description i18n keys,
/// sprite path, footprint, anchor, interaction kind) stay in the
/// source-side template arm — they're not balance levers.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct PropData {
    pub passable: bool,
    pub animation: PropAnimation,
}

const PROP_DATA_JSON: &str = include_str!("../assets/data/props.json");

fn prop_data_table() -> &'static std::collections::HashMap<&'static str, PropData> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static TABLE: OnceLock<HashMap<&'static str, PropData>> = OnceLock::new();
    TABLE.get_or_init(|| {
        let parsed: serde_json::Value = serde_json::from_str(PROP_DATA_JSON)
            .expect("props.json must be valid JSON");
        let object = parsed.as_object()
            .expect("props.json must be a JSON object");
        let mut m: HashMap<&'static str, PropData> = HashMap::new();
        for (k, v) in object {
            if k.starts_with('_') { continue; }
            let data: PropData = serde_json::from_value(v.clone())
                .unwrap_or_else(|e| panic!("props.json `{}`: {}", k, e));
            let leaked: &'static str = Box::leak(k.clone().into_boxed_str());
            m.insert(leaked, data);
        }
        m
    })
}

fn prop_data(id: &str) -> PropData {
    *prop_data_table().get(id)
        .unwrap_or_else(|| panic!("props.json: missing entry `{}`", id))
}

impl PropKind {
    /// Catalog of every prop kind. Used by the renderer to pre-load
    /// every sprite asset at startup so draw-time stays allocation-free.
    pub const ALL: &'static [PropKind] = &[
        PropKind::CryoTube,
        PropKind::CryoTubeOccupied,
        PropKind::LockerUnlocked,
        PropKind::StorageCrate,
        PropKind::CustodibotDeactivated,
    ];

    /// Compose a prop template from JSON-loaded data plus the
    /// in-source identity / structural fields. The JSON entry
    /// supplies the tunable bits (`passable`, animation timing);
    /// the rest comes from the match arm.
    pub fn template(self) -> PropTemplate {
        match self {
            PropKind::CryoTube => {
                let d = prop_data("cryo_tube");
                PropTemplate {
                    name: "prop.cryo_tube.name",
                    description: "prop.cryo_tube.description",
                    sprite: "assets/props/cryo_tube_readout.png",
                    footprint: (1, 2),
                    anchor: PropAnchor::Bottom,
                    passable: d.passable,
                    interaction: PropInteraction::Examine,
                    animation: d.animation,
                }
            }
            PropKind::CryoTubeOccupied => {
                let d = prop_data("cryo_tube_occupied");
                PropTemplate {
                    name: "prop.cryo_tube_occupied.name",
                    description: "prop.cryo_tube_occupied.description",
                    sprite: "assets/props/cryo_tube_full.png",
                    footprint: (1, 2),
                    anchor: PropAnchor::Bottom,
                    passable: d.passable,
                    interaction: PropInteraction::Locked {
                        reason: "prop.cryo_tube_occupied.locked_reason",
                    },
                    animation: d.animation,
                }
            }
            PropKind::LockerUnlocked => {
                let d = prop_data("locker_unlocked");
                PropTemplate {
                    name: "prop.locker_unlocked.name",
                    description: "prop.locker_unlocked.description",
                    sprite: "assets/props/locker_unlocked.png",
                    footprint: (1, 2),
                    anchor: PropAnchor::Bottom,
                    passable: d.passable,
                    interaction: PropInteraction::Container,
                    animation: d.animation,
                }
            }
            PropKind::StorageCrate => {
                let d = prop_data("storage_crate");
                PropTemplate {
                    name: "prop.storage_crate.name",
                    description: "prop.storage_crate.description",
                    sprite: "assets/props/storage_crate_1.png",
                    footprint: (1, 1),
                    anchor: PropAnchor::TopLeft,
                    passable: d.passable,
                    interaction: PropInteraction::Container,
                    animation: d.animation,
                }
            }
            PropKind::CustodibotDeactivated => {
                let d = prop_data("custodibot_deactivated");
                PropTemplate {
                    name: "prop.custodibot_deactivated.name",
                    description: "prop.custodibot_deactivated.description",
                    sprite: "assets/original/custodibot/custodibot_deactivated.png",
                    footprint: (1, 1),
                    anchor: PropAnchor::TopLeft,
                    passable: d.passable,
                    interaction: PropInteraction::Examine,
                    animation: d.animation,
                }
            }
        }
    }
}

/// The level-1 starter loadout the cryo-bay locker ships with —
/// the gear the survivor expects to put on the moment they wake up.
/// Centralised here (rather than literal in `levelgen`) so the
/// "what's in the starter locker" decision lives next to the
/// locker's template.
pub fn starter_locker_contents() -> Vec<ItemKind> {
    vec![
        ItemKind::FlightJumpsuit,
        ItemKind::Weapon(WeaponKind::Wrench),
        ItemKind::Weapon(WeaponKind::SurvivalRifle),
        ItemKind::HandLamp,
        ItemKind::UtilityBelt,
    ]
}

/// True iff placing a prop at `pos` would sit on a door tile or
/// directly cardinally-adjacent to one — the "doorway approach".
///
/// Procedural prop placement uses this to avoid impassable props
/// soft-locking a door (a cryo tube wedged in front of a corridor
/// entry would gate off whole rooms). Even passable props get
/// filtered through it for visual cleanliness — a crate sprite
/// stamped on top of a door reads as broken.
pub fn blocks_doorway(
    pos: (usize, usize),
    doors: &[crate::dungeon::Door],
) -> bool {
    doors.iter().any(|d| {
        let (dx, dy) = d.pos;
        let (px, py) = pos;
        if (dx, dy) == (px, py) { return true; }
        let manhattan = (dx as i32 - px as i32).abs()
            + (dy as i32 - py as i32).abs();
        manhattan == 1
    })
}

/// Junk pool — small crafting / utility components that count as
/// "junk" rolls for storage crates. Same set the janitor closet
/// uses, sans the gear-grade items (mop, gloves, etc). One of these
/// is what a junk roll resolves to.
pub const JUNK_ITEMS: &[ItemKind] = &[
    ItemKind::DuctTape,
    ItemKind::Rag,
    ItemKind::GlassBottle,
    ItemKind::Solvent,
    ItemKind::Lighter,
    ItemKind::Battery,
    ItemKind::Bandages,
    ItemKind::WireSpool,
    ItemKind::SheetMetalScrap,
];

/// Non-junk pool — the ~rare-but-not-unique drops a storage crate
/// can produce on its 20% bonus roll. Excludes story items
/// (AdminKeycard) and starting-loadout / craftable gear that the
/// player should earn through other systems.
pub const NON_JUNK_ITEMS: &[ItemKind] = &[
    ItemKind::MedKit,
    ItemKind::RationCube,
    ItemKind::WorkGloves,
    ItemKind::Weapon(WeaponKind::Wrench),
    ItemKind::Weapon(WeaponKind::Mop),
    ItemKind::Weapon(WeaponKind::ScrapPistol),
    ItemKind::Weapon(WeaponKind::ClawedGauntlet),
    ItemKind::Weapon(WeaponKind::ShockProd),
];

/// Roll a storage-crate's contents: 1d6 random junk items, plus a
/// 20% chance of a single non-junk bonus drop.
pub fn storage_crate_contents(rng: &mut ::rand::rngs::StdRng) -> Vec<ItemKind> {
    use ::rand::Rng;
    let mut out = Vec::new();
    let junk_count = rng.gen_range(1..=6);
    for _ in 0..junk_count {
        let kind = JUNK_ITEMS[rng.gen_range(0..JUNK_ITEMS.len())];
        out.push(kind);
    }
    if rng.gen_bool(0.20) {
        let kind = NON_JUNK_ITEMS[rng.gen_range(0..NON_JUNK_ITEMS.len())];
        out.push(kind);
    }
    out
}

/// Stock for the janitor-closet locker — every crafting component
/// the recipe catalog references. Quantities are tuned so the
/// player can craft ~2-3 items right out of the closet without
/// running dry, while still having to choose which loadout to
/// commit to (sheet metal, batteries, and bandages are the
/// scarcity points across the recipe set).
pub fn janitor_locker_contents() -> Vec<ItemKind> {
    let mut out = vec![
        ItemKind::Weapon(WeaponKind::Mop),
        ItemKind::Lighter,
        ItemKind::Battery,
        ItemKind::WorkGloves,
    ];
    // Stackable components — `Inventory::add` collapses identical
    // kinds, so duplicates here translate to count > 1 in the bag.
    for _ in 0..2 { out.push(ItemKind::DuctTape); }
    for _ in 0..2 { out.push(ItemKind::Rag); }
    for _ in 0..2 { out.push(ItemKind::GlassBottle); }
    for _ in 0..2 { out.push(ItemKind::Solvent); }
    for _ in 0..2 { out.push(ItemKind::Bandages); }
    for _ in 0..2 { out.push(ItemKind::WireSpool); }
    for _ in 0..2 { out.push(ItemKind::SheetMetalScrap); }
    out
}

/// Which cell of the prop's footprint `Prop::pos` refers to. Lets us
/// place a 1×2 sprite "against the north wall" by anchoring at the
/// bottom (floor) tile and letting the top half draw over the wall.
/// Future props that anchor on a single tile or face south just pick
/// a different variant.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropAnchor {
    /// `pos` is the bottom row; the sprite extends upward by
    /// `footprint.1 - 1` tiles. Right for tall objects standing
    /// against a north wall.
    Bottom,
    /// `pos` is the top-left cell; the sprite extends right and down.
    /// Right for single-tile props or wide props that occupy floor.
    TopLeft,
}

/// What a "bump" or `use` on the prop triggers. Plain examination is
/// the simplest case; containers spill loot into inventory; terminals
/// drive future minigame / dialogue / unlock systems; locked props
/// log a denial line specific to the lock.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PropInteraction {
    /// Bumping into the prop logs its description.
    Examine,
    /// Bumping into the prop (or pressing E next to it) transfers
    /// everything in `Prop::contents` into the player's inventory.
    Container,
    /// Bumping into the prop hands off to a terminal handler in
    /// `main.rs`. (Reserved for consoles, control panels, etc.)
    Terminal,
    /// Locked — pressing E logs `reason`; bumping still surfaces the
    /// prop's `description`, so the player gets both flavour and
    /// mechanical feedback through separate channels. Use this for
    /// occupied cryo tubes, sealed lockers, restricted consoles.
    Locked { reason: &'static str },
}

/// How a prop's sprite asset is laid out and animated. `Static` is a
/// single frame at full texture extent. `Strip` is a horizontal
/// strip of `frames` cells, each one full sprite-height tall —
/// the renderer slices them and cycles at `frame_seconds` per cell.
#[derive(Clone, Copy, Debug, PartialEq, serde::Deserialize)]
pub enum PropAnimation {
    Static,
    Strip { frames: u32, frame_seconds: f32 },
}

/// Static data for one prop kind. Shape mirrors `ItemTemplate` — every
/// prop variant returns one of these and the rest of the engine reads
/// fields off it instead of matching on the kind directly.
#[derive(Clone, Copy)]
pub struct PropTemplate {
    pub name: &'static str,
    pub description: &'static str,
    pub sprite: &'static str,
    /// `(width, height)` in tiles. The sprite is drawn at exactly this
    /// many tile cells; non-1×1 sprites overlap neighbouring tiles.
    pub footprint: (u32, u32),
    pub anchor: PropAnchor,
    /// `true` when the prop is small enough to walk through (a low
    /// locker, a console you can stand "in front of"). `false` is
    /// for genuine obstacles that fill the whole tile (cryo tube,
    /// crate). Non-anchor cells of multi-tile footprints are always
    /// passable — only the anchor tile is consulted, since a tall
    /// sprite hanging into a wall above shouldn't block the wall too.
    pub passable: bool,
    pub interaction: PropInteraction,
    /// Sprite-sheet layout. `Static` for a one-frame PNG, `Strip` for
    /// a horizontal sprite sheet — each cell is `texture_w / frames`
    /// pixels wide and the full texture height tall. The renderer
    /// reads this to pick the source rect at draw time and to pace
    /// the cycle.
    pub animation: PropAnimation,
}

/// One placed prop in a level. `pos` is the anchor tile per
/// `PropTemplate::anchor`. `contents` is `Some` for containers
/// (locker / crate); other kinds leave it `None`.
#[derive(Clone, Debug, serde::Serialize, serde::Deserialize)]
pub struct Prop {
    pub kind: PropKind,
    pub pos: (usize, usize),
    pub contents: Option<Vec<ItemKind>>,
}

impl Prop {
    pub fn new(kind: PropKind, pos: (usize, usize)) -> Self {
        Self { kind, pos, contents: None }
    }

    /// Container-style prop pre-loaded with a stack of items. The
    /// items move into the player's inventory the first time the
    /// player interacts with the prop.
    pub fn with_contents(
        kind: PropKind,
        pos: (usize, usize),
        contents: Vec<ItemKind>,
    ) -> Self {
        Self { kind, pos, contents: Some(contents) }
    }

    pub fn template(&self) -> PropTemplate {
        self.kind.template()
    }

    /// Localized prop name. The template's `name` field stores
    /// an i18n key; this accessor resolves it through `tr`.
    pub fn display_name(&self) -> &'static str {
        crate::i18n::tr(self.template().name)
    }

    /// Localized prop description (the line a bump prints for
    /// `Examine` / `Locked` props).
    pub fn display_description(&self) -> &'static str {
        crate::i18n::tr(self.template().description)
    }

    /// True iff `(x, y)` is the prop's anchor tile and the prop
    /// isn't passable. Non-anchor cells of multi-tile footprints
    /// remain walkable — only the floor tile the prop "sits on"
    /// is solid, so a tall cryo tube doesn't accidentally make a
    /// chunk of the wall above it count as occupied for FOV/path.
    pub fn blocks(&self, x: usize, y: usize) -> bool {
        let t = self.template();
        !t.passable && (x, y) == self.pos
    }
}
