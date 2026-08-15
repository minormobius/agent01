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

// ------------------------------------------------------- contrast (part 3) --

use crate::contrast::{
    contrast as tissue_contrast, contrast_zero_crossing, ernst_angle, null_time, Sequence, Tissue,
    STANISZ_3T,
};

fn seq_of(kind: u32, tr_ms: f64, te_ms: f64, ti_ms: f64, flip_deg: f64) -> Sequence {
    let (tr, te, ti) = (tr_ms * 1e-3, te_ms * 1e-3, ti_ms * 1e-3);
    match kind {
        1 => Sequence::InversionRecovery { tr, ti, te },
        2 => Sequence::SpoiledGradientEcho { tr, te, flip: flip_deg.to_radians() },
        _ => Sequence::SpinEcho { tr, te },
    }
}

/// How many tissues the measured table carries.
#[wasm_bindgen]
pub fn tissue_count() -> usize {
    STANISZ_3T.len()
}

#[wasm_bindgen]
pub fn tissue_name(i: usize) -> String {
    STANISZ_3T[i.min(STANISZ_3T.len() - 1)].name.to_string()
}

/// `[T1, T2, T1 sd, T2 sd]` in milliseconds, straight from Stanisz 2005 Table 1.
#[wasm_bindgen]
pub fn tissue_relaxation_ms(i: usize) -> Vec<f64> {
    let t = STANISZ_3T[i.min(STANISZ_3T.len() - 1)];
    vec![t.t1 * 1e3, t.t2 * 1e3, t.t1_sd * 1e3, t.t2_sd * 1e3]
}

/// Signal from tissue `i` under a sequence. `kind`: 0 spin echo,
/// 1 inversion recovery, 2 spoiled gradient echo.
#[wasm_bindgen]
pub fn tissue_signal(i: usize, kind: u32, tr_ms: f64, te_ms: f64, ti_ms: f64, flip_deg: f64) -> f64 {
    let t = STANISZ_3T[i.min(STANISZ_3T.len() - 1)];
    seq_of(kind, tr_ms, te_ms, ti_ms, flip_deg).signal(&t, t.t2)
}

/// Signal from an arbitrary `(T1, T2)` — for drawing the response of a tissue
/// the table does not contain.
#[wasm_bindgen]
pub fn signal_for(
    t1_ms: f64,
    t2_ms: f64,
    kind: u32,
    tr_ms: f64,
    te_ms: f64,
    ti_ms: f64,
    flip_deg: f64,
) -> f64 {
    let t = Tissue { name: "", t1: t1_ms * 1e-3, t2: t2_ms * 1e-3, t1_sd: 0.0, t2_sd: 0.0, pd: 1.0 };
    seq_of(kind, tr_ms, te_ms, ti_ms, flip_deg).signal(&t, t.t2)
}

/// |contrast| between two tissues over a log-spaced TR × TE grid, row-major
/// (`nte` rows of `ntr`). The landscape a radiographer is choosing a point on.
#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn contrast_map(
    i: usize,
    j: usize,
    tr_lo_ms: f64,
    tr_hi_ms: f64,
    te_lo_ms: f64,
    te_hi_ms: f64,
    ntr: usize,
    nte: usize,
    signed: bool,
) -> Vec<f32> {
    let (a, b) = (STANISZ_3T[i.min(5)], STANISZ_3T[j.min(5)]);
    let mut out = Vec::with_capacity(ntr * nte);
    for ry in 0..nte {
        let te = te_lo_ms * (te_hi_ms / te_lo_ms).powf(ry as f64 / (nte - 1).max(1) as f64) * 1e-3;
        for rx in 0..ntr {
            let tr =
                tr_lo_ms * (tr_hi_ms / tr_lo_ms).powf(rx as f64 / (ntr - 1).max(1) as f64) * 1e-3;
            let c = tissue_contrast(&a, &b, &Sequence::SpinEcho { tr, te }, 1.0);
            out.push(if signed { c as f32 } else { c.abs() as f32 });
        }
    }
    out
}

/// The TR at which two tissues become indistinguishable at this TE, in ms.
/// Negative if there is no such TR — at long TE, T₂ wins everywhere.
#[wasm_bindgen]
pub fn zero_contrast_tr_ms(i: usize, j: usize, te_ms: f64) -> f64 {
    let (a, b) = (STANISZ_3T[i.min(5)], STANISZ_3T[j.min(5)]);
    let te = te_ms * 1e-3;
    contrast_zero_crossing(&a, &b, te, te * 1.5, 20.0).map_or(-1.0, |tr| tr * 1e3)
}

/// The Ernst angle in degrees: `cos α = e^(−TR/T₁)`.
#[wasm_bindgen]
pub fn ernst_angle_deg(tr_ms: f64, t1_ms: f64) -> f64 {
    ernst_angle(tr_ms * 1e-3, t1_ms * 1e-3).to_degrees()
}

/// The inversion time that nulls a T₁, in ms.
#[wasm_bindgen]
pub fn null_time_ms(t1_ms: f64, tr_ms: f64) -> f64 {
    null_time(t1_ms * 1e-3, tr_ms * 1e-3) * 1e3
}

/// A scanner whose phantom is made of the measured tissues, imaged through the
/// same encoding and reconstruction as part two.
#[wasm_bindgen]
pub struct TissueImager {
    sc: Scanner,
}

#[wasm_bindgen]
impl TissueImager {
    #[wasm_bindgen(constructor)]
    pub fn new(n: usize, fov_cm: f64, object_cm: f64) -> TissueImager {
        TissueImager {
            sc: Scanner::new(
                n,
                fov_cm / 100.0,
                object_cm / 100.0,
                Phantom::from_tissue_signals(&[1.0; 6]),
            ),
        }
    }

    /// Re-weight every region by what its tissue does under this sequence, then
    /// acquire and reconstruct. The image is a real reconstruction, not a
    /// colouring-in of the truth map.
    pub fn image(&mut self, kind: u32, tr_ms: f64, te_ms: f64, ti_ms: f64, flip_deg: f64) -> Vec<f32> {
        let seq = seq_of(kind, tr_ms, te_ms, ti_ms, flip_deg);
        let signals: Vec<f64> = STANISZ_3T.iter().map(|t| seq.signal(t, t.t2)).collect();
        self.sc.phantom = Phantom::from_tissue_signals(&signals);
        self.sc.acquire(
            Trajectory::SpinWarp,
            Timing { dwell: 4e-6, t2star: 1e6, off_res: 0.0 },
            1,
        );
        self.sc.reconstruct(None)
    }

    /// A map of which tissue is where, for the legend: the tissue index at each
    /// pixel, or −1 outside the phantom.
    pub fn label_map(&self) -> Vec<i32> {
        let n = self.sc.n;
        let px = self.sc.pixel();
        let h = n as f64 / 2.0;
        let regions = crate::phantom::tissue_regions();
        let mut out = Vec::with_capacity(n * n);
        for iy in 0..n {
            for ix in 0..n {
                let x = (ix as f64 - h) * px / self.sc.object_radius;
                let y = (iy as f64 - h) * px / self.sc.object_radius;
                let mut label = -1;
                for (geom, tix) in regions.iter() {
                    if geom.contains(x, y) {
                        label = *tix as i32;
                    }
                }
                out.push(label);
            }
        }
        out
    }
}
