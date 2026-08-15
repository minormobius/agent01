//! The browser-facing surface. A thin shell — every calculation lives in
//! `coil`, `bloch` or `physics`, so what the page shows is what `cargo test`
//! checks.
//!
//! Compiled only for `wasm32`. The names exported here are asserted against the
//! page's `import` list by `sci/sci.selftest.mjs`, so renaming one without
//! updating the page is a caught error rather than a blank panel.

use crate::bloch;
use crate::coil::{best_radius_for_depth, loop_axis_field, Coil};
use crate::physics;
use wasm_bindgen::prelude::*;

/// A receive coil built from circular loops. Lengths in metres; `B₀` is along
/// `+z`, so a loop whose normal is `+z` faces down the bore.
#[wasm_bindgen]
pub struct RxCoil {
    inner: Coil,
}

#[wasm_bindgen]
impl RxCoil {
    #[wasm_bindgen(constructor)]
    pub fn new() -> RxCoil {
        RxCoil {
            inner: Coil::new(),
        }
    }

    /// Add a loop of `radius` at `(cx, cy, cz)` with plane normal `(nx, ny, nz)`.
    #[allow(clippy::too_many_arguments)]
    pub fn add_loop(
        &mut self,
        cx: f64,
        cy: f64,
        cz: f64,
        nx: f64,
        ny: f64,
        nz: f64,
        radius: f64,
    ) {
        self.inner
            .add_loop([cx, cy, cz], [nx, ny, nz], radius, 96);
    }

    pub fn clear(&mut self) {
        self.inner.segments.clear();
    }

    /// Receive sensitivity |B₁⁻| at a point, in µT per amp.
    pub fn sensitivity_at(&self, x: f64, y: f64, z: f64) -> f64 {
        self.inner.sensitivity([x, y, z]) * 1e6
    }

    /// Full field vector at a point, `[Bx, By, Bz]` in µT per amp — so the page
    /// can show *why* a sensitivity is low: strong field, wrong direction.
    pub fn field_at(&self, x: f64, y: f64, z: f64) -> Vec<f64> {
        let b = self.inner.field([x, y, z]);
        vec![b[0] * 1e6, b[1] * 1e6, b[2] * 1e6]
    }

    /// Sensitivity over a grid in the y = 0 plane (the plane containing B₀),
    /// row-major, `nz` rows of `nx`, in µT per amp.
    #[allow(clippy::too_many_arguments)]
    pub fn sensitivity_map(
        &self,
        x0: f64,
        x1: f64,
        z0: f64,
        z1: f64,
        nx: usize,
        nz: usize,
    ) -> Vec<f32> {
        self.inner.sensitivity_map(x0, x1, z0, z1, nx, nz)
    }

    /// The loop's wire path, projected into the y = 0 plane as `[x, z, …]` in
    /// metres, for drawing the coil over its own sensitivity map.
    pub fn outline_xz(&self) -> Vec<f32> {
        let mut v = Vec::with_capacity(self.inner.segments.len() * 2);
        for s in &self.inner.segments {
            v.push(s.a[0] as f32);
            v.push(s.a[2] as f32);
        }
        v
    }
}

impl Default for RxCoil {
    fn default() -> Self {
        Self::new()
    }
}

/// Free-induction decay after a 90° pulse — interleaved `[re, im, …]` in the
/// rotating frame (i.e. after the receiver's mixer).
#[wasm_bindgen]
pub fn fid(t1: f64, t2: f64, spread_hz: f64, dt: f64, steps: usize, n_iso: usize) -> Vec<f32> {
    bloch::fid(t1, t2, spread_hz, dt, steps, n_iso)
}

/// Hahn spin echo: 90°, τ, 180°, and the echo at 2τ.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn spin_echo(
    t1: f64,
    t2: f64,
    spread_hz: f64,
    tau: f64,
    dt: f64,
    steps: usize,
    n_iso: usize,
) -> Vec<f32> {
    bloch::spin_echo(t1, t2, spread_hz, tau, dt, steps, n_iso)
}

/// Proton Larmor frequency in MHz.
#[wasm_bindgen]
pub fn larmor_mhz(b0: f64) -> f64 {
    physics::larmor_hz(b0) / 1e6
}

/// Free-space wavelength at the Larmor frequency, in metres.
#[wasm_bindgen]
pub fn larmor_wavelength_m(b0: f64) -> f64 {
    physics::larmor_wavelength_m(b0)
}

/// Thermal spin polarisation in parts per million, at body temperature.
#[wasm_bindgen]
pub fn polarization_ppm(b0: f64) -> f64 {
    physics::polarization(b0, physics::T_BODY) * 1e6
}

/// Induction-detected signal relative to 1.5 T — the B₀² law.
#[wasm_bindgen]
pub fn relative_faraday_emf(b0: f64) -> f64 {
    physics::relative_faraday_emf(b0)
}

/// The signal-optimal loop radius for a target depth, `√2 · z`.
#[wasm_bindgen]
pub fn best_radius(depth_m: f64) -> f64 {
    best_radius_for_depth(depth_m)
}

/// On-axis field of a circular loop, µT per amp — the closed form the solver is
/// checked against, exposed so the page can plot both.
#[wasm_bindgen]
pub fn loop_axis_field_ut(radius_m: f64, z_m: f64) -> f64 {
    loop_axis_field(radius_m, z_m, 1.0) * 1e6
}

// ------------------------------------------------- spatial encoding (part 2) --

use crate::encode::{epi_shift_pixels, Scanner, Timing, Trajectory};
use crate::phantom::Phantom;

fn traj_of(code: u32) -> Trajectory {
    match code {
        1 => Trajectory::Epi,
        2 => Trajectory::Radial,
        _ => Trajectory::SpinWarp,
    }
}

/// A scanner the page can drive: an object, a matrix, a field of view, and a
/// trajectory through k-space.
#[wasm_bindgen]
pub struct Imager {
    sc: Scanner,
}

#[wasm_bindgen]
impl Imager {
    /// `n` must be a power of two. `fov_cm` is the field of view and
    /// `object_cm` the radius the phantom's unit disc maps to.
    #[wasm_bindgen(constructor)]
    pub fn new(n: usize, fov_cm: f64, object_cm: f64, classic: bool) -> Imager {
        let p = if classic {
            Phantom::shepp_logan()
        } else {
            Phantom::shepp_logan_modified()
        };
        Imager {
            sc: Scanner::new(n, fov_cm / 100.0, object_cm / 100.0, p),
        }
    }

    /// Run an acquisition. `traj`: 0 spin-warp, 1 EPI, 2 radial.
    pub fn acquire(
        &mut self,
        traj: u32,
        dwell_us: f64,
        t2star_ms: f64,
        off_res_hz: f64,
        undersample: usize,
    ) {
        self.sc.acquire(
            traj_of(traj),
            Timing {
                dwell: dwell_us * 1e-6,
                t2star: t2star_ms * 1e-3,
                off_res: off_res_hz,
            },
            undersample,
        );
    }

    /// Reconstruct everything acquired.
    pub fn image(&self) -> Vec<f32> {
        self.sc.reconstruct(None)
    }

    /// Reconstruct with parts of k-space deleted — the paintbrush.
    pub fn image_masked(&self, mask: &[u8]) -> Vec<f32> {
        self.sc.reconstruct(Some(mask))
    }

    /// Reconstruct from the first `frac` of the acquisition, in the order the
    /// trajectory actually visits k-space.
    pub fn image_progress(&self, frac: f64) -> Vec<f32> {
        let m = self.sc.progress_mask(frac);
        self.sc.reconstruct(Some(&m))
    }

    /// k-space magnitude, log-compressed to 0…1 for display — raw k-space has
    /// a dynamic range no screen can show.
    pub fn k_display(&self) -> Vec<f32> {
        let n = self.sc.n;
        let mut max: f64 = 0.0;
        for i in 0..n * n {
            let m = self.sc.k[2 * i].hypot(self.sc.k[2 * i + 1]);
            if m > max {
                max = m;
            }
        }
        (0..n * n)
            .map(|i| {
                let m = self.sc.k[2 * i].hypot(self.sc.k[2 * i + 1]);
                if max <= 0.0 || m <= 0.0 {
                    0.0
                } else {
                    // five decades, which is about what k-space spans
                    ((1.0 + (m / max).log10() / 5.0).clamp(0.0, 1.0)) as f32
                }
            })
            .collect()
    }

    /// The object as it really is — what the reconstruction is trying to be.
    pub fn truth(&self) -> Vec<f32> {
        self.sc.truth()
    }

    /// Acquisition order per k-space sample, `-1` where never acquired.
    pub fn order(&self) -> Vec<i32> {
        self.sc.order.clone()
    }

    /// Intensity centroid of an image, in pixels from the centre: `[x, y]`.
    pub fn centroid(&self, img: &[f32]) -> Vec<f64> {
        let (x, y) = Scanner::centroid(img, self.sc.n);
        vec![x, y]
    }

    pub fn pixel_mm(&self) -> f64 {
        self.sc.pixel() * 1000.0
    }

    pub fn k_max_per_cm(&self) -> f64 {
        self.sc.k_max() / 100.0
    }

    /// Seconds this acquisition would take. `tr_ms` is the repetition time for
    /// the sequences that need one per line.
    pub fn seconds(&self, traj: u32, dwell_us: f64, undersample: usize, tr_ms: f64) -> f64 {
        self.sc.acquisition_seconds(
            traj_of(traj),
            Timing {
                dwell: dwell_us * 1e-6,
                t2star: 1.0,
                off_res: 0.0,
            },
            undersample,
            tr_ms * 1e-3,
        )
    }
}

/// The predicted EPI geometric shift, in pixels: `Δf · N · echo-spacing / R`.
#[wasm_bindgen]
pub fn epi_shift_px(off_res_hz: f64, n: usize, dwell_us: f64, undersample: usize) -> f64 {
    epi_shift_pixels(off_res_hz, n, n as f64 * dwell_us * 1e-6, undersample)
}

/// How far image `b` has slid along y relative to `a`, in pixels, by circular
/// cross-correlation — the measurement that survives the image wrapping around
/// the field of view, which is what large off-resonance actually does.
#[wasm_bindgen]
pub fn shift_px(a: &[f32], b: &[f32], n: usize) -> f64 {
    crate::encode::shift_along_y(a, b, n)
}
