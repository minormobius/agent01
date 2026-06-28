// foam3d.js — A VOLUMETRIC foam (the /foamview idea, but small + tractable) and TWO PHYSARUM SPECIES that
// don't touch. This is the 3D resolution of the two-track obstruction: in 2D, a connective network islands
// its complement (TRACKS.md) — but a 1D network in a 3D volume has codimension 2, so it can't separate the
// space, and the complement stays connected. So two species (MATERIAL · spiderbots; PEDESTRIAN · technicians)
// can grow as disjoint networks that BOTH reach every facility, weaving over and under each other in the
// third dimension — blood vessels, for real this time.
//
// The foam is a 3D nuclei lattice → a near-neighbour chamber graph (the Delaunay of the 3D Voronoi, which is
// all physarum needs); cells render as volumetric blobs sized by their Voronoi radius. Pure + deterministic.
// Node-tested in test/foam3d.selftest.mjs.

import { mulberry32 } from '../v099/paint/voronoi.js';
import { makeGraph, createGrower, finalizeField } from '../paint/flux.js';

export function buildFoam3D(seed, opts = {}) {
  const { nx = 8, ny = 8, nz = 5, W = 600, H = 600, D = 320, jitter = 0.62, k = 12, facilities = 10 } = opts;
  const rng = mulberry32(((seed >>> 0) ^ 0x3d1f) >>> 0);
  const sx = W / nx, sy = H / ny, sz = D / nz, nuclei = [];
  for (let iz = 0; iz < nz; iz++) for (let iy = 0; iy < ny; iy++) for (let ix = 0; ix < nx; ix++)
    nuclei.push({ x: (ix + 0.5 + (rng() - 0.5) * jitter) * sx, y: (iy + 0.5 + (rng() - 0.5) * jitter) * sy, z: (iz + 0.5 + (rng() - 0.5) * jitter) * sz });
  const n = nuclei.length, d2 = (a, b) => { const A = nuclei[a], B = nuclei[b]; return (A.x - B.x) ** 2 + (A.y - B.y) ** 2 + (A.z - B.z) ** 2; };

  // K-nearest-neighbour adjacency (the 3D chamber graph ≈ Delaunay of the 3D Voronoi)
  const adj = Array.from({ length: n }, () => []), eset = new Set();
  const link = (i, j) => { const key = i < j ? i + ',' + j : j + ',' + i; if (eset.has(key)) return; eset.add(key); adj[i].push(j); adj[j].push(i); };
  for (let i = 0; i < n; i++) { const near = []; for (let j = 0; j < n; j++) if (j !== i) near.push([j, d2(i, j)]); near.sort((a, b) => a[1] - b[1]); for (let t = 0; t < Math.min(k, near.length); t++) link(i, near[t][0]); }
  // MST (Prim) to guarantee one connected component
  if (n > 1) { const inT = new Uint8Array(n), best = new Float64Array(n).fill(Infinity), par = new Int32Array(n).fill(-1); best[0] = 0; for (let it = 0; it < n; it++) { let u = -1, bd = Infinity; for (let i = 0; i < n; i++) if (!inT[i] && best[i] < bd) { bd = best[i]; u = i; } if (u < 0) break; inT[u] = 1; if (par[u] >= 0) link(u, par[u]); for (let v = 0; v < n; v++) if (!inT[v]) { const w = d2(u, v); if (w < best[v]) { best[v] = w; par[v] = u; } } } }

  // Voronoi radius ≈ half the nearest-neighbour distance (for rendering the cell volume)
  for (let i = 0; i < n; i++) { let bd = Infinity; for (const j of adj[i]) { const d = Math.sqrt(d2(i, j)); if (d < bd) bd = d; } nuclei[i].r = (isFinite(bd) ? bd : sx) * 0.5; }
  const edges = []; for (const key of eset) { const [a, b] = key.split(',').map(Number); edges.push({ a, b, len: Math.sqrt(d2(a, b)) }); }

  // facilities = farthest-point sample (well-spread destinations both species must reach)
  const fac = [Math.floor(rng() * n)], dmin = new Float64Array(n).fill(Infinity);
  while (fac.length < Math.min(facilities, n)) { for (let i = 0; i < n; i++) dmin[i] = Math.min(dmin[i], d2(i, fac[fac.length - 1])); let best = -1, bd = -1; for (let i = 0; i < n; i++) if (!fac.includes(i) && dmin[i] > bd) { bd = dmin[i]; best = i; } if (best < 0) break; fac.push(best); }

  return { nuclei, adj, edges, n, fac, dims: { W, H, D }, d2 };
}

// grow TWO disjoint physarum species over the 3D graph: MATERIAL (each facility → a freight hub) then
// PEDESTRIAN (each facility → a personnel hub) through the cells material didn't take. Both reach every
// facility — the 3D result. Returns per-nucleus species masks + the verdict.
export function twoSpecies(foam, opts = {}) {
  const { mu = 1.4, iters = 18, matFrac = 0.12, pedFrac = 0.12 } = opts;
  const { n, edges, adj, fac, nuclei, d2 } = foam;
  const graph = makeGraph(n, edges);

  // ── MATERIAL species ──
  const matHub = fac[0], matDemand = [];
  for (const f of fac) if (f !== matHub) matDemand.push({ a: f, b: matHub, w: 3 });
  const mg = createGrower(graph, matDemand, { mu, condMax: 60, condGain: 6 });
  for (let it = 0; it < iters; it++) mg.step();
  const matR = finalizeField(graph, mg.state, { roadFrac: matFrac }).isRoad;
  const isMat = new Uint8Array(n); for (let i = 0; i < n; i++) if (matR[i]) isMat[i] = 1; for (const f of fac) isMat[f] = 1;

  // ── PEDESTRIAN species over the complement (non-material cells) ──
  const sub = [], g2s = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) if (!isMat[i]) { g2s[i] = sub.length; sub.push(i); }
  const subEdges = [], s2 = new Set();
  for (const gi of sub) for (const gj of adj[gi]) { if (isMat[gj]) continue; const a = g2s[gi], b = g2s[gj]; if (a < 0 || b < 0) continue; const key = a < b ? a + ',' + b : b + ',' + a; if (s2.has(key)) continue; s2.add(key); subEdges.push({ a, b, len: Math.sqrt(d2(gi, gj)) }); }
  const subNearestTo = (gi) => { let best = -1, bd = Infinity; for (let s = 0; s < sub.length; s++) { const g = sub[s], d = d2(g, gi); if (d < bd) { bd = d; best = s; } } return best; };   // sub index nearest a global node
  const facPed = fac.map((f) => subNearestTo(f));   // pedestrian access per facility (nearest non-material)
  const pedHub = facPed[facPed.length - 1];          // a far facility's access = personnel hub
  const pedDemand = []; for (const s of facPed) if (s >= 0 && s !== pedHub) pedDemand.push({ a: pedHub, b: s, w: 3 });
  const pg = createGrower(makeGraph(sub.length, subEdges), pedDemand, { mu, condMax: 60, condGain: 6 });
  for (let it = 0; it < iters; it++) pg.step();
  const pedR = finalizeField(makeGraph(sub.length, subEdges), pg.state, { roadFrac: pedFrac }).isRoad;
  const isPed = new Uint8Array(n);
  for (let s = 0; s < sub.length; s++) if (pedR[s]) isPed[sub[s]] = 1;
  for (const s of facPed) if (s >= 0) isPed[sub[s]] = 1; if (pedHub >= 0) isPed[sub[pedHub]] = 1;

  return { isMat, isPed, facMat: fac.slice(), facPed: facPed.map((s) => (s >= 0 ? sub[s] : -1)), stats: stats(foam, isMat, isPed, fac, facPed.map((s) => (s >= 0 ? sub[s] : -1))) };
}

function net(adj, mask, facCells) {
  const n = mask.length, comp = new Int32Array(n).fill(-1); let nc = 0;
  for (let s = 0; s < n; s++) { if (!mask[s] || comp[s] >= 0) continue; const q = [s]; comp[s] = nc; while (q.length) { const u = q.pop(); for (const v of adj[u]) if (mask[v] && comp[v] < 0) { comp[v] = nc; q.push(v); } } nc++; }
  const cs = {}; for (let i = 0; i < n; i++) if (mask[i]) cs[comp[i]] = (cs[comp[i]] || 0) + 1;
  let big = -1, bs = 0, tot = 0; for (const k in cs) { tot += cs[k]; if (cs[k] > bs) { bs = cs[k]; big = +k; } }
  let reached = 0; for (const c of facCells) if (c >= 0 && mask[c] && comp[c] === big) reached++;
  return { cells: tot, components: nc, connectedFrac: tot ? bs / tot : 0, reached };
}
function stats(foam, isMat, isPed, facMat, facPed) {
  const { n, adj } = foam; let shared = 0, touch = 0;
  for (let i = 0; i < n; i++) if (isMat[i] && isPed[i]) shared++;
  // do the two species ever sit in ADJACENT cells (a wall between them — fine) — count it as the interface
  for (let i = 0; i < n; i++) if (isPed[i]) { for (const j of adj[i]) if (isMat[j]) { touch++; break; } }
  const M = net(adj, isMat, facMat), P = net(adj, isPed, facPed), F = facMat.length;
  return {
    facilities: F, disjoint: shared === 0, sharedCells: shared,
    material: { cells: M.cells, connectedFrac: M.connectedFrac, reached: M.reached },
    pedestrian: { cells: P.cells, components: P.components, connectedFrac: P.connectedFrac, reached: P.reached },
    interfaceFrac: P.cells ? touch / P.cells : 0,
    // THE 3D RESULT: both species reach every facility while staying disjoint — impossible in 2D.
    feasibleIn3D: M.reached >= F && P.reached >= F && shared === 0,
  };
}
