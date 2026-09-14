//! bouncer — the engine behind henderhead.mino.mobi/ball/.
//!
//! After Matt Henderson's "chaos from bouncing a ball in a circle"
//! (2026-09-14): a ball bouncing under gravity inside a circle, with a fan of
//! slightly-mistaken futures drawn from wherever it is, "showing how
//! predictable the system would be with measurement error".
//!
//! Same build as the other three engines here: a plain cdylib for
//! wasm32-unknown-unknown, no wasm-bindgen, no imports.
//!
//! Three things are computed that the video shows, and two it cannot:
//!
//!   * the ball, its trail, and the fan of futures — the picture
//!   * **the spread of that fan, as a number**, so his "Stable Eras and
//!     Chaotic Eras" is a measured time series rather than an impression
//!   * **the Poincaré section**, which is where the eras come from: a mixed
//!     phase space of islands and chaotic sea, and an era is the orbit
//!     loitering near an island
//!   * a running Lyapunov exponent, for the same reason
//!
//! Every pointer here is invalidated by the next call that can resize its
//! buffer, so read before you step.

mod ball;

use ball::{angle_delta, bounces, flight, rim_angle, Flight, Params, State};

const TRAIL_CAP: usize = 6000;
const SECTION_CAP: usize = 40_000;
const SPREAD_CAP: usize = 4000;

struct World {
    p: Params,
    s: State,
    on_wall: bool,
    flight: Option<Flight>,
    t_in_flight: f64,
    clock: f64,
    bounce_count: u64,
    e0: f64,

    trail: Vec<f32>,
    since_trail: f64,
    /// (rim angle, tangential velocity / speed) at every bounce
    section: Vec<f32>,
    /// (time, spread) after the fan's full horizon
    spread_hist: Vec<f32>,

    /// A background phase portrait: many orbits on the same energy surface,
    /// so the islands are visible from the first frame instead of after the
    /// live orbit has spent ten minutes speckling them in.
    survey: Vec<f32>,
    fan: Vec<f32>,
    fan_n: usize,
    fan_pts: usize,
    spread: [f64; 8],
    spread_k: usize,

    /// The shadow trajectory for the Lyapunov estimate, held as a point of the
    /// Poincaré section — (rim angle, sine of the launch angle) — rather than
    /// as a full state.
    ///
    /// That is not a stylistic choice. Renormalising in full state space leaves
    /// the shadow a billionth *off* the circle, and the exact cubic that finds
    /// the next bounce is only valid for a ball sitting exactly on it; feeding
    /// it a near-miss gives a root to the wrong polynomial and the exponent
    /// comes out around 100 instead of 0.3. In section coordinates the shadow
    /// is on the wall by construction, and it stays on the ball's own energy
    /// surface too.
    shadow: Option<(f64, f64)>,
    lyap_sum: f64,
    lyap_t: f64,
    lyap_n: u64,
}

static mut W: Option<World> = None;

fn w() -> &'static mut World {
    unsafe { (*&raw mut W).as_mut().expect("init() first") }
}

const LYAP_EPS: f64 = 1e-9;

#[no_mangle]
pub extern "C" fn alloc(n: usize) -> *mut u8 {
    let mut v = Vec::<u8>::with_capacity(n);
    let p = v.as_mut_ptr();
    core::mem::forget(v);
    p
}

#[no_mangle]
pub unsafe extern "C" fn dealloc(p: *mut u8, n: usize) {
    if !p.is_null() && n > 0 { drop(Vec::from_raw_parts(p, n, n)); }
}

#[no_mangle]
pub extern "C" fn init(radius: f64, gravity: f64, restitution: f64, offset: f64, height: f64) {
    let p = Params {
        radius: radius.max(1e-3),
        gravity: gravity.max(1e-6),
        restitution: restitution.clamp(0.1, 1.0),
    };
    let s = drop_state(&p, offset, height);
    let world = World {
        p, s, on_wall: false, flight: None, t_in_flight: 0.0, clock: 0.0,
        bounce_count: 0, e0: s.energy(&p),
        trail: Vec::with_capacity(TRAIL_CAP * 2), since_trail: 0.0,
        section: Vec::with_capacity(SECTION_CAP * 2),
        spread_hist: Vec::with_capacity(SPREAD_CAP * 2),
        survey: Vec::new(),
        fan: Vec::new(), fan_n: 0, fan_pts: 0,
        spread: [0.0; 8], spread_k: 0,
        shadow: None, lyap_sum: 0.0, lyap_t: 0.0, lyap_n: 0,
    };
    unsafe { *(&raw mut W) = Some(world); }
    let wd = w();
    wd.flight = flight(&wd.p, &wd.s, false);
}

/// Where a drop starts: `offset` across and `height` up, both in radii, kept
/// inside the circle with a little clearance so the first flight is a real one.
fn drop_state(p: &Params, offset: f64, height: f64) -> State {
    let h = height.clamp(-0.95, 0.95) * p.radius;
    let room = (p.radius * p.radius - h * h).max(0.0).sqrt() * 0.95;
    let x = (offset * p.radius).clamp(-room, room);
    State::dropped(x, h)
}

/// Restart from a drop. `offset` and `height` are in units of the radius.
#[no_mangle]
pub extern "C" fn reset(offset: f64, height: f64) {
    let wd = w();
    let p = wd.p;
    wd.s = drop_state(&p, offset, height);
    wd.on_wall = false;
    wd.t_in_flight = 0.0;
    wd.clock = 0.0;
    wd.bounce_count = 0;
    wd.e0 = wd.s.energy(&p);
    wd.trail.clear();
    wd.section.clear();
    wd.spread_hist.clear();
    wd.since_trail = 0.0;
    wd.lyap_sum = 0.0;
    wd.lyap_t = 0.0;
    wd.lyap_n = 0;
    wd.shadow = None;
    wd.flight = flight(&p, &wd.s, false);
}

/// Launch from an arbitrary state — used by the Poincaré section, where
/// clicking a point picks an orbit out of the picture.
#[no_mangle]
pub extern "C" fn launch(x: f64, y: f64, vx: f64, vy: f64) {
    let wd = w();
    let p = wd.p;
    let s = State { x, y, vx, vy };
    let inside = s.r() < p.radius * (1.0 - 1e-9);
    wd.s = s;
    wd.on_wall = !inside;
    wd.t_in_flight = 0.0;
    wd.clock = 0.0;
    wd.bounce_count = 0;
    wd.e0 = s.energy(&p);
    wd.trail.clear();
    wd.section.clear();
    wd.spread_hist.clear();
    wd.lyap_sum = 0.0;
    wd.lyap_t = 0.0;
    wd.lyap_n = 0;
    wd.shadow = None;
    wd.flight = flight(&p, &s, wd.on_wall);
}

#[no_mangle]
pub extern "C" fn set_params(radius: f64, gravity: f64, restitution: f64) {
    let wd = w();
    wd.p.radius = radius.max(1e-3);
    wd.p.gravity = gravity.max(1e-6);
    wd.p.restitution = restitution.clamp(0.1, 1.0);
    wd.flight = flight(&wd.p, &wd.s, wd.on_wall);
}

/// Advance `dt` of ball time, bouncing as many times as that takes.
#[no_mangle]
pub extern "C" fn step(dt: f64, trail_sample: f64) -> u32 {
    let wd = w();
    let mut left = dt.clamp(0.0, 10.0);
    let mut bounced = 0u32;
    let mut guard = 0;
    while left > 0.0 && guard < 4096 {
        guard += 1;
        let f = match &wd.flight { Some(f) => Flight { start: f.start, duration: f.duration }, None => break };
        let remaining = f.duration - wd.t_in_flight;
        if left < remaining {
            wd.t_in_flight += left;
            wd.s = f.start.advance(&wd.p, wd.t_in_flight);
            sample_trail(wd, left, trail_sample);
            left = 0.0;
        } else {
            // land exactly on the wall, then leave from it — never step past
            let before = f.start.advance(&wd.p, f.duration);
            let after = reflect_pub(&wd.p, &before);
            wd.s = after;
            wd.on_wall = true;
            // the whole flight, not just the part of it after the last step
            // boundary — `remaining` excludes the time already sitting in
            // t_in_flight, and dropping that made the clock run slow and every
            // per-unit-time rate come out inflated
            wd.clock += f.duration;
            wd.bounce_count += 1;
            bounced += 1;
            record_section(wd, &after);
            let here = section_of(&after);
            advance_shadow(wd, here);
            wd.t_in_flight = 0.0;
            wd.flight = flight(&wd.p, &after, true);
            sample_trail(wd, remaining, trail_sample);
            left -= remaining;
        }
    }
    bounced
}

fn reflect_pub(p: &Params, s: &State) -> State {
    // ball.rs keeps `reflect` private so that nothing outside can bounce a ball
    // that is not on the wall; the same arithmetic, used at the one call site
    // that has earned it.
    let r = s.r();
    let (nx, ny) = (s.x / r, s.y / r);
    let vn = s.vx * nx + s.vy * ny;
    let e = p.restitution;
    State {
        x: nx * p.radius,
        y: ny * p.radius,
        vx: s.vx - (1.0 + e) * vn * nx,
        vy: s.vy - (1.0 + e) * vn * ny,
    }
}

fn sample_trail(wd: &mut World, dt: f64, every: f64) {
    wd.since_trail += dt;
    if wd.since_trail < every.max(1e-4) { return; }
    wd.since_trail = 0.0;
    if wd.trail.len() >= TRAIL_CAP * 2 { wd.trail.drain(0..2); }
    wd.trail.push(wd.s.x as f32);
    wd.trail.push(wd.s.y as f32);
}

/// The classic billiard section: where on the rim, and the sine of the angle
/// the ball leaves at. Islands in this picture are the stable eras.
fn record_section(wd: &mut World, after: &State) {
    let sp = after.speed();
    if sp < 1e-12 { return; }
    let r = after.r();
    let (nx, ny) = (after.x / r, after.y / r);
    let tangential = (-ny * after.vx + nx * after.vy) / sp;
    if wd.section.len() >= SECTION_CAP * 2 { wd.section.drain(0..2); }
    wd.section.push(rim_angle(after) as f32);
    wd.section.push(tangential as f32);
}

/// One renormalised step of the shadow, in section coordinates.
///
/// The Lyapunov exponent by its definition: start a billionth away, let a
/// bounce stretch the gap, take the log of how much, and pull it back in. Both
/// points are exact section points throughout, so both are exactly on the wall
/// and on the same energy surface.
fn advance_shadow(wd: &mut World, here: (f64, f64)) {
    let p = wd.p;
    let Some(prev) = wd.shadow else {
        // first bounce: plant the shadow a billionth along the section
        wd.shadow = Some((here.0, (here.1 + LYAP_EPS).clamp(-0.999, 0.999)));
        wd.lyap_t = wd.clock;
        return;
    };
    let Some(state) = state_from_section(&p, wd.e0, prev.0, prev.1) else {
        wd.shadow = None;
        return;
    };
    let Some(b) = bounces(&p, state, true, 1).first().copied() else {
        wd.shadow = None;
        return;
    };
    let there = section_of(&b.after);
    let dphi = angle_delta(there.0, here.0);
    let ds = there.1 - here.1;
    let d = (dphi * dphi + ds * ds).sqrt();
    let dt = wd.clock - wd.lyap_t;
    if d > 1e-300 && dt > 0.0 {
        wd.lyap_sum += (d / LYAP_EPS).ln();
        wd.lyap_t = wd.clock;
        wd.lyap_n += 1;
        let f = LYAP_EPS / d;
        wd.shadow = Some((here.0 + dphi * f, (here.1 + ds * f).clamp(-0.999, 0.999)));
    } else {
        wd.shadow = Some(there);
    }
}

/// (rim angle, sine of the launch angle) for a ball leaving the wall.
fn section_of(s: &State) -> (f64, f64) {
    let sp = s.speed().max(1e-300);
    let r = s.r().max(1e-300);
    let (nx, ny) = (s.x / r, s.y / r);
    (rim_angle(s), (-ny * s.vx + nx * s.vy) / sp)
}

/// The inverse: a ball on the wall at `angle`, leaving inward with that sine,
/// at whatever speed the energy surface allows there.
fn state_from_section(p: &Params, e0: f64, angle: f64, sin_out: f64) -> Option<State> {
    let (nx, ny) = (angle.cos(), angle.sin());
    let (x, y) = (p.radius * nx, p.radius * ny);
    let ke = e0 - p.gravity * y;
    if ke <= 1e-12 { return None; }
    let speed = (2.0 * ke).sqrt();
    let s = sin_out.clamp(-0.999999, 0.999999);
    let c = -(1.0 - s * s).sqrt();
    Some(State {
        x, y,
        vx: speed * (c * nx - s * ny),
        vy: speed * (c * ny + s * nx),
    })
}


// ------------------------------------------------------------------- the fan --

/// Build the fan of futures from the ball's current state.
///
/// `n` futures, each with its velocity turned by up to `delta` radians, each
/// followed `k` bounces and sampled `m` times per flight. Turning the velocity
/// rather than changing its length keeps every future on the same energy
/// surface as the real ball, which is what makes the comparison mean
/// "measurement error in direction" and keeps the Poincaré section honest.
///
/// Returns the number of futures actually written.
#[no_mangle]
pub extern "C" fn build_fan(n: u32, delta: f64, k: u32, m: u32) -> u32 {
    let wd = w();
    let n = (n as usize).clamp(2, 2048);
    let k = (k as usize).clamp(1, 8);
    let m = (m as usize).clamp(2, 64);
    let p = wd.p;
    wd.fan.clear();
    wd.fan_n = n;
    wd.fan_pts = k * m;
    wd.spread_k = k;
    wd.fan.reserve(n * k * m * 2);

    // final rim angles, for the spread; and the angle after each bounce depth
    let mut ends: Vec<Vec<f64>> = vec![Vec::with_capacity(n); k];

    for i in 0..n {
        let frac = if n == 1 { 0.0 } else { i as f64 / (n - 1) as f64 * 2.0 - 1.0 };
        let a = frac * delta;
        let (ca, sa) = (a.cos(), a.sin());
        let start = State {
            x: wd.s.x, y: wd.s.y,
            vx: wd.s.vx * ca - wd.s.vy * sa,
            vy: wd.s.vx * sa + wd.s.vy * ca,
        };
        let on_wall = wd.on_wall && wd.t_in_flight == 0.0;
        let mut cur = start;
        let mut wall = on_wall;
        for depth in 0..k {
            let Some(f) = flight(&p, &cur, wall) else {
                // pad so every future has the same point count and the page can
                // index into the buffer without a per-future length
                for _ in 0..m { wd.fan.push(cur.x as f32); wd.fan.push(cur.y as f32); }
                continue;
            };
            for j in 0..m {
                let t = f.duration * (j + 1) as f64 / m as f64;
                let q = cur.advance(&p, t);
                wd.fan.push(q.x as f32);
                wd.fan.push(q.y as f32);
            }
            let landed = cur.advance(&p, f.duration);
            ends[depth].push(rim_angle(&landed));
            cur = reflect_pub(&p, &landed);
            wall = true;
        }
    }

    // circular spread at each depth: 1 − |mean unit vector|. Zero when every
    // future lands in the same place, one when they are scattered right round.
    for d in 0..k.min(8) {
        let v = &ends[d];
        if v.is_empty() { wd.spread[d] = 0.0; continue; }
        let (mut cx, mut cy) = (0.0, 0.0);
        for &a in v { cx += a.cos(); cy += a.sin(); }
        let r = (cx * cx + cy * cy).sqrt() / v.len() as f64;
        wd.spread[d] = 1.0 - r;
    }

    if wd.spread_hist.len() >= SPREAD_CAP * 2 { wd.spread_hist.drain(0..2); }
    wd.spread_hist.push(wd.clock as f32);
    wd.spread_hist.push(wd.spread[k - 1] as f32);
    n as u32
}

// -------------------------------------------------------------- reading out --

#[no_mangle] pub extern "C" fn ball_x() -> f64 { w().s.x }
#[no_mangle] pub extern "C" fn ball_y() -> f64 { w().s.y }
#[no_mangle] pub extern "C" fn ball_vx() -> f64 { w().s.vx }
#[no_mangle] pub extern "C" fn ball_vy() -> f64 { w().s.vy }
#[no_mangle] pub extern "C" fn clock() -> f64 { w().clock + w().t_in_flight }
#[no_mangle] pub extern "C" fn bounce_count() -> f64 { w().bounce_count as f64 }
#[no_mangle] pub extern "C" fn energy() -> f64 { w().s.energy(&w().p) }
/// Drift of the energy since the drop, relative to the fall height. Elastic
/// bounces conserve it exactly, so this is the flight solver's report card.
#[no_mangle]
pub extern "C" fn energy_drift() -> f64 {
    let wd = w();
    let scale = (wd.p.gravity * wd.p.radius).max(1e-12);
    (wd.s.energy(&wd.p) - wd.e0) / scale
}

#[no_mangle] pub extern "C" fn trail_ptr() -> *const f32 { w().trail.as_ptr() }
#[no_mangle] pub extern "C" fn trail_len() -> u32 { (w().trail.len() / 2) as u32 }
/// Sweep the energy surface: `orbits` starting points, `steps` bounces each,
/// collecting their section points. This is the phase portrait — the islands
/// and the sea — and it only has to be recomputed when the physics changes.
#[no_mangle]
pub extern "C" fn build_survey(orbits: u32, steps: u32) -> u32 {
    let wd = w();
    let p = wd.p;
    let e0 = wd.e0;
    let orbits = orbits.clamp(1, 4000) as usize;
    let steps = steps.clamp(1, 400) as usize;
    wd.survey.clear();
    wd.survey.reserve(orbits * steps * 2);
    // a deterministic low-discrepancy sweep rather than random: the golden-ratio
    // sequence covers the square evenly at any cut-off, so the portrait looks
    // the same each time and does not clump
    const G1: f64 = 0.754_877_666_246_692_8;   // plastic number, 2D R2 sequence
    const G2: f64 = 0.569_840_290_998_021_7;
    for i in 0..orbits {
        let u = ((i as f64 + 0.5) * G1).fract();
        let v = ((i as f64 + 0.5) * G2).fract();
        let angle = u * core::f64::consts::TAU - core::f64::consts::PI;
        let sin_out = v * 1.92 - 0.96;
        let Some(st) = state_from_section(&p, e0, angle, sin_out) else { continue };
        let mut cur = st;
        for _ in 0..steps {
            let Some(b) = bounces(&p, cur, true, 1).first().copied() else { break };
            let sec = section_of(&b.after);
            wd.survey.push(sec.0 as f32);
            wd.survey.push(sec.1 as f32);
            cur = b.after;
        }
    }
    (wd.survey.len() / 2) as u32
}

#[no_mangle] pub extern "C" fn survey_ptr() -> *const f32 { w().survey.as_ptr() }
#[no_mangle] pub extern "C" fn survey_len() -> u32 { (w().survey.len() / 2) as u32 }

#[no_mangle] pub extern "C" fn section_ptr() -> *const f32 { w().section.as_ptr() }
#[no_mangle] pub extern "C" fn section_len() -> u32 { (w().section.len() / 2) as u32 }
#[no_mangle] pub extern "C" fn spread_ptr() -> *const f32 { w().spread_hist.as_ptr() }
#[no_mangle] pub extern "C" fn spread_len() -> u32 { (w().spread_hist.len() / 2) as u32 }

#[no_mangle] pub extern "C" fn fan_ptr() -> *const f32 { w().fan.as_ptr() }
#[no_mangle] pub extern "C" fn fan_count() -> u32 { w().fan_n as u32 }
#[no_mangle] pub extern "C" fn fan_points() -> u32 { w().fan_pts as u32 }
/// Spread after `depth+1` bounces, 0 focused … 1 scattered.
#[no_mangle]
pub extern "C" fn spread_at(depth: u32) -> f64 {
    let wd = w();
    if (depth as usize) < wd.spread_k { wd.spread[depth as usize] } else { 0.0 }
}

/// Lyapunov exponent so far, in nats per unit time. Positive is chaos.
#[no_mangle]
pub extern "C" fn lyapunov() -> f64 {
    let wd = w();
    if wd.lyap_t <= 0.0 || wd.lyap_n == 0 { 0.0 } else { wd.lyap_sum / wd.lyap_t }
}

/// The same, per bounce rather than per unit time — the natural unit for a
/// billiard, and the one his "four bounces ahead" is counted in.
#[no_mangle]
pub extern "C" fn lyapunov_per_bounce() -> f64 {
    let wd = w();
    if wd.lyap_n == 0 { 0.0 } else { wd.lyap_sum / wd.lyap_n as f64 }
}

/// Turn a point clicked on the Poincaré section back into a ball.
///
/// `angle` is the place on the rim, `sin_out` the sine of the launch angle; the
/// speed comes from the energy of the run in progress, so a click lands on the
/// same energy surface as the picture it was clicked on.
#[no_mangle]
pub extern "C" fn launch_from_section(angle: f64, sin_out: f64) -> u32 {
    let wd = w();
    let p = wd.p;
    let (x, y) = (p.radius * angle.cos(), p.radius * angle.sin());
    let ke = wd.e0 - p.gravity * y;
    if ke <= 1e-9 { return 0; }
    let speed = (2.0 * ke).sqrt();
    let s = sin_out.clamp(-0.999, 0.999);
    let c = -(1.0 - s * s).sqrt();      // inward
    let (nx, ny) = (angle.cos(), angle.sin());
    let vx = speed * (c * nx - s * ny);
    let vy = speed * (c * ny + s * nx);
    launch(x, y, vx, vy);
    1
}

#[cfg(test)]
mod tests;
