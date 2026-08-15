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

// ======================================================= encoding (part 2) ==

use crate::encode::*;
use crate::fft::*;
use crate::phantom::*;

/// The Bessel approximation, against tabulated J₁.
#[test]
fn bessel_j1_matches_tables() {
    // Checked against the integral representation
    //   J₁(x) = (1/π) ∫₀^π cos(θ − x sin θ) dθ
    // rather than against remembered tables, so the test cannot inherit a
    // typo. Simpson's rule with 20 001 points is good to ~1e-12 here.
    let integral = |x: f64| -> f64 {
        let m = 20_000usize;
        let h = PI / m as f64;
        let f = |th: f64| (th - x * th.sin()).cos();
        let mut acc = f(0.0) + f(PI);
        for i in 1..m {
            let th = i as f64 * h;
            acc += f(th) * if i % 2 == 1 { 4.0 } else { 2.0 };
        }
        acc * h / 3.0 / PI
    };
    for &x in &[0.5, 1.0, 2.0, 3.0, 5.0, 10.0, 17.5, 40.0] {
        let want = integral(x);
        assert!(
            (bessel_j1(x) - want).abs() < 2e-7,
            "J1({x}) = {} , integral says {want}",
            bessel_j1(x)
        );
    }
    // Spot-check one tabulated value so a systematically wrong integral would
    // not go unnoticed either: J₁(1) = 0.4400505857…
    assert!((bessel_j1(1.0) - 0.440_050_585_745).abs() < 2e-7);
    assert!(bessel_j1(0.0).abs() < 1e-15, "J1(0) = 0");
    assert!((bessel_j1(-2.0) + bessel_j1(2.0)).abs() < 1e-12, "J1 is odd");
}

/// The k = 0 sample is the object's total integrated density. The cheapest
/// possible check that the analytic k-space is the transform of the object it
/// claims to be.
#[test]
fn dc_sample_equals_total_mass() {
    for p in [Phantom::shepp_logan(), Phantom::shepp_logan_modified(), Phantom::disc(0.1, -0.2, 0.3)] {
        let (re, im) = p.k_value(0.0, 0.0);
        assert!(rel(re, p.mass()) < 1e-9, "DC {re} vs mass {}", p.mass());
        assert!(im.abs() < 1e-12);
    }
}

/// The closed-form ellipse transform against brute-force numerical integration
/// of the ellipse's indicator function. This is the test that the analytic
/// k-space is *right*, not merely self-consistent.
#[test]
fn analytic_k_space_matches_numerical_integration() {
    let e = Ellipse { rho: 1.0, a: 0.31, b: 0.17, x0: 0.08, y0: -0.05, theta: 0.4 };
    let m = 1400; // quadrature grid over [-1,1]²
    let h = 2.0 / m as f64;
    for &(kx, ky) in &[(0.0, 0.0), (1.7, 0.0), (0.0, 2.9), (3.1, -2.2), (-5.0, 4.0)] {
        let (mut re, mut im) = (0.0, 0.0);
        for iy in 0..m {
            let y = -1.0 + (iy as f64 + 0.5) * h;
            for ix in 0..m {
                let x = -1.0 + (ix as f64 + 0.5) * h;
                if e.contains(x, y) {
                    let ph = -2.0 * PI * (kx * x + ky * y);
                    let (s, c) = ph.sin_cos();
                    re += c;
                    im += s;
                }
            }
        }
        let (nre, nim) = (re * h * h, im * h * h);
        let (are, aim) = e.k_value(kx, ky);
        let err = ((are - nre).powi(2) + (aim - nim).powi(2)).sqrt();
        assert!(err < 3e-4, "k=({kx},{ky}): analytic ({are},{aim}) vs numeric ({nre},{nim})");
    }
}

/// FFT against a brute-force DFT, and a round trip.
#[test]
fn fft_matches_the_dft() {
    let n = 32;
    let mut x: Vec<f64> = (0..2 * n)
        .map(|i| ((i * 37 % 61) as f64 / 61.0) - 0.5)
        .collect();
    let orig = x.clone();
    // brute force
    let mut want = vec![0.0; 2 * n];
    for k in 0..n {
        for t in 0..n {
            let ph = -2.0 * PI * (k * t) as f64 / n as f64;
            let (s, c) = ph.sin_cos();
            want[2 * k] += orig[2 * t] * c - orig[2 * t + 1] * s;
            want[2 * k + 1] += orig[2 * t] * s + orig[2 * t + 1] * c;
        }
    }
    fft(&mut x, false);
    for i in 0..2 * n {
        assert!((x[i] - want[i]).abs() < 1e-9, "bin {i}: {} vs {}", x[i], want[i]);
    }
    fft(&mut x, true);
    for i in 0..2 * n {
        assert!((x[i] - orig[i]).abs() < 1e-12, "round trip failed at {i}");
    }
}

#[test]
fn fftshift_is_its_own_inverse() {
    let n = 8;
    let orig: Vec<f64> = (0..2 * n * n).map(|i| i as f64).collect();
    let mut d = orig.clone();
    fftshift2(&mut d, n);
    assert!(d != orig);
    fftshift2(&mut d, n);
    assert_eq!(d, orig);
}

fn disc_scanner(n: usize, fov: f64, x0: f64, y0: f64) -> Scanner {
    // Object radius 10 cm; the disc is a quarter of it, placed by (x0,y0) in
    // normalised units.
    Scanner::new(n, fov, 0.10, Phantom::disc(x0, y0, 0.25))
}

/// **Δk sets the field of view.** A disc placed at a known physical offset
/// reconstructs with its centroid at that offset divided by the pixel size —
/// no fudge factor.
#[test]
fn delta_k_sets_the_field_of_view() {
    let n = 128;
    let fov = 0.30;
    let (x0n, y0n) = (0.3, -0.15); // normalised object coords
    let mut sc = disc_scanner(n, fov, x0n, y0n);
    sc.acquire(Trajectory::SpinWarp, Timing { dwell: 4e-6, t2star: 1e9, off_res: 0.0 }, 1);
    let img = sc.reconstruct(None);
    let (cx, cy) = Scanner::centroid(&img, n);
    let want_x = x0n * sc.object_radius / sc.pixel();
    let want_y = y0n * sc.object_radius / sc.pixel();
    assert!((cx - want_x).abs() < 0.5, "centroid x {cx} px, want {want_x}");
    assert!((cy - want_y).abs() < 0.5, "centroid y {cy} px, want {want_y}");
    assert!(rel(sc.fov, 1.0 / sc.dk()) < 1e-12, "FOV = 1/Δk");
}

/// The reconstruction gets the object's actual density back, not merely
/// something proportional to it — so the Δk² scaling in `reconstruct` is right.
#[test]
fn reconstruction_recovers_absolute_density() {
    let n = 128;
    let mut sc = disc_scanner(n, 0.30, 0.0, 0.0);
    sc.acquire(Trajectory::SpinWarp, Timing { dwell: 4e-6, t2star: 1e9, off_res: 0.0 }, 1);
    let img = sc.reconstruct(None);
    // Mean over the middle of the disc, well away from the Gibbs ringing.
    let mut acc = 0.0;
    let mut cnt = 0.0;
    for iy in (n / 2 - 8)..(n / 2 + 8) {
        for ix in (n / 2 - 8)..(n / 2 + 8) {
            acc += img[iy * n + ix] as f64;
            cnt += 1.0;
        }
    }
    let got = acc / cnt;
    assert!(rel(got, 1.0) < 0.02, "reconstructed density {got}, true 1.0");
}

/// **k_max sets the resolution**, and the sampling theorem is exact about it.
///
/// Two claims, both measured on the point-spread function of a sub-pixel
/// object:
///
/// 1. With full k-space, `Δx = 1/(2·k_max) = FOV/N` — exactly one pixel — so a
///    point object reconstructs into essentially a single pixel. The Dirichlet
///    kernel's zeros land on the neighbouring pixel centres.
/// 2. Halving the k-space coverage doubles the PSF width. Measured as FWHM,
///    in a regime where the PSF is wide enough to measure without the pixel
///    grid itself limiting the answer.
#[test]
fn k_max_sets_the_resolution() {
    let n = 128;
    let fov = 0.30;
    // A disc a third of a pixel across — effectively a point.
    let mut sc = Scanner::new(n, fov, 0.10, Phantom::disc(0.0, 0.0, 0.008));
    sc.acquire(Trajectory::SpinWarp, Timing { dwell: 4e-6, t2star: 1e9, off_res: 0.0 }, 1);
    assert!(rel(sc.pixel(), 1.0 / (2.0 * sc.k_max())) < 1e-12, "Δx = 1/2k_max");

    let psf = |frac: f64| -> (f64, Vec<f64>) {
        let half = (n as f64 * frac / 2.0) as i64;
        let mut mask = vec![0u8; n * n];
        for iy in 0..n as i64 {
            for ix in 0..n as i64 {
                if (ix - n as i64 / 2).abs() <= half && (iy - n as i64 / 2).abs() <= half {
                    mask[(iy * n as i64 + ix) as usize] = 1;
                }
            }
        }
        let img = sc.reconstruct(Some(&mask));
        let row: Vec<f64> = (0..n).map(|ix| img[(n / 2) * n + ix] as f64).collect();
        let peak = row.iter().cloned().fold(0.0, f64::max);
        let norm: Vec<f64> = row.iter().map(|v| v / peak).collect();
        // FWHM by linear interpolation on the right half.
        let mut fwhm = 0.0;
        for ix in n / 2..n {
            if norm[ix] < 0.5 {
                let (a, b) = (norm[ix - 1], norm[ix]);
                fwhm = 2.0 * ((ix as f64 - 1.0) + (a - 0.5) / (a - b) - n as f64 / 2.0);
                break;
            }
        }
        (fwhm, norm)
    };

    // 1. full k-space: one pixel, and the neighbours are nulls
    let (full, prof) = psf(1.0);
    assert!((full - 1.0).abs() < 0.1, "full-k PSF FWHM {full} px, want ~1");
    assert!(
        prof[n / 2 + 1] < 0.05 && prof[n / 2 + 2] < 0.05,
        "the PSF's zeros should land on neighbouring pixels: {:?}",
        &prof[n / 2..n / 2 + 3]
    );

    // 2. halving k_max doubles the width. Compared between two undersampled
    //    cases, both wide enough that the pixel grid is not the limit.
    let (w_half, _) = psf(0.5);
    let (w_quarter, _) = psf(0.25);
    assert!(
        rel(w_quarter / w_half, 2.0) < 0.1,
        "halving k_max should double the PSF: {w_half} → {w_quarter} px"
    );
}

/// **Undersampling wraps the object.** Keeping every other phase-encode line
/// halves the field of view, and anything outside the new FOV folds back in.
#[test]
fn undersampling_aliases_by_half_the_fov() {
    let n = 128;
    let fov = 0.30;
    // A small disc parked well off centre in y.
    let mut sc = Scanner::new(n, fov, 0.10, Phantom::disc(0.0, 0.55, 0.12));
    let t = Timing { dwell: 4e-6, t2star: 1e9, off_res: 0.0 };

    sc.acquire(Trajectory::SpinWarp, t, 1);
    let (_, cy_full) = Scanner::centroid(&sc.reconstruct(None), n);

    sc.acquire(Trajectory::SpinWarp, t, 2);
    let (_, cy_alias) = Scanner::centroid(&sc.reconstruct(None), n);

    // With R = 2 the object appears at its true position AND folded by n/2, so
    // half the energy moves: the centroid lands midway between the two copies.
    let folded = cy_full - n as f64 / 2.0;
    let want = 0.5 * (cy_full + folded);
    assert!(
        (cy_alias - want).abs() < 3.0,
        "R=2 centroid {cy_alias}, expected ≈{want} (true {cy_full}, ghost {folded})"
    );
}

/// The shift-measuring tool the page uses, checked on a shift it was given.
/// Including one big enough to wrap around the field of view, which is the case
/// a centroid gets wrong.
#[test]
fn circular_cross_correlation_recovers_a_known_shift() {
    let n = 64;
    let mut sc = Scanner::new(n, 0.30, 0.10, Phantom::disc(0.0, 0.0, 0.25));
    sc.acquire(Trajectory::SpinWarp, Timing { dwell: 4e-6, t2star: 1e9, off_res: 0.0 }, 1);
    let base = sc.reconstruct(None);
    for &s in &[0i32, 3, -7, 20, 31, -30] {
        // Roll the image by s rows, circularly — exactly what a Fourier
        // reconstruction does when the object slides past the FOV edge.
        let mut rolled = vec![0f32; n * n];
        for y in 0..n as i32 {
            let src = (y - s).rem_euclid(n as i32) as usize;
            for x in 0..n {
                rolled[y as usize * n + x] = base[src * n + x];
            }
        }
        let got = shift_along_y(&base, &rolled, n);
        assert!((got - s as f64).abs() < 0.05, "rolled by {s}, measured {got}");
    }
}

/// **The EPI distortion formula.** A uniform off-resonance shifts a
/// single-shot EPI image along the phase-encode direction by
/// `Δf · N · echo-spacing` pixels — because that axis is sampled once per echo
/// spacing and so has a bandwidth thousands of times narrower than the readout.
///
/// This is the test that makes the page's claim about bent EPI brains a
/// measurement rather than an assertion.
#[test]
fn epi_off_resonance_shifts_by_the_predicted_pixels() {
    let n = 64;
    let dwell = 4e-6;
    let esp = n as f64 * dwell; // 256 µs
    let mut sc = Scanner::new(n, 0.30, 0.10, Phantom::disc(0.0, 0.0, 0.30));

    for &df in &[0.0, 30.0, -45.0, 60.0] {
        let t = Timing { dwell, t2star: 1e9, off_res: df };
        sc.acquire(Trajectory::Epi, t, 1);
        let (_, cy) = Scanner::centroid(&sc.reconstruct(None), n);
        let want = epi_shift_pixels(df, n, esp, 1);
        assert!(
            (cy.abs() - want.abs()).abs() < 0.6,
            "Δf={df} Hz: shift {cy} px, formula {want} px"
        );
    }

    // Accelerating halves the echo train, so it halves the distortion too.
    for &r in &[2usize, 4] {
        let t = Timing { dwell, t2star: 1e9, off_res: 60.0 };
        sc.acquire(Trajectory::Epi, t, r);
        let (_, cy) = Scanner::centroid(&sc.reconstruct(None), n);
        let want = epi_shift_pixels(60.0, n, esp, r);
        assert!(
            (cy.abs() - want.abs()).abs() < 0.6,
            "R={r}: shift {cy} px, formula {want} px"
        );
    }
}

/// …and spin-warp does not distort, for the same off-resonance, because every
/// line starts from a fresh excitation. Same k-space coverage, different
/// answer — the artefact lives in the *timing*, not the sampling pattern.
#[test]
fn spin_warp_is_immune_to_the_same_off_resonance() {
    let n = 64;
    let mut sc = Scanner::new(n, 0.30, 0.10, Phantom::disc(0.0, 0.0, 0.30));
    let t = Timing { dwell: 4e-6, t2star: 1e9, off_res: 60.0 };
    sc.acquire(Trajectory::SpinWarp, t, 1);
    let (cx, cy) = Scanner::centroid(&sc.reconstruct(None), n);
    // Spin-warp's phase-encode axis carries no timing at all, so the shift is
    // identically zero rather than merely small.
    assert!(cy.abs() < 0.05, "spin-warp PE shift should be ~0, got {cy}");
    // The readout axis is not immune — but its bandwidth is N·dwell wide, so
    // 60 Hz moves it by γ̄-independent 60·64·4µs = 0.0154 px. Invisible, and
    // that ratio (here ~4000×) is the whole reason EPI distorts and this does
    // not.
    let readout_shift = 60.0 * n as f64 * 4e-6;
    assert!(readout_shift < 0.02);
    assert!(cx.abs() < 0.1, "readout shift should be negligible, got {cx}");
}

/// **T₂* blurs EPI and not spin-warp**, and the reason is the readout length.
///
/// Spin-warp's clock runs for one line — here 512 µs — before the next
/// excitation resets it, so a 20 ms T₂* barely changes across it. Single-shot
/// EPI's runs for the whole of k-space, 32.8 ms, so the later lines are
/// substantially more decayed than the early ones: an exponential ramp across
/// the phase-encode axis, which is a filter, which is blur.
///
/// Measured as each trajectory's PSF width *against its own T₂*-free PSF*, so
/// the comparison is with the same sampling and the same everything else.
#[test]
fn t2star_blurs_epi_and_not_spin_warp() {
    let n = 64;
    let dwell = 8e-6;
    let psf_width = |traj: Trajectory, t2star: f64| -> f64 {
        let mut sc = Scanner::new(n, 0.30, 0.10, Phantom::disc(0.0, 0.0, 0.008));
        sc.acquire(traj, Timing { dwell, t2star, off_res: 0.0 }, 1);
        let img = sc.reconstruct(None);
        // Down the phase-encode axis, where EPI's clock runs.
        let col: Vec<f64> = (0..n).map(|iy| img[iy * n + n / 2] as f64).collect();
        let peak = col.iter().cloned().fold(0.0, f64::max);
        let pk = col.iter().position(|&v| v == peak).unwrap();
        for iy in pk..n {
            if col[iy] < 0.5 * peak {
                let (a, b) = (col[iy - 1], col[iy]);
                return 2.0 * ((iy as f64 - 1.0) + (a - 0.5 * peak) / (a - b) - pk as f64);
            }
        }
        f64::NAN
    };

    let t2 = 0.020;
    let sw_ratio = psf_width(Trajectory::SpinWarp, t2) / psf_width(Trajectory::SpinWarp, 1e9);
    let epi_ratio = psf_width(Trajectory::Epi, t2) / psf_width(Trajectory::Epi, 1e9);

    // one line: 64 × 8 µs = 512 µs, versus 64 × that for the whole EPI readout
    let line = n as f64 * dwell;
    assert!(rel(line * n as f64 / line, 64.0) < 1e-12);

    assert!(
        (sw_ratio - 1.0).abs() < 0.01,
        "spin-warp PSF should be unchanged by T₂*: ×{sw_ratio}"
    );
    assert!(
        epi_ratio > 1.15,
        "EPI PSF should broaden measurably: ×{epi_ratio}"
    );
}
