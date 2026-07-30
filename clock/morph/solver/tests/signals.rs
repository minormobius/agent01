//! The wavefront has to follow the graph, not the clock.
//!
//! These are the checks that the sonification is actually *of* the structure.
//! If propagation ever stops depending on topology the page still looks and
//! sounds busy — which is exactly why it needs asserting rather than watching.

use morph_solver::graph::Engine;
use morph_solver::lang::parse;
use morph_solver::signal::Signals;

struct Grown {
    engine: Engine,
    edges: Vec<(u32, u32)>,
    signals: Signals,
}

fn grow(src: &str) -> Grown {
    let prog = parse(src).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut engine = Engine::new(prog).unwrap_or_else(|m| panic!("cannot grow: {m}"));
    let mut steps = 0;
    while engine.step(true) {
        steps += 1;
        assert!(steps < 500_000, "growth did not terminate");
    }
    let mut edges = Vec::new();
    engine.build_edges(&mut edges);
    engine.recompute_depths(&edges);
    let mut signals = Signals::new();
    signals.rebuild(engine.graph.cell_count(), &engine.graph.active, &edges);
    Grown {
        engine,
        edges,
        signals,
    }
}

/// Fire exactly one pulse and report (ticks until the last gate fired, total
/// gates that fired). Quiet for 40 consecutive ticks ends the run.
fn single_wave(g: &mut Grown) -> (usize, usize) {
    let active = &g.engine.graph.active;
    g.signals.params.rate = 1.0; // one injection, on the first tick
    g.signals.tick(active);
    let mut fired = g.signals.firings.len();
    g.signals.params.rate = 0.0; // and no more
    let mut last = 1usize;
    for t in 2..4000 {
        g.signals.tick(active);
        if !g.signals.firings.is_empty() {
            last = t;
            fired += g.signals.firings.len();
        }
        if t - last > 40 {
            break;
        }
    }
    (last, fired)
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
grow ripple(32, 32, 1)
";

const BRENT_KUNG: &str = "
gate XOR 2
gate AND 2
gate CARRY 3
cell bk_base(a, b, c) {
    p = XOR(a, b)
    g = AND(a, b)
    s = XOR(p, c)
    return s, p, g
}
cell bk_rec(a, b, cin) fallback bk_base {
    a0, a1 = SPLIT(a)
    b0, b1 = SPLIT(b)
    s0, p0, g0 = bk_rec(a0, b0, cin)
    cm = CARRY(p0, g0, cin)
    s1, p1, g1 = bk_rec(a1, b1, cm)
    s = CAT(s0, s1)
    p = AND(p0, p1)
    g = CARRY(p1, g1, g0)
    return s, p, g
}
cell brent_kung(a, b, c) {
    s, p, g = bk_rec(a, b, c)
    co = CARRY(p, g, c)
    return s, co
}
grow brent_kung(32, 32, 1)
";

#[test]
fn the_wave_takes_as_long_as_the_circuit_is_deep() {
    // One tick per level, so a single pulse should need about as many ticks to
    // cross the structure as its longest gate path — the same number the depth
    // colouring reports.
    let mut g = grow(RIPPLE);
    let depth = (0..g.engine.graph.cell_count())
        .filter(|&i| g.engine.graph.active[i])
        .map(|i| g.engine.graph.logic_depth[i])
        .max()
        .unwrap() as usize;
    let (ticks, fired) = single_wave(&mut g);
    assert!(
        ticks >= depth - 2 && ticks <= depth + 2,
        "wave crossed in {ticks} ticks, structure is {depth} deep",
    );
    assert!(fired > 0);
}

#[test]
fn logarithmic_depth_is_audibly_faster_than_linear() {
    // The whole point of a parallel prefix adder, as a property of the sound:
    // both circuits add 32 bits, and the Brent-Kung wave has to finish several
    // times sooner because its carry path is O(log N) rather than O(N).
    let (ripple_ticks, _) = single_wave(&mut grow(RIPPLE));
    let (bk_ticks, _) = single_wave(&mut grow(BRENT_KUNG));
    assert!(
        ripple_ticks > bk_ticks * 2,
        "ripple {ripple_ticks} ticks vs brent-kung {bk_ticks} — the carry chain should dominate",
    );
}

#[test]
fn every_reachable_gate_fires_exactly_once_per_wave() {
    // With one input enough to trigger, a single pulse should sweep the whole
    // connected structure and then stop: no gate left dark, none ringing.
    let mut g = grow(
        "
gate NOT 1
gate XOR 2
cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    z = NOT(y)
    return triangle(z)
}
grow triangle(12)
",
    );
    let active: usize = g.engine.graph.active.iter().filter(|&&a| a).count();
    let (_, fired) = single_wave(&mut g);
    assert_eq!(
        fired, active,
        "{fired} firings for {active} gates — a wave should light each one once",
    );
}

#[test]
fn a_high_threshold_stops_a_single_driver_chain() {
    // Above the per-wire charge one driver is no longer enough, and where the
    // structure *is* a chain of single drivers the wave cannot advance at all.
    // The ripple adder is exactly that: each full adder takes its operands from
    // primary inputs and only its carry from the adder below, so every gate
    // past the first has in-degree one.
    let mut flood = grow(RIPPLE);
    let (_, loose) = single_wave(&mut flood);

    let mut strict = grow(RIPPLE);
    strict.signals.params.threshold = 1.1; // two wires needed
    let (_, tight) = single_wave(&mut strict);

    assert_eq!(loose, 64, "the whole 32-bit adder should light up");
    assert!(
        tight < loose / 4,
        "the carry chain should have died: {tight} of {loose} gates still fired",
    );
}

#[test]
fn coincidence_still_propagates_where_drivers_pair_up() {
    // The counterpart: a triangle's rows are each fed by two parents that fire
    // on the same tick, so raising the threshold changes nothing. Together with
    // the test above this pins down what the knob actually does — it selects on
    // graph shape, not on some global density.
    let mut flood = grow(
        "
gate XOR 2
cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    return triangle(y)
}
grow triangle(16)
",
    );
    let (_, loose) = single_wave(&mut flood);

    let mut strict = grow(
        "
gate XOR 2
cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    return triangle(y)
}
grow triangle(16)
",
    );
    strict.signals.params.threshold = 1.1;
    let (_, tight) = single_wave(&mut strict);
    assert_eq!(tight, loose, "paired drivers should satisfy coincidence");
}

#[test]
fn nothing_fires_without_injection() {
    let mut g = grow(RIPPLE);
    g.signals.params.rate = 0.0;
    for _ in 0..200 {
        g.signals.tick(&g.engine.graph.active);
        assert!(g.signals.firings.is_empty(), "a gate fired with no input");
    }
    assert_eq!(g.signals.activity, 0.0);
}

#[test]
fn a_structure_with_no_wires_still_ticks_safely() {
    // Every gate reads primary inputs, so there are no edges at all: all
    // sources, no propagation. Must not panic or divide by zero.
    let mut g = grow(
        "
gate AND 2
cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}
grow ring(8)
",
    );
    assert!(g.edges.is_empty(), "expected an unwired structure");
    let (_, fired) = single_wave(&mut g);
    assert!(fired > 0, "the sources themselves should still fire");
}
