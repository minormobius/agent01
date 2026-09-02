// hopper — the player's body. An axis-aligned box two layers tall that
// walks, falls, and jumps one layer; a sweep-and-resolve against whatever
// `solid(x, y, z)` says is there; the ray from the eye that says what the
// crosshair is on. Pure functions over a plain player record, so the
// selftest can walk the form factor without a page.

export const HALF = 0.3;        // half width
export const TALL = 1.8;        // two layers tall (just under, so a two-high gap is passable)
export const EYE = 1.62;        // eye height above the feet
export const GRAV = 26;
export const JUMP = 7.6;        // apex JUMP²/(2·GRAV) ≈ 1.11 layers: clears one, never two
export const WALK = 4.6;
export const REACH = 7;         // how far the crosshair reaches
const EPS = 1e-4;
const SUB = 1 / 120;            // physics substep: terminal velocity never crosses a whole cell

export function player(x, y, z, yaw = 0, pitch = 0) {
  return { x, y, z, vx: 0, vy: 0, vz: 0, yaw, pitch, ground: false };
}

function box(p) {
  return [
    Math.floor(p.x - HALF), Math.floor(p.x + HALF - EPS),
    Math.floor(p.y - HALF), Math.floor(p.y + HALF - EPS),
    Math.floor(p.z), Math.floor(p.z + TALL - EPS),
  ];
}
function hits(solid, x0, x1, y0, y1, z0, z1) {
  for (let z = z0; z <= z1; z++) for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (solid(x, y, z)) return true;
  return false;
}
export function overlapping(p, solid) { const b = box(p); return hits(solid, b[0], b[1], b[2], b[3], b[4], b[5]); }
export function onGround(p, solid) {
  if (p.vz > 0) return false;
  const b = box(p), z = Math.floor(p.z - 0.03);
  return hits(solid, b[0], b[1], b[2], b[3], z, z);
}

// move along one axis and push back out of the first solid cell met
function sweep(p, solid, axis, d) {
  if (!d) return;
  if (axis === 0) p.x += d; else if (axis === 1) p.y += d; else p.z += d;
  const b = box(p);
  if (!hits(solid, b[0], b[1], b[2], b[3], b[4], b[5])) return;
  if (axis === 0) { p.x = d > 0 ? b[1] - HALF - EPS : b[0] + 1 + HALF + EPS; p.vx = 0; }
  else if (axis === 1) { p.y = d > 0 ? b[3] - HALF - EPS : b[2] + 1 + HALF + EPS; p.vy = 0; }
  else if (d > 0) { p.z = b[5] - TALL - EPS; p.vz = 0; }
  else { p.z = b[4] + 1 + EPS; p.vz = 0; p.ground = true; }
}

// ctl: {mx, my, jump} — mx forward/back, my right/left in [-1, 1]
export function stepPlayer(p, solid, ctl, dt) {
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
    sweep(p, solid, 0, p.vx * h);
    sweep(p, solid, 1, p.vy * h);
    p.ground = false;
    sweep(p, solid, 2, p.vz * h);
    if (!p.ground) p.ground = onGround(p, solid);
  }
}

// The ground moved: a brick was laid where the player stands. Ride it up.
export function pushOut(p, solid) {
  let n = 0, moved = false;
  while (n++ < 128 && overlapping(p, solid)) { p.z = Math.floor(p.z) + 1 + EPS; if (p.vz < 0) p.vz = 0; moved = true; }
  if (moved) p.ground = onGround(p, solid);
  return moved;
}

// The cell under the crosshair within reach, with the face it was entered
// through (nx, ny, nz point back toward the eye), or null for the void.
export function raycast(p, solid, reach = REACH) {
  const cp = Math.cos(p.pitch);
  const o = [p.x, p.y, p.z + EYE];
  const d = [Math.cos(p.yaw) * cp, Math.sin(p.yaw) * cp, Math.sin(p.pitch)];
  const c = [Math.floor(o[0]), Math.floor(o[1]), Math.floor(o[2])];
  const s = [0, 0, 0], td = [0, 0, 0], tm = [0, 0, 0];
  for (let i = 0; i < 3; i++) {
    s[i] = d[i] > 0 ? 1 : -1;
    td[i] = d[i] !== 0 ? Math.abs(1 / d[i]) : Infinity;
    tm[i] = d[i] !== 0 ? (d[i] > 0 ? c[i] + 1 - o[i] : o[i] - c[i]) * td[i] : Infinity;
  }
  let nx = 0, ny = 0, nz = 0, t = 0;
  for (let i = 0; i < 96; i++) {
    if (solid(c[0], c[1], c[2])) return { x: c[0], y: c[1], z: c[2], nx, ny, nz, t };
    const a = tm[0] < tm[1] ? (tm[0] < tm[2] ? 0 : 2) : (tm[1] < tm[2] ? 1 : 2);
    c[a] += s[a]; t = tm[a]; tm[a] += td[a];
    nx = 0; ny = 0; nz = 0;
    if (a === 0) nx = -s[0]; else if (a === 1) ny = -s[1]; else nz = -s[2];
    if (t > reach) return null;
  }
  return null;
}
