//! Native-only validator for the folding engine. Not shipped to the browser —
//! this is what makes it safe to ship the browser build.
//!
//!   cargo run --release --bin check            # gradients + a folding run
//!   cargo run --release --bin check scan       # temperature scan, finds T_f
//!   cargo run --release --bin check bench      # steps/s per protein
//!
//! Two things must hold before the wasm build is worth deploying:
//!   1. every analytic force matches a central finite difference of V
//!   2. a chain released from a random coil actually reaches the native state

use fold_engine::model::{grad_report, max_grad_error, Sim};
use std::time::Instant;

fn load() -> Vec<(String, usize, Vec<f32>)> {
    let raw = std::fs::read_to_string(concat!(env!("CARGO_MANIFEST_DIR"), "/testdata.txt"))
        .expect("testdata.txt — regenerate with extract-testdata.py");
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .map(|l| {
            let mut it = l.split_whitespace();
            let id = it.next().unwrap().to_string();
            let n: usize = it.next().unwrap().parse().unwrap();
            let ca: Vec<f32> = it.map(|t| t.parse().unwrap()).collect();
            assert_eq!(ca.len(), 3 * n, "{id}: coordinate count");
            (id, n, ca)
        })
        .collect()
}

fn mount(n: usize, ca: &[f32], cutoff: f32) -> Sim {
    let mut s = Sim::new(n);
    s.nat.copy_from_slice(ca);
    s.build(cutoff);
    s
}

fn gradients() -> bool {
    println!("== per-term gradient check: max rel err at h=3e-2 / h=3e-3");
    println!("   (error shrinking with h = truncation noise; error flat = a bug)");
    println!("   {:6} {:>18} {:>18} {:>18} {:>18}", "", "bond", "angle", "dihedral", "pair");
    for (id, n, ca) in load().iter().take(4) {
        let mut s = mount(*n, ca, 8.0);
        s.reset(7, 1);
        let mut r = fold_engine::model::Rng(0xABCDEF12_3456789A);
        for k in 0..3 * n { s.x[k] += (r.unit() - 0.5) * 1.2; }
        let g = grad_report(&mut s);
        print!("   {id:6}");
        for (a, b) in g { print!(" {a:>8.1e}/{b:>8.1e}"); }
        println!();
    }
    println!();
    println!("== analytic force vs central finite difference of V");
    let mut ok = true;
    for (id, n, ca) in load().iter().take(6) {
        let mut s = mount(*n, ca, 8.0);
        // Perturb off the native minimum so every term is active and no
        // gradient is sitting at zero by construction.
        s.reset(7, 1);
        let mut r = fold_engine::model::Rng(0xABCDEF12_3456789A);
        for k in 0..3 * n {
            s.x[k] += (r.unit() - 0.5) * 1.2;
        }
        let e = max_grad_error(&mut s, 1e-2);
        let pass = e < 2e-3;
        ok &= pass;
        println!(
            "   {:6} n={:4} contacts={:5}  max rel err = {:.2e}  {}",
            id,
            n,
            s.con.len(),
            e,
            if pass { "ok" } else { "FAIL" }
        );
    }
    // A coil is a much harsher test: steep excluded-volume terms, angles far
    // from reference, dihedrals wrapping.
    let (id, n, ca) = &load()[2];
    let mut s = mount(*n, ca, 8.0);
    s.reset(3, 0);
    let e = max_grad_error(&mut s, 1e-2);
    let pass = e < 5e-3;
    ok &= pass;
    println!("   {id:6} from a random coil          max rel err = {e:.2e}  {}",
             if pass { "ok" } else { "FAIL" });
    ok
}

fn fold_run(id: &str, n: usize, ca: &[f32], temp: f32, steps: u32, seed: u32, verbose: bool) -> (f32, f32, f32) {
    let mut s = mount(n, ca, 8.0);
    s.temp = temp;
    s.gamma = 0.25;
    s.reset(seed, 0);
    let chunk = steps / 20;
    let mut best_q = 0.0f32;
    if verbose {
        println!("   {id} n={n} contacts={} T={temp}", s.con.len());
        println!("      {:>10}  {:>6}  {:>8}  {:>7}  {:>7}", "step", "Q", "E", "Rg", "RMSD");
    }
    for b in 0..20 {
        s.step(chunk);
        best_q = best_q.max(s.q);
        if verbose && (b % 4 == 3 || b == 19) {
            println!(
                "      {:>10}  {:>6.3}  {:>8.1}  {:>7.2}  {:>7.2}",
                s.steps as u64, s.q, s.e_total, s.rg, s.rmsd()
            );
        }
    }
    (s.q, best_q, s.rmsd())
}

fn main() {
    let mode = std::env::args().nth(1).unwrap_or_default();
    let data = load();

    match mode.as_str() {
        "scan" => {
            println!("== temperature scan: final Q after 4M steps, mean of 3 seeds");
            print!("{:8}", "protein");
            let temps = [0.6f32, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4];
            for t in temps {
                print!("{:>8.1}", t);
            }
            println!();
            for (id, n, ca) in data.iter().take(6) {
                print!("{id:8}");
                for t in temps {
                    let q: f32 = (0..3).map(|s| fold_run(id, *n, ca, t, 4_000_000, s, false).0).sum::<f32>() / 3.0;
                    print!("{q:>8.2}");
                }
                println!();
            }
        }
        "profile" => {
            // The table that justifies the shipped defaults, and the numbers
            // fold/CLAUDE.md quotes. Steps-to-fold is what decides whether the
            // site is worth looking at: a fold nobody can wait for is a bug.
            println!("== at shipped defaults T=0.80 gamma=0.10 dt=0.010, cutoff 8.0 A");
            println!("   {:6} {:>5} {:>9} {:>14} {:>12} {:>10}", "pdb", "n", "contacts", "steps to fold", "steps/s", "seconds");
            for (id, n, ca) in data.iter() {
                let mut hits: Vec<f64> = Vec::new();
                for seed in 0..5u32 {
                    let mut s = mount(*n, ca, 8.0);
                    s.temp = 0.80; s.gamma = 0.10; s.dt = 0.010;
                    s.reset(seed, 0);
                    let mut when = f64::INFINITY;
                    let cap = if *n > 200 { 40 } else { 200 };
                    for _ in 0..cap {
                        s.step(10_000);
                        if s.q >= 0.85 { when = s.steps; break; }
                    }
                    hits.push(when);
                }
                hits.sort_by(|a, b| a.partial_cmp(b).unwrap());
                let med = hits[2];
                let mut s = mount(*n, ca, 8.0);
                s.reset(1, 0);
                let t = Instant::now();
                s.step(2000);
                let rate = 2000.0 / t.elapsed().as_secs_f64();
                let steps_txt = if med.is_finite() { format!("{:.0}k", med / 1e3) } else { "never".into() };
                let secs_txt = if med.is_finite() { format!("{:.1}", med / rate) } else { "--".into() };
                println!("   {:6} {:>5} {:>9} {:>14} {:>12.0} {:>10}", id, n, s.con.len(), steps_txt, rate, secs_txt);
            }
        }
        "tune" => {
            // Steps to first reach Q >= 0.85, median of 5 seeds, capped.
            // This is what sets the defaults the browser ships with: the site
            // is only good if a fold happens inside a few seconds of watching.
            println!("== steps to fold (Q>=0.85), median of 5 seeds, cap 6M   [-- = never]");
            let cases: [(f32, f32, f32); 9] = [
                (0.7, 0.25, 0.005), (0.8, 0.25, 0.005), (0.9, 0.25, 0.005),
                (0.8, 0.10, 0.005), (0.8, 0.05, 0.005), (0.8, 0.50, 0.005),
                (0.8, 0.25, 0.010), (0.8, 0.10, 0.010), (0.8, 0.10, 0.015),
            ];
            print!("{:8}", "protein");
            for (t, g, dt) in cases { print!("  T{t:.2}/g{g:.2}/dt{dt:.3}"); }
            println!();
            for (id, n, ca) in data.iter().take(7) {
                print!("{id:8}");
                for (t, g, dt) in cases {
                    let mut hits: Vec<f64> = Vec::new();
                    for seed in 0..5u32 {
                        let mut s = mount(*n, ca, 8.0);
                        s.temp = t; s.gamma = g; s.dt = dt;
                        s.reset(seed, 0);
                        let mut when = f64::INFINITY;
                        for _ in 0..600 {
                            s.step(10_000);
                            if s.q >= 0.85 { when = s.steps; break; }
                        }
                        hits.push(when);
                    }
                    hits.sort_by(|a, b| a.partial_cmp(b).unwrap());
                    let med = hits[2];
                    if med.is_finite() { print!("{:>20}", format!("{:.2}M", med / 1e6)); }
                    else { print!("{:>20}", "--"); }
                }
                println!();
            }
        }
        "bench" => {
            println!("== single-thread throughput (native)");
            for (id, n, ca) in data.iter() {
                let mut s = mount(*n, ca, 8.0);
                s.reset(1, 0);
                let t = Instant::now();
                s.step(2000);
                let per = t.elapsed().as_secs_f64() / 2000.0;
                println!(
                    "   {:6} n={:4} contacts={:5}  {:8.2} us/step  {:>9.0} steps/s",
                    id, n, s.con.len(), per * 1e6, 1.0 / per
                );
            }
        }
        _ => {
            let g = gradients();
            println!();
            println!("== folding from a random coil");
            let mut folded = 0;
            let mut tried = 0;
            for (id, n, ca) in data.iter().take(6) {
                let steps = if *n < 40 { 4_000_000 } else { 8_000_000 };
                let (q, best, rms) = fold_run(id, *n, ca, 0.9, steps, 11, true);
                tried += 1;
                if q > 0.7 {
                    folded += 1;
                }
                println!("      -> final Q={q:.3} bestQ={best:.3} RMSD={rms:.2} A\n");
            }
            println!("gradients: {}", if g { "PASS" } else { "FAIL" });
            println!("folded {folded}/{tried} at T=0.9");
            if !g {
                std::process::exit(1);
            }
        }
    }
}
