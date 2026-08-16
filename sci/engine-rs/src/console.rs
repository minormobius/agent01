//! All together now: the four parts as one scan.
//!
//! Each page of the series isolates a piece of the instrument. This module puts
//! them back together, because the thing they compose into is not four
//! independent effects — it is **one image, and one number that ties them**:
//!
//! ```text
//! SNR  ∝  B₀²  ·  voxel volume  ·  √(total sampling time)  ·  coil sensitivity
//!         ↑        ↑                ↑                          ↑
//!      part one   part two       part two                  part one
//! ```
//!
//! …and the brightness of each tissue in that image is part three, while the
//! price of the timing that sets `√t` is part four. Turn any knob and the
//! others move.
//!
//! That is the standard relation, and this module is arranged so that the law
//! and the simulation *derive* it independently: the law is arithmetic on the
//! protocol, while the simulation adds noise at the receiver and lets the
//! reconstruction propagate it. `tests.rs` asserts the two agree in a
//! reconstructed image, which is a much stronger claim than either alone.
//!
//! * **`B₀²`** — polarisation × Faraday's law, from [`crate::physics`]. The
//!   sensor is a coil, so it pays twice for field strength.
//! * **voxel volume** — a bigger voxel holds more spins. Resolution is bought
//!   with signal, always.
//! * **`√(sampling time)`** — thermal noise is white, so averaging `N` samples
//!   improves SNR by `√N`. This is why a long scan is a quiet one, and why the
//!   fast sequences of [`crate::encode`] are noisy.
//! * **coil sensitivity** — [`crate::coil`], via reciprocity.
//!
//! ## Noise is added where it happens
//!
//! Thermal noise enters at the **receiver**, before reconstruction, so it is
//! added to k-space as complex Gaussian — not painted onto the image
//! afterwards. Two things follow that a post-hoc noise overlay gets wrong: the
//! noise is spatially white after the transform *regardless of the trajectory*,
//! and the magnitude image's noise is **Rician**, not Gaussian, because
//! `|a + ib|` of zero-mean Gaussians has a positive mean.
//!
//! That is why **the background of an MR image is not black**: with no signal at
//! all, the expected pixel value is `σ√(π/2) ≈ 1.253σ`. Radiologists read
//! around it constantly and it is a direct consequence of taking a magnitude.
//! `tests.rs` measures it.

use crate::encode::{Scanner, Timing, Trajectory};
use crate::phantom::Phantom;

/// A small deterministic generator, so an image is reproducible from its
/// settings — PCG-XSH-RR, O'Neill 2014. No dependencies, and no `rand`.
pub struct Rng {
    state: u64,
    inc: u64,
}

impl Rng {
    pub fn new(seed: u64) -> Self {
        let mut r = Rng {
            state: 0,
            inc: (seed << 1) | 1,
        };
        r.next_u32();
        r.state = r.state.wrapping_add(seed);
        r.next_u32();
        r
    }

    pub fn next_u32(&mut self) -> u32 {
        let old = self.state;
        self.state = old
            .wrapping_mul(6_364_136_223_846_793_005)
            .wrapping_add(self.inc);
        let xorshifted = (((old >> 18) ^ old) >> 27) as u32;
        let rot = (old >> 59) as u32;
        xorshifted.rotate_right(rot)
    }

    /// Uniform in (0, 1).
    pub fn next_f64(&mut self) -> f64 {
        (self.next_u32() as f64 + 0.5) / 4_294_967_296.0
    }

    /// A pair of independent standard normals, Box–Muller.
    pub fn normal_pair(&mut self) -> (f64, f64) {
        let u1 = self.next_f64();
        let u2 = self.next_f64();
        let r = (-2.0 * u1.ln()).sqrt();
        let th = 2.0 * std::f64::consts::PI * u2;
        (r * th.cos(), r * th.sin())
    }
}

/// Everything the console can set. One struct so that the scaling law below can
/// see every term at once — which is the point of the page.
#[derive(Clone, Copy, Debug)]
pub struct Protocol {
    /// Field strength, tesla — part one.
    pub b0: f64,
    /// Matrix size (power of two) — part two.
    pub n: usize,
    /// Field of view, metres — part two.
    pub fov: f64,
    /// Slice thickness, metres. Not otherwise simulated; it multiplies the
    /// voxel volume and so the signal.
    pub slice: f64,
    /// Seconds per readout sample — part two and part four.
    pub dwell: f64,
    /// Signal averages.
    pub averages: usize,
    /// Phase-encode acceleration — part two.
    pub undersample: usize,
    pub trajectory: Trajectory,
    /// Repetition time, seconds — part three.
    pub tr: f64,
    /// Echo time, seconds — part three.
    pub te: f64,
    /// Off-resonance, hertz — part two's distortion.
    pub off_res: f64,
    pub t2star: f64,
    /// Receive sensitivity at isocentre, relative to a reference coil — part
    /// one. The console gets this from an actual `Coil`.
    pub coil_sensitivity: f64,
}

/// The reference protocol every SNR on the console is quoted against: 1.5 T,
/// 256 mm field of view at 128², 5 mm slices, one average, 4 µs dwell, and a
/// coil of unit sensitivity. Nothing is special about it except that a ratio
/// needs a denominator.
pub const REFERENCE: Protocol = Protocol {
    b0: 1.5,
    n: 128,
    fov: 0.256,
    slice: 0.005,
    dwell: 4e-6,
    averages: 1,
    undersample: 1,
    trajectory: Trajectory::SpinWarp,
    tr: 0.5,
    te: 0.010,
    off_res: 0.0,
    t2star: 1e6,
    coil_sensitivity: 1.0,
};

impl Protocol {
    /// Voxel volume, cubic metres.
    pub fn voxel_volume(&self) -> f64 {
        let px = self.fov / self.n as f64;
        px * px * self.slice
    }

    /// Time spent sampling signal, seconds — the `√t` term of the law.
    ///
    /// Computed from the **full** matrix, deliberately. Acceleration is not in
    /// here, and that is not an oversight: skipping lines and reconstructing
    /// with zeros gives you an image with *less* noise and *more* aliasing, so
    /// its SNR is not comparable. The familiar `√R` penalty of parallel imaging
    /// appears when you **unfold** the aliasing (SENSE's g-factor), which this
    /// console does not do — part two shows you the folding instead.
    pub fn sampling_seconds(&self) -> f64 {
        self.n as f64 * self.n as f64 * self.dwell * self.averages as f64
    }

    /// Wall-clock duration of the scan, seconds.
    pub fn scan_seconds(&self) -> f64 {
        let lines = (self.n / self.undersample.max(1)) as f64;
        match self.trajectory {
            Trajectory::Epi => lines * self.n as f64 * self.dwell * self.averages as f64,
            _ => lines * self.tr * self.averages as f64,
        }
    }

    /// **The scaling law**, relative to [`REFERENCE`]. Every factor is a link
    /// to one of the four parts; see the module docs.
    pub fn relative_snr(&self) -> f64 {
        let f = |p: &Protocol| {
            crate::physics::relative_faraday_emf(p.b0)
                * p.voxel_volume()
                * p.sampling_seconds().sqrt()
                * p.coil_sensitivity
        };
        f(self) / f(&REFERENCE)
    }
}

/// The result of a scan: the image, and the numbers that explain it.
pub struct Scan {
    pub image: Vec<f32>,
    pub n: usize,
    /// Predicted SNR relative to [`REFERENCE`], from the scaling law.
    pub relative_snr: f64,
    /// SNR actually measured in the reconstructed image: mean signal inside the
    /// object over the standard deviation of the noise-only background.
    pub measured_snr: f64,
    pub scan_seconds: f64,
}

/// Run a full acquisition: weight the phantom by what each tissue does under
/// this schedule, sample k-space along the trajectory, add receiver noise, and
/// reconstruct.
///
/// `reference_snr` anchors the noise: it is the image SNR the [`REFERENCE`]
/// protocol would achieve on a unit-density object. Everything else follows
/// from the physics, so a knob that the scaling law says costs you a factor of
/// two costs you a factor of two in the picture.
///
/// The per-k-sample noise needed for that is exact rather than tuned. An
/// inverse DFT with a `1/N²` normalisation turns per-sample noise `σ_k` into
/// per-pixel noise `σ_k/N`, and [`Scanner::reconstruct`] then multiplies by
/// `(N·Δk)²`, so `σ_image = σ_k · N · Δk² = σ_k · N / FOV²`. Invert that for the
/// reference protocol and you have the constant.
pub fn scan(p: Protocol, phantom: Phantom, reference_snr: f64, seed: u64) -> Scan {
    let mut sc = Scanner::new(p.n, p.fov, 0.10, phantom);
    sc.acquire(
        p.trajectory,
        Timing {
            dwell: p.dwell,
            t2star: p.t2star,
            off_res: p.off_res,
        },
        p.undersample,
    );

    // Scale the acquired signal by the things that genuinely change the signal
    // per unit volume: field strength and coil sensitivity, plus slice
    // thickness, which is the one dimension of the voxel this 2D simulation
    // does not represent geometrically.
    //
    // The in-plane voxel size is deliberately NOT applied here. A
    // reconstruction returns spin *density*, and density does not depend on how
    // finely you sample it — the resolution/SNR trade shows up entirely in the
    // noise, because `reconstruct` scales by `(N·Δk)²` and so amplifies
    // per-sample noise by `N/FOV²`. Applying it to the signal as well would
    // count it twice, which is exactly the bug a test caught here.
    let gain = crate::physics::relative_faraday_emf(p.b0)
        * (p.slice / REFERENCE.slice)
        * p.coil_sensitivity;
    for v in sc.k.iter_mut() {
        *v *= gain;
    }

    // Thermal noise, added at the receiver, per acquired sample. The receiver
    // does not know or care what the rest of the protocol is doing, so this is
    // the ONE quantity that does not scale — every SNR change on the console
    // comes from the signal side or from how many samples get averaged.
    let base_sigma = REFERENCE.fov * REFERENCE.fov
        / (REFERENCE.n as f64 * reference_snr.max(1e-9));
    // Per-sample noise depends only on the receiver bandwidth and on how many
    // times you measured: σ ∝ √(bandwidth) = √(1/dwell), and averaging M scans
    // divides it by √M. Everything else in the law reaches the image through
    // the reconstruction's own scaling.
    let sigma = base_sigma * (REFERENCE.dwell / p.dwell).sqrt()
        / (p.averages.max(1) as f64).sqrt();
    let mut rng = Rng::new(seed);
    for idx in 0..p.n * p.n {
        if sc.acquired[idx] == 0 {
            continue;
        }
        let (a, b) = rng.normal_pair();
        sc.k[2 * idx] += a * sigma;
        sc.k[2 * idx + 1] += b * sigma;
    }

    let image = sc.reconstruct(None);

    // Measure what we got: signal from the middle of the object, noise from a
    // corner where the phantom is not.
    let n = p.n;
    let mut sig = 0.0f64;
    let mut sig_n = 0.0f64;
    for iy in (n / 2 - 6)..(n / 2 + 6) {
        for ix in (n / 2 - 6)..(n / 2 + 6) {
            sig += image[iy * n + ix] as f64;
            sig_n += 1.0;
        }
    }
    let (mut s1, mut s2, mut bn) = (0.0f64, 0.0f64, 0.0f64);
    for iy in 2..(n / 10).max(4) {
        for ix in 2..(n / 10).max(4) {
            let v = image[iy * n + ix] as f64;
            s1 += v;
            s2 += v * v;
            bn += 1.0;
        }
    }
    let mean_bg = s1 / bn.max(1.0);
    let var_bg = (s2 / bn.max(1.0) - mean_bg * mean_bg).max(0.0);

    Scan {
        relative_snr: p.relative_snr(),
        measured_snr: if var_bg > 0.0 {
            (sig / sig_n.max(1.0)) / var_bg.sqrt()
        } else {
            f64::INFINITY
        },
        scan_seconds: p.scan_seconds(),
        image,
        n,
    }
}

/// The mean of a magnitude image where there is no signal at all: `σ√(π/2)`.
///
/// The background of an MR image is not black, and this is why — a magnitude
/// turns zero-mean complex Gaussian noise into a Rician distribution with a
/// positive mean. Rice, *Bell Syst Tech J* 23:282 (1944); the MR consequences
/// are Gudbjartsson & Patz, *Magn Reson Med* 34:910–914 (1995).
pub fn rician_background_mean(sigma: f64) -> f64 {
    sigma * (std::f64::consts::PI / 2.0).sqrt()
}
