// bismuth — the Ico substrate: the icosahedral quasicrystal. Space tiled by
// the two GOLDEN RHOMBOHEDRA (Ammann–Kramer), the three-dimensional Penrose
// tiling: no lattice, no period in any direction, five-fold axes, and the
// solid that Al–Pd–Mn and Ho–Mg–Zn grains actually take. A brick is a
// rhombohedron; its six faces are its bonds, so the Kossel classes run 1–6
// exactly as they do on the cubic lattice, but no two neighbourhoods are
// alike and the terraces that emerge are decagons and pentagons.
//
// Generation is the dual of a 6-GRID, the way the Penrose tiling here is the
// dual of a 5-grid: six families of parallel planes, one normal to each
// vector of the icosahedral star (a five-fold axis and the five vertices
// around it), with generic offsets so no four planes meet. Every triple of
// families meets in points; each point is a rhombohedron spanned by that
// triple's three vectors, positioned at Σ K_m e_m where K_m is the index of
// family m at the point. Vertices are therefore INTEGER 6-tuples: two tiles
// that share a face share four identical keys, adjacency is exact, nothing
// is welded, and the tiling is the same in every engine (the only arithmetic
// is IEEE multiply-add, ceil and sqrt).
//
// What the masons ask is answered in three dimensions without a layer
// index. Bonds: the six face-neighbours (a face with a downward normal is
// "the brick below", with a sideways normal "beside"). Open sky: the tiles
// the vertical line through a tile's centroid passes through above it are
// computed once (`above[]`); a site is open while none is occupied. The
// terrace verdict: a HEIGHT FIELD over the plane (half an edge a cell, the
// highest occupied top over each cell, rescanned exactly on removal from a
// per-cell column list) read along twelve world-space rays, as the stack
// does it. Arrival rays land by 3D point location in a bucket grid.

export const ICO_R_MIN = 8, ICO_R_MAX = 24, ICO_R_DEFAULT = 14;
export const TALL = 1.25;                          // the cylinder stands 2·TALL·R high: a hopper here is as tall as it is wide
const HALF = 0.5;                                  // height-field cell and ray step, in edge lengths
const LOOK = 32;
const DIRS = [[1, 0], [0.8660254037844386, 0.5], [0.5, 0.8660254037844386], [0, 1], [-0.5, 0.8660254037844386], [-0.8660254037844386, 0.5], [-1, 0], [-0.8660254037844386, -0.5], [-0.5, -0.8660254037844386], [0, -1], [0.5, -0.8660254037844386], [0.8660254037844386, -0.5]];
const NONE = -1e9;
// Along any face normal the tiling is a Fibonacci ladder (rungs 0.526 and
// 0.851 apart) and every tile's top and bottom sit on rungs exactly, so an
// extent map along that normal reads like the cubic one: the terrace is the
// site's own bottom plane, a wall anything above it, a drop anything below.
// Tilted tiles straddle a rung plane, so a wall (a brick at the site's level
// or higher) is read from CENTROIDS along d and the terrace and its drops
// from TOPS, which sit on the rungs exactly.
const RUNG = 0.1;                                  // tolerance on a rung
const LEVEL = 0.2;                                 // a centroid this far past the site's bottom plane is at its level: a wall
const UNDER = 0.4;                                 // |normal z| above this: a face looks up or down (the two-fold axes meet z at cos 1, 0.809, 0.5, 0.309, 0)
const STEEP = 0.6;                                 // a direction this far up takes the patch rule; this far down is never grown

// The icosahedral star: six of the icosahedron's twelve vertices, one from
// each antipodal pair, in the frame where the TWO-FOLD axes are x, y, z. The
// melt is above along z, a two-fold axis, because the tiling's flat planes
// are the two-fold planes — the faces of the rhombic triacontahedron, the
// habit icosahedral grains actually show — and the terrace rule wants a
// terrace it can read as flat. Radicals only; no trig is called.
const PHI = (1 + Math.sqrt(5)) / 2, NRM = 1 / Math.sqrt(1 + PHI * PHI);
export const STAR = [
  [0, NRM, PHI * NRM],
  [0, -NRM, PHI * NRM],
  [NRM, PHI * NRM, 0],
  [-NRM, PHI * NRM, 0],
  [PHI * NRM, 0, NRM],
  [PHI * NRM, 0, -NRM],
];
const GAMMA = [0.1358, 0.2871, 0.4132, 0.6217, 0.7593, 0.9082];   // the grid offsets: generic, fixed forever
const KEYB = 128, KEYO = 64;                       // a 6-tuple of indices in [−64, 63] packs into one exact double

function pack6(K) { let k = 0; for (let m = 0; m < 6; m++) k = k * KEYB + (K[m] + KEYO); return k; }

// --------------------------------------------------------------- the tiling --
export class IcoTiling {
  constructor(R) {
    this.R = R;
    const E = STAR;
    const verts = new Map();                       // key → vertex id
    const vx = [], vy = [], vz = [], vkey = [];
    const vid = (K) => {
      const k = pack6(K);
      let id = verts.get(k);
      if (id === undefined) {
        id = vx.length;
        let x = 0, y = 0, z = 0;
        for (let m = 0; m < 6; m++) { x += K[m] * E[m][0]; y += K[m] * E[m][1]; z += K[m] * E[m][2]; }
        vx.push(x); vy.push(y); vz.push(z); vkey.push(k);
        verts.set(k, id);
      }
      return id;
    };
    // every triple of families, every triple of plane indices: the dual sends
    // a point p to roughly 2p, so the cylinder of radius R is the image of a
    // cylinder of radius R/2 + margin
    const tiles = [];                              // { i, j, k, base: K[6], verts: [8], cx, cy, cz }
    const lim = R / 2 + 2.5, limZ = TALL * R / 2 + 2.5;
    const K = new Array(6);
    for (let i = 0; i < 6; i++) for (let j = i + 1; j < 6; j++) for (let k = j + 1; k < 6; k++) {
      const a = E[i], b = E[j], c = E[k];
      const det = a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]);
      const lo = Math.ceil(-lim * 1.01 - 1), hi = Math.floor(lim * 1.01 + 1);
      for (let ki = lo; ki <= hi; ki++) for (let kj = lo; kj <= hi; kj++) for (let kk = lo; kk <= hi; kk++) {
        const da = ki + GAMMA[i], db = kj + GAMMA[j], dc = kk + GAMMA[k];
        // Cramer: p solves a·p = da, b·p = db, c·p = dc
        const px = (da * (b[1] * c[2] - b[2] * c[1]) - a[1] * (db * c[2] - b[2] * dc) + a[2] * (db * c[1] - b[1] * dc)) / det;
        const py = (a[0] * (db * c[2] - b[2] * dc) - da * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * dc - db * c[0])) / det;
        const pz = (a[0] * (b[1] * dc - db * c[1]) - a[1] * (b[0] * dc - db * c[0]) + da * (b[0] * c[1] - b[1] * c[0])) / det;
        if (px * px + py * py > lim * lim || Math.abs(pz) > limZ) continue;
        for (let m = 0; m < 6; m++) K[m] = m === i ? ki : m === j ? kj : m === k ? kk : Math.ceil(px * E[m][0] + py * E[m][1] + pz * E[m][2] - GAMMA[m]);
        let cx = 0, cy = 0, cz = 0;
        for (let m = 0; m < 6; m++) { cx += K[m] * E[m][0]; cy += K[m] * E[m][1]; cz += K[m] * E[m][2]; }
        cx += (a[0] + b[0] + c[0]) / 2; cy += (a[1] + b[1] + c[1]) / 2; cz += (a[2] + b[2] + c[2]) / 2;
        if (cx * cx + cy * cy > R * R || Math.abs(cz) > TALL * R) continue;
        tiles.push({ i, j, k, base: K.slice(), cx, cy, cz: cz + TALL * R });   // z shifted so the cylinder stands on z = 0
      }
    }
    // a stable, spatially coherent order: by coarse cell, then by key
    for (const t of tiles) { t.cell = (Math.floor(t.cz / 4) * 64 + Math.floor((t.cy + R) / 4)) * 64 + Math.floor((t.cx + R) / 4); t.key = pack6(t.base) * 32 + t.i * 25 + t.j * 5 + t.k; }
    tiles.sort((p, q) => p.cell - q.cell || p.key - q.key);
    const n = this.n = tiles.length;
    // vertices: 8 per tile, keyed exactly; z shifted like the centroids
    this.tv = new Int32Array(n * 8);
    const corner = (base, i, j, k, ei, ej, ek) => { const Kc = base.slice(); Kc[i] += ei; Kc[j] += ej; Kc[k] += ek; return vid(Kc); };
    for (let t = 0; t < n; t++) {
      const T = tiles[t];
      let q = 0;
      for (let ek = 0; ek < 2; ek++) for (let ej = 0; ej < 2; ej++) for (let ei = 0; ei < 2; ei++) this.tv[t * 8 + q++] = corner(T.base, T.i, T.j, T.k, ei, ej, ek);
    }
    this.vx = Float64Array.from(vx); this.vy = Float64Array.from(vy); this.vz = Float64Array.from(vz.map((z) => z + TALL * R));
    this.cx = new Float64Array(n); this.cy = new Float64Array(n); this.cz = new Float64Array(n);
    this.zTop = new Float64Array(n); this.zBot = new Float64Array(n);
    this.edges = new Int8Array(n * 3);
    for (let t = 0; t < n; t++) {
      const T = tiles[t];
      this.cx[t] = T.cx; this.cy[t] = T.cy; this.cz[t] = T.cz;
      this.edges[t * 3] = T.i; this.edges[t * 3 + 1] = T.j; this.edges[t * 3 + 2] = T.k;
      let lo = Infinity, hi = -Infinity;
      for (let q = 0; q < 8; q++) { const z = this.vz[this.tv[t * 8 + q]]; if (z < lo) lo = z; if (z > hi) hi = z; }
      this.zTop[t] = hi; this.zBot[t] = lo;
    }
    // faces: 6 per tile — [axisIndex 0..2 of the edge NOT in the face, offset 0|1];
    // corner index bits: ei = bit0, ej = bit1, ek = bit2
    const FACE_CORNERS = [
      [0, 2, 6, 4], [1, 3, 7, 5],                   // faces normal-ish to edge i (ei = 0 / 1): corners with that bit fixed
      [0, 1, 5, 4], [2, 3, 7, 6],                   // edge j
      [0, 1, 3, 2], [4, 5, 7, 6],                   // edge k
    ];
    this.fv = new Int32Array(n * 24);                // 4 vertex ids per face, ordered so the face is CCW from outside
    this.fn = new Float64Array(n * 18);              // outward unit normal per face
    this.across = new Int32Array(n * 6).fill(-1);
    const faceMap = new Map();
    for (let t = 0; t < n; t++) {
      const T = tiles[t], ed = [E[T.i], E[T.j], E[T.k]];
      for (let f = 0; f < 6; f++) {
        const axis = f >> 1, off = f & 1;
        const u = ed[(axis + 1) % 3], w = ed[(axis + 2) % 3], along = ed[axis];
        // outward normal: perpendicular to the face, pointing away from the tile
        let nx = u[1] * w[2] - u[2] * w[1], ny = u[2] * w[0] - u[0] * w[2], nz = u[0] * w[1] - u[1] * w[0];
        const dot = nx * along[0] + ny * along[1] + nz * along[2];
        const sgn = (off === 1) === (dot > 0) ? 1 : -1;
        const len = Math.sqrt(nx * nx + ny * ny + nz * nz);
        nx = sgn * nx / len; ny = sgn * ny / len; nz = sgn * nz / len;
        this.fn[t * 18 + f * 3] = nx; this.fn[t * 18 + f * 3 + 1] = ny; this.fn[t * 18 + f * 3 + 2] = nz;
        const corners = FACE_CORNERS[f];
        const ids = corners.map((c) => this.tv[t * 8 + c]);
        // wind CCW as seen from outside: (v1−v0)×(v2−v0) along the outward normal
        const ax = this.vx[ids[1]] - this.vx[ids[0]], ay = this.vy[ids[1]] - this.vy[ids[0]], az = this.vz[ids[1]] - this.vz[ids[0]];
        const bx = this.vx[ids[2]] - this.vx[ids[0]], by = this.vy[ids[2]] - this.vy[ids[0]], bz = this.vz[ids[2]] - this.vz[ids[0]];
        const cxn = ay * bz - az * by, cyn = az * bx - ax * bz, czn = ax * by - ay * bx;
        if (cxn * nx + cyn * ny + czn * nz < 0) ids.reverse();
        for (let q = 0; q < 4; q++) this.fv[t * 24 + f * 4 + q] = ids[q];
        const sorted = ids.slice().sort((p, q) => p - q);
        const key = sorted[0] + ":" + sorted[1] + ":" + sorted[2] + ":" + sorted[3];
        const prev = faceMap.get(key);
        if (prev === undefined) faceMap.set(key, t * 6 + f);
        else { this.across[prev] = t; this.across[t * 6 + f] = (prev - prev % 6) / 6; }
      }
    }
    // vertex adjacency: every tile at each vertex, as CSR (`vtStart`, `vtList`)
    const nv = this.vx.length, vtCount = new Int32Array(nv + 1);
    for (let i = 0; i < n * 8; i++) vtCount[this.tv[i] + 1]++;
    for (let v = 0; v < nv; v++) vtCount[v + 1] += vtCount[v];
    const vtList = new Int32Array(n * 8), vtFill = vtCount.slice(0, nv);
    for (let t = 0; t < n; t++) for (let q = 0; q < 8; q++) { const v = this.tv[t * 8 + q]; vtList[vtFill[v]++] = t; }
    this.vtStart = vtCount; this.vtList = vtList;
    const vStart = new Int32Array(n + 1), vList = [];
    const seen = new Int32Array(n).fill(-1);
    for (let t = 0; t < n; t++) {
      vStart[t] = vList.length;
      for (let q = 0; q < 8; q++) { const v = this.tv[t * 8 + q]; for (let k = vtCount[v]; k < vtCount[v + 1]; k++) { const o = vtList[k]; if (o !== t && seen[o] !== t) { seen[o] = t; vList.push(o); } } }
    }
    vStart[n] = vList.length;
    this.vnbrStart = vStart; this.vnbrList = Int32Array.from(vList);
    // interior: all six faces have a neighbour; deep: every vertex-neighbour is interior
    this.interior = new Uint8Array(n); this.deep = new Uint8Array(n);
    for (let t = 0; t < n; t++) { let ok = 1; for (let f = 0; f < 6; f++) if (this.across[t * 6 + f] < 0) ok = 0; this.interior[t] = ok; }
    for (let t = 0; t < n; t++) { let ok = this.interior[t]; for (let k = vStart[t]; ok && k < vStart[t + 1]; k++) if (!this.interior[vList[k]]) ok = 0; this.deep[t] = ok; }
    // plane equations for point location: (p − v0)·n ≤ 0 on all six faces
    this.fd = new Float64Array(n * 6);
    for (let t = 0; t < n; t++) for (let f = 0; f < 6; f++) {
      const v = this.fv[t * 24 + f * 4];
      this.fd[t * 6 + f] = this.fn[t * 18 + f * 3] * this.vx[v] + this.fn[t * 18 + f * 3 + 1] * this.vy[v] + this.fn[t * 18 + f * 3 + 2] * this.vz[v];
    }
    // 3D buckets (edge-length cells) over the cylinder for point location
    this.b0 = [-R - 1, -R - 1, -1]; this.bw = Math.ceil(2 * R + 2) + 1; this.bh = Math.ceil(2 * TALL * R + 2) + 1;
    this.bucket = new Array(this.bw * this.bw * this.bh);
    for (let t = 0; t < n; t++) {
      let x0 = Infinity, y0 = Infinity, z0 = Infinity, x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
      for (let q = 0; q < 8; q++) { const v = this.tv[t * 8 + q]; if (this.vx[v] < x0) x0 = this.vx[v]; if (this.vx[v] > x1) x1 = this.vx[v]; if (this.vy[v] < y0) y0 = this.vy[v]; if (this.vy[v] > y1) y1 = this.vy[v]; if (this.vz[v] < z0) z0 = this.vz[v]; if (this.vz[v] > z1) z1 = this.vz[v]; }
      for (let bz = Math.floor(z0 - this.b0[2]); bz <= Math.floor(z1 - this.b0[2]); bz++) for (let by = Math.floor(y0 - this.b0[1]); by <= Math.floor(y1 - this.b0[1]); by++) for (let bx = Math.floor(x0 - this.b0[0]); bx <= Math.floor(x1 - this.b0[0]); bx++) {
        if (bx < 0 || by < 0 || bz < 0 || bx >= this.bw || by >= this.bw || bz >= this.bh) continue;
        const key = (bz * this.bw + by) * this.bw + bx;
        (this.bucket[key] || (this.bucket[key] = [])).push(t);
      }
    }
    // the footprint of each tile on the plane (the hull of its projected
    // corners), the height-field cells under it, and the columns
    this.hx0 = -R - 1; this.hside = Math.floor((2 * R + 2) / HALF) + 1;
    this.footprint = new Array(n);
    const cellsOf = new Array(n);
    const colCell = new Array(this.hside * this.hside);
    for (let t = 0; t < n; t++) {
      const pts = [];
      for (let q = 0; q < 8; q++) { const v = this.tv[t * 8 + q]; pts.push([this.vx[v], this.vy[v]]); }
      const hull = this.footprint[t] = convexHull(pts);
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const p of hull) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
      const cells = [];
      const gx0 = Math.max(0, Math.floor((x0 - this.hx0) / HALF)), gx1 = Math.min(this.hside - 1, Math.floor((x1 - this.hx0) / HALF));
      const gy0 = Math.max(0, Math.floor((y0 - this.hx0) / HALF)), gy1 = Math.min(this.hside - 1, Math.floor((y1 - this.hx0) / HALF));
      for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) {
        if (inHull(hull, this.hx0 + (gx + 0.5) * HALF, this.hx0 + (gy + 0.5) * HALF)) cells.push(gy * this.hside + gx);
      }
      const cc = this.cellOf(this.cx[t], this.cy[t]);
      if (cc >= 0 && !cells.includes(cc)) cells.push(cc);
      cellsOf[t] = Int32Array.from(cells);
      for (const c of cells) (colCell[c] || (colCell[c] = [])).push(t);
    }
    this.cellsOf = cellsOf;
    this.footprint = null;                         // the hulls served their purpose
    for (let c = 0; c < colCell.length; c++) if (colCell[c]) colCell[c] = Int32Array.from(colCell[c].sort((p, q) => this.cz[q] - this.cz[p] || p - q));   // highest centroid first
    this.colCell = colCell;
    // the column through each tile's centroid: the tiles the vertical line
    // passes through above it and below it, nearest first
    const aboveStart = new Int32Array(n + 1), aboveList = [], belowStart = new Int32Array(n + 1), belowList = [];
    for (let t = 0; t < n; t++) {
      aboveStart[t] = aboveList.length; belowStart[t] = belowList.length;
      const x = this.cx[t], y = this.cy[t];
      const cand = colCell[this.cellOf(x, y)] || [];
      const up = [], down = [];
      for (const u of cand) {
        if (u === t) continue;
        const zi = this.lineZ(u, x, y);
        if (zi === null) continue;
        if (zi[0] >= this.cz[t]) up.push(u); else if (zi[1] <= this.cz[t]) down.push(u);
      }
      up.sort((p, q) => this.cz[p] - this.cz[q] || p - q); down.sort((p, q) => this.cz[q] - this.cz[p] || p - q);
      for (const u of up) aboveList.push(u);
      for (const u of down) belowList.push(u);
    }
    aboveStart[n] = aboveList.length; belowStart[n] = belowList.length;
    this.aboveStart = aboveStart; this.aboveList = Int32Array.from(aboveList);
    this.belowStart = belowStart; this.belowList = Int32Array.from(belowList);
    // 2D buckets by centroid (edge cells) for plates and seeds
    this.pb = new Array(this.bw * this.bw);
    for (let t = 0; t < n; t++) { const key = Math.floor(this.cy[t] - this.b0[1]) * this.bw + Math.floor(this.cx[t] - this.b0[0]); (this.pb[key] || (this.pb[key] = [])).push(t); }
    let prolate = 0;
    for (let t = 0; t < n; t++) if (this.volume(t) > 0.7) prolate++;
    this.prolate = prolate;
    this.buildDirs();
  }

  cellOf(x, y) {
    const gx = Math.floor((x - this.hx0) / HALF), gy = Math.floor((y - this.hx0) / HALF);
    return gx < 0 || gy < 0 || gx >= this.hside || gy >= this.hside ? -1 : gy * this.hside + gx;
  }
  // the z-interval where the vertical line (x, y) is inside tile u, or null
  lineZ(u, x, y) {
    let lo = -Infinity, hi = Infinity;
    for (let f = 0; f < 6; f++) {
      const nx = this.fn[u * 18 + f * 3], ny = this.fn[u * 18 + f * 3 + 1], nz = this.fn[u * 18 + f * 3 + 2], d = this.fd[u * 6 + f] - nx * x - ny * y;
      if (Math.abs(nz) < 1e-12) { if (d < -1e-9) return null; continue; }
      const z = d / nz;
      if (nz > 0) { if (z < hi) hi = z; } else if (z > lo) lo = z;
    }
    return hi - lo > 1e-9 ? [lo, hi] : null;
  }
  // does the line p + k·d meet tile t? (the interval of k inside every face half-space is non-empty)
  lineHits(t, px, py, pz, d) {
    let lo = -Infinity, hi = Infinity;
    for (let f = 0; f < 6; f++) {
      const nx = this.fn[t * 18 + f * 3], ny = this.fn[t * 18 + f * 3 + 1], nz = this.fn[t * 18 + f * 3 + 2];
      const nd = nx * d[0] + ny * d[1] + nz * d[2], rhs = this.fd[t * 6 + f] - nx * px - ny * py - nz * pz;
      if (Math.abs(nd) < 1e-12) { if (rhs < -1e-6) return false; continue; }
      const k = rhs / nd;
      if (nd > 0) { if (k < hi) hi = k; } else if (k > lo) lo = k;
    }
    return hi - lo > -1e-6;
  }
  contains(t, x, y, z) {
    for (let f = 0; f < 6; f++) if (this.fn[t * 18 + f * 3] * x + this.fn[t * 18 + f * 3 + 1] * y + this.fn[t * 18 + f * 3 + 2] * z > this.fd[t * 6 + f] + 1e-9) return false;
    return true;
  }
  // the tile containing a world point, the first in stable order on a face, or −1
  locate(x, y, z) {
    const bx = Math.floor(x - this.b0[0]), by = Math.floor(y - this.b0[1]), bz = Math.floor(z - this.b0[2]);
    if (bx < 0 || by < 0 || bz < 0 || bx >= this.bw || by >= this.bw || bz >= this.bh) return -1;
    const list = this.bucket[(bz * this.bw + by) * this.bw + bx];
    if (!list) return -1;
    for (const t of list) if (this.contains(t, x, y, z)) return t;
    return -1;
  }
  volume(t) {
    const a = STAR[this.edges[t * 3]], b = STAR[this.edges[t * 3 + 1]], c = STAR[this.edges[t * 3 + 2]];
    return Math.abs(a[0] * (b[1] * c[2] - b[2] * c[1]) - a[1] * (b[0] * c[2] - b[2] * c[0]) + a[2] * (b[0] * c[1] - b[1] * c[0]));
  }
  // The thirty oriented face normals (the icosahedron's two-fold axes, both
  // ways), a plane basis for each, and every tile's extent along each: the
  // extent maps the terrace rule reads live on these planes.
  buildDirs() {
    const n = this.n, dirs = [], key = new Map();
    this.fdir = new Int8Array(n * 6);
    for (let t = 0; t < n; t++) for (let f = 0; f < 6; f++) {
      const nx = this.fn[t * 18 + f * 3], ny = this.fn[t * 18 + f * 3 + 1], nz = this.fn[t * 18 + f * 3 + 2];
      const k = Math.round(nx * 1e6) + "," + Math.round(ny * 1e6) + "," + Math.round(nz * 1e6);
      let d = key.get(k);
      if (d === undefined) { d = dirs.length; dirs.push([nx, ny, nz]); key.set(k, d); }
      this.fdir[t * 6 + f] = d;
    }
    this.dirs = dirs;
    const D = dirs.length;
    this.opp = new Int8Array(D);
    for (let d = 0; d < D; d++) {
      const k = Math.round(-dirs[d][0] * 1e6) + "," + Math.round(-dirs[d][1] * 1e6) + "," + Math.round(-dirs[d][2] * 1e6);
      this.opp[d] = key.get(k);
    }
    // basis: u horizontal (d × z), v = d × u
    this.du = []; this.dv = [];
    for (const d of dirs) {
      let ux = d[1], uy = -d[0], uz = 0;
      const l = Math.sqrt(ux * ux + uy * uy) || 1; ux /= l; uy /= l;
      const vx = d[1] * uz - d[2] * uy, vy = d[2] * ux - d[0] * uz, vz = d[0] * uy - d[1] * ux;
      this.du.push([ux, uy, uz]); this.dv.push([vx, vy, vz]);
    }
    this.topD = new Float32Array(n * D); this.botD = new Float32Array(n * D); this.cD = new Float32Array(n * D);
    for (let t = 0; t < n; t++) for (let d = 0; d < D; d++) {
      const dd = dirs[d];
      let lo = Infinity, hi = -Infinity;
      for (let q = 0; q < 8; q++) { const v = this.tv[t * 8 + q]; const p = this.vx[v] * dd[0] + this.vy[v] * dd[1] + this.vz[v] * dd[2]; if (p < lo) lo = p; if (p > hi) hi = p; }
      this.topD[t * D + d] = hi; this.botD[t * D + d] = lo; this.cD[t * D + d] = this.cx[t] * dd[0] + this.cy[t] * dd[1] + this.cz[t] * dd[2];
    }
    // the plane grids, centred on the cylinder's centre C = (0, 0, TALL·R): its
    // projection along any direction fits a square of this half-side. u is
    // horizontal, so only the v coordinate shifts by C·v.
    this.pS = Math.sqrt(1 + TALL * TALL) * this.R + 2;
    this.pside = Math.floor((2 * this.pS) / HALF) + 1;
    this.cv0 = []; for (const v of this.dv) this.cv0.push(TALL * this.R * v[2]);
    // each tile's centroid cell per direction: a cell a tile registers on even when its projection holds no cell centre
    this.centD = new Int32Array(n * D);
    for (let t = 0; t < n; t++) for (let d = 0; d < D; d++) {
      const u = this.du[d], v = this.dv[d];
      this.centD[t * D + d] = this.pcell(this.cx[t] * u[0] + this.cy[t] * u[1] + this.cz[t] * u[2], this.cx[t] * v[0] + this.cy[t] * v[1] + this.cz[t] * v[2] - this.cv0[d]);
    }
  }
  // the cells of direction d's plane under tile t's projection, into `out`; returns the count
  cellsD(t, d, out) {
    const u = this.du[d], v = this.dv[d], pts = [], cv0 = this.cv0[d];
    for (let q = 0; q < 8; q++) { const w = this.tv[t * 8 + q]; pts.push([this.vx[w] * u[0] + this.vy[w] * u[1] + this.vz[w] * u[2], this.vx[w] * v[0] + this.vy[w] * v[1] + this.vz[w] * v[2] - cv0]); }
    const hull = convexHull(pts);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of hull) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    const S = this.pS, side = this.pside;
    let k = 0;
    const gx0 = Math.max(0, Math.floor((x0 + S) / HALF)), gx1 = Math.min(side - 1, Math.floor((x1 + S) / HALF));
    const gy0 = Math.max(0, Math.floor((y0 + S) / HALF)), gy1 = Math.min(side - 1, Math.floor((y1 + S) / HALF));
    for (let gy = gy0; gy <= gy1; gy++) for (let gx = gx0; gx <= gx1; gx++) if (inHull(hull, -S + (gx + 0.5) * HALF, -S + (gy + 0.5) * HALF)) out[k++] = gy * side + gx;
    const cc = this.centD[t * this.dirs.length + d];
    if (cc >= 0) { let have = false; for (let i = 0; i < k; i++) if (out[i] === cc) have = true; if (!have) out[k++] = cc; }
    return k;
  }
  pcell(pu, pv) {
    const gx = Math.floor((pu + this.pS) / HALF), gy = Math.floor((pv + this.pS) / HALF);
    return gx < 0 || gy < 0 || gx >= this.pside || gy >= this.pside ? -1 : gy * this.pside + gx;
  }
  signature() {
    let h = 2166136261;
    const mix = (v) => { h = Math.imul(h ^ (v & 0xffff), 16777619); h = Math.imul(h ^ ((v >> 16) & 0xffff), 16777619); };
    for (let i = 0; i < this.tv.length; i++) mix(this.tv[i]);
    for (let i = 0; i < this.across.length; i++) mix(this.across[i]);
    return `ico:${this.n}:${this.vx.length}:${h >>> 0}`;
  }
}

function convexHull(pts) {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lower = [];
  for (const q of p) { while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 1e-12) lower.pop(); lower.push(q); }
  const upper = [];
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 1e-12) upper.pop(); upper.push(q); }
  upper.pop(); lower.pop();
  return lower.concat(upper);
}
function inHull(hull, x, y) {
  for (let i = 0; i < hull.length; i++) {
    const a = hull[i], b = hull[(i + 1) % hull.length];
    if ((b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]) < -1e-12) return false;
  }
  return true;
}

const cache = new Map();
export function icoTiling(R) {
  R = Math.max(ICO_R_MIN, Math.min(ICO_R_MAX, Math.round(+R || ICO_R_DEFAULT)));
  let T = cache.get(R);
  if (!T) { T = new IcoTiling(R); cache.set(R, T); if (cache.size > 3) cache.delete(cache.keys().next().value); }
  return T;
}

// ------------------------------------------------------------- substrate --
export class Ico {
  constructor(spec) {
    this.kind = "ico";
    this.spec = spec;
    const T = this.T = icoTiling(spec.R || ICO_R_DEFAULT);
    const n = this.n = T.n;
    this.R = T.R;
    this.sites = n;
    this.occ = new Uint8Array(n);
    this.nb = new Uint8Array(n);
    this.shadow = new Uint16Array(n);              // occupied tiles in the column above
    this.H = new Float64Array(T.hside * T.hside).fill(NONE);        // highest occupied centroid over the plane (stats, summit)
    const D = this.D = T.dirs.length;
    this.E = []; this.Ec = [];                     // the extent maps along each face direction: highest top, highest centroid
    for (let d = 0; d < D; d++) { this.E.push(new Float32Array(T.pside * T.pside).fill(NONE)); this.Ec.push(new Float32Array(T.pside * T.pside).fill(NONE)); }
    this.cols = new Map();                         // (direction, cell) → occupied-or-not tiles covering it, top first; on demand
    this.count = 0;
    this.sx = 0; this.sy = 0; this.sz = 0;
    this.fminX = Infinity; this.fminY = Infinity; this.fmaxX = -Infinity; this.fmaxY = -Infinity;
    this.minZ = Infinity; this.maxZ = -Infinity;
    this.z0 = spec.z0 !== undefined ? spec.z0 : 0.25 * this.R;   // the melt floor, in edge lengths above the cylinder's base: room above for the crystal
    this.limit2 = (this.R - 1) * (this.R - 1);   // the boundary shell is already not deep
    this.moteOffset = [0, 0, 0];
    this.min = [-this.R, -this.R, 0]; this.max = [this.R, this.R, 2 * TALL * this.R];
    this._bond = new Int32Array(64);
    this._cells = new Int32Array(256);
  }

  siteAt(at) {
    if (typeof at === "number") return at;
    if (at.tile !== undefined) return at.tile >= 0 && at.tile < this.n ? at.tile : -1;
    return this.T.locate(at.x, at.y, at.z);
  }
  siteAtWorld(x, y, z) { return this.T.locate(x, y, z); }
  describe(s) { return { tile: s, x: this.T.cx[s], y: this.T.cy[s], z: this.T.cz[s] }; }
  pos(s, m) { m.x = this.T.cx[s]; m.y = this.T.cy[s]; m.z = this.T.cz[s]; }
  brick(s, tick, mason) { return { x: this.T.cx[s], y: this.T.cy[s], z: this.T.cz[s], t: tick, m: mason, tile: s }; }
  zOf(s) { return this.T.cz[s]; }
  inBounds(s) {
    const T = this.T;
    if (!T.deep[s] || T.cz[s] < this.z0 - 0.6 || T.zTop[s] > 2 * TALL * this.R - 1.5) return false;
    return T.cx[s] * T.cx[s] + T.cy[s] * T.cy[s] < this.limit2;
  }
  // the bond graph: the six face-neighbours (below, above, then beside)
  bonds(s, out) {
    const T = this.T;
    let k = 0;
    for (let f = 0; f < 6; f++) { const u = T.across[s * 6 + f]; if (u >= 0 && T.fn[s * 18 + f * 3 + 2] < -UNDER) out[k++] = u; }
    for (let f = 0; f < 6; f++) { const u = T.across[s * 6 + f]; if (u >= 0 && T.fn[s * 18 + f * 3 + 2] > UNDER) out[k++] = u; }
    for (let f = 0; f < 6; f++) { const u = T.across[s * 6 + f]; const nz = T.fn[s * 18 + f * 3 + 2]; if (u >= 0 && nz >= -UNDER && nz <= UNDER) out[k++] = u; }
    return k;
  }

  place(s) {
    if (this.occ[s]) return false;
    const T = this.T, D = this.D;
    this.occ[s] = 1;
    for (let f = 0; f < 6; f++) { const u = T.across[s * 6 + f]; if (u >= 0) this.nb[u]++; }
    for (let k = T.belowStart[s]; k < T.belowStart[s + 1]; k++) this.shadow[T.belowList[k]]++;
    const cz = T.cz[s], H = this.H;
    for (const c of T.cellsOf[s]) if (H[c] < cz) H[c] = cz;
    const cells = this._cells;
    for (let d = 0; d < D; d++) {
      const E = this.E[d], Ec = this.Ec[d], top = T.topD[s * D + d], cd = T.cD[s * D + d], m = T.cellsD(s, d, cells);
      for (let i = 0; i < m; i++) { const c = cells[i]; if (E[c] < top) E[c] = top; if (Ec[c] < cd) Ec[c] = cd; }
    }
    this.count++;
    const x = T.cx[s], y = T.cy[s], z = cz;
    this.sx += x; this.sy += y; this.sz += z;
    if (x < this.fminX) this.fminX = x; if (x > this.fmaxX) this.fmaxX = x; if (y < this.fminY) this.fminY = y; if (y > this.fmaxY) this.fmaxY = y;
    if (z < this.minZ) this.minZ = z; if (z > this.maxZ) this.maxZ = z;
    return true;
  }
  // the tiles covering a cell of direction d's plane, highest along d first — found once by marching a ray
  column(d, c) {
    const key = d * 1e6 + c;
    let col = this.cols.get(key);
    if (col) return col;
    const T = this.T, dd = T.dirs[d], u = T.du[d], v = T.dv[d], S = T.pS, side = T.pside;
    const pu = -S + ((c % side) + 0.5) * HALF, pv = -S + (Math.floor(c / side) + 0.5) * HALF;
    const ox = pu * u[0] + pv * v[0], oy = pu * u[1] + pv * v[1], oz = pu * u[2] + pv * v[2] + TALL * T.R;   // through the cylinder's centre
    // every tile in the buckets the line crosses, tested exactly against the line
    const found = new Set(), seen = new Set();
    for (let k = -S; k <= S; k += 0.5) {
      const x = ox + dd[0] * k, y = oy + dd[1] * k, z = oz + dd[2] * k;
      const bx = Math.floor(x - T.b0[0]), by = Math.floor(y - T.b0[1]), bz = Math.floor(z - T.b0[2]);
      for (let ez = -1; ez <= 1; ez++) for (let ey = -1; ey <= 1; ey++) for (let ex = -1; ex <= 1; ex++) {
        const qx = bx + ex, qy = by + ey, qz = bz + ez;
        if (qx < 0 || qy < 0 || qz < 0 || qx >= T.bw || qy >= T.bw || qz >= T.bh) continue;
        const bk = (qz * T.bw + qy) * T.bw + qx;
        if (seen.has(bk)) continue;
        seen.add(bk);
        const list = T.bucket[bk];
        if (list) for (const t of list) if (!found.has(t) && T.lineHits(t, ox, oy, oz, dd)) found.add(t);
      }
    }
    for (let t = 0; t < T.n; t++) if (T.centD[t * this.D + d] === c) found.add(t);   // tiles registered here by centroid
    col = Int32Array.from([...found].sort((p, q) => T.topD[q * this.D + d] - T.topD[p * this.D + d] || p - q));
    this.cols.set(key, col);
    return col;
  }
  remove(s) {
    if (!this.occ[s]) return false;
    const T = this.T, D = this.D;
    this.occ[s] = 0;
    for (let f = 0; f < 6; f++) { const u = T.across[s * 6 + f]; if (u >= 0) this.nb[u]--; }
    for (let k = T.belowStart[s]; k < T.belowStart[s + 1]; k++) this.shadow[T.belowList[k]]--;
    const cz = T.cz[s], H = this.H;
    for (const c of T.cellsOf[s]) {
      if (H[c] !== cz) continue;
      let h = NONE;
      const col = T.colCell[c];
      if (col) for (let i = 0; i < col.length; i++) if (this.occ[col[i]]) { h = T.cz[col[i]]; break; }
      H[c] = h;
    }
    const cells = this._cells;
    for (let d = 0; d < D; d++) {
      const E = this.E[d], Ec = this.Ec[d], top = T.topD[s * D + d], cd = T.cD[s * D + d], m = T.cellsD(s, d, cells);
      for (let i = 0; i < m; i++) {
        const c = cells[i];
        if (E[c] !== top && Ec[c] !== cd) continue;
        const col = this.column(d, c);
        let h = NONE, hc = NONE;
        for (let j = 0; j < col.length; j++) { const u = col[j]; if (!this.occ[u]) continue; if (T.topD[u * D + d] > h) h = T.topD[u * D + d]; if (T.cD[u * D + d] > hc) hc = T.cD[u * D + d]; }
        E[c] = h; Ec[c] = hc;
      }
    }
    this.count--;
    this.sx -= T.cx[s]; this.sy -= T.cy[s]; this.sz -= cz;
    return true;
  }
  open(s) { return this.shadow[s] === 0; }
  heightAt(x, y) { const c = this.T.cellOf(x, y); return c < 0 ? NONE : this.H[c]; }
  summit() {
    const T = this.T;
    let best = -1, bz = -Infinity;
    for (let s = 0; s < this.n; s++) if (this.occ[s] && T.zTop[s] > bz) { bz = T.zTop[s]; best = s; }
    if (best < 0) return -1;
    for (let k = T.aboveStart[best]; k < T.aboveStart[best + 1]; k++) { const u = T.aboveList[k]; if (!this.occ[u]) return u; }
    return -1;
  }
  bounds() {
    if (!this.count) return { min: [-1, -1, this.z0], max: [1, 1, this.z0 + 1], count: 0 };
    return { min: [this.fminX - 0.6, this.fminY - 0.6, this.minZ - 0.5], max: [this.fmaxX + 0.6, this.fmaxY + 0.6, this.maxZ + 0.5], count: this.count };
  }
  regionNew() { return { fminX: Infinity, fminY: Infinity, fmaxX: -Infinity, fmaxY: -Infinity, minZ: Infinity, maxZ: -Infinity, sx: 0, sy: 0, sz: 0, count: 0 }; }
  regionAdd(r, s) {
    const T = this.T, x = T.cx[s], y = T.cy[s], z = T.cz[s];
    r.count++; r.sx += x; r.sy += y; r.sz += z;
    if (x < r.fminX) r.fminX = x; if (x > r.fmaxX) r.fmaxX = x; if (y < r.fminY) r.fminY = y; if (y > r.fmaxY) r.fmaxY = y;
    if (z < r.minZ) r.minZ = z; if (z > r.maxZ) r.maxZ = z;
  }

  // tiles whose centroid lies in a box, in stable order
  inBox(x0, y0, z0, x1, y1, z1, fn) {
    const T = this.T;
    for (let by = Math.max(0, Math.floor(y0 - T.b0[1])); by <= Math.min(T.bw - 1, Math.floor(y1 - T.b0[1])); by++) for (let bx = Math.max(0, Math.floor(x0 - T.b0[0])); bx <= Math.min(T.bw - 1, Math.floor(x1 - T.b0[0])); bx++) {
      const list = T.pb[by * T.bw + bx];
      if (!list) continue;
      for (const t of list) if (T.cx[t] >= x0 && T.cx[t] < x1 && T.cy[t] >= y0 && T.cy[t] < y1 && T.cz[t] >= z0 && T.cz[t] < z1) fn(t);
    }
  }
  // The nucleus: a disk of tiles `thickness` edges deep from the melt floor,
  // or the playground's painted columns (`ic.voxels`: [x, y, k] unit cubes
  // from the floor, offsets from the axis).
  seed(genome) {
    const bricks = [], T = this.T;
    const ic = this.spec.ic || { disk: 3, thickness: 2 };
    const lay = (t) => { if (T.deep[t] && this.place(t)) bricks.push(this.brick(t, 0, -1)); };
    const picked = [];
    if (ic.voxels) {
      for (const v of ic.voxels) this.inBox(v[0], v[1], this.z0 + v[2], v[0] + 1, v[1] + 1, this.z0 + v[2] + 1, (t) => picked.push(t));
    } else {
      const r = ic.disk, h = (ic.thickness || 2);
      this.inBox(-r - 1, -r - 1, this.z0, r + 1, r + 1, this.z0 + h, (t) => { if (T.cx[t] * T.cx[t] + T.cy[t] * T.cy[t] <= r * r) picked.push(t); });
    }
    picked.sort((a, b) => a - b);
    for (const t of picked) lay(t);
    return bricks;
  }
  // a pack's floor is its plate's underside: bricks beneath it are terrain, not crystal
  floorOf(plate) { let lo = Infinity; for (const b of plate) if (this.T.zBot[b.tile] < lo) lo = this.T.zBot[b.tile]; return lo === Infinity ? this.z0 : lo - 0.05; }
  // a plate for a pack: the tiles within size/2 of the site's centroid, `thick` edges deep
  plate(s, size, thick, colony) {
    const T = this.T, out = [], r = Math.max(1, size / 2) + 0.3, x = T.cx[s], y = T.cy[s], z = T.zBot[s];
    const picked = [];
    this.inBox(x - r, y - r, z - 0.1, x + r, y + r, z + thick * 0.85, (t) => { const dx = T.cx[t] - x, dy = T.cy[t] - y; if (dx * dx + dy * dy <= r * r && T.deep[t]) picked.push(t); });
    picked.sort((a, b) => a - b);
    for (const t of picked) if (this.place(t)) { const b = this.brick(t, 0, -1); b.c = colony; out.push(b); }
    return out;
  }

  // The Kossel class. A rhombohedron can rest on up to three faces at once,
  // so the layer beneath counts ONE bond (a terrace site is a terrace site,
  // not a kink), the layer above one, and each sideways face one — the
  // cubic reading. Beneath the colony's floor the world is void.
  kossel(s, floor = 0) {
    if (!this.nb[s]) return 0;
    const T = this.T, occ = this.occ;
    let below = 0, above = 0, lat = 0, under = 0;
    for (let f = 0; f < 6; f++) {
      const u = T.across[s * 6 + f];
      if (u < 0 || !occ[u]) continue;
      const nz = T.fn[s * 18 + f * 3 + 2];
      if (floor && T.cz[u] < floor - 0.15) { under++; continue; }
      if (nz < -UNDER) below = 1; else if (nz > UNDER) above = 1; else lat++;
    }
    const c = below + above + lat;
    if (c === 0) return under ? 1 : 0;            // only the void beneath the floor: a lone contact
    return c > 6 ? 6 : c;
  }

  walk(s, out) {
    const T = this.T;
    let nc = 0;
    for (let k = T.vnbrStart[s]; k < T.vnbrStart[s + 1]; k++) { const q = T.vnbrList[k]; if (!this.occ[q] && this.nb[q] && T.deep[q]) out[nc++] = q; }
    return nc;
  }

  // The terrace rule, along face direction d (the site grows the crystal
  // that way): on d's extent map, scanned in the plane across d from the
  // site's projected centroid, fed iff some direction drops below the
  // site's bottom plane within `rim`, with nothing at that plane or above
  // beyond the drop, and nothing above the plane within `rim` on the
  // opposite side.
  fed(s, d, rim, floor = 0) {
    const T = this.T, D = this.D, E = this.E[d], Ec = this.Ec[d], side = T.pside, S = T.pS, kRim = Math.round(2 * rim);
    const h = T.botD[s * D + d], wall = h + LEVEL, terrace = h - RUNG;
    const u = T.du[d], v = T.dv[d];
    const cu = (T.cx[s] * u[0] + T.cy[s] * u[1] + T.cz[s] * u[2] + S) / HALF, cv = (T.cx[s] * v[0] + T.cy[s] * v[1] + T.cz[s] * v[2] - T.cv0[d] + S) / HALF;
    // beneath the colony's floor the map is void: straight up, that is a top at or
    // under the floor; sideways, a row of the plane below the floor's height
    const dz = T.dirs[d][2], vz = v[2];
    const byTop = !!floor && dz > 0.9, byRow = !!floor && !byTop && Math.abs(vz) > 0.3;
    const flTop = floor + 0.15, flZ = floor - 0.15, zC = TALL * T.R;
    const voided = (gy, e) => byTop ? e < flTop : byRow ? zC + (-S + (gy + 0.5) * HALF) * vz < flZ : false;
    for (let q = 0; q < 12; q++) {
      const dx = DIRS[q][0], dy = DIRS[q][1];
      let drop = 0, ok = true;
      for (let k = 1; k <= 2 * LOOK; k++) {
        const gx = Math.floor(cu + dx * k), gy = Math.floor(cv + dy * k);
        if (gx < 0 || gy < 0 || gx >= side || gy >= side) { if (!drop) drop = k; break; }
        const c = gy * side + gx;
        let e = E[c], ec = Ec[c];
        if (voided(gy, e)) { e = NONE; ec = NONE; }
        if (!drop) {
          if (ec >= wall) { ok = false; break; }                      // a wall between here and the outside
          if (e < terrace) { drop = k; if (k > kRim) { ok = false; break; } }
        } else if (e >= terrace) { ok = false; break; }               // the terrace's plane beyond the drop: a pit, not the outside
      }
      if (!ok || !drop) continue;
      let sheltered = false;
      for (let k = 1; k <= kRim; k++) {
        const gx = Math.floor(cu - dx * k), gy = Math.floor(cv - dy * k);
        if (gx < 0 || gy < 0 || gx >= side || gy >= side) break;
        const ec = Ec[gy * side + gx];
        if (ec >= wall && !voided(gy, E[gy * side + gx])) { sheltered = true; break; }
      }
      if (!sheltered) return true;
    }
    return false;
  }
  // the anisotropy weight of growing along direction d: the lateral weights
  // blended by its horizontal part, the +z weight by its upward part
  dirWeight(d, axis) {
    const dd = this.T.dirs[d], up = dd[2] > 0 ? dd[2] : 0;
    const ax = Math.abs(dd[0]), ay = Math.abs(dd[1]), tot = ax + ay;
    const wl = tot > 1e-9 ? ((dd[0] > 0 ? axis[0] : axis[1]) * ax + (dd[1] > 0 ? axis[2] : axis[3]) * ay) / tot : axis[4];
    return wl * (1 - up) + axis[4] * up;
  }
  fedBias(s, nb, axis, rim, B, floor = 0) {
    const T = this.T, occ = this.occ, D = this.D;
    let bias = 0;
    for (let f = 0; f < 6; f++) {
      const o = T.across[s * 6 + f];
      if (o < 0 || !occ[o]) continue;
      if (floor && T.cz[o] < floor - 0.15) continue;         // the brick is under this colony's floor: void
      const d = T.opp[T.fdir[s * 6 + f]], dd = T.dirs[d];     // the direction the site extends the crystal in
      if (dd[2] < -STEEP) continue;                           // never downward: the melt is above
      let w = this.dirWeight(d, axis);
      if (w <= bias) continue;
      if (nb === 1) {
        if (dd[2] >= STEEP) {
          // a new layer needs a real patch under it: the corner-neighbours beneath the site along d that hold a brick, scaled to the cubic rule's 8
          let cnt = 0, m = 0;
          const cs = T.cD[s * D + d];
          for (let k = T.vnbrStart[s]; k < T.vnbrStart[s + 1]; k++) { const q = T.vnbrList[k]; const dq = T.cD[q * D + d] - cs; if (dq < -0.3 && dq > -1.4) { m++; if (occ[q]) cnt++; } }
          const c8 = m ? Math.floor((cnt * 8) / m + 0.5) : 0;
          w *= c8 >= B.patchFull ? 1 : c8 >= B.patchMin ? B.patchPart : 0;
        } else {
          // the lip rule: only at the crystal's top lip, running both ways, thinning with depth
          if (B.lipRule) {
            if (this.shadow[s] > 0) continue;                                   // something above this site
            if (this.shadow[o] > 0) continue;                                   // the brick is not the top of its column
          }
          let along = 0;
          const ox = T.cx[o], oy = T.cy[o], oz = T.cz[o];
          for (let g = 0; g < 6; g++) {
            const q = T.across[o * 6 + g];
            if (q < 0 || q === s || !occ[q]) continue;
            const ex = T.cx[q] - ox, ey = T.cy[q] - oy, ez = T.cz[q] - oz;
            if (Math.abs(ex * dd[0] + ey * dd[1] + ez * dd[2]) < 0.3 && Math.abs(ez) < 0.6) along++;
          }
          w *= along >= 2 ? 1 : along === 1 ? B.lipAlong : 0;
          if (B.lipDepth > 0) {
            const lo = floor > this.minZ ? floor : this.minZ;
            const depth = (T.cz[s] - lo) / Math.max(0.5, this.maxZ - lo);
            let dp = depth;
            for (let k = 1; k < B.lipDepth; k++) dp *= depth;
            w *= dp;
          }
        }
        if (w <= bias) continue;
      }
      if (this.fed(s, d, rim, floor)) bias = w;
    }
    return bias;
  }

  // Arrival from the melt: a random point on a box outside the crystal, a
  // straight line toward (near) the centroid sampled every quarter edge,
  // land on the last empty tile before the first brick.
  arrive(r, B, region) {
    const T = this.T, R = region || this;
    const cnt = R.count || 1;
    const cx = R.sx / cnt, cy = R.sy / cnt, cz = R.sz / cnt;
    for (let attempt = 0; attempt < 12; attempt++) {
      const pad = 6 + attempt;
      const lo = [R.fminX - pad, R.fminY - pad, R.minZ - pad], hi = [R.fmaxX + pad, R.fmaxY + pad, R.maxZ + pad + 1];
      const u = r(), a = B.arriveFromAbove;
      const face = u < a ? 5 : Math.floor((u - a) * (5 / (1 - a)));
      const p = [lo[0] + r() * (hi[0] - lo[0]), lo[1] + r() * (hi[1] - lo[1]), lo[2] + r() * (hi[2] - lo[2])];
      p[face >> 1] = (face & 1) ? hi[face >> 1] : lo[face >> 1];
      const ext = (R.fmaxX - R.fminX) + (R.fmaxY - R.fminY) + (R.maxZ - R.minZ);
      const j = 2 + Math.floor(ext / 6);
      const tgt = [cx + (r() * 2 - 1) * j, cy + (r() * 2 - 1) * j, cz + (r() * 2 - 1) * j];
      const dx = tgt[0] - p[0], dy = tgt[1] - p[1], dz = tgt[2] - p[2];
      const N = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy), Math.abs(dz)) / 0.25));
      let prev = -1, entered = false;
      for (let i = 1; i <= 4 * N; i++) {
        const t = T.locate(p[0] + (dx * i) / N, p[1] + (dy * i) / N, p[2] + (dz * i) / N);
        if (t < 0) { if (entered) break; continue; }
        entered = true;
        if (this.occ[t]) {
          if (prev >= 0 && !this.occ[prev] && this.nb[prev] > 0) return prev;
          break;
        }
        prev = t;
      }
    }
    return -1;
  }

  stats(growth) {
    const T = this.T, H = this.H, side = T.hside;
    const box = [this.fmaxX - this.fminX + 1, this.fmaxY - this.fminY + 1, this.maxZ - this.minZ + 1];
    let pit = 0, exposed = 0;
    for (let s = 0; s < this.n; s++) {
      if (this.occ[s]) { exposed += 6 - this.nb[s]; continue; }
      if (!this.nb[s]) continue;
      let under = false;
      for (let k = T.belowStart[s]; k < T.belowStart[s + 1] && !under; k++) if (this.occ[T.belowList[k]]) under = true;
      if (!under) continue;
      const cx = (T.cx[s] - T.hx0) / HALF, cy = (T.cy[s] - T.hx0) / HALF, wall = T.cz[s] - 0.35;
      let fenced = 0;
      for (let d = 0; d < 12; d += 3) {
        for (let k = 1; k <= 2 * LOOK; k++) {
          const gx = Math.floor(cx + DIRS[d][0] * k), gy = Math.floor(cy + DIRS[d][1] * k);
          if (gx < 0 || gy < 0 || gx >= side || gy >= side) break;
          if (H[gy * side + gx] >= wall) { fenced++; break; }
        }
      }
      if (fenced === 4) pit++;
    }
    const heights = new Set();
    for (let k = 1; k <= 2 * this.R; k++) { const c = T.cellOf(k * HALF, 0); if (c < 0) break; if (H[c] > NONE) heights.add(Math.round(H[c] / 0.7)); }
    // how much of the domain the crystal has used: its reach against the wall and the ceiling
    const reach = Math.max(Math.max(-this.fminX, this.fmaxX, -this.fminY, this.fmaxY) / Math.sqrt(this.limit2), (this.maxZ - this.z0) / (2 * TALL * this.R - 1.5 - this.z0));
    return {
      bricks: this.count, box, pit, hollowness: pit / Math.max(1, this.count), exposedFaces: exposed, terraces: heights.size,
      ticks: growth.tick, masons: growth.masons.length, retired: growth.retired, laidPerMason: growth.masons.map((m) => m.laid),
      tiling: "ico", tiles: this.n, prolate: T.prolate, coordination: 6, reach, radius: this.R,
    };
  }
}
