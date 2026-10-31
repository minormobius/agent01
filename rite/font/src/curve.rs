//! Centerline geometry: a tiny 2D vector, cubic Béziers, and a Metafont-style
//! path builder whose curves are shaped by **Hobby's algorithm** — you give a
//! knot its position and (optionally) the direction the pen travels through it,
//! and the control points are chosen for the most "natural" curve between them.
//! That is how METAFONT draws Computer Modern, and it's why a skeleton written
//! as a handful of points-with-directions comes out as a good letter.

use std::f64::consts::PI;
use std::ops::{Add, Mul, Neg, Sub};

#[derive(Clone, Copy, Debug, PartialEq, Default)]
pub struct V {
    pub x: f64,
    pub y: f64,
}

pub const fn v(x: f64, y: f64) -> V {
    V { x, y }
}

impl Add for V {
    type Output = V;
    fn add(self, o: V) -> V {
        v(self.x + o.x, self.y + o.y)
    }
}
impl Sub for V {
    type Output = V;
    fn sub(self, o: V) -> V {
        v(self.x - o.x, self.y - o.y)
    }
}
impl Mul<f64> for V {
    type Output = V;
    fn mul(self, k: f64) -> V {
        v(self.x * k, self.y * k)
    }
}
impl Neg for V {
    type Output = V;
    fn neg(self) -> V {
        v(-self.x, -self.y)
    }
}

impl V {
    pub fn len(self) -> f64 {
        self.x.hypot(self.y)
    }
    pub fn norm(self) -> V {
        let l = self.len();
        if l < 1e-12 {
            v(1.0, 0.0)
        } else {
            self * (1.0 / l)
        }
    }
    pub fn dot(self, o: V) -> f64 {
        self.x * o.x + self.y * o.y
    }
    pub fn cross(self, o: V) -> f64 {
        self.x * o.y - self.y * o.x
    }
    /// Rotate 90° counter-clockwise (the left normal of a tangent).
    pub fn perp(self) -> V {
        v(-self.y, self.x)
    }
    pub fn angle(self) -> f64 {
        self.y.atan2(self.x)
    }
    pub fn lerp(self, o: V, t: f64) -> V {
        self + (o - self) * t
    }
    pub fn rot(self, a: f64) -> V {
        let (s, c) = a.sin_cos();
        v(self.x * c - self.y * s, self.x * s + self.y * c)
    }
}


pub const RIGHT: V = v(1.0, 0.0);
pub const LEFT: V = v(-1.0, 0.0);
pub const UP: V = v(0.0, 1.0);
pub const DOWN: V = v(0.0, -1.0);

/// One cubic segment of a centerline, carrying the pen-width multiplier at each
/// end (so a stroke can swell or taper along its length).
#[derive(Clone, Copy, Debug)]
pub struct Cubic {
    pub p0: V,
    pub c1: V,
    pub c2: V,
    pub p3: V,
    pub w0: f64,
    pub w1: f64,
}

impl Cubic {
    pub fn line(a: V, b: V, w0: f64, w1: f64) -> Cubic {
        Cubic {
            p0: a,
            c1: a.lerp(b, 1.0 / 3.0),
            c2: a.lerp(b, 2.0 / 3.0),
            p3: b,
            w0,
            w1,
        }
    }
    pub fn at(&self, t: f64) -> V {
        let u = 1.0 - t;
        self.p0 * (u * u * u) + self.c1 * (3.0 * u * u * t) + self.c2 * (3.0 * u * t * t)
            + self.p3 * (t * t * t)
    }
    pub fn deriv(&self, t: f64) -> V {
        let u = 1.0 - t;
        let d = (self.c1 - self.p0) * (3.0 * u * u)
            + (self.c2 - self.c1) * (6.0 * u * t)
            + (self.p3 - self.c2) * (3.0 * t * t);
        if d.len() < 1e-9 {
            // degenerate control (coincident with an end) — fall back to chord
            let e = if t < 0.5 { self.c2 - self.p0 } else { self.p3 - self.c1 };
            if e.len() < 1e-9 {
                self.p3 - self.p0
            } else {
                e
            }
        } else {
            d
        }
    }
    pub fn start_dir(&self) -> V {
        self.deriv(0.0).norm()
    }
    pub fn end_dir(&self) -> V {
        self.deriv(1.0).norm()
    }
    /// Rough arc length (control polygon / chord average) for sampling density.
    pub fn approx_len(&self) -> f64 {
        let poly = (self.c1 - self.p0).len() + (self.c2 - self.c1).len() + (self.p3 - self.c2).len();
        let chord = (self.p3 - self.p0).len();
        (poly + chord) / 2.0
    }
    /// Total turning (radians) — sampling density for curvy segments.
    pub fn turning(&self) -> f64 {
        let a = self.deriv(0.0).angle();
        let m = self.deriv(0.5).angle();
        let b = self.deriv(1.0).angle();
        wrap(m - a).abs() + wrap(b - m).abs()
    }
}

pub fn wrap(mut a: f64) -> f64 {
    while a > PI {
        a -= 2.0 * PI;
    }
    while a < -PI {
        a += 2.0 * PI;
    }
    a
}

/// Hobby's velocity function (METAFONT's `f(θ,φ)`), the heart of "natural"
/// control-point placement.
fn hobby_vel(theta: f64, phi: f64) -> f64 {
    let (st, ct) = theta.sin_cos();
    let (sp, cp) = phi.sin_cos();
    let s5 = 5f64.sqrt();
    let num = 2.0 + 2f64.sqrt() * (st - sp / 16.0) * (sp - st / 16.0) * (ct - cp);
    let den = 1.0 + 0.5 * (s5 - 1.0) * ct + 0.5 * (3.0 - s5) * cp;
    num / den
}

/// Cubic from `a` (leaving in direction `da`) to `b` (arriving in direction
/// `db`), controls by Hobby. `tension` ≥ 0.75; 1 is METAFONT's default, higher
/// is tauter (flatter, squarer curves).
pub fn hobby(a: V, da: V, b: V, db: V, tension: f64, w0: f64, w1: f64) -> Cubic {
    let d = b - a;
    let dl = d.len();
    if dl < 1e-9 {
        return Cubic::line(a, b, w0, w1);
    }
    let da = da.norm();
    let db = db.norm();
    let theta = wrap(da.angle() - d.angle());
    let phi = wrap(d.angle() - db.angle());
    let mut r = hobby_vel(theta, phi) / (3.0 * tension);
    let mut s = hobby_vel(phi, theta) / (3.0 * tension);
    // METAFONT's "bounded" safeguard: don't let a control shoot past the other
    // tangent line, which is what makes loops/cusps.
    r = r.clamp(0.0, 1.2);
    s = s.clamp(0.0, 1.2);
    Cubic {
        p0: a,
        c1: a + da * (r * dl),
        c2: b - db * (s * dl),
        p3: b,
        w0,
        w1,
    }
}

/// A knot on a centerline.
#[derive(Clone, Copy, Debug)]
pub struct Knot {
    pub p: V,
    pub din: Option<V>,  // travel direction arriving here
    pub dout: Option<V>, // travel direction leaving here
    pub w: f64,          // pen-width multiplier at this knot
    pub line_next: bool, // the segment leaving this knot is straight
    pub tension: f64,    // tension of the segment leaving this knot
}

/// Builder for one open or closed centerline. `.to(p, dir)` adds a smooth knot
/// with a travel direction; `.line(p)` a straight segment.
#[derive(Clone, Debug)]
pub struct PathB {
    pub knots: Vec<Knot>,
    pub closed: bool,
    tension: f64,
}

pub fn path(p: V) -> PathB {
    PathB {
        knots: vec![Knot { p, din: None, dout: None, w: 1.0, line_next: false, tension: 1.0 }],
        closed: false,
        tension: 1.0,
    }
}

pub fn path_d(p: V, d: V) -> PathB {
    let mut b = path(p);
    b.knots[0].din = Some(d);
    b.knots[0].dout = Some(d);
    b
}

impl PathB {
    /// Tension for subsequent segments.
    pub fn tension(mut self, t: f64) -> Self {
        self.tension = t.max(0.75);
        if let Some(k) = self.knots.last_mut() {
            k.tension = self.tension;
        }
        self
    }
    fn push(mut self, p: V, din: Option<V>, dout: Option<V>) -> Self {
        let t = self.tension;
        self.knots.push(Knot { p, din, dout, w: 1.0, line_next: false, tension: t });
        self
    }
    /// Smooth knot with a travel direction.
    pub fn to(self, p: V, d: V) -> Self {
        self.push(p, Some(d), Some(d))
    }
    /// Straight segment to `p`.
    pub fn line(mut self, p: V) -> Self {
        if let Some(k) = self.knots.last_mut() {
            k.line_next = true;
        }
        self.push(p, None, None)
    }
    /// Pen-width multiplier at the last knot.
    pub fn w(mut self, w: f64) -> Self {
        if let Some(k) = self.knots.last_mut() {
            k.w = w;
        }
        self
    }
    /// Continue with another path's knots (its first knot is dropped when it
    /// coincides with our last one — the join takes the incoming direction of
    /// ours and the outgoing direction of theirs).
    pub fn then(mut self, o: PathB) -> Self {
        let mut ks = o.knots.into_iter();
        if let (Some(last), Some(first)) = (self.knots.last_mut(), ks.next()) {
            if (last.p - first.p).len() < 0.5 {
                last.dout = first.dout.or(last.dout);
                if last.din.is_none() {
                    last.din = first.din;
                }
                last.line_next = first.line_next;
                last.tension = first.tension;
            } else {
                self.knots.push(first);
            }
        }
        self.knots.extend(ks);
        self
    }
    pub fn close(mut self) -> Self {
        self.closed = true;
        self
    }

    /// Resolve into cubic segments.
    pub fn cubics(&self) -> Vec<Cubic> {
        let n = self.knots.len();
        let segn = if self.closed { n } else { n - 1 };
        let k = &self.knots;
        // direction inference for knots without one
        let mut dout: Vec<V> = Vec::with_capacity(n);
        let mut din: Vec<V> = Vec::with_capacity(n);
        for i in 0..n {
            let prev = if i > 0 { Some(k[i - 1].p) } else if self.closed { Some(k[n - 1].p) } else { None };
            let next = if i + 1 < n { Some(k[i + 1].p) } else if self.closed { Some(k[0].p) } else { None };
            let lin_in = if i > 0 { k[i - 1].line_next } else if self.closed { k[n - 1].line_next } else { false };
            let lin_out = k[i].line_next;
            let est = match (prev, next) {
                (Some(a), Some(b)) => (b - a).norm(),
                (None, Some(b)) => (b - k[i].p).norm(),
                (Some(a), None) => (k[i].p - a).norm(),
                _ => RIGHT,
            };
            let o = if lin_out { next.map(|b| (b - k[i].p).norm()).unwrap_or(est) } else { k[i].dout.unwrap_or(est) };
            let ii = if lin_in { prev.map(|a| (k[i].p - a).norm()).unwrap_or(est) } else { k[i].din.unwrap_or(est) };
            // a curve next to a line inherits the line's direction when unspecified
            let o = if !lin_out && k[i].dout.is_none() && lin_in { ii } else { o };
            let ii = if !lin_in && k[i].din.is_none() && lin_out { o } else { ii };
            dout.push(o);
            din.push(ii);
        }
        let mut out = Vec::with_capacity(segn);
        for i in 0..segn {
            let j = (i + 1) % n;
            let (a, b) = (&k[i], &k[j]);
            if a.line_next {
                out.push(Cubic::line(a.p, b.p, a.w, b.w));
            } else {
                out.push(hobby(a.p, dout[i], b.p, din[j], a.tension, a.w, b.w));
            }
        }
        out
    }
}


