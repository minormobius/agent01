// proximity.js — how close are two bodies, and do they cross? Pure
// JavaScript over triangle meshes: no kernel, so it runs where Manifold
// cannot (the Cloudflare host) and answers the question a reviewer asks
// first — the clearance between every pair, not only the overlaps.
//
// For a pair of posed meshes:
//   distance     the nearest approach between the two surfaces (0 when they cross)
//   closest      the two points that realise it
//   intersecting true when any two triangles cross
//   contained    'a in b' | 'b in a' when one surface lies wholly inside the other
//   penetration  for crossing or contained pairs, how deep: the farthest any
//                vertex of one body sits inside the other (an estimate; the
//                shared volume needs a kernel)
//   touching     crossing with no depth: contact, not collision
//
// A BVH per posed mesh (median split on centroids), dual traversal with
// box-distance pruning for the minimum, box-overlap pruning for crossings,
// exact triangle–triangle distance (vertex–triangle and edge–edge), and
// Möller's separating-axis test for crossings. Point-in-mesh is ray parity
// along +x with a BVH walk. Meshes are the exact kernel's, so a
// clearance is a chord approximation of a curved face: within the mesh's
// sagitta, which for the bench parts is under 0.02 mm.

const EPS = 1e-12;
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const len2 = (a) => dot(a, a);
const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

/// Pose a mesh: world-space triangles as a Float64Array of 9 per triangle.
export function posedTriangles(mesh, model) {
  const { pos, idx } = mesh; const n = idx.length / 3; const out = new Float64Array(n * 9);
  const m = model;
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const v = idx[3 * t + k] * 3; const x = pos[v], y = pos[v + 1], z = pos[v + 2];
    const o = t * 9 + k * 3;
    out[o] = m[0] * x + m[4] * y + m[8] * z + m[12];
    out[o + 1] = m[1] * x + m[5] * y + m[9] * z + m[13];
    out[o + 2] = m[2] * x + m[6] * y + m[10] * z + m[14];
  }
  return out;
}

// ── BVH ────────────────────────────────────────────────────────────────────
export class BVH {
  constructor(tris) {
    this.tris = tris; const n = tris.length / 9;
    this.order = new Uint32Array(n); for (let i = 0; i < n; i++) this.order[i] = i;
    this.cent = new Float64Array(n * 3);
    for (let i = 0; i < n; i++) for (let k = 0; k < 3; k++) this.cent[i * 3 + k] = (tris[i * 9 + k] + tris[i * 9 + 3 + k] + tris[i * 9 + 6 + k]) / 3;
    this.nodes = []; // {min, max, start, count, left, right}
    this.root = n ? this.build(0, n) : -1;
  }
  bounds(start, count) {
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = start; i < start + count; i++) { const t = this.order[i] * 9; for (let v = 0; v < 9; v += 3) for (let k = 0; k < 3; k++) { const x = this.tris[t + v + k]; if (x < min[k]) min[k] = x; if (x > max[k]) max[k] = x; } }
    return { min, max };
  }
  build(start, count) {
    const { min, max } = this.bounds(start, count);
    const id = this.nodes.length; const node = { min, max, start, count, left: -1, right: -1 }; this.nodes.push(node);
    if (count <= 4) return id;
    const ext = [max[0] - min[0], max[1] - min[1], max[2] - min[2]]; const axis = ext[0] >= ext[1] && ext[0] >= ext[2] ? 0 : ext[1] >= ext[2] ? 1 : 2;
    const slice = this.order.subarray(start, start + count); const c = this.cent;
    slice.sort((a, b) => c[a * 3 + axis] - c[b * 3 + axis]);
    const mid = start + (count >> 1);
    node.left = this.build(start, mid - start); node.right = this.build(mid, start + count - mid); node.count = 0;
    return id;
  }
  tri(i, out) { const t = this.order[i] * 9; for (let k = 0; k < 9; k++) out[k] = this.tris[t + k]; return out; }
  triId(i) { return this.order[i]; }
  get box() { const r = this.nodes[this.root]; return r ? { min: r.min, max: r.max } : null; }
}
const boxDist2 = (a, b) => { let d = 0; for (let k = 0; k < 3; k++) { const g = Math.max(0, a.min[k] - b.max[k], b.min[k] - a.max[k]); d += g * g; } return d; };
const boxOverlap = (a, b) => a.min[0] <= b.max[0] && b.min[0] <= a.max[0] && a.min[1] <= b.max[1] && b.min[1] <= a.max[1] && a.min[2] <= b.max[2] && b.min[2] <= a.max[2];

// ── primitives ────────────────────────────────────────────────────────────
/// Closest point on triangle (a, b, c) to p (Ericson, Real-Time Collision Detection 5.1.5).
export function closestOnTriangle(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return a;
  const bp = sub(p, b); const d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return b;
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return lerp(a, b, v); }
  const cp = sub(p, c); const d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return c;
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return lerp(a, c, w); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return lerp(b, c, w); }
  const denom = 1 / (va + vb + vc); const v = vb * denom, w = vc * denom;
  return [a[0] + ab[0] * v + ac[0] * w, a[1] + ab[1] * v + ac[1] * w, a[2] + ab[2] * v + ac[2] * w];
}
/// Closest points between segments p1p2 and q1q2 (Ericson 5.1.9).
function closestSegments(p1, p2, q1, q2) {
  const d1 = sub(p2, p1), d2 = sub(q2, q1), r = sub(p1, q1);
  const a = len2(d1), e = len2(d2), f = dot(d2, r);
  let s, t;
  if (a <= EPS && e <= EPS) return [p1, q1];
  if (a <= EPS) { s = 0; t = Math.min(1, Math.max(0, f / e)); }
  else {
    const c = dot(d1, r);
    if (e <= EPS) { t = 0; s = Math.min(1, Math.max(0, -c / a)); }
    else {
      const b = dot(d1, d2), denom = a * e - b * b;
      s = denom !== 0 ? Math.min(1, Math.max(0, (b * f - c * e) / denom)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.min(1, Math.max(0, -c / a)); } else if (t > 1) { t = 1; s = Math.min(1, Math.max(0, (b - c) / a)); }
    }
  }
  return [lerp(p1, p2, s), lerp(q1, q2, t)];
}
/// Exact minimum distance between two triangles, with the realising points.
export function triTriDistance(A, B) {
  const a = [[A[0], A[1], A[2]], [A[3], A[4], A[5]], [A[6], A[7], A[8]]], b = [[B[0], B[1], B[2]], [B[3], B[4], B[5]], [B[6], B[7], B[8]]];
  let best = Infinity, pa = null, pb = null;
  const take = (p, q) => { const d = len2(sub(p, q)); if (d < best) { best = d; pa = p; pb = q; } };
  for (const p of a) take(p, closestOnTriangle(p, b[0], b[1], b[2]));
  for (const q of b) take(closestOnTriangle(q, a[0], a[1], a[2]), q);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) { const [p, q] = closestSegments(a[i], a[(i + 1) % 3], b[j], b[(j + 1) % 3]); take(p, q); }
  return { d: Math.sqrt(best), pa, pb };
}
/// Do two triangles cross? Möller 1997 (interval overlap on the intersection line), coplanar pairs by edge tests.
export function triTriIntersect(A, B) {
  const v = [[A[0], A[1], A[2]], [A[3], A[4], A[5]], [A[6], A[7], A[8]]], u = [[B[0], B[1], B[2]], [B[3], B[4], B[5]], [B[6], B[7], B[8]]];
  const n1 = cross(sub(v[1], v[0]), sub(v[2], v[0])); const d1 = -dot(n1, v[0]);
  const du = u.map((p) => dot(n1, p) + d1).map((x) => (Math.abs(x) < 1e-10 ? 0 : x));
  if (du[0] * du[1] > 0 && du[0] * du[2] > 0) return false;
  const n2 = cross(sub(u[1], u[0]), sub(u[2], u[0])); const d2 = -dot(n2, u[0]);
  const dv = v.map((p) => dot(n2, p) + d2).map((x) => (Math.abs(x) < 1e-10 ? 0 : x));
  if (dv[0] * dv[1] > 0 && dv[0] * dv[2] > 0) return false;
  const D = cross(n1, n2); const ax = Math.abs(D[0]), ay = Math.abs(D[1]), az = Math.abs(D[2]);
  const index = ax > ay ? (ax > az ? 0 : 2) : ay > az ? 1 : 2;
  if (Math.max(ax, ay, az) < 1e-14) return coplanar(v, u, n1);
  const interval = (p, d) => {
    const pr = p.map((q) => q[index]);
    let a = 0, b = 1, c = 2;
    if (d[0] * d[1] > 0) { a = 2; b = 0; c = 1; } else if (d[0] * d[2] > 0) { a = 1; b = 0; c = 2; } else if (d[1] * d[2] > 0 || d[0] !== 0) { a = 0; b = 1; c = 2; } else if (d[1] !== 0) { a = 1; b = 0; c = 2; } else if (d[2] !== 0) { a = 2; b = 0; c = 1; } else return null;
    const t1 = pr[b] + (pr[a] - pr[b]) * (d[b] / (d[b] - d[a])), t2 = pr[c] + (pr[a] - pr[c]) * (d[c] / (d[c] - d[a]));
    return [Math.min(t1, t2), Math.max(t1, t2)];
  };
  const i1 = interval(v, dv), i2 = interval(u, du);
  if (!i1 || !i2) return coplanar(v, u, n1);
  return !(i1[1] < i2[0] || i2[1] < i1[0]);
}
function coplanar(v, u, n) {
  const ax = Math.abs(n[0]), ay = Math.abs(n[1]), az = Math.abs(n[2]);
  const [i0, i1] = ax > ay ? (ax > az ? [1, 2] : [0, 1]) : ay > az ? [0, 2] : [0, 1];
  const P = (p) => [p[i0], p[i1]];
  const a = v.map(P), b = u.map(P);
  const segs = (p, q, r, s) => { const d = (q[0] - p[0]) * (s[1] - r[1]) - (q[1] - p[1]) * (s[0] - r[0]); if (Math.abs(d) < 1e-14) return false; const t = ((r[0] - p[0]) * (s[1] - r[1]) - (r[1] - p[1]) * (s[0] - r[0])) / d, w = ((r[0] - p[0]) * (q[1] - p[1]) - (r[1] - p[1]) * (q[0] - p[0])) / d; return t >= 0 && t <= 1 && w >= 0 && w <= 1; };
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) if (segs(a[i], a[(i + 1) % 3], b[j], b[(j + 1) % 3])) return true;
  const inside = (p, t) => { let s = 0; for (let i = 0; i < 3; i++) { const q = t[i], r = t[(i + 1) % 3]; const c = (r[0] - q[0]) * (p[1] - q[1]) - (r[1] - q[1]) * (p[0] - q[0]); if (c < 0) s |= 1; else if (c > 0) s |= 2; } return s !== 3; };
  return inside(a[0], b) || inside(b[0], a);
}
/// Does the ray from p along d cross triangle T? Möller–Trumbore.
function rayHits(p, d, T) {
  const e1 = [T[3] - T[0], T[4] - T[1], T[5] - T[2]], e2 = [T[6] - T[0], T[7] - T[1], T[8] - T[2]];
  const h = cross(d, e2); const a = dot(e1, h); if (Math.abs(a) < 1e-14) return false;
  const f = 1 / a, s = [p[0] - T[0], p[1] - T[1], p[2] - T[2]]; const u = f * dot(s, h); if (u < 0 || u > 1) return false;
  const q = cross(s, e1); const v = f * dot(d, q); if (v < 0 || u + v > 1) return false;
  return f * dot(e2, q) > 1e-12;
}
function rayBox(p, inv, n) {
  let tmin = -Infinity, tmax = Infinity;
  for (let k = 0; k < 3; k++) { const t1 = (n.min[k] - p[k]) * inv[k], t2 = (n.max[k] - p[k]) * inv[k]; tmin = Math.max(tmin, Math.min(t1, t2)); tmax = Math.min(tmax, Math.max(t1, t2)); }
  return tmax >= Math.max(tmin, 0);
}
// Three rays in irrational-ish directions and a vote: a single axis-aligned
// ray lands exactly on a mesh's diagonals and shared edges (a cube's face
// diagonal, for one) and counts a crossing twice.
const RAYS = [[0.9377, 0.2731, 0.2167], [-0.3163, 0.8811, 0.3521], [0.2597, -0.4189, 0.8701]].map((v) => { const l = Math.hypot(...v); return v.map((x) => x / l); });
/// Is p inside the closed surface? Parity of crossings, majority of three rays.
export function pointInside(p, bvh) {
  let votes = 0; const T = new Float64Array(9);
  for (const d of RAYS) {
    const inv = d.map((x) => 1 / x); let hits = 0; const stack = [bvh.root];
    while (stack.length) {
      const n = bvh.nodes[stack.pop()]; if (!n || !rayBox(p, inv, n)) continue;
      if (n.count) { for (let i = n.start; i < n.start + n.count; i++) if (rayHits(p, d, bvh.tri(i, T))) hits++; }
      else stack.push(n.left, n.right);
    }
    if (hits & 1) votes++;
  }
  return votes >= 2;
}
/// Distance from a point to a surface (nearest point on any triangle).
export function pointToSurface(p, bvh) {
  let best = Infinity; const T = new Float64Array(9); const stack = [[bvh.root, 0]];
  while (stack.length) {
    const [id, lb] = stack.pop(); const n = bvh.nodes[id]; if (!n || lb >= best) continue;
    if (n.count) { for (let i = n.start; i < n.start + n.count; i++) { bvh.tri(i, T); const q = closestOnTriangle(p, [T[0], T[1], T[2]], [T[3], T[4], T[5]], [T[6], T[7], T[8]]); const d = Math.sqrt(len2(sub(p, q))); if (d < best) best = d; } }
    else for (const c of [n.left, n.right]) { const m = bvh.nodes[c]; const d2 = boxDist2({ min: [p[0], p[1], p[2]], max: [p[0], p[1], p[2]] }, m); if (d2 < best * best) stack.push([c, Math.sqrt(d2)]); }
  }
  return best;
}
/// The nearest approach between two surfaces, and whether they cross.
export function surfaceDistance(A, B) {
  let best = Infinity, pa = null, pb = null; const TA = new Float64Array(9), TB = new Float64Array(9);
  const stack = [[A.root, B.root, 0]];
  while (stack.length) {
    const [ia, ib, lb] = stack.pop(); if (lb * lb >= best) continue;
    const a = A.nodes[ia], b = B.nodes[ib]; if (!a || !b) continue;
    if (a.count && b.count) {
      for (let i = a.start; i < a.start + a.count; i++) for (let j = b.start; j < b.start + b.count; j++) {
        const r = triTriDistance(A.tri(i, TA), B.tri(j, TB)); if (r.d * r.d < best) { best = r.d * r.d; pa = r.pa; pb = r.pb; if (best === 0) return { distance: 0, closest: [pa, pb] }; }
      }
      continue;
    }
    const kids = [];
    const splitA = !a.count && (b.count || (a.max[0] - a.min[0] + a.max[1] - a.min[1] + a.max[2] - a.min[2]) >= (b.max[0] - b.min[0] + b.max[1] - b.min[1] + b.max[2] - b.min[2]));
    if (splitA) for (const c of [a.left, a.right]) kids.push([c, ib, Math.sqrt(boxDist2(A.nodes[c], b))]);
    else for (const c of [b.left, b.right]) kids.push([ia, c, Math.sqrt(boxDist2(a, B.nodes[c]))]);
    kids.sort((x, y) => y[2] - x[2]); for (const k of kids) if (k[2] * k[2] < best) stack.push(k);
  }
  return { distance: Math.sqrt(best), closest: [pa, pb] };
}
export function surfacesCross(A, B) {
  const TA = new Float64Array(9), TB = new Float64Array(9); const stack = [[A.root, B.root]];
  while (stack.length) {
    const [ia, ib] = stack.pop(); const a = A.nodes[ia], b = B.nodes[ib]; if (!a || !b || !boxOverlap(a, b)) continue;
    if (a.count && b.count) { for (let i = a.start; i < a.start + a.count; i++) for (let j = b.start; j < b.start + b.count; j++) if (triTriIntersect(A.tri(i, TA), B.tri(j, TB))) return true; continue; }
    if (!a.count && (b.count || (a.max[0] - a.min[0]) >= (b.max[0] - b.min[0]))) stack.push([a.left, ib], [a.right, ib]); else stack.push([ia, b.left], [ia, b.right]);
  }
  return false;
}
/// How far the vertices of A reach inside B (0 when none do).
function penetrationOf(A, B) {
  let worst = 0; const seen = new Set(); const n = A.tris.length / 9;
  for (let t = 0; t < n; t++) for (let k = 0; k < 3; k++) {
    const p = [A.tris[t * 9 + k * 3], A.tris[t * 9 + k * 3 + 1], A.tris[t * 9 + k * 3 + 2]];
    const key = `${p[0]},${p[1]},${p[2]}`; if (seen.has(key)) continue; seen.add(key);
    if (p[0] < B.box.min[0] || p[0] > B.box.max[0] || p[1] < B.box.min[1] || p[1] > B.box.max[1] || p[2] < B.box.min[2] || p[2] > B.box.max[2]) continue;
    if (pointInside(p, B)) { const d = pointToSurface(p, B); if (d > worst) worst = d; }
  }
  return worst;
}

/// One pair of posed bodies: {distance, closest, intersecting, contained, penetration}.
export function proximity(A, B) {
  const intersecting = surfacesCross(A, B);
  let contained = null;
  if (!intersecting) {
    const a0 = [A.tris[0], A.tris[1], A.tris[2]], b0 = [B.tris[0], B.tris[1], B.tris[2]];
    if (boxOverlap(A.box, B.box)) { if (pointInside(a0, B)) contained = 'a in b'; else if (pointInside(b0, A)) contained = 'b in a'; }
  }
  const { distance, closest } = intersecting || contained ? { distance: 0, closest: null } : surfaceDistance(A, B);
  const penetration = intersecting || contained ? Math.max(penetrationOf(A, B), penetrationOf(B, A)) : 0;
  // surfaces that cross with no vertex of either inside the other are in contact (a bore on its shaft, a face on a face), not colliding
  const touching = intersecting && !contained && penetration < 1e-9;
  return { distance, closest, intersecting, contained, penetration, touching };
}

/// Every pair of posed bodies whose boxes come within `within` of each other.
/// bodies: [{id, mesh:{pos,idx}, model}]. Returns pairs sorted nearest first,
/// each {a, b, distance, intersecting, contained, penetration, closest}.
export function clearances(bodies, { within = Infinity, skip = () => false } = {}) {
  const t0 = performance.now();
  const posed = bodies.map((b) => ({ id: b.id, bvh: new BVH(posedTriangles(b.mesh, b.model)) }));
  const pairs = []; let tested = 0;
  for (let i = 0; i < posed.length; i++) for (let j = i + 1; j < posed.length; j++) {
    const a = posed[i], b = posed[j]; if (!a.bvh.box || !b.bvh.box || skip(a.id, b.id)) continue;
    if (Math.sqrt(boxDist2(a.bvh.box, b.bvh.box)) > within) continue;
    tested++;
    const r = proximity(a.bvh, b.bvh);
    if (r.distance <= within) pairs.push({ a: a.id, b: b.id, ...r });
  }
  return { pairs: pairs.sort((p, q) => p.distance - q.distance || q.penetration - p.penetration), tested, ms: performance.now() - t0 };
}
