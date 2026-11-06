/* AMOEBA — the membrane as a mesh, in any dimension. A closed (d−1)-dimensional surface in d dimensions made of
   (d−1)-simplices: triangles in 3D, tetrahedra in 4D. It starts as the icosahedron or the 600-cell, refined by edge
   midpoints (a triangle into 4; a tetrahedron into 8, Bey's red refinement) and pushed out
   to the sphere. Every facet is oriented so its normal points out. Nothing here knows about cells. No DOM. */

/* the facet's normal, unnormalised: the generalised cross product of its edges from vertex 0. |n| = (d−1)! × measure */
export function facetNormal(d, P, f, out) {
  const a = f[0] * d;
  if (d === 3) {
    const u0 = P[f[1] * 3] - P[a], u1 = P[f[1] * 3 + 1] - P[a + 1], u2 = P[f[1] * 3 + 2] - P[a + 2];
    const v0 = P[f[2] * 3] - P[a], v1 = P[f[2] * 3 + 1] - P[a + 1], v2 = P[f[2] * 3 + 2] - P[a + 2];
    out[0] = u1 * v2 - u2 * v1; out[1] = u2 * v0 - u0 * v2; out[2] = u0 * v1 - u1 * v0; return out;
  }
  // 4D: n_i = (−1)^i det of the 3×3 minor of [u v w] without row i (unrolled: this runs for every tetrahedron, often)
  const b1 = f[1] * 4, b2 = f[2] * 4, b3 = f[3] * 4;
  const u0 = P[b1] - P[a], u1 = P[b1 + 1] - P[a + 1], u2 = P[b1 + 2] - P[a + 2], u3 = P[b1 + 3] - P[a + 3];
  const v0 = P[b2] - P[a], v1 = P[b2 + 1] - P[a + 1], v2 = P[b2 + 2] - P[a + 2], v3 = P[b2 + 3] - P[a + 3];
  const w0 = P[b3] - P[a], w1 = P[b3 + 1] - P[a + 1], w2 = P[b3 + 2] - P[a + 2], w3 = P[b3 + 3] - P[a + 3];
  const m01 = v0 * w1 - v1 * w0, m02 = v0 * w2 - v2 * w0, m03 = v0 * w3 - v3 * w0, m12 = v1 * w2 - v2 * w1, m13 = v1 * w3 - v3 * w1, m23 = v2 * w3 - v3 * w2;
  out[0] = u1 * m23 - u2 * m13 + u3 * m12; out[1] = -(u0 * m23 - u2 * m03 + u3 * m02); out[2] = u0 * m13 - u1 * m03 + u3 * m01; out[3] = -(u0 * m12 - u1 * m02 + u2 * m01); return out;
}
const FACT = { 3: 2, 4: 6 };

/* the sphere: refined `level` times. Returns { d, nv, P (positions, nv × d), F (facets, nf × d vertex indices), nf } */
/* the most even start each dimension offers: the icosahedron (12 vertices, 20 triangles) and the 600-cell (120
   vertices, 600 tetrahedra). Built from their vertices: the edges are the shortest distances, and the facets are the
   cliques of d mutually adjacent vertices */
function basePolytope(d) {
  const P = [];
  if (d === 3) { const g = (1 + Math.sqrt(5)) / 2; for (const a of [1, -1]) for (const b of [g, -g]) P.push([0, a, b], [a, b, 0], [b, 0, a]); }
  else {
    const g = (1 + Math.sqrt(5)) / 2, h = [g / 2, 0.5, 1 / (2 * g), 0];
    for (let a = 0; a < 4; a++) for (const s of [1, -1]) { const v = [0, 0, 0, 0]; v[a] = s; P.push(v); }
    for (let m = 0; m < 16; m++) P.push([0, 1, 2, 3].map((a) => ((m >> a) & 1 ? -0.5 : 0.5)));
    const even = [[0, 1, 2, 3], [0, 2, 3, 1], [0, 3, 1, 2], [1, 0, 3, 2], [1, 2, 0, 3], [1, 3, 2, 0], [2, 0, 1, 3], [2, 1, 3, 0], [2, 3, 0, 1], [3, 0, 2, 1], [3, 1, 0, 2], [3, 2, 1, 0]];
    for (const pm of even) for (let m = 0; m < 8; m++) { const v = [0, 0, 0, 0]; for (let a = 0; a < 3; a++) v[pm[a]] = (m >> a) & 1 ? -h[a] : h[a]; v[pm[3]] = 0; P.push(v); }
  }
  const n = P.length, dist = (i, j) => Math.hypot(...P[i].map((x, c) => x - P[j][c]));
  let e = Infinity; for (let i = 1; i < n; i++) e = Math.min(e, dist(0, i));
  const adj = P.map((_, i) => P.map((_, j) => i !== j && Math.abs(dist(i, j) - e) < 1e-6));
  const F = [], grow = (cl, from) => { if (cl.length === d) { F.push(cl.slice()); return; } for (let j = from; j < n; j++) if (cl.every((i) => adj[i][j])) { cl.push(j); grow(cl, j + 1); cl.pop(); } };
  grow([], 0);
  return { P, F };
}

export function sphereMesh(d, level) {
  const key = new Map(), base = basePolytope(d), P = base.P;
  let facets = base.F;
  const mid = (i, j) => { const k = i < j ? `${i},${j}` : `${j},${i}`; let m = key.get(k); if (m === undefined) { m = P.length; P.push(P[i].map((x, c) => (x + P[j][c]) / 2)); key.set(k, m); } return m; };
  for (let l = 0; l < level; l++) {
    const next = [];
    for (const f of facets) {
      if (d === 3) { const [a, b, c] = f, ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); next.push([a, ab, ca], [ab, b, bc], [ca, bc, c], [ab, bc, ca]); }
      else {
        const [x0, x1, x2, x3] = f, m01 = mid(x0, x1), m02 = mid(x0, x2), m03 = mid(x0, x3), m12 = mid(x1, x2), m13 = mid(x1, x3), m23 = mid(x2, x3);
        next.push([x0, m01, m02, m03], [m01, x1, m12, m13], [m02, m12, x2, m23], [m03, m13, m23, x3],
          [m01, m02, m03, m13], [m01, m02, m12, m13], [m02, m03, m13, m23], [m02, m12, m13, m23]);
      }
    }
    facets = next; key.clear();
  }
  const nv = P.length, Pf = new Float64Array(nv * d);
  P.forEach((v, i) => { const l = Math.hypot(...v); for (let c = 0; c < d; c++) Pf[i * d + c] = v[c] / l; });
  // orient every facet outward (its normal along its centroid; on the sphere that is out)
  const nf = facets.length, Ff = new Int32Array(nf * d), n = new Float64Array(d);
  facets.forEach((f, k) => {
    facetNormal(d, Pf, f, n); let s = 0; for (let c = 0; c < d; c++) { let m = 0; for (const i of f) m += Pf[i * d + c]; s += n[c] * m; }
    if (s < 0) [f[0], f[1]] = [f[1], f[0]];
    for (let j = 0; j < d; j++) Ff[k * d + j] = f[j];
  });
  return { d, nv, nf, P: Pf, F: Ff };
}

/* each vertex's neighbours (vertices sharing a facet with it), as CSR: nbStart[i]..nbStart[i+1] into nb */
export function neighbours(M) {
  const { d, nv, nf, F } = M, sets = Array.from({ length: nv }, () => new Set());
  for (let k = 0; k < nf; k++) for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) if (a !== b) sets[F[k * d + a]].add(F[k * d + b]);
  const nbStart = new Int32Array(nv + 1); for (let i = 0; i < nv; i++) nbStart[i + 1] = nbStart[i] + sets[i].size;
  const nb = new Int32Array(nbStart[nv]); sets.forEach((s, i) => { let j = nbStart[i]; for (const v of s) nb[j++] = v; });
  return { nbStart, nb };
}

/* the enclosed volume (signed: Σ over facets of the cone from the origin, n·x/d!) and the membrane's measure (area in
   3D, 3-volume in 4D) */
export function volumeOf(M, P = M.P) {
  const { d, nf, F } = M, n = new Float64Array(d), fact = FACT[d]; let V = 0;
  for (let k = 0; k < nf; k++) { const f = F.subarray(k * d, k * d + d); facetNormal(d, P, f, n); let s = 0; for (let c = 0; c < d; c++) s += n[c] * P[f[0] * d + c]; V += s; }
  return V / (fact * d);
}
export function areaOf(M, P = M.P) {
  const { d, nf, F } = M, n = new Float64Array(d), fact = FACT[d]; let A = 0;
  for (let k = 0; k < nf; k++) { facetNormal(d, P, F.subarray(k * d, k * d + d), n); A += Math.hypot(...n); }
  return A / fact;
}
export { FACT };
