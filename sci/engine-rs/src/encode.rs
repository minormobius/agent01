//! Spatial encoding: how one wire's voltage becomes a picture.
//!
//! The coil has no spatial resolution — [`crate::coil`] is the argument for
//! that. All of it comes from making precession frequency depend on position:
//! switch on a gradient `G` and a spin at `x` runs at `γ̄·G·x`, so the voltage
//! the coil induces is
//!
//! ```text
//! S(t) = ∫ ρ(r) · exp(−2πi k(t)·r) dr,      k(t) = γ̄ ∫₀ᵗ G(τ) dτ
//! ```
//!
//! which is the Fourier transform of the object, sampled at whatever point
//! `k(t)` the gradients have driven you to. The gradients are a **steering
//! wheel for k-space** — Twieg, *Med Phys* 10:610–621 (1983); Ljunggren,
//! *J Magn Reson* 54:338–343 (1983). Reconstruction is then an inverse Fourier
//! transform and nothing else.
//!
//! Two consequences that this module exists to make measurable:
//!
//! * **`Δk` sets the field of view** (`FOV = 1/Δk`) and **`k_max` sets the
//!   resolution** (`Δx = 1/2k_max`). Sample too coarsely and the object wraps;
//!   stop too early and it blurs. Neither is a reconstruction failure — both
//!   are the sampling theorem.
//! * **When you visit a point of k-space matters, not just whether you do.**
//!   Off-resonance and T₂* act through the *time* at which each sample is
//!   taken, so the same k-space coverage gives a clean image or a distorted one
//!   depending on the order you collect it in. This is the whole difference
//!   between spin-warp and EPI, and it is why EPI images of the head are bent.

use crate::fft::{fft2, fftshift2};
use crate::phantom::Phantom;

/// How k-space gets traversed.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Trajectory {
    /// Spin-warp: one excitation per line, each line read left to right —
    /// Edelstein et al., *Phys Med Biol* 25:751 (1980). Slow, and almost
    /// immune to off-resonance in the phase-encode direction because the clock
    /// restarts at every excitation.
    SpinWarp,
    /// Single-shot EPI: one excitation, all of k-space in one boustrophedon
    /// sweep — Mansfield, *J Phys C* 10:L55 (1977). Milliseconds instead of
    /// minutes, and the clock never restarts, which is exactly why it distorts.
    Epi,
    /// Radial spokes through the origin, gridded onto the Cartesian grid.
    /// Oversamples the centre, undersamples the edge, and fails gracefully:
    /// streaks rather than coherent wrap.
    Radial,
}

/// Timing and physics of the readout.
#[derive(Clone, Copy, Debug)]
pub struct Timing {
    /// Seconds between readout samples.
    pub dwell: f64,
    /// T₂* in seconds — the decay that happens *during* the acquisition.
    pub t2star: f64,
    /// A uniform off-resonance in hertz (fat, a bad shim, a metal implant).
    pub off_res: f64,
}

/// A scanner: an object, a matrix size, a field of view.
pub struct Scanner {
    pub n: usize,
    /// Field of view, metres.
    pub fov: f64,
    /// The phantom's unit disc maps to this radius, metres.
    pub object_radius: f64,
    pub phantom: Phantom,
    /// k-space, `n × n` complex interleaved, k = 0 at the centre of the array.
    pub k: Vec<f64>,
    /// Which samples were actually acquired.
    pub acquired: Vec<u8>,
    /// The order they were acquired in, `-1` for never. This is the thing an
    /// animation needs and a still image throws away: k-space is not filled at
    /// once, and which parts arrive first is what the trajectory *is*.
    pub order: Vec<i32>,
}

impl Scanner {
    pub fn new(n: usize, fov: f64, object_radius: f64, phantom: Phantom) -> Self {
        Scanner {
            n,
            fov,
            object_radius,
            phantom,
            k: vec![0.0; 2 * n * n],
            acquired: vec![0; n * n],
            order: vec![-1; n * n],
        }
    }

    /// Spacing of k-space samples, per metre. `FOV = 1/Δk`.
    pub fn dk(&self) -> f64 {
        1.0 / self.fov
    }

    /// Highest spatial frequency sampled. Resolution is `1/(2·k_max)`.
    pub fn k_max(&self) -> f64 {
        self.n as f64 / (2.0 * self.fov)
    }

    /// Nominal pixel size, metres.
    pub fn pixel(&self) -> f64 {
        self.fov / self.n as f64
    }

    /// One sample of the encoding equation, exactly — no grid, no inverse
    /// crime. `(ix, iy)` index the k grid; the physical k is
    /// `((ix − n/2)·Δk, (iy − n/2)·Δk)`.
    fn sample(&self, ix: usize, iy: usize) -> (f64, f64) {
        let h = self.n as f64 / 2.0;
        let kx = (ix as f64 - h) * self.dk();
        let ky = (iy as f64 - h) * self.dk();
        let r = self.object_radius;
        // Change of variables from the phantom's unit disc to metres.
        let (re, im) = self.phantom.k_value(kx * r, ky * r);
        (re * r * r, im * r * r)
    }

    /// Acquire, filling `k` and `acquired`.
    ///
    /// `undersample` keeps every R-th phase-encode line (R = 1 acquires all).
    /// Skipped lines are left at zero, which is what a scanner's raw array
    /// looks like before parallel-imaging reconstruction fills them in.
    pub fn acquire(&mut self, traj: Trajectory, t: Timing, undersample: usize) {
        let n = self.n;
        let r_step = undersample.max(1);
        self.k.iter_mut().for_each(|v| *v = 0.0);
        self.acquired.iter_mut().for_each(|v| *v = 0);
        self.order.iter_mut().for_each(|v| *v = -1);
        let mut step_no: i32 = 0;

        match traj {
            Trajectory::SpinWarp | Trajectory::Epi => {
                let esp = n as f64 * t.dwell; // echo spacing: one line's worth
                let half = n as f64 / 2.0;
                // An accelerated EPI train has one echo per ACQUIRED line: the
                // skipped lines cost no time. So the clock advances with the
                // line counter, not with the k-space row index — otherwise a
                // skipped line would be charged for anyway and the distortion
                // would come out R× too large.
                let lines_half = (n / r_step) as f64 / 2.0;
                let mut line = 0usize; // counts only the lines actually played
                for row in (0..n).step_by(r_step) {
                    for s in 0..n {
                        // EPI reverses alternate lines; spin-warp always reads
                        // in the same direction because it re-excites.
                        let col = if traj == Trajectory::Epi && line % 2 == 1 {
                            n - 1 - s
                        } else {
                            s
                        };
                        // Time of this sample relative to the echo. Spin-warp's
                        // clock restarts every line; EPI's runs on and on.
                        let t_rel = match traj {
                            Trajectory::SpinWarp => (col as f64 - half) * t.dwell,
                            _ => (line as f64 - lines_half) * esp + (col as f64 - half) * t.dwell,
                        };
                        let (mut re, mut im) = self.sample(col, row);
                        let decay = (-t_rel / t.t2star).exp();
                        let ph = 2.0 * std::f64::consts::PI * t.off_res * t_rel;
                        let (sp, cp) = ph.sin_cos();
                        let (r2, i2) = (re * cp - im * sp, re * sp + im * cp);
                        re = r2 * decay;
                        im = i2 * decay;
                        let idx = row * n + col;
                        self.k[2 * idx] = re;
                        self.k[2 * idx + 1] = im;
                        self.acquired[idx] = 1;
                        self.order[idx] = step_no;
                        step_no += 1;
                    }
                    line += 1;
                }
            }
            Trajectory::Radial => {
                // Spokes through the origin, nearest-neighbour gridded. Real
                // scanners use a Kaiser–Bessel kernel and proper density
                // compensation; this is the crude version, and its extra
                // blurring is the price of that shortcut, not physics.
                let spokes = (n / r_step).max(1);
                let half = n as f64 / 2.0;
                let mut acc = vec![0.0f64; 2 * n * n];
                let mut hits = vec![0.0f64; n * n];
                for sp_i in 0..spokes {
                    let ang = std::f64::consts::PI * sp_i as f64 / spokes as f64;
                    let (sa, ca) = ang.sin_cos();
                    for s in 0..n {
                        let rad = s as f64 - half;
                        let ix = (half + rad * ca).round();
                        let iy = (half + rad * sa).round();
                        if ix < 0.0 || iy < 0.0 || ix >= n as f64 || iy >= n as f64 {
                            continue;
                        }
                        let (ix, iy) = (ix as usize, iy as usize);
                        let t_rel = rad * t.dwell; // each spoke re-excites
                        let (re, im) = self.sample(ix, iy);
                        let decay = (-t_rel / t.t2star).exp();
                        let ph = 2.0 * std::f64::consts::PI * t.off_res * t_rel;
                        let (spp, cpp) = ph.sin_cos();
                        let idx = iy * n + ix;
                        acc[2 * idx] += (re * cpp - im * spp) * decay;
                        acc[2 * idx + 1] += (re * spp + im * cpp) * decay;
                        if hits[idx] == 0.0 {
                            self.order[idx] = step_no;
                        }
                        hits[idx] += 1.0;
                        step_no += 1;
                    }
                }
                for idx in 0..n * n {
                    if hits[idx] > 0.0 {
                        self.k[2 * idx] = acc[2 * idx] / hits[idx];
                        self.k[2 * idx + 1] = acc[2 * idx + 1] / hits[idx];
                        self.acquired[idx] = 1;
                    }
                }
            }
        }
    }

    /// Reconstruct: inverse Fourier transform, magnitude. `mask` (if given)
    /// zeroes k-space samples before transforming — which is how the page lets
    /// you delete parts of k-space and watch what each part was carrying.
    pub fn reconstruct(&self, mask: Option<&[u8]>) -> Vec<f32> {
        let n = self.n;
        let mut buf = self.k.clone();
        if let Some(m) = mask {
            for idx in 0..n * n {
                if m.get(idx).copied().unwrap_or(1) == 0 {
                    buf[2 * idx] = 0.0;
                    buf[2 * idx + 1] = 0.0;
                }
            }
        }
        // The DFT approximates ∫S(k)e^{2πik·r}dk, so it needs the Δk² of the
        // Riemann sum and the n² the inverse FFT divides out.
        let scale = (n as f64 * self.dk()).powi(2);
        fftshift2(&mut buf, n);
        fft2(&mut buf, n, true);
        fftshift2(&mut buf, n);
        (0..n * n)
            .map(|i| (buf[2 * i].hypot(buf[2 * i + 1]) * scale) as f32)
            .collect()
    }

    /// A mask keeping only the first `frac` of the acquisition — for watching
    /// the image assemble as k-space fills, in the order the scanner really
    /// fills it.
    pub fn progress_mask(&self, frac: f64) -> Vec<u8> {
        let total = self.order.iter().copied().max().unwrap_or(0).max(0) as f64;
        let cut = (frac.clamp(0.0, 1.0) * total).round() as i32;
        self.order
            .iter()
            .map(|&o| if o >= 0 && o <= cut { 1 } else { 0 })
            .collect()
    }

    /// How long this acquisition takes, in seconds. The number that decides
    /// whether a sequence is usable on a breath-hold or a moving patient.
    ///
    /// Spin-warp pays a full repetition time per line and EPI pays one echo
    /// spacing per line, which is the ~three-orders-of-magnitude gap that made
    /// functional and diffusion imaging possible.
    pub fn acquisition_seconds(&self, traj: Trajectory, t: Timing, undersample: usize, tr: f64) -> f64 {
        let lines = (self.n / undersample.max(1)) as f64;
        match traj {
            Trajectory::SpinWarp => lines * tr,
            Trajectory::Epi => lines * self.n as f64 * t.dwell,
            Trajectory::Radial => lines * tr,
        }
    }

    /// The object as it really is, sampled on the reconstruction grid — the
    /// thing the reconstruction is trying to be.
    pub fn truth(&self) -> Vec<f32> {
        let n = self.n;
        let px = self.pixel();
        let h = n as f64 / 2.0;
        let mut out = Vec::with_capacity(n * n);
        for iy in 0..n {
            for ix in 0..n {
                // Pixel j sits at (j − n/2)·Δx — the same convention the k
                // grid uses, k_i = (i − n/2)·Δk, which is what makes the
                // shift/transform/shift pair land a point object exactly on a
                // pixel centre. Adding a half-pixel here would silently bias
                // every position this module reports.
                let x = (ix as f64 - h) * px / self.object_radius;
                let y = (iy as f64 - h) * px / self.object_radius;
                out.push(self.phantom.density(x, y) as f32);
            }
        }
        out
    }

    /// Intensity-weighted centroid of a reconstruction, in pixels from the
    /// centre. The tests measure geometric distortion with this.
    pub fn centroid(img: &[f32], n: usize) -> (f64, f64) {
        let h = n as f64 / 2.0;
        let (mut sx, mut sy, mut s) = (0.0, 0.0, 0.0);
        for iy in 0..n {
            for ix in 0..n {
                let w = img[iy * n + ix] as f64;
                sx += w * (ix as f64 - h);
                sy += w * (iy as f64 - h);
                s += w;
            }
        }
        if s == 0.0 {
            (0.0, 0.0)
        } else {
            (sx / s, sy / s)
        }
    }
}

/// How far image `b` has slid along y relative to image `a`, in pixels,
/// measured by circular cross-correlation of their row profiles.
///
/// A centroid cannot do this job. Once the shift is big enough, the image
/// slides off one edge of the field of view and reappears at the other — which
/// is not a bug in the simulation but a property of a Fourier reconstruction,
/// whose output is periodic. A *circular* cross-correlation measures exactly
/// that periodic shift, so it stays correct where a centroid silently
/// understates. (It is also why the answer is only ever defined modulo the
/// field of view.)
///
/// Sub-pixel refinement is a parabolic fit through the peak and its neighbours.
pub fn shift_along_y(a: &[f32], b: &[f32], n: usize) -> f64 {
    let profile = |img: &[f32]| -> Vec<f64> {
        (0..n)
            .map(|y| (0..n).map(|x| img[y * n + x] as f64).sum())
            .collect()
    };
    let (pa, pb) = (profile(a), profile(b));
    let mean = |p: &[f64]| p.iter().sum::<f64>() / n as f64;
    let (ma, mb) = (mean(&pa), mean(&pb));
    let corr: Vec<f64> = (0..n)
        .map(|lag| {
            (0..n)
                .map(|y| (pa[y] - ma) * (pb[(y + lag) % n] - mb))
                .sum()
        })
        .collect();
    let mut best = 0usize;
    for l in 1..n {
        if corr[l] > corr[best] {
            best = l;
        }
    }
    // Parabolic sub-pixel peak, with wrap-around neighbours.
    let (l, r) = (corr[(best + n - 1) % n], corr[(best + 1) % n]);
    let denom = l - 2.0 * corr[best] + r;
    let delta = if denom.abs() > 1e-12 { 0.5 * (l - r) / denom } else { 0.0 };
    let lag = best as f64 + delta;
    // Report signed, in (−n/2, n/2].
    if lag > n as f64 / 2.0 {
        lag - n as f64
    } else {
        lag
    }
}

/// The pixel shift a uniform off-resonance produces in single-shot EPI.
///
/// The phase-encode direction is sampled at one point per **echo spacing**, so
/// its effective bandwidth is `1/(N·esp)` hertz per pixel — thousands of times
/// narrower than the readout direction's. A `Δf` therefore displaces the image
/// by `Δf · N · esp` pixels along the phase-encode axis. At 3 T, fat is about
/// 440 Hz off water, which is why fat lands in a different place from the
/// anatomy it belongs to in an EPI image.
///
/// Accelerating by `R` skips `R−1` of every `R` lines, so the echo train is
/// `R×` shorter and the distortion shrinks in proportion — one of the reasons
/// parallel imaging is used on EPI even when the scan is already fast enough.
///
/// `tests.rs` checks this against a reconstruction's measured centroid, at
/// R = 1 and R = 2.
pub fn epi_shift_pixels(off_res_hz: f64, n: usize, echo_spacing: f64, undersample: usize) -> f64 {
    off_res_hz * n as f64 * echo_spacing / undersample.max(1) as f64
}
