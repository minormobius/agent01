// bismuth — the Stack substrate: a plane tiling stacked with each layer
// DISPLACED and/or ROTATED against the last. The prism (prism.js) puts every
// layer's tiles straight over the tiles below, which makes a columnar
// crystal: one vertical bond a brick, periodic along z. A stack slides each
// layer toward the hollows of the one beneath — the courses of a running
// bond — so a brick rests on several bricks and is bonded to all of them.
//
// That one change is the difference between a columnar solid and the
// close-packed lattices real metals and semimetals take:
//
//   hexagons, AB      — hexagonal close packing: every layer in the hollows
//                       of the last, the third over the first. Twelve bonds.
//   hexagons, ABC     — the rhombohedral family: three positions, the fourth
//                       layer over the first. Face-centred cubic at the ideal
//                       spacing, seen along [111]; bismuth's own lattice (A7)
//                       is a distorted member. Twelve bonds.
//   the square grid   — face-centred cubic along [001]: each square over the
//                       corner of four. Twelve bonds. (ABC closes at two.)
//   any other tiling  — a running bond over a quasicrystal or an Archimedean
//                       net: the stagger closes only on a lattice, so a
//                       Penrose stack faults every second or third layer.
//
// The TWIST rotates each layer by a fixed angle about the axis instead (or as
// well). Then no two layers' tiles line up: the vertical bonds are wherever
// the tiles happen to overlap, a moiré that turns with height, and the stack
// is quasiperiodic along z whatever the tiling is. Overlaps below a tenth of
// a tile are not bonds; a brick stands on the layer below when its supported
// area is SUPPORT of its own — with less it is a lip, and the lip rules apply.
//
// What the masons ask of a substrate is answered with the prism's own rules,
// re-read for layers that do not line up: "the brick below" is the SUPPORT (the
// overlap-weighted occupancy of the layer beneath), "the column top" is a
// HEIGHT FIELD over the plane (H, sampled at half a tile), and the terrace
// rays run in world space and read it. Tile geometry stays in the tiling's
// fixed point; the per-layer frames are rotations from a literal table (no
// trig at run time) composed by IEEE multiply-adds, so a stack is the same
// crystal in every engine, like everything else here.

import { Prism } from "./prism.js";
import { FIX } from "./tilings.js";

const HALF = FIX >> 1;                             // the height field's cell, and the ray step
const LOOK = 32;
const DIRS = [[1024, 0], [887, 512], [512, 887], [0, 1024], [-512, 887], [-887, 512], [-1024, 0], [-887, -512], [-512, -887], [0, -1024], [512, -887], [887, -512]];
export const SUPPORT = 0.6;                        // supported area, as a fraction of the tile, that counts as standing on the layer below
export const OVERLAP_MIN = 0.1;                    // smaller overlaps are not bonds
export const TWIST_STEP = 0.25;                    // degrees; twists are quantised to this
export const TWIST_MAX = 6;
// the natural stagger — where the next layer's tiles sit for the close packing — in fixed units of the base frame
export const HOLLOW = { grid: [512, 512], hex: [0, 1024] };
const HOLLOW_DEFAULT = [0, 512];                   // half an edge along +y: a running bond
export const STACKS = ["", "ab", "abc"];
// cos and sin of k·TWIST_STEP degrees, k = 0..24, as literals
const TWIST = [
  [1, 0],
  [0.9999904807207345, 0.004363309284746571],
  [0.9999619230641713, 0.008726535498373935],
  [0.999914327574007, 0.01308959557134444],
  [0.9998476951563913, 0.01745240643728351],
  [0.9997620270799091, 0.02181488503456112],
  [0.9996573249755573, 0.02617694830787315],
  [0.9995335908367129, 0.03053851320982266],
  [0.9993908270190958, 0.03489949670250097],
  [0.9992290362407229, 0.03925981575906861],
  [0.9990482215818578, 0.043619387365336],
  [0.9988483864849507, 0.04797812852134394],
  [0.9986295347545738, 0.05233595624294383],
  [0.9983916705573488, 0.05669278756337751],
  [0.9981347984218669, 0.06104853953485687],
  [0.9978589232386035, 0.06540312923014306],
  [0.9975640502598242, 0.0697564737441253],
  [0.9972501850994857, 0.07410849019539924],
  [0.996917333733128, 0.07845909572784494],
  [0.9965655024977614, 0.08280820751220433],
  [0.9961946980917455, 0.08715574274765817],
  [0.9958049275746618, 0.09150161866340238],
  [0.9953961983671789, 0.09584575252022398],
  [0.9949685182509117, 0.10018806161207627],
  [0.9945218953682733, 0.10452846326765346],
];

// Is a spec a stack at all? A stagger of zero and no twist is the prism.
export function isStacked(spec) {
  return !!spec && ((!!spec.stack && spec.stack !== "" && +spec.stagger > 0) || Math.abs(+spec.twist || 0) >= TWIST_STEP / 2);
}
export function normalizeStack(spec) {
  const stack = STACKS.includes(spec.stack) ? spec.stack : "";
  const stagger = stack ? Math.max(0, Math.min(1, Math.round((+spec.stagger || 0) * 20) / 20)) : 0;
  const tw = Math.max(-TWIST_MAX, Math.min(TWIST_MAX, +spec.twist || 0));
  const twist = Math.round(tw / TWIST_STEP) * TWIST_STEP;
  return { stack, stagger, twist };
}

// The area of two convex CCW polygons' intersection (Sutherland–Hodgman).
function clipArea(subj, clip) {
  let out = subj;
  for (let i = 0; i < clip.length && out.length; i++) {
    const a = clip[i], b = clip[(i + 1) % clip.length];
    const ex = b[0] - a[0], ey = b[1] - a[1];
    const inp = out; out = [];
    let S = inp[inp.length - 1], sS = ex * (S[1] - a[1]) - ey * (S[0] - a[0]);
    for (const E of inp) {
      const sE = ex * (E[1] - a[1]) - ey * (E[0] - a[0]);
      if (sE >= 0) { if (sS < 0) out.push(cross(S, E, a, ex, ey)); out.push(E); }
      else if (sS >= 0) out.push(cross(S, E, a, ex, ey));
      S = E; sS = sE;
    }
  }
  let a2 = 0;
  for (let i = 0; i < out.length; i++) { const p = out[i], q = out[(i + 1) % out.length]; a2 += p[0] * q[1] - q[0] * p[1]; }
  return Math.abs(a2) / 2;
}
function cross(S, E, a, ex, ey) {
  const dx = E[0] - S[0], dy = E[1] - S[1];
  const den = dx * ey - dy * ex;
  if (den === 0) return E;
  const t = ((a[0] - S[0]) * ey - (a[1] - S[1]) * ex) / den;
  return [S[0] + dx * t, S[1] + dy * t];
}

export class Stack extends Prism {
  constructor(spec) {
    super(spec);
    this.stacked = true;
    const ns = normalizeStack(spec);
    this.stack = ns.stack; this.stagger = ns.stagger; this.twist = ns.twist;
    const T = this.T, Z = this.Z, z0 = this.z0;
    // --- the per-layer frames: world = R(θ·dz) · (p + off(dz)) ---
    const hollow = HOLLOW[spec.shape] || HOLLOW_DEFAULT;
    const period = this.stack === "abc" ? 3 : this.stack === "ab" ? 2 : 1;
    this.period = this.stagger > 0 ? period : 1;
    this.offsets = [];
    for (let i = 0; i < this.period; i++) this.offsets.push([Math.round(hollow[0] * this.stagger * i), Math.round(hollow[1] * this.stagger * i)]);
    const k = Math.min(TWIST.length - 1, Math.round(Math.abs(this.twist) / TWIST_STEP));
    const c1 = TWIST[k][0], s1 = this.twist < 0 ? -TWIST[k][1] : TWIST[k][1];
    this.turning = k > 0;
    this.frames = new Array(Z);
    const frame = (z, c, s) => { const i = (((z - z0) % this.period) + this.period) % this.period; return { c, s, ox: this.offsets[i][0], oy: this.offsets[i][1] }; };
    let c = 1, s = 0;
    for (let z = z0; z < Z; z++) { this.frames[z] = frame(z, c, s); const nc = c * c1 - s * s1, nsn = s * c1 + c * s1; c = nc; s = nsn; }
    c = 1; s = 0;
    for (let z = z0 - 1; z >= 0; z--) { const nc = c * c1 + s * s1, nsn = s * c1 - c * s1; c = nc; s = nsn; this.frames[z] = frame(z, c, s); }
    // --- the height field over the plane: highest occupied layer whose brick covers the cell's centre ---
    const HR = (T.R + 4) * FIX;
    this.hx0 = -HR; this.hside = Math.floor((2 * HR) / HALF) + 1;
    this.H = new Int16Array(this.hside * this.hside).fill(-1);
    this.pairs = new Map();                        // pair maps (layer z → z + 1), by key
    this._pairZ = new Array(Z).fill(null);         // the same, by layer
    this._cell = new Int32Array(this.sites).fill(-2);   // each site's height-field cell, on first use
    this._stamp = new Int32Array(this.sites); this._mark = 0;
    this._bond = new Int32Array(64);
    this._poly = [];
    const ext = HR / FIX;
    this.min = [-ext, -ext, 0]; this.max = [ext, ext, 0];
  }

  // ------------------------------------------------------------ frames --
  frame(z) { return this.frames[z]; }
  // world coordinates (fixed units, doubles) of a base-frame point in layer z
  wx(z, x, y) { const f = this.frames[z]; return f.c * (x + f.ox) - f.s * (y + f.oy); }
  wy(z, x, y) { const f = this.frames[z]; return f.s * (x + f.ox) + f.c * (y + f.oy); }
  // the tile of layer z under a world point (fixed units), or -1
  locateIn(z, wx, wy) {
    const f = this.frames[z];
    return this.T.locate(Math.round(f.c * wx + f.s * wy - f.ox), Math.round(-f.s * wx + f.c * wy - f.oy));
  }
  cellOf(wx, wy) {
    const gx = Math.floor((wx - this.hx0) / HALF), gy = Math.floor((wy - this.hx0) / HALF);
    return gx < 0 || gy < 0 || gx >= this.hside || gy >= this.hside ? -1 : gy * this.hside + gx;
  }
  // the world polygon of (t, z) into this._poly, as [[x, y], …] doubles in fixed units
  worldPoly(t, z) {
    const T = this.T, s = T.polyStart[t], L = T.polyLen[t], f = this.frames[z], out = this._poly;
    out.length = L;
    for (let i = 0; i < L; i++) { const v = T.polyVerts[s + i]; const x = T.vx[v] + f.ox, y = T.vy[v] + f.oy; out[i] = [f.c * x - f.s * y, f.s * x + f.c * y]; }
    return out;
  }

  // The overlap map between layer z and z + 1: for each tile t of z the tiles
  // u of z + 1 it overlaps, with the overlap as a fraction of t's area (up)
  // and of u's (down). Computed once per distinct pair of frames — the stagger
  // repeats every `period` layers; a twist never repeats.
  pair(z) {
    let P = this._pairZ[z];
    if (P) return P;
    const key = this.turning ? z : (((z - this.z0) % this.period) + this.period) % this.period;
    P = this.pairs.get(key);
    if (P) { this._pairZ[z] = P; return P; }
    const T = this.T, n = this.n, A = this.frames[z], B = this.frames[Math.min(this.Z - 1, z + 1)];
    // relative transform: layer z base coords → layer z+1 base coords
    const c = A.c * B.c + A.s * B.s, s = A.s * B.c - A.c * B.s;   // R(θA − θB)
    const tx = (x, y) => c * (x + A.ox) - s * (y + A.oy) - B.ox;
    const ty = (x, y) => s * (x + A.ox) + c * (y + A.oy) - B.oy;
    const upStart = new Int32Array(n + 1), upList = [], upW = [], downPairs = [];
    const cand = new Set();
    for (let t = 0; t < n; t++) {
      upStart[t] = upList.length;
      const ps = T.polyStart[t], L = T.polyLen[t];
      const poly = [];
      for (let i = 0; i < L; i++) { const v = T.polyVerts[ps + i]; poly.push([tx(T.vx[v], T.vy[v]), ty(T.vx[v], T.vy[v])]); }
      const cx = tx(T.cx[t], T.cy[t]), cy = ty(T.cx[t], T.cy[t]);
      // candidates: the tiles under the centroid, the corners, the edge midpoints and the half-radii
      cand.clear();
      const probe = (x, y) => { const u = T.locate(Math.round(x), Math.round(y)); if (u >= 0) cand.add(u); };
      probe(cx, cy);
      for (let i = 0; i < L; i++) {
        const p = poly[i], q = poly[(i + 1) % L];
        probe(p[0], p[1]); probe((p[0] + q[0]) / 2, (p[1] + q[1]) / 2); probe((p[0] + cx) / 2, (p[1] + cy) / 2);
      }
      let a2 = 0;
      for (let i = 0; i < L; i++) { const p = poly[i], q = poly[(i + 1) % L]; a2 += p[0] * q[1] - q[0] * p[1]; }
      const areaT = Math.abs(a2) / 2;
      const found = [];
      for (const u of cand) {
        const us = T.polyStart[u], UL = T.polyLen[u], up = [];
        for (let i = 0; i < UL; i++) { const v = T.polyVerts[us + i]; up.push([T.vx[v], T.vy[v]]); }
        const a = clipArea(poly, up);
        const wt = a / areaT, wu = a / (T.area[u] * FIX * FIX);
        if (wt >= OVERLAP_MIN || wu >= OVERLAP_MIN) found.push([u, wt, wu]);
      }
      found.sort((p, q) => p[0] - q[0]);
      for (const [u, wt, wu] of found) { upList.push(u); upW.push(wt); downPairs.push([u, t, wu]); }
    }
    upStart[n] = upList.length;
    downPairs.sort((p, q) => p[0] - q[0] || p[1] - q[1]);
    const downStart = new Int32Array(n + 1), downList = new Int32Array(downPairs.length), downW = new Float32Array(downPairs.length);
    let j = 0;
    for (let u = 0; u < n; u++) {
      downStart[u] = j;
      while (j < downPairs.length && downPairs[j][0] === u) { downList[j] = downPairs[j][1]; downW[j] = downPairs[j][2]; j++; }
    }
    downStart[n] = j;
    P = { upStart, upList: Int32Array.from(upList), upW: Float32Array.from(upW), downStart, downList, downW };
    this.pairs.set(key, P);
    this._pairZ[z] = P;
    return P;
  }
  // tiles at layer z + dz bonded to (t, z): filled into out, count returned
  vertical(t, z, dz, out) {
    if (dz > 0) { if (z + 1 >= this.Z) return 0; const P = this.pair(z); let k = 0; for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) out[k++] = P.upList[i]; return k; }
    if (z <= 0) return 0;
    const P = this.pair(z - 1); let k = 0;
    for (let i = P.downStart[t]; i < P.downStart[t + 1]; i++) out[k++] = P.downList[i];
    return k;
  }
  // the fraction of (t, z)'s area standing on bricks of layer z − 1, and covered by bricks of z + 1
  supportOf(t, z) {
    if (z <= 0) return 0;
    const P = this.pair(z - 1), occ = this.occ, base = (z - 1) * this.n;
    let w = 0;
    for (let i = P.downStart[t]; i < P.downStart[t + 1]; i++) if (occ[base + P.downList[i]]) w += P.downW[i];
    return w;
  }
  coverOf(t, z) {
    if (z + 1 >= this.Z) return 0;
    const P = this.pair(z), occ = this.occ, base = (z + 1) * this.n;
    let w = 0;
    for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) if (occ[base + P.upList[i]]) w += P.upW[i];
    return w;
  }
  // every brick the mesher cares about: is the top of (t, z) fully under bricks? the bottom fully on them?
  covered(t, z) { return this.coverOf(t, z) >= 0.97; }
  standing(t, z) { return this.supportOf(t, z) >= 0.97; }
  // the tile of layer z + dz under a corner v of layer z, cached — the mesher's
  // occlusion asks this for every cap corner of every brick it draws
  under(v, z, dz) {
    const zz = z + dz;
    if (zz < 0 || zz >= this.Z) return -1;
    if (!this._under) { this._under = new Int32Array(2 * this.Z * this.T.vx.length).fill(-2); }
    const key = ((dz > 0 ? this.Z : 0) + z) * this.T.vx.length + v;
    let u = this._under[key];
    if (u === -2) {
      const f = this.frames[z], x = this.T.vx[v] + f.ox, y = this.T.vy[v] + f.oy;
      u = this._under[key] = this.locateIn(zz, f.c * x - f.s * y, f.s * x + f.c * y);
    }
    return u;
  }
  // the maximum bonds a brick can make here: lateral edges plus the layers above and below
  coordination() {
    const T = this.T, z = this.z0;
    let best = 0;
    for (let t = 0; t < this.n; t++) {
      if (!T.deep[t] || T.cx[t] * T.cx[t] + T.cy[t] * T.cy[t] > 9 * FIX * FIX) continue;
      const c = (T.nbrStart[t + 1] - T.nbrStart[t]) + this.vertical(t, z, 1, this._bond) + this.vertical(t, z, -1, this._bond);
      if (c > best) best = c;
    }
    return best;
  }

  // ---------------------------------------------------------- occupancy --
  place(s) {
    if (this.occ[s]) return false;
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n, nb = this.nb;
    this.occ[s] = 1;
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) nb[z * n + T.nbrList[k]]++;
    if (z + 1 < this.Z) { const P = this.pair(z), b = (z + 1) * n; for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) nb[b + P.upList[i]]++; }
    if (z > 0) { const P = this.pair(z - 1), b = (z - 1) * n; for (let i = P.downStart[t]; i < P.downStart[t + 1]; i++) nb[b + P.downList[i]]++; }
    this.raise(t, z);
    this.count++;
    const cx = this.wx(z, T.cx[t], T.cy[t]), cy = this.wy(z, T.cx[t], T.cy[t]);
    this.sx += cx; this.sy += cy; this.sz += z;
    if (cx < this.fminX) this.fminX = cx; if (cx > this.fmaxX) this.fmaxX = cx;
    if (cy < this.fminY) this.fminY = cy; if (cy > this.fmaxY) this.fmaxY = cy;
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    return true;
  }
  remove(s) {
    if (!this.occ[s]) return false;
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n, nb = this.nb;
    this.occ[s] = 0;
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) nb[z * n + T.nbrList[k]]--;
    if (z + 1 < this.Z) { const P = this.pair(z), b = (z + 1) * n; for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) nb[b + P.upList[i]]--; }
    if (z > 0) { const P = this.pair(z - 1), b = (z - 1) * n; for (let i = P.downStart[t]; i < P.downStart[t + 1]; i++) nb[b + P.downList[i]]--; }
    this.lower(t, z);
    this.count--;
    this.sx -= this.wx(z, T.cx[t], T.cy[t]); this.sy -= this.wy(z, T.cx[t], T.cy[t]); this.sz -= z;
    return true;
  }
  // the height field: every cell whose centre the brick covers (and the one
  // under its centroid, so a sliver of a tile still registers)
  cells(t, z, fn) {
    const poly = this.worldPoly(t, z), L = poly.length;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of poly) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const gx0 = Math.max(0, Math.floor((x0 - this.hx0) / HALF)), gx1 = Math.min(this.hside - 1, Math.floor((x1 - this.hx0) / HALF));
    const gy0 = Math.max(0, Math.floor((y0 - this.hx0) / HALF)), gy1 = Math.min(this.hside - 1, Math.floor((y1 - this.hx0) / HALF));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
      const px = this.hx0 + (gx + 0.5) * HALF, py = this.hx0 + (gy + 0.5) * HALF;
      let inside = true;
      for (let i = 0; i < L && inside; i++) { const a = poly[i], b = poly[(i + 1) % L]; if ((b[0] - a[0]) * (py - a[1]) - (b[1] - a[1]) * (px - a[0]) < 0) inside = false; }
      if (inside) fn(gy * this.hside + gx, px, py);
    }
    const c = this.cellOf(this.wx(z, this.T.cx[t], this.T.cy[t]), this.wy(z, this.T.cx[t], this.T.cy[t]));
    if (c >= 0) { const cc = this.cellCentre(c); fn(c, cc[0], cc[1]); }
  }
  raise(t, z) { const H = this.H; this.cells(t, z, (c) => { if (H[c] < z) H[c] = z; }); }
  lower(t, z) {
    const H = this.H, occ = this.occ, n = this.n;
    this.cells(t, z, (c, px, py) => {
      if (H[c] !== z) return;
      let h = -1;
      for (let zz = z; zz >= 0; zz--) { const u = this.locateIn(zz, px, py); if (u >= 0 && occ[zz * n + u]) { h = zz; break; } }
      H[c] = h;
    });
  }
  // the column top under a world point (fixed units), −1 for nothing
  heightAt(wx, wy) { const c = this.cellOf(wx, wy); return c < 0 ? -1 : this.H[c]; }
  cellCentre(c) { return [this.hx0 + ((c % this.hside) + 0.5) * HALF, this.hx0 + (Math.floor(c / this.hside) + 0.5) * HALF]; }
  // the site's own cell of the height field, computed once
  cell(s) {
    let c = this._cell[s];
    if (c === -2) { const t = s % this.n, z = (s - t) / this.n; c = this._cell[s] = this.cellOf(this.wx(z, this.T.cx[t], this.T.cy[t]), this.wy(z, this.T.cx[t], this.T.cy[t])); }
    return c;
  }
  open(s) { const c = this.cell(s); return c < 0 || this.H[c] < (s - s % this.n) / this.n; }
  summit() {
    const n = this.n, occ = this.occ;
    for (let z = Math.min(this.maxZ, this.Z - 2); z >= 0; z--) {
      const base = z * n;
      for (let t = 0; t < n; t++) {
        if (!occ[base + t]) continue;
        // the site above: the tile of the next layer this brick holds up most
        const P = this.pair(z);
        let best = -1, bw = -1;
        for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) if (P.upW[i] > bw && !occ[base + n + P.upList[i]]) { bw = P.upW[i]; best = P.upList[i]; }
        if (best >= 0) return this.site(best, z + 1);
      }
    }
    return -1;
  }
  siteAt(at) {
    if (typeof at === "number") return at;
    const z = Math.round(at.z);
    if (z < 0 || z >= this.Z) return -1;
    if (at.tile !== undefined) return at.tile >= 0 && at.tile < this.n ? this.site(at.tile, z) : -1;
    const t = this.locateIn(z, at.x * FIX, at.y * FIX);
    return t < 0 ? -1 : this.site(t, z);
  }
  describe(s) { const t = s % this.n, z = (s - t) / this.n; return { tile: t, z, x: this.wx(z, this.T.cx[t], this.T.cy[t]) / FIX, y: this.wy(z, this.T.cx[t], this.T.cy[t]) / FIX }; }
  pos(s, m) { const d = this.describe(s); m.x = d.x; m.y = d.y; m.z = d.z; }
  brick(s, tick, mason) { const d = this.describe(s); return { x: d.x, y: d.y, z: d.z, t: tick, m: mason, tile: d.tile }; }
  regionAdd(r, s) {
    const t = s % this.n, z = (s - t) / this.n, cx = this.wx(z, this.T.cx[t], this.T.cy[t]), cy = this.wy(z, this.T.cx[t], this.T.cy[t]);
    r.count++; r.sx += cx; r.sy += cy; r.sz += z;
    if (cx < r.fminX) r.fminX = cx; if (cx > r.fmaxX) r.fmaxX = cx; if (cy < r.fminY) r.fminY = cy; if (cy > r.fmaxY) r.fmaxY = cy;
    if (z < r.minZ) r.minZ = z; if (z > r.maxZ) r.maxZ = z;
  }

  // the bond graph for the worms: below, above, then the lateral edges
  bonds(s, out) {
    const n = this.n, t = s % n, z = (s - t) / n, T = this.T;
    let k = 0;
    if (z > 1) { const P = this.pair(z - 1), b = (z - 1) * n; for (let i = P.downStart[t]; i < P.downStart[t + 1]; i++) out[k++] = b + P.downList[i]; }
    if (z + 1 < this.Z - 1) { const P = this.pair(z), b = (z + 1) * n; for (let i = P.upStart[t]; i < P.upStart[t + 1]; i++) out[k++] = b + P.upList[i]; }
    for (let i = T.nbrStart[t]; i < T.nbrStart[t + 1]; i++) out[k++] = z * n + T.nbrList[i];
    return k;
  }

  // ------------------------------------------------------------ kinetics --
  // The Kossel class, as the prism reads it: a brick below counts one bond
  // when the site is SUPPORTED, a brick above likewise when covered; lateral
  // edges one, corners a half; with no support only lateral bricks that are
  // themselves supported count (a lip row cannot propagate as ledges).
  kossel(s, floor = 0) {
    const nb = this.nb[s];
    if (!nb) return 0;
    const n = this.n, t = s % n, z = (s - t) / n, T = this.T, occ = this.occ, base = z * n;
    const support = z > 0 && z - 1 >= floor ? this.supportOf(t, z) : 0;
    const below = support >= SUPPORT ? 1 : 0;
    const above = this.coverOf(t, z) >= SUPPORT ? 1 : 0;
    let bonds = below + above, lateral = 0;
    for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) {
      const u = T.vnbrList[k];
      if (!occ[base + u]) continue;
      lateral++;
      if (!below) {
        const canUnder = z > 0 && z - 1 >= floor;
        let sup = canUnder && this.supportOf(u, z) >= SUPPORT;
        for (let j = T.nbrStart[u]; !sup && j < T.nbrStart[u + 1]; j++) { const v = T.nbrList[j]; if (occ[base + v] && canUnder && this.supportOf(v, z) >= SUPPORT) sup = true; }
        if (!sup) continue;
      }
      let edge = false;
      for (let j = T.nbrStart[t]; j < T.nbrStart[t + 1]; j++) if (T.nbrList[j] === u) { edge = true; break; }
      bonds += edge ? 1 : 0.5;
    }
    if (z - 1 < floor && !above && !lateral) return 1;   // only the void beneath the colony's floor: a lone contact
    const c = Math.round(bonds);
    return c < 1 ? 1 : c > 6 ? 6 : c;
  }

  // Walk candidates: this layer's corner-neighbours; in the layers above and
  // below, the tiles this one overlaps and their edge-neighbours.
  walk(s, out) {
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n, stamp = this._stamp, mark = ++this._mark, occ = this.occ, nb = this.nb, deep = T.deep;
    let nc = 0, q, u;
    for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) {
      u = T.vnbrList[k]; q = z * n + u;
      if (stamp[q] !== mark) { stamp[q] = mark; if (!occ[q] && nb[q] && deep[u]) out[nc++] = q; }
    }
    for (let dz = -1; dz <= 1; dz += 2) {
      const zz = z + dz;
      if (zz < 1 || zz >= this.Z - 1) continue;
      const m = this.vertical(t, z, dz, this._bond), base = zz * n, bond = this._bond;
      for (let i = 0; i < m; i++) {
        u = bond[i]; q = base + u;
        if (stamp[q] !== mark) { stamp[q] = mark; if (!occ[q] && nb[q] && deep[u]) out[nc++] = q; }
        for (let k = T.nbrStart[u]; k < T.nbrStart[u + 1]; k++) {
          const v = T.nbrList[k]; q = base + v;
          if (stamp[q] !== mark) { stamp[q] = mark; if (!occ[q] && nb[q] && deep[v]) out[nc++] = q; }
        }
      }
    }
    return nc;
  }

  // ---------------------------------------------------------------- rays --
  // The terrace rule for a site over the layer below, read off the height
  // field along world rays from the site's centroid: fed iff some direction
  // drops away within `rim` tiles with nothing at this level beyond, and no
  // brick at this level within `rim` on the opposite side.
  fedTop(t, z, rim, floor = 0) {
    const H = this.H, h = z, kRim = 2 * rim, side = this.hside;
    // in cell units: the site's centroid, and a half-tile step along each direction
    const cx = (this.wx(z, this.T.cx[t], this.T.cy[t]) - this.hx0) / HALF, cy = (this.wy(z, this.T.cx[t], this.T.cy[t]) - this.hx0) / HALF;
    for (let d = 0; d < 12; d++) {
      const dx = DIRS[d][0] / FIX, dy = DIRS[d][1] / FIX;
      let drop = 0, ok = true;
      for (let k = 1; k <= 2 * LOOK; k++) {
        const gx = Math.floor(cx + dx * k), gy = Math.floor(cy + dy * k);
        if (gx < 0 || gy < 0 || gx >= side || gy >= side) { if (!drop) drop = k; break; }   // off the map: open sky
        let e = H[gy * side + gx];
        if (e < floor) e = -1;
        if (!drop) {
          if (e >= h) { ok = false; break; }
          if (e < h - 1) { drop = k; if (k > kRim) { ok = false; break; } }
        } else if (e >= h - 1) { ok = false; break; }
      }
      if (!ok || !drop) continue;
      let sheltered = false;
      for (let k = 1; k <= kRim; k++) {
        const gx = Math.floor(cx - dx * k), gy = Math.floor(cy - dy * k);
        if (gx < 0 || gy < 0 || gx >= side || gy >= side) break;
        const e = H[gy * side + gx];
        if (e >= h && e >= floor) { sheltered = true; break; }
      }
      if (!sheltered) return true;
    }
    return false;
  }

  // A lip (site t beside brick o, same layer) may overhang the melt, never
  // roof over a terrace: no lower step within `rim` layers under it — its
  // own footprint supported, or bricks outward along the growth direction.
  fedSide(t, o, z, rim, floor = 0) {
    const T = this.T, n = this.n, occ = this.occ;
    const wx = this.wx(z, T.cx[t], T.cy[t]), wy = this.wy(z, T.cx[t], T.cy[t]);
    const d = this.nearestDir(wx - this.wx(z, T.cx[o], T.cy[o]), wy - this.wy(z, T.cx[o], T.cy[o]));
    const dx = DIRS[d][0] / 2, dy = DIRS[d][1] / 2;
    for (let k = 1; k <= rim; k++) {
      const zz = z - k;
      if (zz < floor) break;
      if (this.supportAt(t, z, zz) >= SUPPORT) return false;
      const base = zz * n;
      for (let j = 2; j <= 6; j += 2) { const u = this.locateIn(zz, wx + dx * j, wy + dy * j); if (u >= 0 && occ[base + u]) return false; }
    }
    return true;
  }
  // the fraction of (t, z)'s footprint over bricks of layer zz: exact for the
  // layer beneath, sampled (the centroid and every other half-radius) further down
  supportAt(t, z, zz) {
    if (zz === z - 1) return this.supportOf(t, z);
    const T = this.T, n = this.n, occ = this.occ, base = zz * n, ps = T.polyStart[t], L = T.polyLen[t], f = this.frames[z];
    const cx = T.cx[t] + f.ox, cy = T.cy[t] + f.oy;
    let hit = 0, m = 0, u;
    u = this.locateIn(zz, f.c * cx - f.s * cy, f.s * cx + f.c * cy); m++; if (u >= 0 && occ[base + u]) hit++;
    for (let i = 0; i < L; i += 2) {
      const v = T.polyVerts[ps + i], x = (T.vx[v] + f.ox + cx) / 2, y = (T.vy[v] + f.oy + cy) / 2;
      u = this.locateIn(zz, f.c * x - f.s * y, f.s * x + f.c * y); m++; if (u >= 0 && occ[base + u]) hit++;
    }
    return hit / m;
  }

  fedBias(s, nb, axis, rim, B, floor = 0) {
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n, occ = this.occ, base = z * n;
    const support = z > 0 && z - 1 >= floor ? this.supportOf(t, z) : 0;
    const cover = this.coverOf(t, z);
    let lat = 0;
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) if (occ[base + T.nbrList[k]]) lat++;
    let bias = 0;
    // +z: standing on the layer below. Less than SUPPORT is not standing —
    // a brick over one corner of another would start a chain of corners
    // climbing away from the crystal — so a part-supported site is fed only
    // sideways, as a ledge or a lip.
    if (support >= SUPPORT) {
      let w = axis[4];
      if (w > bias) {
        if (lat === 0 && cover === 0) {
          // the patch under a new layer: the corner-neighbours of t that stand
          // on the layer below, scaled to the cubic rule's 8-neighbourhood
          const vd = T.vnbrStart[t + 1] - T.vnbrStart[t];
          let cnt = 0;
          for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) if (this.supportOf(T.vnbrList[k], z) >= SUPPORT) cnt++;
          const c8 = vd ? Math.floor((cnt * 8) / vd + 0.5) : 0;
          w *= c8 >= B.patchFull ? 1 : c8 >= B.patchMin ? B.patchPart : 0;
        }
        if (w > bias && this.fedTop(t, z, rim, floor)) bias = w;
      }
    }
    // lateral: each edge-neighbour holding a brick at this layer
    const ps = T.polyStart[t], L = T.polyLen[t];
    const wx = this.wx(z, T.cx[t], T.cy[t]), wy = this.wy(z, T.cx[t], T.cy[t]);
    for (let i = 0; i < L; i++) {
      const o = T.across[ps + i];
      if (o < 0 || !occ[base + o]) continue;
      const gx = wx - this.wx(z, T.cx[o], T.cy[o]), gy = wy - this.wy(z, T.cx[o], T.cy[o]);
      let w = this.lateralWeight(gx, gy, axis);
      if (w <= bias) continue;
      if (support < SUPPORT && lat === 1 && cover === 0) {
        // a lip: nothing solid beneath, one bond along
        if (B.lipRule) {
          if (this.heightAt(wx, wy) >= z) continue;
          if (this.heightAt(this.wx(z, T.cx[o], T.cy[o]), this.wy(z, T.cx[o], T.cy[o])) !== z) continue;
        }
        let along = 0;
        for (let k = T.nbrStart[o]; k < T.nbrStart[o + 1]; k++) { const v = T.nbrList[k]; if (v !== t && occ[base + v]) along++; }
        w *= along >= 2 ? 1 : along === 1 ? B.lipAlong : 0;
        if (B.lipDepth > 0) {
          const lo = floor > this.minZ ? floor : this.minZ;
          const depth = (z - lo) / Math.max(1, this.maxZ - lo);
          let dd = depth;
          for (let k = 1; k < B.lipDepth; k++) dd *= depth;
          w *= dd;
        }
        if (w <= bias) continue;
      }
      if (this.fedSide(t, o, z, rim, floor)) bias = w;
    }
    return bias;
  }

  // Arrival from the melt, as the prism does it, with every sample located in
  // its own layer's frame.
  arrive(r, B, region) {
    const n = this.n, R = region || this;
    const cnt = R.count || 1;
    const cx = Math.round(R.sx / cnt), cy = Math.round(R.sy / cnt), cz = Math.round(R.sz / cnt);
    for (let attempt = 0; attempt < 12; attempt++) {
      const pad = (6 + attempt) * FIX;
      const lo = [R.fminX - pad, R.fminY - pad, (R.minZ - 6 - attempt) * FIX];
      const hi = [R.fmaxX + pad, R.fmaxY + pad, (R.maxZ + 7 + attempt) * FIX];
      const u = r(), a = B.arriveFromAbove;
      const face = u < a ? 5 : Math.floor((u - a) * (5 / (1 - a)));
      const p = [
        lo[0] + Math.floor(r() * (hi[0] - lo[0] + 1)),
        lo[1] + Math.floor(r() * (hi[1] - lo[1] + 1)),
        lo[2] + Math.floor(r() * (hi[2] - lo[2] + 1)),
      ];
      p[face >> 1] = (face & 1) ? hi[face >> 1] : lo[face >> 1];
      const ext = (R.fmaxX - R.fminX + R.fmaxY - R.fminY) / FIX + (R.maxZ - R.minZ);
      const j = (2 + Math.floor(ext / 6)) * FIX;
      const tgt = [
        cx + Math.floor(r() * (2 * j + 1)) - j,
        cy + Math.floor(r() * (2 * j + 1)) - j,
        cz * FIX + Math.floor(r() * (2 * j + 1)) - j,
      ];
      const dx = tgt[0] - p[0], dy = tgt[1] - p[1], dz = tgt[2] - p[2];
      const N = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / HALF));
      let prev = -1, entered = false;
      for (let i = 1; i <= 4 * N; i++) {
        const x = p[0] + Math.floor((dx * i) / N), y = p[1] + Math.floor((dy * i) / N);
        const zf = p[2] + Math.floor((dz * i) / N);
        const z = Math.floor(zf / FIX);
        if (z < 0 || z >= this.Z) { if (entered) break; continue; }
        const t = this.locateIn(z, x, y);
        if (t < 0) { if (entered) break; continue; }
        entered = true;
        const s = z * n + t;
        if (this.occ[s]) {
          if (prev >= 0 && !this.occ[prev] && this.nb[prev] > 0) return prev;
          break;
        }
        prev = s;
      }
    }
    return -1;
  }

  // Measured off the height field.
  stats(growth) {
    const T = this.T, n = this.n, H = this.H;
    const box = [(this.fmaxX - this.fminX) / FIX + 1, (this.fmaxY - this.fminY) / FIX + 1, this.maxZ - this.minZ + 1];
    let pit = 0, exposed = 0;
    for (let z = Math.max(1, this.minZ); z <= this.maxZ; z++) for (let t = 0; t < n; t++) {
      const s = z * n + t;
      if (this.occ[s]) { exposed += (T.polyLen[t] + 2) - this.nb[s]; continue; }
      if (!this.nb[s] || this.supportOf(t, z) <= 0) continue;
      const wx = this.wx(z, T.cx[t], T.cy[t]), wy = this.wy(z, T.cx[t], T.cy[t]);
      let fenced = 0;
      for (let d = 0; d < 12; d += 3) {
        for (let k = 1; k <= 2 * LOOK; k++) {
          const c = this.cellOf(wx + DIRS[d][0] * k / 2, wy + DIRS[d][1] * k / 2);
          if (c < 0) break;
          if (H[c] >= z) { fenced++; break; }
        }
      }
      if (fenced === 4) pit++;
    }
    const heights = new Set();
    for (let k = 1; k <= 2 * (T.R | 0); k++) { const c = this.cellOf(k * HALF, 0); if (c < 0) break; if (H[c] >= 0) heights.add(H[c]); }
    return {
      bricks: this.count, box, pit, hollowness: pit / Math.max(1, this.count), exposedFaces: exposed, terraces: heights.size,
      ticks: growth.tick, masons: growth.masons.length, retired: growth.retired, laidPerMason: growth.masons.map((m) => m.laid),
      tiling: this.spec.shape, tiles: n, stack: this.stack, stagger: this.stagger, twist: this.twist, coordination: this.coordination(),
    };
  }
}
