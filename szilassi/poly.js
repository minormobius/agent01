// szilassi/poly.js — the Szilassi polyhedron as a 7-tuple of planes.
//
// Loaded by index.html with <script type="module"> and imported UNCHANGED by
// poly.selftest.mjs, so the maths the browser runs is the maths that is tested.
// No dependencies, no build step.
//
// The one idea this file is built on:
//
//   Every vertex of the Szilassi polyhedron has degree 3, so it is the meet of
//   three face planes. There are only seven faces. So SEVEN PLANES DETERMINE
//   THE WHOLE SOLID — every face is planar by construction, and the shape has
//   exactly 7 x 3 = 21 parameters. Nothing is ever solved for; the polyhedron
//   is read off the planes.
//
// Combinatorics are those of the Szilassi torus as published in
// Grünbaum & Szilassi, "Geometric realizations of special toroidal complexes",
// Contributions to Discrete Mathematics 4 (2009) 21-39, Table 3, whose vertex
// coordinates are reproduced below and used as the reference realization.

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

// ----------------------------------------------------- the reference solid ---

/**
 * Grünbaum & Szilassi 2009, Table 3 — the vertices of the polyhedron in their
 * Figure 10, verbatim. These numbers are exact: every face is planar to the
 * last bit of a double, which `poly.selftest.mjs` asserts rather than assumes.
 */
export const REFERENCE_VERTICES = [
  [-24, 0, 24], [24, 0, 24], [0, -25.2, -24], [0, 25.2, -24],
  [4, -10, -16], [-4, 10, -16], [-7.5, -7.5, -6], [7.5, 7.5, -6],
  [9, -5, 4], [-9, 5, 4], [-14, 0, 4], [14, 0, 4], [-14, -5, 4], [14, 5, 4],
];

/**
 * The seven hexagons, as cycles of vertex indices (0-based). Table 3's face
 * list, re-oriented by `orientFaces` below so that all seven agree on which
 * side of the surface is outside; the selftest checks that every edge is
 * traversed once in each direction.
 */
export const FACES = [
  [0, 1, 13, 9, 7, 5],
  [0, 5, 3, 2, 10, 12],
  [2, 4, 6, 7, 9, 10],
  [3, 5, 7, 6, 8, 11],
  [1, 4, 2, 3, 11, 13],
  [12, 8, 6, 4, 1, 0],
  [8, 12, 10, 9, 13, 11],
];

/**
 * Which three faces meet at each vertex — the whole content of the
 * plane picture. Derived from FACES (and re-derived in the selftest, which
 * checks these are exactly the 14 triples the face cycles imply).
 */
export const VERTEX_PLANES = [
  [0, 1, 5], [0, 4, 5], [1, 2, 4], [1, 3, 4], [2, 4, 5], [0, 1, 3], [2, 3, 5],
  [0, 2, 3], [3, 5, 6], [0, 2, 6], [1, 2, 6], [3, 4, 6], [1, 5, 6], [0, 4, 6],
];

/** The 21 edges, as [vertexA, vertexB, faceLeft, faceRight]. Built once. */
export const EDGES = (() => {
  const seen = new Map();
  FACES.forEach((f, fi) => {
    for (let i = 0; i < 6; i++) {
      const a = f[i], b = f[(i + 1) % 6];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      const rec = seen.get(key);
      if (rec) rec.push(fi);
      else seen.set(key, [fi]);
    }
  });
  return [...seen.entries()].map(([k, fs]) => {
    const [a, b] = k.split(',').map(Number);
    return [a, b, fs[0], fs[1]];
  });
})();

/**
 * Every one of the C(7,2) = 21 face pairs shares an edge — that is the whole
 * point of the polyhedron — so this map is total: PAIR_EDGE[i][j] is the edge
 * faces i and j have in common, as its two vertex indices.
 */
export const PAIR_EDGE = (() => {
  const m = Array.from({ length: 7 }, () => new Array(7).fill(null));
  for (const [a, b, f, g] of EDGES) { m[f][g] = [a, b]; m[g][f] = [a, b]; }
  return m;
})();

/**
 * The 180-degree symmetry of the reference solid: rotation by pi about the
 * z-axis. It swaps three pairs of faces and fixes the seventh.
 */
export const C2 = {
  rotate: (v) => [-v[0], -v[1], v[2]],
  faceOf: [5, 4, 3, 2, 1, 0, 6],   // face i maps to face FACE_OF[i]
  vertexOf: [1, 0, 3, 2, 5, 4, 7, 6, 9, 8, 11, 10, 13, 12],
  fixedFace: 6,
};

// ------------------------------------------------------- planes <-> solid ---

/**
 * The plane of a face, as `[nx, ny, nz, d]` with a unit normal and `n·x = d`.
 * The normal follows the face's cycle by the right-hand rule, so it points
 * out of the solid for every face at once.
 */
export function planeOfFace(verts, face) {
  const p = face.map((i) => verts[i]);
  // Newell's normal: uses all six vertices, so it degrades gracefully if a
  // face is very thin rather than depending on which three we happened to pick.
  let n = [0, 0, 0];
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
  return [u[0], u[1], u[2], d / p.length];
}

/** All seven planes of a realization given by its vertices. */
export function planesFromVertices(verts) {
  return FACES.map((f) => planeOfFace(verts, f));
}

/** The seven planes of the reference solid. */
export const REFERENCE_PLANES = planesFromVertices(REFERENCE_VERTICES);

/**
 * The inverse, and the heart of the model: intersect the three planes meeting
 * at each vertex. Returns `null` when any triple is within `eps` of being
 * linearly dependent, which is exactly when the shape has stopped existing.
 */
export function verticesFromPlanes(planes, eps = 1e-9) {
  const out = new Array(14);
  for (let v = 0; v < 14; v++) {
    const [i, j, k] = VERTEX_PLANES[v];
    const A = planes[i], B = planes[j], C = planes[k];
    const na = [A[0], A[1], A[2]], nb = [B[0], B[1], B[2]], nc = [C[0], C[1], C[2]];
    const bc = cross(nb, nc);
    const det = dot(na, bc);
    if (!(Math.abs(det) > eps)) return null;
    out[v] = mul(
      add(add(mul(bc, A[3]), mul(cross(nc, na), B[3])), mul(cross(na, nb), C[3])),
      1 / det,
    );
  }
  return out;
}

/**
 * Re-orient the published face cycles so all seven induce the same orientation
 * on the surface. Exported because the selftest re-derives FACES with it from
 * the published lists rather than trusting the constant above.
 */
export function orientFaces(faceCycles) {
  const faces = faceCycles.map((f) => f.slice());
  const dir = (f) => { const s = new Set(); for (let i = 0; i < f.length; i++) s.add(`${f[i]}>${f[(i + 1) % f.length]}`); return s; };
  const done = new Set([0]);
  const queue = [0];
  while (queue.length) {
    const a = queue.shift();
    const da = dir(faces[a]);
    for (let b = 0; b < faces.length; b++) {
      if (done.has(b)) continue;
      const fb = faces[b];
      let shares = false, clash = false;
      for (let i = 0; i < fb.length; i++) {
        const key = `${fb[i]}>${fb[(i + 1) % fb.length]}`;
        const rev = `${fb[(i + 1) % fb.length]}>${fb[i]}`;
        if (da.has(rev)) shares = true;
        if (da.has(key)) { shares = true; clash = true; }
      }
      if (!shares) continue;
      if (clash) fb.reverse();
      done.add(b); queue.push(b);
    }
  }
  return faces;
}

// -------------------------------------------------------- is it a SOLID? ---

/**
 * A face in its own plane: origin, orthonormal frame, and its six vertices as
 * 2-D points. Everything that has to reason about a single hexagon works here.
 */
export function faceFrame(verts, face, plane) {
  const n = [plane[0], plane[1], plane[2]];
  const e1 = unit(sub(verts[face[1]], verts[face[0]]));
  const e2 = cross(n, e1);
  const o = verts[face[0]];
  const poly = face.map((i) => [dot(sub(verts[i], o), e1), dot(sub(verts[i], o), e2)]);
  return { o, e1, e2, n, poly, to2d: (p) => [dot(sub(p, o), e1), dot(sub(p, o), e2)] };
}

/** Point in (possibly non-convex) polygon, counting the boundary as inside. */
export function pointInPolygon(pt, poly, tol) {
  const m = poly.length;
  for (let i = 0; i < m; i++) {
    const a = poly[i], b = poly[(i + 1) % m];
    const vx = b[0] - a[0], vy = b[1] - a[1];
    const L2 = vx * vx + vy * vy;
    let t = L2 ? ((pt[0] - a[0]) * vx + (pt[1] - a[1]) * vy) / L2 : 0;
    t = Math.max(0, Math.min(1, t));
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

/**
 * Exactly how two faces meet.
 *
 * Two faces lie in two planes, so they can only meet along the line where
 * those planes cross. Walk that line: mark every place either hexagon's
 * boundary touches it, then test the midpoint of each resulting stretch for
 * being inside each hexagon. What both hexagons cover IS their intersection,
 * as a set of intervals along the line.
 *
 * For a Szilassi polyhedron every one of the 21 face pairs is adjacent, and a
 * solid needs that intersection to be *exactly* their shared edge — no more.
 * So the returned `extra` is the length of intersection that is not the shared
 * edge (the amount by which the two faces pass through each other) and `gap`
 * is how far the nearest other piece of intersection still is from the edge.
 */
export function facePairMeeting(verts, planes, f, g, scale) {
  const A = planes[f], B = planes[g];
  const nf = [A[0], A[1], A[2]], ng = [B[0], B[1], B[2]];
  const axis = cross(nf, ng);
  if (len(axis) < 1e-7) return { coplanar: true, extra: Infinity, gap: -1 };
  const u = unit(axis);
  const c = dot(nf, ng), den = 1 - c * c;
  const x0 = add(mul(nf, (A[3] - B[3] * c) / den), mul(ng, (B[3] - A[3] * c) / den));
  const tOf = (p) => dot(sub(p, x0), u);

  const frames = [faceFrame(verts, FACES[f], A), faceFrame(verts, FACES[g], B)];
  const planesOther = [B, A];
  const eps = 1e-9 * scale;

  // every place either boundary meets the line
  const cuts = [];
  for (let s = 0; s < 2; s++) {
    const face = FACES[s === 0 ? f : g];
    const q = planesOther[s], nq = [q[0], q[1], q[2]];
    for (let i = 0; i < 6; i++) {
      const va = verts[face[i]], vb = verts[face[(i + 1) % 6]];
      const sa = dot(nq, va) - q[3], sb = dot(nq, vb) - q[3];
      if (Math.abs(sa) <= eps) cuts.push(tOf(va));
      if (Math.abs(sa) > eps && Math.abs(sb) > eps && (sa > 0) !== (sb > 0)) {
        cuts.push(tOf(add(va, mul(sub(vb, va), sa / (sa - sb)))));
      }
    }
  }
  if (!cuts.length) return { coplanar: false, extra: 0, gap: Infinity, covered: [] };
  cuts.sort((a, b) => a - b);
  const marks = [cuts[0]];
  for (const t of cuts) if (t - marks[marks.length - 1] > 1e-7 * scale) marks.push(t);

  // what both hexagons cover
  const covered = [];
  for (let i = 0; i + 1 < marks.length; i++) {
    const tm = (marks[i] + marks[i + 1]) / 2;
    const p = add(x0, mul(u, tm));
    if (frames.every((fr) => pointInPolygon(fr.to2d(p), fr.poly, 1e-7 * scale))) {
      const last = covered[covered.length - 1];
      if (last && Math.abs(last[1] - marks[i]) <= 1e-7 * scale) last[1] = marks[i + 1];
      else covered.push([marks[i], marks[i + 1]]);
    }
  }

  const edge = PAIR_EDGE[f][g];
  const e = [tOf(verts[edge[0]]), tOf(verts[edge[1]])].sort((a, b) => a - b);
  let extra = 0, gap = Infinity;
  for (const [a, b] of covered) {
    const lo = Math.max(a, e[0]), hi = Math.min(b, e[1]);
    extra += (b - a) - Math.max(0, hi - lo);
    if (b < e[0]) gap = Math.min(gap, e[0] - b);
    else if (a > e[1]) gap = Math.min(gap, a - e[1]);
  }
  // the shared edge itself must be covered, or the faces have come apart
  const onEdge = covered.some(([a, b]) => a <= e[0] + 1e-7 * scale && b >= e[1] - 1e-7 * scale);
  return { coplanar: false, extra: extra / scale, gap: gap / scale, onEdge, covered, edgeSpan: e };
}

/**
 * Acopticity: do the seven hexagons bound a solid, or do they pass through
 * one another? Two faces can only meet in the line where their planes cross,
 * and every pair here is adjacent, so the whole question is 21 applications of
 * `facePairMeeting` plus "is each hexagon a simple polygon".
 *
 * `clearance`, in units of the solid's own radius, is how much room is left
 * before the nearest pair starts to overlap: positive is a solid.
 */
export function acoptic(verts) {
  const { radius: scale } = bounds(verts);
  if (!(scale > 0)) return { ok: false, clearance: -1, reason: 'degenerate' };

  const planes = planesFromVertices(verts);
  for (const p of planes) if (!Number.isFinite(p[3]) || !(Math.abs(p[0]) + Math.abs(p[1]) + Math.abs(p[2]) > 0.5)) {
    return { ok: false, clearance: -1, reason: 'a face has no plane' };
  }

  for (let f = 0; f < 7; f++) {
    const s = simplePolygon(verts, FACES[f], planes[f], scale);
    if (!s.ok) return { ok: false, clearance: -1, reason: `face ${f + 1}: ${s.reason}`, face: f };
  }

  let clearance = Infinity, worst = null;
  for (let f = 0; f < 7; f++) {
    for (let g = f + 1; g < 7; g++) {
      const m = facePairMeeting(verts, planes, f, g, scale);
      if (m.coplanar) return { ok: false, clearance: -1, reason: `faces ${f + 1} and ${g + 1} are coplanar`, pair: [f, g] };
      if (!m.onEdge) return { ok: false, clearance: -1, reason: `faces ${f + 1} and ${g + 1} lost their shared edge`, pair: [f, g] };
      if (m.extra > 1e-7) return { ok: false, clearance: -m.extra, reason: `faces ${f + 1} and ${g + 1} pass through each other`, pair: [f, g] };
      if (m.gap < clearance) { clearance = m.gap; worst = [f, g]; }
    }
  }
  return { ok: true, clearance, worst };
}

/**
 * How much room is left: the closest any corner comes to a face it is not a
 * corner of, as a fraction of the solid's radius. The acopticity test above
 * gives the verdict; this gives the margin, and it shrinks smoothly towards
 * zero as a deformation drives the surface into itself.
 */
export function closestApproach(verts) {
  const { radius: scale } = bounds(verts);
  const planes = planesFromVertices(verts);
  const frames = FACES.map((f, i) => faceFrame(verts, f, planes[i]));
  let best = Infinity, where = null;
  for (let g = 0; g < 7; g++) {
    const fr = frames[g];
    for (let v = 0; v < 14; v++) {
      if (FACES[g].includes(v)) continue;
      const q = fr.to2d(verts[v]);
      const h = dot(fr.n, verts[v]) - planes[g][3];
      let flat = 0;
      if (!pointInPolygon(q, fr.poly, 0)) {
        flat = Infinity;
        for (let i = 0; i < 6; i++) {
          const a = fr.poly[i], b = fr.poly[(i + 1) % 6];
          const vx = b[0] - a[0], vy = b[1] - a[1], L2 = vx * vx + vy * vy;
          const t = L2 ? Math.max(0, Math.min(1, ((q[0] - a[0]) * vx + (q[1] - a[1]) * vy) / L2)) : 0;
          flat = Math.min(flat, Math.hypot(q[0] - (a[0] + t * vx), q[1] - (a[1] + t * vy)));
        }
      }
      const d = Math.hypot(h, flat);
      if (d < best) { best = d; where = { vertex: v, face: g }; }
    }
  }
  return { distance: best / (scale || 1), ...where };
}

/** A planar polygon is simple if no two of its non-adjacent edges meet. */
export function simplePolygon(verts, face, plane, scale) {
  const { poly: p } = faceFrame(verts, face, plane);
  const m = p.length;
  const tol = 1e-9 * scale;

  for (let i = 0; i < m; i++) {
    const a = p[i], b = p[(i + 1) % m], c = p[(i + 2) % m];
    if (Math.hypot(b[0] - a[0], b[1] - a[1]) < tol) return { ok: false, reason: 'zero-length edge' };
    // no collinear adjacent edges (the definition of "simple" the polyhedron needs)
    const turn = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(turn) < tol * scale) return { ok: false, reason: 'collinear adjacent edges' };
  }
  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      if (j === i + 1 || (i === 0 && j === m - 1)) continue; // adjacent: they share a vertex
      if (segmentsCross(p[i], p[(i + 1) % m], p[j], p[(j + 1) % m])) {
        return { ok: false, reason: 'the face crosses itself' };
      }
    }
  }
  return { ok: true };
}

function segmentsCross(a, b, c, d) {
  const o = (p, q, r) => (q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]);
  const d1 = o(a, b, c), d2 = o(a, b, d), d3 = o(c, d, a), d4 = o(c, d, b);
  return ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0));
}

/**
 * The full verdict on a candidate realization: is it a Szilassi polyhedron?
 * Everything the definition asks for, measured rather than assumed.
 */
export function inspect(verts) {
  if (!verts) return { ok: false, reason: 'three faces of a vertex became parallel', clearance: -1 };
  for (const v of verts) for (const x of v) if (!Number.isFinite(x)) {
    return { ok: false, reason: 'a vertex ran off to infinity', clearance: -1 };
  }
  const a = acoptic(verts);
  const planes = planesFromVertices(verts);
  const near = a.ok ? closestApproach(verts) : null;
  let minDihedral = 180;
  for (const [, , f, g] of EDGES) {
    const c = dot([planes[f][0], planes[f][1], planes[f][2]], [planes[g][0], planes[g][1], planes[g][2]]);
    minDihedral = Math.min(minDihedral, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return {
    ...a,
    clearance: near ? near.distance : a.clearance,
    nearest: near,
    planarity: planarityResidual(verts),
    minDihedral,
    reason: a.reason || 'a solid',
  };
}

/** Worst out-of-plane deviation of any face vertex, relative to the solid's size. */
export function planarityResidual(verts) {
  let scale = 0;
  const c = verts.reduce((s, v) => add(s, v), [0, 0, 0]).map((x) => x / 14);
  for (const v of verts) scale = Math.max(scale, len(sub(v, c)));
  let worst = 0;
  FACES.forEach((f) => {
    const p = planeOfFace(verts, f);
    for (const i of f) worst = Math.max(worst, Math.abs(dot([p[0], p[1], p[2]], verts[i]) - p[3]));
  });
  return worst / (scale || 1);
}

// -------------------------------------------------- the knobs on the shape ---

/**
 * A stable orthonormal pair spanning each plane's tangent directions, so that
 * "tilt" means the same thing from one session to the next — and so that the
 * basis of a face is the C2 image of the basis of its partner, which is what
 * makes the symmetry lock a plain copy of three numbers.
 */
export const TILT_BASIS = (() => {
  const basis = new Array(7);
  const build = (n) => {
    const t = Math.abs(n[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    const e1 = unit(cross(n, t));
    return [e1, cross(n, e1)];
  };
  // masters first, then their partners as exact C2 images
  for (const i of [0, 1, 2, 6]) {
    const p = REFERENCE_PLANES[i];
    basis[i] = build([p[0], p[1], p[2]]);
  }
  for (const i of [0, 1, 2]) {
    const j = C2.faceOf[i];
    basis[j] = [C2.rotate(basis[i][0]), C2.rotate(basis[i][1])];
  }
  return basis;
})();

/** The length the offset slider is measured in: a quarter of the solid's radius. */
export const OFFSET_UNIT = (() => {
  const c = REFERENCE_VERTICES.reduce((s, v) => add(s, v), [0, 0, 0]).map((x) => x / 14);
  return Math.max(...REFERENCE_VERTICES.map((v) => len(sub(v, c)))) / 4;
})();

/** Seven zeroed knobs: the reference solid itself. */
export const ZERO_KNOBS = () => Array.from({ length: 7 }, () => [0, 0, 0]);

/**
 * Turn the 21 knobs into 7 planes. Each face gets two tilts (radians, about
 * its own tangent basis) and one offset (in OFFSET_UNIT along its normal).
 */
export function planesFromKnobs(knobs) {
  return REFERENCE_PLANES.map((p0, i) => {
    const [a, b, off] = knobs[i];
    const n0 = [p0[0], p0[1], p0[2]];
    const [e1, e2] = TILT_BASIS[i];
    // small-rotation composition kept exact: rotate n0 about e1 then about e2
    let n = rotateAbout(n0, e1, a);
    n = rotateAbout(n, rotateAbout(e2, e1, a), b);
    return [n[0], n[1], n[2], p0[3] + off * OFFSET_UNIT];
  });
}

function rotateAbout(v, axis, angle) {
  if (!angle) return v.slice();
  const c = Math.cos(angle), s = Math.sin(angle);
  return add(add(mul(v, c), mul(cross(axis, v), s)), mul(axis, dot(axis, v) * (1 - c)));
}

/** The realization the knobs describe, or null if they broke it. */
export function build(knobs) {
  return verticesFromPlanes(planesFromKnobs(knobs));
}

/**
 * Copy each master face's knobs onto its C2 partner, restoring the 180-degree
 * symmetry. Because TILT_BASIS is C2-equivariant this is literally a copy; the
 * fixed face may only slide along the axis, so its tilts are zeroed.
 */
export function symmetrize(knobs, master = 0) {
  const out = knobs.map((k) => k.slice());
  for (const i of [0, 1, 2]) {
    const j = C2.faceOf[i];
    const src = (master === j) ? j : i;
    out[i] = knobs[src].slice();
    out[j] = knobs[src].slice();
  }
  out[C2.fixedFace][0] = 0;
  out[C2.fixedFace][1] = 0;
  return out;
}

/** Does this configuration still have the 180-degree symmetry? */
export function isSymmetric(knobs, tol = 1e-12) {
  for (const i of [0, 1, 2]) {
    const j = C2.faceOf[i];
    for (let k = 0; k < 3; k++) if (Math.abs(knobs[i][k] - knobs[j][k]) > tol) return false;
  }
  return Math.abs(knobs[6][0]) <= tol && Math.abs(knobs[6][1]) <= tol;
}

// --------------------------------------------------------- how many knobs ---

/**
 * The honest answer to "are there degrees of freedom?", measured at a given
 * shape instead of counted on paper.
 *
 * `moves` is the rank of d(vertices)/d(knobs): how many independent ways the
 * 42 coordinates can move while all seven faces stay flat. `rigid` is the rank
 * of the similarities — translate (3), rotate (3), scale (1) — which change
 * the position of the solid but not its shape. The difference is the number of
 * genuinely different shapes you can reach, and it is what the page reports.
 */
export function degreesOfFreedom(knobs, { symmetric = false, h = 1e-5 } = {}) {
  const base = build(knobs);
  if (!base) return null;
  const flat = (vs) => vs.flat();

  // which knobs are allowed to move, and how a move propagates
  const dirs = [];
  if (symmetric) {
    for (const i of [0, 1, 2]) for (let k = 0; k < 3; k++) dirs.push([i, k]);
    dirs.push([C2.fixedFace, 2]);
  } else {
    for (let i = 0; i < 7; i++) for (let k = 0; k < 3; k++) dirs.push([i, k]);
  }
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

  // the similarities that move the solid without changing its shape; under the
  // symmetry lock only those that keep the axis where it is may be used
  const c = bounds(base).centre;
  const T = (u) => flat(base.map(() => u));
  const R = (u) => flat(base.map((v) => cross(u, sub(v, c))));
  const gens = symmetric
    ? [T([0, 0, 1]), R([0, 0, 1]), flat(base.map((v) => sub(v, c)))]
    : [T([1, 0, 0]), T([0, 1, 0]), T([0, 0, 1]),
       R([1, 0, 0]), R([0, 1, 0]), R([0, 0, 1]),
       flat(base.map((v) => sub(v, c)))];

  const moves = numericRank(cols);
  const rigid = numericRank(gens);
  const together = numericRank(cols.concat(gens));
  return { knobs: dirs.length, moves, rigid, shapes: moves - rigid, rigidInsideMoves: together === moves };
}

/**
 * Rank by Gram-Schmidt with pivoting on the largest remaining column. The
 * cutoff is relative to the largest pivot, so it is scale-free; callers get
 * the gap so they can see the decision was not marginal.
 */
export function numericRank(columns, rel = 1e-7) {
  const basis = [];
  const work = columns.map((c) => c.slice());
  let first = 0, rank = 0, lastPivot = 0;
  for (;;) {
    let best = -1, bestNorm = 0;
    for (let i = 0; i < work.length; i++) {
      if (work[i] === null) continue;
      const nrm = Math.hypot(...work[i]);
      if (nrm > bestNorm) { bestNorm = nrm; best = i; }
    }
    if (best < 0) break;
    if (rank === 0) first = bestNorm;
    if (bestNorm <= rel * first) break;
    lastPivot = bestNorm;
    const q = work[best].map((x) => x / bestNorm);
    basis.push(q);
    work[best] = null;
    for (let i = 0; i < work.length; i++) {
      if (work[i] === null) continue;
      let d = 0;
      for (let k = 0; k < q.length; k++) d += q[k] * work[i][k];
      for (let k = 0; k < q.length; k++) work[i][k] -= d * q[k];
    }
    rank++;
  }
  return rank;
}

// ------------------------------------------------------------- for drawing ---

/**
 * Ear-clip a face into triangles inside its own plane. The hexagons are not
 * convex — face 7 of the reference solid is a genuine non-convex hexagon — so
 * a triangle fan would fold over itself.
 */
export function triangulateFace(verts, face, plane) {
  const n = [plane[0], plane[1], plane[2]];
  const e1 = unit(sub(verts[face[1]], verts[face[0]]));
  const e2 = cross(n, e1);
  const o = verts[face[0]];
  const p = face.map((i) => [dot(sub(verts[i], o), e1), dot(sub(verts[i], o), e2)]);
  const area2 = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  let signedArea = 0;
  for (let i = 0; i < p.length; i++) {
    const a = p[i], b = p[(i + 1) % p.length];
    signedArea += a[0] * b[1] - b[0] * a[1];
  }
  const idx = face.map((_, i) => i);
  if (signedArea < 0) idx.reverse();
  const tris = [];
  let guard = 0;
  while (idx.length > 3 && guard++ < 64) {
    let clipped = false;
    for (let i = 0; i < idx.length; i++) {
      const a = idx[(i + idx.length - 1) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
      if (area2(p[a], p[b], p[c]) <= 0) continue;
      let inside = false;
      for (const j of idx) {
        if (j === a || j === b || j === c) continue;
        if (area2(p[a], p[b], p[j]) >= 0 && area2(p[b], p[c], p[j]) >= 0 && area2(p[c], p[a], p[j]) >= 0) { inside = true; break; }
      }
      if (inside) continue;
      tris.push([face[a], face[b], face[c]]);
      idx.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (idx.length === 3) tris.push([face[idx[0]], face[idx[1]], face[idx[2]]]);
  // keep the polygon's own winding, which planeOfFace's normal agrees with
  return signedArea < 0 ? tris.map((t) => [t[2], t[1], t[0]]) : tris;
}

/** Centre and radius of a realization, for framing the camera. */
export function bounds(verts) {
  const c = verts.reduce((s, v) => add(s, v), [0, 0, 0]).map((x) => x / 14);
  let r = 0;
  for (const v of verts) r = Math.max(r, len(sub(v, c)));
  return { centre: c, radius: r };
}

/**
 * Shapes worth keeping, found by hill-climbing the knobs offline (the search
 * is `search.mjs`). The numbers beside each are re-measured from the knobs on
 * every selftest run, so a preset cannot quietly stop being what it claims.
 */
export const PRESETS = [
  {
    id: 'szilassi',
    name: 'Szilassi 1977',
    blurb: 'The published solid: Grünbaum & Szilassi 2009, Table 3, to the last decimal.',
    clearance: 0.0384, minDihedral: 48.8, symmetric: true,
    knobs: [[0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0], [0, 0, 0]],
  },
  {
    id: 'roomy',
    name: 'Roomy',
    blurb: 'Knobs turned to put as much air as possible between each corner and the faces it is not part of. Gives up the symmetry to do it.',
    clearance: 0.0892, minDihedral: 50.0, symmetric: false,
    knobs: [[-0.01909, -0.00201, -0.15397], [-0.04351, 0.00754, -0.01137], [0.00726, -0.00312, -0.03487],
            [-0.00986, -0.01264, -0.00147], [0.00062, 0.0024, -0.00868], [-0.04745, 0.00441, -0.19996],
            [0.01832, 0.01628, -0.01691]],
  },
  {
    id: 'roomy-symmetric',
    name: 'Roomy, symmetric',
    blurb: 'The same search restricted to the seven symmetric directions. It loses almost nothing: the 180° axis is nearly free.',
    clearance: 0.0904, minDihedral: 50.9, symmetric: true,
    knobs: [[-0.03475, -0.00367, -0.06829], [-0.03848, 0.07266, 0.00842], [0.02354, -0.00085, 0.07125],
            [0.02354, -0.00085, 0.07125], [-0.03848, 0.07266, 0.00842], [-0.03475, -0.00367, -0.06829],
            [0, 0, -0.1749]],
  },
  {
    id: 'blunt',
    name: 'Blunt',
    blurb: 'Pushed the other way: the sharpest crease between two faces opens from 49° to 75°. Far from the published shape, still a solid.',
    clearance: 0.0205, minDihedral: 75.0, symmetric: false,
    knobs: [[-0.27559, 0.1975, 0.23685], [0.12557, -0.02335, -0.47282], [0.23538, -0.16315, 0.0823],
            [0.06079, -0.10856, 0.03197], [0.22761, -0.05357, 0.07004], [-0.00617, 0.33717, 0.00514],
            [0.06514, 0.37441, 0.04132]],
  },
];

/** Seven colours, because seven are needed: every face touches every other. */
export const FACE_COLOURS = [
  '#c9405f', '#e08b1a', '#128a8f', '#2f5da8', '#7a45a6', '#3f9550', '#8a8f99',
];
