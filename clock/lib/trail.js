// Shared 3D stigmergic trail field (vector deposit), module-singleton — one per
// page, since each gallery page mounts exactly one organism. Organisms deposit
// their heading into it and sense it ahead; the engine folds + diffuses it each
// frame. GN^3 cells over [-GR, GR] world.
const GN = 24, GR = 2.8, GN2 = GN * GN, GLEN = GN * GN * GN * 3;
let trail = null, trail2 = null, brush = null;

export function trailIsActive() { return !!trail; }
export function trailEnsure() {
  if (trail) return;
  trail = new Float32Array(GLEN);
  trail2 = new Float32Array(GLEN);
  brush = new Float32Array(GLEN);
}
export function trailReset() { trail = null; trail2 = null; brush = null; }

const gcell = (c) => ((c + GR) / (2 * GR)) * GN - 0.5; // world → continuous cell coord
export function trailSample(p) {
  const t = trail;
  const fx = gcell(p[0]), fy = gcell(p[1]), fz = gcell(p[2]);
  const x0 = Math.floor(fx), y0 = Math.floor(fy), z0 = Math.floor(fz);
  const dx = fx - x0, dy = fy - y0, dz = fz - z0;
  let vx = 0, vy = 0, vz = 0;
  for (let i = 0; i < 8; i++) {
    const cx = x0 + (i & 1), cy = y0 + ((i >> 1) & 1), cz = z0 + ((i >> 2) & 1);
    if (cx < 0 || cy < 0 || cz < 0 || cx >= GN || cy >= GN || cz >= GN) continue;
    const w = ((i & 1) ? dx : 1 - dx) * (((i >> 1) & 1) ? dy : 1 - dy) * (((i >> 2) & 1) ? dz : 1 - dz);
    const o = (cz * GN2 + cy * GN + cx) * 3;
    vx += t[o] * w; vy += t[o + 1] * w; vz += t[o + 2] * w;
  }
  return [vx, vy, vz];
}
export function trailDeposit(p, v, w) {
  const b = brush;
  const ix = Math.round(gcell(p[0])), iy = Math.round(gcell(p[1])), iz = Math.round(gcell(p[2]));
  if (ix < 0 || iy < 0 || iz < 0 || ix >= GN || iy >= GN || iz >= GN) return;
  const o = (iz * GN2 + iy * GN + ix) * 3;
  b[o] += v[0] * w; b[o + 1] += v[1] * w; b[o + 2] += v[2] * w;
}
export function trailClearBrush() { if (brush) brush.fill(0); }
export function trailUpdate(persistence, diffusion) {
  if (!trail) return;
  const b = brush, keep = persistence, add = 1 - persistence;
  let t = trail;
  for (let i = 0; i < GLEN; i++) t[i] = t[i] * keep + b[i] * add;
  const k = Math.min(1, diffusion * 0.5);
  if (k > 0) {
    const t2 = trail2;
    for (let z = 0; z < GN; z++) for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) {
      const o = (z * GN2 + y * GN + x) * 3;
      for (let c = 0; c < 3; c++) {
        let sum = 0, cnt = 0;
        if (x > 0) { sum += t[o - 3 + c]; cnt++; } if (x < GN - 1) { sum += t[o + 3 + c]; cnt++; }
        if (y > 0) { sum += t[o - GN * 3 + c]; cnt++; } if (y < GN - 1) { sum += t[o + GN * 3 + c]; cnt++; }
        if (z > 0) { sum += t[o - GN2 * 3 + c]; cnt++; } if (z < GN - 1) { sum += t[o + GN2 * 3 + c]; cnt++; }
        t2[o + c] = t[o + c] * (1 - k) + (cnt ? sum / cnt : t[o + c]) * k;
      }
    }
    trail = t2; trail2 = t;
  }
  b.fill(0);
}
