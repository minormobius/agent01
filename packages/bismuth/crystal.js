// bismuth — the growth engine. A SUBSTRATE, a colony of MASONS, and the
// crystal they lay brick by brick.
//
// This is a kinetic simulation of hopper-crystal growth, not a drawing of one.
// Three ideas from real crystal growth, each stated as a LOCAL rule a mason
// can evaluate from where it stands:
//
//   Kossel–Stranski kinetics — how many faces a brick would touch sets the
//   rate: a lone terrace site (1 bond) needs a rare 2D nucleation, a ledge
//   site (2 bonds) fills at the unit rate, a kink (3+) fills at once. This is
//   why the walls come out flat and the corners square.
//
//   The Berg effect — supersaturation is highest at a crystal's corners and
//   edges and lowest over the middle of a face, so a face grows as a RIM and
//   its centre starves. Here it is the terrace rule (`fed`): a site is fed
//   only if the crystal's outline drops away within `rim` cells in some
//   lateral direction, with nothing at that level beyond the drop and no
//   overhang sheltering it from above. The inner edge of a rim looks across
//   the pit at the far wall and is not fed; the outer edge looks at nothing
//   and is. So every layer is a ring one step further out than the last — the
//   hopper steps down into its own pit and flares outward at 45°.
//
//   Anisotropy — a per-seed growth-rate weight for each face normal, which
//   is the difference between a funnel, a tower and a stair.
//
// The SUBSTRATE is the geometry: which sites exist, which touch, what a
// straight line through the plane means. The masons never see it directly —
// they ask it for neighbours, for bonds, and for the terrace verdict. Two
// substrates: `Lattice`, the cubic lattice the seeded specimens grow on (the
// fast path, kept bit-identical — the selftest pins golden brick hashes), and
// `Prism` (prism.js), any plane tiling from packages/tilings stacked into
// layers — a Penrose substrate grows a decagonal quasicrystal — and `Stack`
// (stack.js), the same tilings with each layer staggered or twisted against
// the last: the close-packed lattices, and moiré stacks — and `Ico`
// (ico.js), the icosahedral quasicrystal: space tiled by golden rhombohedra.
//
// Everything is integer arithmetic or IEEE basic ops on doubles, no
// transcendental functions in any decision, one PRNG stream drawn in a fixed
// order — so a seed is the same brick sequence in every engine, forever.

import { stream } from "./prng.js";
import { genome as makeGenome, GRID, DEFAULT_BRAIN, DEFAULT_POPULATION } from "./genome.js";
import { Prism } from "./prism.js";
import { Stack, isStacked } from "./stack.js";
import { Ico } from "./ico.js";
import { Poly } from "./poly.js";

const G = GRID;
const IDX = (x, y, z) => (z * G + y) * G + x;
const FACE = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]];
const STRIDE = [1, -1, G, -G, G * G, -G * G];
// 26-neighbourhood offsets, for surface diffusion.
const HOOD = [];
for (let dz = -1; dz <= 1; dz++) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++)
  if (dx || dy || dz) HOOD.push([dx, dy, dz]);
// the 8 lateral directions in a face's plane
const LAT = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
const MARGIN = 3;                                 // bricks never touch the lattice wall
const LOOK = 40;                                  // how far "beyond the drop" is scanned

// ---------------------------------------------------------------- Lattice ----
// The cubic substrate. Sites are (x, y, z) on a GRID³ lattice; a site index is
// IDX(x, y, z). Six face neighbours, the 26-cell walk, and six EXTENT MAPS
// (the crystal's furthest brick along each face normal, per lateral column)
// that the terrace rule reads.
export class Lattice {
  constructor() {
    this.kind = "cubic";
    this.sites = G * G * G;
    this.occ = new Uint8Array(G * G * G);         // 1 = brick
    this.nb = new Uint8Array(G * G * G);          // occupied face-neighbours, 0..6
    this.ext = [];
    for (let f = 0; f < 6; f++) this.ext.push(new Int16Array(G * G).fill(-1));
    this.count = 0;
    this.sx = 0; this.sy = 0; this.sz = 0;        // centroid accumulators
    this.min = [G, G, G]; this.max = [-1, -1, -1];
    this.moteOffset = [0.5, 0.5, 0.5];            // a mote sits at the centre of its cell
  }
  inBoundsXYZ(x, y, z) {
    return x >= MARGIN && y >= MARGIN && z >= MARGIN && x < G - MARGIN && y < G - MARGIN && z < G - MARGIN;
  }
  inBounds(s) { return this.inBoundsXYZ(s % G, ((s - s % G) / G) % G, (s / (G * G)) | 0); }
  placeXYZ(x, y, z) {
    const i = IDX(x, y, z);
    if (this.occ[i]) return false;
    this.occ[i] = 1;
    for (let f = 0; f < 6; f++) this.nb[i + STRIDE[f]]++;
    const c = [x, y, z];
    for (let f = 0; f < 6; f++) {
      const n = f >> 1, u = (n + 1) % 3, v = (n + 2) % 3;
      const h = (f & 1) ? G - 1 - c[n] : c[n];
      const k = c[u] * G + c[v];
      if (h > this.ext[f][k]) this.ext[f][k] = h;
    }
    this.count++;
    this.sx += x; this.sy += y; this.sz += z;
    if (x < this.min[0]) this.min[0] = x; if (y < this.min[1]) this.min[1] = y; if (z < this.min[2]) this.min[2] = z;
    if (x > this.max[0]) this.max[0] = x; if (y > this.max[1]) this.max[1] = y; if (z > this.max[2]) this.max[2] = z;
    return true;
  }
  place(s) { return this.placeXYZ(s % G, ((s - s % G) / G) % G, (s / (G * G)) | 0); }
  centroid() {
    const n = this.count || 1;
    return [Math.round(this.sx / n), Math.round(this.sy / n), Math.round(this.sz / n)];
  }
  bounds() { return { min: this.min, max: [this.max[0] + 1, this.max[1] + 1, this.max[2] + 1], count: this.count }; }
  open(s) { const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0; return this.ext[4][x * G + y] < z; }
  // Bonds as the rate table reads them. Below a colony's FLOOR the world is
  // void to it: a pack reseeded on a plane counts nothing beneath that plane.
  zOf(s) { return (s / (G * G)) | 0; }
  kossel(s, floor) {
    const nb = this.nb[s];
    if (!floor) return nb;                        // colony 0: the bond count is the class
    const z = (s / (G * G)) | 0;
    return z - 1 < floor && this.occ[s - G * G] ? nb - 1 : nb;
  }
  // per-colony arrival regions: where its own bricks are
  regionNew() { return { min: [G, G, G], max: [-1, -1, -1], sx: 0, sy: 0, sz: 0, count: 0 }; }
  regionAdd(r, s) {
    const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0;
    r.count++; r.sx += x; r.sy += y; r.sz += z;
    if (x < r.min[0]) r.min[0] = x; if (y < r.min[1]) r.min[1] = y; if (z < r.min[2]) r.min[2] = z;
    if (x > r.max[0]) r.max[0] = x; if (y > r.max[1]) r.max[1] = y; if (z > r.max[2]) r.max[2] = z;
  }
  pos(s, m) { m.x = s % G; m.y = ((s - m.x) / G) % G; m.z = (s / (G * G)) | 0; }
  brick(s, tick, mason) { const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0; return { x, y, z, t: tick, m: mason }; }

  // The nucleus is laid by nobody — it is the grain the melt froze around.
  // An explicit voxel list (the playground's initial condition, offsets from
  // the lattice centre) takes precedence over the seeded nucleus plates.
  seed(genome) {
    const bricks = [];
    if (genome.voxels) {
      const c = G >> 1;
      for (const v of genome.voxels) {
        const x = c + v[0], y = c + v[1], z = c - 20 + v[2];
        if (this.inBoundsXYZ(x, y, z) && this.placeXYZ(x, y, z)) bricks.push({ x, y, z, t: 0, m: -1 });
      }
      return bricks;
    }
    for (const n of genome.nuclei) {
      const x0 = n.x - (n.sx >> 1), y0 = n.y - (n.sy >> 1), z0 = n.z - (n.sz >> 1);
      for (let z = 0; z < n.sz; z++) for (let y = 0; y < n.sy; y++) for (let x = 0; x < n.sx; x++) {
        if (this.placeXYZ(x0 + x, y0 + y, z0 + z)) bricks.push({ x: x0 + x, y: y0 + y, z: z0 + z, t: 0, m: -1 });
      }
    }
    return bricks;
  }

  // Take a brick away (destructible terrain). Bonds and the six extent maps
  // are kept exact: each affected column is rescanned along its normal.
  remove(s) {
    if (!this.occ[s]) return false;
    const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0;
    this.occ[s] = 0;
    for (let f = 0; f < 6; f++) this.nb[s + STRIDE[f]]--;
    const c = [x, y, z];
    for (let f = 0; f < 6; f++) {
      const n = f >> 1, u = (n + 1) % 3, v = (n + 2) % 3;
      const key = c[u] * G + c[v];
      let best = -1;
      const q = [x, y, z];
      for (let h = G - 1; h >= 0; h--) {
        q[n] = (f & 1) ? G - 1 - h : h;
        if (this.occ[IDX(q[0], q[1], q[2])]) { best = h; break; }
      }
      this.ext[f][key] = best;
    }
    this.count--;
    this.sx -= x; this.sy -= y; this.sz -= z;
    return true;
  }
  // the site directly above the highest brick (the first such column in scan order)
  summit() {
    let best = -1, bx = 0, by = 0;
    const e = this.ext[4];
    for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) { const h = e[x * G + y]; if (h > best) { best = h; bx = x; by = y; } }
    return best < 0 ? -1 : IDX(bx, by, best + 1);
  }
  siteAt(at) {
    if (typeof at === "number") return at;
    const x = Math.round(at.x), y = Math.round(at.y), z = Math.round(at.z);
    return x >= 0 && y >= 0 && z >= 0 && x < G && y < G && z < G ? IDX(x, y, z) : -1;
  }
  siteAtWorld(x, y, z) { return this.siteAt({ x: Math.floor(x), y: Math.floor(y), z: Math.floor(z) }); }
  describe(s) { return { x: s % G, y: ((s - s % G) / G) % G, z: (s / (G * G)) | 0 }; }
  // a size×size plate, `thick` layers, centred on the site — the nucleus a deployed pack grows from
  plate(s, size, thick, colony) {
    const c = this.describe(s), half = size >> 1, out = [];
    for (let k = 0; k < thick; k++) for (let dy = -half; dy < size - half; dy++) for (let dx = -half; dx < size - half; dx++) {
      const x = c.x + dx, y = c.y + dy, z = c.z + k;
      if (this.inBoundsXYZ(x, y, z) && this.placeXYZ(x, y, z)) out.push({ x, y, z, t: 0, m: -1, c: colony });
    }
    return out;
  }

  // The terrace rule. Is the empty site c, attached to a brick on its
  // face-f side (i.e. growing the crystal along normal f), fed by the melt?
  fed(c, f, rim, floor = 0) {
    const n = f >> 1, u = (n + 1) % 3, v = (n + 2) % 3;
    const h = (f & 1) ? G - 1 - c[n] : c[n];    // the site's height along f
    const a = c[u], b = c[v];
    const ext = this.ext[f];
    // which lateral coordinate is z, for the floor: +z faces read column tops
    const zIsA = n === 1, zIsB = n === 0;
    for (let d = 0; d < 8; d++) {
      const da = LAT[d][0], db = LAT[d][1];
      let drop = 0, ok = true;
      for (let k = 1; k <= LOOK; k++) {
        const aa = a + k * da, bb = b + k * db;
        if (aa < 0 || bb < 0 || aa >= G || bb >= G) { if (!drop) drop = k; break; }   // lattice edge: open sky
        let e = ext[aa * G + bb];
        if (floor && (n === 2 ? e < floor : (zIsA ? aa : bb) < floor)) e = -1;      // below the floor: void
        if (!drop) {
          if (e >= h) { ok = false; break; }          // a wall between here and the outside
          if (e < h - 1) { drop = k; if (k > rim) { ok = false; break; } }
        } else if (e >= h - 1) { ok = false; break; } // something at floor level beyond the drop: a pit, not the outside
      }
      if (!ok || !drop) continue;
      // shelter: an overhang within rim cells on the opposite side means the
      // melt cannot reach down here
      let sheltered = false;
      for (let k = 1; k <= rim; k++) {
        const aa = a - k * da, bb = b - k * db;
        if (aa < 0 || bb < 0 || aa >= G || bb >= G) break;
        let e = ext[aa * G + bb];
        if (floor && (n === 2 ? e < floor : (zIsA ? aa : bb) < floor)) e = -1;
        if (e >= h) { sheltered = true; break; }
      }
      if (!sheltered) return true;
    }
    return false;
  }

  // The anisotropy weight of the strongest FED face this empty site would
  // attach to. For a terrace nucleation (nb = 1) two more things must hold,
  // both from the 2D-nucleation picture: a new LAYER needs a real terrace
  // under it (a brick perched on a spike or a one-brick fin touches almost
  // nothing in its plane), and a layer widens OUTWARD only at the crystal's
  // top lip — the edge with the richest supply — never off the side of a
  // lower step. 0 if the site touches nothing or every face it touches is
  // starved.
  fedBias(s, nb, axis, rim, B, floor = 0) {
    const x = s % G, y = ((s - x) / G) % G, z = (s / (G * G)) | 0;
    const i = s, occ = this.occ;
    const c = this._c || (this._c = [0, 0, 0]); c[0] = x; c[1] = y; c[2] = z;
    let bias = 0;
    const topHere = this.ext[4][x * G + y];          // highest brick in this column
    for (let f = 0; f < 5; f++) {                  // never -z: the melt is above
      let w = axis[f];
      if (w <= bias) continue;
      const below = i - STRIDE[f];
      if (!occ[below]) continue;                     // no brick on the far side of this face
      if (f === 4 && z - 1 < floor) continue;        // the brick below is under this colony's floor: void
      if (nb === 1) {
        if (f < 4) {
          // lateral: the lip rule
          if (B.lipRule) {
            if (topHere >= z) continue;                                   // something above this site
            const bx = x - FACE[f][0], by = y - FACE[f][1];
            if (this.ext[4][bx * G + by] !== z) continue;                  // the brick is not the top of its column
          }
          const su = STRIDE[f < 2 ? 2 : 0];                                // along the lip
          const along = occ[below + su] + occ[below - su];
          w *= along === 2 ? 1 : along === 1 ? B.lipAlong : 0;
          // and the melt thins with depth: the top lip is at the surface, a
          // skirt at the foot of the crystal is not
          if (B.lipDepth > 0) {
            const lo = floor > this.min[2] ? floor : this.min[2];
            const depth = (z - lo) / Math.max(1, this.max[2] - lo);
            let d = depth;
            for (let k = 1; k < B.lipDepth; k++) d *= depth;
            w *= d;
          }
        } else {
          const su = STRIDE[0], sv = STRIDE[2];
          const c8 = occ[below + su] + occ[below - su] + occ[below + sv] + occ[below - sv]
                   + occ[below + su + sv] + occ[below + su - sv] + occ[below - su + sv] + occ[below - su - sv];
          w *= c8 >= B.patchFull ? 1 : c8 >= B.patchMin ? B.patchPart : 0;
        }
        if (w <= bias) continue;
      }
      if (this.fed(c, f, rim, floor)) bias = w;
    }
    return bias;
  }

  // Walk candidates from site s: the 26 neighbours that are empty and touch
  // the crystal, in a fixed order. Returns the count written into `out`.
  walk(s, out) {
    const x0 = s % G, y0 = ((s - x0) / G) % G, z0 = (s / (G * G)) | 0;
    let nc = 0;
    for (let k = 0; k < 26; k++) {
      const o = HOOD[k];
      const x = x0 + o[0], y = y0 + o[1], z = z0 + o[2];
      if (x < 1 || y < 1 || z < 1 || x >= G - 1 || y >= G - 1 || z >= G - 1) continue;
      const q = IDX(x, y, z);
      if (this.occ[q]) continue;
      if (this.nb[q] === 0) continue;
      out[nc++] = q;
    }
    return nc;
  }

  // Arrival from the melt: pick a point on a box just outside the crystal and
  // fly a straight lattice ray toward (near) the centroid; land on the last
  // empty cell before the first brick. Rays strike protrusions first — the
  // diffusion-limited supply that feeds corners before faces. Returns a site
  // or -1.
  arrive(r, B, region) {
    // colony 0 aims at the whole crystal; a deployed pack at its own bricks
    const R = region || this;
    const cnt = R.count || 1;
    const c = region ? [Math.round(R.sx / cnt), Math.round(R.sy / cnt), Math.round(R.sz / cnt)] : this.centroid();
    for (let attempt = 0; attempt < 12; attempt++) {
      const pad = 6 + attempt;
      const lo = [R.min[0] - pad, R.min[1] - pad, R.min[2] - pad];
      const hi = [R.max[0] + pad, R.max[1] + pad, R.max[2] + pad];
      // the melt is above: most arrivals come down onto the crystal
      const u = r(), a = B.arriveFromAbove;
      const face = u < a ? 5 : Math.floor((u - a) * (5 / (1 - a)));   // 5 = the box's top (+z side)
      const p = [
        lo[0] + Math.floor(r() * (hi[0] - lo[0] + 1)),
        lo[1] + Math.floor(r() * (hi[1] - lo[1] + 1)),
        lo[2] + Math.floor(r() * (hi[2] - lo[2] + 1)),
      ];
      p[face >> 1] = (face & 1) ? hi[face >> 1] : lo[face >> 1];
      const j = 2 + Math.floor((R.max[0] - R.min[0] + R.max[1] - R.min[1] + R.max[2] - R.min[2]) / 6);
      const t = [
        c[0] + Math.floor(r() * (2 * j + 1)) - j,
        c[1] + Math.floor(r() * (2 * j + 1)) - j,
        c[2] + Math.floor(r() * (2 * j + 1)) - j,
      ];
      const hit = this.ray(p, t);
      if (hit) return IDX(hit[0], hit[1], hit[2]);
    }
    return -1;
  }

  // Integer lattice ray from p through t, stepping ONE axis per move so the
  // cell before a hit is face-adjacent to it. Exact rational comparison of
  // crossing times — no floats where it matters.
  ray(p, t) {
    let x = p[0], y = p[1], z = p[2];
    const dx = t[0] - x, dy = t[1] - y, dz = t[2] - z;
    const ax = Math.abs(dx), ay = Math.abs(dy), az = Math.abs(dz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    if (ax + ay + az === 0) return null;
    let nx = 0, ny = 0, nz = 0;
    let px, py, pz;
    const limit = 3 * G;
    for (let k = 0; k < limit; k++) {
      let a;
      if (ax && ay && az) {
        const cx = (2 * nx + 1) * ay * az, cy = (2 * ny + 1) * ax * az, cz = (2 * nz + 1) * ax * ay;
        a = cx <= cy ? (cx <= cz ? 0 : 2) : (cy <= cz ? 1 : 2);
      } else {
        const rx = ax ? (2 * nx + 1) / ax : Infinity;
        const ry = ay ? (2 * ny + 1) / ay : Infinity;
        const rz = az ? (2 * nz + 1) / az : Infinity;
        a = rx <= ry ? (rx <= rz ? 0 : 2) : (ry <= rz ? 1 : 2);
      }
      px = x; py = y; pz = z;
      if (a === 0) { x += sx; nx++; } else if (a === 1) { y += sy; ny++; } else { z += sz; nz++; }
      if (x < 0 || y < 0 || z < 0 || x >= G || y >= G || z >= G) return null;
      if (this.occ[IDX(x, y, z)]) {
        if (px < 0 || py < 0 || pz < 0 || px >= G || py >= G || pz >= G) return null;
        return [px, py, pz];
      }
    }
    return null;
  }

  // Measured, not asserted: the numbers the page shows come from the lattice.
  stats(growth) {
    const box = [this.max[0] - this.min[0] + 1, this.max[1] - this.min[1] + 1, this.max[2] - this.min[2] + 1];
    // pit volume: empty cells fenced laterally on all four sides AND below —
    // the hollow a hopper steps down into.
    let pit = 0, exposed = 0;
    const occ = this.occ, lat = this;
    for (let z = lat.min[2]; z <= lat.max[2]; z++) for (let y = lat.min[1]; y <= lat.max[1]; y++) {
      for (let x = lat.min[0]; x <= lat.max[0]; x++) {
        const i = IDX(x, y, z);
        if (occ[i]) { exposed += 6 - lat.nb[i]; continue; }
        if (lat.nb[i] === 0) continue;
        let fenced = 0;
        for (let k = x + 1; k <= lat.max[0]; k++) if (occ[IDX(k, y, z)]) { fenced++; break; }
        for (let k = x - 1; k >= lat.min[0]; k--) if (occ[IDX(k, y, z)]) { fenced++; break; }
        for (let k = y + 1; k <= lat.max[1]; k++) if (occ[IDX(x, k, z)]) { fenced++; break; }
        for (let k = y - 1; k >= lat.min[1]; k--) if (occ[IDX(x, k, z)]) { fenced++; break; }
        for (let k = z - 1; k >= lat.min[2]; k--) if (occ[IDX(x, y, k)]) { fenced++; break; }
        if (fenced === 5) pit++;
      }
    }
    // terraces: distinct top heights along the crystal's midline in x
    const heights = new Set();
    const ym = Math.round(lat.sy / (lat.count || 1));
    for (let x = lat.min[0]; x <= lat.max[0]; x++) {
      for (let z = lat.max[2]; z >= lat.min[2]; z--) if (occ[IDX(x, ym, z)]) { heights.add(z); break; }
    }
    return {
      bricks: lat.count,
      box,
      pit,
      hollowness: pit / Math.max(1, lat.count),
      exposedFaces: exposed,
      terraces: heights.size,
      ticks: growth.tick,
      masons: growth.masons.length,
      retired: growth.retired,
      laidPerMason: growth.masons.map((m) => m.laid),
    };
  }
}

// ---------------------------------------------------------------- Mason ----
// An agent. It exists in two states: in the MELT (between bricks, counting
// down a flight time) and on the SURFACE (walking with a brick, deciding where
// to lay it). It never sees the whole crystal — only the cells around it and
// the outline in its own plane — which is the point: nobody plans the stair.
export class Mason {
  constructor(id) {
    this.id = id;
    this.state = "melt";
    this.wait = 0;
    this.site = -1;
    this.x = 0; this.y = 0; this.z = 0;             // world position, for the renderer
    this.patience = 0;
    this.laid = 0;
    this.walked = 0;
    this.from = null;                              // last position, for the renderer
  }
}

// --------------------------------------------------------------- Colony ----
// One deployed pack: its own genome (laws, kinetics, budget), its own masons,
// its own PRNG stream, its own cool-down. Colony 0 is the crystal a seed
// grows; every later colony was DEPLOYED onto the structure at some tick
// (`Growth.deploy`), which is the reseed-from-this-plane primitive.
export class Colony {
  constructor(growth, genome, idx, rng) {
    this.idx = idx;
    this.genome = genome;
    this.brain = Object.assign({}, DEFAULT_BRAIN, genome.brain || {});
    this.pop = Object.assign({}, DEFAULT_POPULATION, genome.population || {});
    this.rng = rng;
    this.K = [0, genome.k1, genome.k2, genome.k3, 1, 1, 1, 1, 1, 1, 1];
    this.axis = genome.axis.slice();
    this.rim = genome.rim;
    this.masons = [];
    this.retired = 0;
    this.laid = 0;
    this.cooling = false;
    this.coolTick = 0;
    this.done = false;
    this.frozen = false;
    this.stalled = 0;
    this.floor = 0;                                 // below this height the world is void to this colony
    this.region = null;                             // arrival region: null = the whole crystal (colony 0)
    for (let i = 0; i < genome.masons; i++) {
      const m = new Mason(growth.nextId++);
      m.colony = idx;
      m.wait = (i * genome.flight) % (genome.flight * 3) + 1;  // staggered first arrivals
      this.masons.push(m);
    }
  }
}

// --------------------------------------------------------------- Growth ----
export class Growth {
  constructor(seedOrGenome) {
    this.genome = typeof seedOrGenome === "object" ? seedOrGenome : makeGenome(seedOrGenome);
    const g = this.genome;
    const sp = g.substrate;
    // a tiling stacked straight is a prism; staggered or twisted, a stack; the square grid unstacked is the cubic fast path
    // several grains make a polycrystal; a tiling stacked straight is a prism; staggered or twisted, a stack; the square grid unstacked is the cubic fast path
    this.sub = sp && sp.grains && (Array.isArray(sp.grains) ? sp.grains.length : sp.grains) > 1 ? new Poly(sp, g.seed) : sp && sp.shape === "ico" ? new Ico(sp) : sp && sp.shape && isStacked(sp) ? new Stack(sp) : sp && sp.shape && sp.shape !== "grid" ? new Prism(sp) : new Lattice();
    this.lat = this.sub;                            // the cubic name, kept for callers
    this.nextId = 0;
    this.colonies = [];
    this.events = [];                               // deployments and removals, with ticks: a level is seed + events
    this.removed = [];                              // sites taken away, for the renderer to drain
    this.bricks = [];                               // {x,y,z,t,m,c} in laying order
    this.tick = 0;
    this._cand = new Int32Array(512);               // a Penrose vertex can touch ten tiles; 26 on the cubic lattice
    this._wts = new Float64Array(512);
    this.colonies.push(new Colony(this, g, 0, stream(g.seed, "growth")));
    this.seedNuclei();
  }

  // colony 0's laws, as the page and the playground edit them live
  get brain() { return this.colonies[0].brain; }   set brain(v) { this.colonies[0].brain = v; }
  get pop() { return this.colonies[0].pop; }       set pop(v) { this.colonies[0].pop = v; }
  get K() { return this.colonies[0].K; }           set K(v) { this.colonies[0].K = v; }
  get axis() { return this.colonies[0].axis; }     set axis(v) { this.colonies[0].axis = v; }
  get rim() { return this.colonies[0].rim; }       set rim(v) { this.colonies[0].rim = v; }
  get rng() { return this.colonies[0].rng; }
  get cooling() { return this.colonies[0].cooling; } set cooling(v) { this.colonies[0].cooling = v; }
  get stalled() { return this.colonies[0].stalled; } set stalled(v) { this.colonies[0].stalled = v; }
  get masons() { return this.colonies.length === 1 ? this.colonies[0].masons : this.colonies.flatMap((c) => (c.done ? [] : c.masons)); }
  get retired() { let n = 0; for (const c of this.colonies) n += c.retired; return n; }
  get done() { for (const c of this.colonies) if (!c.done) return false; return true; }
  set done(v) { for (const c of this.colonies) c.done = v; }
  get laidTotal() { let n = 0; for (const c of this.colonies) n += c.laid; return n; }

  seedNuclei() {
    this.bricks = this.sub.seed(this.genome);
    for (const b of this.bricks) b.c = 0;
    this.nucleusBricks = this.bricks.length;
  }

  // Reseed from this plane: lay a small plate at `at` (a site, {x,y,z}, or
  // null for the summit — the site above the highest brick) and start a new
  // colony on it with `pack` merged over the base genome (masons, budget,
  // rates, rim, axis, brain, population — anything). The new colony draws
  // from its own stream, keyed by its index and the tick it was deployed, so
  // a level is reproducible from its seed and its event log. Returns the
  // colony index, or -1 if nothing could be laid there.
  deploy(pack = {}, at = null, opts = {}) {
    const freeze = opts.freeze !== false;
    const base = this.genome;
    const gen = Object.assign({}, base, pack);
    gen.brain = Object.assign({}, base.brain || {}, pack.brain || {});
    gen.population = Object.assign({}, base.population || {}, pack.population || {});
    gen.axis = (pack.axis || base.axis).slice();
    delete gen.voxels; delete gen.nuclei;
    const idx = this.colonies.length;
    const site = at === null || at === undefined ? this.sub.summit() : this.sub.siteAt(at);
    if (site < 0) return -1;
    const plate = this.sub.plate(site, pack.size || 3, pack.thick || 1, idx);
    if (!plate.length) return -1;
    for (const b of plate) { b.t = this.tick; this.bricks.push(b); }
    this.nucleusBricks += plate.length;
    if (freeze) this.freeze();
    const col = new Colony(this, gen, idx, stream(gen.seed, "growth:" + idx + ":" + this.tick));
    // the plane is this colony's floor: everything beneath it is terrain, not crystal
    const where = this.sub.describe(site);
    // the plane is the plate's own level: a substrate without layers says where its plate's bottom is
    col.floor = pack.floor !== undefined ? pack.floor : this.sub.floorOf ? this.sub.floorOf(plate) : where.z;
    col.region = this.sub.regionNew();
    for (const b of plate) this.sub.regionAdd(col.region, this.sub.siteAt(b));
    this.colonies.push(col);
    this.events.push({ kind: "deploy", tick: this.tick, at: where, pack, colony: idx, freeze });
    return idx;
  }

  // Stop every colony that is still growing: what has grown is terrain now.
  // Their masons leave; the bricks stay.
  freeze() {
    for (const col of this.colonies) {
      if (!col.done) col.frozen = true;
      col.done = true;
      col.masons.length = 0;
    }
  }

  // Destructible terrain: take a brick away. Masons standing on it desorb on
  // their next move (the ground moved under them).
  remove(at) {
    const s = typeof at === "number" ? at : this.sub.siteAt(at);
    if (s < 0 || !this.sub.remove(s)) return false;
    this.removed.push(s);
    this.events.push({ kind: "remove", tick: this.tick, at: this.sub.describe(s) });
    return true;
  }

  // One tick: every colony, every mason, in order. Returns the bricks laid.
  step() {
    if (this.done) return [];
    const laid = [];
    this.tick++;
    for (const col of this.colonies) {
      if (col.done) continue;
      const before = laid.length;
      for (const m of col.masons) {
        if (m.state === "melt") {
          if (--m.wait > 0) continue;
          this.arrive(m, col);
          continue;
        }
        this.act(m, col, laid);
      }
      const n = laid.length - before;
      if (n) { col.stalled = 0; for (let i = before; i < laid.length; i++) this.bricks.push(laid[i]); }
      else if (++col.stalled > (col.cooling ? 1500 : 20000)) col.done = true;  // nowhere left to grow
      const was = col.laid;
      col.laid += n;
      if (n) this.population(col, was, col.laid);
      if (!col.cooling && col.laid >= col.genome.budget) {
        // The melt cools: no new layers nucleate, but every ledge already
        // started runs to its end, so the crystal finishes with clean edges
        // rather than mid-brick.
        col.cooling = true;
        col.coolTick = this.tick;
        col.K[1] = 0;
      }
      if (col.cooling && (col.laid >= col.genome.budget * (1 + col.brain.coolExtra) || this.tick - col.coolTick > 25000)) col.done = true;
    }
    return laid;
  }

  // Population control, applied after a tick that laid bricks. Births come in
  // at the melt and arrive like anyone else; a retiring mason simply does not
  // come back for another brick. With the defaults neither ever happens.
  population(col, before, after) {
    const P = col.pop, g = col.genome;
    if (P.retireAfter > 0) {
      for (let i = col.masons.length - 1; i >= 0 && col.masons.length > P.min; i--) {
        const m = col.masons[i];
        if (m.laid >= P.retireAfter && m.state === "melt") { col.masons.splice(i, 1); col.retired++; }
      }
    }
    if (P.birthEvery > 0) {
      const births = Math.floor(after / P.birthEvery) - Math.floor(before / P.birthEvery);
      for (let k = 0; k < births && col.masons.length < P.max; k++) {
        const m = new Mason(this.nextId++);
        m.colony = col.idx;
        m.wait = g.flight;
        col.masons.push(m);
      }
    }
  }

  // Run to completion (or n more bricks). Used by the API, the selftest, and
  // the page's "skip to end".
  run(n = Infinity) {
    const target = this.bricks.length + n;
    while (!this.done && this.bricks.length < target) this.step();
    return this;
  }

  arrive(m, col) {
    const s = this.sub.arrive(col.rng, col.brain, col.region);
    if (s >= 0) {
      m.from = m.state === "surface" ? [m.x, m.y, m.z] : null;
      m.site = s;
      this.sub.pos(s, m);
      m.state = "surface";
      m.patience = col.genome.patience;
      return true;
    }
    m.wait = col.genome.flight;                    // missed; try again later
    return false;
  }

  // One surface decision: lay the brick here (Kossel rate, then the terrace
  // rule), else walk to a neighbouring surface cell drawn toward bonds, else —
  // patience spent — desorb back into the melt. Never a forced brick: a mason
  // that finds no good site leaves, which is what keeps the faces flat.
  act(m, col, laid) {
    const sub = this.sub, g = col.genome, r = col.rng, B = col.brain;
    const here = m.site;
    const nbHere = sub.kossel(here, col.floor);
    if (sub.occ[here] || nbHere === 0) {           // ground moved under us
      m.state = "melt"; m.wait = g.flight; return;
    }
    // a pack builds on its plane and above it, never beneath: below the floor
    // the melt is gone, and a mason that wandered down there goes back up
    if (col.floor && sub.zOf(here) < col.floor) { m.state = "melt"; m.wait = g.flight; return; }
    // The melt is above. A site with any brick over it in its column is in
    // shadow and gets nothing — the underside of a lip never fills, and the
    // crystal has a floor, not a second hopper growing down. Cheap Kossel
    // gate next; the terrace scan only runs when both pass.
    const open = !B.skyRule || sub.open(here);
    if (open && r() < col.K[nbHere]) {
      const bias = sub.fedBias(here, nbHere, col.axis, col.rim, B, col.floor);
      if (bias > 0 && (bias >= 1 || r() < bias)) {
        if (!sub.inBounds(here)) { m.state = "melt"; m.wait = g.flight * 3; return; }
        sub.place(here);
        if (col.region) sub.regionAdd(col.region, here);
        const b = sub.brick(here, this.tick, m.id);
        b.c = col.idx;
        laid.push(b);
        m.laid++;
        m.from = [m.x, m.y, m.z];
        m.state = "melt"; m.wait = g.flight;
        return;
      }
    }
    if (--m.patience < 0) { m.state = "melt"; m.wait = g.flight; return; }
    // walk: candidates are empty cells touching the crystal, drawn in
    // proportion to 1 + nb^bondPull·mobility (bonds attract), and toward open sky
    const cand = this._cand, wts = this._wts;
    const nc = sub.walk(here, cand);
    let total = 0;
    for (let i = 0; i < nc; i++) {
      const q = cand[i], nb = sub.nb[q];
      let bp = 1;
      for (let e = 0; e < B.bondPull; e++) bp *= nb;
      let w = 1 + bp * g.mobility;
      if (sub.open(q)) w *= B.skyPull;             // open sky pulls: that is where the melt is
      wts[i] = w;
      total += w;
    }
    if (total <= 0) { m.state = "melt"; m.wait = g.flight; return; }
    let u = r() * total;
    for (let i = 0; i < nc; i++) {
      u -= wts[i];
      if (u < 0) {
        m.site = cand[i];
        sub.pos(cand[i], m);
        m.walked++;
        break;
      }
    }
  }

  // ------------------------------------------------------------ readouts --
  stats() {
    const st = this.sub.stats(this);
    st.colonies = this.colonies.length;
    st.frozen = this.colonies.filter((c) => c.frozen).length;
    // a colony that ended without cooling laid less than its budget: nowhere left to grow
    st.stalled = this.colonies.some((c) => c.done && !c.cooling && !c.frozen && c.laid < c.genome.budget);
    st.events = this.events.length;
    return st;
  }
}

export { IDX, G as GRIDSIZE, FACE };
