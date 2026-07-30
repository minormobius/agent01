//! Apoptosis: cells that stop conducting die, and lineages divide again.
//!
//! The claim being tested is homeostasis — that growth and death balance inside
//! a fixed budget, so the structure turns over indefinitely rather than either
//! eroding to nothing or exhausting its ceiling. Three things have to hold:
//!
//! 1. a fully conducting structure loses nothing (death is *selective*);
//! 2. a structure with dead limbs prunes to the part that conducts;
//! 3. turnover runs forever in bounded memory.
//!
//! The third is the one that needs measuring rather than reasoning about: dead
//! cells have to give their slots back, or a structure that churns exhausts the
//! arrays after a few dozen generations and the whole idea quietly fails.

use morph_solver::graph::Engine;
use morph_solver::lang::parse;
use morph_solver::layout::Layout;
use morph_solver::signal::Signals;

struct World {
    engine: Engine,
    signals: Signals,
    edges: Vec<(u32, u32)>,
}

fn grow(src: &str) -> World {
    let prog = parse(src).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut engine = Engine::new(prog).unwrap_or_else(|m| panic!("cannot grow: {m}"));
    while engine.step(true) {}
    let mut w = World {
        engine,
        signals: Signals::new(),
        edges: Vec::new(),
    };
    w.rewire();
    w
}

impl World {
    fn rewire(&mut self) {
        self.engine.build_edges(&mut self.edges);
        self.engine.recompute_depths(&self.edges);
        self.signals.rebuild(
            self.engine.graph.cell_count(),
            &self.engine.graph.active,
            &self.edges,
        );
    }

    /// One tick of the whole loop, in the order `World::step` uses. Returns the
    /// slots that were recycled, which the caller owns — draining them here
    /// would leave nothing for a test to look at.
    fn tick(&mut self, grow_rate: u32) -> Vec<(u32, i32)> {
        for _ in 0..grow_rate {
            if !self.engine.step(true) {
                break;
            }
            self.rewire();
        }
        self.signals.tick(&self.engine.graph.active);
        let mut starved = Vec::new();
        self.signals
            .starved(&self.engine.graph.active, &mut starved);
        if !starved.is_empty() {
            for id in starved {
                self.engine.starve(id as usize);
            }
            self.rewire();
        }
        let reseed = core::mem::take(&mut self.engine.reseed);
        for &(cell, _) in &reseed {
            self.signals.wake(cell as usize);
        }
        for &id in &self.engine.rearmed.clone() {
            self.signals.wake(id as usize);
        }
        self.engine.rearmed.clear();
        reseed
    }

    fn alive(&self) -> usize {
        self.engine.graph.active_count
    }
}

const RIPPLE: &str = "
gate XOR3 3
gate MAJ3 3
cell full_adder(a, b, c) {
    s = XOR3(a, b, c)
    co = MAJ3(a, b, c)
    return s, co
}
cell ripple(a, b, c) fallback full_adder {
    a0, a1 = SPLIT(a)
    b0, b1 = SPLIT(b)
    s0, cm = ripple(a0, b0, c)
    s1, co = ripple(a1, b1, cm)
    s = CAT(s0, s1)
    return s, co
}
grow ripple(16, 16, 1)
";

#[test]
fn a_structure_that_conducts_everywhere_loses_nothing() {
    // Death has to be selective or it is just decay. With the wave reaching
    // every gate, nothing should ever go quiet long enough to starve.
    let mut w = grow(RIPPLE);
    let before = w.alive();
    w.signals.params.starve_after = 40;
    w.signals.params.rate = 1.0; // every gate gets reached
    for _ in 0..400 {
        let _ = w.tick(0);
    }
    assert_eq!(w.engine.deaths, 0, "a fully conducting structure starved");
    assert_eq!(w.alive(), before);
}

#[test]
fn the_structure_prunes_to_the_part_that_conducts() {
    // Above the per-wire charge a single driver cannot trigger a gate, so the
    // ripple adder's carry chain stops conducting past the first stage. What
    // cannot conduct should not survive.
    let mut w = grow(RIPPLE);
    let before = w.alive();
    w.signals.params.threshold = 1.15;
    w.signals.params.starve_after = 30;
    w.signals.params.rate = 1.0;
    for _ in 0..400 {
        w.tick(0); // no growth budget: pure pruning
    }
    assert!(w.engine.deaths > 0, "nothing starved");
    assert!(
        w.alive() < before,
        "structure did not shrink: {} of {before}",
        w.alive(),
    );
}

#[test]
fn turnover_runs_indefinitely_in_bounded_memory() {
    // The homeostasis claim. Deaths keep climbing, the living population holds
    // roughly steady, and — the part that actually needed checking — the arrays
    // stop growing, because dead cells give their slots back.
    let mut w = grow(RIPPLE);
    w.signals.params.threshold = 1.15;
    w.signals.params.starve_after = 30;
    w.signals.params.rate = 1.0;

    for _ in 0..300 {
        let _ = w.tick(4);
    }
    let settled_len = w.engine.graph.cell_count();
    let deaths_at_settle = w.engine.deaths;
    let alive_at_settle = w.alive();

    for _ in 0..2000 {
        let _ = w.tick(4);
    }

    assert!(
        w.engine.deaths > deaths_at_settle * 3,
        "turnover stalled: {} deaths then {}",
        deaths_at_settle,
        w.engine.deaths,
    );
    assert!(w.engine.regrowths > 0, "no lineage ever re-divided");
    assert_eq!(
        w.engine.graph.cell_count(),
        settled_len,
        "slots are not being recycled — the arrays grew from {settled_len} to {} while churning",
        w.engine.graph.cell_count(),
    );
    // Population stays in the same neighbourhood rather than dwindling.
    assert!(
        w.alive() * 3 > alive_at_settle,
        "population collapsed: {} from {alive_at_settle}",
        w.alive(),
    );
}

#[test]
fn a_dead_cell_stops_driving_its_wires() {
    // A corpse still listed as a net's driver would keep phantom edges alive
    // and let signal cross a gap that no longer exists.
    let mut w = grow(RIPPLE);
    w.signals.params.threshold = 1.15;
    w.signals.params.starve_after = 20;
    w.signals.params.rate = 1.0;
    for _ in 0..300 {
        let _ = w.tick(0);
    }
    for &(a, b) in &w.edges {
        assert!(
            w.engine.graph.active[a as usize] && w.engine.graph.active[b as usize],
            "an edge survived one of its endpoints",
        );
    }
}

#[test]
fn starvation_is_deterministic() {
    // Reproducibility is the whole difference between a taxonomy and a
    // collection of screenshots, so the same program and settings must give
    // the same history every time.
    let run = || {
        let mut w = grow(RIPPLE);
        w.signals.params.threshold = 1.15;
        w.signals.params.starve_after = 30;
        w.signals.params.rate = 1.0;
        for _ in 0..600 {
            w.tick(4);
        }
        (w.engine.deaths, w.engine.regrowths, w.alive())
    };
    assert_eq!(run(), run());
}

#[test]
fn switched_off_it_changes_nothing() {
    // starve_after 0 has to be a true no-op, since every existing preset and
    // every earlier test depends on structures that never die.
    let mut w = grow(RIPPLE);
    let before = w.alive();
    w.signals.params.starve_after = 0;
    w.signals.params.threshold = 1.15; // nothing past the first stage conducts
    for _ in 0..500 {
        let _ = w.tick(0);
    }
    assert_eq!(w.engine.deaths, 0);
    assert_eq!(w.alive(), before);
}

#[test]
fn recycled_cells_are_placed_at_their_parent() {
    // A reused slot inherits the coordinates of whatever died in it, so without
    // reseeding new growth appears wherever the last occupant happened to be.
    let mut w = grow(RIPPLE);
    let mut layout = Layout::new(1);
    layout.sync(w.engine.graph.cell_count(), &w.engine.graph.parent);
    w.signals.params.threshold = 1.15;
    w.signals.params.starve_after = 30;
    let mut reseeded = 0;
    for _ in 0..600 {
        let recycled = w.tick(4);
        layout.sync(w.engine.graph.cell_count(), &w.engine.graph.parent);
        for &(cell, parent) in &recycled {
            layout.reseed(cell as usize, parent);
            reseeded += 1;
            if parent >= 0 {
                let d = (layout.x[cell as usize] - layout.x[parent as usize]).abs();
                assert!(d <= 1.0, "a recycled cell landed {d} from its parent");
            }
        }
    }
    assert!(reseeded > 0, "no slot was ever recycled");
}
