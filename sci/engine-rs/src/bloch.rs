//! The Bloch equations — Bloch, *Phys Rev* 70:460 (1946) — for the
//! magnetisation a receive coil actually detects.
//!
//! Integration is **exact per step**, not Euler: for a constant off-resonance
//! over an interval, free precession is a rotation about `z` and relaxation is
//! a pair of exponentials, so each step applies those in closed form. Nothing
//! here accumulates integrator error, which matters because the page's claims
//! (a spin echo recovers exactly `exp(−2τ/T₂)`, whatever the field spread) are
//! statements about the *physics*, not about a numerical scheme.
//!
//! RF pulses are modelled as **hard pulses**: instantaneous rotations. Real
//! pulses have duration and shape; the page says so where it matters.
//!
//! Convention: `B₀` along `+z`, magnetisation normalised to `M₀ = 1`, and all
//! signals reported in the **rotating frame** — which is not a mathematical
//! convenience but a description of the hardware, since the receiver mixes the
//! Larmor-frequency voltage down to baseband before digitising it.

/// One isochromat: a packet of spins sharing an off-resonance.
#[derive(Clone, Copy, Debug)]
pub struct Spin {
    /// Magnetisation, normalised so that thermal equilibrium is `[0, 0, 1]`.
    pub m: [f64; 3],
    /// Longitudinal relaxation time, seconds.
    pub t1: f64,
    /// Transverse relaxation time, seconds. Irreversible; distinct from the
    /// reversible dephasing produced by `df`.
    pub t2: f64,
    /// Off-resonance in hertz — from B₀ inhomogeneity, from susceptibility, or
    /// from an applied gradient.
    pub df: f64,
    /// Weight in the ensemble sum (spin density × coil sensitivity).
    pub w: f64,
}

impl Spin {
    pub fn new(t1: f64, t2: f64, df: f64) -> Self {
        Spin {
            m: [0.0, 0.0, 1.0],
            t1,
            t2,
            df,
            w: 1.0,
        }
    }

    /// Free precession plus relaxation for `dt` seconds. Exact.
    pub fn evolve(&mut self, dt: f64) {
        let th = 2.0 * std::f64::consts::PI * self.df * dt;
        let (s, c) = th.sin_cos();
        let (mx, my) = (self.m[0], self.m[1]);
        let e2 = (-dt / self.t2).exp();
        let e1 = (-dt / self.t1).exp();
        self.m[0] = (mx * c - my * s) * e2;
        self.m[1] = (mx * s + my * c) * e2;
        self.m[2] = 1.0 + (self.m[2] - 1.0) * e1;
    }

    /// A hard RF pulse: rotate `M` by `flip` radians about the axis lying at
    /// angle `phase` in the transverse plane. Rodrigues' formula.
    pub fn pulse(&mut self, flip: f64, phase: f64) {
        let k = [phase.cos(), phase.sin(), 0.0];
        let (s, c) = flip.sin_cos();
        let m = self.m;
        let kdm = k[0] * m[0] + k[1] * m[1] + k[2] * m[2];
        let kxm = [
            k[1] * m[2] - k[2] * m[1],
            k[2] * m[0] - k[0] * m[2],
            k[0] * m[1] - k[1] * m[0],
        ];
        for i in 0..3 {
            self.m[i] = m[i] * c + kxm[i] * s + k[i] * kdm * (1.0 - c);
        }
    }
}

/// An ensemble of isochromats spanning a spread of off-resonances — which is
/// what any real voxel is.
#[derive(Clone, Debug)]
pub struct Ensemble {
    pub spins: Vec<Spin>,
}

impl Ensemble {
    /// `n` isochromats with a Lorentzian spread of off-resonance of half-width
    /// `spread_hz`, sampled evenly in the Cauchy quantile so that the resulting
    /// free-induction decay is a clean exponential with
    /// `1/T₂* = 1/T₂ + 2π·spread`.
    ///
    /// The Lorentzian is the distribution that makes T₂* exactly exponential;
    /// real inhomogeneity is not Lorentzian, and real FIDs are correspondingly
    /// not quite exponential.
    pub fn lorentzian(n: usize, t1: f64, t2: f64, spread_hz: f64) -> Self {
        let n = n.max(1);
        let mut spins = Vec::with_capacity(n);
        for k in 0..n {
            // Evenly spaced quantiles, endpoints excluded (they are at ±∞).
            let u = (k as f64 + 0.5) / (n as f64);
            let df = spread_hz * (std::f64::consts::PI * (u - 0.5)).tan();
            let mut s = Spin::new(t1, t2, df);
            s.w = 1.0 / n as f64;
            spins.push(s);
        }
        Ensemble { spins }
    }

    /// `n` isochromats laid out in space along a gradient: position `x` from
    /// `-half_fov` to `+half_fov`, off-resonance `γ̄·G·x`. Used for the
    /// gradient-echo and encoding demonstrations.
    pub fn along_gradient(n: usize, t1: f64, t2: f64, g_hz_per_m: f64, half_fov: f64) -> Self {
        let n = n.max(1);
        let mut spins = Vec::with_capacity(n);
        for k in 0..n {
            let x = -half_fov + 2.0 * half_fov * (k as f64 + 0.5) / (n as f64);
            let mut s = Spin::new(t1, t2, g_hz_per_m * x);
            s.w = 1.0 / n as f64;
            spins.push(s);
        }
        Ensemble { spins }
    }

    pub fn equilibrium(&mut self) {
        for s in &mut self.spins {
            s.m = [0.0, 0.0, 1.0];
        }
    }

    pub fn pulse_deg(&mut self, flip_deg: f64, phase_deg: f64) {
        let f = flip_deg.to_radians();
        let p = phase_deg.to_radians();
        for s in &mut self.spins {
            s.pulse(f, p);
        }
    }

    pub fn evolve(&mut self, dt: f64) {
        for s in &mut self.spins {
            s.evolve(dt);
        }
    }

    /// Weighted transverse magnetisation `(Mx, My)` — the quantity that, by
    /// reciprocity, induces the EMF in the coil.
    pub fn signal(&self) -> (f64, f64) {
        self.spins.iter().fold((0.0, 0.0), |(x, y), s| {
            (x + s.w * s.m[0], y + s.w * s.m[1])
        })
    }

    pub fn magnitude(&self) -> f64 {
        let (x, y) = self.signal();
        (x * x + y * y).sqrt()
    }

    pub fn mz(&self) -> f64 {
        self.spins.iter().map(|s| s.w * s.m[2]).sum()
    }
}

/// A free-induction decay after a 90° pulse: `steps` samples spaced `dt`.
///
/// Returns interleaved `[re, im, re, im, …]` in the rotating frame — i.e. the
/// demodulated receiver output, which is what a scanner writes to k-space.
pub fn fid(t1: f64, t2: f64, spread_hz: f64, dt: f64, steps: usize, n_iso: usize) -> Vec<f32> {
    let mut e = Ensemble::lorentzian(n_iso, t1, t2, spread_hz);
    e.pulse_deg(90.0, 0.0);
    let mut out = Vec::with_capacity(steps * 2);
    for _ in 0..steps {
        let (x, y) = e.signal();
        out.push(x as f32);
        out.push(y as f32);
        e.evolve(dt);
    }
    out
}

/// A Hahn spin echo — Hahn, *Phys Rev* 80:580 (1950): 90°, wait `tau`, 180°,
/// wait, and the dephasing undoes itself at `2τ`.
///
/// The point the page makes with this: the FID envelope decays at `T₂*`, but
/// the echo comes back at `exp(−2τ/T₂)`, *independent of how bad the field
/// inhomogeneity is*. Reversible dephasing is not loss.
pub fn spin_echo(
    t1: f64,
    t2: f64,
    spread_hz: f64,
    tau: f64,
    dt: f64,
    steps: usize,
    n_iso: usize,
) -> Vec<f32> {
    let mut e = Ensemble::lorentzian(n_iso, t1, t2, spread_hz);
    e.pulse_deg(90.0, 0.0);
    let mut out = Vec::with_capacity(steps * 2);
    let mut t = 0.0;
    let mut refocused = false;
    for _ in 0..steps {
        if !refocused && t >= tau {
            // 180° about y refocuses phase accumulated about z.
            e.pulse_deg(180.0, 90.0);
            refocused = true;
        }
        let (x, y) = e.signal();
        out.push(x as f32);
        out.push(y as f32);
        e.evolve(dt);
        t += dt;
    }
    out
}
