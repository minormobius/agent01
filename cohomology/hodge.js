// cohomology/hodge.js — discrete Hodge decomposition on a triangulated planar
// domain with holes.
//
// No DOM, no imports. index.html and hodge.selftest.mjs both load THIS file, so
// the page and the node test exercise byte-identical code.
//
// COORDINATES. Everything lives in the unit square [0,1]² with **y pointing
// up** (standard maths orientation). The renderer flips y once, at draw time
// (sy = (1 - y) * H); that flip makes a mathematically counterclockwise loop
// also read as counterclockwise on screen, so "positive circulation" means the
// same thing to the solver and to the eye.
//
// THE OBJECT. A simplicial complex K = (V, E, F) triangulating the domain.
//   C⁰ = ℝ^V   a number per vertex          (a function)
//   C¹ = ℝ^E   a number per oriented edge   (a 1-form / 1-cochain)
//   C² = ℝ^F   a number per oriented face   (a 2-form)
// Each edge is stored once, oriented lo → hi. ω_e is the integral of the form
// along that direction; traversing the edge backwards negates it.
//
// THE OPERATORS.
//   d₀ : C⁰ → C¹     (d₀f)(a→b) = f(b) − f(a)          "discrete gradient"
//   d₁ : C¹ → C²     (d₁ω)(ijk) = ω(ij) + ω(jk) + ω(ki) "discrete curl"
// and d₁ ∘ d₀ = 0 identically — the telescoping sum around a triangle.
//
// THE THEOREM. With the identity inner product on each C^k, the adjoints are
// the transposes, and C¹ splits as an ORTHOGONAL direct sum
//
//     C¹  =  im(d₀)  ⊕  im(d₁ᵀ)  ⊕  ker(Δ₁),     Δ₁ = d₀d₀ᵀ + d₁ᵀd₁
//              exact      coexact      harmonic
//
// with ker(Δ₁) ≅ H¹(K; ℝ). For a planar domain with g holes, dim H¹ = g. The
// harmonic summand is therefore *entirely* a statement about topology: punch
// another hole and it gains a dimension; fill them all in and it vanishes.
//
// THE COMPUTATION. Both projections are one sparse solve each:
//   exact   = d₀f      where  (d₀ᵀd₀) f = d₀ᵀω     (graph Laplacian, singular
//                             on constants — CG in the mean-zero subspace)
//   coexact = d₁ᵀg     where  (d₁d₁ᵀ) g = d₁ω      (dual-graph Laplacian, SPD
//                             because the domain has boundary)
//   harmonic = ω − exact − coexact
// The two residuals ‖d₀ᵀh‖ and ‖d₁h‖ are then exactly the solver errors, which
// is why the ledger reports them: they are the proof that h really is harmonic.

// ─────────────────────────────────────────────────────────── prng + helpers ──

/** Deterministic 32-bit PRNG. Same seed ⇒ same mesh ⇒ same picture. */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Box–Muller, one standard normal per call. */
function gauss(rng) {
  let u = 0;
  while (u === 0) u = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}

export function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

export function norm(a) {
  return Math.sqrt(dot(a, a));
}

// ────────────────────────────────────────────────────────── hole placement ──

/**
 * Where the voids go. Laid out on a ring (a single hole sits in the middle)
 * rather than rejection-sampled, so every void is guaranteed to be separated
 * from its neighbours and from the outer boundary by real material, and the
 * composition stays balanced whatever the count.
 *
 * Returns the holes together with the mesh spacing they need: a void has to be
 * a few triangles across before removing it is topologically meaningful, so if
 * the requested spacing is too coarse for the radii that fit, the mesh is
 * refined rather than the geometry deformed.
 */
export function layoutHoles(rng, count, h) {
  if (count <= 0) return { holes: [], h };
  const RING = { 1: 0, 2: 0.225, 3: 0.25, 4: 0.255, 5: 0.28, 6: 0.295 };
  const R = RING[Math.min(count, 6)] ?? 0.295;

  // Two ceilings on the radius: ring neighbours must not touch, and the ring
  // must not touch the square's edge. Leave ~1.5 h of material in each gap.
  const rmaxFor = (hh) => {
    const sep = count > 1 ? R * Math.sin(Math.PI / count) : 0.21;
    return Math.max(0.02, Math.min(sep - 1.5 * hh, 0.5 - R - 0.045 - 1.5 * hh));
  };

  // A void needs ~2 h of radius (≈13 boundary segments) to read as a void.
  let hh = h;
  if (rmaxFor(hh) < 2 * hh) hh = rmaxFor(hh) / 2;
  const rmax = rmaxFor(hh);
  const rmin = Math.min(rmax, Math.max(2 * hh, rmax * 0.66));

  const phase = rng() * Math.PI * 2;
  const holes = [];
  for (let k = 0; k < count; k++) {
    const a = phase + (k / count) * Math.PI * 2;
    holes.push({
      cx: 0.5 + R * Math.cos(a),
      cy: 0.5 + R * Math.sin(a),
      r: rmin + rng() * (rmax - rmin),
    });
  }
  return { holes, h: hh };
}

// ─────────────────────────────────────────────────────────────── the mesh ──

/**
 * Triangulate the unit square minus `holes` circular voids.
 *
 * A structured staggered lattice, not a Delaunay of scattered points: rows of
 * vertices half a step out of phase, zipped into strips of near-equilateral
 * triangles. Triangles whose centroid falls inside a void are deleted, and the
 * vertices left ringing each void are pushed radially out onto its circle (only
 * where doing so keeps every incident triangle positively oriented), so the
 * voids read as circles rather than as staircases.
 *
 * The point of a structured mesh here is that the topology is not left to
 * chance: deleting a connected disk of triangles from a disk-shaped complex
 * adds exactly one to b₁, every time, at any density. `b1` on the returned mesh
 * is nonetheless always the *measured* Euler-characteristic value — the page
 * quotes what the complex actually is, never what was asked for.
 */
export function buildMesh(opts = {}) {
  const {
    holes: holeCount = 3,
    h: hRequested = 0.034,
    seed = 1,
    jitter = 0.13,
    maxRetries = 8,
  } = opts;

  let last = null;
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const rng = mulberry32(seed + attempt * 7919);
    const { holes, h } = layoutHoles(rng, holeCount, hRequested);
    const mesh = triangulate(holes, h, rng, jitter);
    mesh.seed = seed;
    mesh.attempt = attempt;
    mesh.hRequested = hRequested;
    last = mesh;
    if (mesh.b1 === holeCount) break;
  }
  return last;
}

function triangulate(holes, h, rng, jitter) {
  // Rows: spacing dy = h·√3/2, rounded so the rows span [0,1] exactly.
  const nRows = Math.max(3, Math.round(1 / (h * Math.sqrt(3) / 2)));
  const nCols = Math.max(3, Math.round(1 / h));

  const px = [], py = [];
  const rows = [];
  for (let j = 0; j <= nRows; j++) {
    const y = j / nRows;
    const row = [];
    if (j % 2 === 0) {
      for (let i = 0; i <= nCols; i++) { row.push(px.length); px.push(i / nCols); py.push(y); }
    } else {
      // Half-step offset, with the two ends pinned so the left and right sides
      // of the square stay straight.
      row.push(px.length); px.push(0); py.push(y);
      for (let i = 0; i < nCols; i++) { row.push(px.length); px.push((i + 0.5) / nCols); py.push(y); }
      row.push(px.length); px.push(1); py.push(y);
    }
    rows.push(row);
  }

  // Zip consecutive rows into a strip of triangles: always advance whichever
  // side's next vertex is further left, which is the standard sweep and yields
  // a valid, positively oriented triangulation for any two x-sorted rows.
  const tris = [];
  for (let j = 0; j < nRows; j++) {
    const A = rows[j], B = rows[j + 1];
    let a = 0, b = 0;
    while (a < A.length - 1 || b < B.length - 1) {
      const advanceA = b >= B.length - 1
        || (a < A.length - 1 && px[A[a + 1]] <= px[B[b + 1]]);
      if (advanceA) { tris.push([A[a], A[a + 1], B[b]]); a++; }
      else { tris.push([A[a], B[b + 1], B[b]]); b++; }
    }
  }

  // Carve the voids: drop every triangle whose centroid is inside one.
  const kept = tris.filter(([i, j, k]) => {
    const cx = (px[i] + px[j] + px[k]) / 3;
    const cy = (py[i] + py[j] + py[k]) / 3;
    for (const ho of holes) if (Math.hypot(cx - ho.cx, cy - ho.cy) < ho.r) return false;
    return true;
  });

  // Which triangles touch each vertex — needed for the two relaxation passes
  // below, both of which must not invert anything.
  const incidentTris = new Map();
  for (let t = 0; t < kept.length; t++) {
    for (const v of kept[t]) {
      if (!incidentTris.has(v)) incidentTris.set(v, []);
      incidentTris.get(v).push(t);
    }
  }
  const area2 = (t) => {
    const [i, j, k] = kept[t];
    return (px[j] - px[i]) * (py[k] - py[i]) - (px[k] - px[i]) * (py[j] - py[i]);
  };
  const MIN_AREA = 1e-9;
  const tryMove = (v, nx, ny) => {
    const ts = incidentTris.get(v);
    if (!ts) return false;
    const ox = px[v], oy = py[v];
    px[v] = nx; py[v] = ny;
    for (const t of ts) {
      if (area2(t) <= MIN_AREA) { px[v] = ox; py[v] = oy; return false; }
    }
    return true;
  };

  const onOuter = (v) => px[v] < 1e-12 || px[v] > 1 - 1e-12 || py[v] < 1e-12 || py[v] > 1 - 1e-12;

  // Round the voids. The rim of a void is read off the combinatorics — the
  // vertices of edges with exactly one surviving triangle — rather than from a
  // distance threshold, because missing even one rim vertex leaves it standing
  // proud of its projected neighbours as a visible notch.
  const eKey = (a, b) => (a < b ? a * 1e7 + b : b * 1e7 + a);
  const eCount = new Map();
  for (const t of kept) {
    for (let k = 0; k < 3; k++) {
      const key = eKey(t[k], t[(k + 1) % 3]);
      eCount.set(key, (eCount.get(key) || 0) + 1);
    }
  }
  const rim = holes.map(() => new Set());
  for (const t of kept) {
    for (let k = 0; k < 3; k++) {
      const a = t[k], b = t[(k + 1) % 3];
      if (eCount.get(eKey(a, b)) !== 1) continue;
      if (onOuter(a) && onOuter(b)) continue;
      const mx = (px[a] + px[b]) / 2, my = (py[a] + py[b]) / 2;
      for (let q = 0; q < holes.length; q++) {
        if (Math.hypot(mx - holes[q].cx, my - holes[q].cy) < holes[q].r + 3 * h) {
          rim[q].add(a); rim[q].add(b);
        }
      }
    }
  }

  const projected = new Set();
  holes.forEach((ho, q) => {
    for (const v of rim[q]) {
      if (onOuter(v) || projected.has(v)) continue;
      const dx = px[v] - ho.cx, dy = py[v] - ho.cy;
      const d = Math.hypot(dx, dy);
      if (d < 1e-12) continue;
      const tx = ho.cx + (dx / d) * ho.r, ty = ho.cy + (dy / d) * ho.r;
      // Full projection when it is safe, otherwise as far as it can go.
      for (const frac of [1, 0.75, 0.5, 0.25]) {
        if (tryMove(v, px[v] + frac * (tx - px[v]), py[v] + frac * (ty - py[v]))) {
          projected.add(v);
          break;
        }
      }
    }
  });

  // A little jitter so the substrate reads as a hand-drawn triangulation rather
  // than graph paper. Void rings and the outer boundary are left alone.
  if (jitter > 0) {
    for (const v of incidentTris.keys()) {
      if (onOuter(v) || projected.has(v)) continue;
      tryMove(v, px[v] + (rng() - 0.5) * jitter * h, py[v] + (rng() - 0.5) * jitter * h);
    }
  }

  return assemble(Float64Array.from(px), Float64Array.from(py), kept, holes, h);
}

/**
 * Turn a bag of triangles into a simplicial complex: renumber the vertices that
 * survive, build the edge list, keep the largest edge-connected component, and
 * read off the topology.
 */
function assemble(PX, PY, tris, holes, h) {
  // Largest edge-connected component of faces, so b₀ = 1 and stray flakes on
  // the boundary cannot skew the Betti count.
  const eKey = (a, b) => (a < b ? a * 1e7 + b : b * 1e7 + a);
  const byEdge = new Map();
  tris.forEach((t, i) => {
    for (let k = 0; k < 3; k++) {
      const key = eKey(t[k], t[(k + 1) % 3]);
      if (!byEdge.has(key)) byEdge.set(key, []);
      byEdge.get(key).push(i);
    }
  });
  const comp = new Int32Array(tris.length).fill(-1);
  let best = [], nc = 0;
  for (let i = 0; i < tris.length; i++) {
    if (comp[i] >= 0) continue;
    const stack = [i], group = [];
    comp[i] = nc;
    while (stack.length) {
      const f = stack.pop();
      group.push(f);
      const t = tris[f];
      for (let k = 0; k < 3; k++) {
        for (const g of byEdge.get(eKey(t[k], t[(k + 1) % 3]))) {
          if (comp[g] < 0) { comp[g] = nc; stack.push(g); }
        }
      }
    }
    if (group.length > best.length) best = group;
    nc++;
  }
  const faces3 = best.map((i) => tris[i]);

  // Renumber vertices.
  const remap = new Map();
  const xs = [], ys = [];
  const vid = (o) => {
    let v = remap.get(o);
    if (v === undefined) {
      v = xs.length;
      remap.set(o, v);
      xs.push(PX[o]);
      ys.push(PY[o]);
    }
    return v;
  };

  const faceVerts = [];
  for (const t of faces3) faceVerts.push([vid(t[0]), vid(t[1]), vid(t[2])]);
  const nV = xs.length;
  const X = Float64Array.from(xs), Y = Float64Array.from(ys);

  // Edges, stored once as lo → hi.
  const edgeIds = new Map();
  const elo = [], ehi = [];
  const edgeId = (a, b) => {
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const key = lo * nV + hi;
    let id = edgeIds.get(key);
    if (id === undefined) {
      id = elo.length;
      edgeIds.set(key, id);
      elo.push(lo);
      ehi.push(hi);
    }
    return id;
  };

  const nF = faceVerts.length;
  const fv = new Int32Array(3 * nF);
  const fe = new Int32Array(3 * nF);
  const fs = new Int8Array(3 * nF);

  for (let f = 0; f < nF; f++) {
    let [a, b, c] = faceVerts[f];
    // Force counterclockwise (positive signed area, y up).
    const s = (X[b] - X[a]) * (Y[c] - Y[a]) - (X[c] - X[a]) * (Y[b] - Y[a]);
    if (s < 0) { const tmp = b; b = c; c = tmp; }
    const v = [a, b, c];
    for (let k = 0; k < 3; k++) {
      const p = v[k], q = v[(k + 1) % 3];
      const id = edgeId(p, q);
      fv[3 * f + k] = p;
      fe[3 * f + k] = id;
      fs[3 * f + k] = p < q ? 1 : -1; // +1 when the face traverses lo → hi
    }
  }

  const nE = elo.length;
  const edges = new Int32Array(2 * nE);
  for (let e = 0; e < nE; e++) { edges[2 * e] = elo[e]; edges[2 * e + 1] = ehi[e]; }

  const mesh = {
    X, Y, nV, nE, nF, edges, fv, fe, fs, holes, h,
    components: nc,
    edgeOf: edgeIds, // (lo·nV + hi) → edge index, for hand-drawn cycles
  };

  buildFaceGeometry(mesh);
  buildVertexAdjacency(mesh);
  buildBoundary(mesh);
  buildLocator(mesh);

  // Euler characteristic ⇒ homology. b₀ = 1 by construction (we kept one
  // edge-connected component); b₂ = 0 for a surface with boundary; so
  // b₁ = b₀ − χ = 1 − (V − E + F).
  mesh.chi = nV - nE + nF;
  mesh.b0 = 1;
  mesh.b1 = mesh.b0 - mesh.chi;
  return mesh;
}

/** Per-face affine data: the three barycentric gradients and their constants. */
function buildFaceGeometry(mesh) {
  const { nF, fv, X, Y } = mesh;
  const gx = new Float64Array(3 * nF);
  const gy = new Float64Array(3 * nF);
  const gc = new Float64Array(3 * nF);
  const area = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const i = fv[3 * f], j = fv[3 * f + 1], k = fv[3 * f + 2];
    const twoA = (X[j] - X[i]) * (Y[k] - Y[i]) - (X[k] - X[i]) * (Y[j] - Y[i]);
    area[f] = twoA / 2;
    const idx = [i, j, k];
    for (let t = 0; t < 3; t++) {
      const a = idx[t], b = idx[(t + 1) % 3], c = idx[(t + 2) % 3];
      // ∇λ_a = ( y_b − y_c , x_c − x_b ) / 2A
      const ux = (Y[b] - Y[c]) / twoA;
      const uy = (X[c] - X[b]) / twoA;
      gx[3 * f + t] = ux;
      gy[3 * f + t] = uy;
      gc[3 * f + t] = 1 - (ux * X[a] + uy * Y[a]); // λ_a(p) = gc + ∇λ_a·p
    }
  }
  mesh.gx = gx; mesh.gy = gy; mesh.gc = gc; mesh.area = area;
}

/** CSR vertex→(neighbour, edge) adjacency, for shortest paths. */
function buildVertexAdjacency(mesh) {
  const { nV, nE, edges } = mesh;
  const deg = new Int32Array(nV);
  for (let e = 0; e < nE; e++) { deg[edges[2 * e]]++; deg[edges[2 * e + 1]]++; }
  const start = new Int32Array(nV + 1);
  for (let i = 0; i < nV; i++) start[i + 1] = start[i] + deg[i];
  const cur = start.slice(0, nV);
  const nbr = new Int32Array(2 * nE);
  const via = new Int32Array(2 * nE);
  for (let e = 0; e < nE; e++) {
    const a = edges[2 * e], b = edges[2 * e + 1];
    nbr[cur[a]] = b; via[cur[a]++] = e;
    nbr[cur[b]] = a; via[cur[b]++] = e;
  }
  mesh.adjStart = start; mesh.adjNbr = nbr; mesh.adjEdge = via; mesh.degree = deg;
}

/**
 * Boundary loops. An edge with exactly one incident face is a boundary edge;
 * orienting it the way its single face traverses it makes the outer loop
 * counterclockwise and every hole loop clockwise. Hole loops are then reversed
 * so that all of them come back counterclockwise — the orientation the periods
 * are quoted in.
 */
function buildBoundary(mesh) {
  const { nE, nF, fe, fs, edges, X, Y } = mesh;
  const incident = new Int32Array(nE);
  for (let f = 0; f < nF; f++) for (let k = 0; k < 3; k++) incident[fe[3 * f + k]]++;

  const next = new Map(); // directed a → b along the induced boundary
  const bEdges = [];
  for (let f = 0; f < nF; f++) {
    for (let k = 0; k < 3; k++) {
      const e = fe[3 * f + k];
      if (incident[e] !== 1) continue;
      const s = fs[3 * f + k];
      const a = s > 0 ? edges[2 * e] : edges[2 * e + 1];
      const b = s > 0 ? edges[2 * e + 1] : edges[2 * e];
      next.set(a, { to: b, edge: e, sign: s });
      bEdges.push(e);
    }
  }

  const seen = new Set();
  const loops = [];
  for (const startV of next.keys()) {
    if (seen.has(startV)) continue;
    const verts = [], eIdx = [], sgn = [];
    let v = startV, guard = 0;
    while (guard++ < next.size + 2) {
      if (seen.has(v)) break;
      seen.add(v);
      const step = next.get(v);
      if (!step) break;
      verts.push(v);
      eIdx.push(step.edge);
      sgn.push(step.sign);
      v = step.to;
      if (v === startV) break;
    }
    if (verts.length < 3) continue;
    let A = 0;
    for (let i = 0; i < verts.length; i++) {
      const p = verts[i], q = verts[(i + 1) % verts.length];
      A += X[p] * Y[q] - X[q] * Y[p];
    }
    loops.push({ verts, edges: eIdx, signs: sgn, area: A / 2 });
  }

  // Counterclockwise ⇒ outer; clockwise ⇒ hole. Flip the holes.
  const outer = loops.filter((l) => l.area > 0).sort((a, b) => b.area - a.area)[0] || null;
  const holeLoops = loops.filter((l) => l !== outer).map((l) => ({
    verts: l.verts.slice().reverse(),
    edges: l.edges.slice().reverse(),
    signs: l.signs.map((s) => -s).reverse(),
    area: -l.area,
    cx: l.verts.reduce((s, v) => s + X[v], 0) / l.verts.length,
    cy: l.verts.reduce((s, v) => s + Y[v], 0) / l.verts.length,
  }));
  // Match the drawing order of `holes` so period k lines up with hole k.
  holeLoops.sort((a, b) => {
    const ia = nearestHole(mesh.holes, a.cx, a.cy);
    const ib = nearestHole(mesh.holes, b.cx, b.cy);
    return ia - ib;
  });

  mesh.incident = incident;
  mesh.outerLoop = outer;
  mesh.holeLoops = holeLoops;
  mesh.boundaryEdges = bEdges;
}

function nearestHole(holes, x, y) {
  let bi = -1, bd = Infinity;
  for (let i = 0; i < holes.length; i++) {
    const d = Math.hypot(x - holes[i].cx, y - holes[i].cy);
    if (d < bd) { bd = d; bi = i; }
  }
  return bi;
}

/** Uniform grid over the faces, for locating the triangle under a point. */
function buildLocator(mesh) {
  const n = Math.max(4, Math.min(90, Math.ceil(1 / (2.2 * mesh.h))));
  const cells = new Array(n * n);
  for (let i = 0; i < n * n; i++) cells[i] = [];
  const { nF, fv, X, Y } = mesh;
  const clamp = (v) => Math.max(0, Math.min(n - 1, v));
  for (let f = 0; f < nF; f++) {
    const i = fv[3 * f], j = fv[3 * f + 1], k = fv[3 * f + 2];
    const x0 = clamp(Math.floor(Math.min(X[i], X[j], X[k]) * n));
    const x1 = clamp(Math.floor(Math.max(X[i], X[j], X[k]) * n));
    const y0 = clamp(Math.floor(Math.min(Y[i], Y[j], Y[k]) * n));
    const y1 = clamp(Math.floor(Math.max(Y[i], Y[j], Y[k]) * n));
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) cells[yy * n + xx].push(f);
  }
  mesh.gridN = n;
  mesh.gridCells = cells;
}

// ───────────────────────────────────────────────────────────── operators ──

/** d₀ : C⁰ → C¹. (d₀f)(a→b) = f(b) − f(a). */
export function applyD0(mesh, f, out) {
  const { nE, edges } = mesh;
  out = out || new Float64Array(nE);
  for (let e = 0; e < nE; e++) out[e] = f[edges[2 * e + 1]] - f[edges[2 * e]];
  return out;
}

/** d₀ᵀ : C¹ → C⁰, the discrete divergence (up to sign). */
export function applyD0T(mesh, w, out) {
  const { nV, nE, edges } = mesh;
  out = out || new Float64Array(nV);
  out.fill(0);
  for (let e = 0; e < nE; e++) {
    out[edges[2 * e]] -= w[e];
    out[edges[2 * e + 1]] += w[e];
  }
  return out;
}

/** d₁ : C¹ → C², the sum around each triangle's boundary. */
export function applyD1(mesh, w, out) {
  const { nF, fe, fs } = mesh;
  out = out || new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    out[f] = fs[3 * f] * w[fe[3 * f]]
           + fs[3 * f + 1] * w[fe[3 * f + 1]]
           + fs[3 * f + 2] * w[fe[3 * f + 2]];
  }
  return out;
}

/** d₁ᵀ : C² → C¹. */
export function applyD1T(mesh, g, out) {
  const { nE, nF, fe, fs } = mesh;
  out = out || new Float64Array(nE);
  out.fill(0);
  for (let f = 0; f < nF; f++) {
    for (let k = 0; k < 3; k++) out[fe[3 * f + k]] += fs[3 * f + k] * g[f];
  }
  return out;
}

/** The full 1-form Laplacian Δ₁ = d₀d₀ᵀ + d₁ᵀd₁ (used only to certify h). */
export function applyL1(mesh, w, out) {
  const a = applyD0(mesh, applyD0T(mesh, w));
  const b = applyD1T(mesh, applyD1(mesh, w));
  out = out || new Float64Array(mesh.nE);
  for (let e = 0; e < mesh.nE; e++) out[e] = a[e] + b[e];
  return out;
}

// ─────────────────────────────────────────────────────────── the solver ──

/**
 * Conjugate gradients. `project` (used for the singular vertex Laplacian)
 * removes the nullspace — constants — from the residual on every iteration, so
 * CG runs in the orthogonal complement where the operator is positive definite.
 */
export function cg(matvec, b, n, { tol = 1e-12, maxIter = 6000, project = null } = {}) {
  const x = new Float64Array(n);
  const r = Float64Array.from(b);
  const p = new Float64Array(n);
  const Ap = new Float64Array(n);
  if (project) project(r);
  p.set(r);
  let rs = dot(r, r);
  const bn = Math.sqrt(dot(b, b)) || 1;
  let it = 0;
  for (; it < maxIter; it++) {
    if (Math.sqrt(rs) / bn <= tol) break;
    matvec(p, Ap);
    if (project) project(Ap);
    const pAp = dot(p, Ap);
    if (!(pAp > 1e-300)) break;
    const al = rs / pAp;
    for (let i = 0; i < n; i++) { x[i] += al * p[i]; r[i] -= al * Ap[i]; }
    if (project) project(r);
    const rs2 = dot(r, r);
    const be = rs2 / rs;
    for (let i = 0; i < n; i++) p[i] = r[i] + be * p[i];
    rs = rs2;
  }
  return { x, iters: it, relResid: Math.sqrt(rs) / bn };
}

function meanZero(v) {
  let s = 0;
  for (let i = 0; i < v.length; i++) s += v[i];
  s /= v.length;
  for (let i = 0; i < v.length; i++) v[i] -= s;
}

// ────────────────────────────────────────────────── the decomposition ──

/**
 * Split ω into exact ⊕ coexact ⊕ harmonic.
 *
 * Returns the three components, the potentials that generated the first two,
 * the energies (which add up to ‖ω‖² because the sum is orthogonal), and the
 * residuals that certify the harmonic part really is closed and coclosed.
 */
export function decompose(mesh, omega, opts = {}) {
  const tol = opts.tol ?? 1e-13;
  const t0 = now();

  // exact: solve (d₀ᵀd₀) f = d₀ᵀω in the mean-zero subspace.
  const rhs0 = applyD0T(mesh, omega);
  const scratchE = new Float64Array(mesh.nE);
  const solve0 = cg(
    (v, out) => { applyD0(mesh, v, scratchE); applyD0T(mesh, scratchE, out); },
    rhs0, mesh.nV, { tol, project: meanZero },
  );
  const potential = solve0.x;
  const exact = applyD0(mesh, potential);

  // coexact: solve (d₁d₁ᵀ) g = d₁ω. Positive definite on a domain with boundary.
  const rhs2 = applyD1(mesh, omega);
  const scratchE2 = new Float64Array(mesh.nE);
  const solve2 = cg(
    (v, out) => { applyD1T(mesh, v, scratchE2); applyD1(mesh, scratchE2, out); },
    rhs2, mesh.nF, { tol },
  );
  const copotential = solve2.x;
  const coexact = applyD1T(mesh, copotential);

  // harmonic: what is left over.
  const harmonic = new Float64Array(mesh.nE);
  for (let e = 0; e < mesh.nE; e++) harmonic[e] = omega[e] - exact[e] - coexact[e];

  const E = dot(omega, omega);
  const Ee = dot(exact, exact);
  const Ec = dot(coexact, coexact);
  const Eh = dot(harmonic, harmonic);

  return {
    omega, exact, coexact, harmonic, potential, copotential,
    energy: { total: E, exact: Ee, coexact: Ec, harmonic: Eh },
    // Orthogonality defects, relative to ‖ω‖². Should be ~1e-12.
    ortho: {
      ec: Math.abs(dot(exact, coexact)) / (E || 1),
      eh: Math.abs(dot(exact, harmonic)) / (E || 1),
      ch: Math.abs(dot(coexact, harmonic)) / (E || 1),
      pythagoras: Math.abs(E - Ee - Ec - Eh) / (E || 1),
    },
    // Harmonic certificate: h is closed (d₁h = 0) and coclosed (d₀ᵀh = 0).
    residual: {
      closed: norm(applyD1(mesh, harmonic)) / (Math.sqrt(E) || 1),
      coclosed: norm(applyD0T(mesh, harmonic)) / (Math.sqrt(E) || 1),
      laplacian: norm(applyL1(mesh, harmonic)) / (Math.sqrt(E) || 1),
    },
    iters: { vertex: solve0.iters, face: solve2.iters },
    ms: now() - t0,
  };
}

function now() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

// ───────────────────────────────────────────────────── forms and periods ──

/**
 * A random 1-form.
 *
 * `smooth` (the default) integrates a smooth random plane field along each
 * edge: u = ∇φ + ∇⊥ψ with φ, ψ built from a handful of random plane waves. It
 * is the honest hard case — u is manifestly a gradient plus a curl on the whole
 * plane, and yet on a domain with voids it still carries a harmonic remainder,
 * because ψ's sources are hidden inside the holes.
 *
 * `noise` puts an independent gaussian on every edge instead.
 */
export function randomForm(mesh, { seed = 1, mode = 'smooth', modes = 4, normalize = true } = {}) {
  const rng = mulberry32(seed >>> 0);
  const w = new Float64Array(mesh.nE);

  if (mode === 'noise') {
    for (let e = 0; e < mesh.nE; e++) {
      const a = mesh.edges[2 * e], b = mesh.edges[2 * e + 1];
      const len = Math.hypot(mesh.X[b] - mesh.X[a], mesh.Y[b] - mesh.Y[a]);
      w[e] = gauss(rng) * len;
    }
  } else {
    const wav = [];
    for (let m = 0; m < modes; m++) {
      const mk = () => {
        const th = rng() * Math.PI * 2;
        const k = (1 + Math.floor(rng() * 3)) * 2 * Math.PI;
        return { kx: k * Math.cos(th), ky: k * Math.sin(th), ph: rng() * Math.PI * 2, a: (0.4 + rng()) / k };
      };
      wav.push({ grad: mk(), curl: mk() });
    }
    const field = (x, y) => {
      let ux = 0, uy = 0;
      for (const { grad: g, curl: c } of wav) {
        const cg2 = g.a * Math.cos(g.kx * x + g.ky * y + g.ph);
        ux += g.kx * cg2; uy += g.ky * cg2;                 // ∇φ
        const cc = c.a * Math.cos(c.kx * x + c.ky * y + c.ph);
        ux += -c.ky * cc; uy += c.kx * cc;                  // ∇⊥ψ
      }
      return [ux, uy];
    };
    // 3-point Gauss along each edge.
    const g3 = [0.5 - 0.5 * Math.sqrt(3 / 5), 0.5, 0.5 + 0.5 * Math.sqrt(3 / 5)];
    const gw = [5 / 18, 8 / 18, 5 / 18];
    for (let e = 0; e < mesh.nE; e++) {
      const a = mesh.edges[2 * e], b = mesh.edges[2 * e + 1];
      const dx = mesh.X[b] - mesh.X[a], dy = mesh.Y[b] - mesh.Y[a];
      let s = 0;
      for (let q = 0; q < 3; q++) {
        const [ux, uy] = field(mesh.X[a] + g3[q] * dx, mesh.Y[a] + g3[q] * dy);
        s += gw[q] * (ux * dx + uy * dy);
      }
      w[e] = s;
    }
  }

  if (normalize) {
    const n = norm(w) || 1;
    for (let e = 0; e < mesh.nE; e++) w[e] /= n;
  }
  return w;
}

/** ∮ of a 1-form around a directed cycle given as {edges, signs}. */
export function integrateCycle(w, cycle) {
  let s = 0;
  for (let i = 0; i < cycle.edges.length; i++) s += cycle.signs[i] * w[cycle.edges[i]];
  return s;
}

/** The periods of a 1-form: ∮ counterclockwise around each hole. */
export function periods(mesh, w) {
  return mesh.holeLoops.map((l) => integrateCycle(w, l));
}

/**
 * A basis of H¹ dual to the hole cycles: `basis[m]` is harmonic and has period
 * δ_{km} around hole k. Built by decomposing g random forms and inverting the
 * resulting g × g period matrix — which doubles as a proof that the pairing
 * H¹ × H₁ → ℝ is nondegenerate, since a singular matrix would mean some
 * harmonic field is invisible to every cycle.
 */
export function harmonicBasis(mesh, { seed = 12345 } = {}) {
  const g = mesh.b1;
  if (g === 0) return { basis: [], matrix: [], det: 1, cond: 1 };
  const raw = [];
  for (let m = 0; m < g; m++) {
    raw.push(decompose(mesh, randomForm(mesh, { seed: seed + m * 1013, mode: 'smooth' })).harmonic);
  }
  // M[k][m] = period of raw[m] around hole k.
  const M = [];
  for (let k = 0; k < g; k++) {
    M.push(raw.map((h) => integrateCycle(h, mesh.holeLoops[k])));
  }
  const inv = invert(M);
  const basis = [];
  for (let m = 0; m < g; m++) {
    const b = new Float64Array(mesh.nE);
    for (let j = 0; j < g; j++) {
      const c = inv[j][m];
      const hj = raw[j];
      for (let e = 0; e < mesh.nE; e++) b[e] += c * hj[e];
    }
    basis.push(b);
  }
  return { basis, matrix: M, det: determinant(M) };
}

function determinant(M) {
  const n = M.length;
  const A = M.map((r) => r.slice());
  let det = 1;
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (Math.abs(A[piv][i]) < 1e-300) return 0;
    if (piv !== i) { const t = A[piv]; A[piv] = A[i]; A[i] = t; det = -det; }
    det *= A[i][i];
    for (let r = i + 1; r < n; r++) {
      const f = A[r][i] / A[i][i];
      for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
    }
  }
  return det;
}

function invert(M) {
  const n = M.length;
  const A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let i = 0; i < n; i++) {
    let piv = i;
    for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
    if (piv !== i) { const t = A[piv]; A[piv] = A[i]; A[i] = t; }
    const d = A[i][i];
    for (let c = 0; c < 2 * n; c++) A[i][c] /= d;
    for (let r = 0; r < n; r++) {
      if (r === i) continue;
      const f = A[r][i];
      if (f === 0) continue;
      for (let c = 0; c < 2 * n; c++) A[r][c] -= f * A[i][c];
    }
  }
  return A.map((r) => r.slice(n));
}

/**
 * Numerical dimension of the harmonic space: decompose `g + 2` random forms and
 * count how many independent directions their harmonic parts span, by modified
 * Gram–Schmidt. Should come back equal to b₁ — an independent check on the
 * Euler-characteristic count.
 */
export function harmonicRank(mesh, { seed = 777, extra = 2, tol = 1e-6 } = {}) {
  const trials = mesh.b1 + extra;
  const vecs = [];
  let rank = 0;
  for (let t = 0; t < trials; t++) {
    const w = randomForm(mesh, { seed: seed + t * 3571 });
    const h = decompose(mesh, w).harmonic;
    // Everything is measured against ‖ω‖, so that when there is no harmonic
    // space at all the leftover — pure solver noise at ~1e-12·‖ω‖ — is counted
    // as the zero it is, rather than as a direction.
    const scale = norm(w) || 1;
    if (norm(h) / scale < tol) continue;
    const v = Float64Array.from(h);
    for (const u of vecs) {
      const c = dot(v, u);
      for (let e = 0; e < v.length; e++) v[e] -= c * u[e];
    }
    const n1 = norm(v);
    if (n1 / scale > tol) {
      for (let e = 0; e < v.length; e++) v[e] /= n1;
      vecs.push(v);
      rank++;
    }
  }
  return rank;
}

// ──────────────────────────────────────────────── whitney interpolation ──

/**
 * Reconstruct a continuous vector field from the cochain.
 *
 * Inside a triangle the Whitney 1-form of edge (a,b) is
 *     W_ab = λ_a ∇λ_b − λ_b ∇λ_a,
 * and the field is Σ_edges ω_e W_e. Its defining property is that the line
 * integral of W_ab along edge (a,b) is 1 and along the other two edges is 0 —
 * so the reconstruction integrates back to exactly the numbers you started
 * with. That is what makes the picture an honest portrait of the cochain rather
 * than a smoothed impression of it, and hodge.selftest.mjs checks it.
 */
export function evalField(mesh, w, x, y, hint = -1) {
  const f = locate(mesh, x, y, hint);
  if (f < 0) return { ux: 0, uy: 0, face: -1 };
  return { ...fieldInFace(mesh, w, f, x, y), face: f };
}

export function fieldInFace(mesh, w, f, x, y) {
  const { gx, gy, gc, fe, fs } = mesh;
  const lam = [
    gc[3 * f] + gx[3 * f] * x + gy[3 * f] * y,
    gc[3 * f + 1] + gx[3 * f + 1] * x + gy[3 * f + 1] * y,
    gc[3 * f + 2] + gx[3 * f + 2] * x + gy[3 * f + 2] * y,
  ];
  let ux = 0, uy = 0;
  for (let t = 0; t < 3; t++) {
    const p = t, q = (t + 1) % 3;
    const c = fs[3 * f + t] * w[fe[3 * f + t]];
    ux += c * (lam[p] * gx[3 * f + q] - lam[q] * gx[3 * f + p]);
    uy += c * (lam[p] * gy[3 * f + q] - lam[q] * gy[3 * f + p]);
  }
  return { ux, uy };
}

/** Which triangle contains (x, y)? −1 if the point is in a void or outside. */
export function locate(mesh, x, y, hint = -1) {
  if (hint >= 0 && inFace(mesh, hint, x, y)) return hint;
  const n = mesh.gridN;
  const cx = Math.floor(x * n), cy = Math.floor(y * n);
  if (cx < 0 || cy < 0 || cx >= n || cy >= n) return -1;
  for (const f of mesh.gridCells[cy * n + cx]) if (inFace(mesh, f, x, y)) return f;
  return -1;
}

function inFace(mesh, f, x, y) {
  const { gx, gy, gc } = mesh;
  const e = -1e-9;
  const l0 = gc[3 * f] + gx[3 * f] * x + gy[3 * f] * y;
  if (l0 < e) return false;
  const l1 = gc[3 * f + 1] + gx[3 * f + 1] * x + gy[3 * f + 1] * y;
  if (l1 < e) return false;
  const l2 = gc[3 * f + 2] + gx[3 * f + 2] * x + gy[3 * f + 2] * y;
  return l2 >= e;
}

/**
 * A robust display scale: the q-th quantile of the field's speed sampled at the
 * face barycentres. Used so that the harmonic part — typically a fraction of a
 * percent of ‖ω‖² — can be drawn at the same visual amplitude as the whole
 * form without lying about its size (the true energy is reported separately).
 */
export function speedQuantile(mesh, w, q = 0.9) {
  const { nF, fv, X, Y } = mesh;
  if (nF === 0) return 1;
  const sp = new Float64Array(nF);
  for (let f = 0; f < nF; f++) {
    const i = fv[3 * f], j = fv[3 * f + 1], k = fv[3 * f + 2];
    const bx = (X[i] + X[j] + X[k]) / 3, by = (Y[i] + Y[j] + Y[k]) / 3;
    const { ux, uy } = fieldInFace(mesh, w, f, bx, by);
    sp[f] = Math.hypot(ux, uy);
  }
  const s = Array.from(sp).sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))] || 1;
}

// ──────────────────────────────────────────────────────── cycles by hand ──

/** Dijkstra along mesh edges. Returns the vertex path from `a` to `b`. */
export function shortestPath(mesh, a, b) {
  const { nV, adjStart, adjNbr, X, Y } = mesh;
  const dist = new Float64Array(nV).fill(Infinity);
  const prev = new Int32Array(nV).fill(-1);
  const done = new Uint8Array(nV);
  dist[a] = 0;
  const heap = [[0, a]];
  const push = (d, v) => {
    heap.push([d, v]);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p][0] <= heap[i][0]) break;
      const t = heap[p]; heap[p] = heap[i]; heap[i] = t; i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop();
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
        if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
        if (m === i) break;
        const t = heap[m]; heap[m] = heap[i]; heap[i] = t; i = m;
      }
    }
    return top;
  };
  while (heap.length) {
    const [d, v] = pop();
    if (done[v]) continue;
    done[v] = 1;
    if (v === b) break;
    for (let p = adjStart[v]; p < adjStart[v + 1]; p++) {
      const u = adjNbr[p];
      if (done[u]) continue;
      const nd = d + Math.hypot(X[u] - X[v], Y[u] - Y[v]);
      if (nd < dist[u]) { dist[u] = nd; prev[u] = v; push(nd, u); }
    }
  }
  if (!done[b] && a !== b) return null;
  const path = [b];
  let v = b;
  while (v !== a) {
    v = prev[v];
    if (v < 0) return null;
    path.push(v);
  }
  return path.reverse();
}

/** Nearest mesh vertex to a point. */
export function nearestVertex(mesh, x, y) {
  let bi = -1, bd = Infinity;
  for (let v = 0; v < mesh.nV; v++) {
    const d = (mesh.X[v] - x) ** 2 + (mesh.Y[v] - y) ** 2;
    if (d < bd) { bd = d; bi = v; }
  }
  return bi;
}

/**
 * Turn a list of clicked vertices into a closed cycle of mesh edges, so that
 * ∮ over it is an exact finite sum of cochain values — no quadrature, no
 * discretisation error, just ± the numbers stored on the edges.
 */
export function buildCycle(mesh, anchors) {
  if (anchors.length < 3) return null;
  const verts = [];
  for (let i = 0; i < anchors.length; i++) {
    const seg = shortestPath(mesh, anchors[i], anchors[(i + 1) % anchors.length]);
    if (!seg) return null;
    for (let k = 0; k < seg.length - 1; k++) verts.push(seg[k]);
  }
  if (verts.length < 3) return null;
  const edges = [], signs = [];
  const key = mesh.edgeOf;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    if (a === b) continue;
    const lo = Math.min(a, b), hi = Math.max(a, b);
    const e = key.get(lo * mesh.nV + hi);
    if (e === undefined) return null;
    edges.push(e);
    signs.push(a === lo ? 1 : -1);
  }
  return { verts, edges, signs };
}

/**
 * Winding number of a closed vertex path around a point — which hole classes
 * the cycle actually represents in H₁.
 */
export function windingNumber(mesh, verts, px, py) {
  let total = 0;
  for (let i = 0; i < verts.length; i++) {
    const a = verts[i], b = verts[(i + 1) % verts.length];
    let d = Math.atan2(mesh.Y[b] - py, mesh.X[b] - px) - Math.atan2(mesh.Y[a] - py, mesh.X[a] - px);
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    total += d;
  }
  return Math.round(total / (2 * Math.PI));
}

/** Winding numbers of a cycle around every hole, in hole-loop order. */
export function windingVector(mesh, verts) {
  return mesh.holeLoops.map((l) => windingNumber(mesh, verts, l.cx, l.cy));
}
