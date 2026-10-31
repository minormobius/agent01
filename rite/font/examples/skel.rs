//! Overlay proof: `skel <out.svg> <seed>[@spec] <chars>` — each glyph's ink
//! (grey) with its stroke centrelines (red), side by side, in font units.
fn main() {
    let a: Vec<String> = std::env::args().collect();
    let (seed, spec) = a[2].split_once('@').unwrap_or((&a[2], ""));
    let (seed, base) = match seed.split_once(':') {
        Some((n, s)) => (s.to_string(), minofont::archetype_spec(n.parse().unwrap(), 0.35, s)),
        None => (seed.to_string(), String::new()),
    };
    let spec = format!("{base};{spec}");
    let mut body = String::new();
    for (i, c) in a[3].chars().enumerate() {
        let (ink, sk) = minofont::debug_skeleton(&seed, &spec, c);
        body.push_str(&format!(
            "<g transform=\"translate({},850) scale(1,-1)\"><path d=\"{ink}\" fill=\"#bbb\" fill-rule=\"nonzero\"/><path d=\"{sk}\" fill=\"none\" stroke=\"#d00\" stroke-width=\"4\"/><line x1=\"-50\" x2=\"900\" y1=\"0\" y2=\"0\" stroke=\"#39f\" stroke-width=\"2\"/></g>",
            100 + i * 900
        ));
    }
    let w = 200 + a[3].chars().count() * 900;
    std::fs::write(&a[1], format!("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 {w} 1150\" width=\"{}\" height=\"575\"><rect width=\"100%\" height=\"100%\" fill=\"#fff\"/>{body}</svg>", w / 2)).unwrap();
}
