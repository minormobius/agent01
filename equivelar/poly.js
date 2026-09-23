// equivelar/poly.js — the genus-3 equivelar octahedron of type {9,3}.
//
// Loaded by index.html with <script type="module"> and imported UNCHANGED by
// poly.selftest.mjs, so the maths the browser runs is the maths that is tested.
// No dependencies, no build step.
//
// The object: eight planar nonagons on a surface of genus 3, 24 corners, 36
// edges, three faces at every corner — and EVERY ONE of the 28 pairs of faces
// shares an edge. It is the first such solid found with more than the seven of
// the Szilassi polyhedron, and it gets there by a route the classical count
// forbids: eight of the 28 pairs share TWO edges, not one.
//
// Coordinates, face walks and plane equations are the certificate published in
//   Ruslan Mizhaev, "Integer Realization of an Equivelar Octahedron of Genus 3",
//   arXiv:2609.17700v1 [math.CO], 15 September 2026,
// reproduced verbatim. Everything else here is derived from them, and
// poly.selftest.mjs re-verifies the whole certificate in exact integer
// arithmetic before any of it is used.
//
// Architecture is the /szilassi/ one: every corner is 3-valent, so every corner
// is where three face planes cross, and EIGHT PLANES ARE THE ENTIRE SOLID.
// Faces are planar by construction; 8 x 3 = 24 numbers describe it.

// ---------------------------------------------------------------- vectors ---

export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const unit = (a) => { const l = len(a); return l ? mul(a, 1 / l) : [0, 0, 0]; };

// ------------------------------------------------------- the certificate ---

/** arXiv:2609.17700v1 Table 1 — the 24 vertices, verbatim, as integers. */
export const REFERENCE_VERTICES = [
  [-72, 84, 18], [-36, 112, 102], [72, -84, 18], [36, -112, 102], [0, 300, 234], [-84, 48, -18],
  [9, 147, 207], [0, -300, 234], [84, -48, -18], [-112, -36, -102], [48, 84, 18], [-147, 9, -207],
  [-9, -147, 207], [84, 72, -18], [112, 36, -102], [-48, -84, 18], [147, -9, -207], [-18, 126, 144],
  [-126, -18, -144], [-300, 0, -234], [-84, -72, -18], [18, -126, 144], [126, 18, -144], [300, 0, -234],
];

/** The eight supporting planes, verbatim, as integer `[a, b, c, d]` with a·x = d. */
export const INTEGER_PLANES = [
  [21, 3, -10, -1440], [21, 3, 10, 1440], [3, 0, 1, 234], [3, 0, -1, -234],
  [0, 3, -1, 234], [0, 3, 1, -234], [3, -21, 10, -1440], [3, -21, -10, 1440],
];

/**
 * Table 2's face walks (0-based here; the page shows the paper's 1-based
 * numbers). The paper orients the surface with signs (+,+,−,−,−,−,+,+); those
 * normals point INTO the solid, so the opposite choice is stored, and the
 * selftest checks both that the walks are the published ones and that the
 * enclosed volume comes out positive.
 */
export const FACES = (() => {
  const published = [
    [6, 10, 16, 22, 18, 7, 5, 1, 2],
    [9, 15, 11, 18, 22, 13, 8, 3, 4],
    [7, 5, 8, 3, 17, 23, 9, 15, 14],
    [13, 8, 5, 1, 12, 19, 6, 10, 21],
    [1, 2, 11, 18, 7, 14, 24, 20, 12],
    [3, 4, 16, 22, 13, 21, 20, 24, 17],
    [14, 24, 17, 23, 19, 6, 2, 11, 15],
    [10, 21, 20, 12, 19, 23, 9, 4, 16],
  ].map((w) => w.map((v) => v - 1));
  const outward = [-1, -1, 1, 1, 1, 1, -1, -1];
  return published.map((w, i) => (outward[i] > 0 ? w : w.slice().reverse()));
})();

/** The paper's published walks, unreversed, for the selftest to compare against. */
export const PUBLISHED_FACES = [
  [6, 10, 16, 22, 18, 7, 5, 1, 2], [9, 15, 11, 18, 22, 13, 8, 3, 4],
  [7, 5, 8, 3, 17, 23, 9, 15, 14], [13, 8, 5, 1, 12, 19, 6, 10, 21],
  [1, 2, 11, 18, 7, 14, 24, 20, 12], [3, 4, 16, 22, 13, 21, 20, 24, 17],
  [14, 24, 17, 23, 19, 6, 2, 11, 15], [10, 21, 20, 12, 19, 23, 9, 4, 16],
].map((w) => w.map((v) => v - 1));

/** The 36 edges, as [vertexA, vertexB, faceLeft, faceRight]. */
export const EDGES = (() => {
  const seen = new Map();
  FACES.forEach((f, fi) => {
    for (let i = 0; i < 9; i++) {
      const a = f[i], b = f[(i + 1) % 9];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (seen.has(key)) seen.get(key).push(fi);
      else seen.set(key, [fi]);
    }
  });
  return [...seen.entries()].map(([k, fs]) => {
    const [a, b] = k.split(',').map(Number);
    return [a, b, fs[0], fs[1]];
  });
})();

/**
 * The edges each pair of faces shares. Every one of the 28 entries is
 * non-empty — that is the whole point — and eight of them hold TWO edges
 * rather than one. Those eight are the "overarching" pairs, and they are what
 * lets eight faces do a thing the classical arithmetic says only 4, 7, 12, 15,
 * … faces can.
 */
export const PAIR_EDGES = (() => {
  const m = Array.from({ length: 8 }, () => Array.from({ length: 8 }, () => []));
  for (const [a, b, f, g] of EDGES) { m[f][g].push([a, b]); m[g][f].push([a, b]); }
  return m;
})();

/** The eight pairs that share two edges, as face-index pairs. */
export const OVERARCHING = (() => {
  const out = [];
  for (let f = 0; f < 8; f++) for (let g = f + 1; g < 8; g++) if (PAIR_EDGES[f][g].length === 2) out.push([f, g]);
  return out;
})();

/** Which three faces meet at each corner — the plane triple that defines it. */
export const VERTEX_PLANES = (() => {
  const m = Array.from({ length: 24 }, () => []);
  FACES.forEach((f, i) => f.forEach((v) => m[v].push(i)));
  return m.map((t) => t.slice().sort((a, b) => a - b));
})();

/**
 * The symmetry. T(x, y, z) = (y, −x, −z) carries the solid to itself and has
 * order 4, so ⟨T⟩ is cyclic of order 4 as the paper says — but its determinant
 * is −1. It is a four-fold ROTARY REFLECTION (Schoenflies S₄, a quarter turn
 * about the z-axis followed by a reflection in the xy-plane), not a rotation,
 * and it reverses the orientation of all eight faces. Its square is the plain
 * half-turn about the axis.
 */
export const S4 = {
  map: (v) => [v[1], -v[0], -v[2]],
  improper: true,
  vertexOf: null,   // filled below
  faceOf: null,
  orbits: null,
};
{
  const key = (p) => p.join(',');
  const at = new Map(REFERENCE_VERTICES.map((p, i) => [key(p), i]));
  S4.vertexOf = REFERENCE_VERTICES.map((p) => at.get(key(S4.map(p))));
  const fkey = (f) => f.slice().sort((a, b) => a - b).join(',');
  const faceAt = new Map(FACES.map((f, i) => [fkey(f), i]));
  S4.faceOf = FACES.map((f) => faceAt.get(fkey(f.map((v) => S4.vertexOf[v]))));
  const seen = new Set(), orbits = [];
  for (let f = 0; f < 8; f++) {
    if (seen.has(f)) continue;
    const o = [];
    let x = f;
    while (!seen.has(x)) { seen.add(x); o.push(x); x = S4.faceOf[x]; }
    orbits.push(o);
  }
  S4.orbits = orbits;
}

// -------------------------------------------------- planes <-> the solid ---

/** The plane of a face, as `{n, d}` with a unit normal and n·x = d. */
export function planeOfFace(verts, face) {
  let n = [0, 0, 0];
  const p = face.map((i) => verts[i]);
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    n = add(n, [
      (a[1] - b[1]) * (a[2] + b[2]),
      (a[2] - b[2]) * (a[0] + b[0]),
      (a[0] - b[0]) * (a[1] + b[1]),
    ]);
  }
  const u = unit(n);
  let d = 0;
  for (const q of p) d += dot(u, q);
  return { n: u, d: d / p.length, area2: len(n) };
}

export const planesFromVertices = (verts) => FACES.map((f) => planeOfFace(verts, f));

/** The eight unit-normal planes of the published solid. */
export const REFERENCE_PLANES = planesFromVertices(REFERENCE_VERTICES);

/**
 * Intersect the three planes meeting at each corner. Returns null when any
 * triple is within `eps` of being dependent — which is exactly when the shape
 * has stopped existing.
 */
export function verticesFromPlanes(planes, eps = 1e-9) {
  const out = new Array(24);
  for (let v = 0; v < 24; v++) {
    const [i, j, k] = VERTEX_PLANES[v];
    const A = planes[i], B = planes[j], C = planes[k];
    const bc = cross(B.n, C.n);
    const det = dot(A.n, bc);
    if (!(Math.abs(det) > eps)) return null;
    out[v] = mul(
      add(add(mul(bc, A.d), mul(cross(C.n, A.n), B.d)), mul(cross(A.n, B.n), C.d)),
      1 / det,
    );
  }
  return out;
}

/** Centre and radius, for framing and for scaling tolerances. */
export function bounds(verts) {
  const centre = verts.reduce((s, v) => add(s, v), [0, 0, 0]).map((x) => x / verts.length);
  let radius = 0;
  for (const v of verts) radius = Math.max(radius, len(sub(v, centre)));
  return { centre, radius };
}

/** Signed volume, by the divergence theorem. Positive means normals point out. */
export function volume(verts) {
  let six = 0;
  for (const f of FACES) for (let i = 1; i + 1 < f.length; i++) {
    six += dot(verts[f[0]], cross(verts[f[i]], verts[f[i + 1]]));
  }
  return six / 6;
}

/** Worst out-of-plane deviation of any face corner, relative to the radius. */
export function planarityResidual(verts) {
  const { radius } = bounds(verts);
  let worst = 0;
  FACES.forEach((f) => {
    const p = planeOfFace(verts, f);
    for (const i of f) worst = Math.max(worst, Math.abs(dot(p.n, verts[i]) - p.d));
  });
  return worst / (radius || 1);
}

// --------------------------------------------------------- is it a SOLID ---

/** A face in its own plane: frame plus its nine corners as 2-D points. */
export function faceFrame(verts, face, plane) {
  const e1 = unit(sub(verts[face[1]], verts[face[0]]));
  const e2 = cross(plane.n, e1);
  const o = verts[face[0]];
  return {
    o, e1, e2, n: plane.n,
    poly: face.map((i) => [dot(sub(verts[i], o), e1), dot(sub(verts[i], o), e2)]),
    to2d: (p) => [dot(sub(p, o), e1), dot(sub(p, o), e2)],
  };
}

/** Point in a (non-convex) polygon, counting the boundary as inside. */
export function pointInPolygon(pt, poly, tol) {
  const m = poly.length;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m];
    const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
    const t = L2 ? Math.max(0, Math.min(1, ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / L2)) : 0;
    if (Math.hypot(pt[0] - (a[0] + t * vx), pt[1] - (a[1] + t * vy)) <= tol) return true;
  }
  let inside = false;
  for (let i = 0, j = m - 1; i < m; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a[1] > pt[1]) !== (b[1] > pt[1])) {
      const x = a[0] + ((pt[1] - a[1]) * (b[0] - a[0])) / (b[1] - a[1]);
      if (x > pt[0]) inside = !inside;
    }
  }
  return inside;
}

/** A planar polygon is simple if no two of its non-adjacent edges meet. */
export function simplePolygon(verts, face, plane, scale) {
  const { poly } = faceFrame(verts, face, plane);
  const m = poly.length, tol = 1e-9 * scale;
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m], c = poly[(i + 2) % m];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < tol) return { ok: false, reason: 'zero-length edge' };
    if (Math.abs(o(a, b, c)) < tol * scale) return { ok: false, reason: 'collinear adjacent edges' };
  }
  for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) {
    if (j === i + 1 || (i === 0 && j === m - 1)) continue;
    const a = poly[i], b = poly[(i + 1) % m], c = poly[j], d = poly[(j + 1) % m];
    const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
    if (((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))) {
      return { ok: false, reason: 'the face crosses itself' };
    }
  }
  return { ok: true };
}

/**
 * Exactly how two faces meet.
 *
 * Two faces lie in two planes, so they can only meet along the line where
 * those planes cross. Walk that line: mark every place either nonagon's
 * boundary touches it, then test the midpoint of each stretch for being inside
 * both. What both cover IS their intersection.
 *
 * Unlike the seven-face case, the allowed answer here is not always a single
 * edge: eight of the 28 pairs are supposed to meet in TWO separate edges, both
 * of which lie on that same line. So the comparison is against a SET of
 * segments, and a solid needs the covered set to be exactly that set — no
 * more (the faces would be cutting through each other) and no less (they would
 * have come apart).
 */
export function facePairMeeting(verts, planes, f, g, scale) {
  const A = planes[f], B = planes[g];
  const axis = cross(A.n, B.n);
  if (len(axis) < 1e-9) {
    const sign = dot(A.n, B.n) > 0 ? 1 : -1;
    return Math.abs(A.d - sign * B.d) < 1e-7 * scale
      ? { coplanar: true, extra: Infinity, missing: Infinity }
      : { parallel: true, extra: 0, missing: Infinity };
  }
  const u = unit(axis), c = dot(A.n, B.n), den = 1 - c * c;
  const x0 = add(mul(A.n, (A.d - B.d * c) / den), mul(B.n, (B.d - A.d * c) / den));
  const tOf = (p) => dot(sub(p, x0), u);
  const frames = [faceFrame(verts, FACES[f], A), faceFrame(verts, FACES[g], B)];
  const others = [B, A];
  const eps = 1e-9 * scale, near = 1e-7 * scale;

  const cuts = [];
  for (let s = 0; s < 2; s++) {
    const face = FACES[s === 0 ? f : g], q = others[s];
    for (let i = 0; i < 9; i++) {
      const va = verts[face[i]], vb = verts[face[(i + 1) % 9]];
      const sa = dot(q.n, va) - q.d, sb = dot(q.n, vb) - q.d;
      if (Math.abs(sa) <= eps) cuts.push(tOf(va));
      else if (Math.abs(sb) > eps && (sa > 0) !== (sb > 0)) {
        cuts.push(tOf(add(va, mul(sub(vb, va), sa / (sa - sb)))));
      }
    }
  }
  if (!cuts.length) return { extra: 0, missing: Infinity, covered: [] };
  cuts.sort((a, b) => a - b);
  const marks = [cuts[0]];
  for (const t of cuts) if (t - marks[marks.length - 1] > near) marks.push(t);

  const covered = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const tm = (marks[i] + marks[i + 1]) / 2;
    const p = add(x0, mul(u, tm));
    if (frames.every((fr) => pointInPolygon(fr.to2d(p), fr.poly, near))) {
      const last = covered[covered.length - 1];
      if (last && Math.abs(last[1] - marks[i]) <= near) last[1] = marks[i + 1];
      else covered.push([marks[i], marks[i + 1]]);
    }
  }

  const allowed = PAIR_EDGES[f][g]
    .map(([a, b]) => [tOf(verts[a]), tOf(verts[b])].sort((x, y) => x - y));
  const overlap = (a, b, c2, d2) => Math.max(0, Math.min(b, d2) - Math.max(a, c2));
  let extra = 0;
  for (const [a, b] of covered) {
    let rest = b - a;
    for (const [c2, d2] of allowed) rest -= overlap(a, b, c2, d2);
    extra += Math.max(0, rest);
  }
  let missing = 0;
  for (const [c2, d2] of allowed) {
    let got = 0;
    for (const [a, b] of covered) got += overlap(a, b, c2, d2);
    missing += Math.max(0, (d2 - c2) - got);
  }
  return { extra: extra / scale, missing: missing / scale, covered, allowed };
}

/**
 * Acopticity: do the eight nonagons bound a solid?
 *
 * Every pair of faces is adjacent, so there are no distant pairs to worry
 * about — the whole question is 28 applications of `facePairMeeting` plus "is
 * each nonagon a simple polygon". None of the eight is convex, which is why
 * the line walk has to handle several stretches per face rather than one.
 */
export function acoptic(verts) {
  const { radius: scale } = bounds(verts);
  if (!(scale > 0)) return { ok: false, reason: 'the solid collapsed' };
  const planes = planesFromVertices(verts);
  for (const p of planes) if (!Number.isFinite(p.d) || !(p.area2 > 0)) {
    return { ok: false, reason: 'a face has no plane' };
  }
  for (let f = 0; f < 8; f++) {
    const s = simplePolygon(verts, FACES[f], planes[f], scale);
    if (!s.ok) return { ok: false, reason: `face ${f + 1}: ${s.reason}`, face: f };
  }
  for (let f = 0; f < 8; f++) {
    for (let g = f + 1; g < 8; g++) {
      const m = facePairMeeting(verts, planes, f, g, scale);
      if (m.coplanar) return { ok: false, reason: `faces ${f + 1} and ${g + 1} are coplanar`, pair: [f, g] };
      if (m.missing > 1e-6) {
        return { ok: false, reason: `faces ${f + 1} and ${g + 1} came apart along a shared edge`, pair: [f, g] };
      }
      if (m.extra > 1e-6) {
        return { ok: false, reason: `faces ${f + 1} and ${g + 1} pass through each other`, pair: [f, g] };
      }
    }
  }
  return { ok: true };
}

/**
 * The margin: the closest any edge comes to a face it shares no corner with.
 * `acoptic` gives the verdict; this shrinks smoothly as a deformation drives
 * the surface into itself, so it is what the page shows while you drag.
 */
export function clearance(verts) {
  const { radius: scale } = bounds(verts);
  let best = Infinity, where = null;
  for (const [a, b] of EDGES) {
    for (let f = 0; f < 8; f++) {
      if (FACES[f].includes(a) || FACES[f].includes(b)) continue;
      const d = segmentFaceDistance(verts[a], verts[b], FACES[f].map((i) => verts[i]));
      if (d < best) { best = d; where = { edge: [a, b], face: f }; }
    }
  }
  return { distance: (best === Infinity ? 1 : best) / (scale || 1), ...where };
}

function segmentFaceDistance(p, q, poly) {
  let best = Infinity;
  const m = poly.length;
  for (let i = 0; i < m; i++) best = Math.min(best, segmentSegmentDistance(p, q, poly[i], poly[(i + 1) % m]));
  const n = unit(cross(sub(poly[1], poly[0]), sub(poly[2], poly[0])));
  const sp = dot(n, sub(p, poly[0])), sq = dot(n, sub(q, poly[0]));
  if ((sp > 0) !== (sq > 0)) {
    const x = add(p, mul(sub(q, p), sp / (sp - sq)));
    const e1 = unit(sub(poly[1], poly[0])), e2 = cross(n, e1);
    const flat = poly.map((v) => [dot(sub(v, poly[0]), e1), dot(sub(v, poly[0]), e2)]);
    if (pointInPolygon([dot(sub(x, poly[0]), e1), dot(sub(x, poly[0]), e2)], flat, 0)) best = 0;
  }
  return best;
}

function segmentSegmentDistance(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-300 && e <= 1e-300) return len(r);
  if (a <= 1e-300) t = Math.max(0, Math.min(1, f / e));
  else {
    const c = dot(d1, r);
    if (e <= 1e-300) s = Math.max(0, Math.min(1, -c / a));
    else {
      const b = dot(d1, d2), den = a * e - b * b;
      s = den !== 0 ? Math.max(0, Math.min(1, (b * f - c * e) / den)) : 0;
      t = (b * s + f) / e;
      if (t < 0) { t = 0; s = Math.max(0, Math.min(1, -c / a)); }
      else if (t > 1) { t = 1; s = Math.max(0, Math.min(1, (b - c) / a)); }
    }
  }
  return len(sub(add(p1, mul(d1, s)), add(p2, mul(d2, t))));
}

/** The full verdict on a candidate realization. */
export function inspect(verts) {
  if (!verts) return { ok: false, reason: 'three faces of a corner became parallel', clearance: -1, minDihedral: 0, volume: 0, planarity: 0 };
  for (const v of verts) for (const x of v) if (!Number.isFinite(x)) {
    return { ok: false, reason: 'a corner ran off to infinity', clearance: -1, minDihedral: 0, volume: 0, planarity: 0 };
  }
  const a = acoptic(verts);
  const planes = planesFromVertices(verts);
  let minDihedral = 180;
  for (const [, , f, g] of EDGES) {
    const c = dot(planes[f].n, planes[g].n);
    minDihedral = Math.min(minDihedral, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  const near = a.ok ? clearance(verts) : null;
  return {
    ...a,
    reason: a.reason || 'a solid',
    clearance: near ? near.distance : -1,
    nearest: near,
    minDihedral,
    volume: volume(verts),
    planarity: planarityResidual(verts),
  };
}

// -------------------------------------------------- the knobs on the shape --

/** A stable tangent pair per plane, made S₄-equivariant so the lock is a copy. */
export const TILT_BASIS = (() => {
  const basis = new Array(8);
  const build = (n) => {
    const t = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = unit(cross(n, t));
    return [e1, cross(n, e1)];
  };
  for (const orbit of S4.orbits) {
    basis[orbit[0]] = build(REFERENCE_PLANES[orbit[0]].n);
    for (let k = 1; k < orbit.length; k++) {
      const prev = basis[orbit[k - 1]];
      basis[orbit[k]] = [S4.map(prev[0]), S4.map(prev[1])];
    }
  }
  return basis;
})();

/** The length a slide of 1 moves a plane: a quarter of the solid's radius. */
export const OFFSET_UNIT = bounds(REFERENCE_VERTICES).radius / 4;

export const ZERO_KNOBS = () => Array.from({ length: 8 }, () => [0, 0, 0]);

function rotateAbout(v, axis, angle) {
  if (!angle) return v.slice();
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

/** Turn the 24 knobs into 8 planes: two tilts and a slide for each. */
export function planesFromKnobs(knobs) {
  return REFERENCE_PLANES.map((p0, i) => {
    const [a, b, off] = knobs[i];
    const [e1, e2] = TILT_BASIS[i];
    let n = rotateAbout(p0.n, e1, a);
    n = rotateAbout(n, rotateAbout(e2, e1, a), b);
    return { n, d: p0.d + off * OFFSET_UNIT, area2: 1 };
  });
}

export const build = (knobs) => verticesFromPlanes(planesFromKnobs(knobs));

/**
 * Carry one plane's knobs round its S₄ orbit, restoring the symmetry.
 *
 * TILT_BASIS is built S₄-equivariant, so the slide is a plain copy — but the
 * TILTS ARE NOT. T is orientation-reversing, and an improper map conjugates a
 * rotation into a rotation about the image axis BY THE OPPOSITE ANGLE:
 * T R(e, a) T⁻¹ = R(Te, −a). So the tilt sign flips at every step round the
 * orbit, and comes back to itself after two — which it must, since T² is the
 * honest half-turn. (The /szilassi/ page's half-turn is proper, so there the
 * same job really is a plain copy. Same idea, one sign apart.)
 */
export function symmetrize(knobs, master = 0) {
  const out = knobs.map((k) => k.slice());
  for (const orbit of S4.orbits) {
    const at = orbit.indexOf(master);
    const src = at >= 0 ? at : 0;
    const [a, b, off] = knobs[orbit[src]];
    for (let j = 0; j < orbit.length; j++) {
      const flip = (j - src) % 2 === 0 ? 1 : -1;
      out[orbit[j]] = [flip * a, flip * b, off];
    }
  }
  return out;
}

export function isSymmetric(knobs, tol = 1e-12) {
  for (const orbit of S4.orbits) {
    for (let j = 0; j < orbit.length; j++) {
      const flip = j % 2 === 0 ? 1 : -1;
      const want = [flip * knobs[orbit[0]][0], flip * knobs[orbit[0]][1], knobs[orbit[0]][2]];
      for (let k = 0; k < 3; k++) if (Math.abs(knobs[orbit[j]][k] - want[k]) > tol) return false;
    }
  }
  return true;
}

/**
 * Degrees of freedom, measured rather than counted: the rank of
 * d(corners)/d(knobs), less the rank of the similarities of space, which move
 * the solid without changing its shape.
 *
 * Eight planes, three numbers each, is 24; the similarities take 7; so this
 * solid has 17 shape freedoms where its seven-faced cousin has 14. Under the
 * S₄ lock only two planes are free and only two similarities keep the axis
 * where it is (a turn about it and a scale — a slide ALONG it moves the
 * rotary reflection's fixed point, so it is not allowed).
 */
export function degreesOfFreedom(knobs, { symmetric = false, h = 1e-5 } = {}) {
  const base = build(knobs);
  if (!base) return null;
  const flat = (vs) => vs.flat();
  const dirs = [];
  if (symmetric) for (const orbit of S4.orbits) for (let k = 0; k < 3; k++) dirs.push([orbit[0], k]);
  else for (let i = 0; i < 8; i++) for (let k = 0; k < 3; k++) dirs.push([i, k]);
  const nudge = (i, k, dx) => {
    let n = knobs.map((r) => r.slice());
    n[i][k] += dx;
    if (symmetric) n = symmetrize(n, i);
    return build(n);
  };
  const cols = [];
  for (const [i, k] of dirs) {
    const a = nudge(i, k, h), b = nudge(i, k, -h);
    if (!a || !b) return null;
    const fa = flat(a), fb = flat(b);
    cols.push(fa.map((x, n) => (x - fb[n]) / (2 * h)));
  }
  const c = bounds(base).centre;
  const T = (u) => flat(base.map(() => u));
  const R = (u) => flat(base.map((v) => cross(u, sub(v, c))));
  const scale = flat(base.map((v) => sub(v, c)));
  const gens = symmetric
    ? [R([0, 0, 1]), scale]
    : [T([1, 0, 0]), T([0, 1, 0]), T([0, 0, 1]), R([1, 0, 0]), R([0, 1, 0]), R([0, 0, 1]), scale];
  const moves = numericRank(cols);
  const rigid = numericRank(gens);
  const together = numericRank(cols.concat(gens));
  // Subtract only the similarities the knobs can actually produce. Under the
  // S₄ lock the knobs cannot scale the solid — every plane's slide is the same
  // ADDITIVE step, while a scale multiplies each plane's offset — so the naive
  // "moves − rigid" would take one freedom away twice.
  return {
    knobs: dirs.length, moves, rigid, together,
    shapes: together - rigid,
    rigidInsideMoves: together === moves,
  };
}

/** Rank by Gram-Schmidt with pivoting on the largest remaining column. */
export function numericRank(columns, rel = 1e-7) {
  const work = columns.map((c) => c.slice());
  let first = 0, rank = 0;
  for (;;) {
    let best = -1, bestNorm = 0;
    for (let i = 0; i < work.length; i++) {
      if (!work[i]) continue;
      const n = Math.hypot(...work[i]);
      if (n > bestNorm) { bestNorm = n; best = i; }
    }
    if (best < 0) break;
    if (rank === 0) first = bestNorm;
    if (bestNorm <= rel * first) break;
    const q = work[best].map((x) => x / bestNorm);
    work[best] = null;
    for (let i = 0; i < work.length; i++) {
      if (!work[i]) continue;
      let d = 0;
      for (let k = 0; k < q.length; k++) d += q[k] * work[i][k];
      for (let k = 0; k < q.length; k++) work[i][k] -= d * q[k];
    }
    rank++;
  }
  return rank;
}

// ------------------------------------------------------------- for drawing --

/** Ear-clip a nonagon in its own plane. None of the eight is convex. */
export function triangulateFace(verts, face, plane) {
  const { poly } = faceFrame(verts, face, plane);
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let signed = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    signed += a[0] * b[1] - b[0] * a[1];
  }
  const idx = face.map((_, i) => i);
  if (signed < 0) idx.reverse();
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 200) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (area2(poly[a], poly[b], poly[c]) <= 0) continue;
      let blocked = false;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        if (area2(poly[a], poly[b], poly[j]) >= 0 && area2(poly[b], poly[c], poly[j]) >= 0
            && area2(poly[c], poly[a], poly[j]) >= 0) { blocked = true; break; }
      }
      if (blocked) continue;
      tris.push([face[a], face[b], face[c]]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([face[idx[0]], face[idx[1]], face[idx[2]]]);
  const out = signed < 0 ? tris.map((t) => [t[2], t[1], t[0]]) : tris;
  // Clipping a nonagon can leave three corners in a line and so produce a
  // triangle of no area. It covers nothing, so drop it rather than hand the
  // renderer a degenerate face.
  const tol = 1e-9 * Math.abs(signed);
  return out.filter(([a, b, c]) => len(cross(sub(verts[b], verts[a]), sub(verts[c], verts[a]))) > tol);
}

/**
 * Eight colours, because eight are needed: every face touches every other, so
 * no two may share. The seven-faced cousin needs seven; a map on a genus-3
 * surface is allowed up to nine by Heawood's bound.
 */
export const FACE_COLOURS = [
  '#c9405f', '#e08b1a', '#128a8f', '#2f5da8',
  '#7a45a6', '#3f9550', '#8a8f99', '#b5521b',
];
