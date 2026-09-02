// bismuth — the growth engine. A cubic lattice, a colony of MASONS, and the
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
//   Anisotropy — a per-seed growth-rate weight for each of the six face
//   normals, which is the difference between a funnel, a tower and a stair.
//
// Everything is integer arithmetic or IEEE basic ops on doubles, no
// transcendental functions in any decision, one PRNG stream drawn in a fixed
// order — so a seed is the same brick sequence in every engine, forever.

import { stream } from "./prng.js";
import { genome as makeGenome, GRID, DEFAULT_BRAIN, DEFAULT_POPULATION } from "./genome.js";

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

export class Lattice {
  constructor() {
    this.occ = new Uint8Array(G * G * G);         // 1 = brick
    this.nb = new Uint8Array(G * G * G);          // occupied face-neighbours, 0..6
    // ext[f]: for face normal f, the crystal's furthest extent along f in each
    // lateral column, as a height h (0 = the near wall of the lattice), -1 = none.
    this.ext = [];
    for (let f = 0; f < 6; f++) this.ext.push(new Int16Array(G * G).fill(-1));
    this.count = 0;
    this.sx = 0; this.sy = 0; this.sz = 0;        // centroid accumulators
    this.min = [G, G, G]; this.max = [-1, -1, -1];
  }
  inBounds(x, y, z) {
    return x >= MARGIN && y >= MARGIN && z >= MARGIN && x < G - MARGIN && y < G - MARGIN && z < G - MARGIN;
  }
  place(x, y, z) {
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
  centroid() {
    const n = this.count || 1;
    return [Math.round(this.sx / n), Math.round(this.sy / n), Math.round(this.sz / n)];
  }

  // The terrace rule. Is the empty site c, attached to a brick on its
  // face-f side (i.e. growing the crystal along normal f), fed by the melt?
  fed(c, f, rim) {
    const n = f >> 1, u = (n + 1) % 3, v = (n + 2) % 3;
    const h = (f & 1) ? G - 1 - c[n] : c[n];    // the site's height along f
    const a = c[u], b = c[v];
    const ext = this.ext[f];
    for (let d = 0; d < 8; d++) {
      const da = LAT[d][0], db = LAT[d][1];
      let drop = 0, ok = true;
      for (let k = 1; k <= LOOK; k++) {
        const aa = a + k * da, bb = b + k * db;
        if (aa < 0 || bb < 0 || aa >= G || bb >= G) { if (!drop) drop = k; break; }   // lattice edge: open sky
        const e = ext[aa * G + bb];
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
        if (ext[aa * G + bb] >= h) { sheltered = true; break; }
      }
      if (!sheltered) return true;
    }
    return false;
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
    this.x = 0; this.y = 0; this.z = 0;
    this.patience = 0;
    this.laid = 0;
    this.walked = 0;
    this.from = null;                              // last position, for the renderer
  }
}

// --------------------------------------------------------------- Growth ----
export class Growth {
  constructor(seedOrGenome) {
    this.genome = typeof seedOrGenome === "object" ? seedOrGenome : makeGenome(seedOrGenome);
    const g = this.genome;
    this.brain = Object.assign({}, DEFAULT_BRAIN, g.brain || {});
    this.pop = Object.assign({}, DEFAULT_POPULATION, g.population || {});
    this.rng = stream(g.seed, "growth");
    this.lat = new Lattice();
    this.K = [0, g.k1, g.k2, g.k3, 1, 1, 1];
    this.axis = g.axis.slice();
    this.rim = g.rim;
    this.masons = [];
    this.nextId = 0;
    this.retired = 0;
    for (let i = 0; i < g.masons; i++) {
      const m = new Mason(this.nextId++);
      m.wait = (i * g.flight) % (g.flight * 3) + 1;  // staggered first arrivals
      this.masons.push(m);
    }
    this.bricks = [];                               // {x,y,z,t,m} in laying order
    this.tick = 0;
    this.done = false;
    this.cooling = false;
    this.stalled = 0;
    this._c = [0, 0, 0];
    this._cand = new Float64Array(26);
    this._candIdx = new Int32Array(26);
    this.seedNuclei();
  }

  seedNuclei() {
    // The nucleus is laid by nobody — it is the grain the melt froze around.
    // An explicit voxel list (the playground's initial condition, offsets from
    // the lattice centre) takes precedence over the seeded nucleus plates.
    if (this.genome.voxels) {
      const c = G >> 1;
      for (const v of this.genome.voxels) {
        const x = c + v[0], y = c + v[1], z = c - 20 + v[2];
        if (this.lat.inBounds(x, y, z) && this.lat.place(x, y, z)) this.bricks.push({ x, y, z, t: 0, m: -1 });
      }
      this.nucleusBricks = this.bricks.length;
      return;
    }
    for (const n of this.genome.nuclei) {
      const x0 = n.x - (n.sx >> 1), y0 = n.y - (n.sy >> 1), z0 = n.z - (n.sz >> 1);
      for (let z = 0; z < n.sz; z++) for (let y = 0; y < n.sy; y++) for (let x = 0; x < n.sx; x++) {
        if (this.lat.place(x0 + x, y0 + y, z0 + z)) this.bricks.push({ x: x0 + x, y: y0 + y, z: z0 + z, t: 0, m: -1 });
      }
    }
    this.nucleusBricks = this.bricks.length;
  }

  // The anisotropy weight of the strongest FED face this empty site would
  // attach to. For a terrace nucleation (nb = 1) two more things must hold,
  // both from the 2D-nucleation picture: a new LAYER needs a real terrace
  // under it (a brick perched on a spike or a one-brick fin touches almost
  // nothing in its plane), and a layer widens OUTWARD only at the crystal's
  // top lip — the edge with the richest supply — never off the side of a
  // lower step. 0 if the site touches nothing or every face it touches is
  // starved.
  fedBias(x, y, z, nb) {
    const lat = this.lat, i = IDX(x, y, z), occ = lat.occ, B = this.brain;
    const c = this._c; c[0] = x; c[1] = y; c[2] = z;
    let bias = 0;
    const topHere = lat.ext[4][x * G + y];          // highest brick in this column
    for (let f = 0; f < 5; f++) {                  // never -z: the melt is above
      let w = this.axis[f];
      if (w <= bias) continue;
      const below = i - STRIDE[f];
      if (!occ[below]) continue;                     // no brick on the far side of this face
      if (nb === 1) {
        if (f < 4) {
          // lateral: the lip rule
          if (B.lipRule) {
            if (topHere >= z) continue;                                   // something above this site
            const bx = x - FACE[f][0], by = y - FACE[f][1];
            if (lat.ext[4][bx * G + by] !== z) continue;                   // the brick is not the top of its column
          }
          const su = STRIDE[f < 2 ? 2 : 0];                                // along the lip
          const along = occ[below + su] + occ[below - su];
          w *= along === 2 ? 1 : along === 1 ? B.lipAlong : 0;
          // and the melt thins with depth: the top lip is at the surface, a
          // skirt at the foot of the crystal is not
          if (B.lipDepth > 0) {
            const depth = (z - lat.min[2]) / Math.max(1, lat.max[2] - lat.min[2]);
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
      if (lat.fed(c, f, this.rim)) bias = w;
    }
    return bias;
  }

  // One tick: every mason acts once, in id order. Returns the bricks laid.
  step() {
    if (this.done) return [];
    const laid = [];
    this.tick++;
    for (const m of this.masons) {
      if (m.state === "melt") {
        if (--m.wait > 0) continue;
        this.arrive(m);
        continue;
      }
      this.act(m, laid);
    }
    if (laid.length) { this.stalled = 0; for (const b of laid) this.bricks.push(b); }
    else if (++this.stalled > (this.cooling ? 1500 : 20000)) this.done = true;  // nowhere left to grow
    const laidTotal = this.bricks.length - this.nucleusBricks;
    if (laid.length) this.population(laidTotal - laid.length, laidTotal);
    if (!this.cooling && laidTotal >= this.genome.budget) {
      // The melt cools: no new layers nucleate, but every ledge already
      // started runs to its end, so the crystal finishes with clean edges
      // rather than mid-brick.
      this.cooling = true;
      this.coolTick = this.tick;
      this.K[1] = 0;
    }
    if (this.cooling && (laidTotal >= this.genome.budget * (1 + this.brain.coolExtra) || this.tick - this.coolTick > 25000)) this.done = true;
    return laid;
  }

  // Population control, applied after a tick that laid bricks. Births come in
  // at the melt and arrive like anyone else; a retiring mason simply does not
  // come back for another brick. With the defaults neither ever happens.
  population(before, after) {
    const P = this.pop, g = this.genome;
    if (P.retireAfter > 0) {
      for (let i = this.masons.length - 1; i >= 0 && this.masons.length > P.min; i--) {
        const m = this.masons[i];
        if (m.laid >= P.retireAfter && m.state === "melt") { this.masons.splice(i, 1); this.retired++; }
      }
    }
    if (P.birthEvery > 0) {
      const births = Math.floor(after / P.birthEvery) - Math.floor(before / P.birthEvery);
      for (let k = 0; k < births && this.masons.length < P.max; k++) {
        const m = new Mason(this.nextId++);
        m.wait = g.flight;
        this.masons.push(m);
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

  // Arrival from the melt: pick a point on a box just outside the crystal and
  // fly a straight lattice ray toward (near) the centroid; land on the last
  // empty cell before the first brick. Rays strike protrusions first — the
  // diffusion-limited supply that feeds corners before faces.
  arrive(m) {
    const lat = this.lat, r = this.rng;
    const c = lat.centroid();
    for (let attempt = 0; attempt < 12; attempt++) {
      const pad = 6 + attempt;
      const lo = [lat.min[0] - pad, lat.min[1] - pad, lat.min[2] - pad];
      const hi = [lat.max[0] + pad, lat.max[1] + pad, lat.max[2] + pad];
      // the melt is above: most arrivals come down onto the crystal
      const u = r(), a = this.brain.arriveFromAbove;
      const face = u < a ? 5 : Math.floor((u - a) * (5 / (1 - a)));   // 5 = the box's top (+z side)
      const p = [
        lo[0] + Math.floor(r() * (hi[0] - lo[0] + 1)),
        lo[1] + Math.floor(r() * (hi[1] - lo[1] + 1)),
        lo[2] + Math.floor(r() * (hi[2] - lo[2] + 1)),
      ];
      p[face >> 1] = (face & 1) ? hi[face >> 1] : lo[face >> 1];
      const j = 2 + Math.floor((lat.max[0] - lat.min[0] + lat.max[1] - lat.min[1] + lat.max[2] - lat.min[2]) / 6);
      const t = [
        c[0] + Math.floor(r() * (2 * j + 1)) - j,
        c[1] + Math.floor(r() * (2 * j + 1)) - j,
        c[2] + Math.floor(r() * (2 * j + 1)) - j,
      ];
      const hit = this.ray(p, t);
      if (hit) {
        m.from = m.state === "surface" ? [m.x, m.y, m.z] : null;
        m.x = hit[0]; m.y = hit[1]; m.z = hit[2];
        m.state = "surface";
        m.patience = this.genome.patience;
        return true;
      }
    }
    m.wait = this.genome.flight;                   // missed; try again later
    return false;
  }

  // Integer lattice ray from p through t, stepping ONE axis per move so the
  // cell before a hit is face-adjacent to it. Exact rational comparison of
  // crossing times — no floats where it matters.
  ray(p, t) {
    const lat = this.lat;
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
      if (lat.occ[IDX(x, y, z)]) {
        if (px < 0 || py < 0 || pz < 0 || px >= G || py >= G || pz >= G) return null;
        return [px, py, pz];
      }
    }
    return null;
  }

  // One surface decision: lay the brick here (Kossel rate, then the terrace
  // rule), else walk to a neighbouring surface cell drawn toward bonds, else —
  // patience spent — desorb back into the melt. Never a forced brick: a mason
  // that finds no good site leaves, which is what keeps the faces flat.
  act(m, laid) {
    const lat = this.lat, g = this.genome, r = this.rng, B = this.brain;
    const here = IDX(m.x, m.y, m.z);
    const nbHere = lat.nb[here];
    if (lat.occ[here] || nbHere === 0) {           // ground moved under us
      m.state = "melt"; m.wait = g.flight; return;
    }
    // The melt is above. A site with any brick over it in its column is in
    // shadow and gets nothing — the underside of a lip never fills, and the
    // crystal has a floor, not a second hopper growing down. Cheap Kossel
    // gate next; the terrace scan only runs when both pass.
    const open = !this.brain.skyRule || lat.ext[4][m.x * G + m.y] < m.z;
    if (open && r() < this.K[nbHere]) {
      const bias = this.fedBias(m.x, m.y, m.z, nbHere);
      if (bias > 0 && (bias >= 1 || r() < bias)) {
        if (!lat.inBounds(m.x, m.y, m.z)) { m.state = "melt"; m.wait = g.flight * 3; return; }
        lat.place(m.x, m.y, m.z);
        laid.push({ x: m.x, y: m.y, z: m.z, t: this.tick, m: m.id });
        m.laid++;
        m.from = [m.x, m.y, m.z];
        m.state = "melt"; m.wait = g.flight;
        return;
      }
    }
    if (--m.patience < 0) { m.state = "melt"; m.wait = g.flight; return; }
    // walk: candidates are empty cells touching the crystal, drawn in
    // proportion to 1 + nb²·mobility (bonds attract), and toward open sky
    const cand = this._cand, candIdx = this._candIdx;
    let nc = 0, total = 0;
    for (let k = 0; k < 26; k++) {
      const o = HOOD[k];
      const x = m.x + o[0], y = m.y + o[1], z = m.z + o[2];
      if (x < 1 || y < 1 || z < 1 || x >= G - 1 || y >= G - 1 || z >= G - 1) continue;
      const q = IDX(x, y, z);
      if (lat.occ[q]) continue;
      const nb = lat.nb[q];
      if (nb === 0) continue;
      let bp = 1;
      for (let e = 0; e < B.bondPull; e++) bp *= nb;
      let w = 1 + bp * g.mobility;
      if (lat.ext[4][x * G + y] < z) w *= B.skyPull;  // open sky pulls: that is where the melt is
      cand[nc] = w; candIdx[nc] = k; nc++;
      total += w;
    }
    if (total <= 0) { m.state = "melt"; m.wait = g.flight; return; }
    let u = r() * total;
    for (let i = 0; i < nc; i++) {
      u -= cand[i];
      if (u < 0) {
        const o = HOOD[candIdx[i]];
        m.x += o[0]; m.y += o[1]; m.z += o[2];
        m.walked++;
        break;
      }
    }
  }

  // ------------------------------------------------------------ readouts --
  // Measured, not asserted: the numbers the page shows come from the lattice.
  stats() {
    const lat = this.lat;
    const box = [lat.max[0] - lat.min[0] + 1, lat.max[1] - lat.min[1] + 1, lat.max[2] - lat.min[2] + 1];
    // pit volume: empty cells fenced laterally on all four sides AND below —
    // the hollow a hopper steps down into.
    let pit = 0, exposed = 0;
    const occ = lat.occ;
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
      ticks: this.tick,
      masons: this.masons.length,
      retired: this.retired,
      laidPerMason: this.masons.map((m) => m.laid),
    };
  }
}

export { IDX, G as GRIDSIZE, FACE };
