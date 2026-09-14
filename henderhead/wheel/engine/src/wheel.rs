//! The wheel, the reduction, and the Lorenz system they turn out to be.
//!
//! After Matt Henderson's "Approximating the Lorenz attractor with a chaotic
//! leaky water wheel" (2026-09-13). Unlike his other demos this one has a
//! published derivation behind it — it is the Malkus waterwheel, and Strogatz's
//! *Nonlinear Dynamics and Chaos* §9.1 works it through — so nothing here is
//! guessed from the video. The derivation below is redone in this file's own
//! coordinates and then **checked numerically** in tests.rs against the Lorenz
//! equations, which is the point: the claim "it traces a projection of the
//! familiar attractor" is not an analogy, it is an identity.
//!
//! ## The wheel
//!
//! `n` buckets hang from the rim of a wheel of radius `r`, staying upright as
//! it turns. Water is poured in at the top and every bucket leaks at a rate
//! proportional to what it holds. Bucket `i` sits at lab angle
//! θ_i = θ + 2πi/n, measured anticlockwise from three o'clock, so the top is
//! θ = π/2.
//!
//!   ṁ_i = Q(θ_i) − k m_i
//!   θ̇   = ω
//!   I ω̇ = −ν ω − g r Σ m_i cos θ_i
//!
//! The torque term is the only place the water touches the wheel, and it reads
//! off just one number: the horizontal offset of the water's centre of mass.
//!
//! ## Why it is Lorenz
//!
//! In the continuum limit write the mass per unit angle as a Fourier series.
//! Mode n evolves as ȧ_n = Q_n^c − k a_n − n ω b_n, ḃ_n = Q_n^s − k b_n +
//! n ω a_n — and **only the first harmonic exerts any torque**, because
//! ∫cos(nθ)cos(θ)dθ vanishes for n ≠ 1. So the higher modes are carried along
//! and never answered back to, and the closed system is three equations in
//! (a₁, b₁, ω):
//!
//!   ȧ₁ = −k a₁ − ω b₁
//!   ḃ₁ = q₁ − k b₁ + ω a₁
//!   I ω̇ = −ν ω − π g r a₁
//!
//! Substituting τ = k t, X = ω/k, Y = −c a₁, Z = ρ − c b₁ with c = πgr/(kν)
//! turns those into the Lorenz equations exactly:
//!
//!   X′ = σ(Y − X),  Y′ = ρX − Y − XZ,  Z′ = XY − βZ
//!
//!   σ = ν/(I k),   β = 1,   ρ = π g r q₁ / (ν k²)
//!
//! β = 1 rather than Lorenz's own 8/3 — a waterwheel is a Lorenz system, not
//! *the* Lorenz system, and the attractor it draws is the same shape for it.
//!
//! Two things fall out that the page leans on. The centre of mass of the water
//! is (r π a₁, r π b₁)/M, so **the centre of mass plane is the Lorenz (Y, Z)
//! plane** up to sign and scale — the orange dot really is drawing a projection
//! of the attractor, not something that resembles one. And the total mass obeys
//! Ṁ = ∫Q − kM with no ω in it, so M settles to a constant however wildly the
//! wheel is behaving, which is what keeps that scale factor fixed.
//!
//! ## What "approximating" means
//!
//! A real wheel has finitely many buckets, and that is the whole of the
//! difference. Summing the discrete equations gives
//!
//!   Ȧ = Σ Q_i cos θ_i − k A − ω B,   Ḃ = Σ Q_i sin θ_i − k B + ω A
//!
//! with A = Σ m_i cos θ_i, which is the continuum system except that the two
//! inflow projections are sampled at n points instead of integrated. They
//! therefore wobble with period 2π/n as the wheel turns: **a finite wheel is a
//! Lorenz system with a small periodic forcing**, and the forcing dies away
//! quickly as buckets are added. `inflow_ripple` measures it.

use core::f64::consts::PI;

/// Everything the physical wheel needs. Defaults chosen to sit in the chaotic
/// regime, which is where his video is.
#[derive(Clone, Copy, Debug)]
pub struct Params {
    /// buckets
    pub n: usize,
    /// total inflow, mass per unit time
    pub q: f64,
    /// leak rate: a bucket loses k·m per unit time
    pub k: f64,
    /// rotational damping
    pub nu: f64,
    /// moment of inertia of the wheel itself (held constant, as the derivation
    /// assumes — the water's own contribution is a second-order effect and
    /// including it would break the exact correspondence)
    pub inertia: f64,
    pub g: f64,
    pub radius: f64,
    /// angular width of the stream, in units of the bucket spacing. Narrow is
    /// what the video shows: one bucket at a time under the pipe.
    pub spread: f64,
}

impl Default for Params {
    fn default() -> Self {
        // σ = ν/(Ik) = 10 and ρ ≈ 29, which is past the Hopf threshold of 17.5
        // and so chaotic; the wheel turns at about half a revolution a second,
        // which is roughly the pace of the video. Note σ has to clear β+1 = 2
        // for chaos to be possible at all, and it is the *damping* that buys
        // that — an undamped wheel cannot be chaotic however hard you pour.
        Params { n: 24, q: 1.2, k: 0.2, nu: 10.0, inertia: 5.0, g: 9.81, radius: 1.0, spread: 0.7 }
    }
}

impl Params {
    /// σ = ν/(I k)
    pub fn sigma(&self) -> f64 { self.nu / (self.inertia * self.k) }
    /// β = 1, always. A waterwheel cannot have any other value.
    pub fn beta(&self) -> f64 { 1.0 }
    /// ρ = π g r q₁ / (ν k²), where q₁ is the first sine coefficient of the
    /// inflow — for a stream narrow compared with the wheel, q₁ → q/π.
    pub fn rho(&self) -> f64 {
        PI * self.g * self.radius * self.q1() / (self.nu * self.k * self.k)
    }
    /// The first harmonic of the inflow. A Gaussian stream of angular width s
    /// centred on the top contributes q·exp(−s²/2)/π to the sine term; a
    /// perfectly narrow stream gives q/π.
    pub fn q1(&self) -> f64 {
        let s = self.spread * (2.0 * PI / self.n.max(1) as f64);
        self.q * (-0.5 * s * s).exp() / PI
    }

    /// The Hopf threshold: above this ρ the two steadily-spinning states lose
    /// stability and the wheel starts reversing at unpredictable intervals.
    /// σ(σ+β+3)/(σ−β−1), which needs σ > β+1 to exist at all.
    pub fn rho_hopf(&self) -> f64 {
        let (s, b) = (self.sigma(), self.beta());
        if s <= b + 1.0 { f64::INFINITY } else { s * (s + b + 3.0) / (s - b - 1.0) }
    }

    /// 0 still · 1 steady spin · 2 chaotic. The two thresholds are ρ = 1, where
    /// the motionless wheel gives way to steady rotation, and ρ_Hopf.
    pub fn regime(&self) -> u32 {
        let r = self.rho();
        if r <= 1.0 { 0 } else if r < self.rho_hopf() { 1 } else { 2 }
    }
}

/// A wheel: angle, spin, and what is in each bucket.
#[derive(Clone)]
pub struct Wheel {
    pub p: Params,
    pub theta: f64,
    pub omega: f64,
    pub mass: Vec<f64>,
    pub t: f64,
    /// scratch for the integrator, kept to avoid allocating every step
    k1: Vec<f64>, k2: Vec<f64>, k3: Vec<f64>, k4: Vec<f64>, tmp: Vec<f64>,
}

impl Wheel {
    pub fn new(p: Params) -> Self {
        let n = p.n.clamp(3, 512);
        let mut p = p;
        p.n = n;
        Wheel {
            p, theta: 0.0, omega: 0.0, t: 0.0,
            mass: vec![0.0; n],
            k1: vec![0.0; n], k2: vec![0.0; n], k3: vec![0.0; n], k4: vec![0.0; n], tmp: vec![0.0; n],
        }
    }

    /// Empty the wheel and start it turning at `omega0`.
    pub fn reset(&mut self, omega0: f64) {
        self.theta = 0.0;
        self.omega = omega0;
        self.t = 0.0;
        self.mass.iter_mut().for_each(|m| *m = 0.0);
    }

    /// Start from a wheel that has already been running: every bucket holding
    /// an equal share of the steady total q/k.
    ///
    /// This is what the page uses, and it is not a shortcut. From dry, the
    /// first bucket to fill puts the centre of mass out at the rim, and the
    /// trail's opening move is a huge arc inward that has nothing to do with
    /// the attractor and sits across the picture for the next eight minutes.
    /// An even fill starts the centre of mass at the hub — the right answer for
    /// a balanced wheel — and the trail is the attractor from its first stroke.
    pub fn reset_running(&mut self, omega0: f64) {
        self.reset(omega0);
        let share = self.p.q / (self.p.k * self.p.n as f64);
        self.mass.iter_mut().for_each(|m| *m = share);
    }

    #[inline]
    pub fn angle_of(&self, i: usize) -> f64 {
        self.theta + 2.0 * PI * i as f64 / self.p.n as f64
    }

    /// Inflow into bucket `i` when the wheel sits at `theta`.
    ///
    /// A wrapped Gaussian centred on the top, normalised so the buckets always
    /// receive exactly `q` between them however the wheel happens to be
    /// aligned. Without that normalisation the total inflow would itself
    /// flutter with the bucket spacing, which is a different and much cruder
    /// discretisation error than the one worth showing.
    fn inflow(&self, theta: f64, out: &mut [f64]) {
        let n = self.p.n;
        let step = 2.0 * PI / n as f64;
        let s = (self.p.spread * step).max(1e-6);
        let mut total = 0.0;
        for i in 0..n {
            let a = theta + step * i as f64;
            let d = wrap_pi(a - PI / 2.0);
            let w = (-0.5 * (d / s) * (d / s)).exp();
            out[i] = w;
            total += w;
        }
        if total > 0.0 {
            let scale = self.p.q / total;
            for v in out.iter_mut() { *v *= scale; }
        }
    }

    /// Σ m_i cos θ_i and Σ m_i sin θ_i for a given angle and mass vector — the
    /// water's first moment, and the only thing the wheel's motion depends on.
    fn moments(&self, theta: f64, mass: &[f64]) -> (f64, f64) {
        let step = 2.0 * PI / self.p.n as f64;
        let (mut a, mut b) = (0.0, 0.0);
        for i in 0..self.p.n {
            let ang = theta + step * i as f64;
            a += mass[i] * ang.cos();
            b += mass[i] * ang.sin();
        }
        (a, b)
    }

    /// d/dt of (mass…, theta, omega).
    fn deriv(&self, theta: f64, omega: f64, mass: &[f64], dm: &mut [f64]) -> (f64, f64) {
        self.inflow(theta, dm);
        for i in 0..self.p.n { dm[i] -= self.p.k * mass[i]; }
        let (a, _) = self.moments(theta, mass);
        let domega = (-self.p.nu * omega - self.p.g * self.p.radius * a) / self.p.inertia;
        (omega, domega)
    }

    /// One classical RK4 step. The system is smooth and not stiff, so RK4 at a
    /// few milliseconds is far more accuracy than the picture needs — which
    /// matters, because the whole subject here is how fast small errors grow.
    pub fn step(&mut self, dt: f64) {
        let n = self.p.n;
        let (th, om) = (self.theta, self.omega);

        let mut k1 = core::mem::take(&mut self.k1);
        let mut k2 = core::mem::take(&mut self.k2);
        let mut k3 = core::mem::take(&mut self.k3);
        let mut k4 = core::mem::take(&mut self.k4);
        let mut tmp = core::mem::take(&mut self.tmp);

        let (dth1, dom1) = self.deriv(th, om, &self.mass, &mut k1);
        for i in 0..n { tmp[i] = self.mass[i] + 0.5 * dt * k1[i]; }
        let (dth2, dom2) = self.deriv(th + 0.5 * dt * dth1, om + 0.5 * dt * dom1, &tmp, &mut k2);
        for i in 0..n { tmp[i] = self.mass[i] + 0.5 * dt * k2[i]; }
        let (dth3, dom3) = self.deriv(th + 0.5 * dt * dth2, om + 0.5 * dt * dom2, &tmp, &mut k3);
        for i in 0..n { tmp[i] = self.mass[i] + dt * k3[i]; }
        let (dth4, dom4) = self.deriv(th + dt * dth3, om + dt * dom3, &tmp, &mut k4);

        for i in 0..n {
            self.mass[i] += dt / 6.0 * (k1[i] + 2.0 * k2[i] + 2.0 * k3[i] + k4[i]);
            // a bucket cannot hold a negative amount of water; the leak is
            // proportional so this should never bind, but an aggressive dt
            // could otherwise leave a bucket owing water
            if self.mass[i] < 0.0 { self.mass[i] = 0.0; }
        }
        self.theta += dt / 6.0 * (dth1 + 2.0 * dth2 + 2.0 * dth3 + dth4);
        self.omega += dt / 6.0 * (dom1 + 2.0 * dom2 + 2.0 * dom3 + dom4);
        self.t += dt;

        self.k1 = k1; self.k2 = k2; self.k3 = k3; self.k4 = k4; self.tmp = tmp;
    }

    pub fn total_mass(&self) -> f64 { self.mass.iter().sum() }

    /// The centre of mass of the water, in wheel radii. This is the orange dot.
    pub fn centre_of_mass(&self) -> (f64, f64) {
        let m = self.total_mass();
        if m <= 1e-12 { return (0.0, 0.0); }
        let (a, b) = self.moments(self.theta, &self.mass);
        (self.p.radius * a / m, self.p.radius * b / m)
    }

    /// How far the finite bucket count pushes the inflow's first harmonic away
    /// from the continuum's, as a fraction — the size of the periodic forcing
    /// that makes this an approximation rather than an identity. Measured by
    /// sweeping the wheel through one bucket spacing.
    pub fn inflow_ripple(&self) -> f64 {
        let mut buf = vec![0.0; self.p.n];
        let step = 2.0 * PI / self.p.n as f64;
        let (mut lo_s, mut hi_s) = (f64::INFINITY, f64::NEG_INFINITY);
        let (mut lo_c, mut hi_c) = (f64::INFINITY, f64::NEG_INFINITY);
        for j in 0..64 {
            let th = step * j as f64 / 64.0;
            self.inflow(th, &mut buf);
            let (c, s) = self.moments(th, &buf);
            lo_s = lo_s.min(s); hi_s = hi_s.max(s);
            lo_c = lo_c.min(c); hi_c = hi_c.max(c);
        }
        let mean_s = 0.5 * (lo_s + hi_s);
        if mean_s.abs() < 1e-12 { return 0.0; }
        (0.5 * (hi_s - lo_s) + 0.5 * (hi_c - lo_c)) / mean_s.abs()
    }
}

// --------------------------------------------------------------- continuum --

/// The three-equation reduction: the first harmonic of the water and the spin.
///
/// This is the wheel with infinitely many buckets, and it is *exactly* the
/// Lorenz system — tests.rs integrates this and `Lorenz` side by side and
/// asserts they stay together.
#[derive(Clone, Copy, Debug)]
pub struct Continuum {
    pub p: Params,
    /// first cosine coefficient of the mass distribution
    pub a1: f64,
    /// first sine coefficient
    pub b1: f64,
    pub omega: f64,
    pub t: f64,
}

impl Continuum {
    pub fn new(p: Params) -> Self { Continuum { p, a1: 0.0, b1: 0.0, omega: 0.0, t: 0.0 } }

    fn f(&self, a1: f64, b1: f64, w: f64) -> (f64, f64, f64) {
        (
            -self.p.k * a1 - w * b1,
            self.p.q1() - self.p.k * b1 + w * a1,
            (-self.p.nu * w - PI * self.p.g * self.p.radius * a1) / self.p.inertia,
        )
    }

    pub fn step(&mut self, dt: f64) {
        let (a, b, w) = (self.a1, self.b1, self.omega);
        let (a1, b1, c1) = self.f(a, b, w);
        let (a2, b2, c2) = self.f(a + 0.5 * dt * a1, b + 0.5 * dt * b1, w + 0.5 * dt * c1);
        let (a3, b3, c3) = self.f(a + 0.5 * dt * a2, b + 0.5 * dt * b2, w + 0.5 * dt * c2);
        let (a4, b4, c4) = self.f(a + dt * a3, b + dt * b3, w + dt * c3);
        self.a1 += dt / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
        self.b1 += dt / 6.0 * (b1 + 2.0 * b2 + 2.0 * b3 + b4);
        self.omega += dt / 6.0 * (c1 + 2.0 * c2 + 2.0 * c3 + c4);
        self.t += dt;
    }
}

// ------------------------------------------------------------------ lorenz --

/// The Lorenz system, integrated in its own dimensionless time.
#[derive(Clone, Copy, Debug)]
pub struct Lorenz {
    pub sigma: f64,
    pub rho: f64,
    pub beta: f64,
    pub x: f64,
    pub y: f64,
    pub z: f64,
    pub t: f64,
}

impl Lorenz {
    pub fn new(sigma: f64, rho: f64, beta: f64) -> Self {
        Lorenz { sigma, rho, beta, x: 0.0, y: 0.0, z: 0.0, t: 0.0 }
    }
    fn f(&self, x: f64, y: f64, z: f64) -> (f64, f64, f64) {
        (self.sigma * (y - x), self.rho * x - y - x * z, x * y - self.beta * z)
    }
    pub fn step(&mut self, dt: f64) {
        let (x, y, z) = (self.x, self.y, self.z);
        let (a1, b1, c1) = self.f(x, y, z);
        let (a2, b2, c2) = self.f(x + 0.5 * dt * a1, y + 0.5 * dt * b1, z + 0.5 * dt * c1);
        let (a3, b3, c3) = self.f(x + 0.5 * dt * a2, y + 0.5 * dt * b2, z + 0.5 * dt * c2);
        let (a4, b4, c4) = self.f(x + dt * a3, y + dt * b3, z + dt * c3);
        self.x += dt / 6.0 * (a1 + 2.0 * a2 + 2.0 * a3 + a4);
        self.y += dt / 6.0 * (b1 + 2.0 * b2 + 2.0 * b3 + b4);
        self.z += dt / 6.0 * (c1 + 2.0 * c2 + 2.0 * c3 + c4);
        self.t += dt;
    }
}

/// The change of variables, in both directions. `c = πgr/(kν)` is the scale
/// that turns a first moment into a Lorenz coordinate.
pub fn c_of(p: &Params) -> f64 { PI * p.g * p.radius / (p.k * p.nu) }

/// Wheel state → Lorenz state. `a1`, `b1` are the *continuum* coefficients,
/// which the discrete sums approximate as A ≈ π a₁.
pub fn to_lorenz(p: &Params, omega: f64, a1: f64, b1: f64) -> (f64, f64, f64) {
    let c = c_of(p);
    (omega / p.k, -c * a1, p.rho() - c * b1)
}

/// Lorenz state → the centre of mass the wheel would be showing, in radii.
/// The inverse of the map above, with the steady-state total mass q/k folded
/// in — which is why the picture is stable once the wheel has filled.
pub fn lorenz_to_com(p: &Params, y: f64, z: f64) -> (f64, f64) {
    let c = c_of(p);
    let m = p.q / p.k;
    let a1 = -y / c;
    let b1 = (p.rho() - z) / c;
    (p.radius * PI * a1 / m, p.radius * PI * b1 / m)
}

#[inline]
pub fn wrap_pi(a: f64) -> f64 {
    let two = 2.0 * PI;
    let mut x = (a + PI) % two;
    if x < 0.0 { x += two; }
    x - PI
}
