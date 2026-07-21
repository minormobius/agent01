//! Browser glue for `dragon-solver`. One JSON entry point (`simulate_json`) so the
//! frontend never touches wasm memory directly. Angles are radians, matching the core
//! and the JS mirror (`dragon-sim.js`). Trajectories come back as flat arrays (pos/vel
//! are 3*steps long) so three.js can stream them straight into buffers.
//!
//! Loaded as an OPTIONAL accelerator: the tjs dragon bench ships a JS mirror of this
//! exact law, so the page runs with or without the wasm, and the wasm doubles as a
//! cross-check of the JS (see `dragon-sim.selftest.mjs`).

use dragon_solver::{simulate, Agent, Config, V3};
use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ReqDto {
    dt: f64,
    steps: usize,
    elev_set: f64,
    turn_gain: f64,
    turn_max: f64,
    pitch_limit: f64,
    speed_pref: f64,
    speed_max: f64,
    speed_min: f64,
    standoff: f64,
    brake_range: f64,
    accel_gain: f64,
    accel_max: f64,
    alt_base: f64,
    alt_halfband: f64,
    band_gain: f64,
    avoid_bubble: f64,
    avoid_gain: f64,
    asym: f64,
    a_pos: [f64; 3],
    a_vel: [f64; 3],
    b_pos: [f64; 3],
    b_vel: [f64; 3],
}

impl ReqDto {
    fn into_cfg(self) -> Config {
        Config {
            dt: self.dt,
            steps: self.steps,
            elev_set: self.elev_set,
            turn_gain: self.turn_gain,
            turn_max: self.turn_max,
            pitch_limit: self.pitch_limit,
            speed_pref: self.speed_pref,
            speed_max: self.speed_max,
            speed_min: self.speed_min,
            standoff: self.standoff,
            brake_range: self.brake_range,
            accel_gain: self.accel_gain,
            accel_max: self.accel_max,
            alt_base: self.alt_base,
            alt_halfband: self.alt_halfband,
            band_gain: self.band_gain,
            avoid_bubble: self.avoid_bubble,
            avoid_gain: self.avoid_gain,
            asym: self.asym,
            a: Agent {
                pos: V3::new(self.a_pos[0], self.a_pos[1], self.a_pos[2]),
                vel: V3::new(self.a_vel[0], self.a_vel[1], self.a_vel[2]),
            },
            b: Agent {
                pos: V3::new(self.b_pos[0], self.b_pos[1], self.b_pos[2]),
                vel: V3::new(self.b_vel[0], self.b_vel[1], self.b_vel[2]),
            },
        }
    }
}

#[derive(Serialize, Default)]
struct AgentOut {
    pos: Vec<f64>,   // 3*steps
    vel: Vec<f64>,   // 3*steps
    speed: Vec<f64>,
    #[serde(rename = "turnRate")]
    turn_rate: Vec<f64>,
    range: Vec<f64>,
    azimuth: Vec<f64>,
    elevation: Vec<f64>,
}

#[derive(Serialize)]
struct SimDto {
    t: Vec<f64>,
    a: AgentOut,
    b: AgentOut,
    role: Vec<f64>,
}

fn pack(samples: &[dragon_solver::Sample]) -> AgentOut {
    let n = samples.len();
    let mut out = AgentOut {
        pos: Vec::with_capacity(3 * n),
        vel: Vec::with_capacity(3 * n),
        speed: Vec::with_capacity(n),
        turn_rate: Vec::with_capacity(n),
        range: Vec::with_capacity(n),
        azimuth: Vec::with_capacity(n),
        elevation: Vec::with_capacity(n),
    };
    for s in samples {
        out.pos.extend_from_slice(&[s.pos.x, s.pos.y, s.pos.z]);
        out.vel.extend_from_slice(&[s.vel.x, s.vel.y, s.vel.z]);
        out.speed.push(s.speed);
        out.turn_rate.push(s.turn_rate);
        out.range.push(s.range);
        out.azimuth.push(s.azimuth);
        out.elevation.push(s.elevation);
    }
    out
}

/// Integrate a contest. Input: `ReqDto` JSON. Output: `SimDto` JSON.
#[wasm_bindgen]
pub fn simulate_json(req: &str) -> String {
    let dto: ReqDto = match serde_json::from_str(req) {
        Ok(d) => d,
        Err(e) => return format!("{{\"error\":\"{}\"}}", e),
    };
    let cfg = dto.into_cfg();
    let out = simulate(&cfg);
    let dto = SimDto {
        t: out.t,
        a: pack(&out.a),
        b: pack(&out.b),
        role: out.role,
    };
    serde_json::to_string(&dto).unwrap_or_else(|e| format!("{{\"error\":\"{}\"}}", e))
}

/// Build/version banner so the page can confirm the wasm actually loaded.
#[wasm_bindgen]
pub fn solver_info() -> String {
    "dragon-solver-wasm 0.1.0 (visual-bearing pursuit)".into()
}
