//! 2D. A sketch is a set of closed loops on a plane; the region they bound is
//! even-odd (an outer loop with a loop inside it is a hole). Loops are made of
//! lines, circular arcs and cubic Béziers — exactly the curves every kernel in
//! the bake-off can carry exactly, so nothing here is approximated until a
//! kernel asks for a polyline.
//!
//! The involute gear lives here too, because a gear *is* a loop.

use serde::Serialize;
use std::f64::consts::PI;

pub type P2 = [f64; 2];

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "lowercase")]
pub enum Seg {
    Line { to: P2 },
    Arc { to: P2, via: P2 },
    Bezier { to: P2, ctrl: Vec<P2> },
}

impl Seg {
    pub fn end(&self) -> P2 {
        match self {
            Seg::Line { to } | Seg::Arc { to, .. } | Seg::Bezier { to, .. } => *to,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Loop {
    pub start: P2,
    pub segs: Vec<Seg>,
    /// Optional per-segment names (`tooth[3].flank.r`, `bore[0]`) used by
    /// the kernels to name the side faces an extrude makes from this loop.
    pub names: Vec<Option<String>>,
}

#[derive(Debug, Clone, Serialize, Default)]
pub struct Region {
    pub loops: Vec<Loop>,
}

fn sub(a: P2, b: P2) -> P2 { [a[0] - b[0], a[1] - b[1]] }
fn add(a: P2, b: P2) -> P2 { [a[0] + b[0], a[1] + b[1]] }
fn mul(a: P2, s: f64) -> P2 { [a[0] * s, a[1] * s] }
fn len(a: P2) -> f64 { (a[0] * a[0] + a[1] * a[1]).sqrt() }
fn near(a: P2, b: P2) -> bool { len(sub(a, b)) < 1e-9 }

/// Circle centre/radius from three points on it (the arc's from/via/to).
pub fn circle_through(a: P2, b: P2, c: P2) -> Option<(P2, f64)> {
    let d = 2.0 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if d.abs() < 1e-14 {
        return None;
    }
    let a2 = a[0] * a[0] + a[1] * a[1];
    let b2 = b[0] * b[0] + b[1] * b[1];
    let c2 = c[0] * c[0] + c[1] * c[1];
    let ux = (a2 * (b[1] - c[1]) + b2 * (c[1] - a[1]) + c2 * (a[1] - b[1])) / d;
    let uy = (a2 * (c[0] - b[0]) + b2 * (a[0] - c[0]) + c2 * (b[0] - a[0])) / d;
    Some(([ux, uy], len(sub(a, [ux, uy]))))
}

impl Loop {
    pub fn polygon(pts: &[P2]) -> Loop {
        let mut segs = Vec::new();
        for i in 1..pts.len() {
            segs.push(Seg::Line { to: pts[i] });
        }
        segs.push(Seg::Line { to: pts[0] });
        let n = segs.len();
        Loop { start: pts[0], segs, names: vec![None; n] }
    }

    pub fn rect(c: P2, w: f64, h: f64) -> Loop {
        let (x, y) = (c[0], c[1]);
        Loop::polygon(&[[x - w / 2.0, y - h / 2.0], [x + w / 2.0, y - h / 2.0], [x + w / 2.0, y + h / 2.0], [x - w / 2.0, y + h / 2.0]])
    }

    /// Four quarter arcs, counter-clockwise from +x.
    pub fn circle(c: P2, r: f64) -> Loop {
        let p = |a: f64| -> P2 { [c[0] + r * a.cos(), c[1] + r * a.sin()] };
        let segs = (0..4)
            .map(|i| {
                let a0 = i as f64 * PI / 2.0;
                Seg::Arc { to: p(a0 + PI / 2.0), via: p(a0 + PI / 4.0) }
            })
            .collect();
        Loop { start: p(0.0), segs, names: vec![None; 4] }
    }

    pub fn named(mut self, name: &str) -> Loop {
        for (i, n) in self.names.iter_mut().enumerate() {
            *n = Some(format!("{name}[{i}]"));
        }
        self
    }

    pub fn is_closed(&self) -> bool {
        match self.segs.last() {
            Some(s) => near(s.end(), self.start),
            None => false,
        }
    }

    pub fn reversed(&self) -> Loop {
        // Walk backwards: the reversed segment i goes from end(i) to start(i).
        let mut starts = vec![self.start];
        for s in &self.segs {
            starts.push(s.end());
        }
        let mut segs = Vec::new();
        let mut names = Vec::new();
        for i in (0..self.segs.len()).rev() {
            let to = starts[i];
            segs.push(match &self.segs[i] {
                Seg::Line { .. } => Seg::Line { to },
                Seg::Arc { via, .. } => Seg::Arc { to, via: *via },
                Seg::Bezier { ctrl, .. } => {
                    let mut c = ctrl.clone();
                    c.reverse();
                    Seg::Bezier { to, ctrl: c }
                }
            });
            names.push(self.names[i].clone());
        }
        Loop { start: starts[self.segs.len()], segs, names }
    }

    /// Polyline approximation. Arcs are split so the chord error is under
    /// `tol`; Béziers get `bez_n` pieces. Returns the closed ring without a
    /// repeated first point.
    pub fn sample(&self, tol: f64) -> Vec<P2> {
        let mut out = vec![self.start];
        let mut cur = self.start;
        for s in &self.segs {
            match s {
                Seg::Line { to } => out.push(*to),
                Seg::Arc { to, via } => {
                    if let Some((c, r)) = circle_through(cur, *via, *to) {
                        let a0 = (cur[1] - c[1]).atan2(cur[0] - c[0]);
                        let a1 = (via[1] - c[1]).atan2(via[0] - c[0]);
                        let a2 = (to[1] - c[1]).atan2(to[0] - c[0]);
                        // sweep from a0 through a1 to a2
                        let norm = |x: f64| -> f64 { let mut x = x % (2.0 * PI); if x < 0.0 { x += 2.0 * PI; } x };
                        let d01 = norm(a1 - a0);
                        let d02 = norm(a2 - a0);
                        let sweep = if d01 <= d02 { d02 } else { d02 - 2.0 * PI };
                        let n = ((sweep.abs() / (2.0 * (1.0 - tol / r).max(-1.0).min(1.0).acos())).ceil() as usize).max(2);
                        for i in 1..=n {
                            let a = a0 + sweep * i as f64 / n as f64;
                            out.push([c[0] + r * a.cos(), c[1] + r * a.sin()]);
                        }
                    } else {
                        out.push(*to);
                    }
                }
                Seg::Bezier { to, ctrl } => {
                    let mut pts = vec![cur];
                    pts.extend(ctrl.iter().cloned());
                    pts.push(*to);
                    let n = 12;
                    for i in 1..=n {
                        out.push(de_casteljau(&pts, i as f64 / n as f64));
                    }
                }
            }
            cur = s.end();
        }
        out.pop(); // closing point == start
        out
    }

    pub fn signed_area(&self) -> f64 {
        polygon_area(&self.sample(1e-3))
    }
}

pub fn de_casteljau(pts: &[P2], t: f64) -> P2 {
    let mut p = pts.to_vec();
    for k in 1..pts.len() {
        for i in 0..pts.len() - k {
            p[i] = add(mul(p[i], 1.0 - t), mul(p[i + 1], t));
        }
    }
    p[0]
}

pub fn polygon_area(ring: &[P2]) -> f64 {
    let n = ring.len();
    let mut a = 0.0;
    for i in 0..n {
        let p = ring[i];
        let q = ring[(i + 1) % n];
        a += p[0] * q[1] - q[0] * p[1];
    }
    a / 2.0
}

pub fn point_in_ring(pt: P2, ring: &[P2]) -> bool {
    let n = ring.len();
    let mut inside = false;
    let mut j = n - 1;
    for i in 0..n {
        let (pi, pj) = (ring[i], ring[j]);
        if (pi[1] > pt[1]) != (pj[1] > pt[1]) {
            let x = pj[0] + (pt[1] - pj[1]) * (pi[0] - pj[0]) / (pi[1] - pj[1]);
            if pt[0] < x {
                inside = !inside;
            }
        }
        j = i;
    }
    inside
}

impl Region {
    /// Even-odd nesting: loops at even depth are outer (made counter-clockwise),
    /// loops at odd depth are holes (made clockwise). Returns loops ordered so
    /// each outer loop is followed by its holes.
    pub fn oriented(&self) -> Result<Vec<Vec<Loop>>, String> {
        let rings: Vec<Vec<P2>> = self.loops.iter().map(|l| l.sample(1e-3)).collect();
        let n = rings.len();
        let mut depth = vec![0usize; n];
        let mut parent = vec![usize::MAX; n];
        for i in 0..n {
            for j in 0..n {
                if i != j && point_in_ring(rings[i][0], &rings[j]) {
                    depth[i] += 1;
                }
            }
        }
        for i in 0..n {
            if depth[i] % 2 == 1 {
                // parent = the containing loop with depth[i]-1
                for j in 0..n {
                    if i != j && depth[j] + 1 == depth[i] && point_in_ring(rings[i][0], &rings[j]) {
                        parent[i] = j;
                    }
                }
            }
        }
        let mut groups: Vec<Vec<Loop>> = Vec::new();
        let mut index_of = vec![usize::MAX; n];
        for i in 0..n {
            if depth[i] % 2 == 0 {
                let l = &self.loops[i];
                let l = if l.signed_area() < 0.0 { l.reversed() } else { l.clone() };
                index_of[i] = groups.len();
                groups.push(vec![l]);
            }
        }
        for i in 0..n {
            if depth[i] % 2 == 1 {
                let l = &self.loops[i];
                let l = if l.signed_area() > 0.0 { l.reversed() } else { l.clone() };
                let p = parent[i];
                if p == usize::MAX {
                    return Err("hole loop with no outer loop".into());
                }
                groups[index_of[p]].push(l);
            }
        }
        if groups.is_empty() {
            return Err("region has no outer loop".into());
        }
        Ok(groups)
    }

    /// Area of the even-odd region.
    pub fn area(&self) -> f64 {
        self.loops.iter().map(|l| l.signed_area().abs()).enumerate().fold(0.0, |acc, (i, a)| {
            let inner = self.loops.iter().enumerate().filter(|(j, o)| *j != i && point_in_ring(self.loops[i].sample(1e-3)[0], &o.sample(1e-3))).count();
            if inner % 2 == 0 { acc + a } else { acc - a }
        })
    }

    pub fn transformed(&self, f: &dyn Fn(P2) -> P2) -> Region {
        let map_seg = |s: &Seg| match s {
            Seg::Line { to } => Seg::Line { to: f(*to) },
            Seg::Arc { to, via } => Seg::Arc { to: f(*to), via: f(*via) },
            Seg::Bezier { to, ctrl } => Seg::Bezier { to: f(*to), ctrl: ctrl.iter().map(|p| f(*p)).collect() },
        };
        Region {
            loops: self
                .loops
                .iter()
                .map(|l| Loop { start: f(l.start), segs: l.segs.iter().map(map_seg).collect(), names: l.names.clone() })
                .collect(),
        }
    }
}

/// Fit one cubic Bézier through four points with chord-length parameters.
/// Uniform parameters fold the curve into a micro-loop wherever the source
/// curve's speed vanishes (an involute at its base circle does exactly that);
/// chord-length parameters keep the fit monotone.
fn cubic_through(p0: P2, p1: P2, p2: P2, p3: P2) -> (P2, P2) {
    let d1 = len(sub(p1, p0));
    let d2 = len(sub(p2, p1));
    let d3 = len(sub(p3, p2));
    let total = (d1 + d2 + d3).max(1e-300);
    let u1 = d1 / total;
    let u2 = (d1 + d2) / total;
    // B(u) = (1-u)^3 P0 + 3(1-u)^2 u C1 + 3(1-u) u^2 C2 + u^3 P3
    let basis = |u: f64| -> (f64, f64, f64, f64) {
        let v = 1.0 - u;
        (v * v * v, 3.0 * v * v * u, 3.0 * v * u * u, u * u * u)
    };
    let (a0, a1, a2, a3) = basis(u1);
    let (b0, b1, b2, b3) = basis(u2);
    let det = a1 * b2 - a2 * b1;
    let mut c1 = [0.0; 2];
    let mut c2 = [0.0; 2];
    for i in 0..2 {
        let r1 = p1[i] - a0 * p0[i] - a3 * p3[i];
        let r2 = p2[i] - b0 * p0[i] - b3 * p3[i];
        c1[i] = (r1 * b2 - r2 * a2) / det;
        c2[i] = (a1 * r2 - b1 * r1) / det;
    }
    (c1, c2)
}

/// Catmull–Rom through `pts` as cubic Béziers, one per span. `closed` wraps
/// around (a periodic spline); open splines clamp the end tangents. Tension
/// 0.5 is the classic Catmull–Rom; 0 is straight lines.
pub fn spline_segs(pts: &[P2], tension: f64, closed: bool) -> Vec<Seg> {
    let n = pts.len();
    if n < 2 {
        return Vec::new();
    }
    let at = |i: isize| -> P2 {
        if closed {
            pts[((i % n as isize) + n as isize) as usize % n]
        } else {
            pts[i.clamp(0, n as isize - 1) as usize]
        }
    };
    let spans = if closed { n } else { n - 1 };
    let k = tension / 3.0; // Catmull–Rom tangent (p[i+1]-p[i-1])/2 scaled into Bézier handles
    (0..spans)
        .map(|i| {
            let i = i as isize;
            let (p0, p1, p2, p3) = (at(i - 1), at(i), at(i + 1), at(i + 2));
            let c1 = [p1[0] + (p2[0] - p0[0]) * k, p1[1] + (p2[1] - p0[1]) * k];
            let c2 = [p2[0] - (p3[0] - p1[0]) * k, p2[1] - (p3[1] - p1[1]) * k];
            Seg::Bezier { to: p2, ctrl: vec![c1, c2] }
        })
        .collect()
}

/// A closed smooth loop through points, one Bézier per span, named `span[i]`.
pub fn spline_loop(pts: &[P2], tension: f64) -> Loop {
    let segs = spline_segs(pts, tension, true);
    let names = (0..segs.len()).map(|i| Some(format!("span[{i}]"))).collect();
    Loop { start: pts[0], segs, names }
}

/// Standard spur gear parameters, all derived from module `m`, tooth count `z`
/// and pressure angle `alpha` (degrees). ISO 53 basic rack: addendum m,
/// dedendum 1.25 m.
#[derive(Debug, Clone, Serialize)]
pub struct GearSpec {
    pub m: f64,
    pub z: u32,
    pub alpha_deg: f64,
    pub r_pitch: f64,
    pub r_base: f64,
    pub r_tip: f64,
    pub r_root: f64,
}

impl GearSpec {
    pub fn new(m: f64, z: u32, alpha_deg: f64) -> GearSpec {
        let r_pitch = m * z as f64 / 2.0;
        GearSpec {
            m,
            z,
            alpha_deg,
            r_pitch,
            r_base: r_pitch * alpha_deg.to_radians().cos(),
            r_tip: r_pitch + m,
            r_root: r_pitch - 1.25 * m,
        }
    }
}

fn inv(a: f64) -> f64 { a.tan() - a }

/// The tooth outline as one loop, counter-clockwise, centred on the origin,
/// tooth 0 centred on +x. Each flank is two cubic Béziers fitted to the exact
/// involute; tips and roots are true circular arcs. If the root circle is
/// inside the base circle the flank continues radially to the root (no
/// undercut modelling — this is a clock gear, not a hobbed one).
///
/// Segment names: `tooth[i].flank.r`, `tooth[i].flank.l` (three segs each,
/// suffixed `.0/.1/.2`), `tooth[i].tip`, `root[i]`, and `tooth[i].radial.r/l`.
pub fn gear_loop(spec: &GearSpec) -> Loop {
    let z = spec.z as usize;
    let rb = spec.r_base;
    let ra = spec.r_tip;
    let rf = spec.r_root;
    let alpha = spec.alpha_deg.to_radians();
    let half_pitch = PI / (2.0 * z as f64); // half tooth angular thickness at pitch
    // angular offset of the right flank from the tooth centre at radius r
    let phi = |r: f64| -> f64 {
        let a_r = (rb / r).min(1.0).acos();
        half_pitch + inv(alpha) - inv(a_r)
    };
    let r_lo = rb.max(rf);
    let polar = |r: f64, th: f64| -> P2 { [r * th.cos(), r * th.sin()] };
    // sample the involute in its natural parameter t (r = rb*sqrt(1+t^2))
    let t_of = |r: f64| -> f64 { ((r / rb).powi(2) - 1.0).max(0.0).sqrt() };
    let (t0, t1) = (t_of(r_lo), t_of(ra));
    let r_of_t = |t: f64| -> f64 { rb * (1.0 + t * t).sqrt() };

    let mut start: Option<P2> = None;
    let mut segs: Vec<Seg> = Vec::new();
    let mut names: Vec<Option<String>> = Vec::new();
    let mut push = |s: Seg, n: String| {
        segs.push(s);
        names.push(Some(n));
    };

    for k in 0..z {
        let thc = 2.0 * PI * k as f64 / z as f64;
        // right flank: rising from r_lo to ra at angle thc - phi(r)
        let pr = |t: f64| -> P2 { let r = r_of_t(t); polar(r, thc - phi(r)) };
        let pl = |t: f64| -> P2 { let r = r_of_t(t); polar(r, thc + phi(r)) };
        let p_root_r = polar(rf, thc - phi(r_lo));
        if start.is_none() {
            start = Some(p_root_r);
        }
        if rf < rb - 1e-12 {
            push(Seg::Line { to: pr(t0) }, format!("tooth[{k}].radial.r"));
        }
        const SPLIT: [f64; 4] = [0.0, 0.2, 0.5, 1.0];
        for piece in 0..3 {
            let ta = t0 + (t1 - t0) * SPLIT[piece];
            let tb = t0 + (t1 - t0) * SPLIT[piece + 1];
            let f = |u: f64| pr(ta + (tb - ta) * u);
            let (c1, c2) = cubic_through(f(0.0), f(1.0 / 3.0), f(2.0 / 3.0), f(1.0));
            push(Seg::Bezier { to: f(1.0), ctrl: vec![c1, c2] }, format!("tooth[{k}].flank.r.{piece}"));
        }
        // tip arc through the tooth centre
        push(Seg::Arc { to: pl(t1), via: polar(ra, thc) }, format!("tooth[{k}].tip"));
        // left flank descending
        for piece in 0..3 {
            let ta = t1 - (t1 - t0) * (1.0 - SPLIT[3 - piece]);
            let tb = t1 - (t1 - t0) * (1.0 - SPLIT[2 - piece]);
            let f = |u: f64| pl(ta + (tb - ta) * u);
            let (c1, c2) = cubic_through(f(0.0), f(1.0 / 3.0), f(2.0 / 3.0), f(1.0));
            push(Seg::Bezier { to: f(1.0), ctrl: vec![c1, c2] }, format!("tooth[{k}].flank.l.{piece}"));
        }
        let p_root_l = polar(rf, thc + phi(r_lo));
        if rf < rb - 1e-12 {
            push(Seg::Line { to: p_root_l }, format!("tooth[{k}].radial.l"));
        }
        // root arc to the next tooth's right root point
        let th_next = 2.0 * PI * (k + 1) as f64 / z as f64;
        let p_next = polar(rf, th_next - phi(r_lo));
        let mid = (thc + phi(r_lo) + th_next - phi(r_lo)) / 2.0;
        let to = if k + 1 == z { start.unwrap() } else { p_next };
        push(Seg::Arc { to, via: polar(rf, mid) }, format!("root[{k}]"));
    }
    Loop { start: start.unwrap(), segs, names }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn circle_area() {
        let c = Loop::circle([0.0, 0.0], 2.0);
        assert!((c.signed_area() - 4.0 * PI).abs() < 4.0 * PI * 1e-3);
        assert!(c.is_closed());
        assert!(c.reversed().signed_area() < 0.0);
    }
    #[test]
    fn gear_closed_and_between_root_and_tip() {
        let s = GearSpec::new(1.0, 20, 20.0);
        let g = gear_loop(&s);
        assert!(g.is_closed());
        let a = g.signed_area();
        assert!(a > PI * s.r_root.powi(2) && a < PI * s.r_tip.powi(2), "area {a}");
        // a gear's area is close to the pitch circle's
        assert!((a - PI * s.r_pitch.powi(2)).abs() / (PI * s.r_pitch.powi(2)) < 0.05);
    }
    #[test]
    fn nesting() {
        let r = Region { loops: vec![Loop::circle([0.0, 0.0], 1.0), Loop::circle([0.0, 0.0], 3.0)] };
        let g = r.oriented().unwrap();
        assert_eq!(g.len(), 1);
        assert_eq!(g[0].len(), 2);
        assert!(g[0][0].signed_area() > 0.0);
        assert!(g[0][1].signed_area() < 0.0);
        assert!((r.area() - 8.0 * PI).abs() < 0.1);
    }
}
