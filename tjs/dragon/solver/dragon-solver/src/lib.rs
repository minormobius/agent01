//! Two-body **aerial-combat** integrator for duelling male dragonflies.
//!
//! After Fabian, Yarger, Chen & Lin, "The aerial combat strategy of dragonflies",
//! *J. R. Soc. Interface* 23:20260131 (2026). Field stereo-videography of *Trithemis
//! aurora* territorial contests showed the fights are governed by a **simple visual
//! guidance rule** rather than by interception/capture: each male steers to hold his
//! rival at a fixed spot in the frontal visual field — dead ahead but *slightly
//! elevated* — and **modulates speed** by range (slowing when close to avoid a direct
//! collision). Flying at sub-maximal speed lets him turn more tightly. Both rivals run
//! the *same* rule, so chaser/evader roles reverse **emergently**, and looping and
//! spiralling flight fall out of the coupled dynamics with no explicit choreography.
//!
//! ## The law, per flyer, per step
//!
//! 1. **Aim** the forward axis so the rival sits dead-ahead and `elev_set` above the eye
//!    horizon (`desired_forward`). This frontal pursuit, with the turn rate capped, is
//!    what makes an overshooting flyer loop back — the source of the loops/spirals.
//! 2. **Altitude band**: a soft restoring bias keeps the contest inside a vertical band
//!    (the territory volume above the perch/water), so the symmetric elevation
//!    preference can't run away into an endless climb or dive.
//! 3. **Collision avoidance**: inside a close bubble the flyer jukes *sideways* (the
//!    paper's "modulate speed to avoid direct collision", realised here as a lateral
//!    break so bodies never pass through one another).
//! 4. **Flight envelope**: the commanded heading is pitch-limited (no vertical dives).
//! 5. **Speed modulation**: cruise at the sub-maximal preferred speed when far, brake
//!    toward `speed_min` when inside `standoff`.
//!
//! Dependency-free (no serde) so it `cargo test`s offline; the browser talks to it
//! through the sibling `dragon-solver-wasm` JSON wrapper, and a JS mirror
//! (`dragon-sim.js`) reproduces the exact same law so the page runs with or without the
//! wasm and the two can be cross-checked (`dragon-sim.selftest.mjs`).

// ── minimal 3-vector (y is up, matching three.js) ────────────────────────────────
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct V3 {
    pub x: f64,
    pub y: f64,
    pub z: f64,
}
impl V3 {
    pub const fn new(x: f64, y: f64, z: f64) -> Self {
        V3 { x, y, z }
    }
    pub fn add(self, o: V3) -> V3 {
        V3::new(self.x + o.x, self.y + o.y, self.z + o.z)
    }
    pub fn sub(self, o: V3) -> V3 {
        V3::new(self.x - o.x, self.y - o.y, self.z - o.z)
    }
    pub fn scale(self, s: f64) -> V3 {
        V3::new(self.x * s, self.y * s, self.z * s)
    }
    pub fn dot(self, o: V3) -> f64 {
        self.x * o.x + self.y * o.y + self.z * o.z
    }
    pub fn cross(self, o: V3) -> V3 {
        V3::new(
            self.y * o.z - self.z * o.y,
            self.z * o.x - self.x * o.z,
            self.x * o.y - self.y * o.x,
        )
    }
    pub fn len(self) -> f64 {
        self.dot(self).sqrt()
    }
    pub fn norm(self) -> V3 {
        let l = self.len();
        if l < 1e-12 {
            V3::new(0.0, 0.0, 1.0)
        } else {
            self.scale(1.0 / l)
        }
    }
}

const WORLD_UP: V3 = V3::new(0.0, 1.0, 0.0);

fn clamp(v: f64, lo: f64, hi: f64) -> f64 {
    if v < lo {
        lo
    } else if v > hi {
        hi
    } else {
        v
    }
}

/// Rodrigues rotation of `v` about unit axis `k` by `ang` radians.
fn rot(v: V3, k: V3, ang: f64) -> V3 {
    let (s, c) = ang.sin_cos();
    v.scale(c)
        .add(k.cross(v).scale(s))
        .add(k.scale(k.dot(v) * (1.0 - c)))
}

/// Right-handed body frame for an agent flying along `fwd`. Falls back gracefully when
/// the heading is (anti)parallel to world-up (a vertical climb/dive).
fn body_frame(fwd: V3) -> (V3, V3) {
    let f = fwd.norm();
    let mut right = f.cross(WORLD_UP);
    if right.len() < 1e-6 {
        right = f.cross(V3::new(0.0, 0.0, 1.0));
        if right.len() < 1e-6 {
            right = V3::new(1.0, 0.0, 0.0);
        }
    }
    let right = right.norm();
    let up = right.cross(f).norm();
    (right, up)
}

/// Clamp a heading's pitch to +/- `max_pitch` (radians) — a flight envelope so nobody
/// dives or climbs vertically. Leaves a (near-)vertical heading untouched (no azimuth to
/// preserve), which the guidance terms upstream keep from arising in practice.
fn pitch_limit(f: V3, max_pitch: f64) -> V3 {
    let f = f.norm();
    let m = max_pitch.sin();
    if f.y.abs() <= m {
        return f;
    }
    let h = (f.x * f.x + f.z * f.z).sqrt();
    if h < 1e-9 {
        return f;
    }
    let yc = f.y.signum() * m;
    let hs = (1.0 - yc * yc).max(0.0).sqrt();
    V3::new(f.x / h * hs, yc, f.z / h * hs).norm()
}

/// Where should this flyer's rival sit? The desired forward is `d` (unit dir to rival)
/// tilted *down* by `elev_set`, so steering onto it puts the rival dead-ahead and
/// `elev_set` above the eye horizon.
fn desired_forward(d: V3, elev_set: f64) -> V3 {
    let mut axis = d.cross(WORLD_UP);
    if axis.len() < 1e-6 {
        return d; // rival directly overhead/below: no well-defined azimuth
    }
    axis = axis.norm();
    let cand = rot(d, axis, elev_set);
    if cand.y <= d.y {
        cand
    } else {
        rot(d, axis, -elev_set)
    }
}

/// Look angles of `d` in a body frame (fwd, right, up): (azimuth +right, elevation +up).
fn look_angles(d: V3, fwd: V3, right: V3, up: V3) -> (f64, f64) {
    let cf = d.dot(fwd);
    let cr = d.dot(right);
    let cu = d.dot(up);
    (cr.atan2(cf), cu.atan2(cf))
}

/// One flyer's live state.
#[derive(Clone, Copy, Debug)]
pub struct Agent {
    pub pos: V3,
    pub vel: V3,
}

/// Contest configuration. Angles in radians, lengths in metres, speeds in m/s.
#[derive(Clone, Copy, Debug)]
pub struct Config {
    pub dt: f64,
    pub steps: usize,
    // guidance rule
    /// Elevation set-point: hold the rival this far *above* dead-ahead (the paper's key
    /// finding — a slightly elevated frontal position rather than a collision course).
    pub elev_set: f64,
    /// Steering stiffness toward the visual set-point (per second).
    pub turn_gain: f64,
    /// Hard cap on turn rate (rad/s). With speed free to drop, radius = speed/omega, so a
    /// slower flyer turns tighter — this is what lets loops/spirals form.
    pub turn_max: f64,
    /// Flight-envelope pitch limit (rad): no vertical dives/climbs.
    pub pitch_limit: f64,
    // speed modulation by range
    pub speed_pref: f64,
    pub speed_max: f64,
    pub speed_min: f64,
    pub standoff: f64,
    pub brake_range: f64,
    pub accel_gain: f64,
    pub accel_max: f64,
    // altitude band (keeps the symmetric elevation preference from running away)
    pub alt_base: f64,
    pub alt_halfband: f64,
    pub band_gain: f64,
    // short-range lateral collision avoidance
    pub avoid_bubble: f64,
    pub avoid_gain: f64,
    // initial conditions + asymmetry
    pub a: Agent,
    pub b: Agent,
    /// Per-agent asymmetry in preferred speed (b=pref*(1+asym), a=pref*(1-asym)).
    pub asym: f64,
}

impl Default for Config {
    /// The "matched duel" preset: two evenly-matched rivals that loop, jockey, and swap
    /// chaser/evader roles — the paper's signature contest.
    fn default() -> Self {
        Config {
            dt: 1.0 / 120.0,
            steps: 1440,
            elev_set: 0.17,
            turn_gain: 8.0,
            turn_max: 5.0,
            pitch_limit: 55.0_f64.to_radians(),
            speed_pref: 3.2,
            speed_max: 5.0,
            speed_min: 2.2,
            standoff: 1.8,
            brake_range: 0.7,
            accel_gain: 4.0,
            accel_max: 14.0,
            alt_base: 2.2,
            alt_halfband: 1.3,
            band_gain: 0.9,
            avoid_bubble: 0.9,
            avoid_gain: 1.6,
            a: Agent {
                pos: V3::new(0.0, 2.4, -2.0),
                vel: V3::new(1.6, 0.0, 2.8),
            },
            b: Agent {
                pos: V3::new(0.0, 2.0, 2.0),
                vel: V3::new(-1.6, 0.0, -2.8),
            },
            asym: 0.0,
        }
    }
}

/// Per-frame kinematics for one flyer, plus how it sees its rival.
#[derive(Clone, Copy, Debug, Default)]
pub struct Sample {
    pub pos: V3,
    pub vel: V3,
    pub speed: f64,
    pub turn_rate: f64,
    pub range: f64,
    /// Rival's azimuth in this flyer's eye (rad; +right, 0 = dead ahead).
    pub azimuth: f64,
    /// Rival's elevation in this flyer's eye (rad; +up). Driven toward `elev_set`.
    pub elevation: f64,
}

/// Full contest trajectory.
pub struct SimOut {
    pub t: Vec<f64>,
    pub a: Vec<Sample>,
    pub b: Vec<Sample>,
    /// Role balance in [-1,1]: +1 => A firmly on B's tail, -1 => B on A's tail. Sign
    /// flips mark the emergent chaser/evader role reversals.
    pub role: Vec<f64>,
}

/// Advance one flyer one step under the full guidance rule; returns (new state, sample).
fn step_agent(me: Agent, foe: Agent, pref: f64, cfg: &Config) -> (Agent, Sample) {
    let to_foe = foe.pos.sub(me.pos);
    let range = to_foe.len();
    let d = to_foe.norm();

    let speed0 = me.vel.len();
    let fwd = if speed0 > 1e-6 { me.vel.norm() } else { d };
    let (right, up) = body_frame(fwd);
    let (az, el) = look_angles(d, fwd, right, up);

    // (1) frontal + elevated aim
    let mut f_des = desired_forward(d, cfg.elev_set);
    // (2) altitude band: bias back toward the territory volume
    let alt_err = clamp((me.pos.y - cfg.alt_base) / cfg.alt_halfband, -1.0, 1.0);
    f_des = f_des.sub(WORLD_UP.scale(alt_err * cfg.band_gain)).norm();
    // (3) lateral collision avoidance inside the bubble
    if range < cfg.avoid_bubble {
        let w = clamp((cfg.avoid_bubble - range) / cfg.avoid_bubble, 0.0, 1.0);
        let mut side = WORLD_UP.cross(d);
        if side.len() < 1e-6 {
            side = right;
        }
        side = side.norm();
        if side.dot(right) < 0.0 {
            side = side.scale(-1.0);
        }
        f_des = f_des.scale(1.0 - w).add(side.scale(w * cfg.avoid_gain)).norm();
    }
    // (4) flight envelope
    f_des = pitch_limit(f_des, cfg.pitch_limit);

    // steer: rotate forward toward f_des, rate-limited
    let ang = fwd.dot(f_des).clamp(-1.0, 1.0).acos();
    let cmd = (cfg.turn_gain * ang).min(cfg.turn_max);
    let step_ang = (cmd * cfg.dt).min(ang);
    let new_fwd = if ang < 1e-9 {
        fwd
    } else {
        pitch_limit(rot(fwd, fwd.cross(f_des).norm(), step_ang), cfg.pitch_limit)
    };
    let turn_rate = step_ang / cfg.dt;

    // (5) speed modulation by range
    let t = clamp((range - cfg.brake_range) / (cfg.standoff - cfg.brake_range), 0.0, 1.0);
    let speed_target =
        clamp(cfg.speed_min + t * (pref - cfg.speed_min), cfg.speed_min, cfg.speed_max);
    let dv_cap = cfg.accel_max * cfg.dt;
    let dv = clamp(cfg.accel_gain * (speed_target - speed0) * cfg.dt, -dv_cap, dv_cap);
    let new_speed = clamp(speed0 + dv, cfg.speed_min, cfg.speed_max);

    let new_vel = new_fwd.scale(new_speed);
    let new_pos = me.pos.add(new_vel.scale(cfg.dt));

    let sample = Sample {
        pos: me.pos,
        vel: me.vel,
        speed: speed0,
        turn_rate,
        range,
        azimuth: az,
        elevation: el,
    };
    (
        Agent {
            pos: new_pos,
            vel: new_vel,
        },
        sample,
    )
}

/// Chase score for `me` against `foe`: high when the rival is in front of me *and* I am
/// behind the rival (seeing its tail). Product of frontal-alignment and on-the-tail.
fn chase_score(me: Agent, foe: Agent) -> f64 {
    let d = foe.pos.sub(me.pos).norm();
    let frontal = me.vel.norm().dot(d).max(0.0);
    let on_tail = foe.vel.norm().dot(d).max(0.0);
    frontal * on_tail
}

/// Integrate the whole contest.
pub fn simulate(cfg: &Config) -> SimOut {
    let n = cfg.steps;
    let mut a = cfg.a;
    let mut b = cfg.b;
    let pref_a = cfg.speed_pref * (1.0 - cfg.asym);
    let pref_b = cfg.speed_pref * (1.0 + cfg.asym);

    let mut t = Vec::with_capacity(n);
    let mut sa = Vec::with_capacity(n);
    let mut sb = Vec::with_capacity(n);
    let mut role = Vec::with_capacity(n);

    for i in 0..n {
        let (na, samp_a) = step_agent(a, b, pref_a, cfg);
        let (nb, samp_b) = step_agent(b, a, pref_b, cfg);

        let ca = chase_score(a, b);
        let cb = chase_score(b, a);
        role.push((ca - cb) / (ca + cb + 1e-9));

        t.push(i as f64 * cfg.dt);
        sa.push(samp_a);
        sb.push(samp_b);
        a = na;
        b = nb;
    }

    SimOut { t, a: sa, b: sb, role }
}

// ═══════════════════════════════════════════════════════════════════════════════════
// TAG — two flyers with distinct "brains" play tag. One is IT (pursuer, chases to the
// frontal set-point); the other evades (flees + jukes). When IT closes inside `tag_range`
// the roles SWAP (after a cooldown). A round is a fixed clock; the bounded arena corners
// the evader so catches happen. Mirror of the JS `simulateTag`.
// ═══════════════════════════════════════════════════════════════════════════════════

/// A flyer's "brain": the parameters that make two competitors behave differently.
#[derive(Clone, Copy, Debug)]
pub struct Brain {
    pub speed_pref: f64,
    pub speed_max: f64,
    pub speed_min: f64,
    pub turn_gain: f64,
    pub turn_max: f64,
    pub pitch_limit: f64,
    pub accel_gain: f64,
    pub accel_max: f64,
    pub elev_set: f64,
    pub juke: f64,
    pub juke_freq: f64,
}

/// A default brain; layer overrides for the two competitors.
pub fn default_brain() -> Brain {
    Brain {
        speed_pref: 4.0,
        speed_max: 5.5,
        speed_min: 1.8,
        turn_gain: 9.0,
        turn_max: 6.5,
        pitch_limit: 55.0_f64.to_radians(),
        accel_gain: 6.0,
        accel_max: 20.0,
        elev_set: 0.14,
        juke: 0.9,
        juke_freq: 5.0,
    }
}

/// One tag round.
#[derive(Clone, Copy, Debug)]
pub struct TagConfig {
    pub dt: f64,
    pub steps: usize,
    pub brain_a: Brain,
    pub brain_b: Brain,
    pub a_is_it: bool,
    pub tag_range: f64,
    pub cooldown: f64,
    pub arena_r: f64,
    pub alt_base: f64,
    pub alt_halfband: f64,
    pub band_gain: f64,
    pub a: Agent,
    pub b: Agent,
}

/// Result of one tag round.
pub struct TagOut {
    pub t: Vec<f64>,
    pub a: Vec<Sample>,
    pub b: Vec<Sample>,
    /// 0 => A is IT (pursuer), 1 => B is IT, per frame.
    pub it: Vec<u8>,
    /// Frame indices where a tag (role swap) happened.
    pub tags: Vec<usize>,
    pub it_time_a: f64,
    pub it_time_b: f64,
}

/// Soft arena containment: bias a desired-forward back toward the centre near the wall.
fn contain(p: V3, fdes: V3, arena_r: f64) -> V3 {
    let r = (p.x * p.x + p.z * p.z).sqrt();
    if r < arena_r * 0.8 {
        return fdes;
    }
    let inward = V3::new(-p.x, 0.0, -p.z).norm();
    let w = clamp((r - arena_r * 0.8) / (arena_r * 0.35), 0.0, 1.0);
    fdes.scale(1.0 - w).add(inward.scale(w)).norm()
}

/// Advance one flyer one tag-step. `pursuer` = is this flyer IT.
fn step_tag(me: Agent, foe: Agent, brain: &Brain, pursuer: bool, t: f64, phase: f64, cfg: &TagConfig) -> (Agent, Sample) {
    let to_foe = foe.pos.sub(me.pos);
    let range = to_foe.len();
    let d = to_foe.norm();
    let speed0 = me.vel.len();
    let fwd = if speed0 > 1e-6 { me.vel.norm() } else { d };
    let (right, up) = body_frame(fwd);
    let (az, el) = look_angles(d, fwd, right, up);

    let mut f_des;
    if pursuer {
        f_des = desired_forward(d, brain.elev_set);
    } else {
        f_des = d.scale(-1.0);
        let mut side = WORLD_UP.cross(d);
        if side.len() < 1e-6 {
            side = right;
        }
        side = side.norm();
        f_des = f_des.add(side.scale(brain.juke * (t * brain.juke_freq + phase).sin())).norm();
    }
    let alt_err = clamp((me.pos.y - cfg.alt_base) / cfg.alt_halfband, -1.0, 1.0);
    f_des = f_des.sub(WORLD_UP.scale(alt_err * cfg.band_gain)).norm();
    f_des = contain(me.pos, f_des, cfg.arena_r);
    f_des = pitch_limit(f_des, brain.pitch_limit);

    let ang = fwd.dot(f_des).clamp(-1.0, 1.0).acos();
    let cmd = (brain.turn_gain * ang).min(brain.turn_max);
    let step_ang = (cmd * cfg.dt).min(ang);
    let new_fwd = if ang < 1e-9 {
        fwd
    } else {
        pitch_limit(rot(fwd, fwd.cross(f_des).norm(), step_ang), brain.pitch_limit)
    };
    let turn_rate = step_ang / cfg.dt;

    let target = if pursuer { brain.speed_pref } else { brain.speed_pref * 0.94 };
    let dv_cap = brain.accel_max * cfg.dt;
    let dv = clamp(brain.accel_gain * (target - speed0) * cfg.dt, -dv_cap, dv_cap);
    let new_speed = clamp(speed0 + dv, brain.speed_min, brain.speed_max);

    let new_vel = new_fwd.scale(new_speed);
    let new_pos = me.pos.add(new_vel.scale(cfg.dt));
    (
        Agent { pos: new_pos, vel: new_vel },
        Sample { pos: me.pos, vel: me.vel, speed: speed0, turn_rate, range, azimuth: az, elevation: el },
    )
}

/// Play one tag round.
pub fn simulate_tag(cfg: &TagConfig) -> TagOut {
    let n = cfg.steps;
    let mut a = cfg.a;
    let mut b = cfg.b;
    let mut a_it = cfg.a_is_it;
    let cool = (cfg.cooldown / cfg.dt).round() as i64;
    let mut last_tag: i64 = -cool - 1;
    let mut out = TagOut {
        t: Vec::with_capacity(n), a: Vec::with_capacity(n), b: Vec::with_capacity(n),
        it: Vec::with_capacity(n), tags: Vec::new(), it_time_a: 0.0, it_time_b: 0.0,
    };
    for i in 0..n {
        let t = i as f64 * cfg.dt;
        let (na, sa) = step_tag(a, b, &cfg.brain_a, a_it, t, 0.0, cfg);
        let (nb, sb) = step_tag(b, a, &cfg.brain_b, !a_it, t, std::f64::consts::PI, cfg);
        out.t.push(t);
        out.it.push(if a_it { 0 } else { 1 });
        if a_it {
            out.it_time_a += cfg.dt;
        } else {
            out.it_time_b += cfg.dt;
        }
        let range = a.pos.sub(b.pos).len();
        if range < cfg.tag_range && (i as i64 - last_tag) > cool {
            a_it = !a_it;
            last_tag = i as i64;
            out.tags.push(i);
        }
        out.a.push(sa);
        out.b.push(sb);
        a = na;
        b = nb;
    }
    out
}

// ────────────────────────────────────────────────────────────────────────────────
#[cfg(test)]
mod tests {
    use super::*;

    fn tag_cfg(brain_a: Brain, brain_b: Brain, a_is_it: bool) -> TagConfig {
        TagConfig {
            dt: 1.0 / 120.0, steps: 2160,
            brain_a, brain_b, a_is_it,
            tag_range: 0.45, cooldown: 0.6,
            arena_r: 6.6, alt_base: 2.4, alt_halfband: 1.5, band_gain: 0.9,
            a: Agent { pos: V3::new(-2.4, 2.4, 0.0), vel: V3::new(3.0, 0.0, 0.6) },
            b: Agent { pos: V3::new(2.4, 2.4, 0.0), vel: V3::new(-3.0, 0.0, -0.6) },
        }
    }

    fn approx(a: f64, b: f64, tol: f64) -> bool {
        (a - b).abs() <= tol
    }

    #[test]
    fn finite_and_bounded() {
        let out = simulate(&Config::default());
        let cfg = Config::default();
        assert_eq!(out.a.len(), cfg.steps);
        for s in out.a.iter().chain(out.b.iter()) {
            for c in [s.pos.x, s.pos.y, s.pos.z, s.speed, s.turn_rate, s.range, s.azimuth, s.elevation]
            {
                assert!(c.is_finite(), "non-finite sample field");
            }
            assert!(s.speed <= cfg.speed_max + 1e-6 && s.speed >= cfg.speed_min - 1e-6);
        }
        for r in &out.role {
            assert!(r.is_finite() && *r >= -1.0 - 1e-9 && *r <= 1.0 + 1e-9);
        }
    }

    #[test]
    fn deterministic() {
        let a = simulate(&Config::default());
        let b = simulate(&Config::default());
        for i in 0..a.a.len() {
            assert_eq!(a.a[i].pos, b.a[i].pos);
            assert_eq!(a.b[i].pos, b.b[i].pos);
        }
    }

    #[test]
    fn altitude_band_prevents_runaway() {
        // The symmetric elevation preference must NOT drive an endless climb/dive: every
        // sample stays within a couple of half-bands of the base altitude.
        let out = simulate(&Config::default());
        let cfg = Config::default();
        let lim = cfg.alt_halfband * 2.5;
        for s in out.a.iter().chain(out.b.iter()) {
            assert!(
                (s.pos.y - cfg.alt_base).abs() < lim,
                "altitude {} escaped the band around {}",
                s.pos.y,
                cfg.alt_base
            );
        }
    }

    #[test]
    fn bodies_never_interpenetrate() {
        // The lateral avoidance keeps a minimum separation — no pass-through.
        let out = simulate(&Config::default());
        let min_r = out.a.iter().map(|s| s.range).fold(f64::INFINITY, f64::min);
        assert!(min_r > 0.1, "min separation {min_r} too small (interpenetration)");
    }

    #[test]
    fn desired_forward_puts_rival_above_and_ahead() {
        let d = V3::new(0.0, 0.0, 1.0).norm();
        let elev = 15.0_f64.to_radians();
        let fdes = desired_forward(d, elev);
        let (right, up) = body_frame(fdes);
        let (az, el) = look_angles(d, fdes, right, up);
        assert!(approx(az, 0.0, 1e-6), "azimuth should be ~0, got {az}");
        assert!(approx(el, elev, 1e-6), "elevation should be elev_set, got {el} want {elev}");
    }

    #[test]
    fn controller_drives_elevation_toward_setpoint() {
        // A single flyer chasing a rival pinned FAR away should pull the rival's
        // elevation-in-eye toward elev_set. Band disabled to isolate the pursuit law.
        let mut cfg = Config::default();
        cfg.elev_set = 14.0_f64.to_radians();
        cfg.band_gain = 0.0;
        cfg.avoid_bubble = 0.0;
        cfg.steps = 400;
        cfg.a = Agent { pos: V3::new(0.0, 1.0, 0.0), vel: V3::new(0.0, 0.0, 3.0) };
        cfg.b = Agent { pos: V3::new(20.0, 5.0, 200.0), vel: V3::new(0.0, 0.0, 0.0) };
        let mut me = cfg.a;
        let foe = cfg.b;
        let mut last_el = 0.0;
        for _ in 0..cfg.steps {
            let (nm, s) = step_agent(me, foe, cfg.speed_pref, &cfg);
            me = nm;
            last_el = s.elevation;
        }
        assert!(
            approx(last_el, cfg.elev_set, 6.0_f64.to_radians()),
            "elevation {} deg did not settle near set-point {} deg",
            last_el.to_degrees(),
            cfg.elev_set.to_degrees()
        );
    }

    #[test]
    fn larger_standoff_lowers_mean_speed() {
        // "When a dragonfly gets too close, it slows down." A larger braking envelope
        // (standoff) => more braking => not-faster mean speed.
        let mean_speed = |cfg: &Config| {
            let o = simulate(cfg);
            let s: f64 = o.a.iter().chain(o.b.iter()).map(|x| x.speed).sum();
            s / (o.a.len() as f64 * 2.0)
        };
        let mut loose = Config::default();
        loose.standoff = 3.0;
        loose.brake_range = 1.2;
        let mut tight = Config::default();
        tight.standoff = 0.9;
        tight.brake_range = 0.3;
        assert!(mean_speed(&loose) <= mean_speed(&tight) + 1e-9);
    }

    #[test]
    fn roles_reverse_at_least_once() {
        let out = simulate(&Config::default());
        let mut flips = 0;
        let mut prev = out.role[5].signum();
        for r in out.role.iter().skip(6) {
            let s = r.signum();
            if s != 0.0 && prev != 0.0 && s != prev {
                flips += 1;
            }
            if s != 0.0 {
                prev = s;
            }
        }
        assert!(flips >= 1, "expected at least one role reversal, got {flips}");
    }

    // ── tag ──────────────────────────────────────────────────────────────────────
    #[test]
    fn tag_time_accounts_for_the_whole_round() {
        let cfg = tag_cfg(default_brain(), default_brain(), true);
        let out = simulate_tag(&cfg);
        let total = cfg.steps as f64 * cfg.dt;
        assert!((out.it_time_a + out.it_time_b - total).abs() < 1e-6, "IT time must cover the round");
    }

    #[test]
    fn tag_swaps_roles_and_it_flag_tracks_it() {
        // asymmetric, catchable brains → several tags, and every tag flips the IT flag.
        let a = Brain { turn_max: 9.0, juke: 1.3, ..default_brain() };
        let b = Brain { turn_max: 5.0, juke: 0.4, ..default_brain() };
        let out = simulate_tag(&tag_cfg(a, b, true));
        assert!(!out.tags.is_empty(), "asymmetric brains should produce tags");
        for &f in &out.tags {
            if f + 1 < out.it.len() {
                assert_ne!(out.it[f], out.it[f + 1], "IT flag must flip right after a tag frame");
            }
        }
    }

    #[test]
    fn tag_is_deterministic() {
        let a = simulate_tag(&tag_cfg(default_brain(), default_brain(), true));
        let b = simulate_tag(&tag_cfg(default_brain(), default_brain(), true));
        assert_eq!(a.it_time_a, b.it_time_a);
        assert_eq!(a.tags, b.tags);
        for i in 0..a.a.len() {
            assert_eq!(a.a[i].pos, b.a[i].pos);
        }
    }

    #[test]
    fn tag_stays_in_the_arena_and_finite() {
        let cfg = tag_cfg(default_brain(), Brain { speed_pref: 4.5, ..default_brain() }, false);
        let out = simulate_tag(&cfg);
        for s in out.a.iter().chain(out.b.iter()) {
            for c in [s.pos.x, s.pos.y, s.pos.z, s.speed] {
                assert!(c.is_finite(), "non-finite tag sample");
            }
            let r = (s.pos.x * s.pos.x + s.pos.z * s.pos.z).sqrt();
            assert!(r < cfg.arena_r * 1.3, "flyer left the arena (r={r})");
        }
    }

    #[test]
    fn tag_cooldown_prevents_instant_re_tag() {
        let out = simulate_tag(&tag_cfg(default_brain(), default_brain(), true));
        let cool = (0.6_f64 / (1.0 / 120.0)).round() as usize;
        for w in out.tags.windows(2) {
            assert!(w[1] - w[0] > cool, "two tags closer than the cooldown ({} apart)", w[1] - w[0]);
        }
    }
}
