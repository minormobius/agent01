//! Square grid vs triangulated (braced) lattice, scored by the frame solver.
//! `cargo run --release --example compare`
//!
//! Answers "is a square grid optimal?" with numbers: under an in-plane racking
//! (shear) load, a bending-dominated square grid is far softer per kilogram than the
//! same grid with one diagonal per cell (stretch-dominated). This is the Ashby–Gibson
//! stretch-vs-bending story, and the reason the foam's cell edges want to triangulate
//! along the load.

use cylinder_solver::foam;

fn main() {
    let (nx, ny, cell, t, e, shear, density) = (6, 6, 1.0, 0.05, 2.0e11, 1.0e3, 7850.0);
    for (label, braced) in [("square grid ", false), ("triangulated", true)] {
        let m = foam::grid(nx, ny, cell, t, e, braced, shear);
        let s = foam::score(&m, density);
        // stiffness-to-weight ∝ 1/(compliance·mass); higher is better. Normalise later.
        let s2w = 1.0 / (s.compliance * s.mass);
        println!(
            "{}  compliance {:>10.3e}   mass {:>7.1} kg   max σ {:>9.2} MPa   stiffness/wt {:.3e}",
            label, s.compliance, s.mass, s.max_stress / 1e6, s2w
        );
    }
}
