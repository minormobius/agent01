//! waterwheel — the engine behind henderhead.mino.mobi/wheel/.
//!
//! After Matt Henderson's chaotic leaky waterwheel (2026-09-13). The physics
//! and the Lorenz correspondence live in `wheel.rs`; this is the C ABI, the
//! traces, and the twin wheel that makes sensitive dependence visible.
//!
//! Same build as the other two engines here: a plain cdylib for
//! wasm32-unknown-unknown, no wasm-bindgen, no imports.
//!
//! Four things run in lockstep, all from the same starting state:
//!
//!   * `wheel`  — the physical wheel with its finite buckets, which is what the
//!                page draws
//!   * `twin`   — the same wheel with its initial spin nudged by a billionth,
//!                which is the butterfly effect with a control on it
//!   * `cont`   — the continuum reduction, the wheel with infinitely many
//!                buckets
//!   * `lorenz` — the Lorenz system with the mapped parameters
//!
//! The last two agree to integrator noise forever. The first differs from them
//! only by the periodic ripple a finite bucket count introduces, and diverges
//! from them the way any two nearby chaotic trajectories do.

mod wheel;

use wheel::{Continuum, Lorenz, Params, Wheel};

const TRACE_CAP: usize = 24_000;

struct State {
    p: Params,
    wheel: Wheel,
    twin: Wheel,
    cont: Continuum,
    lorenz: Lorenz,
    /// interleaved x,y in wheel radii, oldest first
    trace: Vec<f32>,
    twin_trace: Vec<f32>,
    lorenz_trace: Vec<f32>,
    sep: f64,
    sep_t: f64,
    since_sample: f64,
}

static mut ST: Option<State> = None;

fn st() -> &'static mut State {
    unsafe { (*&raw mut ST).as_mut().expect("init() first") }
}

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    if !p.is_null() && n > 0 { drop(Vec::from_raw_parts(p, n, n)); }
}

/// Build the world. Every parameter is physical; the Lorenz numbers are
/// derived from them, never set directly.
#[no_mangle]
pub extern "C" fn init(n: u32, q: f64, k: f64, nu: f64, inertia: f64, g: f64, radius: f64, spread: f64) {
    let p = Params {
        n: (n as usize).clamp(3, 256),
        q: q.max(1e-6),
        k: k.max(1e-4),
        nu: nu.max(1e-6),
        inertia: inertia.max(1e-6),
        g: g.max(1e-6),
        radius: radius.max(1e-3),
        spread: spread.clamp(0.05, 6.0),
    };
    let s = State {
        p,
        wheel: Wheel::new(p),
        twin: Wheel::new(p),
        cont: Continuum::new(p),
        lorenz: Lorenz::new(p.sigma(), p.rho(), p.beta()),
        trace: Vec::with_capacity(TRACE_CAP * 2),
        twin_trace: Vec::with_capacity(TRACE_CAP * 2),
        lorenz_trace: Vec::with_capacity(TRACE_CAP * 2),
        sep: 0.0,
        sep_t: 0.0,
        since_sample: 0.0,
    };
    unsafe { *(&raw mut ST) = Some(s); }
    reset(0.0, 1e-9);
}

/// Change the physics without throwing the state away, so a slider moves the
/// wheel you are already watching rather than starting a new one. Changing the
/// bucket count cannot be done in place and restarts.
#[no_mangle]
pub extern "C" fn set_params(n: u32, q: f64, k: f64, nu: f64, inertia: f64, g: f64, radius: f64, spread: f64) -> u32 {
    let s = st();
    let old_n = s.p.n;
    let p = Params {
        n: (n as usize).clamp(3, 256),
        q: q.max(1e-6),
        k: k.max(1e-4),
        nu: nu.max(1e-6),
        inertia: inertia.max(1e-6),
        g: g.max(1e-6),
        radius: radius.max(1e-3),
        spread: spread.clamp(0.05, 6.0),
    };
    s.p = p;
    s.wheel.p = p;
    s.twin.p = p;
    s.cont.p = p;
    s.lorenz.sigma = p.sigma();
    s.lorenz.rho = p.rho();
    s.lorenz.beta = p.beta();
    if p.n != old_n {
        let (theta, omega) = (s.wheel.theta, s.wheel.omega);
        let carry: f64 = s.wheel.total_mass() / p.n as f64;
        s.wheel = Wheel::new(p);
        s.twin = Wheel::new(p);
        s.wheel.theta = theta;
        s.twin.theta = theta;
        s.wheel.omega = omega;
        s.twin.omega = omega + 1e-9;
        // keep the water, spread evenly — the wheel keeps turning rather than
        // stopping dead every time the slider moves
        s.wheel.mass.iter_mut().for_each(|m| *m = carry);
        s.twin.mass.iter_mut().for_each(|m| *m = carry);
        s.trace.clear();
        s.twin_trace.clear();
        s.lorenz_trace.clear();
        return 1;
    }
    0
}

/// Restart everything from a standing wheel. `delta` is the twin's head start
/// in angular velocity.
#[no_mangle]
pub extern "C" fn reset(omega0: f64, delta: f64) {
    let s = st();
    s.wheel.reset_running(omega0);
    s.twin.reset_running(omega0 + delta);
    s.cont = Continuum::new(s.p);
    s.cont.omega = omega0;
    // The Lorenz run has to start where the wheel starts, and an evenly filled
    // wheel has a₁ = b₁ = 0 — which is X = ω₀/k, Y = 0, Z = ρ. Leaving Z at
    // zero (as an empty struct would) puts the Lorenz solution a long way off
    // and it spends the first minute flying in from nowhere.
    s.lorenz = Lorenz::new(s.p.sigma(), s.p.rho(), s.p.beta());
    s.lorenz.x = omega0 / s.p.k;
    s.lorenz.y = 0.0;
    s.lorenz.z = s.p.rho();
    s.trace.clear();
    s.twin_trace.clear();
    s.lorenz_trace.clear();
    s.sep = delta.abs();
    s.sep_t = 0.0;
    s.since_sample = 0.0;
}

/// Advance by `dt` seconds in `sub` substeps, sampling the traces every
/// `sample` seconds of wheel time.
#[no_mangle]
pub extern "C" fn step(dt: f64, sub: u32, sample: f64) {
    let s = st();
    let sub = sub.clamp(1, 64);
    let h = dt / sub as f64;
    for _ in 0..sub {
        s.wheel.step(h);
        s.twin.step(h);
        s.cont.step(h);
        // the Lorenz system runs in its own dimensionless time, τ = k t
        s.lorenz.step(h * s.p.k);
        s.since_sample += h;
        if s.since_sample >= sample {
            s.since_sample = 0.0;
            let (x, y) = s.wheel.centre_of_mass();
            push(&mut s.trace, x, y);
            let (tx, ty) = s.twin.centre_of_mass();
            push(&mut s.twin_trace, tx, ty);
            let (lx, ly) = wheel::lorenz_to_com(&s.p, s.lorenz.y, s.lorenz.z);
            push(&mut s.lorenz_trace, lx, ly);
        }
    }
    // separation of the twins, in the state space the wheel actually lives in
    let d_om = s.wheel.omega - s.twin.omega;
    let mut d2 = d_om * d_om;
    for i in 0..s.wheel.mass.len() {
        let d = s.wheel.mass[i] - s.twin.mass[i];
        d2 += d * d;
    }
    s.sep = d2.sqrt();
    s.sep_t = s.wheel.t;
}

fn push(v: &mut Vec<f32>, x: f64, y: f64) {
    if v.len() >= TRACE_CAP * 2 { v.drain(0..2); }
    v.push(x as f32);
    v.push(y as f32);
}

// ------------------------------------------------------------- reading out --

#[no_mangle] pub extern "C" fn theta() -> f64 { st().wheel.theta }
#[no_mangle] pub extern "C" fn omega() -> f64 { st().wheel.omega }
#[no_mangle] pub extern "C" fn twin_omega() -> f64 { st().twin.omega }
#[no_mangle] pub extern "C" fn twin_theta() -> f64 { st().twin.theta }
#[no_mangle] pub extern "C" fn elapsed() -> f64 { st().wheel.t }
#[no_mangle] pub extern "C" fn total_mass() -> f64 { st().wheel.total_mass() }
#[no_mangle] pub extern "C" fn n_buckets() -> u32 { st().p.n as u32 }
#[no_mangle] pub extern "C" fn mass_ptr() -> *const f64 { st().wheel.mass.as_ptr() }
#[no_mangle] pub extern "C" fn twin_mass_ptr() -> *const f64 { st().twin.mass.as_ptr() }

#[no_mangle] pub extern "C" fn com_x() -> f64 { st().wheel.centre_of_mass().0 }
#[no_mangle] pub extern "C" fn com_y() -> f64 { st().wheel.centre_of_mass().1 }
#[no_mangle] pub extern "C" fn twin_com_x() -> f64 { st().twin.centre_of_mass().0 }
#[no_mangle] pub extern "C" fn twin_com_y() -> f64 { st().twin.centre_of_mass().1 }

#[no_mangle] pub extern "C" fn trace_ptr() -> *const f32 { st().trace.as_ptr() }
#[no_mangle] pub extern "C" fn trace_len() -> u32 { (st().trace.len() / 2) as u32 }
#[no_mangle] pub extern "C" fn twin_trace_ptr() -> *const f32 { st().twin_trace.as_ptr() }
#[no_mangle] pub extern "C" fn twin_trace_len() -> u32 { (st().twin_trace.len() / 2) as u32 }
#[no_mangle] pub extern "C" fn lorenz_trace_ptr() -> *const f32 { st().lorenz_trace.as_ptr() }
#[no_mangle] pub extern "C" fn lorenz_trace_len() -> u32 { (st().lorenz_trace.len() / 2) as u32 }

/// How far the twin has drifted, and when. The page plots log10 of this: a
/// straight line on that scale is the Lyapunov exponent, drawn by hand.
#[no_mangle] pub extern "C" fn separation() -> f64 { st().sep }

#[no_mangle] pub extern "C" fn sigma() -> f64 { st().p.sigma() }
#[no_mangle] pub extern "C" fn rho() -> f64 { st().p.rho() }
#[no_mangle] pub extern "C" fn beta() -> f64 { st().p.beta() }
#[no_mangle] pub extern "C" fn rho_hopf() -> f64 { st().p.rho_hopf() }
/// 0 still · 1 steady spin · 2 chaotic
#[no_mangle] pub extern "C" fn regime() -> u32 { st().p.regime() }
/// The size of the periodic forcing the finite bucket count adds, as a
/// fraction of the inflow's first harmonic. This is the whole of the word
/// "approximating" in his title.
#[no_mangle] pub extern "C" fn ripple() -> f64 { st().wheel.inflow_ripple() }

/// Lorenz coordinates of the *physical* wheel right now, so the page can show
/// the same trajectory in the space the equations are written in.
#[no_mangle] pub extern "C" fn lorenz_x() -> f64 { st().wheel.omega / st().p.k }
#[no_mangle]
pub extern "C" fn lorenz_y() -> f64 {
    let s = st();
    let (a, _) = moments(&s.wheel);
    -wheel::c_of(&s.p) * a / core::f64::consts::PI
}
#[no_mangle]
pub extern "C" fn lorenz_z() -> f64 {
    let s = st();
    let (_, b) = moments(&s.wheel);
    s.p.rho() - wheel::c_of(&s.p) * b / core::f64::consts::PI
}

fn moments(w: &Wheel) -> (f64, f64) {
    let n = w.mass.len();
    let step = 2.0 * core::f64::consts::PI / n as f64;
    let (mut a, mut b) = (0.0, 0.0);
    for i in 0..n {
        let ang = w.theta + step * i as f64;
        a += w.mass[i] * ang.cos();
        b += w.mass[i] * ang.sin();
    }
    (a, b)
}

#[cfg(test)]
mod tests;
