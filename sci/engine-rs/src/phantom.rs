//! An object, and its k-space, computed analytically.
//!
//! The temptation when demonstrating MRI reconstruction is to take a digital
//! image, FFT it, and call the result "the data". That is an **inverse crime**:
//! the reconstruction inverts exactly the discretisation the simulation used, so
//! it looks perfect, and the artefacts that matter — aliasing from
//! undersampling, blur from truncation — are either absent or wrong.
//!
//! So the phantom here is a set of **ellipses in the continuous plane**, and its
//! k-space is evaluated from the closed form. The 2D Fourier transform of an
//! ellipse with semi-axes `(a, b)`, centred at `c` and rotated by `θ`, is
//!
//! ```text
//! F(k) = ρ · a·b · exp(−2πi k·c) · J₁(2π|κ|)/|κ|,   κ = (a·k'ₓ, b·k'_y)
//! ```
//!
//! with `k'` the k-vector rotated into the ellipse's frame and `J₁` the Bessel
//! function of the first kind. There is no grid anywhere in that expression, so
//! the samples a "scanner" takes here are samples of a genuinely continuous
//! object — and undersampling it aliases for the same reason a real one does.
//! (The approach is the one argued for in Guerquin-Kern et al., *IEEE Trans Med
//! Imaging* 31:626–636, 2012.)

/// Bessel function of the first kind, order 1.
///
/// Abramowitz & Stegun 9.4.4 (|x| ≤ 3) and 9.4.6 (x > 3); absolute error below
/// ~1.3×10⁻⁸ and 9×10⁻⁸ respectively, which `tests.rs` checks against tabulated
/// values.
pub fn bessel_j1(x: f64) -> f64 {
    let ax = x.abs();
    let v = if ax <= 3.0 {
        let t = x / 3.0;
        let t2 = t * t;
        x * (0.5
            + t2 * (-0.562_499_85
                + t2 * (0.210_935_73
                    + t2 * (-0.039_542_89
                        + t2 * (0.004_433_19 + t2 * (-0.000_317_61 + t2 * 0.000_011_09))))))
    } else {
        let t = 3.0 / ax;
        let f1 = 0.797_884_56
            + t * (0.000_001_56
                + t * (0.016_596_67
                    + t * (0.000_171_05
                        + t * (-0.002_495_11 + t * (0.001_136_53 + t * (-0.000_200_33))))));
        let th = ax - 2.356_194_49
            + t * (0.124_996_12
                + t * (0.000_056_50
                    + t * (-0.006_378_79
                        + t * (0.000_743_48 + t * (0.000_798_24 + t * (-0.000_291_66))))));
        let j = f1 * th.cos() / ax.sqrt();
        if x < 0.0 {
            -j
        } else {
            j
        }
    };
    v
}

/// One ellipse of the phantom. Coordinates are normalised: the phantom lives in
/// the unit disc, and the page scales it to a physical object size.
#[derive(Clone, Copy, Debug)]
pub struct Ellipse {
    pub rho: f64,
    /// Semi-axis along the ellipse's own x.
    pub a: f64,
    /// Semi-axis along the ellipse's own y.
    pub b: f64,
    pub x0: f64,
    pub y0: f64,
    /// Rotation, radians.
    pub theta: f64,
}

impl Ellipse {
    /// The ellipse's contribution to the signal at spatial frequency
    /// `(kx, ky)`, in cycles per unit length. Returns `(re, im)`.
    pub fn k_value(&self, kx: f64, ky: f64) -> (f64, f64) {
        let (s, c) = self.theta.sin_cos();
        // Rotate k into the ellipse's frame, then scale by the semi-axes.
        let kxr = kx * c + ky * s;
        let kyr = -kx * s + ky * c;
        let kap = ((self.a * kxr).powi(2) + (self.b * kyr).powi(2)).sqrt();
        // lim_{κ→0} J₁(2πκ)/κ = π, i.e. the DC term is the ellipse's area × ρ.
        let radial = if kap < 1e-9 {
            std::f64::consts::PI
        } else {
            bessel_j1(2.0 * std::f64::consts::PI * kap) / kap
        };
        let amp = self.rho * self.a * self.b * radial;
        let ph = -2.0 * std::f64::consts::PI * (kx * self.x0 + ky * self.y0);
        let (sp, cp) = ph.sin_cos();
        (amp * cp, amp * sp)
    }

    /// Whether a point is inside — for rendering the ground truth the
    /// reconstruction is compared against.
    pub fn contains(&self, x: f64, y: f64) -> bool {
        let (dx, dy) = (x - self.x0, y - self.y0);
        let (s, c) = self.theta.sin_cos();
        let xr = dx * c + dy * s;
        let yr = -dx * s + dy * c;
        (xr / self.a).powi(2) + (yr / self.b).powi(2) <= 1.0
    }
}

/// A phantom: ellipses summed, so overlaps add (which is how the Shepp–Logan
/// interior structures are made — by negative ellipses cutting into the skull).
#[derive(Clone, Debug)]
pub struct Phantom {
    pub ellipses: Vec<Ellipse>,
}

impl Phantom {
    /// Signal at `(kx, ky)` — the **encoding equation**, evaluated exactly:
    /// `S(k) = ∫ ρ(r) e^{−2πi k·r} dr`.
    pub fn k_value(&self, kx: f64, ky: f64) -> (f64, f64) {
        self.ellipses.iter().fold((0.0, 0.0), |(re, im), e| {
            let (r, i) = e.k_value(kx, ky);
            (re + r, im + i)
        })
    }

    /// Spin density at a point — the ground truth.
    pub fn density(&self, x: f64, y: f64) -> f64 {
        self.ellipses
            .iter()
            .filter(|e| e.contains(x, y))
            .map(|e| e.rho)
            .sum()
    }

    /// Total integrated density — the value the k = 0 sample must equal, which
    /// is the cheapest possible check that the analytic k-space is right.
    pub fn mass(&self) -> f64 {
        self.ellipses
            .iter()
            .map(|e| e.rho * e.a * e.b * std::f64::consts::PI)
            .sum()
    }

    /// The Shepp–Logan head phantom — Shepp & Logan, *IEEE Trans Nucl Sci*
    /// 21:21–43 (1974). The original, whose interior features sit at ±0.01
    /// against a 1.0 background: it was designed to be *hard*, since the point
    /// of the paper was that reconstruction must resolve low contrast.
    pub fn shepp_logan() -> Self {
        Self::from_table(&[
            //  ρ,      a,      b,     x0,     y0,   φ°
            (2.0, 0.6900, 0.9200, 0.0, 0.0000, 0.0),
            (-0.98, 0.6624, 0.8740, 0.0, -0.0184, 0.0),
            (-0.02, 0.1100, 0.3100, 0.22, 0.0000, -18.0),
            (-0.02, 0.1600, 0.4100, -0.22, 0.0000, 18.0),
            (0.01, 0.2100, 0.2500, 0.0, 0.3500, 0.0),
            (0.01, 0.0460, 0.0460, 0.0, 0.1000, 0.0),
            (0.01, 0.0460, 0.0460, 0.0, -0.1000, 0.0),
            (0.01, 0.0460, 0.0230, -0.08, -0.6050, 0.0),
            (0.01, 0.0230, 0.0230, 0.0, -0.6060, 0.0),
            (0.01, 0.0230, 0.0460, 0.06, -0.6050, 0.0),
        ])
    }

    /// The contrast-boosted variant (Toft, *The Radon Transform*, PhD thesis,
    /// DTU 1996), which is what almost everyone actually displays. Same
    /// geometry, visible features. The page uses this and says so.
    pub fn shepp_logan_modified() -> Self {
        Self::from_table(&[
            (1.00, 0.6900, 0.9200, 0.0, 0.0000, 0.0),
            (-0.80, 0.6624, 0.8740, 0.0, -0.0184, 0.0),
            (-0.20, 0.1100, 0.3100, 0.22, 0.0000, -18.0),
            (-0.20, 0.1600, 0.4100, -0.22, 0.0000, 18.0),
            (0.10, 0.2100, 0.2500, 0.0, 0.3500, 0.0),
            (0.10, 0.0460, 0.0460, 0.0, 0.1000, 0.0),
            (0.10, 0.0460, 0.0460, 0.0, -0.1000, 0.0),
            (0.10, 0.0460, 0.0230, -0.08, -0.6050, 0.0),
            (0.10, 0.0230, 0.0230, 0.0, -0.6060, 0.0),
            (0.10, 0.0230, 0.0460, 0.06, -0.6050, 0.0),
        ])
    }

    /// A single off-centre disc — the simplest object with a known k-space and
    /// a known centroid, used by the tests that measure geometric shift.
    pub fn disc(x0: f64, y0: f64, r: f64) -> Self {
        Phantom {
            ellipses: vec![Ellipse {
                rho: 1.0,
                a: r,
                b: r,
                x0,
                y0,
                theta: 0.0,
            }],
        }
    }

    fn from_table(rows: &[(f64, f64, f64, f64, f64, f64)]) -> Self {
        Phantom {
            ellipses: rows
                .iter()
                .map(|&(rho, a, b, x0, y0, phi)| Ellipse {
                    rho,
                    a,
                    b,
                    x0,
                    y0,
                    theta: phi.to_radians(),
                })
                .collect(),
        }
    }
}
