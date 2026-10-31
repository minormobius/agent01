//! Lowercase Latin. Each letter is its construction: stems, arches, bowls and
//! arcs placed in x-height units, so every roll of the genome redraws the same
//! *design logic* at new proportions, weights, stresses and terminals.

use crate::build::{along, at_x, at_y, side::*, Drawn, Metrics, B, HCUT, VCUT};
use crate::curve::*;
use crate::ink::Cap;
use crate::style::{Style, Term};

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Width of a lowercase letter body from its uniform/classical proportions.
pub fn lw(s: &Style, m: &Metrics, uni: f64, cla: f64) -> f64 {
    (m.cn + 2.0 * m.stem) * lerp(uni, cla, s.prop)
}

/// Outer width of the o.
pub fn o_width(s: &Style, m: &Metrics) -> f64 {
    let circ = (m.xh + 2.0 * m.over) * s.round * m.w;
    let body = m.cn * 1.02 + 2.0 * m.stem * 1.04;
    lerp(body * 1.04, circ, s.prop * 0.7).max(m.stem * 2.3 + m.cn * 0.75)
}

pub fn draw(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::lc(s, m);
    let xh = m.xh;
    let o = m.over;
    let st = m.stem;
    let hs = st / 2.0;
    let cn = m.cn;
    let asc = m.asc;
    let desc = m.desc;
    let jn = xh * s.join;
    let top = xh + o * 0.6; // arch tops
    let ap = s.aperture;
    let nw = cn + 2.0 * st;
    let ow = o_width(s, m);
    let sharp = s.term == Term::Perp;
    let d: Drawn = match c {
        // ---- italic constructions: exit strokes replace feet, a and g go
        // single-story, f descends. Everything else is the roman, sheared.
        'n' | 'h' | 'm' if s.italic => {
            let y1 = if c == 'h' { asc } else { xh };
            let xl = hs;
            b.stem(xl, 0.0, y1);
            b.head(xl, y1);
            let xr = if c == 'm' {
                let c2 = cn * lerp(0.86, 0.80, s.prop);
                let xm = hs + st + c2;
                b.arch(xl, xm, top, 0.0, jn);
                let xr = xm + st + c2;
                let p = b.exit_tail(b.arch_path(xm, xr, top, jn), xr);
                let tc = b.tc();
                b.stroke(&p, Cap::Butt, tc);
                xr
            } else {
                let xr = nw - hs;
                let p = b.exit_tail(b.arch_path(xl, xr, top, jn), xr);
                let tc = b.tc();
                b.stroke(&p, Cap::Butt, tc);
                xr
            };
            let _ = xr;
            b.done(STRAIGHT, OPEN * 0.55)
        }
        'u' if s.italic => {
            let (xl, xr) = (hs, nw - hs);
            let tr = 1.0 - b.trap();
            let yb = -o * 0.6 + m.hth / 2.0;
            let p = path(v(xl, xh))
                .line(v(xl, xh * 0.45))
                .tension(b.t())
                .to(v(xl, xh * 0.45), DOWN)
                .to(v(xl + (xr - xl) * 0.42, yb), RIGHT)
                .to(v(xr, xh * 0.62), dir_to_v(0.3, 1.0))
                .w(tr);
            b.stroke(&p, HCUT, Cap::Butt);
            b.exit_stem(xr, xh);
            b.head(xl, xh);
            b.head(xr, xh);
            b.done(STRAIGHT, OPEN * 0.55)
        }
        'a' | 'd' if s.italic => {
            let w = ow * 0.99 + st * 0.12;
            let xs = w - hs;
            let y1 = if c == 'd' { asc } else { xh };
            b.exit_stem(xs, y1);
            b.bowl(xs, 0.0, -o, xh + o, Some(xh * s.join * 0.97), Some(xh * 0.22));
            if c == 'd' {
                b.head(xs, y1);
            }
            b.done(ROUND, OPEN * 0.55)
        }
        'i' | 'l' | 'ı' if s.italic => {
            let x = hs;
            let y1 = if c == 'l' { asc } else { xh };
            b.exit_stem(x, y1);
            b.head(x, y1);
            if c == 'i' {
                let ds = b.dot_size();
                let dy = (xh + (asc - xh) * 0.62).max(xh + ds * 0.5 + st * 0.55);
                b.dot(v(x, dy), ds);
            }
            let mut d = b.done(STRAIGHT, OPEN * 0.55);
            d.body = None;
            d
        }
        'f' if s.italic => {
            // the italic f: a hook above, a stem through the x-height, a hook below
            let r = (cn * 0.36 + st * 0.12).max(b.min_r());
            let ry = r * 0.95;
            let xs = r * 1.05 + hs;
            let yt = asc + o * 0.5;
            let (at, _) = c_terms(s);
            let (cxt, cyt) = (xs + r, yt - m.hth / 2.0 - ry);
            let cyb = -desc + m.hth / 2.0 + ry;
            let a1 = -(180.0 - at * 0.9);
            let p = b
                .arc(cxt, cyt, r, ry, at, 180.0)
                .line(v(xs, cyb))
                .then(b.arc(xs - r, cyb, r, ry, 0.0, a1));
            let tc = b.tcb();
            b.stroke(&p, tc, tc);
            term_ball(&mut b, cxt, cyt, r, ry, at);
            term_ball(&mut b, xs - r, cyb, r, ry, a1);
            let yb = xh - m.hth / 2.0;
            b.bar(xs - hs - cn * 0.26, xs + hs + cn * 0.32, yb, VCUT, VCUT);
            let mut d = b.done(STRAIGHT * 0.4, NONE);
            d.body = Some((xs - hs - cn * 0.26, xs + hs + cn * 0.32));
            d
        }
        'n' => {
            let (xl, xr) = (hs, nw - hs);
            b.stem(xl, 0.0, xh);
            b.arch(xl, xr, top, 0.0, jn);
            b.head(xl, xh);
            b.foot(xl, 0.0);
            b.foot(xr, 0.0);
            b.done(STRAIGHT, STRAIGHT)
        }
        'h' => {
            let (xl, xr) = (hs, nw - hs);
            b.stem(xl, 0.0, asc);
            b.arch(xl, xr, top, 0.0, jn);
            b.head(xl, asc);
            b.foot(xl, 0.0);
            b.foot(xr, 0.0);
            b.done(STRAIGHT, STRAIGHT)
        }
        'm' => {
            let c2 = cn * lerp(0.86, 0.80, s.prop);
            let xl = hs;
            let xm = hs + st + c2;
            let xr = xm + st + c2;
            b.stem(xl, 0.0, xh);
            b.arch(xl, xm, top, 0.0, jn);
            b.arch(xm, xr, top, 0.0, jn);
            b.head(xl, xh);
            b.foot(xl, 0.0);
            b.foot(xm, 0.0);
            b.foot(xr, 0.0);
            b.done(STRAIGHT, STRAIGHT)
        }
        'u' => {
            let (xl, xr) = (hs, nw - hs);
            b.stem(xr, 0.0, xh);
            // the inverted arch: down the left stem, round the bottom, up into the right stem
            let tr = 1.0 - b.trap();
            let yb = -o * 0.6 + m.hth / 2.0;
            let ysh = xh - (xh - (top - xh * (0.52 - (s.sup - 0.70) * 1.3).clamp(0.22, 0.6)));
            let ysh = ysh.min(xh * 0.6);
            let p = path(v(xl, xh))
                .line(v(xl, xh - ysh.max(xh * 0.4)))
                .tension(b.t())
                .to(v(xl, (xh - ysh.max(xh * 0.4)).min(xh * 0.55)), DOWN)
                .to(v(xl + (xr - xl) * 0.48, yb), RIGHT)
                .to(v(xr, xh - jn), dir_up_left(-0.5))
                .w(tr);
            b.stroke(&p, HCUT, Cap::Butt);
            b.head(xl, xh);
            b.head(xr, xh);
            b.foot(xr, 0.0);
            b.done(STRAIGHT, STRAIGHT)
        }
        'o' => {
            b.oval(0.0, ow, -o, xh + o);
            b.done(ROUND, ROUND)
        }
        'b' | 'p' => {
            let w = ow * 0.99 + st * 0.12;
            let xs = hs;
            let (y0, y1) = if c == 'b' { (0.0, asc) } else { (-desc, xh) };
            b.stem(xs, y0, y1);
            let low = if c == 'b' && !sharp { Some(m.hth * 1.4) } else { Some(xh * (1.0 - s.join) * 0.9) };
            let low = if c == 'p' { Some(xh * (1.0 - s.join) * 0.85) } else { low };
            b.bowl(xs, w, -o, xh + o, Some(jn * 0.97), low);
            b.head(xs, y1);
            if c == 'p' {
                b.foot(xs, -desc);
            } else if b.serifed() {
                b.serif(xs, 0.0, true, true, false);
            }
            b.done(STRAIGHT, ROUND)
        }
        'd' | 'q' => {
            let w = ow * 0.99 + st * 0.12;
            let xs = w - hs;
            let (y0, y1) = if c == 'd' { (0.0, asc) } else { (-desc, xh) };
            b.stem(xs, y0, y1);
            let jt = if c == 'q' { xh * s.join * 0.95 } else { xh * s.join * 0.97 };
            b.bowl(xs, 0.0, -o, xh + o, Some(jt), Some(xh * (1.0 - s.join) * 0.85));
            if c == 'd' {
                b.head(xs, y1);
                b.serif(xs, 0.0, true, false, true);
            } else {
                b.foot(xs, -desc);
            }
            b.done(ROUND, STRAIGHT)
        }
        'c' => {
            let w = ow * 0.92;
            let (cx, cy, rx, ry) = b.ebox(0.0, w, -o, xh + o);
            let (at, ab) = c_terms(s);
            let p = b.arc(cx, cy, rx, ry, at, 360.0 - ab);
            let tc = b.arc_cap();
            b.stroke(&p, tc, tc);
            upper_terminal(&mut b, cx, cy, rx, ry, at, xh + o);
            b.done(ROUND, OPEN)
        }
        'e' => {
            let w = ow * 0.97;
            let (cx, cy, rx, ry) = b.ebox(0.0, w, -o, xh + o);
            let ab = lerp(22.0, 58.0, ap);
            // the bar drops in heavy weights so the eye keeps some height (a
            // high bar under a thick top stroke closes the eye)
            let eye_min = xh * 0.13;
            let ybar = (xh * (s.bar + 0.06))
                .min(xh + o - m.hth * 1.5 - eye_min)
                .max(cy + m.hth * 0.1);
            let ybar_c = ybar;
            let t = b.t();
            let (pb, db) = b.ell(cx, cy, rx, ry, 360.0 - ab);
            let p = path_d(v(cx + rx, ybar_c - m.hth * 0.5), UP)
                .tension(t)
                .w(1.02)
                .to(v(cx, cy + ry), LEFT)
                .w(1.0)
                .to(v(cx - rx, cy), DOWN)
                .w(1.04)
                .to(v(cx, cy - ry), RIGHT)
                .w(1.0)
                .to(pb, db);
            let tc = b.tcb();
            b.stroke(&p, Cap::Butt, tc);
            b.bar(cx - rx, cx + rx, ybar_c - m.hth * 0.0, Cap::Butt, Cap::Butt);
            b.done(ROUND, OPEN + 0.12)
        }
        'a' if s.a2 && !s.italic => {
            let w = lw(s, m, 0.93, 0.86).max(st * 2.3 + cn * 0.55);
            let xs = w - hs;
            let tr = 1.0 - b.trap();
            let t = b.t();
            // hook over the top into the stem
            let ysh = xh * 0.5;
            let _ = ysh;
            let rx = (xs - st * 0.45) * 0.5;
            let cx = xs - rx;
            let ry = xh * 0.27;
            let cy = top - m.hth / 2.0 - ry;
            let (at, _) = c_terms(s);
            let a0 = 180.0 - at * 0.95;
            let hook = b.arc(cx, cy, rx, ry, a0, 0.0).line(v(xs, 0.0));
            let tc = b.tcb();
            b.stroke(&hook, tc, HCUT);
            term_ball(&mut b, cx, cy, rx, ry, a0);
            let _ = (tr, t);
            // the bowl
            // the bowl's top sits where both counters (the bowl's, and the
            // one under the hook) keep a minimum height — in a black weight
            // three thick horizontals share the x-height
            let yb0 = -o + m.hth / 2.0;
            let lo = yb0 + m.hth + xh * 0.14;
            let hi = top - m.hth * 1.5 - xh * 0.10;
            let bt = (xh * lerp(0.54, 0.60, s.bar - 0.38) - m.hth / 2.0).clamp(lo.min(hi), hi.max(lo));
            let yb = -o + m.hth / 2.0;
            let xb = hs * 1.04 + st * 0.0;
            let pb = path_d(v(xs, bt), LEFT)
                .tension(t)
                .to(v(xb + (xs - xb) * 0.42, bt - (bt - yb) * 0.02), LEFT)
                .to(v(xb, (bt + yb) / 2.0 - m.hth * 0.1), DOWN)
                .w(1.03)
                .to(v(xb + (xs - xb) * 0.5, yb), RIGHT)
                .w(1.0)
                .to(v(xs, xh * 0.16 + m.hth * 0.3), dir_to_v(0.45, 1.0))
                .w(tr);
            b.stroke(&pb, Cap::Butt, Cap::Butt);
            if b.serifed() {
                b.serif(xs, 0.0, true, false, true);
            }
            b.done(OPEN + 0.1, STRAIGHT)
        }
        'a' => {
            // single-story: a d without its ascender
            let w = ow * 0.99 + st * 0.12;
            let xs = w - hs;
            b.stem(xs, 0.0, xh);
            b.bowl(xs, 0.0, -o, xh + o, Some(xh * s.join * 0.97), Some(xh * (1.0 - s.join) * 0.85));
            if b.serifed() {
                b.serif(xs, 0.0, true, false, true);
            }
            b.done(ROUND, STRAIGHT)
        }
        'i' | 'l' | 'j' | 'ı' => {
            let x = if c == 'j' { st * 0.5 + cn * 0.22 } else { hs };
            let y1 = if c == 'l' { asc } else { xh };
            if c == 'j' {
                // descender hooking left
                let rx = (cn * 0.30 + st * 0.12).max(b.min_r());
                let ry = (desc * 0.46).max(b.min_r() * 0.9);
                let cy = -desc + m.hth / 2.0 + ry;
                let (at, _) = c_terms(s);
                let a1 = -(180.0 - at * 0.9);
                let p = path(v(x, xh)).line(v(x, cy)).then(b.arc(x - rx, cy, rx, ry, 0.0, a1));
                let tc = b.tcb();
                b.stroke(&p, HCUT, tc);
                term_ball(&mut b, x - rx, cy, rx, ry, a1);
            } else {
                b.stem(x, 0.0, y1);
                b.foot(x, 0.0);
            }
            b.head(x, y1);
            if c == 'i' || c == 'j' {
                let ds = b.dot_size();
                let dy = xh + (asc - xh) * 0.62;
                let dy = dy.max(xh + ds * 0.5 + st * 0.55);
                b.dot(v(x, dy), ds);
            }
            if c == 'j' {
                let mut d = b.done(STRAIGHT, STRAIGHT);
                d.body = Some((x - hs, x + hs));
                d
            } else {
                b.done(STRAIGHT, STRAIGHT)
            }
        }
        'f' => {
            let r = (cn * 0.40 + st * 0.12).max(b.min_r());
            let ry = r * lerp(0.95, 0.8, s.sup - 0.68);
            let xs = hs + cn * 0.16;
            let yt = asc + o * 0.5;
            let (cx, cy) = (xs + r, yt - m.hth / 2.0 - ry);
            let (at, _) = c_terms(s);
            let p = path(v(xs, 0.0)).line(v(xs, cy)).then(b.arc(cx, cy, r, ry, 180.0, at));
            let tc = b.tcb();
            b.stroke(&p, HCUT, tc);
            term_ball(&mut b, cx, cy, r, ry, at);
            let yb = xh - m.hth / 2.0;
            b.bar(xs - hs - cn * 0.24, xs + hs + cn * 0.34, yb, VCUT, VCUT);
            if b.serifed() {
                b.serif(xs, 0.0, true, true, true);
            }
            let mut d = b.done(STRAIGHT * 0.55, NONE);
            d.body = Some((xs - hs - cn * 0.24, xs + hs + cn * 0.34));
            d
        }
        't' => {
            let xs = hs + cn * 0.16;
            let ttop = xh + (asc - xh) * lerp(0.42, 0.55, 1.0 - s.prop * 0.5);
            let yb = xh - m.hth / 2.0;
            let rx = (cn * 0.36).max(b.min_r());
            if sharp {
                b.stem(xs, 0.0, ttop);
                if b.serifed() {
                    b.foot(xs, 0.0);
                }
            } else {
                let ry = rx * 0.95;
                let cy = -o * 0.5 + m.hth / 2.0 + ry;
                let (_, ab) = c_terms(s);
                let p = path(v(xs, ttop)).line(v(xs, cy)).then(b.arc(xs + rx, cy, rx, ry, 180.0, 360.0 - ab * 0.9));
                let tc = b.tc();
                let c0 = if s.term == Term::Pen || s.term == Term::Vertical { Cap::Cut(v(1.0, 0.55)) } else { HCUT };
                b.stroke(&p, c0, tc);
            }
            b.bar(xs - hs - cn * 0.22, xs + hs + cn * 0.36, yb, VCUT, VCUT);
            b.done(STRAIGHT * 0.5, OPEN * 0.6)
        }
        'r' => {
            let xl = hs;
            let w = lw(s, m, 0.64, 0.60);
            let tr = 1.0 - b.trap();
            b.stem(xl, 0.0, xh);
            let cx = xl + (w - xl) * 0.42;
            let rx = w - st * 0.22 - cx;
            let ry = xh * 0.30;
            let cy = top - m.hth / 2.0 - ry;
            let (at, _) = c_terms(s);
            let at = at * 0.85;
            let p = path_d(v(xl, jn), dir_to_v(0.5, 1.0)).w(tr).tension(b.t()).then(b.arc(cx, cy, rx, ry, 90.0, at));
            let tc = b.tcb();
            b.stroke(&p, Cap::Butt, tc);
            term_ball(&mut b, cx, cy, rx, ry, at);
            b.head(xl, xh);
            if b.serifed() {
                b.serif(xl, 0.0, true, true, true);
            }
            b.done(STRAIGHT, OPEN * 0.3)
        }
        's' => {
            // a heavy s widens so its counters stay open
            let w = lw(s, m, 0.84, 0.74).max(st * 2.2 + cn * 0.62);
            draw_s(&mut b, 0.0, w, -o, xh + o, s, m.hth, false);
            b.done(ROUND * 0.95, ROUND * 0.95)
        }
        'v' | 'w' | 'y' => {
            let w = if c == 'w' { lw(s, m, 1.34, 1.36) } else { lw(s, m, 0.94, 0.96) };
            let inset = st * 0.62;
            let dip = if sharp { st * 0.9 } else { st * 0.28 };
            if c == 'w' {
                let q = (w - 2.0 * inset) / 4.0;
                let xs = [inset, inset + q, inset + 2.0 * q, inset + 3.0 * q, w - inset];
                let midh = if s.prop > 0.5 { xh } else { xh * 0.92 };
                b.diag(v(xs[0], xh), v(xs[1], -dip), HCUT, HCUT);
                b.diag(v(xs[2], midh), v(xs[1], -dip), HCUT, HCUT);
                b.diag(v(xs[2], midh), v(xs[3], -dip), HCUT, HCUT);
                b.diag(v(xs[4], xh), v(xs[3], -dip), HCUT, HCUT);
                b.clip(-50.0, w + 50.0, -500.0, if sharp { -o } else { 0.0 });
                if midh >= xh {
                    b.clip(xs[2] - st, xs[2] + st, xh, xh + 400.0);
                }
                b.serif(xs[0], xh, false, true, true);
                b.serif(xs[4], xh, false, true, true);
            } else if c == 'v' {
                b.diag(v(inset, xh), v(w / 2.0, -dip), HCUT, HCUT);
                b.diag(v(w - inset, xh), v(w / 2.0, -dip), HCUT, HCUT);
                b.clip(-50.0, w + 50.0, -500.0, if sharp { -o } else { 0.0 });
                b.serif(inset, xh, false, true, true);
                b.serif(w - inset, xh, false, true, true);
            } else {
                // y: v whose right arm runs on into the descender
                let mid = v(w / 2.0 - st * 0.05, 0.0);
                let dx = (w - inset - mid.x) / xh; // right-arm slope (x per y)
                // the short arm ends on the long arm's centreline, cut along it
                let top = v(w - inset, xh);
                let foot = v(w - inset - dx * (xh + desc), -desc);
                let meet = at_y(top, foot, -dip * 0.3);
                b.diag(v(inset, xh), meet, HCUT, along(top, foot));
                let yend = -desc + m.hth / 2.0;
                if s.tail_y {
                    let xd = w - inset - dx * (xh + desc * 0.55);
                    // the curl can't be tighter than the pen allows
                    let cr = (cn * 0.45).max(b.min_r() * 1.1);
                    let p = path(v(w - inset, xh))
                        .line(v(xd + dx * desc * 0.25, -desc * 0.30))
                        .tension(b.t())
                        .to(v(xd - st * 0.2, -desc * 0.72), dir_to_v(-dx * 0.6 - 0.35, -1.0))
                        .to(v(xd - cr, yend), LEFT)
                        .to(v(xd - cr * 1.8, yend + st * 0.25), dir_to_v(-1.0, 0.7));
                    let tc = b.tcb();
                    b.stroke(&p, HCUT, tc);
                    if s.ball {
                        let r = b.ball_r();
                        b.ball(v(xd - cr * 1.8, yend + st * 0.25), v(0.4, 1.0), r);
                    }
                } else {
                    let xd = w - inset - dx * (xh + desc);
                    b.diag(v(w - inset, xh), v(xd, -desc), HCUT, HCUT);
                    b.serif(xd, -desc, true, true, true);
                }
                b.serif(inset, xh, false, true, true);
                b.serif(w - inset, xh, false, true, true);
            }
            b.done(DIAG, DIAG)
        }
        'x' => {
            let w = lw(s, m, 0.90, 0.92);
            let inset = st * 0.55;
            b.diag(v(inset, xh), v(w - inset, 0.0), HCUT, HCUT);
            b.diag(v(w - inset, xh), v(inset, 0.0), HCUT, HCUT);
            for (x, y, up) in [(inset, xh, false), (w - inset, xh, false), (inset, 0.0, true), (w - inset, 0.0, true)] {
                b.serif(x, y, up, true, true);
            }
            b.done(DIAG * 1.5, DIAG * 1.5)
        }
        'k' => {
            let w = lw(s, m, 0.90, 0.86);
            let xs = hs;
            b.stem(xs, 0.0, asc);
            let ax = w - st * 0.5;
            let jx = xs + hs * 0.9;
            let jy = xh * 0.36;
            // arm: into the stem's centreline, cut plumb; leg: out of the arm's
            // centreline, cut along the arm — both ends buried
            let arm_top = v(ax, xh);
            let arm_end = at_x(arm_top, v(jx, jy), xs);
            b.diag(arm_top, arm_end, HCUT, VCUT);
            let root = arm_top.lerp(arm_end, 0.58);
            b.diag(root, v(w - st * 0.48, 0.0), along(arm_top, arm_end), HCUT);
            b.head(xs, asc);
            b.foot(xs, 0.0);
            b.serif(ax, xh, false, true, true);
            b.serif(w - st * 0.48, 0.0, true, true, true);
            b.done(STRAIGHT, DIAG)
        }
        'z' => {
            let w = lw(s, m, 0.84, 0.80);
            let th = m.hth;
            b.bar(st * 0.18, w - st * 0.05, xh - th / 2.0, VCUT, Cap::Butt);
            b.bar(st * 0.05, w - st * 0.1, th / 2.0, Cap::Butt, VCUT);
            // the diagonal meets both bars at their corners
            b.diag_as(v(w - st * 0.62, xh - th * 0.5), v(st * 0.62, th * 0.5), true, Cap::Butt, Cap::Butt);
            b.clip(-100.0, w + 100.0, xh, xh + 200.0);
            b.clip(-100.0, w + 100.0, -200.0, 0.0);
            b.beak(st * 0.18, xh, true, 0.55);
            b.beak_m(w - st * 0.1, 0.0, false, 0.55);
            b.done(OPEN * 0.8, OPEN * 0.8)
        }
        'g' if s.g2 && !s.italic => {
            // double-story (looptail): upper bowl, link, lower loop, ear
            let w = ow * 0.95;
            let bh = xh * 0.64;
            let bw = w * 0.80;
            let bx0 = (w - bw) * 0.45;
            b.oval(bx0, bx0 + bw, xh - bh, xh + o);
            // ear
            let ex = bx0 + bw * 0.78;
            let ey = xh - m.hth * 0.2;
            b.line(v(ex, ey), v(w + st * 0.05, xh + o * 0.5 - m.hth * 0.5), Cap::Butt, VCUT);
            // link: from bowl bottom-left sweeping right, down into the loop
            let t = b.t();
            let ly = xh - bh + m.hth * 0.3;
            let loop_top = -desc * 0.05;
            let lb = -desc + m.hth / 2.0;
            let p = path_d(v(bx0 + bw * 0.25, ly), dir_to_v(-0.9, -1.0))
                .tension(t)
                .to(v(bx0 + bw * 0.12, ly - (ly - loop_top) * 0.55), DOWN)
                .to(v(bx0 + bw * 0.45, loop_top), RIGHT)
                .to(v(w - hs * 0.9, (loop_top + lb) / 2.0), DOWN)
                .w(1.03)
                .to(v(w * 0.48, lb), LEFT)
                .w(1.0)
                .to(v(hs * 0.95, (loop_top + lb) / 2.0 + st * 0.1), UP)
                .w(1.03)
                .to(v(bx0 + bw * 0.45, loop_top), RIGHT);
            b.stroke(&p, Cap::Butt, Cap::Butt);
            b.done(ROUND * 0.9, OPEN)
        }
        'g' => {
            let w = ow * 0.99 + st * 0.12;
            let xs = w - hs;
            let rx = ((xs - st * 0.5) * 0.48).max(b.min_r());
            let ry = (desc * 0.46).max(b.min_r() * 0.9);
            let cy = -desc + m.hth / 2.0 + ry;
            let (at, _) = c_terms(s);
            let a1 = -(180.0 - at * 0.9);
            let p = path(v(xs, xh)).line(v(xs, cy)).then(b.arc(xs - rx, cy, rx, ry, 0.0, a1));
            let tc = b.tcb();
            b.stroke(&p, HCUT, tc);
            term_ball(&mut b, xs - rx, cy, rx, ry, a1);
            b.bowl(xs, 0.0, -o, xh + o, Some(xh * s.join * 0.95), Some(xh * (1.0 - s.join) * 0.9));
            if b.serifed() {
                b.serif(xs, xh, false, false, true);
            }
            b.done(ROUND, STRAIGHT)
        }
        _ => return None,
    };
    Some(d)
}

pub fn dir_to_v(x: f64, y: f64) -> V {
    v(x, y).norm()
}
fn dir_up_left(k: f64) -> V {
    v(0.5 + k * 0.0, 1.0).norm()
}

/// Terminal angles (parameter degrees) of c-like arcs from aperture & cut.
pub fn c_terms(s: &Style) -> (f64, f64) {
    let ap = s.aperture;
    let (lo, hi) = match s.term {
        Term::Horizontal => (26.0, 50.0),
        Term::Vertical => (48.0, 74.0),
        Term::Perp => (36.0, 62.0),
        Term::Pen => (42.0, 70.0),
        Term::Round => (34.0, 60.0),
    };
    let at = lerp(lo, hi, ap);
    let ab = lerp(lo - 4.0, hi, ap);
    (at, ab)
}

/// Ball / beak on the upper terminal of a c-like arc.
pub fn upper_terminal(b: &mut B, cx: f64, cy: f64, rx: f64, ry: f64, at: f64, top: f64) {
    let (p, _) = b.ell(cx, cy, rx, ry, at);
    if b.s.ball {
        term_ball(b, cx, cy, rx, ry, at);
    } else if b.serifed() {
        let _ = top;
        b.beak_at(p, true);
    }
}

/// A ball on the arc terminal at parameter `a`, hung toward the bowl's centre.
pub fn term_ball(b: &mut B, cx: f64, cy: f64, rx: f64, ry: f64, a: f64) {
    if !b.s.ball || b.s.term == Term::Round {
        return;
    }
    let (p, _) = b.ell(cx, cy, rx, ry, a);
    let r = b.ball_r();
    let inward = v(cx - p.x, cy - p.y).norm();
    b.ball(p, inward, r);
}

/// The S, shared by s / S / $ — box x0..x1, y0..y1 (ink incl. overshoot).
/// Two stacked superellipses (the upper a touch smaller) joined by a spine;
/// terminals sit on each ellipse at the style's aperture angle.
pub fn draw_s(b: &mut B, x0: f64, x1: f64, y0: f64, y1: f64, s: &Style, hth: f64, caps: bool) {
    let st = b.stem;
    let sw = st * 1.02;
    let h = y1 - y0;
    let w = x1 - x0;
    let t = b.t();
    // the spine is a little heavier than the bowls (it's the thick diagonal)
    let inner_h = h - hth; // centreline height
    let hu = inner_h * 0.485; // upper ellipse height (centreline)
    let hl = inner_h - hu;
    let wu = (w - sw) * 0.93;
    let wl = w - sw;
    let (cxu, cyu, rxu, ryu) = (x0 + sw / 2.0 + wl - wu / 2.0 - (wl - wu) * 0.55, y1 - hth / 2.0 - hu / 2.0, wu / 2.0, hu / 2.0);
    let (cxl, cyl, rxl, ryl) = (x0 + sw / 2.0 + wl / 2.0, y0 + hth / 2.0 + hl / 2.0, wl / 2.0, hl / 2.0);
    let (ptop, _) = b.ell(cxu, cyu, rxu, ryu, 90.0);
    let (pl, _) = b.ell(cxu, cyu, rxu, ryu, 180.0);
    let (pr, _) = b.ell(cxl, cyl, rxl, ryl, 0.0);
    let (pbot, _) = b.ell(cxl, cyl, rxl, ryl, -90.0);
    // The terminals' *reach* is what the eye reads, so it is what we set: each
    // terminal ends a margin inside the opposite bowl's outer edge (flush-ish
    // for a closed grotesque, further in for an open humanist; more in heavy
    // weights, whose thick strokes otherwise close the apertures), and the
    // angle on its ellipse is solved to land there.
    let margin = w * (0.015 + 0.12 * s.aperture + 0.06 * b.heft());
    let right_edge = pr.x + sw / 2.0; // lower bowl's outer right
    let left_edge = pl.x - sw / 2.0; // upper bowl's outer left
    // measure, don't model: draw the terminal's stretch with its real cap and
    // read the ink's extreme (a plumb cut ends at the centreline, a level cut
    // on a sloping stroke reaches well past it)
    let tc = b.arc_cap();
    let ink_x = |p: PathB, right: bool| -> f64 {
        let mut ink = crate::ink::Ink::default();
        let (c0, c1) = if right { (tc, Cap::Butt) } else { (Cap::Butt, tc) };
        ink.stroke(crate::ink::Stroke { segs: p.cubics(), closed: false, pen: b.pen, cap0: c0, cap1: c1 });
        let mut e = if right { f64::MIN } else { f64::MAX };
        for poly in ink.polygons() {
            for q in poly {
                e = if right { e.max(q.x) } else { e.min(q.x) };
            }
        }
        e
    };
    let solve = |f: &dyn Fn(f64) -> f64| {
        // f is monotone on [6°, 88°]; bisect for its root, clamped to the range
        let (mut lo, mut hi) = (6.0f64, 88.0f64);
        let (flo, fhi) = (f(lo), f(hi));
        if flo.signum() == fhi.signum() {
            return if flo.abs() < fhi.abs() { lo } else { hi };
        }
        for _ in 0..14 {
            let mid = (lo + hi) / 2.0;
            if f(mid).signum() == flo.signum() {
                lo = mid;
            } else {
                hi = mid;
            }
        }
        (lo + hi) / 2.0
    };
    let at = solve(&|a| ink_x(b.arc(cxu, cyu, rxu, ryu, a, 90.0), true) - (right_edge - margin));
    let ab = solve(&|a| left_edge + margin - ink_x(b.arc(cxl, cyl, rxl, ryl, -90.0, a - 180.0), false));
    let (pt, dt) = b.ell(cxu, cyu, rxu, ryu, at);
    let (pb, db) = b.ell(cxl, cyl, rxl, ryl, 180.0 + ab);
    // spine: through the centre, sloped by the bowls' offset
    let mid = v((cxu + cxl) / 2.0, (cyu - ryu * 0.0 + cyl) / 2.0);
    let slope = (pl.y - pr.y) / (pr.x - pl.x).max(1.0);
    let spine = v(1.0, -slope * lerp(1.05, 1.35, s.sup - 0.68)).norm();
    let _ = (spine, mid);
    // the spine is the s's heaviest stroke in a book weight; in a black one it
    // gives way, or it would fill both counters
    let spine = 1.03 - b.heft() * 0.3;
    let p = path_d(pt, dt)
        .tension(t)
        .to(ptop, LEFT)
        .to(pl, DOWN)
        .w(spine)
        .tension(t * 0.92)
        .to(pr, DOWN)
        .w(spine)
        .tension(t)
        .to(pbot, LEFT)
        .to(pb, -db);
    let tc = b.arc_cap();
    b.stroke(&p, tc, tc);
    if s.ball && s.term != Term::Round {
        let r = b.ball_r() * if caps { 1.05 } else { 1.0 };
        b.ball(pt, v(cxu - pt.x, cyu - pt.y).norm(), r);
        b.ball(pb, v(cxl - pb.x, cyl - pb.y).norm(), r);
    } else if b.serifed() && b.heft() < 0.3 {
        // (a heavy s has no room for beaks: they would close its apertures)
        b.beak_at(pt, true);
        b.beak_at(pb, false);
    }
}
