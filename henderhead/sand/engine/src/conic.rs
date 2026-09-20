//! Conics: predicting which one two features should draw, and fitting one to
//! the curve the simulated sand actually drew.
//!
//! # Why the seam is a conic at all
//!
//! Sand at the angle of repose cannot stand steeper than `k = tan(theta)`.
//! That makes every feature an upper bound on the surface:
//!
//! * a **sink** at height `h` pins the sand there, and nothing can stand
//!   steeper than repose above it, so `z <= h + k*d_sink`. A funnel.
//! * a **source** that has built to a virtual apex `A` can hold nothing
//!   higher, so `z <= A - k*d_source`. A cone.
//!
//! The sand takes the lowest bound it is offered, and the seam is where two
//! bounds are equal. Every case is one line of algebra:
//!
//! | features | seam equation | curve |
//! |---|---|---|
//! | source + sink | `d1 + d2 = (A-h)/k` | **ellipse**, foci at the two |
//! | source + sink, coincident | `d = const` | **circle** |
//! | sink + sink | `d1 - d2 = (h2-h1)/k` | **hyperbola** |
//! | sink + sink, equal heights | `d1 = d2` | **straight line** |
//! | source + source | `d2 - d1 = (A2-A1)/k` | **hyperbola** |
//! | point + line | `d_point +/- d_line = const` | **parabola** |
//!
//! # The answer to "can you get every conic?"
//!
//! From points alone: **no.** Two point features can only ever give you a sum
//! of distances or a difference of distances, and those are exactly the
//! ellipse and the hyperbola. You can push the eccentricity as close to 1 as
//! you like from either side, but the limit is degenerate — a segment or a
//! ray — never a parabola.
//!
//! The reason is the classical one. A parabola is an ellipse with one focus at
//! infinity, and a focus at infinity is not a point you can drill. But it is
//! something you can *build*: a cone whose apex has run away to infinity is a
//! straight ridge, and a funnel whose bottom has run away to infinity is a
//! straight slot. So a **slot, or a wall — a line — is the missing focus**,
//! and point-against-line is the only way to hit e = 1 exactly.
//!
//! That is not a quirk of sand. It is the same statement as the focus-directrix
//! definition: distance to a point equals distance to a line. The sand just
//! makes the directrix something you can cut with a knife.
//!
//! # Fitting
//!
//! `fit` is the standard algebraic conic fit: solve for the coefficients of
//! `A x^2 + B xy + C y^2 + D x + E y + F = 0` that best satisfy the sampled
//! points, by taking the smallest eigenvector of the scatter matrix. It is
//! told nothing about the features, so when the fitted foci land on the pour
//! point and the hole that is a result and not an assumption.

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConicType {
    Ellipse,
    Circle,
    Parabola,
    Hyperbola,
    Line,
    Degenerate,
}

impl ConicType {
    pub fn code(self) -> i32 {
        match self {
            ConicType::Circle => 0,
            ConicType::Ellipse => 1,
            ConicType::Parabola => 2,
            ConicType::Hyperbola => 3,
            ConicType::Line => 4,
            ConicType::Degenerate => 5,
        }
    }
}

#[derive(Clone, Copy, Debug)]
pub struct Conic {
    pub a: f64,
    pub b: f64,
    pub c: f64,
    pub d: f64,
    pub e: f64,
    pub f: f64,
    /// Root-mean-square algebraic residual, normalised by the gradient so it
    /// reads in cells rather than in arbitrary units.
    pub rms: f64,
    pub n: usize,
}

impl Conic {
    /// `B^2 - 4AC`: negative is an ellipse, zero a parabola, positive a
    /// hyperbola. The whole classification in one number.
    pub fn discriminant(&self) -> f64 {
        self.b * self.b - 4.0 * self.a * self.c
    }

    /// Eccentricity, from the coefficients alone.
    ///
    /// Uses the standard invariant formula rather than reconstructing the axes,
    /// because near e = 1 the axes are numerically horrible while this stays
    /// well behaved.
    pub fn eccentricity(&self) -> f64 {
        let (a, b, c) = (self.a, self.b, self.c);
        let det3 = self.det3();
        if det3.abs() < 1e-14 {
            return f64::NAN;
        }
        let eta = if det3 < 0.0 { 1.0 } else { -1.0 };
        let disc = (a - c) * (a - c) + b * b;
        let root = disc.sqrt();
        let num = 2.0 * root;
        let den = eta * (a + c) + root;
        if den.abs() < 1e-14 {
            return f64::INFINITY;
        }
        (num / den).max(0.0).sqrt()
    }

    fn det3(&self) -> f64 {
        let (a, b, c, d, e, f) = (self.a, self.b, self.c, self.d, self.e, self.f);
        // |  a   b/2  d/2 |
        // | b/2   c   e/2 |
        // | d/2  e/2   f  |
        a * (c * f - e * e / 4.0) - (b / 2.0) * ((b / 2.0) * f - (e / 2.0) * (d / 2.0))
            + (d / 2.0) * ((b / 2.0) * (e / 2.0) - c * (d / 2.0))
    }

    /// Classify, with tolerances that admit the grid noise a simulation has.
    ///
    /// `scale` is the size of the curve in cells; the discriminant is
    /// normalised by the coefficient magnitude so the thresholds mean the same
    /// thing whatever the units.
    pub fn classify(&self, tol: f64) -> ConicType {
        let norm2 = self.a * self.a + self.b * self.b + self.c * self.c;
        let norm = norm2.sqrt();
        if norm < 1e-12 {
            return ConicType::Line;
        }
        // `B^2 - 4AC` divided by `A^2+B^2+C^2` is dimensionless and lands in
        // roughly [-2, +2]: -2 for a circle, 0 for a parabola, +2 for a
        // rectangular hyperbola. That makes `tol` mean the same thing whatever
        // the curve's size, which the raw discriminant does not.
        let dn = self.discriminant() / norm2;
        if self.det3().abs() < 1e-12 * norm {
            return ConicType::Degenerate;
        }
        if dn.abs() <= tol {
            return ConicType::Parabola;
        }
        if dn < 0.0 {
            // circle iff a == c and b == 0
            let asym = (self.a - self.c).abs() + self.b.abs();
            if asym / norm <= tol {
                ConicType::Circle
            } else {
                ConicType::Ellipse
            }
        } else {
            ConicType::Hyperbola
        }
    }

    /// The centre of a central conic.
    ///
    /// Much steadier than the foci when the curve is measured off a grid: the
    /// foci sit on the major axis and slide along it as soon as the fitted
    /// eccentricity is slightly off, while the centre stays put. For an
    /// ellipse drawn by a pour point and a hole it should be the midpoint of
    /// the two.
    pub fn center(&self) -> Option<(f64, f64)> {
        let disc = 4.0 * self.a * self.c - self.b * self.b;
        if disc.abs() < 1e-12 {
            return None;
        }
        Some((
            (self.b * self.e - 2.0 * self.c * self.d) / disc,
            (self.b * self.d - 2.0 * self.a * self.e) / disc,
        ))
    }

    /// The two foci, for the central conics. Returns `None` for a parabola or
    /// anything degenerate, where one focus is at infinity.
    pub fn foci(&self) -> Option<((f64, f64), (f64, f64))> {
        let (a, b, c, d, e) = (self.a, self.b, self.c, self.d, self.e);
        let disc = 4.0 * a * c - b * b;
        if disc.abs() < 1e-12 {
            return None;
        }
        // centre
        let cx = (b * e - 2.0 * c * d) / disc;
        let cy = (b * d - 2.0 * a * e) / disc;
        // rotate to principal axes
        let theta = 0.5 * (b).atan2(a - c);
        let (st, ct) = theta.sin_cos();
        // translated, rotated quadratic coefficients
        let ap = a * ct * ct + b * ct * st + c * st * st;
        let cp = a * st * st - b * ct * st + c * ct * ct;
        let fp = self.f + self.d * cx / 2.0 + self.e * cy / 2.0;
        if ap.abs() < 1e-18 || cp.abs() < 1e-18 {
            return None;
        }
        let aa = -fp / ap;
        let bb = -fp / cp;
        // semi-axes squared along the rotated frame; for a hyperbola one is
        // negative, which is exactly what makes c^2 = |aa| + |bb|
        let (maj, min_, along_x) = if aa.abs() >= bb.abs() {
            (aa, bb, true)
        } else {
            (bb, aa, false)
        };
        let c2 = if maj > 0.0 && min_ > 0.0 {
            maj - min_
        } else {
            maj.abs() + min_.abs()
        };
        if c2 < 0.0 {
            return None;
        }
        let fc = c2.sqrt();
        let (ux, uy) = if along_x { (ct, st) } else { (-st, ct) };
        Some(((cx + fc * ux, cy + fc * uy), (cx - fc * ux, cy - fc * uy)))
    }
}

/// Fit a general conic to the measured curve, telling it nothing else.
pub fn fit(pts: &[(f64, f64)]) -> Option<Conic> {
    fit_weighted(pts, 4, 0.12)
}

/// The fit, with the two corrections a curve read off a grid needs.
///
/// **Gradient weighting.** The plain algebraic fit minimises `Q(x)^2`, which
/// is not a distance: it is small wherever `|grad Q|` happens to be small, and
/// on an ellipse that is near the flat sides rather than the pointy ends. The
/// result is a systematic pull toward *more* eccentric conics, and it is not a
/// small effect here — the raw fit returned e = 0.95 for curves whose measured
/// `2c/2a` was 0.81, at every grid resolution, which is how it was caught: a
/// discretisation error shrinks when you refine the grid and this one did not.
/// Reweighting each point by `1/|grad Q|^2` and re-solving turns the objective
/// into the Sampson distance, which is a first-order approximation to the true
/// geometric one.
///
/// **Trimming.** A crease read off a height field has a few genuine outliers —
/// places where the fold is so shallow that which cell is "on" it is decided
/// by grid noise. `trim` is the fraction of worst-residual points dropped
/// between iterations. Dropping none leaves the fit chasing them; dropping
/// many would let it discard the parts of the curve it fits worst, which is
/// how a fitter talks itself into the wrong answer, so it stays small and
/// fixed rather than tuned per case.
pub fn fit_weighted(pts: &[(f64, f64)], iters: usize, trim: f64) -> Option<Conic> {
    let n = pts.len();
    if n < 6 {
        return None;
    }
    let mx = pts.iter().map(|p| p.0).sum::<f64>() / n as f64;
    let my = pts.iter().map(|p| p.1).sum::<f64>() / n as f64;
    let s = (pts
        .iter()
        .map(|p| ((p.0 - mx).powi(2) + (p.1 - my).powi(2)).sqrt())
        .sum::<f64>()
        / n as f64)
        .max(1e-12);

    // Hartley normalisation: without it the x^2 column is tens of thousands of
    // times larger than the 1 column on a 113-cell grid and the fit chases
    // rounding rather than the curve.
    let norm: Vec<(f64, f64)> = pts.iter().map(|p| ((p.0 - mx) / s, (p.1 - my) / s)).collect();

    let mut w = vec![1.0f64; n];
    let mut v = [0.0f64; 6];
    for it in 0..iters.max(1) {
        let mut m = [[0.0f64; 6]; 6];
        for (i, &(x, y)) in norm.iter().enumerate() {
            if w[i] <= 0.0 {
                continue;
            }
            let r = [x * x, x * y, y * y, x, y, 1.0];
            for a in 0..6 {
                for b in 0..6 {
                    m[a][b] += w[i] * r[a] * r[b];
                }
            }
        }
        v = smallest_eigenvector(&m)?;
        if it + 1 == iters.max(1) {
            break;
        }
        // Sampson weights from the current estimate, then trim the worst
        let mut res: Vec<(f64, usize)> = Vec::with_capacity(n);
        for (i, &(x, y)) in norm.iter().enumerate() {
            let q = v[0] * x * x + v[1] * x * y + v[2] * y * y + v[3] * x + v[4] * y + v[5];
            let gx = 2.0 * v[0] * x + v[1] * y + v[3];
            let gy = 2.0 * v[2] * y + v[1] * x + v[4];
            let g2 = (gx * gx + gy * gy).max(1e-12);
            w[i] = 1.0 / g2;
            res.push(((q * q / g2).sqrt(), i));
        }
        if trim > 0.0 {
            res.sort_by(|a, b| a.0.partial_cmp(&b.0).unwrap());
            let keep = ((n as f64) * (1.0 - trim)).round() as usize;
            for &(_, i) in res.iter().skip(keep.max(6)) {
                w[i] = 0.0;
            }
        }
    }

    // undo the normalisation: x -> (x - mx)/s
    let (a, b, c, d, e, f) = (v[0], v[1], v[2], v[3], v[4], v[5]);
    let s2 = s * s;
    let ua = a / s2;
    let ub = b / s2;
    let uc = c / s2;
    let ud = d / s - 2.0 * a * mx / s2 - b * my / s2;
    let ue = e / s - 2.0 * c * my / s2 - b * mx / s2;
    let uf = f - d * mx / s - e * my / s + a * mx * mx / s2 + b * mx * my / s2
        + c * my * my / s2;

    let mut conic = Conic { a: ua, b: ub, c: uc, d: ud, e: ue, f: uf, rms: 0.0, n };
    let mut acc = 0.0;
    for &(x, y) in pts {
        let val = ua * x * x + ub * x * y + uc * y * y + ud * x + ue * y + uf;
        let gx = 2.0 * ua * x + ub * y + ud;
        let gy = 2.0 * uc * y + ub * x + ue;
        let g = (gx * gx + gy * gy).sqrt().max(1e-12);
        acc += (val / g).powi(2);
    }
    conic.rms = (acc / n as f64).sqrt();
    Some(conic)
}

/// Jacobi eigenvalue iteration on a symmetric 6x6, returning the eigenvector
/// of the smallest eigenvalue. Small and self-contained — no linear algebra
/// crate, because the whole engine imports nothing.
fn smallest_eigenvector(m0: &[[f64; 6]; 6]) -> Option<[f64; 6]> {
    let mut a = *m0;
    let mut v = [[0.0f64; 6]; 6];
    for i in 0..6 {
        v[i][i] = 1.0;
    }
    for _sweep in 0..100 {
        let mut off = 0.0;
        for i in 0..6 {
            for j in (i + 1)..6 {
                off += a[i][j] * a[i][j];
            }
        }
        if off < 1e-24 {
            break;
        }
        for p in 0..5 {
            for q in (p + 1)..6 {
                if a[p][q].abs() < 1e-30 {
                    continue;
                }
                let theta = (a[q][q] - a[p][p]) / (2.0 * a[p][q]);
                let t = theta.signum() / (theta.abs() + (theta * theta + 1.0).sqrt());
                let c = 1.0 / (t * t + 1.0).sqrt();
                let s = t * c;
                for k in 0..6 {
                    let akp = a[k][p];
                    let akq = a[k][q];
                    a[k][p] = c * akp - s * akq;
                    a[k][q] = s * akp + c * akq;
                }
                for k in 0..6 {
                    let apk = a[p][k];
                    let aqk = a[q][k];
                    a[p][k] = c * apk - s * aqk;
                    a[q][k] = s * apk + c * aqk;
                }
                for k in 0..6 {
                    let vkp = v[k][p];
                    let vkq = v[k][q];
                    v[k][p] = c * vkp - s * vkq;
                    v[k][q] = s * vkp + c * vkq;
                }
            }
        }
    }
    let mut best = 0usize;
    for i in 1..6 {
        if a[i][i] < a[best][best] {
            best = i;
        }
    }
    let mut out = [0.0f64; 6];
    for k in 0..6 {
        out[k] = v[k][best];
    }
    let norm = out.iter().map(|x| x * x).sum::<f64>().sqrt();
    if !norm.is_finite() || norm < 1e-18 {
        return None;
    }
    for x in out.iter_mut() {
        *x /= norm;
    }
    Some(out)
}

/// The statistic used on Henderson's own video: how constant is `r1 + r2`
/// (or `|r1 - r2|`) around the curve, as a percentage of its mean. Returns
/// `(mean, sd, sd_over_mean_pct)`.
pub fn focal_constancy(
    pts: &[(f64, f64)],
    f1: (f64, f64),
    f2: (f64, f64),
    sum: bool,
) -> (f64, f64, f64) {
    if pts.is_empty() {
        return (0.0, 0.0, f64::NAN);
    }
    let vals: Vec<f64> = pts
        .iter()
        .map(|&(x, y)| {
            let r1 = ((x - f1.0).powi(2) + (y - f1.1).powi(2)).sqrt();
            let r2 = ((x - f2.0).powi(2) + (y - f2.1).powi(2)).sqrt();
            if sum {
                r1 + r2
            } else {
                (r1 - r2).abs()
            }
        })
        .collect();
    let mean = vals.iter().sum::<f64>() / vals.len() as f64;
    let var = vals.iter().map(|v| (v - mean).powi(2)).sum::<f64>() / vals.len() as f64;
    let sd = var.sqrt();
    (mean, sd, if mean.abs() > 1e-12 { sd / mean * 100.0 } else { f64::NAN })
}
