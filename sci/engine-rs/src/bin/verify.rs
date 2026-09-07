//! `cargo run --release --bin verify` — print every solver result next to the
//! closed form it is supposed to reproduce, and every number the `/mri` page
//! quotes next to where it comes from.
//!
//! `cargo test` asserts these; this prints them, so a human can see the size of
//! the disagreement rather than just its sign.

use sci_mri_engine::bloch::*;
use sci_mri_engine::coil::*;
use sci_mri_engine::contrast::{self, Sequence as Seq, STANISZ_3T};
use sci_mri_engine::encode::*;
use sci_mri_engine::phantom::*;
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

    // ------------------------------------------------ part two: encoding --

    head("Analytic k-space: the k = 0 sample is the object's integrated density");
    for (name, p) in [
        ("Shepp–Logan (1974)", Phantom::shepp_logan()),
        ("Shepp–Logan, modified", Phantom::shepp_logan_modified()),
    ] {
        row(name, p.k_value(0.0, 0.0).0, p.mass(), "∫ρ dA");
    }

    let n = 128;
    let fov = 0.30;
    let dwell = 4e-6;
    let clean = Timing { dwell, t2star: 1e9, off_res: 0.0 };

    head("Sampling: Δk sets the field of view, k_max sets the resolution");
    {
        let sc = Scanner::new(n, fov, 0.10, Phantom::disc(0.0, 0.0, 0.25));
        row("FOV from 1/Δk", 1.0 / sc.dk(), fov, "m");
        row("pixel from 1/(2·k_max)", 1.0 / (2.0 * sc.k_max()), sc.pixel(), "m");
    }
    {
        // A disc parked off centre reconstructs where it actually is.
        let (x0, y0) = (0.3, -0.15);
        let mut sc = Scanner::new(n, fov, 0.10, Phantom::disc(x0, y0, 0.25));
        sc.acquire(Trajectory::SpinWarp, clean, 1);
        let (cx, cy) = Scanner::centroid(&sc.reconstruct(None), n);
        row("recon centroid x", cx, x0 * 0.10 / sc.pixel(), "px");
        row("recon centroid y", cy, y0 * 0.10 / sc.pixel(), "px");
    }

    head("The EPI distortion formula: shift = Δf · N · echo-spacing");
    {
        let nn = 64;
        let esp = nn as f64 * dwell;
        let mut sc = Scanner::new(nn, fov, 0.10, Phantom::disc(0.0, 0.0, 0.30));
        for &df in &[30.0, -45.0, 60.0] {
            sc.acquire(
                Trajectory::Epi,
                Timing { dwell, t2star: 1e9, off_res: df },
                1,
            );
            let (_, cy) = Scanner::centroid(&sc.reconstruct(None), nn);
            row(
                &format!("EPI shift at Δf = {df:+.0} Hz"),
                cy.abs(),
                epi_shift_pixels(df, nn, esp, 1).abs(),
                "px",
            );
        }
        // …and the same off-resonance through spin-warp.
        sc.acquire(
            Trajectory::SpinWarp,
            Timing { dwell, t2star: 1e9, off_res: 60.0 },
            1,
        );
        let (_, cy) = Scanner::centroid(&sc.reconstruct(None), nn);
        println!("  spin-warp at Δf = +60 Hz: {cy:+.4} px — the clock restarts every line");
    }

    head("Tissue properties — Stanisz et al. 2005, Table 1, 3 T (in vitro, 37 °C)");
    println!("  {:<20} {:>12} {:>12}", "", "T1 [ms]", "T2 [ms]");
    for t in STANISZ_3T.iter() {
        println!(
            "  {:<20} {:>7.0} ± {:<3.0} {:>7.0} ± {:<3.0}",
            t.name, t.t1 * 1e3, t.t1_sd * 1e3, t.t2 * 1e3, t.t2_sd * 1e3
        );
    }
    println!("  The same table's literature column gives grey-matter T1 as 1470 ± 50 ms —");
    println!("  a 24% disagreement in the most-used parameter in the field.");

    head("Sequence equations vs a Bloch simulation run to steady state");
    {
        let wm = contrast::tissue("white matter");
        for &(tr, te, flip) in &[(0.010f64, 0.004f64, 10.0f64), (0.050, 0.004, 30.0), (0.500, 0.010, 90.0)] {
            let closed = Seq::SpoiledGradientEcho { tr, te, flip: flip.to_radians() }.signal(&wm, wm.t2);
            // Bloch: repeated pulses with perfect spoiling.
            let mut s = Spin::new(wm.t1, wm.t2, 0.0);
            let mut sim = 0.0;
            for _ in 0..4000 {
                s.pulse(flip.to_radians(), 0.0);
                s.evolve(te);
                sim = (s.m[0] * s.m[0] + s.m[1] * s.m[1]).sqrt();
                s.evolve(tr - te);
                s.m[0] = 0.0;
                s.m[1] = 0.0;
            }
            row(&format!("SPGR TR={:.0}ms α={flip:.0}°", tr * 1e3), closed, sim, "M₀");
        }
    }

    head("The two closed forms");
    {
        let wm = contrast::tissue("white matter");
        for &tr in &[0.005, 0.050, 0.500] {
            // brute-force maximum over flip angle
            let (mut best, mut bv) = (0.0f64, -1.0f64);
            let mut a = 0.01f64;
            while a < 90.0 {
                let v = Seq::SpoiledGradientEcho { tr, te: 0.0, flip: a.to_radians() }.signal(&wm, wm.t2);
                if v > bv { bv = v; best = a; }
                a += 0.01;
            }
            row(&format!("Ernst angle at TR={:.0} ms", tr * 1e3), best,
                contrast::ernst_angle(tr, wm.t1).to_degrees(), "deg");
        }
        for t in STANISZ_3T.iter().take(3) {
            let ti = contrast::null_time(t.t1, 3.0);
            let s = Seq::InversionRecovery { tr: 3.0, ti, te: 0.0 }.signal(t, 1.0);
            println!("  null {:<16} TI = {:>7.1} ms → signal {:.2e}  (T1·ln2 = {:.1} ms)",
                t.name, ti * 1e3, s, t.t1 * 1e3 * std::f64::consts::LN_2);
        }
    }

    head("The invisibility curve: where white and grey matter cancel");
    {
        let (wm, gm) = (contrast::tissue("white matter"), contrast::tissue("grey matter"));
        for &te_ms in &[5.0, 10.0, 20.0, 40.0, 80.0, 100.0, 140.0] {
            let te = te_ms * 1e-3;
            match contrast::contrast_zero_crossing(&wm, &gm, te, te * 1.5, 20.0) {
                Some(tr) => println!(
                    "  TE = {te_ms:>5.0} ms → indistinguishable at TR = {:>7.0} ms  (contrast {:+.2e})",
                    tr * 1e3,
                    contrast::contrast(&wm, &gm, &Seq::SpinEcho { tr, te }, 1.0)
                ),
                None => println!("  TE = {te_ms:>5.0} ms → no crossing: grey matter is brighter at every TR"),
            }
        }
    }

    head("Acquisition time — the reason EPI exists at all");
    {
        let sc = Scanner::new(n, fov, 0.10, Phantom::shepp_logan_modified());
        let sw = sc.acquisition_seconds(Trajectory::SpinWarp, clean, 1, 0.5);
        let ep = sc.acquisition_seconds(Trajectory::Epi, clean, 1, 0.5);
        println!("  spin-warp, 128 lines at TR = 500 ms: {sw:8.2} s");
        println!("  single-shot EPI, same coverage:      {ep:8.4} s   ({:.0}× faster)", sw / ep);
    }
    println!();
}
