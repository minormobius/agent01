//! Uppercase Latin. Proportions come in two flavours per letter — *uniform*
//! (the grotesque habit: every cap about as wide as H) and *classical* (the
//! Roman inscriptional habit: O a circle, M wide, E F L S half-width) — and the
//! `prop` gene blends between them.

use crate::build::{side::*, Drawn, Metrics, B, HCUT, VCUT};
use crate::curve::*;
use crate::ink::Cap;
use crate::lower::{c_terms, dir_to_v, draw_s, term_ball};
use crate::style::{Serif, Style, Term};

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Cap body width: H-relative, uniform ↔ classical.
pub fn cw(s: &Style, m: &Metrics, uni: f64, cla: f64) -> f64 {
    (m.ch + 2.0 * m.ustem) * lerp(uni, cla, s.prop)
}


pub fn draw(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::uc(s, m);
    let cap = m.cap;
    let o = m.over;
    let st = m.ustem;
    let hs = st / 2.0;
    let th = m.uhth;
    let sharp = s.term == Term::Perp;
    let bar = cap * s.bar; // crossbar centreline for H E F
    let serif = s.serif != Serif::None;
    let tw = b.thin_w();
    let d: Drawn = match c {
        'H' => {
            let w = cw(s, m, 1.0, 1.0);
            b.stem(hs, 0.0, cap);
            b.stem(w - hs, 0.0, cap);
            b.bar(hs, w - hs, bar, Cap::Butt, Cap::Butt);
            for x in [hs, w - hs] {
                b.foot(x, 0.0);
                b.serif(x, cap, false, true, true);
            }
            b.done(STRAIGHT, STRAIGHT)
        }
        'I' => {
            b.stem(hs, 0.0, cap);
            b.foot(hs, 0.0);
            b.serif(hs, cap, false, true, true);
            b.done(STRAIGHT, STRAIGHT)
        }
        'E' | 'F' => {
            let w = if c == 'E' { cw(s, m, 0.84, 0.64) } else { cw(s, m, 0.80, 0.60) };
            b.stem(hs, 0.0, cap);
            let armc = if serif { Cap::Butt } else { VCUT };
            b.bar(hs, w, cap - th / 2.0, Cap::Butt, armc);
            let mb = if c == 'E' { bar } else { bar * 0.95 };
            b.bar(hs, w * 0.9, mb, Cap::Butt, armc);
            if c == 'E' {
                b.bar(hs, w * 1.02, th / 2.0, Cap::Butt, armc);
                b.beak(w * 1.02, 0.0, false, 0.9);
            }
            b.beak(w, cap, true, 0.8);
            if serif {
                // small vertical serifs on the middle arm
                let (x, h) = (w * 0.9, th * 0.9 + st * 0.35);
                let ww = st * 0.28;
                b.fill(vec![v(x, mb - h), v(x, mb + h), v(x - ww, mb + th * 0.5), v(x - ww, mb - th * 0.5)]);
            }
            b.foot(hs, 0.0);
            b.serif(hs, cap, false, true, false);
            if c == 'F' {
                b.serif(hs, 0.0, true, true, true);
            }
            b.done(STRAIGHT, OPEN)
        }
        'L' => {
            let w = cw(s, m, 0.76, 0.58);
            b.stem(hs, 0.0, cap);
            b.bar(hs, w, th / 2.0, Cap::Butt, if serif { Cap::Butt } else { VCUT });
            b.beak(w, 0.0, false, 0.9);
            b.serif(hs, cap, false, true, true);
            b.serif(hs, 0.0, true, true, false);
            b.done(STRAIGHT, OPEN * 0.6)
        }
        'T' => {
            let w = cw(s, m, 0.90, 0.88);
            let armc = if serif { Cap::Butt } else { VCUT };
            b.bar(0.0, w, cap - th / 2.0, armc, armc);
            b.stem(w / 2.0, 0.0, cap - th * 0.5);
            b.beak(w, cap, true, 0.8);
            b.beak_m(0.0, cap, true, 0.8);
            b.foot(w / 2.0, 0.0);
            b.done(OPEN * 0.35, OPEN * 0.35)
        }
        'O' | 'Q' => {
            let w = o_cap(s, m);
            b.oval(0.0, w, -o, cap + o);
            if c == 'Q' {
                let (cx, _cy, rx, _) = b.ebox(0.0, w, -o, cap + o);
                // tail: a stroke crossing the bowl's bottom, out to the right
                let x0 = cx + rx * lerp(0.05, -0.1, s.prop);
                let y0 = cap * 0.14;
                let x1 = w + st * lerp(0.2, 0.9, s.prop);
                let y1 = -cap * lerp(0.06, 0.16, s.prop);
                if s.prop > 0.5 {
                    let p = path_d(v(x0, y0), dir_to_v(0.6, -1.0)).tension(b.t()).to(v(x1, y1), dir_to_v(1.0, -0.15)).w(0.75);
                    b.stroke(&p, Cap::Butt, b.tc());
                } else {
                    b.diag_as(v(x0 + st * 0.3, y0 + st * 0.3), v(x1 - st * 0.2, y1), true, Cap::Butt, HCUT);
                }
            }
            let mut d = b.done(ROUND, ROUND);
            if c == 'Q' {
                // the tail overhangs; space the Q as an O
                d.body = Some((0.0, w));
            }
            d
        }
        'C' | 'G' => {
            let w = o_cap(s, m) * if c == 'C' { 0.93 } else { 0.98 };
            let (cx, cy, rx, ry) = b.ebox(0.0, w, -o, cap + o);
            let (at, ab) = c_terms(s);
            let at = at * 0.92 + 2.0;
            let tc = b.arc_cap();
            if c == 'C' {
                let p = b.arc(cx, cy, rx, ry, at, 360.0 - ab * 0.92);
                b.stroke(&p, tc, tc);
                term_ball(&mut b, cx, cy, rx, ry, 360.0 - ab * 0.92);
            } else {
                // G: bottom arc climbs into a short vertical, crossbar inward
                let ybar = cap * lerp(0.46, 0.52, s.bar - 0.38);
                let xg = cx + rx;
                let p = b.arc(cx, cy, rx, ry, at, 360.0 - 8.0);
                let (pe, _) = b.ell(cx, cy, rx, ry, 360.0 - 8.0);
                let p = if pe.y < ybar - th { p.line(v(xg, ybar)) } else { p };
                b.stroke(&p, tc, Cap::Cut(RIGHT));
                b.bar(xg + hs * 0.9, xg - rx * lerp(0.62, 0.45, s.prop), ybar - th / 2.0, Cap::Butt, VCUT);
                if s.spur && !serif {
                    b.stem(xg, -o * 0.0, ybar);
                    b.line(v(xg, pe.y.min(cy * 0.6)), v(xg, 0.0), Cap::Butt, HCUT);
                }
                if serif {
                    b.stem(xg, cap * 0.08, ybar);
                }
            }
            term_ball(&mut b, cx, cy, rx, ry, at);
            if !s.ball && serif {
                let (p, _) = b.ell(cx, cy, rx, ry, at);
                b.beak_at(p, true);
            }
            b.done(ROUND, if c == 'C' { OPEN * 1.1 } else { STRAIGHT * 0.8 })
        }
        'D' => {
            let w = cw(s, m, 1.02, 1.08);
            b.stem(hs, 0.0, cap);
            b.bowl(hs, w, 0.0, cap, None, None);
            b.serif(hs, 0.0, true, true, false);
            b.serif(hs, cap, false, true, false);
            b.done(STRAIGHT, ROUND)
        }
        'B' | 'P' | 'R' => {
            let w = match c {
                'B' => cw(s, m, 0.92, 0.78),
                'P' => cw(s, m, 0.92, 0.76),
                _ => cw(s, m, 0.96, 0.82),
            };
            let waist = if c == 'B' { cap * lerp(0.52, 0.55, s.bar - 0.38) } else { cap * lerp(0.44, 0.50, s.bar - 0.38) };
            b.stem(hs, 0.0, cap);
            let wu = if c == 'B' { w * 0.9 } else { w };
            b.bowl(hs, wu, waist - th / 2.0, cap, None, None);
            if c == 'B' {
                b.bowl(hs, w, 0.0, waist + th / 2.0, None, None);
            }
            if c == 'R' {
                let xj = hs + (w - hs) * lerp(0.42, 0.52, s.leg_r);
                let yj = waist;
                if s.leg_r > 0.5 && serif {
                    // curled leg (Caslon / Baskerville): falls then kicks out
                    let p = path_d(v(xj, yj), dir_to_v(0.7, -1.0))
                        .tension(b.t())
                        .to(v(w - st * 0.55, cap * 0.1), DOWN)
                        .to(v(w + st * 0.35, -o * 0.3 + th * 0.5), RIGHT)
                        .w(0.6);
                    b.stroke(&p, Cap::Butt, Cap::Butt);
                } else {
                    b.diag_as(v(xj, yj), v(w - st * 0.45, 0.0), true, Cap::Butt, HCUT);
                    b.serif(w - st * 0.45, 0.0, true, true, true);
                }
            }
            if c == 'B' || c == 'P' && false {
                b.serif(hs, 0.0, true, true, false);
            } else {
                b.foot(hs, 0.0);
            }
            b.serif(hs, cap, false, true, false);
            b.done(STRAIGHT, if c == 'R' { DIAG * 2.0 } else { ROUND })
        }
        'J' => {
            let w = cw(s, m, 0.70, 0.52);
            let xs = w - hs;
            let rx = (xs - st * 0.4) * 0.5;
            let ry = cap * 0.2;
            let cy = -o + th / 2.0 + ry;
            let (at, _) = c_terms(s);
            let a1 = -(180.0 - at * 0.8);
            let p = path(v(xs, cap)).line(v(xs, cy)).then(b.arc(xs - rx, cy, rx, ry, 0.0, a1));
            b.stroke(&p, HCUT, b.tcb());
            term_ball(&mut b, xs - rx, cy, rx, ry, a1);
            b.serif(xs, cap, false, true, true);
            b.done(OPEN * 0.7, STRAIGHT)
        }
        'U' => {
            let w = cw(s, m, 1.0, 0.98);
            let (xl, xr) = (hs, w - hs);
            let ry = cap * lerp(0.26, 0.34, 1.0 - (s.sup - 0.68) * 3.0);
            let cy = -o + th / 2.0 + ry;
            let p = path(v(xl, cap)).line(v(xl, cy)).then(b.arc((xl + xr) / 2.0, cy, (xr - xl) / 2.0, ry, 180.0, 360.0)).line(v(xr, cap));
            let wr = if serif { tw } else { 1.0 };
            let _ = wr;
            b.stroke(&p, HCUT, HCUT);
            b.serif(xl, cap, false, true, true);
            b.serif(xr, cap, false, true, true);
            b.done(STRAIGHT, STRAIGHT)
        }
        'N' => {
            let w = cw(s, m, 1.0, 1.0);
            let (xl, xr) = (hs, w - hs);
            let wv = tw;
            b.line_w(v(xl, 0.0), v(xl, cap), wv, wv, HCUT, HCUT);
            b.line_w(v(xr, 0.0), v(xr, cap), wv, wv, HCUT, HCUT);
            b.diag_as(v(xl + hs * 0.2, cap), v(xr - hs * 0.2, 0.0), true, HCUT, HCUT);
            if sharp {
                b.clip(-50.0, w + 50.0, -400.0, 0.0);
            }
            b.serif(xl, 0.0, true, true, true);
            b.serif(xl, cap, false, true, false);
            b.serif(xr, cap, false, true, true);
            b.done(STRAIGHT * 0.95, STRAIGHT * 0.95)
        }
        'M' => {
            let w = cw(s, m, 1.18, 1.26);
            let splay = if sharp { st * 0.9 } else { 0.0 };
            let (xl, xr) = (hs, w - hs);
            let dip = if sharp { st * 0.8 } else { st * 0.15 };
            if splay > 0.0 {
                b.diag_as(v(xl, 0.0), v(xl + splay, cap + st), false, HCUT, HCUT);
                b.diag_as(v(xr, 0.0), v(xr - splay, cap + st), true, HCUT, HCUT);
                b.diag_as(v(xl + splay, cap + st), v(w / 2.0, -dip), true, HCUT, HCUT);
                b.diag_as(v(xr - splay, cap + st), v(w / 2.0, -dip), false, HCUT, HCUT);
                b.clip(-50.0, w + 50.0, cap + o, cap + 400.0);
                b.clip(w * 0.3, w * 0.7, -400.0, -o);
            } else {
                b.line_w(v(xl, 0.0), v(xl, cap), tw, tw, HCUT, HCUT);
                b.stem(xr, 0.0, cap);
                b.diag_as(v(xl + hs * 0.3, cap), v(w / 2.0, -dip), true, HCUT, HCUT);
                b.diag_as(v(xr - hs * 0.3, cap), v(w / 2.0, -dip), false, HCUT, HCUT);
                b.clip(w * 0.3, w * 0.7, -400.0, 0.0);
            }
            b.serif(xl, 0.0, true, true, true);
            b.foot(xr, 0.0);
            b.serif(xl, cap, false, true, false);
            b.serif(xr, cap, false, false, true);
            b.done(STRAIGHT * 0.95, STRAIGHT * 0.95)
        }
        'A' | 'V' => {
            let w = if c == 'A' { cw(s, m, 1.02, 1.04) } else { cw(s, m, 1.0, 1.02) };
            let inset = st * 0.62;
            let over = if sharp { st * 0.95 } else { st * 0.22 };
            let (ya, yb) = if c == 'A' { (0.0, cap) } else { (cap, 0.0) };
            let apex_y = if c == 'A' { cap + over } else { -over };
            let apex = v(w / 2.0, apex_y);
            if c == 'A' {
                b.diag(v(inset, ya), apex, HCUT, HCUT);
                b.diag(v(w - inset, ya), apex, HCUT, HCUT);
                let yb_ = cap * lerp(0.26, 0.33, s.bar - 0.38) + th * 0.2;
                let tt = yb_ / (cap + over);
                let xl = inset + (apex.x - inset) * tt;
                let xr = w - inset - (w - inset - apex.x) * tt;
                b.bar(xl, xr, yb_, Cap::Butt, Cap::Butt);
                let lim = if sharp { cap + o * 1.2 } else { cap };
                b.clip(-50.0, w + 50.0, lim, cap + 500.0);
                b.serif(inset, 0.0, true, true, true);
                b.serif(w - inset, 0.0, true, true, true);
            } else {
                b.diag(v(inset, ya), apex, HCUT, HCUT);
                b.diag(v(w - inset, ya), apex, HCUT, HCUT);
                let lim = if sharp { -o * 1.2 } else { 0.0 };
                b.clip(-50.0, w + 50.0, -500.0, lim);
                b.serif(inset, cap, false, true, true);
                b.serif(w - inset, cap, false, true, true);
            }
            let _ = yb;
            b.done(DIAG, DIAG)
        }
        'W' => {
            let w = cw(s, m, 1.42, 1.5);
            let inset = st * 0.62;
            let q = (w - 2.0 * inset) / 4.0;
            let xs = [inset, inset + q, inset + 2.0 * q, inset + 3.0 * q, w - inset];
            let dip = if sharp { st * 0.95 } else { st * 0.22 };
            let midh = if s.prop > 0.5 { cap + dip } else { cap * 0.86 };
            b.diag(v(xs[0], cap), v(xs[1], -dip), HCUT, HCUT);
            b.diag(v(xs[2], midh), v(xs[1], -dip), HCUT, HCUT);
            b.diag(v(xs[2], midh), v(xs[3], -dip), HCUT, HCUT);
            b.diag(v(xs[4], cap), v(xs[3], -dip), HCUT, HCUT);
            let lim = if sharp { -o * 1.2 } else { 0.0 };
            b.clip(-50.0, w + 50.0, -500.0, lim);
            if midh > cap {
                b.clip(xs[1] + st, xs[3] - st, cap + if sharp { o * 1.2 } else { 0.0 }, cap + 400.0);
            }
            b.serif(xs[0], cap, false, true, true);
            b.serif(xs[4], cap, false, true, true);
            b.done(DIAG, DIAG)
        }
        'X' => {
            let w = cw(s, m, 0.96, 0.98);
            let inset = st * 0.55;
            b.diag(v(inset, cap), v(w - inset, 0.0), HCUT, HCUT);
            b.diag(v(inset, 0.0), v(w - inset, cap), HCUT, HCUT);
            for (x, y, up) in [(inset, cap, false), (w - inset, cap, false), (inset, 0.0, true), (w - inset, 0.0, true)] {
                b.serif(x, y, up, true, true);
            }
            b.done(DIAG * 1.5, DIAG * 1.5)
        }
        'Y' => {
            let w = cw(s, m, 0.96, 0.98);
            let inset = st * 0.55;
            let yj = cap * lerp(0.44, 0.40, s.prop);
            let mid = v(w / 2.0, yj);
            b.diag(v(inset, cap), mid, HCUT, Cap::Butt);
            b.diag(v(w - inset, cap), mid, HCUT, Cap::Butt);
            b.stem(w / 2.0, 0.0, yj + st * 0.2);
            b.serif(inset, cap, false, true, true);
            b.serif(w - inset, cap, false, true, true);
            b.foot(w / 2.0, 0.0);
            b.done(DIAG, DIAG)
        }
        'K' => {
            let w = cw(s, m, 0.96, 0.9);
            b.stem(hs, 0.0, cap);
            let ax = w - st * 0.5;
            let jx = hs + hs * 0.9;
            let jy = cap * 0.34;
            b.diag(v(ax, cap), v(jx, jy), HCUT, Cap::Butt);
            let lx = jx + (ax - jx) * 0.40;
            let ly = jy + (cap - jy) * 0.40;
            b.diag(v(lx, ly), v(w - st * 0.45, 0.0), Cap::Butt, HCUT);
            b.foot(hs, 0.0);
            b.serif(hs, cap, false, true, true);
            b.serif(ax, cap, false, true, true);
            b.serif(w - st * 0.45, 0.0, true, true, true);
            b.done(STRAIGHT, DIAG)
        }
        'Z' => {
            let w = cw(s, m, 0.88, 0.84);
            b.bar(st * 0.12, w - st * 0.05, cap - th / 2.0, VCUT, Cap::Butt);
            b.bar(st * 0.05, w - st * 0.02, th / 2.0, Cap::Butt, VCUT);
            b.diag_as(v(w - st * 0.6, cap - th * 0.5), v(st * 0.6, th * 0.5), true, Cap::Butt, Cap::Butt);
            b.clip(-100.0, w + 100.0, cap, cap + 200.0);
            b.clip(-100.0, w + 100.0, -200.0, 0.0);
            b.beak(st * 0.12, cap, true, 0.8);
            b.beak_m(w - st * 0.02, 0.0, false, 0.9);
            b.done(OPEN * 0.7, OPEN * 0.7)
        }
        'S' => {
            let w = cw(s, m, 0.90, 0.72);
            draw_s(&mut b, 0.0, w, -o, cap + o, s, th, true);
            b.done(ROUND * 0.95, ROUND * 0.95)
        }
        _ => return None,
    };
    Some(d)
}

/// Outer width of the O.
pub fn o_cap(s: &Style, m: &Metrics) -> f64 {
    let circ = (m.cap + 2.0 * m.over) * s.round * m.w;
    let body = (m.ch + 2.0 * m.ustem) * 1.1;
    lerp(body, circ, s.prop).max(m.ustem * 2.4 + m.ch * 0.8)
}
