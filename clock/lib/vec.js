// Shared vec/mat helpers for the organism gallery. Pure, no state.
export const TAU = Math.PI * 2;

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function norm(v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
// Rodrigues: rotate v around unit axis k by angle a
export function rot(v, k, a) {
  const c = Math.cos(a), s = Math.sin(a);
  const kc = dot(k, v) * (1 - c);
  const cr = cross(k, v);
  return [
    v[0] * c + cr[0] * s + k[0] * kc,
    v[1] * c + cr[1] * s + k[1] * kc,
    v[2] * c + cr[2] * s + k[2] * kc,
  ];
}
export const mix = (a, b, t) => a + (b - a) * t;

export function perspective(fovy, aspect, near, far) {
  const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
  return [
    f / aspect, 0, 0, 0,
    0, f, 0, 0,
    0, 0, far * nf, -1,
    0, 0, far * near * nf, 0,
  ];
}
export function lookAt(eye, c, up) {
  const z = norm(sub(eye, c));
  const x = norm(cross(up, z));
  const y = cross(z, x);
  return [
    x[0], y[0], z[0], 0,
    x[1], y[1], z[1], 0,
    x[2], y[2], z[2], 0,
    -dot(x, eye), -dot(y, eye), -dot(z, eye), 1,
  ];
}
export function mul4(a, b) {
  const o = new Array(16);
  for (let col = 0; col < 4; col++) for (let r = 0; r < 4; r++) {
    o[col * 4 + r] = a[r] * b[col * 4] + a[4 + r] * b[col * 4 + 1] + a[8 + r] * b[col * 4 + 2] + a[12 + r] * b[col * 4 + 3];
  }
  return o;
}
