//! Punctuation and symbols. Dots take the style's own terminal shape (square
//! for a grotesque, round for a humanist, a nib-stamp for old-style), commas
//! and quotes are that dot with a tail, and operators sit on the math axis.

use crate::build::{side::*, Drawn, Metrics, B, HCUT, VCUT};
use crate::curve::*;
use crate::ink::{Cap, Pen};
use crate::lower::{c_terms, dir_to_v, draw_s, term_ball};
use crate::style::{Style, Term};

pub const CHARS: &str = ".,:;!?¡¿'\"‘’“”‚„-‐–—_()[]{}/\\|¦+−=<>×÷±~^`*#%&@$€£¢¥·•°…«»‹›§¶¬©®™";

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

/// Comma-like mark: a dot at `c` with a tail. `flip` turns it 180° (‘ “).
fn comma(b: &mut B, c: V, ds: f64, flip: bool) {
    b.dot(c, ds);
    let sg = if flip { -1.0 } else { 1.0 };
    let r = ds / 2.0;
    let start = c + v(r * 0.55, -r * 0.1) * sg;
    let mid = c + v(r * 0.45, -r * 1.35) * sg;
    let end = c + v(-r * 0.55, -r * 2.35) * sg;
    let p = path_d(start, v(0.2, -1.0) * sg).tension(b.t()).w(ds / b.stem * 0.62).to(mid, dir_to_v(-0.35, -1.0) * sg).w(ds / b.stem * 0.45).to(end, dir_to_v(-1.0, -0.8) * sg).w(ds / b.stem * 0.22);
    let pen = Pen::circle(b.stem / 2.0);
    b.stroke_pen(&p, pen, Cap::Butt, Cap::Round);
}

/// A straight tapered tick (' " in straight form, and the grotesque's quotes).
fn tick(b: &mut B, x: f64, top: f64, len: f64, ds: f64) {
    let w0 = ds * 0.82;
    let w1 = ds * 0.5;
    b.fill(vec![v(x - w0 / 2.0, top), v(x + w0 / 2.0, top), v(x + w1 / 2.0, top - len), v(x - w1 / 2.0, top - len)]);
}

/// A chevron: `dir` +1 points right (›), −1 left (‹). Filled, so a double
/// guillemet is just two of them.
fn chevron(b: &mut B, x: f64, y: f64, hw: f64, hh: f64, dir: f64) {
    let t = (b.stem * 0.92).max(b.hth * 1.1);
    let len = (hw * hw + hh * hh).sqrt();
    let dx = t * len / hh; // horizontal thickness of each arm
    let p = |px: f64, py: f64| v(x + dir * px, y + py);
    b.fill(vec![
        p(-hw, hh),
        p(-hw + dx * 0.55, hh),
        p(hw, 0.0),
        p(-hw + dx * 0.55, -hh),
        p(-hw, -hh),
        p(hw - dx, 0.0),
    ]);
}

pub fn draw(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    if !CHARS.contains(c) {
        return None;
    }
    let mut b = B::lc(s, m);
    let xh = m.xh;
    let cap = m.cap;
    let st = m.stem;
    let hs = st / 2.0;
    let th = m.hth;
    let ds = b.dot_size();
    let axis = xh * 0.5 + th * 0.1; // math axis / hyphen height
    let opw = (m.cn + 2.0 * st) * 1.08; // operator width
    let opt = st * 0.72; // operator stroke weight
    let op_pen = Pen::for_stem(opt, s.ratio.max(0.7), 0.0, 2.0);
    let (at, _ab) = c_terms(s);
    let mut l = 0.45;
    let mut r = 0.45;
    let mut adv: Option<f64> = None;
    match c {
        '.' => b.dot(v(ds / 2.0, ds / 2.0), ds),
        ',' => comma(&mut b, v(ds / 2.0, ds / 2.0), ds, false),
        ':' => {
            b.dot(v(ds / 2.0, ds / 2.0), ds);
            b.dot(v(ds / 2.0, xh - ds / 2.0), ds);
        }
        ';' => {
            comma(&mut b, v(ds / 2.0, ds / 2.0), ds, false);
            b.dot(v(ds / 2.0, xh - ds / 2.0), ds);
        }
        '!' | '¡' => {
            let x = ds / 2.0;
            let wt = (ds / st).max(1.0);
            b.line_w(v(x, ds * 1.9), v(x, cap), wt * 0.55, wt, Cap::Butt, HCUT);
            b.dot(v(x, ds / 2.0), ds);
            if c == '¡' {
                rotate_ink(&mut b, v(x, cap / 2.0));
                shift_ink(&mut b, v(0.0, xh - cap));
            }
        }
        '?' | '¿' => {
            let w = (m.cn + 2.0 * st) * 0.82;
            let rx = (w - st) * 0.46;
            let ry = cap * 0.22;
            let cx = w * 0.5;
            let cy = cap + m.over * 0.5 - th / 2.0 - ry;
            let a0 = 180.0 - at * 0.95;
            let p = b.arc(cx, cy, rx, ry, a0, -60.0).to(v(cx - st * 0.05, ds * 2.4 + cap * 0.1), DOWN).line(v(cx - st * 0.05, ds * 2.0));
            let cap0 = b.arc_cap();
            b.stroke(&p, cap0, HCUT);
            term_ball(&mut b, cx, cy, rx, ry, a0);
            b.dot(v(cx - st * 0.05, ds / 2.0), ds);
            if c == '¿' {
                rotate_ink(&mut b, v(w / 2.0, cap / 2.0));
                shift_ink(&mut b, v(0.0, xh - cap));
            }
            l = 0.6;
            r = 0.6;
        }
        '\'' => tick(&mut b, ds / 2.0, cap, cap * 0.3, ds),
        '"' => {
            tick(&mut b, ds / 2.0, cap, cap * 0.3, ds);
            tick(&mut b, ds * 1.9, cap, cap * 0.3, ds);
        }
        '’' | '‘' | '‚' => {
            let flip = c == '‘';
            let y = if c == '‚' { ds / 2.0 } else if flip { cap - ds * 1.7 } else { cap - ds / 2.0 };
            comma(&mut b, v(ds / 2.0, y), ds, flip);
        }
        '”' | '“' | '„' => {
            let flip = c == '“';
            let y = if c == '„' { ds / 2.0 } else if flip { cap - ds * 1.7 } else { cap - ds / 2.0 };
            comma(&mut b, v(ds / 2.0, y), ds, flip);
            comma(&mut b, v(ds * 1.95, y), ds, flip);
        }
        '-' | '‐' => {
            let w = m.cn * 0.62 + st * 0.3;
            let dash = Pen::for_stem(st, 1.0, 0.0, 2.0).scaled((th / st).max(0.55));
            b.stroke_pen(&path(v(0.0, axis)).line(v(w, axis)), dash, VCUT, VCUT);
            l = 0.5;
            r = 0.5;
        }
        '–' | '—' | '_' => {
            let w = if c == '—' { 1000.0 } else { 500.0 };
            let y = if c == '_' { -m.desc * 0.42 } else { axis };
            let dash = Pen::for_stem(st, 1.0, 0.0, 2.0).scaled((th / st).max(0.5));
            b.stroke_pen(&path(v(0.0, y)).line(v(w, y)), dash, VCUT, VCUT);
            adv = Some(w);
        }
        '(' | ')' => {
            let top = cap + m.desc * 0.18;
            let bot = -m.desc * 0.72;
            let depth = (top - bot) * 0.14 + st * 0.3;
            let p = path_d(v(depth + hs, top - th * 0.2), dir_to_v(-0.55, -1.0)).tension(b.t()).w(0.7).to(v(hs, (top + bot) / 2.0), DOWN).w(1.0).to(v(depth + hs, bot + th * 0.2), dir_to_v(0.55, -1.0)).w(0.7);
            let tc = if s.term == Term::Round { Cap::Round } else { Cap::Square };
            b.stroke(&p, tc, tc);
            if c == ')' {
                mirror_ink(&mut b, (depth + st) / 2.0);
            }
            l = 0.7;
            r = 0.7;
        }
        '[' | ']' => {
            let top = cap + m.desc * 0.18;
            let bot = -m.desc * 0.72;
            let w = st * 2.6;
            b.stem(hs, bot, top);
            b.bar(hs, w, top - th / 2.0, Cap::Butt, VCUT);
            b.bar(hs, w, bot + th / 2.0, Cap::Butt, VCUT);
            if c == ']' {
                mirror_ink(&mut b, w / 2.0);
            }
            l = 0.8;
            r = 0.5;
        }
        '{' | '}' => {
            let top = cap + m.desc * 0.18;
            let bot = -m.desc * 0.72;
            let mid = (top + bot) / 2.0;
            let w = st * 2.8;
            let x = w * 0.5;
            let t = b.t();
            let p = path_d(v(w, top - th / 2.0), LEFT).tension(t).to(v(x, top - th * 2.0), DOWN).line(v(x, mid + st * 0.9)).to(v(0.0, mid), dir_to_v(-1.0, -0.6));
            b.stroke(&p, VCUT, Cap::Round);
            let q = path_d(v(w, bot + th / 2.0), LEFT).tension(t).to(v(x, bot + th * 2.0), UP).line(v(x, mid - st * 0.9)).to(v(0.0, mid), dir_to_v(-1.0, 0.6));
            b.stroke(&q, VCUT, Cap::Round);
            if c == '}' {
                mirror_ink(&mut b, w / 2.0);
            }
        }
        '/' | '\\' => {
            let w = (m.cn + 2.0 * st) * 0.62;
            let (bot, top) = (-m.desc * 0.35, cap + m.desc * 0.1);
            if c == '/' {
                b.diag_as(v(hs, bot), v(w - hs, top), true, HCUT, HCUT);
            } else {
                b.diag_as(v(hs, top), v(w - hs, bot), true, HCUT, HCUT);
            }
            l = 0.1;
            r = 0.1;
        }
        '|' | '¦' => {
            let (bot, top) = (-m.desc * 0.8, m.asc);
            if c == '|' {
                b.stem(hs, bot, top);
            } else {
                b.stem(hs, bot, axis - st * 0.4);
                b.stem(hs, axis + st * 0.4, top);
            }
            l = 1.0;
            r = 1.0;
        }
        '+' | '−' | '=' | '±' | '×' | '÷' | '¬' | '<' | '>' | '~' => {
            let hw = opw / 2.0;
            let cx = hw;
            let ln = |b: &mut B, a: V, e: V| b.stroke_pen(&path(a).line(e), op_pen, HCUT_V(a, e), HCUT_V(a, e));
            match c {
                '+' | '±' => {
                    let y = if c == '±' { axis + opw * 0.12 } else { axis };
                    ln(&mut b, v(0.0, y), v(opw, y));
                    ln(&mut b, v(cx, y - hw), v(cx, y + hw));
                    if c == '±' {
                        ln(&mut b, v(0.0, y - hw - opt * 1.2), v(opw, y - hw - opt * 1.2));
                    }
                }
                '−' => ln(&mut b, v(0.0, axis), v(opw, axis)),
                '=' => {
                    let g = opw * 0.19;
                    ln(&mut b, v(0.0, axis + g), v(opw, axis + g));
                    ln(&mut b, v(0.0, axis - g), v(opw, axis - g));
                }
                '×' => {
                    let k = hw * 0.72;
                    b.stroke_pen(&path(v(cx - k, axis - k)).line(v(cx + k, axis + k)), op_pen, Cap::Square, Cap::Square);
                    b.stroke_pen(&path(v(cx - k, axis + k)).line(v(cx + k, axis - k)), op_pen, Cap::Square, Cap::Square);
                }
                '÷' => {
                    ln(&mut b, v(0.0, axis), v(opw, axis));
                    let dd = ds * 0.9;
                    b.dot(v(cx, axis + hw * 0.62), dd);
                    b.dot(v(cx, axis - hw * 0.62), dd);
                }
                '¬' => {
                    ln(&mut b, v(0.0, axis + opw * 0.1), v(opw, axis + opw * 0.1));
                    ln(&mut b, v(opw - opt * 0.5, axis + opw * 0.1), v(opw - opt * 0.5, axis - opw * 0.22));
                }
                '<' | '>' => {
                    let tip = v(if c == '<' { 0.0 } else { opw }, axis);
                    let o2 = if c == '<' { opw } else { 0.0 };
                    b.stroke_pen(&path(v(o2, axis + hw * 0.85)).line(tip), op_pen, VCUT, Cap::Butt);
                    b.stroke_pen(&path(v(o2, axis - hw * 0.85)).line(tip), op_pen, VCUT, Cap::Butt);
                    b.clip(if c == '<' { -200.0 } else { opw }, if c == '<' { 0.0 } else { opw + 200.0 }, axis - opw, axis + opw);
                }
                _ => {
                    // ~ : a sine
                    let a = opw * 0.13;
                    let p = path_d(v(0.0, axis - a * 0.4), dir_to_v(0.6, 1.0)).tension(b.t()).to(v(opw * 0.27, axis + a), RIGHT).to(v(opw * 0.73, axis - a), RIGHT).to(v(opw, axis + a * 0.4), dir_to_v(0.6, 1.0));
                    b.stroke_pen(&p, op_pen, Cap::Round, Cap::Round);
                }
            }
            l = 0.6;
            r = 0.6;
        }
        '^' => {
            let w = opw * 0.8;
            b.stroke_pen(&path(v(0.0, cap * 0.45)).line(v(w / 2.0, cap)), op_pen, HCUT, Cap::Butt);
            b.stroke_pen(&path(v(w, cap * 0.45)).line(v(w / 2.0, cap)), op_pen, HCUT, Cap::Butt);
            b.clip(-100.0, w + 100.0, cap, cap + 200.0);
        }
        '`' => {
            b.line_w(v(0.0, cap), v(st * 1.5, cap - st * 1.6), 0.8, 0.55, Cap::Round, Cap::Round);
        }
        '*' => {
            let cy = cap - opw * 0.42;
            let rr = opw * 0.4;
            let pen = Pen::for_stem(opt * 0.95, s.ratio.max(0.6), 0.0, 2.0);
            for k in 0..5 {
                let a = (90.0 + k as f64 * 72.0).to_radians();
                let e = v(opw * 0.5 + rr * a.cos(), cy + rr * a.sin());
                b.stroke_pen(&path(v(opw * 0.5, cy)).w(0.7).line(e).w(1.0), pen, Cap::Butt, if s.term == Term::Round { Cap::Round } else { Cap::Square });
            }
        }
        '#' => {
            let w = opw * 1.02;
            let (y0, y1) = (0.0, cap * 0.92);
            let sl = (y1 - y0) * 0.12;
            for x in [w * 0.36, w * 0.72] {
                b.stroke_pen(&path(v(x - sl, y0)).line(v(x + sl, y1)), op_pen, HCUT, HCUT);
            }
            for y in [y1 * 0.33, y1 * 0.67] {
                b.stroke_pen(&path(v(w * 0.08, y)).line(v(w * 1.02, y)), op_pen, VCUT, VCUT);
            }
        }
        '%' => {
            let w = (m.ch + 2.0 * m.ustem) * 1.0;
            let ow = w * 0.38;
            let oh = cap * 0.42;
            let sm = B::lc(s, m);
            drop(sm);
            let saved = b.stem;
            b.stem = saved * 0.8;
            b.pen = m.pen.scaled(0.8);
            b.hth = th * 0.8;
            b.oval(0.0, ow, cap - oh, cap + m.over * 0.5);
            b.oval(w - ow, w, -m.over * 0.5, oh);
            b.stem = saved;
            b.pen = m.pen;
            b.hth = th;
            b.diag_as(v(w * 0.78, cap), v(w * 0.22, 0.0), true, HCUT, HCUT);
            b.clip(-100.0, w + 100.0, cap + m.over * 0.5, cap + 200.0);
            b.clip(-100.0, w + 100.0, -200.0, -m.over * 0.5);
        }
        '&' => {
            let w = (m.ch + 2.0 * m.ustem) * 0.92;
            let h = cap;
            let t = b.t();
            let p = path(v(w - st * 0.35, 0.0))
                .tension(t)
                .to(v(w * 0.5, h * 0.36), dir_to_v(-0.9, 1.0))
                .to(v(w * 0.25 + hs, h * 0.74), dir_to_v(-0.35, 1.0))
                .to(v(w * 0.45, h + m.over * 0.5 - th / 2.0), RIGHT)
                .to(v(w * 0.64, h * 0.8), DOWN)
                .to(v(w * 0.36, h * 0.52), dir_to_v(-1.0, -0.8))
                .to(v(hs * 1.05, h * 0.23), DOWN)
                .to(v(w * 0.42, -m.over * 0.5 + th / 2.0), RIGHT)
                .to(v(w * 0.78, h * 0.28), dir_to_v(0.65, 1.0))
                .to(v(w * 0.86, h * 0.44), dir_to_v(0.2, 1.0));
            b.stroke(&p, HCUT, b.tc_line());
            let _ = VCUT;
            l = 0.6;
            r = 0.2;
        }
        '@' => {
            let w = (m.ch + 2.0 * m.ustem) * 1.2;
            let h = cap * 1.02;
            let y0 = -m.desc * 0.3;
            let sv = b.stem;
            b.stem = sv * 0.72;
            b.pen = m.pen.scaled(0.72);
            b.hth = th * 0.72;
            // inner a: bowl + stem
            let iw = w * 0.42;
            let ix0 = w * 0.28;
            let ih = h * 0.5;
            let iy0 = y0 + (h - ih) * 0.42;
            b.oval(ix0, ix0 + iw, iy0, iy0 + ih);
            let xs = ix0 + iw - b.stem * 0.5;
            // outer: from the stem's foot round the circle, counter-clockwise
            let (cx, cy, rx, ry) = b.ebox(0.0, w, y0, y0 + h);
            let p = path(v(xs, iy0 + ih + th * 0.1))
                .line(v(xs, iy0 + b.stem * 0.6))
                .tension(t_of(&b))
                .to(v(xs + (w - xs) * 0.35, iy0), RIGHT)
                .to(v(cx + rx, cy + ry * 0.05), UP)
                .to(v(cx, cy + ry), LEFT)
                .to(v(cx - rx, cy), DOWN)
                .to(v(cx, cy - ry), RIGHT)
                .to(v(cx + rx * 0.72, cy - ry * 0.78), dir_to_v(1.0, 0.6));
            b.stroke(&p, HCUT, b.tc_line());
            b.stem = sv;
            b.pen = m.pen;
            b.hth = th;
            l = 0.6;
            r = 0.6;
        }
        '$' | '€' | '£' | '¢' | '¥' | '§' | '¶' => {
            let mut ub = B::uc(s, m);
            let ust = m.ustem;
            let uth = m.uhth;
            let w = (m.ch + 2.0 * ust) * 0.78;
            match c {
                '$' => {
                    draw_s(&mut ub, 0.0, w, -m.over, cap + m.over, s, uth, true);
                    let x = w * 0.5;
                    let pen = ub.pen.scaled(ub.thin_w().max(0.45));
                    ub.stroke_pen(&path(v(x, -m.desc * 0.32)).line(v(x, cap + m.desc * 0.3)), pen, HCUT, HCUT);
                }
                '€' => {
                    let ww = w * 1.05;
                    let (cx, cy, rx, ry) = ub.ebox(w * 0.1, ww, -m.over, cap + m.over);
                    let (at2, ab2) = c_terms(s);
                    let p = ub.arc(cx, cy, rx, ry, at2, 360.0 - ab2);
                    let tc = ub.arc_cap();
                    ub.stroke(&p, tc, tc);
                    for y in [cap * 0.58, cap * 0.40] {
                        ub.bar(0.0, w * 0.72, y, Cap::Butt, Cap::Butt);
                    }
                }
                '¢' => {
                    let mut lb = B::lc(s, m);
                    let ow = crate::lower::o_width(s, m) * 0.9;
                    let (cx, cy, rx, ry) = lb.ebox(0.0, ow, -m.over, xh + m.over);
                    let p = lb.arc(cx, cy, rx, ry, at, 360.0 - at);
                    let tc = lb.arc_cap();
                    lb.stroke(&p, tc, tc);
                    let pen = lb.pen.scaled(lb.thin_w().max(0.45));
                    lb.stroke_pen(&path(v(cx + rx * 0.1, -m.desc * 0.25)).line(v(cx + rx * 0.1, xh + m.desc * 0.25)), pen, HCUT, HCUT);
                    return Some(lb.done(ROUND, OPEN));
                }
                '£' => {
                    let xs = w * 0.36;
                    let rx = (w - xs) * 0.5;
                    let ry = cap * 0.22;
                    let cy = cap + m.over * 0.5 - uth / 2.0 - ry;
                    let t = ub.t();
                    let p = path_d(v(xs + rx * 1.9, cy + ry * 0.2), dir_to_v(-0.2, 1.0)).tension(t).to(v(xs + rx, cy + ry), LEFT).to(v(xs, cy), DOWN).line(v(xs, cap * 0.28)).to(v(ust * 0.2, uth * 0.5), dir_to_v(-0.8, -1.0));
                    let tc = ub.arc_cap();
                    ub.stroke(&p, tc, Cap::Butt);
                    ub.bar(0.0, w, uth / 2.0, Cap::Butt, VCUT);
                    ub.bar(ust * 0.1, w * 0.72, cap * 0.46, VCUT, VCUT);
                }
                '¥' => {
                    let inset = ust * 0.5;
                    let yj = cap * 0.45;
                    let mid = v(w / 2.0, yj);
                    ub.diag(v(inset, cap), mid, HCUT, Cap::Butt);
                    ub.diag(v(w - inset, cap), mid, HCUT, Cap::Butt);
                    ub.stem(w / 2.0, 0.0, yj + ust * 0.2);
                    for y in [cap * 0.38, cap * 0.2] {
                        ub.bar(w * 0.12, w * 0.88, y, VCUT, VCUT);
                    }
                }
                '§' => {
                    let h = cap * 0.62;
                    draw_s(&mut ub, 0.0, w * 0.8, h * 0.48 - m.over, cap + m.over, s, uth, true);
                    draw_s(&mut ub, 0.0, w * 0.8, -m.desc * 0.3 - m.over, cap - h * 0.52 + m.over, s, uth, true);
                }
                _ => {
                    // ¶ pilcrow: a filled bowl on two stems
                    let x1 = w * 0.62;
                    let x2 = w * 0.95;
                    ub.stem(x1, -m.desc * 0.3, cap);
                    ub.stem(x2, -m.desc * 0.3, cap);
                    ub.bar(x1, x2 + ust * 0.5, cap - uth / 2.0, Cap::Butt, Cap::Butt);
                    let r = (x1 - ust * 0.2) / 2.0;
                    let c0 = v(r + ust * 0.1, cap - r * 1.05);
                    let o = Pen { l: r, s: r * 1.05, ang: 0.0, p: 2.0 }.outline(c0, 1.0);
                    ub.fill(o);
                    ub.fill(vec![v(c0.x, cap), v(x1, cap), v(x1, c0.y - r * 1.05), v(c0.x, c0.y - r * 1.05)]);
                }
            }
            return Some(ub.done(0.6, 0.6));
        }
        '·' => b.dot(v(ds / 2.0, axis + th * 0.2), ds),
        '•' => {
            let d2 = ds * 1.6;
            b.fill(Pen::circle(d2 / 2.0).outline(v(d2 / 2.0, axis + th * 0.2), 1.0));
        }
        '°' => {
            let sv = b.stem;
            b.stem = sv * 0.6;
            b.pen = m.pen.scaled(0.6);
            b.hth = th * 0.6;
            let d = cap * 0.34;
            b.oval(0.0, d * 0.95, cap - d, cap + m.over * 0.5);
            b.stem = sv;
        }
        '…' => {
            let gap = ds * 1.25 + st * 0.4;
            for k in 0..3 {
                b.dot(v(ds / 2.0 + k as f64 * (ds + gap), ds / 2.0), ds);
            }
            l = 0.6;
            r = 0.6;
        }
        '«' | '»' | '‹' | '›' => {
            let hh = xh * 0.28;
            let hw = hh * 0.72;
            let dir = if c == '»' || c == '›' { 1.0 } else { -1.0 };
            let y = axis;
            chevron(&mut b, hw, y, hw, hh, dir);
            if c == '«' || c == '»' {
                chevron(&mut b, hw * 2.4 + st * 0.5, y, hw, hh, dir);
            }
            l = 0.4;
            r = 0.4;
        }
        '©' | '®' => {
            let d = cap * 1.02;
            let sv = b.stem;
            b.stem = sv * 0.55;
            b.pen = m.pen.scaled(0.55);
            b.hth = th * 0.55;
            b.oval(0.0, d, -m.over, cap + m.over);
            b.stem = sv * 0.72;
            b.pen = m.pen.scaled(0.72);
            b.hth = th * 0.72;
            let inner = d * 0.5;
            let (x0, y0) = ((d - inner) / 2.0, cap * 0.26);
            if c == '©' {
                let (cx, cy, rx, ry) = b.ebox(x0, x0 + inner, y0, cap - y0 + m.over * 0.0);
                let p = b.arc(cx, cy, rx, ry, 40.0, 320.0);
                b.stroke(&p, Cap::Square, Cap::Square);
            } else {
                let xs = x0 + b.stem * 0.5;
                let (yb, yt) = (y0, cap - y0);
                b.stem(xs, yb, yt);
                let ym = (yb + yt) / 2.0;
                b.bowl(xs, x0 + inner * 0.95, ym - b.hth / 2.0, yt, None, None);
                b.diag_as(v(xs + inner * 0.35, ym), v(x0 + inner * 0.92, yb), true, Cap::Butt, HCUT);
            }
            b.stem = sv;
            l = 0.6;
            r = 0.6;
        }
        '™' => {
            // T and M at small size, raised
            let k = 0.42;
            let hh = cap * k;
            let y0 = cap - hh;
            let sv = b.stem;
            b.stem = sv * 0.62;
            b.pen = m.pen.scaled(0.62);
            let t = b.stem;
            let tw = hh * 0.9;
            b.bar(0.0, tw, cap - t * 0.4, VCUT, VCUT);
            b.stem(tw / 2.0, y0, cap);
            let mx = tw + t * 1.4;
            let mw = hh * 1.1;
            b.stem(mx, y0, cap);
            b.stem(mx + mw, y0, cap);
            b.line(v(mx + t * 0.2, cap), v(mx + mw / 2.0, y0 + hh * 0.2), HCUT, Cap::Butt);
            b.line(v(mx + mw - t * 0.2, cap), v(mx + mw / 2.0, y0 + hh * 0.2), HCUT, Cap::Butt);
            b.clip(-100.0, mx + mw + 100.0, cap, cap + 100.0);
            b.stem = sv;
            l = 0.5;
            r = 0.5;
        }
        _ => return None,
    }
    let mut d = b.done(l, r);
    if adv.is_some() {
        d.advance = adv;
    }
    let _ = lerp;
    Some(d)
}

fn t_of(b: &B) -> f64 {
    b.t()
}

/// Cap for an operator stroke end: plumb for horizontals, level for verticals.
#[allow(non_snake_case)]
fn HCUT_V(a: V, e: V) -> Cap {
    if (e.x - a.x).abs() > (e.y - a.y).abs() {
        VCUT
    } else {
        HCUT
    }
}

fn map_ink(b: &mut B, f: impl Fn(V) -> V, flip_dirs: bool, reverse_x: bool) {
    for st in b.ink.strokes.iter_mut() {
        for c in st.segs.iter_mut() {
            c.p0 = f(c.p0);
            c.c1 = f(c.c1);
            c.c2 = f(c.c2);
            c.p3 = f(c.p3);
        }
        let fix = |cap: Cap| match cap {
            Cap::Cut(d) => Cap::Cut(if reverse_x { v(-d.x, d.y) } else if flip_dirs { -d } else { d }),
            o => o,
        };
        st.cap0 = fix(st.cap0);
        st.cap1 = fix(st.cap1);
        if reverse_x {
            // a mirrored broad nib leans the other way
            st.pen.ang = -st.pen.ang;
        }
    }
    for p in b.ink.fills.iter_mut().chain(b.ink.holes.iter_mut()) {
        for q in p.iter_mut() {
            *q = f(*q);
        }
    }
}

/// Mirror everything drawn so far about the vertical line x = `ax`.
pub fn mirror_ink(b: &mut B, ax: f64) {
    map_ink(b, |p| v(2.0 * ax - p.x, p.y), false, true);
}
/// Rotate everything 180° about `c`.
pub fn rotate_ink(b: &mut B, c: V) {
    map_ink(b, |p| v(2.0 * c.x - p.x, 2.0 * c.y - p.y), true, false);
}
pub fn shift_ink(b: &mut B, d: V) {
    map_ink(b, |p| p + d, false, false);
}
