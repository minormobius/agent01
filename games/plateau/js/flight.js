/* PLATEAU's physics, no DOM: the page and the selftest share it.

   You are a rigid body in 4D: a point P and four orthonormal directions,
   right R, up U, forward F, and the fourth, N, which you can't see along. You
   see the 3D slice through P spanned by R, U and F. You fly along F.

   Steering is a double rotation. Each 3D turn turns its plane of the body
   and, by COUPLING times as much, the plane perpendicular to it in 4D:
       roll   R→U   with   F→N    (your nose tips through w)
       pitch  F→U   with   R→N
       yaw    F→R   with   U→N
   At coupling 1 these are isoclinic (Clifford) rotations, multiplication by
   unit quaternions; at 0 it's ordinary flight in one slice. Your nose tipped
   into w means flying forward drives you through w: the foam you see changes
   as you go, because the slice you're in does.

   The world is a 4D Voronoi foam, one seed per grid cell of a lattice of
   spacing `scale`, each moved by up to `jitter` of a cell (at most half a
   cell, where the 80 seeds round a grid cell are exactly its possible
   neighbours, so everything below is exact). The obstacles are its EDGES:
   in your slice, the lines where three cells meet (in foam they're called
   Plateau borders), and the walls of SOLID cells. You hit what you can see:
   collision is measured in your slice, from P, against the exact cells of
   the slice (each clipped from a box round you by its bisector planes; a
   seed h off the slice carries a handicap of h²). The cell you're in is
   never solid: a cell can only turn solid ahead of you.

   The foam changes as you fly, in phases (by distance flown): a crystal that
   melts, cells that clot solid, cells that press smaller, all of it
   continuous, so nothing jumps. The same field drives the shader, which
   hashes seeds exactly as this file does. */
import { clip, boxPoly } from "../../foam4/js/foam.js";

export const COUPLING = 0.5, R_EDGE = 0.05, R_BODY = 0.07;
export const RATES = { roll: 1.7, pitch: 1.7, yaw: 1.7 }; // radians a second at full stick
/* roll is the one turn that drives you through w (it tips your nose there), so it was the one that felt far
   too quick at 2.4: it now turns no faster than the others, and a held roll key eases in over ROLL_EASE s,
   so a tap is a nudge */
export const ROLL_EASE = 0.3;
/* the roll you get this frame from a held roll input (target, −1 … 1) and last frame's (prev): it eases in,
   and letting go or reversing starts it again from nothing */
export function easeRoll(prev, target, dt) {
  if (!target || Math.sign(target) !== Math.sign(prev)) prev = 0;
  return target ? Math.sign(target) * Math.min(Math.abs(target), Math.abs(prev) + dt / ROLL_EASE) : 0;
}

/* ---------------------------------------------------------------- the phases */
export const PHASES = [
  { from: 0, name: "crystal", line: "a nearly perfect tesseract foam" },
  { from: 120, name: "melt", line: "the crystal melts into a random foam" },
  { from: 320, name: "clot", line: "cells are turning solid" },
  { from: 560, name: "press", line: "the cells press smaller" },
  { from: 900, name: "deep", line: "as far as the foam goes" },
];
const ramp = (d, a, b) => Math.max(0, Math.min(1, (d - a) / (b - a)));
export function fieldAt(d) {
  return {
    jitter: 0.08 + 0.42 * ramp(d, 120, 300),
    solid: 0.06 * ramp(d, 320, 560) + 0.05 * ramp(d, 560, 1000),
    scale: 1 - 0.25 * ramp(d, 560, 900),
  };
}
export const speedAt = (d) => 2.0 + 1.6 * ramp(d, 0, 900) + 0.6 * ramp(d, 900, 2000);
export const VMAX = 4.2;
export const phaseAt = (d) => PHASES.reduce((p, q) => (d >= q.from ? q : p), PHASES[0]);

/* ---------------------------------------------------------------- the field: seeds by integer hashing (the shader repeats it) */
const OFF = 1024;
function hashU(ix, iy, iz, iw, k) {
  let n = (Math.imul(ix + OFF, 73856093) ^ Math.imul(iy + OFF, 19349663) ^ Math.imul(iz + OFF, 83492791) ^ Math.imul(iw + OFF, 2654435761 | 0) ^ Math.imul(k, 374761393)) >>> 0;
  n ^= n >>> 16; n = Math.imul(n, 0x7feb352d) >>> 0; n ^= n >>> 15; n = Math.imul(n, 0x846ca68b) >>> 0; n ^= n >>> 16;
  return n >>> 0;
}
export function remix(n, s) {
  let m = (n ^ s) >>> 0;
  m ^= m >>> 16; m = Math.imul(m, 0x7feb352d) >>> 0; m ^= m >>> 15; m = Math.imul(m, 0x846ca68b) >>> 0; m ^= m >>> 16;
  return m >>> 0;
}
const U32 = 4294967296;
export class Foam {
  constructor(seed) { this.seed = seed >>> 0; }
  base(g) { return remix(hashU(g[0], g[1], g[2], g[3], 0), this.seed); }
  /* a grid cell's five random numbers in [0, 1): where its seed sits in its cell (four), and when it turns
     solid. Everything else is the field (scale, jitter, solid fraction), so these never change in a run:
     the renderer keeps them in a texture, filled by this same function */
  rand(g, out = new Array(5)) {
    const n = this.base(g);
    for (let k = 0; k < 4; k++) out[k] = remix(n, Math.imul(k + 1, 0x9e3779b9 | 0)) / U32;
    out[4] = remix(n, 0x5bd1e995) / U32;
    return out;
  }
  pos(g, F) { const r = this.rand(g); return g.map((v, k) => F.scale * (v + 0.5 + F.jitter * (r[k] - 0.5))); }
  solid(g, F) { return remix(this.base(g), 0x5bd1e995) / U32 < F.solid; }
  nearest(p, F) {
    const g0 = p.map((v) => Math.floor(v / F.scale));
    let best = null, bd = Infinity;
    for (const o of AROUND) { const g = g0.map((v, i) => v + o[i]), s = this.pos(g, F), d = dist2(p, s); if (d < bd) { bd = d; best = g; } }
    return best;
  }
}
const AROUND = []; for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (let c = -1; c <= 1; c++) for (let e = -1; e <= 1; e++) AROUND.push([a, b, c, e]);
const NEIGH = AROUND.filter((o) => o.some((v) => v));
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
const dist2 = (a, b) => { let s = 0; for (let i = 0; i < 4; i++) s += (a[i] - b[i]) ** 2; return s; };
export const key = (g) => g.join(",");

/* ---------------------------------------------------------------- the craft */
export class Craft {
  constructor(P) { this.P = P.slice(); this.R = [1, 0, 0, 0]; this.F = [0, 1, 0, 0]; this.U = [0, 0, 1, 0]; this.N = [0, 0, 0, 1]; }
  /* turn a toward b by th (both are body directions, by name) */
  turn(a, b, th) {
    const c = Math.cos(th), s = Math.sin(th), A = this[a], B = this[b];
    this[a] = A.map((v, i) => c * v + s * B[i]); this[b] = B.map((v, i) => c * v - s * A[i]);
  }
  /* inputs in −1 … 1: roll (right wing down), pitch (nose up), yaw (nose right) */
  steer(roll, pitch, yaw, dt, k = COUPLING) {
    if (roll) { const th = roll * RATES.roll * dt; this.turn("R", "U", -th); this.turn("F", "N", k * th); }
    if (pitch) { const th = pitch * RATES.pitch * dt; this.turn("F", "U", th); this.turn("R", "N", k * th); }
    if (yaw) { const th = yaw * RATES.yaw * dt; this.turn("F", "R", th); this.turn("U", "N", k * th); }
    this.orthonormalize();
  }
  fly(speed, dt) { this.P = this.P.map((v, i) => v + speed * dt * this.F[i]); }
  orthonormalize() { // Gram-Schmidt, nose first
    const order = ["F", "U", "R", "N"], done = [];
    for (const k of order) {
      let v = this[k].slice();
      for (const u of done) { const d = dot(v, u); v = v.map((x, i) => x - d * u[i]); }
      const n = Math.hypot(...v); v = v.map((x) => x / n); this[k] = v; done.push(v);
    }
  }
  /* how far your nose points into w (the share of your speed that drives you through w) */
  get wNose() { return this.F[3]; }
}

/* ---------------------------------------------------------------- clearance: how near the nearest edge and solid wall are */
const seg = (a, b) => { // distance from the origin to the segment ab
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], L = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const t = L ? Math.max(0, Math.min(1, -(a[0] * ab[0] + a[1] * ab[1] + a[2] * ab[2]) / L)) : 0;
  return Math.hypot(a[0] + t * ab[0], a[1] + t * ab[1], a[2] + t * ab[2]);
};
function polyDist(pts, n) { // distance from the origin to a convex polygon in 3D, with normal n
  const nn = Math.hypot(...n), u = n.map((v) => v / nn), dpl = pts[0][0] * u[0] + pts[0][1] * u[1] + pts[0][2] * u[2];
  const q = u.map((v) => v * dpl); // the origin, projected onto the plane
  let inside = true, sgn = 0;
  for (let i = 0; i < pts.length && inside; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length], e = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], w = [q[0] - a[0], q[1] - a[1], q[2] - a[2]];
    const c = (e[1] * w[2] - e[2] * w[1]) * u[0] + (e[2] * w[0] - e[0] * w[2]) * u[1] + (e[0] * w[1] - e[1] * w[0]) * u[2];
    if (Math.abs(c) > 1e-12) { const s = Math.sign(c); if (!sgn) sgn = s; else if (s !== sgn) inside = false; }
  }
  if (inside) return Math.abs(dpl);
  let m = Infinity; for (let i = 0; i < pts.length; i++) m = Math.min(m, seg(pts[i], pts[(i + 1) % pts.length]));
  return m;
}
/* the slice cell of seed g, round the craft (slice coordinates: origin at P, axes R, U, F) */
function cellOf(foam, F, craft, g, B) {
  const P = craft.P, to = (s) => { const r = s.map((v, i) => v - P[i]); return { q: [dot(r, craft.R), dot(r, craft.U), dot(r, craft.F)], h: dot(r, craft.N) }; };
  const a = to(foam.pos(g, F));
  let poly = boxPoly(B);
  const planes = new Map(); // what's across each face: its plane's normal and the neighbour's grid cell
  for (const o of NEIGH) {
    const ng = g.map((v, i) => v + o[i]), t = to(foam.pos(ng, F));
    const n = [2 * (t.q[0] - a.q[0]), 2 * (t.q[1] - a.q[1]), 2 * (t.q[2] - a.q[2])];
    const d = t.q[0] ** 2 + t.q[1] ** 2 + t.q[2] ** 2 + t.h * t.h - a.q[0] ** 2 - a.q[1] ** 2 - a.q[2] ** 2 - a.h * a.h;
    if (Math.hypot(...n) < 1e-12) { if (d < 0) return null; continue; }
    planes.set(key(ng), { n, g: ng });
    poly = clip(poly, n, d, key(ng)); if (!poly) return null;
  }
  for (const f of poly) { const pl = planes.get(f.nb); if (pl) { f.n = pl.n; f.g = pl.g; } }
  return poly;
}
const onBox = (a, b, B) => [0, 1, 2].some((i) => Math.abs(a[i]) > B - 1e-7 && Math.abs(b[i]) > B - 1e-7 && Math.sign(a[i]) === Math.sign(b[i]));
/* { edge, solid, cell }: the distance from P to the nearest edge of the foam in your slice, to the nearest
   solid cell, and the cell you're in (which is never solid). A solid cell needn't share a face with yours to
   be in your way: one that meets yours only at an edge or a corner is as near as that corner, and a face
   opening between you (a flip, as you move through w) mustn't bring a wall from nowhere. So every solid cell
   round yours whose bisector with yours is within SOLID_LOOK is clipped out whole and measured; one further
   off is at least as far as that bisector */
const SOLID_LOOK = 0.6;
const cellDist = (poly) => { let m = Infinity; for (const f of poly) if (f.nb !== "box") m = Math.min(m, polyDist(f.pts, f.n || faceN(f.pts))); return m; };
const faceN = (p) => { const a = p[0], b = p[1], c = p[2], u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]]; return [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]; };
export function clearance(foam, F, craft) {
  const B = 1.6 * F.scale, g = foam.nearest(craft.P, F), here = key(g);
  let edge = Infinity, solid = Infinity;
  const look = (poly) => {
    for (const f of poly) {
      if (f.nb === "box") continue;
      for (let i = 0; i < f.pts.length; i++) { const a = f.pts[i], b = f.pts[(i + 1) % f.pts.length]; if (!onBox(a, b, B)) edge = Math.min(edge, seg(a, b)); }
    }
  };
  const poly = cellOf(foam, F, craft, g, B);
  if (!poly) return { edge: 0, solid: 0, cell: here };
  look(poly);
  // an edge just across a wall belongs to the next cell: look there too when you're near the wall
  for (const f of poly) if (f.nb !== "box" && f.g && polyDist(f.pts, f.n) < 3 * R_EDGE) { const p2 = cellOf(foam, F, craft, f.g, B); if (p2) look(p2); }
  if (F.solid > 0) {
    const P = craft.P, s = foam.pos(g, F), sq = [dot(sub(s, P), craft.R), dot(sub(s, P), craft.U), dot(sub(s, P), craft.F)], sh = dot(sub(s, P), craft.N);
    for (const o of NEIGH) {
      const ng = g.map((v, i) => v + o[i]); if (!foam.solid(ng, F)) continue;
      const t = sub(foam.pos(ng, F), P), tq = [dot(t, craft.R), dot(t, craft.U), dot(t, craft.F)], th = dot(t, craft.N);
      const n = [2 * (tq[0] - sq[0]), 2 * (tq[1] - sq[1]), 2 * (tq[2] - sq[2])], nl = Math.hypot(...n);
      if (nl < 1e-12) continue;
      const pd = (tq[0] ** 2 + tq[1] ** 2 + tq[2] ** 2 + th * th - sq[0] ** 2 - sq[1] ** 2 - sq[2] ** 2 - sh * sh) / nl; // P to the bisector: no nearer than that
      if (pd >= Math.min(solid, SOLID_LOOK)) { solid = Math.min(solid, pd); continue; }
      const px = cellOf(foam, F, craft, ng, B);
      if (px) solid = Math.min(solid, cellDist(px));
    }
  }
  return { edge, solid, cell: here };
}
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]];

/* ---------------------------------------------------------------- an autopilot: the balance report's pilot and the attract loop's.
   It tries a spread of stick inputs, flies each `ahead` seconds forward against the exact clearance, and
   takes the one that keeps furthest from everything (a little against turning, so it flies smoothly) */
const CANDS = [[0, 0, 0]]; for (const r of [-1, 0, 1]) for (const p of [-1, 0, 1]) for (const y of [-1, 0, 1]) if (r || p || y) CANDS.push([r, p, y]);
export const margin = (cl) => Math.min(cl.edge - R_EDGE, cl.solid - R_BODY);
export function autopilot(foam, d, craft, { ahead = 0.5, step = 0.1, cands = CANDS } = {}) {
  const F = fieldAt(d), v = speedAt(d);
  let best = -Infinity, choice = cands[0];
  for (const k of cands) {
    const g = new Craft(craft.P); Object.assign(g, { R: craft.R, U: craft.U, F: craft.F, N: craft.N });
    let m = Infinity;
    for (let t = 0; t < ahead - 1e-9; t += step) { g.steer(k[0], k[1], k[2], step); g.fly(v, step); m = Math.min(m, margin(clearance(foam, F, g))); if (m < 0) break; }
    const score = m - 0.02 * (Math.abs(k[0]) + Math.abs(k[1]) + Math.abs(k[2]));
    if (score > best) { best = score; choice = k; }
  }
  return choice;
}
