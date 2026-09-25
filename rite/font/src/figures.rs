//! Figures: lining and tabular (every digit one advance), drawn from the same
//! arcs, terminals and weights as the letters so they sit in the same voice.

use crate::build::{side::*, Drawn, Metrics, B, HCUT, VCUT};
use crate::curve::*;
use crate::ink::Cap;
use crate::lower::{c_terms, dir_to_v, term_ball};
use crate::style::{Serif, Style, Term};


fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Figure body width (tabular).
pub fn fig_w(s: &Style, m: &Metrics) -> f64 {
    (m.ch + 2.0 * m.ustem) * lerp(0.88, 0.80, s.prop)
}

pub fn fig_adv(s: &Style, m: &Metrics) -> f64 {
    fig_w(s, m) + 2.0 * crate::space::sb_uc(s, m) * 0.75
}

/// Map for the rotated twin (6 → 9): 180° about the figure's centre.
struct Rot {
    on: bool,
    w: f64,
    h: f64,
}
impl Rot {
    fn p(&self, p: V) -> V {
        if self.on {
            v(self.w - p.x, self.h - p.y)
        } else {
            p
        }
    }
    fn d(&self, d: V) -> V {
        if self.on {
            -d
        } else {
            d
        }
    }
    fn path(&self, pb: PathB) -> PathB {
        if !self.on {
            return pb;
        }
        let mut pb = pb;
        for k in pb.knots.iter_mut() {
            k.p = self.p(k.p);
            k.din = k.din.map(|d| -d);
            k.dout = k.dout.map(|d| -d);
        }
        pb
    }
}

pub fn draw(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    if !c.is_ascii_digit() {
        return None;
    }
    let mut b = B::uc(s, m);
    // figures a hair lighter than caps
    b.pen = m.upen.scaled(0.97);
    b.stem = m.ustem * 0.97;
    let h = m.cap;
    let o = m.over;
    let st = b.stem;
    let hs = st / 2.0;
    let th = b.hth;
    let w = fig_w(s, m);
    let serif = s.serif != Serif::None;
    let (at, ab) = c_terms(s);
    let t = b.t();
    match c {
        '0' => {
            b.oval(0.0, w * 0.96, -o, h + o);
        }
        '1' => {
            let xs = w * 0.56;
            b.stem(xs, 0.0, h);
            // flag
            let fl = w * lerp(0.34, 0.42, s.prop);
            b.line_w(v(xs - hs * 0.2, h - th * 0.3), v(xs - fl, h - w * 0.36), b.thin_w().min(0.9), b.thin_w().min(0.8), Cap::Butt, if serif { Cap::Square } else { b.tc_line() });
            if serif {
                b.serif(xs, 0.0, true, true, true);
                let (len, _, _, _) = (0.0, 0.0, 0.0, 0.0);
                let _ = len;
                b.bar(xs - w * 0.3, xs + w * 0.3, th * 0.5, VCUT, VCUT);
            }
            b.clip(-100.0, w + 100.0, h, h + 300.0);
        }
        '2' => {
            let rx = (w - st) * 0.48;
            let ry = h * 0.25;
            let cx = w * 0.5;
            let cy = h + o * 0.5 - th / 2.0 - ry;
            let a0 = 180.0 - at * 0.95;
            let p = b
                .arc(cx, cy, rx, ry, a0, 0.0)
                .tension(t)
                .to(v(w * 0.30, h * 0.24), dir_to_v(-1.0, -1.05))
                .to(v(hs * 0.9, th * 0.5), dir_to_v(-0.8, -1.0));
            b.stroke(&p, b.arc_cap(), Cap::Butt);
            term_ball(&mut b, cx, cy, rx, ry, a0);
            b.bar(hs * 0.4, w, th / 2.0, Cap::Butt, VCUT);
            if serif && !s.ball {
                let (p, _) = b.ell(cx, cy, rx, ry, a0);
                b.beak_m(p.x - hs * 0.2, h + o * 0.3, true, 0.5);
                b.beak(w, 0.0, false, 0.6);
            }
        }
        '3' => {
            let ym = h * 0.555; // waist centreline
            let top_c = h + o - th / 2.0;
            let bot_c = -o + th / 2.0;
            let rxu = (w - st) * 0.44;
            let cxu = w * 0.49;
            let (cyu, ryu) = ((top_c + ym) / 2.0, (top_c - ym) / 2.0);
            let rxl = (w - st) * 0.5;
            let cxl = w * 0.5;
            let (cyl, ryl) = ((bot_c + ym) / 2.0, (ym - bot_c) / 2.0);
            let a0 = 180.0 - at * 0.95;
            let tail = w * 0.16;
            let up = b.arc(cxu, cyu, rxu, ryu, a0, -90.0).line(v(cxu - tail, ym));
            b.stroke(&up, b.arc_cap(), Cap::Butt);
            let a1 = 180.0 + ab * 0.95;
            let lo = path(v(cxl - tail, ym)).line(v(cxl, ym)).then(b.arc(cxl, cyl, rxl, ryl, 90.0, a1 - 360.0));
            b.stroke(&lo, Cap::Butt, b.arc_cap());
            term_ball(&mut b, cxu, cyu, rxu, ryu, a0);
            term_ball(&mut b, cxl, cyl, rxl, ryl, a1);
        }
        '4' => {
            let xs = w * 0.70;
            let yb = h * 0.27;
            b.stem(xs, 0.0, h);
            b.diag_as(v(xs - hs * 0.4, h - th * 0.1), v(hs * 0.6, yb), false, Cap::Butt, Cap::Butt);
            b.bar(hs * 0.1, w, yb, Cap::Butt, VCUT);
            b.clip(-100.0, w + 100.0, h, h + 300.0);
            b.clip(-100.0, hs * 0.1, -100.0, h);
            if serif {
                b.foot(xs, 0.0);
            }
        }
        '5' => {
            let xv = hs + w * 0.07;
            let yv = h * 0.55;
            b.bar(xv - hs * 0.9, w * 0.94, h - th / 2.0, Cap::Butt, VCUT);
            b.line_w(v(xv, h - th * 0.4), v(xv - w * 0.02, yv - th * 0.2), 0.9, 0.9, Cap::Butt, Cap::Butt);
            let rx = (w - st) * 0.5;
            let ry = h * 0.33;
            let cx = w * 0.5;
            let cy = -o + th / 2.0 + ry;
            let a1 = 180.0 + ab * 0.95;
            // the bowl grows out of the vertical's centreline, cut along it
            let p = path_d(v(xv - w * 0.02, yv), dir_to_v(0.6, 0.55))
                .tension(t)
                .to(v(cx - rx * 0.1, cy + ry), RIGHT)
                .then(b.arc(cx, cy, rx, ry, 70.0, a1 - 360.0));
            b.stroke(&p, crate::build::along(v(xv, h), v(xv - w * 0.02, yv - th * 0.2)), b.arc_cap());
            term_ball(&mut b, cx, cy, rx, ry, a1);
            if serif {
                b.beak(w * 0.94, h, true, 0.6);
            }
        }
        '6' | '9' => {
            let r = Rot { on: c == '9', w, h };
            let lh = h * 0.62;
            let (lx0, lx1) = (0.0, w * 0.97);
            // the loop
            let (cx, cy, rx, ry) = b.ebox(lx0, lx1, -o, lh);
            let lp = path_d(v(cx, cy - ry), RIGHT)
                .tension(t)
                .to(v(cx + rx, cy), UP)
                .w(1.03)
                .to(v(cx, cy + ry), LEFT)
                .to(v(cx - rx, cy), DOWN)
                .w(1.03)
                .close();
            b.stroke(&r.path(lp), Cap::Butt, Cap::Butt);
            // the rising stroke: from the loop's left side up to the top terminal
            let brx = (w - st) * 0.5;
            let bry = (h + o - th / 2.0) - cy;
            let a1 = at * 0.9;
            let (pt, dt) = b.ell(cx, cy, brx, bry, a1);
            let p = path_d(v(cx - rx, cy), UP).tension(t).to(v(cx + brx * 0.02, cy + bry), RIGHT).to(pt, -dt);
            b.stroke(&r.path(p), Cap::Butt, b.arc_cap());
            if s.ball && s.term != Term::Round {
                let rr = b.ball_r();
                let inward = r.d(v(cx - pt.x, cy - pt.y).norm());
                b.ball(r.p(pt), inward, rr);
            }
        }
        '7' => {
            b.bar(0.0, w, h - th / 2.0, if serif { Cap::Butt } else { VCUT }, Cap::Butt);
            let foot = w * lerp(0.36, 0.30, s.prop);
            b.diag_as(v(w - hs * 0.6, h - th * 0.3), v(foot, 0.0), true, Cap::Butt, HCUT);
            b.clip(w - 1.0, w + 200.0, 0.0, h + 200.0);
            b.clip(-100.0, w + 200.0, h, h + 200.0);
            if serif {
                b.beak_m(0.0, h, true, 0.6);
            }
        }
        '8' => {
            let waist = h * 0.54;
            let wu = w * 0.86;
            b.oval((w - wu) / 2.0, (w + wu) / 2.0, waist - th * 0.5, h + o);
            b.oval(0.0, w, -o, waist + th * 0.5);
        }
        _ => return None,
    }
    let mut d = b.done(STRAIGHT, STRAIGHT);
    d.advance = Some(fig_adv(s, m));
    Some(d)
}

impl<'a> B<'a> {
    /// Free end of a straight stroke (the `1` flag, arms): the style's cut.
    pub fn tc_line(&self) -> Cap {
        match self.s.term {
            Term::Round => Cap::Round,
            Term::Pen => self.tc(),
            _ => HCUT,
        }
    }
}
