//! Known-answer tests for the rule. The recipes are Minecraft's, so most of
//! these check against the game rather than against this implementation: a
//! boat is five planks in a U, a chest is eight round a hole, one log is four
//! planks. If a shape here stops matching the game, the automaton is running
//! somebody else's rule.

use crate::recipes::{self, EMPTY};
use crate::world::{World, NEVER};

fn id(name: &str) -> u16 { recipes::item_id(name).unwrap_or_else(|| panic!("no item {name}")) }

/// A quiet world: nothing seeded, nothing moving, and `Biggest` priority so a
/// layout has one unambiguous reading — five planks in a U are a boat here and
/// not, as `Random` would have it, whichever of the boat, the slab and the
/// stick came up first.
fn still(w: usize, h: usize) -> World {
    let mut world = World::new(w, h, 1);
    world.clear();
    world.motion = 0.0;
    world.craft_rate = 1000.0;
    world.priority = crate::world::Priority::Biggest;
    world
}

fn recipe_for(w: &World, out: &str) -> usize {
    let target = id(out);
    w.recipes.iter().position(|r| r.out == target && !r.mirrored).expect("no recipe")
}

// ----------------------------------------------------------------- table --

#[test]
fn the_table_builds_and_every_shape_fits_a_crafting_grid() {
    // recipes::all() asserts shape sanity as it goes; this also pins the
    // relationship the legend depends on.
    let rs = recipes::all();
    assert!(rs.len() >= recipes::ITEMS.len() - recipes::SEEDS.len());
    for r in &rs {
        assert!(r.w >= 1 && r.w <= 3 && r.h >= 1 && r.h <= 3);
        assert!(r.ingredients() >= 1 && r.ingredients() <= 9);
        assert!(r.yield_ >= 1);
        assert!(r.out != EMPTY && (r.out as usize) <= recipes::ITEMS.len());
    }
}

#[test]
fn every_item_is_either_seeded_or_craftable() {
    // An item nobody can make is a dead entry in the histogram and a lie in
    // the recipe book.
    let rs = recipes::all();
    for &name in recipes::ITEMS {
        let i = id(name);
        let seeded = recipes::SEEDS.contains(&name);
        let made = rs.iter().any(|r| r.out == i);
        assert!(seeded || made, "{name} can neither be seeded nor crafted");
    }
}

#[test]
fn every_ingredient_is_reachable_from_the_seed_stock() {
    // The whole tree has to grow out of logs, planks and cobblestone, or the
    // grid would sit there with recipes that can never fire.
    let rs = recipes::all();
    let mut have: Vec<bool> = vec![false; recipes::ITEMS.len() + 1];
    for &s in recipes::SEEDS { have[id(s) as usize] = true; }
    for _ in 0..8 {
        for r in &rs {
            if r.cells.iter().all(|&c| c == EMPTY || have[c as usize]) {
                have[r.out as usize] = true;
            }
        }
    }
    for &name in recipes::ITEMS {
        assert!(have[id(name) as usize], "{name} is not reachable from the seed stock");
    }
}

#[test]
fn the_shapes_are_the_games_shapes() {
    let rs = recipes::all();
    let find = |name: &str| rs.iter().find(|r| r.out == id(name) && !r.mirrored).unwrap();

    // one log → four planks
    let planks = find("oak_planks");
    assert_eq!((planks.w, planks.h, planks.yield_), (1, 1, 4));
    assert_eq!(planks.cells, vec![id("oak_log")]);

    // two planks, one above the other → four sticks
    let stick = find("stick");
    assert_eq!((stick.w, stick.h, stick.yield_), (1, 2, 4));

    // a boat is five planks in a U, and the hole is part of the shape
    let boat = find("oak_boat");
    assert_eq!((boat.w, boat.h, boat.yield_), (3, 2, 1));
    assert_eq!(boat.at(1, 0), EMPTY);
    assert_eq!(boat.ingredients(), 5);

    // a chest is eight planks round an empty middle
    let chest = find("chest");
    assert_eq!((chest.w, chest.h, chest.yield_), (3, 3, 1));
    assert_eq!(chest.at(1, 1), EMPTY);
    assert_eq!(chest.ingredients(), 8);

    // a lever is a stick on a cobblestone
    let lever = find("lever");
    assert_eq!((lever.w, lever.h), (1, 2));
    assert_eq!(lever.at(0, 0), id("stick"));
    assert_eq!(lever.at(0, 1), id("cobblestone"));

    // a pickaxe is three across the top and two sticks down the middle
    let pick = find("wooden_pickaxe");
    assert_eq!((pick.w, pick.h, pick.yield_), (3, 3, 1));
    assert_eq!(pick.at(1, 1), id("stick"));
    assert_eq!(pick.at(0, 1), EMPTY);
}

#[test]
fn asymmetric_shapes_get_a_mirror_and_symmetric_ones_do_not() {
    let rs = recipes::all();
    let count = |name: &str| rs.iter().filter(|r| r.out == id(name)).count();
    assert_eq!(count("wooden_axe"), 2, "an axe faces either way");
    assert_eq!(count("oak_stairs"), 2, "stairs climb either way");
    assert_eq!(count("oak_boat"), 1, "a boat is already symmetric");
    assert_eq!(count("chest"), 1);
    assert_eq!(count("oak_planks"), 1);
    // and a mirror is a real mirror
    let axes: Vec<_> = rs.iter().filter(|r| r.out == id("wooden_axe")).collect();
    for y in 0..3 {
        for x in 0..3 {
            assert_eq!(axes[0].at(x, y), axes[1].at(2 - x, y));
        }
    }
}

// ----------------------------------------------------------------- rule --

#[test]
fn a_u_of_five_planks_becomes_a_boat() {
    let mut w = still(9, 9);
    let p = id("oak_planks");
    for &(x, y) in &[(3, 3), (5, 3), (3, 4), (4, 4), (5, 4)] { w.put(x, y, p); }
    w.step();
    assert_eq!(w.counts[p as usize], 0, "the planks are consumed");
    assert_eq!(w.counts[id("oak_boat") as usize], 1);
    // and it lands on the ingredient cell nearest the middle of the shape,
    // which for this U is the bottom centre — where the video puts it
    assert_eq!(w.get(4, 4), id("oak_boat"));
}

#[test]
fn the_hole_in_a_shape_has_to_be_empty() {
    let mut w = still(9, 9);
    let p = id("oak_planks");
    // eight planks round a hole is a chest
    for y in 3..6 { for x in 3..6 { if (x, y) != (4, 4) { w.put(x, y, p); } } }
    w.step();
    assert_eq!(w.counts[id("chest") as usize], 1, "eight round a hole is a chest");

    // fill the hole and it is not a chest any more
    let mut w = still(9, 9);
    for y in 3..6 { for x in 3..6 { w.put(x, y, p); } }
    w.step();
    assert_eq!(w.counts[id("chest") as usize], 0, "a full 3×3 is not a chest");
}

#[test]
fn one_log_becomes_four_planks_and_the_extra_three_find_room() {
    let mut w = still(11, 11);
    w.put(5, 5, id("oak_log"));
    w.step();
    assert_eq!(w.counts[id("oak_log") as usize], 0);
    assert_eq!(w.counts[id("oak_planks") as usize], 4, "yield is placed, not discarded");
    assert_eq!(w.total_spilled, 0);
}

#[test]
fn the_counts_never_drift_from_the_grid() {
    // counts[] is maintained incrementally across consume, place and spill;
    // this is the invariant that catches a missed decrement.
    let mut w = World::new(48, 48, 20260911);
    w.motion = 0.2;
    for t in 0..400 {
        w.step();
        if t % 37 == 0 {
            assert_eq!(w.counts, w.recount(), "counts drifted at tick {t}");
        }
    }
    assert_eq!(w.counts, w.recount());
    assert!(w.total_crafts > 100, "only {} crafts in 400 ticks", w.total_crafts);
}

#[test]
fn no_cell_is_spent_twice_in_a_tick() {
    // Three planks in a row is a slab; four in a row is a slab and a leftover,
    // never two slabs sharing a plank.
    let mut w = still(11, 3);
    let p = id("oak_planks");
    for x in 2..6 { w.put(x, 0, p); }
    w.step();
    let slabs = w.counts[id("oak_slab") as usize];
    let plates = w.counts[id("oak_pressure_plate") as usize];
    assert!(slabs <= 6 && (slabs > 0 || plates > 0));
    assert_eq!(w.counts, w.recount());
}

#[test]
fn a_shape_that_straddles_the_wrap_still_matches() {
    // The grid is a torus, so a boat half off the right-hand edge is a boat.
    let mut w = still(6, 6);
    let p = id("oak_planks");
    // columns 5, 0, 1 — the U wrapped round the seam
    for &(x, y) in &[(5, 2), (1, 2), (5, 3), (0, 3), (1, 3)] { w.put(x, y, p); }
    w.step();
    assert_eq!(w.counts[id("oak_boat") as usize], 1, "the torus seam is not a wall");
}

#[test]
fn without_motion_the_grid_stops_much_sooner() {
    // His follow-up: "I added random motion to keep the grid alive". A still
    // grid crafts whatever its starting layout contains and then has almost
    // nothing left to do — almost, because a recipe's spare output is placed in
    // nearby empty cells, and that is itself a small amount of motion.
    let run = |motion: f64| {
        let mut w = World::new(64, 64, 7);
        w.motion = motion;
        for _ in 0..80 { w.step(); }
        let early = w.total_crafts;
        for _ in 0..320 { w.step(); }
        (early, w.total_crafts - early)
    };
    let (still_early, still_late) = run(0.0);
    let (moving_early, moving_late) = run(0.25);
    assert_eq!(still_late, 0, "a still grid should have nothing left to craft");
    assert!(moving_late > 0, "a stirred grid should still be finding matches");
    assert!(moving_early + moving_late > still_early + still_late,
            "stirring should get more out of the same stock: {} vs {}",
            moving_early + moving_late, still_early + still_late);
}
#[test]
fn banning_the_button_is_what_keeps_planks_alive() {
    // "and banned buttons". One plank in, one button out, and a button is an
    // ingredient in nothing — so unbanned it is a one-way drain that converts
    // the plank supply into inert buttons and starves everything downstream.
    let button = id("oak_button");
    let planks = id("oak_planks");

    let mut banned = World::new(64, 64, 11);
    banned.motion = 0.2;
    assert!(banned.banned[button as usize], "the button is banned out of the box");
    for _ in 0..300 { banned.step(); }

    let mut free = World::new(64, 64, 11);
    free.motion = 0.2;
    free.set_banned(button, false);
    for _ in 0..300 { free.step(); }

    assert_eq!(free.counts[button as usize] > 0, true);
    assert_eq!(banned.counts[button as usize], 0);
    assert!(
        free.counts[planks as usize] * 4 < banned.counts[planks as usize],
        "unbanned buttons should gut the plank supply: {} vs {}",
        free.counts[planks as usize], banned.counts[planks as usize]
    );
    // and with the planks gone, so is everything downstream of them. Count
    // the items rather than the kinds: a handful of each still turns up either
    // way, and it is the volume that collapses.
    let downstream = |w: &World| -> u32 {
        recipes::ITEMS.iter().enumerate()
            .filter(|(_, n)| !recipes::SEEDS.contains(n) && **n != "oak_button")
            .map(|(i, _)| w.counts[i + 1])
            .sum()
    };
    let (a, b) = (downstream(&banned), downstream(&free));
    assert!(a > b * 2, "banning the button should leave far more of the tree: {a} vs {b}");
}

#[test]
fn the_same_seed_gives_the_same_world() {
    let mut a = World::new(40, 40, 4242);
    let mut b = World::new(40, 40, 4242);
    let mut c = World::new(40, 40, 4243);
    for _ in 0..150 { a.step(); b.step(); c.step(); }
    assert_eq!(a.cells, b.cells);
    assert_eq!(a.total_crafts, b.total_crafts);
    assert_ne!(a.cells, c.cells);
}

#[test]
fn the_tech_tree_is_discovered_in_a_plausible_order() {
    // Nothing downstream can be found before the thing it is made of.
    let mut w = World::new(80, 80, 99);
    w.motion = 0.25;
    for _ in 0..1500 { w.step(); }
    let d = |name: &str| w.discovered[id(name) as usize];
    assert_eq!(d("oak_log"), 0);
    assert!(d("oak_planks") == 0 || d("oak_planks") != NEVER);
    assert!(d("stick") != NEVER, "sticks should turn up early");
    for tool in ["wooden_pickaxe", "wooden_axe", "stone_sword"] {
        if d(tool) != NEVER {
            assert!(d("stick") <= d(tool), "{tool} found before the sticks it needs");
        }
    }
    let kinds = w.counts.iter().filter(|&&c| c > 0).count();
    assert!(kinds >= 12, "only {kinds} kinds of item after 1500 ticks");
}

#[test]
fn sticks_and_slabs_end_up_on_top_because_their_yields_are_biggest() {
    // The video's final histogram ranks sticks, cobblestone, cobblestone slabs,
    // planks, oak slabs. That ordering is the ordering of yields, and it is the
    // reason to believe the spare outputs are placed rather than dropped.
    let mut w = World::new(96, 96, 20260911);
    w.motion = 0.2;
    for _ in 0..2000 { w.step(); }
    let n = |name: &str| w.counts[id(name) as usize];
    let top = n("stick");
    for other in ["oak_boat", "chest", "furnace", "wooden_pickaxe", "oak_door", "lever"] {
        assert!(top > n(other), "sticks ({top}) should outnumber {other} ({})", n(other));
    }
    assert!(n("oak_slab") > n("oak_boat"));
    assert!(n("cobblestone_slab") > n("furnace"));
}

#[test]
fn a_full_grid_loses_the_yield_it_cannot_place() {
    // Honest accounting: when there is nowhere to put the extra planks they
    // are gone, and the engine says so rather than quietly conjuring space.
    // Everything stone is banned so the cobblestone packing stays packed and
    // the log recipe is the only thing that can fire.
    let mut w = still(5, 5);
    for name in ["cobblestone_slab", "cobblestone_stairs", "cobblestone_wall", "furnace"] {
        w.set_banned(id(name), true);
    }
    let c = id("cobblestone");
    for y in 0..5 { for x in 0..5 { w.put(x, y, c); } }
    w.put(2, 2, id("oak_log"));
    w.step();
    assert_eq!(w.counts[id("oak_planks") as usize], 1, "one plank in the log's own cell");
    assert_eq!(w.total_spilled, 3, "and nowhere for the other three");
    assert_eq!(w.counts, w.recount());
}

#[test]
fn the_grid_runs_down_and_restocking_only_slows_it() {
    // Every recipe here is a one-way trip, nothing on the grid mines, and
    // nothing consumes a slab or a lever or a shovel once it exists. So the
    // automaton has no sink for its own output and *must* run down: with no
    // supply it stops outright, and with one it fills to the supply level with
    // terminal items and then trickles. The video is forty seconds long and
    // never reaches either state. This is the thing the rebuild can show that
    // the video cannot, so it had better stay true.
    let run = |restock: f64| {
        let mut w = World::new(64, 64, 7);
        w.motion = 0.2;
        w.restock = restock;
        for _ in 0..600 { w.step(); }
        let early = w.total_crafts;
        for _ in 0..600 { w.step(); }
        (early, w.total_crafts - early)
    };
    let (early, dry_late) = run(0.0);
    assert!(early > 400, "should be busy at the start: {early}");
    assert!(dry_late * 20 < early, "with no supply it should have stopped: {early} then {dry_late}");

    let (_, fed_late) = run(0.35);
    assert!(fed_late > dry_late * 2, "a supply should keep something happening: {fed_late} vs {dry_late}");
    assert!(fed_late * 4 < early, "but it is a trickle, not a restart: {fed_late} vs {early}");
}


#[test]
fn restocking_only_fills_empty_cells() {
    let mut w = still(6, 6);
    let c = id("cobblestone");
    for name in ["cobblestone_slab", "cobblestone_stairs", "cobblestone_wall", "furnace"] {
        w.set_banned(id(name), true);
    }
    for y in 0..6 { for x in 0..6 { w.put(x, y, c); } }
    w.restock = 0.95;
    for _ in 0..20 { w.step(); }
    assert_eq!(w.counts[c as usize], 36, "a full grid cannot be restocked into");
    assert_eq!(w.counts, w.recount());
}

#[test]
fn priority_changes_which_recipe_wins_a_shared_plank() {
    // Five planks in a U are a boat, and the bottom three of them are a slab.
    // Biggest takes the boat; Random will mostly take one of the small ones,
    // because small matches outnumber big ones. This is the one thing the
    // video does not settle, so it is a switch and not a decision.
    let u = [(3usize, 3usize), (5, 3), (3, 4), (4, 4), (5, 4)];
    let mut boats = 0;
    let mut others = 0;
    for seed in 0..40u64 {
        let mut w = World::new(9, 9, seed);
        w.clear();
        w.motion = 0.0;
        w.craft_rate = 1000.0;
        w.priority = crate::world::Priority::Biggest;
        for &(x, y) in &u { w.put(x, y, id("oak_planks")); }
        w.step();
        boats += w.counts[id("oak_boat") as usize];

        let mut w = World::new(9, 9, seed);
        w.clear();
        w.motion = 0.0;
        w.craft_rate = 1000.0;
        w.priority = crate::world::Priority::Random;
        for &(x, y) in &u { w.put(x, y, id("oak_planks")); }
        w.step();
        others += w.counts[id("oak_boat") as usize];
    }
    assert_eq!(boats, 40, "Biggest always takes the boat");
    assert!(others < 20, "Random mostly does not: {others}/40");
}
