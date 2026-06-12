//! Parametric glyph construction. A small "pen" accumulates contours, applying
//! the seed's stem weight, width, slant and serifs. Letters are built from a
//! compact stroke vocabulary (stems, bars, diagonals, rings, straps) so the
//! whole alphabet stays internally consistent — the same parameters drive every
//! glyph, which is what makes a roll read as one typeface rather than 26
//! unrelated drawings.
//!
//! v1 covers upper- and lowercase Latin, space, and three punctuation marks.
//! Shapes are deliberately geometric/modular; digits, accents and kerning are
//! the next layer. The pipeline (seed→outline→real .ttf) is the same regardless
//! of how many glyphs hang off it.

use crate::geom::{ellipse, estrap as estrap_raw, orient, strap as strap_raw, Glyph, Pt};
use crate::params::Params;

/// Supported characters, in glyph-id order (gid 0 is .notdef, added separately).
pub fn charset() -> &'static [char] {
    &[
        ' ', 'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q',
        'R', 'S', 'T', 'U', 'V', 'W', 'X', 'Y', 'Z', '.', ',', '-', 'a', 'b', 'c', 'd', 'e', 'f',
        'g', 'h', 'i', 'j', 'k', 'l', 'm', 'n', 'o', 'p', 'q', 'r', 's', 't', 'u', 'v', 'w', 'x',
        'y', 'z',
    ]
}

fn d(deg: f64) -> f64 {
    deg.to_radians()
}

struct Pen<'a> {
    p: &'a Params,
    g: Glyph,
    tan: f64,
}

impl<'a> Pen<'a> {
    fn new(p: &'a Params, advance: f64) -> Self {
        Pen {
            p,
            g: Glyph::new(advance),
            tan: p.slant_tan,
        }
    }

    /// Shear (oblique), fix winding, push.
    fn emit(&mut self, raw: Vec<Pt>, cw: bool) {
        let sheared: Vec<Pt> = raw
            .into_iter()
            .map(|(x, y, on)| (x + self.tan * y, y, on))
            .collect();
        self.g.contours.push(orient(sheared, cw));
    }

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

    fn hole(&mut self, x0: f64, y0: f64, x1: f64, y1: f64) {
        self.emit(
            vec![
                (x0, y0, true),
                (x1, y0, true),
                (x1, y1, true),
                (x0, y1, true),
            ],
            false,
        );
    }

    fn quad(&mut self, pts: [(f64, f64); 4]) {
        self.emit(pts.iter().map(|&(x, y)| (x, y, true)).collect(), true);
    }

    /// Diagonal stroke with horizontal thickness `th`.
    fn diag(&mut self, x0: f64, y0: f64, x1: f64, y1: f64, th: f64) {
        self.quad([(x0, y0), (x0 + th, y0), (x1 + th, y1), (x1, y1)]);
    }

    /// A ring (closed annulus): outer ellipse plus a counter-wound hole.
    fn ring(&mut self, cx: f64, cy: f64, rx: f64, ry: f64, t: f64) {
        self.emit(ellipse(cx, cy, rx, ry), true);
        self.emit(ellipse(cx, cy, rx - t, ry - t), false);
    }

    /// A stroked open arc.
    fn strap(&mut self, cx: f64, cy: f64, r: f64, t: f64, a1: f64, a2: f64) {
        self.emit(strap_raw(cx, cy, r, t, a1, a2, 6), true);
    }

    /// An elliptical stroked open arc (independent width/height radii).
    fn estrap(&mut self, cx: f64, cy: f64, rx: f64, ry: f64, t: f64, a1: f64, a2: f64) {
        self.emit(estrap_raw(cx, cy, rx, ry, t, a1, a2, 6), true);
    }

    /// A small filled square — the dot on i and j.
    fn dot(&mut self, cx: f64, cy: f64, r: f64) {
        self.rect(cx - r, cy - r, cx + r, cy + r);
    }

    /// A vertical stem from y0..y1 with the seed's stem weight, plus slab serifs
    /// at any end that reaches the baseline / cap line.
    fn vstem(&mut self, x: f64, y0: f64, y1: f64) {
        let s = self.p.stem;
        self.rect(x, y0, x + s, y1);
        if self.p.serif {
            let l = self.p.serif_len * 0.5;
            let th = self.p.serif_th;
            if y0 <= 1.0 {
                self.rect(x - l, 0.0, x + s + l, th);
            }
            if y1 >= self.p.cap - 1.0 {
                self.rect(x - l, self.p.cap - th, x + s + l, self.p.cap);
            }
        }
    }

    fn finish(self) -> Glyph {
        self.g
    }
}

/// The missing-glyph box (gid 0).
pub fn notdef(p: &Params) -> Glyph {
    let mut pen = Pen::new(p, 560.0);
    pen.tan = 0.0; // never oblique .notdef
    pen.rect(60.0, 0.0, 500.0, 700.0);
    pen.hole(130.0, 80.0, 430.0, 620.0);
    pen.finish()
}

pub fn glyph_for(c: char, p: &Params) -> Glyph {
    let h = p.cap;
    let s = p.stem;
    let t = p.thin;
    let wf = p.width;
    let sb = 0.07 * h;
    // nominal black widths (fraction of cap height, then width-scaled)
    let w_norm = 0.62 * h * wf;
    let w_round = 0.72 * h * wf;
    let w_wide = 0.90 * h * wf;
    let w_narrow = 0.40 * h * wf;

    // lowercase metrics
    let xh = p.xheight; // x-height
    let dd = 0.22 * h; // descender depth (below baseline)
    let wl = 0.54 * h * wf; // standard lowercase width
    let wln = 0.34 * h * wf; // narrow lowercase (i, l, j, f, t)
    let wlw = 0.86 * h * wf; // wide lowercase (m, w)

    match c {
        ' ' => Glyph::new(0.34 * h),

        'A' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.quad([(0.0, 0.0), (s, 0.0), (w / 2.0, h), (w / 2.0 - s, h)]);
            pen.quad([(w - s, 0.0), (w, 0.0), (w / 2.0 + s, h), (w / 2.0, h)]);
            pen.rect(w * 0.20, 0.30 * h, w * 0.80, 0.30 * h + t);
            pen.finish()
        }

        'B' => {
            let mut pen = Pen::new(p, s + 0.30 * h + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.strap(s, 0.73 * h, 0.27 * h, s, d(90.0), d(-90.0));
            pen.strap(s, 0.27 * h, 0.30 * h, s, d(90.0), d(-90.0));
            pen.finish()
        }

        'C' => {
            // Full cap-height ellipse, open at the right — not a small circle.
            let w = w_round;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.estrap(w / 2.0, h / 2.0, w / 2.0, h / 2.0, s, d(55.0), d(305.0));
            pen.finish()
        }

        'D' => {
            let r = h / 2.0;
            let mut pen = Pen::new(p, s + r + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.strap(s, h / 2.0, r * 0.98, s, d(90.0), d(-90.0));
            pen.finish()
        }

        'E' | 'F' => {
            let w = w_norm * 0.95;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.rect(0.0, h - t, w, h);
            pen.rect(0.0, h / 2.0 - t / 2.0, w * 0.86, h / 2.0 + t / 2.0);
            if c == 'E' {
                pen.rect(0.0, 0.0, w, t);
            }
            pen.finish()
        }

        'G' => {
            // Full cap-height C plus the inward spur (bar + short upright).
            let w = w_round;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.estrap(w / 2.0, h / 2.0, w / 2.0, h / 2.0, s, d(55.0), d(305.0));
            pen.rect(w * 0.55, 0.42 * h, w, 0.42 * h + t);
            pen.rect(w - s, 0.0 + 0.10 * h, w, 0.50 * h);
            pen.finish()
        }

        'H' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.vstem(w - s, 0.0, h);
            pen.rect(0.0, h / 2.0 - t / 2.0, w, h / 2.0 + t / 2.0);
            pen.finish()
        }

        'I' => {
            let w = w_narrow;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(w / 2.0 - s / 2.0, 0.0, h);
            pen.finish()
        }

        'J' => {
            let w = w_narrow * 1.3;
            let xr = w - s;
            let r = 0.26 * h;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(xr, r, h);
            pen.strap(xr + s / 2.0 - r, r, r, s, d(180.0), d(350.0));
            pen.finish()
        }

        'K' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.diag(s, 0.48 * h, w, h, s);
            pen.diag(s, 0.48 * h, w, 0.0, s);
            pen.finish()
        }

        'L' => {
            let w = w_norm * 0.9;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.rect(0.0, 0.0, w, t);
            pen.finish()
        }

        'M' => {
            let w = w_wide;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.vstem(w - s, 0.0, h);
            pen.diag(0.0, h, w / 2.0 - s, 0.42 * h, s);
            pen.diag(w - s, h, w / 2.0, 0.42 * h, -s);
            pen.finish()
        }

        'N' => {
            let w = w_round * 0.95;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.vstem(w - s, 0.0, h);
            pen.diag(0.0, h, w - s, 0.0, s);
            pen.finish()
        }

        'O' => {
            let w = w_round;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.ring(w / 2.0, h / 2.0, w / 2.0, h / 2.0, s);
            pen.finish()
        }

        'P' => {
            let mut pen = Pen::new(p, s + 0.28 * h + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.strap(s, 0.72 * h, 0.28 * h, s, d(90.0), d(-90.0));
            pen.finish()
        }

        'Q' => {
            let w = w_round;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.ring(w / 2.0, h / 2.0, w / 2.0, h / 2.0, s);
            pen.diag(w * 0.55, 0.22 * h, w * 0.92, -0.06 * h, s);
            pen.finish()
        }

        'R' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.strap(s, 0.72 * h, 0.28 * h, s, d(90.0), d(-90.0));
            pen.diag(s, 0.46 * h, w, 0.0, s);
            pen.finish()
        }

        'S' => {
            // Modular S: two bars with a stem on each side, joined by a centre
            // bar. Reads unambiguously and matches the geometric house style
            // (the earlier twin-arc form collapsed into two rings).
            let w = w_norm * 0.92;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.rect(0.0, h - t, w, h); // top bar
            pen.rect(0.0, 0.5 * h - t / 2.0, s, h); // upper-left stem
            pen.rect(0.0, 0.5 * h - t / 2.0, w, 0.5 * h + t / 2.0); // middle bar
            pen.rect(w - s, 0.0, w, 0.5 * h + t / 2.0); // lower-right stem
            pen.rect(0.0, 0.0, w, t); // bottom bar
            pen.finish()
        }

        'T' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.rect(0.0, h - t, w, h);
            pen.vstem(w / 2.0 - s / 2.0, 0.0, h - t);
            pen.finish()
        }

        'U' => {
            let w = w_round * 0.92;
            let r = w / 2.0;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.vstem(0.0, r, h);
            pen.vstem(w - s, r, h);
            pen.strap(r, r, r, s, d(180.0), d(360.0));
            pen.finish()
        }

        'V' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.quad([(0.0, h), (s, h), (w / 2.0, 0.0), (w / 2.0 - s, 0.0)]);
            pen.quad([(w - s, h), (w, h), (w / 2.0 + s, 0.0), (w / 2.0, 0.0)]);
            pen.finish()
        }

        'W' => {
            let w = w_wide * 1.05;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.quad([(0.0, h), (s, h), (w * 0.30, 0.0), (w * 0.30 - s, 0.0)]);
            pen.quad([
                (w * 0.30 - s, 0.0),
                (w * 0.30, 0.0),
                (w * 0.5 + s, 0.55 * h),
                (w * 0.5, 0.55 * h),
            ]);
            pen.quad([
                (w * 0.5, 0.55 * h),
                (w * 0.5 + s, 0.55 * h),
                (w * 0.70 + s, 0.0),
                (w * 0.70, 0.0),
            ]);
            pen.quad([(w * 0.70, 0.0), (w * 0.70 + s, 0.0), (w, h), (w - s, h)]);
            pen.finish()
        }

        'X' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.quad([(0.0, 0.0), (s, 0.0), (w, h), (w - s, h)]);
            pen.quad([(w - s, 0.0), (w, 0.0), (s, h), (0.0, h)]);
            pen.finish()
        }

        'Y' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.quad([
                (0.0, h),
                (s, h),
                (w / 2.0, 0.52 * h),
                (w / 2.0 - s, 0.52 * h),
            ]);
            pen.quad([
                (w - s, h),
                (w, h),
                (w / 2.0 + s, 0.52 * h),
                (w / 2.0, 0.52 * h),
            ]);
            pen.vstem(w / 2.0 - s / 2.0, 0.0, 0.54 * h);
            pen.finish()
        }

        'Z' => {
            let w = w_norm;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.rect(0.0, h - t, w, h);
            pen.rect(0.0, 0.0, w, t);
            pen.quad([(w - s, h), (w, h), (s, 0.0), (0.0, 0.0)]);
            pen.finish()
        }

        '.' => {
            let mut pen = Pen::new(p, s + 2.0 * sb);
            pen.rect(0.0, 0.0, s, s);
            pen.finish()
        }

        ',' => {
            let mut pen = Pen::new(p, s + 2.0 * sb);
            pen.rect(0.0, 0.0, s, s);
            pen.quad([(0.0, 0.0), (s, 0.0), (s * 0.2, -0.18 * h), (-0.05 * s, -0.18 * h)]);
            pen.finish()
        }

        '-' => {
            let w = 0.42 * h * wf;
            let mut pen = Pen::new(p, w + 2.0 * sb);
            pen.rect(0.0, 0.44 * h, w, 0.44 * h + t);
            pen.finish()
        }

        // ---- lowercase (x-height bowls/stems; ascenders to cap, descenders to -dd) ----

        'a' => {
            // single-story: bowl with a stem on its right
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.ring((wl - s) / 2.0, xh / 2.0, (wl - s) / 2.0, xh / 2.0, s);
            pen.vstem(wl - s, 0.0, xh);
            pen.finish()
        }

        'b' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.ring((s + wl) / 2.0, xh / 2.0, (wl - s) / 2.0, xh / 2.0, s);
            pen.finish()
        }

        'c' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.estrap(wl / 2.0, xh / 2.0, wl / 2.0, xh / 2.0, s, d(55.0), d(305.0));
            pen.finish()
        }

        'd' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.ring((wl - s) / 2.0, xh / 2.0, (wl - s) / 2.0, xh / 2.0, s);
            pen.vstem(wl - s, 0.0, h);
            pen.finish()
        }

        'e' => {
            // a 'c' arc (open at the right) with a full-width bar across the
            // middle: above the bar closes into the eye, below stays open.
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.estrap(wl / 2.0, xh / 2.0, wl / 2.0, xh / 2.0, s, d(55.0), d(305.0));
            pen.rect(0.0, xh * 0.5 - t / 2.0, wl, xh * 0.5 + t / 2.0);
            pen.finish()
        }

        'f' => {
            let xc = wln * 0.30;
            let mut pen = Pen::new(p, wln + 2.0 * sb);
            pen.rect(xc, 0.0, xc + s, h); // stem (no foot serif → straight)
            pen.rect(0.0, xh - t / 2.0, wln, xh + t / 2.0); // crossbar
            pen.rect(xc, h - t, xc + wln * 0.55, h); // top arm
            pen.finish()
        }

        'g' => {
            // single-story: bowl + a descending stem hooking left
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.ring((wl - s) / 2.0, xh / 2.0, (wl - s) / 2.0, xh / 2.0, s);
            pen.rect(wl - s, -0.7 * dd, wl, xh);
            pen.rect(0.0, -dd, wl - s, -dd + t);
            pen.finish()
        }

        'h' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.vstem(wl - s, 0.0, xh);
            pen.rect(0.0, xh - t, wl, xh);
            pen.finish()
        }

        'i' => {
            let x = wln / 2.0 - s / 2.0;
            let mut pen = Pen::new(p, wln + 2.0 * sb);
            pen.vstem(x, 0.0, xh);
            pen.dot(x + s / 2.0, xh + 0.16 * h, s * 0.55);
            pen.finish()
        }

        'j' => {
            let x = wln * 0.5;
            let mut pen = Pen::new(p, wln + 2.0 * sb);
            pen.rect(x, -dd + t, x + s, xh);
            pen.rect(0.0, -dd, x + s, -dd + t);
            pen.dot(x + s / 2.0, xh + 0.16 * h, s * 0.55);
            pen.finish()
        }

        'k' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.vstem(0.0, 0.0, h);
            pen.diag(s, xh * 0.45, wl, xh, s);
            pen.diag(s, xh * 0.45, wl, 0.0, s);
            pen.finish()
        }

        'l' => {
            let x = wln / 2.0 - s / 2.0;
            let mut pen = Pen::new(p, wln + 2.0 * sb);
            pen.vstem(x, 0.0, h);
            pen.finish()
        }

        'm' => {
            let mut pen = Pen::new(p, wlw + 2.0 * sb);
            pen.vstem(0.0, 0.0, xh);
            pen.vstem(wlw / 2.0 - s / 2.0, 0.0, xh);
            pen.vstem(wlw - s, 0.0, xh);
            pen.rect(0.0, xh - t, wlw, xh);
            pen.finish()
        }

        'n' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.vstem(0.0, 0.0, xh);
            pen.vstem(wl - s, 0.0, xh);
            pen.rect(0.0, xh - t, wl, xh);
            pen.finish()
        }

        'o' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.ring(wl / 2.0, xh / 2.0, wl / 2.0, xh / 2.0, s);
            pen.finish()
        }

        'p' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.rect(0.0, -dd, s, xh);
            pen.ring((s + wl) / 2.0, xh / 2.0, (wl - s) / 2.0, xh / 2.0, s);
            pen.finish()
        }

        'q' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.ring((wl - s) / 2.0, xh / 2.0, (wl - s) / 2.0, xh / 2.0, s);
            pen.rect(wl - s, -dd, wl, xh);
            pen.finish()
        }

        'r' => {
            let wr = 0.42 * h * wf;
            let mut pen = Pen::new(p, wr + 2.0 * sb);
            pen.vstem(0.0, 0.0, xh);
            pen.rect(0.0, xh - t, wr, xh); // arm
            pen.rect(wr - s, xh * 0.62, wr, xh); // short downstroke
            pen.finish()
        }

        's' => {
            let ws = wl * 0.9;
            let mut pen = Pen::new(p, ws + 2.0 * sb);
            pen.rect(0.0, xh - t, ws, xh);
            pen.rect(0.0, xh * 0.5 - t / 2.0, s, xh);
            pen.rect(0.0, xh * 0.5 - t / 2.0, ws, xh * 0.5 + t / 2.0);
            pen.rect(ws - s, 0.0, ws, xh * 0.5 + t / 2.0);
            pen.rect(0.0, 0.0, ws, t);
            pen.finish()
        }

        't' => {
            let xc = wln * 0.38;
            let mut pen = Pen::new(p, wln * 1.2 + 2.0 * sb);
            pen.vstem(xc, 0.0, 0.72 * h);
            pen.rect(0.0, xh - t / 2.0, wln * 1.25, xh + t / 2.0);
            pen.finish()
        }

        'u' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.vstem(0.0, 0.0, xh);
            pen.vstem(wl - s, 0.0, xh);
            pen.rect(0.0, 0.0, wl, t);
            pen.finish()
        }

        'v' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.quad([(0.0, xh), (s, xh), (wl / 2.0, 0.0), (wl / 2.0 - s, 0.0)]);
            pen.quad([(wl - s, xh), (wl, xh), (wl / 2.0 + s, 0.0), (wl / 2.0, 0.0)]);
            pen.finish()
        }

        'w' => {
            let mut pen = Pen::new(p, wlw + 2.0 * sb);
            pen.quad([
                (0.0, xh),
                (s, xh),
                (wlw * 0.30, 0.0),
                (wlw * 0.30 - s, 0.0),
            ]);
            pen.quad([
                (wlw * 0.30 - s, 0.0),
                (wlw * 0.30, 0.0),
                (wlw * 0.5 + s, xh * 0.55),
                (wlw * 0.5, xh * 0.55),
            ]);
            pen.quad([
                (wlw * 0.5, xh * 0.55),
                (wlw * 0.5 + s, xh * 0.55),
                (wlw * 0.70 + s, 0.0),
                (wlw * 0.70, 0.0),
            ]);
            pen.quad([
                (wlw * 0.70, 0.0),
                (wlw * 0.70 + s, 0.0),
                (wlw, xh),
                (wlw - s, xh),
            ]);
            pen.finish()
        }

        'x' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.quad([(0.0, 0.0), (s, 0.0), (wl, xh), (wl - s, xh)]);
            pen.quad([(wl - s, 0.0), (wl, 0.0), (s, xh), (0.0, xh)]);
            pen.finish()
        }

        'y' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.quad([(0.0, xh), (s, xh), (wl / 2.0, 0.0), (wl / 2.0 - s, 0.0)]);
            pen.quad([(wl - s, xh), (wl, xh), (wl / 2.0 + s, 0.0), (wl / 2.0, 0.0)]);
            pen.rect(wl / 2.0 - s / 2.0, -dd, wl / 2.0 + s / 2.0, t);
            pen.finish()
        }

        'z' => {
            let mut pen = Pen::new(p, wl + 2.0 * sb);
            pen.rect(0.0, xh - t, wl, xh);
            pen.rect(0.0, 0.0, wl, t);
            pen.quad([(wl - s, xh), (wl, xh), (s, 0.0), (0.0, 0.0)]);
            pen.finish()
        }

        // Fallback: render the .notdef box so unknown codepoints stay visible.
        _ => notdef(p),
    }
}
