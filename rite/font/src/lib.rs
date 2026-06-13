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
mod pen;
mod prng;
mod sfnt;

use params::Params;
use wasm_bindgen::prelude::*;

/// Build the `.ttf` bytes for a seed. Native-callable (used by tests) as well as
/// exported to JS.
pub fn build_font(seed: &str) -> Vec<u8> {
    build_font_params(&Params::from_seed(seed))
}

/// Build the `.ttf` bytes from an explicit parameter set — the path the live
/// slider UI drives (a seed gives a starting genome, sliders override fields).
pub fn build_font_params(p: &Params) -> Vec<u8> {
    let chars = glyphs::charset();

    let mut gds: Vec<sfnt::GlyphData> = Vec::with_capacity(chars.len() + 1);
    gds.push(sfnt::to_data(glyphs::notdef(p))); // gid 0
    for &c in chars {
        gds.push(sfnt::to_data(glyphs::glyph_for(c, p)));
    }

    let names = sfnt::Names {
        family: p.family.clone(),
        subfamily: p.style.clone(),
        full: format!("{} {}", p.family, p.style),
        ps: p.ps_name.clone(),
        unique: format!("MinoRoll;1.0;{}", p.ps_name),
    };
    sfnt::build_ttf(&gds, &names, p, chars)
}

/// Roll a font: seed string → `.ttf` bytes (Uint8Array in JS).
#[wasm_bindgen]
pub fn roll(seed: &str) -> Vec<u8> {
    build_font(seed)
}

/// Roll from a seed, then apply a `key=value;…` override string (the live
/// sliders). Unknown keys are ignored; see `Params::apply_spec`.
#[wasm_bindgen]
pub fn roll_params(seed: &str, spec: &str) -> Vec<u8> {
    let mut p = Params::from_seed(seed);
    p.apply_spec(spec);
    build_font_params(&p)
}

/// A JSON summary of the rolled font's full genome, for seeding the UI sliders.
#[wasm_bindgen]
pub fn describe(seed: &str) -> String {
    genome_json(&Params::from_seed(seed))
}

fn genome_json(p: &Params) -> String {
    format!(
        "{{\"family\":\"{}\",\"stem\":{:.0},\"thin\":{:.0},\"mod\":{:.2},\"contrast\":{:.2},\"width\":{:.2},\"slant\":{:.1},\"pen\":{:.0},\"aperture\":{:.2},\"arch\":{:.2},\"bar\":{:.2},\"bowl\":{:.0},\"xh\":{:.2},\"over\":{:.3},\"asc\":{:.2},\"desc\":{:.2},\"track\":{:.2},\"round\":{:.2},\"serif\":{},\"apex\":{},\"a2\":{},\"g2\":{},\"ball\":{},\"seriflen\":{:.0},\"serifth\":{:.0},\"weightClass\":{},\"widthClass\":{}}}",
        p.family,
        p.stem,
        pen::nib_thin(p),
        p.morph.modulation,
        p.contrast,
        p.width,
        p.slant_deg,
        p.pen_angle.to_degrees(),
        p.morph.aperture,
        p.morph.arch,
        p.morph.bar,
        p.morph.bowl,
        p.xheight / p.cap,
        p.morph.overshoot / p.cap,
        p.morph.ascender,
        p.morph.descender,
        p.morph.tracking,
        p.morph.roundwidth,
        p.serif,
        p.morph.apex_flat,
        p.morph.two_story_a,
        p.morph.two_story_g,
        p.morph.ball,
        p.serif_len,
        p.serif_th,
        p.weight_class,
        p.width_class
    )
}
