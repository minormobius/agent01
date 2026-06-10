// The physics engine. Continuous 2D — no grid. A ball is launched once (angle +
// power) and flies under a sum of forces until it reaches the goal, comes to
// rest, or times out. Everything is deterministic: fixed timestep, no randomness
// in the sim, IEEE-754 f64 throughout. That determinism is what lets the solver
// trust a simulated outcome and what makes /flux/?n=<n> a permalink.
//
// The Rust engine in engine-rs/ mirrors this exactly; because the solver only
// keeps BASIN-ROBUST solutions (a comfortable margin inside a winning region),
// tiny float divergence between the two engines never flips a stored answer.

export const ARENA = 100;        // world is ARENA × ARENA units
export const DT = 1 / 120;       // fixed timestep
export const MAX_STEPS = 1100;   // ~9.2 sim-seconds
export const BALL_R = 1.6;
export const REST_SPEED = 2.2;   // below this (and not in goo) → "at rest"
export const POWER_MIN = 26;
export const POWER_MAX = 82;

// force tuning (hand-tuned in node for legible, curvy, stable trajectories)
const ATTRACT_K = 11000;  // attractor strength: |a| = K*q / d^2
const D_MIN = 4.5;        // softening distance to avoid singularities
const GRAVITY_G = 42;     // downward accel when a world has gravity
const WALL_REST = 0.84;   // restitution off arena walls
const DRAG_AIR = 0.0004;  // very gentle global drag so launches eventually settle

function clampLen(d2, min2) { return d2 < min2 ? min2 : d2; }

// One physics step (semi-implicit Euler + collision response). Mutates p, v.
function stepOnce(w, p, v, ev) {
  let ax = 0, ay = 0;
  if (w.gravity) ay += GRAVITY_G;
  // attractors (magnets q>0 attract, q<0 repel; wells = big q)
  for (const a of w.attractors) {
    const dx = a.x - p.x, dy = a.y - p.y;
    let d2 = dx * dx + dy * dy;
    d2 = clampLen(d2, D_MIN * D_MIN);
    const d = Math.sqrt(d2);
    const f = (ATTRACT_K * a.q) / (d2 * d); // = K q / d^3 * (vector) ⇒ inverse-square magnitude
    ax += f * dx; ay += f * dy;
  }
  // integrate velocity
  v.x += ax * DT; v.y += ay * DT;
  // global + goo drag
  let drag = DRAG_AIR;
  let inGoo = false;
  for (const g of w.goo) {
    const dx = p.x - g.x, dy = p.y - g.y;
    if (dx * dx + dy * dy <= g.rad * g.rad) { drag += g.drag; inGoo = true; }
  }
  if (inGoo) ev.gooSteps++;
  const damp = 1 - drag;
  v.x *= damp; v.y *= damp;
  // integrate position
  p.x += v.x * DT; p.y += v.y * DT;

  // bumpers (elastic circles)
  for (const b of w.bumpers) {
    const dx = p.x - b.x, dy = p.y - b.y;
    const rr = b.rad + BALL_R;
    const d2 = dx * dx + dy * dy;
    if (d2 < rr * rr && d2 > 1e-9) {
      const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
      const overlap = rr - d;
      p.x += nx * overlap; p.y += ny * overlap;
      const vn = v.x * nx + v.y * ny;
      if (vn < 0) { v.x -= (1 + b.rest) * vn * nx; v.y -= (1 + b.rest) * vn * ny; ev.bounces++; }
    }
  }
  // wall segments
  for (const s of w.walls) reflectSegment(p, v, s, ev);

  // arena bounds (bounce)
  if (p.x < BALL_R) { p.x = BALL_R; if (v.x < 0) { v.x = -v.x * WALL_REST; ev.bounces++; } }
  if (p.x > ARENA - BALL_R) { p.x = ARENA - BALL_R; if (v.x > 0) { v.x = -v.x * WALL_REST; ev.bounces++; } }
  if (p.y < BALL_R) { p.y = BALL_R; if (v.y < 0) { v.y = -v.y * WALL_REST; ev.bounces++; } }
  if (p.y > ARENA - BALL_R) { p.y = ARENA - BALL_R; if (v.y > 0) { v.y = -v.y * WALL_REST; ev.bounces++; } }

  return inGoo;
}

function reflectSegment(p, v, s, ev) {
  const ex = s.x2 - s.x1, ey = s.y2 - s.y1;
  const len2 = ex * ex + ey * ey;
  if (len2 < 1e-9) return;
  let t = ((p.x - s.x1) * ex + (p.y - s.y1) * ey) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const cx = s.x1 + t * ex, cy = s.y1 + t * ey;
  const dx = p.x - cx, dy = p.y - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 < BALL_R * BALL_R && d2 > 1e-9) {
    const d = Math.sqrt(d2), nx = dx / d, ny = dy / d;
    const overlap = BALL_R - d;
    p.x += nx * overlap; p.y += ny * overlap;
    const vn = v.x * nx + v.y * ny;
    if (vn < 0) { v.x -= (1 + WALL_REST) * vn * nx; v.y -= (1 + WALL_REST) * vn * ny; ev.bounces++; }
  }
}

// Simulate one launch. Returns the outcome and, if opts.trace, the sampled path.
// angle in radians, power in [POWER_MIN, POWER_MAX].
export function simulate(w, angle, power, opts = {}) {
  const p = { x: w.ball0.x, y: w.ball0.y };
  const speed = power;
  const v = { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed };
  const ev = { bounces: 0, gooSteps: 0 };
  const trace = opts.trace ? [{ x: p.x, y: p.y }] : null;
  const sample = opts.sample || 3;
  let win = false, steps = 0;
  for (let i = 0; i < MAX_STEPS; i++) {
    const inGoo = stepOnce(w, p, v, ev);
    steps++;
    // goal check
    const gdx = p.x - w.goal.x, gdy = p.y - w.goal.y;
    if (gdx * gdx + gdy * gdy <= (w.goal.rad + BALL_R * 0.5) * (w.goal.rad + BALL_R * 0.5)) { win = true; if (trace) trace.push({ x: p.x, y: p.y }); break; }
    if (trace && i % sample === 0) trace.push({ x: p.x, y: p.y });
    // rest check (only when not being held in goo, to avoid false rest mid-goo)
    const sp2 = v.x * v.x + v.y * v.y;
    if (!inGoo && sp2 < REST_SPEED * REST_SPEED) {
      // give it a few grace steps to confirm settling
      if (++ev._rest > 18) break;
    } else ev._rest = 0;
  }
  return { win, steps, restPos: { x: p.x, y: p.y }, bounces: ev.bounces, gooSteps: ev.gooSteps, trace };
}
