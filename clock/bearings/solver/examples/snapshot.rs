//! Dump the cell state as CSV, for offline plotting while tuning.
//!
//! ```sh
//! cargo run --release --example snapshot -- [n] [seconds] [voltage] [charge] [chain] > cell.csv
//! ```

use bearings_solver::sim::{param, World};

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let get = |i: usize, d: f32| a.get(i).and_then(|s| s.parse().ok()).unwrap_or(d);
    let n = get(0, 560.0) as usize;
    let seconds = get(1, 30.0);
    let mut w = World::new(n, 9);
    w.set_param(param::VOLTAGE, get(2, 1.0));
    w.set_param(param::CHARGE, get(3, 0.05));
    w.set_param(param::CHAIN, get(4, 1.0));
    for _ in 0..(seconds * 60.0) as usize {
        w.step(1.0 / 60.0, 12);
    }
    println!("x,y,r,q,v,wired");
    for i in 0..w.n {
        println!(
            "{},{},{},{},{},{}",
            w.x[i], w.y[i], w.r[i], w.q[i], w.v[i], w.wired[i]
        );
    }
}
