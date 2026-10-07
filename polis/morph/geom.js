// geom.js — the convex plane geometry a city is cut with. Pure, DOM-free, no dependencies.
//
// Everything here works on CONVEX polygons, CCW, as [[x, y], …] in metres, and everything it returns
// is convex again. That is not a limitation the city works around, it is how the city is built: a
// district is a Voronoi cell, a block is a cell of the district's lattice clipped to it, a plot is a
// strip of a block clipped to the part of the block that fronts one street, a footprint is a plot
// clipped to a building depth. Each step is an intersection of half-planes, which is exact and cannot
// fail the way general polygon offsetting does (the repo has no such code, and needs none).
//
// The one non-obvious tool is `zones`: in a convex polygon, the points nearer to edge i than to any
// other edge form a convex region (d_i ≤ d_j is a half-plane, because both distances are linear
// inside a convex polygon). Those regions are the faces of the polygon's STRAIGHT SKELETON. The city
// uses them twice: to divide a block among the streets it fronts (each street gets the land closest
// to it, and burgage plots run back from it to the middle of the block), and to roof a building
// (height = distance to the eave, per zone, is a hipped roof).

export const EPS = 1e-9;

/** Signed area (positive for CCW). */
export function area(P) {
  let s = 0;
  for (let i = 0, n = P.length; i < n; i++) { const a = P[i], b = P[(i + 1) % n]; s += a[0] * b[1] - b[0] * a[1]; }
  return s / 2;
}

/** Area centroid. */
export function centroid(P) {
  let cx = 0, cy = 0, s = 0;
  for (let i = 0, n = P.length; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], k = a[0] * b[1] - b[0] * a[1];
    s += k; cx += (a[0] + b[0]) * k; cy += (a[1] + b[1]) * k;
  }
  if (Math.abs(s) < EPS) { let x = 0, y = 0; for (const p of P) { x += p[0]; y += p[1]; } return [x / (P.length || 1), y / (P.length || 1)]; }
  return [cx / (3 * s), cy / (3 * s)];
}

/** The polygon CCW (reversed if it was clockwise). */
export function ccw(P) { return area(P) < 0 ? P.slice().reverse() : P; }

/** Drop repeated and collinear vertices. */
export function clean(P, eps = 1e-7) {
  let Q = [];
  for (const p of P) { const q = Q[Q.length - 1]; if (!q || Math.abs(q[0] - p[0]) > eps || Math.abs(q[1] - p[1]) > eps) Q.push(p); }
  if (Q.length > 1 && Math.abs(Q[0][0] - Q[Q.length - 1][0]) <= eps && Math.abs(Q[0][1] - Q[Q.length - 1][1]) <= eps) Q.pop();
  let changed = true;
  while (changed && Q.length > 2) {
    changed = false;
    for (let i = 0; i < Q.length; i++) {
      const a = Q[(i + Q.length - 1) % Q.length], b = Q[i], c = Q[(i + 1) % Q.length];
      const cr = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
      const len = Math.hypot(c[0] - a[0], c[1] - a[1]) || 1;
      if (Math.abs(cr) / len < eps) { Q.splice(i, 1); changed = true; break; }
    }
  }
  return Q.length >= 3 ? Q : [];
}

/** Keep the part of P where nx·x + ny·y + c ≥ 0 (Sutherland–Hodgman against one line). */
export function clipHalf(P, nx, ny, c) {
  const out = [], n = P.length;
  if (!n) return out;
  for (let i = 0; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n];
    const da = nx * a[0] + ny * a[1] + c, db = nx * b[0] + ny * b[1] + c;
    if (da >= -EPS) out.push(a);
    if ((da >= -EPS) !== (db >= -EPS)) { const t = da / (da - db); out.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]); }
  }
  return clean(out);
}

/** P ∩ Q, both convex. */
export function clipConvex(P, Q) {
  let R = P;
  for (let i = 0, n = Q.length; i < n && R.length; i++) {
    const [nx, ny, c] = edgeLine(Q, i);
    R = clipHalf(R, nx, ny, c);
  }
  return R;
}

/** Edge i of a CCW polygon as an inward line: [nx, ny, c] with nx·x + ny·y + c = signed distance inside. */
export function edgeLine(P, i) {
  const a = P[i], b = P[(i + 1) % P.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
  const nx = -dy / L, ny = dx / L;
  return [nx, ny, -(nx * a[0] + ny * a[1])];
}

/** Signed distance from p to edge i's line, positive inside. */
export function edgeDist(P, i, p) { const [nx, ny, c] = edgeLine(P, i); return nx * p[0] + ny * p[1] + c; }

/** Move every edge i inward by w[i] (a number for all): the convex polygon that is left, or []. */
export function inset(P, w) {
  let R = P;
  for (let i = 0, n = P.length; i < n && R.length; i++) {
    const [nx, ny, c] = edgeLine(P, i), d = typeof w === 'number' ? w : (w[i] || 0);
    R = clipHalf(R, nx, ny, c - d);
  }
  return R;
}

/**
 * The straight skeleton's faces of a convex polygon: zone i is the part of P nearer to edge i than to
 * any other edge (possibly [] for a short edge squeezed out by its neighbours). They tile P exactly.
 */
export function zones(P) {
  const L = P.map((_, i) => edgeLine(P, i));
  return P.map((_, i) => {
    let Z = P;
    for (let j = 0; j < P.length && Z.length; j++) {
      if (j === i) continue;
      const [ax, ay, ac] = L[i], [bx, by, bc] = L[j];
      if (Math.abs(ax - bx) < 1e-12 && Math.abs(ay - by) < 1e-12) continue;      // the same line
      Z = clipHalf(Z, bx - ax, by - ay, bc - ac);                                    // d_j − d_i ≥ 0
    }
    return Z;
  });
}

/** The largest distance from edge i to any vertex of P: how deep the polygon is behind that edge. */
export function depthBehind(P, i) { let m = 0; for (const p of P) m = Math.max(m, edgeDist(P, i, p)); return m; }

/** The inradius of a convex polygon (the distance its skeleton's ridge stands from the edges), by bisection. */
export function inradius(P) {
  let lo = 0, hi = 0;
  for (let i = 0; i < P.length; i++) hi = Math.max(hi, depthBehind(P, i));
  for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (inset(P, m).length) lo = m; else hi = m; }
  return lo;
}

/**
 * Cut convex P into slices perpendicular to the direction (ux, uy) at the given positions along it,
 * measured from origin o: slice k lies between cuts[k−1] and cuts[k] (open at both ends).
 */
export function slices(P, o, ux, uy, cuts) {
  const out = [];
  let prev = -Infinity;
  for (const s of [...cuts, Infinity]) {
    let S = P;
    if (prev > -Infinity) S = clipHalf(S, ux, uy, -(ux * o[0] + uy * o[1]) - prev);   // u·(p−o) ≥ prev
    if (s < Infinity) S = clipHalf(S, -ux, -uy, (ux * o[0] + uy * o[1]) + s);         // u·(p−o) ≤ s
    out.push(S);
    prev = s;
  }
  return out;
}

/** Is p inside convex CCW P (within tol)? */
export function inside(P, p, tol = 1e-7) {
  for (let i = 0; i < P.length; i++) if (edgeDist(P, i, p) < -tol) return false;
  return true;
}

/** Is P convex and CCW? */
export function isConvex(P, tol = 1e-7) {
  if (P.length < 3) return false;
  for (let i = 0, n = P.length; i < n; i++) {
    const a = P[i], b = P[(i + 1) % n], c = P[(i + 2) % n];
    if ((b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]) < -tol) return false;
  }
  return true;
}

/** A rectangle (CCW) from its centre, half-axes along (ux, uy) and its perpendicular. */
export function orientedRect(cx, cy, ux, uy, hu, hv) {
  const vx = -uy, vy = ux;
  return [
    [cx - ux * hu - vx * hv, cy - uy * hu - vy * hv], [cx + ux * hu - vx * hv, cy + uy * hu - vy * hv],
    [cx + ux * hu + vx * hv, cy + uy * hu + vy * hv], [cx - ux * hu + vx * hv, cy - uy * hu + vy * hv],
  ];
}

/** The Voronoi cells of points inside a convex region: each cell = region ∩ the bisector half-planes. */
export function voronoi(points, region) {
  const order = points.map((_, i) => i);
  return points.map((p, i) => {
    // nearest first, and stop once a point is more than twice the cell's reach away
    order.sort((a, b) => d2(points[a], p) - d2(points[b], p));
    let C = region;
    for (const j of order) {
      if (j === i) continue;
      const q = points[j], dd = d2(q, p);
      let reach = 0; for (const v of C) reach = Math.max(reach, d2(v, p));
      if (dd > 4 * reach + EPS) break;
      // keep the side nearer p: (q − p)·x ≤ (|q|² − |p|²)/2
      const nx = p[0] - q[0], ny = p[1] - q[1];
      C = clipHalf(C, nx, ny, (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1]) / 2);
      if (!C.length) break;
    }
    return C;
  });
}
const d2 = (a, b) => (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;

/** Does segment ab lie on the boundary of convex P (both ends on one edge's line, within tol)? */
export function onBoundary(P, a, b, tol = 1e-5) {
  for (let i = 0; i < P.length; i++) if (Math.abs(edgeDist(P, i, a)) < tol && Math.abs(edgeDist(P, i, b)) < tol) return i;
  return -1;
}

/**
 * A hipped roof over convex footprint F: the skeleton's zones, each vertex raised by pitch × its
 * distance to the zone's eave. Returns [{ poly: [[x, y, z]], edge }], z from 0 at the eaves.
 */
export function hipRoof(F, pitch) {
  return zones(F).map((Z, i) => ({ edge: i, poly: Z.map((p) => [p[0], p[1], Math.max(0, edgeDist(F, i, p)) * pitch]) })).filter((r) => r.poly.length >= 3);
}

/**
 * The POWER diagram (weighted Voronoi): cell i = { x : |x − pᵢ|² − wᵢ ≤ |x − pⱼ|² − wⱼ }. Still convex,
 * still exact; a smaller weight makes a smaller cell (a village among districts).
 */
export function power(points, weights, region) {
  return points.map((p, i) => {
    let C = region;
    for (let j = 0; j < points.length && C.length; j++) {
      if (j === i) continue;
      const q = points[j];
      // |x−p|² − wp ≤ |x−q|² − wq  ⇔  2(q−p)·x ≤ |q|² − |p|² + wp − wq
      C = clipHalf(C, p[0] - q[0], p[1] - q[1], (q[0] * q[0] + q[1] * q[1] - p[0] * p[0] - p[1] * p[1] + weights[i] - weights[j]) / 2);
    }
    return C;
  });
}

/** Convex hull (CCW), monotone chain. The union of consecutive slices of a convex polygon is its hull. */
export function hull(points) {
  const P = points.map((p) => [p[0], p[1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 1e-9) lo.pop(); lo.push(p); }
  for (let i = P.length - 1; i >= 0; i--) { const p = P[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 1e-9) hi.pop(); hi.push(p); }
  lo.pop(); hi.pop();
  return clean(lo.concat(hi));
}

/** Split convex P by the line through o along (ux, uy): [left, right] (either may be []). */
export function split(P, o, ux, uy) {
  const nx = -uy, ny = ux, c = -(nx * o[0] + ny * o[1]);
  return [clipHalf(P, nx, ny, c), clipHalf(P, -nx, -ny, -c)];
}

/** Where the line o + t·(ux, uy) crosses convex P: [tmin, tmax], or null. */
export function lineSpan(P, o, ux, uy) {
  let t0 = -Infinity, t1 = Infinity;
  for (let i = 0; i < P.length; i++) {
    const [nx, ny, c] = edgeLine(P, i), den = nx * ux + ny * uy, num = nx * o[0] + ny * o[1] + c;   // inside: num + den·t ≥ 0
    if (Math.abs(den) < 1e-12) { if (num < 0) return null; continue; }
    const t = -num / den;
    if (den > 0) t0 = Math.max(t0, t); else t1 = Math.min(t1, t);
  }
  return t0 < t1 - 1e-9 ? [t0, t1] : null;
}

/** Do segments ab and cd lie on one line and overlap by more than `min`? Returns the overlap length. */
export function sharedLength(a, b, c, d, tol = 0.05) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  if (L < 1e-9) return 0;
  const nx = -dy / L, ny = dx / L;
  if (Math.abs(nx * (c[0] - a[0]) + ny * (c[1] - a[1])) > tol || Math.abs(nx * (d[0] - a[0]) + ny * (d[1] - a[1])) > tol) return 0;
  const ux = dx / L, uy = dy / L, s0 = 0, s1 = L;
  const t0 = ux * (c[0] - a[0]) + uy * (c[1] - a[1]), t1 = ux * (d[0] - a[0]) + uy * (d[1] - a[1]);
  return Math.max(0, Math.min(s1, Math.max(t0, t1)) - Math.max(s0, Math.min(t0, t1)));
}
