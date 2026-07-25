//! Probes §5.5 of the paper: does mean activation rise when the input violates
//! the grammar? Averages over many independently trained networks, because a
//! single network's response to one token is noise.
//!
//!   cargo run --release --bin surprise -- [runs]

use homeostasis_engine::model::{snapshot, train, Model, Params, LABELS};

/// Four-token sequences to compare. Index into KEYS/LABELS.
/// 0 man_s · 1 dog_s · 2 walks · 3 bites · 4 dog_o · 5 man_o · 6 space
const CONDITIONS: [(&str, [usize; 4]); 5] = [
    ("grammatical, likely   ", [0, 2, 4, 6]),
    ("grammatical, unlikely ", [0, 3, 4, 6]),
    ("noun in verb slot     ", [0, 0, 1, 6]),
    ("verb in object slot   ", [0, 2, 3, 6]),
    ("all verbs             ", [2, 2, 2, 6]),
];

fn main() {
    let runs: usize = std::env::args()
        .nth(1)
        .and_then(|s| s.parse().ok())
        .unwrap_or(200);
    let p = Params::default();

    let mut sums = [[0.0f64; 4]; CONDITIONS.len()];
    let mut spike_sums = [[0.0f64; 4]; CONDITIONS.len()];
    let mut base_mean = 0.0;
    let mut base_sd = 0.0;

    for run in 0..runs {
        let mut m = Model::new(p, 0x5A17_0000u64 ^ run as u64);
        let rec = train(&mut m, 1000, 100);
        let end = snapshot(&m);

        // Baseline: mean activation over the recorded tail of training.
        let n = rec.mean_acts.len() as f64;
        let mean = rec.mean_acts.iter().sum::<f64>() / n;
        let var = rec.mean_acts.iter().map(|x| (x - mean).powi(2)).sum::<f64>() / n;
        base_mean += mean;
        base_sd += var.sqrt();

        for (ci, (_, seq)) in CONDITIONS.iter().enumerate() {
            // Rewind to the end of training and run the sequence.
            m.wmat.copy_from_slice(&end.0);
            m.acts.copy_from_slice(&end.1);
            m.spikes.copy_from_slice(&end.2);
            for (t, &k) in seq.iter().enumerate() {
                m.present_key(k, true);
                sums[ci][t] += m.mean_activation();
                spike_sums[ci][t] += m.spike_count() as f64;
            }
        }
    }

    let r = runs as f64;
    println!(
        "\nbaseline over training tail: mean activation {:.4}, sd {:.4}  ({runs} networks)\n",
        base_mean / r,
        base_sd / r
    );
    let bm = base_mean / r;
    let bsd = base_sd / r;

    println!("{:<24} {:>34}", "condition", "mean activation by timestep (z)");
    for (ci, (name, seq)) in CONDITIONS.iter().enumerate() {
        print!("{name}");
        for t in 0..4 {
            let v = sums[ci][t] / r;
            let z = (v - bm) / bsd;
            print!("  {}={:.3}({:+.1}σ)", short(seq[t]), v, z);
        }
        println!();
    }

    println!("\n{:<24} {:>30}", "condition", "spikes fired by timestep");
    for (ci, (name, seq)) in CONDITIONS.iter().enumerate() {
        print!("{name}");
        for t in 0..4 {
            print!("  {}={:.1}", short(seq[t]), spike_sums[ci][t] / r);
        }
        println!();
    }
    println!("\n(labels: {})", LABELS.join(", "));
}

fn short(k: usize) -> &'static str {
    ["man_s", "dog_s", "walks", "bites", "dog_o", "man_o", "spc"][k]
}
