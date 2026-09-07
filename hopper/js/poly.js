// bismuth — the Poly substrate: a POLYCRYSTAL. Several plane tilings, each
// turned by its own angle and set down at its own place, sharing one stack
// of layers; each is a GRAIN. A brick occupies the prism over its tile, so
// where two grains' tiles overlap only one of them can hold a brick — the
// EXCLUSION — and a column a grain has built in is that grain's ground: no
// other lattice continues over it. The grains grow toward each other until
// they meet, and where they meet is a grain boundary: neither lattice
// crosses it, the tiles that would have to straddle it stay empty, and the
// misfit is the gap you see. That is what a polycrystal is.
//
// One melt, many grains. All the nuclei belong to colony 0 and its masons
// land wherever the melt's rays strike, so grains compete for masons by
// exposed surface, as grains solidifying from one melt do; a pack deployed
// on a grain (the playground's deploy) is a population with its own laws on
// that grain alone, because a mason only ever walks its own lattice.
//
// Built on Prism: the composite of the grains' tilings is itself a tiling
// object — every grain's tiles, vertices and adjacency concatenated with
// offset ids, coordinates in WORLD fixed-point — so bonds, walking, the
// Kossel classes, plates, regions and the mesher all work unchanged and
// stay within a grain (adjacency never crosses grains). What Poly adds:
//
//   · the OVERLAP relation between grains' tiles (once, as CSR: the world
//     polygons clipped against each other, an overlap counting from
//     OVERLAP_MIN of the smaller tile), and from it `ft`, the tallest foreign
//     column over each tile — a site over foreign ground is blocked, and the
//     terrace rule reads the column as a wall;
//   · rays per grain: the terrace scan walks a grain's own tiles in the
//     grain's own frame, but reads foreign tops along the way;
//   · arrival from one melt: a world ray, stopped at the first brick of any
//     grain, landing beside it on that grain.
//
// Frames are integer: angles in whole degrees from a literal cos/sin table
// at 2²⁰, so the same seed is the same polycrystal in every engine.

import { Prism } from "./prism.js";
import { tiling, SHAPES, FIX } from "./tilings.js";
import { stream } from "./prng.js";

export const OVERLAP_MIN = 0.08;                   // of the smaller tile's area: less is a sliver, not a clash
export const GRAINS_MAX = 6;
export const MIX = ["grid", "hex", "penrose", "ammann", "seven", "rhombille", "snub", "kagome"];   // what a mixed polycrystal draws from
const K = 1 << 20;
// cos, sin at whole degrees 0..90, × 2²⁰ (literal: no trig at run time)
const TRIG = [
  [1048576, 0], [1048416, 18300], [1047937, 36595], [1047139, 54878], [1046022, 73145], [1044586, 91389],
  [1042832, 109606], [1040760, 127789], [1038371, 145934], [1035666, 164033], [1032646, 182083], [1029311, 200078],
  [1025662, 218011], [1021701, 235878], [1017429, 253673], [1012847, 271391], [1007956, 289027], [1002758, 306574],
  [997255, 324028], [991448, 341383], [985339, 358634], [978930, 375776], [972223, 392803], [965219, 409711],
  [957922, 426494], [950333, 443147], [942454, 459665], [934288, 476044], [925838, 492277], [917105, 508360],
  [908093, 524288], [898805, 540057], [889243, 555661], [879410, 571095], [869309, 586356], [858943, 601438],
  [848316, 616338], [837430, 631049], [826289, 645568], [814897, 659890], [803256, 674012], [791370, 687928],
  [779244, 701634], [766880, 715127], [754282, 728402], [741455, 741455], [728402, 754282], [715127, 766880],
  [701634, 779244], [687928, 791370], [674012, 803256], [659890, 814897], [645568, 826289], [631049, 837430],
  [616338, 848316], [601438, 858943], [586356, 869309], [571095, 879410], [555661, 889243], [540057, 898805],
  [524288, 908093], [508360, 917105], [492277, 925838], [476044, 934288], [459665, 942454], [443147, 950333],
  [426494, 957922], [409711, 965219], [392803, 972223], [375776, 978930], [358634, 985339], [341383, 991448],
  [324028, 997255], [306574, 1002758], [289027, 1007956], [271391, 1012847], [253673, 1017429], [235878, 1021701],
  [218011, 1025662], [200078, 1029311], [182083, 1032646], [164033, 1035666], [145934, 1038371], [127789, 1040760],
  [109606, 1042832], [91389, 1044586], [73145, 1046022], [54878, 1047139], [36595, 1047937], [18300, 1048416],
  [0, 1048576]
];
function cosDeg(d) { d = ((d % 360) + 360) % 360; if (d <= 90) return TRIG[d][0]; if (d <= 180) return -TRIG[180 - d][0]; if (d <= 270) return -TRIG[d - 180][0]; return TRIG[360 - d][0]; }
function sinDeg(d) { d = ((d % 360) + 360) % 360; if (d <= 90) return TRIG[d][1]; if (d <= 180) return TRIG[180 - d][1]; if (d <= 270) return -TRIG[d - 180][1]; return -TRIG[360 - d][1]; }
// the rotational symmetry of a tiling: a turn by this and it is itself again
const PERIOD = { grid: 90, hex: 60, penrose: 36, ammann: 45, seven: 360 / 14, rhombille: 60, snub: 90, kagome: 60, rhombitri: 60, truncsq: 90 };
// 12 ray directions, as in Prism (fixed-point unit vectors)
const DIRS = [[1024, 0], [887, 512], [512, 887], [0, 1024], [-512, 887], [-887, 512], [-1024, 0], [-887, -512], [-512, -887], [0, -1024], [512, -887], [887, -512]];
const LOOK = 32;

// Sutherland–Hodgman: the area of convex `subj` inside convex `clip`, both CCW [[x, y], …]
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
  const den = ex * dy - ey * dx;
  if (den === 0) return E;
  const t = (ex * (a[1] - S[1]) - ey * (a[0] - S[0])) / den;
  return [S[0] + dx * t, S[1] + dy * t];
}

// The grains a seed draws: `count` of them, each a tiling (`shape`, or one of
// MIX each when `mix`), turned by a whole-degree angle within `spread` of
// the tiling's own period, set down at a point of the domain no nearer
// another grain than the domain allows. Integer positions, whole degrees.
export function grainsFor(seed, spec) {
  const r = stream(seed, "grains");
  const count = Math.max(1, Math.min(GRAINS_MAX, Math.round(spec.grains || 1)));
  const R = spec.R || 30, spread = spec.spread === undefined ? 30 : spec.spread;
  const out = [];
  const reach = Math.round(R * 0.55 * FIX), dmin2 = Math.pow(Math.round(1.3 * R * FIX / Math.sqrt(count)), 2);
  for (let g = 0; g < count; g++) {
    const shape = spec.mix ? MIX[Math.floor(r() * MIX.length)] : (spec.shape || "grid");
    const period = PERIOD[shape] || 90;
    const angle = g === 0 ? 0 : Math.floor(r() * (Math.min(spread, period) + 1));
    let ox = 0, oy = 0;
    if (g > 0) {
      let best = null, bd = -1;
      for (let attempt = 0; attempt < 24; attempt++) {
        const rad = Math.floor(r() * reach), deg = Math.floor(r() * 360);
        const x = Math.floor(rad * cosDeg(deg) / K), y = Math.floor(rad * sinDeg(deg) / K);
        let d = Infinity;
        for (const o of out) { const dd = (o.ox - x) * (o.ox - x) + (o.oy - y) * (o.oy - y); if (dd < d) d = dd; }
        if (d > bd) { bd = d; best = [x, y]; }
        if (d >= dmin2) break;
      }
      ox = best[0]; oy = best[1];
    }
    out.push({ shape, angle, ox, oy });
  }
  return out;
}

// The composite tiling: every grain's tiles in world coordinates, ids offset,
// with the Tiling fields Prism and the mesher read.
function composite(grains, R) {
  const U = { shape: "poly", R, grains };
  let n = 0, nv = 0, npv = 0;
  for (const g of grains) { g.tileBase = n; g.vertBase = nv; g.slotBase = npv; n += g.T.n; nv += g.T.vx.length; npv += g.T.polyVerts.length; }
  U.n = n;
  U.cx = new Int32Array(n); U.cy = new Int32Array(n); U.area = new Float64Array(n); U.deep = new Uint8Array(n); U.interior = new Uint8Array(n);
  U.vx = new Int32Array(nv); U.vy = new Int32Array(nv);
  U.polyStart = new Int32Array(n); U.polyLen = new Int32Array(n); U.polyVerts = new Int32Array(npv); U.across = new Int32Array(npv);
  U.grainOfTile = new Uint8Array(n);
  const nbrStart = new Int32Array(n + 1), nbrList = [], vnbrStart = new Int32Array(n + 1), vnbrList = [];
  U.atVertex = new Map();
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let gi = 0; gi < grains.length; gi++) {
    const g = grains[gi], T = g.T, tb = g.tileBase, vb = g.vertBase, sb = g.slotBase;
    for (let v = 0; v < T.vx.length; v++) {
      const w = g.toWorld(T.vx[v], T.vy[v]);
      U.vx[vb + v] = w[0]; U.vy[vb + v] = w[1];
      if (w[0] < minX) minX = w[0]; if (w[0] > maxX) maxX = w[0]; if (w[1] < minY) minY = w[1]; if (w[1] > maxY) maxY = w[1];
    }
    for (let t = 0; t < T.n; t++) {
      const gt = tb + t, w = g.toWorld(T.cx[t], T.cy[t]);
      U.cx[gt] = w[0]; U.cy[gt] = w[1]; U.area[gt] = T.area[t]; U.deep[gt] = T.deep[t]; U.interior[gt] = T.interior[t]; U.grainOfTile[gt] = gi;
      U.polyStart[gt] = sb + T.polyStart[t]; U.polyLen[gt] = T.polyLen[t];
      for (let i = 0; i < T.polyLen[t]; i++) { const slot = T.polyStart[t] + i; U.polyVerts[sb + slot] = vb + T.polyVerts[slot]; const a = T.across[slot]; U.across[sb + slot] = a < 0 ? -1 : tb + a; }
      nbrStart[gt] = nbrList.length; for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) nbrList.push(tb + T.nbrList[k]);
      vnbrStart[gt] = vnbrList.length; for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) vnbrList.push(tb + T.vnbrList[k]);
    }
    for (const [v, list] of T.atVertex) U.atVertex.set(vb + v, list.map((t) => tb + t));
  }
  nbrStart[n] = nbrList.length; vnbrStart[n] = vnbrList.length;
  U.nbrStart = nbrStart; U.nbrList = Int32Array.from(nbrList); U.vnbrStart = vnbrStart; U.vnbrList = Int32Array.from(vnbrList);
  U.minX = minX; U.minY = minY; U.maxX = maxX; U.maxY = maxY;
  // point location: the grain whose nucleus is nearest, among those whose tiling holds the point
  U.locate = (x, y) => {
    let best = -1, bd = Infinity;
    for (const g of grains) {
      const l = g.toLocal(x, y), t = g.T.locate(l[0], l[1]);
      if (t < 0) continue;
      const d = (x - g.oxf) * (x - g.oxf) + (y - g.oyf) * (y - g.oyf);
      if (d < bd) { bd = d; best = g.tileBase + t; }
    }
    return best;
  };
  U.polygon = (t) => { const out = [], s = U.polyStart[t], L = U.polyLen[t]; for (let i = 0; i < L; i++) { const v = U.polyVerts[s + i]; out.push([U.vx[v] / FIX, U.vy[v] / FIX]); } return out; };
  U.signature = () => grains.map((g) => `${g.shape}@${g.angle}(${g.ox},${g.oy}):${g.T.signature()}`).join("|");
  return U;
}

export class Poly extends Prism {
  constructor(spec, seed = 1) {
    const R = spec.R || 30;
    const list = Array.isArray(spec.grains) ? spec.grains : grainsFor(seed, spec);
    const grains = list.map((d, i) => {
      const shape = SHAPES.includes(d.shape) ? d.shape : "grid";
      const angle = Math.round(d.angle || 0), oxf = Math.round(d.ox || 0), oyf = Math.round(d.oy || 0);
      const c = cosDeg(angle), s = sinDeg(angle);
      const reach = R + Math.ceil(Math.hypot(oxf, oyf) / FIX) + 2;   // the tiling covers the whole domain from where it sits
      const g = {
        idx: i, shape, angle, ox: oxf, oy: oyf, oxf, oyf, c, s, T: tiling(shape, reach),
        toWorld: (x, y) => [Math.floor((c * x - s * y) / K) + oxf, Math.floor((s * x + c * y) / K) + oyf],
        toLocal: (x, y) => { const dx = x - oxf, dy = y - oyf; return [Math.floor((c * dx + s * dy) / K), Math.floor((-s * dx + c * dy) / K)]; },
      };
      return g;
    });
    const U = composite(grains, R);
    super(Object.assign({}, spec, { _T: U, R }));
    this.poly = true;
    this.grains = grains;
    this.rays = null;
    this.buildOverlaps();
    this.ft = new Int16Array(this.n).fill(-1);     // the tallest foreign column over each tile, kept exact
  }
  grainOf(t) { return this.T.grainOfTile[t]; }

  // The overlap relation, once, as CSR: for every tile, the foreign tiles
  // whose prisms clash with its own — the world polygons clipped against
  // each other; the tile under the centroid and two rings around it are
  // the candidates.
  buildOverlaps() {
    const U = this.T, n = this.n, start = new Int32Array(n + 1), list = [];
    const polys = new Array(n);
    const poly = (t) => polys[t] || (polys[t] = U.polygon(t));
    for (let t = 0; t < n; t++) {
      start[t] = list.length;
      const g = this.grains[U.grainOfTile[t]], P = poly(t), at = U.area[t];
      const found = [];
      for (const h of this.grains) {
        if (h === g) continue;
        const l = h.toLocal(U.cx[t], U.cy[t]), u0 = h.T.locate(l[0], l[1]);
        if (u0 < 0) continue;
        const seen = new Set([u0]);
        let frontier = [u0];
        for (let d = 0; d < 2; d++) { const next = []; for (const u of frontier) for (let k = h.T.vnbrStart[u]; k < h.T.vnbrStart[u + 1]; k++) { const v = h.T.vnbrList[k]; if (!seen.has(v)) { seen.add(v); next.push(v); } } frontier = next; }
        for (const u of seen) {
          const gu = h.tileBase + u;
          if (clipArea(P, poly(gu)) >= OVERLAP_MIN * Math.min(at, U.area[gu])) found.push(gu);
        }
      }
      found.sort((a, b) => a - b);
      for (const f of found) list.push(f);
    }
    start[n] = list.length;
    // symmetric by construction: at the rim of a grain's tiling a clash can be found from one side only
    const sets = new Array(n);
    for (let t = 0; t < n; t++) sets[t] = new Set(list.slice(start[t], start[t + 1]));
    for (let t = 0; t < n; t++) for (const u of sets[t]) sets[u].add(t);
    const flat = [], st2 = new Int32Array(n + 1);
    for (let t = 0; t < n; t++) { st2[t] = flat.length; for (const u of [...sets[t]].sort((a, b) => a - b)) flat.push(u); }
    st2[n] = flat.length;
    this.overStart = st2; this.overList = Int32Array.from(flat);
  }
  overlaps(t) { return this.overList.subarray(this.overStart[t], this.overStart[t + 1]); }
  // A site is blocked when a foreign grain has CLAIMED its ground: a foreign
  // brick in any overlapping tile, at any layer. Not merely the same layer —
  // a lattice does not continue over another lattice's column, so the grains
  // partition the plane as they meet, and a grain that falls behind keeps
  // the ground it holds (a pocket in the polycrystal, not a burial).
  blocked(s) { return this.ft[s % this.n] >= 0; }
  claimed(t) { return this.ft[t] >= 0; }
  solidAt(s) { return this.occ[s] === 1 || this.blocked(s); }
  // the tallest column over tile t, its own or a foreign one: what the terrace rule reads as the wall
  topAt(t) { const a = this.top[t], b = this.ft[t]; return a > b ? a : b; }
  ftop(t) { return this.ft[t]; }

  place(s) {
    if (this.blocked(s)) return false;
    if (!super.place(s)) return false;
    const n = this.n, t = s % n, z = (s - t) / n, os = this.overStart, ol = this.overList, ft = this.ft;
    for (let i = os[t]; i < os[t + 1]; i++) { const u = ol[i]; if (z > ft[u]) ft[u] = z; }
    return true;
  }
  remove(s) {
    if (!super.remove(s)) return false;
    const n = this.n, t = s % n, os = this.overStart, ol = this.overList, ft = this.ft, top = this.top;
    for (let i = os[t]; i < os[t + 1]; i++) {
      const u = ol[i];
      let h = -1;
      for (let k = os[u]; k < os[u + 1]; k++) if (top[ol[k]] > h) h = top[ol[k]];
      ft[u] = h;
    }
    return true;
  }
  open(s) { const t = s % this.n, z = (s - t) / this.n; return this.top[t] < z && this.ft[t] < z; }
  kossel(s, floor = 0) { if (this.blocked(s)) return 0; return super.kossel(s, floor); }
  summit() {
    let best = -1, bt = -1;
    for (let t = 0; t < this.n; t++) if (this.top[t] > best && this.top[t] + 1 < this.Z && !this.blocked(this.site(t, this.top[t] + 1))) { best = this.top[t]; bt = t; }
    return best < 0 ? -1 : this.site(bt, best + 1);
  }
  siteAt(at) {
    if (typeof at === "number") return at;
    if (at.tile !== undefined) return super.siteAt(at);
    const z = Math.round(at.z);
    if (z < 0 || z >= this.Z) return -1;
    const x = Math.round(at.x * FIX), y = Math.round(at.y * FIX);
    // the grain holding a brick there wins; else the nearest nucleus
    let best = -1, bd = Infinity;
    for (const g of this.grains) {
      const l = g.toLocal(x, y), t = g.T.locate(l[0], l[1]);
      if (t < 0) continue;
      const s = this.site(g.tileBase + t, z);
      if (this.occ[s]) return s;
      const d = (x - g.oxf) * (x - g.oxf) + (y - g.oyf) * (y - g.oyf);
      if (d < bd) { bd = d; best = s; }
    }
    return best;
  }
  // a deployed pack's region remembers which grains it lies on: its masons land only there
  regionNew() { const r = super.regionNew(); r.onGrains = new Set(); return r; }
  regionAdd(r, s) { super.regionAdd(r, s); if (r.onGrains) r.onGrains.add(this.T.grainOfTile[s % this.n]); }
  walk(s, out) {
    const nc = super.walk(s, out);
    let k = 0;
    for (let i = 0; i < nc; i++) if (!this.blocked(out[i])) out[k++] = out[i];
    return k;
  }

  // every grain's nucleus: a disk of tiles about the grain's own origin
  seed(genome) {
    const bricks = [];
    const ic = this.spec.ic || { disk: 3, thickness: 2 };
    const r2 = (ic.disk || 3) * FIX * ((ic.disk || 3) * FIX), thick = ic.thickness || 2;
    for (const g of this.grains) {
      const T = g.T;
      for (let t = 0; t < T.n; t++) {
        const cx = T.cx[t], cy = T.cy[t];
        if (cx * cx + cy * cy > r2) continue;
        for (let k = 0; k < thick; k++) {
          const z = this.z0 + k;
          if (z < 1 || z >= this.Z - 2 || !T.deep[t]) continue;
          const s = this.site(g.tileBase + t, z);
          if (this.place(s)) bricks.push(this.brick(s, 0, -1));
        }
      }
    }
    return bricks;
  }

  // a ray from tile t in world direction d, walked over t's own grain's tiles in that grain's frame
  ray(t, d) {
    let cache = this.rays;
    if (!cache) cache = this.rays = new Array(this.n);
    let R = cache[t];
    if (!R) R = cache[t] = new Array(12);
    let seq = R[d];
    if (seq) return seq;
    const g = this.grains[this.T.grainOfTile[t]], T = g.T, lt = t - g.tileBase;
    const cx = T.cx[lt], cy = T.cy[lt];
    // the direction in the grain's frame
    const dx = Math.floor((g.c * DIRS[d][0] + g.s * DIRS[d][1]) / K), dy = Math.floor((-g.s * DIRS[d][0] + g.c * DIRS[d][1]) / K);
    const out = [];
    let last = lt;
    for (let k = 1; k <= 2 * LOOK; k++) {
      const u = T.locate(cx + ((dx * k) >> 1), cy + ((dy * k) >> 1));
      if (u === last) continue;
      last = u;
      out.push(u < 0 ? -1 : g.tileBase + u, k);
      if (u < 0) break;
    }
    if (out.length === 0 || out[out.length - 2] >= 0) out.push(-2, 2 * LOOK + 1);
    seq = R[d] = Int32Array.from(out);
    return seq;
  }
  // the terrace rule from the top of a brick, reading foreign walls as walls
  fedTop(t, z, rim, floor = 0) {
    const h = z, kRim = 2 * rim;
    for (let d = 0; d < 12; d++) {
      const seq = this.ray(t, d);
      let drop = 0, ok = true;
      for (let i = 0; i < seq.length; i += 2) {
        const u = seq[i], k = seq[i + 1];
        if (u === -2) break;
        if (u < 0) { if (!drop) drop = k; break; }
        let e = this.topAt(u);
        if (e < floor) e = -1;
        if (!drop) {
          if (e >= h) { ok = false; break; }
          if (e < h - 1) { drop = k; if (k > kRim) { ok = false; break; } }
        } else if (e >= h - 1) { ok = false; break; }
      }
      if (!ok || !drop) continue;
      let sheltered = false;
      const opp = this.ray(t, (d + 6) % 12);
      for (let i = 0; i < opp.length; i += 2) {
        const u = opp[i], k = opp[i + 1];
        if (u < 0 || k > kRim) break;
        const e = this.topAt(u);
        if (e >= h && e >= floor) { sheltered = true; break; }
      }
      if (!sheltered) return true;
    }
    return false;
  }
  // A lateral attachment keeps Prism's rule against its own lower steps only:
  // a foreign grain's ground is blocked outright, so there is nothing of it
  // to roof over.

  // Arrival from one melt: a world ray toward the crystal, stopped at the first
  // brick of ANY grain, landing on the last empty site of that grain before it.
  arrive(r, B, region) {
    const n = this.n, R = region || this, grains = this.grains;
    const cnt = R.count || 1;
    const cx = Math.round(R.sx / cnt), cy = Math.round(R.sy / cnt), cz = Math.round(R.sz / cnt);
    const prev = this._prev || (this._prev = new Int32Array(GRAINS_MAX));
    for (let attempt = 0; attempt < 12; attempt++) {
      const pad = (6 + attempt) * FIX;
      const lo = [R.fminX - pad, R.fminY - pad, (R.minZ - 6 - attempt) * FIX];
      const hi = [R.fmaxX + pad, R.fmaxY + pad, (R.maxZ + 7 + attempt) * FIX];
      const u = r(), a = B.arriveFromAbove;
      const face = u < a ? 5 : Math.floor((u - a) * (5 / (1 - a)));
      const p = [lo[0] + Math.floor(r() * (hi[0] - lo[0] + 1)), lo[1] + Math.floor(r() * (hi[1] - lo[1] + 1)), lo[2] + Math.floor(r() * (hi[2] - lo[2] + 1))];
      p[face >> 1] = (face & 1) ? hi[face >> 1] : lo[face >> 1];
      // aimed at a point drawn uniformly over the region's box, not near its centroid: from one melt every
      // grain is struck in proportion to the surface it shows, and a grain off-centre is not starved
      const jx = Math.max(2 * FIX, R.fmaxX - cx, cx - R.fminX), jy = Math.max(2 * FIX, R.fmaxY - cy, cy - R.fminY), jz = Math.max(2, R.maxZ - cz, cz - R.minZ) * FIX;
      const tgt = [cx + Math.floor(r() * (2 * jx + 1)) - jx, cy + Math.floor(r() * (2 * jy + 1)) - jy, cz * FIX + Math.floor(r() * (2 * jz + 1)) - jz];
      const dx = tgt[0] - p[0], dy = tgt[1] - p[1], dz = tgt[2] - p[2];
      const N = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / (FIX >> 1)));
      prev.fill(-1);
      let entered = false;
      for (let i = 1; i <= 4 * N; i++) {
        const x = p[0] + Math.floor((dx * i) / N), y = p[1] + Math.floor((dy * i) / N), z = Math.floor((p[2] + Math.floor((dz * i) / N)) / FIX);
        if (z < 0 || z >= this.Z) { if (entered) break; continue; }
        let any = false, hit = -1;
        for (let gi = 0; gi < grains.length; gi++) {
          const g = grains[gi], l = g.toLocal(x, y), t = g.T.locate(l[0], l[1]);
          if (t < 0) { prev[gi] = -1; continue; }
          any = true;
          const s = z * n + g.tileBase + t;
          if (this.occ[s]) { hit = gi; break; }
          prev[gi] = s;
        }
        if (!any) { if (entered) break; continue; }
        entered = true;
        if (hit >= 0) {
          const q = prev[hit];
          if (q >= 0 && !this.occ[q] && this.nb[q] > 0 && !this.blocked(q) && (!R.onGrains || R.onGrains.has(hit))) return q;
          break;
        }
      }
    }
    return -1;
  }

  stats(growth) {
    const st = super.stats(growth);
    const n = this.n, occ = this.occ;
    const per = new Array(this.grains.length).fill(0);
    let boundary = 0;
    for (let z = this.minZ; z <= this.maxZ; z++) for (let t = 0; t < n; t++) {
      const s = z * n + t;
      if (!occ[s]) continue;
      per[this.T.grainOfTile[t]]++;
      // a boundary brick: one of its edge-neighbours' tiles is another grain's ground
      let touch = false;
      for (let k = this.T.nbrStart[t]; !touch && k < this.T.nbrStart[t + 1]; k++) if (this.ft[this.T.nbrList[k]] >= 0) touch = true;
      if (touch) boundary++;
    }
    st.tiling = "poly";
    st.grains = this.grains.map((g, i) => ({ shape: g.shape, angle: g.angle, bricks: per[i] }));
    st.boundary = boundary;
    return st;
  }
}
