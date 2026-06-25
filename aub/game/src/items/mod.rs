//! Item catalog — one data template per `ItemKind`.
//!
//! Mirrors `creatures::CreatureTemplate`. Each variant returns an
//! `ItemTemplate` that carries everything the game needs: name,
//! description, sprite reference, use effect, and render scale. Draw
//! code keys off the sprite reference and doesn't need to know about
//! item kinds directly.
//!
//! Weapons live as a sibling module (`items::weapons`) — they're
//! item-like but with enough unique data to warrant their own type.

use macroquad::prelude::Rect;

pub mod weapons;

/// 16×16 atlas cell by 0-indexed column + row.
const fn atlas(col: i32, row: i32) -> Rect {
    Rect {
        x: (col * 16) as f32,
        y: (row * 16) as f32,
        w: 16.0,
        h: 16.0,
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum ItemKind {
    MedKit,
    RationCube,
    /// A weapon picked up from the floor (creature drop). Using it
    /// from inventory swaps it with the currently equipped weapon.
    Weapon(weapons::WeaponKind),
    /// The boss unique drop. Possessing it unlocks the Control Panel
    /// victory condition regardless of whether minions are still
    /// alive — the Station Master's biometric signature beats the lock.
    AdminKeycard,
    /// Standard-issue cryo-pod flight jumpsuit. Body-slot armor;
    /// stacks on top of the survivor's underwear paper-doll layer.
    FlightJumpsuit,
    /// Battery-powered hand lamp. Equipped in the off-hand; widens
    /// the player's bright + dim vision radii while held. First
    /// item with `light_source = Some(...)` — the per-frame vision
    /// recompute scans every equipped slot for one of these and
    /// folds the radii in via `max`.
    HandLamp,

    // ── Janitorial closet salvage ─────────────────────────────────
    // Crafting components scavenged from the maintenance bay. Each
    // is consumable as a recipe input; some also have direct uses.
    // Sprite plumbing is light-weight for now — components without
    // dedicated art point at an atlas placeholder until an icon is
    // authored. See `ecdysium_starting_inventory_and_crafting.md`.
    DuctTape,
    Rag,
    GlassBottle,
    Solvent,
    Lighter,
    Battery,
    Bandages,
    WireSpool,
    WorkGloves,
    SheetMetalScrap,

    // ── Crafted results ───────────────────────────────────────────
    // Produced by `recipes::ALL` recipes. Weapon-class results live
    // under `Weapon(WeaponKind::*)` instead of new top-level
    // variants, so the existing equip / fire / paper-doll plumbing
    // picks them up unchanged. The non-weapon results live here.
    /// Single-use thrown incendiary. Consumable with custom logic
    /// pending; for now exists as a holdable item.
    Molotov,
    /// Refuelable light source + weak melee + ignition. Equips in
    /// `LeftHand`; held-but-not-burning state for now.
    Torch,
    /// Arm-worn shield. Body-slot armor (placeholder slot until a
    /// dedicated arm slot lands).
    ImprovisedShield,
    /// Torso plate. Body-slot armor.
    ChestPlate,
    /// Upgraded heal item. Restores 3 HP and (eventually) clears
    /// poison / radiation status.
    FieldDressing,
    /// Two-pouch waist belt. Equipping it into the `UtilityBelt`
    /// slot unlocks the `RightBelt` and `LeftBelt` pouch slots,
    /// which carry small utility items (hand lamp, etc.). A lamp
    /// clipped to a belt pouch still emits light.
    UtilityBelt,
}

/// Category for UI grouping. Sort order in the inventory screen follows
/// the enum order (top to bottom).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Deserialize)]
pub enum ItemCategory {
    Weapon,       // swappable melee / ranged arms
    Consumable,   // heals, rations, drugs
    Utility,      // detectors, tools, cores
    Protection,   // armor fragments, shields
    Clothing,     // jumpsuits, vests — body-slot wearables
    Junk,         // crafting scrap, misc
}

/// Equipment slot an item occupies when worn / wielded. The variant
/// order is the **canonical iteration order** used by both the
/// equipment screen (top-to-bottom display) and the paper-doll
/// renderer (bottom-up layer ordering): clothing first, armor over
/// it, then per-limb pieces, then hands on top. `Throwable` sits at
/// the tail because it isn't worn — it's the player's currently-
/// designated throw target, addressed by the T key.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Hash, serde::Serialize, serde::Deserialize)]
pub enum EquipSlot {
    Head,
    Face,
    /// Base layer — jumpsuit, fatigues. The first thing you put on.
    Clothing,
    /// Worn over clothing — vests, plate, hazmat. Stacks AC.
    Body,
    RightArm,
    LeftArm,
    RightHand,
    LeftHand,
    Legs,
    Feet,
    /// "Quick-toss" assignment. Whatever item lives here is what the
    /// T key throws. Not actually worn — the paper-doll renderer
    /// ignores it. Populated from inventory; the player can also
    /// route the currently-wielded weapon into it for a throw.
    Throwable,
    /// Stashed weapon. Swapped into the right hand by the Z key
    /// (one-turn cost) or auto-pulled when the player enters fire
    /// mode with a melee weapon wielded and a ranged weapon stashed.
    /// Doesn't contribute light / AC / paper-doll layers — it's a
    /// pocket, not a worn slot.
    ReadyWeapon,
    /// The utility belt itself. Adding one to this slot lets the
    /// player use the two pouch slots (`RightBelt`, `LeftBelt`).
    /// Without a belt, the pouch slots stay refused at equip time.
    UtilityBelt,
    /// Right-hip pouch. Carries small items like the hand lamp,
    /// which still emits light from the belt while clipped here.
    /// Only usable when a `UtilityBelt` is equipped.
    RightBelt,
    /// Left-hip pouch — same rules as `RightBelt`.
    LeftBelt,
}

impl EquipSlot {
    /// Every slot in display / iteration order. Includes
    /// `Throwable` and the belt / ready-weapon stashes at the tail;
    /// consumers that only want the paper-doll/wearable slots should
    /// use `PAPER_DOLL` instead.
    pub const ALL: &'static [EquipSlot] = &[
        Self::Head,
        Self::Face,
        Self::Clothing,
        Self::Body,
        Self::RightArm,
        Self::LeftArm,
        Self::RightHand,
        Self::LeftHand,
        Self::Legs,
        Self::Feet,
        Self::Throwable,
        Self::ReadyWeapon,
        Self::UtilityBelt,
        Self::RightBelt,
        Self::LeftBelt,
    ];

    /// Wearable-only slots — the ten paper-doll layers, no
    /// `Throwable`. Used by the renderer when walking equipped
    /// layers for the player sprite, and by vision-radius scans
    /// where Throwable doesn't make sense.
    pub const PAPER_DOLL: &'static [EquipSlot] = &[
        Self::Head,
        Self::Face,
        Self::Clothing,
        Self::Body,
        Self::RightArm,
        Self::LeftArm,
        Self::RightHand,
        Self::LeftHand,
        Self::Legs,
        Self::Feet,
    ];

    /// Human-readable slot label for the equipment screen.
    /// Returned localized via the i18n table — keys live under
    /// `slot.<id>` in `assets/i18n/en-US.json`.
    pub fn label(self) -> &'static str {
        crate::i18n::tr(match self {
            Self::Head      => "slot.head",
            Self::Face      => "slot.face",
            Self::Clothing  => "slot.clothing",
            Self::Body      => "slot.body",
            Self::RightArm  => "slot.right_arm",
            Self::LeftArm   => "slot.left_arm",
            Self::RightHand => "slot.right_hand",
            Self::LeftHand  => "slot.left_hand",
            Self::Legs        => "slot.legs",
            Self::Feet        => "slot.feet",
            Self::Throwable   => "slot.throwable",
            Self::ReadyWeapon => "slot.ready_weapon",
            Self::UtilityBelt => "slot.utility_belt",
            Self::RightBelt   => "slot.right_belt",
            Self::LeftBelt    => "slot.left_belt",
        })
    }
}

impl ItemCategory {
    pub fn label(self) -> &'static str {
        crate::i18n::tr(match self {
            Self::Weapon     => "category.weapon",
            Self::Consumable => "category.consumable",
            Self::Utility    => "category.utility",
            Self::Protection => "category.protection",
            Self::Clothing   => "category.clothing",
            Self::Junk       => "category.junk",
        })
    }
    /// Rendering order in the inventory panel (top → bottom). Weapons
    /// sit on top so the player reads their current arsenal first.
    pub const ALL: [ItemCategory; 6] = [
        Self::Weapon, Self::Clothing, Self::Protection,
        Self::Consumable, Self::Utility, Self::Junk,
    ];
}

/// How the item's sprite is stored.
///
/// `Atlas` samples from the shared dungeon tileset.
/// `File` points at a standalone PNG by path — the renderer
/// pre-loads every distinct path at startup (see `Sprites::build`)
/// and looks the texture up by that string at render time. This is
/// the recommended path: a template just declares
/// `ItemSprite::File("assets/whatever/foo.png")` with no per-item
/// plumbing on the render side.
/// `Glyph` is a placeholder for items whose dedicated icon hasn't
/// been authored yet — renders a coloured square with an ASCII
/// letter centered on it. Drop in a real sprite by switching the
/// variant to `File(...)` once art lands.
#[derive(Clone, Copy, Debug)]
pub enum ItemSprite {
    Atlas(Rect),
    File(&'static str),
    Glyph { letter: char, color: (u8, u8, u8) },
}

/// Vision radii contributed by a light source while equipped. Items
/// without a `light_source` don't affect view range; items with one
/// raise the player's effective bright / dim radii (the larger of
/// the player base and the equipped light wins). Tweak per-item
/// here to retune individual lamps; tweak `BASE_BRIGHT_RADIUS` /
/// `BASE_DIM_RADIUS` in `main.rs` to retune the unlit baseline.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct LightProfile {
    /// Tiles inside which the world renders at full warm tint.
    pub bright_radius: u32,
    /// Tiles inside which the world is visible at all. Should be
    /// `>= bright_radius`; the falloff between the two is the
    /// fog-of-war ring.
    pub dim_radius: u32,
}

/// What happens when the player **uses** this item (the "Use this?"
/// confirm path). Equipping is a separate flow driven by
/// `ItemTemplate::equip_slot` — UseEffect only describes consumable
/// or activated effects.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub enum UseEffect {
    Heal(u32),
    /// Placeholder — item has no mechanical use action. Equippable
    /// items (jumpsuit, weapons) typically set this; their action
    /// runs through the equip flow instead.
    None,
}

/// Tunable per-item fields loaded from `assets/data/items.json`.
/// Mirrors the numeric / enum-pick fields of `ItemTemplate`; the
/// non-tunable identity fields (name + description i18n keys,
/// sprite reference) stay in `ItemKind::template` since they're
/// stable identifiers, not balance levers. Adjust an entry in
/// items.json and restart — no recompile needed for stat tweaks.
#[derive(Clone, Copy, Debug, serde::Deserialize)]
pub struct ItemStats {
    pub category: ItemCategory,
    pub use_effect: UseEffect,
    pub render_scale: f32,
    pub useable: bool,
    pub equippable: bool,
    pub equip_slot: Option<EquipSlot>,
    pub ac_bonus: i32,
    pub two_handed: bool,
    pub light_source: Option<LightProfile>,
    /// Base throw distance, in tiles. The throw flow adds the
    /// thrower's Strength modifier on top — see `throw_range_for`.
    /// Defaults to 6 when the JSON entry omits the field so a fresh
    /// "I can throw this" item gets the standard player reach
    /// without the JSON having to spell it out everywhere.
    #[serde(default = "default_throw_range")]
    pub throw_range: i32,
    /// Radius of effect on impact, in tiles (Chebyshev distance).
    /// 0 means "single tile only" — the default for anything that
    /// isn't an area weapon. A molotov sits at 1 (3×3 splash).
    #[serde(default)]
    pub effect_radius: u32,
    /// Whether the throw consumes the item on impact (true for
    /// grenades / molotovs) or leaves it on the landing tile for
    /// pickup (false for a spear, a flask of acid that didn't
    /// shatter, etc.). Defaults to false — a thrown weapon is
    /// usually recoverable.
    #[serde(default)]
    pub explosive: bool,
}

fn default_throw_range() -> i32 { 6 }

const ITEM_STATS_JSON: &str = include_str!("../../assets/data/items.json");

/// `ItemStats` table keyed by stable item ID (`"medkit"`,
/// `"ration_cube"`, ...). Built once on first lookup from the
/// embedded `items.json`. Missing keys are a hard `expect` —
/// every `ItemKind` that uses `stats_by_id` MUST have a JSON
/// entry; the developer wants to know immediately.
fn item_stats_table() -> &'static std::collections::HashMap<&'static str, ItemStats> {
    use std::collections::HashMap;
    use std::sync::OnceLock;
    static TABLE: OnceLock<HashMap<&'static str, ItemStats>> = OnceLock::new();
    TABLE.get_or_init(|| {
        // Two-stage parse: a generic JSON value first so we can
        // tolerate the leading `_comment` doc field, then drain
        // every other entry into typed `ItemStats`.
        let parsed: serde_json::Value = serde_json::from_str(ITEM_STATS_JSON)
            .expect("assets/data/items.json must be valid JSON");
        let object = parsed.as_object()
            .expect("items.json must be a JSON object");
        let mut m: HashMap<&'static str, ItemStats> = HashMap::new();
        for (k, v) in object {
            if k.starts_with('_') { continue; }
            let stats: ItemStats = serde_json::from_value(v.clone())
                .unwrap_or_else(|e|
                    panic!("items.json `{}`: {}", k, e));
            let leaked: &'static str = Box::leak(k.clone().into_boxed_str());
            m.insert(leaked, stats);
        }
        m
    })
}

/// Lookup an item's stats by stable id. Panics if the id isn't
/// in items.json — same contract as `i18n::tr`'s missing-key
/// fallback would defeat the purpose, since silently returning
/// default stats would make balance bugs invisible.
fn stats_by_id(id: &str) -> ItemStats {
    *item_stats_table().get(id)
        .unwrap_or_else(|| panic!("items.json: missing entry `{}`", id))
}

/// Compose an `ItemTemplate` from the JSON-driven `ItemStats` plus
/// the in-source identity fields (i18n name + description keys,
/// sprite). Every `ItemKind` variant whose stats live in
/// items.json goes through here — the result is that a balance
/// tweak (heal amount, AC bonus, render scale) is a one-file edit
/// to items.json, while sprite-path / name-key changes still
/// surface in the Rust match arm.
fn template_from_data(
    id: &'static str,
    name_key: &'static str,
    description_key: &'static str,
    sprite: ItemSprite,
) -> ItemTemplate {
    let s = stats_by_id(id);
    ItemTemplate {
        name: name_key,
        description: description_key,
        sprite,
        use_effect: s.use_effect,
        render_scale: s.render_scale,
        category: s.category,
        useable: s.useable,
        equippable: s.equippable,
        equip_slot: s.equip_slot,
        extra_equip_slots: &[],
        ac_bonus: s.ac_bonus,
        two_handed: s.two_handed,
        light_source: s.light_source,
        throw_range: s.throw_range,
        effect_radius: s.effect_radius,
        explosive: s.explosive,
    }
}

/// All static data for an item kind.
#[derive(Clone, Copy, Debug)]
pub struct ItemTemplate {
    pub name: &'static str,
    pub description: &'static str,
    pub sprite: ItemSprite,
    pub use_effect: UseEffect,
    /// Fraction of a tile the sprite occupies. 1.0 fills the tile;
    /// 0.64 matches the standard player-pixel scale.
    pub render_scale: f32,
    /// UI grouping for the inventory panel.
    pub category: ItemCategory,
    /// Activatable from the inventory's "use" prompt — heal, deploy,
    /// detonate, etc. `useable` and `equippable` are independent: an
    /// item can be both (some future medical jumpsuit), neither
    /// (passive tokens like the keycard), or one or the other.
    pub useable: bool,
    /// Can be equipped into `equip_slot`. When true, the inventory's
    /// letter-key flow routes the item to the equip path instead of
    /// the use prompt.
    pub equippable: bool,
    /// Slot this item occupies when equipped. `None` for non-
    /// equippable items. Drives the paper-doll layer ordering and
    /// determines which `equipped_*` state slot the item lands in.
    pub equip_slot: Option<EquipSlot>,
    /// Alternate slots the item can also be sent to from the
    /// equipment screen's empty-slot-pick flow. The inventory
    /// "Equip" action always uses `equip_slot` (the primary); the
    /// equipment screen offers compatible items per slot, and an
    /// item is compatible with any slot in `equip_slot ∪
    /// extra_equip_slots`. Empty by default — set per-item in the
    /// `template()` arm for hand-lamp-style multi-slot items.
    pub extra_equip_slots: &'static [EquipSlot],
    /// Armor class bonus added when equipped, removed when unequipped.
    /// Zero for non-armor items even if they're equippable (weapons).
    pub ac_bonus: i32,
    /// True when equipping this item also blocks the *opposite*
    /// hand slot (e.g. a rifle held in the right hand prevents
    /// anything in the left). Only meaningful for items whose
    /// `equip_slot` is `RightHand` or `LeftHand`.
    pub two_handed: bool,
    /// `Some(profile)` for items that emit light when equipped.
    /// The per-frame vision recompute scans equipped slots and
    /// raises the effective bright/dim radii to the largest
    /// `LightProfile` found. `None` for everything else.
    pub light_source: Option<LightProfile>,
    /// Base throw distance in tiles. The actual reach is
    /// `throw_range + Attributes::modifier(strength)` — first
    /// attribute-driven effect in the game. Anything thrown uses
    /// this; the JSON default (6) matches an average-Strength
    /// survivor's standard reach.
    pub throw_range: i32,
    /// Tiles around the impact tile that are also affected
    /// (Chebyshev distance). 0 = single tile, 1 = 3×3 splash,
    /// 2 = 5×5, and so on. Drives both the targeting-mode preview
    /// overlay and the throw-resolution iteration.
    pub effect_radius: u32,
    /// Whether throw resolution consumes the item (grenades) or
    /// drops it on the landing tile as a pickup (recoverable
    /// thrown weapons).
    pub explosive: bool,
}

impl ItemKind {
    /// Every concrete `ItemKind`, in declaration order. Used by the
    /// renderer to discover `ItemSprite::File` paths at startup so
    /// it knows what textures to pre-load. Weapons are enumerated
    /// via `WeaponKind::ALL` so each weapon's pickup sprite is
    /// pre-loaded; if the same path is shared across kinds the
    /// loader dedupes by string.
    pub const ALL: &'static [ItemKind] = &[
        Self::MedKit,
        Self::RationCube,
        Self::AdminKeycard,
        Self::FlightJumpsuit,
        Self::HandLamp,
        // Weapons (their `pickup_sprite` paths are pre-loaded too).
        Self::Weapon(weapons::WeaponKind::SurvivalRifle),
        Self::Weapon(weapons::WeaponKind::AssaultRifle),
        Self::Weapon(weapons::WeaponKind::ScrapPistol),
        Self::Weapon(weapons::WeaponKind::PlasmaRifle),
        Self::Weapon(weapons::WeaponKind::AutoHammer),
        Self::Weapon(weapons::WeaponKind::ClawedGauntlet),
        Self::Weapon(weapons::WeaponKind::Wrench),
        Self::Weapon(weapons::WeaponKind::Mop),
        Self::Weapon(weapons::WeaponKind::GreatClub),
        Self::Weapon(weapons::WeaponKind::ShockProd),
        // Janitor-closet salvage / crafting components.
        Self::DuctTape,
        Self::Rag,
        Self::GlassBottle,
        Self::Solvent,
        Self::Lighter,
        Self::Battery,
        Self::Bandages,
        Self::WireSpool,
        Self::WorkGloves,
        Self::SheetMetalScrap,
        // Crafted non-weapon results.
        Self::Molotov,
        Self::Torch,
        Self::ImprovisedShield,
        Self::ChestPlate,
        Self::FieldDressing,
        Self::UtilityBelt,
    ];

    /// Compose an item's full template. Tunable fields (numeric
    /// stats, category, slot, light radii) come from
    /// `assets/data/items.json`; the in-source match arm only
    /// carries the stable identity bits (id, i18n keys, sprite).
    pub fn template(self) -> ItemTemplate {
        match self {
            Self::MedKit => template_from_data(
                "medkit",
                "item.medkit.name",
                "item.medkit.description",
                ItemSprite::File("assets/props/medkit.png"),
            ),
            Self::RationCube => template_from_data(
                "ration_cube",
                "item.ration_cube.name",
                "item.ration_cube.description",
                ItemSprite::File("assets/original/items/ration_cube.png"),
            ),
            Self::FlightJumpsuit => template_from_data(
                "flight_jumpsuit",
                "item.flight_jumpsuit.name",
                "item.flight_jumpsuit.description",
                ItemSprite::File("assets/original/items/jumpsuit.png"),
            ),
            // Weapons share a single template shape — the WeaponKind
            // template carries the per-weapon stats (damage, two-
            // handedness). items.json doesn't hold this case; the
            // numbers live in WeaponTemplate.
            Self::Weapon(kind) => {
                let wt = kind.template();
                ItemTemplate {
                    name: wt.name,
                    description: wt.description,
                    sprite: ItemSprite::File(wt.pickup_sprite),
                    use_effect: UseEffect::None,
                    render_scale: 1.0,
                    category: ItemCategory::Weapon,
                    useable: false, equippable: true,
                    equip_slot: Some(EquipSlot::RightHand),
                    // Weapons can also be stashed in the ReadyWeapon
                    // slot from the equipment screen, which is the
                    // pocket the Fire-mode auto-swap and the Z swap
                    // shuffle through.
                    extra_equip_slots: &[EquipSlot::ReadyWeapon],
                    ac_bonus: 0,
                    two_handed: wt.two_handed,
                    light_source: None,
                    // Weapons are throwable as a desperation move — the
                    // throw flow lets the player route the currently-
                    // wielded weapon into the Throwable slot. Standard
                    // 6-tile reach, no splash, recoverable on landing.
                    throw_range: 6,
                    effect_radius: 0,
                    explosive: false,
                }
            },
            Self::HandLamp => {
                let mut t = template_from_data(
                    "hand_lamp",
                    "item.hand_lamp.name",
                    "item.hand_lamp.description",
                    ItemSprite::File("assets/original/items/hand_lamp.png"),
                );
                // Lamp can also clip to either belt pouch — equipment
                // screen offers it there, and the vision-radii scan
                // picks up the `light_source` from any slot.
                t.extra_equip_slots = &[
                    EquipSlot::RightBelt,
                    EquipSlot::LeftBelt,
                ];
                t
            },
            // Atlas-sourced sprite — the boss-drop keycard pulls
            // from the shared dungeon tileset rather than its own
            // PNG. Stays hardcoded since Atlas(Rect) is not in the
            // items.json schema (Rect doesn't serde-derive
            // cleanly, and the keycard is a one-off).
            Self::AdminKeycard => {
                let mut t = template_from_data(
                    "medkit",  // borrow shape, overwrite stats below
                    "item.admin_keycard.name",
                    "item.admin_keycard.description",
                    ItemSprite::Atlas(atlas(14, 10)),
                );
                t.category = ItemCategory::Utility;
                t.use_effect = UseEffect::None;
                t.useable = false;
                t.equippable = false;
                t.equip_slot = None;
                t.extra_equip_slots = &[];
                t.ac_bonus = 0;
                t.two_handed = false;
                t.light_source = None;
                t.throw_range = 6;
                t.effect_radius = 0;
                t.explosive = false;
                t
            },

            // ── Janitor-closet salvage ────────────────────────────
            Self::DuctTape => template_from_data(
                "duct_tape",
                "item.duct_tape.name",
                "item.duct_tape.description",
                ItemSprite::File("assets/original/items/duct_tape.png"),
            ),
            Self::Rag => template_from_data(
                "rag",
                "item.rag.name",
                "item.rag.description",
                ItemSprite::File("assets/original/items/rag.png"),
            ),
            Self::GlassBottle => template_from_data(
                "glass_bottle",
                "item.glass_bottle.name",
                "item.glass_bottle.description",
                ItemSprite::File("assets/original/items/glass_bottle.png"),
            ),
            Self::Solvent => template_from_data(
                "solvent",
                "item.solvent.name",
                "item.solvent.description",
                ItemSprite::File("assets/original/items/solvent_bottle.png"),
            ),
            Self::Lighter => template_from_data(
                "lighter",
                "item.lighter.name",
                "item.lighter.description",
                ItemSprite::File("assets/original/items/lighter.png"),
            ),
            Self::Battery => template_from_data(
                "battery",
                "item.battery.name",
                "item.battery.description",
                ItemSprite::File("assets/original/items/battery.png"),
            ),
            Self::Bandages => template_from_data(
                "bandages",
                "item.bandages.name",
                "item.bandages.description",
                ItemSprite::File("assets/original/items/bandages.png"),
            ),
            Self::WireSpool => template_from_data(
                "wire_spool",
                "item.wire_spool.name",
                "item.wire_spool.description",
                ItemSprite::File("assets/original/items/wire_spool.png"),
            ),
            Self::WorkGloves => template_from_data(
                "work_gloves",
                "item.work_gloves.name",
                "item.work_gloves.description",
                ItemSprite::File("assets/original/items/work_gloves.png"),
            ),
            Self::SheetMetalScrap => template_from_data(
                "sheet_metal_scrap",
                "item.sheet_metal_scrap.name",
                "item.sheet_metal_scrap.description",
                ItemSprite::File("assets/original/items/sheet_metal_scrap.png"),
            ),

            // ── Crafted non-weapon results ─────────────────────────
            Self::Molotov => template_from_data(
                "molotov",
                "item.molotov.name",
                "item.molotov.description",
                ItemSprite::File("assets/original/items/molotov.png"),
            ),
            Self::Torch => template_from_data(
                "torch",
                "item.torch.name",
                "item.torch.description",
                ItemSprite::Glyph { letter: 't', color: (210, 140, 50) },
            ),
            Self::ImprovisedShield => template_from_data(
                "improvised_shield",
                "item.improvised_shield.name",
                "item.improvised_shield.description",
                ItemSprite::File("assets/original/items/sheet_armor.png"),
            ),
            Self::ChestPlate => template_from_data(
                "chest_plate",
                "item.chest_plate.name",
                "item.chest_plate.description",
                ItemSprite::File("assets/original/items/sheet_armor.png"),
            ),
            Self::FieldDressing => template_from_data(
                "field_dressing",
                "item.field_dressing.name",
                "item.field_dressing.description",
                ItemSprite::Glyph { letter: 'F', color: (220, 235, 220) },
            ),
            Self::UtilityBelt => template_from_data(
                "utility_belt",
                "item.utility_belt.name",
                "item.utility_belt.description",
                // Placeholder glyph until art lands.
                ItemSprite::Glyph { letter: 'B', color: (130, 90, 50) },
            ),
        }
    }

    /// Localized display name. The `name` field on the template
    /// holds the i18n key (e.g. `"item.medkit.name"`); this
    /// accessor resolves it through `tr` so call sites get a
    /// ready-to-render string.
    pub fn name(self) -> &'static str {
        crate::i18n::tr(self.template().name)
    }
    pub fn description(self) -> &'static str {
        crate::i18n::tr(self.template().description)
    }
    pub fn sprite(self) -> ItemSprite { self.template().sprite }
    pub fn use_effect(self) -> UseEffect { self.template().use_effect }
    pub fn render_scale(self) -> f32 { self.template().render_scale }
    pub fn category(self) -> ItemCategory { self.template().category }
    pub fn healing(self) -> Option<u32> {
        match self.template().use_effect {
            UseEffect::Heal(n) => Some(n),
            _ => None,
        }
    }

    /// Log line shown when the player **uses** this item (the
    /// consume / activate path). `None` when the item isn't useable,
    /// or when its outcome is contextual enough that the call site
    /// composes the line itself.
    ///
    /// An item can have *both* `use_flavor` and `equip_flavor` —
    /// future stuff like a personal energy field that has to be
    /// equipped before activating, or a headlamp you wear and click
    /// on. The two channels are independent.
    pub fn use_flavor(self) -> Option<&'static str> {
        match self {
            Self::MedKit     => Some(crate::i18n::tr("log.use.medkit")),
            Self::RationCube => Some(crate::i18n::tr("log.use.ration_cube")),
            // Other useable kinds compose their log lines at the
            // call site based on outcome (success / failure).
            _ => None,
        }
    }

    /// Log line shown when the player **equips** this item.
    /// `None` when the item isn't equippable, or when the generic
    /// "You equip the {name}." fallback fits — the equip flow uses
    /// that fallback automatically, so only set this for items
    /// that earn a more specific verb.
    pub fn equip_flavor(self) -> Option<&'static str> {
        match self {
            Self::FlightJumpsuit => Some(crate::i18n::tr("log.equip.flight_jumpsuit")),
            Self::Weapon(_)      => Some(crate::i18n::tr("log.equip.weapon_ready")),
            _ => None,
        }
    }
}
