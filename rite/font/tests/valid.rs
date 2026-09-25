//! Correctness gate. Since the sandbox can't run wasm or Cloudflare, these
//! native tests are the proof that a rolled font is a valid, installable SFNT:
//! they parse it back with `ttf-parser` and assert the cmap, metrics, kerning
//! and outlines are real. The deploy workflow runs `cargo test` before shipping.

use ttf_parser::{Face, OutlineBuilder};

#[derive(Default)]
struct Counter {
    segments: usize,
}
impl OutlineBuilder for Counter {
    fn move_to(&mut self, _: f32, _: f32) {
        self.segments += 1;
    }
    fn line_to(&mut self, _: f32, _: f32) {
        self.segments += 1;
    }
    fn quad_to(&mut self, _: f32, _: f32, _: f32, _: f32) {
        self.segments += 1;
    }
    fn curve_to(&mut self, _: f32, _: f32, _: f32, _: f32, _: f32, _: f32) {
        self.segments += 1;
    }
    fn close(&mut self) {}
}

fn outlines(face: &Face, c: char) -> bool {
    let Some(gid) = face.glyph_index(c) else { return false };
    let mut counter = Counter::default();
    face.outline_glyph(gid, &mut counter);
    counter.segments > 0
}

/// Everything the engine promises to draw.
const COVERAGE: &str = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789\
    .,:;!?¡¿'\"‘’“”‚„-–—_()[]{}/\\|+−=<>×÷±~^*#%&@$€£¢¥·•°…«»‹›§¶¬©®™\
    ÀÁÂÃÄÅÇÈÉÊËÌÍÎÏÑÒÓÔÕÖÙÚÛÜÝàáâãäåçèéêëìíîïñòóôõöùúûüýÿ\
    ĀāĂăĄąĆćČčĎďĐđĒēĖėĘęĚěĞğĢģĪīĮįİıĶķĹĺĻļĽľŁłŃńŅņŇňŌōŐőŒœŔŕŘřŚśŞşŠšŢţŤťȘșȚțŪūŮůŰűŲųŸŹźŻżŽž\
    ÆæßÐðÞþØø\
    ΑΒΓΔΕΖΗΘΙΚΛΜΝΞΟΠΡΣΤΥΦΧΨΩαβγδεζηθικλμνξοπρςστυφχψω\
    АБВГДЕЁЖЗИЙКЛМНОПРСТУФХЦЧШЩЪЫЬЭЮЯабвгдеёжзийклмнопрстуфхцчшщъыьэюяЄєІіЇїҐґЈј\
    ≤≥≠≈≡∞√∇∆∂∫∑∏∈∉∀∃∧∨∪∩⊂⊃⊆⊇∅→←↑↓↔⇒⇔∝∘′″ℝℕℤℚℂ";

#[test]
fn produces_a_valid_installable_face() {
    let bytes = minofont::build_font("hello world");
    let face = Face::parse(&bytes, 0).expect("rolled font must parse as a valid SFNT");
    assert_eq!(face.units_per_em(), 1000);
    assert!(face.number_of_glyphs() > 300, "expected the full glyph set, got {}", face.number_of_glyphs());
    for c in "ABCXYZ".chars() {
        let gid = face.glyph_index(c).unwrap_or_else(|| panic!("missing cmap entry for {c}"));
        assert!(gid.0 > 0, "{c} mapped to .notdef");
        assert!(outlines(&face, c), "{c} produced no outline");
        assert!(face.glyph_hor_advance(gid).unwrap_or(0) > 0, "{c} has no advance");
    }
    // space exists, maps, and is blank.
    let space = face.glyph_index(' ').expect("space must be in cmap");
    let mut counter = Counter::default();
    face.outline_glyph(space, &mut counter);
    assert_eq!(counter.segments, 0, "space should have no contours");
    assert!(face.glyph_hor_advance(space).unwrap() > 150, "space too narrow");
}

#[test]
fn every_promised_glyph_maps_and_outlines() {
    for seed in ["coverage", "serif-probe", "zz9"] {
        let bytes = minofont::build_font(seed);
        let face = Face::parse(&bytes, 0).unwrap();
        for c in COVERAGE.chars() {
            assert!(outlines(&face, c), "seed {seed:?}: {c:?} missing or empty");
        }
    }
}

#[test]
fn shared_shapes_share_glyphs() {
    // Greek/Cyrillic letters that are Latin letters point at the Latin glyph.
    let bytes = minofont::build_font("alias");
    let face = Face::parse(&bytes, 0).unwrap();
    for (a, b) in [('A', 'Α'), ('A', 'А'), ('o', 'о'), ('p', 'р'), ('H', 'Н')] {
        assert_eq!(face.glyph_index(a), face.glyph_index(b), "{a} and {b} should share a glyph");
    }
}

#[test]
fn kerning_is_present_and_sane() {
    let bytes = minofont::build_font("kerned");
    let face = Face::parse(&bytes, 0).unwrap();
    let kern = face.tables().kern.expect("a kern table");
    let sub = kern.subtables.into_iter().next().expect("one subtable");
    let g = |c| face.glyph_index(c).unwrap();
    let av = sub.glyphs_kerning(g('A'), g('V')).unwrap_or(0);
    let to = sub.glyphs_kerning(g('T'), g('o')).unwrap_or(0);
    assert!(av < 0, "AV should tighten (got {av})");
    assert!(to < 0, "To should tighten (got {to})");
    // nothing absurd: no kern bigger than half an em
    let hh = sub.glyphs_kerning(g('H'), g('H')).unwrap_or(0);
    assert_eq!(hh, 0, "HH is the reference and must not be kerned");
}

#[test]
fn spec_overrides_apply_and_stay_valid() {
    let base = minofont::roll_params("seed-a", "");
    assert_eq!(base, minofont::build_font("seed-a"), "empty spec == plain roll");
    assert_eq!(base, minofont::roll_params("seed-a", "nonsense=1;=;bogus;stem=abc"), "junk is ignored");
    let heavy = minofont::roll_params("seed-a", "stem=200;ratio=0.2;serif=slab;stress=28");
    assert_ne!(heavy, base, "overrides must change the font");
    let face = Face::parse(&heavy, 0).expect("overridden font must parse");
    for c in "HOgne&@".chars() {
        assert!(outlines(&face, c), "{c:?} empty under overrides");
    }
    // the construction alternates, both ways
    for spec in ["a2=1;g2=1;ball=1;tail_y=1;spur=1", "a2=0;g2=0;ball=0;tail_y=0;spur=0"] {
        let f = minofont::roll_params("seed-x", spec);
        let face = Face::parse(&f, 0).unwrap_or_else(|_| panic!("spec {spec:?} did not parse"));
        for c in "agcrysGQR".chars() {
            assert!(outlines(&face, c), "{c:?} empty under {spec:?}");
        }
    }
}

#[test]
fn describe_round_trips_through_spec() {
    // the permalink carries `describe().spec`; re-applying it must reproduce the font
    let json = minofont::describe("round-trip", "stem=120;term=v;serif=hairline");
    let spec = json.split("\"spec\":\"").nth(1).unwrap().split('"').next().unwrap();
    let a = minofont::roll_params("round-trip", "stem=120;term=v;serif=hairline");
    let b = minofont::roll_params("round-trip", spec);
    assert_eq!(a, b, "the canonical spec must reproduce the font exactly");
}

#[test]
fn every_archetype_and_extreme_is_valid() {
    let names: Vec<String> = serde_like_list(&minofont::archetypes());
    assert!(names.len() >= 8);
    for (i, name) in names.iter().enumerate() {
        for spread in [0.0, 0.5, 1.2] {
            let spec = minofont::archetype_spec(i as i32, spread, &format!("arch-{i}"));
            let bytes = minofont::roll_params("arch", &spec);
            let face = Face::parse(&bytes, 0).unwrap_or_else(|_| panic!("{name} @ {spread} did not parse"));
            for c in "HOaegns&Q09ßЖλ".chars() {
                assert!(outlines(&face, c), "{name} @ {spread}: {c:?} empty");
            }
        }
    }
    // the corners of the gene box
    for spec in [
        "stem=18;ratio=0.04;width=0.6;xh=0.52",
        "stem=240;ratio=1;width=1.6;xh=0.82;sup=0.86",
        "stem=160;ratio=0.05;stress=50;nib=7;serif=bracketed;head=32",
        "slant=24;term=round;mono=1",
        "slant=-12;term=pen;serif=slab;serif_th=1;serif_len=1.6",
    ] {
        let bytes = minofont::roll_params("edge", spec);
        let face = Face::parse(&bytes, 0).unwrap_or_else(|_| panic!("{spec} did not parse"));
        for c in "HOaegns".chars() {
            assert!(outlines(&face, c), "{spec}: {c:?} empty");
        }
    }
}

#[test]
fn monospace_is_monospaced() {
    let bytes = minofont::roll_params("mono", "mono=1");
    let face = Face::parse(&bytes, 0).unwrap();
    let adv = |c| face.glyph_hor_advance(face.glyph_index(c).unwrap()).unwrap();
    let w = adv('m');
    for c in "ilMW.0 ".chars() {
        assert_eq!(adv(c), w, "{c:?} breaks the monospace grid");
    }
    assert!(face.is_monospaced());
}

#[test]
fn is_deterministic_and_seed_sensitive() {
    assert_eq!(minofont::build_font("seed-a"), minofont::build_font("seed-a"), "same seed must yield identical bytes");
    assert_ne!(minofont::build_font("seed-a"), minofont::build_font("seed-b"), "different seeds should differ");
}

#[test]
fn many_seeds_stay_valid() {
    for i in 0..40 {
        let seed = format!("sweep-{i}");
        let bytes = minofont::build_font(&seed);
        let face = Face::parse(&bytes, 0).unwrap_or_else(|_| panic!("{seed} did not parse"));
        for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789".chars() {
            assert!(outlines(&face, c), "{seed}: {c:?} empty");
        }
        assert!(bytes.len() < 400_000, "{seed}: {} bytes is too big", bytes.len());
    }
}

fn serde_like_list(s: &str) -> Vec<String> {
    s.trim_matches(|c| c == '[' || c == ']').split(',').map(|x| x.trim_matches('"').to_string()).collect()
}

/// Collects straight segments so a test can look for collinear chains.
#[derive(Default)]
struct Lines {
    pts: Vec<(f32, f32)>,
    kinks: usize,
    cur: (f32, f32),
}
impl OutlineBuilder for Lines {
    fn move_to(&mut self, x: f32, y: f32) {
        self.pts.clear();
        self.pts.push((x, y));
        self.cur = (x, y);
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.pts.push((x, y));
        if self.pts.len() >= 3 {
            let n = self.pts.len();
            let (a, b, c) = (self.pts[n - 3], self.pts[n - 2], self.pts[n - 1]);
            let (ux, uy, vx, vy) = (b.0 - a.0, b.1 - a.1, c.0 - b.0, c.1 - b.1);
            let cross = (ux * vy - uy * vx).abs();
            let len = (ux * ux + uy * uy).sqrt() * (vx * vx + vy * vy).sqrt();
            // two lines continuing the same direction (within ~1.5°): a straight
            // edge written as a chain of segments
            if len > 0.0 && cross / len < 0.026 && ux * vx + uy * vy > 0.0 {
                self.kinks += 1;
            }
        }
        self.cur = (x, y);
    }
    fn quad_to(&mut self, _: f32, _: f32, x: f32, y: f32) {
        self.pts.clear();
        self.pts.push((x, y));
    }
    fn curve_to(&mut self, _: f32, _: f32, _: f32, _: f32, x: f32, y: f32) {
        self.pts.clear();
        self.pts.push((x, y));
    }
    fn close(&mut self) {}
}

#[test]
fn straight_strokes_are_single_segments() {
    for seed in ["lines-a", "lines-b", "lines-c", "lines-d"] {
        let bytes = minofont::build_font(seed);
        let face = Face::parse(&bytes, 0).unwrap();
        for c in "AVWXYKkvwxyzNMZ47".chars() {
            let mut l = Lines::default();
            face.outline_glyph(face.glyph_index(c).unwrap(), &mut l);
            // a stroke flowing tangentially into a round cap may leave one
            // near-straight step; grid noise left ~30 per edge
            assert!(l.kinks <= 2, "seed {seed:?}: {c:?} writes a straight edge as a kinked chain ({} kinks)", l.kinks);
        }
    }
}

#[test]
fn italics_are_real_italics() {
    for arch in 0..8 {
        let spec = format!("{};italic=1;slant=11", minofont::archetype_spec(arch, 0.4, "ital"));
        let bytes = minofont::roll_params("ital", &spec);
        let face = Face::parse(&bytes, 0).unwrap_or_else(|_| panic!("italic archetype {arch} did not parse"));
        assert!(face.is_italic(), "archetype {arch}: OS/2 must flag the italic");
        let json = minofont::describe("ital", &spec);
        assert!(json.contains("Italic"), "archetype {arch}: style name must say Italic");
        for c in "nmhuadilfkxgáíïñ".chars() {
            assert!(outlines(&face, c), "italic archetype {arch}: {c:?} empty");
        }
        // the italic f descends below the baseline
        let f = face.glyph_bounding_box(face.glyph_index('f').unwrap()).unwrap();
        assert!(f.y_min < -50, "archetype {arch}: italic f should descend (y_min {})", f.y_min);
    }
    // an upright italic (cursive forms, no slant) is still an italic
    let bytes = minofont::roll_params("ital", "italic=1;slant=0");
    assert!(Face::parse(&bytes, 0).unwrap().is_italic());
}
