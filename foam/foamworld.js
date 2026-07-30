// foam/foamworld.js — the voronoi-foam pocket kernel.
//
// Generates one walkable POCKET of the rind's voronoi foam: seeded, layered,
// anisotropic 3D Voronoi cells (chambers) computed by convex half-space
// clipping, with every shared face extracted as a MEMBRANE — the toggleable,
// shatterable plates the game is about. Edges are structure, plates are not
// (the rind rule): destroying a membrane never removes its structural frame.
//
// The kernel also carries the honesty layer: a grade-constrained WALK
// CERTIFICATE. Movement is walking only — no jumps, a maximum climbable
// grade — so a membrane crossing counts as traversable only when the floors
// on both sides meet its lower edge at walkable slope with standing
// clearance. `generatePocket` retries salts until the certificate proves the
// start→target route exists, so every published seed is solvable. The same
// classification (support faces, crossing rules) drives the browser physics.
//
// Deterministic: (seed → identical pocket on every machine). Runs in node
// (the selftest) and the browser (the game). No dependencies.

// ---------------------------------------------------------------- rng ------
export function fnv(...xs) {
  let h = 2166136261 >>> 0;
  for (const x of xs) { h ^= x >>> 0; h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
export function mulberry(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ------------------------------------------------- convex polyhedron -------
// Mesh: { verts: [[x,y,z],…], faces: [{ src, vs: [vi,…] }] } — faces wound so
// the outward normal follows the winding (right-hand rule), src identifies
// which clip produced the face (seed index, or 'B0'…'B5' for the domain box).

function boxMesh(W, H, D) {
  const v = [
    [0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0],
    [0, 0, D], [W, 0, D], [W, H, D], [0, H, D],
  ];
  // wound outward
  const faces = [
    { src: 'B0', vs: [0, 3, 2, 1] }, // z=0
    { src: 'B1', vs: [4, 5, 6, 7] }, // z=D
    { src: 'B2', vs: [0, 1, 5, 4] }, // y=0 (floor of the pocket)
    { src: 'B3', vs: [3, 7, 6, 2] }, // y=H
    { src: 'B4', vs: [0, 4, 7, 3] }, // x=0
    { src: 'B5', vs: [1, 2, 6, 5] }, // x=W
  ];
  return { verts: v, faces };
}

// Clip mesh to the half-space n·p <= d. Returns a new mesh (or null if empty).
function clipMesh(mesh, n, d, src, eps) {
  const { verts, faces } = mesh;
  const sd = verts.map((p) => n[0] * p[0] + n[1] * p[1] + n[2] * p[2] - d);
  let anyOut = false, anyIn = false;
  for (const s of sd) { if (s > eps) anyOut = true; else if (s < -eps) anyIn = true; }
  if (!anyOut) return mesh;          // untouched
  if (!anyIn) return null;           // gone
  const nv = [];                     // new vertex list
  const keep = new Map();            // old vi -> new vi
  const cut = new Map();             // 'a_b' edge key -> new vi of intersection
  const kv = (vi) => {
    if (!keep.has(vi)) { keep.set(vi, nv.length); nv.push(verts[vi]); }
    return keep.get(vi);
  };
  const xv = (a, b) => {
    const key = a < b ? a + '_' + b : b + '_' + a;
    if (!cut.has(key)) {
      const t = sd[a] / (sd[a] - sd[b]);
      const A = verts[a], B = verts[b];
      cut.set(key, nv.length);
      nv.push([A[0] + t * (B[0] - A[0]), A[1] + t * (B[1] - A[1]), A[2] + t * (B[2] - A[2])]);
    }
    return cut.get(key);
  };
  const nf = [];
  const rimSet = new Set();
  for (const f of faces) {
    const out = [];
    const m = f.vs.length;
    for (let i = 0; i < m; i++) {
      const a = f.vs[i], b = f.vs[(i + 1) % m];
      const sa = sd[a], sbb = sd[b];
      if (sa <= eps) out.push(kv(a));
      if ((sa < -eps && sbb > eps) || (sa > eps && sbb < -eps)) out.push(xv(a, b));
    }
    // dedup consecutive
    const vs = out.filter((x, i) => x !== out[(i + 1) % out.length]);
    if (vs.length >= 3) nf.push({ src: f.src, vs });
  }
  for (const vi of cut.values()) rimSet.add(vi);
  // the cap face: order rim vertices by angle in the cut plane
  const rim = [...rimSet];
  if (rim.length >= 3) {
    let cx = 0, cy = 0, cz = 0;
    for (const vi of rim) { cx += nv[vi][0]; cy += nv[vi][1]; cz += nv[vi][2]; }
    cx /= rim.length; cy /= rim.length; cz /= rim.length;
    // plane basis
    const ax = Math.abs(n[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0];
    let u = cross(n, ax); u = norm3(u);
    const w = cross(n, u);
    rim.sort((p, q) => {
      const P = nv[p], Q = nv[q];
      const pa = Math.atan2(dot3([P[0] - cx, P[1] - cy, P[2] - cz], w), dot3([P[0] - cx, P[1] - cy, P[2] - cz], u));
      const qa = Math.atan2(dot3([Q[0] - cx, Q[1] - cy, Q[2] - cz], w), dot3([Q[0] - cx, Q[1] - cy, Q[2] - cz], u));
      return pa - qa;
    });
    // wind so outward normal ≈ n
    const fn = polyNormal(rim.map((vi) => nv[vi]));
    if (dot3(fn, n) < 0) rim.reverse();
    nf.push({ src, vs: rim });
  }
  return { verts: nv, faces: nf };
}

function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function polyNormal(pts) {
  // Newell's method
  let nx = 0, ny = 0, nz = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i], b = pts[(i + 1) % pts.length];
    nx += (a[1] - b[1]) * (a[2] + b[2]);
    ny += (a[2] - b[2]) * (a[0] + b[0]);
    nz += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return [nx, ny, nz];
}
function polyArea(pts) { return Math.hypot(...polyNormal(pts)) / 2; }
function polyCentroid(pts) {
  let x = 0, y = 0, z = 0;
  for (const p of pts) { x += p[0]; y += p[1]; z += p[2]; }
  const n = pts.length; return [x / n, y / n, z / n];
}

// -------------------------------------------------------- classification ---
// slope = rise/run of the face plane; a face is SUPPORT (walkable floor)
// when its slope is within the climb grade. Crossing a non-support face on
// foot is possible only through its lower edge where floors meet it.
export function faceSlope(n) {
  const run = Math.hypot(n[0], n[2]);
  return Math.abs(n[1]) < 1e-9 ? Infinity : run / Math.abs(n[1]);
}

// ------------------------------------------------------------ the pocket ---
export function generatePocket(opts = {}) {
  const o = Object.assign({
    seed: 1,
    nx: 7, nz: 7, layers: 4,        // chambers per axis / vertical CLIMB layers
    subLayers: 2,                   // foam layers BELOW the start — the ground
                                    // state is foam, not a flat plane; only
                                    // the start dais is level
    cell: 6, layerH: 3.4,           // metres
    jitterXZ: 0.38, jitterY: 0.3,   // fraction of spacing
    rampFrac: 0.25,                 // seeds thrown further off-layer (climb texture)
    aniso: 2.2,                     // vertical metric weight (>1 flattens floors)
    maxGrade: 1.05,                 // max walkable slope (rise/run) ≈ 46°
    clearance: 1.75,                // standing room through a crossing (m)
    daisR: 1.9,                     // radius of the start dais disk
    parMin: 5, parTarget: 9,        // puzzle length: min / preferred breaches
    maxSalt: 24,
  }, opts);
  for (let salt = 0; salt < o.maxSalt; salt++) {
    const p = buildPocket(o, salt);
    if (p) return p;
  }
  throw new Error('foamworld: no solvable pocket found for seed ' + o.seed);
}

function buildPocket(o, salt) {
  // total layers: subLayers of foam under the start (the ground state is
  // foam — falls land in chambers, not on a plane) + the climb band above
  const L = o.layers + o.subLayers;
  const W = o.nx * o.cell, D = o.nz * o.cell, H = L * o.layerH;
  const rng = mulberry(fnv(0x0F0A, o.seed, salt, o.nx, o.nz, L));
  const eps = 1e-6 * Math.max(W, H, D);

  // -- seeds: jittered layered grid (anisotropic: wider than tall => roomy
  //    chambers with near-level floors, walls mostly steep). A rampFrac of
  //    seeds are thrown farther off-layer, which tilts their floors and those
  //    of their neighbours — the climb texture the grade limit bites on.
  const seeds = [], layerOf = [];
  for (let k = 0; k < L; k++) {
    for (let j = 0; j < o.nz; j++) {
      for (let i = 0; i < o.nx; i++) {
        const ramp = rng() < o.rampFrac;
        const jy = ramp ? 0.75 : o.jitterY;
        const x = (i + 0.5 + o.jitterXZ * (2 * rng() - 1)) * o.cell;
        const z = (j + 0.5 + o.jitterXZ * (2 * rng() - 1)) * o.cell;
        const y = (k + 0.5 + jy * (2 * rng() - 1)) * o.layerH;
        seeds.push([
          Math.min(W - 0.4, Math.max(0.4, x)),
          Math.min(H - 0.3, Math.max(0.3, y)),
          Math.min(D - 0.4, Math.max(0.4, z)),
        ]);
        layerOf.push(k);
      }
    }
  }
  const N = seeds.length;
  const gi = (idx) => idx % o.nx, gj = (idx) => Math.floor(idx / o.nx) % o.nz, gk = (idx) => Math.floor(idx / (o.nx * o.nz));

  // -- candidate neighbours: grid Chebyshev radius 2, nearest-first
  const candidates = (ci) => {
    const I = gi(ci), J = gj(ci), K = gk(ci), out = [];
    for (let dk = -2; dk <= 2; dk++) for (let dj = -2; dj <= 2; dj++) for (let di = -2; di <= 2; di++) {
      if (!di && !dj && !dk) continue;
      const i = I + di, j = J + dj, k = K + dk;
      if (i < 0 || j < 0 || k < 0 || i >= o.nx || j >= o.nz || k >= L) continue;
      out.push(k * o.nx * o.nz + j * o.nx + i);
    }
    const s = seeds[ci];
    out.sort((a, b) => d2(seeds[a], s) - d2(seeds[b], s));
    return out;
  };
  const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2;

  // -- clip every cell
  const meshes = new Array(N);
  for (let ci = 0; ci < N; ci++) {
    let mesh = boxMesh(W, H, D);
    const s = seeds[ci];
    for (const ni of candidates(ci)) {
      const t = seeds[ni];
      // bisector under the anisotropic metric diag(1, √aniso, 1): still a
      // plane in real space, with the y-component of its normal scaled by
      // `aniso` — floors flatten, walls steepen, chambers get roomy. The
      // midpoint stays equidistant, so it is always on the boundary.
      const n = norm3([t[0] - s[0], (t[1] - s[1]) * o.aniso, t[2] - s[2]]);
      const mid = [(s[0] + t[0]) / 2, (s[1] + t[1]) / 2, (s[2] + t[2]) / 2];
      const dd = dot3(n, mid);
      // early out: bisector further than the farthest current vertex
      let maxR = 0;
      for (const v of mesh.verts) maxR = Math.max(maxR, d2(v, s));
      if ((dot3(n, s) - dd) ** 2 > maxR && dot3(n, s) < dd) continue;
      const next = clipMesh(mesh, n, dd, ni, eps);
      if (next) mesh = next; // a null here would mean the seed is outside its own cell — keep last
    }
    meshes[ci] = mesh;
  }

  // -- cells: centroid + volume (divergence theorem over the face fans)
  const cells = new Array(N);
  for (let ci = 0; ci < N; ci++) {
    const m = meshes[ci];
    let vol = 0, cx = 0, cy = 0, cz = 0;
    for (const f of m.faces) {
      const pts = f.vs.map((vi) => m.verts[vi]);
      for (let i = 1; i + 1 < pts.length; i++) {
        const a = pts[0], b = pts[i], c = pts[i + 1];
        const v6 = dot3(a, cross(b, c));
        vol += v6;
        cx += (a[0] + b[0] + c[0]) * v6; cy += (a[1] + b[1] + c[1]) * v6; cz += (a[2] + b[2] + c[2]) * v6;
      }
    }
    vol /= 6;
    const k = vol > 1e-9 ? 1 / (24 * vol) : 0;
    cells[ci] = { id: ci, seed: seeds[ci], layer: layerOf[ci], volume: vol,
      centroid: vol > 1e-9 ? [cx * k, cy * k, cz * k] : seeds[ci].slice(), faces: [] };
  }

  // -- global vertex weld: near-degenerate voronoi vertices leave millimetre
  //    edges that weld differently in the two copies of a shared face, which
  //    breaks watertightness (caught by the Euler selftest). Snap every mesh
  //    vertex to a canonical representative within `weld` metres via a
  //    spatial hash, so the whole complex genuinely shares vertices.
  const weld = 0.02;
  const canon = [];               // canonical coords
  const canonMap = new Map();     // bin key -> [canon ids in bin]
  const canonOf = (p) => {
    const bx = Math.round(p[0] / weld), by = Math.round(p[1] / weld), bz = Math.round(p[2] / weld);
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) for (let dz = -1; dz <= 1; dz++) {
      const ids = canonMap.get((bx + dx) + '_' + (by + dy) + '_' + (bz + dz));
      if (!ids) continue;
      for (const id of ids) {
        const c = canon[id];
        if (Math.abs(c[0] - p[0]) <= weld && Math.abs(c[1] - p[1]) <= weld && Math.abs(c[2] - p[2]) <= weld) return id;
      }
    }
    const id = canon.length;
    canon.push([p[0], p[1], p[2]]);
    const k = bx + '_' + by + '_' + bz;
    if (!canonMap.has(k)) canonMap.set(k, []);
    canonMap.get(k).push(id);
    return id;
  };
  // pre-register every vertex, then transitively CLUSTER canonicals within
  // 1.5×weld — a degenerate voronoi vertex can smear into a chain of points
  // each within tolerance of the next but not of the first, and greedy
  // welding then splits the chain differently in the two copies of a shared
  // face (found by the Euler selftest, seed 7 of the 6-layer geometry)
  for (const m of meshes) for (const f of m.faces) for (const vi of f.vs) canonOf(m.verts[vi]);
  const wpar = canon.map((_, i) => i);
  const wfind = (x) => { while (wpar[x] !== x) { wpar[x] = wpar[wpar[x]]; x = wpar[x]; } return x; };
  const cl = weld * 1.5;
  for (let i = 0; i < canon.length; i++) {
    const p = canon[i];
    const bx = Math.round(p[0] / weld), by = Math.round(p[1] / weld), bz = Math.round(p[2] / weld);
    for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) for (let dz = -2; dz <= 2; dz++) {
      const ids = canonMap.get((bx + dx) + '_' + (by + dy) + '_' + (bz + dz));
      if (!ids) continue;
      for (const j of ids) {
        if (j >= i) continue;
        const q = canon[j];
        if (Math.abs(q[0] - p[0]) <= cl && Math.abs(q[1] - p[1]) <= cl && Math.abs(q[2] - p[2]) <= cl) {
          const a = wfind(i), b = wfind(j);
          if (a !== b) wpar[Math.max(a, b)] = Math.min(a, b); // smallest index wins — deterministic
        }
      }
    }
  }
  const weldFace = (m, f) => {
    const ids = f.vs.map((vi) => wfind(canonOf(m.verts[vi])));
    const out = ids.filter((x, i) => x !== ids[(i + 1) % ids.length]);
    return out.length >= 3 ? out.map((id) => canon[id]) : null;
  };

  // -- global faces (membranes): one record per interior pair + boundary faces
  const faces = [];
  const pairIndex = new Map(); // 'a_b' -> face id
  for (let ci = 0; ci < N; ci++) {
    const m = meshes[ci];
    for (const f of m.faces) {
      const pts = weldFace(m, f);
      if (!pts) continue;
      const area = polyArea(pts);
      if (area < 1e-6) continue; // true zero only — dropping a visible sliver
                                 // would hole the complex (Euler catches it)
      if (typeof f.src === 'number') {
        const nb = f.src;
        // one record per pair, from WHICHEVER mesh has the face — a sliver
        // can be clipped out of one cell's mesh yet survive in its
        // neighbour's, and emitting only from the lower id then holes both
        // (Euler catches it). Orientation is normalised a(min) → b(max).
        const key = Math.min(ci, nb) + '_' + Math.max(ci, nb);
        if (pairIndex.has(key)) continue;
        const a = Math.min(ci, nb), b = Math.max(ci, nb);
        let n = norm3(polyNormal(pts));   // outward from ci
        let verts = pts;
        if (ci !== a) { n = [-n[0], -n[1], -n[2]]; verts = pts.slice().reverse(); }
        let sill = Infinity, top = -Infinity;
        for (const p of verts) { sill = Math.min(sill, p[1]); top = Math.max(top, p[1]); }
        pairIndex.set(key, faces.length);
        faces.push({ id: faces.length, a, b, verts, n, area,
          centroid: polyCentroid(verts), sill, top, slope: faceSlope(n), boundary: false });
      } else {
        const n = norm3(polyNormal(pts));
        let sill = Infinity, top = -Infinity;
        for (const p of pts) { sill = Math.min(sill, p[1]); top = Math.max(top, p[1]); }
        faces.push({ id: faces.length, a: ci, b: -1, verts: pts, n, area,
          centroid: polyCentroid(pts), sill, top, slope: faceSlope(n), boundary: true, wall: f.src });
      }
    }
  }
  for (const f of faces) { cells[f.a].faces.push(f.id); if (f.b >= 0) cells[f.b].faces.push(f.id); }

  // -- closure gate: every cell must be a closed polyhedron (V−E+F=2) after
  //    welding. A near-cospherical seed cluster can produce a knot of
  //    centimetre faces that no fixed tolerance stitches consistently —
  //    rather than ship a holed complex, reject the pocket and reroll the
  //    salt, exactly as for unsolvable puzzles. Watertightness is part of
  //    the certificate.
  {
    const kq = (v) => Math.round(v[0] * 256) + '_' + Math.round(v[1] * 256) + '_' + Math.round(v[2] * 256);
    for (const c of cells) {
      const vs = new Set(), es = new Set();
      for (const fi of c.faces) {
        const ks = faces[fi].verts.map(kq);
        ks.forEach((k) => vs.add(k));
        for (let i = 0; i < ks.length; i++) {
          const a = ks[i], b = ks[(i + 1) % ks.length];
          es.add(a < b ? a + '|' + b : b + '|' + a);
        }
      }
      if (vs.size - es.size + c.faces.length !== 2) return null;
    }
  }

  // -- support classification per (cell, face): the face is a FLOOR of cell c
  //    when its outward normal (as seen from c) points down and the slope is
  //    within grade. Boundary floor B2 (y=0) supports the bottom layer.
  const isFloorOf = (f, cid) => {
    if (f.slope > o.maxGrade) return false;
    const ny = f.a === cid ? f.n[1] : -f.n[1]; // outward from cid
    return ny < 0;
  };

  // -- within-cell floor components: floors connected through shared EDGES
  //    (two shared welded vertices). Vertex-only contact is a pinch point a
  //    walking body cannot pass — counting it as connected certified routes
  //    that were not physically walkable (found by the playthrough bot).
  const vkey = (p) => Math.round(p[0] * 512) + '_' + Math.round(p[1] * 512) + '_' + Math.round(p[2] * 512);
  const keysOf = new Map();  // faceId -> Set(vertex keys)
  const faceKeys = (fi) => {
    if (!keysOf.has(fi)) keysOf.set(fi, new Set(faces[fi].verts.map(vkey)));
    return keysOf.get(fi);
  };
  const sharedKeys = (fa, fb) => {
    const A = faceKeys(fa), B = faceKeys(fb);
    let n = 0;
    for (const k of A) if (B.has(k)) { if (++n >= 2) return n; }
    return n;
  };
  const compOf = new Map();  // 'cell_faceId' -> node id
  const nodes = [];          // { cell, faces: [faceId…] }
  for (const c of cells) {
    const fl = c.faces.filter((fi) => isFloorOf(faces[fi], c.id));
    const par = new Map(fl.map((fi) => [fi, fi]));
    const find = (x) => { while (par.get(x) !== x) { par.set(x, par.get(par.get(x))); x = par.get(x); } return x; };
    for (let i = 0; i < fl.length; i++) for (let j = i + 1; j < fl.length; j++) {
      if (sharedKeys(fl[i], fl[j]) >= 2) {
        const r1 = find(fl[i]), r2 = find(fl[j]);
        if (r1 !== r2) par.set(r1, r2);
      }
    }
    const roots = new Map();
    for (const fi of fl) {
      const r = find(fi);
      if (!roots.has(r)) { roots.set(r, nodes.length); nodes.push({ cell: c.id, faces: [] }); }
      const nid = roots.get(r);
      nodes[nid].faces.push(fi);
      compOf.set(c.id + '_' + fi, nid);
    }
  }

  // -- crossing edges: an interior membrane F(a,b) is walk-crossable when it
  //    is NOT a floor-class plane (no walking up through a ceiling — that's a
  //    jump), it offers standing clearance, and both sides have a support
  //    floor meeting F's lower rim (shared vertices ⇒ the surfaces meet, so
  //    the walk is continuous — no step, no jump).
  const edges = [];
  const edgeIndex = new Map(); // faceId -> edge
  for (const f of faces) {
    if (f.boundary) continue;
    if (f.slope <= o.maxGrade) continue;                 // ceiling/floor plane
    if (f.top - f.sill < o.clearance) continue;          // can't stand through
    if (f.area < 1.1) continue;                          // too tight a gap
    const band = f.sill + Math.max(0.6, (f.top - f.sill) * 0.35);
    const rimKeys = new Set(f.verts.filter((p) => p[1] <= band).map(vkey));
    // a side connects when one of its floor faces meets the membrane's low
    // rim along an EDGE (two shared vertices) — the walk onto the crossing
    // is over an edge, never through a pinch point
    const sideFace = (cid) => {
      for (const fi of cells[cid].faces) {
        if (!isFloorOf(faces[fi], cid)) continue;
        let n = 0;
        for (const k of faceKeys(fi)) if (rimKeys.has(k)) { if (++n >= 2) return fi; }
      }
      return -1;
    };
    const fa = sideFace(f.a), fb = sideFace(f.b);
    if (fa < 0 || fb < 0) continue;
    const na = compOf.get(f.a + '_' + fa), nb = compOf.get(f.b + '_' + fb);
    if (na === undefined || nb === undefined || na === nb) continue;
    // the walkable crossing point: mid of the low rim where the two floors
    // meet the membrane — this is WHERE the certificate says you walk
    // The crossing STATION: a point on the rim where a standing body truly
    // fits through. Three body checks the playthrough bot forced, in order
    // of discovery: (1) the station must be on the rim stretch where the
    // floors actually touch the membrane, (2) the membrane's vertical
    // cross-section THERE must clear a standing body — global top−sill can
    // pass while the local opening is a slot, and (3) the standing column
    // must have LATERAL room: in a pinched corner an adjacent wall's plane
    // crosses the doorway within body radius and the sphere never fits.
    const ka = faceKeys(fa), kb = faceKeys(fb);
    let rim = f.verts.filter((p) => p[1] <= band && (ka.has(vkey(p)) || kb.has(vkey(p))));
    if (!rim.length) rim = f.verts.filter((p) => p[1] <= band);
    if (!rim.length) continue;
    let mx = 0, my = 0, mz = 0;
    for (const p of rim) { mx += p[0]; my += p[1]; mz += p[2]; }
    const mean = [mx / rim.length, my / rim.length, mz / rim.length];
    const cands = [mean, ...rim.map((p) => [(p[0] + mean[0]) / 2, (p[1] + mean[1]) / 2, (p[2] + mean[2]) / 2])];
    const hu = norm3([f.n[2], 0, -f.n[0]]); // horizontal direction along the face
    const section = (c) => {
      const sOf = (p) => (p[0] - c[0]) * hu[0] + (p[2] - c[2]) * hu[2];
      let lo = Infinity, hi = -Infinity;
      for (let i = 0; i < f.verts.length; i++) {
        const A = f.verts[i], B = f.verts[(i + 1) % f.verts.length];
        const sa = sOf(A), sb = sOf(B);
        if ((sa <= 0 && sb >= 0) || (sa >= 0 && sb <= 0)) {
          const t = Math.abs(sa - sb) < 1e-9 ? 0 : sa / (sa - sb);
          const y = A[1] + t * (B[1] - A[1]);
          lo = Math.min(lo, y); hi = Math.max(hi, y);
        }
      }
      return [lo, hi];
    };
    const lateralOK = (c, lo) => {
      // a chest-height point nudged into each cell must sit clear of that
      // cell's clamping planes (walls/scarps steeper than grade)
      for (const [cid, sgn] of [[f.a, -1], [f.b, 1]]) {
        const q = [c[0] + sgn * f.n[0] * 0.3, lo + 0.95, c[2] + sgn * f.n[2] * 0.3];
        for (const gi of cells[cid].faces) {
          if (gi === f.id) continue;
          const g = faces[gi];
          if (g.slope <= o.maxGrade) continue;  // floors/ceilings: vertical check covers
          const so = g.a === cid ? 1 : -1;
          const d = (g.n[0] * q[0] + g.n[1] * q[1] + g.n[2] * q[2]
            - (g.n[0] * g.centroid[0] + g.n[1] * g.centroid[1] + g.n[2] * g.centroid[2])) * so;
          if (d > -0.42) return false;
        }
      }
      return true;
    };
    let at = null, room = 0;
    for (const c of cands) {
      const [lo, hi] = section(c);
      if (hi - lo < o.clearance + 0.2) continue;
      if (!lateralOK(c, lo)) continue;
      if (hi - lo > room) { room = hi - lo; at = [c[0], lo, c[2]]; }
    }
    if (!at) continue;   // no station fits a standing body — not a crossing
    // faceA/faceB: the floor face on each side that meets the rim — the
    // last stepping stone of a certified leg
    const e = { face: f.id, a: na, b: nb, at, faceA: fa, faceB: fb, room };
    edges.push(e); edgeIndex.set(f.id, e);
  }

  // -- adjacency + BFS from the start basin. Every crossing shatters one
  //    membrane, so BFS depth == minimum breaches (par).
  const adj = nodes.map(() => []);
  for (const e of edges) { adj[e.a].push(e); adj[e.b].push(e); }

  // start: a chamber on the first climb layer (foam below it), nearest the
  // pocket's centre column — the dais goes on its floor
  let start = -1, bestS = Infinity;
  for (let ni = 0; ni < nodes.length; ni++) {
    const c = cells[nodes[ni].cell];
    if (c.layer !== o.subLayers) continue;
    const dx = c.centroid[0] - W / 2, dz = c.centroid[2] - D / 2;
    const dd = dx * dx + dz * dz;
    if (dd < bestS) { bestS = dd; start = ni; }
  }
  if (start < 0) return null;

  const dist = new Array(nodes.length).fill(-1);
  const prev = new Array(nodes.length).fill(-1);
  dist[start] = 0;
  const q = [start];
  for (let h = 0; h < q.length; h++) {
    const u = q[h];
    for (const e of adj[u]) {
      const v = e.a === u ? e.b : e.a;
      if (dist[v] < 0) { dist[v] = dist[u] + 1; prev[v] = u; q.push(v); }
    }
  }

  // target: a TOP-layer chamber whose certified distance sits in the puzzle
  // band — nearest to parTarget, never under parMin. The first target: climb
  // the foam.
  let target = -1, bestT = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const c = cells[nodes[i].cell];
    if (c.layer !== L - 1 || dist[i] < o.parMin) continue;
    const score = Math.abs(dist[i] - o.parTarget);
    if (score < bestT) { bestT = score; target = i; }
  }
  if (target < 0) return null; // no top chamber in reach — reroll the salt
  const par = dist[target];

  // the certified route (start → target node path)
  const route = [];
  for (let u = target; u !== -1; u = prev[u]) route.push(u);
  route.reverse();

  // -- the ORACLE: distance-to-target over the same graph, a next-step
  //    (membrane, node) for EVERY reachable basin, and the explicit shiva
  //    sequence from the start. This is the constructive proof the puzzle
  //    ships with, and what in-game guidance follows from wherever the
  //    player has wandered to.
  const distT = new Array(nodes.length).fill(-1);
  distT[target] = 0;
  const qt = [target];
  for (let h = 0; h < qt.length; h++) {
    const u = qt[h];
    for (const e of adj[u]) {
      const v = e.a === u ? e.b : e.a;
      if (distT[v] < 0) { distT[v] = distT[u] + 1; qt.push(v); }
    }
  }
  const next = new Array(nodes.length).fill(null);
  for (let u = 0; u < nodes.length; u++) {
    if (distT[u] <= 0) continue;
    let bestE = null;
    for (const e of adj[u]) {
      const v = e.a === u ? e.b : e.a;
      // among equally-short continuations, guide through the ROOMIEST door
      if (distT[v] === distT[u] - 1 && (!bestE || e.room > bestE.room)) bestE = e;
    }
    if (bestE) {
      next[u] = { face: bestE.face, node: bestE.a === u ? bestE.b : bestE.a, at: bestE.at,
        rimFace: bestE.a === u ? bestE.faceA : bestE.faceB,      // last stepping stone on THIS side
        farRimFace: bestE.a === u ? bestE.faceB : bestE.faceA }; // first floor on the far side
    }
  }
  const oracle = [];
  for (let u = start; u !== target; u = next[u].node) oracle.push(next[u].face);

  // -- the dais: a finite level disk embedded in the foam — the only flat
  //    ground state in the pocket. Centred on the start basin's largest
  //    floor face, sitting just proud of it.
  let daisFace = -1, bestA = 0;
  for (const fi of nodes[start].faces) {
    if (faces[fi].area > bestA) { bestA = faces[fi].area; daisFace = fi; }
  }
  const df = faces[daisFace];
  const dais = { x: df.centroid[0], y: df.centroid[1] + 0.06, z: df.centroid[2], r: o.daisR, face: daisFace };

  return {
    seed: o.seed, salt, W, H, D, opts: { ...o },
    cells, faces, nodes, edges, dais,
    basinOf: compOf,
    nav: { start, target, par, dist, distT, next, oracle, route,
      reachable: dist.filter((d) => d >= 0).length, nodeCount: nodes.length },
  };
}

// Support height of cell `cid` at column (x,z): the highest floor-face plane
// at or below y among CLOSED floor faces (openState: fn faceId -> true if the
// membrane is destroyed). Returns { y, faceId } or null. The app's ground
// probe and the selftest's continuity checks both use this.
export function supportAt(pocket, cid, x, y, z, isOpen, maxGrade) {
  const g = maxGrade ?? pocket.opts.maxGrade;
  let best = null;
  for (const fi of pocket.cells[cid].faces) {
    const f = pocket.faces[fi];
    if (f.slope > g) continue;
    const ny = f.a === cid ? f.n[1] : -f.n[1];
    if (ny >= 0) continue;                 // not a floor of this cell
    if (!f.boundary && isOpen && isOpen(f.id)) continue; // shattered floor = hole
    // plane height at (x,z): n·p = n·c  =>  y = (n·c - nx·x - nz·z)/ny
    const nc = dot3(f.n, f.centroid);
    const fy = (nc - f.n[0] * x - f.n[2] * z) / f.n[1];
    if (fy > y + 0.6) continue;
    // inside the face's column? 2D point-in-polygon (xz), dilated: a cell's
    // footprint at standing height can overhang its floor's footprint where
    // walls tilt, and a walker's ground probe must not fall into that crack
    if (!pointInPolyXZ(f.verts, x, z, 0.45)) continue;
    if (best === null || fy > best.y) best = { y: fy, faceId: f.id };
  }
  return best;
}

export function pointInPolyXZ(pts, x, z, tol = 0) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i][0], zi = pts[i][2], xj = pts[j][0], zj = pts[j][2];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  if (inside || !tol) return inside;
  // within tol of an edge?
  const t2 = tol * tol;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const ax = pts[j][0], az = pts[j][2], bx = pts[i][0], bz = pts[i][2];
    const ex = bx - ax, ez = bz - az;
    const L = ex * ex + ez * ez;
    let t = L > 1e-12 ? ((x - ax) * ex + (z - az) * ez) / L : 0;
    t = Math.max(0, Math.min(1, t));
    const dx = x - (ax + ex * t), dz = z - (az + ez * t);
    if (dx * dx + dz * dz <= t2) return true;
  }
  return false;
}
