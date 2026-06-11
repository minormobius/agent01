// The physics engine — a ball constrained to the SURFACE OF A TORUS. No grid,
// and now no boundary either: the surface is closed, the world wraps.
//
// We integrate in intrinsic coordinates (u around the major circle, v around
// the tube). The torus metric is
//     ds² = A² du² + r² dv²,   A(v) = R + r·cos v
// and free motion follows the geodesic equations (Christoffel terms):
//     u̇' = (2 r sin v / A) u̇ v̇
//     v̇' = -(A sin v / r) u̇²
// — already wild on their own: geodesics on a torus precess, wind through the
// hole, and wrap the tube. External forces (magnets, gravity) are computed in
// the 3D embedding and projected onto the tangent plane:
//     a^u += (F·ê_u)/A,   a^v += (F·ê_v)/r.
//
// Deterministic: fixed timestep, f64, no randomness. The solver sweeps the 2D
// action space (heading ψ in the tangent plane × launch power) exactly like
// flux — constraining the ball to a surface is what keeps the player's degrees
// of freedom at two while the world goes 3D.

export const R_MAJ = 10;          // major radius
export const R_TUBE = 4.2;        // tube radius
export const DT = 1 / 120;
export const MAX_STEPS = 1500;    // ~12.5 sim-seconds
export const BALL_R = 0.55;       // rendering/goal scale
export const REST_SPEED = 1.1;
export const POWER_MIN = 9;
export const POWER_MAX = 34;

const ATTRACT_K = 520;            // force constant for surface magnets
const D_MIN = 1.6;                // softening distance (chord)
const GRAVITY_G = 14;             // embedded -z gravity for "heavy" worlds
const BUMP_REST = 0.86;
const DRAG_AIR = 0.0005;

const TAU = Math.PI * 2;

// ---- embedding helpers ----
export function embed(u, v) {
  const A = R_MAJ + R_TUBE * Math.cos(v);
  return { x: A * Math.cos(u), y: A * Math.sin(u), z: R_TUBE * Math.sin(v) };
}
// unit tangent vectors and outward normal at (u,v)
export function frame(u, v) {
  const su = Math.sin(u), cu = Math.cos(u), sv = Math.sin(v), cv = Math.cos(v);
  return {
    eu: { x: -su, y: cu, z: 0 },                       // ê_u
    ev: { x: -sv * cu, y: -sv * su, z: cv },           // ê_v
    n: { x: cv * cu, y: cv * su, z: sv },              // outward normal
    A: R_MAJ + R_TUBE * cv,
  };
}
function chord2(p, q) { const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z; return dx * dx + dy * dy + dz * dz; }

// One step of surface dynamics. State s = {u, v, du, dv, wu, wv} where wu/wv
// accumulate unwrapped angle travelled (for winding numbers). Computes the
// step's trig ONCE and writes the new embedded position into s.px/py/pz (used
// by the goal check) — this function is the hot loop of every solver sweep.
// Returns inGoo.
function stepOnce(w, s, ev3) {
  let cu = Math.cos(s.u), su = Math.sin(s.u);
  let cv = Math.cos(s.v), sv = Math.sin(s.v);
  let A = R_MAJ + R_TUBE * cv;

  // geodesic (curvature) terms
  let au = (2 * R_TUBE * sv / A) * s.du * s.dv;
  let av = -(A * sv / R_TUBE) * s.du * s.du;

  // external forces in the embedding, projected to the tangent plane
  if (w.zGravity || w.magnets.length) {
    const Px = A * cu, Py = A * su, Pz = R_TUBE * sv;
    let Fx = 0, Fy = 0, Fz = 0;
    if (w.zGravity) Fz -= GRAVITY_G;
    for (const m of w.magnets) {
      const Q = m._p;
      const dx = Q.x - Px, dy = Q.y - Py, dz = Q.z - Pz;
      let d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < D_MIN * D_MIN) d2 = D_MIN * D_MIN;
      const d = Math.sqrt(d2);
      const k = (ATTRACT_K * m.q) / (d2 * d);
      Fx += k * dx; Fy += k * dy; Fz += k * dz;
    }
    // ê_u = (-su, cu, 0); ê_v = (-sv·cu, -sv·su, cv)
    au += (-Fx * su + Fy * cu) / A;
    av += (-Fx * sv * cu - Fy * sv * su + Fz * cv) / R_TUBE;
  }

  s.du += au * DT; s.dv += av * DT;

  // position update first, then drag/goo/bumpers evaluated at the new point
  const stepU = s.du * DT, stepV = s.dv * DT;
  s.u += stepU; s.v += stepV;
  s.wu += stepU; s.wv += stepV;
  if (s.u > TAU) s.u -= TAU; else if (s.u < 0) s.u += TAU;
  if (s.v > TAU) s.v -= TAU; else if (s.v < 0) s.v += TAU;

  cu = Math.cos(s.u); su = Math.sin(s.u);
  cv = Math.cos(s.v); sv = Math.sin(s.v);
  A = R_MAJ + R_TUBE * cv;
  const Px = A * cu, Py = A * su, Pz = R_TUBE * sv;
  s.px = Px; s.py = Py; s.pz = Pz;

  // drag (air + goo patches, chord test at the new position)
  let drag = DRAG_AIR, inGoo = false;
  for (const g of w.goo) {
    const dx = Px - g._p.x, dy = Py - g._p.y, dz = Pz - g._p.z;
    if (dx * dx + dy * dy + dz * dz <= g.rad * g.rad) { drag += g.drag; inGoo = true; }
  }
  const damp = 1 - drag;
  s.du *= damp; s.dv *= damp;

  // bumpers: circles on the surface; reflect the tangent velocity about the
  // surface direction away from the bumper centre
  for (const b of w.bumpers) {
    const rr = b.rad + BALL_R;
    let dx = Px - b._p.x, dy = Py - b._p.y, dz = Pz - b._p.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < rr * rr && d2 > 1e-12) {
      // normal n̂ = (cv·cu, cv·su, sv); project chord dir onto tangent plane
      const nx = cv * cu, ny = cv * su, nz = sv;
      const dn = dx * nx + dy * ny + dz * nz;
      dx -= dn * nx; dy -= dn * ny; dz -= dn * nz;
      const dl = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dl < 1e-9) continue;
      dx /= dl; dy /= dl; dz /= dl;
      // 3D tangent velocity from (du, dv): V = ê_u·A·du + ê_v·r·dv
      const eux = -su, euy = cu;                       // euz = 0
      const evx = -sv * cu, evy = -sv * su, evz = cv;
      let Vx = eux * A * s.du + evx * R_TUBE * s.dv;
      let Vy = euy * A * s.du + evy * R_TUBE * s.dv;
      let Vz = evz * R_TUBE * s.dv;
      const vn = Vx * dx + Vy * dy + Vz * dz;
      if (vn < 0) {
        Vx -= (1 + BUMP_REST) * vn * dx; Vy -= (1 + BUMP_REST) * vn * dy; Vz -= (1 + BUMP_REST) * vn * dz;
        s.du = (Vx * eux + Vy * euy) / A;
        s.dv = (Vx * evx + Vy * evy + Vz * evz) / R_TUBE;
        ev3.bounces++;
      }
      const overlap = (rr - Math.sqrt(d2)) * 0.6;
      s.u += (dx * eux + dy * euy) / A * overlap;
      s.v += (dx * evx + dy * evy + dz * evz) / R_TUBE * overlap;
    }
  }
  if (inGoo) ev3.gooSteps++;
  return inGoo;
}

// Precompute embedded positions for world items (call once after building).
export function bake(w) {
  for (const m of w.magnets) m._p = embed(m.u, m.v);
  for (const g of w.goo) g._p = embed(g.u, g.v);
  for (const b of w.bumpers) b._p = embed(b.u, b.v);
  w._goal = embed(w.goal.u, w.goal.v);
  return w;
}

// Simulate one launch from w.ball0 with heading ψ (in the tangent plane,
// ψ=0 along ê_u) and speed `power`. Returns outcome + winding numbers.
export function simulate(w, psi, power, opts = {}) {
  const f0 = frame(w.ball0.u, w.ball0.v);
  const s = {
    u: w.ball0.u, v: w.ball0.v,
    du: power * Math.cos(psi) / f0.A,
    dv: power * Math.sin(psi) / R_TUBE,
    wu: 0, wv: 0,
  };
  const ev3 = { bounces: 0, gooSteps: 0, rest: 0 };
  const trace = opts.trace ? [{ u: s.u, v: s.v }] : null;
  const sample = opts.sample || 3;
  const gr = w.goal.rad + BALL_R * 0.5;
  let win = false, steps = 0;
  const gx = w._goal.x, gy = w._goal.y, gz = w._goal.z, gr2 = gr * gr;
  for (let i = 0; i < MAX_STEPS; i++) {
    const inGoo = stepOnce(w, s, ev3);
    steps++;
    const dx = s.px - gx, dy = s.py - gy, dz = s.pz - gz;
    if (dx * dx + dy * dy + dz * dz <= gr2) { win = true; if (trace) trace.push({ u: s.u, v: s.v }); break; }
    if (trace && i % sample === 0) trace.push({ u: s.u, v: s.v });
    // speed² = A²du² + r²dv²; A is implied by s.pz-free relation — recompute cheaply
    const A = R_MAJ + R_TUBE * Math.cos(s.v);
    const sp2 = A * A * s.du * s.du + R_TUBE * R_TUBE * s.dv * s.dv;
    if (!inGoo && sp2 < REST_SPEED * REST_SPEED) { if (++ev3.rest > 20) break; }
    else ev3.rest = 0;
  }
  return {
    win, steps,
    bounces: ev3.bounces, gooSteps: ev3.gooSteps,
    windU: Math.abs(s.wu) / TAU, windV: Math.abs(s.wv) / TAU,   // winding (fractional)
    trace,
  };
}
