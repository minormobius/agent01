//! Biot–Savart fields from wire loops, and the receive sensitivity that the
//! principle of reciprocity gets you for free.
//!
//! ## Why this module is the point of the page
//!
//! An MRI's sensor is a coil of wire. Working out what it can hear looks like
//! it should require solving a reception problem — instead, Hoult & Richards
//! (*J Magn Reson* 24:71–85, 1976) showed that the coil's **receive
//! sensitivity at a point equals the field it would produce at that point per
//! unit current**. So the reception problem collapses into a Biot–Savart
//! integral, which is the elementary thing computed here.
//!
//! ## Geometry convention
//!
//! `B₀` lies along **+z**, as it does in a scanner bore. The consequence that
//! surprises people, and that this module makes visible: only the field
//! component **transverse** to `B₀` couples to precessing magnetisation. A coil
//! whose field at the sample is parallel to `B₀` is *deaf there*, however
//! strong that field is. This is why whole-body coils are birdcages and saddles
//! rather than solenoids around the bore axis.
//!
//! The receive sensitivity is reported as the rotating-frame component
//! `|B₁⁻| = |Bx - i·By| / 2`, the standard convention; for the real static
//! currents used here that is `½·√(Bx² + By²)`.

use crate::physics::MU0;

pub type Vec3 = [f64; 3];

fn sub(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
}
fn add(a: Vec3, b: Vec3) -> Vec3 {
    [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
}
fn scale(a: Vec3, k: f64) -> Vec3 {
    [a[0] * k, a[1] * k, a[2] * k]
}
fn dot(a: Vec3, b: Vec3) -> f64 {
    a[0] * b[0] + a[1] * b[1] + a[2] * b[2]
}
fn cross(a: Vec3, b: Vec3) -> Vec3 {
    [
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    ]
}
fn norm(a: Vec3) -> f64 {
    dot(a, a).sqrt()
}
fn unit(a: Vec3) -> Vec3 {
    let n = norm(a);
    if n < 1e-15 {
        [0.0, 0.0, 0.0]
    } else {
        scale(a, 1.0 / n)
    }
}

/// A straight current-carrying segment from `a` to `b`.
#[derive(Clone, Copy, Debug)]
pub struct Segment {
    pub a: Vec3,
    pub b: Vec3,
}

impl Segment {
    /// Exact Biot–Savart field (tesla) at `p` from this finite straight segment
    /// carrying current `i` amperes.
    ///
    /// Closed form for a finite segment, with `R₁ = p − a`, `R₂ = p − b`:
    ///
    /// ```text
    /// B = (μ₀ i / 4π) · (|R₁| + |R₂|) · (R₁ × R₂)
    ///                 / ( |R₁||R₂| ( |R₁||R₂| + R₁·R₂ ) )
    /// ```
    ///
    /// Returns zero on the segment's own line, where the expression is singular
    /// and the physical field of an infinitesimally thin wire diverges anyway.
    pub fn field(&self, p: Vec3, i: f64) -> Vec3 {
        let r1 = sub(p, self.a);
        let r2 = sub(p, self.b);
        let (n1, n2) = (norm(r1), norm(r2));
        if n1 < 1e-12 || n2 < 1e-12 {
            return [0.0, 0.0, 0.0];
        }
        let denom = n1 * n2 * (n1 * n2 + dot(r1, r2));
        if denom.abs() < 1e-30 {
            return [0.0, 0.0, 0.0];
        }
        let k = MU0 * i / (4.0 * std::f64::consts::PI) * (n1 + n2) / denom;
        scale(cross(r1, r2), k)
    }
}

/// A receive coil: any set of segments, carrying the same unit current.
///
/// A "loop" here is a regular polygon standing in for a circle; 128 sides puts
/// the on-axis field within a few parts in 10⁵ of the analytic circular result,
/// which `tests.rs` checks.
#[derive(Clone, Debug, Default)]
pub struct Coil {
    pub segments: Vec<Segment>,
}

impl Coil {
    pub fn new() -> Self {
        Self::default()
    }

    /// Add a circular loop of radius `radius` centred at `center`, with its
    /// plane normal to `normal` (the direction of the field it produces on its
    /// own axis, by the right-hand rule).
    pub fn add_loop(&mut self, center: Vec3, normal: Vec3, radius: f64, sides: usize) {
        let n = unit(normal);
        // Any vector not parallel to n, to build the loop's plane basis.
        let seed = if n[0].abs() < 0.9 {
            [1.0, 0.0, 0.0]
        } else {
            [0.0, 1.0, 0.0]
        };
        let u = unit(cross(seed, n));
        let v = cross(n, u);
        let sides = sides.max(3);
        let pt = |k: usize| -> Vec3 {
            let th = 2.0 * std::f64::consts::PI * (k as f64) / (sides as f64);
            add(
                center,
                add(scale(u, radius * th.cos()), scale(v, radius * th.sin())),
            )
        };
        for k in 0..sides {
            self.segments.push(Segment {
                a: pt(k),
                b: pt((k + 1) % sides),
            });
        }
    }

    /// Total field (tesla) at `p` for unit current.
    pub fn field(&self, p: Vec3) -> Vec3 {
        self.segments
            .iter()
            .fold([0.0, 0.0, 0.0], |acc, s| add(acc, s.field(p, 1.0)))
    }

    /// Receive sensitivity at `p`: `|B₁⁻| = ½√(Bx² + By²)` for unit current.
    ///
    /// This is the reciprocity result — the *transmit* field per unit current is
    /// the *receive* sensitivity. The z-component is discarded because it does
    /// not couple to precessing magnetisation, which is the module's headline
    /// fact.
    pub fn sensitivity(&self, p: Vec3) -> f64 {
        let b = self.field(p);
        0.5 * (b[0] * b[0] + b[1] * b[1]).sqrt()
    }

    /// Sensitivity sampled over a rectangular grid in the y = 0 plane (the
    /// plane containing `B₀`), row-major from `z0..z1` and `x0..x1`.
    ///
    /// Returned in units of 10⁻⁶ T A⁻¹ (µT per amp) so that browser-side `f32`
    /// has plenty of headroom.
    pub fn sensitivity_map(
        &self,
        x0: f64,
        x1: f64,
        z0: f64,
        z1: f64,
        nx: usize,
        nz: usize,
    ) -> Vec<f32> {
        let mut out = Vec::with_capacity(nx * nz);
        for jz in 0..nz {
            let z = z0 + (z1 - z0) * (jz as f64 + 0.5) / (nz as f64);
            for jx in 0..nx {
                let x = x0 + (x1 - x0) * (jx as f64 + 0.5) / (nx as f64);
                out.push((self.sensitivity([x, 0.0, z]) * 1e6) as f32);
            }
        }
        out
    }
}

/// On-axis field (tesla) of a circular loop of radius `a` carrying current `i`,
/// at distance `z` along its axis: `μ₀ i a² / (2 (a² + z²)^{3/2})`.
///
/// The closed form the polygon approximation is checked against.
pub fn loop_axis_field(a: f64, z: f64, i: f64) -> f64 {
    MU0 * i * a * a / (2.0 * (a * a + z * z).powf(1.5))
}

/// The loop radius whose on-axis field at depth `z` is largest: `a = √2 · z`.
///
/// Differentiating [`loop_axis_field`] with respect to `a` gives `2(a² + z²) =
/// 3a²`, so `a = z√2`. It is a *signal-only* optimum — noise also grows with
/// coil size, and in the sample-noise-dominated regime of a clinical scanner the
/// best coil is smaller than this. That gap is the subject of Edelstein et al.
/// (*Magn Reson Med* 3:604, 1986) and Ocali & Atalar (*Magn Reson Med* 39:462,
/// 1998), and the page says so rather than pretending this is the whole answer.
pub fn best_radius_for_depth(z: f64) -> f64 {
    z * std::f64::consts::SQRT_2
}
