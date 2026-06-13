//! Correctness gate. Since the sandbox can't run wasm or Cloudflare, these
//! native tests are the proof that a rolled font is a valid, installable SFNT:
//! they parse it back with `ttf-parser` and assert the cmap, metrics and
//! outlines are real. The deploy workflow runs `cargo test` before shipping.

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

#[test]
fn produces_a_valid_installable_face() {
    let bytes = minofont::build_font("hello world");
    let face = Face::parse(&bytes, 0).expect("rolled font must parse as a valid SFNT");

    assert_eq!(face.units_per_em(), 1000);
    // .notdef + space + 26 caps + 3 punctuation = 30 glyphs.
    assert!(face.number_of_glyphs() >= 30, "expected the full v1 glyph set");

    for c in "ABCXYZ".chars() {
        let gid = face
            .glyph_index(c)
            .unwrap_or_else(|| panic!("missing cmap entry for {c}"));
        assert!(gid.0 > 0, "{c} mapped to .notdef");
        let mut counter = Counter::default();
        let bbox = face.outline_glyph(gid, &mut counter);
        assert!(bbox.is_some(), "{c} produced no outline");
        assert!(counter.segments > 0, "{c} outline was empty");
        assert!(face.glyph_hor_advance(gid).unwrap_or(0) > 0, "{c} has no advance");
    }

    // space exists, maps, and is blank.
    let space = face.glyph_index(' ').expect("space must be in cmap");
    let mut counter = Counter::default();
    face.outline_glyph(space, &mut counter);
    assert_eq!(counter.segments, 0, "space should have no contours");
}

#[test]
fn slider_overrides_apply_and_stay_valid() {
    // The live-slider path: a seed gives a base genome, a key=value spec
    // overrides fields. The override must change the font yet still parse, and
    // an empty / unknown spec must be a no-op.
    let base = minofont::roll_params("seed-a", "");
    assert_eq!(base, minofont::build_font("seed-a"), "empty spec == plain roll");
    assert_eq!(
        base,
        minofont::roll_params("seed-a", "nonsense=1;=;bogus"),
        "unknown keys are ignored"
    );

    let heavy = minofont::roll_params("seed-a", "stem=220;mod=0.95;serif=1;pen=28");
    assert_ne!(heavy, base, "overrides must change the font");
    let face = ttf_parser::Face::parse(&heavy, 0).expect("overridden font must parse");
    for c in "HOgne".chars() {
        let gid = face.glyph_index(c).expect("cmap");
        let mut counter = Counter::default();
        face.outline_glyph(gid, &mut counter);
        assert!(counter.segments > 0, "{c:?} empty under overrides");
    }

    // Both letterform alternates (single/double-story a & g, ball terminals)
    // must produce valid, non-empty outlines either way.
    for spec in ["a2=1;g2=1;ball=1", "a2=0;g2=0;ball=0"] {
        let bytes = minofont::roll_params("seed-x", spec);
        let f = ttf_parser::Face::parse(&bytes, 0)
            .unwrap_or_else(|_| panic!("spec {spec:?} did not parse"));
        for c in "agcr".chars() {
            let gid = f.glyph_index(c).expect("cmap");
            let mut counter = Counter::default();
            f.outline_glyph(gid, &mut counter);
            assert!(counter.segments > 0, "{c:?} empty under {spec:?}");
        }
    }
}

#[test]
fn is_deterministic_and_seed_sensitive() {
    assert_eq!(
        minofont::build_font("seed-a"),
        minofont::build_font("seed-a"),
        "same seed must yield identical bytes (permalinks depend on it)"
    );
    assert_ne!(
        minofont::build_font("seed-a"),
        minofont::build_font("seed-b"),
        "different seeds should yield different fonts"
    );
}

#[test]
fn every_charset_glyph_maps_and_outlines() {
    let bytes = minofont::build_font("coverage");
    let face = Face::parse(&bytes, 0).unwrap();
    for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789.,-".chars() {
        let gid = face
            .glyph_index(c)
            .unwrap_or_else(|| panic!("no cmap entry for {c:?}"));
        let mut counter = Counter::default();
        face.outline_glyph(gid, &mut counter);
        assert!(counter.segments > 0, "{c:?} produced an empty outline");
    }
}

#[test]
fn pen_model_glyphs_outline_across_seeds() {
    // The skeleton-stroke glyphs (O C o c e n) must stay valid across the whole
    // genome range — heavy/light weight, high/low contrast, every pen angle and
    // slant a seed can roll. Sweep a spread of seeds and assert each still maps
    // and outlines (a degenerate offset would collapse to an empty contour).
    for seed in [
        "alpha", "bravo", "charlie", "delta", "echo", "foxtrot", "golf", "hotel",
        "india", "juliet", "kilo", "lima", "mike", "november", "oscar", "papa",
        "quebec", "romeo", "sierra", "tango", "uniform", "victor", "whiskey",
        "xray", "yankee", "zulu", "0", "1", "42", "morph-test", "humanist",
    ] {
        let bytes = minofont::build_font(seed);
        let face = Face::parse(&bytes, 0)
            .unwrap_or_else(|_| panic!("seed {seed:?} did not parse"));
        for c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz".chars() {
            let gid = face
                .glyph_index(c)
                .unwrap_or_else(|| panic!("seed {seed:?}: no cmap entry for {c:?}"));
            let mut counter = Counter::default();
            face.outline_glyph(gid, &mut counter);
            assert!(
                counter.segments > 0,
                "seed {seed:?}: pen glyph {c:?} produced an empty outline"
            );
        }
    }
}
