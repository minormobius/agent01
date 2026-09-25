//! Print a glyph's final TrueType contour points: `dump <seed>[@spec] <char>`.
use ttf_parser::{Face, OutlineBuilder};
struct P;
impl OutlineBuilder for P {
    fn move_to(&mut self, x: f32, y: f32) { print!("\nM {x:.0},{y:.0} "); }
    fn line_to(&mut self, x: f32, y: f32) { print!("L {x:.0},{y:.0} "); }
    fn quad_to(&mut self, a: f32, b: f32, x: f32, y: f32) { print!("Q {a:.0},{b:.0} {x:.0},{y:.0} "); }
    fn curve_to(&mut self, _: f32, _: f32, _: f32, _: f32, _: f32, _: f32) {}
    fn close(&mut self) {}
}
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let (seed, spec) = a[1].split_once('@').unwrap_or((&a[1], ""));
    let (seed, base) = match seed.split_once(':') {
        Some((n, s)) => (s, minofont::archetype_spec(n.parse().unwrap(), 0.35, s)),
        None => (seed, String::new()),
    };
    let bytes = minofont::roll_params(seed, &format!("{base};{spec}"));
    let face = Face::parse(&bytes, 0).unwrap();
    for ch in a[2].chars() {
        print!("{ch}:");
        face.outline_glyph(face.glyph_index(ch).unwrap(), &mut P);
        println!();
    }
}
