//! Write rolled fonts to disk for proofing:
//!   cargo run --example roll -- <out-dir> <seed>[@spec] ...
//! A `@spec` suffix applies gene overrides (`key=v;key=v`); a seed written
//! `N:seed` rolls inside archetype N at spread 0.35 (N = index into archetypes()).
fn main() {
    let mut args = std::env::args().skip(1);
    let dir = args.next().expect("out dir");
    std::fs::create_dir_all(&dir).unwrap();
    for a in args {
        let (seed, spec) = a.split_once('@').unwrap_or((a.as_str(), ""));
        let (seed, base) = match seed.split_once(':') {
            Some((n, s)) => (s, minofont::archetype_spec(n.parse().unwrap(), 0.35, s)),
            None => (seed, String::new()),
        };
        let t = std::time::Instant::now();
        let bytes = minofont::roll_params(seed, &format!("{base};{spec}"));
        let name = a.replace(|c: char| !c.is_ascii_alphanumeric(), "_");
        std::fs::write(format!("{dir}/{name}.ttf"), &bytes).unwrap();
        println!("{dir}/{name}.ttf  {} bytes  {:?}", bytes.len(), t.elapsed());
    }
}
