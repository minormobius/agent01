//! A ball bouncing under gravity inside a circle.
//!
//! After Matt Henderson's "chaos from bouncing a ball in a circle" (2026-09-14).
//! The video does not say what the rule is, so it was measured off it: tracking
//! the white dot frame by frame shows x constant while y accelerates, and after
//! the first bounce dx constant while dy changes linearly. **Parabolas, not
//! chords.** That matters more than any other detail here, because a ball
//! bouncing in a circle *without* gravity is integrable — the angle of
//! incidence is conserved, nearby trajectories separate linearly, and "hard to
//! predict four bounces ahead" would be false. Add gravity and the angle of
//! incidence stops being conserved, the phase space goes mixed, and everything
//! he describes follows.
//!
//! The ball is still reaching near its drop height at the end of his 80 seconds,
//! so the bounces are elastic and the energy is conserved. Restitution is a
//! control here anyway, defaulting to 1.
//!
//! ## Flight and bounce
//!
//! Between bounces p(t) = p₀ + v₀t + ½gt², with g pointing down. A bounce is
//! the first t > 0 with |p(t)| = R, which is a quartic in t:
//!
//!   (g²/4)t⁴ − (g·v_y)t³ + (|v|² − g·p_y)t² + 2(v·p)t + (|p|² − R²) = 0
//!
//! **Immediately after a bounce the ball is exactly on the circle, so the
//! constant term is zero and t factors out — the next bounce is the smallest
//! positive root of a cubic**, which has a closed form. That is worth the
//! trouble: stepping a small dt and testing for "outside" accumulates error at
//! every bounce, and in a system whose whole subject is how fast small errors
//! grow, an integrator that manufactures its own is not acceptable.
//!
//! Reflection is specular about the inward normal, with the normal component
//! scaled by the restitution.

use core::f64::consts::PI;

#[derive(Clone, Copy, Debug)]
pub struct Params {
    pub radius: f64,
    pub gravity: f64,
    /// 1.0 is elastic, which is what the video shows
    pub restitution: f64,
}

impl Default for Params {
    fn default() -> Self { Params { radius: 1.0, gravity: 1.0, restitution: 1.0 } }
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct State {
    pub x: f64,
    pub y: f64,
    pub vx: f64,
    pub vy: f64,
}

impl State {
    /// At rest at (offset, height). Dead centre is a perfect vertical bouncer
    /// that never goes anywhere; everything interesting on this page is
    /// downstream of that offset not being zero.
    ///
    /// `height` is the energy control, and the only one there is. E = ½v² + gy,
    /// so dropping from rest at height y fixes E = gy — and since the ball can
    /// never rise above where it was dropped, a low drop is a small, nearly
    /// integrable world at the bottom of the bowl and a drop from the middle is
    /// the whole lower half of the disc. Gravity, oddly, is *not* an energy
    /// control: rescaling time turns any g into 1, so the phase portrait at a
    /// given drop height does not depend on it at all.
    pub fn dropped(offset: f64, height: f64) -> Self {
        State { x: offset, y: height, vx: 0.0, vy: 0.0 }
    }

    pub fn speed(&self) -> f64 { (self.vx * self.vx + self.vy * self.vy).sqrt() }
    pub fn r(&self) -> f64 { (self.x * self.x + self.y * self.y).sqrt() }

    /// ½v² + gy. Conserved exactly when the bounces are elastic, and the
    /// sharpest check there is that the flight solver is right.
    pub fn energy(&self, p: &Params) -> f64 {
        0.5 * (self.vx * self.vx + self.vy * self.vy) + p.gravity * self.y
    }

    pub fn advance(&self, p: &Params, t: f64) -> State {
        State {
            x: self.x + self.vx * t,
            y: self.y + self.vy * t - 0.5 * p.gravity * t * t,
            vx: self.vx,
            vy: self.vy - p.gravity * t,
        }
    }
}

/// A bounce: where, when, and the state on either side of it.
#[derive(Clone, Copy, Debug)]
pub struct Bounce {
    pub t: f64,
    pub before: State,
    pub after: State,
}

// ------------------------------------------------------------------- roots --

/// Real roots of x³ + ax² + bx + c, returned smallest first.
///
/// Cardano with the trigonometric form for three real roots, which is the
/// numerically well-behaved branch and the one this problem lives in most of
/// the time.
pub fn cubic_roots(a: f64, b: f64, c: f64) -> ([f64; 3], usize) {
    let p = b - a * a / 3.0;
    let q = 2.0 * a * a * a / 27.0 - a * b / 3.0 + c;
    let shift = -a / 3.0;
    let disc = q * q / 4.0 + p * p * p / 27.0;
    let mut out = [0.0; 3];
    if disc > 0.0 {
        let s = disc.sqrt();
        let u = (-q / 2.0 + s).cbrt();
        let v = (-q / 2.0 - s).cbrt();
        out[0] = u + v + shift;
        ([out[0], 0.0, 0.0], 1)
    } else if p.abs() < 1e-300 {
        out[0] = shift;
        ([out[0], 0.0, 0.0], 1)
    } else {
        let m = 2.0 * (-p / 3.0).sqrt();
        let arg = (3.0 * q / (p * m)).clamp(-1.0, 1.0);
        let th = (arg.acos()) / 3.0;
        for k in 0..3 {
            out[k] = m * (th - 2.0 * PI * k as f64 / 3.0).cos() + shift;
        }
        out.sort_by(|x, y| x.partial_cmp(y).unwrap());
        (out, 3)
    }
}

/// The quartic |p(t)|² − R², as coefficients [c0, c1, c2, c3, c4].
fn flight_poly(p: &Params, s: &State) -> [f64; 5] {
    let g = p.gravity;
    [
        s.x * s.x + s.y * s.y - p.radius * p.radius,
        2.0 * (s.vx * s.x + s.vy * s.y),
        s.vx * s.vx + s.vy * s.vy - g * s.y,
        -g * s.vy,
        g * g / 4.0,
    ]
}

fn poly4(c: &[f64; 5], t: f64) -> f64 {
    (((c[4] * t + c[3]) * t + c[2]) * t + c[1]) * t + c[0]
}

/// Time to the next wall from a state **already on the wall**.
///
/// The constant term vanishes, so this is the smallest positive root of the
/// cubic c4t³ + c3t² + c2t + c1 — closed form, no stepping, no drift.
fn time_on_wall(p: &Params, s: &State) -> Option<f64> {
    let c = flight_poly(p, s);
    if c[4].abs() < 1e-300 {
        // no gravity: straight line, and the cubic degenerates to a linear one
        if c[2].abs() < 1e-300 { return None; }
        let t = -c[1] / c[2];
        return if t > 0.0 { Some(t) } else { None };
    }
    let (roots, n) = cubic_roots(c[3] / c[4], c[2] / c[4], c[1] / c[4]);
    let mut best = f64::INFINITY;
    for &r in roots.iter().take(n) {
        if r > 1e-12 && r < best { best = r; }
    }
    if best.is_finite() { Some(polish(&c, best)) } else { None }
}

/// Time to the wall from a state **inside** the circle.
///
/// Here the constant term is non-zero, so the critical points of the quartic
/// (the roots of its derivative cubic) are used to cut the line into intervals
/// on which it is monotonic, and the first sign change is bisected. Marching a
/// fixed step instead can jump clean over a brief excursion outside, which is
/// the one failure mode that silently corrupts a trajectory.
fn time_inside(p: &Params, s: &State) -> Option<f64> {
    let c = flight_poly(p, s);
    if c[4].abs() < 1e-300 { return None; }
    let (crit, ncrit) = cubic_roots(3.0 * c[3] / (4.0 * c[4]), 2.0 * c[2] / (4.0 * c[4]), c[1] / (4.0 * c[4]));
    let mut bounds = vec![0.0];
    for &r in crit.iter().take(ncrit) { if r > 0.0 { bounds.push(r); } }
    // the quartic opens upward, so it is above the wall eventually; this bound
    // is past the last turning point by a comfortable margin
    let far = bounds.last().copied().unwrap_or(0.0).max(1.0) * 4.0 + 16.0 * (1.0 + s.speed()) / p.gravity.max(1e-9);
    bounds.push(far);
    for w in bounds.windows(2) {
        let (a, b) = (w[0], w[1]);
        let (fa, fb) = (poly4(&c, a), poly4(&c, b));
        if fa <= 0.0 && fb >= 0.0 && b > a {
            let mut lo = a;
            let mut hi = b;
            for _ in 0..80 {
                let mid = 0.5 * (lo + hi);
                if poly4(&c, mid) <= 0.0 { lo = mid; } else { hi = mid; }
            }
            return Some(polish(&c, 0.5 * (lo + hi)));
        }
    }
    None
}

/// A couple of Newton steps on the original quartic. The closed forms above are
/// good to about 1e-12; this takes them to the last bit or two.
fn polish(c: &[f64; 5], t0: f64) -> f64 {
    let mut t = t0;
    for _ in 0..3 {
        let f = poly4(c, t);
        let d = ((4.0 * c[4] * t + 3.0 * c[3]) * t + 2.0 * c[2]) * t + c[1];
        if d.abs() < 1e-300 { break; }
        let step = f / d;
        if !step.is_finite() { break; }
        t -= step;
    }
    if t > 0.0 { t } else { t0 }
}

/// Specular reflection about the inward normal, with the normal component
/// scaled by the restitution. The position is snapped back onto the circle so
/// that the next flight can use the exact cubic.
fn reflect(p: &Params, s: &State) -> State {
    let r = s.r();
    if r < 1e-12 { return *s; }
    let (nx, ny) = (s.x / r, s.y / r);
    let vn = s.vx * nx + s.vy * ny;
    let e = p.restitution;
    State {
        x: nx * p.radius,
        y: ny * p.radius,
        vx: s.vx - (1.0 + e) * vn * nx,
        vy: s.vy - (1.0 + e) * vn * ny,
    }
}

// ------------------------------------------------------------------ flight --

/// Where the ball is `t` into its current flight, and when it hits.
pub struct Flight {
    pub start: State,
    pub duration: f64,
}

/// Set up the flight leaving `s`. `on_wall` says whether the ball is sitting on
/// the circle, which chooses the exact cubic over the bisected quartic.
pub fn flight(p: &Params, s: &State, on_wall: bool) -> Option<Flight> {
    let d = if on_wall { time_on_wall(p, s) } else { time_inside(p, s) }?;
    if !(d.is_finite() && d > 0.0) { return None; }
    Some(Flight { start: *s, duration: d })
}

/// Advance exactly `n` bounces, returning them in order.
pub fn bounces(p: &Params, from: State, on_wall: bool, n: usize) -> Vec<Bounce> {
    let mut out = Vec::with_capacity(n);
    let mut s = from;
    let mut wall = on_wall;
    let mut clock = 0.0;
    for _ in 0..n {
        let f = match flight(p, &s, wall) { Some(f) => f, None => break };
        let before = s.advance(p, f.duration);
        let after = reflect(p, &before);
        clock += f.duration;
        out.push(Bounce { t: clock, before, after });
        s = after;
        wall = true;
    }
    out
}

/// The angle of a point on the rim, measured anticlockwise from three o'clock.
pub fn rim_angle(s: &State) -> f64 { s.y.atan2(s.x) }

/// Shortest signed difference between two angles.
pub fn angle_delta(a: f64, b: f64) -> f64 {
    let mut d = (a - b) % (2.0 * PI);
    if d > PI { d -= 2.0 * PI; }
    if d < -PI { d += 2.0 * PI; }
    d
}
