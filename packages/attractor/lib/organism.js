// organism.js — bodies grown from a program, organ by organ, as they eat.
//
// A body is a tree of ORGANS. Each organ is a strange attractor (drawn as its orbit) with a JOB that
// acts in the world and costs upkeep:
//
//   mouth  grazes the medium where it is: the only way anything gets energy
//   gut    holds energy: the body's capacity (a big gut survives lean stretches)
//   fin    beats. A stroke pushes against the water; the power stroke bites harder than the
//          recovery, so a beating fin pushes the body along. Off-centre fins turn it
//   sense  reads the medium's gradient over a distance and steers: it beats the fins on the far side
//          harder, which turns the body toward richer water
//   shell  grows crystal armour round itself out of spent energy: mass, drag, and (later) protection
//          (and a full body idles its fins: `rest`)
//   bud    when the gut is full, pinches off an offspring with the same program (mutated a little
//          if the world says so) and half the energy
//
// The GENOME is a developmental program, not a body. It is a root organ and a list of rules
// "an organ of type P grows a child of type C, in direction (az, el), at distance len, of size s,
// (mirrored)". Development runs those rules breadth-first from the root, but only as the body can
// pay: an organ is grown when the energy for it is there. So a body starts as a single mouth and
// grows as it eats, and a body that cannot feed stays small or dies.
//
// Physics is deliberately small: the body is rigid (the organs sit where development put them,
// in the body's frame), except the fins, which swing. Fin forces and drag move it and turn it
// (yaw; pitch follows the sense gently). It lives in a MEDIUM of dissolved mineral in seeded veins
// that seeps back slowly; a dead body dissolves back into it, its armour left as reef.
//
// Deterministic: a world after n steps is a function of (seed, genomes, n). Randomness is a hash of
// (thing, step); bodies step in a fixed order.

import { BESTIARY } from './bestiary.js';
import { realise, mulberry32 } from './space.js';

export const WX = 160, WY = 64, WZ = 160;          // the world's box
const MC = 4, MX = WX / MC, MY = WY / MC, MZ = WZ / MC;
const TAU = Math.PI * 2;
const hash = (a, b) => { let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

/** What each organ type costs to grow (per unit size) and to keep (per step, per unit size). */
export const ORGANS = {
  mouth: { build: 1.0, upkeep: 0.0007, colour: [1, 0.55, 0.22] },
  gut: { build: 0.8, upkeep: 0.0003, colour: [1, 0.8, 0.35] },
  fin: { build: 0.7, upkeep: 0.0004, colour: [0.3, 0.85, 1] },
  sense: { build: 1.2, upkeep: 0.0012, colour: [0.85, 0.7, 1] },
  shell: { build: 0.9, upkeep: 0.0003, colour: [0.75, 0.8, 0.9] },
  bud: { build: 1.0, upkeep: 0.0004, colour: [1, 0.45, 0.7] },
};
export const TYPES = Object.keys(ORGANS);

/** Three bodies, written by hand, to prove the organs work before evolution is let loose on them. */
export const GENOMES = {
  // a grazer: a mouth with a gut behind, one pair of fins, a sense up front, a bud at the back
  grazer: {
    name: 'grazer',
    root: { type: 'mouth', size: 1 },
    rules: [
      { p: 'mouth', c: 'sense', az: 0, el: 0.3, len: 1.3, size: 0.5 },
      { p: 'mouth', c: 'gut', az: Math.PI, el: 0, len: 1.4, size: 0.9 },
      { p: 'gut', c: 'fin', az: 1.5, el: 0, len: 1.6, size: 0.7, mirror: true, phase: 0 },
      { p: 'gut', c: 'bud', az: Math.PI, el: -0.2, len: 1.2, size: 0.5 },
    ],
    beat: { amp: 0.55, period: 34, steer: 0.8 },
  },
  // a reef-builder: a big mouth armoured all round, a big gut, no fins: it sits where it lands
  reef: {
    name: 'reef',
    root: { type: 'mouth', size: 1.5 },
    rules: [
      { p: 'mouth', c: 'gut', az: Math.PI, el: -0.3, len: 1.4, size: 1.2 },
      { p: 'mouth', c: 'shell', az: 1.1, el: 0.2, len: 1.5, size: 1, mirror: true },
      { p: 'mouth', c: 'shell', az: 0, el: 1.2, len: 1.4, size: 1 },
      { p: 'gut', c: 'shell', az: Math.PI, el: 0.6, len: 1.3, size: 0.9 },
      { p: 'gut', c: 'bud', az: Math.PI, el: -0.6, len: 1.1, size: 0.5 },
    ],
    beat: { amp: 0, period: 40, steer: 0 },
  },
  // a swimmer: a small mouth, a long sense, two pairs of fins each with a second joint, a bud
  swimmer: {
    name: 'swimmer',
    root: { type: 'mouth', size: 0.7 },
    rules: [
      { p: 'mouth', c: 'sense', az: 0, el: 0.1, len: 1.6, size: 0.6 },
      { p: 'mouth', c: 'gut', az: Math.PI, el: 0, len: 1.2, size: 0.6 },
      { p: 'mouth', c: 'fin', az: 1.2, el: 0, len: 1.4, size: 0.6, mirror: true, phase: 0 },
      { p: 'gut', c: 'fin', az: 2.0, el: 0, len: 1.4, size: 0.6, mirror: true, phase: 1.6 },
      { p: 'gut', c: 'bud', az: Math.PI, el: 0, len: 1.2, size: 0.4 },
    ],
    beat: { amp: 0.7, period: 26, steer: 1.2 },
  },
};

const unit = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dirOf = (az, el) => [Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el)];   // x right, y up, z forward

/**
 * Development, as a plan: every organ the program would grow, breadth-first from the root, each with
 * its parent, its place in the body's frame and its size. The body grows along this list as it can pay.
 */
export function develop(genome, max = 18, depth = 4) {
  const plan = [{ type: genome.root.type, size: genome.root.size, parent: -1, at: [0, 0, 0], axis: [0, 0, 1], depth: 0, side: 0, phase: 0 }];
  for (let q = 0; q < plan.length && plan.length < max; q++) {
    const P = plan[q];
    if (P.depth >= depth) continue;
    for (const r of genome.rules) {
      if (r.p !== P.type) continue;
      // a child on the right of the body grows on the right; a mirrored rule makes the pair
      for (const m of r.mirror ? [1, -1] : [P.side || 1]) {
        if (plan.length >= max) break;
        const az = r.mirror ? r.az * m : r.az * (P.side || 1), d = dirOf(az, r.el), at = [P.at[0] + d[0] * r.len, P.at[1] + d[1] * r.len, P.at[2] + d[2] * r.len];
        // no organ grows into another's place
        if (plan.some((o) => Math.hypot(o.at[0] - at[0], o.at[1] - at[1], o.at[2] - at[2]) < 0.45 * (o.size + r.size))) continue;
        plan.push({ type: r.c, size: r.size, parent: q, at, axis: d, depth: P.depth + 1, side: r.mirror ? m : P.side, phase: (r.phase || 0) + (m < 0 ? Math.PI * 0 : 0) });
      }
    }
  }
  return plan;
}

/**
 * A body plan's signature: its organ tree, canonically (each organ's type and its children's
 * signatures, sorted). Two programs that grow the same tree share a plan, whatever their numbers.
 */
/** One letter an organ in a signature: m mouth, g gut, f fin, s sense, h shell (the hard part), b bud. */
export const LETTER = { mouth: 'm', gut: 'g', fin: 'f', sense: 's', shell: 'h', bud: 'b' };
export function signature(genome) {
  const plan = develop(genome), kids = plan.map(() => []);
  plan.forEach((o, i) => { if (o.parent >= 0) kids[o.parent].push(i); });
  const sig = (i) => LETTER[plan[i].type] + (kids[i].length ? '(' + kids[i].map(sig).sort().join('') + ')' : '');
  return sig(0);
}
const SYL = ['ka', 'lo', 'mi', 'ru', 'te', 'sa', 'no', 'vi', 'po', 'da', 'wy', 'ne', 'or', 'ul', 'ae', 'zo', 'fe', 'ith', 'qu', 'bra'];
/** A name for a new body plan, from its signature (the same plan always gets the same name). */
export function speciesName(sig) { let h = 2166136261; for (const ch of sig) h = Math.imul(h ^ ch.charCodeAt(0), 16777619); const a = h >>> 0; return (SYL[a % 20] + SYL[(a >>> 5) % 20] + (a & 1024 ? SYL[(a >>> 11) % 20] : '')).replace(/^./, (c) => c.toUpperCase()); }

/** An attractor for each organ type, chosen for a lineage by fit (round mouths and guts, long fins). */
function organFlows(seed) {
  const rnd = mulberry32((seed >>> 0) * 1597334677 + 7), pool = BESTIARY.filter((b) => b.fill > 0.06 && b.dim > 1.5);
  const FIT = { mouth: (b) => b.ext[1] + b.ext[2], gut: (b) => b.ext[1] + b.ext[2], fin: (b) => 1 - b.ext[1], sense: (b) => 1 - b.ext[2], shell: (b) => b.ext[2], bud: (b) => b.ext[1] + b.ext[2] };
  const out = {};
  for (const t of TYPES) { const ranked = pool.map((b) => ({ b, s: FIT[t](b) + 0.5 * rnd() })).sort((x, y) => y.s - x.s); out[t] = ranked[Math.floor(rnd() * 8)].b.key; }
  return out;
}

/** A body: its genome, its development plan, the organs grown so far, where it is, and its energy. */
export class Body {
  constructor(world, id, genome, at, yaw, energy, lineage = id) {
    this.world = world; this.id = id; this.genome = genome; this.lineage = lineage;
    this.plan = develop(genome); this.grown = 1;     // organs grown so far (a prefix of the plan)
    this.p = at.slice(); this.v = [0, 0, 0]; this.yaw = yaw; this.pitch = 0; this.spin = 0;
    this.prev = { p: at.slice(), yaw, pitch: 0 };
    this.E = energy; this.age = 0; this.alive = true; this.eaten = 0; this.travelled = 0; this.children = 0;
    this.crystals = [];                              // armour: { organ, dir (body frame), len, born }
    this.cause = '';
  }
  get organs() { return this.plan.slice(0, this.grown); }
  size(type) { let s = 0; for (let i = 0; i < this.grown; i++) if (!type || this.plan[i].type === type) s += this.plan[i].size; return s; }
  capacity() { return 2 + 10 * this.size('gut') + 1.5 * this.size('mouth'); }
  mass() { return 0.6 + this.size() + this.crystals.length * 0.08; }
  /** The body's frame at yaw/pitch: right, up, forward. */
  frame(yaw = this.yaw, pitch = this.pitch) {
    const f = [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)], r = unit([Math.cos(yaw), 0, -Math.sin(yaw)]);
    const u = [f[1] * r[2] - f[2] * r[1], f[2] * r[0] - f[0] * r[2], f[0] * r[1] - f[1] * r[0]];
    return { r, u, f };
  }
  toWorld(F, p, local) { return [p[0] + F.r[0] * local[0] + F.u[0] * local[1] + F.f[0] * local[2], p[1] + F.r[1] * local[0] + F.u[1] * local[1] + F.f[1] * local[2], p[2] + F.r[2] * local[0] + F.u[2] * local[1] + F.f[2] * local[2]]; }
  /** A fin's swing at time t: the stroke's angle and angular speed (the steer scales it per side). */
  stroke(o, t, gain = 1) {
    const B = this.genome.beat, w = TAU / B.period, a = B.amp * gain;
    return { ang: a * Math.sin(w * t + o.phase), vel: a * w * Math.cos(w * t + o.phase) };
  }
  /** Each grown organ, in the world, a fraction f of the way from the last step to this one. */
  pose(f = 1, t = this.world.s - 1 + f) {
    const lerpA = (a, b) => a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * f;
    const p = [0, 1, 2].map((q) => this.prev.p[q] + (this.p[q] - this.prev.p[q]) * f), F = this.frame(lerpA(this.prev.yaw, this.yaw), this.prev.pitch + (this.pitch - this.prev.pitch) * f);
    const local = [], out = [];
    for (let i = 0; i < this.grown; i++) {
      const o = this.plan[i];
      let at = o.at, axis = o.axis;
      if (i > 0) {
        const pa = local[o.parent];
        let d = o.axis;
        if (o.type === 'fin') {                                    // it swings forward and back about its root
          const s = this.stroke(o, t, this.gains ? this.gains[i] : 1).ang, c = Math.cos(s), sn = Math.sin(s) * (o.at[0] >= 0 ? 1 : -1);
          d = unit([d[0] * c - d[2] * sn, d[1], d[0] * sn + d[2] * c]);
        }
        const len = Math.hypot(o.at[0] - this.plan[o.parent].at[0], o.at[1] - this.plan[o.parent].at[1], o.at[2] - this.plan[o.parent].at[2]);
        at = [pa.at[0] + d[0] * len, pa.at[1] + d[1] * len, pa.at[2] + d[2] * len]; axis = d;
      }
      local.push({ at, axis });
      out.push({ i, type: o.type, size: o.size, parent: o.parent, p: this.toWorld(F, p, at), axis: [F.r[0] * axis[0] + F.u[0] * axis[1] + F.f[0] * axis[2], F.r[1] * axis[0] + F.u[1] * axis[1] + F.f[1] * axis[2], F.r[2] * axis[0] + F.u[2] * axis[1] + F.f[2] * axis[2]], local: at, frame: F });
    }
    return { p, F, organs: out };
  }

  step(s) {
    const W = this.world, G = this.genome, B = G.beat, P = this.pose(1, s), F = P.F;
    this.prev = { p: this.p.slice(), yaw: this.yaw, pitch: this.pitch };
    this.age++;
    let upkeep = 0;
    for (const o of P.organs) upkeep += ORGANS[o.type].upkeep * o.size * W.hard;
    // mouths graze; senses read the gradient
    let turn = 0, climb = 0, senses = 0;
    for (const o of P.organs) {
      if (o.type === 'mouth') { const got = W.graze(o.p, 0.012 * o.size); this.E += got; this.eaten += got; }
      else if (o.type === 'sense') {
        const r = 3 + 6 * o.size, g = [0, 1, 2].map((q) => { const a = o.p.slice(), b = o.p.slice(); a[q] += r; b[q] -= r; return W.at(a) - W.at(b); }), gl = Math.hypot(...g);
        if (gl > 1e-6) { turn += (g[0] * F.r[0] + g[1] * F.r[1] + g[2] * F.r[2]) / gl; climb += g[1] / gl; senses++; }
      }
    }
    if (senses) { turn /= senses; climb /= senses; }
    // fins: each side beats harder when the food is on the other side (so the body turns toward it)
    const force = [0, 0, 0]; let torque = 0, beatCost = 0;
    this.gains = [];
    // appetite: a full body idles its fins (rest is a gene: 0 always swims, 1 stops when full)
    const drive = 1 - (B.rest ?? 0.7) * Math.max(0, Math.min(1, (this.E / this.capacity() - 0.3) / 0.6));
    for (const o of P.organs) {
      if (o.type !== 'fin') { this.gains[o.i] = 1; continue; }
      const side = o.local[0] >= 0 ? 1 : -1, gain = drive * Math.max(0, 1 - B.steer * turn * side * 0.8);
      this.gains[o.i] = gain;
      const { vel } = this.stroke(this.plan[o.i], s, gain), len = 0.8 + o.size;
      // the tip's speed along the body (backward on the power stroke), and the water's push on it
      const u = -vel * len, bite = u > 0 ? 1 : 0.25, fz = u * bite * o.size * 0.11;
      force[0] += F.f[0] * fz; force[1] += F.f[1] * fz; force[2] += F.f[2] * fz;
      torque += -o.local[0] * fz * 0.25;
      beatCost += 0.0012 * o.size * (B.amp * gain) ** 2;
    }
    // shells: armour from spare energy
    for (const o of P.organs) {
      if (o.type !== 'shell' || this.E < this.capacity() * 0.55) continue;
      const mine = this.crystals.filter((c) => c.organ === o.i);
      for (const c of mine) if (c.len < 1 + 1.6 * o.size) c.len += 0.01;
      if (mine.length < 14 * o.size && hash(this.id * 131 + o.i, s) < 0.03) {
        const a = hash(this.id + o.i, s * 3 + 1) * TAU, b = Math.acos(2 * hash(this.id + o.i, s * 3 + 2) - 1), d = [Math.sin(b) * Math.cos(a), Math.cos(b), Math.sin(b) * Math.sin(a)];
        const out = unit([d[0] + o.local[0] * 0.3, d[1] + o.local[1] * 0.3, d[2] + o.local[2] * 0.3]);
        this.crystals.push({ organ: o.i, dir: out, len: 0.3, born: s, spin: hash(this.id, s) * TAU }); this.E -= 0.05;
      }
    }
    this.E -= upkeep + beatCost;
    // growth: the next organ in the plan, when it can be paid for (keeping a margin to live on)
    if (this.grown < this.plan.length) {
      const nx = this.plan[this.grown], cost = ORGANS[nx.type].build * nx.size;
      if (this.E > cost + 0.3 * this.capacity() + 0.3) { this.E -= cost; this.grown++; }
    }
    this.E = Math.min(this.E, this.capacity());
    // motion: fin force, drag, the walls
    const m = this.mass(), drag = 0.035 * (this.size() + this.crystals.length * 0.1 + 0.5);
    const lo = 6, hi = [WX - 6, WY - 6, WZ - 6];
    for (let q = 0; q < 3; q++) { if (this.p[q] < lo) force[q] += 0.01 * (lo - this.p[q]); if (this.p[q] > hi[q]) force[q] -= 0.01 * (this.p[q] - hi[q]); }
    for (let q = 0; q < 3; q++) { this.v[q] += (force[q] - drag * this.v[q]) / m; this.p[q] += this.v[q]; }
    this.travelled += Math.hypot(...this.v);
    const I = 0.5 + P.organs.reduce((a, o) => a + o.size * (o.local[0] ** 2 + o.local[2] ** 2), 0);
    this.spin = (this.spin + torque / I) * 0.85; this.yaw += this.spin;
    this.pitch += (Math.max(-0.5, Math.min(0.5, climb * 0.6)) - this.pitch) * 0.02;
    // a bud, when the gut is full
    if (this.E > this.capacity() * 0.85 && this.grown === this.plan.length) {
      const bud = P.organs.find((o) => o.type === 'bud');
      if (bud && W.bodies.length < W.cap) { this.E *= 0.5; this.children++; W.birth(this, bud.p, this.E * 0.8); }
    }
    if (this.E < 0) this.die(s, 'starved');
    // old age: every body dies in the end (without it a bud-less body lived forever on a vein)
    else if (this.age > this.world.lifespan * (0.75 + 0.5 * hash(this.id, 99))) this.die(s, 'old');
  }
  die(s, cause) {
    this.alive = false; this.cause = cause;
    const P = this.pose(1, s);
    for (const o of P.organs) this.world.give(o.p, ORGANS[o.type].build * o.size * 0.8);
    for (const c of this.crystals) { const o = P.organs[c.organ]; if (o) this.world.reef.push({ p: o.p.slice(), dir: [o.frame.r[0] * c.dir[0] + o.frame.u[0] * c.dir[1] + o.frame.f[0] * c.dir[2], o.frame.r[1] * c.dir[0] + o.frame.u[1] * c.dir[1] + o.frame.f[1] * c.dir[2], o.frame.r[2] * c.dir[0] + o.frame.u[2] * c.dir[1] + o.frame.f[2] * c.dir[2]], len: c.len, born: c.born, died: s, spin: c.spin, lineage: this.lineage }); }
  }
}

/** A world: the medium in veins, the bodies, their reef. */
export class World {
  constructor(seed, { cap = 60, mutate = 0, hard = 3, regrow = 0.0015, lifespan = 5000 } = {}) {
    this.lifespan = lifespan; this.hard = hard; this.regrow = regrow; this.seed = seed; this.book = {}; this.mutants = 0; this.s = 0; this.cap = cap; this.mutate = mutate; this.next = 0;
    this.bodies = []; this.dead = []; this.reef = []; this.version = 0;
    const rnd = mulberry32((seed >>> 0) * 747796405 + 11);
    this.veins = Array.from({ length: 7 }, () => ({ x: 20 + rnd() * (WX - 40), y: WY * (0.35 + 0.3 * rnd()), z: 20 + rnd() * (WZ - 40), r: 10 + rnd() * 18, a: 0.6 + rnd() * 0.6 }));
    this.base0 = new Float32Array(MX * MY * MZ); this.medium = new Float32Array(MX * MY * MZ);
    for (let j = 0; j < MY; j++) for (let k = 0; k < MZ; k++) for (let i = 0; i < MX; i++) {
      const x = (i + 0.5) * MC, y = (j + 0.5) * MC, z = (k + 0.5) * MC; let v = 0.05;
      for (const b of this.veins) v += b.a * Math.exp(-((x - b.x) ** 2 + ((y - b.y) * 1.5) ** 2 + (z - b.z) ** 2) / (b.r * b.r));
      this.base0[(j * MZ + k) * MX + i] = Math.min(1.2, v);
    }
    this.medium.set(this.base0);
  }
  cell(p) { const i = Math.floor(p[0] / MC), j = Math.floor(p[1] / MC), k = Math.floor(p[2] / MC); return i >= 0 && j >= 0 && k >= 0 && i < MX && j < MY && k < MZ ? (j * MZ + k) * MX + i : -1; }
  at(p) { const c = this.cell(p); return c < 0 ? 0 : this.medium[c]; }
  give(p, a) { const c = this.cell(p); if (c >= 0) this.medium[c] += a; }
  /** A mouth grazes its cell and the six round it, in proportion to what each holds. */
  graze(p, rate) {
    const c = this.cell(p); if (c < 0) return 0;
    let got = 0;
    for (const d of [0, 1, -1, MX, -MX, MX * MZ, -MX * MZ]) { const q = c + d; if (q < 0 || q >= this.medium.length) continue; const t = Math.min(this.medium[q], this.medium[q] * rate * (d ? 0.5 : 1)); this.medium[q] -= t; got += t; }
    return got;
  }
  seep() {
    const M = this.medium, B = this.base0, out = this.seepBuf ||= new Float32Array(M.length);
    for (let j = 0; j < MY; j++) for (let k = 0; k < MZ; k++) for (let i = 0; i < MX; i++) {
      const o = (j * MZ + k) * MX + i; let s = 0, n = 0;
      if (i > 0) { s += M[o - 1]; n++; } if (i < MX - 1) { s += M[o + 1]; n++; } if (k > 0) { s += M[o - MX]; n++; } if (k < MZ - 1) { s += M[o + MX]; n++; } if (j > 0) { s += M[o - MX * MZ]; n++; } if (j < MY - 1) { s += M[o + MX * MZ]; n++; }
      const v = M[o] + 0.15 * (s / n - M[o]);
      out[o] = v + (B[o] - v) * this.regrow;
    }
    M.set(out);
  }
  /** Put a body in the world. `energy` defaults to enough to grow a little. */
  add(genome, at, yaw = 0, energy = 3) { const B = new Body(this, this.next++, genome, at, yaw, energy); this.bodies.push(B); return B; }
  /** A child from a bud: the parent's program, mutated with probability `mutate`. A mutation that
   *  changes the organ tree is a new body plan: a new species, named from its plan. */
  birth(parent, at, energy) {
    let g = parent.genome;
    if (this.mutate && hash(parent.id * 7919 + 3, this.s) < this.mutate) {
      g = mutate(parent.genome, parent.id * 7919 + this.s * 31);
      const sig = signature(g);
      if (sig !== signature(parent.genome)) { g.name = speciesName(sig); g.from = parent.genome.name; }
      this.mutants++;
    }
    const B = new Body(this, this.next++, g, at, parent.yaw + Math.PI + (hash(parent.id, this.s) - 0.5), energy, g === parent.genome ? parent.lineage : this.next - 1);
    B.parent = parent.id; this.bodies.push(B);
  }
  /** Who is alive, by body plan: { sig: { name, count, genome, organs } }, and the running book of plans. */
  census() {
    const out = {};
    for (const B of this.bodies) { const sig = B.sig ||= signature(B.genome); const c = (out[sig] ||= { name: B.genome.name, count: 0, genome: B.genome, grown: 0 }); c.count++; c.grown = Math.max(c.grown, B.grown); }
    for (const [sig, c] of Object.entries(out)) { const r = (this.book[sig] ||= { sig, name: c.name, first: this.s, peak: 0, lives: 0, genome: c.genome }); r.peak = Math.max(r.peak, c.count); r.lives += c.count; r.last = this.s; if (c.count >= r.peak) r.genome = c.genome; }
    return out;
  }
  step() {
    const s = ++this.s;
    for (const B of this.bodies.slice()) if (B.alive) B.step(s);
    const gone = this.bodies.filter((B) => !B.alive); if (gone.length) { this.dead.push(...gone.map((B) => ({ id: B.id, lineage: B.lineage, age: B.age, cause: B.cause, s }))); this.bodies = this.bodies.filter((B) => B.alive); }
    if (s % 2 === 0) this.seep();
    // reef erodes, very slowly, back into the medium
    if (s % 16 === 0) this.reef = this.reef.filter((c, i) => { if (s - c.died > 2000 && hash(i + c.born, s) < 0.02) { this.give(c.p, 0.05); return false; } return true; });
    this.version++;
  }
  run(n) { for (let k = 0; k < n; k++) this.step(); return this; }
  richest() { let best = 0, bi = 0; for (let i = 0; i < this.base0.length; i++) if (this.base0[i] > best) { best = this.base0[i]; bi = i; } const x = bi % MX, k = Math.floor(bi / MX) % MZ, j = Math.floor(bi / (MX * MZ)); return [(x + 0.5) * MC, (j + 0.5) * MC, (k + 0.5) * MC]; }
}

/**
 * A genome, mutated once (sometimes twice): a rule's numbers nudged, a rule copied (a new organ, often
 * a new branch), dropped, or retyped (what grows, or what it grows from), a mirror toggled, the beat
 * retuned, or one organ's attractor swapped for a neighbour in the bestiary (its look).
 */
export function mutate(g, seed) {
  const rnd = mulberry32(seed >>> 0), G = JSON.parse(JSON.stringify(g)), pick = (a) => a[Math.floor(rnd() * a.length)];
  looks(G);
  for (let k = rnd() < 0.3 ? 2 : 1; k > 0; k--) {
    const r = rnd();
    if (r < 0.4 && G.rules.length) { const R = pick(G.rules), key = pick(['az', 'el', 'len', 'size', 'phase']); R[key] = (R[key] || 0) + (rnd() - 0.5) * (key === 'size' ? 0.3 : 0.6); R.size = Math.max(0.2, Math.min(2, R.size)); R.len = Math.max(0.6, Math.min(3, R.len)); }
    else if (r < 0.52 && G.rules.length < 10) G.rules.push({ ...pick(G.rules), az: rnd() * TAU - Math.PI, el: (rnd() - 0.5) * 1.2 });
    else if (r < 0.62 && G.rules.length > 1) G.rules.splice(Math.floor(rnd() * G.rules.length), 1);
    else if (r < 0.74 && G.rules.length) pick(G.rules)[rnd() < 0.6 ? 'c' : 'p'] = pick(TYPES);
    else if (r < 0.8 && G.rules.length) { const R = pick(G.rules); R.mirror = !R.mirror; }
    else if (r < 0.92) { const k2 = pick(['amp', 'period', 'steer', 'rest']); G.beat[k2] = Math.max(0, (G.beat[k2] ?? 0.7) * (0.75 + rnd() * 0.5) + (G.beat[k2] ? 0 : 0.05)); G.beat.period = Math.max(10, Math.min(80, G.beat.period)); }
    else { const t = pick(TYPES), pool = BESTIARY.filter((b) => b.fill > 0.06 && b.dim > 1.5); G.flows[t] = pick(pool).key; }
  }
  return G;
}

/** The attractor keys a genome's organs are drawn with (inherited; a founder's come from its name). */
export function looks(genome) {
  if (!genome.flows) { let h = 7; for (const ch of genome.name || 'x') h = (Math.imul(h, 31) + ch.charCodeAt(0)) | 0; genome.flows = organFlows(h >>> 0); }
  return genome.flows;
}
/** Those attractors, realised once and shared. */
const flowCache = new Map();
export function flowsFor(genome) {
  const keys = looks(genome), out = {};
  for (const t of TYPES) { if (!flowCache.has(keys[t])) flowCache.set(keys[t], realise(keys[t], 6000)); out[t] = flowCache.get(keys[t]); }
  return out;
}
