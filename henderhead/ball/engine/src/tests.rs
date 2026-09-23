//! Tests for the bouncing ball.
//!
//! The two that matter most are the ones that pinned down what the rule even
//! is. A ball bouncing in a circle *without* gravity is integrable — the angle
//! of incidence is conserved and nearby trajectories separate linearly — so
//! "hard to predict four bounces ahead" cannot be true of it. With gravity the
//! angle of incidence stops being conserved and the Lyapunov exponent goes
//! positive. Both halves of that are asserted below, because the difference is
//! the whole reason this demo is a demo.

use crate::ball::*;

fn p() -> Params { Params::default() }

/// The video's own initial condition, as measured off it: at rest, a seventh of
/// a radius right of centre.
const OFFSET: f64 = 0.145;

#[test]
fn a_low_drop_is_a_small_regular_world_and_a_high_one_is_not() {
    // The energy control, and the only one. E = gy at the drop, and the ball
    // can never rise above it — so a drop near the bottom is a nearly
    // integrable world and the video's drop from the middle is the whole lower
    // half of the disc. Gravity is *not* an energy control: rescaling time
    // turns any g into 1, so this is the knob that changes the phase portrait.
    let p = p();
    let low = run(&p, State::dropped(0.1, -0.9), false, 400);
    let high = run(&p, State::dropped(OFFSET, 0.0), false, 400);
    let span = |bs: &[Bounce]| {
        let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
        for b in bs { lo = lo.min(rim_angle(&b.after)); hi = hi.max(rim_angle(&b.after)); }
        hi - lo
    };
    assert!(span(&low) < 1.2, "a low drop should stay near the bottom: {}", span(&low));
    assert!(span(&high) > 2.5, "a drop from the middle should roam: {}", span(&high));
    for b in &low { assert!(b.after.y <= -0.9 * p.radius + 1e-9, "rose above the drop: {}", b.after.y); }
}

fn run(p: &Params, from: State, on_wall: bool, n: usize) -> Vec<Bounce> {
    bounces(p, from, on_wall, n)
}

// ------------------------------------------------------------ the solver --

#[test]
fn the_cubic_solver_finds_known_roots() {
    // (x−1)(x−2)(x−3) = x³ − 6x² + 11x − 6
    let (r, n) = cubic_roots(-6.0, 11.0, -6.0);
    assert_eq!(n, 3);
    for (got, want) in r.iter().zip([1.0, 2.0, 3.0]) {
        assert!((got - want).abs() < 1e-9, "{got} vs {want}");
    }
    // one real root: x³ + x + 1
    let (r, n) = cubic_roots(0.0, 1.0, 1.0);
    assert_eq!(n, 1);
    let x = r[0];
    assert!((x * x * x + x + 1.0).abs() < 1e-9, "{x}");
    // a triple root at 2: (x−2)³
    let (r, n) = cubic_roots(-6.0, 12.0, -8.0);
    for k in 0..n { assert!((r[k] - 2.0).abs() < 1e-4, "{}", r[k]); }
}

#[test]
fn the_ball_never_leaves_the_circle() {
    let p = p();
    let bs = run(&p, State::dropped(OFFSET, 0.0), false, 4000);
    assert_eq!(bs.len(), 4000, "the flight solver gave up early");
    for b in &bs {
        assert!((b.before.r() - p.radius).abs() < 1e-9, "landed at r = {}", b.before.r());
        assert!((b.after.r() - p.radius).abs() < 1e-12);
        // and it must be heading back inside
        let inward = b.after.vx * b.after.x + b.after.vy * b.after.y;
        assert!(inward < 1e-9, "left the wall outward: {inward}");
    }
}

#[test]
fn elastic_bounces_conserve_energy_exactly() {
    // The sharpest check there is on the flight solver: a stepped integrator
    // bleeds energy at every bounce, and in a system whose subject is how fast
    // small errors grow that would be fatal.
    let p = p();
    let start = State::dropped(OFFSET, 0.0);
    let e0 = start.energy(&p);
    let bs = run(&p, start, false, 5000);
    let scale = p.gravity * p.radius;
    for (i, b) in bs.iter().enumerate() {
        let drift = (b.after.energy(&p) - e0).abs() / scale;
        assert!(drift < 1e-9, "energy drifted by {drift} after {i} bounces");
    }
}

#[test]
fn a_bounce_is_specular() {
    let p = p();
    for b in run(&p, State::dropped(OFFSET, 0.0), false, 200) {
        let r = b.before.r();
        let (nx, ny) = (b.before.x / r, b.before.y / r);
        // normal component reverses, tangential component survives
        let vn_in = b.before.vx * nx + b.before.vy * ny;
        let vn_out = b.after.vx * nx + b.after.vy * ny;
        let vt_in = -ny * b.before.vx + nx * b.before.vy;
        let vt_out = -ny * b.after.vx + nx * b.after.vy;
        assert!((vn_out + vn_in).abs() < 1e-9, "{vn_in} vs {vn_out}");
        assert!((vt_out - vt_in).abs() < 1e-12);
        assert!((b.after.speed() - b.before.speed()).abs() < 1e-9);
    }
}

#[test]
fn restitution_below_one_takes_energy_out() {
    let mut p = p();
    p.restitution = 0.8;
    let start = State::dropped(OFFSET, 0.0);
    let bs = run(&p, start, false, 60);
    let mut last = start.energy(&p);
    for b in &bs {
        let e = b.after.energy(&p);
        assert!(e <= last + 1e-12, "energy went up: {last} → {e}");
        last = e;
    }
    assert!(last < start.energy(&p) - 0.1 * p.gravity * p.radius, "should have lost a lot: {last}");
}

// ----------------------------------------------------- gravity is the point --

#[test]
fn without_gravity_the_angle_of_incidence_is_conserved() {
    // The integrable case, and the reason the video cannot be showing it. A
    // chord billiard in a circle keeps its angle of incidence forever, so four
    // bounces ahead is entirely predictable.
    let mut p = p();
    p.gravity = 1e-9;
    let start = State { x: -p.radius, y: 0.0, vx: 0.9, vy: 0.45 };
    let bs = run(&p, start, true, 300);
    assert!(bs.len() > 250, "only {} bounces", bs.len());
    let sine = |b: &Bounce| {
        let r = b.after.r();
        let (nx, ny) = (b.after.x / r, b.after.y / r);
        (-ny * b.after.vx + nx * b.after.vy) / b.after.speed()
    };
    let first = sine(&bs[0]);
    for b in &bs {
        assert!((sine(b) - first).abs() < 1e-4, "{} vs {first}", sine(b));
    }
}

#[test]
fn with_gravity_it_is_not() {
    // The same measurement, with gravity switched on. The angle of incidence
    // wanders over its whole range — which is what makes the phase space mixed
    // and the eras possible.
    let p = p();
    let bs = run(&p, State::dropped(OFFSET, 0.0), false, 1500);
    let sine = |b: &Bounce| {
        let r = b.after.r();
        let (nx, ny) = (b.after.x / r, b.after.y / r);
        (-ny * b.after.vx + nx * b.after.vy) / b.after.speed()
    };
    let vals: Vec<f64> = bs.iter().map(sine).collect();
    let lo = vals.iter().cloned().fold(f64::INFINITY, f64::min);
    let hi = vals.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    assert!(hi - lo > 1.0, "the angle of incidence barely moved: {lo} .. {hi}");
}

#[test]
fn nearby_futures_separate_exponentially_with_gravity_and_not_without() {
    // The Lyapunov exponent, by its definition: run a shadow a billionth away,
    // measure the stretch each bounce, pull it back in, and average the logs.
    let lyap = |p: &Params, start: State, on_wall: bool, n: usize| -> f64 {
        let eps = 1e-9;
        let mut a = start;
        let mut b = State { vx: start.vx + eps, ..start };
        let (mut sum, mut clock) = (0.0, 0.0);
        let mut wall = on_wall;
        for _ in 0..n {
            let Some(ba) = bounces(p, a, wall, 1).first().copied() else { break };
            let Some(bb) = bounces(p, b, wall, 1).first().copied() else { break };
            clock += ba.t;
            let d = ((ba.after.x - bb.after.x).powi(2) + (ba.after.y - bb.after.y).powi(2)
                   + (ba.after.vx - bb.after.vx).powi(2) + (ba.after.vy - bb.after.vy).powi(2)).sqrt();
            if d > 0.0 { sum += (d / eps).ln(); }
            let f = if d > 0.0 { eps / d } else { 1.0 };
            b = State {
                x: ba.after.x + (bb.after.x - ba.after.x) * f,
                y: ba.after.y + (bb.after.y - ba.after.y) * f,
                vx: ba.after.vx + (bb.after.vx - ba.after.vx) * f,
                vy: ba.after.vy + (bb.after.vy - ba.after.vy) * f,
            };
            a = ba.after;
            wall = true;
        }
        if clock > 0.0 { sum / clock } else { 0.0 }
    };

    let chaotic = lyap(&p(), State::dropped(OFFSET, 0.0), false, 3000);
    assert!(chaotic > 0.1, "should be chaotic: lambda = {chaotic}");

    let mut flat = p();
    flat.gravity = 1e-9;
    let start = State { x: -flat.radius, y: 0.0, vx: 0.9, vy: 0.45 };
    let integrable = lyap(&flat, start, true, 3000);
    // Not exactly zero, and it should not be: without gravity neighbours
    // separate *linearly*, so a finite-time exponent measures ln(n)/T, which
    // decays towards zero rather than sitting at it. Two orders of magnitude
    // below the chaotic case is the honest statement.
    assert!(integrable.abs() < 0.02, "no gravity, no chaos: {integrable}");
    assert!(integrable.abs() < 0.05 * chaotic,
            "no gravity should give far less: {integrable} vs {chaotic}");
}

#[test]
fn dead_centre_bounces_straight_up_and_down_forever() {
    // The one orbit with no horizontal motion at all. Everything on this page
    // is downstream of the drop offset not being zero, and this is that stated
    // as an assertion.
    let p = p();
    let bs = run(&p, State::dropped(0.0, 0.0), false, 500);
    for b in &bs {
        assert_eq!(b.before.x, 0.0);
        assert_eq!(b.after.x, 0.0);
        assert_eq!(b.after.vx, 0.0);
        assert!((b.before.y + p.radius).abs() < 1e-12, "bounced at y = {}", b.before.y);
    }
    // and it comes back to exactly where it was dropped
    let up = bs[0].after;
    let apex = up.vy * up.vy / (2.0 * p.gravity) - p.radius;
    assert!(apex.abs() < 1e-9, "apex at {apex}, should be the centre");
}

#[test]
fn the_same_start_gives_the_same_bounces() {
    let p = p();
    let a = run(&p, State::dropped(OFFSET, 0.0), false, 400);
    let b = run(&p, State::dropped(OFFSET, 0.0), false, 400);
    for (x, y) in a.iter().zip(b.iter()) {
        assert_eq!(x.after, y.after);
    }
    let c = run(&p, State::dropped(OFFSET + 1e-12, 0.0), false, 400);
    assert_ne!(a[399].after, c[399].after, "a picometre should have taken over by bounce 400");
}

#[test]
fn a_flight_that_starts_on_the_wall_uses_the_exact_cubic() {
    // The constant term of the quartic vanishes on the wall, so t factors out
    // and the next bounce is a closed-form cubic root. If that path were wrong,
    // the landing radius would drift; it does not.
    let p = p();
    let bs = run(&p, State::dropped(OFFSET, 0.0), false, 2000);
    let worst = bs.iter().map(|b| (b.before.r() - p.radius).abs()).fold(0.0, f64::max);
    assert!(worst < 1e-10, "worst landing error {worst}");
}

#[test]
fn angles_wrap_the_short_way() {
    use core::f64::consts::PI;
    assert!((angle_delta(0.1, -0.1) - 0.2).abs() < 1e-12);
    assert!((angle_delta(-3.1, 3.1) - (2.0 * PI - 6.2)).abs() < 1e-12);
    assert!(angle_delta(PI, -PI).abs() < 1e-12);
}
