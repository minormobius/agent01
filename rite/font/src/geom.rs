//! Outline primitives. Contours are lists of points carrying an on/off-curve
//! flag (quadratic Béziers, the TrueType native curve). Orientation is fixed by
//! signed area so callers never have to think about winding direction.

pub type Pt = (f64, f64, bool); // x, y, on_curve

pub struct Glyph {
    pub advance: f64,
    pub contours: Vec<Vec<Pt>>,
}

impl Glyph {
    pub fn new(advance: f64) -> Self {
        Glyph {
            advance,
            contours: Vec::new(),
        }
    }
}

/// Shoelace area over on-curve points only. >0 means counter-clockwise (y-up).
pub fn signed_area(c: &[Pt]) -> f64 {
    let pts: Vec<(f64, f64)> = c.iter().filter(|p| p.2).map(|p| (p.0, p.1)).collect();
    let n = pts.len();
    if n < 3 {
        return 0.0;
    }
    let mut a = 0.0;
    for i in 0..n {
        let (x0, y0) = pts[i];
        let (x1, y1) = pts[(i + 1) % n];
        a += x0 * y1 - x1 * y0;
    }
    a / 2.0
}

/// Force a contour to the requested winding and rotate it to start on-curve.
/// Reversing a cyclic on/off list keeps the alternation valid; the rotation
/// just keeps renderers happy by starting on an on-curve point.
pub fn orient(mut c: Vec<Pt>, clockwise: bool) -> Vec<Pt> {
    let is_ccw = signed_area(&c) > 0.0;
    if clockwise == is_ccw {
        c.reverse();
    }
    if let Some(i) = c.iter().position(|p| p.2) {
        c.rotate_left(i);
    }
    c
}

/// A closed ellipse as 8 quadratic segments (on/off pairs), CCW as generated.
pub fn ellipse(cx: f64, cy: f64, rx: f64, ry: f64) -> Vec<Pt> {
    let segs = 8usize;
    let step = std::f64::consts::TAU / segs as f64;
    let k = 1.0 / (step / 2.0).cos();
    let mut v = Vec::with_capacity(segs * 2);
    for i in 0..segs {
        let a0 = step * i as f64;
        v.push((cx + rx * a0.cos(), cy + ry * a0.sin(), true));
        let am = a0 + step / 2.0;
        v.push((cx + rx * am.cos() * k, cy + ry * am.sin() * k, false));
    }
    v
}

/// An open arc polyline from a1 to a2 with on-curve endpoints (radians).
pub fn arc(cx: f64, cy: f64, rx: f64, ry: f64, a1: f64, a2: f64, segs: usize) -> Vec<Pt> {
    let step = (a2 - a1) / segs as f64;
    let k = 1.0 / (step / 2.0).cos();
    let mut v = Vec::with_capacity(segs * 2 + 1);
    v.push((cx + rx * a1.cos(), cy + ry * a1.sin(), true));
    for i in 0..segs {
        let a0 = a1 + step * i as f64;
        let an = a0 + step;
        let am = a0 + step / 2.0;
        v.push((cx + rx * am.cos() * k, cy + ry * am.sin() * k, false));
        v.push((cx + rx * an.cos(), cy + ry * an.sin(), true));
    }
    v
}

/// A stroked open arc (crescent): outer arc forward, inner arc back. Encloses
/// only the stroke, so counters between it and a stem stay empty automatically.
pub fn strap(cx: f64, cy: f64, r: f64, t: f64, a1: f64, a2: f64, segs: usize) -> Vec<Pt> {
    let mut outer = arc(cx, cy, r, r, a1, a2, segs);
    let mut inner = arc(cx, cy, r - t, r - t, a2, a1, segs);
    outer.append(&mut inner);
    outer
}
