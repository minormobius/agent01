//! The design space. A seed maps deterministically to a parameter vector; the
//! glyph builders read these to draw a coherent typeface. This vector is also
//! the "genome" the evolutionary breeder will crossover/mutate later.

use crate::prng::{xmur3, Rng};

/// The construction genome: discrete-ish *drawing-style* genes that change how a
/// glyph is built (not just how thick/wide it is). Where `Params` rolls the
/// metrics, `Morph` rolls the gestures — aperture, overshoot, arch character,
/// crossbar height — so two rolls differ in morphology, not only in weight.
/// Each field is independent in v1; correlated "archetypes" (humanist /
/// geometric / grotesque) are a later layer.
pub struct Morph {
    pub aperture: f64,  // opening of C/c/e/G counters: <1 closed, >1 open
    pub overshoot: f64, // font units round letters spill past the baseline / cap
    pub arch: f64,      // 0 round-humanist shoulder .. 1 flat/squared shoulder
    pub bar: f64,       // crossbar height as a fraction of the relevant height
    pub bowl: f64,      // a/b/d/p/q bowl wrap (deg): how far the arc closes before
                        // attaching to the stem (0 = open D, larger = enclosed)
    pub apex_flat: bool, // A: flat-topped (truncated apex) vs pointed "chopstick"
    pub modulation: f64, // nib contrast: 0 = monoline, 1 = high thick/thin ratio
                         // (how strongly weight varies with stroke angle)
}

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
    pub morph: Morph,   // construction genome (see above)
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
        let pen_angle = r.range(0.0, 36.0).to_radians();

        // Construction genome — also drawn after the metric params so it never
        // perturbs them. These reshape the letters themselves across rolls.
        // Ranges are deliberately wide so rolls read as different designs.
        let morph = Morph {
            aperture: r.range(0.70, 1.32),
            overshoot: r.range(0.0, 0.022) * cap,
            arch: r.range(0.0, 1.0),
            bar: r.range(0.42, 0.60),
            bowl: r.range(0.0, 34.0),
            apex_flat: r.chance(0.45),
            modulation: r.range(0.0, 1.0),
        };

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
            morph,
            weight_class,
            width_class,
            family,
            ps_name,
            style,
        }
    }

    /// Override fields from a `key=value;key=value` string — the live sliders.
    /// Unknown keys are ignored; values out of range are clamped. Derived fields
    /// (slant tangent, weight class) are recomputed so the override is coherent.
    pub fn apply_spec(&mut self, spec: &str) {
        for kv in spec.split(';') {
            let mut it = kv.splitn(2, '=');
            let (k, v) = match (it.next(), it.next()) {
                (Some(k), Some(v)) => (k.trim(), v.trim()),
                _ => continue,
            };
            let f: f64 = match v.parse() {
                Ok(x) => x,
                Err(_) => continue,
            };
            match k {
                "stem" => self.stem = f.clamp(16.0, 280.0),
                "mod" => self.morph.modulation = f.clamp(0.0, 1.0),
                "pen" => self.pen_angle = f.clamp(-20.0, 50.0).to_radians(),
                "width" => self.width = f.clamp(0.55, 1.7),
                "slant" => self.slant_deg = f.clamp(-12.0, 30.0),
                "xh" => self.xheight = f.clamp(0.40, 0.95) * self.cap,
                "aperture" => self.morph.aperture = f.clamp(0.40, 1.70),
                "arch" => self.morph.arch = f.clamp(0.0, 1.0),
                "bar" => self.morph.bar = f.clamp(0.28, 0.72),
                "bowl" => self.morph.bowl = f.clamp(0.0, 55.0),
                "seriflen" => self.serif_len = f.clamp(0.0, 300.0),
                "serifth" => self.serif_th = f.clamp(2.0, 140.0),
                "serif" => self.serif = f != 0.0,
                "apex" => self.morph.apex_flat = f != 0.0,
                _ => {}
            }
        }
        // recompute derived bits so the override stays self-consistent
        self.slant_tan = self.slant_deg.to_radians().tan();
        self.thin = (self.stem * (1.0 - self.contrast * 0.7)).max(20.0);
        self.weight_class =
            (((self.stem - 58.0) / (168.0 - 58.0)) * 700.0 + 200.0).round().clamp(100.0, 900.0) as u16;
    }
}

/// A short, stable, filename-safe identifier derived from the seed.
fn short_tag(seed: &str) -> String {
    format!("{:06X}", xmur3(seed) & 0xFF_FFFF)
}
