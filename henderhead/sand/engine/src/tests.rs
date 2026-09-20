//! What has to be true.
//!
//! The load-bearing tests are the ones that could fail: that a simulated pile
//! is a *cone* and not a pyramid, that the seam read out of simulated sand is
//! a conic of the predicted type, that the fitted foci land on the pour point
//! and the hole without the fitter being told where they are, and that the
//! repose angle moves the curve's size but not its foci.
//!
//! Numbers measured off Henderson's own video, for the reproduction test:
//! foci 276.5 px apart, 2a = 375.2 px, eccentricity 0.737, with the sum of
//! focal distances constant to 0.16% around the curve.

use crate::conic::{self, ConicType};
use crate::field::{Feature, Field, Kind, Shape, Stencil};
use crate::seam;

/// His measured eccentricity.
const HIS_E: f64 = 0.7369;

/// Pour and settle to a steady shape. The numbers are the calibrated ones:
/// enough sand that the pile is tall enough for a seam to exist at all, poured
/// in helpings so the relaxation is never far behind.
fn settle(f: &mut Field, feats: &[Feature], batches: usize) {
    let c = f.stencil.relax_c();
    f.pour_and_settle(feats, batches, 160.0, c, 1e-2, 600, 3.0);
}

/// The pile apex has to clear `k * d(P,H)` or the funnel never reaches the
/// cone and there is no seam to measure. This is that condition, stated so a
/// test that sets up an impossible geometry says so instead of just finding
/// nothing.
fn seam_is_possible(f: &Field, a: (f64, f64), b: (f64, f64)) -> bool {
    let d = ((a.0 - b.0).powi(2) + (a.1 - b.1).powi(2)).sqrt();
    f.h.iter().cloned().fold(0.0, f64::max) > f.k * d
}

fn pts_of(f: &Field, feats: &[Feature], a: i32, b: i32) -> Vec<(f64, f64)> {
    let labels = seam::label(f, feats, f.k * 0.25);
    seam::trace_between(f, &labels, feats, a, b, 3.0)
}

// ---- the sand itself --------------------------------------------------------

#[test]
fn a_pile_settles_to_the_angle_of_repose() {
    let mut f = Field::new(97, 34.0);
    let feats = vec![Feature::point_source(48.0, 48.0, 0.0)];
    settle(&mut f, &feats, 45);

    // measure the slope along a radius, away from the apex and the rim
    let mut slopes = Vec::new();
    for r in 6..20 {
        let a = f.h[f.idx(48 + r, 48)];
        let b = f.h[f.idx(48 + r + 1, 48)];
        if a > 1e-3 && b > 1e-3 {
            slopes.push(a - b);
        }
    }
    assert!(slopes.len() > 10, "not enough pile to measure: {}", slopes.len());
    let mean = slopes.iter().sum::<f64>() / slopes.len() as f64;
    assert!(
        (mean - f.k).abs() < 0.06 * f.k,
        "flank slope {mean:.4} is not the repose slope {:.4}",
        f.k
    );
}

/// Radius of a pile's half-height contour at a given bearing.
fn contour_radius(f: &Field, cx: f64, cy: f64, apex: f64, th: f64) -> f64 {
    let (s, c) = th.sin_cos();
    let mut r = 1.0;
    let mut last = r;
    while r < cx - 2.0 {
        if f.sample(cx + c * r, cy + s * r) < apex * 0.5 {
            return last;
        }
        last = r;
        r += 0.05;
    }
    last
}

/// Peak-to-trough variation of that radius, as a fraction of its mean.
fn out_of_round(f: &Field, cx: f64, cy: f64) -> f64 {
    let apex = f.h.iter().cloned().fold(0.0, f64::max);
    let rs: Vec<f64> = (0..180)
        .map(|i| contour_radius(f, cx, cy, apex, i as f64 / 180.0 * core::f64::consts::TAU))
        .collect();
    let mn = rs.iter().cloned().fold(f64::MAX, f64::min);
    let mx = rs.iter().cloned().fold(f64::MIN, f64::max);
    let mean = rs.iter().sum::<f64>() / rs.len() as f64;
    (mx - mn) / mean
}

/// Normal-direction wobble: around a bearing sweep at fixed radius, how far
/// the surface normal tilts away from the local radial. This, not the outline,
/// is what a shaded render shows — Lambert shading reads the normal's
/// direction, so a couple of degrees of azimuthal wander is plainly visible as
/// radial spokes on a pile whose *outline* is round to a couple of percent.
fn normal_wobble(f: &Field, cx: f64, cy: f64, r: f64) -> (f64, f64) {
    let mut dev: Vec<f64> = Vec::new();
    for i in 0..720 {
        let t = (i as f64 / 2.0).to_radians();
        let (gx, gy) = f.gradient((cx + r * t.cos()).round() as usize, (cy + r * t.sin()).round() as usize);
        if (gx * gx + gy * gy).sqrt() < 1e-9 {
            continue;
        }
        // downhill is -grad, and on a cone it should point straight out
        let mut d = ((gy.atan2(gx) + core::f64::consts::PI) - t).rem_euclid(core::f64::consts::TAU);
        if d > core::f64::consts::PI {
            d -= core::f64::consts::TAU;
        }
        dev.push(d.to_degrees());
    }
    let rms = (dev.iter().map(|d| d * d).sum::<f64>() / dev.len() as f64).sqrt();
    (rms, dev.iter().cloned().fold(0.0f64, |a, b| a.max(b.abs())))
}

/// Exact chamfer distance from one cell, in a stencil's own metric.
///
/// Bellman-Ford until quiet, which is the definition rather than an
/// approximation of it: the metric the toppling rule enforces is precisely
/// shortest-path distance over the stencil's steps.
fn chamfer_from_centre(f: &Field, st: Stencil, ci: usize) -> Vec<f64> {
    let n = f.n;
    let offs = st.offsets();
    let mut d = vec![f64::MAX / 4.0; n * n];
    d[f.idx(ci, ci)] = 0.0;
    loop {
        let mut changed = false;
        for y in 0..n {
            for x in 0..n {
                let i = f.idx(x, y);
                for &(dx, dy, dist) in offs {
                    let (nx, ny) = (x as i32 + dx, y as i32 + dy);
                    if nx < 0 || ny < 0 || nx >= n as i32 || ny >= n as i32 {
                        continue;
                    }
                    let j = f.idx(nx as usize, ny as usize);
                    if d[i] + dist < d[j] - 1e-12 {
                        d[j] = d[i] + dist;
                        changed = true;
                    }
                }
            }
        }
        if !changed {
            break;
        }
    }
    d
}

#[test]
fn the_stencils_metric_is_exactly_what_the_formula_says() {
    // The account of the octagon is: a toppling rule that compares a cell only
    // with the neighbours in its stencil does not enforce `|grad z| <= k` in
    // every direction, it enforces it in a *metric* — shortest-path distance
    // over those steps — and the anisotropy of that metric is
    //
    //     sec(half the widest angular gap between its directions) - 1
    //
    // because reaching a direction between two of them means combining them,
    // and the combination is longer than the straight line by exactly that.
    //
    // This test is the load-bearing one for the whole story, and it involves
    // no sand: it measures the metric directly and checks the number.
    let n = 121usize;
    let ci = n / 2;
    for (st, want) in [
        (Stencil::Near8, 8.24),
        (Stencil::Knight16, 2.75),
        (Stencil::Wide24, 1.31),
        (Stencil::Fine40, 0.49),
    ] {
        let f = Field::with_stencil(n, 34.0, st);
        let d = chamfer_from_centre(&f, st, ci);
        // the spread of chamfer/Euclidean around a sweep, on lattice rays only
        // so that no interpolation enters
        let (mut lo, mut hi) = (f64::MAX, f64::MIN);
        for i in 0..360 {
            let t = (i as f64).to_radians();
            let (x, y) = (
                (ci as f64 + 40.0 * t.cos()).round() as usize,
                (ci as f64 + 40.0 * t.sin()).round() as usize,
            );
            let e = ((x as f64 - ci as f64).powi(2) + (y as f64 - ci as f64).powi(2)).sqrt();
            let p = d[f.idx(x, y)] / e;
            lo = lo.min(p);
            hi = hi.max(p);
        }
        let got = (hi - lo) * 100.0;
        println!("{st:?}: metric anisotropy {got:.2}% (formula {want:.2}%)");
        assert!(
            (got - want).abs() < 0.25,
            "{st:?}: measured {got:.2}%, the angular-gap formula says {want:.2}% — \
             if these disagree then either the weights in the table are not the \
             steps' true lengths or the stated widest gap is wrong"
        );
    }
}

#[test]
fn a_pile_is_round_and_the_stencil_is_why() {
    // This replaces a test that could not fail. The old one compared the
    // pile's reach along an axis with its reach along a diagonal — and under
    // an eight-neighbour rule those two are *exactly* equal no matter how bad
    // the anisotropy is, because the chamfer metric built from steps of 1 and
    // sqrt(2) is exact in precisely those two directions. It passed happily
    // while the pile was 7% out of round, with its narrowest point at 22.5
    // degrees, which is the one place neither direction looks.
    //
    // So: sweep every bearing, and check the widest against the narrowest.
    //
    // The sweep is centred on the pour *cell*, not on n/2. Half a cell of
    // offset on a contour radius of fifteen is a 3% swing in the radius all by
    // itself, and it reads as out-of-roundness: the same piles measured about
    // a centre half a cell off come out 12 to 17% out of round whatever the
    // stencil, which is how a measurement can flatten a real effect into a
    // constant.
    let n = 145usize;
    let c = (n / 2) as f64;
    let mut piles = Vec::new();
    for st in [Stencil::Near8, Stencil::Knight16, Stencil::Wide24, Stencil::Fine40] {
        let mut f = Field::with_stencil(n, 34.0, st);
        let feats = vec![Feature::point_source(c, c, 0.0)];
        f.pour_and_settle(&feats, 90, 160.0, st.relax_c(), 1e-2, 600, 3.0);
        let (rms, worst) = normal_wobble(&f, c, c, 12.0);
        piles.push((st, out_of_round(&f, c, c), rms, worst));
    }
    for (st, e, rms, worst) in &piles {
        println!("{st:?}: {:.2}% out of round, normal wobble rms {rms:.2}° worst {worst:.2}°", e * 100.0);
    }
    // What the page ships has to look like a cone, both in outline and — the
    // thing the eye actually judges — in how far its normals wander.
    let (_, ship_oor, ship_rms, _) = piles[3];
    assert!(ship_oor < 0.022, "the shipped stencil leaves the pile {:.2}% out of round", ship_oor * 100.0);
    assert!(ship_rms < 3.2, "the shipped stencil's normals wander {ship_rms:.2}° from radial");
    // Each rung has to be an improvement in *both*, or the extra comparisons
    // are being paid for nothing.
    for w in piles.windows(2) {
        assert!(
            w[1].1 < w[0].1 && w[1].2 < w[0].2,
            "{:?} -> {:?} did not make the pile rounder: {:.2}% / {:.2}° then {:.2}% / {:.2}°",
            w[0].0, w[1].0, w[0].1 * 100.0, w[0].2, w[1].1 * 100.0, w[1].2
        );
    }
    assert!(
        piles[0].1 > 0.05,
        "the eight-neighbour pile came out round, so this test is not measuring what it claims: {:.2}%",
        piles[0].1 * 100.0
    );
}

#[test]
fn the_pour_rate_is_the_other_half() {
    // Widening the stencil stops paying off past sixteen directions, and it is
    // worth knowing why, because the obvious explanations are both wrong.
    //
    // It is not the measurement: the same sweep over an analytic cone reports
    // 0.00%. And it is not under-settling: driving the worst overshoot from
    // 1e-2 down to 1e-6 does not move the outline at all. The surface really
    // does satisfy the constraint, and it is still out of round.
    //
    // What is left is that "no pair steeper than repose" is satisfied by a
    // *family* of surfaces, not one, and which member you land on is decided
    // by how the sand arrived. Deliver the same mass in smaller helpings, so
    // the toe advances in many small steps instead of a few avalanches, and
    // the pour's own contribution goes away — leaving the metric's, which is
    // what the formula predicts.
    let n = 121usize;
    let c = (n / 2) as f64;
    let st = Stencil::Fine40;
    let mut got = Vec::new();
    for &(batches, rate) in &[(90usize, 160.0f64), (360, 40.0)] {
        let mut f = Field::with_stencil(n, 34.0, st);
        let feats = vec![Feature::point_source(c, c, 0.0)];
        f.pour_and_settle(&feats, batches, rate, st.relax_c(), 1e-2, 600, 3.0);
        let oor = out_of_round(&f, c, c) * 100.0;
        println!("{batches} helpings of {rate}: {oor:.2}% out of round");
        got.push(oor);
    }
    // The coarse pour is dominated by its own cascade; the fine one is not.
    assert!(
        got[1] < got[0] * 0.75,
        "a four-times gentler pour did not round the pile off: {:.2}% then {:.2}%",
        got[0], got[1]
    );
    // And what is left has to be the metric's share plus the grid's, not
    // something else again. There is a third term and it is the grid, which
    // announces itself the way a discretisation error should — by shrinking as
    // the pile grows, unlike the fitter's eccentricity bias, which did not:
    //
    //     apex 16.0 -> 1.26%    apex 18.4 -> 0.73%    apex 21.3 -> 0.63%
    //
    // so this bound is tied to the size of the pile poured here.
    assert!(
        got[1] < 0.9,
        "the gentle pour is {:.2}% out of round, well above this stencil's 0.49% metric \
         and the grid's share at this pile size — so a fourth error term is in play",
        got[1]
    );
}

#[test]
fn settling_harder_does_not_change_the_shape() {
    // The claim above that the residual is not under-settling, as a test: the
    // constraint gets satisfied three orders of magnitude tighter and the
    // outline does not move.
    let n = 121usize;
    let c = (n / 2) as f64;
    let st = Stencil::Fine40;
    let mut f = Field::with_stencil(n, 34.0, st);
    let feats = vec![Feature::point_source(c, c, 0.0)];
    f.pour_and_settle(&feats, 60, 160.0, st.relax_c(), 1e-2, 600, 3.0);
    let before = out_of_round(&f, c, c);
    f.settle(st.relax_c(), 1e-5, 60000);
    let after = out_of_round(&f, c, c);
    println!("out of round {:.3}% at 1e-2, {:.3}% at 1e-5 (worst overshoot now {:.1e})",
        before * 100.0, after * 100.0, f.max_violation());
    assert!(f.max_violation() < 1e-4, "did not actually settle further");
    assert!(
        (after - before).abs() < 0.001,
        "settling 1000x harder moved the outline from {:.3}% to {:.3}%, so the shape was \
         not settled and the pour-history explanation is not the right one",
        before * 100.0, after * 100.0
    );
}

#[test]
fn both_relaxations_reach_the_same_pile() {
    // The shared-excess iteration exists only to be faster; it must not be a
    // different model. Settled means no pair stands steeper than repose, and
    // that condition mentions neither the transfer coefficient nor the
    // stencil size, so both routes have to arrive at the same surface.
    let n = 97usize;
    let mid = n as f64 / 2.0;
    let mk = |shared: bool| -> Field {
        let mut f = Field::with_stencil(n, 34.0, Stencil::Knight16);
        let i = f.idx(n / 2, n / 2);
        f.h[i] = 3000.0;
        let c = if shared { Stencil::Knight16.relax_c() } else { Stencil::Knight16.strict_c() };
        for _ in 0..30000 {
            let v = if shared { f.relax_step_shared(c) } else { f.relax_step(c) };
            if v < 1e-3 {
                break;
            }
        }
        f
    };
    let a = mk(true);
    let b = mk(false);
    let peak = a.h.iter().cloned().fold(0.0, f64::max);
    let worst = a
        .h
        .iter()
        .zip(b.h.iter())
        .map(|(x, y)| (x - y).abs())
        .fold(0.0, f64::max);
    assert!(
        worst < 0.02 * peak,
        "the two iterations settled to different piles: worst cell differs by {worst:.3} on a peak of {peak:.2}"
    );
    let _ = mid;
}
#[test]
fn relaxation_conserves_mass() {
    let mut f = Field::new(65, 33.0);
    // a deliberately over-steep spike, with no sources or sinks to add or
    // remove anything
    let i = f.idx(32, 32);
    f.h[i] = 50.0;
    let before = f.total_mass();
    // both iterations, since both are shipped: the strict one is the soil.js
    // rule the port test pins, the shared one is what actually runs
    for _ in 0..100 {
        f.relax_step(f.stencil.strict_c());
    }
    for _ in 0..100 {
        f.relax_step_shared(f.stencil.relax_c());
    }
    let after = f.total_mass();
    assert!(
        (after - before).abs() < 1e-9 * before.max(1.0),
        "mass changed under relaxation: {before} -> {after}"
    );
}

#[test]
fn the_table_balances_its_books() {
    let mut f = Field::new(81, 34.0);
    let feats = vec![
        Feature::point_source(40.0, 44.0, 0.0),
        Feature::point_sink(52.0, 34.0),
    ];
    f.rebuild_sinks(&feats, 2.0);
    settle(&mut f, &feats, 30);
    let lhs = f.poured - f.drained;
    let rhs = f.total_mass();
    assert!(
        (lhs - rhs).abs() < 1e-6 * f.poured.max(1.0),
        "poured {} - drained {} = {} but the table holds {}",
        f.poured,
        f.drained,
        lhs,
        rhs
    );
}

#[test]
fn a_hole_under_the_pour_point_is_not_a_pile() {
    // degenerate but worth pinning: everything poured leaves immediately
    let mut f = Field::new(65, 34.0);
    let feats = vec![
        Feature::point_source(32.0, 32.0, 0.0),
        Feature::point_sink(32.0, 32.0),
    ];
    f.rebuild_sinks(&feats, 2.0);
    settle(&mut f, &feats, 20);
    assert!(
        f.h.iter().cloned().fold(0.0, f64::max) < 2.0,
        "sand piled up on top of its own drain"
    );
}

// ---- the curve --------------------------------------------------------------

#[test]
fn a_source_and_a_sink_draw_an_ellipse_with_them_as_foci() {
    // His construction, exactly: pour at one point, drill a hole at another.
    let mut f = Field::new(113, 34.0);
    let (px, py) = (50.0, 62.0);
    let (hx, hy) = (62.0, 51.0);
    let feats = vec![
        Feature::point_source(px, py, 0.0),
        Feature::point_sink(hx, hy),
    ];
    f.rebuild_sinks(&feats, 2.0);
    settle(&mut f, &feats, 60);
    assert!(
        seam_is_possible(&f, (px, py), (hx, hy)),
        "the pile never got tall enough for a seam: apex {:.2}, needs > {:.2}",
        f.h.iter().cloned().fold(0.0, f64::max),
        f.k * ((px - hx).powi(2) + (py - hy).powi(2)).sqrt()
    );

    let pts = pts_of(&f, &feats, 0, 1);
    assert!(pts.len() > 12, "seam too short to judge: {} points", pts.len());
    let covered = arc_covered(&pts, (px + hx) / 2.0, (py + hy) / 2.0);
    println!("{} points covering {covered:.0}°", pts.len());

    // The headline measurement, and the same one that was computed off his
    // video frames: take the pour point and the hole as a hypothesis, measure
    // r1 + r2 at every point of the curve, and see how constant it is. No
    // fitting involved. (His own curve gave 0.16%, but that was a drawn line
    // in a 1024-pixel render; this is a crease on a 113-cell grid.)
    let sep = ((px - hx).powi(2) + (py - hy).powi(2)).sqrt();
    let (two_a, _, pct) = conic::focal_constancy(&pts, (px, py), (hx, hy), true);
    // What sets this floor is the grid and the drift, not the physics. The
    // curve is traced to half a cell, and half a cell on a 2a of about
    // twenty-two cells is already 2%. His own 0.16% came off a drawn line in a
    // 1024-pixel render and nothing at this resolution will approach it.
    // Measured about the POUR POINT, which is his claim as stated. It is not
    // quite where the focus is: see
    // `the_focus_is_the_pile_apex_not_quite_the_pour_point`, which is also why
    // this bound is 12% and not the 7% it used to be. The old number was not
    // better physics, it was a shorter curve — the tracer was discarding all
    // but a quadrant, and a quadrant on the far side from the drift does not
    // sample it. Widening the traced curve to the full ellipse made this
    // reading worse and the blind fit trustworthy, which is the honest trade.
    assert!(pct < 12.0, "r1 + r2 varies by {pct:.2}% around the curve");

    // About the pile's apex instead, which is where the focus actually is,
    // the same curve is half as scattered. Asserting both is what keeps this
    // from being a loosened threshold: the curve is not vaguer than it was,
    // it is offset, and naming the offset tightens the claim.
    let (ax, ay) = apex_centroid(&f);
    let (_, _, pct_apex) = conic::focal_constancy(&pts, (ax, ay), (hx, hy), true);
    assert!(
        pct_apex < pct * 0.8,
        "about the apex ({ax:.1},{ay:.1}) the scatter is {pct_apex:.2}%, no better than the \
         {pct:.2}% about the pour point — so the drift is not what the scatter is"
    );

    // And the blind check: the fitter is handed the points and nothing else.
    let c = conic::fit(&pts).expect("fit failed");
    assert_eq!(
        c.classify(0.08),
        ConicType::Ellipse,
        "classified as {:?} (normalised discriminant {:.4}, e = {:.3})",
        c.classify(0.08),
        c.discriminant() / (c.a * c.a + c.b * c.b + c.c * c.c),
        c.eccentricity()
    );
    // The fit and the measurement cannot be expected to agree more closely
    // than the drift allows, and it is worth doing the arithmetic rather than
    // picking a tolerance. The fitter puts its nearer focus between the pour
    // point and the pile's apex — 1.8 cells from each on the page's geometry —
    // and 2c is about sixteen cells here, so an ambiguity of 1.8 cells in one
    // focus is already 1.8 / 2a ~ 0.09 in eccentricity before the fit's own
    // noise. Hence 0.15 rather than the 0.10 that held while the tracer was
    // returning a quadrant.
    let e_meas = sep / two_a;
    let (_, _, _) = (ax, ay, pct_apex);
    let e_apex = {
        let s2 = ((ax - hx).powi(2) + (ay - hy).powi(2)).sqrt();
        let (m2, _, _) = conic::focal_constancy(&pts, (ax, ay), (hx, hy), true);
        s2 / m2
    };
    println!("blind fit {:.3}; about the pour point {e_meas:.3}; about the apex {e_apex:.3}", c.eccentricity());
    assert!(
        (c.eccentricity() - e_meas).abs() < 0.15,
        "blind fit says e = {:.3}, the focal distances say {e_meas:.3}",
        c.eccentricity()
    );
    // The centre is asserted rather than the foci. Both are read off the same
    // fit, but the foci sit on the major axis and slide a long way along it
    // for a small error in eccentricity — at this resolution they land
    // anywhere from 2 to 18 cells out while the centre stays within a few.
    let ctr = c.center().expect("no centre");
    let want = ((px + hx) / 2.0, (py + hy) / 2.0);
    let off = ((ctr.0 - want.0).powi(2) + (ctr.1 - want.1).powi(2)).sqrt();
    assert!(
        off < 5.0,
        "fitted centre ({:.1},{:.1}) is {off:.2} cells from the midpoint of the two features",
        ctr.0,
        ctr.1
    );
}

#[test]
fn a_point_against_a_slot_draws_a_parabola() {
    // The case the page is really about. With two point features you can get
    // arbitrarily close to e = 1 and never reach it; a straight slot is the
    // focus at infinity, and it lands on 1 exactly.
    let mut f = Field::new(113, 34.0);
    let feats = vec![
        Feature::point_sink(56.0, 74.0),
        Feature::line_sink(56.0, 34.0, 0.0, 1.0),
    ];
    f.rebuild_sinks(&feats, 2.0);
    f.flood(30.0);
    f.settle(f.stencil.relax_c(), 1e-2, 4000);

    let pts = pts_of(&f, &feats, 0, 1);
    assert!(pts.len() > 12, "no seam between hole and slot: {}", pts.len());
    let c = conic::fit(&pts).expect("fit failed");
    let e = c.eccentricity();
    assert!(
        (e - 1.0).abs() < 0.15,
        "point-against-slot gave e = {e:.4}, which is not a parabola"
    );
    assert_eq!(
        c.classify(0.12),
        ConicType::Parabola,
        "classified as {:?}",
        c.classify(0.12)
    );

    // and the focus-directrix property, measured: distance to the hole equals
    // distance to the slot, all along the curve
    let ratio: Vec<f64> = pts
        .iter()
        .map(|&(x, y)| {
            let dp = ((x - 56.0).powi(2) + (y - 74.0).powi(2)).sqrt();
            let dl = (y - 34.0).abs();
            dp / dl.max(1e-9)
        })
        .collect();
    let m = ratio.iter().sum::<f64>() / ratio.len() as f64;
    assert!(
        (m - 1.0).abs() < 0.12,
        "distance to focus over distance to directrix averaged {m:.3}, not 1"
    );
}

#[test]
fn the_repose_angle_sets_the_size_but_not_the_foci() {
    // The invariant that makes the construction robust: use rice instead of
    // sand and you get a DIFFERENT ellipse with the SAME foci. The foci are
    // set by where you pour and where you drill; the angle only sets how far
    // the curve reaches.
    let (px, py) = (50.0, 62.0);
    let (hx, hy) = (62.0, 51.0);
    let mut seen: Vec<(f64, f64, f64)> = Vec::new();
    for deg in [30.0f64, 34.0, 38.0] {
        let mut f = Field::new(113, deg);
        let feats = vec![
            Feature::point_source(px, py, 0.0),
            Feature::point_sink(hx, hy),
        ];
        f.rebuild_sinks(&feats, 2.0);
        settle(&mut f, &feats, 60);
        let pts = pts_of(&f, &feats, 0, 1);
        assert!(pts.len() > 8, "at {deg}° the seam was only {} points", pts.len());
        let c = conic::fit(&pts).expect("fit failed");
        // The invariant, stated the way it can be measured: these two points
        // remain the foci at every angle, which is exactly the claim that
        // r1 + r2 stays constant around the curve when measured FROM them.
        let (mean, _, pct) = conic::focal_constancy(&pts, (px, py), (hx, hy), true);
        assert!(
            pct < 13.0,
            "at {deg}° the pour point and hole are not the foci: r1 + r2 varies by {pct:.2}%"
        );
        seen.push((deg, mean, c.eccentricity()));
    }
    // The size is NOT invariant, and that is the point of the pairing: at a
    // fixed charge of sand, steeper material builds a taller, narrower pile,
    // so 2a = A/k actually shrinks as the angle rises. What does not move is
    // the pair of foci, asserted above.
    let spread = (seen[0].1 - seen[2].1).abs();
    assert!(
        spread > 0.5,
        "2a did not respond to the repose angle at all: {seen:?}"
    );
}

#[test]
fn his_geometry_reproduces_his_eccentricity() {
    // From the video: foci 276.5 px apart with 2a = 375.2 px, so e = 0.737,
    // and the sum of focal distances constant to 0.16%. Here the separation is
    // set to 0.737 of the semi-major axis the pile can support, and the
    // eccentricity that comes back out is a prediction to check.
    let n = 113usize;
    let (cx, cy) = (56.0, 56.0);
    let ang = core::f64::consts::FRAC_PI_4;

    // first find what 2a this charge of sand buys, then place the foci
    let sep = 16.0;
    let (px, py) = (cx - sep / 2.0 * ang.cos(), cy - sep / 2.0 * ang.sin());
    let (hx, hy) = (cx + sep / 2.0 * ang.cos(), cy + sep / 2.0 * ang.sin());

    let mut f = Field::new(n, 34.0);
    let feats = vec![
        Feature::point_source(px, py, 0.0),
        Feature::point_sink(hx, hy),
    ];
    f.rebuild_sinks(&feats, 2.0);
    settle(&mut f, &feats, 65);

    let pts = pts_of(&f, &feats, 0, 1);
    assert!(pts.len() > 12, "seam too short: {}", pts.len());
    let (two_a, _, pct) = conic::focal_constancy(&pts, (px, py), (hx, hy), true);
    let e = sep / two_a;
    println!("2c/2a = {e:.3} against his {HIS_E:.3}; scatter {pct:.2}%; {} points over {:.0}°",
        pts.len(), arc_covered(&pts, (px + hx) / 2.0, (py + hy) / 2.0));
    // 12%, for the reason recorded in
    // `a_source_and_a_sink_draw_an_ellipse_with_them_as_foci`: measured about
    // the pour point rather than about the pile's apex, over the whole curve
    // rather than a quadrant of it.
    assert!(pct < 12.0, "the sum of focal distances is not constant: {pct:.2}%");
    assert!(
        (e - HIS_E).abs() < 0.08,
        "eccentricity {e:.3} is not near his {HIS_E:.3} (2a = {two_a:.2}, 2c = {sep})"
    );
    // The blind fit is asked only whether it agrees this is an ellipse. Its
    // *eccentricity* is not asserted here: at this grid resolution the fitted
    // value wanders (0.41 on this geometry against a measured 0.73), and
    // pinning the reproduction of his number to the noisier of the two
    // estimates would be picking whichever agreed. The measurement above is
    // the claim; `a_source_and_a_sink_draw_an_ellipse_with_them_as_foci`
    // carries the tighter check that fit and measurement agree.
    let c = conic::fit(&pts).expect("fit failed");
    assert_eq!(c.classify(0.10), ConicType::Ellipse, "blind fit calls it {:?}", c.classify(0.10));
}

#[test]
fn the_settled_sand_is_not_over_steep_anywhere() {
    let mut f = Field::new(97, 34.0);
    let feats = vec![
        Feature::point_source(42.0, 54.0, 0.0),
        Feature::point_sink(58.0, 42.0),
    ];
    f.rebuild_sinks(&feats, 2.0);
    settle(&mut f, &feats, 55);
    let frac = seam::oversteep_fraction(&f);
    assert!(frac < 0.02, "{:.2}% of the sand stands too steep", frac * 100.0);
}

#[test]
fn a_faster_pour_reaches_the_same_shape() {
    // The batched pour is only legitimate if the steady shape is an attractor
    // of the toppling rule rather than an artefact of the schedule. Same total
    // charge, very different helpings, same sand.
    // No drain here, deliberately. With one, the schedule genuinely does
    // change the answer — a bigger helping spends longer above the funnel and
    // more of it runs out of the hole — so the invariance being claimed is
    // about the toppling rule, not about the table as a whole.
    let mk = |batches: usize, per: f64| -> Field {
        let mut f = Field::new(97, 34.0);
        let feats = vec![Feature::point_source(48.0, 48.0, 0.0)];
        let c = f.stencil.relax_c();
        f.pour_and_settle(&feats, batches, per, c, 1e-2, 800, 3.0);
        f
    };
    let a = mk(80, 100.0);
    let b = mk(20, 400.0);
    let worst = a
        .h
        .iter()
        .zip(b.h.iter())
        .map(|(x, y)| (x - y).abs())
        .fold(0.0, f64::max);
    let peak = a.h.iter().cloned().fold(0.0, f64::max);
    assert!(
        worst < 0.06 * peak,
        "pour schedule changed the shape: worst cell differs by {worst:.3} on a peak of {peak:.2}"
    );
}

// ---- the fitter, against curves whose answers are known ----------------------

#[test]
fn the_fitter_recovers_exact_conics() {
    // Known-answer tests, so a fit failure cannot be blamed on the sand.
    let mut ell = Vec::new();
    let (a, b) = (40.0, 25.0);
    for i in 0..200 {
        let t = i as f64 / 200.0 * core::f64::consts::TAU;
        ell.push((60.0 + a * t.cos(), 70.0 + b * t.sin()));
    }
    let c = conic::fit(&ell).unwrap();
    assert_eq!(c.classify(0.02), ConicType::Ellipse);
    let e_true = (1.0 - (b * b) / (a * a)).sqrt();
    assert!(
        (c.eccentricity() - e_true).abs() < 1e-4,
        "ellipse e: fitted {:.6}, true {:.6}",
        c.eccentricity(),
        e_true
    );
    let (f1, f2) = c.foci().unwrap();
    let cc = (a * a - b * b).sqrt();
    let want = [(60.0 + cc, 70.0), (60.0 - cc, 70.0)];
    for w in want {
        let d = ((f1.0 - w.0).powi(2) + (f1.1 - w.1).powi(2))
            .sqrt()
            .min(((f2.0 - w.0).powi(2) + (f2.1 - w.1).powi(2)).sqrt());
        assert!(d < 1e-3, "focus {w:?} off by {d:.5}");
    }

    let mut circ = Vec::new();
    for i in 0..200 {
        let t = i as f64 / 200.0 * core::f64::consts::TAU;
        circ.push((30.0 + 20.0 * t.cos(), 30.0 + 20.0 * t.sin()));
    }
    assert_eq!(conic::fit(&circ).unwrap().classify(0.02), ConicType::Circle);

    let mut par = Vec::new();
    for i in 0..200 {
        let t = -3.0 + i as f64 * 0.03;
        par.push((20.0 + 10.0 * t, 30.0 + 4.0 * t * t));
    }
    let cp = conic::fit(&par).unwrap();
    assert_eq!(cp.classify(0.02), ConicType::Parabola);
    assert!(
        (cp.eccentricity() - 1.0).abs() < 0.02,
        "parabola e = {:.4}",
        cp.eccentricity()
    );

    let mut hyp = Vec::new();
    for i in 0..200 {
        let t = -2.0 + i as f64 * 0.02;
        hyp.push((50.0 + 15.0 * t.cosh(), 40.0 + 9.0 * t.sinh()));
    }
    let ch = conic::fit(&hyp).unwrap();
    assert_eq!(ch.classify(0.02), ConicType::Hyperbola);
    let e_true_h = (1.0 + (9.0f64 * 9.0) / (15.0 * 15.0)).sqrt();
    assert!(
        (ch.eccentricity() - e_true_h).abs() < 1e-3,
        "hyperbola e: fitted {:.6}, true {:.6}",
        ch.eccentricity(),
        e_true_h
    );
}

#[test]
fn two_points_can_never_make_a_parabola() {
    // The answer to "can you construct every conic?", as an assertion.
    // Sweep the whole reachable range of both point-point families and check
    // that nothing lands on e = 1 except in the degenerate limit.
    let (f1, f2) = ((-30.0f64, 0.0), (30.0f64, 0.0));
    let sep = 60.0;
    let mut closest_ell: f64 = 0.0;
    let mut closest_hyp = f64::INFINITY;
    for i in 1..400 {
        // ellipse: sum of distances, anything > separation
        let two_a = sep * (1.0 + i as f64 / 50.0);
        let e = sep / two_a;
        closest_ell = closest_ell.max(e);
        assert!(e < 1.0, "an ellipse reached e = {e}");
        // hyperbola: difference of distances, anything < separation
        let two_a_h = sep * (i as f64 / 400.0);
        if two_a_h > 1e-9 {
            let eh = sep / two_a_h;
            assert!(eh > 1.0, "a hyperbola reached e = {eh}");
            closest_hyp = closest_hyp.min(eh);
        }
    }
    // both families crowd against 1 from their own side and neither arrives
    assert!(closest_ell < 1.0 && closest_hyp > 1.0);
    assert!(closest_ell > 0.98 && closest_hyp < 1.02, "sweep was too coarse to be evidence");
    let _ = (f1, f2);
}

#[test]
fn distance_to_a_line_is_what_puts_the_focus_at_infinity() {
    // The constructive half of the same claim: point-vs-line is exactly e = 1.
    // Built from the definition, with no sand involved, so it isolates the
    // geometry from the simulation.
    let focus = (0.0f64, 10.0f64);
    let mut pts = Vec::new();
    for i in 0..300 {
        let x = -60.0 + i as f64 * 0.4;
        // locus of points equidistant from `focus` and the line y = 0
        let y = (x * x + focus.1 * focus.1) / (2.0 * focus.1);
        pts.push((x, y));
    }
    let c = conic::fit(&pts).unwrap();
    assert_eq!(c.classify(0.02), ConicType::Parabola);
    assert!((c.eccentricity() - 1.0).abs() < 0.01);
    assert!(c.foci().is_none(), "a parabola should not report two finite foci");
}

// ---- the port ---------------------------------------------------------------

#[test]
fn the_rust_and_the_repo_js_relax_identically() {
    // `clock/lib/soil.js` is the repo's existing implementation of this rule
    // (behind g.mino.mobi/soil/). This asserts the port did not quietly become
    // a different model: same field, same k, same transfer coefficient, same
    // answer. The JS side of this comparison is checked by the node selftest,
    // which runs the real soil.js; here we pin the Rust half against the
    // hand-worked expected values for a small field so the two selftests meet
    // in the middle.
    let mut f = Field::with_stencil(5, 34.0, Stencil::Near8);
    let i0 = f.idx(2, 2);
    f.h[i0] = 10.0;
    let k = f.k;
    let c = 0.12;

    // one pass, worked out by hand from the rule
    let mut expect = vec![0.0f64; 25];
    expect[2 * 5 + 2] = 10.0;
    let mut d = vec![0.0f64; 25];
    for (dx, dy, dist) in crate::field::NB8 {
        let (nx, ny) = (2 + dx, 2 + dy);
        let over = 10.0 - k * dist;
        if over > 0.0 {
            d[2 * 5 + 2] -= c * over;
            d[(ny as usize) * 5 + nx as usize] += c * over;
        }
    }
    for i in 0..25 {
        expect[i] += d[i];
    }

    f.relax_step(c);
    for i in 0..25 {
        assert!(
            (f.h[i] - expect[i]).abs() < 1e-12,
            "cell {i}: {} vs expected {}",
            f.h[i],
            expect[i]
        );
    }
}

#[test]
fn a_line_feature_reports_the_right_distance() {
    let s = Shape::Line { x: 10.0, y: 0.0, nx: 1.0, ny: 0.0 };
    assert!((s.distance(13.0, 99.0) - 3.0).abs() < 1e-12);
    assert!((s.distance(7.0, -4.0) - 3.0).abs() < 1e-12);
    let d = Shape::Line { x: 0.0, y: 0.0, nx: core::f64::consts::FRAC_1_SQRT_2, ny: core::f64::consts::FRAC_1_SQRT_2 };
    assert!((d.distance(core::f64::consts::SQRT_2, 0.0) - 1.0).abs() < 1e-12);
    let p = Shape::Point { x: 3.0, y: 4.0 };
    assert!((p.distance(0.0, 0.0) - 5.0).abs() < 1e-12);
    let _ = Kind::Source;
}




#[test]
#[ignore]
fn report() {
    // ellipse
    {
        let mut f = Field::new(113, 34.0);
        let (px, py) = (50.0, 62.0);
        let (hx, hy) = (62.0, 51.0);
        let feats = vec![Feature::point_source(px, py, 0.0), Feature::point_sink(hx, hy)];
        f.rebuild_sinks(&feats, 2.0);
        settle(&mut f, &feats, 60);
        let pts = pts_of(&f, &feats, 0, 1);
        let (m, _, pct) = conic::focal_constancy(&pts, (px, py), (hx, hy), true);
        let sep = ((px-hx).powi(2)+(py-hy).powi(2)).sqrt();
        let c = conic::fit(&pts).unwrap();
        let ctr = c.center().unwrap_or((f64::NAN,f64::NAN));
        println!("ELLIPSE n={} pct={pct:.2}% 2a={m:.2} 2c/2a={:.3} e_fit={:.3} type={:?} centre=({:.1},{:.1}) want=({:.1},{:.1}) off={:.2}",
            pts.len(), sep/m, c.eccentricity(), c.classify(0.08), ctr.0, ctr.1, (px+hx)/2.0, (py+hy)/2.0,
            ((ctr.0-(px+hx)/2.0).powi(2)+(ctr.1-(py+hy)/2.0).powi(2)).sqrt());
    }
    // hyperbola
    {
        let mut f = Field::new(113, 34.0);
        // two heaps of different sizes, meeting
        let (ax, ay) = (48.0, 56.0);
        let (bx, by) = (66.0, 56.0);
        let feats = vec![Feature::point_source(ax, ay, 0.0), Feature::point_source(bx, by, 0.0)];
        f.pour_and_settle(&[feats[0]], 90, 160.0, f.stencil.relax_c(), 1e-2, 600, 3.0);
        f.pour_and_settle(&[feats[1]], 34, 160.0, f.stencil.relax_c(), 1e-2, 600, 3.0);
        f.settle(f.stencil.relax_c(), 1e-2, 4000);
        let dh = 0.0;
        let pts = pts_of(&f, &feats, 0, 1);
        let (m, _, pct) = conic::focal_constancy(&pts, (ax, ay), (bx, by), false);
        let c = conic::fit(&pts).unwrap();
        println!("HYPERBOLA n={} |r1-r2|={m:.2} want dh/k={:.2} pct={pct:.2}% e_fit={:.3} disc_n={:.4} type={:?}",
            pts.len(), dh/f.k, c.eccentricity(),
            c.discriminant()/(c.a*c.a+c.b*c.b+c.c*c.c), c.classify(0.08));
    }
    // parabola
    {
        let mut f = Field::new(113, 34.0);
        let feats = vec![Feature::point_sink(56.0, 74.0), Feature::line_sink(56.0, 34.0, 0.0, 1.0)];
        f.rebuild_sinks(&feats, 2.0);
        f.flood(30.0);
        f.settle(f.stencil.relax_c(), 1e-2, 4000);
        let pts = pts_of(&f, &feats, 0, 1);
        let c = conic::fit(&pts).unwrap();
        let ratio: Vec<f64> = pts.iter().map(|&(x,y)| {
            ((x-56.0).powi(2)+(y-74.0).powi(2)).sqrt() / (y-34.0).abs().max(1e-9)
        }).collect();
        let mr = ratio.iter().sum::<f64>()/ratio.len().max(1) as f64;
        println!("PARABOLA n={} e_fit={:.3} disc_n={:.4} type={:?} focus/directrix={mr:.3}",
            pts.len(), c.eccentricity(), c.discriminant()/(c.a*c.a+c.b*c.b+c.c*c.c), c.classify(0.12));
    }
    // repose invariance
    for deg in [30.0f64, 34.0, 38.0] {
        let mut f = Field::new(113, deg);
        let (px, py) = (50.0, 62.0);
        let (hx, hy) = (62.0, 51.0);
        let feats = vec![Feature::point_source(px, py, 0.0), Feature::point_sink(hx, hy)];
        f.rebuild_sinks(&feats, 2.0);
        settle(&mut f, &feats, 60);
        let pts = pts_of(&f, &feats, 0, 1);
        if pts.len() < 6 { println!("REPOSE {deg} n={}", pts.len()); continue }
        let (m,_,pct) = conic::focal_constancy(&pts, (px,py), (hx,hy), true);
        let c = conic::fit(&pts).unwrap();
        let ctr = c.center().unwrap_or((f64::NAN,f64::NAN));
        println!("REPOSE {deg}° n={} 2a={m:.2} pct={pct:.2}% centre_off={:.2} e={:.3}",
            pts.len(), ((ctr.0-56.0).powi(2)+(ctr.1-56.5).powi(2)).sqrt(), c.eccentricity());
    }
}


/// Where the pile's peak actually is: the centroid of the cells within 1% of
/// the maximum. Not the same place as the pour point, and the difference is a
/// real effect rather than noise — see
/// `the_focus_is_the_pile_apex_not_quite_the_pour_point`.
fn apex_centroid(f: &Field) -> (f64, f64) {
    let apex = f.h.iter().cloned().fold(0.0, f64::max);
    let (mut sx, mut sy, mut sw) = (0.0f64, 0.0f64, 0.0f64);
    for y in 0..f.n {
        for x in 0..f.n {
            if f.h[f.idx(x, y)] > apex * 0.99 {
                sx += x as f64;
                sy += y as f64;
                sw += 1.0;
            }
        }
    }
    (sx / sw.max(1.0), sy / sw.max(1.0))
}

/// How much of a closed curve the tracer actually returned, in degrees: the
/// full turn less the widest gap between consecutive traced points, taken as
/// bearings about the centre. This is the number that decides whether a fitted
/// conic means anything — see `a_short_arc_does_not_determine_a_conic`.
fn arc_covered(pts: &[(f64, f64)], cx: f64, cy: f64) -> f64 {
    if pts.len() < 3 {
        return 0.0;
    }
    let mut b: Vec<f64> = pts.iter().map(|&(x, y)| (y - cy).atan2(x - cx)).collect();
    b.sort_by(|p, q| p.partial_cmp(q).unwrap());
    let mut gap = b[0] + core::f64::consts::TAU - b[b.len() - 1];
    for w in b.windows(2) {
        gap = gap.max(w[1] - w[0]);
    }
    (core::f64::consts::TAU - gap).to_degrees()
}

#[test]
fn a_short_arc_does_not_determine_a_conic() {
    // Why the page reports the arc as well as the fit, and dims the fit when
    // the arc is short. This is the fitter on *exact* points — no sand — laid
    // on a known ellipse, quantised to the half cell the tracer works to, over
    // arcs of different length. Nothing here can be blamed on the sand.
    let (a, c) = (14.0f64, 10.64f64);
    let b = (a * a - c * c).sqrt();
    let e_true = c / a;
    let q = |v: f64| (v * 2.0).round() / 2.0;
    let mut err = Vec::new();
    for span in [45.0f64, 90.0, 135.0, 180.0, 270.0, 350.0] {
        let mut pts = Vec::new();
        for i in 0..26 {
            let t = (110.0 + span * (i as f64) / 25.0).to_radians();
            pts.push((q(60.0 + a * t.cos()), q(60.0 + b * t.sin())));
        }
        let got = conic::fit(&pts).map(|cc| cc.eccentricity()).unwrap_or(f64::NAN);
        println!("{span:5.0}° of arc: e = {got:.3} against {e_true:.3}");
        err.push((span, (got - e_true).abs()));
    }
    // A quadrant is not enough, and no number of points fixes it: the failure
    // is that many conics pass through a short arc within half a cell, not
    // that the arc is under-sampled.
    assert!(
        err[0].1 > 0.15,
        "a 45 degree arc recovered e to {:.3}, so this test is not measuring what it claims",
        err[0].1
    );
    // Past about a third of the curve it is determined.
    for &(span, e) in &err[2..] {
        assert!(e < 0.07, "{span:.0} degrees of arc recovered e only to {e:.3}");
    }
}

#[test]
fn the_fold_floor_keeps_the_whole_curve() {
    // The floor is the one number that trades the traced curve's *length*
    // against its cleanliness, and it was set far too high: at 0.25 k his
    // geometry returned ten points spanning 35 degrees, which is below what
    // the test above shows a conic needs, and the page duly printed a fitted
    // eccentricity of 0.587 for a curve whose focal distances said 0.760.
    //
    // The sweep that set it (floor against coverage, on this geometry):
    //
    //     0.06 k -> 91 pts, 345 deg    0.18 k -> 18 pts,  83 deg
    //     0.09 k -> 79 pts, 345 deg    0.21 k -> 14 pts,  65 deg
    //     0.12 k -> 72 pts, 345 deg    0.25 k -> 10 pts,  35 deg
    //     0.15 k -> 39 pts, 237 deg    0.30 k ->  8 pts,  30 deg
    //
    // The cliff is between 0.15 and 0.18, and the curve is fully closed at or
    // below 0.12. What stops the floor going to zero is not the stencil's
    // facets — those are 0.175 k on this stencil, above the floor, and the
    // tracer keeps none of them because a facet lies inside one basin and a
    // seam is a boundary *between* two. It is the near-tie stripe along the
    // line joining the two features, where both surfaces fall the same way.
    let n = 145usize;
    let (px, py) = (64.0f64, 80.0f64);
    let (hx, hy) = (80.0f64, 66.0f64);
    let mut f = Field::new(n, 34.0);
    let feats = vec![
        Feature::point_source(px, py, 0.0),
        Feature::point_sink(hx, hy),
    ];
    f.rebuild_sinks(&feats, 2.0);
    f.pour_and_settle(&feats, 130, 160.0, f.stencil.relax_c(), 1e-2, 120, 3.0);
    f.settle(f.stencil.relax_c(), 0.04, 4000);
    let pts = pts_of(&f, &feats, 0, 1);
    let covered = arc_covered(&pts, (px + hx) / 2.0, (py + hy) / 2.0);
    println!("{} points covering {covered:.0}° at a floor of {:.2} k", pts.len(), f.fold_floor);
    assert!(
        covered > 270.0,
        "the traced curve covers only {covered:.0}° at a floor of {:.2} k — a conic          fitted to that is not determined by it",
        f.fold_floor
    );
    // And the fit, which is what the coverage was for, now has to agree with
    // the focal distances rather than with luck.
    let cc = conic::fit(&pts).expect("fit failed");
    let sep = ((px - hx).powi(2) + (py - hy).powi(2)).sqrt();
    let (two_a, _, _) = conic::focal_constancy(&pts, (px, py), (hx, hy), true);
    let e_meas = sep / two_a;
    println!("blind fit {:.3} against measured {e_meas:.3}", cc.eccentricity());
    assert!(
        (cc.eccentricity() - e_meas).abs() < 0.08,
        "blind fit says {:.3}, the focal distances say {e_meas:.3}",
        cc.eccentricity()
    );
}

#[test]
fn the_focus_is_the_pile_apex_not_quite_the_pour_point() {
    // His claim is that the crease's foci are the pour point and the hole, and
    // it is very nearly true. What is left over is a real effect and it is
    // worth naming rather than absorbing into a tolerance.
    //
    // Traced over the whole curve, `r1 + r2` about the pour point is not flat:
    // it runs about 12% high on one side and 13% low on the other, in a single
    // clean cycle. A one-cycle modulation like that is a *translation* — the
    // curve is offset from the ellipse the hypothesis predicts, by a little
    // over a cell and a half. And the direction it is offset in is exactly the
    // bearing of the pile's peak from the pour point.
    //
    // Which is what you would expect: the hole eats the sand on its own side,
    // so the pile does not build symmetrically about where it is poured — its
    // peak sits a few cells away, on the side away from the drain. The cone
    // whose surface meets the funnel is the cone about the *peak*. On a tray
    // the size of his the drift is invisible; on a 145-cell plate it is three
    // and a half cells and it is the largest error in the measurement.
    let n = 145usize;
    let (px, py) = (64.0f64, 80.0f64);
    let (hx, hy) = (80.0f64, 66.0f64);
    let mut f = Field::new(n, 34.0);
    let feats = vec![
        Feature::point_source(px, py, 0.0),
        Feature::point_sink(hx, hy),
    ];
    f.rebuild_sinks(&feats, 2.0);
    f.pour_and_settle(&feats, 130, 160.0, f.stencil.relax_c(), 1e-2, 120, 3.0);
    f.settle(f.stencil.relax_c(), 0.04, 4000);
    let (ax, ay) = apex_centroid(&f);
    let drift = ((ax - px).powi(2) + (ay - py).powi(2)).sqrt();
    // It drifts AWAY from the hole. That is the direction the explanation
    // predicts, and getting it backwards would mean the explanation is wrong.
    let away = ((ax - px) * (px - hx) + (ay - py) * (py - hy))
        / (drift.max(1e-9) * ((px - hx).powi(2) + (py - hy).powi(2)).sqrt());
    println!("apex at ({ax:.2},{ay:.2}), {drift:.2} cells from the pour, cos to away-from-hole {away:.2}");
    assert!(drift > 1.0, "the apex sits on the pour point ({drift:.2} cells), so there is no drift to explain");
    assert!(away > 0.8, "the apex drifted at {:.0}° to the away-from-hole direction, not along it", away.acos().to_degrees());

    let pts = pts_of(&f, &feats, 0, 1);
    let (_, _, pct_pour) = conic::focal_constancy(&pts, (px, py), (hx, hy), true);
    let (_, _, pct_apex) = conic::focal_constancy(&pts, (ax, ay), (hx, hy), true);
    println!("r1 + r2 varies by {pct_pour:.2}% about the pour point, {pct_apex:.2}% about the apex");
    assert!(
        pct_apex < pct_pour * 0.7,
        "moving the focus to the apex barely helped ({pct_pour:.2}% -> {pct_apex:.2}%), so the \
         drift is not what the scatter is and this explanation is wrong"
    );
}
