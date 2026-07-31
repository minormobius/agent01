//! Known-answer and invariant tests for the port. `cargo test --release`.

use crate::model::*;

#[test]
fn grammar_rows_are_distributions() {
    for (i, row) in GRAMMAR.iter().enumerate() {
        let s: f64 = row.iter().sum();
        assert!((s - 1.0).abs() < 1e-12, "grammar row {i} sums to {s}");
    }
}

#[test]
fn grammar_sampling_matches_its_weights() {
    let mut rng = Rng::new(7);
    let mut counts = [0usize; 7];
    let n = 200_000;
    for _ in 0..n {
        // man_s → walks 75% of the time, bites 25%.
        counts[rng.choose(&GRAMMAR[0])] += 1;
    }
    let walks = counts[2] as f64 / n as f64;
    let bites = counts[3] as f64 / n as f64;
    assert!((walks - 0.75).abs() < 0.01, "walks share {walks}");
    assert!((bites - 0.25).abs() < 0.01, "bites share {bites}");
}

#[test]
fn rng_normal_has_unit_moments() {
    let mut rng = Rng::new(42);
    let n = 500_000;
    let mut sum = 0.0;
    let mut sq = 0.0;
    for _ in 0..n {
        let x = rng.normal();
        sum += x;
        sq += x * x;
    }
    let mean = sum / n as f64;
    let var = sq / n as f64 - mean * mean;
    assert!(mean.abs() < 0.01, "normal mean {mean}");
    assert!((var - 1.0).abs() < 0.02, "normal variance {var}");
}

#[test]
fn seeding_is_deterministic() {
    let p = Params::default();
    let a = run_once(p, 12345, 60, 20);
    let b = run_once(p, 12345, 60, 20);
    for t in 0..a.corr.len() {
        for k in 0..7 {
            assert_eq!(
                a.corr[t][k].is_nan(),
                b.corr[t][k].is_nan(),
                "nan mismatch at [{t}][{k}]"
            );
            if a.corr[t][k].is_finite() {
                assert!(
                    (a.corr[t][k] - b.corr[t][k]).abs() < 1e-12,
                    "run not reproducible at [{t}][{k}]"
                );
            }
        }
    }
}

#[test]
fn different_seeds_give_different_networks() {
    let p = Params::default();
    let a = Model::new(p, 1);
    let b = Model::new(p, 2);
    assert_ne!(a.wmat, b.wmat);
}

#[test]
fn no_self_connections() {
    let p = Params::default();
    let m = Model::new(p, 99);
    for i in 0..p.nnodes {
        assert!(!m.link[i * p.nnodes + i]);
        assert_eq!(m.wmat[i * p.nnodes + i], 0.0);
    }
}

#[test]
fn wiring_density_tracks_p_link() {
    let mut p = Params::default();
    p.nnodes = 400;
    let m = Model::new(p, 5);
    let links = m.link.iter().filter(|&&b| b).count() as f64;
    let possible = (p.nnodes * (p.nnodes - 1)) as f64;
    let density = links / possible;
    assert!(
        (density - p.p_link).abs() < 0.01,
        "wiring density {density}, expected ≈{}",
        p.p_link
    );
}

#[test]
fn spikes_are_binary_and_acts_non_negative() {
    let p = Params::default();
    let mut m = Model::new(p, 3);
    for _ in 0..400 {
        m.advance();
        for &s in &m.spikes {
            assert!(s == 0.0 || s == 1.0);
        }
        for &a in &m.acts {
            assert!(a >= 0.0, "activation went negative: {a}");
        }
    }
}

#[test]
fn targets_never_fall_below_their_floor() {
    let p = Params::default();
    let mut m = Model::new(p, 4);
    for _ in 0..800 {
        m.advance();
        for &t in &m.targets {
            assert!(t >= p.targ_min - 1e-12, "target {t} below floor");
        }
    }
}

/// The homeostatic claim: the network should end up much closer to its own
/// targets than it starts. This is the mechanism the whole paper rests on.
#[test]
fn homeostasis_reduces_error() {
    let p = Params::default();
    let mut m = Model::new(p, 11);
    let mut early = 0.0;
    for _ in 0..40 {
        m.advance();
        early += m.mean_abs_error();
    }
    early /= 40.0;

    for _ in 0..3600 {
        m.advance();
    }

    let mut late = 0.0;
    for _ in 0..40 {
        m.advance();
        late += m.mean_abs_error();
    }
    late /= 40.0;

    assert!(
        late < early,
        "homeostasis failed to reduce error: early {early:.4} → late {late:.4}"
    );
}

/// Population codes should emerge: two instances of the same token late in
/// training look far more alike than two instances of different tokens.
#[test]
fn population_codes_emerge() {
    let p = Params::default();
    let mut m = Model::new(p, 21);
    let rec = train(&mut m, 600, 100);

    let same = rec.population_code_strength(2).expect("walks occurred");
    // Cross-token: mean correlation between walks-instances and bites-instances.
    let walks: Vec<&Vec<f64>> = rec
        .stream
        .iter()
        .enumerate()
        .filter(|(_, &k)| k == 2)
        .map(|(i, _)| &rec.spikes[i])
        .collect();
    let mut cross = 0.0;
    let mut n = 0;
    for (i, &k) in rec.stream.iter().enumerate() {
        if k != 3 {
            continue;
        }
        for w in &walks {
            if let Some(c) = pearson(w, &rec.spikes[i]) {
                cross += c;
                n += 1;
            }
        }
    }
    let cross = cross / n as f64;

    assert!(
        same > cross + 0.2,
        "no population code: same-token {same:.3} vs cross-token {cross:.3}"
    );
}

/// The paper's headline result, at single-run scale: cut the input off after
/// `man`, and the fading memory should look most like `walks` — the token that
/// followed `man` 75% of the time — with `bites` second.
#[test]
fn fading_memory_completes_the_likely_continuation() {
    let p = Params::default();
    // Single runs are noisy by construction; average a handful, as the paper
    // averages 500.
    let mut acc = [0.0f64; 7];
    let mut counts = [0usize; 7];
    let runs = 24;
    for seed in 0..runs {
        let r = run_once(p, 900 + seed, 700, 100);
        for k in 0..7 {
            if r.corr[0][k].is_finite() {
                acc[k] += r.corr[0][k];
                counts[k] += 1;
            }
        }
    }
    for k in 0..7 {
        if counts[k] > 0 {
            acc[k] /= counts[k] as f64;
        }
    }

    let mut order: Vec<usize> = (0..7).collect();
    order.sort_by(|&a, &b| acc[b].partial_cmp(&acc[a]).unwrap());

    assert_eq!(
        order[0], 2,
        "expected `walks` to dominate the fading memory after [man]; got {:?} \
         with values {acc:?}",
        LABELS[order[0]]
    );
    assert_eq!(
        order[1], 3,
        "expected `bites` second after [man]; got {:?} with values {acc:?}",
        LABELS[order[1]]
    );
}

/// Position sensitivity: `man` and `dog` present identical input vectors in
/// subject and object position, so any difference between the subject and
/// object codes is purely temporal context.
#[test]
fn identical_inputs_get_position_specific_codes() {
    let p = Params::default();
    let mut m = Model::new(p, 31);
    let rec = train(&mut m, 700, 100);

    // Mean pattern for dog-as-subject vs dog-as-object.
    let mean_of = |key: usize| -> Vec<f64> {
        let rows: Vec<&Vec<f64>> = rec
            .stream
            .iter()
            .enumerate()
            .filter(|(_, &k)| k == key)
            .map(|(i, _)| &rec.spikes[i])
            .collect();
        let mut out = vec![0.0; p.nnodes];
        for r in &rows {
            for j in 0..p.nnodes {
                out[j] += r[j];
            }
        }
        for v in out.iter_mut() {
            *v /= rows.len() as f64;
        }
        out
    };

    let dog_s = mean_of(1);
    let dog_o = mean_of(4);
    let across_position = pearson(&dog_s, &dog_o).expect("both positions occurred");

    // Same input lines, different position — the codes should not be the same
    // pattern. If they were, the network would just be echoing its input.
    assert!(
        across_position < 0.9,
        "subject and object codes for the same input are indistinguishable \
         (r = {across_position:.3}) — no temporal context"
    );
}
