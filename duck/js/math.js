// math.js — the minimal vec3 / mat4 / quat kernel the duck sim needs.
//
// Conventions match gl-matrix: column-major Float32Array(16) mat4 (uploads to a
// WGSL mat4x4<f32> verbatim), right-handed, quaternions [x,y,z,w]. Projection is
// the ZERO-TO-ONE depth variant (perspectiveZO) because WebGPU clips z to [0,1],
// not WebGL's [-1,1] — using the WebGL form silently breaks the depth buffer.
//
// Pure + zero-dep, so the physics selftest can import it under node.

export const vec3 = {
  create: () => [0, 0, 0],
  clone: (a) => [a[0], a[1], a[2]],
  set: (o, x, y, z) => { o[0] = x; o[1] = y; o[2] = z; return o; },
  add: (o, a, b) => { o[0] = a[0] + b[0]; o[1] = a[1] + b[1]; o[2] = a[2] + b[2]; return o; },
  sub: (o, a, b) => { o[0] = a[0] - b[0]; o[1] = a[1] - b[1]; o[2] = a[2] - b[2]; return o; },
  scale: (o, a, s) => { o[0] = a[0] * s; o[1] = a[1] * s; o[2] = a[2] * s; return o; },
  scaleAndAdd: (o, a, b, s) => { o[0] = a[0] + b[0] * s; o[1] = a[1] + b[1] * s; o[2] = a[2] + b[2] * s; return o; },
  dot: (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2],
  cross: (o, a, b) => {
    const ax = a[0], ay = a[1], az = a[2], bx = b[0], by = b[1], bz = b[2];
    o[0] = ay * bz - az * by; o[1] = az * bx - ax * bz; o[2] = ax * by - ay * bx; return o;
  },
  len: (a) => Math.hypot(a[0], a[1], a[2]),
  normalize: (o, a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; return o;
  },
  lerp: (o, a, b, t) => {
    o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o;
  },
  transformQuat: (o, a, q) => {
    // o = q * a * q^-1, the gl-matrix fast path.
    const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
    const x = a[0], y = a[1], z = a[2];
    let uvx = qy * z - qz * y, uvy = qz * x - qx * z, uvz = qx * y - qy * x;
    let uuvx = qy * uvz - qz * uvy, uuvy = qz * uvx - qx * uvz, uuvz = qx * uvy - qy * uvx;
    uvx *= 2 * qw; uvy *= 2 * qw; uvz *= 2 * qw;
    uuvx *= 2; uuvy *= 2; uuvz *= 2;
    o[0] = x + uvx + uuvx; o[1] = y + uvy + uuvy; o[2] = z + uvz + uuvz; return o;
  },
};

export const quat = {
  create: () => [0, 0, 0, 1],
  identity: (o) => { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; },
  // q rotated by `rad` about the unit axis given in q's LOCAL (body) frame.
  rotateLocal: (o, q, axis, rad) => {
    const h = rad / 2, s = Math.sin(h), c = Math.cos(h);
    const bx = axis[0] * s, by = axis[1] * s, bz = axis[2] * s, bw = c;
    const ax = q[0], ay = q[1], az = q[2], aw = q[3];
    // o = q * delta  (local/body-frame compose)
    o[0] = ax * bw + aw * bx + ay * bz - az * by;
    o[1] = ay * bw + aw * by + az * bx - ax * bz;
    o[2] = az * bw + aw * bz + ax * by - ay * bx;
    o[3] = aw * bw - ax * bx - ay * by - az * bz;
    return quat.normalize(o, o);
  },
  normalize: (o, a) => {
    const l = Math.hypot(a[0], a[1], a[2], a[3]) || 1;
    o[0] = a[0] / l; o[1] = a[1] / l; o[2] = a[2] / l; o[3] = a[3] / l; return o;
  },
  // shortest-arc quaternion rotating unit vector `a` onto unit vector `b`.
  fromTo: (o, a, b) => {
    const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
    if (d > 0.999999) { o[0] = 0; o[1] = 0; o[2] = 0; o[3] = 1; return o; }
    if (d < -0.999999) {
      // antiparallel: rotate 180° about any axis ⟂ a
      let ax = [a[1], -a[0], 0];
      if (ax[0] * ax[0] + ax[1] * ax[1] < 1e-9) ax = [0, a[2], -a[1]];
      const l = Math.hypot(ax[0], ax[1], ax[2]) || 1;
      o[0] = ax[0] / l; o[1] = ax[1] / l; o[2] = ax[2] / l; o[3] = 0; return o;
    }
    o[0] = a[1] * b[2] - a[2] * b[1];
    o[1] = a[2] * b[0] - a[0] * b[2];
    o[2] = a[0] * b[1] - a[1] * b[0];
    o[3] = 1 + d;
    return quat.normalize(o, o);
  },
  // Shortest-arc slerp-ish nlerp, good enough for camera/orientation smoothing.
  nlerp: (o, a, b, t) => {
    let bx = b[0], by = b[1], bz = b[2], bw = b[3];
    if (a[0] * bx + a[1] * by + a[2] * bz + a[3] * bw < 0) { bx = -bx; by = -by; bz = -bz; bw = -bw; }
    o[0] = a[0] + (bx - a[0]) * t; o[1] = a[1] + (by - a[1]) * t;
    o[2] = a[2] + (bz - a[2]) * t; o[3] = a[3] + (bw - a[3]) * t;
    return quat.normalize(o, o);
  },
};

export const mat4 = {
  create: () => new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]),
  multiply: (o, a, b) => {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7],
      a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },
  // Translation · Rotation(quat) · Scale — the standard model-matrix build.
  fromRTS: (o, q, v, s) => {
    const x = q[0], y = q[1], z = q[2], w = q[3];
    const x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2;
    const wx = w * x2, wy = w * y2, wz = w * z2;
    const sx = s[0], sy = s[1], sz = s[2];
    o[0] = (1 - (yy + zz)) * sx; o[1] = (xy + wz) * sx; o[2] = (xz - wy) * sx; o[3] = 0;
    o[4] = (xy - wz) * sy; o[5] = (1 - (xx + zz)) * sy; o[6] = (yz + wx) * sy; o[7] = 0;
    o[8] = (xz + wy) * sz; o[9] = (yz - wx) * sz; o[10] = (1 - (xx + yy)) * sz; o[11] = 0;
    o[12] = v[0]; o[13] = v[1]; o[14] = v[2]; o[15] = 1;
    return o;
  },
  perspectiveZO: (o, fovy, aspect, near, far) => {
    const f = 1 / Math.tan(fovy / 2);
    o.fill(0);
    o[0] = f / aspect; o[5] = f; o[11] = -1;
    if (far != null && far !== Infinity) {
      const nf = 1 / (near - far);
      o[10] = far * nf; o[14] = far * near * nf;
    } else { o[10] = -1; o[14] = -near; }
    return o;
  },
  lookAt: (o, eye, center, up) => {
    const ex = eye[0], ey = eye[1], ez = eye[2];
    let z0 = ex - center[0], z1 = ey - center[1], z2 = ez - center[2];
    let l = Math.hypot(z0, z1, z2) || 1; z0 /= l; z1 /= l; z2 /= l;
    let x0 = up[1] * z2 - up[2] * z1, x1 = up[2] * z0 - up[0] * z2, x2 = up[0] * z1 - up[1] * z0;
    l = Math.hypot(x0, x1, x2);
    if (!l) { x0 = 0; x1 = 0; x2 = 0; } else { x0 /= l; x1 /= l; x2 /= l; }
    const y0 = z1 * x2 - z2 * x1, y1 = z2 * x0 - z0 * x2, y2 = z0 * x1 - z1 * x0;
    o[0] = x0; o[1] = y0; o[2] = z0; o[3] = 0;
    o[4] = x1; o[5] = y1; o[6] = z1; o[7] = 0;
    o[8] = x2; o[9] = y2; o[10] = z2; o[11] = 0;
    o[12] = -(x0 * ex + x1 * ey + x2 * ez);
    o[13] = -(y0 * ex + y1 * ey + y2 * ez);
    o[14] = -(z0 * ex + z1 * ey + z2 * ez);
    o[15] = 1;
    return o;
  },
};
