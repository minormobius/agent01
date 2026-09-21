// csaszar/poly.js — the Császár polyhedron as seven points.
//
// Loaded by index.html with <script type="module"> and imported UNCHANGED by
// poly.selftest.mjs, so the maths the browser runs is the maths that is tested.
// No dependencies, no build step.
//
// The sibling page /szilassi/ is the dual of this one, and the two engines are
// mirror images of each other:
//
//   Szilassi is SEVEN PLANES. Every corner is 3-valent, so it is where three
//   face planes cross, and flatness is bought by construction.
//
//   Császár is SEVEN POINTS. Every face is a triangle, and three points are
//   always coplanar, so flatness is free. There is nothing to construct: the
//   seven points ARE the polyhedron.
//
// Both therefore have 21 numbers and, after the 7 similarities of space, the
// same 14 shape degrees of freedom. What is different is what can go wrong,
// and how the answers are classified — see TYPES below.

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

// ------------------------------------------------------ the Möbius torus ---

/**
 * The unique 7-vertex triangulation of the torus, described by Möbius: the
 * 14 triangles {i, i+1, i+3} and {i, i+2, i+3} mod 7. Every one of the 21
 * vertex pairs is an edge — the 1-skeleton is the complete graph K7 — so the
 * solid HAS NO DIAGONALS: there is no segment between two of its corners that
 * is not one of its edges.
 *
 * Stored here with the orientation Szilassi's published models use, so the
 * right-hand rule on each triangle points out of the solid for all 14 at once.
 * `poly.selftest.mjs` re-derives the unoriented set from the formula above and
 * checks these are the same 14 triangles.
 */
export const FACES = [
  [0, 5, 1], [5, 0, 4], [0, 1, 3], [5, 4, 2], [4, 3, 1], [1, 2, 4], [0, 3, 2],
  [2, 3, 5], [6, 4, 0], [6, 1, 5], [6, 3, 4], [6, 2, 1], [6, 5, 3], [6, 0, 2],
];

/** The 21 edges, as [vertexA, vertexB, faceLeft, faceRight] — all C(7,2) pairs. */
export const EDGES = (() => {
  const seen = new Map();
  FACES.forEach((f, fi) => {
    for (let i = 0; i < 3; i++) {
      const a = f[i], b = f[(i + 1) % 3];
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

/** Which triangles meet at each vertex — six of them, in a ring. */
export const VERTEX_FACES = (() => {
  const m = Array.from({ length: 7 }, () => []);
  FACES.forEach((f, i) => f.forEach((v) => m[v].push(i)));
  return m;
})();

/**
 * The relabellings of 0..6 that carry the triangulation to itself: the
 * affine maps x -> ax + b mod 7 with a invertible, so 7 x 6 = 42 of them.
 * Built by search, not asserted, and the selftest checks the count and that
 * each really is an automorphism.
 */
export const AUTOMORPHISMS = (() => {
  const key = (f) => f.slice().sort((a, b) => a - b).join(',');
  const target = new Set(FACES.map(key));
  const out = [];
  const perm = [0, 1, 2, 3, 4, 5, 6];
  const walk = (k) => {
    if (k === 7) {
      if (FACES.every((f) => target.has(key(f.map((v) => perm[v]))))) out.push(perm.slice());
      return;
    }
    for (let i = k; i < 7; i++) {
      [perm[k], perm[i]] = [perm[i], perm[k]];
      walk(k + 1);
      [perm[k], perm[i]] = [perm[i], perm[k]];
    }
  };
  walk(0);
  return out;
})();

/**
 * The half-turn all four published realizations carry: rotation by pi about
 * the z-axis, pairing the vertices (1 6)(2 5)(3 4) in the 1-based labels the
 * literature uses, and fixing the seventh.
 */
export const C2 = {
  rotate: (v) => [-v[0], -v[1], v[2]],
  vertexOf: [5, 4, 3, 2, 1, 0, 6],
  fixedVertex: 6,
  pairs: [[0, 5], [1, 4], [2, 3]],
};

// --------------------------------------------------- is it really a solid ---

/** Newell's normal and offset for a triangle. */
export function planeOfFace(V, f) {
  const n = cross(sub(V[f[1]], V[f[0]]), sub(V[f[2]], V[f[0]]));
  const l = len(n);
  return { n: l ? mul(n, 1 / l) : [0, 0, 0], d: l ? dot(n, V[f[0]]) / l : 0, area2: l };
}

/** Centre and radius of a realization, for framing and for scaling tolerances. */
export function bounds(V) {
  const centre = V.reduce((s, v) => add(s, v), [0, 0, 0]).map((x) => x / V.length);
  let radius = 0;
  for (const v of V) radius = Math.max(radius, len(sub(v, centre)));
  return { centre, radius };
}

/**
 * Where a triangle meets a line that lies in its own plane, as the span of
 * parameters along that line. `q` is the OTHER triangle's plane; the line is
 * where the two planes cross, given by a point `x0` and a direction `u`.
 */
function spanOnLine(V, f, q, x0, u, eps) {
  const s = f.map((i) => dot(q.n, V[i]) - q.d);
  const hits = [];
  for (let i = 0; i < 3; i++) {
    const a = f[i], b = f[(i + 1) % 3], sa = s[i], sb = s[(i + 1) % 3];
    if (Math.abs(sa) <= eps) hits.push(dot(sub(V[a], x0), u));
    else if (Math.abs(sb) > eps && (sa > 0) !== (sb > 0)) {
      const t = sa / (sa - sb);
      hits.push(dot(sub(add(V[a], mul(sub(V[b], V[a]), t)), x0), u));
    }
  }
  return hits.length ? [Math.min(...hits), Math.max(...hits)] : null;
}

/**
 * Do the 14 triangles bound a solid, or does the surface pass through itself?
 *
 * Two triangles lie in two planes, so they can only meet on the line where
 * those planes cross. Each meets that line in one span; where the spans
 * overlap is exactly where the triangles touch. A surface needs that overlap
 * to be no more than the part the two already share — an edge, a corner, or
 * nothing at all.
 *
 * Parallel planes need care and get it: distinct parallel planes never meet
 * and are fine (the two far triangles of an octahedron are the everyday case),
 * while genuinely coincident planes are fatal.
 */
export function acoptic(V) {
  const { radius: scale } = bounds(V);
  if (!(scale > 0)) return { ok: false, reason: 'the seven points collapsed' };
  const eps = 1e-9 * scale, tol = 1e-7 * scale;
  const planes = FACES.map((f) => planeOfFace(V, f));
  for (let i = 0; i < 14; i++) {
    if (!(planes[i].area2 > 1e-12 * scale * scale)) {
      return { ok: false, reason: `triangle ${i + 1} has three points in a line` };
    }
  }
  for (let a = 0; a < 14; a++) {
    for (let b = a + 1; b < 14; b++) {
      const shared = FACES[a].filter((v) => FACES[b].includes(v));
      const P = planes[a], Q = planes[b];
      const axis = cross(P.n, Q.n);
      if (len(axis) < 1e-9) {
        // parallel: coincident is fatal, merely parallel never meets
        if (Math.abs(P.d - (dot(P.n, Q.n) > 0 ? 1 : -1) * Q.d) < tol) {
          return { ok: false, reason: `triangles ${a + 1} and ${b + 1} are coplanar`, pair: [a, b] };
        }
        continue;
      }
      const u = unit(axis), c = dot(P.n, Q.n), den = 1 - c * c;
      const x0 = add(mul(P.n, (P.d - Q.d * c) / den), mul(Q.n, (Q.d - P.d * c) / den));
      const IA = spanOnLine(V, FACES[a], Q, x0, u, eps);
      const IB = spanOnLine(V, FACES[b], P, x0, u, eps);
      if (!IA || !IB) continue;
      const lo = Math.max(IA[0], IB[0]), hi = Math.min(IA[1], IB[1]);
      if (hi < lo - tol) continue;
      if (shared.length === 0) {
        return { ok: false, reason: `triangles ${a + 1} and ${b + 1} cut through each other`, pair: [a, b] };
      }
      const allowed = shared.map((v) => dot(sub(V[v], x0), u)).sort((x, y) => x - y);
      if (lo < allowed[0] - tol || hi > allowed[allowed.length - 1] + tol) {
        return {
          ok: false,
          reason: `triangles ${a + 1} and ${b + 1} overlap past their shared ${shared.length === 2 ? 'edge' : 'corner'}`,
          pair: [a, b],
        };
      }
    }
  }
  return { ok: true };
}

/**
 * The margin: how close the nearest edge comes to a triangle it shares nothing
 * with, as a fraction of the solid's radius. `acoptic` gives the verdict; this
 * shrinks smoothly towards zero as a deformation drives the surface into
 * itself, so it is what the page shows while you drag.
 */
export function clearance(V) {
  const { radius: scale } = bounds(V);
  let best = Infinity, where = null;
  for (const [a, b] of EDGES) {
    for (let f = 0; f < 14; f++) {
      if (FACES[f].includes(a) || FACES[f].includes(b)) continue;
      const d = segmentTriangleDistance(V[a], V[b], FACES[f].map((i) => V[i]));
      if (d < best) { best = d; where = { edge: [a, b], face: f }; }
    }
  }
  return { distance: best / (scale || 1), ...where };
}

function segmentTriangleDistance(p, q, tri) {
  let best = Infinity;
  for (let i = 0; i < 3; i++) best = Math.min(best, segmentSegmentDistance(p, q, tri[i], tri[(i + 1) % 3]));
  for (const x of [p, q]) best = Math.min(best, pointTriangleDistance(x, tri));
  // and the through-the-middle case: does the segment cross the triangle's plane inside it?
  const n = cross(sub(tri[1], tri[0]), sub(tri[2], tri[0]));
  const nl = len(n);
  if (nl > 0) {
    const u = mul(n, 1 / nl);
    const sp = dot(u, sub(p, tri[0])), sq = dot(u, sub(q, tri[0]));
    if ((sp > 0) !== (sq > 0)) {
      const t = sp / (sp - sq);
      const x = add(p, mul(sub(q, p), t));
      if (pointTriangleDistance(x, tri) < 1e-12 * nl) best = 0;
    }
  }
  return best;
}

function pointTriangleDistance(x, tri) {
  const n = unit(cross(sub(tri[1], tri[0]), sub(tri[2], tri[0])));
  const h = dot(n, sub(x, tri[0]));
  const proj = sub(x, mul(n, h));
  let inside = true;
  for (let i = 0; i < 3; i++) {
    const e = sub(tri[(i + 1) % 3], tri[i]);
    if (dot(cross(e, sub(proj, tri[i])), n) < 0) { inside = false; break; }
  }
  if (inside) return Math.abs(h);
  let best = Infinity;
  for (let i = 0; i < 3; i++) best = Math.min(best, pointSegmentDistance(x, tri[i], tri[(i + 1) % 3]));
  return best;
}

function pointSegmentDistance(x, a, b) {
  const ab = sub(b, a), L2 = dot(ab, ab);
  const t = L2 ? Math.max(0, Math.min(1, dot(sub(x, a), ab) / L2)) : 0;
  return len(sub(x, add(a, mul(ab, t))));
}

function segmentSegmentDistance(p1, q1, p2, q2) {
  const d1 = sub(q1, p1), d2 = sub(q2, p2), r = sub(p1, p2);
  const a = dot(d1, d1), e = dot(d2, d2), f = dot(d2, r);
  let s = 0, t = 0;
  if (a <= 1e-300 && e <= 1e-300) return len(r);
  if (a <= 1e-300) { t = Math.max(0, Math.min(1, f / e)); }
  else {
    const c = dot(d1, r);
    if (e <= 1e-300) { s = Math.max(0, Math.min(1, -c / a)); }
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

// ------------------------------------------- which of the four is it? ------

/** The C(7,4) = 35 quadruples, in lexicographic order. */
export const QUADS = (() => {
  const out = [];
  for (let i = 0; i < 7; i++) for (let j = i + 1; j < 7; j++)
    for (let k = j + 1; k < 7; k++) for (let l = k + 1; l < 7; l++) out.push([i, j, k, l]);
  return out;
})();
const QUAD_INDEX = new Map(QUADS.map((q, i) => [q.join(','), i]));

/**
 * The chirotope: for each of the 35 quadruples of points, which side of the
 * plane through the first three the fourth lies on. This is the combinatorial
 * shadow of the configuration — its oriented matroid — and it is the thing
 * Bokowski and Eggert classified.
 *
 * A zero means four points are coplanar. For THIS triangulation that can never
 * happen in a solid: the 1-skeleton is complete, so four coplanar points would
 * put two edges in one plane and they would have to cross. Every realization
 * is therefore in general position, which is why the signs below are the whole
 * story.
 */
export function chirotope(V) {
  const { radius: scale } = bounds(V);
  const tol = 1e-9 * scale * scale * scale;
  return QUADS.map(([i, j, k, l]) => {
    const det = dot(cross(sub(V[j], V[i]), sub(V[k], V[i])), sub(V[l], V[i]));
    return Math.abs(det) <= tol ? 0 : Math.sign(det);
  });
}

/** How far the configuration is from having four points in a plane. */
export function generalPosition(V) {
  const { radius: scale } = bounds(V);
  let worst = Infinity, quad = null;
  for (const [i, j, k, l] of QUADS) {
    const det = dot(cross(sub(V[j], V[i]), sub(V[k], V[i])), sub(V[l], V[i]));
    const v = Math.abs(det) / (scale * scale * scale);
    if (v < worst) { worst = v; quad = [i, j, k, l]; }
  }
  return { margin: worst, quad, ok: worst > 1e-9 };
}

/**
 * A name for the chirotope that does not depend on how the seven points were
 * labelled or which way round the solid is: take the smallest string over all
 * 42 relabellings and both mirror images. Two realizations are "essentially
 * the same" exactly when these agree.
 */
export function canonicalForm(V) {
  const base = chirotope(V);
  let best = null;
  for (const p of AUTOMORPHISMS) {
    for (const mirror of [1, -1]) {
      let s = '';
      for (const q of QUADS) {
        const img = q.map((v) => p[v]);
        let parity = 1;
        for (let x = 0; x < 4; x++) for (let y = x + 1; y < 4; y++) if (img[x] > img[y]) parity = -parity;
        const v = base[QUAD_INDEX.get(img.slice().sort((a, b) => a - b).join(','))] * parity * mirror;
        s += v > 0 ? '+' : v < 0 ? '-' : '0';
      }
      if (best === null || s < best) best = s;
    }
  }
  return best;
}

/**
 * The four realizations, from Lajos Szilassi's models at
 * jgypk.hu/tanszek/matematika/polieder/toroid/Csaszar/ (Cs1.wrl … Cs4.wrl),
 * verbatim. The first is labelled there "the original variant — these are the
 * coordinates Ákos Császár published in 1949".
 *
 * All four have the same half-turn symmetry and differ in ONE visible way:
 * the order in which the three mirror pairs and the fixed vertex stack up the
 * axis. Four of the six possible orders are here; the other two are not, and
 * that is the whole classification.
 *
 * `type` is the canonical chirotope, recomputed and checked by the selftest —
 * never taken on trust.
 */
export const PRESETS = [
  {
    id: 'csaszar', name: 'Császár 1949', stack: '16 · 25 · 34 · 7',
    blurb: 'The original. Ákos Császár’s own coordinates, answering a 1949 competition problem that had assumed the tetrahedron was the only polyhedron without diagonals.',
    points: [[15.492, 0, 0], [0, 8, 4], [-1, 2, 11], [1, -2, 11], [0, -8, 4], [-15.492, 0, 0], [0, 0, 20]],
  },
  {
    id: 'variant-2', name: 'Variant II', stack: '16 · 34 · 25 · 7',
    blurb: 'The middle two layers change places. Nothing continuous takes you here from the original without the surface passing through itself.',
    points: [[12, 0, 0], [0, 8.485, 8.485], [3, -3, 5.485], [-3, 3, 5.485], [0, -8.485, 8.485], [-12, 0, 0], [0, 0, 16.97]],
  },
  {
    id: 'variant-3', name: 'Variant III', stack: '16 · 34 · 7 · 25',
    blurb: 'The lone vertex drops below the top pair. Published very slightly off-symmetric (16.7 against 16.97) and left that way here.',
    points: [[12, 0, 0], [0, 12, 16.97], [-4, -3, 9.194], [4, 3, 9.194], [0, -12, 16.7], [-12, 0, 0], [0, 0, 12.26]],
  },
  {
    id: 'variant-4', name: 'Variant IV', stack: '16 · 7 · 34 · 25',
    blurb: 'The lone vertex drops to the bottom of the stack, and the solid turns inside out around it. Also published a shade off-symmetric (11.414 against 11.314).',
    points: [[12, 0, 0], [0, 12, 16.97], [-3, 3, 11.314], [3, -3, 11.414], [0, -12, 16.97], [-12, 0, 0], [0, 0, 5.656]],
  },
];

/** The canonical chirotope of each preset, computed once from its points. */
export const TYPE_SIGNATURES = PRESETS.map((p) => canonicalForm(p.points));

/**
 * Which of the four a configuration is — or that it is none of them.
 *
 * Worth knowing why this is a meaningful question at all: the chirotope can
 * only change by passing through a coplanar quadruple, and a coplanar
 * quadruple here means two edges crossing. So along any path of solids the
 * chirotope is CONSTANT, and two solids with different chirotopes lie in
 * different pieces of the space of solids. You cannot deform one into another.
 */
export function typeOf(V) {
  const gp = generalPosition(V);
  if (!gp.ok) return { index: -1, name: 'four points in one plane', general: false, margin: gp.margin };
  const form = canonicalForm(V);
  const index = TYPE_SIGNATURES.indexOf(form);
  return {
    index,
    name: index >= 0 ? PRESETS[index].name : 'outside the published four',
    general: true,
    margin: gp.margin,
    form,
  };
}

// ---------------------------------------------------------- the verdict ----

export function inspect(V) {
  for (const v of V) for (const x of v) if (!Number.isFinite(x)) {
    return { ok: false, reason: 'a point ran off to infinity', clearance: -1, type: { index: -1, name: '—' } };
  }
  const a = acoptic(V);
  const type = typeOf(V);
  const near = a.ok ? clearance(V) : null;
  let minDihedral = 180;
  const planes = FACES.map((f) => planeOfFace(V, f));
  for (const [, , f, g] of EDGES) {
    const c = dot(planes[f].n, planes[g].n);
    minDihedral = Math.min(minDihedral, (Math.acos(Math.max(-1, Math.min(1, c))) * 180) / Math.PI);
  }
  return {
    ok: a.ok,
    reason: a.reason || 'a solid',
    pair: a.pair,
    clearance: near ? near.distance : -1,
    nearest: near,
    type,
    minDihedral,
    volume: volume(V),
  };
}

/** Signed volume enclosed, by the divergence theorem. Positive means the faces face outwards. */
export function volume(V) {
  let six = 0;
  for (const [a, b, c] of FACES) six += dot(V[a], cross(V[b], V[c]));
  return six / 6;
}

// ------------------------------------------------------------- the knobs ---

/** Every shape is 21 numbers. There is nothing else. */
export const ZERO_KNOBS = () => Array.from({ length: 7 }, () => [0, 0, 0]);

/** The length a knob of 1 moves a point: a quarter of the solid's radius. */
export const knobUnit = (base) => bounds(base).radius / 4;

/** Base points plus knobs. That is the entire model. */
export function build(base, knobs) {
  const u = knobUnit(base);
  return base.map((p, i) => [p[0] + knobs[i][0] * u, p[1] + knobs[i][1] * u, p[2] + knobs[i][2] * u]);
}

/**
 * Mirror one half of the knobs onto the other, restoring the half-turn.
 *
 * These knobs are plain displacements of the points, so a partner's knob is
 * the ROTATED displacement, not a copy of it: a nudge in +x on one side is a
 * nudge in −x on the other. (The dual page's knobs turn planes instead, and
 * there the tangent frames are built C2-equivariant so the same job is a
 * straight copy. Same symmetry, different bookkeeping.)
 */
export function symmetrize(knobs, master = 0) {
  const out = knobs.map((k) => k.slice());
  for (const [i, j] of C2.pairs) {
    const src = master === j ? j : i;
    const dst = src === i ? j : i;
    out[src] = knobs[src].slice();
    out[dst] = C2.rotate(knobs[src]);
  }
  out[C2.fixedVertex] = [0, 0, knobs[C2.fixedVertex][2]];
  return out;
}

/** Is the half-turn still there, in the knobs and in the base they sit on? */
export function isSymmetric(base, knobs, tol = 1e-6) {
  const V = build(base, knobs);
  const { radius } = bounds(V);
  for (let v = 0; v < 7; v++) {
    if (len(sub(C2.rotate(V[v]), V[C2.vertexOf[v]])) > tol * radius) return false;
  }
  return true;
}

/**
 * Degrees of freedom. Seven points, three numbers each: 21. The similarities
 * of space — three slides, three turns, one scale — move the solid without
 * changing its shape, and `rigid` measures how many of them actually do
 * something here. The rest is shape.
 */
export function degreesOfFreedom(V) {
  const flat = (vs) => vs.flat();
  const c = bounds(V).centre;
  const T = (u) => flat(V.map(() => u));
  const R = (u) => flat(V.map((v) => cross(u, sub(v, c))));
  const gens = [
    T([1, 0, 0]), T([0, 1, 0]), T([0, 0, 1]),
    R([1, 0, 0]), R([0, 1, 0]), R([0, 0, 1]),
    flat(V.map((v) => sub(v, c))),
  ];
  const rigid = numericRank(gens);
  return { knobs: 21, moves: 21, rigid, shapes: 21 - rigid };
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

// ------------------------------------------------- you cannot get there ----

/**
 * Walk the straight line from one realization to another and report where it
 * stops being a solid and where its chirotope flips. Two different types
 * cannot both survive, and this is what says so out loud.
 */
export function morph(A, B, t) {
  // scale B to A's size first, so the walk is between shapes and not sizes
  const ra = bounds(A).radius, rb = bounds(B).radius;
  const ca = bounds(A).centre, cb = bounds(B).centre;
  const s = ra / rb;
  return A.map((p, i) => {
    const q = add(ca, mul(sub(B[i], cb), s));
    return add(mul(p, 1 - t), mul(q, t));
  });
}

/** The first t at which the straight walk from A to B stops bounding a solid. */
export function morphBreak(A, B, steps = 200) {
  let lastGood = 0, broke = null, flipped = null;
  const startForm = canonicalForm(A);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const V = morph(A, B, t);
    const solid = acoptic(V).ok;
    if (solid && broke === null) lastGood = t;
    if (!solid && broke === null) broke = t;
    if (flipped === null && generalPosition(V).ok && canonicalForm(V) !== startForm) flipped = t;
    if (broke !== null && flipped !== null) break;
  }
  return { lastGood, broke, flipped };
}

// ------------------------------------------------------------- for drawing --

/**
 * Seven colours, one per corner, and the triangles are painted by blending
 * the three they hang from. Because every pair of corners is joined by an
 * edge, every pair of colours meets along one — the same seven-colour fact the
 * dual solid states with its faces.
 *
 * These are exactly the seven the /szilassi/ page gives its faces; the
 * selftest imports that module and checks they have not drifted apart.
 */
export const VERTEX_COLOURS = [
  '#c9405f', '#e08b1a', '#128a8f', '#2f5da8', '#7a45a6', '#3f9550', '#8a8f99',
];
