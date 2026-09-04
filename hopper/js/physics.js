// hopper — the player's body. A box two layers tall that walks, falls, and
// jumps one layer, resolved against whatever `solidAt(x, y, z)` says is
// there at a point in world space — so the same body walks the cubic
// lattice, any prism tiling (Penrose rhombs, kagome triangles…) and the
// icosahedral quasicrystal, where cells are polygons or rhombohedra and the
// only honest question is "is this point inside a brick". Nine points on
// the footprint at the feet and at every half layer above are asked; a
// move that lands any of them in a brick is undone. Where faces slope (the
// rhombohedra) the body lands wherever the face holds it rather than on a
// layer, and on the ground it steps up anything under STEP high — so it
// walks up gentle slopes, while a whole cubic layer still takes a jump.
// The ray from the eye marches the same question along the crosshair. Pure
// functions over a plain player record, so the selftest can walk the form
// factor without a page.

export const HALF = 0.3;        // half width
export const TALL = 1.8;        // two layers tall (just under, so a two-high gap is passable)
export const EYE = 1.62;        // eye height above the feet
export const GRAV = 26;
export const JUMP = 7.6;        // apex JUMP²/(2·GRAV) ≈ 1.11 layers: clears one, never two
export const WALK = 4.6;
export const REACH = 7;         // how far the crosshair reaches
export const STEP = 0.55;       // what the feet step up on the ground: a sloped face, never a cubic layer
const EPS = 1e-4;
const FEET = 1e-3;              // the feet's own probe sits just above the sole
const SUB = 1 / 120;            // physics substep: terminal velocity never crosses a whole layer
const R = HALF - EPS;
const FOOT = [[-R, -R], [0, -R], [R, -R], [-R, 0], [0, 0], [R, 0], [-R, R], [0, R], [R, R]];

export function player(x, y, z, yaw = 0, pitch = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch, ground: false };
}

// any footprint point inside a brick, at the feet or at any layer the body
// spans: the feet first (a sloped face can rise between the layer samples),
// then the half-layer samples, never below the feet
function hits(solidAt, x, y, z0, z1) {
  const feet = z0 + FEET;
  for (let i = 0; i < FOOT.length; i++) if (solidAt(x + FOOT[i][0], y + FOOT[i][1], feet)) return true;
  for (let z = Math.max(Math.floor(z0) + 0.5, feet); z < z1; z += 1) {
    for (let i = 0; i < FOOT.length; i++) if (solidAt(x + FOOT[i][0], y + FOOT[i][1], z)) return true;
  }
  return false;
}
export function overlapping(p, solidAt) { return hits(solidAt, p.x, p.y, p.z, p.z + TALL - EPS); }
export function onGround(p, solidAt) {
  if (p.vz > 0) return false;
  const z = p.z - 0.03;
  return hits(solidAt, p.x, p.y, z, z + EPS);
}

// move along one axis; undo the move if it enters a brick — unless, on the
// ground, a small lift clears it (a step up a sloped face) — or, falling,
// land: on the layer below, or where a sloped face holds the feet
function sweep(p, solidAt, axis, d) {
  if (!d) return;
  if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
  if (!overlapping(p, solidAt)) return;
  if (axis < 2) {
    if (p.ground) {
      const z0 = p.z;
      for (let lift = 0.06; lift <= STEP; lift += 0.06) {
        p.z = z0 + lift;
        if (overlapping(p, solidAt)) continue;
        // stepped up: settle back onto the face so the feet stay grounded
        for (let k = 0; k < 6; k++) { p.z -= 0.01; if (overlapping(p, solidAt)) { p.z += 0.01; break; } }
        return;
      }
      p.z = z0;
    }
    if (axis === 0) { p.x -= d; p.vx = 0; } else { p.y -= d; p.vy = 0; }
    return;
  }
  if (d > 0) { p.z -= d; p.vz = 0; return; }
  // land: rise from where the feet entered until something holds them; if
  // that is the top of a layer, take the layer exactly (the cubic landing)
  const entered = p.z, snap = Math.floor(entered) + 1 + EPS;
  for (let n = 0; n < 60 && overlapping(p, solidAt); n++) p.z += 0.02;
  if (p.z >= snap - 0.021) { p.z = snap; if (overlapping(p, solidAt)) { p.z = entered; for (let n = 0; n < 60 && overlapping(p, solidAt); n++) p.z += 0.02; } }
  p.vz = 0; p.ground = true;
}

// ctl: {mx, my, jump} — mx forward/back, my right/left in [-1, 1]
export function stepPlayer(p, solidAt, ctl, dt) {
  let mx = ctl.mx || 0, my = ctl.my || 0;
  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  const cy = Math.cos(p.yaw), sy = Math.sin(p.yaw);
  // forward is (cos yaw, sin yaw); right is a quarter turn clockwise from it
  const wx = (mx * cy + my * sy) * WALK, wy = (mx * sy - my * cy) * WALK;
  let jump = !!ctl.jump;
  for (let left = dt; left > 0; left -= SUB) {
    const h = Math.min(SUB, left);
    const a = p.ground ? 1 - Math.exp(-h * 20) : 1 - Math.exp(-h * 5);
    p.vx += (wx - p.vx) * a; p.vy += (wy - p.vy) * a;
    if (jump && p.ground) { p.vz = JUMP; p.ground = false; jump = false; }
    p.vz -= GRAV * h;
    if (p.vz < -40) p.vz = -40;
    sweep(p, solidAt, 0, p.vx * h);
    sweep(p, solidAt, 1, p.vy * h);
    p.ground = false;
    sweep(p, solidAt, 2, p.vz * h);
    if (!p.ground) p.ground = onGround(p, solidAt);
  }
}

// The ground moved: a brick was laid where the player stands. Ride it up.
export function pushOut(p, solidAt) {
  let n = 0, moved = false;
  while (n++ < 128 && overlapping(p, solidAt)) { p.z = Math.floor(p.z) + 1 + EPS; if (p.vz < 0) p.vz = 0; moved = true; }
  if (moved) p.ground = onGround(p, solidAt);
  return moved;
}

// The first point along the crosshair, within reach, that is inside a
// brick — {x, y, z, t} in world space — or null for the void.
export function raycast(p, solidAt, reach = REACH, step = 0.05) {
  const cp = Math.cos(p.pitch);
  const dx = Math.cos(p.yaw) * cp, dy = Math.sin(p.yaw) * cp, dz = Math.sin(p.pitch);
  const ox = p.x, oy = p.y, oz = p.z + EYE;
  for (let t = 0; t <= reach; t += step) {
    const x = ox + dx * t, y = oy + dy * t, z = oz + dz * t;
    if (solidAt(x, y, z)) return { x, y, z, t };
  }
  return null;
}
