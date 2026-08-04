//! Feedback: the point at which the graph stops being a DAG.
//!
//! Everything here is about one question — does the structure do anything *on
//! its own*? Before feedback the answer was no: signal swept from the inputs
//! and died, and every rhythm you could measure was the injection clock wearing
//! the graph as a costume. A loop changes that, and these tests pin down the
//! three things that have to be true for it to count:
//!
//! 1. a cycle actually exists in the built graph;
//! 2. it keeps firing with the driver switched off;
//! 3. its period is the loop's own length, not anything imposed from outside.

use morph_solver::graph::Engine;
use morph_solver::lang::parse;
use morph_solver::signal::Signals;
use std::collections::HashMap;

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

/// Size of the largest strongly connected component, found by the same measure
/// the depth pass uses: cells in a cycle are exactly the cells that share a
/// depth *and* can reach each other.
fn largest_cycle(g: &Grown) -> usize {
    let n = g.engine.graph.cell_count();
    let mut reach = vec![vec![false; n]; n];
    for &(a, b) in &g.edges {
        reach[a as usize][b as usize] = true;
    }
    // Floyd-Warshall closure. Fine at these sizes; these are small test graphs.
    for k in 0..n {
        for i in 0..n {
            if reach[i][k] {
                for j in 0..n {
                    if reach[k][j] {
                        reach[i][j] = true;
                    }
                }
            }
        }
    }
    let mut best = 0;
    let mut seen = vec![false; n];
    for i in 0..n {
        if seen[i] || !g.engine.graph.active[i] {
            continue;
        }
        let mut size = 0;
        for j in 0..n {
            if i == j || (reach[i][j] && reach[j][i]) {
                if reach[i][j] && reach[j][i] {
                    seen[j] = true;
                }
                size += usize::from(i == j || (reach[i][j] && reach[j][i]));
            }
        }
        best = best.max(size);
    }
    best
}

/// Excite once, then cut the driver entirely and watch what the structure does
/// by itself. Returns, for each tick, which cells fired.
fn free_run(g: &mut Grown, ticks: usize) -> Vec<Vec<u32>> {
    let active = &g.engine.graph.active;
    g.signals.params.rate = 1.0; // one injection
    g.signals.tick(active);
    g.signals.params.rate = 0.0; // and then nothing, ever again
    let mut series = Vec::with_capacity(ticks);
    for _ in 0..ticks {
        g.signals.tick(active);
        series.push(g.signals.firings.iter().map(|f| f.cell).collect());
    }
    series
}

fn total_firings(series: &[Vec<u32>]) -> usize {
    series.iter().map(|t| t.len()).sum()
}

/// How often a single circulating wave comes back round.
///
/// Not measured from the *number* of firings — one wave travelling a loop
/// fires exactly one cell per tick, so that series is flat and carries no
/// rhythm at all. The period lives in *which* cell fires, so this takes the
/// busiest cell and measures the gaps between its own firings.
fn return_period(series: &[Vec<u32>]) -> usize {
    let mut count: HashMap<u32, usize> = HashMap::new();
    for tick in series {
        for &c in tick {
            *count.entry(c).or_default() += 1;
        }
    }
    let Some((&cell, _)) = count.iter().max_by_key(|(_, &v)| v) else {
        return 0;
    };
    let times: Vec<usize> = series
        .iter()
        .enumerate()
        .filter(|(_, t)| t.contains(&cell))
        .map(|(i, _)| i)
        .collect();
    if times.len() < 3 {
        return 0;
    }
    let mut gaps: Vec<usize> = times.windows(2).map(|w| w[1] - w[0]).collect();
    gaps.sort_unstable();
    let median = gaps[gaps.len() / 2];
    // Only call it periodic if the gaps actually agree.
    let steady = gaps.iter().filter(|&&g| g == median).count();
    if steady * 2 >= gaps.len() {
        median
    } else {
        0
    }
}

/// A relay: one XOR closing a loop through a delay line of NOT gates. The
/// length of that delay line is the length of the loop, and so — the claim —
/// the period of the thing.
fn relay(delay: u32) -> String {
    format!(
        "
gate NOT 1
gate XOR 2

cell chain(x, n) fallback %0 {{
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}}

cell relay(x, n) {{
    wire fb ~ x
    y = XOR(x, fb)
    d = chain(y, n)
    fb = NOT(d)
    return d
}}

grow relay(1, {delay})
"
    )
}

#[test]
fn a_wire_closes_a_loop() {
    // Without feedback every graph here is a DAG and the largest strongly
    // connected component is a single cell. With it, there is a real cycle.
    let g = grow(&relay(16));
    assert!(
        largest_cycle(&g) > 1,
        "feedback produced no cycle — the graph is still a DAG",
    );
}

#[test]
fn a_loop_keeps_firing_with_the_driver_switched_off() {
    // The whole point. Excite once, cut the injection, and it carries on.
    let mut g = grow(&relay(16));
    let series = free_run(&mut g, 400);
    let late = total_firings(&series[300..]);
    assert!(late > 0, "activity died out — still a driven system");
}

#[test]
fn the_period_is_the_length_of_the_loop() {
    // A wave circulating a loop of L cells comes round every L ticks, so the
    // structure's own geometry sets the rhythm. This is the speciation axis:
    // one species per loop length, and they are countable.
    for delay in [8u32, 16, 32] {
        let mut g = grow(&relay(delay));
        let loop_len = largest_cycle(&g);
        let series = free_run(&mut g, 400);
        let p = return_period(&series[100..]);
        assert!(
            p > 0,
            "relay({delay}) never settled into a period (loop of {loop_len})",
        );
        assert!(
            loop_len % p == 0 || p % loop_len == 0,
            "relay({delay}): period {p} is unrelated to the loop length {loop_len}",
        );
    }
}

#[test]
fn different_loops_run_at_different_rates() {
    // Two structures, same rules, different geometry — and they must not sound
    // the same. If these ever collapse onto one number the "species" claim is
    // empty.
    let mut short = grow(&relay(8));
    let mut long = grow(&relay(32));
    let ps = return_period(&free_run(&mut short, 400)[100..]);
    let pl = return_period(&free_run(&mut long, 400)[100..]);
    assert!(ps > 0 && pl > 0, "one of them never became periodic");
    assert!(
        pl > ps,
        "a longer loop should be slower: {ps} vs {pl}",
    );
}

#[test]
fn a_loop_shorter_than_the_refractory_period_cannot_sustain() {
    // Re-entry has a condition: the wave must take longer to come round than a
    // cell takes to recover, or it arrives back into its own wake and dies.
    // This is the boundary between the periodic species and extinction, and it
    // is a property of the graph, not of the parameters.
    let mut g = grow(
        "
gate NOT 1
gate XOR 2

cell tight(x) {
    wire fb ~ x
    y = XOR(x, fb)
    fb = NOT(y)
    return y
}

grow tight(1)
",
    );
    assert_eq!(largest_cycle(&g), 2, "expected a two-cell loop");
    let series = free_run(&mut g, 200);
    assert_eq!(
        total_firings(&series[80..]),
        0,
        "a 2-cycle should not outrun a 3-tick refractory",
    );
}

#[test]
fn an_undriven_wire_is_a_failed_instantiation() {
    // A declared wire nobody drives is a floating net. It has to unwind like
    // any other mistake rather than shipping a dead input.
    let src = "
gate NOT 1
cell bad(x) {
    wire fb ~ x
    y = NOT(x)
    return y
}
grow bad(4)
";
    let prog = parse(src).unwrap();
    assert!(
        Engine::new(prog).is_err(),
        "an undriven wire should stop the cell instantiating",
    );
}

#[test]
fn a_wire_driven_at_the_wrong_width_fails() {
    let src = "
gate NOT 1
cell bad(x) {
    wire fb ~ x
    y = NOT(x)
    fb = y[1:]
    return y
}
grow bad(4)
";
    let prog = parse(src).unwrap();
    assert!(Engine::new(prog).is_err(), "width mismatch should fail");
}

#[test]
fn acyclic_programs_are_completely_unaffected() {
    // The SCC pass replaced a plain Kahn pass, so the regression that matters
    // is that feedforward depths did not move: every component is one cell, and
    // the ripple-versus-Brent-Kung result is the whole reason depth is visible.
    let ripple = grow(
        "
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
",
    );
    let depth = |g: &Grown| {
        (0..g.engine.graph.cell_count())
            .filter(|&i| g.engine.graph.active[i])
            .map(|i| g.engine.graph.logic_depth[i])
            .max()
            .unwrap()
    };
    assert_eq!(depth(&ripple), 32, "ripple adder depth moved");
    assert_eq!(largest_cycle(&ripple), 1, "a feedforward adder has no cycle");
}

#[test]
fn a_cycle_gets_a_phase_rather_than_one_flat_depth() {
    // Collapsing a strongly connected component to a single depth is the right
    // answer for the condensation, and taken alone it is a disaster for
    // everything downstream: depth is the colour *and* the pluck's pitch, so a
    // fully recurrent structure rendered flat and played a single note.
    // Measured on the showcase polyrhythm — twenty rings, four lengths, which
    // is the entire subject of the piece — it scored period 1 and variety 0.00
    // because all twenty rings sat at depth 1.
    //
    // Within a cycle there is no longest path from the inputs, but there is a
    // distance from wherever the loop is fed, and that is exactly what a wave
    // going round it traverses.
    let g = grow(&relay(16));
    let depths: Vec<u16> = (0..g.engine.graph.cell_count())
        .filter(|&i| g.engine.graph.active[i])
        .map(|i| g.engine.graph.logic_depth[i])
        .collect();
    let lo = *depths.iter().min().unwrap();
    let hi = *depths.iter().max().unwrap();
    assert!(
        hi > lo,
        "all {} cells landed on depth {lo}: the loop is flat, so it is one colour and one pitch",
        depths.len(),
    );
    // A loop of L cells should span most of L levels, not two or three.
    let distinct: std::collections::BTreeSet<u16> = depths.iter().copied().collect();
    assert!(
        distinct.len() * 2 >= depths.len(),
        "only {} distinct depths across {} cells — too coarse a gradient to hear",
        distinct.len(),
        depths.len(),
    );
}

#[test]
fn the_phase_pass_is_a_no_op_without_cycles() {
    // It has to be exactly nothing on a DAG, or it silently rewrites the one
    // result this engine is measured by — ripple-32 deep against Brent-Kung-11
    // for the same addition. Every component of a DAG is a single cell, so
    // every phase is zero and this is the plain Kahn pass it always was.
    let g = grow(
        "
gate XOR 2
gate NOT 1

cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    z = NOT(y)
    return triangle(z)
}

grow triangle(8)
",
    );
    let hi = (0..g.engine.graph.cell_count())
        .filter(|&i| g.engine.graph.active[i])
        .map(|i| g.engine.graph.logic_depth[i])
        .max()
        .unwrap();
    // 7 rows of XOR->NOT, each row one gate deeper than the last.
    assert_eq!(hi, 14, "feedforward depth moved: the phase pass is not a no-op");
}
