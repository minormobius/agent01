// tilings — plane tilings as exact, adjacency-complete cell complexes.
//
// The generators (a square grid, pointy-top hexes, the de Bruijn multigrid
// rhomb tilings — Penrose P3, Ammann–Beenker, a 7-grid — the rhombille
// "tumbling blocks", and the Archimedean snub-square, kagome,
// rhombitrihexagonal and truncated-square tilings) are the ones the foam
// dungeon draws its rooms on, with the same fixed offsets, so a "penrose"
// here is the same Penrose tiling of the plane there. What this module adds
// is the second half every consumer had to re-do:
//
//   · vertices are QUANTISED to a fixed-point lattice (FIX units per unit
//     edge) and welded, so every coordinate is an integer and two tiles that
//     share a corner share the same integer corner — nothing downstream
//     needs a float compare, and a growth engine built on it can stay
//     bit-identical across JS engines;
//   · EDGE adjacency (the tile across each edge) and VERTEX adjacency (every
//     tile touching a corner), as CSR arrays;
//   · per directed edge, the tiles "along" it (the neighbours of a tile that
//     also touch that edge's endpoints) — what a crystal-growth lip rule
//     needs;
//   · exact point location (bucket grid + integer cross products; every tile
//     produced here is convex).
//
// Units: edge length 1 for the rhomb tilings and grid/hex; the Archimedean
// mixed tilings are scaled so their MEAN tile area is 1. `tiling(shape, R)`
// keeps the tiles whose centroid lies within R of the origin.
//
// No dependencies, no build; usable from node and the browser. Served copies
// (e.g. bismuth/js/tilings.js) are kept byte-identical by
// scripts/sync-dataviz.mjs — edit packages/tilings/, never a copy.

export const SHAPES = ["grid", "hex", "penrose", "ammann", "seven", "rhombille", "snub", "kagome", "rhombitri", "truncsq"];
export const FIX = 1024;                           // fixed-point units per unit length
export const TILINGS_VERSION = 1;                  // bump if any tile could move

export const SHAPE_INFO = {
  grid:      { label: "square grid",         family: "periodic",   symmetry: 4,  note: "the cubic case" },
  hex:       { label: "hexagons",            family: "periodic",   symmetry: 6,  note: "pointy-top, edge 1" },
  penrose:   { label: "Penrose P3",          family: "aperiodic",  symmetry: 5,  note: "5-grid dual: thin and fat rhombs" },
  ammann:    { label: "Ammann–Beenker",      family: "aperiodic",  symmetry: 8,  note: "4-grid at 45°: squares and 45° rhombs" },
  seven:     { label: "7-fold quasicrystal", family: "aperiodic",  symmetry: 7,  note: "7-grid dual: three rhomb species" },
  rhombille: { label: "rhombille",           family: "periodic",   symmetry: 6,  note: "tumbling blocks: 60°/120° rhombs" },
  snub:      { label: "snub square",         family: "archimedean", symmetry: 4, note: "3.3.4.3.4: squares and triangles" },
  kagome:    { label: "kagome",              family: "archimedean", symmetry: 6, note: "3.6.3.6: hexagons and triangles" },
  rhombitri: { label: "rhombitrihexagonal",  family: "archimedean", symmetry: 6, note: "3.4.6.4: hexagons, squares, triangles" },
  truncsq:   { label: "truncated square",    family: "archimedean", symmetry: 4, note: "4.8.8: octagons and squares" },
};

// ----------------------------------------------------------- generators --
// Each yields CCW polygons (float, edge length 1 or mean area 1) covering at
// least the square [-R-2, R+2]², as [{ key, verts: [[x,y],…] }]. Keys are
// unique per tile and stable.

function gridPolys(R) {
  const out = [];
  const n = Math.ceil(R) + 2;
  for (let j = -n; j < n; j++) for (let i = -n; i < n; i++)
    out.push({ key: `g${i}.${j}`, verts: [[i, j], [i + 1, j], [i + 1, j + 1], [i, j + 1]] });
  return out;
}

function hexPolys(R) {
  // pointy-top, edge length 1: circumradius 1, width √3, row pitch 1.5
  const out = [], s3 = Math.sqrt(3);
  const rows = Math.ceil(R / 1.5) + 3, cols = Math.ceil(R / s3) + 3;
  for (let r = -rows; r <= rows; r++) for (let q = -cols - Math.ceil(Math.abs(r) / 2); q <= cols + Math.ceil(Math.abs(r) / 2); q++) {
    const cx = s3 * (q + r / 2), cy = 1.5 * r;
    const verts = [];
    for (let k = 0; k < 6; k++) verts.push([cx + Math.cos(Math.PI / 6 + k * Math.PI / 3), cy + Math.sin(Math.PI / 6 + k * Math.PI / 3)]);
    out.push({ key: `h${q}.${r}`, verts });
  }
  return out;
}

// Rhomb tilings from an N-multigrid (de Bruijn dual): N line families with
// fixed generic offsets → one deterministic tiling of the plane per shape.
// The dual sends the intersection at p to a rhomb near (N/2)·p, so
// enumeration runs over the bbox pre-image (× 2/N). Vertices are integer
// combinations of the unit directions — adjacent rhombs share bit-identical
// corners. Every rhomb edge = 1.
function multigridPolys(dirs, G, pre, R) {
  const out = [];
  const N = dirs.length;
  const x0 = -(R + 2) * pre - 2, x1 = (R + 2) * pre + 2;
  const z0 = x0, z1 = x1;
  const rangeOf = (k) => {
    let lo = Infinity, hi = -Infinity;
    for (const [bx, bz] of [[x0, z0], [x0, z1], [x1, z0], [x1, z1]]) {
      const d = bx * dirs[k][0] + bz * dirs[k][1] + G[k];
      lo = Math.min(lo, d); hi = Math.max(hi, d);
    }
    return [Math.floor(lo) - 1, Math.ceil(hi) + 1];
  };
  for (let k = 0; k < N; k++) {
    for (let l = k + 1; l < N; l++) {
      const det = dirs[k][0] * dirs[l][1] - dirs[k][1] * dirs[l][0];
      if (Math.abs(det) < 1e-9) continue;
      const [rk0, rk1] = rangeOf(k), [rl0, rl1] = rangeOf(l);
      for (let r = rk0; r <= rk1; r++) {
        for (let s2 = rl0; s2 <= rl1; s2++) {
          const a = r - G[k], b = s2 - G[l];
          const px = (a * dirs[l][1] - b * dirs[k][1]) / det;
          const pz = (b * dirs[k][0] - a * dirs[l][0]) / det;
          if (px < x0 || px > x1 || pz < z0 || pz > z1) continue;
          const K = [];
          for (let m = 0; m < N; m++) K[m] = Math.ceil(px * dirs[m][0] + pz * dirs[m][1] + G[m] - 1e-9);
          const verts = [];
          for (const [dk, dl] of [[0, 0], [1, 0], [1, 1], [0, 1]]) {
            K[k] = r + dk; K[l] = s2 + dl;
            let vx = 0, vz = 0;
            for (let m = 0; m < N; m++) { vx += K[m] * dirs[m][0]; vz += K[m] * dirs[m][1]; }
            verts.push([vx, vz]);
          }
          const area2 = (verts[1][0] - verts[0][0]) * (verts[2][1] - verts[0][1]) - (verts[1][1] - verts[0][1]) * (verts[2][0] - verts[0][0]);
          if (area2 < 0) verts.reverse();
          out.push({ key: `m${k}.${l}.${r}.${s2}`, verts });
        }
      }
    }
  }
  return out;
}

const MULTIGRID = {
  penrose: { G: [0.1375, 0.2632, -0.1141, 0.0523, -0.3389], dirs: [0, 1, 2, 3, 4].map((k) => [Math.cos(2 * Math.PI * k / 5), Math.sin(2 * Math.PI * k / 5)]), pre: 0.4 },
  ammann:  { G: [0.171, -0.077, 0.313, -0.407], dirs: [0, 1, 2, 3].map((k) => [Math.cos(Math.PI * k / 4), Math.sin(Math.PI * k / 4)]), pre: 0.5 },
  seven:   { G: [0.123, -0.201, 0.077, 0.291, -0.154, 0.033, -0.169], dirs: [0, 1, 2, 3, 4, 5, 6].map((k) => [Math.cos(2 * Math.PI * k / 7), Math.sin(2 * Math.PI * k / 7)]), pre: 2 / 7 },
};

// tumbling blocks: 60°/120° rhombs in three orientations, each the union of
// two triangles of the triangular lattice under a perfect matching by
// (i−j) mod 3 — periodic, exact, and the cubes illusion
function rhombillePolys(R) {
  const out = [], s3 = Math.sqrt(3);
  const P = (i, j) => [i + j / 2, j * s3 / 2];
  const n = Math.ceil(R) + 3;
  for (let j = -n; j <= n; j++) for (let i = -n - Math.ceil(n / 2); i <= n + Math.ceil(n / 2); i++) {
    const c = ((i - j) % 3 + 3) % 3;
    const A = P(i, j), B = P(i + 1, j), C = P(i, j + 1);
    let verts;
    if (c === 0)      verts = [A, B, P(i + 1, j + 1), C];
    else if (c === 1) verts = [P(i + 1, j - 1), B, C, A];
    else              verts = [B, C, P(i - 1, j + 1), A];
    const area2 = (verts[1][0] - verts[0][0]) * (verts[2][1] - verts[0][1]) - (verts[1][1] - verts[0][1]) * (verts[2][0] - verts[0][0]);
    if (area2 < 0) verts.reverse();
    out.push({ key: `r${i}.${j}`, verts });
  }
  return out;
}

// Archimedean MULTI-SHAPE tilings: a fixed unit cell of prototile polygons
// repeated by two translations, scaled so the MEAN tile area is 1.
function archimedeanCell(shape) {
  const s3 = Math.sqrt(3);
  let protos, T1, T2;
  if (shape === "snub") {
    const e = (s3 - 1) / 4, f = (s3 + 1) / 4, a = 2 * f;
    protos = [
      [[-e, -f], [f, -e], [e, f], [-f, e]],
      [[f, -e], [a + e, -f], [a + f, e], [a - e, f]],
      [[a - e, f], [e, f], [f, -e]],
      [[f, -e], [f, -e - 1], [a + e, -f]],
      [[2 * a - e, -f], [a + f, e], [a + e, -f]],
      [[a + f, e + 1], [a - e, f], [a + f, e]],
    ];
    T1 = [a, a]; T2 = [a, -a];
  } else if (shape === "kagome") {
    const hex = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
    protos = [hex, [[1, 0], [1.5, s3 / 2], [0.5, s3 / 2]], [[0.5, -s3 / 2], [1.5, -s3 / 2], [1, 0]]];
    T1 = [2, 0]; T2 = [1, s3];
  } else if (shape === "rhombitri") {
    const a = 1 + s3;
    const hex = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(k * Math.PI / 3), Math.sin(k * Math.PI / 3)]);
    protos = [hex];
    for (const ed of [0, 1, 2]) {
      const p1 = hex[ed], p2 = hex[ed + 1];
      const n = [Math.cos((ed + 0.5) * Math.PI / 3), Math.sin((ed + 0.5) * Math.PI / 3)];
      protos.push([p1, [p1[0] + n[0], p1[1] + n[1]], [p2[0] + n[0], p2[1] + n[1]], p2]);
    }
    for (const vi of [0, 1]) {
      const v = hex[vi];
      const nA = [Math.cos((vi - 0.5) * Math.PI / 3), Math.sin((vi - 0.5) * Math.PI / 3)];
      const nB = [Math.cos((vi + 0.5) * Math.PI / 3), Math.sin((vi + 0.5) * Math.PI / 3)];
      protos.push([v, [v[0] + nA[0], v[1] + nA[1]], [v[0] + nB[0], v[1] + nB[1]]]);
    }
    T1 = [a * s3 / 2, a / 2]; T2 = [0, a];
  } else {
    const a = 1 + Math.SQRT2;
    const Rr = 1 / (2 * Math.sin(Math.PI / 8));
    const oct = [0, 1, 2, 3, 4, 5, 6, 7].map((k) => [Rr * Math.cos((k + 0.5) * Math.PI / 4), Rr * Math.sin((k + 0.5) * Math.PI / 4)]);
    const h = Math.SQRT1_2;
    protos = [oct, [[a / 2 + h, a / 2], [a / 2, a / 2 + h], [a / 2 - h, a / 2], [a / 2, a / 2 - h]]];
    T1 = [a, 0]; T2 = [0, a];
  }
  for (const P of protos) {
    let s = 0;
    for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; }
    if (s < 0) P.reverse();
  }
  return { protos, T1, T2 };
}

function periodicPolys(shape, R) {
  const out = [];
  const { protos, T1, T2 } = archimedeanCell(shape);
  const det = T1[0] * T2[1] - T1[1] * T2[0];
  const su = Math.sqrt(protos.length / Math.abs(det));   // mean tile area = 1
  const lim = R + 2;
  let m0 = Infinity, m1 = -Infinity, n0 = Infinity, n1 = -Infinity;
  for (const [bx, bz] of [[-lim, -lim], [-lim, lim], [lim, -lim], [lim, lim]]) {
    const x = bx / su, z = bz / su;
    const m = (x * T2[1] - z * T2[0]) / det, n = (T1[0] * z - T1[1] * x) / det;
    m0 = Math.min(m0, m); m1 = Math.max(m1, m); n0 = Math.min(n0, n); n1 = Math.max(n1, n);
  }
  m0 = Math.floor(m0) - 2; m1 = Math.ceil(m1) + 2; n0 = Math.floor(n0) - 2; n1 = Math.ceil(n1) + 2;
  for (let m = m0; m <= m1; m++) for (let n = n0; n <= n1; n++) {
    const ox = m * T1[0] + n * T2[0], oz = m * T1[1] + n * T2[1];
    for (let p = 0; p < protos.length; p++) {
      out.push({ key: `a${p}.${m}.${n}`, verts: protos[p].map(([x, z]) => [(x + ox) * su, (z + oz) * su]) });
    }
  }
  return out;
}

function polysFor(shape, R) {
  if (shape === "grid") return gridPolys(R);
  if (shape === "hex") return hexPolys(R);
  if (MULTIGRID[shape]) { const m = MULTIGRID[shape]; return multigridPolys(m.dirs, m.G, m.pre, R); }
  if (shape === "rhombille") return rhombillePolys(R);
  if (shape === "snub" || shape === "kagome" || shape === "rhombitri" || shape === "truncsq") return periodicPolys(shape, R);
  throw new Error("unknown tiling shape: " + shape);
}

// ------------------------------------------------------------- Tiling ----
export class Tiling {
  constructor(shape, R) {
    if (!SHAPES.includes(shape)) throw new Error("unknown tiling shape: " + shape);
    this.shape = shape;
    this.R = R;
    const polys = polysFor(shape, R).filter((p) => {
      let cx = 0, cy = 0;
      for (const v of p.verts) { cx += v[0]; cy += v[1]; }
      cx /= p.verts.length; cy /= p.verts.length;
      return cx * cx + cy * cy <= R * R;
    });
    polys.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));   // stable, engine-independent order

    // --- quantise + weld vertices ---
    const vx = [], vy = [];
    const buckets = new Map();
    const TOL = 3;                                                         // fixed units; real corners agree far tighter
    const vid = (x, y) => {
      const qx = Math.round(x * FIX), qy = Math.round(y * FIX);
      const bx = Math.floor(qx / 8), by = Math.floor(qy / 8);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const list = buckets.get((bx + dx) + "," + (by + dy));
        if (!list) continue;
        for (const id of list) if (Math.abs(vx[id] - qx) <= TOL && Math.abs(vy[id] - qy) <= TOL) return id;
      }
      const id = vx.length;
      vx.push(qx); vy.push(qy);
      const k = bx + "," + by;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(id);
      return id;
    };
    const polyStart = [], polyLen = [], polyVerts = [];
    const keys = [];
    for (const p of polys) {
      const ids = p.verts.map(([x, y]) => vid(x, y));
      // drop degenerate repeats (welding can merge two corners of a tiny sliver)
      const clean = ids.filter((id, i) => id !== ids[(i + 1) % ids.length]);
      if (clean.length < 3) continue;
      polyStart.push(polyVerts.length); polyLen.push(clean.length);
      for (const id of clean) polyVerts.push(id);
      keys.push(p.key);
    }
    const n = this.n = polyStart.length;
    this.keys = keys;
    this.vx = Int32Array.from(vx); this.vy = Int32Array.from(vy);
    this.polyStart = Int32Array.from(polyStart); this.polyLen = Int32Array.from(polyLen); this.polyVerts = Int32Array.from(polyVerts);

    // --- centroids (fixed, exact integer mean rounded), areas (unit²) ---
    this.cx = new Int32Array(n); this.cy = new Int32Array(n); this.area = new Float64Array(n);
    for (let t = 0; t < n; t++) {
      let sx = 0, sy = 0, a2 = 0;
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) {
        const p = polyVerts[s + i], q = polyVerts[s + (i + 1) % L];
        sx += vx[p]; sy += vy[p];
        a2 += vx[p] * vy[q] - vx[q] * vy[p];
      }
      this.cx[t] = Math.round(sx / L); this.cy[t] = Math.round(sy / L);
      this.area[t] = a2 / 2 / (FIX * FIX);
    }

    // --- edge adjacency: the tile across each directed edge ---
    const edgeMap = new Map();
    this.across = new Int32Array(polyVerts.length).fill(-1);               // per directed edge slot
    for (let t = 0; t < n; t++) {
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) {
        const a = polyVerts[s + i], b = polyVerts[s + (i + 1) % L];
        const k = a < b ? a + ":" + b : b + ":" + a;
        const prev = edgeMap.get(k);
        if (prev === undefined) edgeMap.set(k, s + i);
        else { this.across[prev] = t; this.across[s + i] = Math.floor(prevTile(prev)); }
      }
    }
    function prevTile(slot) {
      // binary search the tile owning a polyVerts slot
      let lo = 0, hi = n - 1;
      while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (polyStart[mid] <= slot) lo = mid; else hi = mid - 1; }
      return lo;
    }
    // edge neighbours as CSR (unique, in edge order)
    const nbrStart = new Int32Array(n + 1), nbrList = [];
    for (let t = 0; t < n; t++) {
      nbrStart[t] = nbrList.length;
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) { const o = this.across[s + i]; if (o >= 0) nbrList.push(o); }
    }
    nbrStart[n] = nbrList.length;
    this.nbrStart = nbrStart; this.nbrList = Int32Array.from(nbrList);
    this.interior = new Uint8Array(n);
    for (let t = 0; t < n; t++) this.interior[t] = (nbrStart[t + 1] - nbrStart[t] === polyLen[t]) ? 1 : 0;

    // --- vertex adjacency: every tile sharing a corner (excluding self) ---
    const atVertex = new Map();
    for (let t = 0; t < n; t++) {
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) { const v = polyVerts[s + i]; if (!atVertex.has(v)) atVertex.set(v, []); atVertex.get(v).push(t); }
    }
    this.atVertex = atVertex;
    const vStart = new Int32Array(n + 1), vList = [];
    for (let t = 0; t < n; t++) {
      vStart[t] = vList.length;
      const seen = new Set();
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) for (const o of atVertex.get(polyVerts[s + i])) if (o !== t && !seen.has(o)) { seen.add(o); vList.push(o); }
    }
    vStart[n] = vList.length;
    this.vnbrStart = vStart; this.vnbrList = Int32Array.from(vList);
    // a tile is "deep" if every vertex neighbour is interior: the walkable domain
    this.deep = new Uint8Array(n);
    for (let t = 0; t < n; t++) {
      let ok = this.interior[t];
      for (let k = vStart[t]; ok && k < vStart[t + 1]; k++) if (!this.interior[vList[k]]) ok = 0;
      this.deep[t] = ok;
    }

    // --- "along" a directed edge: neighbours of t touching either endpoint, not the tile across ---
    this.alongStart = new Int32Array(polyVerts.length + 1); const along = [];
    for (let t = 0; t < n; t++) {
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) {
        this.alongStart[s + i] = along.length;
        const a = polyVerts[s + i], b = polyVerts[s + (i + 1) % L], acr = this.across[s + i];
        const seen = new Set();
        for (const v of [a, b]) for (const o of atVertex.get(v)) {
          if (o === t || o === acr || seen.has(o)) continue;
          // must be an EDGE neighbour of t (shares an edge), not just a corner
          let edgeNb = false;
          for (let k = nbrStart[t]; k < nbrStart[t + 1]; k++) if (nbrList[k] === o) { edgeNb = true; break; }
          if (edgeNb) { seen.add(o); along.push(o); }
        }
      }
    }
    this.alongStart[polyVerts.length] = along.length;
    this.alongList = Int32Array.from(along);

    // --- bounds + point-location buckets ---
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (let i = 0; i < vx.length; i++) { if (vx[i] < minX) minX = vx[i]; if (vx[i] > maxX) maxX = vx[i]; if (vy[i] < minY) minY = vy[i]; if (vy[i] > maxY) maxY = vy[i]; }
    this.minX = minX; this.minY = minY; this.maxX = maxX; this.maxY = maxY;
    this.cell = 2 * FIX;
    this.bw = Math.floor((maxX - minX) / this.cell) + 1; this.bh = Math.floor((maxY - minY) / this.cell) + 1;
    const bucket = new Array(this.bw * this.bh);
    for (let t = 0; t < n; t++) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      const s = polyStart[t], L = polyLen[t];
      for (let i = 0; i < L; i++) { const v = polyVerts[s + i]; if (vx[v] < x0) x0 = vx[v]; if (vx[v] > x1) x1 = vx[v]; if (vy[v] < y0) y0 = vy[v]; if (vy[v] > y1) y1 = vy[v]; }
      const bx0 = Math.floor((x0 - minX) / this.cell), bx1 = Math.floor((x1 - minX) / this.cell);
      const by0 = Math.floor((y0 - minY) / this.cell), by1 = Math.floor((y1 - minY) / this.cell);
      for (let by = by0; by <= by1; by++) for (let bx = bx0; bx <= bx1; bx++) {
        const k = by * this.bw + bx;
        (bucket[k] || (bucket[k] = [])).push(t);
      }
    }
    this.bucket = bucket;
  }

  degree(t) { return this.nbrStart[t + 1] - this.nbrStart[t]; }
  vertexDegree(t) { return this.vnbrStart[t + 1] - this.vnbrStart[t]; }

  // Exact point location in fixed-point coordinates. Returns the tile whose
  // closed polygon contains (x, y), the first in stable order on a tie, or -1.
  locate(x, y) {
    if (x < this.minX || y < this.minY || x > this.maxX || y > this.maxY) return -1;
    const list = this.bucket[Math.floor((y - this.minY) / this.cell) * this.bw + Math.floor((x - this.minX) / this.cell)];
    if (!list) return -1;
    const vx = this.vx, vy = this.vy, pv = this.polyVerts;
    for (const t of list) {
      const s = this.polyStart[t], L = this.polyLen[t];
      let inside = true;
      for (let i = 0; i < L && inside; i++) {
        const a = pv[s + i], b = pv[s + (i + 1) % L];
        // CCW polygon: inside iff every edge has the point on its left (or on it)
        const cross = (vx[b] - vx[a]) * (y - vy[a]) - (vy[b] - vy[a]) * (x - vx[a]);
        if (cross < 0) inside = false;
      }
      if (inside) return t;
    }
    return -1;
  }

  // The polygon of tile t as [[x, y], …] in unit lengths (floats, for drawing).
  polygon(t) {
    const out = [], s = this.polyStart[t], L = this.polyLen[t];
    for (let i = 0; i < L; i++) { const v = this.polyVerts[s + i]; out.push([this.vx[v] / FIX, this.vy[v] / FIX]); }
    return out;
  }

  // A short deterministic fingerprint: tile count, vertex count, coordinate sums.
  signature() {
    let h = 2166136261;
    const mix = (v) => { h = Math.imul(h ^ (v & 0xffff), 16777619); h = Math.imul(h ^ ((v >> 16) & 0xffff), 16777619); };
    for (let i = 0; i < this.vx.length; i++) { mix(this.vx[i]); mix(this.vy[i]); }
    for (let i = 0; i < this.polyVerts.length; i++) mix(this.polyVerts[i]);
    for (let i = 0; i < this.across.length; i++) mix(this.across[i]);
    return `${this.shape}:${this.n}:${this.vx.length}:${h >>> 0}`;
  }
}

export function tiling(shape, R) { return new Tiling(shape, R); }
