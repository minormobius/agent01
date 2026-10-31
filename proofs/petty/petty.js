// proofs/petty/petty.js — projection bodies, Petty's minimum and the simplex-maximum
// counterexample. The only copy of the maths: the page, search.worker.js and
// petty.selftest.mjs all import this file.
//
// For a convex body K ⊂ ℝᵈ the projection body ΠK has support function
//   h_ΠK(u) = vol_{d−1}(projection of K onto u⊥),   u a unit vector,
// and the functional is R_d(K) = |ΠK| / |K|^{d−1} (the Lean `ratio`,
// `normalizedProjectionVolume`, `projectionRatio`).
// For a polytope with facets F (area s_F, outward unit normal ν_F), the facet lemma gives
//   ΠP = Σ_F [−s_F ν_F / 2, s_F ν_F / 2],
// a zonotope, whose volume is Σ over d-subsets S of the generators of |det(v_S)|.

// ----------------------------------------------------------- rationals ---
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };
export const Q = {
  of: (n, d = 1n) => Q.norm([BigInt(n), BigInt(d)]),
  norm([n, d]) { if (d < 0n) { n = -n; d = -d; } const g = gcd(n, d) || 1n; return [n / g, d / g]; },
  add: (a, b) => Q.norm([a[0] * b[1] + b[0] * a[1], a[1] * b[1]]),
  sub: (a, b) => Q.norm([a[0] * b[1] - b[0] * a[1], a[1] * b[1]]),
  mul: (a, b) => Q.norm([a[0] * b[0], a[1] * b[1]]),
  div: (a, b) => Q.norm([a[0] * b[1], a[1] * b[0]]),
  pow(a, k) { let r = [1n, 1n]; for (let i = 0; i < k; i++) r = Q.mul(r, a); return r; },
  abs: (a) => [a[0] < 0n ? -a[0] : a[0], a[1]],
  cmp: (a, b) => { const x = a[0] * b[1] - b[0] * a[1]; return x > 0n ? 1 : x < 0n ? -1 : 0; },
  eq: (a, b) => a[0] === b[0] && a[1] === b[1],
  isZero: (a) => a[0] === 0n,
  toNumber(a) {                         // safe for huge numerators and denominators
    const ln = a[0].toString().replace('-', '').length, ld = a[1].toString().length, sh = Math.max(0, Math.max(ln, ld) - 300);
    const s = 10n ** BigInt(sh);
    return Number(a[0] / s) / Number(a[1] / s) || Number(a[0]) / Number(a[1]);
  },
  str: (a) => (a[1] === 1n ? a[0].toString() : a[0] + '/' + a[1]),
  dec(a, digits = 8) {
    const neg = a[0] < 0n, n = neg ? -a[0] : a[0], ip = n / a[1];
    let fr = ((n % a[1]) * 10n ** BigInt(digits)) / a[1];
    return (neg ? '-' : '') + ip + '.' + fr.toString().padStart(digits, '0');
  },
};
export const fact = (n) => { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; };
export const binom = (n, k) => fact(n) / (fact(k) * fact(n - k));

// ------------------------------------------------------------ constants ---
// c_d = (d+1) d^d / d!, the simplex value (the Lean `simplexConstant`)
export const simplexConstant = (d) => Q.of(BigInt(d + 1) * BigInt(d) ** BigInt(d), fact(d));
// the paper's two-factor product test: R(T_r × T_s) / c_{r+s}
export const productTest = (r, s) => Q.of(BigInt((r + 1) * (s + 1)) * binom(r + s, r) * BigInt(r) ** BigInt(r) * BigInt(s) ** BigInt(s), BigInt(r + s + 1) * BigInt(r + s) ** BigInt(r + s));
// Π c_{a_i} / c_{Σ a_i}: the normalized value of a product of simplices over the simplex
export function partitionRatio(parts) {
  let r = Q.of(1); for (const a of parts) r = Q.mul(r, simplexConstant(a));
  return Q.div(r, simplexConstant(parts.reduce((s, a) => s + a, 0)));
}
// log c_d in floating point, for the large-dimension picture
export function logC(d) { let s = Math.log(d + 1) + d * Math.log(d); for (let i = 2; i <= d; i++) s -= Math.log(i); return s; }
// κ_j = π^{j/2} / Γ(j/2 + 1), and Petty's constant κ_{n−1}^n κ_n^{2−n}, in logs
export function logKappa(j) {
  let lg;                                     // log Γ(j/2 + 1)
  if (j % 2 === 0) { lg = 0; for (let i = 2; i <= j / 2; i++) lg += Math.log(i); }
  else { lg = 0.5 * Math.log(Math.PI); for (let i = 1; i <= (j + 1) / 2; i++) lg += Math.log(i - 0.5); }
  return (j / 2) * Math.log(Math.PI) - lg;
}
export const logPetty = (n) => n * logKappa(n - 1) + (2 - n) * logKappa(n);
// best product of simplices in each dimension, parts ≥ 2 (dynamic programming on log c)
export function bestPartitions(N) {
  const best = Array(N + 1).fill(-Infinity), arg = Array(N + 1).fill(0);
  best[0] = 0;
  for (let n = 2; n <= N; n++) for (let a = 2; a <= n; a++) {
    if (n - a === 1) continue;
    const v = best[n - a] + logC(a);
    if (v > best[n] + 1e-12) { best[n] = v; arg[n] = a; }
  }
  const out = [];
  for (let n = 2; n <= N; n++) {
    const parts = []; let m = n; while (m > 0) { parts.push(arg[m]); m -= arg[m]; }
    parts.sort((a, b) => b - a);
    out.push({ n, parts, logExcess: best[n] - logC(n) });
  }
  return out;
}

// --------------------------------------------- exact linear algebra ---
// |det| of an integer matrix by fraction-free Bareiss elimination
export function detInt(M) {
  const n = M.length, A = M.map((r) => r.slice());
  let sign = 1n, prev = 1n;
  for (let k = 0; k < n; k++) {
    let p = k; while (p < n && A[p][k] === 0n) p++;
    if (p === n) return 0n;
    if (p !== k) { [A[k], A[p]] = [A[p], A[k]]; sign = -sign; }
    for (let i = k + 1; i < n; i++) {
      for (let j = k + 1; j < n; j++) A[i][j] = (A[i][j] * A[k][k] - A[i][k] * A[k][j]) / prev;
      A[i][k] = 0n;
    }
    prev = A[k][k];
  }
  return sign * A[n - 1][n - 1];
}
// volume of the zonotope Σ [−v/2, v/2] for rational generators v (each a list of Q):
// Σ over d-subsets S of |det(v_S)|, computed exactly
export function zonotopeVolume(gens, onProgress) {
  const m = gens.length, d = gens[0].length;
  // clear denominators generator by generator: v = w / D_v with w integral
  const scaled = gens.map((v) => { let D = 1n; for (const x of v) D = (D * x[1]) / gcd(D, x[1]); return { w: v.map((x) => (x[0] * D) / x[1]), D }; });
  let total = Q.of(0), count = 0;
  const idx = [];
  (function choose(start) {
    if (idx.length === d) {
      const det = detInt(idx.map((i) => scaled[i].w));
      let den = 1n; for (const i of idx) den *= scaled[i].D;
      total = Q.add(total, Q.of(det < 0n ? -det : det, den));
      count++; if (onProgress && count % 20 === 0) onProgress(count);
      return;
    }
    for (let i = start; i <= m - (d - idx.length); i++) { idx.push(i); choose(i + 1); idx.pop(); }
  })(0);
  return { volume: total, subsets: count };
}

// ----------------------------------------- simplices and their products ---
// Area-normal vectors s_F ν_F of the standard simplex T_d = conv(0, e_1, …, e_d):
// coordinate facets −e_i/(d−1)!, and the far facet w/(d−1)! with w = (1, …, 1).
export function simplexAreaNormals(d) {
  const f = fact(d - 1), out = [];
  for (let i = 0; i < d; i++) out.push(Array.from({ length: d }, (_, j) => (i === j ? Q.of(-1, f) : Q.of(0))));
  out.push(Array.from({ length: d }, () => Q.of(1, f)));
  return out;
}
export const simplexVolume = (d) => Q.of(1, fact(d));
// The facets of T_{a1} × … × T_{ak} are (facet of one factor) × (all the others), so each
// area-normal vector is the factor's vector, in its own block of coordinates, times the
// volumes of the other factors. This is elementary and does not use the product formula.
export function productAreaNormals(parts) {
  const n = parts.reduce((s, a) => s + a, 0), out = [];
  let off = 0;
  parts.forEach((a, k) => {
    let others = Q.of(1); parts.forEach((b, j) => { if (j !== k) others = Q.mul(others, simplexVolume(b)); });
    for (const v of simplexAreaNormals(a)) {
      const g = Array.from({ length: n }, () => Q.of(0));
      v.forEach((x, i) => { g[off + i] = Q.mul(x, others); });
      out.push(g);
    }
    off += a;
  });
  return out;
}
export function productVolume(parts) { let v = Q.of(1); for (const a of parts) v = Q.mul(v, simplexVolume(a)); return v; }
// R_n of a product of simplices straight from the facet zonotope, no product formula
export function bruteRatio(parts, onProgress) {
  const n = parts.reduce((s, a) => s + a, 0);
  const { volume, subsets } = zonotopeVolume(productAreaNormals(parts), onProgress);
  const R = Q.div(volume, Q.pow(productVolume(parts), n - 1));
  return { n, piVolume: volume, subsets, R, overSimplex: Q.div(R, simplexConstant(n)) };
}

// ----------------------------------------------------- the plane ---
// For a convex polygon (counter-clockwise vertices), each edge e gives the area-normal
// vector rot(e) (length |e|, pointing outward), so ΠK = Σ [−rot(e)/2, rot(e)/2], which is
// K − K turned a quarter turn. R_2(K) = |K − K| / |K| ∈ [4, 6] (Brunn–Minkowski and
// Rogers–Shephard): 4 exactly for centrally symmetric K, 6 exactly for triangles.
export function hull2(pts) {
  const p = pts.map((q, i) => ({ x: q[0], y: q[1], i })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p.map((q) => [q.x, q.y]);
  const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lo = [], up = [];
  for (const q of p) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (const q of [...p].reverse()) { while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1)).map((q) => [q.x, q.y]);
}
export const area2 = (poly) => { let a = 0; for (let i = 0; i < poly.length; i++) { const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length]; a += x1 * y2 - x2 * y1; } return a / 2; };
export function projectionBody2(poly) {
  const gens = poly.map((p, i) => { const q = poly[(i + 1) % poly.length]; return [q[1] - p[1], -(q[0] - p[0])]; });    // outward area-normals
  // the zonogon Σ[−g/2, g/2] has the 2m edges ±g; walk them in angle order, then centre it
  // (a zonogon is centrally symmetric, so its vertex average is its centre)
  const edges = gens.flatMap((g) => [g, [-g[0], -g[1]]]).sort((a, b) => Math.atan2(a[1], a[0]) - Math.atan2(b[1], b[0]));
  const pts = [[0, 0]]; for (const e of edges.slice(0, -1)) { const l = pts[pts.length - 1]; pts.push([l[0] + e[0], l[1] + e[1]]); }
  const cxm = pts.reduce((t, p) => t + p[0], 0) / pts.length, cym = pts.reduce((t, p) => t + p[1], 0) / pts.length;
  const body = pts.map((p) => [p[0] - cxm, p[1] - cym]);
  let vol = 0; for (let i = 0; i < gens.length; i++) for (let j = i + 1; j < gens.length; j++) vol += Math.abs(gens[i][0] * gens[j][1] - gens[i][1] * gens[j][0]);
  return { gens, body, volume: vol };
}
// h_ΠK(u) directly: the length of K's shadow on the line u⊥ (for checking the facet lemma)
export function shadow2(poly, u) {
  const t = poly.map((p) => -p[0] * u[1] + p[1] * u[0]);
  return Math.max(...t) - Math.min(...t);
}

// ----------------------------------------------------- three dimensions ---
const sub3 = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const det3 = (a, b, c) => dot3(a, cross3(b, c));
// Convex hull by brute force over triples (fine for the few dozen points used here).
// Returns faces as counter-clockwise (seen from outside) vertex cycles.
export function hull3(pts, eps = 1e-9) {
  const n = pts.length, faces = [], seen = new Set();
  const c = [0, 1, 2].map((k) => pts.reduce((s, p) => s + p[k], 0) / n);
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) {
    let nrm = cross3(sub3(pts[j], pts[i]), sub3(pts[k], pts[i]));
    const len = Math.hypot(...nrm); if (len < eps) continue;
    nrm = nrm.map((x) => x / len);
    if (dot3(nrm, sub3(c, pts[i])) > 0) nrm = nrm.map((x) => -x);
    const off = dot3(nrm, pts[i]);
    let ok = true; const on = [];
    for (let t = 0; t < n; t++) { const s = dot3(nrm, pts[t]) - off; if (s > eps) { ok = false; break; } if (s > -eps) on.push(t); }
    if (!ok) continue;
    const key = on.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    // order the face's points by angle around their centroid
    const fc = [0, 1, 2].map((q) => on.reduce((s, t) => s + pts[t][q], 0) / on.length);
    const ax = sub3(pts[on[0]], fc), ay = cross3(nrm, ax);
    on.sort((a, b) => Math.atan2(dot3(sub3(pts[a], fc), ay), dot3(sub3(pts[a], fc), ax)) - Math.atan2(dot3(sub3(pts[b], fc), ay), dot3(sub3(pts[b], fc), ax)));
    faces.push({ verts: on, normal: nrm });
  }
  return faces;
}
// area-normal vector of a planar polygon (½ Σ pᵢ × pᵢ₊₁), outward for the hull's orientation
export function faceAreaNormal(pts, verts) {
  let s = [0, 0, 0];
  for (let i = 0; i < verts.length; i++) { const c = cross3(pts[verts[i]], pts[verts[(i + 1) % verts.length]]); s = [s[0] + c[0], s[1] + c[1], s[2] + c[2]]; }
  return s.map((x) => x / 2);
}
export function body3(pts) {
  const faces = hull3(pts);
  const gens = faces.map((f) => faceAreaNormal(pts, f.verts));
  let vol = 0; faces.forEach((f, i) => { vol += dot3(gens[i], pts[f.verts[0]]) / 3; });
  let piv = 0;
  for (let i = 0; i < gens.length; i++) for (let j = i + 1; j < gens.length; j++) for (let k = j + 1; k < gens.length; k++) piv += Math.abs(det3(gens[i], gens[j], gens[k]));
  return { faces, gens, volume: vol, piVolume: piv, R: piv / (vol * vol) };
}
// Faces of the zonotope Σ [−g/2, g/2] in ℝ³, for drawing. Each face normal is the cross
// product of two generators; the face is the zonogon of the generators in that plane,
// pushed out by half the generators on each side.
export function zonotopeFaces(gens, eps = 1e-9) {
  // merge parallel generators first (opposite facets give parallel area-normals)
  const G = [];
  for (const g of gens) {
    const L = Math.hypot(...g); if (L < eps) continue;
    const m = G.find((h) => Math.hypot(...cross3(h, g)) < eps * L * Math.hypot(...h));
    if (m) { const s = dot3(m, g) > 0 ? 1 : -1; for (let q = 0; q < 3; q++) m[q] += s * g[q]; } else G.push(g.slice());
  }
  const faces = [], seen = new Set();
  for (let i = 0; i < G.length; i++) for (let j = i + 1; j < G.length; j++) {
    let n = cross3(G[i], G[j]); const L = Math.hypot(...n); n = n.map((x) => x / L);
    const inPlane = G.map((g, k) => k).filter((k) => Math.abs(dot3(G[k], n)) < eps * Math.hypot(...G[k]));
    const key = inPlane.join(',');
    if (seen.has(key)) continue; seen.add(key);
    for (const sgn of [1, -1]) {
      const nn = n.map((x) => x * sgn);
      let c = [0, 0, 0];
      G.forEach((g, k) => { if (!inPlane.includes(k)) { const s = dot3(g, nn) > 0 ? 0.5 : -0.5; c = [c[0] + s * g[0], c[1] + s * g[1], c[2] + s * g[2]]; } });
      // zonogon in the plane: same walk as the 2D case
      const ax = G[inPlane[0]].map((x) => x / Math.hypot(...G[inPlane[0]])), ay = cross3(nn, ax);
      const vecs = inPlane.flatMap((k) => [G[k], G[k].map((x) => -x)]).map((v) => [Math.atan2(dot3(v, ay), dot3(v, ax)), v]).sort((a, b) => a[0] - b[0]);
      let p = [0, 0, 0]; const poly = [];
      for (const [, v] of vecs) { poly.push(p); p = [p[0] + v[0], p[1] + v[1], p[2] + v[2]]; }
      const m = [0, 1, 2].map((q) => poly.reduce((s, v) => s + v[q], 0) / poly.length);
      faces.push({ normal: nn, poly: poly.map((v) => [v[0] - m[0] + c[0], v[1] - m[1] + c[1], v[2] - m[2] + c[2]]) });
    }
  }
  return faces;
}
// a few solids, as vertex lists
const PHI = (1 + Math.sqrt(5)) / 2;
export const SOLIDS = {
  tetrahedron: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]],
  cube: [0, 1].flatMap((x) => [0, 1].flatMap((y) => [0, 1].map((z) => [x, y, z]))),
  octahedron: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]],
  'triangular prism': [0, 1].flatMap((z) => [[0, 0, z], [1, 0, z], [0, 1, z]]),
  'square pyramid': [[0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0], [0.5, 0.5, 0.8]],
  icosahedron: [[0, 1, PHI], [0, -1, PHI], [0, 1, -PHI], [0, -1, -PHI], [1, PHI, 0], [-1, PHI, 0], [1, -PHI, 0], [-1, -PHI, 0], [PHI, 0, 1], [-PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, -1]],
};
export function spherePoints(n, rnd = Math.random) {
  return Array.from({ length: n }, () => { const z = 2 * rnd() - 1, t = 2 * Math.PI * rnd(), r = Math.sqrt(1 - z * z); return [r * Math.cos(t), r * Math.sin(t), z]; });
}
export function rng(seed = 1) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
