//! Known-answer tests. Every expansion below is checked against the published
//! one, not against this implementation's own output, so a regression here
//! means the picture on the page is wrong about a number.

use crate::cf::*;
use crate::curve::*;

/// π to 40 significant figures.
const PI40: &str = "3.141592653589793238462643383279502884197";
/// e to 40.
const E40: &str = "2.718281828459045235360287471352662497757";
/// ln 2 to 40.
const LN2_40: &str = "0.6931471805599453094172321214581765680755";
/// 2^(1/3) to 40 — the cube root has no periodic expansion, being cubic.
const CBRT2_40: &str = "1.259921049894873164767210607278228350570";

fn terms_of(e: &Expansion, n: usize) -> Vec<i64> {
    e.terms.iter().take(n).cloned().collect()
}

// --------------------------------------------------------------- rationals --

#[test]
fn rational_expansions_are_the_published_ones() {
    // 22/7 = [3; 7] — one big circle, seven ripples.
    let e = cf_rational(22, 7);
    assert_eq!(e.terms, vec![3, 7]);
    assert_eq!(e.qs, vec![1, 7]);

    // 355/113 = [3; 7, 16] — the same seven lobes, with 113 fine ones on top.
    let e = cf_rational(355, 113);
    assert_eq!(e.terms, vec![3, 7, 16]);
    assert_eq!(e.qs, vec![1, 7, 113]);

    // 5/8 = [0; 1,1,1,2]
    let e = cf_rational(5, 8);
    assert_eq!(e.terms, vec![0, 1, 1, 1, 2]);
    assert_eq!(e.qs, vec![1, 1, 2, 3, 8]);

    // 1/2 = [0; 2] — a unit circle plus a half-size double-speed one.
    let e = cf_rational(1, 2);
    assert_eq!(e.terms, vec![0, 2]);
    assert_eq!(e.qs, vec![1, 2]);
}

#[test]
fn only_the_fractional_part_draws() {
    // q_0 = 1 whatever a_0 is, and a_0 appears nowhere else, so x and x+1 have
    // identical frequency lists. The page claims this; here it is.
    for (p, q) in [(22i128, 7i128), (5, 8), (1, 2), (355, 113)] {
        let a = cf_rational(p, q);
        let b = cf_rational(p + 3 * q, q);
        assert_eq!(a.qs, b.qs, "{p}/{q}");
        assert_ne!(a.terms[0], b.terms[0]);
    }
}

#[test]
fn euclid_never_ends_in_one() {
    // The canonical-form claim in cf_rational's doc comment, checked over every
    // fraction with a denominator up to 200.
    for q in 1..=200i128 {
        for p in 0..=q {
            let e = cf_rational(p, q);
            if e.terms.len() > 1 {
                assert_ne!(*e.terms.last().unwrap(), 1, "{p}/{q} -> {:?}", e.terms);
            }
        }
    }
}

#[test]
fn convergents_really_converge() {
    // |x - p_k/q_k| < 1/q_k², the defining property of a convergent.
    let e = cf_decimal(PI40).unwrap();
    let x = std::f64::consts::PI;
    for k in 0..e.qs.len().min(8) {
        let (p, q) = (e.ps[k] as f64, e.qs[k] as f64);
        assert!((x - p / q).abs() < 1.0 / (q * q), "convergent {k} of pi");
    }
    // and the famous two are in the list
    assert!(e.qs.contains(&7) && e.qs.contains(&113));
}

// ------------------------------------------------------------------- surds --

#[test]
fn golden_ratio_is_all_ones_and_fibonacci() {
    // φ = (1+√5)/2 = [1; 1,1,1,…]. Every term 1 is the slowest possible growth
    // of q_k, which is why φ draws the roughest picture on the page.
    let e = cf_surd(1, 1, 2, 5, 20).unwrap();
    assert_eq!(terms_of(&e, 12), vec![1; 12]);
    assert_eq!(e.period, Some((0, 1)));
    assert_eq!(&e.qs[..10], &[1, 1, 2, 3, 5, 8, 13, 21, 34, 55]); // Fibonacci
    assert!(e.exact && !e.terminated);
}

#[test]
fn quadratic_surds_are_periodic_as_lagrange_says() {
    // √2 = [1; 2,2,2,…]
    let e = cf_surd(0, 1, 1, 2, 16).unwrap();
    assert_eq!(terms_of(&e, 6), vec![1, 2, 2, 2, 2, 2]);
    assert_eq!(e.period, Some((1, 1)));
    assert_eq!(&e.qs[..6], &[1, 2, 5, 12, 29, 70]);

    // √3 = [1; 1,2,1,2,…]
    let e = cf_surd(0, 1, 1, 3, 16).unwrap();
    assert_eq!(terms_of(&e, 7), vec![1, 1, 2, 1, 2, 1, 2]);
    assert_eq!(e.period, Some((1, 2)));

    // √5 = [2; 4,4,4,…]
    let e = cf_surd(0, 1, 1, 5, 12).unwrap();
    assert_eq!(terms_of(&e, 5), vec![2, 4, 4, 4, 4]);
    assert_eq!(e.period, Some((1, 1)));

    // √7 = [2; 1,1,1,4,…] — period 4, the first one long enough to be a shape
    let e = cf_surd(0, 1, 1, 7, 16).unwrap();
    assert_eq!(terms_of(&e, 9), vec![2, 1, 1, 1, 4, 1, 1, 1, 4]);
    assert_eq!(e.period, Some((1, 4)));
}

#[test]
fn surd_of_a_perfect_square_is_just_a_rational() {
    // √9/1 is 3, and the honest answer is the rational expansion, not a failure.
    let e = cf_surd(0, 1, 1, 9, 10).unwrap();
    assert_eq!(e.terms, vec![3]);
    assert!(e.terminated);
}

#[test]
fn surd_convergents_solve_pell() {
    // p² − 2q² = ±1 for every convergent of √2. A stronger check than the term
    // list: it says the p_k and q_k recurrences agree with the terms.
    let e = cf_surd(0, 1, 1, 2, 24).unwrap();
    for k in 1..e.qs.len() {
        let (p, q) = (e.ps[k], e.qs[k]);
        assert_eq!((p * p - 2 * q * q).abs(), 1, "convergent {k} of sqrt(2)");
    }
}

// ----------------------------------------------------------------- decimals --

#[test]
fn transcendental_expansions_are_the_published_ones() {
    // π = [3; 7, 15, 1, 292, 1, 1, 1, 2, 1, 3, 1, 14, 2, 1, …]
    let e = cf_decimal(PI40).unwrap();
    assert_eq!(terms_of(&e, 15), vec![3, 7, 15, 1, 292, 1, 1, 1, 2, 1, 3, 1, 14, 2, 1]);

    // e = [2; 1,2,1, 1,4,1, 1,6,1, 1,8,1, …] — the 2,4,6,8 pattern Euler found.
    let e = cf_decimal(E40).unwrap();
    assert_eq!(terms_of(&e, 13), vec![2, 1, 2, 1, 1, 4, 1, 1, 6, 1, 1, 8, 1]);

    // ln 2 = [0; 1, 2, 3, 1, 6, 3, 1, 1, 2, 1, 1, 1, 1, 3, 10, …]
    let e = cf_decimal(LN2_40).unwrap();
    assert_eq!(terms_of(&e, 15), vec![0, 1, 2, 3, 1, 6, 3, 1, 1, 2, 1, 1, 1, 1, 3]);

    // 2^(1/3) = [1; 3, 1, 5, 1, 1, 4, 1, 1, 8, 1, 14, 1, 10, 2, …]
    let e = cf_decimal(CBRT2_40).unwrap();
    assert_eq!(terms_of(&e, 15), vec![1, 3, 1, 5, 1, 1, 4, 1, 1, 8, 1, 14, 1, 10, 2]);
}

#[test]
fn a_decimal_is_honest_about_being_a_rational() {
    let e = cf_decimal(PI40).unwrap();
    assert!(!e.exact, "a decimal is exact as a rational, not as pi");
    assert!(e.terminated);
    // 40 digits carry the terms to q ≈ 10^20, far past anything we draw
    assert!(trusted_q(40) > Q_CEILING as f64);
}

#[test]
fn decimal_parsing_rejects_what_it_cannot_hold() {
    assert_eq!(parse_decimal("0.5"), Some((5, 10, 1)));
    assert_eq!(parse_decimal("-1.25"), Some((-125, 100, 3)));
    assert_eq!(parse_decimal("3"), Some((3, 1, 1)));
    // leading zeros are not significant figures
    assert_eq!(parse_decimal("0.007"), Some((7, 1000, 1)));
    assert!(parse_decimal("").is_none());
    assert!(parse_decimal("1.2.3").is_none());
    assert!(parse_decimal("pi").is_none());
}

#[test]
fn negative_numbers_floor_the_right_way() {
    // -1/2 = [-1; 2]: a_0 = floor(x) = -1, and the rest is the fractional part.
    let e = cf_rational(-1, 2);
    assert_eq!(e.terms, vec![-1, 2]);
    assert_eq!(e.qs, vec![1, 2]);
}

#[test]
fn isqrt_is_a_floor_not_a_round() {
    for n in 0..2000i128 {
        let r = isqrt(n);
        assert!(r * r <= n && (r + 1) * (r + 1) > n, "isqrt({n}) = {r}");
    }
    let big = 999_999_999_999i128;
    assert_eq!(isqrt(big * big), big);
    assert_eq!(isqrt(big * big - 1), big - 1);
}

#[test]
fn the_ceiling_stops_the_list_without_corrupting_it() {
    // φ's convergents are unbounded; the list must stop at Q_CEILING and every
    // entry below it must still be a Fibonacci number.
    let e = cf_surd(1, 1, 2, 5, 400).unwrap();
    assert!(*e.qs.last().unwrap() <= Q_CEILING);
    let (mut a, mut b) = (1i128, 0i128);
    for &q in &e.qs {
        assert_eq!(q, a);
        let n = a + b;
        b = a;
        a = n;
    }
}

// ----------------------------------------------------------------- drawing --

fn direct(qs: &[f64], amps: &[f64], t: f64) -> (f64, f64) {
    let (mut x, mut y) = (0.0, 0.0);
    for k in 0..qs.len() {
        x += amps[k] * (qs[k] * t).cos();
        y += amps[k] * (qs[k] * t).sin();
    }
    (x, y)
}

#[test]
fn the_incremental_sampler_agrees_with_plain_trigonometry() {
    // The sampler advances each term by one complex multiplication instead of
    // calling sin/cos, re-anchoring periodically. If that drifts, the picture
    // is subtly wrong in a way nothing else would catch.
    let e = cf_decimal(PI40).unwrap();
    let qs: Vec<f64> = e.qs.iter().take(6).map(|&q| q as f64).collect();
    let amps = amplitudes(&qs, 1.0);
    let n = 60_000;
    let mut xy = Vec::new();
    sample(&qs, &amps, 0.0, tau(), n, &mut xy);
    assert_eq!(xy.len(), 2 * n);
    for i in (0..n).step_by(997) {
        let t = tau() * i as f64 / n as f64;
        let (x, y) = direct(&qs, &amps, t);
        assert!((xy[2 * i] as f64 - x).abs() < 1e-5, "x at sample {i}");
        assert!((xy[2 * i + 1] as f64 - y).abs() < 1e-5, "y at sample {i}");
    }
}

#[test]
fn one_term_is_the_unit_circle() {
    let qs = [1.0];
    let amps = amplitudes(&qs, 1.0);
    let mut xy = Vec::new();
    sample(&qs, &amps, 0.0, tau(), 20_000, &mut xy);
    let b = bbox(&xy);
    for v in b { assert!((v.abs() - 1.0) < 1e-3, "bbox {b:?}"); }
    assert!((arc_length(&xy, true) - tau()).abs() < 1e-6, "{}", arc_length(&xy, true));
}

#[test]
fn alpha_is_the_exponent_on_q() {
    // α = 1 is the post's first picture, α = 1/2 the "introducing a sqrt" one.
    let qs = [1.0, 7.0, 113.0];
    assert_eq!(amplitudes(&qs, 1.0), vec![1.0, 1.0 / 7.0, 1.0 / 113.0]);
    let half = amplitudes(&qs, 0.5);
    assert!((half[1] - 1.0 / 7f64.sqrt()).abs() < 1e-12);
    // α = 0 is every circle at full size; α < 0 would grow them
    assert_eq!(amplitudes(&qs, 0.0), vec![1.0, 1.0, 1.0]);
}

#[test]
fn roughness_ranks_the_numbers_the_way_the_thread_says() {
    // "transcendental numbers are much smoother than low-degree algebraic
    // ones" — φ's q_k grow slowest, so its amplitudes decay slowest, so its pen
    // travels furthest. Arc length at a fixed term count is that, measured.
    let mut lens = Vec::new();
    for (name, qs) in [
        ("phi", cf_surd(1, 1, 2, 5, 40).unwrap().qs),
        ("sqrt2", cf_surd(0, 1, 1, 2, 40).unwrap().qs),
        ("e", cf_decimal(E40).unwrap().qs),
        ("pi", cf_decimal(PI40).unwrap().qs),
    ] {
        let qs: Vec<f64> = qs.iter().take(9).map(|&q| q as f64).collect();
        let amps = amplitudes(&qs, 1.0);
        let q_max = qs.iter().cloned().fold(1.0, f64::max);
        let n = samples_for(q_max, 24.0, 4096, 4_000_000);
        let mut xy = Vec::new();
        sample(&qs, &amps, 0.0, tau(), n, &mut xy);
        lens.push((name, arc_length(&xy, true)));
    }
    let phi = lens[0].1;
    for (name, l) in &lens[1..] {
        assert!(phi > *l, "phi ({phi:.1}) should be rougher than {name} ({l:.1})");
    }
}

#[test]
fn the_chain_ends_where_the_curve_is() {
    let e = cf_rational(355, 113);
    let qs: Vec<f64> = e.qs.iter().map(|&q| q as f64).collect();
    let amps = amplitudes(&qs, 1.0);
    let t = 0.77;
    let mut c = Vec::new();
    chain(&qs, &amps, t, &mut c);
    assert_eq!(c.len(), 2 * (qs.len() + 1));
    assert_eq!((c[0], c[1]), (0.0, 0.0));
    let (x, y) = direct(&qs, &amps, t);
    assert!((c[c.len() - 2] as f64 - x).abs() < 1e-5);
    assert!((c[c.len() - 1] as f64 - y).abs() < 1e-5);
}

#[test]
fn sample_count_tracks_the_fastest_term_not_the_canvas() {
    assert!(samples_for(113.0, 16.0, 512, 1 << 22) > samples_for(7.0, 16.0, 512, 1 << 22));
    assert_eq!(samples_for(1.0, 16.0, 512, 1 << 22), 512, "floor applies");
    assert_eq!(samples_for(1e9, 16.0, 512, 4096), 4096, "ceiling applies");
}

#[test]
fn the_plane_accumulates_and_stays_inside_itself() {
    let mut p = Plane::new(64, 64, 0.0, 0.0, 20.0);
    let qs = [1.0];
    let amps = amplitudes(&qs, 1.0);
    let mut xy = Vec::new();
    sample(&qs, &amps, 0.0, tau(), 4000, &mut xy);
    p.draw(&xy);
    assert_eq!(p.curves, 1);
    // one pass over a simple closed curve counts each pixel once, however
    // densely it was sampled — 4000 samples over ~126 pixels of circumference
    assert_eq!(p.max, 1, "oversampling must not brighten a pixel");
    assert_eq!(p.buf.iter().sum::<u32>(), p.buf.iter().filter(|&&v| v > 0).count() as u32,
               "one closed curve, one count per pixel it visits");
    let lit = p.buf.iter().filter(|&&v| v > 0).count();
    // a radius-20 circle in a 64² frame: on the order of 2πr pixels
    assert!(lit > 80 && lit < 400, "lit = {lit}");
    // the centre is inside the circle and must stay dark
    assert_eq!(p.buf[32 * 64 + 32], 0);

    // drawing it again doubles the counts, never the pixels
    p.draw(&xy);
    assert_eq!(p.max, 2);
    assert_eq!(p.buf.iter().filter(|&&v| v > 0).count(), lit);

    // and halving the sample count changes nothing about the picture
    let before = p.buf.clone();
    let mut sparse = Vec::new();
    sample(&qs, &amps, 0.0, tau(), 2000, &mut sparse);
    let mut q2 = Plane::new(64, 64, 0.0, 0.0, 20.0);
    q2.draw(&sparse);
    assert_eq!(q2.max, 1);
    assert_eq!(q2.buf.iter().filter(|&&v| v > 0).count(), lit);
    let _ = before;

    p.clear();
    assert_eq!(p.max, 0);
    assert_eq!(p.curves, 0);
    assert!(p.buf.iter().all(|&v| v == 0));
}

#[test]
fn a_curve_off_the_edge_does_not_write_off_the_edge() {
    // The overlay is drawn at a fixed scale, so curves do leave the frame.
    let mut p = Plane::new(32, 32, 900.0, 900.0, 50.0);
    let qs = [1.0, 2.0];
    let amps = amplitudes(&qs, 1.0);
    let mut xy = Vec::new();
    sample(&qs, &amps, 0.0, tau(), 2000, &mut xy);
    p.draw(&xy);
    assert_eq!(p.max, 0, "nothing in frame, nothing written");
    assert_eq!(p.curves, 1);
}

