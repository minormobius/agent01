//! flux-verify — the cross-engine gate.
//!
//! Reads a whitespace-separated world list (emitted by
//! scripts/build-flux-catalog.mjs) and, for each world, independently:
//!   • sweeps the action space and confirms ≥1 winning launch (solvable), and
//!   • re-simulates the JS solver's stored answer and confirms it wins.
//! Exits non-zero if the Rust engine disagrees with the JS catalog on any world,
//! so CI fails loudly. Input path is argv[1], else stdin.
//!
//! World record layout (all numbers, whitespace separated):
//!   seed gravity b0x b0y gx gy grad
//!   nA (x y q)·nA  nG (x y rad drag)·nG  nB (x y rad rest)·nB  nW (x1 y1 x2 y2)·nW
//!   ansAngle ansPower
//! The file begins with a single integer: the world count.

use std::io::Read;
use flux_engine::{simulate, sweep_wins, World, Attr, Goo, Bump, Wall};

fn main() {
    let mut input = String::new();
    let args: Vec<String> = std::env::args().collect();
    if args.len() > 1 {
        input = std::fs::read_to_string(&args[1]).unwrap_or_else(|e| {
            eprintln!("flux-verify: cannot read {}: {e}", args[1]);
            std::process::exit(2);
        });
    } else {
        std::io::stdin().read_to_string(&mut input).expect("read stdin");
    }

    let mut it = input.split_whitespace();
    let mut next_f = || -> f64 { it.next().expect("unexpected end of input").parse().expect("bad number") };

    let count = next_f() as usize;
    let mut checked = 0usize;
    let mut unsolvable = 0usize;
    let mut answer_failed = 0usize;
    let mut min_wins = usize::MAX;

    for _ in 0..count {
        let seed = next_f() as i64;
        let gravity = next_f() != 0.0;
        let b0 = (next_f(), next_f());
        let goal = (next_f(), next_f(), next_f());
        let na = next_f() as usize;
        let attractors: Vec<Attr> = (0..na).map(|_| Attr { x: next_f(), y: next_f(), q: next_f() }).collect();
        let ng = next_f() as usize;
        let goo: Vec<Goo> = (0..ng).map(|_| Goo { x: next_f(), y: next_f(), rad: next_f(), drag: next_f() }).collect();
        let nb = next_f() as usize;
        let bumpers: Vec<Bump> = (0..nb).map(|_| Bump { x: next_f(), y: next_f(), rad: next_f(), rest: next_f() }).collect();
        let nw = next_f() as usize;
        let walls: Vec<Wall> = (0..nw).map(|_| Wall { x1: next_f(), y1: next_f(), x2: next_f(), y2: next_f() }).collect();
        let ans_angle = next_f();
        let ans_power = next_f();

        let w = World { gravity, b0, goal, attractors, goo, bumpers, walls };
        let wins = sweep_wins(&w, 96, 18);
        if wins == 0 { unsolvable += 1; eprintln!("  seed {seed}: Rust sweep found NO winning launch (JS said solvable)"); }
        if wins < min_wins { min_wins = wins; }
        if !simulate(&w, ans_angle, ans_power) { answer_failed += 1; eprintln!("  seed {seed}: Rust says JS's stored answer ({:.4} rad, {:.1}) MISSES", ans_angle, ans_power); }
        checked += 1;
    }

    println!("flux-verify: checked {checked} worlds");
    println!("  min winning launches found in any world: {}", if min_wins == usize::MAX { 0 } else { min_wins });
    println!("  worlds Rust found unsolvable (JS disagreed): {unsolvable}");
    println!("  stored answers Rust says miss: {answer_failed}");

    if unsolvable > 0 || answer_failed > 0 {
        eprintln!("flux-verify: CROSS-ENGINE MISMATCH — failing");
        std::process::exit(1);
    }
    println!("flux-verify: Rust engine agrees with the JS catalog on every world ✓");
}
