//! Browser glue for `cylinder-solver`. Two JSON entry points so the frontend never
//! touches wasm memory directly:
//!
//!   • `hoop_json`      — closed-form feasibility (mirrors the JS in cylinder.html;
//!                         the WASM build is a cross-check, not a black box).
//!   • `solve_net_json` — the pin-jointed 3D cable/strut stiffness solve, returning
//!                         member tensions/stresses, displacements, and a `mechanism`
//!                         flag when the weave can't carry load.
//!
//! All fields camelCase. The tool loads this as an OPTIONAL accelerator with a JS
//! fallback, exactly like mappa/pkg — the page works whether or not the wasm is present.

use cylinder_solver::{analytic, frame, net};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

// ───────────────────────────── hoop (closed-form) ───────────────────────────────
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MaterialDto {
    strength: f64,
    density: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct HoopDto {
    radius: f64,
    g_rim: f64,
    wall_t: f64,
    sf: f64,
    atm: f64,
    reg_depth: f64,
    #[serde(default = "default_reg_density")]
    reg_density: f64,
    #[serde(default = "default_interior")]
    interior_load: f64,
    hull: MaterialDto,
    web_share: f64,
}
fn default_reg_density() -> f64 {
    1500.0
}
fn default_interior() -> f64 {
    800.0
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct HoopOut {
    omega: f64,
    rim_v: f64,
    p_eff: f64,
    sigma_self: f64,
    sigma_press_bare: f64,
    sigma_with_web: f64,
    allow: f64,
    margin: f64,
    v_max: f64,
    r_max: f64,
    areal_density: f64,
    material_limited: bool,
    feasible: bool,
}

#[wasm_bindgen]
pub fn hoop_json(req: &str) -> String {
    let d: HoopDto = match serde_json::from_str(req) {
        Ok(d) => d,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let r = analytic::hoop(&analytic::HoopSpec {
        radius: d.radius,
        g_rim: d.g_rim,
        wall_t: d.wall_t,
        sf: d.sf,
        atm: d.atm,
        reg_depth: d.reg_depth,
        reg_density: d.reg_density,
        interior_load: d.interior_load,
        hull: analytic::Material {
            strength: d.hull.strength,
            density: d.hull.density,
        },
        web_share: d.web_share,
    });
    serde_json::to_string(&HoopOut {
        omega: r.omega,
        rim_v: r.rim_v,
        p_eff: r.p_eff,
        sigma_self: r.sigma_self,
        sigma_press_bare: r.sigma_press_bare,
        sigma_with_web: r.sigma_with_web,
        allow: r.allow,
        margin: r.margin,
        v_max: r.v_max,
        r_max: r.r_max,
        areal_density: r.areal_density,
        material_limited: r.material_limited,
        feasible: r.feasible,
    })
    .unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
}

// ───────────────────────────── cable/strut net ──────────────────────────────────
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NodeDto {
    pos: [f64; 3],
    #[serde(default)]
    fix: [bool; 3],
    #[serde(default)]
    load: [f64; 3],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct MemberDto {
    i: usize,
    j: usize,
    area: f64,
    e: f64,
    #[serde(default)]
    tension_only: bool,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct NetDto {
    nodes: Vec<NodeDto>,
    members: Vec<MemberDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct MemberOut {
    force: f64,
    stress: f64,
    length: f64,
    active: bool,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct NetOut {
    disp: Vec<[f64; 3]>,
    members: Vec<MemberOut>,
    iters: usize,
    mechanism: bool,
}

#[wasm_bindgen]
pub fn solve_net_json(req: &str) -> String {
    let d: NetDto = match serde_json::from_str(req) {
        Ok(d) => d,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let model = net::Model {
        nodes: d
            .nodes
            .into_iter()
            .map(|n| net::Node {
                pos: n.pos,
                fix: n.fix,
                load: n.load,
            })
            .collect(),
        members: d
            .members
            .into_iter()
            .map(|m| net::Member {
                i: m.i,
                j: m.j,
                area: m.area,
                e: m.e,
                tension_only: m.tension_only,
            })
            .collect(),
    };
    let s = model.solve();
    serde_json::to_string(&NetOut {
        disp: s.disp,
        members: s
            .members
            .into_iter()
            .map(|m| MemberOut {
                force: m.force,
                stress: m.stress,
                length: m.length,
                active: m.active,
            })
            .collect(),
        iters: s.iters,
        mechanism: s.mechanism,
    })
    .unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
}

// ───────────────────────────── 2D frame (bending) ───────────────────────────────
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrameNodeDto {
    pos: [f64; 2],
    #[serde(default)]
    fix: [bool; 3],
    #[serde(default)]
    load: [f64; 3],
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrameMemberDto {
    i: usize,
    j: usize,
    e: f64,
    area: f64,
    inertia: f64,
    c: f64,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FrameDto {
    nodes: Vec<FrameNodeDto>,
    members: Vec<FrameMemberDto>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameMemberOut {
    axial: f64,
    moment: f64,
    stress: f64,
    length: f64,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct FrameOut {
    disp: Vec<[f64; 3]>,
    members: Vec<FrameMemberOut>,
    mechanism: bool,
    compliance: f64,
}

/// Solve a 2D frame (axial + bending). This is what scores closed-cell foam /
/// honeycomb honestly — walls carry load by bending, which the pin-jointed `net`
/// can't represent.
#[wasm_bindgen]
pub fn solve_frame_json(req: &str) -> String {
    let d: FrameDto = match serde_json::from_str(req) {
        Ok(d) => d,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let model = frame::Model {
        nodes: d
            .nodes
            .into_iter()
            .map(|n| frame::Node { pos: n.pos, fix: n.fix, load: n.load })
            .collect(),
        members: d
            .members
            .into_iter()
            .map(|m| frame::Member { i: m.i, j: m.j, e: m.e, area: m.area, inertia: m.inertia, c: m.c })
            .collect(),
    };
    let s = model.solve();
    serde_json::to_string(&FrameOut {
        disp: s.disp,
        members: s
            .members
            .into_iter()
            .map(|m| FrameMemberOut { axial: m.axial, moment: m.moment, stress: m.stress, length: m.length })
            .collect(),
        mechanism: s.mechanism,
        compliance: s.compliance,
    })
    .unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
}
