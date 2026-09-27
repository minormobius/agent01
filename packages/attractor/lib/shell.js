// shell.js — a flow that grows its own house of crystals and lives in it.
//
// A creature here is two things: a FLOW (a strange attractor from the bestiary, its orbit running
// forever) and a HOUSE (crystals, a druse, like the inside of a geode). The flow feeds the crystals
// and the crystals are shaped by the flow:
//
//   - the flow's orbit density, blurred, is the NUTRIENT. Crystals nucleate on a band of it (the
//     halo round the orbit: fed, but not in the flow's way), more readily beside crystals already
//     there (a druse grows in clusters), and point up the nutrient's gradient: toward the flow;
//   - a crystal grows at its tip while the tip is fed, the longer the slower;
//   - the density close in is the CURRENT: a tip that reaches where the orbit actually runs is
//     dissolved back. So the crystals stop just short of the flow, and their tips carve a room
//     fitted to its shape, with the flow running free inside.
//
// Then it LIVES: after the growing it wanders (a slow closed path), turning to face its way. The
// house does not move; it is re-grown. Crystals nucleate ahead, tips in the way of the swinging
// current dissolve, and the crystals behind are no longer fed: they stop, bleach, and only very
// slowly erode. So a creature leaves a reef of its old houses, and carves through it when its path
// comes round again.
//
// Deterministic: the state after step n is a function of (seed, n) alone. Every random decision is a
// hash of (something, step), never a running stream.

import { BESTIARY } from './bestiary.js';
import { realise, mulberry32 } from './space.js';

/** The half-width of the box round the creature where anything can be fed (attractor units × k). */
export const liveHalf = (k) => 1.45 * k;
export const GX = 112, GY = 72, GZ = 112;          // the world's box (x, z the floor plan, y up)
const TN = 48, TU = 1.7;                          // the templates: TN³ cells over [-TU, TU]³ attractor units
const CELL = 2, NX = GX / CELL, NY = GY / CELL, NZ = GZ / CELL;   // the crowding grid

const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The minerals: how a house looks (the renderer reads these). */
export const MINERALS = {
  bismuth: { base: [0.55, 0.55, 0.6], iri: 0.75, glass: 0.1, spec: 0.9 },
  quartz: { base: [0.8, 0.83, 0.88], iri: 0.12, glass: 0.8, spec: 1 },
  amethyst: { base: [0.52, 0.3, 0.72], iri: 0.1, glass: 0.65, spec: 0.9 },
  obsidian: { base: [0.08, 0.08, 0.1], iri: 0.25, glass: 0.15, spec: 1.2 },
  citrine: { base: [0.95, 0.66, 0.25], iri: 0.1, glass: 0.6, spec: 0.9 },
};

/** The genome a seed makes: which attractor, how big, how its crystals grow, how it wanders. */
export function genome(seed, over = {}) {
  const rnd = mulberry32((seed >>> 0) * 2246822519 + 3);
  const pool = BESTIARY.filter((b) => b.fill > 0.08 && b.dim > 1.6);
  const b = pool[Math.floor(rnd() * pool.length)];
  const minerals = Object.keys(MINERALS);
  return {
    seed, key: b.key,
    scale: 12 + rnd() * 5,                         // world units an attractor unit
    halo: 0.05 + rnd() * 0.05,                     // nutrient needed to nucleate
    wall: 2 + rnd() * 2,                            // above halo × wall is too close: the flow's room
    channel: 0.03 + rnd() * 0.05,                  // current that dissolves a tip
    girth: 0.12 + rnd() * 0.16,                    // a crystal's width over its length
    reach: 3 + rnd() * 6,                           // how long a crystal can grow
    habit: rnd() < 0.5 ? rnd() * 0.8 : 0,          // pull toward the cube's axes and diagonals (0: free)
    cluster: 0.5 + rnd() * 2,                       // how much a crystal favours growing by others
    grow: 420 + Math.floor(rnd() * 240),           // steps of growing before it wanders
    pace: 0.6 + rnd() * 0.6,                       // how fast it wanders
    tilt: (rnd() - 0.5) * 0.8, roll: (rnd() - 0.5) * 0.8,
    mineral: minerals[Math.floor(rnd() * minerals.length)],
    hue: rnd(),                                     // the film's offset (bismuth's colours)
    ...over,
  };
}

/** Where the creature is at step s (continuous): its centre, its turn (a rotation matrix), its size. */
export function pose(g, s) {
  const cx = GX / 2, cy = GY / 2, cz = GZ / 2, A = 26;
  const w = Math.max(0, s - g.grow) * 0.0009 * g.pace;          // the phase along its path
  const ease = Math.min(1, Math.max(0, s - g.grow) / 300);       // it sets off gently
  const x = cx + A * Math.sin(w) * ease, z = cz + A * 0.7 * (Math.sin(2 * w + 0.6) - Math.sin(0.6)) * ease;
  const y = cy + 2 * Math.sin(s * 0.004);
  const vx = Math.cos(w), vz = 1.4 * Math.cos(2 * w + 0.6);
  const head = Math.atan2(vx, vz) * ease + (1 - ease) * Math.atan2(1, 1.4 * Math.cos(0.6));
  return { c: [x, y, z], R: rot(head + 0.03 * Math.sin(s * 0.007), g.tilt + 0.1 * Math.sin(s * 0.005), g.roll), k: g.scale * (1 + 0.04 * Math.sin(s * 0.011)) };
}
function rot(yaw, pitch, roll) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch), cr = Math.cos(roll), sr = Math.sin(roll);
  const Rz = [[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]], Rx = [[1, 0, 0], [0, cp, -sp], [0, sp, cp]], Ry = [[cy, 0, sy], [0, 1, 0], [-sy, 0, cy]];
  const m = (A, B) => A.map((r) => [0, 1, 2].map((j) => r[0] * B[0][j] + r[1] * B[1][j] + r[2] * B[2][j]));
  return m(Ry, m(Rx, Rz));
}

/** The two density templates of an attractor: close in (the current) and blurred (the nutrient). */
function templates(cloud) {
  const T = new Float32Array(TN * TN * TN), n = cloud.n, p = cloud.p, f = TN / (2 * TU);
  for (let i = 0; i < n; i++) {
    const x = Math.floor((p[i * 3] + TU) * f), y = Math.floor((p[i * 3 + 1] + TU) * f), z = Math.floor((p[i * 3 + 2] + TU) * f);
    if (x >= 0 && y >= 0 && z >= 0 && x < TN && y < TN && z < TN) T[(z * TN + y) * TN + x] += 1;
  }
  const near = blur(T, 1, 1), far = blur(T, 2, 3);
  norm(near, 0.985); norm(far, 0.97);
  return { near, far };
}
function blur(src, r, passes) {
  let a = Float32Array.from(src), b = new Float32Array(a.length);
  const S = [1, TN, TN * TN];
  for (let p = 0; p < passes; p++) for (let ax = 0; ax < 3; ax++) {
    for (let z = 0; z < TN; z++) for (let y = 0; y < TN; y++) for (let x = 0; x < TN; x++) {
      const q = [x, y, z], i = (z * TN + y) * TN + x; let s = 0;
      for (let d = -r; d <= r; d++) { const v = q[ax] + d; if (v >= 0 && v < TN) s += a[i + d * S[ax]]; }
      b[i] = s / (2 * r + 1);
    }
    [a, b] = [b, a];
  }
  return a;
}
function norm(a, pct) {
  const nz = Array.from(a.filter((v) => v > 0)).sort((x, y) => x - y), top = nz[Math.floor(nz.length * pct)] || 1;
  for (let i = 0; i < a.length; i++) a[i] = Math.min(1.5, a[i] / top);
}
function sample(T, u, v, w) {
  const f = TN / (2 * TU), x = (u + TU) * f - 0.5, y = (v + TU) * f - 0.5, z = (w + TU) * f - 0.5;
  if (!(x >= 0 && y >= 0 && z >= 0 && x < TN - 1 && y < TN - 1 && z < TN - 1)) return 0;
  const ix = x | 0, iy = y | 0, iz = z | 0, fx = x - ix, fy = y - iy, fz = z - iz, i = (iz * TN + iy) * TN + ix, A = TN, B = TN * TN;
  const c00 = T[i] + (T[i + 1] - T[i]) * fx, c10 = T[i + A] + (T[i + A + 1] - T[i + A]) * fx;
  const c01 = T[i + B] + (T[i + B + 1] - T[i + B]) * fx, c11 = T[i + B + A] + (T[i + B + A + 1] - T[i + B + A]) * fx;
  return (c00 + (c10 - c00) * fy) * (1 - fz) + (c01 + (c11 - c01) * fy) * fz;
}
// the habit directions: the cube's 3 axes, 6 face diagonals and 4 body diagonals, both ways
const HABIT = [];
for (const d of [[1, 0, 0], [0, 1, 0], [0, 0, 1], [1, 1, 0], [1, -1, 0], [1, 0, 1], [1, 0, -1], [0, 1, 1], [0, 1, -1], [1, 1, 1], [1, 1, -1], [1, -1, 1], [-1, 1, 1]]) {
  const l = Math.hypot(...d); HABIT.push(d.map((v) => v / l), d.map((v) => -v / l));
}
const COLUMNS = [['base', Float32Array, 3], ['dir', Float32Array, 3], ['len', Float32Array, 1], ['born', Uint32Array, 1], ['fedAt', Uint32Array, 1], ['alive', Uint8Array, 1], ['spin', Float32Array, 1]];

/** A creature: its genome, its flow (the realised attractor) and its house, stepped by `step()`. */
export class Creature {
  constructor(seed, over = {}) {
    this.g = genome(seed, over);
    this.cloud = realise(this.g.key, 16000);
    const T = templates(this.cloud); this.near = T.near; this.far = T.far;
    // crystals, as columns: base (x, y, z), direction (unit), length, born, fed, alive, spin
    this.cap = 2048; this.n = 0;
    for (const [k, A, w] of COLUMNS) this[k] = new A(this.cap * w);
    this.crowd = new Uint16Array(NX * NY * NZ);    // live crystal bases per cell
    this.s = 0; this.count = 0; this.laid = 0; this.lost = 0; this.version = 0;
    this.epoch = 0;                                 // bumps when the columns are compacted (indices move)
  }
  local(P, x, y, z, out) {          // world → the attractor's frame, at pose P
    const px = x - P.c[0], py = y - P.c[1], pz = z - P.c[2], R = P.R, ik = 1 / P.k;
    out[0] = (R[0][0] * px + R[1][0] * py + R[2][0] * pz) * ik; out[1] = (R[0][1] * px + R[1][1] * py + R[2][1] * pz) * ik; out[2] = (R[0][2] * px + R[1][2] * py + R[2][2] * pz) * ik;
    return out;
  }
  /** The current and the nutrient at a world point, at pose P. */
  field(P, x, y, z) { const u = this.local(P, x, y, z, [0, 0, 0]); return { current: sample(this.near, u[0], u[1], u[2]), nutrient: sample(this.far, u[0], u[1], u[2]) }; }
  cell(x, y, z) { const i = Math.floor(x / CELL), j = Math.floor(y / CELL), k = Math.floor(z / CELL); return i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ ? (j * NZ + k) * NX + i : -1; }
  near3(x, y, z) {                    // live crystals in the 3×3×3 cells round a point
    const i0 = Math.floor(x / CELL), j0 = Math.floor(y / CELL), k0 = Math.floor(z / CELL); let n = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) for (let i = i0 - 1; i <= i0 + 1; i++) if (i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ) n += this.crowd[(j * NZ + k) * NX + i];
    return n;
  }
  /** Room for more: drop the dead (the living keep their order), then grow the columns if still full. */
  room() {
    let j = 0;
    for (let i = 0; i < this.n; i++) if (this.alive[i]) {
      if (i !== j) for (const [k, , w] of COLUMNS) this[k].copyWithin(j * w, i * w, i * w + w);
      j++;
    }
    this.n = j; this.epoch++;
    if (this.n > this.cap * 0.7) { this.cap *= 2; for (const [k, A, w] of COLUMNS) { const B = new A(this.cap * w); B.set(this[k]); this[k] = B; } }
  }
  /** One step: nucleation on the halo, growth at the tips, the current's dissolving, the reef's erosion. */
  step() {
    const g = this.g, s = ++this.s, P = pose(g, s), u = [0, 0, 0], R = P.R, k = P.k;
    if (this.n > this.cap - 120) this.room();
    let laid = 0, lost = 0;
    // nucleation: candidate points in the creature's box; a crystal where the halo is, pointing inward
    for (let t = 0; t < 320; t++) {
      const lu = (hash(s, t * 3 + 1) * 2 - 1) * TU, lv = (hash(s, t * 3 + 2) * 2 - 1) * TU, lw = (hash(s, t * 3 + 3) * 2 - 1) * TU;
      const nut = sample(this.far, lu, lv, lw);
      if (nut < g.halo || nut > g.halo * g.wall || sample(this.near, lu, lv, lw) > g.channel * 0.3) continue;
      const x = P.c[0] + (R[0][0] * lu + R[0][1] * lv + R[0][2] * lw) * k, y = P.c[1] + (R[1][0] * lu + R[1][1] * lv + R[1][2] * lw) * k, z = P.c[2] + (R[2][0] * lu + R[2][1] * lv + R[2][2] * lw) * k;
      if (x < 2 || y < 2 || z < 2 || x > GX - 2 || y > GY - 2 || z > GZ - 2) continue;
      const crowd = this.near3(x, y, z);
      if (crowd > 12) continue;                                                  // no room
      const p = (0.035 + 0.35 * Math.min(1, (nut - g.halo) / g.halo)) * (0.25 + g.cluster * Math.min(3, crowd)) / (1 + g.cluster);
      if (hash(s, t * 3 + 7777) > p) continue;
      // the nutrient's gradient (in the attractor's frame, turned to the world): toward the flow
      const e = 0.06, gu = sample(this.far, lu + e, lv, lw) - sample(this.far, lu - e, lv, lw), gv = sample(this.far, lu, lv + e, lw) - sample(this.far, lu, lv - e, lw), gw = sample(this.far, lu, lv, lw + e) - sample(this.far, lu, lv, lw - e);
      let d = [R[0][0] * gu + R[0][1] * gv + R[0][2] * gw, R[1][0] * gu + R[1][1] * gv + R[1][2] * gw, R[2][0] * gu + R[2][1] * gv + R[2][2] * gw];
      let l = Math.hypot(...d); if (l < 1e-6) continue;
      d = d.map((v, q) => v / l + (hash(s, t * 5 + q + 900) - 0.5) * 0.7);     // splayed, as a druse is
      if (g.habit > 0) {
        let best = HABIT[0], bd = -2; for (const h of HABIT) { const dd = h[0] * d[0] + h[1] * d[1] + h[2] * d[2]; if (dd > bd) { bd = dd; best = h; } }
        const m = Math.hypot(...d); d = d.map((v, q) => v + (best[q] * m - v) * g.habit);
      }
      l = Math.hypot(...d); d = d.map((v) => v / l);
      const i = this.n++;
      this.base.set([x, y, z], i * 3); this.dir.set(d, i * 3); this.len[i] = 0.3; this.born[i] = s; this.fedAt[i] = s; this.alive[i] = 1; this.spin[i] = hash(i + s * 7, 5) * 6.283;
      const ci = this.cell(x, y, z); if (ci >= 0) this.crowd[ci]++;
      this.count++; laid++;
    }
    // every crystal: fed at its tip, it grows; in the current, it dissolves back; unfed long, it erodes
    const box = liveHalf(k);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const bx = this.base[i * 3], by = this.base[i * 3 + 1], bz = this.base[i * 3 + 2];
      if (Math.abs(bx - P.c[0]) > box || Math.abs(by - P.c[1]) > box || Math.abs(bz - P.c[2]) > box) {
        if (s - this.fedAt[i] > 1500 && hash(i + this.born[i], s) < 0.0008) { this.kill(i); lost++; }   // reef: erodes, rarely
        continue;
      }
      const L = this.len[i];
      this.local(P, bx + this.dir[i * 3] * L, by + this.dir[i * 3 + 1] * L, bz + this.dir[i * 3 + 2] * L, u);
      const cur = sample(this.near, u[0], u[1], u[2]), nut = sample(this.far, u[0], u[1], u[2]);
      if (cur > g.channel) {
        this.len[i] = L - (0.08 + 0.6 * (cur - g.channel));                     // dissolved back by the current
        if (this.len[i] < 0.25) { this.kill(i); lost++; }
        continue;
      }
      if (nut > g.halo * 0.5) {
        this.fedAt[i] = s;
        if (L < g.reach) this.len[i] = L + 0.035 * Math.min(2, nut / g.halo) / (1 + L * g.girth * 1.5);
      }
    }
    this.laid += laid; this.lost += lost; this.version++;
    return { laid, lost };
  }
  kill(i) { this.alive[i] = 0; this.count--; const ci = this.cell(this.base[i * 3], this.base[i * 3 + 1], this.base[i * 3 + 2]); if (ci >= 0 && this.crowd[ci]) this.crowd[ci]--; }
  run(n) { for (let k = 0; k < n; k++) this.step(); return this; }
  /** A hash of the house (for determinism checks). */
  digest() { let h = 0; for (let i = 0; i < this.n; i++) if (this.alive[i]) h = (Math.imul(h, 31) + Math.round(this.len[i] * 100) + Math.round(this.base[i * 3] * 10)) | 0; return h >>> 0; }
}
