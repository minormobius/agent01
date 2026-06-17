// terrain.mjs — course grade. Vendored from iris/sim/ratchet.mjs.
//
// iris's insight (its CLAUDE.md invariant: "iris owns its geometry — vendor, don't
// reach across"): on a spinning floor "level" means CONSTANT RADIUS, because the
// effective potential Φ = −½ω²r² makes equipotentials circles about the axis. So
// terrain elevation builds INWARD (toward the axis, which is "up"): the ground
// surface sits at radius R − e(θ), and water pools only where the rim is carved
// below the local level. iris carves an asymmetric RATCHET — a short steep scarp
// up to a crest, then a long gentle glide down into the next basin.
//
// We reuse that exact sawtooth as gentle golf-course grade (small crests, many
// "teeth" = rolling fairway humps) and hang a long-wavelength undulation along the
// hole's length so the ball feels slope in BOTH axes. The ball then rolls downhill
// and breaks across the grade — and because we compute the true surface NORMAL,
// the grade falls straight out of the contact handling (no special-case force).
//
// Pure, zero-dep, deterministic, node + browser. Gated by test/terrain.selftest.mjs.

const TAU = Math.PI * 2;

// — vendored asymmetric sawtooth (iris/sim/ratchet.mjs `elevation`) — returns a
// 0..1 profile across one tooth: flat basin → steep short scarp → long gentle
// glide. The asymmetry is the point (a cliff up, a ramp down).
export function sawtooth(u, basinFrac = 0.14, scarpFrac = 0.06) {
  u = u % 1; if (u < 0) u += 1;
  const b = basinFrac / 2, s = scarpFrac;
  if (u < b || u >= 1 - b) return 0;                 // basin floor (this / next)
  if (u < b + s) return (u - b) / s;                 // scarp (steep, short)
  return 1 - (u - b - s) / (1 - 2 * b - s);          // glide (gentle, long)
}

// A course's terrain spec: { crest (m), teeth (ratchet count), seed }. Absent or
// crest 0 ⇒ a flat floor (the original behaviour).
export function defaultTerrain() { return { crest: 16, teeth: 7, seed: 1 }; }

// Ratchet wavelength (m of arc) for the active world.
function lambda(terrain, mode, R) {
  const teeth = Math.max(1, terrain.teeth || 1);
  return mode === 'cylinder' ? (TAU * R) / teeth : 2200 / teeth;
}

// Elevation (m) above the base floor at a floor coordinate {u, v}. Combines the
// iris ratchet across the primary axis with a gentle sine undulation along the
// hole's length, so there's grade to read in both directions.
export function height(terrain, mode, R, u, v) {
  if (!terrain || !terrain.crest) return 0;
  const crest = terrain.crest;
  const arc = mode === 'cylinder' ? R * u : u;           // metres along the primary axis
  const tooth = arc / lambda(terrain, mode, R);
  const ridge = sawtooth(tooth);
  const phase = ((terrain.seed || 1) * 1.7) % TAU;
  const roll = 0.5 * (1 + Math.sin(v * (TAU / 760) + phase));
  return crest * (0.62 * ridge + 0.38 * roll);
}

// World position of the terrain SURFACE at {u, v}: the floor lifted inward
// (cylinder) / up (earth) by the elevation.
export function surfaceWorld(out, terrain, mode, R, u, v) {
  const e = height(terrain, mode, R, u, v);
  if (mode === 'cylinder') {
    const rho = R - e;
    out[0] = Math.cos(u) * rho; out[1] = Math.sin(u) * rho; out[2] = v;
  } else {
    out[0] = u; out[1] = e; out[2] = v;
  }
  return out;
}

// The terrain surface NORMAL at {u, v}, in world coords, oriented toward "up"
// (inward for the cylinder, +Y on Earth). Finite-differenced from surfaceWorld so
// it captures the full 2-D grade. On flat terrain it is exactly the local up.
const _p = [0, 0, 0], _pu = [0, 0, 0], _pv = [0, 0, 0];
export function normalAt(out, terrain, mode, R, u, v) {
  const du = mode === 'cylinder' ? 1e-4 : 0.05, dv = 0.5;
  surfaceWorld(_p, terrain, mode, R, u, v);
  surfaceWorld(_pu, terrain, mode, R, u + du, v);
  surfaceWorld(_pv, terrain, mode, R, u, v + dv);
  const ax = _pu[0] - _p[0], ay = _pu[1] - _p[1], az = _pu[2] - _p[2];
  const bx = _pv[0] - _p[0], by = _pv[1] - _p[1], bz = _pv[2] - _p[2];
  // n = (∂P/∂u) × (∂P/∂v)
  let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
  const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
  // orient toward up
  const up = mode === 'cylinder' ? [-Math.cos(u), -Math.sin(u), 0] : [0, 1, 0];
  if (nx * up[0] + ny * up[1] + nz * up[2] < 0) { nx = -nx; ny = -ny; nz = -nz; }
  out[0] = nx; out[1] = ny; out[2] = nz;
  return out;
}

// Surface radius (cylinder) / surface height (earth) directly — what the ball
// rests ballR above.
export function surfaceLevel(terrain, mode, R, u, v) {
  const e = height(terrain, mode, R, u, v);
  return mode === 'cylinder' ? R - e : e;
}

export default { sawtooth, defaultTerrain, height, surfaceWorld, normalAt, surfaceLevel };
