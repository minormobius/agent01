//! Is it just advanced noise?
//!
//! The honest worry about this model: it is a random recurrent network with a
//! leak, and "prediction" is scored by an *observer* correlating its state
//! against patterns the observer recorded and labelled. Nothing inside the
//! network computes that correlation. So is the result a property of the model,
//! or of the measurement?
//!
//! This binary runs the controls that tell those apart. Each knocks out one
//! candidate explanation:
//!
//!   full            the model as published
//!   no-learning     frozen random weights, leak intact — is homeostasis doing
//!                   anything, or is a random reservoir + a correlation measure
//!                   already enough?
//!   no-leak         learning intact, no fading memory — is the leak alone the
//!                   whole trick?
//!   neither         random frozen weights, no leak — a plain fixed reservoir
//!   iid-training    same tokens at the same frequencies, sequential structure
//!                   destroyed. If "prediction" survives this, it was never
//!                   about transitions.
//!   reversed        trained on the grammar run backwards, tested forwards —
//!                   does it complete the future specifically, or just "some
//!                   correlated thing"?
//!
//! Then a dose–response sweep: vary how strongly `man` predicts `walks` from
//! chance to certainty, and see whether the network's margin tracks it. A noise
//! process has no dose to respond to.
//!
//!   cargo run --release --bin ablate -- [runs]

use homeostasis_engine::model::{
    pearson, round2, snapshot, table2_tests, Model, Params, Recording, GRAMMAR, LABELS,
};
use std::sync::{Arc, Mutex};
use std::thread;

/// Marginal token frequencies under the real grammar: every position is a
/// quarter of the stream, subjects/verbs/objects split evenly inside theirs.
/// An i.i.d. process with these marginals sees exactly the same tokens exactly
/// as often, with no sequential structure at all.
const MARGINALS: [f64; 7] = [0.125, 0.125, 0.125, 0.125, 0.125, 0.125, 0.25];

fn iid_grammar() -> [[f64; 7]; 7] {
    [MARGINALS; 7]
}

/// The grammar with every transition reversed (space→object→verb→subject).
fn reversed_grammar() -> [[f64; 7]; 7] {
    let mut g = [[0.0; 7]; 7];
    for i in 0..7 {
        for j in 0..7 {
            g[j][i] = GRAMMAR[i][j];
        }
    }
    // Column sums of GRAMMAR aren't 1, so renormalise each row.
    for row in g.iter_mut() {
        let s: f64 = row.iter().sum();
        if s > 0.0 {
            for v in row.iter_mut() {
                *v /= s;
            }
        }
    }
    g
}

/// `man → walks` with probability `p`, `bites` with `1-p`; `dog` mirrored.
fn tuned_grammar(p: f64) -> [[f64; 7]; 7] {
    let mut g = GRAMMAR;
    g[0][2] = p;
    g[0][3] = 1.0 - p;
    g[1][2] = 1.0 - p;
    g[1][3] = p;
    g
}

struct Outcome {
    /// How many of the six probes ranked the grammar's most likely
    /// continuation first.
    top1: f64,
    /// corr(likely next) − corr(unlikely next) for probe [man]: walks − bites.
    margin: f64,
    /// corr(likely next) − corr(the token just presented). Positive means the
    /// state moved forward rather than sitting on its own input.
    forward: f64,
    /// The object-position crossover: after [man, walks] the network should
    /// favour dog-as-object; after [man, bites], man-as-object. Reported as
    /// the mean of the two gaps, which a position-blind process can't produce.
    crossover: f64,
    /// Standard error of the mean, so "these conditions differ" is a claim the
    /// numbers can actually support. Zero on a single run; filled in by
    /// `average`.
    se_top1: f64,
    se_margin: f64,
    /// Sanity guards: a condition that fires almost nothing, or whose "codes"
    /// are perfectly rigid, can score well for uninteresting reasons.
    spikes: f64,
    popcode: f64,
}

fn run_condition(p: Params, grammar: [[f64; 7]; 7], seed: u64, loops: usize) -> Outcome {
    let mut m = Model::new(p, seed);
    m.grammar = grammar;

    // Train, recording the tail — the observer's labelled reference patterns.
    let mut rec = Recording::empty();
    let record_from = loops.saturating_sub(100);
    for i in 0..loops {
        for _ in 0..4 {
            let key = m.advance();
            if i >= record_from {
                rec.push_from(&m, key);
            }
        }
    }
    let end = snapshot(&m);

    // The six Table 2 probes, scored against the REAL grammar's expectations —
    // that's the question being asked of every condition alike.
    let mut rows = Vec::new();
    for test in table2_tests() {
        m.wmat.copy_from_slice(&end.0);
        m.acts.copy_from_slice(&end.1);
        m.spikes.copy_from_slice(&end.2);
        m.present_key(test.first, true);
        if let Some(s) = test.second {
            m.present_key(s, true);
        }
        m.present_silence(false);
        let pattern = m.spikes.clone();
        let mut row = [f64::NAN; 7];
        for k in 0..7 {
            if let Some(c) = rec.mean_corr_with(k, &pattern) {
                row[k] = c;
            }
        }
        rows.push((test.first, test.second, row));
    }

    // top-1 agreement with the real grammar
    let mut hits = 0.0;
    let mut n = 0.0;
    for (first, second, row) in &rows {
        let last = second.unwrap_or(*first);
        let truth = GRAMMAR[last];
        let want = (0..7).max_by(|&a, &b| truth[a].partial_cmp(&truth[b]).unwrap()).unwrap();
        if truth[want] <= 0.0 {
            continue;
        }
        let got = (0..7)
            .filter(|&k| row[k].is_finite())
            .max_by(|&a, &b| row[a].partial_cmp(&row[b]).unwrap());
        if got == Some(want) {
            hits += 1.0;
        }
        n += 1.0;
    }

    let r0 = rows[0].2; // [man]
    let margin = fin(r0[2]) - fin(r0[3]); // walks − bites
    let forward = fin(r0[2]) - fin(r0[0]); // walks − man(subj), the just-presented token

    let r_walks = rows[1].2; // [man, walks] → expect dog_o > man_o
    let r_bites = rows[2].2; // [man, bites] → expect man_o > dog_o
    let crossover = ((fin(r_walks[4]) - fin(r_walks[5])) + (fin(r_bites[5]) - fin(r_bites[4]))) / 2.0;

    Outcome {
        top1: if n > 0.0 { hits / n * 6.0 } else { f64::NAN },
        margin,
        forward,
        crossover,
        se_top1: 0.0,
        se_margin: 0.0,
        spikes: rec.spike_counts.iter().sum::<usize>() as f64
            / rec.spike_counts.len().max(1) as f64,
        popcode: {
            let v: Vec<f64> = (0..7).filter_map(|k| rec.population_code_strength(k)).collect();
            if v.is_empty() { f64::NAN } else { v.iter().sum::<f64>() / v.len() as f64 }
        },
    }
}

fn fin(x: f64) -> f64 {
    if x.is_finite() {
        x
    } else {
        0.0
    }
}

fn average(p: Params, grammar: [[f64; 7]; 7], runs: usize, loops: usize, salt: u64) -> Outcome {
    let threads = thread::available_parallelism().map(|n| n.get()).unwrap_or(4);
    let next = Arc::new(Mutex::new(0usize));
    let acc = Arc::new(Mutex::new((0.0, 0.0, 0.0, 0.0, 0usize, 0.0, 0.0, 0.0, 0.0)));
    thread::scope(|scope| {
        for _ in 0..threads {
            let next = Arc::clone(&next);
            let acc = Arc::clone(&acc);
            scope.spawn(move || loop {
                let run = {
                    let mut g = next.lock().unwrap();
                    if *g >= runs {
                        return;
                    }
                    let r = *g;
                    *g += 1;
                    r
                };
                let o = run_condition(p, grammar, salt ^ (run as u64).wrapping_mul(0x9E37_79B9), loops);
                let mut a = acc.lock().unwrap();
                a.0 += o.top1;
                a.1 += o.margin;
                a.2 += o.forward;
                a.3 += o.crossover;
                a.4 += 1;
                a.5 += o.top1 * o.top1;
                a.6 += o.margin * o.margin;
                a.7 += o.spikes;
                a.8 += if o.popcode.is_finite() { o.popcode } else { 0.0 };
            });
        }
    });
    let a = *acc.lock().unwrap();
    let n = a.4.max(1) as f64;
    let (mt, mm) = (a.0 / n, a.1 / n);
    // Standard error of the mean, so "these two conditions differ" is a claim
    // the numbers can actually support.
    let se_top1 = ((a.5 / n - mt * mt).max(0.0) / n).sqrt();
    let se_margin = ((a.6 / n - mm * mm).max(0.0) / n).sqrt();
    Outcome { top1: mt, margin: mm, forward: a.2 / n, crossover: a.3 / n, se_top1, se_margin,
              spikes: a.7 / n, popcode: a.8 / n }
}

fn main() {
    let runs: usize = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(120);
    let loops = 1000;
    let d = Params::default();

    let frozen = Params { lrate_wmat: 0.0, lrate_targ: 0.0, ..d };
    let noleak = Params { leak: 0.0, ..d };
    let neither = Params { leak: 0.0, lrate_wmat: 0.0, lrate_targ: 0.0, ..d };

    let conditions: Vec<(&str, Params, [[f64; 7]; 7])> = vec![
        ("full model            ", d, GRAMMAR),
        ("no learning (frozen)  ", frozen, GRAMMAR),
        ("no leak               ", noleak, GRAMMAR),
        ("frozen, no leak      ", neither, GRAMMAR),
        ("i.i.d. training       ", d, iid_grammar()),
        ("reversed grammar      ", d, reversed_grammar()),
    ];

    println!("\n=== controls — {runs} networks each, {loops} sentences ===\n");
    println!(
        "{:<22} {:>11}  {:>13}  {:>9}  {:>9}  {:>7}  {:>7}",
        "condition", "top-1", "margin", "forward", "crossover", "spikes", "code"
    );
    println!(
        "{:<22} {:>11}  {:>13}  {:>9}  {:>9}  {:>7}  {:>7}",
        "", "/6", "walks−bites", "next−cur", "obj flip", "/100", "r"
    );
    for (name, p, g) in &conditions {
        let o = average(*p, *g, runs, loops, 0xAB1A_7E00);
        println!(
            "{name} {:>5.2}±{:<4.2}  {:>6.3}±{:<5.3}  {:>9.3}  {:>9.3}  {:>7.1}  {:>7.3}",
            o.top1, o.se_top1, o.margin, o.se_margin, o.forward, o.crossover, o.spikes, o.popcode
        );
    }

    println!("\n=== dose–response: does the margin track the transition probability? ===\n");
    println!("  P(walks | man)   margin (walks − bites)   top-1 /6");
    for pct in [50, 60, 70, 75, 85, 95, 100] {
        let pr = pct as f64 / 100.0;
        let o = average(d, tuned_grammar(pr), runs, loops, 0xD05E_0000 ^ pct as u64);
        let bar = "█".repeat(((o.margin.max(0.0)) * 60.0).round() as usize);
        println!("       {pr:.2}              {:>7.3}   {:>6.2}   {bar}", o.margin, o.top1);
    }

    println!("\n(labels: {})", LABELS.join(", "));
    let _ = (pearson as fn(&[f64], &[f64]) -> Option<f64>, round2 as fn(f64) -> f64);
}
