//! Known-answer tests.
//!
//! Every one of these compares the solver against a closed form or an
//! analytically derivable fact — not against a previous run of itself. If one
//! fails, the `/mri` page is telling visitors something untrue.

use crate::bloch::*;
use crate::coil::*;
use crate::physics::*;

const PI: f64 = std::f64::consts::PI;

fn rel(a: f64, b: f64) -> f64 {
    (a - b).abs() / b.abs().max(1e-300)
}

// ---------------------------------------------------------------- coil ----

/// Field at the centre of a loop: μ₀I/2a. A 128-gon is ~2×10⁻⁴ high, which is
/// the polygon error, not a bug — `N·tan(π/N)/π → 1`.
#[test]
fn loop_centre_matches_closed_form() {
    let a = 0.05;
    let mut c = Coil::new();
    c.add_loop([0.0, 0.0, 0.0], [0.0, 0.0, 1.0], a, 128);
    let b = c.field([0.0, 0.0, 0.0]);
    let expect = MU0 / (2.0 * a);
    assert!(rel(b[2], expect) < 5e-4, "centre field {} vs {}", b[2], expect);
    assert!(b[0].abs() < 1e-12 && b[1].abs() < 1e-12, "centre field is axial");
}

/// On-axis field at arbitrary z: μ₀ I a² / (2(a²+z²)^{3/2}).
#[test]
fn loop_on_axis_matches_closed_form() {
    let a = 0.05;
    let mut c = Coil::new();
    c.add_loop([0.0, 0.0, 0.0], [0.0, 0.0, 1.0], a, 256);
    for &z in &[0.0, 0.01, 0.05, 0.12, 0.3] {
        let got = c.field([0.0, 0.0, z])[2];
        let want = loop_axis_field(a, z, 1.0);
        assert!(rel(got, want) < 5e-4, "z={z}: {got} vs {want}");
    }
}

/// Far from the loop the field is a dipole's: proportional to 1/z³.
#[test]
fn far_field_is_dipolar() {
    let a = 0.02;
    let mut c = Coil::new();
    c.add_loop([0.0, 0.0, 0.0], [0.0, 0.0, 1.0], a, 128);
    let b1 = c.field([0.0, 0.0, 1.0])[2];
    let b2 = c.field([0.0, 0.0, 2.0])[2];
    assert!(rel(b1 / b2, 8.0) < 1e-3, "doubling z should cut the field 8×");
}

/// Superposition: two loops' fields add.
#[test]
fn fields_superpose() {
    let mut a_only = Coil::new();
    a_only.add_loop([0.0, 0.0, -0.03], [0.0, 0.0, 1.0], 0.04, 64);
    let mut b_only = Coil::new();
    b_only.add_loop([0.0, 0.0, 0.03], [0.0, 0.0, 1.0], 0.04, 64);
    let mut both = Coil::new();
    both.add_loop([0.0, 0.0, -0.03], [0.0, 0.0, 1.0], 0.04, 64);
    both.add_loop([0.0, 0.0, 0.03], [0.0, 0.0, 1.0], 0.04, 64);
    let p = [0.01, 0.005, 0.0];
    for i in 0..3 {
        let sum = a_only.field(p)[i] + b_only.field(p)[i];
        assert!((both.field(p)[i] - sum).abs() < 1e-15);
    }
}

/// **The headline claim of the page.** A coil whose field at the sample points
/// along B₀ cannot hear it, however strong that field is. On its own axis a
/// loop's field is purely axial, so a loop coaxial with B₀ has *zero* receive
/// sensitivity there — while the same loop turned side-on is fully sensitive.
///
/// This is why whole-body coils are birdcages and saddles, and why Hoult &
/// Richards (1976) spend their §4 on the poor performance of the saddle coil.
#[test]
fn a_coil_aligned_with_b0_is_deaf_on_its_axis() {
    let (a, d) = (0.05, 0.08);
    let mut facing = Coil::new(); // normal ∥ B₀ (z): field at the sample is axial
    facing.add_loop([0.0, 0.0, -d], [0.0, 0.0, 1.0], a, 256);
    let mut sideways = Coil::new(); // normal ⟂ B₀ (x): field at the sample is transverse
    sideways.add_loop([-d, 0.0, 0.0], [1.0, 0.0, 0.0], a, 256);

    let deaf = facing.sensitivity([0.0, 0.0, 0.0]);
    let hears = sideways.sensitivity([0.0, 0.0, 0.0]);
    assert!(deaf < 1e-9 * hears, "axial coil sensitivity {deaf} vs {hears}");
    // Both produce the same |B| at the sample — it is only the direction that
    // differs. The sensor is not weak there; it is deaf there.
    let mb = |v: [f64; 3]| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    assert!(rel(mb(facing.field([0.0; 3])), mb(sideways.field([0.0; 3]))) < 1e-6);
}

/// The signal-optimal loop radius for a target depth is a = √2·z. Checked
/// against a brute-force search over the closed form.
#[test]
fn best_radius_is_root_two_times_depth() {
    for &z in &[0.02, 0.05, 0.1] {
        let mut best = (0.0, 0.0);
        let mut a = 0.001;
        while a < 0.5 {
            let f = loop_axis_field(a, z, 1.0);
            if f > best.1 {
                best = (a, f);
            }
            a += 0.0001;
        }
        assert!(
            rel(best.0, best_radius_for_depth(z)) < 5e-3,
            "z={z}: search says {} , formula says {}",
            best.0,
            best_radius_for_depth(z)
        );
    }
}

// --------------------------------------------------------------- bloch ----

#[test]
fn t1_recovery_is_exponential() {
    let (t1, t2) = (1.0, 0.1);
    let mut s = Spin::new(t1, t2, 0.0);
    s.pulse(PI / 2.0, 0.0); // Mz → 0
    assert!(s.m[2].abs() < 1e-12);
    for &t in &[0.05, 0.3, 1.0, 3.0] {
        let mut q = s;
        q.evolve(t);
        assert!(rel(q.m[2], 1.0 - (-t / t1).exp()) < 1e-9, "t={t}");
    }
}

#[test]
fn t2_decay_is_exponential() {
    let t2 = 0.08;
    let mut s = Spin::new(1.0, t2, 0.0);
    s.pulse(PI / 2.0, 0.0);
    for &t in &[0.01, 0.05, 0.2] {
        let mut q = s;
        q.evolve(t);
        let mxy = (q.m[0] * q.m[0] + q.m[1] * q.m[1]).sqrt();
        assert!(rel(mxy, (-t / t2).exp()) < 1e-9, "t={t}");
    }
}

#[test]
fn precession_accumulates_the_right_phase() {
    let df = 137.0;
    let mut s = Spin::new(1e9, 1e9, df);
    s.pulse(PI / 2.0, 0.0); // → (0, -1, 0)
    let t = 0.0031;
    s.evolve(t);
    let want = 2.0 * PI * df * t - PI / 2.0; // start phase is −π/2
    let got = s.m[1].atan2(s.m[0]);
    let d = ((got - want).rem_euclid(2.0 * PI) + PI).rem_euclid(2.0 * PI) - PI;
    assert!(d.abs() < 1e-9, "phase {got} vs {want}");
}

#[test]
fn a_180_pulse_inverts() {
    let mut s = Spin::new(1e9, 1e9, 0.0);
    s.pulse(PI, 0.0);
    assert!(rel(s.m[2], -1.0) < 1e-12);
}

/// **The spin echo is exact.** Whatever the off-resonance spread, the echo at
/// 2τ has magnitude exp(−2τ/T₂): reversible dephasing costs nothing. Hahn,
/// *Phys Rev* 80:580 (1950).
#[test]
fn spin_echo_recovers_exactly_t2() {
    let (t1, t2, tau) = (1.0, 0.09, 0.012);
    for &spread in &[0.0, 5.0, 60.0, 900.0] {
        let mut e = Ensemble::lorentzian(2001, t1, t2, spread);
        e.pulse_deg(90.0, 0.0);
        e.evolve(tau);
        e.pulse_deg(180.0, 90.0);
        e.evolve(tau);
        assert!(
            rel(e.magnitude(), (-2.0 * tau / t2).exp()) < 1e-9,
            "spread={spread}: echo {} vs {}",
            e.magnitude(),
            (-2.0 * tau / t2).exp()
        );
    }
}

/// …and the FID does not. With a field spread the free decay runs at T₂*,
/// which is strictly faster: 1/T₂* = 1/T₂ + 2π·γ for a Lorentzian of
/// half-width γ.
#[test]
fn fid_decays_at_t2_star_not_t2() {
    let (t1, t2, spread) = (1.0, 0.09, 30.0);
    let t = 0.004;
    let mut e = Ensemble::lorentzian(200_001, t1, t2, spread);
    e.pulse_deg(90.0, 0.0);
    e.evolve(t);
    let t2star = 1.0 / (1.0 / t2 + 2.0 * PI * spread);
    assert!(t2star < t2);
    assert!(
        rel(e.magnitude(), (-t / t2star).exp()) < 5e-3,
        "FID {} vs T2* prediction {}",
        e.magnitude(),
        (-t / t2star).exp()
    );
}

/// A gradient dephases the sample and reversing it brings the echo back — the
/// gradient echo, and the reason a readout gradient can be switched on during
/// acquisition without destroying the signal.
#[test]
fn a_reversed_gradient_refocuses() {
    let (t1, t2) = (1e9, 1e9);
    // 10 mT/m — a realistic clinical readout gradient — over a ±10 cm FOV,
    // which is γ̄ × 0.01 T/m = 425.8 kHz/m and ±42.6 kHz across the sample.
    let mut e = Ensemble::along_gradient(4001, t1, t2, GAMMA_BAR * 0.01, 0.1);
    e.pulse_deg(90.0, 0.0);
    let full = e.magnitude();
    e.evolve(0.002);
    assert!(e.magnitude() < 0.05 * full, "gradient should dephase the sample");
    for s in &mut e.spins {
        s.df = -s.df; // reverse the gradient
    }
    e.evolve(0.002);
    assert!(rel(e.magnitude(), full) < 1e-6, "and reversing it should rephase");
}

// ------------------------------------------------------------- physics ----

#[test]
fn gyromagnetic_ratio_is_42_58_mhz_per_tesla() {
    assert!(rel(GAMMA_BAR, 42.577_478e6) < 1e-6);
    assert!(rel(larmor_hz(1.5), 63.866e6) < 1e-4);
    assert!(rel(larmor_hz(3.0), 127.73e6) < 1e-4);
}

/// The near-field claim, as a number: at 1.5 T the free-space wavelength is
/// ~4.7 m, hundreds of times a coil's size. Hoult 1989.
#[test]
fn larmor_wavelength_is_metres_not_millimetres() {
    let lam = larmor_wavelength_m(1.5);
    assert!(rel(lam, 4.694) < 1e-3, "λ = {lam} m");
    assert!(lam > 40.0 * 0.1, "λ ≫ any coil in the bore");
}

/// Thermal polarisation is a few parts per million — the image is built from
/// the residue after the sample almost entirely cancels itself out.
#[test]
fn polarisation_is_parts_per_million() {
    let p15 = polarization(1.5, T_BODY);
    let p30 = polarization(3.0, T_BODY);
    assert!(rel(p15, 4.94e-6) < 5e-3, "P(1.5 T) = {p15}");
    assert!(rel(p30, 9.88e-6) < 5e-3, "P(3 T) = {p30}");
    // Linear in B₀ to well beyond any achievable field.
    assert!(rel(p30 / p15, 2.0) < 1e-6);
}

/// Faraday detection buys two powers of field: one from polarisation, one from
/// the rate of flux change. This is the scaling the ultra-low-field scanners
/// escape by not using a coil at all.
#[test]
fn induction_signal_goes_as_b0_squared() {
    assert!(rel(relative_faraday_emf(3.0), 4.0) < 1e-5);
    assert!(rel(relative_faraday_emf(0.75), 0.25) < 1e-5);
    assert!(rel(relative_faraday_emf(0.055), 1.344e-3) < 1e-2); // the Liu 2021 scanner
}
