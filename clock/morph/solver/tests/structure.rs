//! Known-answer tests for the rewrite engine.
//!
//! Each case grows a program to completion and checks the exact gate count
//! against one worked out by hand from the recurrence. Counting gates is a
//! strong check: it catches a mis-resolved fallback, an off-by-one in `SPLIT`,
//! a slice that clamps where it should fail, and a bud that quietly stops
//! expanding — all of which look plausible on screen.

use morph_solver::graph::{Engine, Kind};
use morph_solver::lang::parse;

/// Grow to completion. Returns (gates, buds left standing, expansion steps).
fn grow(src: &str) -> (usize, usize, usize) {
    let prog = parse(src).unwrap_or_else(|e| panic!("parse failed: {e}"));
    let mut e = Engine::new(prog).unwrap_or_else(|m| panic!("cannot grow: {m}"));
    let mut steps = 0usize;
    // Generous, but finite: a runaway program must fail the test, not hang it.
    while e.step(false) {
        steps += 1;
        assert!(steps < 500_000, "growth did not terminate");
    }
    let g = &e.graph;
    let mut gates = 0;
    let mut buds = 0;
    for i in 0..g.cell_count() {
        if !g.active[i] {
            continue;
        }
        match g.kind[i] {
            Kind::Gate(_) => gates += 1,
            Kind::Bud(_) => buds += 1,
        }
    }
    (gates, buds, steps)
}

const TRIANGLE: &str = "
gate NOT 1
gate XOR 2

cell triangle(x) fallback %0 {
    y = XOR(x[1:], x[:-1])
    z = NOT(y)
    return triangle(z)
}
";

#[test]
fn triangle_rows_shrink_by_one() {
    // Row k contributes (k-1) XOR and (k-1) NOT gates, for k = N .. 2, and the
    // recursion stops when the bus is one wire wide and `x[1:]` is empty.
    for n in [2usize, 5, 32] {
        let src = format!("{TRIANGLE}\ngrow triangle({n})\n");
        let (gates, buds, _) = grow(&src);
        assert_eq!(gates, n * (n - 1), "triangle({n})");
        assert_eq!(buds, 0, "triangle({n}) left unexpanded cells");
    }
}

#[test]
fn triangle_schedules_agree() {
    // BFS and largest-first must produce the same finished structure — they are
    // only an ordering over the same rewrites.
    let src = format!("{TRIANGLE}\ngrow triangle(16)\n");
    let prog = parse(&src).unwrap();
    let mut a = Engine::new(prog.clone()).unwrap();
    let mut b = Engine::new(prog).unwrap();
    while a.step(false) {}
    while b.step(true) {}

    let count = |e: &Engine| {
        (0..e.graph.cell_count())
            .filter(|&i| e.graph.active[i] && matches!(e.graph.kind[i], Kind::Gate(_)))
            .count()
    };
    assert_eq!(count(&a), count(&b));

    let mut ea = Vec::new();
    let mut eb = Vec::new();
    a.build_edges(&mut ea);
    b.build_edges(&mut eb);
    assert_eq!(ea.len(), eb.len(), "same structure, different edge count");
}

#[test]
fn ripple_adder_falls_back_to_full_adders() {
    // An N-bit ripple adder is N full adders, each two gates, whatever the
    // division order — and N need not be a power of two.
    let src = "
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
";
    for n in [1usize, 2, 5, 32] {
        let (gates, buds, _) = grow(&format!("{src}\ngrow ripple({n}, {n}, 1)\n"));
        assert_eq!(gates, 2 * n, "ripple({n})");
        assert_eq!(buds, 0);
    }
}

#[test]
fn ring_closes_the_loop() {
    // One gate per wire: each is ANDed with its neighbour, and the last wraps
    // to the first.
    let src = "
gate AND 2

cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}
";
    for n in [1usize, 4, 20] {
        let (gates, buds, _) = grow(&format!("{src}\ngrow ring({n})\n"));
        assert_eq!(gates, n, "ring({n})");
        assert_eq!(buds, 0);
    }
}

#[test]
fn pass_through_fallback_creates_no_nodes() {
    // `fallback %0` resolves to the argument itself. A cell that immediately
    // fails must therefore leave nothing behind at all.
    let src = "
gate NOT 1

cell stop(x) fallback %0 {
    a, b = SPLIT(x)
    return NOT(a)
}

grow stop(1)
";
    let (gates, buds, _) = grow(src);
    assert_eq!(gates, 0);
    assert_eq!(buds, 0);
}

#[test]
fn non_narrowing_recursion_terminates() {
    // `loop` never shrinks its bus, so resolving it re-enters itself. That must
    // be treated as a failed instantiation and caught by the fallback, not spun
    // on forever.
    let src = "
gate NOT 1

cell loop(x) fallback %0 {
    return loop(NOT(x))
}

grow loop(4)
";
    let (gates, buds, _) = grow(src);
    assert_eq!(gates, 0, "the recursion should never have instantiated");
    assert_eq!(buds, 0);
}

#[test]
fn unresolvable_entry_is_reported() {
    // Same shape, but with no fallback to catch the failure: this is a real
    // error and must surface as one rather than growing something empty.
    let src = "
gate NOT 1

cell loop(x) {
    return loop(NOT(x))
}

grow loop(4)
";
    let prog = parse(src).unwrap();
    assert!(Engine::new(prog).is_err());
}

#[test]
fn odd_widths_keep_every_wire() {
    // SPLIT sends the middle wire low. Nothing may be dropped: a 7-bit adder is
    // still seven full adders.
    let src = "
gate G 2

cell pair(a, b) {
    return G(a, b)
}

cell rec(a, b) fallback pair {
    a0, a1 = SPLIT(a)
    b0, b1 = SPLIT(b)
    x = rec(a0, b0)
    y = rec(a1, b1)
    return CAT(x, y)
}
";
    for n in [3usize, 7, 13] {
        let (gates, _, _) = grow(&format!("{src}\ngrow rec({n}, {n})\n"));
        assert_eq!(gates, n, "rec({n}) lost or duplicated a wire");
    }
}

#[test]
fn composed_organics_grow_and_settle() {
    // The Kunstformen case: tube, chain and tree composed in series.
    //
    // Worked out from the recurrences, for a 16-wire bus and n = 4:
    //
    //   ring(W)      = W gates, and preserves width.
    //   tube(x, n)   = tube(x, n/2), ring, tube(x, n/2), so tube(·, 4) is three
    //                  rings = 3W; `fallback %0` stops it at n = 1.
    //   chain(·, 4)  = three NOT layers  = 3W, by the same recurrence.
    //   tree(W)      = 3W + 2·tree(W/2), bottoming out at tree(1) = chain = 3.
    //                  T(1)=3, T(2)=12, T(4)=36, T(8)=96, T(16)=240.
    //   medusa       = tree(240) + tube(48) + chain(48) = 336.
    let src = "
gate AND 2
gate NOT 1

cell ring(x) {
    return AND(x, CAT(x[1:], x[0]))
}

cell tube(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    y = tube(x, n0)
    z = ring(y)
    return tube(z, n1)
}

cell chain(x, n) fallback %0 {
    n0, n1 = SPLIT(n)
    a = chain(x, n0)
    b = NOT(a)
    return chain(b, n1)
}

cell tree(x, n) fallback chain {
    y = tube(x, n)
    y0, y1 = SPLIT(y)
    return CAT(tree(y0, n), tree(y1, n))
}

cell medusa(x, n) {
    a = tree(x, n)
    b = tube(a, n)
    return chain(b, n)
}

grow medusa(16, 4)
";
    let (gates, buds, steps) = grow(src);
    assert_eq!(gates, 336, "medusa");
    assert_eq!(buds, 0, "medusa left {buds} unexpanded cells");
    assert!(steps > 0);
}

#[test]
fn slices_and_constants_parse() {
    let src = "
gate G 2

cell c(x) {
    r = x[::-1]
    z = G(r, REPEAT(ZERO, x))
    lo, hi = LSLICE(z, ONE)
    return CAT(lo, hi)
}

grow c(8)
";
    // Eight lanes of G, and nothing else: REPEAT, slicing and CAT are pure
    // rewiring and must not instantiate anything.
    let (gates, buds, _) = grow(src);
    assert_eq!(gates, 8);
    assert_eq!(buds, 0);
}

#[test]
fn bad_programs_are_rejected_with_a_line() {
    let cases = [
        ("gate G 2\ncell c(x) { return H(x, x) }\ngrow c(4)\n", "unknown"),
        ("gate G 2\ncell c(x) { return G(x) }\ngrow c(4)\n", "arity"),
        ("gate G 2\ncell c(x) { return G(x, x) }\ngrow d(4)\n", "unknown entry"),
        ("gate G 2\ncell c(x) { return G(x, x) }\n", "no `grow`"),
        ("gate G 2\ncell c(x) { return G(x, x) }\ngrow c(4, 4)\n", "supplies"),
    ];
    for (src, want) in cases {
        let err = parse(src).expect_err("should not parse").to_string();
        assert!(
            err.contains(want),
            "expected {want:?} in error, got {err:?}"
        );
    }
}
