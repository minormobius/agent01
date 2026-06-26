// chunkroller/tessgen.js — the tessellation-shape kernel (pure, node-tested).
//
// A regular hexagon tiles the plane by TRANSLATION when each edge equals its opposite edge translated.
// So: deform the three editable edges (0,1,2) any weird way you like; the opposite edges (3,4,5) are
// COMPUTED as the reverse-and-translate of their partner. The tile then STILL TESSELLATES however strange
// the edges get — ending the obvious straight seams we currently see. Export is JSON-adjacent (the base
// hex + the edit offsets + the full closed boundary), so a shape is both human-readable and re-loadable.
//
// Geometry matches v7/foam.js's hex: V_k = R·(cos 60k°, sin 60k°). Lattice T_k = V_k + V_{k+1}.

export const NPTS_DEFAULT = 3;   // interior control points per editable edge

export function hexVerts(R) { const v = []; for (let i = 0; i < 6; i++) { const a = Math.PI / 3 * i; v.push([R * Math.cos(a), R * Math.sin(a)]); } return v; }
const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];

// the lattice translation for edge k: crossing edge k lands the neighbour at +T_k, the opposite at −T_k.
export function latticeT(V, k) { return add(V[k], V[(k + 1) % 6]); }

// default edit state: 3 editable edges, each with `n` interior control points at zero offset (straight).
export function defaultEdges(n = NPTS_DEFAULT) { return [0, 1, 2].map(() => ({ controls: Array.from({ length: n }, () => [0, 0]) })); }

// one editable edge's full polyline: corner → (base point + offset) per control → corner.
function edgePolyline(V, k, edge) {
  const a = V[k], b = V[(k + 1) % 6], n = edge.controls.length, pts = [a.slice()];
  for (let j = 0; j < n; j++) { const t = (j + 1) / (n + 1), base = lerp(a, b, t); pts.push(add(base, edge.controls[j])); }
  pts.push(b.slice());
  return pts;
}

// the whole boundary: edges 0,1,2 from the edit state; 3,4,5 = reverse(partner) − T_k (the tess rule).
export function buildShape(R, edges) {
  const V = hexVerts(R);
  const E = [0, 1, 2].map((k) => edgePolyline(V, k, edges[k]));
  const opp = [0, 1, 2].map((k) => { const T = latticeT(V, k); return E[k].slice().reverse().map((p) => sub(p, T)); });   // edge k+3 (V_{k+3}→V_{k+4})
  const all = [E[0], E[1], E[2], opp[0], opp[1], opp[2]];   // boundary order edge0..edge5
  const boundary = [];
  for (let k = 0; k < 6; k++) { const pts = all[k]; for (let i = 0; i < pts.length - 1; i++) boundary.push(pts[i]); }   // drop each edge's shared last point
  return { R, V, edges: all, boundary, lattice: [latticeT(V, 0), latticeT(V, 1), latticeT(V, 2)] };
}

// the 6 neighbour translations for the tiling preview: ±T0, ±T1, ±T2.
export function neighbourOffsets(shape) { const [T0, T1, T2] = shape.lattice; return [T0, T1, T2, [-T0[0], -T0[1]], [-T1[0], -T1[1]], [-T2[0], -T2[1]]]; }

// shoelace signed area — a sane (non-eaten) tile keeps the base hex's sign + a healthy magnitude.
export function area(boundary) { let s = 0; for (let i = 0; i < boundary.length; i++) { const a = boundary[i], b = boundary[(i + 1) % boundary.length]; s += a[0] * b[1] - b[0] * a[1]; } return s / 2; }

// the tessellation guarantee, checkable: tile.edge_k == reverse(tile.edge_{k+3} + T_k). Returns max gap.
export function tessellationGap(shape) {
  let maxGap = 0;
  for (let k = 0; k < 3; k++) {
    const ek = shape.edges[k], ek3 = shape.edges[k + 3], T = shape.lattice[k], m = ek.length;
    const shifted = ek3.map((p) => add(p, T)).reverse();   // should coincide with ek
    for (let i = 0; i < m; i++) maxGap = Math.max(maxGap, Math.hypot(ek[i][0] - shifted[i][0], ek[i][1] - shifted[i][1]));
  }
  return maxGap;
}

// export object (JSON-adjacent): re-loadable shape descriptor.
export function exportShape(R, edges, stamp = 0) {
  const sh = buildShape(R, edges);
  return { type: 'hoop.chunkshape.tessellation', version: 1, tiling: 'translation', R, vertices: sh.V, lattice: sh.lattice, edges: edges.map((e) => ({ controls: e.controls.map((c) => [Math.round(c[0] * 100) / 100, Math.round(c[1] * 100) / 100]) })), boundary: sh.boundary.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]), createdAt: stamp };
}
