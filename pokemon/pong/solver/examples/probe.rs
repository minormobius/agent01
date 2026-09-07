//! Watch the flow for blow-up, and say *where*.
//!
//!   cargo run --release --example probe -- [alpha] [nx] [ny] [r] [u0] [re]

use pong_solver::Sim;

fn arg<T: std::str::FromStr>(i: usize, d: T) -> T {
    std::env::args().nth(i).and_then(|s| s.parse().ok()).unwrap_or(d)
}

fn main() {
    let alpha: f32 = arg(1, 0.0);
    let nx: usize = arg(2, 256);
    let ny: usize = arg(3, 128);
    let r: f32 = arg(4, 8.0);
    let u0: f32 = arg(5, 0.08);
    let re: f32 = arg(6, 200.0);
    let mut s = Sim::new(nx, ny, nx as f32 * 0.25, ny as f32 * 0.5, r, u0, re);
    s.set_alpha(alpha);
    for _ in 0..80 {
        s.run(50);
        s.paint(1);
        let f = s.field();
        let mut mx = 0.0f32;
        let mut at = 0usize;
        for (i, &v) in f.iter().enumerate() {
            if v.is_nan() {
                continue;
            }
            if !(v <= mx) {
                mx = v;
                at = i;
            }
        }
        println!(
            "step {:5}  max|u| {:.5} at ({},{})  CL {:.4}  CD {:.4}",
            s.steps(),
            mx,
            at % nx,
            at / nx,
            s.cl(),
            s.cd()
        );
        if !mx.is_finite() || mx > 0.5 {
            println!("blew up");
            break;
        }
    }
}
