// shell.js — flows that grow their own houses of crystals, live in them, and share a world.
//
// A creature is two things: a FLOW (a strange attractor from the bestiary, its orbit running forever)
// and a HOUSE (crystals, a druse, like the inside of a geode). The flow feeds the crystals and the
// crystals are shaped by the flow:
//
//   - the flow's orbit density, blurred, is its NUTRIENT field. Crystals nucleate on a band of it (the
//     halo round the orbit: fed, but not in the flow's way), more readily beside crystals already
//     there (anyone's: a druse clusters), and point up its gradient: in, at the flow;
//   - a crystal grows at its tip while the tip is fed, the longer the slower;
//   - the density close in is the CURRENT: a tip that reaches where the orbit runs is dissolved back,
//     so the crystals stop short of the flow and their tips carve a room fitted to its shape.
//
// And a WORLD round them: a MEDIUM of dissolved mineral, in veins (seeded), which everything is made
// of. A flow grazes it where its orbit runs; a crystal is built out of it where it grows; a crystal
// the current dissolves gives its mineral back, and so, slowly, does a reef that erodes. The medium
// seeps back toward its veins, slowly. Nothing is scripted about where a creature goes:
//
//   - HUNGER: a flow is drawn up the medium's gradient, harder the more it has eaten round itself.
//     So it sits and grows while its place is rich, and sets off when it has eaten it out;
//   - CROWDING: a crystal tip that reaches into a flow's current pushes it (along the crystal, away),
//     its own house or anyone's; and flows keep a little distance from each other;
//   - it turns, slowly, to face the way it is going, and its house is re-grown to fit.
//
// So a creature grows while it is fed, is pushed by its own house as the house closes in, leaves the
// house when it has eaten its place out, and the house it leaves is a store of mineral: a reef that
// bleaches, erodes, and feeds the medium back. Another flow's halo keeps a reef it passes alive (a
// crystal is fed by any flow), and its current carves through it. That is the ecosystem.
//
// Deterministic: the world after n steps is a function of (seed, count, n). Every random decision
// is a hash of (thing, step), never a running stream; the creatures step in a fixed order.

import { BESTIARY } from './bestiary.js';
import { realise, mulberry32 } from './space.js';

export const GX = 160, GY = 72, GZ = 160;          // the world's box (x, z the floor plan, y up)
const TN = 48, TU = 1.7;                          // the templates: TN³ cells over [-TU, TU]³ attractor units
const CELL = 2, NX = GX / CELL, NY = GY / CELL, NZ = GZ / CELL;   // the crowding grid
const MC = 4, MX = GX / MC, MY = GY / MC, MZ = GZ / MC;          // the medium's grid
/** The half-width of the box round a creature where anything can be fed (attractor units × k). */
export const liveHalf = (k) => 1.45 * k;

const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** The minerals: how a house looks (the renderer reads these). */
export const MINERALS = {
  bismuth: { base: [0.55, 0.55, 0.6], iri: 0.75, glass: 0.1, spec: 0.9 },
  quartz: { base: [0.8, 0.83, 0.88], iri: 0.12, glass: 0.8, spec: 1 },
  amethyst: { base: [0.52, 0.3, 0.72], iri: 0.1, glass: 0.65, spec: 0.9 },
  obsidian: { base: [0.08, 0.08, 0.1], iri: 0.25, glass: 0.15, spec: 1.2 },
  citrine: { base: [0.95, 0.66, 0.25], iri: 0.1, glass: 0.6, spec: 0.9 },
};

/** The genome a seed makes: which attractor, how big, how its crystals grow, how it moves. */
export function genome(seed, over = {}) {
  const rnd = mulberry32((seed >>> 0) * 2246822519 + 3);
  const pool = BESTIARY.filter((b) => b.fill > 0.08 && b.dim > 1.6);
  const b = pool[Math.floor(rnd() * pool.length)];
  const minerals = Object.keys(MINERALS);
  return {
    seed, key: b.key,
    scale: 11 + rnd() * 5,                         // world units an attractor unit
    halo: 0.05 + rnd() * 0.05,                     // nutrient needed to nucleate
    wall: 2 + rnd() * 2,                            // above halo × wall is too close: the flow's room
    channel: 0.03 + rnd() * 0.05,                  // current that dissolves a tip
    girth: 0.12 + rnd() * 0.16,                    // a crystal's width over its length
    reach: 3 + rnd() * 6,                           // how long a crystal can grow
    habit: rnd() < 0.5 ? rnd() * 0.8 : 0,          // pull toward the cube's axes and diagonals (0: free)
    cluster: 0.5 + rnd() * 2,                       // how much a crystal favours growing by others
    appetite: 0.6 + rnd() * 0.8,                   // how hard the flow grazes
    restless: 0.6 + rnd() * 0.8,                   // how strongly hunger moves it
    tilt: (rnd() - 0.5) * 0.8, roll: (rnd() - 0.5) * 0.8,
    mineral: minerals[Math.floor(rnd() * minerals.length)],
    hue: rnd(),                                     // the film's offset (bismuth's colours)
    ...over,
  };
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
const MAXV = 0.05;                                 // a flow's top speed, world units a step

/** A creature: its genome, its flow (the realised attractor), where it is, and its house. */
export class Creature {
  constructor(world, index, seed, at, yaw, over = {}) {
    this.world = world; this.index = index;
    this.g = genome(seed, over);
    this.cloud = realise(this.g.key, 16000);
    const T = templates(this.cloud); this.near = T.near; this.far = T.far;
    this.cap = 2048; this.n = 0;
    for (const [k, A, w] of COLUMNS) this[k] = new A(this.cap * w);
    this.c = at.slice(); this.v = [0, 0, 0]; this.yaw = yaw; this.prev = { c: at.slice(), yaw };
    this.count = 0; this.laid = 0; this.lost = 0; this.epoch = 0; this.eaten = 0; this.travelled = 0;
    this.push = [0, 0, 0];
  }
  /** Where it is, a fraction f of the way from the last step to this one: centre, turn, size. */
  poseAt(f = 1, s = this.world.s) {
    const c = [0, 1, 2].map((q) => this.prev.c[q] + (this.c[q] - this.prev.c[q]) * f);
    let dy = this.yaw - this.prev.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const t = s - 1 + f, g = this.g;
    return { c, R: rot(this.prev.yaw + dy * f + 0.03 * Math.sin(t * 0.007 + this.index), g.tilt + 0.1 * Math.sin(t * 0.005 + this.index * 2), g.roll), k: g.scale * (1 + 0.04 * Math.sin(t * 0.011 + this.index)) };
  }
  local(P, x, y, z, out) {          // world → the attractor's frame, at pose P
    const px = x - P.c[0], py = y - P.c[1], pz = z - P.c[2], R = P.R, ik = 1 / P.k;
    out[0] = (R[0][0] * px + R[1][0] * py + R[2][0] * pz) * ik; out[1] = (R[0][1] * px + R[1][1] * py + R[2][1] * pz) * ik; out[2] = (R[0][2] * px + R[1][2] * py + R[2][2] * pz) * ik;
    return out;
  }
  /** The current and the nutrient at a world point, at pose P. */
  field(P, x, y, z) { const u = this.local(P, x, y, z, [0, 0, 0]); return { current: sample(this.near, u[0], u[1], u[2]), nutrient: sample(this.far, u[0], u[1], u[2]) }; }
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
  kill(i) {
    const W = this.world; this.alive[i] = 0; this.count--;
    const x = this.base[i * 3], y = this.base[i * 3 + 1], z = this.base[i * 3 + 2];
    const ci = W.cell(x, y, z); if (ci >= 0 && W.crowd[ci]) W.crowd[ci]--;
    W.give(x, y, z, this.len[i] * 0.05);                     // its mineral, back into the medium
  }

  /** Grow: nucleation on the halo, the flow grazing, tips growing. (Its current on crystals is `carve`.) */
  grow(s, P) {
    const g = this.g, W = this.world, R = P.R, k = P.k, u = [0, 0, 0];
    if (this.n > this.cap - 120) this.room();
    let laid = 0;
    for (let t = 0; t < 320; t++) {
      const hs = s * 8 + this.index;
      const lu = (hash(hs, t * 3 + 1) * 2 - 1) * TU, lv = (hash(hs, t * 3 + 2) * 2 - 1) * TU, lw = (hash(hs, t * 3 + 3) * 2 - 1) * TU;
      const nut = sample(this.far, lu, lv, lw);
      if (nut < g.halo || nut > g.halo * g.wall || sample(this.near, lu, lv, lw) > g.channel * 0.3) continue;
      const x = P.c[0] + (R[0][0] * lu + R[0][1] * lv + R[0][2] * lw) * k, y = P.c[1] + (R[1][0] * lu + R[1][1] * lv + R[1][2] * lw) * k, z = P.c[2] + (R[2][0] * lu + R[2][1] * lv + R[2][2] * lw) * k;
      if (x < 2 || y < 2 || z < 2 || x > GX - 2 || y > GY - 2 || z > GZ - 2) continue;
      const crowd = W.near3(x, y, z), med = W.mediumAt(x, y, z);
      if (crowd > 12 || med < 0.08) continue;                                   // no room; nothing to build with
      const p = (0.035 + 0.35 * Math.min(1, (nut - g.halo) / g.halo)) * (0.25 + g.cluster * Math.min(3, crowd)) / (1 + g.cluster) * Math.min(1, med * 1.5);
      if (hash(hs, t * 3 + 7777) > p) continue;
      const e = 0.06, gu = sample(this.far, lu + e, lv, lw) - sample(this.far, lu - e, lv, lw), gv = sample(this.far, lu, lv + e, lw) - sample(this.far, lu, lv - e, lw), gw = sample(this.far, lu, lv, lw + e) - sample(this.far, lu, lv, lw - e);
      let d = [R[0][0] * gu + R[0][1] * gv + R[0][2] * gw, R[1][0] * gu + R[1][1] * gv + R[1][2] * gw, R[2][0] * gu + R[2][1] * gv + R[2][2] * gw];
      let l = Math.hypot(...d); if (l < 1e-6) continue;
      d = d.map((v, q) => v / l + (hash(hs, t * 5 + q + 900) - 0.5) * 0.7);     // splayed, as a druse is
      if (g.habit > 0) {
        let best = HABIT[0], bd = -2; for (const h of HABIT) { const dd = h[0] * d[0] + h[1] * d[1] + h[2] * d[2]; if (dd > bd) { bd = dd; best = h; } }
        const m = Math.hypot(...d); d = d.map((v, q) => v + (best[q] * m - v) * g.habit);
      }
      l = Math.hypot(...d); d = d.map((v) => v / l);
      const i = this.n++;
      this.base.set([x, y, z], i * 3); this.dir.set(d, i * 3); this.len[i] = 0.3; this.born[i] = s; this.fedAt[i] = s; this.alive[i] = 1; this.spin[i] = hash(i + hs * 7, 5) * 6.283;
      const ci = W.cell(x, y, z); if (ci >= 0) W.crowd[ci]++;
      W.take(x, y, z, 0.015);
      this.count++; laid++;
    }
    // tips grow where they are fed and there is mineral to build with
    const box = liveHalf(k);
    for (let i = 0; i < this.n; i++) {
      if (!this.alive[i]) continue;
      const bx = this.base[i * 3], by = this.base[i * 3 + 1], bz = this.base[i * 3 + 2];
      if (Math.abs(bx - P.c[0]) > box || Math.abs(by - P.c[1]) > box || Math.abs(bz - P.c[2]) > box) continue;
      const L = this.len[i], tx = bx + this.dir[i * 3] * L, ty = by + this.dir[i * 3 + 1] * L, tz = bz + this.dir[i * 3 + 2] * L;
      this.local(P, tx, ty, tz, u);
      const nut = sample(this.far, u[0], u[1], u[2]);
      if (nut > g.halo * 0.5 && L < g.reach && sample(this.near, u[0], u[1], u[2]) <= g.channel) {
        const med = W.mediumAt(tx, ty, tz); if (med < 0.03) continue;
        const dL = 0.035 * Math.min(2, nut / g.halo) / (1 + L * g.girth * 1.5) * Math.min(1, med * 2);
        this.len[i] = L + dL; W.take(tx, ty, tz, dL * 0.05);
      }
    }
    // the flow grazes: the medium where its orbit runs (a few cells a step, by hash)
    for (let t = 0; t < 40; t++) {
      const q = Math.floor(hash(s * 8 + this.index, 50000 + t) * this.cloud.n), a = this.cloud.p[q * 3] * k, b = this.cloud.p[q * 3 + 1] * k, c = this.cloud.p[q * 3 + 2] * k;
      const x = P.c[0] + R[0][0] * a + R[0][1] * b + R[0][2] * c, y = P.c[1] + R[1][0] * a + R[1][1] * b + R[1][2] * c, z = P.c[2] + R[2][0] * a + R[2][1] * b + R[2][2] * c;
      this.eaten += W.take(x, y, z, 0.014 * g.appetite);
    }
    this.laid += laid;
    return laid;
  }

  /** This flow's current on every crystal near it (anyone's): it feeds them, dissolves tips in its way, and is pushed by them. */
  carve(s, P) {
    const g = this.g, W = this.world, u = [0, 0, 0], box = liveHalf(P.k); let lost = 0;
    for (const B of W.creatures) {
      for (let i = 0; i < B.n; i++) {
        if (!B.alive[i]) continue;
        const bx = B.base[i * 3], by = B.base[i * 3 + 1], bz = B.base[i * 3 + 2];
        if (Math.abs(bx - P.c[0]) > box || Math.abs(by - P.c[1]) > box || Math.abs(bz - P.c[2]) > box) continue;
        const L = B.len[i], dx = B.dir[i * 3], dy = B.dir[i * 3 + 1], dz = B.dir[i * 3 + 2];
        this.local(P, bx + dx * L, by + dy * L, bz + dz * L, u);
        const cur = sample(this.near, u[0], u[1], u[2]);
        if (sample(this.far, u[0], u[1], u[2]) > g.halo * 0.5) B.fedAt[i] = s;   // any flow feeds a crystal it bathes
        if (cur > g.channel) {
          const d = 0.08 + 0.6 * (cur - g.channel);
          B.len[i] = L - d; W.give(bx + dx * L, by + dy * L, bz + dz * L, d * 0.05);
          // the tip pushes the flow: along the crystal, away from its base
          const f = Math.min(0.3, cur - g.channel) * 0.0035; this.push[0] += dx * f; this.push[1] += dy * f; this.push[2] += dz * f;
          if (B.len[i] < 0.25) { B.kill(i); lost++; }
        }
      }
    }
    this.lost += lost;
    return lost;
  }

  /** Move: up the medium's gradient as it gets hungry, pushed by the tips in its way, apart from others, off the walls. */
  move(s, P) {
    const W = this.world, g = this.g, r = P.k * 2.2, c = this.c;
    const m0 = W.mediumAt(c[0], c[1], c[2]), gr = [0, 1, 2].map((q) => { const a = c.slice(), b = c.slice(); a[q] += r; b[q] -= r; return (W.mediumAt(...a) - W.mediumAt(...b)) / (2 * r); });
    gr[1] *= 0.4;                                                            // it prefers to roam level
    const gl = Math.hypot(...gr), hunger = Math.max(0, Math.min(1, 1.3 - m0 / 0.3));
    const acc = [0, 0, 0];
    if (gl > 1e-5) for (let q = 0; q < 3; q++) acc[q] += (gr[q] / gl) * Math.min(1, gl * 400) * hunger * 0.0014 * g.restless;
    for (let q = 0; q < 3; q++) { acc[q] += this.push[q]; this.push[q] = 0; }
    for (const B of W.creatures) if (B !== this) {                          // a little distance from other flows
      const d = [c[0] - B.c[0], c[1] - B.c[1], c[2] - B.c[2]], l = Math.hypot(...d) || 1, near = (g.scale + B.g.scale) * 1.6;
      if (l < near) for (let q = 0; q < 3; q++) acc[q] += (d[q] / l) * 0.0015 * (1 - l / near);
    }
    const lo = [P.k * 1.2, P.k * 1.1, P.k * 1.2], hi = [GX - lo[0], GY - lo[1], GZ - lo[2]];
    for (let q = 0; q < 3; q++) { if (c[q] < lo[q]) acc[q] += 0.002 * (lo[q] - c[q]) / P.k; if (c[q] > hi[q]) acc[q] -= 0.002 * (c[q] - hi[q]) / P.k; }
    this.prev = { c: c.slice(), yaw: this.yaw };
    for (let q = 0; q < 3; q++) this.v[q] = this.v[q] * 0.97 + acc[q];
    const sp = Math.hypot(...this.v); if (sp > MAXV) for (let q = 0; q < 3; q++) this.v[q] *= MAXV / sp;
    for (let q = 0; q < 3; q++) c[q] += this.v[q];
    this.travelled += Math.min(sp, MAXV);
    // it turns to face its way, slowly (its house is re-grown to fit)
    const hs = Math.hypot(this.v[0], this.v[2]);
    if (hs > 0.004) { let d = Math.atan2(this.v[0], this.v[2]) - this.yaw; d = Math.atan2(Math.sin(d), Math.cos(d)); this.yaw += Math.max(-0.006, Math.min(0.006, d)) * Math.min(1, hs / 0.02); }
    this.hunger = hunger;
  }
  /** Reef: crystals no flow has fed for a long time erode, rarely, giving back their mineral. */
  erode(s) {
    let lost = 0;
    for (let i = 0; i < this.n; i++) if (this.alive[i] && s - this.fedAt[i] > 1500 && hash(i + this.born[i], s * 4 + this.index) < 0.0008) { this.kill(i); lost++; }
    this.lost += lost;
  }
  run(n) { this.world.run(n); return this; }
  digest() { let h = 0; for (let i = 0; i < this.n; i++) if (this.alive[i]) h = (Math.imul(h, 31) + Math.round(this.len[i] * 100) + Math.round(this.base[i * 3] * 10)) | 0; return h >>> 0; }
}

/** A world: the medium, the crowding grid, and its creatures, stepped together. */
export class World {
  constructor(seed, count = 3) {
    this.seed = seed; this.s = 0; this.version = 0;
    this.crowd = new Uint16Array(NX * NY * NZ);
    // the medium: veins of dissolved mineral (a few seeded blobs and a floor), which it seeps back toward
    const rnd = mulberry32((seed >>> 0) * 747796405 + 11), veins = Array.from({ length: 9 }, () => ({ x: rnd() * GX, y: GY * (0.3 + 0.4 * rnd()), z: rnd() * GZ, r: 14 + rnd() * 26, a: 0.5 + rnd() * 0.6 }));
    this.base0 = new Float32Array(MX * MY * MZ); this.medium = new Float32Array(MX * MY * MZ);
    for (let j = 0; j < MY; j++) for (let k = 0; k < MZ; k++) for (let i = 0; i < MX; i++) {
      const x = (i + 0.5) * MC, y = (j + 0.5) * MC, z = (k + 0.5) * MC; let v = 0.12;
      for (const b of veins) v += b.a * Math.exp(-((x - b.x) ** 2 + ((y - b.y) * 1.6) ** 2 + (z - b.z) ** 2) / (b.r * b.r));
      this.base0[(j * MZ + k) * MX + i] = Math.min(1.2, v);
    }
    this.medium.set(this.base0);
    this.creatures = [];
    for (let n = 0; n < count; n++) {
      const a = (n / count) * Math.PI * 2 + rnd() * 0.8, rr = count > 1 ? 34 + rnd() * 10 : 0;
      this.creatures.push(new Creature(this, n, (Math.imul(seed >>> 0, 2654435761) + n * 40503) >>> 0 || 1, [GX / 2 + Math.cos(a) * rr, GY / 2 + (rnd() - 0.5) * 8, GZ / 2 + Math.sin(a) * rr], rnd() * Math.PI * 2));
    }
  }
  cell(x, y, z) { const i = Math.floor(x / CELL), j = Math.floor(y / CELL), k = Math.floor(z / CELL); return i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ ? (j * NZ + k) * NX + i : -1; }
  near3(x, y, z) {                    // live crystals (anyone's) in the 3×3×3 cells round a point
    const i0 = Math.floor(x / CELL), j0 = Math.floor(y / CELL), k0 = Math.floor(z / CELL); let n = 0;
    for (let j = j0 - 1; j <= j0 + 1; j++) for (let k = k0 - 1; k <= k0 + 1; k++) for (let i = i0 - 1; i <= i0 + 1; i++) if (i >= 0 && j >= 0 && k >= 0 && i < NX && j < NY && k < NZ) n += this.crowd[(j * NZ + k) * NX + i];
    return n;
  }
  mcell(x, y, z) { const i = Math.floor(x / MC), j = Math.floor(y / MC), k = Math.floor(z / MC); return i >= 0 && j >= 0 && k >= 0 && i < MX && j < MY && k < MZ ? (j * MZ + k) * MX + i : -1; }
  mediumAt(x, y, z) { const m = this.mcell(x, y, z); return m < 0 ? 0 : this.medium[m]; }
  take(x, y, z, a) { const m = this.mcell(x, y, z); if (m < 0) return 0; const t = Math.min(a, this.medium[m]); this.medium[m] -= t; return t; }
  give(x, y, z, a) { const m = this.mcell(x, y, z); if (m >= 0) this.medium[m] += a; }
  /** The medium seeps: a little diffusion, and back toward its veins, slowly. */
  seep() {
    const M = this.medium, B = this.base0, out = this.seepBuf ||= new Float32Array(M.length), SX = 1, SZ = MX, SY = MX * MZ;
    for (let j = 0; j < MY; j++) for (let k = 0; k < MZ; k++) for (let i = 0; i < MX; i++) {
      const o = (j * MZ + k) * MX + i; let s = 0, n = 0;
      if (i > 0) { s += M[o - SX]; n++; } if (i < MX - 1) { s += M[o + SX]; n++; } if (k > 0) { s += M[o - SZ]; n++; } if (k < MZ - 1) { s += M[o + SZ]; n++; } if (j > 0) { s += M[o - SY]; n++; } if (j < MY - 1) { s += M[o + SY]; n++; }
      const v = M[o] + 0.12 * (s / n - M[o]);
      out[o] = v + (B[o] - v) * 0.0008;
    }
    M.set(out);
  }
  step() {
    const s = ++this.s, poses = this.creatures.map((C) => C.poseAt(1, s));
    this.creatures.forEach((C, i) => C.grow(s, poses[i]));
    this.creatures.forEach((C, i) => C.carve(s, poses[i]));
    this.creatures.forEach((C, i) => C.move(s, poses[i]));
    if (s % 4 === 0) this.seep();
    if (s % 8 === 0) this.creatures.forEach((C) => C.erode(s));
    this.version++;
  }
  run(n) { for (let k = 0; k < n; k++) this.step(); return this; }
  get count() { return this.creatures.reduce((a, C) => a + C.count, 0); }
  digest() { return this.creatures.reduce((h, C) => (Math.imul(h, 31) + C.digest()) | 0, 0) >>> 0; }
}
