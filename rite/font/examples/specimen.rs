//! Local proofing tool: roll a few seeds, parse the generated .ttf back with
//! ttf-parser, and lay the outlined glyphs into one SVG specimen. This renders
//! the real font file (not the in-memory contours), so it doubles as an
//! end-to-end check. Run: `cargo run --example specimen`.

use ttf_parser::{Face, OutlineBuilder};

struct SvgPath {
    d: String,
}
impl OutlineBuilder for SvgPath {
    fn move_to(&mut self, x: f32, y: f32) {
        self.d.push_str(&format!("M{x:.1} {y:.1} "));
    }
    fn line_to(&mut self, x: f32, y: f32) {
        self.d.push_str(&format!("L{x:.1} {y:.1} "));
    }
    fn quad_to(&mut self, cx: f32, cy: f32, x: f32, y: f32) {
        self.d.push_str(&format!("Q{cx:.1} {cy:.1} {x:.1} {y:.1} "));
    }
    fn curve_to(&mut self, c1x: f32, c1y: f32, c2x: f32, c2y: f32, x: f32, y: f32) {
        self.d
            .push_str(&format!("C{c1x:.1} {c1y:.1} {c2x:.1} {c2y:.1} {x:.1} {y:.1} "));
    }
    fn close(&mut self) {
        self.d.push_str("Z ");
    }
}

fn line(face: &Face, text: &str) -> (String, f32) {
    let mut out = String::new();
    let mut x = 0.0f32;
    for ch in text.chars() {
        if let Some(gid) = face.glyph_index(ch) {
            let mut p = SvgPath { d: String::new() };
            face.outline_glyph(gid, &mut p);
            if !p.d.is_empty() {
                out.push_str(&format!(
                    "<path transform=\"translate({x:.1},0)\" d=\"{}\"/>",
                    p.d
                ));
            }
            x += face.glyph_hor_advance(gid).unwrap_or(500) as f32;
        }
    }
    (out, x)
}

fn main() {
    let seeds = ["sunrise", "brutal-9", "whisper-x", "geode", "ribbon", "240612"];
    let texts = [
        "Hamburgefonts CGOQ",
        "the quick brown fox jumps lazy vw pqgyj",
    ];
    let upm = 1000.0f32;
    let line_h = upm * 1.35;
    let row_h = line_h * texts.len() as f32 + upm * 0.4;
    let mut rows = String::new();
    let mut max_w = 0.0f32;

    for (i, seed) in seeds.iter().enumerate() {
        let bytes = minofont::build_font(seed);
        let face = Face::parse(&bytes, 0).expect("valid font");
        let y0 = i as f32 * row_h;
        for (j, text) in texts.iter().enumerate() {
            let (paths, w) = line(&face, text);
            max_w = max_w.max(w);
            let baseline = y0 + (j as f32 + 1.0) * line_h;
            // glyf is y-up; flip into SVG's y-down space and drop to the baseline.
            rows.push_str(&format!(
                "<g transform=\"translate(0,{baseline:.1}) scale(1,-1)\" fill=\"#efe7da\">{paths}</g>",
            ));
        }
        rows.push_str(&format!(
            "<text x=\"{:.1}\" y=\"{:.1}\" fill=\"#d8a657\" font-family=\"sans-serif\" font-size=\"110\">{}</text>",
            max_w + 160.0,
            y0 + line_h,
            seed
        ));
    }

    let total_h = seeds.len() as f32 * row_h;
    let svg = format!(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"{w:.0}\" height=\"{h:.0}\" viewBox=\"-40 -40 {vw:.0} {vh:.0}\"><rect x=\"-40\" y=\"-40\" width=\"{vw:.0}\" height=\"{vh:.0}\" fill=\"#1a1714\"/>{rows}</svg>",
        w = (max_w + 1400.0) / 2.0,
        h = total_h / 2.0,
        vw = max_w + 1400.0,
        vh = total_h,
        rows = rows
    );
    std::fs::write("/tmp/fontout/specimen.svg", svg).unwrap();
    println!("wrote /tmp/fontout/specimen.svg");
}
