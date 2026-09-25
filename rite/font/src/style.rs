//! The genome. A roll is a point in a ~30-gene design space, but rolling each
//! gene independently gives incoherent fonts, so a seed first picks a **named
//! archetype** (one of the Vox-style families below), blends it a little toward
//! a second one, jitters every gene inside a radius, and then rolls the
//! *orthogonal* axes — weight, width, slant — freely. That is how real type
//! families are organised: a design (Garamond, Helvetica) comes in many weights
//! and widths, and the design itself is a coherent bundle of choices.
//!
//! `apply_spec("k=v;k=v")` overrides any gene afterwards — the UI's sliders and
//! the permalink both speak this language.

use crate::prng::{xmur3, Rng};

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Term {
    Horizontal, // cut level (Helvetica)
    Vertical,   // cut plumb (Frutiger, many serifs)
    Perp,       // cut square to the stroke (Futura)
    Pen,        // the nib's own angled edge (old-style)
    Round,      // rounded (VAG)
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub enum Serif {
    None,
    Bracketed, // old-style / transitional: curved fillets into the stem
    Slab,      // square, heavy, unbracketed (Rockwell) or lightly bracketed (Clarendon)
    Hairline,  // Didone: thin, flat, unbracketed
}

#[derive(Clone, Debug)]
pub struct Style {
    // --- identity
    pub family: String,
    pub ps_name: String,
    pub style_name: String,
    pub archetype: &'static str,
    // --- vertical metrics (font units, 1000 upm)
    pub cap: f64,
    pub xh: f64,
    pub asc: f64,
    pub desc: f64, // positive depth below baseline
    pub over: f64, // overshoot of round forms
    // --- stroke
    pub stem: f64,   // lowercase vertical stem
    pub ratio: f64,  // thin / thick (1 = monoline)
    pub stress: f64, // pen angle, degrees (0 = vertical stress)
    pub nib: f64,    // nib squareness (2 = ellipse)
    // --- skeleton
    pub width: f64,    // global horizontal scale
    pub prop: f64,     // 0 = uniform widths (grotesque) .. 1 = classical (varied)
    pub round: f64,    // o width relative to its height (circularity)
    pub sup: f64,      // superness of bowls (0.707 = elliptical, 0.8 = squarish)
    pub aperture: f64, // 0 = closed (Helvetica) .. 1 = open (Frutiger)
    pub bar: f64,      // crossbar height (fraction)
    pub join: f64,     // how deep the n-arch joins its stem (fraction of x-height)
    pub trap: f64,     // junction thinning (ink traps) 0..0.45
    pub term: Term,
    pub ball: bool,
    // --- serifs
    pub serif: Serif,
    pub serif_len: f64, // serif reach beyond the stem, × stem
    pub serif_th: f64,  // serif thickness, × stem
    pub bracket: f64,   // 0..1
    pub head: f64,      // slope of lowercase head serifs, degrees
    // --- construction alternates
    pub a2: bool,     // double-story a
    pub g2: bool,     // double-story g
    pub tail_y: bool, // curved (vs straight) y tail
    pub leg_r: f64,   // R leg: 0 = straight diagonal, 1 = vertical-ish curled
    pub spur: bool,   // spur on G / b
    // --- spacing & posture
    pub spacing: f64,
    pub slant: f64, // degrees
    pub mono: bool, // monospaced
    pub italic: bool, // cursive construction (exit strokes, single-story a/g, …)
}

/// Continuous genes, in a fixed order (blending + jitter + spec keys).
pub const GENES: &[(&str, f64, f64)] = &[
    // key, min, max
    ("stem", 18.0, 240.0),
    ("ratio", 0.04, 1.0),
    ("stress", -20.0, 50.0),
    ("nib", 2.0, 7.0),
    ("width", 0.6, 1.6),
    ("prop", 0.0, 1.0),
    ("round", 0.80, 1.15),
    ("sup", 0.68, 0.86),
    ("aperture", 0.0, 1.0),
    ("bar", 0.38, 0.62),
    ("join", 0.40, 0.85),
    ("trap", 0.0, 0.5),
    ("xh", 0.52, 0.82),
    ("asc", 0.98, 1.22),
    ("desc", 0.18, 0.40),
    ("over", 0.0, 0.035),
    ("serif_len", 0.2, 1.6),
    ("serif_th", 0.04, 1.0),
    ("bracket", 0.0, 1.0),
    ("head", 0.0, 32.0),
    ("leg_r", 0.0, 1.0),
    ("spacing", 0.6, 1.8),
    ("slant", -12.0, 24.0),
];

/// An archetype: gene values + discrete choices + how much each may wander.
struct Arch {
    name: &'static str,
    g: [f64; 23],
    term: Term,
    ball: f64,
    serif: Serif,
    a2: f64,
    g2: f64,
    tail_y: f64,
    spur: f64,
}

// stem ratio stress nib width prop round sup aperture bar join trap xh asc desc over slen sth brk head legr spacing slant
const ARCHES: &[Arch] = &[
    Arch {
        name: "Geometric",
        g: [86.0, 0.90, 0.0, 2.0, 1.0, 0.95, 1.04, 0.715, 0.70, 0.46, 0.55, 0.12, 0.61, 1.13, 0.30, 0.016, 0.0, 0.3, 0.0, 0.0, 0.0, 1.06, 0.0],
        term: Term::Perp, ball: 0.0, serif: Serif::None, a2: 0.05, g2: 0.0, tail_y: 0.1, spur: 0.0,
    },
    Arch {
        name: "Grotesque",
        g: [94.0, 0.80, 0.0, 2.3, 1.0, 0.15, 0.93, 0.775, 0.12, 0.50, 0.62, 0.10, 0.73, 1.03, 0.26, 0.014, 0.0, 0.3, 0.0, 0.0, 0.2, 0.94, 0.0],
        term: Term::Horizontal, ball: 0.0, serif: Serif::None, a2: 1.0, g2: 0.0, tail_y: 0.2, spur: 0.9,
    },
    Arch {
        name: "Humanist",
        g: [90.0, 0.68, 22.0, 2.4, 0.96, 0.70, 0.94, 0.735, 0.85, 0.52, 0.66, 0.18, 0.69, 1.08, 0.28, 0.016, 0.0, 0.3, 0.0, 0.0, 0.1, 1.0, 0.0],
        term: Term::Vertical, ball: 0.0, serif: Serif::None, a2: 1.0, g2: 0.45, tail_y: 0.8, spur: 0.0,
    },
    Arch {
        name: "Old-style",
        g: [74.0, 0.34, 32.0, 3.6, 0.95, 1.0, 0.98, 0.72, 0.72, 0.56, 0.72, 0.0, 0.62, 1.12, 0.30, 0.018, 0.85, 0.28, 0.85, 20.0, 0.9, 1.0, 0.0],
        term: Term::Pen, ball: 0.3, serif: Serif::Bracketed, a2: 1.0, g2: 1.0, tail_y: 0.4, spur: 0.0,
    },
    Arch {
        name: "Transitional",
        g: [84.0, 0.26, 10.0, 2.2, 1.0, 0.85, 0.98, 0.745, 0.55, 0.52, 0.70, 0.0, 0.66, 1.08, 0.28, 0.016, 0.85, 0.22, 0.7, 10.0, 0.6, 0.98, 0.0],
        term: Term::Vertical, ball: 0.9, serif: Serif::Bracketed, a2: 1.0, g2: 1.0, tail_y: 0.2, spur: 0.1,
    },
    Arch {
        name: "Didone",
        g: [104.0, 0.09, 0.0, 2.0, 0.94, 0.55, 0.96, 0.76, 0.32, 0.52, 0.72, 0.0, 0.65, 1.06, 0.28, 0.012, 0.95, 0.10, 0.08, 0.0, 0.6, 0.95, 0.0],
        term: Term::Vertical, ball: 1.0, serif: Serif::Hairline, a2: 1.0, g2: 1.0, tail_y: 0.1, spur: 0.2,
    },
    Arch {
        name: "Slab",
        g: [108.0, 0.72, 0.0, 2.2, 1.04, 0.40, 0.95, 0.77, 0.40, 0.50, 0.66, 0.12, 0.70, 1.05, 0.27, 0.014, 0.80, 0.78, 0.15, 0.0, 0.1, 0.98, 0.0],
        term: Term::Horizontal, ball: 0.35, serif: Serif::Slab, a2: 1.0, g2: 0.3, tail_y: 0.2, spur: 0.3,
    },
    Arch {
        name: "Rounded",
        g: [100.0, 1.0, 0.0, 2.0, 1.02, 0.35, 0.97, 0.77, 0.45, 0.50, 0.64, 0.05, 0.71, 1.05, 0.27, 0.014, 0.0, 0.3, 0.0, 0.0, 0.2, 1.04, 0.0],
        term: Term::Round, ball: 0.0, serif: Serif::None, a2: 1.0, g2: 0.0, tail_y: 0.3, spur: 0.0,
    },
];

// jitter radius per gene at spread = 1
const JIT: [f64; 23] = [
    14.0, 0.10, 8.0, 0.6, 0.05, 0.25, 0.04, 0.02, 0.22, 0.05, 0.08, 0.10, 0.04, 0.05, 0.03, 0.005, 0.2, 0.1,
    0.25, 8.0, 0.35, 0.06, 0.0,
];

pub fn archetype_names() -> Vec<&'static str> {
    ARCHES.iter().map(|a| a.name).collect()
}

fn gi(k: &str) -> usize {
    GENES.iter().position(|g| g.0 == k).unwrap()
}

impl Style {
    /// Roll a style from a seed. `arch` forces an archetype (index), `mix` its
    /// blend partner weight, `spread` the jitter radius.
    pub fn roll(seed: &str, arch: Option<usize>, spread: f64) -> Style {
        let mut r = Rng::new(seed);
        let ai = arch.unwrap_or_else(|| (r.unit() * ARCHES.len() as f64) as usize % ARCHES.len());
        let _ = r.unit();
        let bi = (r.unit() * ARCHES.len() as f64) as usize % ARCHES.len();
        let mix = if arch.is_some() { r.range(0.0, 0.18) } else { r.range(0.0, 0.35) } * spread.min(1.0);
        let a = &ARCHES[ai];
        let b = &ARCHES[bi];
        let mut g = [0.0; 23];
        for i in 0..23 {
            g[i] = a.g[i] * (1.0 - mix) + b.g[i] * mix;
            // gaussian-ish jitter (sum of uniforms)
            let n = (r.unit() + r.unit() + r.unit() - 1.5) * 1.15;
            g[i] += n * JIT[i] * spread;
        }
        // orthogonal axes rolled freely: weight, width, slant
        let wroll = r.unit();
        let weight = if wroll < 0.12 {
            r.range(0.38, 0.62) // light
        } else if wroll < 0.72 {
            r.range(0.82, 1.18) // regular-ish
        } else if wroll < 0.92 {
            r.range(1.3, 1.65) // bold
        } else {
            r.range(1.8, 2.25) // black
        };
        g[gi("stem")] *= 1.0 + (weight - 1.0) * spread.clamp(0.35, 1.0);
        let wd = r.unit();
        let width = if wd < 0.15 {
            r.range(0.74, 0.86)
        } else if wd < 0.88 {
            r.range(0.94, 1.06)
        } else {
            r.range(1.12, 1.28)
        };
        g[gi("width")] *= 1.0 + (width - 1.0) * spread.clamp(0.35, 1.0);
        if r.chance(0.18 * spread) {
            g[gi("slant")] = r.range(7.0, 13.0);
        }
        let pick = |pa: f64, pb: f64, r: &mut Rng| r.chance(pa * (1.0 - mix) + pb * mix);
        let ball = pick(a.ball, b.ball, &mut r);
        let a2 = pick(a.a2, b.a2, &mut r);
        let g2 = pick(a.g2, b.g2, &mut r);
        let tail_y = pick(a.tail_y, b.tail_y, &mut r);
        let spur = pick(a.spur, b.spur, &mut r);
        let term = if r.chance(mix) { b.term } else { a.term };
        let serif = if r.chance(mix * 0.6) { b.serif } else { a.serif };
        let tag = format!("{:06X}", xmur3(seed) & 0xFF_FFFF);
        let mut s = Style {
            family: String::new(),
            ps_name: String::new(),
            style_name: String::new(),
            archetype: a.name,
            cap: 700.0,
            xh: 0.0,
            asc: 0.0,
            desc: 0.0,
            over: 0.0,
            stem: 0.0,
            ratio: 0.0,
            stress: 0.0,
            nib: 0.0,
            width: 0.0,
            prop: 0.0,
            round: 0.0,
            sup: 0.0,
            aperture: 0.0,
            bar: 0.0,
            join: 0.0,
            trap: 0.0,
            term,
            ball,
            serif,
            serif_len: 0.0,
            serif_th: 0.0,
            bracket: 0.0,
            head: 0.0,
            a2,
            g2,
            tail_y,
            leg_r: 0.0,
            spur,
            spacing: 1.0,
            slant: 0.0,
            mono: false,
            italic: false,
        };
        for (i, (k, _, _)) in GENES.iter().enumerate() {
            s.set(k, g[i]);
        }
        // drawn last so earlier draws (and every upright seed) are undisturbed:
        // most sloped rolls are true italics, the rest obliques
        s.italic = s.slant > 2.0 && r.chance(0.7);
        s.name_it(&tag);
        s
    }

    pub fn from_seed(seed: &str) -> Style {
        Style::roll(seed, None, 1.0)
    }

    fn name_it(&mut self, tag: &str) {
        let w = self.weight_class();
        let wn = match w {
            0..=249 => "Thin",
            250..=349 => "Light",
            350..=449 => "Regular",
            450..=549 => "Medium",
            550..=649 => "Semibold",
            650..=749 => "Bold",
            750..=849 => "Extrabold",
            _ => "Black",
        };
        let cond = match self.width_class() {
            1..=3 => "Condensed ",
            4 => "Semicondensed ",
            6 => "Semiexpanded ",
            7..=9 => "Expanded ",
            _ => "",
        };
        let it = if self.italic {
            " Italic"
        } else if self.slant.abs() > 2.0 {
            " Oblique"
        } else {
            ""
        };
        self.family = format!("Mino Roll {}", tag);
        self.ps_name = format!("MinoRoll-{}", tag);
        self.style_name = format!("{cond}{wn}{it}").trim().to_string();
    }

    /// Set one gene by key (clamped). Returns false for unknown keys.
    pub fn set(&mut self, k: &str, f: f64) -> bool {
        let (lo, hi) = match GENES.iter().find(|g| g.0 == k) {
            Some(g) => (g.1, g.2),
            None => (f64::MIN, f64::MAX),
        };
        let f = f.clamp(lo, hi);
        match k {
            "stem" => self.stem = f,
            "ratio" => self.ratio = f,
            "stress" => self.stress = f,
            "nib" => self.nib = f,
            "width" => self.width = f,
            "prop" => self.prop = f,
            "round" => self.round = f,
            "sup" => self.sup = f,
            "aperture" => self.aperture = f,
            "bar" => self.bar = f,
            "join" => self.join = f,
            "trap" => self.trap = f,
            "xh" => self.xh = f * self.cap,
            "asc" => self.asc = f * self.cap,
            "desc" => self.desc = f * self.cap,
            "over" => self.over = f * self.cap,
            "serif_len" => self.serif_len = f,
            "serif_th" => self.serif_th = f,
            "bracket" => self.bracket = f,
            "head" => self.head = f,
            "leg_r" => self.leg_r = f,
            "spacing" => self.spacing = f,
            "slant" => self.slant = f,
            _ => return false,
        }
        true
    }

    pub fn get(&self, k: &str) -> f64 {
        match k {
            "stem" => self.stem,
            "ratio" => self.ratio,
            "stress" => self.stress,
            "nib" => self.nib,
            "width" => self.width,
            "prop" => self.prop,
            "round" => self.round,
            "sup" => self.sup,
            "aperture" => self.aperture,
            "bar" => self.bar,
            "join" => self.join,
            "trap" => self.trap,
            "xh" => self.xh / self.cap,
            "asc" => self.asc / self.cap,
            "desc" => self.desc / self.cap,
            "over" => self.over / self.cap,
            "serif_len" => self.serif_len,
            "serif_th" => self.serif_th,
            "bracket" => self.bracket,
            "head" => self.head,
            "leg_r" => self.leg_r,
            "spacing" => self.spacing,
            "slant" => self.slant,
            _ => 0.0,
        }
    }

    /// `key=value;…` overrides. Discrete keys: `term` (h|v|p|pen|round),
    /// `serif` (none|bracketed|slab|hairline), `ball a2 g2 tail_y spur mono`
    /// (0/1). Unknown keys and unparsable values are ignored.
    pub fn apply_spec(&mut self, spec: &str) {
        for kv in spec.split(';') {
            let Some((k, val)) = kv.split_once('=') else { continue };
            let (k, val) = (k.trim(), val.trim());
            let b = || val == "1" || val == "true";
            match k {
                "term" => {
                    self.term = match val {
                        "h" => Term::Horizontal,
                        "v" => Term::Vertical,
                        "p" => Term::Perp,
                        "pen" => Term::Pen,
                        "round" => Term::Round,
                        _ => self.term,
                    }
                }
                "serif" => {
                    self.serif = match val {
                        "none" | "0" => Serif::None,
                        "bracketed" | "1" => Serif::Bracketed,
                        "slab" => Serif::Slab,
                        "hairline" => Serif::Hairline,
                        _ => self.serif,
                    }
                }
                "ball" => self.ball = b(),
                "a2" => self.a2 = b(),
                "g2" => self.g2 = b(),
                "tail_y" => self.tail_y = b(),
                "spur" => self.spur = b(),
                "mono" => self.mono = b(),
                "italic" => self.italic = b(),
                _ => {
                    if let Ok(f) = val.parse::<f64>() {
                        if f.is_finite() {
                            self.set(k, f);
                        }
                    }
                }
            }
        }
        let tag = self.ps_name.trim_start_matches("MinoRoll-").to_string();
        self.name_it(&tag);
    }

    pub fn weight_class(&self) -> u16 {
        // stem relative to x-height is what reads as weight
        let rel = self.stem / self.xh.max(1.0);
        (((rel - 0.06) / (0.36 - 0.06)) * 800.0 + 100.0).round().clamp(100.0, 900.0) as u16
    }

    pub fn width_class(&self) -> u16 {
        let w = self.width;
        if w < 0.72 {
            2
        } else if w < 0.84 {
            3
        } else if w < 0.94 {
            4
        } else if w < 1.07 {
            5
        } else if w < 1.18 {
            6
        } else {
            7
        }
    }

    pub fn term_key(&self) -> &'static str {
        match self.term {
            Term::Horizontal => "h",
            Term::Vertical => "v",
            Term::Perp => "p",
            Term::Pen => "pen",
            Term::Round => "round",
        }
    }
    pub fn serif_key(&self) -> &'static str {
        match self.serif {
            Serif::None => "none",
            Serif::Bracketed => "bracketed",
            Serif::Slab => "slab",
            Serif::Hairline => "hairline",
        }
    }

    /// The full genome as a spec string (round-trips through `apply_spec`).
    pub fn to_spec(&self) -> String {
        let mut parts: Vec<String> = GENES.iter().map(|(k, _, _)| format!("{k}={}", fmt(self.get(k)))).collect();
        parts.push(format!("term={}", self.term_key()));
        parts.push(format!("serif={}", self.serif_key()));
        for (k, b) in [("ball", self.ball), ("a2", self.a2), ("g2", self.g2), ("tail_y", self.tail_y), ("spur", self.spur), ("mono", self.mono), ("italic", self.italic)] {
            parts.push(format!("{k}={}", b as u8));
        }
        parts.join(";")
    }

    pub fn to_json(&self) -> String {
        let mut s = format!(
            "{{\"family\":\"{}\",\"style\":\"{}\",\"archetype\":\"{}\",\"weightClass\":{},\"widthClass\":{},\"spec\":\"{}\"",
            self.family,
            self.style_name,
            self.archetype,
            self.weight_class(),
            self.width_class(),
            self.to_spec()
        );
        for (k, _, _) in GENES {
            s.push_str(&format!(",\"{k}\":{}", fmt(self.get(k))));
        }
        s.push_str(&format!(
            ",\"term\":\"{}\",\"serif\":\"{}\",\"ball\":{},\"a2\":{},\"g2\":{},\"tail_y\":{},\"spur\":{},\"mono\":{},\"italic\":{}}}",
            self.term_key(),
            self.serif_key(),
            self.ball,
            self.a2,
            self.g2,
            self.tail_y,
            self.spur,
            self.mono,
            self.italic
        ));
        s
    }
}

fn fmt(x: f64) -> String {
    // shortest representation that round-trips exactly — a permalink must
    // rebuild the identical font
    let s = format!("{}", x);
    if s == "-0" {
        "0".into()
    } else {
        s
    }
}
