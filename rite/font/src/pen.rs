//! Skeleton-stroke ("pen model") glyph construction.
//!
//! The other module (`glyphs.rs`) assembles each letter from *filled primitives*
//! (rects, quads, rings, straps): a bowl is a pair of concentric ellipses, so it
//! has uniform thickness and zero contrast, and an arch is a square `rect`
//! shoulder bolted onto a stem. This module takes the type-designer's approach:
//! a glyph is a **centerline skeleton**, and a **broad-nib pen** is swept along
//! it. Rather than offset the centerline (which pinches wherever the tangent
//! turns — fading a W's interior peak, thinning an A's apex), the nib is
//! *simulated*: a fixed, oriented rectangle is stamped along the stroke (`Nib`),
//! one convex blob per segment. Apparent weight then falls out of the geometry —
//! thick across the nib edge, thin along it — and corners/apices stay full
//! because the nib stamped at the vertex fills them. Terminals get the nib's
//! angled cut for free. All from one `pen_angle` + `stem`/`thin` genome.
//!
//! Coverage is the whole Latin alphabet (upper + lower); space and the three
//! punctuation marks stay on the primitive builder (`glyph_for` returns `None`).
//!
//! Construction conventions:
//!   * A glyph's black body spans `x ∈ [0, w]`; advance folds in the sidebearings.
//!   * Stems are centerlines inset by `stem/2` from the visual edge.
//!   * Every stroke is a chain of segments; each segment emits one convex blob
//!     (the nib hull at its two ends). Overlapping same-winding blobs union under
//!     TrueType's nonzero fill, so corners fill, joints merge, and a closed loop
//!     leaves its counter empty — no boolean geometry, no explicit holes.
//!   * Slab serifs / dots are solid rects added on top.
//!
//! Refinements still open: mitred (vs nib-blunt) apexes if a sharper point is
//! wanted, and Bézier-refitting the stamped outline to cut point count.

use crate::geom::{orient, Glyph, Pt};
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

/// The pen nib: a fixed, oriented rectangle dragged along the stroke (a real
/// broad-nib *simulator*, not a direction-keyed offset). `e` is the unit vector
/// along the nib edge (the stress axis), `n` is perpendicular; `he`/`hf` are the
/// half-extents along each. Because the nib is a real shape stamped at every
/// point, the apparent stroke weight falls out of the geometry — thick across
/// the edge, thin along it — and, crucially, corners and apices stay full
/// (the nib stamped at the vertex fills them), instead of pinching the way a
/// centerline offset does where the tangent turns. Terminals get the nib's
/// angled cut for free.
struct Nib {
    e: P2,  // unit vector along the nib edge
    n: P2,  // unit perpendicular
    he: f64, // half-extent along the edge  (≈ thick weight / 2)
    hf: f64, // half-extent across the edge (≈ thin weight / 2)
}

/// The pen's thin weight, driven by the `modulation` gene rather than the legacy
/// metric `thin` — this is the knob for how strongly weight varies with stroke
/// angle: 0 = monoline (thin = thick), 1 = near-hairline (high contrast). Every
/// pen dimension (nib, bowl/box insets, bar thickness) reads this so they stay
/// consistent.
pub(crate) fn nib_thin(p: &Params) -> f64 {
    (p.stem * (1.0 - 0.92 * p.morph.modulation)).max(5.0)
}

impl Nib {
    fn from(p: &Params) -> Self {
        let a = p.pen_angle;
        Nib {
            e: (a.cos(), a.sin()),
            n: (-a.sin(), a.cos()),
            he: p.stem / 2.0,
            hf: (nib_thin(p) / 2.0).max(4.0),
        }
    }

    /// The four nib corners stamped at point `p`.
    fn corners(&self, p: P2) -> [P2; 4] {
        let (ex, ey) = self.e;
        let (nx, ny) = self.n;
        let ev = (self.he * ex, self.he * ey);
        let nv = (self.hf * nx, self.hf * ny);
        [
            (p.0 + ev.0 + nv.0, p.1 + ev.1 + nv.1),
            (p.0 + ev.0 - nv.0, p.1 + ev.1 - nv.1),
            (p.0 - ev.0 - nv.0, p.1 - ev.1 - nv.1),
            (p.0 - ev.0 + nv.0, p.1 - ev.1 + nv.1),
        ]
    }
}

/// Convex hull (monotone chain), returned CCW. Used to wrap the nib stamped at
/// the two ends of a segment into one convex blob.
fn convex_hull(mut pts: Vec<P2>) -> Vec<P2> {
    pts.sort_by(|a, b| {
        a.0.partial_cmp(&b.0)
            .unwrap()
            .then(a.1.partial_cmp(&b.1).unwrap())
    });
    pts.dedup_by(|a, b| (a.0 - b.0).abs() < 1e-7 && (a.1 - b.1).abs() < 1e-7);
    let n = pts.len();
    if n < 3 {
        return pts;
    }
    let cross = |o: P2, a: P2, b: P2| (a.0 - o.0) * (b.1 - o.1) - (a.1 - o.1) * (b.0 - o.0);
    let mut hull: Vec<P2> = Vec::with_capacity(2 * n);
    for &p in &pts {
        while hull.len() >= 2 && cross(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0 {
            hull.pop();
        }
        hull.push(p);
    }
    let lower = hull.len() + 1;
    for &p in pts.iter().rev() {
        while hull.len() >= lower && cross(hull[hull.len() - 2], hull[hull.len() - 1], p) <= 0.0 {
            hull.pop();
        }
        hull.push(p);
    }
    hull.pop();
    hull
}

fn push_pt(pts: &mut Vec<P2>, p: P2) {
    if let Some(&last) = pts.last() {
        if (last.0 - p.0).hypot(last.1 - p.1) < 1e-6 {
            return; // drop coincident points so we don't stamp zero-length segments
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

fn deg(d: f64) -> f64 {
    d.to_radians()
}

/// Accumulates pen-stroked contours into a `Glyph`. Each stroke is rendered by
/// stamping the nib along its centerline and emitting one convex blob per
/// segment; overlapping same-winding blobs union under TrueType's nonzero fill,
/// so corners fill and a closed loop leaves its counter empty — no explicit
/// hole, no offset math.
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

    /// Stamp the nib along a polyline, one convex blob per segment.
    fn stamp(&mut self, pts: &[P2], closed: bool) {
        let n = pts.len();
        if n == 0 {
            return;
        }
        if n == 1 {
            let blob = self.nib.corners(pts[0]).to_vec();
            self.emit(blob.into_iter().map(|(x, y)| (x, y, true)).collect(), true);
            return;
        }
        let segs = if closed { n } else { n - 1 };
        for i in 0..segs {
            let a = pts[i];
            let b = pts[(i + 1) % n];
            let mut corners = self.nib.corners(a).to_vec();
            corners.extend_from_slice(&self.nib.corners(b));
            let hull = convex_hull(corners);
            if hull.len() >= 3 {
                self.emit(hull.into_iter().map(|(x, y)| (x, y, true)).collect(), true);
            }
        }
    }

    /// Stroke an open centerline (a chain of segments).
    fn open(&mut self, segs: &[Seg]) {
        let pts = flatten(segs);
        self.stamp(&pts, false);
    }

    /// Stroke a closed ellipse centerline; the nib band leaves the counter empty.
    fn ring(&mut self, c: P2, rx: f64, ry: f64) {
        let pts = ellipse_pts(c, rx.max(8.0), ry.max(8.0), 44);
        self.stamp(&pts, true);
    }

    /// A filled axis-aligned rectangle (caps, bars, serifs, dots).
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

    // ---- convenience strokes ------------------------------------------------

    fn line(&mut self, a: P2, b: P2) {
        self.open(&[Seg::Line(a, b)]);
    }

    fn hbar(&mut self, x0: f64, x1: f64, y: f64) {
        self.line((x0, y), (x1, y));
    }

    /// A closed bowl fitted to the box [x0,x1]×[y0,y1] (radii leave room for the
    /// stroke so the outer edge lands on the box).
    fn ring_box(&mut self, x0: f64, x1: f64, y0: f64, y1: f64) {
        let (c, rx, ry) = box_radii(self.p, x0, x1, y0, y1);
        self.ring(c, rx, ry);
    }

    /// An open arc fitted to a box, swept a1→a2 (degrees).
    fn arc_box(&mut self, x0: f64, x1: f64, y0: f64, y1: f64, a1: f64, a2: f64) {
        let (c, rx, ry) = box_radii(self.p, x0, x1, y0, y1);
        self.open(&[Seg::Arc {
            c,
            rx,
            ry,
            a1: deg(a1),
            a2: deg(a2),
        }]);
    }

    fn dot(&mut self, cx: f64, cy: f64, r: f64) {
        self.rect(cx - r, cy - r, cx + r, cy + r);
    }

    /// How far the nib reaches vertically from a stamp point (its slanted cut's
    /// half-height). A serif slab must be at least this tall to bury the cut.
    fn nib_vreach(&self) -> f64 {
        self.nib.he * self.nib.e.1.abs() + self.nib.hf * self.nib.n.1.abs()
    }

    /// Serif slab height — tall enough to cover the stem's angled nib terminal so
    /// it doesn't poke through (the "crossed serif").
    fn serif_h(&self) -> f64 {
        self.p.serif_th.max(self.nib_vreach() + 6.0)
    }

    fn base_serif(&mut self, x: f64) {
        if self.p.serif {
            let half = self.p.stem / 2.0 + self.p.serif_len * 0.5;
            let sh = self.serif_h();
            self.rect(x - half, 0.0, x + half, sh);
        }
    }

    fn cap_serif(&mut self, x: f64) {
        if self.p.serif {
            let half = self.p.stem / 2.0 + self.p.serif_len * 0.5;
            let sh = self.serif_h();
            self.rect(x - half, self.p.cap - sh, x + half, self.p.cap);
        }
    }

    /// A vertical stem, with slab serifs auto-added at any end on the baseline
    /// (y≈0) or the cap line (y≈cap). A serifed end is tucked *under* its slab
    /// (the stem centerline stops at the slab's inner edge) so the nib's angled
    /// terminal stays buried instead of crossing through the serif.
    fn vstem(&mut self, x: f64, y0: f64, y1: f64) {
        let foot = self.p.serif && y0.abs() <= 1.0;
        let head = self.p.serif && y1 >= self.p.cap - 1.0;
        let sh = self.serif_h();
        let a = if foot { y0 + sh } else { y0 };
        let b = if head { y1 - sh } else { y1 };
        self.line((x, a.min(b)), (x, a.max(b)));
        if foot {
            self.base_serif(x);
        }
        if head {
            self.cap_serif(x);
        }
    }

    /// A bowl bulging RIGHT of a stem at `xstem`, bulge reaching `x_edge`. The
    /// arc's terminals always land on the stem (closing the bowl — no gap), and
    /// `wrap` (deg) controls how far past vertical the arc curls before it
    /// attaches: 0 = an open D, larger = an enclosed, near-round counter. The
    /// radius is solved so both the attach (at `xstem`) and the bulge (at
    /// `x_edge`) hold for any wrap.
    fn bowl_right(&mut self, xstem: f64, x_edge: f64, top: f64, wrap: f64) {
        let wr = deg(wrap);
        let rx = ((x_edge - xstem) / (1.0 + wr.sin())).max(8.0);
        let cx = x_edge - rx;
        let ry = (top / 2.0 - nib_thin(self.p) / 2.0).max(8.0);
        self.open(&[Seg::Arc {
            c: (cx, top / 2.0),
            rx,
            ry,
            a1: deg(90.0 + wrap),
            a2: deg(-90.0 - wrap),
        }]);
    }

    /// A bowl bulging LEFT of a stem at `xstem`, bulge reaching `x_edge` (mirror
    /// of `bowl_right`).
    fn bowl_left(&mut self, xstem: f64, x_edge: f64, top: f64, wrap: f64) {
        let wr = deg(wrap);
        let rx = ((xstem - x_edge) / (1.0 + wr.sin())).max(8.0);
        let cx = x_edge + rx;
        let ry = (top / 2.0 - nib_thin(self.p) / 2.0).max(8.0);
        self.open(&[Seg::Arc {
            c: (cx, top / 2.0),
            rx,
            ry,
            a1: deg(90.0 - wrap),
            a2: deg(270.0 + wrap),
        }]);
    }

    /// An arch springing from the top of a left stem at `xl`, over to a right
    /// stem at `xr`, then straight down to `ybot`. `archf` flattens the shoulder
    /// (1.0 = round/humanist, →0.55 = squared/grotesque). The caller emits the
    /// left stem; the arch overlaps it at the spring point. When `ybot` is the
    /// baseline and serifs are on, the right foot is tucked under its slab (so the
    /// nib's terminal doesn't poke below the baseline) and the serif is drawn.
    fn arch(&mut self, xl: f64, xr: f64, top: f64, ybot: f64, archf: f64) {
        let rx = (xr - xl) / 2.0;
        let ry = rx * archf;
        let cx = (xl + xr) / 2.0;
        let spring = top - ry;
        let footed = self.p.serif && ybot.abs() <= 1.0;
        let foot = if footed { self.serif_h() } else { ybot };
        self.open(&[
            Seg::Arc {
                c: (cx, spring),
                rx,
                ry,
                a1: deg(180.0),
                a2: deg(0.0),
            },
            Seg::Line((xr, spring), (xr, foot)),
        ]);
        if footed {
            self.base_serif(xr);
        }
    }

    fn finish(self) -> Glyph {
        self.g
    }
}

/// Center + nib-inset radii of an ellipse that fills a box.
fn box_radii(p: &Params, x0: f64, x1: f64, y0: f64, y1: f64) -> (P2, f64, f64) {
    let cx = (x0 + x1) / 2.0;
    let cy = (y0 + y1) / 2.0;
    let rx = ((x1 - x0) / 2.0 - p.stem / 2.0).max(8.0);
    let ry = ((y1 - y0) / 2.0 - nib_thin(p) / 2.0).max(8.0);
    ((cx, cy), rx, ry)
}

/// An upper bowl (B/P/R) attached to a stem at `xstem`, between `ylo` and `yhi`,
/// bulging right to `xright`. Endpoints sit on the stem so they union with it.
fn upper_bowl(k: &mut Skel, xstem: f64, ylo: f64, yhi: f64, xright: f64) {
    let cy = (ylo + yhi) / 2.0;
    let ry = (yhi - ylo) / 2.0 - k.p.thin / 2.0;
    let rx = (xright - xstem) - k.p.stem / 2.0;
    k.open(&[Seg::Arc {
        c: (xstem, cy),
        rx: rx.max(8.0),
        ry: ry.max(8.0),
        a1: deg(90.0),
        a2: deg(-90.0),
    }]);
}

/// Pen-model builder for the whole Latin alphabet. Returns `None` for space and
/// punctuation, which stay on the primitive builder.
pub fn glyph_for(c: char, p: &Params) -> Option<Glyph> {
    let h = p.cap;
    let xh = p.xheight;
    let wf = p.width;
    let s = p.stem;
    let t = nib_thin(p); // modulation-driven thin — keeps bars/insets matching the nib
    let sb = 0.07 * h;
    let dd = 0.22 * h; // descender depth below baseline

    // construction genome
    let mo = &p.morph;
    let ov = mo.overshoot; // round overshoot past baseline / cap
    let hg = 55.0 * mo.aperture; // half-gap (deg) for the open counters C/c/e/G
    // Arch arcs: vertical-radius factor from round (1.0) to flat/squared (~0.55).
    let archf = 1.0 - 0.45 * mo.arch;
    let wrap = mo.bowl; // a/b/d/p/q bowl-closure wrap (deg)

    // black widths
    let wn = 0.64 * h * wf; // normal cap
    let wr = 0.74 * h * wf; // round cap
    let ww = 0.92 * h * wf; // wide cap (M, W)
    let wnar = 0.34 * h * wf; // narrow cap (I, J)
    let wl = 0.54 * h * wf; // normal lowercase
    let wln = 0.30 * h * wf; // narrow lowercase (i, j, l)
    let wlw = 0.86 * h * wf; // wide lowercase (m, w)

    let adv = |w: f64| w + 2.0 * sb;

    let g = match c {
        // ---- uppercase ------------------------------------------------------
        'A' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            // One continuous stroke so the apex fills cleanly. The genome picks a
            // flat (truncated) apex or a pointed "chopstick" one — so the pointed
            // form is a roll, not universal.
            if mo.apex_flat {
                let aw = w * 0.10; // half-width of the flat top
                k.open(&[
                    Seg::Line((s / 2.0, 0.0), (w / 2.0 - aw, h)),
                    Seg::Line((w / 2.0 - aw, h), (w / 2.0 + aw, h)),
                    Seg::Line((w / 2.0 + aw, h), (w - s / 2.0, 0.0)),
                ]);
            } else {
                k.open(&[
                    Seg::Line((s / 2.0, 0.0), (w / 2.0, h)),
                    Seg::Line((w / 2.0, h), (w - s / 2.0, 0.0)),
                ]);
            }
            let by = h * (0.20 + 0.28 * mo.bar); // crossbar height tracks the genome
            k.hbar(w * 0.18, w * 0.82, by);
            k
        }
        'B' => {
            let w = s + 0.34 * h + 2.0 * sb;
            let xr = s / 2.0 + 0.33 * h;
            let mut k = Skel::new(p, w);
            k.vstem(s / 2.0, 0.0, h);
            upper_bowl(&mut k, s / 2.0, 0.46 * h, h, xr); // top bowl
            upper_bowl(&mut k, s / 2.0, 0.0, 0.54 * h, xr + 0.02 * h); // bottom bowl (wider)
            k
        }
        'C' => {
            let w = wr;
            let mut k = Skel::new(p, adv(w));
            k.arc_box(0.0, w, -ov, h + ov, hg, 360.0 - hg);
            k
        }
        'D' => {
            let w = wr;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.open(&[Seg::Arc {
                c: (s / 2.0, h / 2.0),
                rx: (w - s).max(8.0),
                ry: (h / 2.0 - t / 2.0).max(8.0),
                a1: deg(90.0),
                a2: deg(-90.0),
            }]);
            k
        }
        'E' | 'F' => {
            let w = wn * 0.92;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.hbar(s / 2.0, w, h - t / 2.0); // top arm
            k.hbar(s / 2.0, w * 0.86, h * mo.bar); // middle arm (genome height)
            if c == 'E' {
                k.hbar(s / 2.0, w, t / 2.0); // bottom arm
            }
            k
        }
        'G' => {
            // Bowl that comes round to a lower-right terminal, then a jaw drawn
            // as ONE L-stroke (bar in from the counter, then spur down) whose end
            // lands exactly on the bowl terminal — so all three meet without the
            // disconnected float / indented corner the separate strokes gave.
            let w = wr;
            let (c0, rx, ry) = box_radii(p, 0.0, w, -ov, h + ov);
            let end = 332.0_f64; // lower-right terminal angle
            let tx = c0.0 + rx * deg(end).cos();
            let ty = c0.1 + ry * deg(end).sin();
            let mut k = Skel::new(p, adv(w));
            k.arc_box(0.0, w, -ov, h + ov, hg, end);
            k.open(&[
                Seg::Line((w * 0.52, 0.48 * h), (tx, 0.48 * h)), // bar
                Seg::Line((tx, 0.48 * h), (tx, ty)),             // spur → bowl terminal
            ]);
            k
        }
        'H' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.vstem(w - s / 2.0, 0.0, h);
            k.hbar(s / 2.0, w - s / 2.0, h * mo.bar); // crossbar (genome height)
            k
        }
        'I' => {
            let w = wnar;
            let mut k = Skel::new(p, adv(w));
            k.vstem(w / 2.0, 0.0, h);
            k
        }
        'J' => {
            // Stem + a hook that dips through the bottom and curls up-left.
            // Sweep clockwise (0°→-190°); the earlier +205° curled the wrong way.
            let w = wnar * 1.5;
            let xr = w - s / 2.0;
            let r = 0.26 * h;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((xr, h), (xr, r)),
                Seg::Arc {
                    c: (xr - r, r),
                    rx: r,
                    ry: r,
                    a1: deg(0.0),
                    a2: deg(-190.0),
                },
            ]);
            k.cap_serif(xr);
            k
        }
        'K' => {
            let w = wn;
            let j = (s, 0.48 * h); // junction just right of the stem
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.line(j, (w - s / 2.0, h)); // upper arm
            k.line(j, (w - s / 2.0, 0.0)); // lower leg
            k
        }
        'L' => {
            let w = wn * 0.86;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.hbar(s / 2.0, w, t / 2.0);
            k
        }
        'M' => {
            let w = ww;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.vstem(w - s / 2.0, 0.0, h);
            // inner V as one stroke so its vertex fills cleanly
            k.open(&[
                Seg::Line((s / 2.0, h), (w / 2.0, 0.34 * h)),
                Seg::Line((w / 2.0, 0.34 * h), (w - s / 2.0, h)),
            ]);
            k
        }
        'N' => {
            let w = wr * 0.95;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.vstem(w - s / 2.0, 0.0, h);
            k.line((s / 2.0, h), (w - s / 2.0, 0.0)); // diagonal
            k
        }
        'O' => {
            let w = wr;
            let mut k = Skel::new(p, adv(w));
            k.ring_box(0.0, w, -ov, h + ov);
            k
        }
        'P' => {
            let w = s + 0.30 * h + 2.0 * sb;
            let mut k = Skel::new(p, w);
            k.vstem(s / 2.0, 0.0, h);
            upper_bowl(&mut k, s / 2.0, 0.44 * h, h, s / 2.0 + 0.32 * h);
            k
        }
        'Q' => {
            let w = wr;
            let mut k = Skel::new(p, adv(w));
            k.ring_box(0.0, w, -ov, h + ov);
            k.line((w * 0.58, 0.22 * h), (w * 0.95, -0.06 * h)); // tail
            k
        }
        'R' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            upper_bowl(&mut k, s / 2.0, 0.46 * h, h, s / 2.0 + 0.30 * h);
            k.line((s, 0.48 * h), (w - s / 2.0, 0.0)); // leg
            k
        }
        'S' => {
            // A real two-bowl S-spine, tangent-continuous at the waist so the
            // pen renders one flowing stroke (thin at the top/bottom curves,
            // thick on the diagonals).
            let w = wn * 0.92;
            let (_, rx, ry) = box_radii(p, 0.0, w, 0.0, h);
            let ry = ry.min(0.25 * h);
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Arc {
                    c: (w / 2.0, 0.75 * h),
                    rx,
                    ry,
                    a1: deg(20.0),
                    a2: deg(270.0),
                },
                Seg::Arc {
                    c: (w / 2.0, 0.25 * h),
                    rx,
                    ry,
                    a1: deg(90.0),
                    a2: deg(-160.0),
                },
            ]);
            k
        }
        'T' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.hbar(0.0, w, h - t / 2.0);
            k.vstem(w / 2.0, 0.0, h - t);
            k
        }
        'U' => {
            let w = wr * 0.92;
            let (xl, xr) = (s / 2.0, w - s / 2.0);
            let r = (xr - xl) / 2.0;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((xl, h), (xl, r)),
                Seg::Arc {
                    c: ((xl + xr) / 2.0, r),
                    rx: r,
                    ry: r,
                    a1: deg(180.0),
                    a2: deg(360.0),
                },
                Seg::Line((xr, r), (xr, h)),
            ]);
            k.cap_serif(xl);
            k.cap_serif(xr);
            k
        }
        'V' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((s / 2.0, h), (w / 2.0, 0.0)),
                Seg::Line((w / 2.0, 0.0), (w - s / 2.0, h)),
            ]);
            k
        }
        'W' => {
            let w = ww * 1.05;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((s / 2.0, h), (w * 0.28, 0.0)),
                Seg::Line((w * 0.28, 0.0), (w * 0.5, 0.62 * h)),
                Seg::Line((w * 0.5, 0.62 * h), (w * 0.72, 0.0)),
                Seg::Line((w * 0.72, 0.0), (w - s / 2.0, h)),
            ]);
            k
        }
        'X' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.line((s / 2.0, 0.0), (w - s / 2.0, h));
            k.line((w - s / 2.0, 0.0), (s / 2.0, h));
            k
        }
        'Y' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.line((s / 2.0, h), (w / 2.0, 0.52 * h));
            k.line((w - s / 2.0, h), (w / 2.0, 0.52 * h));
            k.vstem(w / 2.0, 0.0, 0.52 * h);
            k
        }
        'Z' => {
            let w = wn;
            let mut k = Skel::new(p, adv(w));
            k.hbar(0.0, w, h - t / 2.0);
            k.hbar(0.0, w, t / 2.0);
            k.line((w - s / 2.0, h - t), (s / 2.0, t));
            k
        }

        // ---- lowercase ------------------------------------------------------
        'a' => {
            // Single-story: bowl whose arc springs from the right stem at the
            // top and bottom of the x-height, so the stem closes it (no gap).
            let w = wl;
            let xr = w - s / 2.0;
            let mut k = Skel::new(p, adv(w));
            k.vstem(xr, 0.0, xh);
            k.bowl_left(xr, s / 2.0, xh, wrap);
            k
        }
        'b' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h);
            k.bowl_right(s / 2.0, w - s / 2.0, xh, wrap);
            k
        }
        'c' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.arc_box(0.0, w, -ov, xh + ov, hg, 360.0 - hg);
            k
        }
        'd' => {
            let w = wl;
            let xr = w - s / 2.0;
            let mut k = Skel::new(p, adv(w));
            k.vstem(xr, 0.0, h);
            k.bowl_left(xr, s / 2.0, xh, wrap);
            k
        }
        'e' => {
            let w = wl;
            let (c0, rx, _) = box_radii(p, 0.0, w, -ov, xh + ov);
            let mut k = Skel::new(p, adv(w));
            k.arc_box(0.0, w, -ov, xh + ov, 0.0, 360.0 - hg); // aperture-controlled opening
            k.hbar(0.0, c0.0 + rx, xh * mo.bar); // crossbar through the eye (genome height)
            k
        }
        'f' => {
            let w = wln * 1.2;
            let xc = w * 0.42;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((xc, 0.0), (xc, h - 0.10 * h)),
                Seg::Arc {
                    c: (xc + 0.16 * h, h - 0.10 * h),
                    rx: 0.16 * h,
                    ry: 0.16 * h,
                    a1: deg(180.0),
                    a2: deg(95.0),
                },
            ]);
            k.hbar(0.0, w, xh); // crossbar
            k.base_serif(xc);
            k
        }
        'g' => {
            // Single-story: bowl + a descending tail that hooks LEFT. The arc
            // sweeps clockwise *down through the bottom* (0°→-150°); the earlier
            // version swept up first, which read as a backwards curl.
            let w = wl;
            let xr = w - s / 2.0;
            let cy = -0.5 * dd;
            let mut k = Skel::new(p, adv(w));
            k.ring_box(0.0, w, -ov, xh + ov);
            k.open(&[
                Seg::Line((xr, xh), (xr, cy)),
                Seg::Arc {
                    c: (xr - 0.28 * w, cy),
                    rx: 0.28 * w,
                    ry: 0.5 * dd,
                    a1: deg(0.0),
                    a2: deg(-150.0),
                },
            ]);
            k
        }
        'h' => {
            let w = wl;
            let (xl, xr) = (s / 2.0, w - s / 2.0);
            let mut k = Skel::new(p, adv(w));
            k.vstem(xl, 0.0, h); // ascender stem
            k.arch(xl, xr, xh, 0.0, archf);
            k
        }
        'i' => {
            let w = wln;
            let x = w / 2.0;
            let mut k = Skel::new(p, adv(w));
            k.vstem(x, 0.0, xh);
            k.dot(x, xh + 0.17 * h, s * 0.55);
            k
        }
        'j' => {
            // Stem + a fishhook that dips through the bottom and curls up-left.
            // Sweep clockwise (0°→-200°); the earlier +205° curled the wrong way.
            let w = wln * 1.3;
            let x = w * 0.5;
            let r = 0.24 * h;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((x, xh), (x, -dd + r)),
                Seg::Arc {
                    c: (x - r, -dd + r),
                    rx: r,
                    ry: r,
                    a1: deg(0.0),
                    a2: deg(-200.0),
                },
            ]);
            k.dot(x, xh + 0.17 * h, s * 0.55);
            k
        }
        'k' => {
            let w = wl;
            let j = (s, xh * 0.42);
            let mut k = Skel::new(p, adv(w));
            k.vstem(s / 2.0, 0.0, h); // ascender stem
            k.line(j, (w - s / 2.0, xh));
            k.line(j, (w - s / 2.0, 0.0));
            k
        }
        'l' => {
            let w = wln;
            let mut k = Skel::new(p, adv(w));
            k.vstem(w / 2.0, 0.0, h);
            k
        }
        'm' => {
            let w = wlw;
            let (x0, x1, x2) = (s / 2.0, w / 2.0, w - s / 2.0);
            let mut k = Skel::new(p, adv(w));
            k.vstem(x0, 0.0, xh);
            k.arch(x0, x1, xh, 0.0, archf);
            k.arch(x1, x2, xh, 0.0, archf);
            k
        }
        'n' => {
            let w = wl;
            let (xl, xr) = (s / 2.0, w - s / 2.0);
            let mut k = Skel::new(p, adv(w));
            k.vstem(xl, 0.0, xh);
            k.arch(xl, xr, xh, 0.0, archf);
            k
        }
        'o' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.ring_box(0.0, w, -ov, xh + ov);
            k
        }
        'p' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.line((s / 2.0, -dd), (s / 2.0, xh)); // descender stem
            k.bowl_right(s / 2.0, w - s / 2.0, xh, wrap);
            k
        }
        'q' => {
            let w = wl;
            let xr = w - s / 2.0;
            let mut k = Skel::new(p, adv(w));
            k.bowl_left(xr, s / 2.0, xh, wrap);
            k.line((xr, -dd), (xr, xh)); // descender stem
            k
        }
        'r' => {
            let w = wl * 0.82;
            let xl = s / 2.0;
            let r = (w - xl) * 0.72;
            let mut k = Skel::new(p, adv(w));
            k.vstem(xl, 0.0, xh);
            k.open(&[Seg::Arc {
                c: (xl + r, xh - r),
                rx: r,
                ry: r,
                a1: deg(180.0),
                a2: deg(72.0),
            }]);
            k
        }
        's' => {
            let w = wl * 0.92;
            let (_, rx, ry) = box_radii(p, 0.0, w, 0.0, xh);
            let ry = ry.min(0.25 * xh);
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Arc {
                    c: (w / 2.0, 0.75 * xh),
                    rx,
                    ry,
                    a1: deg(20.0),
                    a2: deg(270.0),
                },
                Seg::Arc {
                    c: (w / 2.0, 0.25 * xh),
                    rx,
                    ry,
                    a1: deg(90.0),
                    a2: deg(-160.0),
                },
            ]);
            k
        }
        't' => {
            let w = wln * 1.3;
            let xc = w * 0.42;
            let mut k = Skel::new(p, adv(w));
            k.vstem(xc, 0.0, 0.72 * h);
            k.hbar(0.0, w, xh);
            k
        }
        'u' => {
            // An inverted arch: stems down each side, joined by a bottom bowl
            // that flattens with the same `archf` as n/m/h.
            let w = wl;
            let (xl, xr) = (s / 2.0, w - s / 2.0);
            let rx = (xr - xl) / 2.0;
            let ry = rx * archf;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((xl, xh), (xl, ry)),
                Seg::Arc {
                    c: ((xl + xr) / 2.0, ry),
                    rx,
                    ry,
                    a1: deg(180.0),
                    a2: deg(360.0),
                },
                Seg::Line((xr, ry), (xr, xh)),
            ]);
            k
        }
        'v' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((s / 2.0, xh), (w / 2.0, 0.0)),
                Seg::Line((w / 2.0, 0.0), (w - s / 2.0, xh)),
            ]);
            k
        }
        'w' => {
            let w = wlw;
            let mut k = Skel::new(p, adv(w));
            k.open(&[
                Seg::Line((s / 2.0, xh), (w * 0.28, 0.0)),
                Seg::Line((w * 0.28, 0.0), (w * 0.5, 0.58 * xh)),
                Seg::Line((w * 0.5, 0.58 * xh), (w * 0.72, 0.0)),
                Seg::Line((w * 0.72, 0.0), (w - s / 2.0, xh)),
            ]);
            k
        }
        'x' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.line((s / 2.0, 0.0), (w - s / 2.0, xh));
            k.line((w - s / 2.0, 0.0), (s / 2.0, xh));
            k
        }
        'y' => {
            // The short (left) leg must die *on* the long arm, not run past it to
            // the baseline — otherwise its butt cap pokes out below the junction.
            let w = wl;
            let top_r = (w - s / 2.0, xh);
            let tail = (w * 0.14, -dd);
            // junction = the point on the long arm at ~30% x-height
            let u = (xh - 0.30 * xh) / (xh + dd);
            let jx = top_r.0 + u * (tail.0 - top_r.0);
            let jy = top_r.1 + u * (tail.1 - top_r.1);
            let mut k = Skel::new(p, adv(w));
            k.line((s / 2.0, xh), (jx, jy)); // left leg ends on the long arm
            k.line(top_r, tail); // long arm + descender, one stroke
            k
        }
        'z' => {
            let w = wl;
            let mut k = Skel::new(p, adv(w));
            k.hbar(0.0, w, xh - t / 2.0);
            k.hbar(0.0, w, t / 2.0);
            k.line((w - s / 2.0, xh - t), (s / 2.0, t));
            k
        }

        _ => return None,
    };

    Some(g.finish())
}
