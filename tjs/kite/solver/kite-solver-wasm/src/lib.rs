//! Browser glue for `kite-solver`. One JSON entry point (`solve_json`) so the
//! frontend never touches wasm memory directly. All fields camelCase.
//!
//! The tjs kite bench loads this as an OPTIONAL accelerator with a JS fallback that
//! implements the *same* vortex-lattice method — so the page works whether or not the
//! wasm is present, and the wasm doubles as a cross-check of the JS.

use kite_solver::{solve, KiteConfig, V3};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

fn v(a: V3) -> [f64; 3] {
    [a.x, a.y, a.z]
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReqDto {
    span: f64,
    chord: f64,
    bow: f64,
    /// Angle of attack in radians.
    aoa: f64,
    wind: f64,
    #[serde(default = "default_rho")]
    rho: f64,
    nspan: usize,
    nchord: usize,
    /// Row-major [chord][span] cut mask, length nspan*nchord. Optional.
    #[serde(default)]
    cut: Vec<bool>,
}
fn default_rho() -> f64 {
    1.225
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct PanelOut {
    i: usize,
    j: usize,
    center: [f64; 3],
    normal: [f64; 3],
    area: f64,
    force: [f64; 3],
    gamma: f64,
    pressure: f64,
    cut: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct SolOut {
    panels: Vec<PanelOut>,
    force: [f64; 3],
    drag: f64,
    lift: f64,
    side: f64,
    magnitude: f64,
    l_over_d: f64,
    cl: f64,
    cd: f64,
    center_of_pressure: [f64; 3],
    live_area: f64,
    ref_area: f64,
    n_panels: usize,
    n_cut: usize,
}

/// Solve the vortex-lattice kite for one config. Returns a JSON `SolOut`, or
/// `{"error": "..."}` on a malformed request.
#[wasm_bindgen]
pub fn solve_json(req: &str) -> String {
    let d: ReqDto = match serde_json::from_str(req) {
        Ok(d) => d,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let cfg = KiteConfig {
        span: d.span,
        chord: d.chord,
        bow: d.bow,
        aoa: d.aoa,
        wind: d.wind,
        rho: d.rho,
        nspan: d.nspan,
        nchord: d.nchord,
        cut: d.cut,
    };
    let s = solve(&cfg);
    let out = SolOut {
        panels: s
            .panels
            .into_iter()
            .map(|p| PanelOut {
                i: p.i,
                j: p.j,
                center: v(p.center),
                normal: v(p.normal),
                area: p.area,
                force: v(p.force),
                gamma: p.gamma,
                pressure: p.pressure,
                cut: p.cut,
            })
            .collect(),
        force: v(s.force),
        drag: s.drag,
        lift: s.lift,
        side: s.side,
        magnitude: s.magnitude,
        l_over_d: s.l_over_d,
        cl: s.cl,
        cd: s.cd,
        center_of_pressure: v(s.center_of_pressure),
        live_area: s.live_area,
        ref_area: s.ref_area,
        n_panels: s.n_panels,
        n_cut: s.n_cut,
    };
    serde_json::to_string(&out).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
}

/// Version/handshake string so the page can confirm the wasm loaded.
#[wasm_bindgen]
pub fn solver_info() -> String {
    "kite-solver vlm 0.1.0".to_string()
}
