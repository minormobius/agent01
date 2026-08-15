//! `cargo run --release --bin verify` — print every solver result next to the
//! closed form it is supposed to reproduce, and every number the `/mri` page
//! quotes next to where it comes from.
//!
//! `cargo test` asserts these; this prints them, so a human can see the size of
//! the disagreement rather than just its sign.

use sci_mri_engine::bloch::*;
use sci_mri_engine::coil::*;
use sci_mri_engine::physics::*;

fn row(label: &str, got: f64, want: f64, unit: &str) {
    let rel = if want.abs() > 0.0 {
        (got - want).abs() / want.abs()
    } else {
        (got - want).abs()
    };
    println!("  {label:<44} {got:>14.6e}  {want:>14.6e}  {rel:>9.2e}  {unit}");
}

fn head(title: &str) {
    println!("\n{title}");
    println!(
        "  {:<44} {:>14}  {:>14}  {:>9}",
        "", "computed", "closed form", "rel. err"
    );
}

fn main() {
    println!("sci-mri-engine — known-answer checks");

    head("Biot–Savart vs the analytic circular loop (a = 5 cm, unit current)");
    let a = 0.05;
    let mut c = Coil::new();
    c.add_loop([0.0, 0.0, 0.0], [0.0, 0.0, 1.0], a, 256);
    for &z in &[0.0, 0.025, 0.05, 0.10, 0.25] {
        row(
            &format!("B_z on axis at z = {:.0} mm", z * 1000.0),
            c.field([0.0, 0.0, z])[2],
            loop_axis_field(a, z, 1.0),
            "T/A",
        );
    }

    head("Reciprocity: a coil parallel to B₀ is deaf on its own axis");
    let d = 0.08;
    let mut facing = Coil::new();
    facing.add_loop([0.0, 0.0, -d], [0.0, 0.0, 1.0], a, 256);
    let mut sideways = Coil::new();
    sideways.add_loop([-d, 0.0, 0.0], [1.0, 0.0, 0.0], a, 256);
    let mag = |v: [f64; 3]| (v[0] * v[0] + v[1] * v[1] + v[2] * v[2]).sqrt();
    println!(
        "  |B| at the sample is the same either way:  {:.6e} vs {:.6e} T/A",
        mag(facing.field([0.0; 3])),
        mag(sideways.field([0.0; 3]))
    );
    println!(
        "  |B₁⁻| receive sensitivity:                  {:.6e} vs {:.6e} T/A",
        facing.sensitivity([0.0; 3]),
        sideways.sensitivity([0.0; 3])
    );
    println!("  → the axial coil is not weak at the sample. It is deaf there.");

    head("Signal-optimal loop radius for a target depth");
    for &z in &[0.02, 0.05, 0.10] {
        let mut best = (0.0, 0.0);
        let mut r = 0.001;
        while r < 0.6 {
            let f = loop_axis_field(r, z, 1.0);
            if f > best.1 {
                best = (r, f);
            }
            r += 0.00005;
        }
        row(
            &format!("best radius for depth {:.0} mm", z * 1000.0),
            best.0,
            best_radius_for_depth(z),
            "m  (= √2·z)",
        );
    }
    println!("  Signal only. Noise grows with coil size too, so real coils are");
    println!("  smaller — Edelstein 1986; Ocali & Atalar 1998.");

    head("Bloch: relaxation against the analytic solution (T₁ = 1 s, T₂ = 90 ms)");
    let (t1, t2) = (1.0, 0.09);
    for &t in &[0.05, 0.2, 1.0] {
        let mut s = Spin::new(t1, t2, 0.0);
        s.pulse(std::f64::consts::FRAC_PI_2, 0.0);
        s.evolve(t);
        row(
            &format!("M_z recovered after {:.0} ms", t * 1000.0),
            s.m[2],
            1.0 - (-t / t1).exp(),
            "M₀",
        );
    }
    for &t in &[0.01, 0.05, 0.2] {
        let mut s = Spin::new(t1, t2, 0.0);
        s.pulse(std::f64::consts::FRAC_PI_2, 0.0);
        s.evolve(t);
        row(
            &format!("|M_xy| after {:.0} ms", t * 1000.0),
            (s.m[0] * s.m[0] + s.m[1] * s.m[1]).sqrt(),
            (-t / t2).exp(),
            "M₀",
        );
    }

    head("Hahn echo at 2τ = 24 ms — reversible dephasing costs nothing");
    let tau = 0.012;
    for &spread in &[0.0, 5.0, 60.0, 900.0] {
        let mut e = Ensemble::lorentzian(4001, t1, t2, spread);
        e.pulse_deg(90.0, 0.0);
        e.evolve(tau);
        e.pulse_deg(180.0, 90.0);
        e.evolve(tau);
        row(
            &format!("echo with a ±{spread:.0} Hz field spread"),
            e.magnitude(),
            (-2.0 * tau / t2).exp(),
            "M₀",
        );
    }

    head("The numbers the page prints");
    row("γ̄ (proton)", GAMMA_BAR, 42.577_478e6, "Hz/T");
    row("Larmor frequency at 1.5 T", larmor_hz(1.5), 63.866e6, "Hz");
    row("free-space λ at 1.5 T", larmor_wavelength_m(1.5), 4.694, "m");
    row("thermal polarisation, 1.5 T, 37 °C", polarization(1.5, T_BODY), 4.94e-6, "");
    row("thermal polarisation, 3 T, 37 °C", polarization(3.0, T_BODY), 9.88e-6, "");
    row("Faraday EMF at 3 T (1.5 T = 1)", relative_faraday_emf(3.0), 4.0, "× (B₀²)");
    row(
        "Faraday EMF at 0.055 T (Liu 2021)",
        relative_faraday_emf(0.055),
        1.344e-3,
        "×",
    );
    println!("\n  Polarisation is the exact two-level tanh; at these fields it is");
    println!("  indistinguishable from the Curie limit ħγB₀/2k_BT.");
    println!();
}
