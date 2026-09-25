//! minofont — a seeded, open-licensed parametric typeface generator.
//!
//! `roll(seed)` returns the bytes of a real, installable `.ttf`. The same seed
//! always yields the same font (deterministic PRNG), so `?s=<seed>` is a stable
//! permalink; a `spec` string of gene overrides rides along for the tweaks.
//!
//! Pipeline: seed → `Style` (the genome: archetype + jitter) → `Metrics` →
//! each letter's skeleton (`lower`/`upper`/`figures`/`punct`/`marks`/`scripts`)
//! swept by the style's pen (`ink`) → unioned and refitted to quadratic
//! splines → spaced and kerned (`space`) → `sfnt`.
//!
//! Output is CC0 / public-domain by construction: the engine is open and the
//! emitted outlines are unencumbered, so a rolled font is free to use, embed,
//! modify and sell with no attribution.

mod build;
mod curve;
mod figures;
mod font;
mod geom;
mod ink;
mod lower;
mod marks;
mod prng;
mod punct;
mod scripts;
mod sfnt;
mod space;
mod style;
mod upper;

pub use style::Style;
use wasm_bindgen::prelude::*;

/// The style for a seed + spec (`k=v;…` overrides). `arch` < 0 = let the seed pick.
pub fn style_for(seed: &str, spec: &str) -> Style {
    let mut s = Style::from_seed(seed);
    s.apply_spec(spec);
    s
}

/// Build the `.ttf` bytes for a seed.
pub fn build_font(seed: &str) -> Vec<u8> {
    font::build(&Style::from_seed(seed))
}

/// Roll a font: seed string → `.ttf` bytes (Uint8Array in JS).
#[wasm_bindgen]
pub fn roll(seed: &str) -> Vec<u8> {
    build_font(seed)
}

/// Roll from a seed, then apply a `key=value;…` override string.
#[wasm_bindgen]
pub fn roll_params(seed: &str, spec: &str) -> Vec<u8> {
    font::build(&style_for(seed, spec))
}

/// Only the glyphs needed to set `text` — for live previews and thumbnails.
#[wasm_bindgen]
pub fn roll_subset(seed: &str, spec: &str, text: &str) -> Vec<u8> {
    font::build_subset(&style_for(seed, spec), text)
}

/// The genome for a seed (+ overrides) as JSON — every gene, the archetype,
/// the family/style names and the canonical spec string.
#[wasm_bindgen]
pub fn describe(seed: &str, spec: &str) -> String {
    style_for(seed, spec).to_json()
}

/// Roll inside a named archetype (index into `archetypes()`), with `spread`
/// (0 = the textbook archetype, 1 = the full wander). Returns the spec string,
/// so the caller can keep editing it.
#[wasm_bindgen]
pub fn archetype_spec(arch: i32, spread: f64, seed: &str) -> String {
    let a = if arch < 0 { None } else { Some(arch as usize) };
    Style::roll(seed, a, spread.clamp(0.0, 1.5)).to_spec()
}

/// The archetype names, JSON array.
#[wasm_bindgen]
pub fn archetypes() -> String {
    let v: Vec<String> = style::archetype_names().iter().map(|n| format!("\"{n}\"")).collect();
    format!("[{}]", v.join(","))
}

/// Every character the engine draws, as one string (the glyph grid).
#[wasm_bindgen]
pub fn charset() -> String {
    let mut s: String = font::charset().into_iter().collect();
    for (a, _) in scripts::ALIASES {
        if !s.contains(*a) {
            s.push(*a);
        }
    }
    s
}

/// Gene table (key, min, max) as JSON — the UI builds its sliders from this.
#[wasm_bindgen]
pub fn genes() -> String {
    let v: Vec<String> = style::GENES.iter().map(|(k, a, b)| format!("[\"{k}\",{a},{b}]")).collect();
    format!("[{}]", v.join(","))
}

/// One line on what a seed rolled (the proof tools print it).
pub fn debug_describe(seed: &str) -> String {
    let s = Style::from_seed(seed);
    format!("{} {} serif={:?} term={:?}", s.archetype, s.style_name, s.serif, s.term)
}

/// Proofing aid: a glyph's ink outline and its stroke centrelines, as SVG path
/// data in font units (y up), for overlay renders.
pub fn debug_skeleton(seed: &str, spec: &str, c: char) -> (String, String) {
    let st = style_for(seed, spec);
    let m = build::Metrics::new(&st);
    let Some(d) = font::draw_char(c, &st, &m) else { return (String::new(), String::new()) };
    let mut ink = String::new();
    for p in d.ink.polygons() {
        for (i, q) in p.iter().enumerate() {
            ink.push_str(&format!("{}{:.1} {:.1} ", if i == 0 { "M" } else { "L" }, q.x, q.y));
        }
        ink.push_str("Z ");
    }
    let mut sk = String::new();
    for s in &d.ink.strokes {
        for (i, c) in s.segs.iter().enumerate() {
            if i == 0 {
                sk.push_str(&format!("M{:.1} {:.1} ", c.p0.x, c.p0.y));
            }
            sk.push_str(&format!("C{:.1} {:.1} {:.1} {:.1} {:.1} {:.1} ", c.c1.x, c.c1.y, c.c2.x, c.c2.y, c.p3.x, c.p3.y));
        }
    }
    (ink, sk)
}

/// Proofing aid: horizontal extents of a glyph's ink above and below a split
/// height (fraction of the x-height or cap height): (upper x0, x1, lower x0, x1).
pub fn debug_extent(seed: &str, spec: &str, c: char, split: f64) -> (f64, f64, f64, f64) {
    let st = style_for(seed, spec);
    let m = build::Metrics::new(&st);
    let Some(d) = font::draw_char(c, &st, &m) else { return (0.0, 0.0, 0.0, 0.0) };
    let h = if c.is_uppercase() { m.cap } else { m.xh } * split;
    let (mut u0, mut u1, mut l0, mut l1) = (f64::MAX, f64::MIN, f64::MAX, f64::MIN);
    for p in d.ink.polygons() {
        for q in p {
            if q.y > h {
                u0 = u0.min(q.x);
                u1 = u1.max(q.x);
            } else {
                l0 = l0.min(q.x);
                l1 = l1.max(q.x);
            }
        }
    }
    (u0, u1, l0, l1)
}
