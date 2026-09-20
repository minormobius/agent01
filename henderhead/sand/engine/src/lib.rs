//! sandconic — the engine behind henderhead.mino.mobi/sand/.
//!
//! After Matt Henderson's "How to make an ellipse, using sand and physics"
//! (2026-09-20): sand pours onto a plate with a hole in it, builds a cone
//! around the pour point and a funnel around the hole, and where the two
//! surfaces meet the crease is exactly an ellipse with the pour point and the
//! hole as its foci.
//!
//! Same build as the other four engines here: a plain cdylib for
//! wasm32-unknown-unknown, no wasm-bindgen, no imports.
//!
//! The discipline that makes this worth building rather than drawing: the sand
//! is **simulated**, cell by cell, with the mass-conserving repose relaxation
//! this repo already uses in `clock/lib/soil.js`. The conic is then **measured
//! off the simulated field** by a fitter that is told nothing about where the
//! pour point and the hole are. When the fitted foci come back sitting on
//! them, that is a result. Evaluating `min(A - k*d1, k*d2)` and admiring the
//! ellipse in it would have been assuming the answer.
//!
//! What the page adds to the video is the rest of the family. His is one case
//! of six, and the interesting one is the case you cannot reach: see the table
//! in `conic.rs`, and the reason a parabola needs a slot rather than a hole.
//!
//! Every pointer here is invalidated by the next call that can resize its
//! buffer, so read before you step.

mod conic;
mod field;
mod seam;

#[cfg(test)]
mod tests;

use conic::{Conic, ConicType};
use field::{Feature, Field, Kind, Shape};

const MAX_FEATURES: usize = 8;

pub struct World {
    f: Field,
    feats: Vec<Feature>,
    labels: Vec<i32>,
    seam_pts: Vec<f64>,
    shade: Vec<u8>,
    last: Option<Conic>,
    seam_a: i32,
    seam_b: i32,
    relax_passes: usize,
    relax_c: f64,
    brush_r: f64,
    hole_r: f64,
}

static mut WORLD: Option<World> = None;

#[allow(static_mut_refs)]
fn w() -> &'static mut World {
    unsafe { WORLD.as_mut().unwrap() }
}

#[no_mangle]
pub extern "C" fn init(n: usize, repose_deg: f64) {
    let f = Field::new(n, repose_deg);
    unsafe {
        WORLD = Some(World {
            labels: vec![-1; n * n],
            shade: vec![0; n * n],
            f,
            feats: Vec::new(),
            seam_pts: Vec::new(),
            last: None,
            seam_a: 0,
            seam_b: 1,
            relax_passes: 4,
            relax_c: 0.12,
            brush_r: 2.5,
            hole_r: 2.0,
        });
    }
}

#[no_mangle]
pub extern "C" fn clear_features() {
    let w = w();
    w.feats.clear();
    w.f.rebuild_sinks(&w.feats, w.hole_r);
}

/// `kind`: 0 point source, 1 point sink, 2 line source, 3 line sink.
/// For lines, `(nx, ny)` is the normal; for points it is ignored.
#[no_mangle]
pub extern "C" fn add_feature(kind: i32, x: f64, y: f64, nx: f64, ny: f64, rate: f64) -> i32 {
    let w = w();
    if w.feats.len() >= MAX_FEATURES {
        return -1;
    }
    let f = match kind {
        0 => Feature::point_source(x, y, rate),
        1 => Feature::point_sink(x, y),
        2 => Feature::line_source(x, y, nx, ny, rate),
        _ => Feature::line_sink(x, y, nx, ny),
    };
    w.feats.push(f);
    w.f.rebuild_sinks(&w.feats, w.hole_r);
    (w.feats.len() - 1) as i32
}

#[no_mangle]
pub extern "C" fn move_feature(i: usize, x: f64, y: f64) {
    let w = w();
    if i >= w.feats.len() {
        return;
    }
    match &mut w.feats[i].shape {
        Shape::Point { x: px, y: py } => {
            *px = x;
            *py = y;
        }
        Shape::Line { x: lx, y: ly, .. } => {
            *lx = x;
            *ly = y;
        }
    }
    w.f.rebuild_sinks(&w.feats, w.hole_r);
}

#[no_mangle]
pub extern "C" fn set_feature_normal(i: usize, nx: f64, ny: f64) {
    let w = w();
    if i >= w.feats.len() {
        return;
    }
    if let Shape::Line { nx: a, ny: b, .. } = &mut w.feats[i].shape {
        let l = (nx * nx + ny * ny).sqrt().max(1e-12);
        *a = nx / l;
        *b = ny / l;
    }
    w.f.rebuild_sinks(&w.feats, w.hole_r);
}

#[no_mangle]
pub extern "C" fn set_feature_rate(i: usize, rate: f64) {
    let w = w();
    if i < w.feats.len() {
        w.feats[i].rate = rate;
    }
}

#[no_mangle]
pub extern "C" fn set_repose(deg: f64) {
    w().f.set_repose(deg);
}

#[no_mangle]
pub extern "C" fn repose_deg() -> f64 {
    w().f.k.atan().to_degrees()
}

#[no_mangle]
pub extern "C" fn set_seam_pair(a: i32, b: i32) {
    let w = w();
    w.seam_a = a;
    w.seam_b = b;
}

#[no_mangle]
pub extern "C" fn reset() {
    let w = w();
    w.f.clear();
    w.last = None;
    w.seam_pts.clear();
}

/// Run `ticks` table steps. Returns the largest remaining slope overshoot,
/// which is how far the sand still is from settled.
#[no_mangle]
pub extern "C" fn step(ticks: usize) -> f64 {
    let w = w();
    let mut mx = 0.0;
    for _ in 0..ticks {
        mx = w.f.step(&w.feats, w.relax_passes, w.relax_c, w.brush_r);
    }
    mx
}

/// Re-read the curve out of the current sand and re-fit it. Returns the number
/// of seam points found.
#[no_mangle]
pub extern "C" fn measure() -> usize {
    let w = w();
    let flat = w.f.k * 0.25;
    w.labels = seam::label(&w.f, &w.feats, flat);
    w.labels = seam::label(&w.f, &w.feats, flat);
    let pts = seam::trace_between(&w.f, &w.labels, &w.feats, w.seam_a, w.seam_b, w.hole_r + 3.0);
    w.seam_pts.clear();
    for (x, y) in &pts {
        w.seam_pts.push(*x);
        w.seam_pts.push(*y);
    }
    w.last = conic::fit(&pts);
    pts.len()
}

#[no_mangle]
pub extern "C" fn seam_ptr() -> *const f64 {
    w().seam_pts.as_ptr()
}

#[no_mangle]
pub extern "C" fn seam_len() -> usize {
    w().seam_pts.len()
}

#[no_mangle]
pub extern "C" fn height_ptr() -> *const f64 {
    w().f.h.as_ptr()
}

#[no_mangle]
pub extern "C" fn height_len() -> usize {
    w().f.h.len()
}

#[no_mangle]
pub extern "C" fn labels_ptr() -> *const i32 {
    w().labels.as_ptr()
}

/// A Lambert-shaded byte per cell, so the page can paint the sand without
/// shipping the whole float field across and shading it in JS.
#[no_mangle]
pub extern "C" fn shade(z_scale: f64, lx: f64, ly: f64, lz: f64) -> *const u8 {
    let w = w();
    let n = w.f.n;
    let l = (lx * lx + ly * ly + lz * lz).sqrt().max(1e-12);
    let (lx, ly, lz) = (lx / l, ly / l, lz / l);
    for y in 0..n {
        for x in 0..n {
            let i = w.f.idx(x, y);
            if w.f.h[i] <= 1e-9 {
                w.shade[i] = 0;
                continue;
            }
            let (gx, gy) = w.f.gradient(x, y);
            let (nx, ny, nz) = (-gx * z_scale, -gy * z_scale, 1.0);
            let m = (nx * nx + ny * ny + nz * nz).sqrt().max(1e-12);
            let d = ((nx * lx + ny * ly + nz * lz) / m).max(0.0);
            let v = (0.22 + 0.78 * d).clamp(0.0, 1.0);
            w.shade[i] = (v * 254.0) as u8 + 1;
        }
    }
    w.shade.as_ptr()
}

#[no_mangle]
pub extern "C" fn max_height() -> f64 {
    w().f.h.iter().cloned().fold(0.0, f64::max)
}

#[no_mangle]
pub extern "C" fn total_mass() -> f64 {
    w().f.total_mass()
}

#[no_mangle]
pub extern "C" fn poured() -> f64 {
    w().f.poured
}

#[no_mangle]
pub extern "C" fn drained() -> f64 {
    w().f.drained
}

#[no_mangle]
pub extern "C" fn steps() -> u64 {
    w().f.steps
}

#[no_mangle]
pub extern "C" fn oversteep() -> f64 {
    seam::oversteep_fraction(&w().f)
}

// ---- what the fit found -----------------------------------------------------

#[no_mangle]
pub extern "C" fn conic_type(tol: f64) -> i32 {
    match w().last {
        Some(c) => c.classify(tol).code(),
        None => -1,
    }
}

#[no_mangle]
pub extern "C" fn conic_eccentricity() -> f64 {
    match w().last {
        Some(c) => c.eccentricity(),
        None => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn conic_rms() -> f64 {
    match w().last {
        Some(c) => c.rms,
        None => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn conic_coeff(i: usize) -> f64 {
    match w().last {
        Some(c) => [c.a, c.b, c.c, c.d, c.e, c.f][i.min(5)],
        None => f64::NAN,
    }
}

/// Fitted focus `i` (0 or 1), component `j` (0 = x, 1 = y). NaN for a
/// parabola, whose second focus is at infinity.
#[no_mangle]
pub extern "C" fn conic_focus(i: usize, j: usize) -> f64 {
    let Some(c) = w().last else { return f64::NAN };
    match c.foci() {
        Some((f1, f2)) => {
            let f = if i == 0 { f1 } else { f2 };
            if j == 0 {
                f.0
            } else {
                f.1
            }
        }
        None => f64::NAN,
    }
}

/// How far the nearer fitted focus is from feature `i`, in cells. This is the
/// headline number: the fitter never saw the features, so a small value here
/// is the claim "the pour point and the hole are the foci" being confirmed
/// rather than assumed.
#[no_mangle]
pub extern "C" fn focus_error(i: usize) -> f64 {
    let w = w();
    let Some(c) = w.last else { return f64::NAN };
    let Some((f1, f2)) = c.foci() else { return f64::NAN };
    let Some(feat) = w.feats.get(i) else { return f64::NAN };
    let Shape::Point { x, y } = feat.shape else { return f64::NAN };
    let d1 = ((f1.0 - x).powi(2) + (f1.1 - y).powi(2)).sqrt();
    let d2 = ((f2.0 - x).powi(2) + (f2.1 - y).powi(2)).sqrt();
    d1.min(d2)
}

/// The statistic computed on Henderson's own video frames: the standard
/// deviation of `r1 + r2` around the measured curve, as a percentage of its
/// mean. `sum = 1` for the ellipse test, `0` for the hyperbola test.
#[no_mangle]
pub extern "C" fn focal_constancy_pct(a: usize, b: usize, sum: i32) -> f64 {
    let w = w();
    let (Some(fa), Some(fb)) = (w.feats.get(a), w.feats.get(b)) else {
        return f64::NAN;
    };
    let (Shape::Point { x: ax, y: ay }, Shape::Point { x: bx, y: by }) = (fa.shape, fb.shape)
    else {
        return f64::NAN;
    };
    let pts: Vec<(f64, f64)> = w.seam_pts.chunks(2).map(|c| (c[0], c[1])).collect();
    conic::focal_constancy(&pts, (ax, ay), (bx, by), sum != 0).2
}

/// What the theory says this pair should draw, from the feature kinds alone —
/// so the page can show prediction and measurement side by side and let them
/// disagree if they are going to.
#[no_mangle]
pub extern "C" fn predicted_type() -> i32 {
    let w = w();
    let (Some(a), Some(b)) = (w.feats.get(w.seam_a as usize), w.feats.get(w.seam_b as usize))
    else {
        return -1;
    };
    let line_a = matches!(a.shape, Shape::Line { .. });
    let line_b = matches!(b.shape, Shape::Line { .. });
    if line_a != line_b {
        // one point, one line: the only way to e = 1
        return ConicType::Parabola.code();
    }
    if line_a && line_b {
        return ConicType::Line.code();
    }
    let (Shape::Point { x: ax, y: ay }, Shape::Point { x: bx, y: by }) = (a.shape, b.shape) else {
        return -1;
    };
    let same = (ax - bx).abs() < 1e-9 && (ay - by).abs() < 1e-9;
    if a.kind == b.kind {
        ConicType::Hyperbola.code()
    } else if same {
        ConicType::Circle.code()
    } else {
        ConicType::Ellipse.code()
    }
}

#[no_mangle]
pub extern "C" fn feature_count() -> usize {
    w().feats.len()
}

#[no_mangle]
pub extern "C" fn feature_kind(i: usize) -> i32 {
    let w = w();
    match w.feats.get(i) {
        None => -1,
        Some(f) => match (f.shape, f.kind) {
            (Shape::Point { .. }, Kind::Source) => 0,
            (Shape::Point { .. }, Kind::Sink) => 1,
            (Shape::Line { .. }, Kind::Source) => 2,
            (Shape::Line { .. }, Kind::Sink) => 3,
        },
    }
}

#[no_mangle]
pub extern "C" fn feature_xy(i: usize, j: usize) -> f64 {
    let w = w();
    match w.feats.get(i).map(|f| f.shape) {
        Some(Shape::Point { x, y }) | Some(Shape::Line { x, y, .. }) => {
            if j == 0 {
                x
            } else {
                y
            }
        }
        None => f64::NAN,
    }
}

#[no_mangle]
pub extern "C" fn set_relax(passes: usize, c: f64) {
    let w = w();
    w.relax_passes = passes.clamp(1, 64);
    w.relax_c = c.clamp(0.001, 0.2);
}

#[no_mangle]
pub extern "C" fn grid_n() -> usize {
    w().f.n
}
