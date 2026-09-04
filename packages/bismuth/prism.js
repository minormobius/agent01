// bismuth — the Prism substrate: any plane tiling from packages/tilings,
// stacked into layers. A site is (tile, z); a brick is the prism over its
// tile. Lateral neighbours share an edge; vertical neighbours are the same
// tile one layer up or down. A Penrose tiling gives a decagonal quasicrystal
// (periodic along z, quasiperiodic in the plane), which is a real class of
// solid and facets and hoppers like one.
//
// Everything the masons ask of a substrate is answered here in integer
// arithmetic on the tiling's fixed-point coordinates: bonds, open sky, walk
// candidates, arrival rays, and the terrace verdict — which on a tiling is
// no longer a scan along lattice lines but true geometric rays from the
// tile's centroid, point-located tile by tile. Same seed → same doubles →
// same crystal, in any JS engine.

import { tiling, FIX } from "./tilings.js";

export const LAYERS = 96;
const LOOK = 32;                                   // tiles scanned beyond a drop
const HALF = FIX >> 1;                             // ray sample step: half a tile
// 12 ray directions, fixed-point unit vectors (hard-coded: no trig at run time)
const DIRS = [[1024, 0], [887, 512], [512, 887], [0, 1024], [-512, 887], [-887, 512], [-1024, 0], [-887, -512], [-512, -887], [0, -1024], [512, -887], [887, -512]];

export class Prism {
  constructor(spec) {
    this.kind = "prism";
    this.spec = spec;
    const T = this.T = tiling(spec.shape, spec.R || 30);
    const n = this.n = T.n, Z = this.Z = LAYERS;
    this.sites = n * Z;
    this.occ = new Uint8Array(n * Z);
    this.nb = new Uint8Array(n * Z);
    this.top = new Int16Array(n).fill(-1);
    this.count = 0;
    this.sx = 0; this.sy = 0; this.sz = 0;         // centroid accumulators (fixed, layers)
    this.fminX = Infinity; this.fminY = Infinity; this.fmaxX = -Infinity; this.fmaxY = -Infinity;
    this.minZ = Z; this.maxZ = -1;
    this.z0 = spec.z0 !== undefined ? spec.z0 : 8;   // the melt floor
    this.limit2 = (T.R - 2.5) * FIX * ((T.R - 2.5) * FIX);   // bricks stay inside this radius²
    this.moteOffset = [0, 0, 0.5];
    // world-space bounding box of the whole tiling, for the camera
    this.min = [T.minX / FIX, T.minY / FIX, 0]; this.max = [T.maxX / FIX, T.maxY / FIX, 0];
  }

  site(t, z) { return z * this.n + t; }
  // the tiles at layer z + dz bonded to (t, z): on a prism, the tile itself
  vertical(t, z, dz, out) { const zz = z + dz; if (zz < 0 || zz >= this.Z) return 0; out[0] = t; return 1; }
  // the bond graph, in the order the worms walk it: below, above, then the lateral edges
  bonds(s, out) {
    const n = this.n, T = this.T, t = s % n, z = (s - t) / n;
    let k = 0;
    if (z > 1) out[k++] = s - n;
    if (z + 1 < this.Z - 1) out[k++] = s + n;
    for (let i = T.nbrStart[t]; i < T.nbrStart[t + 1]; i++) out[k++] = z * n + T.nbrList[i];
    return k;
  }
  tileOf(s) { return s % this.n; }
  zOf(s) { return (s - s % this.n) / this.n; }

  place(s) {
    if (this.occ[s]) return false;
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n;
    this.occ[s] = 1;
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) this.nb[z * n + T.nbrList[k]]++;
    if (z + 1 < this.Z) this.nb[s + n]++;
    if (z > 0) this.nb[s - n]++;
    if (z > this.top[t]) this.top[t] = z;
    this.count++;
    this.sx += T.cx[t]; this.sy += T.cy[t]; this.sz += z;
    if (T.cx[t] < this.fminX) this.fminX = T.cx[t]; if (T.cx[t] > this.fmaxX) this.fmaxX = T.cx[t];
    if (T.cy[t] < this.fminY) this.fminY = T.cy[t]; if (T.cy[t] > this.fmaxY) this.fmaxY = T.cy[t];
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    return true;
  }
  inBounds(s) {
    const t = s % this.n, z = (s - t) / this.n;
    if (!this.T.deep[t] || z < 1 || z >= this.Z - 2) return false;
    const cx = this.T.cx[t], cy = this.T.cy[t];
    return cx * cx + cy * cy < this.limit2;
  }
  open(s) { const t = s % this.n; return this.top[t] < (s - t) / this.n; }

  // Take a brick away; bonds and the column top stay exact.
  remove(s) {
    if (!this.occ[s]) return false;
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n;
    this.occ[s] = 0;
    for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) this.nb[z * n + T.nbrList[k]]--;
    if (z + 1 < this.Z) this.nb[s + n]--;
    if (z > 0) this.nb[s - n]--;
    if (this.top[t] === z) { let h = z - 1; while (h >= 0 && !this.occ[h * n + t]) h--; this.top[t] = h; }
    this.count--;
    this.sx -= T.cx[t]; this.sy -= T.cy[t]; this.sz -= z;
    return true;
  }
  summit() {
    let best = -1, bt = -1;
    for (let t = 0; t < this.n; t++) if (this.top[t] > best) { best = this.top[t]; bt = t; }
    return best < 0 || best + 1 >= this.Z ? -1 : this.site(bt, best + 1);
  }
  siteAt(at) {
    if (typeof at === "number") return at;
    const z = Math.round(at.z);
    if (z < 0 || z >= this.Z) return -1;
    if (at.tile !== undefined) return at.tile >= 0 && at.tile < this.n ? this.site(at.tile, z) : -1;
    const t = this.T.locate(Math.round(at.x * FIX), Math.round(at.y * FIX));
    return t < 0 ? -1 : this.site(t, z);
  }
  siteAtWorld(x, y, z) { return this.siteAt({ x, y, z: Math.floor(z) }); }
  describe(s) { const t = s % this.n; return { tile: t, z: (s - t) / this.n, x: this.T.cx[t] / FIX, y: this.T.cy[t] / FIX }; }
  // the tile and its rings of edge-neighbours (depth size/2), `thick` layers —
  // rings rather than a metric disk, so a plate is never a single tile on a
  // coarse tiling (a lone tile can nucleate nothing: no patch, no lip to run)
  plate(s, size, thick, colony) {
    const T = this.T, n = this.n, t0 = s % n, z0 = (s - t0) / n, out = [];
    const depth = Math.max(1, size >> 1);
    const seen = new Set([t0]);
    let frontier = [t0];
    for (let d = 0; d < depth; d++) {
      const next = [];
      for (const t of frontier) for (let k = T.nbrStart[t]; k < T.nbrStart[t + 1]; k++) { const u = T.nbrList[k]; if (!seen.has(u)) { seen.add(u); next.push(u); } }
      frontier = next;
    }
    for (const t of [...seen].sort((a, b) => a - b)) {
      if (!T.deep[t]) continue;
      for (let k = 0; k < thick; k++) {
        const z = z0 + k;
        if (z < 1 || z >= this.Z - 2) continue;
        const q = this.site(t, z);
        if (this.place(q)) { const b = this.brick(q, 0, -1); b.c = colony; out.push(b); }
      }
    }
    return out;
  }

  // The Kossel class of a site: how many bonds a brick there would make, as
  // the rate table K[] reads it. Two things differ from the square lattice.
  // (1) A rhomb outline is jagged: consecutive tiles along it often meet
  // only at a corner, so a lip row could never propagate as ledges. Tiles
  // sharing a corner but no edge count as HALF bonds. (2) A tile touching
  // two unsupported lip bricks is common on such an outline, and counting
  // those as ledges lets sheets spread at ledge rates; so with nothing below,
  // only SUPPORTED lateral bricks count — standing on the layer below, or one
  // tile along from one that does (a lip row is one tile of overhang).
  kossel(s, floor = 0) {
    const nb = this.nb[s];
    if (!nb) return 0;
    const n = this.n, t = s % n, z = (s - t) / n, T = this.T, occ = this.occ;
    const below = z > 0 && z - 1 >= floor && occ[s - n] ? 1 : 0;   // beneath the colony's floor: void
    const above = z + 1 < this.Z && occ[s + n] ? 1 : 0;
    const base = z * n, under = (z - 1) * n;
    if (z - 1 < floor && !above && nb === 1 && occ[s - n]) return 1;   // only the void beneath: a lone contact
    let bonds = below + above;
    // edge neighbours (full) — every edge neighbour is also in the vertex list, so
    // walk the vertex list once and weight by whether the pair shares an edge
    for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) {
      const u = T.vnbrList[k];
      if (!occ[base + u]) continue;
      if (!below) {
        const canUnder = z > 0 && z - 1 >= floor;
        let sup = canUnder && occ[under + u];
        for (let j = T.nbrStart[u]; !sup && j < T.nbrStart[u + 1]; j++) { const v = T.nbrList[j]; if (occ[base + v] && canUnder && occ[under + v]) sup = true; }
        if (!sup) continue;
      }
      let edge = false;
      for (let j = T.nbrStart[t]; j < T.nbrStart[t + 1]; j++) if (T.nbrList[j] === u) { edge = true; break; }
      bonds += edge ? 1 : 0.5;
    }
    const c = Math.round(bonds);
    return c < 1 ? 1 : c > 6 ? 6 : c;
  }
  regionNew() { return { fminX: Infinity, fminY: Infinity, fmaxX: -Infinity, fmaxY: -Infinity, minZ: this.Z, maxZ: -1, sx: 0, sy: 0, sz: 0, count: 0 }; }
  regionAdd(r, s) {
    const T = this.T, t = s % this.n, z = (s - t) / this.n, cx = T.cx[t], cy = T.cy[t];
    r.count++; r.sx += cx; r.sy += cy; r.sz += z;
    if (cx < r.fminX) r.fminX = cx; if (cx > r.fmaxX) r.fmaxX = cx; if (cy < r.fminY) r.fminY = cy; if (cy > r.fmaxY) r.fmaxY = cy;
    if (z < r.minZ) r.minZ = z; if (z > r.maxZ) r.maxZ = z;
  }
  pos(s, m) { const t = s % this.n; m.x = this.T.cx[t] / FIX; m.y = this.T.cy[t] / FIX; m.z = (s - t) / this.n; }
  brick(s, tick, mason) {
    const t = s % this.n, z = (s - t) / this.n;
    return { x: this.T.cx[t] / FIX, y: this.T.cy[t] / FIX, z, t: tick, m: mason, tile: t };
  }
  bounds() {
    if (!this.count) return { min: [-1, -1, this.z0], max: [1, 1, this.z0 + 1], count: 0 };
    return { min: [this.fminX / FIX - 0.5, this.fminY / FIX - 0.5, this.minZ], max: [this.fmaxX / FIX + 0.5, this.fmaxY / FIX + 0.5, this.maxZ + 1], count: this.count };
  }

  // The nucleus: a disk of tiles (specimens) or an explicit list of
  // [tile, height] pairs (the playground's painted substrate), from the
  // melt floor z0 upward.
  seed(genome) {
    const bricks = [];
    const ic = this.spec.ic || { disk: 3, thickness: 2 };
    const lay = (t, h) => {
      for (let k = 0; k < h; k++) {
        const z = this.z0 + k;
        if (z < 1 || z >= this.Z - 2 || !this.T.deep[t]) continue;
        const s = this.site(t, z);
        if (this.place(s)) bricks.push(this.brick(s, 0, -1));
      }
    };
    if (ic.cells) {
      for (const [t, h] of ic.cells) if (t >= 0 && t < this.n) lay(t, h);
    } else {
      const r2 = ic.disk * FIX * (ic.disk * FIX);
      for (let t = 0; t < this.n; t++) {
        const cx = this.T.cx[t], cy = this.T.cy[t];
        if (cx * cx + cy * cy <= r2) lay(t, ic.thickness || 2);
      }
    }
    return bricks;
  }

  // Walk candidates: the tile and its corner-neighbours, one layer down, this
  // layer, one layer up — empty, touching the crystal, inside the domain.
  walk(s, out) {
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n;
    let nc = 0;
    for (let dz = -1; dz <= 1; dz++) {
      const zz = z + dz;
      if (zz < 1 || zz >= this.Z - 1) continue;
      const base = zz * n;
      if (dz !== 0) {
        const q = base + t;
        if (!this.occ[q] && this.nb[q] && T.deep[t]) out[nc++] = q;
      }
      for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) {
        const o = T.vnbrList[k], q = base + o;
        if (this.occ[q] || !this.nb[q] || !T.deep[o]) continue;
        out[nc++] = q;
      }
    }
    return nc;
  }

  // ------------------------------------------------------------- rays --
  // Sample along a ray from (cx, cy) in direction d (index into DIRS) at half
  // tile steps; k counts steps. Returns the tile at step k or -1.
  at(cx, cy, dx, dy, k) {
    return this.T.locate(cx + ((dx * k) >> 1), cy + ((dy * k) >> 1));
  }

  // The tiles a ray from tile t's centroid crosses in direction d, as
  // (tile, step) pairs, computed once per tile and direction. -1 closes the
  // list (the ray left the tiling). This is what makes the terrace scan an
  // array walk, as it is on the cubic lattice.
  ray(t, d) {
    let cache = this.rays;
    if (!cache) cache = this.rays = new Array(this.n);
    let R = cache[t];
    if (!R) R = cache[t] = new Array(12);
    let seq = R[d];
    if (seq) return seq;
    const cx = this.T.cx[t], cy = this.T.cy[t], dx = DIRS[d][0], dy = DIRS[d][1];
    const out = [];
    let last = t;
    for (let k = 1; k <= 2 * LOOK; k++) {
      const u = this.at(cx, cy, dx, dy, k);
      if (u === last) continue;
      last = u;
      out.push(u, k);
      if (u < 0) break;
    }
    if (out.length === 0 || out[out.length - 2] >= 0) out.push(-2, 2 * LOOK + 1);   // ran out of LOOK, still on the tiling
    seq = R[d] = Int32Array.from(out);
    return seq;
  }
  nearestDir(dx, dy) {
    let best = 0, bd = -Infinity;
    for (let d = 0; d < 12; d++) { const v = dx * DIRS[d][0] + dy * DIRS[d][1]; if (v > bd) { bd = v; best = d; } }
    return best;
  }

  // The terrace rule for a site on top of a brick (growing +z): fed iff some
  // direction drops away within `rim` tiles, with nothing at that level beyond
  // the drop, and no overhang within `rim` on the opposite side.
  fedTop(t, z, rim, floor = 0) {
    const top = this.top, h = z;
    const kRim = 2 * rim;
    for (let d = 0; d < 12; d++) {
      const seq = this.ray(t, d);
      let drop = 0, ok = true;
      for (let i = 0; i < seq.length; i += 2) {
        const u = seq[i], k = seq[i + 1];
        if (u === -2) break;                        // scanned LOOK tiles without a verdict: treat as clear
        if (u < 0) { if (!drop) drop = k; break; }  // off the tiling: open sky
        let e = top[u];
        if (e < floor) e = -1;                       // beneath the colony's floor: void
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
        if (top[u] >= h && top[u] >= floor) { sheltered = true; break; }
      }
      if (!sheltered) return true;
    }
    return false;
  }

  // The terrace rule for a lateral attachment (site t beside brick o, same
  // layer). On the cubic lattice the scan in the face's vertical plane
  // reduces, for a top lip, to two things: open sky above (already required)
  // and no lower step sheltering the site — no brick within `rim` layers
  // below it, in its own column or outward along the growth direction. A
  // lip may only overhang the melt, never roof over a terrace below it;
  // that is what keeps the outside a staircase.
  fedSide(t, o, z, rim, floor = 0) {
    const T = this.T, n = this.n, occ = this.occ;
    const seq = this.ray(t, this.nearestDir(T.cx[t] - T.cx[o], T.cy[t] - T.cy[o]));
    for (let k = 1; k <= rim; k++) {
      const zz = z - k;
      if (zz < floor) break;
      if (occ[zz * n + t]) return false;
      for (let i = 0; i < seq.length && i < 6; i += 2) {
        const u = seq[i];
        if (u < 0) break;
        if (occ[zz * n + u]) return false;
      }
    }
    return true;
  }

  // Anisotropy for a lateral growth direction: blend the four lateral axis
  // weights by the direction's components.
  lateralWeight(dx, dy, axis) {
    const ax = Math.abs(dx), ay = Math.abs(dy), tot = ax + ay || 1;
    return ((dx > 0 ? axis[0] : axis[1]) * ax + (dy > 0 ? axis[2] : axis[3]) * ay) / tot;
  }

  fedBias(s, nb, axis, rim, B, floor = 0) {
    const T = this.T, n = this.n, t = s % n, z = (s - t) / n, occ = this.occ;
    let bias = 0;
    // +z: a brick below (and not beneath this colony's floor)
    if (z > 0 && z - 1 >= floor && occ[s - n]) {
      let w = axis[4];
      if (w > bias) {
        if (nb === 1) {
          // the patch under a new layer: corner-neighbours of t that hold a brick at z-1,
          // scaled to the cubic rule's 8-neighbourhood
          const vd = T.vnbrStart[t + 1] - T.vnbrStart[t];
          let cnt = 0;
          for (let k = T.vnbrStart[t]; k < T.vnbrStart[t + 1]; k++) if (occ[(z - 1) * n + T.vnbrList[k]]) cnt++;
          const c8 = vd ? Math.floor((cnt * 8) / vd + 0.5) : 0;
          w *= c8 >= B.patchFull ? 1 : c8 >= B.patchMin ? B.patchPart : 0;
        }
        if (w > bias && this.fedTop(t, z, rim, floor)) bias = w;
      }
    }
    // lateral: each edge-neighbour holding a brick at this layer
    const ps = T.polyStart[t], L = T.polyLen[t];
    for (let i = 0; i < L; i++) {
      const o = T.across[ps + i];
      if (o < 0 || !occ[z * n + o]) continue;
      const gx = T.cx[t] - T.cx[o], gy = T.cy[t] - T.cy[o];
      let w = this.lateralWeight(gx, gy, axis);
      if (w <= bias) continue;
      if (nb === 1) {
        if (B.lipRule) {
          if (this.top[t] >= z) continue;
          if (this.top[o] !== z) continue;
        }
        // along the lip: how many of o's other edge-neighbours hold a brick
        // in this layer (a lip brick in a run has two; an isolated spur, none)
        let along = 0;
        for (let k = T.nbrStart[o]; k < T.nbrStart[o + 1]; k++) { const v = T.nbrList[k]; if (v !== t && occ[z * n + v]) along++; }
        w *= along >= 2 ? 1 : along === 1 ? B.lipAlong : 0;
        if (B.lipDepth > 0) {
          const lo = floor > this.minZ ? floor : this.minZ;
          const depth = (z - lo) / Math.max(1, this.maxZ - lo);
          let d = depth;
          for (let k = 1; k < B.lipDepth; k++) d *= depth;
          w *= d;
        }
        if (w <= bias) continue;
      }
      if (this.fedSide(t, o, z, rim, floor)) bias = w;
    }
    return bias;
  }

  // Arrival from the melt: a random point on a box just outside the crystal,
  // a straight line toward (near) the centroid sampled every half tile, land
  // on the last empty site before the first brick.
  arrive(r, B, region) {
    const T = this.T, n = this.n, R = region || this;
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
        const t = T.locate(x, y);
        if (t < 0 || z < 0 || z >= this.Z) { if (entered) break; continue; }
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

  // Measured, not asserted.
  stats(growth) {
    const T = this.T, n = this.n;
    const box = [(this.fmaxX - this.fminX) / FIX + 1, (this.fmaxY - this.fminY) / FIX + 1, this.maxZ - this.minZ + 1];
    let pit = 0, exposed = 0;
    for (let z = this.minZ; z <= this.maxZ; z++) for (let t = 0; t < n; t++) {
      const s = z * n + t;
      if (this.occ[s]) { exposed += (T.polyLen[t] + 2) - this.nb[s]; continue; }
      if (!this.nb[s]) continue;
      if (this.top[t] < z && !(z > 0 && this.top[t] >= 0)) continue;     // nothing below at all
      let below = false;
      for (let k = z - 1; k >= this.minZ; k--) if (this.occ[k * n + t]) { below = true; break; }
      if (!below) continue;
      let fenced = 0;
      for (let d = 0; d < 12; d += 3) {                                   // the four axis rays
        let last = t;
        for (let k = 1; k <= 2 * LOOK; k++) {
          const u = this.at(T.cx[t], T.cy[t], DIRS[d][0], DIRS[d][1], k);
          if (u === last) continue;
          last = u;
          if (u < 0) break;
          if (this.top[u] >= z) { fenced++; break; }
        }
      }
      if (fenced === 4) pit++;
    }
    const heights = new Set();
    let last = -1;
    for (let k = 1; k <= 2 * (T.R | 0); k++) {
      const u = this.at(0, 0, 1024, 0, k);
      if (u < 0) break;
      if (u === last) continue;
      last = u;
      if (this.top[u] >= 0) heights.add(this.top[u]);
    }
    return {
      bricks: this.count,
      box,
      pit,
      hollowness: pit / Math.max(1, this.count),
      exposedFaces: exposed,
      terraces: heights.size,
      ticks: growth.tick,
      masons: growth.masons.length,
      retired: growth.retired,
      laidPerMason: growth.masons.map((m) => m.laid),
      tiling: this.spec.shape,
      tiles: n,
    };
  }
}
