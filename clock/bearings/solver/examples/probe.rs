//! Headless run of the cell, printing what the HUD would show. This is how the
//! constants in `sim.rs` were calibrated — the browser only tells you "that
//! looks wrong", this tells you which number is wrong.
//!
//! ```sh
//! cargo run --release --example probe -- [n] [seconds] [voltage] [charge] [chain] [substeps] [noise] [seed]
//! ```

use bearings_solver::sim::{param, World};

fn main() {
    let a: Vec<String> = std::env::args().skip(1).collect();
    let get = |i: usize, d: f32| a.get(i).and_then(|s| s.parse().ok()).unwrap_or(d);
    let n = get(0, 420.0) as usize;
    let seconds = get(1, 30.0);
    let volts = get(2, 1.0);
    let charge = get(3, 0.45);
    let chain = get(4, 1.0);
    let substeps = get(5, 10.0) as u32;
    let noise = get(6, 0.05);
    let seed = get(7, 9.0) as u32;

    let mut w = World::new(n, seed);
    let start_hist = {
        let mut bins = [0u32; 10];
        for i in 0..w.n {
            let rad = (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt();
            bins[((rad * 10.0) as usize).min(9)] += 1;
        }
        bins
    };
    w.set_param(param::VOLTAGE, volts);
    w.set_param(param::CHARGE, charge);
    w.set_param(param::CHAIN, chain);
    w.set_param(param::NOISE, noise);
    println!(
        "n={n} packing={:.3}  V={volts} charge={charge} chain={chain}",
        w.stats.packing
    );
    println!("   t     I     P   closed chains longest reach  |v|max  overlap  <r>  cg   resid   ms/frame");

    let frames = (seconds * 60.0) as usize;
    let mut worst_ms = 0.0f32;
    for f in 0..frames {
        let t0 = std::time::Instant::now();
        w.step(1.0 / 60.0, substeps as usize);
        let ms = t0.elapsed().as_secs_f32() * 1e3;
        worst_ms = worst_ms.max(ms);
        if f % 60 == 0 || f == frames - 1 {
            let s = w.stats;
            println!(
                "{:5.1} {:6.3} {:6.3}   {:3.0} {:6.0} {:7.0} {:5.2} {:7.3} {:8.4} {:5.3} {:3.0} {:8.5} {:6.2}",
                s.time,
                s.current,
                s.power,
                s.closed,
                s.chains,
                s.longest_chain,
                s.reach,
                s.max_speed,
                w.max_overlap(),
                (0..w.n).map(|i| (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt()).sum::<f32>() / w.n as f32,
                s.cg_iters,
                s.cg_resid,
                ms
            );
        }
    }
    let hist = |w: &World| {
        let mut bins = [0u32; 10];
        for i in 0..w.n {
            let rad = (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt();
            bins[((rad * 10.0) as usize).min(9)] += 1;
        }
        bins
    };
    println!("radial histogram (0.1 bins)  start: {start_hist:?}");
    println!("                              end:   {:?}", hist(&w));
    println!("worst frame {worst_ms:.2} ms   mean radius {:.3}", {
        (0..w.n)
            .map(|i| (w.x[i] * w.x[i] + w.y[i] * w.y[i]).sqrt())
            .sum::<f32>()
            / w.n as f32
    });
}
