// solids.mjs — Platonic cells from a constellation of voronoi seeds.
//
// THE SUMMON PRIMITIVE. A cell in the foam is the intersection of half-spaces,
// one per neighbour, so **a cell's faces ARE its bisectors and a cell's face
// normals ARE its neighbour directions**. That gives an exact recipe: to summon
// a regular solid, place a seed at the centre and one neighbour along each of
// the solid's face normals — which are the vertices of its DUAL.
//
//   tetrahedron →  4 neighbours (self-dual)
//   cube        →  6 neighbours (octahedron vertices)
//   octahedron  →  8 neighbours (cube vertices)
//   dodecahedron→ 12 neighbours (icosahedron vertices)
//   icosahedron → 20 neighbours (dodecahedron vertices)
//
// ---------------------------------------------------------------- the trap
//
// foam's metric is ANISOTROPIC: `foamworld.js` weights vertical distance by
// `aniso` (2.2 by default) so that grade stays a meaningful discriminator.
// Under M = diag(1, aniso, 1) the bisector between the centre and a neighbour
// `n` is still a plane — but its normal is **M·n, not n**.
//
// Place neighbours the obvious way (unit directions × a common radius) and
// every face whose normal is off-axis comes out rotated. Measured at
// aniso 2.2: **22° of error**, on every face of a tetrahedron, an octahedron
// and a dodecahedron. A cube survives, because its normals are axis-aligned
// and M cannot rotate those — which is the worst possible outcome, since the
// first solid anyone tries is the cube, it looks perfect, and the bug is
// waiting in the second one.
//
// The fix is one line of algebra, derived and checked in
// `test/solids.selftest.mjs`. For face normal û at distance r:
//
//     bisector normal ∝ M·n           and     distance = ½·nᵀMn / |M·n|
//     M·n ∥ û   ⇒   n = t·M⁻¹û ,  |M·n| = t
//     distance   = ½·t·(ûᵀM⁻¹û) = r
//     ⇒   n = 2r · M⁻¹û / (ûᵀM⁻¹û)        with  ûᵀM⁻¹û = ux² + uy²/aniso + uz²
//
// That is `constellation()` below, and it is exact to floating point for all
// five solids at any aniso.
//
// Node-and-browser, no dependencies, no unseeded randomness — the foam rules.

/** Face normals of each solid = vertices of its dual. Unnormalised; direction
 *  is all that matters. */
const PHI = (1 + Math.sqrt(5)) / 2;

function icosahedronVertices() {          // 12 — the dodecahedron's face normals
  const v = [];
  for (const a of [1, -1]) for (const b of [1, -1]) {
    v.push([0, a, b * PHI], [a, b * PHI, 0], [a * PHI, 0, b]);
  }
  return v;
}

function dodecahedronVertices() {         // 20 — the icosahedron's face normals
  const v = [];
  for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) v.push([a, b, c]);
  const iP = 1 / PHI;
  for (const a of [1, -1]) for (const b of [1, -1]) {
    v.push([0, a * iP, b * PHI], [a * iP, b * PHI, 0], [a * PHI, 0, b * iP]);
  }
  return v;
}

export const SOLIDS = {
  tetrahedron:  { faces: 4,  normals: [[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]] },
  cube:         { faces: 6,  normals: [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]] },
  octahedron:   { faces: 8,  normals: (() => { const v = []; for (const a of [1, -1]) for (const b of [1, -1]) for (const c of [1, -1]) v.push([a, b, c]); return v; })() },
  dodecahedron: { faces: 12, normals: icosahedronVertices() },
  icosahedron:  { faces: 20, normals: dodecahedronVertices() },
};

export const SOLID_NAMES = Object.keys(SOLIDS);

const norm3 = (a) => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

/** Rotate a direction about Y. The only orientation freedom worth exposing:
 *  tilting a solid off-vertical fights the metric and the walkability rules at
 *  once, and a summoned object the player cannot stand on is not a mechanic. */
function yaw(u, a) {
  const c = Math.cos(a), s = Math.sin(a);
  return [u[0] * c + u[2] * s, u[1], -u[0] * s + u[2] * c];
}

/**
 * The seeds that summon `solid` centred at `centre`.
 *
 * Returns `{ centre, neighbours, seeds, extent }` — `seeds` is the full array
 * to hand to an atomic multi-insert (centre first), and `extent` is the
 * furthest neighbour's Euclidean distance from the centre, which is what a
 * caller needs to test clearance before attempting the summon.
 *
 * `r` is the INRADIUS of the resulting cell in world metres — the distance from
 * the centre to each face plane. Neighbours land at ~2r, further along axes the
 * metric compresses.
 */
export function constellation(solid, { centre = [0, 0, 0], r = 1.6, aniso = 2.2, rotate = 0 } = {}) {
  const spec = SOLIDS[solid];
  if (!spec) throw new Error(`solids: unknown solid "${solid}" (have ${SOLID_NAMES.join(', ')})`);
  if (!(r > 0)) throw new Error('solids: r must be positive');
  if (!(aniso > 0)) throw new Error('solids: aniso must be positive');

  const neighbours = spec.normals.map((d) => {
    const u = rotate ? norm3(yaw(d, rotate)) : norm3(d);
    // ûᵀM⁻¹û — the metric's response in this direction.
    const q = u[0] * u[0] + (u[1] * u[1]) / aniso + u[2] * u[2];
    const t = 2 * r / q;
    // t·M⁻¹û
    return [centre[0] + u[0] * t, centre[1] + (u[1] / aniso) * t, centre[2] + u[2] * t];
  });

  let extent = 0;
  for (const n of neighbours) {
    extent = Math.max(extent, Math.hypot(n[0] - centre[0], n[1] - centre[1], n[2] - centre[2]));
  }
  // `rotate` is carried on the result deliberately: `verify()` needs to compare
  // against the ROTATED normals, and leaving it off made a yawed solid report
  // 36° of error for a 36° yaw — the verifier grading against the wrong answer
  // and calling the geometry wrong. A summon checker that fails correct work is
  // worse than none, because it retires a mechanic that was fine.
  return { solid, centre: centre.slice(), neighbours, seeds: [centre.slice(), ...neighbours], extent, r, aniso, rotate };
}

/**
 * What the engine will actually produce from these seeds: for each neighbour,
 * the bisector plane's unit normal and its distance from the centre.
 *
 * This is the same algebra `foamworld.js` performs when it clips a cell, stated
 * once here so a summon can be CHECKED rather than trusted. It is the machine
 * half of the judge for this mechanic: a summon either produced the solid it
 * claimed or it did not, and that is a number, not an opinion.
 */
export function bisectors({ centre, neighbours }, aniso) {
  return neighbours.map((n) => {
    const d = [n[0] - centre[0], n[1] - centre[1], n[2] - centre[2]];
    const Mn = [d[0], d[1] * aniso, d[2]];                 // ← the whole trap, in one line
    const L = Math.hypot(Mn[0], Mn[1], Mn[2]) || 1;
    return { normal: [Mn[0] / L, Mn[1] / L, Mn[2] / L], distance: 0.5 * dot3(d, Mn) / L };
  });
}

/**
 * Did the constellation produce the intended solid?
 *
 * Returns `{ ok, maxNormalErrorDeg, distanceSpread, faces }`. `ok` is exact
 * within `tol` — this is a gate, not a score, and it belongs in a selftest and
 * in any turn that touches the summon path.
 *
 * NOTE what this does NOT prove: that the cell in a REAL pocket has these
 * faces. Pre-existing seeds nearby will claim faces of their own and cut the
 * solid short. Clearance is a separate predicate — see `clearanceNeeded()`.
 */
export function verify(con, { tolDeg = 1e-6, tolSpread = 1e-9 } = {}) {
  const want = SOLIDS[con.solid].normals.map((d) => (con.rotate ? norm3(yaw(d, con.rotate)) : norm3(d)));
  const got = bisectors(con, con.aniso);
  let maxErr = 0;
  for (let i = 0; i < want.length; i++) {
    // atan2(|a×b|, |a·b|), NOT acos(a·b). acos is ill-conditioned near 1: for
    // two unit vectors that agree to machine precision, a·b = 1−ε with
    // ε ≈ 2e-16, and acos returns √(2ε) ≈ 2e-8 rad ≈ 1.2e-6° of pure
    // floating-point noise. That reads as a real error and invites someone to
    // "fix" exact geometry, or to widen the tolerance until the check stops
    // catching the 22° bug it exists for. atan2 of the cross product stays
    // accurate all the way to zero.
    const a = got[i].normal, b = want[i];
    const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    // abs() on the dot because a normal and its negation describe the same plane
    maxErr = Math.max(maxErr, Math.atan2(Math.hypot(c[0], c[1], c[2]), Math.abs(dot3(a, b))) * 180 / Math.PI);
  }
  const ds = got.map((g) => g.distance);
  const mean = ds.reduce((a, b) => a + b, 0) / ds.length;
  const spread = (Math.max(...ds) - Math.min(...ds)) / (mean || 1);
  return {
    ok: maxErr <= tolDeg && spread <= tolSpread,
    maxNormalErrorDeg: maxErr,
    distanceSpread: spread,
    inradius: mean,
    faces: got.length,
  };
}

/**
 * How much clear space a summon needs.
 *
 * `reformPocket()` refuses any seed within an anisotropic distance of 1.5 of an
 * existing one, so every neighbour AND the centre must clear that. This returns
 * the radius that must be free of pre-existing seeds for the summon to be
 * legal — which makes "can I build here?" a decidable predicate rather than a
 * try-and-see.
 *
 * That predicate is the mechanic, not an obstacle to it: needing clear ground
 * to place a factory is the oldest rule in the genre.
 */
export function clearanceNeeded(con, minSeedGap = 1.5) {
  return con.extent + minSeedGap;
}
