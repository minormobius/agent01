//! Assembly: style → every glyph drawn, unioned, refitted, spaced and kerned →
//! the arguments `sfnt::build_ttf` needs.

use crate::build::{Drawn, Metrics};
use crate::curve::V;
use crate::geom::Glyph;
use crate::ink;
use crate::sfnt::{self, FontInfo, GlyphData, Names};
use crate::space;
use crate::style::{Serif, Style};

/// One finished glyph: outline polygons (already positioned) + advance.
pub struct Cut {
    pub ch: char,
    pub polys: Vec<Vec<V>>,
    pub advance: f64,
}

pub fn draw_char(c: char, s: &Style, m: &Metrics) -> Option<Drawn> {
    crate::lower::draw(c, s, m)
        .or_else(|| crate::upper::draw(c, s, m))
        .or_else(|| crate::figures::draw(c, s, m))
        .or_else(|| crate::punct::draw(c, s, m))
        .or_else(|| crate::marks::draw(c, s, m))
        .or_else(|| crate::scripts::draw(c, s, m))
}

pub fn charset() -> Vec<char> {
    let mut v: Vec<char> = Vec::new();
    v.push(' ');
    v.extend('A'..='Z');
    v.extend('a'..='z');
    v.extend('0'..='9');
    v.extend(crate::punct::CHARS.chars());
    v.extend(crate::marks::CHARS.chars());
    v.extend(crate::scripts::CHARS.chars());
    let mut seen = std::collections::HashSet::new();
    v.retain(|c| seen.insert(*c));
    v
}

/// Draw + union + space one character. `None` if the engine has no drawing.
pub fn cut(c: char, s: &Style, m: &Metrics) -> Option<Cut> {
    if c == ' ' {
        let w = (m.cn * 0.74 + m.stem * 0.5) * s.spacing.sqrt();
        return Some(Cut { ch: c, polys: Vec::new(), advance: if s.mono { mono_adv(m) } else { w } });
    }
    let mut d = draw_char(c, s, m)?;
    let (polys, body) = d.ink.polygons_body();
    if d.body.is_none() {
        d.body = body;
    }
    let (polys, adv) = space::place(polys, &d, c, s, m);
    Some(Cut { ch: c, polys, advance: adv })
}

pub fn mono_adv(m: &Metrics) -> f64 {
    (m.cn + 2.0 * m.stem) * 1.18 + m.cn * 0.4
}

pub fn build(s: &Style) -> Vec<u8> {
    build_chars(s, None)
}

/// Build only the glyphs needed to set `text` (plus space) — the live
/// preview path: a fraction of the work, with kerning among those glyphs.
pub fn build_subset(s: &Style, text: &str) -> Vec<u8> {
    build_chars(s, Some(text))
}

fn build_chars(s: &Style, only: Option<&str>) -> Vec<u8> {
    let t0 = now();
    let m = Metrics::new(s);
    let mut chars = charset();
    if let Some(text) = only {
        let want: std::collections::HashSet<char> = text
            .chars()
            .map(|c| crate::scripts::ALIASES.iter().find(|a| a.0 == c).map_or(c, |a| a.1))
            .chain(" nHoO".chars()) // kerning references
            .collect();
        chars.retain(|c| want.contains(c));
    }
    let mut cuts: Vec<Cut> = Vec::with_capacity(chars.len());
    for &c in &chars {
        if let Some(cu) = cut(c, s, &m) {
            cuts.push(cu);
        }
    }
    let t_draw = now();
    let kerning = if s.mono { None } else { space::kern(&cuts, s, &m) };
    if std::env::var("TIME_DEBUG").is_ok() {
        eprintln!("draw+union {:?}  kern {:?}", t_draw.duration_since(t0), now().duration_since(t_draw));
    }
    let tan = s.slant.to_radians().tan();
    let mut gds: Vec<GlyphData> = Vec::with_capacity(cuts.len() + 1);
    gds.push(sfnt::to_data(notdef(&m)));
    let mut mapped: Vec<char> = Vec::with_capacity(cuts.len());
    let mut pairs: Vec<(char, u16)> = Vec::with_capacity(cuts.len() + 128);
    for cu in cuts.iter_mut() {
        ink::shear(&mut cu.polys, tan);
        let mut g = Glyph::new(cu.advance);
        for p in &cu.polys {
            let mut c = ink::refit(p, 0.7);
            if c.len() < 3 {
                continue;
            }
            // TrueType: filled contours run clockwise (polygons come CCW-outer)
            c.reverse();
            if std::env::var("FIT_DEBUG").map_or(false, |v| v.contains(cu.ch)) {
                let off = c.iter().filter(|p| !p.2).count();
                eprintln!("{}: poly {} pts -> contour {} pts ({} off)", cu.ch, p.len(), c.len(), off);
                if std::env::var("FIT_DUMP").is_ok() {
                    for q in p.iter() {
                        eprint!("({:.2},{:.2}) ", q.x, q.y);
                    }
                    eprintln!();
                }
            }
            g.contours.push(c);
        }
        gds.push(sfnt::to_data(g));
        mapped.push(cu.ch);
        pairs.push((cu.ch, mapped.len() as u16));
    }
    // shared shapes: Greek/Cyrillic letters that *are* a Latin letter map to
    // its glyph — no duplicate outlines
    for &(a, target) in crate::scripts::ALIASES {
        if let Some(i) = mapped.iter().position(|&c| c == target) {
            pairs.push((a, (i + 1) as u16));
        }
    }
    let names = Names {
        family: s.family.clone(),
        subfamily: s.style_name.clone(),
        full: format!("{} {}", s.family, s.style_name),
        ps: format!("{}-{}", s.ps_name, s.style_name.replace(' ', "")),
        unique: format!("MinoRoll;2.0;{}", s.ps_name),
    };
    // glyph ids are 1 + index into `cuts` (gid 0 is .notdef)
    let (kp, gpos) = match &kerning {
        Some(k) => {
            let kp = k.legacy.iter().map(|&(a, b, v)| ((a + 1) as u16, (b + 1) as u16, v)).collect();
            let mut cl = vec![0u16; cuts.len() + 1];
            let mut cr = vec![0u16; cuts.len() + 1];
            for i in 0..cuts.len() {
                cl[i + 1] = k.cls_l[i];
                cr[i + 1] = k.cls_r[i];
            }
            (kp, Some((cl, cr, k.n_l, k.n_r, k.matrix.clone())))
        }
        None => (Vec::new(), None),
    };
    let info = FontInfo {
        upm: 1000.0,
        cap: s.cap,
        xheight: s.xh,
        ascent: (s.asc + 60.0).max(s.cap + 120.0).max(900.0 - s.desc.max(200.0) - 30.0),
        descent: -(s.desc + 40.0).max(230.0),
        weight_class: s.weight_class(),
        width_class: s.width_class(),
        slant_deg: s.slant,
        strike: m.hth.max(30.0),
        panose: panose(s),
        mono: s.mono,
        kerns: kp,
        gpos,
    };
    sfnt::build_ttf(&gds, &names, &info, &pairs)
}

fn notdef(m: &Metrics) -> Glyph {
    let w = (m.cn + 2.0 * m.stem) * 0.9;
    let t = (m.stem * 0.4).max(20.0);
    let mut g = Glyph::new(w + 100.0);
    let (x0, x1, y0, y1) = (50.0, 50.0 + w, 0.0, m.cap);
    g.contours.push(vec![(x0, y0, true), (x0, y1, true), (x1, y1, true), (x1, y0, true)]);
    g.contours.push(vec![(x0 + t, y0 + t, true), (x1 - t, y0 + t, true), (x1 - t, y1 - t, true), (x0 + t, y1 - t, true)]);
    g
}

/// PANOSE (Latin text) from the genome — lets OS font pickers group rolls.
fn panose(s: &Style) -> [u8; 10] {
    let serif = match s.serif {
        Serif::None => 11,      // normal sans
        Serif::Bracketed => 2,  // cove
        Serif::Slab => 6,       // square
        Serif::Hairline => 7,   // thin
    };
    let w = s.weight_class();
    let weight = (((w as f64 - 100.0) / 800.0) * 9.0 + 2.0).round().clamp(2.0, 11.0) as u8;
    let prop = if s.mono {
        9
    } else if s.width < 0.85 {
        6 // condensed
    } else if s.width > 1.15 {
        5 // extended
    } else {
        3 // modern
    };
    let contrast = ((1.0 - s.ratio) * 8.0 + 2.0).round().clamp(2.0, 9.0) as u8;
    let letterform = if s.slant.abs() > 2.0 { 9 } else { 2 };
    [2, serif, weight, prop, contrast, 0, 0, letterform, 0, 0]
}

#[cfg(not(target_arch = "wasm32"))]
fn now() -> std::time::Instant {
    std::time::Instant::now()
}
#[cfg(target_arch = "wasm32")]
fn now() -> Dummy {
    Dummy
}
#[cfg(target_arch = "wasm32")]
#[derive(Clone, Copy)]
struct Dummy;
#[cfg(target_arch = "wasm32")]
impl Dummy {
    fn duration_since(&self, _: Dummy) -> u32 {
        0
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn debug_glyph_strokes() {
        let Ok(seed) = std::env::var("DBG_SEED") else { return };
        let ch = std::env::var("DBG_CH").unwrap().chars().next().unwrap();
        let s = Style::from_seed(&seed);
        let m = Metrics::new(&s);
        let d = draw_char(ch, &s, &m).unwrap();
        for (i, st) in d.ink.strokes.iter().enumerate() {
            let mut one = crate::ink::Ink::default();
            one.stroke(st.clone());
            let polys = one.polygons();
            let bb: Vec<String> = polys.iter().map(|p| {
                let (mut a, mut b, mut c, mut e) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
                for q in p { a = a.min(q.x); b = b.max(q.x); c = c.min(q.y); e = e.max(q.y); }
                format!("x {a:.0}..{b:.0} y {c:.0}..{e:.0} ({} pts)", p.len())
            }).collect();
            eprintln!("stroke {i}: caps {:?}/{:?} -> {:?}", st.cap0, st.cap1, bb);
        }
        eprintln!("fills {} holes {}", d.ink.fills.len(), d.ink.holes.len());
        for h in &d.ink.holes { eprintln!("  hole {:?}", h.iter().map(|q| (q.x.round(), q.y.round())).collect::<Vec<_>>()); }
    }
}
