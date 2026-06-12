//! The design space. A seed maps deterministically to a parameter vector; the
//! glyph builders read these to draw a coherent typeface. This vector is also
//! the "genome" the evolutionary breeder will crossover/mutate later.

use crate::prng::{xmur3, Rng};

pub struct Params {
    pub upm: f64,
    pub cap: f64,
    pub xheight: f64,
    pub ascent: f64,
    pub descent: f64,
    pub stem: f64,      // thick stroke weight
    pub thin: f64,      // thin stroke weight (derived from contrast)
    pub contrast: f64,  // 0 = monoline, →1 = high modulation
    pub width: f64,     // horizontal scale factor
    pub slant_deg: f64, // obliquing angle, degrees
    pub slant_tan: f64,
    pub serif: bool,
    pub serif_len: f64,
    pub serif_th: f64,
    pub pen_angle: f64, // broad-nib stress axis (radians) for the pen-model glyphs
    pub weight_class: u16,
    pub width_class: u16,
    pub family: String,
    pub ps_name: String,
    pub style: String,
}

impl Params {
    pub fn from_seed(seed: &str) -> Self {
        let mut r = Rng::new(seed);
        let upm = 1000.0;
        let cap = 700.0;

        let xheight = cap * r.range(0.62, 0.74); // lowercase x-height / cap ratio
        let contrast = r.range(0.0, 0.82);
        let stem = r.range(58.0, 168.0);
        let thin = (stem * (1.0 - contrast * 0.7)).max(20.0);
        let width = r.range(0.84, 1.20);
        let slant_deg = if r.chance(0.30) { r.range(-3.0, 13.0) } else { 0.0 };
        let slant_tan = slant_deg.to_radians().tan();
        let serif = r.chance(0.45);
        let serif_len = stem * r.range(0.7, 1.4);
        let serif_th = (stem * 0.32).max(18.0);
        // Broad-nib stress axis for the pen-model glyphs. Drawn LAST so adding it
        // doesn't perturb the earlier draws — every existing seed keeps its other
        // params (and thus its non-pen glyphs) byte-for-byte. 0° = vertical stress
        // (thins on the horizontals), up to a humanist ~32° tilt.
        let pen_angle = r.range(0.0, 32.0).to_radians();

        let weight_class =
            (((stem - 58.0) / (168.0 - 58.0)) * 700.0 + 200.0).round().clamp(100.0, 900.0) as u16;
        let width_class = if width < 0.95 {
            3
        } else if width < 1.05 {
            5
        } else {
            7
        };

        let tag = short_tag(seed);
        let family = format!("Mino Roll {}", tag);
        let ps_name = format!("MinoRoll-{}", tag);
        let style = "Regular".to_string();

        Params {
            upm,
            cap,
            xheight,
            ascent: 780.0,
            descent: -220.0,
            stem,
            thin,
            contrast,
            width,
            slant_deg,
            slant_tan,
            serif,
            serif_len,
            serif_th,
            pen_angle,
            weight_class,
            width_class,
            family,
            ps_name,
            style,
        }
    }
}

/// A short, stable, filename-safe identifier derived from the seed.
fn short_tag(seed: &str) -> String {
    format!("{:06X}", xmur3(seed) & 0xFF_FFFF)
}
