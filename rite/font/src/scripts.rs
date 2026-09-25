//! Greek, Cyrillic and a mathematical starter set.
//!
//! Letters that *are* a Latin letter (Α, А, Ο, о, р…) are not redrawn: `cmap`
//! points them at the Latin glyph (`ALIASES`). Cyrillic lowercase is, in the
//! upright style, mostly the capitals at x-height, so it is drawn as true small
//! caps from the same capital constructions (`Metrics::small_caps`).

use crate::build::{along, at_x, at_y, side::*, Drawn, Metrics, B, HCUT, VCUT};
use crate::curve::*;
use crate::ink::{Cap, Pen};
use crate::lower::{c_terms, dir_to_v, o_width, term_ball};
use crate::punct::mirror_ink;
use crate::style::{Serif, Style};
use crate::upper::{cw, o_cap};

pub const ALIASES: &[(char, char)] = &[
    // Greek capitals
    ('Α', 'A'), ('Β', 'B'), ('Ε', 'E'), ('Ζ', 'Z'), ('Η', 'H'), ('Ι', 'I'), ('Κ', 'K'), ('Μ', 'M'), ('Ν', 'N'), ('Ο', 'O'),
    ('Ρ', 'P'), ('Τ', 'T'), ('Υ', 'Y'), ('Χ', 'X'),
    // Greek lowercase with Latin twins
    ('ο', 'o'), ('ν', 'v'),
    // Cyrillic capitals
    ('А', 'A'), ('В', 'B'), ('Е', 'E'), ('К', 'K'), ('М', 'M'), ('Н', 'H'), ('О', 'O'), ('Р', 'P'), ('С', 'C'), ('Т', 'T'),
    ('Х', 'X'), ('Ѕ', 'S'), ('І', 'I'), ('Ј', 'J'), ('Ё', 'Ë'), ('Ї', 'Ï'),
    // Cyrillic lowercase with Latin twins
    ('а', 'a'), ('е', 'e'), ('о', 'o'), ('р', 'p'), ('с', 'c'), ('у', 'y'), ('х', 'x'), ('ѕ', 's'), ('і', 'i'), ('ј', 'j'),
    ('ё', 'ë'), ('ї', 'ï'),
    // math that is punctuation
    ('∗', '*'), ('∕', '/'), ('∣', '|'), ('∼', '~'),
];

pub const CHARS: &str = "ΓΔΘΛΞΠΣΦΨΩαβγδεζηθικλμξπρςστυφχψωБГДЖЗИЙЛПУФЦЧШЩЪЫЬЭЮЯЄҐбвгджзийклмнптфцчшщъыьэюяєґ≤≥≠≈≡∞√∇∆∂∫∑∏∈∉∀∃∧∨∪∩⊂⊃⊆⊇∅→←↑↓↔⇒⇔∝∘′″ℝℕℤℚℂ";

fn lerp(a: f64, b: f64, t: f64) -> f64 {
    a + (b - a) * t
}

pub fn draw(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    if !CHARS.contains(c) {
        return None;
    }
    if let Some(d) = cyrillic(c, s, m) {
        return Some(d);
    }
    if let Some(d) = greek_upper(c, s, m) {
        return Some(d);
    }
    if let Some(d) = greek_lower(c, s, m) {
        return Some(d);
    }
    math(c, s, m)
}

// ---------------------------------------------------------------- Cyrillic

fn cyrillic(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let is_cyr = ('\u{0400}'..='\u{04FF}').contains(&c);
    if !is_cyr {
        return None;
    }
    if c.is_lowercase() {
        let up = c.to_uppercase().next()?;
        let sc = m.small_caps();
        // б and ф keep their own lowercase shapes (ascender / descender)
        if c == 'б' {
            return cyr_be_lower(s, m);
        }
        if c == 'ф' {
            return phi_lower(s, m);
        }
        let latin = ALIASES.iter().find(|a| a.0 == up).map(|a| a.1);
        let mut d = match latin {
            Some(l) => crate::upper::draw(l, s, &sc)?,
            None => cyr_cap(up, s, &sc)?,
        };
        d.l *= 0.95;
        d.r *= 0.95;
        return Some(d);
    }
    cyr_cap(c, s, m)
}

/// The Cyrillic capitals that aren't Latin letters.
pub fn cyr_cap(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::uc(s, m);
    let cap = m.cap;
    let st = m.ustem;
    let hs = st / 2.0;
    let th = m.uhth;
    let o = m.over;
    let serif = s.serif != Serif::None;
    let desc = m.desc.min(cap * 0.3) * 0.62;
    let d = match c {
        'Г' | 'Ґ' => {
            let w = cw(s, m, 0.76, 0.6);
            let cap_top = if c == 'Ґ' { cap - th / 2.0 } else { cap - th / 2.0 };
            b.stem(hs, 0.0, cap);
            b.bar(hs, w, cap_top, Cap::Butt, if serif { Cap::Butt } else { VCUT });
            if c == 'Ґ' {
                b.stem(w - hs, cap - th, cap + cap * 0.16);
            } else {
                b.beak(w, cap, true, 0.8);
            }
            b.foot(hs, 0.0);
            b.serif(hs, cap, false, true, false);
            b.done(STRAIGHT, OPEN * 0.6)
        }
        'Б' => {
            let w = cw(s, m, 0.9, 0.78);
            let waist = cap * 0.56;
            b.stem(hs, 0.0, cap);
            b.bar(hs, w * 0.92, cap - th / 2.0, Cap::Butt, if serif { Cap::Butt } else { VCUT });
            b.bowl(hs, w, 0.0, waist + th / 2.0, None, None);
            b.beak(w * 0.92, cap, true, 0.8);
            b.serif(hs, cap, false, true, false);
            b.serif(hs, 0.0, true, true, false);
            b.done(STRAIGHT, ROUND)
        }
        'Д' | 'Ц' | 'Щ' => {
            let (w, feet) = match c {
                'Д' => (cw(s, m, 1.0, 0.98), 2),
                'Ц' => (cw(s, m, 1.02, 1.02), 1),
                _ => (cw(s, m, 1.46, 1.46), 1),
            };
            let bot = -desc;
            if c == 'Д' {
                let xl = st * 0.9;
                let xr = w - st * 0.9;
                b.stem(xr, 0.0, cap);
                b.bar(xl + st * 0.35, xr, cap - th / 2.0, VCUT, Cap::Butt);
                // the left leg bows out as it falls to the base
                let p = path(v(xl + st * 0.35, cap)).line(v(xl + st * 0.35, cap * 0.55)).tension(b.t()).to(v(xl - st * 0.3, th), dir_to_v(-0.45, -1.0));
                b.stroke(&p, Cap::Butt, Cap::Butt);
                b.bar(0.0, w, th / 2.0, VCUT, VCUT);
                let _ = feet;
                b.stem(hs * 0.8, bot, th);
                b.stem(w - hs * 0.8, bot, th);
                b.serif(xr, cap, false, true, true);
            } else {
                let n = if c == 'Ц' { 2 } else { 3 };
                let body = if c == 'Ц' { w - st * 0.8 } else { w - st * 0.8 };
                let gap = (body - st) / (n - 1) as f64;
                for i in 0..n {
                    let x = hs + gap * i as f64;
                    b.stem(x, 0.0, cap);
                    b.serif(x, cap, false, true, true);
                }
                b.bar(hs, w, th / 2.0, Cap::Butt, Cap::Butt);
                b.stem(w - hs * 0.8, bot, th);
            }
            b.done(STRAIGHT * 0.8, STRAIGHT * 0.8)
        }
        'Ш' => {
            let w = cw(s, m, 1.42, 1.42);
            let gap = (w - st) / 2.0;
            for i in 0..3 {
                let x = hs + gap * i as f64;
                b.stem(x, 0.0, cap);
                b.serif(x, cap, false, true, true);
            }
            b.bar(hs, w - hs, th / 2.0, Cap::Butt, Cap::Butt);
            b.done(STRAIGHT, STRAIGHT)
        }
        'Ж' => {
            let w = cw(s, m, 1.36, 1.4);
            let xm = w / 2.0;
            b.stem(xm, 0.0, cap);
            let jy = cap * 0.5;
            for sg in [1.0, -1.0] {
                let ax = xm + sg * (w / 2.0 - st * 0.5);
                let jx = xm + sg * hs * 1.1;
                let arm_top = v(ax, cap);
                let arm_end = at_x(arm_top, v(jx, jy), xm);
                b.diag(arm_top, arm_end, HCUT, VCUT);
                let root = arm_top.lerp(arm_end, 0.62);
                b.diag(root, v(xm + sg * (w / 2.0 - st * 0.45), 0.0), along(arm_top, arm_end), HCUT);
                b.serif(ax, cap, false, true, true);
                b.serif(xm + sg * (w / 2.0 - st * 0.45), 0.0, true, true, true);
            }
            b.foot(xm, 0.0);
            b.serif(xm, cap, false, true, true);
            b.done(DIAG, DIAG)
        }
        'З' | 'Э' | 'Є' => {
            let w = cw(s, m, 0.88, 0.76);
            if c == 'З' {
                three(&mut b, 0.0, w, -o, cap + o, s);
                b.done(OPEN, ROUND)
            } else {
                // a mirrored C, with a bar (Э) — Є is the unmirrored C with a bar
                let (cx, cy, rx, ry) = b.ebox(0.0, w, -o, cap + o);
                let (at, ab) = c_terms(s);
                let p = b.arc(cx, cy, rx, ry, at * 0.92 + 2.0, 360.0 - ab * 0.92);
                let tc = b.arc_cap();
                b.stroke(&p, tc, tc);
                term_ball(&mut b, cx, cy, rx, ry, at * 0.92 + 2.0);
                term_ball(&mut b, cx, cy, rx, ry, 360.0 - ab * 0.92);
                b.bar(cx - rx, cx + rx * 0.35, cap * 0.5, Cap::Butt, VCUT);
                if c == 'Э' {
                    mirror_ink(&mut b, w / 2.0);
                    b.done(OPEN, ROUND)
                } else {
                    b.done(ROUND, OPEN)
                }
            }
        }
        'И' | 'Й' => {
            let w = cw(s, m, 1.0, 1.0);
            let (xl, xr) = (hs, w - hs);
            let wv = b.thin_w();
            b.line_w(v(xl, 0.0), v(xl, cap), wv, wv, HCUT, HCUT);
            b.line_w(v(xr, 0.0), v(xr, cap), wv, wv, HCUT, HCUT);
            b.diag_as(v(xl + hs * 0.2, 0.0), v(xr - hs * 0.2, cap), true, HCUT, HCUT);
            b.serif(xl, 0.0, true, true, true);
            b.serif(xr, 0.0, true, true, true);
            b.serif(xl, cap, false, true, true);
            b.serif(xr, cap, false, true, true);
            if c == 'Й' {
                let bw = w * 0.2;
                let y0 = cap + cap * 0.08;
                let p = path_d(v(w / 2.0 - bw, y0 + cap * 0.14), DOWN).tension(b.t()).to(v(w / 2.0, y0 + th * 0.3), RIGHT).to(v(w / 2.0 + bw, y0 + cap * 0.14), UP);
                b.stroke_pen(&p, m.upen.scaled(0.8), HCUT, HCUT);
            }
            b.done(STRAIGHT, STRAIGHT)
        }
        'Л' | 'П' => {
            let w = if c == 'П' { cw(s, m, 1.0, 1.0) } else { cw(s, m, 0.98, 0.96) };
            let xr = w - hs;
            b.stem(xr, 0.0, cap);
            if c == 'П' {
                b.stem(hs, 0.0, cap);
                b.bar(hs, xr, cap - th / 2.0, Cap::Butt, Cap::Butt);
                b.foot(hs, 0.0);
                b.serif(hs, cap, false, true, false);
            } else {
                let xl = st * 1.0;
                b.bar(xl, xr, cap - th / 2.0, Cap::Butt, Cap::Butt);
                let p = path(v(xl, cap)).line(v(xl, cap * 0.5)).tension(b.t()).to(v(xl - st * 0.2, cap * 0.1), dir_to_v(-0.5, -1.0)).to(v(-st * 0.2, th * 0.3), dir_to_v(-1.0, -0.2));
                b.stroke(&p, Cap::Butt, b.tc_line());
            }
            b.foot(xr, 0.0);
            b.serif(xr, cap, false, false, true);
            b.done(if c == 'П' { STRAIGHT } else { OPEN * 0.3 }, STRAIGHT)
        }
        'У' => {
            let w = cw(s, m, 0.96, 0.96);
            let inset = st * 0.6;
            let xb = w * 0.36;
            let yj = cap * 0.3;
            let rt = v(w - inset, cap);
            let bt = v(xb, 0.0);
            b.diag(rt, v(bt.x + (rt.x - bt.x) * 0.02, th * 0.6), HCUT, Cap::Butt);
            let t = yj / cap;
            let jx = bt.x + (rt.x - bt.x) * t;
            b.diag(v(inset, cap), v(jx, yj), HCUT, Cap::Butt);
            let p = path_d(v(bt.x + (rt.x - bt.x) * 0.02, th * 0.6), dir_to_v(-0.3, -1.0)).tension(b.t()).to(v(bt.x - st * 0.8, th / 2.0), LEFT).to(v(st * 0.2, th * 0.8), dir_to_v(-1.0, 0.2));
            b.stroke(&p, Cap::Butt, b.tc_line());
            b.serif(inset, cap, false, true, true);
            b.serif(w - inset, cap, false, true, true);
            b.done(DIAG, DIAG)
        }
        'Ф' => {
            let w = o_cap(s, m) * 1.05;
            b.stem(w / 2.0, 0.0, cap);
            let sv = (b.stem, b.hth);
            b.stem = st * 0.95;
            b.oval(0.0, w, cap * 0.14, cap * 0.86);
            b.stem = sv.0;
            b.hth = sv.1;
            b.foot(w / 2.0, 0.0);
            b.serif(w / 2.0, cap, false, true, true);
            b.done(ROUND, ROUND)
        }
        'Ч' => {
            let w = cw(s, m, 0.94, 0.9);
            let (xl, xr) = (hs, w - hs);
            b.stem(xr, 0.0, cap);
            let yj = cap * 0.4;
            let p = path(v(xl, cap)).line(v(xl, yj + cap * 0.18)).tension(b.t()).to(v(xl + (xr - xl) * 0.42, yj - th * 0.1), RIGHT).to(v(xr, yj + cap * 0.04), dir_to_v(1.0, 0.25)).w(1.0 - s.trap);
            b.stroke(&p, HCUT, Cap::Butt);
            b.serif(xl, cap, false, true, true);
            b.serif(xr, cap, false, true, true);
            b.foot(xr, 0.0);
            b.done(STRAIGHT, STRAIGHT)
        }
        'Ъ' | 'Ь' | 'Ы' => {
            let arm = if c == 'Ъ' { cw(s, m, 0.26, 0.24) } else { 0.0 };
            let w = cw(s, m, 0.86, 0.76);
            let xs = arm + hs;
            b.stem(xs, 0.0, cap);
            let waist = cap * 0.56;
            b.bowl(xs, arm + w, 0.0, waist + th / 2.0, None, None);
            if c == 'Ъ' {
                b.bar(0.0, xs, cap - th / 2.0, VCUT, Cap::Butt);
                b.beak_m(0.0, cap, true, 0.8);
            } else {
                b.serif(xs, cap, false, true, true);
            }
            b.serif(xs, 0.0, true, true, false);
            if c == 'Ы' {
                let x2 = arm + w + st * 1.2 + hs;
                b.stem(x2, 0.0, cap);
                b.foot(x2, 0.0);
                b.serif(x2, cap, false, true, true);
                return Some(b.done(STRAIGHT, STRAIGHT));
            }
            b.done(if c == 'Ъ' { OPEN * 0.5 } else { STRAIGHT }, ROUND)
        }
        'Ю' => {
            let ow = o_cap(s, m) * 0.9;
            let xs = hs;
            b.stem(xs, 0.0, cap);
            let x0 = st * 1.9;
            b.bar(xs, x0 + st * 0.3, cap * 0.5, Cap::Butt, Cap::Butt);
            b.oval(x0, x0 + ow, -o, cap + o);
            b.foot(xs, 0.0);
            b.serif(xs, cap, false, true, true);
            b.done(STRAIGHT, ROUND)
        }
        'Я' => {
            // a mirrored R
            let w = cw(s, m, 0.96, 0.82);
            let waist = cap * lerp(0.44, 0.50, s.bar - 0.38);
            b.stem(w - hs, 0.0, cap);
            b.bowl(w - hs, 0.0, waist - th / 2.0, cap, None, None);
            let xj = (w - hs) * 0.5;
            b.diag_as(v(xj, waist), v(st * 0.45, 0.0), false, HCUT, HCUT);
            b.foot(w - hs, 0.0);
            b.serif(w - hs, cap, false, false, true);
            b.serif(st * 0.45, 0.0, true, true, true);
            b.done(DIAG * 2.0, STRAIGHT)
        }
        _ => return None,
    };
    Some(d)
}

/// З / ε: two bowls opening left (or right when mirrored by the caller).
fn three(b: &mut B, x0: f64, w: f64, y0: f64, y1: f64, s: &Style) {
    let st = b.stem;
    let th = b.hth;
    let h = y1 - y0;
    let ym = y0 + h * 0.54;
    let top_c = y1 - th / 2.0;
    let bot_c = y0 + th / 2.0;
    let rxu = (w - st) * 0.44;
    let cxu = x0 + w * 0.49;
    let (cyu, ryu) = ((top_c + ym) / 2.0, (top_c - ym) / 2.0);
    let rxl = (w - st) * 0.5;
    let cxl = x0 + w * 0.5;
    let (cyl, ryl) = ((bot_c + ym) / 2.0, (ym - bot_c) / 2.0);
    let (at, ab) = c_terms(s);
    let a0 = 180.0 - at * 0.95;
    let tail = w * 0.16;
    let up = b.arc(cxu, cyu, rxu, ryu, a0, -90.0).line(v(cxu - tail, ym));
    b.stroke(&up, b.arc_cap(), Cap::Butt);
    let a1 = 180.0 + ab * 0.95;
    let lo = path(v(cxl - tail, ym)).line(v(cxl, ym)).then(b.arc(cxl, cyl, rxl, ryl, 90.0, a1 - 360.0));
    b.stroke(&lo, Cap::Butt, b.arc_cap());
    term_ball(b, cxu, cyu, rxu, ryu, a0);
    term_ball(b, cxl, cyl, rxl, ryl, a1);
}

fn cyr_be_lower(s: &Style, m: &Metrics) -> Option<Drawn> {
    // б: an o with a flag rising from its top-left, over to the right
    let mut b = B::lc(s, m);
    let w = o_width(s, m);
    b.oval(0.0, w, -m.over, m.xh * 1.04 + m.over);
    let (cx, cy, rx, _) = b.ebox(0.0, w, -m.over, m.xh * 1.04 + m.over);
    let t = b.t();
    let p = path_d(v(cx - rx, cy), UP).tension(t).to(v(cx - rx * 0.5, m.asc * 0.9), dir_to_v(0.6, 1.0)).to(v(w * 0.95, m.asc + m.over * 0.4 - m.hth / 2.0), dir_to_v(1.0, 0.1));
    b.stroke(&p, Cap::Butt, b.tc());
    Some(b.done(ROUND, ROUND))
}

fn phi_lower(s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::lc(s, m);
    let w = o_width(s, m) * 1.12;
    b.stem(w / 2.0, -m.desc, m.asc);
    b.oval(0.0, w, -m.over, m.xh + m.over);
    b.head(w / 2.0, m.asc);
    b.foot(w / 2.0, -m.desc);
    Some(b.done(ROUND, ROUND))
}

// ---------------------------------------------------------------- Greek

fn greek_upper(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::uc(s, m);
    let cap = m.cap;
    let st = m.ustem;
    let hs = st / 2.0;
    let th = m.uhth;
    let o = m.over;
    let sharp = s.term == crate::style::Term::Perp;
    let d = match c {
        'Γ' => return cyr_cap('Г', s, m),
        'Π' => return cyr_cap('П', s, m),
        'Φ' => return cyr_cap('Ф', s, m),
        'Δ' | 'Λ' => {
            let w = cw(s, m, 1.02, 1.04);
            let inset = st * 0.62;
            let over = if sharp { st * 0.95 } else { st * 0.22 };
            let apex = v(w / 2.0, cap + over);
            b.diag(v(inset, 0.0), apex, HCUT, HCUT);
            b.diag(v(w - inset, 0.0), apex, HCUT, HCUT);
            b.clip(-50.0, w + 50.0, if sharp { cap + o * 1.2 } else { cap }, cap + 500.0);
            if c == 'Δ' {
                b.bar(0.0, w, th / 2.0, Cap::Butt, Cap::Butt);
                b.clip(-100.0, 0.0, -100.0, cap);
                b.clip(w, w + 100.0, -100.0, cap);
            } else {
                b.serif(inset, 0.0, true, true, true);
                b.serif(w - inset, 0.0, true, true, true);
            }
            b.done(DIAG, DIAG)
        }
        'Θ' => {
            let w = o_cap(s, m);
            b.oval(0.0, w, -o, cap + o);
            b.bar(w * 0.3, w * 0.7, cap / 2.0, Cap::Butt, Cap::Butt);
            b.done(ROUND, ROUND)
        }
        'Ξ' => {
            let w = cw(s, m, 0.9, 0.84);
            let armc = if b.serifed() { Cap::Butt } else { VCUT };
            b.bar(0.0, w, cap - th / 2.0, armc, armc);
            b.bar(w * 0.14, w * 0.86, cap / 2.0, VCUT, VCUT);
            b.bar(0.0, w, th / 2.0, armc, armc);
            b.beak(w, cap, true, 0.7);
            b.beak_m(0.0, cap, true, 0.7);
            b.beak(w, 0.0, false, 0.7);
            b.beak_m(0.0, 0.0, false, 0.7);
            b.done(OPEN * 0.6, OPEN * 0.6)
        }
        'Σ' => {
            let w = cw(s, m, 0.86, 0.8);
            let armc = if b.serifed() { Cap::Butt } else { VCUT };
            b.bar(st * 0.05, w, cap - th / 2.0, Cap::Butt, armc);
            b.bar(st * 0.05, w * 1.02, th / 2.0, Cap::Butt, armc);
            let mid = v(w * 0.5, cap * 0.5);
            b.diag_as(v(st * 0.5, cap - th * 0.5), mid, true, Cap::Butt, Cap::Butt);
            b.diag_as(mid, v(st * 0.5, th * 0.5), false, Cap::Butt, Cap::Butt);
            b.clip(-200.0, st * 0.05, -100.0, cap + 100.0);
            b.beak(w, cap, true, 0.8);
            b.beak(w * 1.02, 0.0, false, 0.8);
            b.done(OPEN * 0.5, OPEN * 0.7)
        }
        'Ψ' => {
            let w = cw(s, m, 1.08, 1.1);
            let xm = w / 2.0;
            b.stem(xm, 0.0, cap);
            let yb = cap * 0.32;
            let ry = cap * 0.28;
            let p = path(v(hs, cap)).line(v(hs, yb + ry)).then(b.arc(xm, yb + ry, xm - hs, ry, 180.0, 360.0)).line(v(w - hs, cap));
            b.stroke(&p, HCUT, HCUT);
            b.foot(xm, 0.0);
            b.serif(hs, cap, false, true, true);
            b.serif(w - hs, cap, false, true, true);
            b.serif(xm, cap, false, true, true);
            b.done(STRAIGHT * 0.9, STRAIGHT * 0.9)
        }
        'Ω' => {
            let w = o_cap(s, m) * 1.02;
            let (cx, cy, rx, ry) = b.ebox(w * 0.04, w * 0.96, cap * 0.1, cap + o);
            // left foot → round the top → right foot
            let (pl, dl) = b.ell(cx, cy, rx, ry, 242.0);
            let (pr, dr) = b.ell(cx, cy, rx, ry, 298.0);
            let p = path_d(v(pl.x, th * 0.5 + st * 0.2), dir_to_v(0.1, 1.0))
                .tension(b.t())
                .to(pl, -dl)
                .to(v(cx - rx, cy), UP)
                .to(v(cx, cy + ry), RIGHT)
                .to(v(cx + rx, cy), DOWN)
                .to(pr, dr)
                .to(v(pr.x, th * 0.5 + st * 0.2), dir_to_v(0.1, -1.0));
            b.stroke(&p, Cap::Butt, Cap::Butt);
            b.bar(0.0, pl.x + hs * 0.9, th / 2.0, VCUT, Cap::Butt);
            b.bar(pr.x - hs * 0.9, w, th / 2.0, Cap::Butt, VCUT);
            b.done(OPEN * 0.6, OPEN * 0.6)
        }
        _ => return None,
    };
    Some(d)
}

fn greek_lower(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::lc(s, m);
    let xh = m.xh;
    let o = m.over;
    let st = m.stem;
    let hs = st / 2.0;
    let th = m.hth;
    let asc = m.asc;
    let desc = m.desc;
    let cn = m.cn;
    let ow = o_width(s, m);
    let t = b.t();
    let d = match c {
        'α' => {
            let w = ow * 1.02;
            let bw = ow * 0.9;
            b.oval(0.0, bw, -o, xh + o);
            // the tail: down the right side, kicking out at the foot
            let xr = bw - st * 0.4;
            let p = path_d(v(xr + st * 0.2, xh + o * 0.5), dir_to_v(-0.15, -1.0)).tension(t).to(v(xr, xh * 0.35), DOWN).to(v(w - st * 0.1, th * 0.3), dir_to_v(1.0, -0.4));
            b.stroke(&p, HCUT, b.tc_line());
            b.done(ROUND, OPEN * 0.4)
        }
        'β' => {
            let xs = hs;
            let w = (cn + 2.0 * st) * 0.96;
            let top = asc + o * 0.5 - th / 2.0;
            let r = (w - st) * 0.42;
            let waist = xh * 0.95;
            let p = path(v(xs, -desc))
                .line(v(xs, asc - r * 1.1))
                .tension(t)
                .to(v(xs, asc - r * 1.1), UP)
                .to(v(xs + r, top), RIGHT)
                .to(v(xs + r * 1.9, asc - r * 1.05), DOWN)
                .to(v(xs + r * 0.8, waist), LEFT)
                .to(v(w - hs, xh * 0.45), DOWN)
                .to(v(xs + (w - xs) * 0.5, -o + th / 2.0), LEFT)
                .to(v(xs, xh * 0.14), dir_to_v(-0.6, 1.0));
            b.stroke(&p, HCUT, Cap::Butt);
            b.done(STRAIGHT, ROUND)
        }
        'γ' => {
            let w = (cn + 2.0 * st) * 0.94;
            let inset = st * 0.6;
            let v0 = v(w / 2.0, -desc * 0.25);
            b.diag(v(inset, xh), v0, HCUT, Cap::Butt);
            b.diag(v(w - inset, xh), v0, HCUT, Cap::Butt);
            b.stem(w / 2.0, -desc, -desc * 0.2);
            b.done(DIAG, DIAG)
        }
        'δ' => {
            let w = ow;
            b.oval(0.0, w, -o, xh * 0.98 + o);
            let (cx, cy, rx, ry) = b.ebox(0.0, w, -o, xh * 0.98 + o);
            let p = path_d(v(cx - rx * 0.3, cy + ry * 0.9), dir_to_v(-0.9, 0.8))
                .tension(t)
                .to(v(cx - rx * 0.55, asc * 0.82), UP)
                .to(v(cx + rx * 0.2, asc + o * 0.5 - th / 2.0), RIGHT)
                .to(v(cx + rx * 0.85, asc * 0.9), dir_to_v(0.6, -0.6));
            b.stroke(&p, Cap::Butt, b.tc());
            b.done(ROUND, ROUND)
        }
        'ε' => {
            let w = (cn + 2.0 * st) * 0.8;
            three(&mut b, 0.0, w, -o, xh + o, s);
            mirror_ink(&mut b, w / 2.0);
            b.done(ROUND, OPEN)
        }
        'ζ' | 'ξ' => {
            let w = (cn + 2.0 * st) * 0.86;
            let top = asc - th / 2.0;
            b.bar(w * 0.12, w, top, VCUT, Cap::Butt);
            let p = path_d(v(w * 0.95, top), dir_to_v(-0.8, -0.8))
                .tension(t)
                .to(v(hs * 1.1, xh * 0.35), DOWN)
                .to(v(w * 0.5, th / 2.0), RIGHT)
                .to(v(w * 0.72, -desc * 0.4), DOWN)
                .to(v(w * 0.42, -desc * 0.85), dir_to_v(-1.0, -0.4));
            b.stroke(&p, Cap::Butt, b.tc());
            if c == 'ξ' {
                b.bar(w * 0.3, w * 0.85, xh * 0.72, VCUT, VCUT);
            }
            b.done(OPEN * 0.8, OPEN * 0.6)
        }
        'η' => {
            let nw = cn + 2.0 * st;
            let (xl, xr) = (hs, nw - hs);
            b.stem(xl, 0.0, xh);
            b.arch(xl, xr, xh + o * 0.6, -desc, xh * s.join);
            b.done(STRAIGHT, STRAIGHT)
        }
        'θ' => {
            let w = ow * 0.95;
            b.oval(0.0, w, -o, asc + o);
            b.bar(st * 0.5, w - st * 0.5, (asc) * 0.5, Cap::Butt, Cap::Butt);
            b.done(ROUND, ROUND)
        }
        'ι' => {
            let r = cn * 0.3;
            let p = path(v(hs, xh)).line(v(hs, r)).then(b.arc(hs + r, r + th / 2.0 - o * 0.5, r, r, 180.0, 300.0));
            b.stroke(&p, HCUT, b.tc());
            b.done(STRAIGHT, OPEN * 0.5)
        }
        'κ' => {
            let w = (cn + 2.0 * st) * 0.86;
            b.stem(hs, 0.0, xh);
            let jy = xh * 0.42;
            let arm_top = v(w - st * 0.45, xh);
            let arm_end = at_x(arm_top, v(st * 0.9, jy), hs);
            b.diag(arm_top, arm_end, HCUT, VCUT);
            let root = arm_top.lerp(arm_end, 0.6);
            b.diag(root, v(w - st * 0.45, 0.0), along(arm_top, arm_end), HCUT);
            b.done(STRAIGHT, DIAG)
        }
        'λ' => {
            let w = (cn + 2.0 * st) * 0.94;
            let (t0, t1) = (v(st * 0.4, asc), v(w - st * 0.5, 0.0));
            b.diag(t0, t1, HCUT, HCUT);
            let mid = at_y(t0, t1, asc * 0.48);
            b.diag(mid, v(st * 0.5, 0.0), along(t0, t1), HCUT);
            b.done(DIAG, DIAG)
        }
        'μ' => {
            let nw = cn + 2.0 * st;
            let (xl, xr) = (hs, nw - hs);
            b.stem(xl, -desc, xh);
            b.stem(xr, 0.0, xh);
            let p = path(v(xl, xh * 0.4)).tension(t).to(v(xl, xh * 0.4), DOWN).to(v((xl + xr) / 2.0, -o * 0.5 + th / 2.0), RIGHT).to(v(xr, xh * 0.3), dir_to_v(0.4, 1.0)).w(1.0 - s.trap);
            b.stroke(&p, Cap::Butt, Cap::Butt);
            b.done(STRAIGHT, STRAIGHT)
        }
        'π' => {
            let w = (cn + 2.0 * st) * 1.1;
            b.bar(0.0, w, xh - th / 2.0, VCUT, VCUT);
            b.stem(w * 0.22, 0.0, xh);
            b.stem(w * 0.78, 0.0, xh);
            b.done(OPEN * 0.5, OPEN * 0.5)
        }
        'ρ' => {
            let w = ow;
            b.oval(0.0, w, -o, xh + o);
            b.stem(hs * 1.04, -desc, xh * 0.5);
            b.done(STRAIGHT, ROUND)
        }
        'ς' => {
            let w = ow * 0.9;
            let (cx, cy, rx, ry) = b.ebox(0.0, w, -o, xh + o);
            let (at, _) = c_terms(s);
            let p = b.arc(cx, cy, rx, ry, at, 270.0).to(v(cx + rx * 0.5, -desc * 0.35), dir_to_v(1.0, -0.8)).to(v(cx, -desc * 0.85), dir_to_v(-1.0, -0.3));
            b.stroke(&p, b.arc_cap(), b.tc());
            b.done(ROUND, OPEN)
        }
        'σ' => {
            let w = ow;
            b.oval(0.0, w, -o, xh * 0.92 + o);
            b.bar(w * 0.5, w + cn * 0.3, xh - th / 2.0, Cap::Butt, VCUT);
            b.done(ROUND, OPEN * 0.4)
        }
        'τ' => {
            let w = (cn + 2.0 * st) * 0.85;
            b.bar(0.0, w, xh - th / 2.0, VCUT, VCUT);
            let x = w * 0.45;
            let r = cn * 0.3;
            let p = path(v(x, xh)).line(v(x, r)).then(b.arc(x + r, r + th / 2.0 - o * 0.5, r, r, 180.0, 300.0));
            b.stroke(&p, Cap::Butt, b.tc());
            b.done(OPEN * 0.5, OPEN * 0.5)
        }
        'υ' | 'ω' => {
            let nw = if c == 'ω' { (cn + 2.0 * st) * 1.45 } else { cn + 2.0 * st };
            let (xl, xr) = (hs, nw - hs);
            let yb = -o + th / 2.0;
            if c == 'υ' {
                let p = path(v(xl, xh)).line(v(xl, xh * 0.45)).tension(t).to(v(xl, xh * 0.45), DOWN).to(v((xl + xr) / 2.0, yb), RIGHT).to(v(xr, xh * 0.5), UP).to(v(xr - st * 0.2, xh + o * 0.3), dir_to_v(-0.3, 1.0));
                b.stroke(&p, HCUT, b.tc());
            } else {
                let xm = nw / 2.0;
                for (a, e) in [(xl, xm), (xr, xm)] {
                    let p = path_d(v(a + (xm - a) * 0.25, xh), dir_to_v((xm - a).signum() * -0.5, -1.0))
                        .tension(t)
                        .to(v(a, xh * 0.4), DOWN)
                        .to(v((a + e) / 2.0, yb), dir_to_v((e - a).signum(), 0.0))
                        .to(v(e, xh * 0.45), UP);
                    b.stroke(&p, b.tc(), Cap::Butt);
                }
            }
            b.done(ROUND * 1.1, ROUND * 1.1)
        }
        'φ' => return phi_lower(s, m),
        'χ' => {
            let w = (cn + 2.0 * st) * 0.94;
            b.diag(v(st * 0.4, xh), v(w - st * 0.4, -desc), HCUT, HCUT);
            b.diag(v(w - st * 0.4, xh), v(st * 0.4, -desc), HCUT, HCUT);
            b.done(DIAG, DIAG)
        }
        'ψ' => {
            let nw = (cn + 2.0 * st) * 1.1;
            let (xl, xr) = (hs, nw - hs);
            let xm = nw / 2.0;
            b.stem(xm, -desc, asc);
            let yb = -o + th / 2.0;
            let p = path(v(xl, xh)).line(v(xl, xh * 0.45)).tension(t).to(v(xl, xh * 0.45), DOWN).to(v(xm, yb), RIGHT).to(v(xr, xh * 0.5), UP).to(v(xr, xh), UP);
            b.stroke(&p, HCUT, HCUT);
            b.done(STRAIGHT * 0.9, STRAIGHT * 0.9)
        }
        _ => return None,
    };
    Some(d)
}

// ---------------------------------------------------------------- Math

fn math(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let mut b = B::lc(s, m);
    let st = m.stem;
    let xh = m.xh;
    let cap = m.cap;
    let axis = xh * 0.5 + m.hth * 0.1;
    let opw = (m.cn + 2.0 * st) * 1.08;
    let opt = st * 0.72;
    let pen = Pen::for_stem(opt, s.ratio.max(0.7), 0.0, 2.0);
    let hw = opw / 2.0;
    let t = b.t();
    let ln = |b: &mut B, a: V, e: V| {
        let cap_ = if (e.x - a.x).abs() > (e.y - a.y).abs() { VCUT } else { HCUT };
        b.stroke_pen(&path(a).line(e), pen, cap_, cap_);
    };
    let arrow_head = |b: &mut B, tip: V, dir: V| {
        let k = opw * 0.3;
        let back = tip - dir * k;
        let n = dir.perp() * (k * 0.85);
        b.stroke_pen(&path(back + n).line(tip), pen, Cap::Square, Cap::Butt);
        b.stroke_pen(&path(back - n).line(tip), pen, Cap::Square, Cap::Butt);
        let far = tip + dir * opt * 2.0;
        let q = dir.perp() * opt * 3.0;
        b.clip_poly(vec![tip + q, tip - q, far - q, far + q]);
    };
    let mut l = 0.6;
    let mut r = 0.6;
    match c {
        '≤' | '≥' => {
            let y = axis + opw * 0.1;
            let tip = v(if c == '≤' { 0.0 } else { opw }, y);
            let o2 = if c == '≤' { opw } else { 0.0 };
            b.stroke_pen(&path(v(o2, y + hw * 0.7)).line(tip), pen, VCUT, Cap::Butt);
            b.stroke_pen(&path(v(o2, y - hw * 0.7)).line(tip), pen, VCUT, Cap::Butt);
            b.clip(if c == '≤' { -200.0 } else { opw }, if c == '≤' { 0.0 } else { opw + 200.0 }, y - opw, y + opw);
            ln(&mut b, v(0.0, y - hw * 0.7 - opt * 1.4), v(opw, y - hw * 0.7 - opt * 1.4));
        }
        '≠' | '≡' => {
            let g = opw * if c == '≡' { 0.26 } else { 0.19 };
            ln(&mut b, v(0.0, axis + g), v(opw, axis + g));
            ln(&mut b, v(0.0, axis - g), v(opw, axis - g));
            if c == '≡' {
                ln(&mut b, v(0.0, axis), v(opw, axis));
            } else {
                b.stroke_pen(&path(v(hw - hw * 0.45, axis - hw * 0.95)).line(v(hw + hw * 0.45, axis + hw * 0.95)), pen, Cap::Square, Cap::Square);
            }
        }
        '≈' => {
            for dy in [opw * 0.16, -opw * 0.16] {
                let a = opw * 0.1;
                let y = axis + dy;
                let p = path_d(v(0.0, y - a * 0.4), dir_to_v(0.6, 1.0)).tension(t).to(v(opw * 0.27, y + a), RIGHT).to(v(opw * 0.73, y - a), RIGHT).to(v(opw, y + a * 0.4), dir_to_v(0.6, 1.0));
                b.stroke_pen(&p, pen, Cap::Round, Cap::Round);
            }
        }
        '∞' => {
            let w = opw * 1.3;
            let ry = opw * 0.26;
            let rx = w * 0.26;
            let (c1, c2) = (w * 0.26, w * 0.74);
            let p = path_d(v(w / 2.0, axis), dir_to_v(1.0, 1.0))
                .tension(t)
                .to(v(c2, axis + ry), RIGHT)
                .to(v(c2 + rx, axis), DOWN)
                .to(v(c2, axis - ry), LEFT)
                .to(v(w / 2.0, axis), dir_to_v(-1.0, 1.0))
                .to(v(c1, axis + ry), LEFT)
                .to(v(c1 - rx, axis), DOWN)
                .to(v(c1, axis - ry), RIGHT)
                .close();
            b.stroke_pen(&p, pen, Cap::Butt, Cap::Butt);
        }
        '√' => {
            let w = opw * 1.05;
            let top = cap + m.over;
            b.stroke_pen(&path(v(0.0, axis)).line(v(w * 0.18, axis + opt * 0.3)).line(v(w * 0.42, -m.desc * 0.15)).line(v(w * 0.8, top)).line(v(w * 1.2, top)), pen, Cap::Square, VCUT);
            r = 0.2;
        }
        '∇' | '∆' => {
            let w = opw * 1.1;
            let (yt, yb) = (cap, 0.0);
            let pts = if c == '∆' { [v(0.0, yb), v(w, yb), v(w / 2.0, yt)] } else { [v(0.0, yt), v(w, yt), v(w / 2.0, yb)] };
            let tp = m.pen.scaled(0.9);
            for i in 0..3 {
                b.stroke_pen(&path(pts[i]).line(pts[(i + 1) % 3]), tp, Cap::Pen, Cap::Pen);
            }
        }
        '∂' => {
            let w = o_width(s, m) * 0.98;
            b.oval(0.0, w, -m.over, xh * 0.9 + m.over);
            let (cx, cy, rx, _) = b.ebox(0.0, w, -m.over, xh * 0.9 + m.over);
            let p = path_d(v(cx + rx, cy), UP).tension(t).to(v(cx + rx * 0.2, cap * 0.97), dir_to_v(-0.7, 1.0)).to(v(cx - rx * 0.7, cap * 0.82), dir_to_v(-0.5, -1.0));
            b.stroke(&p, Cap::Butt, b.tc());
        }
        '∫' => {
            let w = opw * 0.62;
            let top = cap + m.desc * 0.2;
            let bot = -m.desc * 0.8;
            let p = path_d(v(w, top - st * 0.4), dir_to_v(-0.3, 1.0))
                .tension(t)
                .to(v(w * 0.72, top - m.hth / 2.0), LEFT)
                .to(v(w * 0.5, top - st * 1.4), DOWN)
                .line(v(w * 0.5, bot + st * 1.4))
                .to(v(w * 0.28, bot + m.hth / 2.0), LEFT)
                .to(v(0.0, bot + st * 0.4), dir_to_v(-0.3, 1.0));
            b.stroke(&p, Cap::Round, Cap::Round);
        }
        '∑' | '∏' => {
            let big = B::uc(s, m);
            drop(big);
            let mut ub = B::uc(s, m);
            let (top, bot) = (cap + m.desc * 0.15, -m.desc * 0.55);
            let w = crate::upper::cw(s, m, 1.02, 1.0);
            let th = m.uhth;
            let hs = m.ustem / 2.0;
            if c == '∏' {
                ub.bar(0.0, w, top - th / 2.0, Cap::Butt, Cap::Butt);
                ub.stem(w * 0.15, bot, top);
                ub.stem(w * 0.85, bot, top);
            } else {
                ub.bar(hs * 0.1, w, top - th / 2.0, Cap::Butt, VCUT);
                ub.bar(hs * 0.1, w * 1.02, bot + th / 2.0, Cap::Butt, VCUT);
                let mid = v(w * 0.5, (top + bot) / 2.0);
                ub.diag_as(v(hs, top - th * 0.5), mid, true, Cap::Butt, Cap::Butt);
                ub.diag_as(mid, v(hs, bot + th * 0.5), false, Cap::Butt, Cap::Butt);
                ub.clip(-200.0, hs * 0.1, bot - 100.0, top + 100.0);
            }
            return Some(ub.done(0.5, 0.5));
        }
        '∈' | '∉' | '⊂' | '⊃' | '⊆' | '⊇' | '∪' | '∩' => {
            let w = opw;
            let ry = hw * 0.8;
            let (y0, y1) = (axis - ry, axis + ry);
            match c {
                '∪' | '∩' => {
                    let (a, e) = if c == '∪' { (y1 + ry * 0.2, y0) } else { (y0 - ry * 0.2, y1) };
                    let dir = if c == '∪' { DOWN } else { UP };
                    let p = path(v(opt * 0.5, a)).line(v(opt * 0.5, axis)).tension(t).to(v(opt * 0.5, axis), dir).to(v(w / 2.0, e), RIGHT).to(v(w - opt * 0.5, axis), -dir).line(v(w - opt * 0.5, a));
                    b.stroke_pen(&p, pen, HCUT, HCUT);
                }
                _ => {
                    // an open C of operator weight (∈ adds a bar)
                    let rx = w * 0.45;
                    let cx = w * 0.5;
                    let p = path(v(w, y1)).line(v(cx, y1)).tension(t).to(v(cx, y1), LEFT).to(v(cx - rx, axis), DOWN).to(v(cx, y0), RIGHT).line(v(w, y0));
                    b.stroke_pen(&p, pen, VCUT, VCUT);
                    if c == '∈' || c == '∉' {
                        ln(&mut b, v(cx - rx, axis), v(w * 0.92, axis));
                    }
                    if c == '⊆' || c == '⊇' {
                        ln(&mut b, v(0.0 + opt * 0.3, y0 - opt * 1.5), v(w, y0 - opt * 1.5));
                    }
                    if c == '∉' {
                        b.stroke_pen(&path(v(w * 0.25, axis - ry * 1.3)).line(v(w * 0.75, axis + ry * 1.3)), pen, Cap::Square, Cap::Square);
                    }
                    if c == '⊃' || c == '⊇' {
                        mirror_ink(&mut b, w / 2.0);
                    }
                }
            }
        }
        '∀' => {
            let mut ub = B::uc(s, m);
            let w = crate::upper::cw(s, m, 1.0, 1.0);
            let inset = m.ustem * 0.6;
            let apex = v(w / 2.0, -m.ustem * 0.2);
            ub.diag(v(inset, cap), apex, HCUT, HCUT);
            ub.diag(v(w - inset, cap), apex, HCUT, HCUT);
            ub.bar(w * 0.26, w * 0.74, cap * 0.62, Cap::Butt, Cap::Butt);
            ub.clip(-100.0, w + 100.0, -300.0, 0.0);
            return Some(ub.done(0.2, 0.2));
        }
        '∃' => {
            let mut ub = B::uc(s, m);
            let w = crate::upper::cw(s, m, 0.84, 0.66);
            let hs = m.ustem / 2.0;
            let th = m.uhth;
            ub.stem(w - hs, 0.0, cap);
            ub.bar(0.0, w - hs, cap - th / 2.0, VCUT, Cap::Butt);
            ub.bar(w * 0.1, w - hs, cap * 0.5, VCUT, Cap::Butt);
            ub.bar(0.0, w - hs, th / 2.0, VCUT, Cap::Butt);
            return Some(ub.done(0.5, 1.0));
        }
        '∧' | '∨' => {
            let (a, e) = if c == '∧' { (axis - hw, axis + hw) } else { (axis + hw, axis - hw) };
            b.stroke_pen(&path(v(0.0, a)).line(v(hw, e)), pen, HCUT, Cap::Butt);
            b.stroke_pen(&path(v(opw, a)).line(v(hw, e)), pen, HCUT, Cap::Butt);
            b.clip(-100.0, opw + 100.0, if c == '∧' { e } else { e - 200.0 }, if c == '∧' { e + 200.0 } else { e });
        }
        '∅' => {
            let w = opw * 1.1;
            let sv = b.stem;
            b.stem = opt;
            b.pen = pen;
            b.hth = opt;
            b.oval(0.0, w, axis - w / 2.0, axis + w / 2.0);
            b.stem = sv;
            b.stroke_pen(&path(v(-opt * 0.3, axis - w * 0.62)).line(v(w + opt * 0.3, axis + w * 0.62)), pen, Cap::Square, Cap::Square);
        }
        '→' | '←' | '↔' | '↑' | '↓' | '⇒' | '⇔' => {
            let w = opw * 1.35;
            match c {
                '↑' | '↓' => {
                    let (y0, y1) = (0.0, cap * 0.92);
                    let x = hw;
                    ln(&mut b, v(x, y0), v(x, y1));
                    if c == '↑' {
                        arrow_head(&mut b, v(x, y1), UP);
                    } else {
                        arrow_head(&mut b, v(x, y0), DOWN);
                    }
                }
                '⇒' | '⇔' => {
                    let g = opw * 0.14;
                    let x0 = if c == '⇔' { opw * 0.28 } else { 0.0 };
                    ln(&mut b, v(x0, axis + g), v(w - opw * 0.28, axis + g));
                    ln(&mut b, v(x0, axis - g), v(w - opw * 0.28, axis - g));
                    arrow_head(&mut b, v(w, axis), RIGHT);
                    if c == '⇔' {
                        arrow_head(&mut b, v(0.0, axis), LEFT);
                    }
                }
                _ => {
                    ln(&mut b, v(0.0, axis), v(w, axis));
                    if c != '←' {
                        arrow_head(&mut b, v(w, axis), RIGHT);
                    }
                    if c != '→' {
                        arrow_head(&mut b, v(0.0, axis), LEFT);
                    }
                }
            }
        }
        '∝' => {
            let w = opw * 1.1;
            let ry = hw * 0.55;
            let p = path_d(v(w, axis + ry), dir_to_v(-1.0, -0.4))
                .tension(t)
                .to(v(w * 0.45, axis), dir_to_v(-1.0, -1.0))
                .to(v(w * 0.22, axis - ry), LEFT)
                .to(v(0.0 + opt * 0.5, axis), UP)
                .to(v(w * 0.22, axis + ry), RIGHT)
                .to(v(w * 0.45, axis), dir_to_v(1.0, -1.0))
                .to(v(w, axis - ry), dir_to_v(1.0, -0.4));
            b.stroke_pen(&p, pen, Cap::Butt, Cap::Butt);
        }
        '∘' => {
            let d = opw * 0.5;
            b.stem = opt * 0.8;
            b.pen = pen.scaled(0.8);
            b.hth = opt * 0.8;
            b.oval(0.0, d, axis - d / 2.0, axis + d / 2.0);
        }
        '′' | '″' => {
            let n = if c == '″' { 2 } else { 1 };
            for i in 0..n {
                let x = st * 0.5 + i as f64 * st * 1.3;
                b.fill(vec![v(x + st * 0.1, cap), v(x + st * 0.9, cap), v(x + st * 0.1, cap * 0.64), v(x - st * 0.25, cap * 0.64)]);
            }
            l = 0.3;
            r = 0.3;
        }
        'ℝ' | 'ℕ' | 'ℤ' | 'ℚ' | 'ℂ' => {
            // blackboard bold: the capital, plus an inner hairline on its stems
            let base = match c {
                'ℝ' => 'R',
                'ℕ' => 'N',
                'ℤ' => 'Z',
                'ℚ' => 'Q',
                _ => 'C',
            };
            let mut d = crate::upper::draw(base, s, m)?;
            let mut ub = B::uc(s, m);
            let us = m.ustem;
            let hair = Pen::for_stem((us * 0.2).max(8.0), 1.0, 0.0, 2.0);
            let inner = |ub: &mut B, x: f64| ub.stroke_pen(&path(v(x, 0.0)).line(v(x, cap)), hair, HCUT, HCUT);
            match base {
                'R' | 'N' => {
                    // hollow the left stem: a white line inside it
                    ub.ink.holes.push(vec![v(us * 0.35, us * 0.4), v(us * 0.62, us * 0.4), v(us * 0.62, cap - us * 0.4), v(us * 0.35, cap - us * 0.4)]);
                    let _ = inner;
                }
                'Z' => {
                    let w = crate::upper::cw(s, m, 0.88, 0.84);
                    ub.stroke_pen(&path(v(w - us * 1.3, cap - m.uhth)).line(v(us * 0.1, m.uhth)), hair, Cap::Butt, Cap::Butt);
                }
                _ => {
                    // Q / C: a second hairline arc inside the left side
                    let w = crate::upper::o_cap(s, m) * if base == 'C' { 0.93 } else { 1.0 };
                    let (cx, cy, rx, ry) = ub.ebox(0.0, w, -m.over, cap + m.over);
                    let p = ub.arc(cx + us * 0.45, cy, rx * 0.93, ry * 0.8, 110.0, 250.0);
                    ub.stroke_pen(&p, hair, Cap::Butt, Cap::Butt);
                }
            }
            // holes must survive the base's union: bake the base first
            let baked = d.ink.baked(v(0.0, 0.0));
            d.ink = baked;
            d.ink.absorb(ub.ink);
            return Some(d);
        }
        _ => return None,
    }
    Some(b.done(l, r))
}

impl<'a> B<'a> {
    /// Remove ink inside an arbitrary polygon.
    pub fn clip_poly(&mut self, p: Vec<V>) {
        self.ink.holes.push(p);
    }
}
