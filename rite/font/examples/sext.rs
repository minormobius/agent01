//! The extent of s: how far each terminal reaches past the opposite bowl.
fn main() {
    let names = ["geometric", "grotesque", "humanist", "old-style", "transitional", "didone", "slab", "rounded"];
    println!("{:<13} {:>5}  {:>9} {:>9}   {:>9} {:>9}", "archetype", "stem", "s: top→R", "bot→L", "S: top→R", "bot→L");
    for (i, n) in names.iter().enumerate() {
        for stem in [60.0, 95.0, 150.0, 210.0] {
            let spec = format!("{};stem={stem};slant=0;italic=0", minofont::archetype_spec(i as i32, 0.0, "ext"));
            let (u0, u1, l0, l1) = minofont::debug_extent("ext", &spec, 's', 0.5);
            let (cu0, cu1, cl0, cl1) = minofont::debug_extent("ext", &spec, 'S', 0.5);
            // positive = the terminal overhangs the other bowl
            println!("{:<13} {:>5.0}  {:>9.1} {:>9.1}   {:>9.1} {:>9.1}", n, stem, u1 - l1, u0 - l0, cu1 - cl1, cu0 - cl0);
        }
    }
}
