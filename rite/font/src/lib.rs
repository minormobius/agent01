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
use prng::Rng;
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

// ---- archetypes: a navigable map over the genome --------------------------
//
// The full genome is ~20-dimensional, and rolling each gene independently gives
// incoherent fonts. Archetypes fix that the way a political compass tames
// ideology-space: a few *named corners* (coherent designs) anchor a small
// control space, and any interior point is a blend. We place four classic type
// archetypes at the corners of a square — x = geometric↔humanist construction,
// y = modern-sans↔classical-serif — add a z axis for contrast (sans→Didone),
// making the "archetypal cube", then *roll inside a hypersphere* around the
// chosen point so a roll is a coherent neighbour, not a random vector.

const N: usize = 21;
const GENES: [&str; N] = [
    "stem", "mod", "pen", "width", "xh", "aperture", "arch", "bar", "bowl", "over", "asc", "desc",
    "track", "round", "seriflen", "serifth", "serif", "a2", "g2", "ball", "apex",
];
// per-gene jitter radius (the offset at spread = 1, in each gene's own units)
const JIT: [f64; N] = [
    42.0, 0.26, 11.0, 0.12, 0.05, 0.20, 0.32, 0.05, 12.0, 0.008, 0.08, 0.05, 0.13, 0.09, 45.0,
    22.0, 0.45, 0.45, 0.45, 0.45, 0.5,
];
// corners (aligned to GENES). Bools are probabilities in 0..1.
const C_GEO: [f64; N] = [
    90.0, 0.06, 0.0, 1.00, 0.52, 1.00, 0.15, 0.50, 30.0, 0.012, 1.05, 0.22, 1.00, 1.12, 0.0, 18.0,
    0.0, 0.0, 0.0, 0.0, 0.0,
]; // geometric sans (Futura)
const C_HUM: [f64; N] = [
    95.0, 0.26, 22.0, 0.98, 0.50, 1.18, 0.25, 0.52, 14.0, 0.014, 1.08, 0.24, 1.05, 1.00, 0.0, 18.0,
    0.0, 1.0, 1.0, 0.0, 0.0,
]; // humanist sans (Gill / Frutiger)
const C_SLAB: [f64; N] = [
    115.0, 0.08, 0.0, 1.00, 0.50, 0.95, 0.50, 0.50, 18.0, 0.012, 1.05, 0.22, 1.00, 1.05, 110.0,
    70.0, 1.0, 1.0, 1.0, 0.0, 0.0,
]; // geometric slab (Egyptian)
const C_OLD: [f64; N] = [
    85.0, 0.45, 22.0, 0.95, 0.46, 1.05, 0.20, 0.50, 16.0, 0.015, 1.12, 0.26, 1.00, 1.00, 70.0,
    26.0, 1.0, 1.0, 1.0, 0.0, 0.0,
]; // humanist old-style serif (Garamond)

fn idx(name: &str) -> usize {
    GENES.iter().position(|&g| g == name).unwrap()
}

/// Blend the corner archetypes at compass point (`x`,`y`), push by contrast `z`,
/// then jitter inside a hypersphere of radius `spread` (seeded by `seed`), and
/// return the result as an `apply_spec` string. `x`,`y`,`z` ∈ [0,1].
#[wasm_bindgen]
pub fn archetype_genome(x: f64, y: f64, z: f64, spread: f64, seed: &str) -> String {
    let (x, y, z) = (x.clamp(0.0, 1.0), y.clamp(0.0, 1.0), z.clamp(0.0, 1.0));
    let mut v = [0.0f64; N];
    for i in 0..N {
        let bottom = C_GEO[i] * (1.0 - x) + C_HUM[i] * x; // y = 0: modern sans
        let top = C_SLAB[i] * (1.0 - x) + C_OLD[i] * x; // y = 1: classical serif
        v[i] = bottom * (1.0 - y) + top * y;
    }
    // contrast axis → Didone: raise modulation, verticalize stress, thin the
    // serifs, add ball terminals.
    let lerp = |a: f64, b: f64, t: f64| a + (b - a) * t;
    v[idx("mod")] = lerp(v[idx("mod")], 0.95, z * 0.85);
    v[idx("pen")] = lerp(v[idx("pen")], 0.0, z * 0.7);
    v[idx("serifth")] = lerp(v[idx("serifth")], 12.0, z * 0.7);
    v[idx("ball")] = v[idx("ball")].max(z);

    // roll inside the hypersphere: a random direction × a radius inside the ball.
    let mut r = Rng::new(seed);
    let mut u = [0.0f64; N];
    let mut nrm = 0.0;
    for ui in u.iter_mut() {
        *ui = r.range(-1.0, 1.0);
        nrm += *ui * *ui;
    }
    let nrm = nrm.sqrt().max(1e-6);
    let radius = spread * r.range(0.0, 1.0).cbrt(); // ~uniform within the ball
    for i in 0..N {
        v[i] += (u[i] / nrm) * radius * JIT[i];
    }

    // format as a spec; bool genes (the last 5) threshold at 0.5.
    let mut parts: Vec<String> = Vec::with_capacity(N);
    for (i, &g) in GENES.iter().enumerate() {
        let is_bool = matches!(g, "serif" | "a2" | "g2" | "ball" | "apex");
        if is_bool {
            parts.push(format!("{g}={}", if v[i] >= 0.5 { 1 } else { 0 }));
        } else {
            parts.push(format!("{g}={:.4}", v[i]));
        }
    }
    parts.join(";")
}

/// Build a font directly from a compass point (the live-archetype path).
#[wasm_bindgen]
pub fn roll_archetype(x: f64, y: f64, z: f64, spread: f64, seed: &str) -> Vec<u8> {
    roll_params(seed, &archetype_genome(x, y, z, spread, seed))
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
