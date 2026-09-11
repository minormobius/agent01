// camera.js — a turntable camera for parts. Z is up, the way the sketch
// planes are laid out (XY is the bench, XZ is the front). Orbit, pan, dolly,
// fit-to-box, presets, and orthographic or perspective projection.

const DEG = Math.PI / 180;

export class Camera {
  constructor() {
    this.target = [0, 0, 0];
    this.distance = 100;
    this.yaw = -35 * DEG;     // around Z
    this.pitch = 30 * DEG;    // above the XY plane
    this.fov = 35 * DEG;
    this.ortho = false;
    this.near = 0.01;
    this.far = 10;
  }
  eye() {
    const cp = Math.cos(this.pitch), sp = Math.sin(this.pitch), cy = Math.cos(this.yaw), sy = Math.sin(this.yaw);
    return [this.target[0] + this.distance * cp * cy, this.target[1] + this.distance * cp * sy, this.target[2] + this.distance * sp];
  }
  // right / up / forward in world space
  basis() {
    const e = this.eye(), t = this.target;
    let f = [t[0] - e[0], t[1] - e[1], t[2] - e[2]]; f = norm(f);
    let r = cross(f, [0, 0, 1]); if (len(r) < 1e-6) r = [1, 0, 0]; r = norm(r);
    const u = cross(r, f);
    return { f, r, u };
  }
  view() {
    const e = this.eye(); const { f, r, u } = this.basis();
    return [r[0], u[0], -f[0], 0, r[1], u[1], -f[1], 0, r[2], u[2], -f[2], 0, -dot(r, e), -dot(u, e), dot(f, e), 1];
  }
  proj(aspect) {
    this.near = this.distance * 0.01; this.far = this.distance * 20;
    if (this.ortho) {
      const h = this.distance * Math.tan(this.fov / 2), w = h * aspect;
      return [1 / w, 0, 0, 0, 0, 1 / h, 0, 0, 0, 0, -2 / (this.far - this.near), 0, 0, 0, -(this.far + this.near) / (this.far - this.near), 1];
    }
    const f = 1 / Math.tan(this.fov / 2), n = this.near, fa = this.far;
    return [f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (fa + n) / (n - fa), -1, 0, 0, (2 * fa * n) / (n - fa), 0];
  }
  orbit(dx, dy) { this.yaw -= dx * 0.008; this.pitch = Math.max(-89 * DEG, Math.min(89 * DEG, this.pitch + dy * 0.008)); }
  pan(dx, dy, viewportH) {
    const { r, u } = this.basis();
    const s = (2 * this.distance * Math.tan(this.fov / 2)) / viewportH;
    for (let i = 0; i < 3; i++) this.target[i] += -r[i] * dx * s + u[i] * dy * s;
  }
  dolly(f) { this.distance = Math.max(1e-3, this.distance * f); }
  fit(bbox) {
    if (!bbox || !isFinite(bbox[0][0])) return;
    const c = [0, 1, 2].map((i) => (bbox[0][i] + bbox[1][i]) / 2);
    const radius = Math.max(1e-3, Math.hypot(bbox[1][0] - bbox[0][0], bbox[1][1] - bbox[0][1], bbox[1][2] - bbox[0][2]) / 2);
    this.target = c;
    this.distance = radius / Math.sin(this.fov / 2) * 1.05;
  }
  preset(name) {
    const p = { iso: [-35, 30], top: [-90, 89.9], bottom: [-90, -89.9], front: [-90, 0], back: [90, 0], right: [0, 0], left: [180, 0] }[name];
    if (p) { this.yaw = p[0] * DEG; this.pitch = p[1] * DEG; }
  }
}

export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export function mul4(a, b) {
  const o = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
