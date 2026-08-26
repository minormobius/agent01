//! fold.mino.mobi — browser ABI for the folding engine.
//!
//! No wasm-bindgen. The module exports plain C functions plus its memory, and
//! everything bulky is read straight out of linear memory as typed-array views
//! from JS (see ../engine.js). Two rules that follow from that:
//!
//!   * every buffer is allocated by `load()` and never resized afterwards, so
//!     views stay valid for the lifetime of a protein. JS re-makes its views
//!     after `load` and after `build`, and not per frame.
//!   * `layout()` reports the strides this build was compiled with. JS asserts
//!     against them at start-up, so a field added on one side and not the other
//!     fails loudly instead of rendering nonsense.

pub mod model;

use model::{param, stat, Sim};

/// Interleaved tube vertex: position(3) normal(3) t(1) q(1).
pub const VERTEX_STRIDE: usize = 8;
/// Contact filament vertex: position(3) strength(1).
pub const WIRE_STRIDE: usize = 4;
pub const MAX_SUBDIV: usize = 12;
pub const MAX_SIDES: usize = 16;
/// Bumped whenever the ABI changes shape. JS refuses a mismatch.
pub const ABI_VERSION: u32 = 4;

struct App {
    sim: Sim,
    /// Tube mesh for the live chain.
    verts: Vec<f32>,
    /// Tube mesh for the native structure — built once, drawn as a ghost.
    ghost: Vec<f32>,
    idx: Vec<u32>,
    wire: Vec<f32>,
    /// Column-major mat4 placing the native ghost on the live chain.
    fit: [f32; 16],
    rings: usize,
    sides: usize,
    n_index: usize,
    n_wire: usize,
}

static mut APP: Option<App> = None;

#[allow(static_mut_refs)]
fn app() -> &'static mut App {
    unsafe { APP.as_mut().expect("load() first") }
}

// ------------------------------------------------------------------ lifecycle

/// 0 vertex stride, 1 wire stride, 2 abi version, 3 stat count,
/// 4 max subdiv, 5 max sides.
#[no_mangle]
pub extern "C" fn layout(i: u32) -> u32 {
    match i {
        0 => VERTEX_STRIDE as u32,
        1 => WIRE_STRIDE as u32,
        2 => ABI_VERSION,
        3 => stat::COUNT,
        4 => MAX_SUBDIV as u32,
        5 => MAX_SIDES as u32,
        _ => 0,
    }
}

/// Allocate for an `n`-residue chain. Returns the pointer JS should write the
/// native C-alpha coordinates into (3n f32, angstrom, any origin).
#[no_mangle]
pub extern "C" fn load(n: u32) -> *const f32 {
    let n = n.max(4) as usize;
    let max_rings = (n - 1) * MAX_SUBDIV + 1;
    let max_verts = max_rings * MAX_SIDES;
    // every |i-j|>=3 pair could in principle be a contact
    let max_con = n * n / 2 + n;
    let a = App {
        sim: Sim::new(n),
        verts: vec![0.0; max_verts * VERTEX_STRIDE],
        ghost: vec![0.0; max_verts * VERTEX_STRIDE],
        idx: vec![0; (max_rings - 1) * MAX_SIDES * 6],
        wire: vec![0.0; max_con * 2 * WIRE_STRIDE],
        fit: [0.0; 16],
        rings: 0,
        sides: 0,
        n_index: 0,
        n_wire: 0,
    };
    unsafe {
        APP = Some(a);
    }
    app().sim.nat.as_ptr()
}

/// Derive reference geometry and the native contact map. Returns contact count.
#[no_mangle]
pub extern "C" fn build(cutoff: f32) -> u32 {
    app().sim.build(cutoff) as u32
}

/// mode 0 = random coil, 1 = native, 2 = extended.
#[no_mangle]
pub extern "C" fn reset(seed: u32, mode: u32) {
    app().sim.reset(seed, mode);
}

#[no_mangle]
pub extern "C" fn set_param(id: u32, v: f32) {
    let s = &mut app().sim;
    match id {
        param::TEMP => s.temp = v.max(0.0),
        param::GAMMA => s.gamma = v.clamp(0.001, 5.0),
        param::DT => s.dt = v.clamp(0.0005, 0.03),
        param::EPS => s.eps = v.max(0.0),
        param::TORSION => s.torsion = v.max(0.0),
        _ => {}
    }
}

#[no_mangle]
pub extern "C" fn step(k: u32) {
    app().sim.step(k);
}

/// True once anything has gone non-finite — a blown-up integrator. JS shows a
/// message and offers a reset rather than rendering NaN geometry.
#[no_mangle]
pub extern "C" fn diverged() -> u32 {
    let s = &app().sim;
    (!s.x.iter().all(|e| e.is_finite()) || !s.rg.is_finite()) as u32
}

#[no_mangle]
pub extern "C" fn stat(i: u32) -> f32 {
    app().sim.stat(i)
}

// -------------------------------------------------------------------- buffers

#[no_mangle]
pub extern "C" fn pos_ptr() -> *const f32 {
    app().sim.x.as_ptr()
}
#[no_mangle]
pub extern "C" fn native_ptr() -> *const f32 {
    app().sim.nat.as_ptr()
}
#[no_mangle]
pub extern "C" fn resq_ptr() -> *const f32 {
    app().sim.resq.as_ptr()
}
#[no_mangle]
pub extern "C" fn formed_ptr() -> *const u8 {
    app().sim.formed.as_ptr()
}
/// (i, j) pairs, 2 u32 per contact, in build order.
#[no_mangle]
pub extern "C" fn contacts_ptr() -> *const u32 {
    // The Vec is (u32, u32, f32) — 12-byte records with no padding, so the
    // first two fields of each are already a strided u32 view. JS reads it as
    // u32 with stride 3 rather than us keeping a second copy.
    app().sim.con.as_ptr() as *const u32
}
#[no_mangle]
pub extern "C" fn n_contacts() -> u32 {
    app().sim.con.len() as u32
}

// ----------------------------------------------------------------- tube mesh

#[inline]
fn cr(p0: f32, p1: f32, p2: f32, p3: f32, u: f32) -> (f32, f32) {
    // Catmull–Rom value and derivative at u
    let u2 = u * u;
    let u3 = u2 * u;
    let v = 0.5
        * (2.0 * p1
            + (-p0 + p2) * u
            + (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u2
            + (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u3);
    let d = 0.5
        * ((-p0 + p2)
            + 2.0 * (2.0 * p0 - 5.0 * p1 + 4.0 * p2 - p3) * u
            + 3.0 * (-p0 + 3.0 * p1 - 3.0 * p2 + p3) * u2);
    (v, d)
}

/// Sweep a circular tube along the Catmull–Rom spline through `src`, writing
/// interleaved vertices into `dst`. Frames are carried along the curve by
/// Gram–Schmidt against the previous normal (discrete parallel transport), so
/// the tube never spins about its own axis between frames — the alternative,
/// a fixed up-vector, makes the surface swim wherever the chain runs vertical.
///
/// `qsrc` is per-residue foldedness, interpolated along the tube; `None` marks
/// the whole thing folded, which is what the native ghost wants.
#[allow(clippy::too_many_arguments)]
fn sweep(
    src: &[f32],
    qsrc: Option<&[f32]>,
    n: usize,
    subdiv: usize,
    sides: usize,
    radius: f32,
    dst: &mut [f32],
) -> usize {
    let rings = (n - 1) * subdiv + 1;
    let cap = (subdiv as f32 * 0.9).max(2.0);
    let at = |i: isize| -> usize { (i.max(0) as usize).min(n - 1) };
    let mut nrm = [0.0f32, 0.0, 0.0];
    let mut have_frame = false;

    for r in 0..rings {
        let seg = (r / subdiv).min(n - 2);
        let u = (r - seg * subdiv) as f32 / subdiv as f32;
        let (i0, i1, i2, i3) = (
            at(seg as isize - 1),
            seg,
            at(seg as isize + 1),
            at(seg as isize + 2),
        );
        let mut c = [0.0f32; 3];
        let mut tan = [0.0f32; 3];
        for k in 0..3 {
            let (v, d) = cr(src[3 * i0 + k], src[3 * i1 + k], src[3 * i2 + k], src[3 * i3 + k], u);
            c[k] = v;
            tan[k] = d;
        }
        let tl = (tan[0] * tan[0] + tan[1] * tan[1] + tan[2] * tan[2]).sqrt().max(1e-5);
        for k in 0..3 {
            tan[k] /= tl;
        }
        if !have_frame {
            // any vector not parallel to the tangent
            let seed = if tan[0].abs() < 0.9 { [1.0f32, 0.0, 0.0] } else { [0.0f32, 1.0, 0.0] };
            nrm = [
                seed[1] * tan[2] - seed[2] * tan[1],
                seed[2] * tan[0] - seed[0] * tan[2],
                seed[0] * tan[1] - seed[1] * tan[0],
            ];
            have_frame = true;
        }
        // re-orthogonalise the carried normal against the new tangent
        let d = nrm[0] * tan[0] + nrm[1] * tan[1] + nrm[2] * tan[2];
        for k in 0..3 {
            nrm[k] -= d * tan[k];
        }
        let nl = (nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]).sqrt();
        if nl < 1e-4 {
            let seed = if tan[0].abs() < 0.9 { [1.0f32, 0.0, 0.0] } else { [0.0f32, 1.0, 0.0] };
            nrm = [
                seed[1] * tan[2] - seed[2] * tan[1],
                seed[2] * tan[0] - seed[0] * tan[2],
                seed[0] * tan[1] - seed[1] * tan[0],
            ];
            let l = (nrm[0] * nrm[0] + nrm[1] * nrm[1] + nrm[2] * nrm[2]).sqrt().max(1e-5);
            for k in 0..3 {
                nrm[k] /= l;
            }
        } else {
            for k in 0..3 {
                nrm[k] /= nl;
            }
        }
        let bin = [
            tan[1] * nrm[2] - tan[2] * nrm[1],
            tan[2] * nrm[0] - tan[0] * nrm[2],
            tan[0] * nrm[1] - tan[1] * nrm[0],
        ];

        // rounded ends: circular radius profile over the first/last `cap` rings
        let edge = (r as f32).min((rings - 1 - r) as f32);
        let rad = if edge < cap {
            let x = 1.0 - (edge / cap);
            radius * (1.0 - x * x).max(0.0).sqrt()
        } else {
            radius
        };

        let t_along = r as f32 / (rings - 1).max(1) as f32;
        let qv = match qsrc {
            None => 1.0,
            Some(q) => {
                let a = q[i1];
                let b = q[i2];
                a + (b - a) * u
            }
        };

        for s in 0..sides {
            let a = s as f32 * std::f32::consts::TAU / sides as f32;
            let (sa, ca_) = a.sin_cos();
            let ox = ca_ * nrm[0] + sa * bin[0];
            let oy = ca_ * nrm[1] + sa * bin[1];
            let oz = ca_ * nrm[2] + sa * bin[2];
            let o = (r * sides + s) * VERTEX_STRIDE;
            dst[o] = c[0] + ox * rad;
            dst[o + 1] = c[1] + oy * rad;
            dst[o + 2] = c[2] + oz * rad;
            dst[o + 3] = ox;
            dst[o + 4] = oy;
            dst[o + 5] = oz;
            dst[o + 6] = t_along;
            dst[o + 7] = qv;
        }
    }
    rings
}

/// Rebuild the live tube. Returns the vertex count.
#[no_mangle]
pub extern "C" fn mesh(subdiv: u32, sides: u32, radius: f32) -> u32 {
    let a = app();
    let subdiv = (subdiv as usize).clamp(1, MAX_SUBDIV);
    let sides = (sides as usize).clamp(3, MAX_SIDES);
    let n = a.sim.n;
    let src = a.sim.x.clone();
    let q = a.sim.resq.clone();
    let rings = sweep(&src, Some(&q), n, subdiv, sides, radius, &mut a.verts);
    a.rings = rings;
    a.sides = sides;
    (rings * sides) as u32
}

/// Build the native-structure ghost once, with the same topology as the live
/// tube so one index buffer serves both.
#[no_mangle]
pub extern "C" fn mesh_native(subdiv: u32, sides: u32, radius: f32) -> u32 {
    let a = app();
    let subdiv = (subdiv as usize).clamp(1, MAX_SUBDIV);
    let sides = (sides as usize).clamp(3, MAX_SIDES);
    let n = a.sim.n;
    let src = a.sim.nat.clone();
    let rings = sweep(&src, None, n, subdiv, sides, radius, &mut a.ghost);
    (rings * sides) as u32
}

/// Triangulate the current (rings, sides) grid. Only depends on topology, so
/// JS calls it when the protein or the tessellation changes, not per frame.
#[no_mangle]
pub extern "C" fn indices() -> u32 {
    let a = app();
    let (rings, sides) = (a.rings, a.sides);
    let mut w = 0usize;
    for r in 0..rings.saturating_sub(1) {
        for s in 0..sides {
            let s2 = (s + 1) % sides;
            let v00 = (r * sides + s) as u32;
            let v01 = (r * sides + s2) as u32;
            let v10 = ((r + 1) * sides + s) as u32;
            let v11 = ((r + 1) * sides + s2) as u32;
            a.idx[w] = v00;
            a.idx[w + 1] = v10;
            a.idx[w + 2] = v11;
            a.idx[w + 3] = v00;
            a.idx[w + 4] = v11;
            a.idx[w + 5] = v01;
            w += 6;
        }
    }
    a.n_index = w;
    w as u32
}

#[no_mangle]
pub extern "C" fn mesh_ptr() -> *const f32 {
    app().verts.as_ptr()
}
#[no_mangle]
pub extern "C" fn ghost_ptr() -> *const f32 {
    app().ghost.as_ptr()
}
#[no_mangle]
pub extern "C" fn index_ptr() -> *const u32 {
    app().idx.as_ptr()
}

/// One line segment per native contact that is currently made, from C-alpha to
/// C-alpha, with a strength that fades as the pair approaches its cutoff.
/// Returns the line count.
#[no_mangle]
pub extern "C" fn wires() -> u32 {
    let a = app();
    let s = &a.sim;
    let mut w = 0usize;
    let mut lines = 0usize;
    for (ci, &(i, j, r0)) in s.con.iter().enumerate() {
        if s.formed[ci] == 0 {
            continue;
        }
        let (iu, ju) = (i as usize, j as usize);
        let dx = s.x[3 * ju] - s.x[3 * iu];
        let dy = s.x[3 * ju + 1] - s.x[3 * iu + 1];
        let dz = s.x[3 * ju + 2] - s.x[3 * iu + 2];
        let r = (dx * dx + dy * dy + dz * dz).sqrt();
        // 1 at the native distance, 0 at the 1.2 r0 cutoff
        let lim = model::FORMED_FACTOR * r0;
        let strength = ((lim - r) / (lim - r0).max(1e-3)).clamp(0.0, 1.0);
        for &b in &[iu, ju] {
            a.wire[w] = s.x[3 * b];
            a.wire[w + 1] = s.x[3 * b + 1];
            a.wire[w + 2] = s.x[3 * b + 2];
            a.wire[w + 3] = strength;
            w += WIRE_STRIDE;
        }
        lines += 1;
    }
    a.n_wire = lines;
    lines as u32
}

#[no_mangle]
pub extern "C" fn wire_ptr() -> *const f32 {
    app().wire.as_ptr()
}

/// Largest C-alpha distance from the centroid of the native structure — the
/// camera uses it to frame any protein at a sensible distance.
/// Recompute the optimal superposition of the native structure onto the live
/// chain and return a pointer to the resulting column-major mat4.
#[no_mangle]
pub extern "C" fn superpose() -> *const f32 {
    let a = app();
    let mut m = [0.0f32; 16];
    a.sim.superpose(&mut m);
    a.fit = m;
    a.fit.as_ptr()
}

#[no_mangle]
pub extern "C" fn native_radius() -> f32 {
    let s = &app().sim;
    let mut m = 0.0f32;
    for i in 0..s.n {
        let d = s.nat[3 * i] * s.nat[3 * i]
            + s.nat[3 * i + 1] * s.nat[3 * i + 1]
            + s.nat[3 * i + 2] * s.nat[3 * i + 2];
        m = m.max(d);
    }
    m.sqrt()
}
