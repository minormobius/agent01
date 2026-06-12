//! minofont — a seeded, open-licensed parametric typeface generator.
//!
//! `roll(seed)` returns the bytes of a real, installable `.ttf`. The same seed
//! always yields the same font (deterministic PRNG), so `?s=<seed>` is a stable
//! permalink and any lineage of bred fonts can be reconstructed from its seeds.
//!
//! Output is CC0 / public-domain by construction: the engine is open and the
//! emitted outlines are unencumbered, so a rolled font is free to use, embed,
//! modify and sell with no attribution.

mod geom;
mod glyphs;
mod params;
mod prng;
mod sfnt;

use params::Params;
use wasm_bindgen::prelude::*;

/// Build the `.ttf` bytes for a seed. Native-callable (used by tests) as well as
/// exported to JS.
pub fn build_font(seed: &str) -> Vec<u8> {
    let p = Params::from_seed(seed);
    let chars = glyphs::charset();

    let mut gds: Vec<sfnt::GlyphData> = Vec::with_capacity(chars.len() + 1);
    gds.push(sfnt::to_data(glyphs::notdef(&p))); // gid 0
    for &c in chars {
        gds.push(sfnt::to_data(glyphs::glyph_for(c, &p)));
    }

    let names = sfnt::Names {
        family: p.family.clone(),
        subfamily: p.style.clone(),
        full: format!("{} {}", p.family, p.style),
        ps: p.ps_name.clone(),
        unique: format!("MinoRoll;1.0;{}", p.ps_name),
    };
    sfnt::build_ttf(&gds, &names, &p, chars)
}

/// Roll a font: seed string → `.ttf` bytes (Uint8Array in JS).
#[wasm_bindgen]
pub fn roll(seed: &str) -> Vec<u8> {
    build_font(seed)
}

/// A compact JSON summary of the rolled font's parameters, for the UI.
#[wasm_bindgen]
pub fn describe(seed: &str) -> String {
    let p = Params::from_seed(seed);
    format!(
        "{{\"family\":\"{}\",\"stem\":{:.0},\"thin\":{:.0},\"contrast\":{:.2},\"width\":{:.2},\"slant\":{:.1},\"serif\":{},\"weightClass\":{},\"widthClass\":{}}}",
        p.family, p.stem, p.thin, p.contrast, p.width, p.slant_deg, p.serif, p.weight_class, p.width_class
    )
}
