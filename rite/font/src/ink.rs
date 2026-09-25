//! Ink: turning centerlines into clean TrueType outlines.
//!
//! 1. **Pen sweep.** A stroke is a centerline swept by a *superellipse nib*
//!    (the pen). Where the old engine stamped rectangles and left them
//!    overlapping, here the envelope is traced exactly: at each sample the ink
//!    edge is the nib's *support point* in the normal direction. An ellipse nib
//!    tilted 30° is a broad-edged pen (humanist stress); level, it's a pointed
//!    pen (Didone stress); round, it's a monoline (geometric sans). Squarer
//!    exponents give the crisp corners of a real chisel nib.
//! 2. **Terminals.** Each open end is capped: the nib's own shape, a round cap,
//!    or a straight *cut* at any angle (horizontal for a grotesque `c`, vertical
//!    for a humanist one). Cuts are real booleans against a local box, so the
//!    terminal is exactly flat.
//! 3. **Union.** All strokes, serifs, dots and balls are unioned (non-zero) with
//!    `i_overlay` into a handful of overlap-free contours.
//! 4. **Refit.** The dense polygon is split at corners and extrema and refitted
//!    with quadratic Béziers — TrueType's native curve — within a fraction of a
//!    font unit. Small files, smooth curves, on-curve extrema.

use crate::curve::{v, Cubic, V};
use crate::geom::Pt;
use i_overlay::core::fill_rule::FillRule;
use i_overlay::core::overlay_rule::OverlayRule;
use i_overlay::float::single::SingleFloatOverlay;
use std::f64::consts::TAU;

/// The writing tool. `l`/`s` are the half-extents of the nib along its long and
/// short axes, `ang` the long axis' angle (radians), `p` the superellipse
/// exponent (2 = ellipse, higher = squarer).
#[derive(Clone, Copy, Debug)]
pub struct Pen {
    pub l: f64,
    pub s: f64,
    pub ang: f64,
    pub p: f64,
}

impl Pen {
    /// A pen whose *vertical stem* comes out exactly `stem` wide, with thin/thick
    /// ratio `ratio` (1 = monoline), long axis at `ang_deg`, exponent `p`.
    pub fn for_stem(stem: f64, ratio: f64, ang_deg: f64, p: f64) -> Pen {
        let ang = ang_deg.to_radians();
        let ratio = ratio.clamp(0.02, 1.0);
        let unit = Pen { l: 1.0, s: ratio, ang, p };
        let h = unit.half_width(v(1.0, 0.0));
        Pen { l: stem / 2.0 / h, s: stem / 2.0 / h * ratio, ang, p }
    }

    pub fn circle(r: f64) -> Pen {
        Pen { l: r, s: r, ang: 0.0, p: 2.0 }
    }

    pub fn scaled(&self, k: f64) -> Pen {
        Pen { l: self.l * k, s: self.s * k, ..*self }
    }

    fn q(&self) -> f64 {
        self.p / (self.p - 1.0)
    }

    /// Support point (offset from the centre) for unit normal `n`.
    pub fn support(&self, n: V) -> V {
        let loc = n.rot(-self.ang);
        let q = self.q();
        let ax = (self.l * loc.x).abs();
        let ay = (self.s * loc.y).abs();
        let h = (ax.powf(q) + ay.powf(q)).powf(1.0 / q).max(1e-9);
        let ux = self.l * loc.x.signum() * (ax / h).powf(q - 1.0);
        let uy = self.s * loc.y.signum() * (ay / h).powf(q - 1.0);
        v(ux, uy).rot(self.ang)
    }

    /// Half the ink width across a stroke whose normal is `n`.
    pub fn half_width(&self, n: V) -> f64 {
        self.support(n.norm()).dot(n.norm())
    }

    /// The nib outline as a polygon centred on `c`.
    pub fn outline(&self, c: V, k: f64) -> Vec<V> {
        let n = 40;
        (0..n)
            .map(|i| {
                let t = i as f64 / n as f64 * TAU;
                let (s, co) = t.sin_cos();
                let e = 2.0 / self.p;
                let x = self.l * co.signum() * co.abs().powf(e);
                let y = self.s * s.signum() * s.abs().powf(e);
                c + v(x, y).rot(self.ang) * k
            })
            .collect()
    }
}

/// How an open stroke ends.
#[derive(Clone, Copy, Debug)]
pub enum Cap {
    /// The nib's own shape (calligraphic).
    Pen,
    /// A half-disc of the stroke's width (rounded sans).
    Round,
    /// A straight cut along the given line direction, through the end point.
    Cut(V),
    /// Cut perpendicular to the stroke.
    Square,
    /// No extension: the end is the nib edge (use where it's buried in ink).
    Butt,
}

#[derive(Clone, Debug)]
pub struct Stroke {
    pub segs: Vec<Cubic>,
    pub closed: bool,
    pub pen: Pen,
    pub cap0: Cap,
    pub cap1: Cap,
}

type Poly = Vec<[f64; 2]>;

fn to_poly(pts: &[V]) -> Poly {
    pts.iter().map(|p| [p.x, p.y]).collect()
}

fn hull(mut pts: Vec<V>) -> Vec<V> {
    pts.sort_by(|a, b| a.x.partial_cmp(&b.x).unwrap().then(a.y.partial_cmp(&b.y).unwrap()));
    pts.dedup_by(|a, b| (a.x - b.x).abs() < 1e-7 && (a.y - b.y).abs() < 1e-7);
    if pts.len() < 3 {
        return pts;
    }
    let cross = |o: V, a: V, b: V| (a - o).cross(b - o);
    let mut h: Vec<V> = Vec::new();
    for &p in &pts {
        while h.len() >= 2 && cross(h[h.len() - 2], h[h.len() - 1], p) <= 0.0 {
            h.pop();
        }
        h.push(p);
    }
    let lo = h.len() + 1;
    for &p in pts.iter().rev() {
        while h.len() >= lo && cross(h[h.len() - 2], h[h.len() - 1], p) <= 0.0 {
            h.pop();
        }
        h.push(p);
    }
    h.pop();
    h
}

fn area(p: &[V]) -> f64 {
    let n = p.len();
    let mut a = 0.0;
    for i in 0..n {
        a += p[i].cross(p[(i + 1) % n]);
    }
    a / 2.0
}

fn ccw(mut p: Vec<V>) -> Vec<V> {
    if area(&p) < 0.0 {
        p.reverse();
    }
    p
}

struct Sample {
    c: V,
    t: V,
    w: f64,
}

fn sample_seg(c: &Cubic, out: &mut Vec<Sample>, skip_first: bool) {
    let n = ((c.approx_len() / 7.0).max(c.turning().to_degrees() / 2.5)).ceil().clamp(2.0, 400.0) as usize;
    for i in 0..=n {
        if i == 0 && skip_first {
            continue;
        }
        let t = i as f64 / n as f64;
        out.push(Sample { c: c.at(t), t: c.deriv(t).norm(), w: c.w0 + (c.w1 - c.w0) * t });
    }
}

impl Stroke {
    /// Filled region of this stroke as i_overlay shapes (outer CCW, holes CW).
    fn shapes(&self) -> Vec<Vec<Poly>> {
        let pen = &self.pen;
        let mut polys: Vec<Poly> = Vec::new();
        // walk segments, detecting corners
        let mut prev_end: Option<(V, V, f64)> = None; // (point, dir, w)
        let mut all: Vec<Sample> = Vec::new();
        for (si, seg) in self.segs.iter().enumerate() {
            let mut ss = Vec::new();
            sample_seg(seg, &mut ss, false);
            if let Some((p, d, w)) = prev_end {
                let d2 = seg.start_dir();
                if d.cross(d2).abs() > 0.02 || d.dot(d2) < 0.0 {
                    polys.push(to_poly(&ccw(pen.outline(p, w))));
                }
            }
            for i in 1..ss.len() {
                let (a, b) = (&ss[i - 1], &ss[i]);
                let pa = pen.scaled(a.w);
                let pb = pen.scaled(b.w);
                let na = a.t.perp();
                let nb = b.t.perp();
                let sa = pa.support(na);
                let sb = pb.support(nb);
                let h = hull(vec![a.c + sa, a.c - sa, b.c + sb, b.c - sb]);
                if h.len() >= 3 {
                    polys.push(to_poly(&h));
                }
            }
            prev_end = Some((seg.p3, seg.end_dir(), seg.w1));
            let _ = si;
            all.extend(ss);
        }
        if self.closed {
            if let (Some((p, d, w)), Some(first)) = (prev_end, self.segs.first()) {
                let d2 = first.start_dir();
                if d.cross(d2).abs() > 0.02 || d.dot(d2) < 0.0 {
                    polys.push(to_poly(&ccw(pen.outline(p, w))));
                }
            }
        }
        let mut cuts: Vec<Poly> = Vec::new();
        if !self.closed && !all.is_empty() {
            let first = &all[0];
            let last = &all[all.len() - 1];
            for (s, outward, cap) in [
                (first, -first.t, self.cap0),
                (last, last.t, self.cap1),
            ] {
                let pw = pen.scaled(s.w);
                match cap {
                    Cap::Butt => {}
                    Cap::Pen => polys.push(to_poly(&ccw(pw.outline(s.c, 1.0)))),
                    Cap::Round => {
                        let r = pw.half_width(outward.perp());
                        polys.push(to_poly(&ccw(Pen::circle(r).outline(s.c, 1.0))));
                    }
                    Cap::Cut(_) | Cap::Square => {
                        let mut d = match cap {
                            Cap::Square => outward.perp(),
                            Cap::Cut(d) => d.norm(),
                            _ => unreachable!(),
                        };
                        // a cut running nearly along the stroke is degenerate:
                        // lean it toward square instead
                        if d.cross(outward).abs() < 0.5 {
                            let sq = outward.perp();
                            let sq = if sq.dot(d) < 0.0 { -sq } else { sq };
                            d = (d + sq * 1.4).norm();
                        }
                        // extend past the end along the tangent...
                        let n = outward.perp();
                        let sp = pw.support(n);
                        let hw = sp.dot(n).abs().max(1.0);
                        let sin = d.cross(outward).abs().max(0.3);
                        let lat = (hw * 1.3 + sp.len() * 0.3) / sin;
                        let ext = lat * 1.2 + hw;
                        let e = s.c + outward * ext;
                        let h = hull(vec![s.c + sp, s.c - sp, e + sp, e - sp]);
                        polys.push(to_poly(&h));
                        // ...then cut back to the line through the end point: the
                        // box hugs the stroke (sides along D and the tangent).
                        // reach past everything the extension and the nib itself
                        // (a flat nib reaches far along the stroke) could ink
                        let far = ext + sp.len() + pw.l.max(pw.s) + hw * 2.0 + 2.0;
                        let bx = vec![
                            s.c + d * lat,
                            s.c - d * lat,
                            s.c - d * lat + outward * far,
                            s.c + d * lat + outward * far,
                        ];
                        cuts.push(to_poly(&ccw(bx)));
                    }
                }
            }
        }
        if cuts.is_empty() {
            polys.overlay(&Vec::<Poly>::new(), OverlayRule::Subject, FillRule::NonZero)
        } else {
            polys.overlay(&cuts, OverlayRule::Difference, FillRule::NonZero)
        }
    }
}

/// Everything that goes into one glyph before it's unioned and refitted.
#[derive(Default)]
pub struct Ink {
    pub strokes: Vec<Stroke>,
    pub fills: Vec<Vec<V>>,  // solid polygons (any winding)
    pub holes: Vec<Vec<V>>,  // polygons subtracted from the final union
    pub pre: Vec<Vec<V>>,    // already-unioned contours (orientation kept)
}

impl Ink {
    pub fn stroke(&mut self, s: Stroke) {
        self.strokes.push(s);
    }
    pub fn fill(&mut self, p: Vec<V>) {
        if p.len() >= 3 {
            self.fills.push(p);
        }
    }
    /// Bake this ink (holes applied) into a fresh one as pre-unioned contours,
    /// shifted by `d` — for composing glyphs from glyphs.
    pub fn baked(&self, d: V) -> Ink {
        let mut out = Ink::default();
        for p in self.polygons() {
            out.pre.push(p.into_iter().map(|q| q + d).collect());
        }
        out
    }
    pub fn absorb(&mut self, o: Ink) {
        self.strokes.extend(o.strokes);
        self.fills.extend(o.fills);
        self.holes.extend(o.holes);
        self.pre.extend(o.pre);
    }

    /// Union everything → overlap-free polygons (outer CCW, holes CW).
    pub fn polygons(&self) -> Vec<Vec<V>> {
        self.polygons_body().0
    }

    /// Polygons, plus the horizontal extent of the *strokes* alone — the
    /// letter's body for spacing, which serifs and beaks overhang.
    pub fn polygons_body(&self) -> (Vec<Vec<V>>, Option<(f64, f64)>) {
        let mut subj: Vec<Poly> = Vec::new();
        let (mut bx0, mut bx1) = (f64::MAX, f64::MIN);
        for s in &self.strokes {
            for shape in s.shapes() {
                for c in shape {
                    for p in &c {
                        bx0 = bx0.min(p[0]);
                        bx1 = bx1.max(p[0]);
                    }
                    subj.push(c);
                }
            }
        }
        let body = if bx0 <= bx1 { Some((bx0, bx1)) } else { None };
        for f in &self.fills {
            subj.push(to_poly(&ccw(f.clone())));
        }
        for p in &self.pre {
            subj.push(to_poly(p));
        }
        if subj.is_empty() {
            return (Vec::new(), body);
        }
        let res = if self.holes.is_empty() {
            subj.overlay(&Vec::<Poly>::new(), OverlayRule::Subject, FillRule::NonZero)
        } else {
            let h: Vec<Poly> = self.holes.iter().map(|p| to_poly(&ccw(p.clone()))).collect();
            subj.overlay(&h, OverlayRule::Difference, FillRule::NonZero)
        };
        let mut out = Vec::new();
        for shape in res {
            for c in shape {
                let pts: Vec<V> = c.iter().map(|p| v(p[0], p[1])).collect();
                if area(&pts).abs() > 6.0 {
                    out.push(pts);
                }
            }
        }
        (out, body)
    }
}

/// Apply an affine shear (oblique) to polygons.
pub fn shear(polys: &mut [Vec<V>], tan: f64) {
    if tan == 0.0 {
        return;
    }
    for p in polys.iter_mut() {
        for q in p.iter_mut() {
            q.x += q.y * tan;
        }
    }
}

// ---- refit: polygon → quadratic-spline contour ----------------------------

const CORNER: f64 = 0.42; // radians (~24°) of turn that counts as a corner


fn turn(a: V, b: V, c: V) -> f64 {
    let d1 = b - a;
    let d2 = c - b;
    d1.cross(d2).atan2(d1.dot(d2))
}

/// Douglas–Peucker on an open chain (keeps both ends).
fn dp(pts: &[V], tol: f64, out: &mut Vec<V>) {
    let n = pts.len();
    if n <= 2 {
        out.push(pts[n - 1]);
        return;
    }
    let (a, b) = (pts[0], pts[n - 1]);
    let (mut best, mut bi) = (0.0, 0);
    for (i, &p) in pts.iter().enumerate().take(n - 1).skip(1) {
        let d = dist_to_seg(p, a, b);
        if d > best {
            best = d;
            bi = i;
        }
    }
    if best > tol {
        dp(&pts[..=bi], tol, out);
        dp(&pts[bi..], tol, out);
    } else {
        out.push(b);
    }
}


/// Refit a closed polygon as a TrueType contour (on/off-curve points).
///
/// 1. On the raw polygon — where curve samples are short and straight runs
///    are long — find the breaks: corners, and both ends of every long edge.
/// 2. Simplify each run between breaks (Douglas–Peucker, a fraction of `tol`).
/// 3. Split each simplified run again at its true x/y extrema, whose tangents
///    are exactly horizontal or vertical (on-curve extrema, as a type designer
///    would place them).
/// 4. Fit each piece with quadratic Béziers between known tangents.
pub fn refit(poly: &[V], tol: f64) -> Vec<Pt> {
    let p = dedupe_by(poly, 0.3);
    let n = p.len();
    if n < 3 {
        return Vec::new();
    }
    let mut brk = vec![false; n];
    let mut corner = vec![false; n];
    for i in 0..n {
        let a = p[(i + n - 1) % n];
        let c = p[(i + 1) % n];
        if turn(a, p[i], c).abs() > CORNER {
            brk[i] = true;
            corner[i] = true;
        }
    }
    for i in 0..n {
        let j = (i + 1) % n;
        if (p[j] - p[i]).len() > 12.0 {
            brk[i] = true;
            brk[j] = true;
        }
    }
    let start = match brk.iter().position(|&b| b) {
        Some(s) => s,
        None => {
            // a smooth closed loop: start at its lowest point
            let lo = (0..n).min_by(|&a, &b| p[a].y.partial_cmp(&p[b].y).unwrap()).unwrap();
            brk[lo] = true;
            lo
        }
    };
    // tangent at a break vertex, as seen from a run leaving (fwd) or entering it
    let tan_at = |i: usize, fwd: bool| -> V {
        if corner[i] {
            if fwd {
                (p[(i + 1) % n] - p[i]).norm()
            } else {
                (p[i] - p[(i + n - 1) % n]).norm()
            }
        } else {
            // smooth join between a straight edge and a curve: take the
            // longer neighbouring edge's direction (the straight one)
            let e_in = p[i] - p[(i + n - 1) % n];
            let e_out = p[(i + 1) % n] - p[i];
            if e_in.len() > e_out.len() {
                e_in.norm()
            } else {
                e_out.norm()
            }
        }
    };
    let mut out: Vec<Pt> = vec![(p[start].x, p[start].y, true)];
    let mut i = start;
    loop {
        let mut j = (i + 1) % n;
        let mut run = vec![p[i]];
        while !brk[j] {
            run.push(p[j]);
            j = (j + 1) % n;
        }
        run.push(p[j]);
        let t0 = tan_at(i, true);
        let t1 = tan_at(j, false);
        if run.len() == 2 {
            out.push((run[1].x, run[1].y, true));
        } else {
            let mut q = vec![run[0]];
            dp(&run, tol * 0.25, &mut q);
            // split at extrema of the simplified run
            let mut pieces: Vec<(usize, usize, V, V)> = Vec::new();
            let mut s0 = 0usize;
            let mut ts = t0;
            for k in 1..q.len() - 1 {
                let d1 = q[k] - q[k - 1];
                let d2 = q[k + 1] - q[k];
                let ext_y = d1.y * d2.y < 0.0 || (d1.y != 0.0 && d2.y == 0.0);
                let ext_x = d1.x * d2.x < 0.0 || (d1.x != 0.0 && d2.x == 0.0);
                if ext_y || ext_x {
                    let t = if ext_y { v((d1.x + d2.x).signum(), 0.0) } else { v(0.0, (d1.y + d2.y).signum()) };
                    if t.len() > 0.5 {
                        pieces.push((s0, k, ts, t));
                        s0 = k;
                        ts = t;
                    }
                }
            }
            pieces.push((s0, q.len() - 1, ts, t1));
            for (a, b, ta, tb) in pieces {
                fit(&q[a..=b], ta, tb, tol, &mut out, 0);
            }
        }
        i = j;
        if i == start {
            break;
        }
    }
    // the last point pushed duplicates the start
    if let (Some(f), Some(l)) = (out.first().copied(), out.last().copied()) {
        if l.2 && (f.0 - l.0).abs() < 1e-6 && (f.1 - l.1).abs() < 1e-6 {
            out.pop();
        }
    }
    out
}

fn dedupe_by(p: &[V], eps: f64) -> Vec<V> {
    let mut out: Vec<V> = Vec::with_capacity(p.len());
    for &q in p {
        if out.last().map_or(true, |l: &V| (*l - q).len() > eps) {
            out.push(q);
        }
    }
    while out.len() > 2 && (out[0] - out[out.len() - 1]).len() <= eps {
        out.pop();
    }
    out
}

fn dist_to_seg(p: V, a: V, b: V) -> f64 {
    let d = b - a;
    let l2 = d.dot(d);
    if l2 < 1e-12 {
        return (p - a).len();
    }
    let t = ((p - a).dot(d) / l2).clamp(0.0, 1.0);
    (p - (a + d * t)).len()
}

fn quad_at(a: V, c: V, b: V, t: f64) -> V {
    let u = 1.0 - t;
    a * (u * u) + c * (2.0 * u * t) + b * (t * t)
}

/// Push off/on points approximating `run` (excluding its first point).
fn fit(run: &[V], t0: V, t1: V, tol: f64, out: &mut Vec<Pt>, depth: u32) {
    let a = run[0];
    let b = run[run.len() - 1];
    let d = b - a;
    // straight?
    let straight = run.iter().all(|&q| dist_to_seg(q, a, b) <= tol * 0.6);
    if run.len() <= 2 || straight {
        out.push((b.x, b.y, true));
        return;
    }
    let cr = t0.cross(t1);
    let mut ok = false;
    if cr.abs() > 1e-6 {
        // a + s·t0 = b − u·t1
        let s = d.cross(t1) / cr;
        let u = t0.cross(d) / cr;
        let dl = d.len();
        if s > 0.0 && u > 0.0 && s < 1.6 * dl && u < 1.6 * dl {
            let c = a + t0 * s;
            // error: each run point vs a fine polyline of the quad
            let m = 32;
            let q: Vec<V> = (0..=m).map(|k| quad_at(a, c, b, k as f64 / m as f64)).collect();
            let mut err: f64 = 0.0;
            for &pt in run.iter() {
                let mut best = f64::MAX;
                for k in 0..m {
                    best = best.min(dist_to_seg(pt, q[k], q[k + 1]));
                }
                err = err.max(best);
                if err > tol {
                    break;
                }
            }
            // and the quad must not wander away from the run (check midpoints)
            if err <= tol {
                let mut err2: f64 = 0.0;
                for k in 0..=m {
                    let mut best = f64::MAX;
                    for w in 0..run.len() - 1 {
                        best = best.min(dist_to_seg(q[k], run[w], run[w + 1]));
                    }
                    err2 = err2.max(best);
                }
                if err2 <= tol * 1.5 {
                    out.push((c.x, c.y, false));
                    out.push((b.x, b.y, true));
                    ok = true;
                }
            }
        }
    }
    if ok {
        return;
    }
    if run.len() <= 2 || depth > 24 {
        for q in &run[1..] {
            out.push((q.x, q.y, true));
        }
        return;
    }
    if run.len() == 3 {
        // too few points to split: one quad through the middle point's tangent
        let tm = (run[2] - run[0]).norm();
        fit_two(run, t0, tm, t1, tol, out);
        return;
    }
    let mid = run.len() / 2;
    let tm = (run[mid + 1] - run[mid - 1]).norm();
    fit(&run[..=mid], t0, tm, tol, out, depth + 1);
    fit(&run[mid..], tm, t1, tol, out, depth + 1);
}

/// Two quads for a 3-point run (split at the middle point).
fn fit_two(run: &[V], t0: V, tm: V, t1: V, tol: f64, out: &mut Vec<Pt>) {
    for (a, b, ta, tb) in [(run[0], run[1], t0, tm), (run[1], run[2], tm, t1)] {
        let d = b - a;
        let cr = ta.cross(tb);
        let mut placed = false;
        if cr.abs() > 1e-6 {
            let s = d.cross(tb) / cr;
            let u = ta.cross(d) / cr;
            if s > 0.0 && u > 0.0 && s < 1.6 * d.len() && u < 1.6 * d.len() {
                let c = a + ta * s;
                out.push((c.x, c.y, false));
                placed = true;
            }
        }
        let _ = tol;
        let _ = placed;
        out.push((b.x, b.y, true));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::curve::*;

    fn span(polys: &[Vec<V>]) -> (f64, f64) {
        let mut a = (f64::MAX, f64::MIN);
        for p in polys {
            for q in p {
                a.0 = a.0.min(q.x);
                a.1 = a.1.max(q.x);
            }
        }
        a
    }

    #[test]
    fn hairline_bar_keeps_its_length() {
        // a Didone-thin horizontal bar, cut plumb at both ends
        for (stress, nib) in [(0.0, 2.0), (6.0, 2.5), (30.0, 4.0), (-12.0, 3.0)] {
        let pen = Pen::for_stem(100.0, 0.09, stress, nib);
        let mut ink = Ink::default();
        let p = path(v(100.0, 440.0)).line(v(500.0, 440.0));
        ink.stroke(Stroke { segs: p.cubics(), closed: false, pen, cap0: Cap::Cut(UP), cap1: Cap::Cut(UP) });
        let polys = ink.polygons();
        let (x0, x1) = span(&polys);
        eprintln!("{} polys, span {x0:.1}..{x1:.1}", polys.len());
        for p in &polys {
            eprintln!("  {:?}", p.iter().map(|q| (q.x.round(), q.y.round())).collect::<Vec<_>>());
        }
        assert_eq!(polys.len(), 1, "one contour at stress {stress}");
        assert!((x0 - 100.0).abs() < 1.0 && (x1 - 500.0).abs() < 1.0, "span {x0}..{x1} at stress {stress}");
        }
    }
}
