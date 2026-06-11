// hoop/foam3d.js — the top-down level extractor.
//
// The world is a 3D cellular foam filling the shell. A roguelike LEVEL is a planar cut
// through it: fit a plane across a region of cells (least squares — PCA / an eigenproblem),
// keep the cells the plane passes through, project them, and the result is a top-down map
// of rooms + the doors between them. Move radially → fit the NEXT plane → the next level.
//
// This is the "calculations on the back end": 3D seeds → 3×3 covariance → Jacobi eigen →
// best-fit plane → projection → 2D Voronoi rooms + adjacency. Runs in node and the browser.
(function (root) {
  'use strict';
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  function fnv() { let h = 2166136261 >>> 0; for (let i = 0; i < arguments.length; i++) { h ^= arguments[i] >>> 0; h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function mulberry(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  // ── 3D seeds in a shell slab: Lx (axial) × Ly (circumferential) × T (radial, thin),
  //    density graded toward the hull (high z). Deterministic from (seed, blockIndex). ──
  function seeds3d(o) {
    const Lx = o.Lx, Ly = o.Ly, T = o.thickness, cell = o.cell || 24, grade = o.grade == null ? 0.5 : o.grade;
    const rng = mulberry(fnv(o.seed || 0, o.blockIndex || 0, Lx | 0, Ly | 0));
    const nx = Math.max(2, Math.round(Lx / cell)), ny = Math.max(2, Math.round(Ly / cell)), nz = Math.max(2, Math.round(T / cell));
    const pts = [];
    for (let iz = 0; iz < nz; iz++) {
      const zc = (iz + 0.5) / nz, dens = 1 + grade * zc;               // denser toward hull
      for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++) {
        if (rng() > dens / (1 + grade)) continue;                       // thinning toward core
        pts.push({
          x: (ix + 0.5 + 0.7 * (rng() - 0.5)) * Lx / nx,
          y: (iy + 0.5 + 0.7 * (rng() - 0.5)) * Ly / ny,
          z: (iz + 0.5 + 0.7 * (rng() - 0.5)) * T / nz,
        });
      }
    }
    return pts;
  }

  // ── PCA: 3×3 covariance, Jacobi symmetric eigen → {mean, axes (u,v,n), vals desc} ──
  function jacobi3(A) {
    const a = A.map((r) => r.slice()), V = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    for (let it = 0; it < 60; it++) {
      let p = 0, q = 1, m = Math.abs(a[0][1]);
      if (Math.abs(a[0][2]) > m) { m = Math.abs(a[0][2]); p = 0; q = 2; }
      if (Math.abs(a[1][2]) > m) { m = Math.abs(a[1][2]); p = 1; q = 2; }
      if (m < 1e-12) break;
      const phi = 0.5 * Math.atan2(2 * a[p][q], a[p][p] - a[q][q]), c = Math.cos(phi), s = Math.sin(phi);
      for (let k = 0; k < 3; k++) { const kp = a[k][p], kq = a[k][q]; a[k][p] = c * kp - s * kq; a[k][q] = s * kp + c * kq; }
      for (let k = 0; k < 3; k++) { const pk = a[p][k], qk = a[q][k]; a[p][k] = c * pk - s * qk; a[q][k] = s * pk + c * qk; }
      for (let k = 0; k < 3; k++) { const kp = V[k][p], kq = V[k][q]; V[k][p] = c * kp - s * kq; V[k][q] = s * kp + c * kq; }
    }
    const vals = [a[0][0], a[1][1], a[2][2]], vecs = [0, 1, 2].map((j) => [V[0][j], V[1][j], V[2][j]]);
    return { vals, vecs };
  }
  function pca(pts) {
    const n = pts.length, m = [0, 0, 0];
    for (const p of pts) { m[0] += p.x; m[1] += p.y; m[2] += p.z; }
    m[0] /= n; m[1] /= n; m[2] /= n;
    const C = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    for (const p of pts) { const d = [p.x - m[0], p.y - m[1], p.z - m[2]]; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] += d[i] * d[j]; }
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) C[i][j] /= n;
    const { vals, vecs } = jacobi3(C);
    const order = [0, 1, 2].sort((a, b) => vals[b] - vals[a]); // descending variance
    return { mean: m, u: vecs[order[0]], v: vecs[order[1]], n: vecs[order[2]], vals: order.map((i) => vals[i]) };
  }

  // ── 2D Voronoi (per-cell half-plane clipping) — the room footprints on the plane ──
  function clipHP(poly, nx, ny, mx, my) {
    const out = [], N = poly.length, side = (p) => (p.x - mx) * nx + (p.y - my) * ny;
    for (let i = 0; i < N; i++) { const A = poly[i], B = poly[(i + 1) % N], sa = side(A), sb = side(B); if (sa <= 1e-9) out.push(A); if ((sa < 0 && sb > 0) || (sa > 0 && sb < 0)) { const t = sa / (sa - sb); out.push({ x: A.x + t * (B.x - A.x), y: A.y + t * (B.y - A.y) }); } }
    return out;
  }
  function voronoi2d(seeds, box) {
    return seeds.map((s, i) => { let poly = [{ x: box.x0, y: box.y0 }, { x: box.x1, y: box.y0 }, { x: box.x1, y: box.y1 }, { x: box.x0, y: box.y1 }]; for (let j = 0; j < seeds.length && poly.length >= 3; j++) { if (j === i) continue; const t = seeds[j]; poly = clipHP(poly, t.x - s.x, t.y - s.y, (s.x + t.x) / 2, (s.y + t.y) / 2); } return poly; });
  }

  // ── extract one top-down level: the cells a best-fit plane passes through ──
  function generateLevel(o) {
    const pts = seeds3d(o);
    const pl = pca(pts);
    const proj = pts.map((p) => { const d = [p.x - pl.mean[0], p.y - pl.mean[1], p.z - pl.mean[2]]; return { u: dot(d, pl.u), v: dot(d, pl.v), w: dot(d, pl.n), z: p.z, p }; });
    const band = o.band != null ? o.band : o.thickness * 0.35;          // plane "thickness" — cells it cuts
    const sel = proj.filter((q) => Math.abs(q.w) < band);
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const q of sel) { if (q.u < x0) x0 = q.u; if (q.u > x1) x1 = q.u; if (q.v < y0) y0 = q.v; if (q.v > y1) y1 = q.v; }
    const pad = (o.cell || 24) * 0.6; const box = { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
    const polys = voronoi2d(sel.map((q) => ({ x: q.u, y: q.v })), box);
    // rooms + adjacency (shared Voronoi edges = doors between chambers)
    const r = Math.max(0.5, (o.cell || 24) * 0.02), edgeMap = new Map();
    const key = (p) => Math.round(p.x / r) + '_' + Math.round(p.y / r);
    const rooms = polys.map((poly, i) => ({ id: i, poly, u: sel[i].u, v: sel[i].v, w: sel[i].w, z: sel[i].z }));
    polys.forEach((poly, ci) => { for (let i = 0; i < poly.length; i++) { const a = key(poly[i]), b = key(poly[(i + 1) % poly.length]); if (a === b) continue; const ek = a < b ? a + '|' + b : b + '|' + a; let e = edgeMap.get(ek); if (!e) { e = []; edgeMap.set(ek, e); } if (e.indexOf(ci) < 0) e.push(ci); } });
    const edges = []; edgeMap.forEach((e) => { if (e.length === 2) edges.push([e[0], e[1]]); });
    return { plane: pl, rooms, edges, box, totalCells: pts.length, depthRange: [Math.min.apply(null, pts.map((p) => p.z)), Math.max.apply(null, pts.map((p) => p.z))] };
  }

  const api = { generateLevel, pca, seeds3d, jacobi3 };
  root.HOOPFOAM3D = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
