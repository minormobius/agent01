//! Sweep the spin ratio and print the measured coefficients.
//!
//!   cargo run --release --example sweep -- [nx] [ny] [r] [u0] [re] [warm] [avg]
//!   ALPHAS=0,0.5,1 cargo run --release --example sweep
//!
//! Runs natively and puts each spin ratio on its own thread, which is the only
//! reason a converged sweep is minutes rather than an hour. This is what
//! produces the shipped table in ../aero.js. The selftest re-measures a cheap
//! configuration through the *committed wasm* and checks it against stored
//! numbers, which is what stops the table and the binary drifting apart.

use pong_solver::Sim;

fn arg<T: std::str::FromStr>(i: usize, d: T) -> T {
    std::env::args().nth(i).and_then(|s| s.parse().ok()).unwrap_or(d)
}

struct Row {
    alpha: f32,
    cl: f32,
    cd: f32,
    cl_rms: f32,
    /// Root-mean-square lift carried by the shedding line alone.
    shed: f32,
    /// Strouhal number of that line. Meaningless once `shed` is near zero,
    /// which is what shedding suppression looks like.
    st: f32,
    secs: f64,
}

fn measure(alpha: f32, nx: usize, ny: usize, r: f32, u0: f32, re: f32, warm: u32, avg: u32) -> Row {
    let t0 = std::time::Instant::now();
    let mut s = Sim::new(nx, ny, nx as f32 * 0.25, ny as f32 * 0.5, r, u0, re);
    s.set_alpha(alpha);
    s.run(warm);
    s.reset_stats();

    let mut series = Vec::with_capacity(avg as usize);
    for _ in 0..avg {
        s.step();
        series.push(s.cl());
    }
    let mean = s.cl_mean();
    let rms = s.cl_rms();

    // The plain rms of the lift is NOT the shedding amplitude, and using it as
    // one is a trap this sweep fell into first. The box rings acoustically —
    // lattice Boltzmann is weakly compressible, sound crosses 512 cells in
    // about 890 steps, and both the velocity inlet and the pressure outlet
    // reflect it perfectly — so the lift carries a large oscillation at a
    // Strouhal number around 0.67 that has nothing to do with the wake. It
    // averages out of the mean, which is why the mean drag came out at the
    // published value regardless, but it swamps an rms.
    //
    // So: scan the shedding band with a single-frequency DFT and take the
    // strongest line. Acoustics sit far outside the band and do not compete.
    let (st, amp) = strongest_line(&series, mean, 2.0 * r, u0, 0.05, 0.35);

    Row {
        alpha,
        cl: mean,
        cd: s.cd_mean(),
        cl_rms: rms,
        st,
        shed: amp / std::f32::consts::SQRT_2,
        secs: t0.elapsed().as_secs_f64(),
    }
}

/// Strouhal number and amplitude of the strongest spectral line of `series`
/// within [`st_lo`, `st_hi`], by direct evaluation of the DFT sum at each
/// candidate frequency. The series is a few tens of thousands of samples and
/// the band is a couple of hundred candidates, so this is cheap enough not to
/// need an FFT.
fn strongest_line(
    series: &[f32],
    mean: f32,
    d: f32,
    u0: f32,
    st_lo: f32,
    st_hi: f32,
) -> (f32, f32) {
    let n = series.len();
    if n < 64 {
        return (0.0, 0.0);
    }
    let mut best = (0.0f32, 0.0f32);
    let steps = 240;
    for k in 0..=steps {
        let st = st_lo + (st_hi - st_lo) * k as f32 / steps as f32;
        // St = f D / U, and here one lattice step is one unit of time.
        let f = st * u0 / d;
        let w = 2.0 * std::f64::consts::PI * f as f64;
        let (mut re, mut im) = (0.0f64, 0.0f64);
        for (i, &v) in series.iter().enumerate() {
            let p = w * i as f64;
            let dv = (v - mean) as f64;
            re += dv * p.cos();
            im -= dv * p.sin();
        }
        let a = (2.0 * (re * re + im * im).sqrt() / n as f64) as f32;
        if a > best.1 {
            best = (st, a);
        }
    }
    best
}

fn main() {
    let nx: usize = arg(1, 512);
    let ny: usize = arg(2, 256);
    let r: f32 = arg(3, 12.0);
    let u0: f32 = arg(4, 0.08);
    let re: f32 = arg(5, 100.0);
    let warm: u32 = arg(6, 30000);
    let avg: u32 = arg(7, 20000);

    let alphas: Vec<f32> = std::env::var("ALPHAS")
        .ok()
        .map(|s| s.split(',').filter_map(|t| t.trim().parse().ok()).collect())
        .unwrap_or_else(|| {
            vec![
                -1.0, -0.5, 0.0, 0.25, 0.5, 0.75, 1.0, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0,
            ]
        });

    let lanes: usize = std::env::var("LANES")
        .ok()
        .and_then(|s| s.parse().ok())
        .unwrap_or_else(|| std::thread::available_parallelism().map(|n| n.get()).unwrap_or(2));

    eprintln!(
        "grid {}x{}  D={}  u0={}  Re={}  warm={}  avg={}  lanes={}",
        nx,
        ny,
        2.0 * r,
        u0,
        re,
        warm,
        avg,
        lanes
    );

    let mut rows: Vec<Row> = Vec::new();
    for chunk in alphas.chunks(lanes) {
        let batch: Vec<Row> = std::thread::scope(|sc| {
            let hs: Vec<_> = chunk
                .iter()
                .map(|&a| sc.spawn(move || measure(a, nx, ny, r, u0, re, warm, avg)))
                .collect();
            hs.into_iter().map(|h| h.join().unwrap()).collect()
        });
        for row in &batch {
            eprintln!("  alpha={:+.2} done in {:.0}s", row.alpha, row.secs);
        }
        rows.extend(batch);
    }

    println!("alpha\tCL\tCD\tCL_rms\tShed\tSt");
    for r in &rows {
        println!(
            "{:.3}\t{:.4}\t{:.4}\t{:.4}\t{:.4}\t{:.4}",
            r.alpha, r.cl, r.cd, r.cl_rms, r.shed, r.st
        );
    }
}
