//! The microsecond budget, as an executable claim.
//!
//! "Text files, in microseconds" is the design constraint the rest of the
//! architecture is built on — no cache, no invalidation, render-per-keystroke —
//! so it gets a test rather than a sentence in a README.
//!
//! ## Reading these numbers honestly
//!
//! These run on whatever machine `cargo test` is on, in a native build, not in
//! wasm on a Cloudflare edge worker. wasm is typically 1.2–2× slower for this
//! kind of string work, and the ceilings below are set with roughly 20× of
//! headroom over what a developer laptop actually does, so they fail on a
//! genuine regression rather than on a noisy CI runner. They are a
//! regression alarm, not a benchmark: for real numbers use `--nocapture`, which
//! prints the measured per-operation cost.

use std::time::Instant;

use rant_core::{
    doc::Doc,
    predicates::{apply, Opts, Predicate},
    render_body,
    text::tokenize,
};

/// ~1,200 words, the length of a real post.
fn corpus() -> String {
    let para = "The box is empty and that is the problem with it. \
                Every tool for writing things down begins by asking what kind of thing you are \
                writing, which is a question you cannot answer until afterwards. \
                A rant does not know it is a rant. It finds out.\n\n";
    para.repeat(30)
}

/// Run `f` enough times to get out of timer noise; return microseconds per run.
fn per_op(iters: u32, mut f: impl FnMut()) -> f64 {
    // One untimed pass so we measure steady state rather than first-touch.
    f();
    let t = Instant::now();
    for _ in 0..iters {
        f();
    }
    t.elapsed().as_secs_f64() * 1e6 / iters as f64
}

/// Debug builds run this code an order of magnitude slower — bounds-checked,
/// un-inlined, no LTO — and the shipped artefact is a release build. Measuring
/// in debug is still useful (the numbers print), but asserting on it would just
/// train people to ignore a red test. `cargo test --release` enforces.
fn enforcing() -> bool {
    !cfg!(debug_assertions)
}

fn check(label: &str, budget_us: f64, iters: u32, f: impl FnMut()) {
    let us = per_op(iters, f);
    let verdict = if !enforcing() {
        "debug — not enforced"
    } else if us < budget_us {
        "ok"
    } else {
        "OVER"
    };
    println!("{label:<34} {us:>9.1} µs   (budget {budget_us:.0} µs, {verdict})");
    if enforcing() {
        assert!(us < budget_us, "{label} took {us:.1}µs, over the {budget_us:.0}µs budget");
    }
}

#[test]
fn the_pipeline_stays_within_budget() {
    let src = corpus();
    let words = tokenize(&src).len();
    println!("\ncorpus: {words} words, {} bytes\n", src.len());
    assert!(words > 1000, "corpus should be a realistic length, got {words}");

    check("Doc::parse", 200.0, 2000, || {
        std::hint::black_box(Doc::parse(std::hint::black_box(&src), "s"));
    });

    check("tokenize", 500.0, 1000, || {
        std::hint::black_box(tokenize(std::hint::black_box(&src)));
    });

    check("markdown::render", 2000.0, 500, || {
        std::hint::black_box(render_body(std::hint::black_box(&src), &[], &Opts::default()));
    });

    // Every predicate, individually. `concordance` is the expensive one — it is
    // quadratic in distinct headwords by design — so it gets its own ceiling.
    let tokens = tokenize(&src);
    for p in Predicate::ALL {
        let budget = if p == Predicate::Concordance { 20_000.0 } else { 2000.0 };
        check(&format!("predicate: {}", p.id()), budget, 200, || {
            std::hint::black_box(apply(p, std::hint::black_box(&tokens), &Opts::default()));
        });
    }
}

#[test]
fn a_full_post_render_is_faster_than_a_network_round_trip() {
    // The claim that matters: parse + render + record-build, end to end, in
    // less time than one TCP handshake. This is why there is no cache.
    let src = corpus();
    let us = per_op(300, || {
        let d = Doc::parse(&src, "post");
        let r = render_body(d.body, &[], &Opts::default());
        let rec = rant_core::Document::from_doc(&d, "at://did:plc:x/site.standard.publication/y", "2026-07-28T00:00:00.000Z");
        std::hint::black_box((r.html.len(), rec.title.len()));
    });
    println!("\nfull post render: {us:.1} µs");
    if enforcing() {
        assert!(us < 5000.0, "end-to-end render took {us:.1}µs");
    }
}

#[test]
fn cost_is_linear_in_input_size() {
    // A superlinear renderer would be fine at 1k words and unusable at 20k.
    // Check the slope rather than the constant, so this survives a slow runner.
    let small = corpus();
    let big = small.repeat(8);

    let t_small = per_op(200, || {
        std::hint::black_box(render_body(std::hint::black_box(&small), &[], &Opts::default()));
    });
    let t_big = per_op(40, || {
        std::hint::black_box(render_body(std::hint::black_box(&big), &[], &Opts::default()));
    });

    let ratio = t_big / t_small.max(0.001);
    println!("\n8× the input cost {ratio:.2}× the time");
    // Enforced in both profiles: a slope regression is real in debug too.
    assert!(ratio < 20.0, "render is superlinear: 8× input → {ratio:.1}× time");
}
