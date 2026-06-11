//! Rust mirror of the flux physics engine + action-space solver (see
//! ../../js/engine.js and ../../js/solver.js). This is the *independent second
//! opinion*: given a world produced by the JS generator, it re-simulates with
//! its own port of the physics and confirms (a) the world is solvable and (b)
//! the stored answer wins. Because the JS generator only ships fine-robust
//! answers, the two engines agree without bit-for-bit float parity.
//!
//! No dependencies — mirrors the repo's dependency-free Rust style and builds
//! offline.

pub const ARENA: f64 = 100.0;
pub const DT: f64 = 1.0 / 120.0;
pub const MAX_STEPS: i32 = 1100;
pub const BALL_R: f64 = 1.6;
pub const REST_SPEED: f64 = 2.2;
pub const POWER_MIN: f64 = 26.0;
pub const POWER_MAX: f64 = 82.0;

const ATTRACT_K: f64 = 11000.0;
const D_MIN: f64 = 4.5;
const GRAVITY_G: f64 = 42.0;
const WALL_REST: f64 = 0.84;
const DRAG_AIR: f64 = 0.0004;

#[derive(Clone)]
pub struct Attr { pub x: f64, pub y: f64, pub q: f64 }
#[derive(Clone)]
pub struct Goo { pub x: f64, pub y: f64, pub rad: f64, pub drag: f64 }
#[derive(Clone)]
pub struct Bump { pub x: f64, pub y: f64, pub rad: f64, pub rest: f64 }
#[derive(Clone)]
pub struct Wall { pub x1: f64, pub y1: f64, pub x2: f64, pub y2: f64 }

#[derive(Clone, Default)]
pub struct World {
    pub gravity: bool,
    pub b0: (f64, f64),
    pub goal: (f64, f64, f64),
    pub attractors: Vec<Attr>,
    pub goo: Vec<Goo>,
    pub bumpers: Vec<Bump>,
    pub walls: Vec<Wall>,
}

struct Vec2 { x: f64, y: f64 }

fn reflect_segment(p: &mut Vec2, v: &mut Vec2, s: &Wall) {
    let ex = s.x2 - s.x1; let ey = s.y2 - s.y1;
    let len2 = ex * ex + ey * ey;
    if len2 < 1e-9 { return; }
    let mut t = ((p.x - s.x1) * ex + (p.y - s.y1) * ey) / len2;
    if t < 0.0 { t = 0.0; } else if t > 1.0 { t = 1.0; }
    let cx = s.x1 + t * ex; let cy = s.y1 + t * ey;
    let dx = p.x - cx; let dy = p.y - cy;
    let d2 = dx * dx + dy * dy;
    if d2 < BALL_R * BALL_R && d2 > 1e-9 {
        let d = d2.sqrt(); let nx = dx / d; let ny = dy / d;
        let overlap = BALL_R - d;
        p.x += nx * overlap; p.y += ny * overlap;
        let vn = v.x * nx + v.y * ny;
        if vn < 0.0 { v.x -= (1.0 + WALL_REST) * vn * nx; v.y -= (1.0 + WALL_REST) * vn * ny; }
    }
}

// Returns whether the ball is currently inside goo (mirrors engine.js stepOnce).
fn step_once(w: &World, p: &mut Vec2, v: &mut Vec2) -> bool {
    let mut ax = 0.0; let mut ay = 0.0;
    if w.gravity { ay += GRAVITY_G; }
    for a in &w.attractors {
        let dx = a.x - p.x; let dy = a.y - p.y;
        let mut d2 = dx * dx + dy * dy;
        let min2 = D_MIN * D_MIN;
        if d2 < min2 { d2 = min2; }
        let d = d2.sqrt();
        let f = (ATTRACT_K * a.q) / (d2 * d);
        ax += f * dx; ay += f * dy;
    }
    v.x += ax * DT; v.y += ay * DT;
    let mut drag = DRAG_AIR;
    let mut in_goo = false;
    for g in &w.goo {
        let dx = p.x - g.x; let dy = p.y - g.y;
        if dx * dx + dy * dy <= g.rad * g.rad { drag += g.drag; in_goo = true; }
    }
    let damp = 1.0 - drag;
    v.x *= damp; v.y *= damp;
    p.x += v.x * DT; p.y += v.y * DT;

    for b in &w.bumpers {
        let dx = p.x - b.x; let dy = p.y - b.y;
        let rr = b.rad + BALL_R;
        let d2 = dx * dx + dy * dy;
        if d2 < rr * rr && d2 > 1e-9 {
            let d = d2.sqrt(); let nx = dx / d; let ny = dy / d;
            let overlap = rr - d;
            p.x += nx * overlap; p.y += ny * overlap;
            let vn = v.x * nx + v.y * ny;
            if vn < 0.0 { v.x -= (1.0 + b.rest) * vn * nx; v.y -= (1.0 + b.rest) * vn * ny; }
        }
    }
    for s in &w.walls { reflect_segment(p, v, s); }

    if p.x < BALL_R { p.x = BALL_R; if v.x < 0.0 { v.x = -v.x * WALL_REST; } }
    if p.x > ARENA - BALL_R { p.x = ARENA - BALL_R; if v.x > 0.0 { v.x = -v.x * WALL_REST; } }
    if p.y < BALL_R { p.y = BALL_R; if v.y < 0.0 { v.y = -v.y * WALL_REST; } }
    if p.y > ARENA - BALL_R { p.y = ARENA - BALL_R; if v.y > 0.0 { v.y = -v.y * WALL_REST; } }

    in_goo
}

/// Simulate one launch; returns true if the ball reaches the goal.
pub fn simulate(w: &World, angle: f64, power: f64) -> bool {
    let mut p = Vec2 { x: w.b0.0, y: w.b0.1 };
    let mut v = Vec2 { x: angle.cos() * power, y: angle.sin() * power };
    let mut rest = 0;
    let gr = w.goal.2 + BALL_R * 0.5;
    for _ in 0..MAX_STEPS {
        let in_goo = step_once(w, &mut p, &mut v);
        let gdx = p.x - w.goal.0; let gdy = p.y - w.goal.1;
        if gdx * gdx + gdy * gdy <= gr * gr { return true; }
        let sp2 = v.x * v.x + v.y * v.y;
        if !in_goo && sp2 < REST_SPEED * REST_SPEED {
            rest += 1;
            if rest > 18 { break; }
        } else { rest = 0; }
    }
    false
}

/// Sweep the action space; returns the number of winning launches found.
pub fn sweep_wins(w: &World, na: usize, np: usize) -> usize {
    let mut wins = 0;
    for i in 0..na {
        let ang = (i as f64 / na as f64) * std::f64::consts::TAU;
        for j in 0..np {
            let pw = POWER_MIN + (j as f64 / (np - 1) as f64) * (POWER_MAX - POWER_MIN);
            if simulate(w, ang, pw) { wins += 1; }
        }
    }
    wins
}

#[cfg(test)]
mod tests {
    use super::*;

    fn slingshot() -> World {
        World {
            gravity: false,
            b0: (10.0, 50.0),
            goal: (90.0, 50.0, 6.0),
            attractors: vec![Attr { x: 50.0, y: 35.0, q: 1.0 }],
            ..Default::default()
        }
    }

    #[test]
    fn straight_shot_in_empty_world_wins() {
        // no forces → a direct horizontal launch from (10,50) to (90,50) must win
        let w = World { gravity: false, b0: (10.0, 50.0), goal: (90.0, 50.0, 6.0), ..Default::default() };
        assert!(simulate(&w, 0.0, 70.0));
    }

    #[test]
    fn sweep_finds_solutions() {
        let w = slingshot();
        let wins = sweep_wins(&w, 96, 18);
        assert!(wins > 0, "solver sweep should find at least one winning launch");
    }

    #[test]
    fn out_of_the_way_launch_misses() {
        // launching away from the goal with low power should not win
        let w = slingshot();
        assert!(!simulate(&w, std::f64::consts::PI, POWER_MIN));
    }
}
