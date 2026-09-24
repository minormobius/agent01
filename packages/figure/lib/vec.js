// vec.js — the little linear algebra the rig needs. Plain arrays, no classes.
//
// Space: y up, the figure faces +z, its LEFT is +x. One unit = one head height.

export const v = (x = 0, y = 0, z = 0) => [x, y, z];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const lerp3 = (a, b, f) => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];
export const madd = (a, b, k) => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

// A frame is three unit axes, columns of a rotation: { x, y, z }.
export const IDENTITY = Object.freeze({ x: [1, 0, 0], y: [0, 1, 0], z: [0, 0, 1] });

/** Apply a frame to a local vector. */
export const apply = (F, p) => [
  F.x[0] * p[0] + F.y[0] * p[1] + F.z[0] * p[2],
  F.x[1] * p[0] + F.y[1] * p[1] + F.z[1] * p[2],
  F.x[2] * p[0] + F.y[2] * p[1] + F.z[2] * p[2],
];
/** Express a world vector in a frame's coordinates. */
export const unapply = (F, p) => [dot(F.x, p), dot(F.y, p), dot(F.z, p)];
export const compose = (A, B) => ({ x: apply(A, B.x), y: apply(A, B.y), z: apply(A, B.z) });

/** Rotation of `p` about unit axis `k` by angle a (Rodrigues). */
export function rotate(p, k, a) {
  const c = Math.cos(a), s = Math.sin(a), kd = dot(k, p), kx = cross(k, p);
  return [p[0] * c + kx[0] * s + k[0] * kd * (1 - c), p[1] * c + kx[1] * s + k[1] * kd * (1 - c), p[2] * c + kx[2] * s + k[2] * kd * (1 - c)];
}
export const rotateFrame = (F, k, a) => ({ x: rotate(F.x, k, a), y: rotate(F.y, k, a), z: rotate(F.z, k, a) });

/**
 * A frame from yaw (about y, turning toward +x... i.e. the figure turning to ITS left
 * is positive), pitch (about the frame's x: forward lean positive) and roll
 * (about the frame's z: tipping toward its left positive), applied yaw, pitch, roll.
 */
export function ypr(yaw = 0, pitch = 0, roll = 0, base = IDENTITY) {
  let F = rotateFrame(base, base.y, yaw);
  F = rotateFrame(F, F.x, pitch);
  F = rotateFrame(F, F.z, -roll);
  return F;
}

/** A frame whose y axis is `up` and whose z axis is as close to `fwd` as it can be. */
export function frameFrom(up, fwd) {
  const y = norm(up);
  let z = sub(fwd, scale(y, dot(fwd, y)));
  if (len(z) < 1e-6) z = Math.abs(y[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
  z = norm(z);
  return { x: cross(y, z), y, z };
}
