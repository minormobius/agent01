//! Crafting recipes — static catalog of "consume X of these, produce
//! Y of those" definitions. The list is the single source of truth
//! the crafting screen iterates and the craft action executes.
//!
//! Recipes are pure data:
//!
//! ```ignore
//! Recipe {
//!     result: ItemKind::Molotov,
//!     yield_count: 1,
//!     requirements: &[
//!         (ItemKind::GlassBottle, 1),
//!         (ItemKind::Solvent,     1),
//!         (ItemKind::Rag,         1),
//!     ],
//!     tool: Some(ItemKind::Lighter),  // present in inventory but not consumed
//! }
//! ```
//!
//! Adding a recipe is a one-entry append to `ALL`. The crafting
//! screen displays every entry whose components / tool / result
//! kinds are valid `ItemKind` variants — no per-recipe UI plumbing.

use crate::items::ItemKind;
use crate::items::weapons::WeaponKind;

/// One recipe. `requirements` are consumed in `(kind, count)` pairs;
/// `tool` is *checked* but **not** consumed (e.g. the Lighter for
/// fire-based recipes — a deliberate design choice so players who
/// invest in fire builds aren't punished for using them).
#[derive(Clone, Copy, Debug)]
pub struct Recipe {
    pub result: ItemKind,
    /// How many of `result` come out of one craft. Most recipes
    /// produce exactly 1; future bulk recipes (e.g. "10 bullets per
    /// reload kit") just bump this number.
    pub yield_count: u32,
    pub requirements: &'static [(ItemKind, u32)],
    pub tool: Option<ItemKind>,
}

impl Recipe {
    /// Lookup the human-readable name of the produced item. Pulled
    /// from `ItemKind::name()` so the crafting list always stays in
    /// sync with the item catalog.
    pub fn name(&self) -> &'static str { self.result.name() }
}

/// The full catalog. Display order in the crafting screen follows
/// this list; group thematically (combat / fire / armor / aid).
pub const ALL: &[Recipe] = &[
    // Combat
    Recipe {
        result: ItemKind::Weapon(WeaponKind::GreatClub),
        yield_count: 1,
        requirements: &[
            (ItemKind::Weapon(WeaponKind::Mop),    1),
            (ItemKind::Weapon(WeaponKind::Wrench), 1),
            (ItemKind::DuctTape,                   1),
        ],
        tool: None,
    },
    Recipe {
        result: ItemKind::Weapon(WeaponKind::ShockProd),
        yield_count: 1,
        requirements: &[
            (ItemKind::Weapon(WeaponKind::Wrench), 1),
            (ItemKind::Battery,                    1),
            (ItemKind::WireSpool,                  1),
            (ItemKind::DuctTape,                   1),
        ],
        tool: None,
    },
    // Fire
    Recipe {
        result: ItemKind::Molotov,
        yield_count: 1,
        requirements: &[
            (ItemKind::GlassBottle, 1),
            (ItemKind::Solvent,     1),
            (ItemKind::Rag,         1),
        ],
        tool: Some(ItemKind::Lighter),
    },
    Recipe {
        result: ItemKind::Torch,
        yield_count: 1,
        requirements: &[
            (ItemKind::Weapon(WeaponKind::Mop), 1),
            (ItemKind::Solvent,                 1),
        ],
        tool: Some(ItemKind::Lighter),
    },
    // Armor
    Recipe {
        result: ItemKind::ImprovisedShield,
        yield_count: 1,
        requirements: &[
            (ItemKind::SheetMetalScrap, 1),
            (ItemKind::DuctTape,        1),
            (ItemKind::WireSpool,       1),
        ],
        tool: None,
    },
    Recipe {
        result: ItemKind::ChestPlate,
        yield_count: 1,
        requirements: &[
            (ItemKind::SheetMetalScrap, 1),
            (ItemKind::Rag,             1),
            (ItemKind::DuctTape,        1),
        ],
        tool: None,
    },
    // Aid
    Recipe {
        result: ItemKind::FieldDressing,
        yield_count: 1,
        requirements: &[
            (ItemKind::Bandages, 1),
            (ItemKind::Rag,      1),
            (ItemKind::Solvent,  1),
        ],
        tool: None,
    },
];

/// How many of `kind` the inventory currently holds. Counts every
/// stack (since `Inventory::add` merges identical kinds, this is
/// usually a single entry).
pub fn count_in_inventory(inventory: &crate::Inventory, kind: ItemKind) -> u32 {
    inventory.entries.iter()
        .filter(|e| e.kind == kind)
        .map(|e| e.count)
        .sum()
}

/// Maximum number of `recipe` the player could craft right now,
/// limited by whichever requirement is in shortest supply. Tools
/// don't bound the count — they just need to be present.
pub fn max_craftable(inventory: &crate::Inventory, recipe: &Recipe) -> u32 {
    if let Some(tool) = recipe.tool {
        if count_in_inventory(inventory, tool) == 0 {
            return 0;
        }
    }
    let mut max = u32::MAX;
    for &(kind, needed) in recipe.requirements {
        let have = count_in_inventory(inventory, kind);
        let possible = have / needed.max(1);
        if possible < max { max = possible; }
    }
    if max == u32::MAX { 0 } else { max }
}

/// Consume `count * recipe.requirements` from `inventory` and add
/// `count * recipe.yield_count` of `recipe.result`. Caller must
/// have already verified `count <= max_craftable(...)`. Tools
/// (Lighter etc.) are checked-not-consumed.
///
/// Returns the number of result items added on success, `0` if
/// the requirements weren't actually satisfied (defensive — should
/// never happen if the caller respected `max_craftable`).
pub fn craft(
    inventory: &mut crate::Inventory,
    recipe: &Recipe,
    count: u32,
) -> u32 {
    if count == 0 { return 0; }
    if max_craftable(inventory, recipe) < count { return 0; }
    // Consume each requirement, walking the inventory entries by
    // kind. `Inventory::add` stacks identical kinds, so the count
    // for any required kind sits on a single entry — but we don't
    // assume that, in case future code splits stacks.
    for &(kind, per) in recipe.requirements {
        let mut to_remove = per * count;
        let mut i = 0;
        while to_remove > 0 && i < inventory.entries.len() {
            if inventory.entries[i].kind == kind {
                let take = to_remove.min(inventory.entries[i].count);
                inventory.entries[i].count -= take;
                to_remove -= take;
                if inventory.entries[i].count == 0 {
                    inventory.entries.remove(i);
                    continue;
                }
            }
            i += 1;
        }
    }
    let produced = recipe.yield_count * count;
    inventory.add(recipe.result, produced);
    produced
}
