//! The waterwheel, checked against the published result rather than against
//! itself. Unlike the other two demos here, this one has a derivation in the
//! literature — it is the Malkus waterwheel of Strogatz §9.1 — so the tests can
//! be sharp: the continuum wheel must not merely resemble the Lorenz system,
//! it must *be* it, to integrator noise, forever.

use crate::wheel::*;
use core::f64::consts::PI;

/// Parameters well inside the chaotic regime, where the video is.
fn chaotic() -> Params { Params::default() }

/// Turn the inflow down until the wheel turns steadily instead of reversing.
fn steady() -> Params {
    let mut p = chaotic();
    p.q = 0.3;   // ρ ≈ 7, between the two thresholds
    p
}

fn spun_up(p: Params, t: f64, dt: f64) -> Wheel {
    let mut w = Wheel::new(p);
    w.reset(0.05);
    let steps = (t / dt) as usize;
    for _ in 0..steps { w.step(dt); }
    w
}

// ------------------------------------------------- the correspondence itself --

#[test]
fn beta_is_one_and_cannot_be_anything_else() {
    // The waterwheel picks its own β, and it is not Lorenz's 8/3. It is a
    // Lorenz system, not the Lorenz system.
    for q in [0.05f64, 0.5, 5.0] {
        let mut p = chaotic();
        p.q = q;
        assert_eq!(p.beta(), 1.0);
    }
}

#[test]
fn the_continuum_wheel_is_the_lorenz_system() {
    // The claim the whole page rests on. Integrate the three-equation wheel and
    // the Lorenz equations with the mapped parameters from the same starting
    // state, and they must stay on top of each other.
    for p in [steady(), chaotic()] {
        let c = c_of(&p);
        let mut cont = Continuum::new(p);
        cont.omega = 0.05;
        let mut lo = Lorenz::new(p.sigma(), p.rho(), p.beta());
        lo.x = cont.omega / p.k;
        lo.y = -c * cont.a1;
        lo.z = p.rho() - c * cont.b1;

        let dt = 1e-3;
        // eight seconds of wheel time — long past the transient, and in the
        // chaotic case long enough for a real divergence to show up
        for _ in 0..8000 {
            cont.step(dt);
            lo.step(dt * p.k);
        }
        let (x, y, z) = to_lorenz(&p, cont.omega, cont.a1, cont.b1);
        assert!((x - lo.x).abs() < 1e-6, "X: {x} vs {}", lo.x);
        assert!((y - lo.y).abs() < 1e-6, "Y: {y} vs {}", lo.y);
        assert!((z - lo.z).abs() < 1e-6, "Z: {z} vs {}", lo.z);
    }
}

#[test]
fn the_centre_of_mass_plane_is_the_lorenz_y_z_plane() {
    // "It traces a projection of the familiar attractor" — this is that
    // sentence as an assertion. Take the continuum wheel's own centre of mass,
    // and the point the Lorenz coordinates say it should be at, and they agree.
    let p = chaotic();
    let c = c_of(&p);
    let mut cont = Continuum::new(p);
    cont.omega = 0.05;
    let dt = 1e-3;
    for step in 0..12000 {
        cont.step(dt);
        if step > 6000 && step % 500 == 0 {
            // the continuum's total mass has settled to q/k by now
            let m = p.q / p.k;
            let com = (p.radius * PI * cont.a1 / m, p.radius * PI * cont.b1 / m);
            let (y, z) = (-c * cont.a1, p.rho() - c * cont.b1);
            let mapped = lorenz_to_com(&p, y, z);
            assert!((com.0 - mapped.0).abs() < 1e-9, "{:?} vs {:?}", com, mapped);
            assert!((com.1 - mapped.1).abs() < 1e-9, "{:?} vs {:?}", com, mapped);
        }
    }
}

#[test]
fn the_total_mass_settles_and_then_ignores_the_chaos() {
    // Ṁ = ∫Q − kM has no ω in it, so the water on the wheel is constant however
    // wildly it is behaving. That is what keeps the centre of mass a fixed
    // rescaling of the attractor rather than a wobbling one.
    let p = chaotic();
    // M approaches q/k as e^{−kt}, so give it enough time constants that the
    // transient is below f64 resolution and what is left is the real answer
    let w = spun_up(p, 250.0, 2e-3);
    let target = p.q / p.k;
    assert!((w.total_mass() - target).abs() / target < 1e-9,
            "{} vs {target}", w.total_mass());

    let mut w2 = w.clone();
    let (mut lo, mut hi) = (f64::INFINITY, f64::NEG_INFINITY);
    for _ in 0..30000 {
        w2.step(2e-3);
        lo = lo.min(w2.total_mass());
        hi = hi.max(w2.total_mass());
    }
    assert!((hi - lo) / target < 1e-9, "mass wandered by {}", (hi - lo) / target);
}

// ------------------------------------------------------------- the regimes --

#[test]
fn below_rho_one_the_wheel_does_not_turn() {
    let mut p = chaotic();
    p.q = 0.001;
    assert!(p.rho() < 1.0, "rho = {}", p.rho());
    assert_eq!(p.regime(), 0);
    let w = spun_up(p, 200.0, 5e-3);
    assert!(w.omega.abs() < 1e-3, "omega = {}", w.omega);
}

#[test]
fn between_the_thresholds_it_spins_at_the_speed_the_theory_says() {
    // The non-zero fixed points of Lorenz sit at X = ±√(β(ρ−1)), and X is ω/k,
    // so a steadily turning waterwheel must settle at ω = ±k√(ρ−1). Nothing
    // about that is fitted; it is the theory predicting a number this
    // simulation then has to produce.
    let p = steady();
    assert_eq!(p.regime(), 1, "rho = {} hopf = {}", p.rho(), p.rho_hopf());
    let w = spun_up(p, 400.0, 5e-3);
    let predicted = p.k * (p.beta() * (p.rho() - 1.0)).sqrt();
    assert!((w.omega.abs() - predicted).abs() / predicted < 0.02,
            "omega = {} predicted ±{predicted}", w.omega);
}

#[test]
fn above_the_hopf_threshold_it_reverses_unpredictably() {
    let p = chaotic();
    assert_eq!(p.regime(), 2, "rho = {} hopf = {}", p.rho(), p.rho_hopf());
    let mut w = Wheel::new(p);
    w.reset(0.05);
    let dt = 2e-3;
    for _ in 0..20000 { w.step(dt); }  // settle
    let mut sign = w.omega.signum();
    let mut flips = 0;
    for _ in 0..200000 {
        w.step(dt);
        if w.omega.signum() != sign && w.omega.abs() > 1e-3 {
            sign = w.omega.signum();
            flips += 1;
        }
    }
    assert!(flips > 10, "only {flips} reversals in 400 seconds");
}

#[test]
fn the_hopf_threshold_needs_sigma_above_beta_plus_one() {
    // Under σ = β+1 the steady rotation never loses stability, so no amount of
    // water makes it chaotic — a real and slightly surprising fact about the
    // machine, and the reason the readout can say "cannot be chaotic at any
    // flow" rather than just quoting a big number.
    let mut p = chaotic();
    p.nu = 0.5;                         // σ = ν/(Ik), so weak damping is small σ
    assert!(p.sigma() < p.beta() + 1.0, "sigma = {}", p.sigma());
    assert!(p.rho_hopf().is_infinite());
    assert_ne!(p.regime(), 2);
}

// -------------------------------------------------- what "approximating" means --

#[test]
fn more_buckets_means_less_ripple() {
    // A finite wheel is the Lorenz system plus a periodic forcing, because the
    // inflow's first harmonic is sampled at n points instead of integrated.
    // That forcing is the whole of the word "approximating" in his title, and
    // it should fall away fast.
    let mut last = f64::INFINITY;
    for n in [6usize, 8, 12, 16, 24, 48] {
        let mut p = chaotic();
        p.n = n;
        let w = Wheel::new(p);
        let r = w.inflow_ripple();
        assert!(r < last, "ripple grew from {last} to {r} at n = {n}");
        last = r;
    }
    let mut p = chaotic();
    p.n = 48;
    assert!(Wheel::new(p).inflow_ripple() < 0.02, "48 buckets should be nearly smooth");
}

#[test]
fn a_finite_wheel_tracks_the_continuum_for_a_while_and_then_does_not() {
    // Both are chaotic, so they cannot agree forever and it would be dishonest
    // to claim they do. What is true is that they start together, stay together
    // through the transient, and separate at the rate chaos separates things.
    let p = chaotic();
    let c = c_of(&p);
    let mut w = Wheel::new(p);
    w.reset(0.05);
    let mut cont = Continuum::new(p);
    cont.omega = 0.05;
    let dt = 1e-3;

    let err_at = |w: &Wheel, cont: &Continuum| {
        let n = w.mass.len();
        let step = 2.0 * PI / n as f64;
        let (mut a, mut b) = (0.0, 0.0);
        for i in 0..n {
            let ang = w.theta + step * i as f64;
            a += w.mass[i] * ang.cos();
            b += w.mass[i] * ang.sin();
        }
        // the discrete sums approximate π a₁, π b₁
        let (ya, yb) = (-c * a / PI, -c * b / PI);
        let (ca, cb) = (-c * cont.a1, -c * cont.b1);
        ((ya - ca).powi(2) + (yb - cb).powi(2)).sqrt()
    };

    for _ in 0..4000 { w.step(dt); cont.step(dt); }
    let early = err_at(&w, &cont);
    for _ in 0..60000 { w.step(dt); cont.step(dt); }
    let late = err_at(&w, &cont);
    assert!(early < 2.0, "should start close: {early}");
    assert!(late > early, "chaos should eventually separate them: {early} then {late}");
}

// --------------------------------------------------- sensitive dependence --

#[test]
fn a_billionth_of_a_difference_takes_over() {
    // The butterfly effect, measured. Two wheels differing by 1e-9 in initial
    // spin end up unrelated; the same two in the steady regime do not.
    let sep = |p: Params, t: f64| {
        let mut a = Wheel::new(p);
        let mut b = Wheel::new(p);
        a.reset(0.05);
        b.reset(0.05 + 1e-9);
        let dt = 2e-3;
        for _ in 0..((t / dt) as usize) { a.step(dt); b.step(dt); }
        let mut d2 = (a.omega - b.omega).powi(2);
        for i in 0..a.mass.len() { d2 += (a.mass[i] - b.mass[i]).powi(2); }
        d2.sqrt()
    };
    let chaotic_sep = sep(chaotic(), 300.0);
    assert!(chaotic_sep > 1e-3, "the twins should have parted: {chaotic_sep}");

    let steady_sep = sep(steady(), 300.0);
    assert!(steady_sep < 1e-6, "a steady wheel should forget the nudge: {steady_sep}");
}

// ------------------------------------------------------------- the numerics --

#[test]
fn halving_the_step_barely_changes_anything() {
    // Checked in the steady regime on purpose: in the chaotic one any two
    // integrators diverge and the test would be measuring chaos, not accuracy.
    let p = steady();
    let coarse = spun_up(p, 120.0, 4e-3);
    let fine = spun_up(p, 120.0, 1e-3);
    assert!((coarse.omega - fine.omega).abs() < 1e-6,
            "{} vs {}", coarse.omega, fine.omega);
    assert!((coarse.total_mass() - fine.total_mass()).abs() < 1e-6);
}

#[test]
fn buckets_never_owe_water() {
    let mut p = chaotic();
    p.q = 20.0;
    let w = spun_up(p, 120.0, 2e-3);
    assert!(w.mass.iter().all(|&m| m >= 0.0));
    assert!(w.mass.iter().all(|m| m.is_finite()));
    assert!(w.omega.is_finite() && w.theta.is_finite());
}

#[test]
fn the_same_start_gives_the_same_wheel() {
    let p = chaotic();
    let a = spun_up(p, 50.0, 2e-3);
    let b = spun_up(p, 50.0, 2e-3);
    assert_eq!(a.omega, b.omega);
    assert_eq!(a.mass, b.mass);
}

#[test]
fn the_inflow_is_the_inflow_however_the_wheel_is_aligned() {
    // Buckets are discrete but the tap is not: whatever angle the wheel happens
    // to be at, the same amount of water arrives. Without this the discretisation
    // error would be a fluttering total inflow, which is a cruder artefact than
    // the one the page is about.
    let p = chaotic();
    let mut w = Wheel::new(p);
    let dt = 1e-3;
    for j in 0..40 {
        // start each probe from a dry wheel so the leak contributes nothing and
        // what arrives is purely what the tap delivered
        w.reset(0.0);
        w.theta = 0.017 * j as f64;
        w.step(dt);
        let gained = w.total_mass();
        // dM/dt = q − kM from dry, so after one step M = (q/k)(1 − e^{−k dt}) —
        // a shade under q·dt, because the water starts leaking the moment it
        // lands. Checking against the exact solution tests the integrator too.
        let exact = (p.q / p.k) * (1.0 - (-p.k * dt).exp());
        assert!((gained - exact).abs() < 1e-12, "at theta {}: {gained} vs {exact}", w.theta);
    }
}

#[test]
fn wrap_pi_wraps() {
    for (a, want) in [(0.0, 0.0), (PI - 0.1, PI - 0.1), (PI + 0.1, -PI + 0.1), (3.0 * PI, -PI)] {
        let got = wrap_pi(a);
        assert!((got - want).abs() < 1e-9 || (got + want).abs() < 1e-9, "wrap_pi({a}) = {got}");
    }
}
