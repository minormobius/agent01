//! Accented Latin and the composed letters (Æ Œ ß Ð Þ Ø Ł …). A precomposed
//! letter is its base glyph — unioned first, so the base's own clipping can't
//! touch the accent — plus a mark drawn with the style's pen and placed off the
//! base's measured ink.

use crate::build::{side::*, Drawn, Metrics, B, HCUT, VCUT};
use crate::curve::*;
use crate::font::draw_char;
use crate::ink::{Cap, Ink, Pen};
use crate::lower::dir_to_v;
use crate::style::{Style, Term};

#[derive(Clone, Copy, PartialEq, Debug)]
enum Mk {
    Acute,
    Grave,
    Circ,
    Caron,
    Tilde,
    Diaer,
    Ring,
    Cedilla,
    Macron,
    Breve,
    Dot,
    Ogonek,
    DblAcute,
    CommaBelow,
    CommaRight,
    TurnedComma,
}

const TABLE: &[(char, char, Mk)] = &[
    ('À', 'A', Mk::Grave), ('Á', 'A', Mk::Acute), ('Â', 'A', Mk::Circ), ('Ã', 'A', Mk::Tilde), ('Ä', 'A', Mk::Diaer), ('Å', 'A', Mk::Ring),
    ('Ç', 'C', Mk::Cedilla), ('È', 'E', Mk::Grave), ('É', 'E', Mk::Acute), ('Ê', 'E', Mk::Circ), ('Ë', 'E', Mk::Diaer),
    ('Ì', 'I', Mk::Grave), ('Í', 'I', Mk::Acute), ('Î', 'I', Mk::Circ), ('Ï', 'I', Mk::Diaer), ('Ñ', 'N', Mk::Tilde),
    ('Ò', 'O', Mk::Grave), ('Ó', 'O', Mk::Acute), ('Ô', 'O', Mk::Circ), ('Õ', 'O', Mk::Tilde), ('Ö', 'O', Mk::Diaer),
    ('Ù', 'U', Mk::Grave), ('Ú', 'U', Mk::Acute), ('Û', 'U', Mk::Circ), ('Ü', 'U', Mk::Diaer), ('Ý', 'Y', Mk::Acute),
    ('à', 'a', Mk::Grave), ('á', 'a', Mk::Acute), ('â', 'a', Mk::Circ), ('ã', 'a', Mk::Tilde), ('ä', 'a', Mk::Diaer), ('å', 'a', Mk::Ring),
    ('ç', 'c', Mk::Cedilla), ('è', 'e', Mk::Grave), ('é', 'e', Mk::Acute), ('ê', 'e', Mk::Circ), ('ë', 'e', Mk::Diaer),
    ('ì', 'ı', Mk::Grave), ('í', 'ı', Mk::Acute), ('î', 'ı', Mk::Circ), ('ï', 'ı', Mk::Diaer), ('ñ', 'n', Mk::Tilde),
    ('ò', 'o', Mk::Grave), ('ó', 'o', Mk::Acute), ('ô', 'o', Mk::Circ), ('õ', 'o', Mk::Tilde), ('ö', 'o', Mk::Diaer),
    ('ù', 'u', Mk::Grave), ('ú', 'u', Mk::Acute), ('û', 'u', Mk::Circ), ('ü', 'u', Mk::Diaer), ('ý', 'y', Mk::Acute), ('ÿ', 'y', Mk::Diaer),
    ('Ā', 'A', Mk::Macron), ('ā', 'a', Mk::Macron), ('Ă', 'A', Mk::Breve), ('ă', 'a', Mk::Breve), ('Ą', 'A', Mk::Ogonek), ('ą', 'a', Mk::Ogonek),
    ('Ć', 'C', Mk::Acute), ('ć', 'c', Mk::Acute), ('Ĉ', 'C', Mk::Circ), ('ĉ', 'c', Mk::Circ), ('Ċ', 'C', Mk::Dot), ('ċ', 'c', Mk::Dot),
    ('Č', 'C', Mk::Caron), ('č', 'c', Mk::Caron), ('Ď', 'D', Mk::Caron), ('ď', 'd', Mk::CommaRight),
    ('Ē', 'E', Mk::Macron), ('ē', 'e', Mk::Macron), ('Ĕ', 'E', Mk::Breve), ('ĕ', 'e', Mk::Breve), ('Ė', 'E', Mk::Dot), ('ė', 'e', Mk::Dot),
    ('Ę', 'E', Mk::Ogonek), ('ę', 'e', Mk::Ogonek), ('Ě', 'E', Mk::Caron), ('ě', 'e', Mk::Caron),
    ('Ĝ', 'G', Mk::Circ), ('ĝ', 'g', Mk::Circ), ('Ğ', 'G', Mk::Breve), ('ğ', 'g', Mk::Breve), ('Ġ', 'G', Mk::Dot), ('ġ', 'g', Mk::Dot),
    ('Ģ', 'G', Mk::CommaBelow), ('ģ', 'g', Mk::TurnedComma), ('Ĥ', 'H', Mk::Circ), ('ĥ', 'h', Mk::Circ),
    ('Ĩ', 'I', Mk::Tilde), ('ĩ', 'ı', Mk::Tilde), ('Ī', 'I', Mk::Macron), ('ī', 'ı', Mk::Macron), ('Ĭ', 'I', Mk::Breve), ('ĭ', 'ı', Mk::Breve),
    ('Į', 'I', Mk::Ogonek), ('į', 'i', Mk::Ogonek), ('İ', 'I', Mk::Dot), ('Ĵ', 'J', Mk::Circ),
    ('Ķ', 'K', Mk::CommaBelow), ('ķ', 'k', Mk::CommaBelow), ('Ĺ', 'L', Mk::Acute), ('ĺ', 'l', Mk::Acute), ('Ļ', 'L', Mk::CommaBelow), ('ļ', 'l', Mk::CommaBelow),
    ('Ľ', 'L', Mk::CommaRight), ('ľ', 'l', Mk::CommaRight),
    ('Ń', 'N', Mk::Acute), ('ń', 'n', Mk::Acute), ('Ņ', 'N', Mk::CommaBelow), ('ņ', 'n', Mk::CommaBelow), ('Ň', 'N', Mk::Caron), ('ň', 'n', Mk::Caron),
    ('Ō', 'O', Mk::Macron), ('ō', 'o', Mk::Macron), ('Ŏ', 'O', Mk::Breve), ('ŏ', 'o', Mk::Breve), ('Ő', 'O', Mk::DblAcute), ('ő', 'o', Mk::DblAcute),
    ('Ŕ', 'R', Mk::Acute), ('ŕ', 'r', Mk::Acute), ('Ŗ', 'R', Mk::CommaBelow), ('ŗ', 'r', Mk::CommaBelow), ('Ř', 'R', Mk::Caron), ('ř', 'r', Mk::Caron),
    ('Ś', 'S', Mk::Acute), ('ś', 's', Mk::Acute), ('Ŝ', 'S', Mk::Circ), ('ŝ', 's', Mk::Circ), ('Ş', 'S', Mk::Cedilla), ('ş', 's', Mk::Cedilla),
    ('Š', 'S', Mk::Caron), ('š', 's', Mk::Caron), ('Ţ', 'T', Mk::Cedilla), ('ţ', 't', Mk::Cedilla), ('Ť', 'T', Mk::Caron), ('ť', 't', Mk::CommaRight),
    ('Ș', 'S', Mk::CommaBelow), ('ș', 's', Mk::CommaBelow), ('Ț', 'T', Mk::CommaBelow), ('ț', 't', Mk::CommaBelow),
    ('Ũ', 'U', Mk::Tilde), ('ũ', 'u', Mk::Tilde), ('Ū', 'U', Mk::Macron), ('ū', 'u', Mk::Macron), ('Ŭ', 'U', Mk::Breve), ('ŭ', 'u', Mk::Breve),
    ('Ů', 'U', Mk::Ring), ('ů', 'u', Mk::Ring), ('Ű', 'U', Mk::DblAcute), ('ű', 'u', Mk::DblAcute), ('Ų', 'U', Mk::Ogonek), ('ų', 'u', Mk::Ogonek),
    ('Ŵ', 'W', Mk::Circ), ('ŵ', 'w', Mk::Circ), ('Ŷ', 'Y', Mk::Circ), ('ŷ', 'y', Mk::Circ), ('Ÿ', 'Y', Mk::Diaer),
    ('Ź', 'Z', Mk::Acute), ('ź', 'z', Mk::Acute), ('Ż', 'Z', Mk::Dot), ('ż', 'z', Mk::Dot), ('Ž', 'Z', Mk::Caron), ('ž', 'z', Mk::Caron),
];

const SPACING: &[(char, Mk)] = &[
    ('´', Mk::Acute), ('`', Mk::Grave), ('ˆ', Mk::Circ), ('ˇ', Mk::Caron), ('˜', Mk::Tilde), ('¨', Mk::Diaer), ('˚', Mk::Ring),
    ('¸', Mk::Cedilla), ('¯', Mk::Macron), ('˘', Mk::Breve), ('˙', Mk::Dot), ('˛', Mk::Ogonek), ('˝', Mk::DblAcute),
];

pub const CHARS: &str = "ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿĀāĂăĄąĆćĈĉĊċČčĎďĒēĔĕĖėĘęĚěĜĝĞğĠġĢģĤĥĨĩĪīĬĭĮįİıĴĶķĹĺĻļĽľŃńŅņŇňŌōŎŏŐőŔŕŖŗŘřŚśŜŝŞşŠšŢţŤťȘșȚțŨũŪūŬŭŮůŰűŲųŴŵŶŷŸŹźŻżŽžÆæŒœßÐðĐđÞþØøŁł´ˆˇ˜¨˚¸¯˘˙˛˝";

fn bbox(polys: &[Vec<V>]) -> (f64, f64, f64, f64) {
    let (mut x0, mut x1, mut y0, mut y1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for p in polys {
        for q in p {
            x0 = x0.min(q.x);
            x1 = x1.max(q.x);
            y0 = y0.min(q.y);
            y1 = y1.max(q.y);
        }
    }
    (x0, x1, y0, y1)
}

/// The base glyph, baked, plus its ink box.
fn base(c: char, s: &Style, m: &Metrics) -> Option<(Drawn, (f64, f64, f64, f64))> {
    let d = draw_char(c, s, m)?;
    let (polys, body) = d.ink.polygons_body();
    let bb = bbox(&polys);
    let mut ink = Ink::default();
    ink.pre = polys;
    Some((Drawn { ink, l: d.l, r: d.r, advance: d.advance, body: d.body.or(body) }, bb))
}

pub fn draw(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    if let Some(&(_, bc, mk)) = TABLE.iter().find(|t| t.0 == c) {
        let (mut d, bb) = base(bc, s, m)?;
        let upper = bc.is_uppercase();
        let mut b = if upper { B::uc(s, m) } else { B::lc(s, m) };
        // horizontal anchor: the stem for i/l/t-like bases, else the ink centre
        let cx = match bc {
            'ı' | 'i' | 'l' | 'I' => {
                if bc == 'l' || bc == 'ı' || bc == 'i' {
                    m.stem / 2.0
                } else {
                    m.ustem / 2.0
                }
            }
            't' => (bb.0 + bb.1) / 2.0 - m.cn * 0.05,
            _ => (bb.0 + bb.1) / 2.0,
        };
        let top = if upper { m.cap } else if "bdfhklt".contains(bc) { m.asc } else { m.xh };
        mark(&mut b, mk, cx, top, upper, bb, s, m);
        d.ink.absorb(b.ink);
        return Some(d);
    }
    if let Some(&(_, mk)) = SPACING.iter().find(|t| t.0 == c) {
        let mut b = B::lc(s, m);
        let w = m.cn * 0.7;
        let bb = (0.0, w, 0.0, m.xh);
        mark(&mut b, mk, w / 2.0, m.xh, false, bb, s, m);
        if mk == Mk::Cedilla || mk == Mk::Ogonek {
            // spacing forms of below-marks sit on the baseline
        }
        return Some(b.done(0.5, 0.5));
    }
    composed(c, s, m)
}

#[allow(clippy::too_many_arguments)]
fn mark(b: &mut B, mk: Mk, cx: f64, top: f64, upper: bool, bb: (f64, f64, f64, f64), s: &Style, m: &Metrics) {
    let st = m.stem;
    let pen = m.pen.scaled(if upper { 0.86 } else { 0.9 });
    let gap = if upper { m.cap * 0.07 } else { (m.asc - m.xh) * 0.2 };
    let y0 = top + gap + if upper { 0.0 } else { m.over };
    let mh = if upper { m.cap * 0.17 } else { (m.asc - m.xh) * 0.5 };
    let ds = b.dot_size() * 0.92;
    let tip = if s.term == Term::Round { Cap::Round } else { Cap::Square };
    let t = b.t();
    let acute = |b: &mut B, x: f64, dir: f64| {
        let w = mh * 0.62;
        let a = v(x - dir * w * 0.45, y0);
        let e = v(x + dir * w * 0.55, y0 + mh);
        let p = path(a).w(0.5).line(e).w(1.0);
        b.stroke_pen(&p, pen, tip, tip);
    };
    match mk {
        Mk::Acute => acute(b, cx, 1.0),
        Mk::Grave => acute(b, cx, -1.0),
        Mk::DblAcute => {
            acute(b, cx - mh * 0.34, 1.0);
            acute(b, cx + mh * 0.34, 1.0);
        }
        Mk::Circ | Mk::Caron => {
            let w = mh * 0.95;
            let (ya, yb) = if mk == Mk::Circ { (y0, y0 + mh * 0.85) } else { (y0 + mh * 0.85, y0) };
            let thin = pen.scaled(0.8);
            b.stroke_pen(&path(v(cx - w, ya)).line(v(cx, yb)), thin, HCUT, Cap::Butt);
            b.stroke_pen(&path(v(cx + w, ya)).line(v(cx, yb)), pen, HCUT, Cap::Butt);
            let (lo, hi) = if mk == Mk::Circ { (yb, yb + st * 2.0) } else { (yb - st * 2.0, yb) };
            b.clip(cx - w * 0.6, cx + w * 0.6, lo, hi);
            if mk == Mk::Circ {
                b.clip(cx - w * 2.0, cx + w * 2.0, y0 - st * 2.0, y0);
            } else {
                b.clip(cx - w * 2.0, cx + w * 2.0, y0 + mh * 0.85, y0 + mh * 0.85 + st * 2.0);
            }
        }
        Mk::Tilde => {
            let w = mh * 1.05;
            let a = mh * 0.26;
            let yc = y0 + mh * 0.42;
            let p = path_d(v(cx - w, yc - a * 0.6), dir_to_v(0.5, 1.0)).tension(t).to(v(cx - w * 0.45, yc + a), RIGHT).to(v(cx + w * 0.45, yc - a), RIGHT).to(v(cx + w, yc + a * 0.6), dir_to_v(0.5, 1.0));
            b.stroke_pen(&p, pen.scaled(0.9), tip, tip);
        }
        Mk::Diaer => {
            let g = (m.cn * 0.26).max(ds * 0.85);
            b.dot(v(cx - g, y0 + ds / 2.0), ds);
            b.dot(v(cx + g, y0 + ds / 2.0), ds);
        }
        Mk::Dot => b.dot(v(cx, y0 + ds / 2.0), ds),
        Mk::Macron => {
            let w = (bb.1 - bb.0) * 0.36;
            b.stroke_pen(&path(v(cx - w, y0 + mh * 0.3)).line(v(cx + w, y0 + mh * 0.3)), pen, VCUT, VCUT);
        }
        Mk::Breve => {
            let w = mh * 0.75;
            let p = path_d(v(cx - w, y0 + mh * 0.8), DOWN).tension(t).to(v(cx, y0 + b.hth * 0.4), RIGHT).to(v(cx + w, y0 + mh * 0.8), UP);
            b.stroke_pen(&p, pen.scaled(0.85), HCUT, HCUT);
        }
        Mk::Ring => {
            let d = mh * 1.1;
            let sv = (b.stem, b.hth, b.pen);
            b.stem = sv.0 * 0.6;
            b.hth = sv.1 * 0.6;
            b.pen = sv.2.scaled(0.6);
            let y = if upper { y0 - gap * 0.4 } else { y0 };
            b.oval(cx - d / 2.0, cx + d / 2.0, y, y + d);
            b.stem = sv.0;
            b.hth = sv.1;
            b.pen = sv.2;
        }
        Mk::Cedilla => {
            let x = cx;
            let r = st * 0.95;
            let p = path(v(x, st * 0.3))
                .line(v(x, -m.desc * 0.16))
                .tension(t)
                .to(v(x + r * 0.9, -m.desc * 0.16 - r * 0.8), DOWN)
                .to(v(x - r * 0.6, -m.desc * 0.16 - r * 1.8), dir_to_v(-1.0, -0.2));
            b.stroke_pen(&p, pen.scaled(0.75), Cap::Butt, tip);
        }
        Mk::Ogonek => {
            let x = bb.1 - st * 0.6;
            let r = st * 1.1;
            let p = path_d(v(x, st * 0.4), dir_to_v(-0.7, -1.0)).tension(t).to(v(x - r * 0.7, -r * 1.0), DOWN).to(v(x + r * 0.3, -r * 1.9), RIGHT);
            b.stroke_pen(&p, pen.scaled(0.75), Cap::Butt, tip);
        }
        Mk::CommaBelow => {
            let y = -m.desc * 0.25;
            comma_small(b, v(cx, y), ds * 0.9, pen);
        }
        Mk::TurnedComma => {
            // ģ: a comma turned 180°, sitting above the bowl
            let before = (b.ink.strokes.len(), b.ink.fills.len());
            let c0 = v(cx, y0 + ds * 1.05);
            comma_small(b, c0, ds * 0.85, pen);
            let rot = |p: V| v(2.0 * c0.x - p.x, 2.0 * c0.y - p.y);
            for st in b.ink.strokes.iter_mut().skip(before.0) {
                for c in st.segs.iter_mut() {
                    c.p0 = rot(c.p0);
                    c.c1 = rot(c.c1);
                    c.c2 = rot(c.c2);
                    c.p3 = rot(c.p3);
                }
            }
            for f in b.ink.fills.iter_mut().skip(before.1) {
                for q in f.iter_mut() {
                    *q = rot(*q);
                }
            }
        }
        Mk::CommaRight => {
            let x = bb.1 + st * 0.55;
            let y = top - ds * 0.45;
            comma_small(b, v(x, y), ds * 0.85, pen);
        }
    }
}

fn comma_small(b: &mut B, c: V, ds: f64, pen: Pen) {
    let r = ds / 2.0;
    b.dot(c, ds);
    let p = path_d(c + v(r * 0.5, -r * 0.2), dir_to_v(0.1, -1.0))
        .tension(b.t())
        .w(0.55)
        .to(c + v(-r * 0.4, -r * 2.2), dir_to_v(-1.0, -0.8))
        .w(0.25);
    b.stroke_pen(&p, pen, Cap::Butt, Cap::Round);
}

/// Letters built from other letters: Æ Œ æ œ ß Ð ð Đ đ Þ þ Ø ø Ł ł.
fn composed(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    let st = m.stem;
    let ust = m.ustem;
    match c {
        'Æ' => {
            let mut b = B::uc(s, m);
            let th = m.uhth;
            let hs = ust / 2.0;
            let wa = crate::upper::cw(s, m, 0.62, 0.66);
            let we = crate::upper::cw(s, m, 0.78, 0.6);
            let xe = wa;
            let cap = m.cap;
            b.diag(v(ust * 0.6, 0.0), v(xe + hs * 0.2, cap), HCUT, Cap::Butt);
            b.stem(xe, 0.0, cap);
            let yb = cap * 0.3;
            let tt = yb / cap;
            b.bar(ust * 0.6 + (xe - ust * 0.6) * tt, xe, yb, Cap::Butt, Cap::Butt);
            let bar = cap * s.bar;
            let armc = if b.serifed() { Cap::Butt } else { VCUT };
            b.bar(xe - hs, xe + we, cap - th / 2.0, Cap::Butt, armc);
            b.bar(xe, xe + we * 0.9, bar, Cap::Butt, armc);
            b.bar(xe, xe + we * 1.02, th / 2.0, Cap::Butt, armc);
            b.clip(-100.0, xe + we * 2.0, cap, cap + 300.0);
            b.beak(xe + we, cap, true, 0.8);
            b.beak(xe + we * 1.02, 0.0, false, 0.9);
            b.serif(ust * 0.6, 0.0, true, true, true);
            Some(b.done(DIAG, OPEN))
        }
        'Œ' | 'æ' | 'œ' => {
            let (l, r) = match c {
                'Œ' => ('O', 'E'),
                'æ' => ('a', 'e'),
                _ => ('o', 'e'),
            };
            let (dl, bl) = base(l, s, m)?;
            let (dr, br) = base(r, s, m)?;
            let w = if c.is_uppercase() { ust } else { st };
            // overlap: the right glyph's left edge lands on the left glyph's right stroke
            let shift = bl.1 - w * 1.0 - br.0;
            let mut ink = dl.ink;
            ink.absorb(dr.ink.baked(v(shift, 0.0)));
            let body = match (dl.body, dr.body) {
                (Some(a), Some(b)) => Some((a.0, b.1 + shift)),
                _ => None,
            };
            Some(Drawn { ink, l: dl.l, r: dr.r, advance: None, body })
        }
        'ß' => {
            let mut b = B::lc(s, m);
            let xs = st / 2.0;
            let w = (m.cn + 2.0 * st) * 0.98;
            let top = m.asc + m.over * 0.5 - m.hth / 2.0;
            let r = (w - st) * 0.42;
            let t = b.t();
            let waist = m.xh * 0.64;
            let p = path(v(xs, 0.0))
                .line(v(xs, m.asc - r * 1.1))
                .tension(t)
                .to(v(xs, m.asc - r * 1.1), UP)
                .to(v(xs + r, top), RIGHT)
                .to(v(xs + r * 1.95, m.asc - r * 0.95), DOWN)
                .to(v(xs + r * 1.1, waist), dir_to_v(-1.0, -0.5))
                .to(v(xs + r * 1.3, waist - m.hth * 0.4), dir_to_v(1.0, -0.2))
                .to(v(w - st * 0.5, m.xh * 0.3), DOWN)
                .to(v(xs + (w - xs) * 0.52, -m.over * 0.5 + m.hth / 2.0), LEFT)
                .to(v(xs + st * 0.9, m.hth * 0.9), dir_to_v(-1.0, 0.5));
            b.stroke(&p, HCUT, b.tc());
            b.head(xs, m.asc);
            b.foot(xs, 0.0);
            Some(b.done(STRAIGHT, ROUND * 0.9))
        }
        'Ð' | 'Đ' => {
            let (mut d, bb) = base('D', s, m)?;
            let mut b = B::uc(s, m);
            let y = m.cap * 0.5;
            b.bar(bb.0 - ust * 0.3, bb.0 + ust * 1.9, y, VCUT, VCUT);
            d.ink.absorb(b.ink);
            d.l = 0.3;
            Some(d)
        }
        'đ' => {
            let (mut d, bb) = base('d', s, m)?;
            let mut b = B::lc(s, m);
            let xs = bb.1 - st / 2.0;
            let y = m.xh + (m.asc - m.xh) * 0.5;
            b.bar(xs - st * 1.6, xs + st * 0.9, y, VCUT, VCUT);
            d.ink.absorb(b.ink);
            Some(d)
        }
        'Þ' | 'þ' => {
            let up = c == 'Þ';
            let mut b = if up { B::uc(s, m) } else { B::lc(s, m) };
            let sw = if up { ust } else { st };
            let xs = sw / 2.0;
            if up {
                let w = crate::upper::cw(s, m, 0.9, 0.76);
                b.stem(xs, 0.0, m.cap);
                b.bowl(xs, w, m.cap * 0.2, m.cap * 0.8, None, None);
                b.foot(xs, 0.0);
                b.serif(xs, m.cap, false, true, true);
            } else {
                let w = crate::lower::o_width(s, m) * 0.99 + st * 0.12;
                b.stem(xs, -m.desc, m.asc);
                b.bowl(xs, w, -m.over, m.xh + m.over, Some(m.xh * s.join * 0.97), Some(m.xh * (1.0 - s.join) * 0.85));
                b.head(xs, m.asc);
                b.foot(xs, -m.desc);
            }
            Some(b.done(STRAIGHT, ROUND))
        }
        'ð' => {
            let mut b = B::lc(s, m);
            let w = crate::lower::o_width(s, m);
            let bh = m.xh * 1.02;
            b.oval(0.0, w, -m.over, bh + m.over);
            let (cx, cy, rx, _ry) = b.ebox(0.0, w, -m.over, bh + m.over);
            let t = b.t();
            let p = path_d(v(cx + rx, cy), UP).tension(t).to(v(cx + rx * 0.2, m.asc * 0.95), dir_to_v(-0.8, 1.0)).to(v(cx - rx * 0.45, m.asc + m.over * 0.5 - m.hth * 0.5), dir_to_v(-1.0, 0.35));
            b.stroke(&p, Cap::Butt, b.tc());
            let xm = cx + rx * 0.35;
            let ym = m.xh + (m.asc - m.xh) * 0.45;
            b.line_w(v(xm - rx * 0.55, ym - st * 0.5), v(xm + rx * 0.55, ym + st * 0.6), 0.7, 0.7, Cap::Square, Cap::Square);
            Some(b.done(ROUND, ROUND))
        }
        'Ø' | 'ø' => {
            let up = c == 'Ø';
            let (mut d, bb) = base(if up { 'O' } else { 'o' }, s, m)?;
            let mut b = if up { B::uc(s, m) } else { B::lc(s, m) };
            let e = (bb.1 - bb.0) * 0.08;
            b.diag_as(v(bb.0 - e, bb.2 - e * 1.2), v(bb.1 + e, bb.3 + e * 1.2), false, Cap::Square, Cap::Square);
            d.ink.absorb(b.ink);
            Some(d)
        }
        'Ł' | 'ł' => {
            let up = c == 'Ł';
            let (mut d, _bb) = base(if up { 'L' } else { 'l' }, s, m)?;
            let mut b = if up { B::uc(s, m) } else { B::lc(s, m) };
            let sw = if up { ust } else { st };
            let xs = sw / 2.0;
            let y = if up { m.cap * 0.45 } else { m.xh * 0.72 + (m.asc - m.xh) * 0.1 };
            let k = sw * 1.3;
            b.line_w(v(xs - k, y - k * 0.55), v(xs + k * 1.05, y + k * 0.55), 0.6, 0.6, Cap::Square, Cap::Square);
            d.ink.absorb(b.ink);
            d.l = 0.4;
            Some(d)
        }
        _ => None,
    }
}
