//! Native replication driver — reproduces Table 2 of Falandays, Nguyen &
//! Spivey (2021) from the Rust port, and prints it next to the published
//! numbers so the two can be compared cell by cell.
//!
//!   cargo run --release --bin replicate -- [runs] [loops] [threads]
//!
//! Defaults match the paper: 500 runs × 1000 four-token sentences, correlating
//! against the last 100 sentences (400 timesteps) of each run.

use homeostasis_engine::model::{
    run_once, table2_tests, Params, RunResult, LABELS,
};
use std::sync::{Arc, Mutex};
use std::thread;

/// Table 2 as printed in the paper, for side-by-side comparison.
const PUBLISHED: [[f64; 7]; 6] = [
    // man_s   dog_s   walks   bites   dog_o   man_o   space
    [0.099, 0.016, 0.467, 0.319, 0.009, 0.065, 0.173], // [man]
    [0.060, 0.061, 0.170, 0.0004, 0.452, 0.213, 0.036], // [man, walks]
    [0.049, 0.052, 0.008, 0.199, 0.237, 0.402, 0.038], // [man, bites]
    [0.020, 0.107, 0.3173, 0.469, 0.069, 0.010, 0.176], // [dog]
    [0.057, 0.0546, 0.205, 0.003, 0.402, 0.237, 0.040], // [dog, walks]
    [0.060, 0.060, 0.002, 0.171, 0.213, 0.452, 0.039], // [dog, bites]
];

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let runs: usize = args.get(1).and_then(|s| s.parse().ok()).unwrap_or(500);
    let loops: usize = args.get(2).and_then(|s| s.parse().ok()).unwrap_or(1000);
    let threads: usize = args
        .get(3)
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| {
            thread::available_parallelism().map(|n| n.get()).unwrap_or(4)
        });

    let p = Params::default();
    eprintln!(
        "replicating: {runs} runs × {loops} sentences ({} timesteps each), \
         {} nodes, p_link {}, leak {}, on {threads} threads",
        loops * 4,
        p.nnodes,
        p.p_link,
        p.leak
    );

    let next = Arc::new(Mutex::new(0usize));
    let results: Arc<Mutex<Vec<RunResult>>> = Arc::new(Mutex::new(Vec::new()));
    let done = Arc::new(Mutex::new(0usize));

    thread::scope(|scope| {
        for _ in 0..threads {
            let next = Arc::clone(&next);
            let results = Arc::clone(&results);
            let done = Arc::clone(&done);
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
                // Seed per run so the whole replication is reproducible.
                let r = run_once(p, 0xB1A5_0000 ^ run as u64, loops, 100);
                results.lock().unwrap().push(r);
                let mut d = done.lock().unwrap();
                *d += 1;
                if *d % 25 == 0 || *d == runs {
                    eprintln!("  {}/{} runs", *d, runs);
                }
            });
        }
    });

    let results = std::mem::take(&mut *results.lock().unwrap());

    // ---- grand averages, skipping NaN cells (a token absent from a run's tail)
    let tests = table2_tests();
    let mut grand = vec![[0.0f64; 7]; tests.len()];
    let mut counts = vec![[0usize; 7]; tests.len()];
    for r in &results {
        for (t, row) in r.corr.iter().enumerate() {
            for k in 0..7 {
                if row[k].is_finite() {
                    grand[t][k] += row[k];
                    counts[t][k] += 1;
                }
            }
        }
    }
    for t in 0..tests.len() {
        for k in 0..7 {
            if counts[t][k] > 0 {
                grand[t][k] /= counts[t][k] as f64;
            } else {
                grand[t][k] = f64::NAN;
            }
        }
    }

    // ---- population-code strength
    let mut pop = [0.0f64; 7];
    let mut pop_n = [0usize; 7];
    for r in &results {
        for k in 0..7 {
            if r.popcodes[k].is_finite() {
                pop[k] += r.popcodes[k];
                pop_n[k] += 1;
            }
        }
    }

    println!("\n=== Table 2 — fading-memory correlations, {runs}-run grand average ===\n");
    print!("{:<22}", "test input");
    for l in LABELS.iter() {
        print!("{:>11}", l);
    }
    println!();
    for (t, test) in tests.iter().enumerate() {
        print!("{:<22}", test.label());
        for k in 0..7 {
            // Mark the argmax — the paper bolds it.
            let is_max = (0..7)
                .filter(|&j| grand[t][j].is_finite())
                .all(|j| grand[t][k] >= grand[t][j]);
            let cell = format!("{:.3}{}", grand[t][k], if is_max { "*" } else { " " });
            print!("{:>11}", cell);
        }
        println!();
    }

    println!("\n=== published Table 2 (Falandays et al. 2021) ===\n");
    print!("{:<22}", "test input");
    for l in LABELS.iter() {
        print!("{:>11}", l);
    }
    println!();
    for (t, test) in tests.iter().enumerate() {
        print!("{:<22}", test.label());
        for k in 0..7 {
            let is_max = (0..7).all(|j| PUBLISHED[t][k] >= PUBLISHED[t][j]);
            let cell = format!("{:.3}{}", PUBLISHED[t][k], if is_max { "*" } else { " " });
            print!("{:>11}", cell);
        }
        println!();
    }

    // ---- agreement summary
    let mut argmax_hits = 0;
    let mut rank2_hits = 0;
    let mut abs_err = 0.0;
    let mut cells = 0;
    for t in 0..tests.len() {
        let mine = rank_desc(&grand[t]);
        let theirs = rank_desc(&PUBLISHED[t]);
        if mine[0] == theirs[0] {
            argmax_hits += 1;
        }
        if mine[1] == theirs[1] {
            rank2_hits += 1;
        }
        for k in 0..7 {
            if grand[t][k].is_finite() {
                abs_err += (grand[t][k] - PUBLISHED[t][k]).abs();
                cells += 1;
            }
        }
    }

    println!("\n=== agreement ===");
    println!("  top-1 token matches published:  {argmax_hits}/6 rows");
    println!("  top-2 token matches published:  {rank2_hits}/6 rows");
    println!("  mean |difference| per cell:     {:.4}", abs_err / cells as f64);

    println!("\n=== population-code strength (paper reports 0.65–0.77) ===");
    for k in 0..7 {
        if pop_n[k] > 0 {
            println!("  {:<11} {:.3}", LABELS[k], pop[k] / pop_n[k] as f64);
        }
    }

    let me: f64 = results
        .iter()
        .filter(|r| r.final_mean_error.is_finite())
        .map(|r| r.final_mean_error)
        .sum::<f64>()
        / results.len() as f64;
    println!("\n  mean homeostatic error at end of training: {me:.4}");
}

/// Token indices ordered by descending value.
fn rank_desc(row: &[f64; 7]) -> Vec<usize> {
    let mut idx: Vec<usize> = (0..7).collect();
    idx.sort_by(|&a, &b| {
        row[b]
            .partial_cmp(&row[a])
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    idx
}
