//! The drafting table: metrics derived from a `Style`, and the builder every
//! letter is drawn with. A letter is a few calls — `stem`, `bowl`, `arch`,
//! `arc`, `bar` — in units that already know the x-height, the stem weights,
//! the pen and the overshoot, so a letter's code reads like its construction.

use crate::curve::*;
use crate::ink::{Cap, Ink, Pen, Stroke};
use crate::style::{Serif, Style, Term};

/// How a side of a glyph meets its neighbour, for spacing (Tracy's method):
/// the factor multiplies the case's *straight* sidebearing.
pub mod side {
    pub const STRAIGHT: f64 = 1.0;
    pub const ROUND: f64 = 0.58;
    pub const DIAG: f64 = 0.10;
    pub const OPEN: f64 = 0.40; // c / r / e right, arms of E F T L
    pub const NONE: f64 = 0.0;
}

#[derive(Clone)]
pub struct Metrics {
    pub cap: f64,
    pub xh: f64,
    pub asc: f64,
    pub desc: f64,
    pub over: f64,
    pub stem: f64,  // lowercase stem
    pub ustem: f64, // uppercase stem
    pub pen: Pen,
    pub upen: Pen,
    pub hth: f64,  // lowercase horizontal thickness
    pub uhth: f64, // uppercase horizontal thickness
    pub thin: f64, // thinnest stroke the pen makes (lc)
    pub cn: f64,   // lowercase n counter width
    pub ch: f64,   // uppercase H counter width
    pub tension: f64,
    pub w: f64, // width gene
}

impl Metrics {
    /// The capitals redrawn at x-height with lowercase weights — Cyrillic
    /// lowercase and true small caps.
    pub fn small_caps(&self) -> Metrics {
        let mut m = self.clone();
        m.cap = self.xh * 1.0 + self.over * 0.0;
        m.ustem = self.stem * 1.03;
        m.upen = self.pen.scaled(1.03);
        m.uhth = self.hth * 1.03;
        m.ch = (self.cn * 1.02).max(self.stem * 0.6);
        m
    }
    pub fn new(s: &Style) -> Metrics {
        let p = if s.term == Term::Round { 2.0 } else { s.nib };
        let ratio = if s.term == Term::Round { s.ratio.max(0.6) } else { s.ratio };
        let pen = Pen::for_stem(s.stem, ratio, s.stress, p);
        let ustem = s.stem * 1.09;
        let upen = Pen::for_stem(ustem, ratio, s.stress, p);
        let hth = 2.0 * pen.half_width(UP);
        let uhth = 2.0 * upen.half_width(UP);
        let thin = 2.0 * pen.l.min(pen.s);
        let xh = s.xh;
        let k = ((8.0 * s.sup - 4.0) / 3.0).clamp(0.35, 1.0);
        let tension = (0.5523 / k).clamp(0.55, 1.6);
        let cn = ((xh * 0.585 - (s.stem - 90.0) * 0.22) * s.width).max(s.stem * 0.55).max(40.0);
        let ch = ((s.cap * 0.53 - (ustem - 98.0) * 0.28) * s.width).max(ustem * 0.6).max(60.0);
        Metrics {
            cap: s.cap,
            xh,
            asc: s.asc,
            desc: s.desc,
            over: s.over,
            stem: s.stem,
            ustem,
            pen,
            upen,
            hth,
            uhth,
            thin,
            cn,
            ch,
            tension,
            w: s.width,
        }
    }
}

/// A drawn glyph before spacing: its ink, the spacing class of each side, and
/// optionally a fixed advance (monospace / space / marks).
pub struct Drawn {
    pub ink: Ink,
    pub l: f64,
    pub r: f64,
    pub advance: Option<f64>,
    pub body: Option<(f64, f64)>, // explicit body extent when ink would mislead
}

pub struct B<'a> {
    pub s: &'a Style,
    pub m: &'a Metrics,
    pub ink: Ink,
    pub pen: Pen,
    pub stem: f64,
    pub hth: f64,
    pub uc: bool,
}

pub const HCUT: Cap = Cap::Cut(RIGHT);
pub const VCUT: Cap = Cap::Cut(UP);

impl<'a> B<'a> {
    pub fn lc(s: &'a Style, m: &'a Metrics) -> Self {
        B { s, m, ink: Ink::default(), pen: m.pen, stem: m.stem, hth: m.hth, uc: false }
    }
    pub fn uc(s: &'a Style, m: &'a Metrics) -> Self {
        B { s, m, ink: Ink::default(), pen: m.upen, stem: m.ustem, hth: m.uhth, uc: true }
    }
    pub fn done(self, l: f64, r: f64) -> Drawn {
        Drawn { ink: self.ink, l, r, advance: None, body: None }
    }

    // ---- caps ------------------------------------------------------------
    fn fix(&self, c: Cap) -> Cap {
        if self.s.term == Term::Round {
            match c {
                Cap::Butt => Cap::Butt,
                _ => Cap::Round,
            }
        } else {
            c
        }
    }
    /// The style's terminal for a curved stroke end.
    pub fn tc(&self) -> Cap {
        match self.s.term {
            Term::Horizontal => HCUT,
            Term::Vertical => VCUT,
            Term::Perp => Cap::Square,
            Term::Pen => Cap::Pen,
            Term::Round => Cap::Round,
        }
    }
    /// Terminal cap when a ball will sit on the end (the ball hides the cut).
    pub fn tcb(&self) -> Cap {
        if self.s.ball && self.s.term != Term::Round {
            Cap::Square
        } else {
            self.tc()
        }
    }
    /// Cap for the free ends of C/S/c/s-like arcs: plumb when a beak serif
    /// will hang off it.
    pub fn arc_cap(&self) -> Cap {
        if self.serifed() && !self.s.ball {
            VCUT
        } else {
            self.tcb()
        }
    }
    pub fn serifed(&self) -> bool {
        self.s.serif != Serif::None
    }

    // ---- raw strokes -------------------------------------------------------
    pub fn stroke_pen(&mut self, p: &PathB, pen: Pen, c0: Cap, c1: Cap) {
        let (c0, c1) = (self.fix(c0), self.fix(c1));
        self.ink.stroke(Stroke { segs: p.cubics(), closed: p.closed, pen, cap0: c0, cap1: c1 });
    }
    pub fn stroke(&mut self, p: &PathB, c0: Cap, c1: Cap) {
        let pen = self.pen;
        self.stroke_pen(p, pen, c0, c1);
    }
    pub fn line(&mut self, a: V, b: V, c0: Cap, c1: Cap) {
        self.stroke(&path(a).line(b), c0, c1);
    }
    pub fn line_w(&mut self, a: V, b: V, w0: f64, w1: f64, c0: Cap, c1: Cap) {
        self.stroke(&path(a).w(w0).line(b).w(w1), c0, c1);
    }
    /// How much a "thin" stroke (the `/` diagonals, N's verticals) is thinned
    /// in expansion-contrast styles. The broad-nib pen does this by itself when
    /// the stress is tilted, so the rule fades out as the stress angle grows.
    pub fn thin_w(&self) -> f64 {
        let k = (1.0 - self.s.ratio) * (1.0 - (self.s.stress.abs() / 28.0).clamp(0.0, 1.0));
        (1.0 - k * 0.72).max(0.2)
    }
    /// A diagonal: `/` strokes (rising to the right) take the thin weight.
    pub fn diag(&mut self, a: V, b: V, c0: Cap, c1: Cap) {
        let w = if (b.x - a.x) * (b.y - a.y) > 0.0 { self.thin_w() } else { 1.0 };
        self.line_w(a, b, w, w, c0, c1);
    }
    /// Force a diagonal's weight class (`thick`: full weight).
    pub fn diag_as(&mut self, a: V, b: V, thick: bool, c0: Cap, c1: Cap) {
        let w = if thick { 1.0 } else { self.thin_w() };
        self.line_w(a, b, w, w, c0, c1);
    }
    /// Vertical stem, centreline at `x`, flat-cut at both ends.
    pub fn stem(&mut self, x: f64, y0: f64, y1: f64) {
        self.line(v(x, y0), v(x, y1), HCUT, HCUT);
    }
    /// Horizontal bar, centreline at `y`, ends cut plumb (or buried).
    pub fn bar(&mut self, x0: f64, x1: f64, y: f64, c0: Cap, c1: Cap) {
        self.line(v(x0, y), v(x1, y), c0, c1);
    }
    pub fn fill(&mut self, p: Vec<V>) {
        self.ink.fill(p);
    }
    pub fn t(&self) -> f64 {
        self.m.tension
    }

    // ---- ellipse helpers -------------------------------------------------
    /// Superellipse exponent from the style's superness.
    pub fn sexp(&self) -> f64 {
        (-(2f64.ln()) / self.s.sup.ln()).clamp(1.6, 6.0)
    }
    /// Point and CCW unit tangent on the superellipse at parameter `deg`.
    pub fn ell(&self, cx: f64, cy: f64, rx: f64, ry: f64, deg: f64) -> (V, V) {
        let e = 2.0 / self.sexp();
        let t = deg.to_radians();
        let (s, c) = t.sin_cos();
        let pw = |x: f64| x.signum() * x.abs().powf(e);
        let p = v(cx + rx * pw(c), cy + ry * pw(s));
        let dp = |x: f64| e * x.abs().max(1e-4).powf(e - 1.0);
        let d = v(-rx * s * dp(c), ry * c * dp(s)).norm();
        (p, d)
    }
    /// A path along the superellipse from `a0` to `a1` degrees (CCW if a1 > a0).
    pub fn arc(&self, cx: f64, cy: f64, rx: f64, ry: f64, a0: f64, a1: f64) -> PathB {
        let ccw = a1 > a0;
        let sgn = if ccw { 1.0 } else { -1.0 };
        let (p0, d0) = self.ell(cx, cy, rx, ry, a0);
        let mut pb = path_d(p0, d0 * sgn).tension(self.t());
        // quadrant knots strictly between
        let mut q = (a0 / 90.0).floor() * 90.0;
        let mut ks = Vec::new();
        if ccw {
            q += 90.0;
            while q < a1 - 1e-6 {
                if q > a0 + 1e-6 {
                    ks.push(q);
                }
                q += 90.0;
            }
        } else {
            q = (a0 / 90.0).ceil() * 90.0 - 90.0;
            if (q - a0).abs() < 1e-6 {
                q -= 90.0;
            }
            while q > a1 + 1e-6 {
                ks.push(q);
                q -= 90.0;
            }
        }
        for a in ks {
            let (p, d) = self.ell(cx, cy, rx, ry, a);
            pb = pb.to(p, d * sgn);
        }
        let (p1, d1) = self.ell(cx, cy, rx, ry, a1);
        pb.to(p1, d1 * sgn)
    }

    /// Closed round bowl whose *ink* spans x0..x1, y0..y1 (overshoot included by caller).
    pub fn oval(&mut self, x0: f64, x1: f64, y0: f64, y1: f64) {
        let sw = self.stem * 1.04;
        let cx = (x0 + x1) / 2.0;
        let cy = (y0 + y1) / 2.0;
        let rx = ((x1 - x0) - sw) / 2.0;
        let ry = ((y1 - y0) - self.hth) / 2.0;
        let t = self.t();
        let side = 1.04;
        let p = path_d(v(cx, cy - ry), RIGHT)
            .tension(t)
            .to(v(cx + rx, cy), UP)
            .w(side)
            .to(v(cx, cy + ry), LEFT)
            .to(v(cx - rx, cy), DOWN)
            .w(side)
            .close();
        self.stroke(&p, Cap::Butt, Cap::Butt);
    }

    /// Ellipse centre & radii (centreline) for ink box x0..x1, y0..y1.
    pub fn ebox(&self, x0: f64, x1: f64, y0: f64, y1: f64) -> (f64, f64, f64, f64) {
        let sw = self.stem * 1.04;
        ((x0 + x1) / 2.0, (y0 + y1) / 2.0, ((x1 - x0) - sw) / 2.0, ((y1 - y0) - self.hth) / 2.0)
    }

    /// A bowl hung on a vertical stem (b d p q, B D P R, a). The ink spans
    /// y0..y1 vertically and reaches out to `far` (the outer ink edge) from the
    /// stem centred at `xs`. Top/bottom joins meet the stem at `yt`/`yb`
    /// (None = the bowl meets the stem flat, as in D/B/P — a horizontal run).
    pub fn bowl(&mut self, xs: f64, far: f64, y0: f64, y1: f64, jt: Option<f64>, jb: Option<f64>) {
        let dir = if far > xs { 1.0 } else { -1.0 };
        let sw = self.stem * 1.04;
        let xf = far - dir * sw / 2.0; // far side centreline
        let yt = y1 - self.hth / 2.0;
        let yb = y0 + self.hth / 2.0;
        let ym = (y0 + y1) / 2.0;
        let t = self.t();
        let tr = 1.0 - self.s.trap;
        let span = (xf - xs).abs();
        // x of the top/bottom extremes: a bit toward the far side for joins
        let xm = xs + (xf - xs) * 0.5;
        let fwd = v(dir, 0.0);
        let mut p;
        match jt {
            Some(y) => {
                let a = dir_to(v(dir * 0.55, 1.0));
                p = path_d(v(xs, y), a).w(tr).tension(t);
                p = p.to(v(xs + (xf - xs) * 0.55, yt), fwd).w(1.0);
            }
            None => {
                let xflat = xs + dir * (span * 0.42 * (self.s.sup - 0.5) * 2.0).max(1.0);
                p = path(v(xs, yt)).line(v(xflat, yt)).tension(t);
                let _ = xm;
            }
        }
        p = p.to(v(xf, ym), v(0.0, -1.0)).w(1.04);
        match jb {
            Some(y) => {
                p = p.to(v(xs + (xf - xs) * 0.55, yb), -fwd).w(1.0);
                // low joins come in nearly level, so the bowl can't poke out
                // past the stem's far side
                let lift = ((y - y0) / (y1 - y0)).clamp(0.0, 1.0);
                let a = dir_to(v(-dir, 0.35 + lift * 1.4));
                p = p.to(v(xs + dir * self.stem * 0.08, y), a).w(tr);
            }
            None => {
                let xflat = xs + dir * (span * 0.42 * (self.s.sup - 0.5) * 2.0).max(1.0);
                p = p.to(v(xflat, yb), -fwd).line(v(xs, yb));
            }
        }
        self.stroke(&p, Cap::Butt, Cap::Butt);
    }

    /// The n-arch: from the stem at `xl` (joining at height `yj`) over the
    /// shoulder to the right stem at `xr`, which it then descends to `y_end`.
    pub fn arch(&mut self, xl: f64, xr: f64, top: f64, y_end: f64, join: f64) {
        let tr = 1.0 - self.s.trap;
        let yt = top - self.hth / 2.0;
        let sq = self.s.sup; // squarer shoulder → lower, flatter
        let ysh = top - (top * (0.52 - (sq - 0.70) * 1.3)).clamp(top * 0.22, top * 0.6);
        let xm = xl + (xr - xl) * 0.52;
        let p = path_d(v(xl, join), dir_to(v(0.5, 1.0)))
            .w(tr)
            .tension(self.t())
            .to(v(xm, yt), RIGHT)
            .w(1.0)
            .to(v(xr, ysh), DOWN)
            .line(v(xr, y_end));
        self.stroke(&p, Cap::Butt, HCUT);
    }

    // ---- serifs ------------------------------------------------------------
    fn serif_dims(&self) -> (f64, f64, f64, f64) {
        let st = self.stem;
        let len = self.s.serif_len * st * 0.62;
        let th = match self.s.serif {
            Serif::Hairline => (self.m.thin * 1.1).max(st * 0.05).max(8.0),
            _ => (self.s.serif_th * st).max(self.m.thin * 0.9).max(8.0),
        };
        let bw = len * self.s.bracket * 0.9;
        let bh = (th * 1.4 + st * 0.35) * self.s.bracket;
        (len, th, bw, bh)
    }

    /// A horizontal serif at a stem end: stem centre `x`, the stem's edge line
    /// `y` (baseline, x-height, cap height…), pointing `up` (a foot) or down (a
    /// head). `l`/`r` choose which sides get it.
    pub fn serif(&mut self, x: f64, y: f64, up: bool, l: bool, r: bool) {
        if !self.serifed() {
            return;
        }
        let (len, th, bw, bh) = self.serif_dims();
        let hs = self.stem / 2.0;
        let sg = if up { 1.0 } else { -1.0 };
        let x0 = if l { x - hs - len } else { x - hs * 0.9 };
        let x1 = if r { x + hs + len } else { x + hs * 0.9 };
        let yy = y + sg * th;
        self.fill(vec![v(x0, y), v(x1, y), v(x1, yy), v(x0, yy)]);
        if bw > 1.0 && bh > 1.0 {
            for (on, sx) in [(l, -1.0), (r, 1.0)] {
                if on {
                    self.fill(bracket(v(x + sx * hs * 0.98, yy), sx * bw, sg * bh));
                }
            }
        }
    }
    /// Serif at a stem's foot (baseline or other bottom) — both sides.
    pub fn foot(&mut self, x: f64, y: f64) {
        self.serif(x, y, true, true, true);
    }
    /// Lowercase head serif at the top-left of a stem: flat both-sided when
    /// `head` is ~0 (or slab), an angled wedge pointing left otherwise.
    pub fn head(&mut self, x: f64, top: f64) {
        if !self.serifed() {
            return;
        }
        let (len, th, _, bh) = self.serif_dims();
        let hs = self.stem / 2.0;
        if self.s.head < 3.0 || self.s.serif != Serif::Bracketed {
            self.serif(x, top, false, true, self.s.serif == Serif::Slab);
            return;
        }
        let slope = self.s.head.to_radians().tan();
        let reach = len * 1.1 + hs * 0.3;
        let x0 = x - hs - reach;
        let ytip = top - (reach + 2.0 * hs) * slope;
        let under = ytip - th;
        self.fill(vec![
            v(x + hs, top),
            v(x0, ytip),
            v(x0 + th * 0.4, under),
            v(x - hs * 0.95, under - bh * 0.7 - th * 0.3),
            v(x + hs, under - bh * 0.7 - th * 0.3),
        ]);
        // cut the stem's top along the same slope
        self.ink.holes.push(vec![v(x + hs, top), v(x0 - 4.0, ytip), v(x0 - 4.0, top + 40.0), v(x + hs, top + 40.0)]);
    }
    /// Remove ink inside a box (clips apexes, trims overshoot).
    pub fn clip(&mut self, x0: f64, x1: f64, y0: f64, y1: f64) {
        self.ink.holes.push(vec![v(x0, y0), v(x1, y0), v(x1, y1), v(x0, y1)]);
    }
    /// A vertical "beak" serif on the end of a horizontal arm (E F T L Z, C G S
    /// terminals in serif styles). `x` = the arm's outer end, `y` = the arm's
    /// outer edge; hangs down (`down`) or rises.
    pub fn beak(&mut self, x: f64, y: f64, down: bool, h_mul: f64) {
        if !self.serifed() {
            return;
        }
        let (len, th, _, _) = self.serif_dims();
        let sg = if down { -1.0 } else { 1.0 };
        let case = if self.uc { 1.0 } else { 0.78 };
        let h = self.hth * 0.9 + (len * 0.95 + th * 0.55) * h_mul * case;
        let (w0, w1) = match self.s.serif {
            Serif::Slab => (self.stem * 0.5, self.stem * 0.5),
            Serif::Hairline => (self.m.thin * 1.4 + 4.0, self.m.thin * 1.1 + 3.0),
            _ => (self.stem * 0.55, self.stem * 0.26),
        };
        self.fill(vec![
            v(x, y),
            v(x, y + sg * h),
            v(x - w1, y + sg * h),
            v(x - w0, y + sg * self.hth * 0.8),
            v(x - w0 * 1.6, y),
        ]);
    }
    /// A beak hung off an arc terminal (centreline point `p`, cut plumb): on
    /// the outer edge, running along the cut; `down` for an upper terminal. Its
    /// body lies on the stroke's side: left for a right-hand terminal.
    pub fn beak_at(&mut self, p: V, down: bool) {
        let sg = if down { 1.0 } else { -1.0 };
        let edge = p.y + sg * self.hth * 0.5;
        if down {
            self.beak(p.x, edge, true, 0.75);
        } else {
            self.beak_m(p.x, edge, false, 0.75);
        }
    }
    /// Beak pointing left (for arm ends on the left, e.g. Z's bottom-left? no—
    /// mirrored helper for general use).
    pub fn beak_m(&mut self, x: f64, y: f64, down: bool, h_mul: f64) {
        let before = self.ink.fills.len();
        self.beak(x, y, down, h_mul);
        for f in self.ink.fills.iter_mut().skip(before) {
            for p in f.iter_mut() {
                p.x = 2.0 * x - p.x;
            }
        }
    }

    // ---- dots, balls -------------------------------------------------------
    pub fn dot(&mut self, c: V, size: f64) {
        match self.s.term {
            Term::Horizontal => {
                let h = size / 2.0;
                self.fill(vec![v(c.x - h, c.y - h), v(c.x + h, c.y - h), v(c.x + h, c.y + h), v(c.x - h, c.y + h)]);
            }
            Term::Pen => {
                let pen = Pen { s: self.pen.s.max(self.pen.l * 0.72), ..self.pen };
                let k = size / (2.0 * pen.l.max(pen.s)) * 1.1;
                let o = pen.outline(c, k);
                self.fill(o);
            }
            _ => {
                let o = Pen::circle(size / 2.0).outline(c, 1.0);
                self.fill(o);
            }
        }
    }
    pub fn dot_size(&self) -> f64 {
        (self.stem * 1.12).max(self.hth * 1.3).max(self.m.thin * 2.0)
    }
    /// Ball terminal at the end of a stroke, pulled toward `inward`.
    pub fn ball(&mut self, end: V, inward: V, r: f64) {
        let c = end + inward.norm() * (r * 0.62);
        let o = Pen::circle(r).outline(c, 1.0);
        self.fill(o);
    }
    pub fn ball_r(&self) -> f64 {
        (self.stem * 0.56).max(self.hth * 0.9)
    }
}

pub fn dir_to(d: V) -> V {
    d.norm()
}

/// A bracket fillet: the concave wedge filling the corner between a serif's
/// top (horizontal, at `corner.y`) and a stem side (vertical, at `corner.x`).
/// `bw` runs along the serif (signed), `bh` up the stem (signed).
fn bracket(corner: V, bw: f64, bh: f64) -> Vec<V> {
    let mut pts = vec![corner];
    let c = v(corner.x + bw, corner.y + bh);
    let n = 12;
    for i in 0..=n {
        let t = i as f64 / n as f64 * std::f64::consts::FRAC_PI_2;
        pts.push(v(c.x - bw * t.sin(), c.y - bh * t.cos()));
    }
    pts
}
