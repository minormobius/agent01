//! Skeleton-stroke ("pen model") glyph construction — prototype.
//!
//! The other module (`glyphs.rs`) assembles each letter from *filled primitives*
//! (rects, quads, rings, straps): a bowl is a pair of concentric ellipses, so it
//! has uniform thickness and zero contrast, and an arch is a square `rect`
//! shoulder bolted onto a stem. This module takes the opposite, type-designer's
//! approach: a glyph is a **centerline skeleton**, and a **broad-nib pen** is
//! swept along it. The nib's perpendicular thickness modulates with the stroke's
//! direction — thick where the stroke crosses the nib edge, thin where it runs
//! along it — so round forms get real, calligraphic contrast and stems meet
//! arches with a smooth join, all from one `pen_angle` + `stem`/`thin` genome.
//!
//! It is a prototype wired to a representative handful of glyphs (`O C o c e n`)
//! so the difference is visible in the specimen next to the primitive letters.
//! `glyph_for` returns `None` for everything else; `glyphs.rs` falls back.
//!
//! Caps are butt-capped and contrast is modelled as a smooth thin↔thick sweep
//! (a softened nib, not a hard edged pen). Angled terminals, true edged-pen
//! corners, and serifs on curved stems are the next refinements.

use crate::geom::{orient, signed_area, Glyph, Pt};
use crate::params::Params;
use std::f64::consts::{PI, TAU};

type P2 = (f64, f64);

/// A centerline segment.
enum Seg {
    Line(P2, P2),
    /// Elliptical arc: center, radii, start/end angle (radians), swept a1→a2.
    Arc {
        c: P2,
        rx: f64,
        ry: f64,
        a1: f64,
        a2: f64,
    },
}

/// The broad nib. Perpendicular stroke width runs from `thin` (centerline tangent
/// parallel to the nib edge) to `thick` (tangent crossing it); `angle` is the nib
/// edge direction — the stress axis.
struct Nib {
    thick: f64,
    thin: f64,
    angle: f64,
}

impl Nib {
    fn from(p: &Params) -> Self {
        Nib {
            thick: p.stem,
            thin: p.thin,
            angle: p.pen_angle,
        }
    }

    /// Half the stroke width for a centerline tangent at angle `dir` (radians).
    fn half(&self, dir: f64) -> f64 {
        let m = (dir - self.angle).sin().abs(); // 0 ∥ edge, 1 ⟂ edge
        0.5 * (self.thin + (self.thick - self.thin) * m)
    }
}

fn push_pt(pts: &mut Vec<P2>, p: P2) {
    if let Some(&last) = pts.last() {
        if (last.0 - p.0).hypot(last.1 - p.1) < 1e-6 {
            return; // drop coincident join points so tangents stay sane
        }
    }
    pts.push(p);
}

/// Flatten a chain of segments into one dense polyline.
fn flatten(segs: &[Seg]) -> Vec<P2> {
    let mut pts = Vec::new();
    for s in segs {
        match *s {
            Seg::Line(a, b) => {
                push_pt(&mut pts, a);
                push_pt(&mut pts, b);
            }
            Seg::Arc { c, rx, ry, a1, a2 } => {
                let n = (((a2 - a1).abs() / (PI / 16.0)).ceil() as usize).max(2);
                for i in 0..=n {
                    let t = a1 + (a2 - a1) * (i as f64 / n as f64);
                    push_pt(&mut pts, (c.0 + rx * t.cos(), c.1 + ry * t.sin()));
                }
            }
        }
    }
    pts
}

/// A closed ellipse centerline (no duplicated endpoint), CCW.
fn ellipse_pts(c: P2, rx: f64, ry: f64, n: usize) -> Vec<P2> {
    (0..n)
        .map(|i| {
            let t = TAU * (i as f64 / n as f64);
            (c.0 + rx * t.cos(), c.1 + ry * t.sin())
        })
        .collect()
}

/// Per-vertex tangent angle (radians) via central differences. `closed` wraps.
fn tangents(pts: &[P2], closed: bool) -> Vec<f64> {
    let n = pts.len();
    (0..n)
        .map(|i| {
            let (prev, next) = if closed {
                (pts[(i + n - 1) % n], pts[(i + 1) % n])
            } else {
                let p = if i == 0 { pts[0] } else { pts[i - 1] };
                let q = if i == n - 1 { pts[n - 1] } else { pts[i + 1] };
                (p, q)
            };
            (next.1 - prev.1).atan2(next.0 - prev.0)
        })
        .collect()
}

/// Left/right offsets of a polyline by the nib's half-width at each vertex.
fn offsets(pts: &[P2], tans: &[f64], nib: &Nib) -> (Vec<P2>, Vec<P2>) {
    let mut left = Vec::with_capacity(pts.len());
    let mut right = Vec::with_capacity(pts.len());
    for (i, &(px, py)) in pts.iter().enumerate() {
        let hw = nib.half(tans[i]);
        let (nx, ny) = (-tans[i].sin(), tans[i].cos()); // unit normal = tangent+90°
        left.push((px + nx * hw, py + ny * hw));
        right.push((px - nx * hw, py - ny * hw));
    }
    (left, right)
}

/// Accumulates pen-stroked contours into a `Glyph`, applying the seed's oblique
/// shear and fixing winding — same conventions as `glyphs.rs::Pen`.
struct Skel<'a> {
    p: &'a Params,
    nib: Nib,
    g: Glyph,
}

impl<'a> Skel<'a> {
    fn new(p: &'a Params, advance: f64) -> Self {
        Skel {
            p,
            nib: Nib::from(p),
            g: Glyph::new(advance),
        }
    }

    fn shear(&self, c: Vec<Pt>) -> Vec<Pt> {
        let tan = self.p.slant_tan;
        c.into_iter().map(|(x, y, on)| (x + tan * y, y, on)).collect()
    }

    fn emit(&mut self, contour: Vec<Pt>, cw: bool) {
        let sheared = self.shear(contour);
        self.g.contours.push(orient(sheared, cw));
    }

    /// Stroke an open centerline (a chain of segments) → one filled contour,
    /// butt-capped at both ends.
    fn open(&mut self, segs: &[Seg]) {
        let pts = flatten(segs);
        if pts.len() < 2 {
            return;
        }
        let tans = tangents(&pts, false);
        let (left, right) = offsets(&pts, &tans, &self.nib);
        // right edge forward, left edge back → a closed loop around the stroke.
        let mut contour: Vec<Pt> = right.iter().map(|&(x, y)| (x, y, true)).collect();
        contour.extend(left.iter().rev().map(|&(x, y)| (x, y, true)));
        self.emit(contour, true);
    }

    /// Stroke a closed ellipse centerline → outer fill + inner counter (an
    /// annulus with real thick/thin contrast).
    fn ring(&mut self, c: P2, rx: f64, ry: f64) {
        let pts = ellipse_pts(c, rx, ry, 48);
        let tans = tangents(&pts, true);
        let (left, right) = offsets(&pts, &tans, &self.nib);
        let a: Vec<Pt> = left.iter().map(|&(x, y)| (x, y, true)).collect();
        let b: Vec<Pt> = right.iter().map(|&(x, y)| (x, y, true)).collect();
        // Larger loop is the outer fill (CW); the other is the counter (CCW).
        if signed_area(&a).abs() >= signed_area(&b).abs() {
            self.emit(a, true);
            self.emit(b, false);
        } else {
            self.emit(b, true);
            self.emit(a, false);
        }
    }

    /// A filled axis-aligned rectangle (caps, bars, serifs).
    fn rect(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) {
        self.emit(
            vec![
                (x0, y0, true),
                (x1, y0, true),
                (x1, y1, true),
                (x0, y1, true),
            ],
            true,
        );
    }

    /// Slab serifs at the foot of a vertical stem centered on `x`.
    fn foot_serif(&mut self, x: f64) {
        if !self.p.serif {
            return;
        }
        let half = self.p.stem / 2.0 + self.p.serif_len * 0.5;
        self.rect(x - half, 0.0, x + half, self.p.serif_th);
    }

    fn finish(self) -> Glyph {
        self.g
    }
}

fn deg(d: f64) -> f64 {
    d.to_radians()
}

/// Pen-model builder for the prototype's glyph subset. Returns `None` for any
/// character it doesn't (yet) handle, so the primitive builder takes over.
pub fn glyph_for(c: char, p: &Params) -> Option<Glyph> {
    let h = p.cap;
    let xh = p.xheight;
    let wf = p.width;
    let sb = 0.07 * h;

    // A bowl that fills its box: side radius leaves room for the thick stroke,
    // top/bottom radius for the thin — so the outer edge lands on the box.
    let bowl = |w: f64, ht: f64| -> (P2, f64, f64) {
        (
            (w / 2.0, ht / 2.0),
            w / 2.0 - p.stem / 2.0,
            ht / 2.0 - p.thin / 2.0,
        )
    };

    match c {
        'O' => {
            let w = 0.72 * h * wf;
            let (c0, rx, ry) = bowl(w, h);
            let mut s = Skel::new(p, w + 2.0 * sb);
            s.ring(c0, rx, ry);
            Some(s.finish())
        }

        'o' => {
            let w = 0.54 * h * wf;
            let (c0, rx, ry) = bowl(w, xh);
            let mut s = Skel::new(p, w + 2.0 * sb);
            s.ring(c0, rx, ry);
            Some(s.finish())
        }

        'C' => {
            let w = 0.72 * h * wf;
            let ((cx, cy), rx, ry) = bowl(w, h);
            let mut s = Skel::new(p, w + 2.0 * sb);
            s.open(&[Seg::Arc {
                c: (cx, cy),
                rx,
                ry,
                a1: deg(55.0),
                a2: deg(305.0),
            }]);
            Some(s.finish())
        }

        'c' => {
            let w = 0.54 * h * wf;
            let ((cx, cy), rx, ry) = bowl(w, xh);
            let mut s = Skel::new(p, w + 2.0 * sb);
            s.open(&[Seg::Arc {
                c: (cx, cy),
                rx,
                ry,
                a1: deg(55.0),
                a2: deg(305.0),
            }]);
            Some(s.finish())
        }

        'e' => {
            // A 'c' arc opening at the lower right, with a thin crossbar through
            // the eye. Bar runs flat → the pen makes it thin automatically.
            let w = 0.54 * h * wf;
            let ((cx, cy), rx, ry) = bowl(w, xh);
            let mut s = Skel::new(p, w + 2.0 * sb);
            s.open(&[Seg::Arc {
                c: (cx, cy),
                rx,
                ry,
                a1: deg(0.0),
                a2: deg(305.0),
            }]);
            s.open(&[Seg::Line((0.0, cy), (cx + rx, cy))]);
            Some(s.finish())
        }

        'n' => {
            // A full-height left stem plus an arch that springs from its top and
            // falls into the right stem — one stroke, so the shoulder join is
            // automatic. The arch thins at the top (horizontal tangent).
            let w = 0.54 * h * wf;
            let xl = p.stem / 2.0;
            let xr = w - p.stem / 2.0;
            let r = (xr - xl) / 2.0;
            let cx = (xl + xr) / 2.0;
            let shoulder = xh - r;
            let mut s = Skel::new(p, w + 2.0 * sb);
            s.open(&[Seg::Line((xl, 0.0), (xl, xh))]);
            s.open(&[
                Seg::Arc {
                    c: (cx, shoulder),
                    rx: r,
                    ry: r,
                    a1: PI,
                    a2: 0.0,
                },
                Seg::Line((xr, shoulder), (xr, 0.0)),
            ]);
            s.foot_serif(xl);
            s.foot_serif(xr);
            Some(s.finish())
        }

        _ => None,
    }
}
