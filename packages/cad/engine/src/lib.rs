//! cad-engine — tree in, geometry out.
//!
//! `build()` is the whole public API: a tree (JSON) and options, a `Report`
//! (JSON-serialisable: timings, invariants, named faces, errors) and the
//! built geometry. The same function is exported over a raw C ABI for the
//! WASM build (no wasm-bindgen; see `fold/engine` for the precedent).

pub mod expr;
pub mod invariants;
pub mod kernel;
pub mod sketch;
pub mod tree;

use kernel::{BuildOpts, Built, KError};
use serde::Serialize;

/// A monotonic clock that also works on wasm32-unknown-unknown, where
/// `std::time::Instant` panics. The host supplies `env.cad_host_now_ms`.
mod clock {
    #[cfg(target_arch = "wasm32")]
    extern "C" {
        fn cad_host_now_ms() -> f64;
    }
    #[derive(Clone, Copy)]
    pub struct Instant(f64);
    impl Instant {
        pub fn now() -> Instant {
            #[cfg(target_arch = "wasm32")]
            unsafe {
                Instant(cad_host_now_ms())
            }
            #[cfg(not(target_arch = "wasm32"))]
            {
                use std::time::{SystemTime, UNIX_EPOCH};
                Instant(SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs_f64() * 1000.0).unwrap_or(0.0))
            }
        }
        pub fn elapsed_ms(&self) -> f64 { Instant::now().0 - self.0 }
    }
}
use clock::Instant;

pub const VERSION: u32 = 1;

#[derive(Debug, Clone, Serialize, Default)]
pub struct Timings {
    pub parse_ms: f64,
    pub resolve_ms: f64,
    pub build_ms: f64,
    pub invariants_ms: f64,
    pub total_ms: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct Report {
    pub ok: bool,
    pub engine: u32,
    pub kernel: String,
    pub timings: Timings,
    pub invariants: Option<invariants::Invariants>,
    pub faces: Vec<kernel::FaceInfo>,
    pub gears: Vec<tree::GearMeta>,
    pub ops: Vec<String>,
    pub error: Option<KError>,
    pub step_bytes: usize,
}

fn now_ms(t: Instant) -> f64 { t.elapsed_ms() }

pub fn build(json: &str, kernel_name: &str, opts: &BuildOpts) -> (Report, Option<Built>) {
    let t0 = Instant::now();
    let mut rep = Report {
        ok: false,
        engine: VERSION,
        kernel: kernel_name.into(),
        timings: Timings::default(),
        invariants: None,
        faces: Vec::new(),
        gears: Vec::new(),
        ops: Vec::new(),
        error: None,
        step_bytes: 0,
    };
    let t = Instant::now();
    let tree = match tree::parse(json) {
        Ok(t) => t,
        Err(e) => {
            rep.error = Some(KError::fail("parse", e));
            rep.timings.total_ms = now_ms(t0);
            return (rep, None);
        }
    };
    rep.timings.parse_ms = now_ms(t);
    let t = Instant::now();
    let resolved = match tree::resolve(&tree) {
        Ok(r) => r,
        Err(e) => {
            rep.error = Some(KError::fail("resolve", e));
            rep.timings.total_ms = now_ms(t0);
            return (rep, None);
        }
    };
    rep.timings.resolve_ms = now_ms(t);
    rep.ops = resolved.ops.iter().map(|o| format!("{}:{}", o.op(), o.id())).collect();
    rep.gears = resolved.gears.clone();
    let kernel = match kernel::by_name(kernel_name) {
        Some(k) => k,
        None => {
            rep.error = Some(KError::fail("kernel", format!("unknown kernel `{kernel_name}`")));
            rep.timings.total_ms = now_ms(t0);
            return (rep, None);
        }
    };
    let t = Instant::now();
    let built = match kernel.build(&resolved, opts) {
        Ok(b) => b,
        Err(e) => {
            rep.error = Some(e);
            rep.timings.build_ms = now_ms(t);
            rep.timings.total_ms = now_ms(t0);
            return (rep, None);
        }
    };
    rep.timings.build_ms = now_ms(t);
    let t = Instant::now();
    let (welded, ids) = invariants::weld_with(&built.mesh, opts.tol * 1e-3, &built.face_of_tri);
    rep.invariants = Some(invariants::compute(&welded));
    let mut built = built;
    built.mesh = welded;
    built.face_of_tri = ids;
    rep.timings.invariants_ms = now_ms(t);
    rep.faces = built.faces.clone();
    rep.step_bytes = built.step.as_ref().map(|s| s.len()).unwrap_or(0);
    rep.ok = true;
    rep.timings.total_ms = now_ms(t0);
    (rep, Some(built))
}

/// Resolve only (for foreign kernels in the bake-off): the op list with
/// every sketch also sampled to polylines at `tol`.
pub fn resolve_json(json: &str, tol: f64) -> Result<String, String> {
    let tree = tree::parse(json)?;
    let r = tree::resolve(&tree)?;
    #[derive(Serialize)]
    struct Poly<'a> {
        id: &'a str,
        frame: &'a tree::Frame,
        rings: Vec<Vec<[f64; 2]>>,
        /// same order as `rings`: true = outer (ccw), false = hole (cw)
        outer: Vec<bool>,
    }
    let mut polys = Vec::new();
    for s in &r.sketches {
        let groups = s.region.oriented()?;
        let mut rings = Vec::new();
        let mut outer = Vec::new();
        for g in groups {
            for (i, l) in g.iter().enumerate() {
                rings.push(l.sample(tol));
                outer.push(i == 0);
            }
        }
        polys.push(Poly { id: &s.id, frame: &s.frame, rings, outer });
    }
    // Per-op rings over the *combined* profile: nesting (outer vs hole) only
    // means anything across every sketch an op extrudes, not per sketch —
    // a pattern of five circles is five holes in the plate, not five discs.
    #[derive(Serialize)]
    struct OpRings {
        id: String,
        rings: Vec<Vec<[f64; 2]>>,
        outer: Vec<bool>,
        /// index into the op's `region.loops` for each ring
        loop_index: Vec<usize>,
    }
    let mut oprings = Vec::new();
    for op in &r.ops {
        let (id, region) = match op {
            tree::ROp::Extrude { id, region, .. } | tree::ROp::Revolve { id, region, .. } => (id, region),
            _ => continue,
        };
        let groups = region.oriented()?;
        let starts: Vec<[f64; 2]> = region.loops.iter().map(|l| l.start).collect();
        let mut rings = Vec::new();
        let mut outer = Vec::new();
        let mut loop_index = Vec::new();
        for g in groups {
            for (i, l) in g.iter().enumerate() {
                // a reversed hole keeps its start point, so the start identifies the source loop
                let li = starts.iter().position(|s| (s[0] - l.start[0]).abs() < 1e-9 && (s[1] - l.start[1]).abs() < 1e-9).unwrap_or(0);
                rings.push(l.sample(tol));
                outer.push(i == 0);
                loop_index.push(li);
            }
        }
        oprings.push(OpRings { id: id.clone(), rings, outer, loop_index });
    }
    #[derive(Serialize)]
    struct Out<'a> {
        resolved: &'a tree::Resolved,
        polylines: Vec<Poly<'a>>,
        oprings: Vec<OpRings>,
    }
    serde_json::to_string(&Out { resolved: &r, polylines: polys, oprings }).map_err(|e| e.to_string())
}

/// Read a STEP file back (native only, `--features stepin`), tessellate it and
/// measure it — the STEP fidelity check for every kernel's export.
#[cfg(feature = "stepin")]
pub fn step_measure(step: &str, tol: f64) -> Result<(invariants::Invariants, usize), String> {
    use truck_meshalgo::prelude::*;
    use truck_stepio::r#in::*;
    let exchange = ruststep::parser::parse(step).map_err(|e| format!("STEP parse: {e}"))?;
    let table = Table::from_data_section(&exchange.data[0]);
    let mut mesh = kernel::TriMesh::default();
    let mut shells = 0;
    for (_idx, shell) in table.shell.iter() {
        let shell = table.to_compressed_shell(shell).map_err(|e| format!("STEP shell: {e:?}"))?;
        let poly = shell.robust_triangulation(tol);
        let mut pm = poly.to_polygon();
        pm.put_together_same_attrs(TOLERANCE * 50.0).remove_degenerate_faces().remove_unused_attrs();
        let base = mesh.pos.len() as u32;
        mesh.pos.extend(pm.positions().iter().map(|p| [p.x, p.y, p.z]));
        for t in pm.tri_faces() {
            mesh.tris.push([base + t[0].pos as u32, base + t[1].pos as u32, base + t[2].pos as u32]);
        }
        for q in pm.quad_faces() {
            mesh.tris.push([base + q[0].pos as u32, base + q[1].pos as u32, base + q[2].pos as u32]);
            mesh.tris.push([base + q[0].pos as u32, base + q[2].pos as u32, base + q[3].pos as u32]);
        }
        shells += 1;
    }
    if shells == 0 {
        return Err("STEP has no shells".into());
    }
    let welded = invariants::weld(&mesh, tol * 1e-3);
    Ok((invariants::compute(&welded), shells))
}

// ── raw C ABI for the WASM build ────────────────────────────────────────────
//
//   cad_alloc(n) → ptr            caller writes the tree JSON there
//   cad_build(ptr, n, kernel, want_step) → 1 ok / 0 error (report still set)
//   cad_out_ptr(which), cad_out_len(which)   which: 0 report JSON, 1 STL, 2 STEP,
//                                 3 positions f32×3, 4 tri indices u32×3, 5 face id per tri u32
//   cad_resolve(ptr, n, tol_micro) → 1 ok / 0 error; slot 0 = resolved JSON (ops + sampled polylines)
//   cad_free_all()                drop outputs
//
// kernel: 0 truck, 1 implicit.

struct Outs {
    report: Vec<u8>,
    stl: Vec<u8>,
    step: Vec<u8>,
    /// welded mesh as the viewer wants it: xyz f32, tri indices u32, face id per tri u32
    pos: Vec<u8>,
    idx: Vec<u8>,
    fid: Vec<u8>,
}

fn f32_bytes(v: &[[f64; 3]]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 12);
    for p in v {
        for x in p {
            out.extend_from_slice(&(*x as f32).to_le_bytes());
        }
    }
    out
}
fn u32_bytes(v: &[u32]) -> Vec<u8> {
    let mut out = Vec::with_capacity(v.len() * 4);
    for x in v {
        out.extend_from_slice(&x.to_le_bytes());
    }
    out
}

static mut OUTS: Option<Outs> = None;
static mut INBUF: Vec<u8> = Vec::new();

#[no_mangle]
pub extern "C" fn cad_version() -> u32 { VERSION }

#[no_mangle]
pub extern "C" fn cad_alloc(n: u32) -> *mut u8 {
    unsafe {
        let b = &mut *std::ptr::addr_of_mut!(INBUF);
        b.clear();
        b.resize(n as usize, 0);
        b.as_mut_ptr()
    }
}

#[no_mangle]
pub extern "C" fn cad_build(ptr: *const u8, n: u32, kernel: u32, want_step: u32, res: u32) -> u32 {
    let json = unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, n as usize)) };
    let kname = match kernel { 1 => "implicit", _ => "truck" };
    // `res` is the implicit kernel's grid; for the B-rep kernels it also sets
    // the chord tolerance, finer than the default 0.01 mm in proportion —
    // res 256 → 0.0025 mm — so a clearance measured on the mesh reads the
    // designed gap, not the gap less two sagittas.
    let res = if res == 0 { 64 } else { res as usize };
    let tol = if res > 64 { 0.01 * 64.0 / res as f64 } else { 0.01 };
    let opts = BuildOpts { want_step: want_step != 0, res, tol, ..Default::default() };
    let (rep, built) = build(json, kname, &opts);
    let outs = Outs {
        report: serde_json::to_vec(&rep).unwrap_or_default(),
        stl: built.as_ref().map(|b| invariants::stl(&b.mesh)).unwrap_or_default(),
        pos: built.as_ref().map(|b| f32_bytes(&b.mesh.pos)).unwrap_or_default(),
        idx: built.as_ref().map(|b| u32_bytes(&b.mesh.tris.iter().flat_map(|t| t.iter().copied()).collect::<Vec<u32>>())).unwrap_or_default(),
        fid: built.as_ref().map(|b| u32_bytes(&b.face_of_tri)).unwrap_or_default(),
        step: built.and_then(|b| b.step).map(|s| s.into_bytes()).unwrap_or_default(),
    };
    unsafe {
        *std::ptr::addr_of_mut!(OUTS) = Some(outs);
    }
    rep.ok as u32
}

#[no_mangle]
pub extern "C" fn cad_resolve(ptr: *const u8, n: u32, tol_micro: u32) -> u32 {
    let json = unsafe { std::str::from_utf8_unchecked(std::slice::from_raw_parts(ptr, n as usize)) };
    let tol = if tol_micro == 0 { 0.01 } else { tol_micro as f64 * 1e-6 };
    let (ok, report) = match resolve_json(json, tol) {
        Ok(s) => (1, s.into_bytes()),
        Err(e) => (0, serde_json::to_vec(&serde_json::json!({ "ok": false, "error": { "op": "resolve", "msg": e } })).unwrap_or_default()),
    };
    unsafe {
        *std::ptr::addr_of_mut!(OUTS) = Some(Outs { report, stl: Vec::new(), step: Vec::new(), pos: Vec::new(), idx: Vec::new(), fid: Vec::new() });
    }
    ok
}

#[no_mangle]
pub extern "C" fn cad_out_ptr(which: u32) -> *const u8 {
    unsafe {
        match &*std::ptr::addr_of!(OUTS) {
            Some(o) => match which { 0 => o.report.as_ptr(), 1 => o.stl.as_ptr(), 2 => o.step.as_ptr(), 3 => o.pos.as_ptr(), 4 => o.idx.as_ptr(), _ => o.fid.as_ptr() },
            None => std::ptr::null(),
        }
    }
}

#[no_mangle]
pub extern "C" fn cad_out_len(which: u32) -> u32 {
    unsafe {
        match &*std::ptr::addr_of!(OUTS) {
            Some(o) => (match which { 0 => o.report.len(), 1 => o.stl.len(), 2 => o.step.len(), 3 => o.pos.len(), 4 => o.idx.len(), _ => o.fid.len() }) as u32,
            None => 0,
        }
    }
}

#[no_mangle]
pub extern "C" fn cad_free_all() {
    unsafe {
        *std::ptr::addr_of_mut!(OUTS) = None;
    }
}
