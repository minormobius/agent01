// PARTICLE-CHORA: Jeffrey Ventrella's particle-hedra (Bridges 2024, ventrella.com/particlehedra), in 3D and in 4D.
// No DOM.
//
// Every particle is pulled to the centre by −a·p and pushed from every other particle within a cut-off distance m by
// (1 − d/m)·r along the line between them. Velocity gets the force, then a drag f; position gets the velocity. With one
// kind of particle that's a soft Thomson problem: they settle into an even spread. With several kinds, and forces that
// needn't be mutual (type i can feel type j without j feeling i: the paper's "useful physics cheat"), one kind settles
// first and the next settles around it: scaffolding. R[i][j] and M[i][j] are the push type i feels from type j.
//
// The paper's constants: a = 0.2, f = 0.97. The same rules run in 4D with the w coordinate let free.

export const A = 0.2, F = 0.97;

/** A system: types [{ name, n, col }], R and M (types × types), dim 3 or 4. */
export function create(preset, rnd = Math.random) {
  const types = preset.types, n = types.reduce((s, t) => s + t.n, 0), dim = preset.dim;
  const pos = new Float64Array(n * 4), vel = new Float64Array(n * 4), type = new Int32Array(n);
  let k = 0; types.forEach((t, ti) => { for (let c = 0; c < t.n; c++, k++) { type[k] = ti; for (let d = 0; d < dim; d++) pos[k * 4 + d] = (rnd() * 2 - 1) * 1.5; } });
  // the tunable forces: pull a, drag f, and multipliers on every push (rk) and cut-off (mk); the paper's at 1
  return { preset, n, dim, pos, vel, type, R: preset.R, M: preset.M, steps: 0, a: A, f: F, rk: 1, mk: 1 };
}

/** One step for everyone (forces from the positions at the start of the step). Returns the largest speed. */
export function step(s) {
  const { n, pos, vel, type, R, M, dim } = s, frc = new Float64Array(n * 4), a = s.a ?? A, fd = s.f ?? F, rk = s.rk ?? 1, mk = s.mk ?? 1;
  for (let i = 0; i < n; i++) {
    const ti = type[i], Ri = R[ti], Mi = M[ti], o = i * 4;
    let fx = -a * pos[o], fy = -a * pos[o + 1], fz = -a * pos[o + 2], fw = -a * pos[o + 3];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const tj = type[j], r = Ri[tj] * rk; if (!r) continue;
      const m = Mi[tj] * mk, p = j * 4, dx = pos[o] - pos[p], dy = pos[o + 1] - pos[p + 1], dz = pos[o + 2] - pos[p + 2], dw = pos[o + 3] - pos[p + 3];
      const d2 = dx * dx + dy * dy + dz * dz + dw * dw; if (d2 >= m * m) continue;
      const d = Math.sqrt(d2); if (d < 1e-12) { fx += r * 1e-3 * (Math.random() - 0.5); continue; }   // two on one spot: nudge apart
      const g = ((1 - d / m) * r) / d; fx += g * dx; fy += g * dy; fz += g * dz; fw += g * dw;
    }
    frc[o] = fx; frc[o + 1] = fy; frc[o + 2] = fz; frc[o + 3] = dim === 4 ? fw : 0;
  }
  let vmax = 0;
  for (let i = 0; i < n * 4; i++) { vel[i] = (vel[i] + frc[i]) * fd; pos[i] += vel[i]; }
  for (let i = 0; i < n; i++) { const o = i * 4, v = Math.hypot(vel[o], vel[o + 1], vel[o + 2], vel[o + 3]); if (v > vmax) vmax = v; }
  s.steps++;
  return vmax;
}
/** Run until everyone is (nearly) still, or a step budget. Returns the steps taken. */
export function settle(s, maxSteps = 20000, tol = 1e-9) { for (let k = 0; k < maxSteps; k++) if (step(s) < tol && k > 50) return k; return maxSteps; }
/** Give every particle a random kick (the paper's "jostling"). */
export function shake(s, amount = 0.3, rnd = Math.random) { for (let i = 0; i < s.n; i++) for (let d = 0; d < s.dim; d++) s.vel[i * 4 + d] += (rnd() * 2 - 1) * amount; }
export const point = (s, i) => [s.pos[i * 4], s.pos[i * 4 + 1], s.pos[i * 4 + 2], s.pos[i * 4 + 3]];
export const ofType = (s, t) => { const out = []; for (let i = 0; i < s.n; i++) if (s.type[i] === t) out.push(point(s, i)); return out; };

// ------------------------------------------------------------------ what they made
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2], a[3] - b[3]);
/** The edges, as the paper finds them: the closest pair sets the edge length, and every pair within tol of it is an
 *  edge. */
export function edges(P, tol = 0.04) {
  let min = Infinity; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) min = Math.min(min, dist(P[i], P[j]));
  const E = []; for (let i = 0; i < P.length; i++) for (let j = i + 1; j < P.length; j++) if (dist(P[i], P[j]) < min * (1 + tol)) E.push([i, j]);
  return { E, len: min };
}
/** A shape's fingerprint: all its pairwise distances, sorted, with the points scaled to unit mean radius about their
 *  centroid. Two point sets with the same fingerprint are the same shape up to turning and moving (for these, it is:
 *  checked against each reference below). */
export function fingerprint(P) {
  const c = [0, 1, 2, 3].map((k) => P.reduce((s, p) => s + p[k], 0) / P.length), Q = P.map((p) => p.map((x, k) => x - c[k]));
  const rad = Q.reduce((s, p) => s + Math.hypot(...p), 0) / Q.length, D = [];
  for (let i = 0; i < Q.length; i++) for (let j = i + 1; j < Q.length; j++) D.push(dist(Q[i], Q[j]) / rad);
  return D.sort((a, b) => a - b);
}
export const match = (fa, fb) => (fa.length !== fb.length ? Infinity : fa.reduce((m, x, i) => Math.max(m, Math.abs(x - fb[i])), 0));

// ------------------------------------------------------------------ the shapes we might get
const PHI = (1 + Math.sqrt(5)) / 2;
const signs = (v) => v.reduce((out, x) => out.flatMap((p) => (x === 0 ? [[...p, 0]] : [[...p, x], [...p, -x]])), [[]]);
const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map((p) => [x, ...p])));
const uniq = (P) => { const m = new Map(); for (const p of P) m.set(p.map((x) => Math.round(x * 1e9)).join(), p); return [...m.values()]; };
const cyc3 = (v) => [v, [v[1], v[2], v[0]], [v[2], v[0], v[1]]];
const even = (p) => { let c = 0; for (let i = 0; i < p.length; i++) for (let j = i + 1; j < p.length; j++) if (p[i] > p[j]) c++; return c % 2 === 0; };
const in4 = (P) => P.map((p) => [...p, 0, 0, 0].slice(0, 4));
export const SHAPES = {
  tetrahedron: in4([[1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]]),
  octahedron: in4(uniq(perms([1, 0, 0]).flatMap(signs))),
  cube: in4(signs([1, 1, 1])),
  icosahedron: in4(uniq(cyc3([0, 1, PHI]).flatMap(signs))),
  dodecahedron: in4(uniq([...signs([1, 1, 1]), ...cyc3([0, 1 / PHI, PHI]).flatMap(signs)])),
  cuboctahedron: in4(uniq(perms([1, 1, 0]).flatMap(signs))),
  rhombicuboctahedron: in4(uniq(perms([1, 1, 1 + Math.SQRT2]).flatMap(signs))),
  '5-cell': (() => { const s5 = Math.sqrt(5); return [[1, 1, 1, -1 / s5], [1, -1, -1, -1 / s5], [-1, 1, -1, -1 / s5], [-1, -1, 1, -1 / s5], [0, 0, 0, 4 / s5]]; })(),
  '16-cell': uniq(perms([1, 0, 0, 0]).flatMap(signs)),
  tesseract: signs([1, 1, 1, 1]),
  '24-cell': uniq(perms([1, 1, 0, 0]).flatMap(signs)),
  '600-cell': uniq([...signs([1, 1, 1, 1]).map((p) => p.map((x) => x / 2)), ...uniq(perms([1, 0, 0, 0]).flatMap(signs)), ...perms([0, 1, 2, 3]).filter(even).flatMap((p) => signs(p.map((i) => [PHI / 2, 0.5, 1 / (2 * PHI), 0][i])))]),
};
const FP = Object.fromEntries(Object.entries(SHAPES).map(([k, P]) => [k, fingerprint(P)]));
/** Which known shape a point set is, if any (within tol on the fingerprint). */
export function identify(P, tol = 0.02) {
  let best = null; for (const [k, f] of Object.entries(FP)) { const e = match(fingerprint(P), f); if (e < tol && (!best || e < best.err)) best = { name: k, err: e }; }
  return best;
}

/** The edge graph's counts, as the paper reads a shape off its particles: vertices, edges, the degrees, how many
 *  triangles and squares (4-cycles without a diagonal) the edges make. */
export function structure(P, tol = 0.03) {
  const { E } = edges(P, tol), adj = P.map(() => new Set()); for (const [a, b] of E) { adj[a].add(b); adj[b].add(a); }
  let tri = 0; for (const [a, b] of E) for (const c of adj[a]) if (c > b && adj[b].has(c)) tri++;
  let sq = 0; for (let a = 0; a < P.length; a++) for (const b of adj[a]) for (const c of adj[b]) if (c !== a && !adj[a].has(c)) for (const d of adj[c]) if (d !== b && d !== a && adj[d].has(a) && !adj[b].has(d)) sq++;
  return { V: P.length, E: E.length, deg: [...new Set(adj.map((s) => s.size))].sort().join(','), tri, sq: sq / 8 };
}
const ST = Object.fromEntries(Object.entries(SHAPES).map(([k, P]) => [k, JSON.stringify(structure(P))]));
/** What a point set is: exactly a known shape (same fingerprint), a known shape's structure out of shape (same edge
 *  graph counts, different distances), or neither. */
export function shapeOf(P) {
  const id = identify(P); if (id) return { name: id.name, exact: true, err: id.err };
  const s = JSON.stringify(structure(P)); for (const [k, v] of Object.entries(ST)) if (v === s) return { name: k, exact: false };
  return null;
}
/** The Riesz/Coulomb energy of the points pushed onto the unit sphere: Σ 1/distance. Lower is more evenly spread. */
export function energy(P) {
  const c = [0, 1, 2, 3].map((k) => P.reduce((s, p) => s + p[k], 0) / P.length), Q = P.map((p) => { const q = p.map((x, k) => x - c[k]), r = Math.hypot(...q); return q.map((x) => x / r); });
  let e = 0; for (let i = 0; i < Q.length; i++) for (let j = i + 1; j < Q.length; j++) e += 1 / dist(Q[i], Q[j]); return e;
}

// ------------------------------------------------------------------ recipes
const one = (dim, n, r, m) => ({ dim, types: [{ name: 'particles', n, col: '#ffd27a' }], R: [[r]], M: [[m]] });
/** One kind of particle: the paper's r = 0.06, m = 3, except that past 40 particles in 4D the swarm grows wider than
 *  m and stops feeling its far side, so there the cut-off widens (r = 0.02, m = 6: 120 particles then make the
 *  600-cell). */
export const oneKind = (dim, n) => (dim === 4 && n > 40 ? one(dim, n, 0.02, 6) : one(dim, n, 0.06, 3));
/** A seed and a tier on it: the tier is pushed by the seed and by itself; the seed ignores the tier. */
const tiered = (dim, a, b, rs = 0.06, ro = 0.06) => ({ dim, types: [{ name: a.name, n: a.n, col: '#8a8f9c' }, { name: b.name, n: b.n, col: '#38f2e0' }], R: [[0.06, 0], [rs, ro]], M: [[3, 0], [3, 3]] });
const z = 0;
export const PRESETS = [
  { id: 'one3', name: 'one kind, 3D', dim: 3, n: 12, make: (n) => oneKind(3, n), note: 'The paper\'s first experiment: one kind of particle. 4 make a tetrahedron, 6 an octahedron, 12 an icosahedron; 8 do not make a cube.' },
  { id: 'cube', name: 'cube on an octahedron', dim: 3, make: () => tiered(3, { name: 'octahedron seed', n: 6 }, { name: 'cube', n: 8 }), note: 'Tier two: 6 particles settle into an octahedron, ignoring the 8 others; the 8, pushed by them and by each other, settle into the cube between them (the dual).' },
  { id: 'dodeca', name: 'dodecahedron on an icosahedron', dim: 3, make: () => tiered(3, { name: 'icosahedron seed', n: 12 }, { name: 'dodecahedron', n: 20 }), note: 'The paper\'s Figure 6: 12 make the icosahedron, and 20 settle round them into the dodecahedron.' },
  { id: 'fig8', name: 'Ventrella\'s rhombicuboctahedron', dim: 3, make: () => ({ dim: 3, types: [{ name: 'centre', n: 1, col: '#ffffff' }, { name: 'octahedron', n: 6, col: '#6aa8ff' }, { name: 'cube', n: 8, col: '#ff6a4a' }, { name: 'cuboctahedron', n: 12, col: '#6dff7a' }, { name: 'rhombicuboctahedron', n: 24, col: '#b8b8c8' }],
    R: [[z, z, z, z, z], [z, 0.025, z, z, z], [z, 0.007, 0.01, z, z], [z, 0.005, 0.005, 0.005, z], [0.08, 0.01, 0.01, 0.005, 0.008]],
    M: [[z, z, z, z, z], [z, 2, z, z, z], [z, 2, 2, z, z], [z, 2, 2, 2, z], [1.2, 0.6, 0.6, 0.6, 1]] }), note: 'The paper\'s Figure 8, its numbers exactly: four tiers on a centre particle. Run here, the octahedron, cube and cuboctahedron come out exact; the outer 24 come out with the rhombicuboctahedron\'s structure (48 edges, 4 at a corner, 8 triangles, 18 squares) but its squares sheared into rhombi.' },
  { id: 'one4', name: 'one kind, 4D', dim: 4, n: 8, make: (n) => oneKind(4, n), note: 'The same, one dimension up. 5 make the 5-cell, 8 the 16-cell, 120 the 600-cell. 16 do not make a tesseract (as 8 don\'t make a cube). 24 usually stick in a near miss: shake them and sometimes they find the 24-cell, which has the lower energy.' },
  { id: 'tess', name: 'tesseract on a 16-cell', dim: 4, make: () => tiered(4, { name: '16-cell seed', n: 8 }, { name: 'tesseract', n: 16 }, 0.06, 0.01), note: 'Tier two in 4D: 8 settle into the 16-cell, and 16 more, pushed harder by the seed than by each other, settle into its dual, the tesseract.' },
  { id: '24', name: '24-cell = 16-cell + tesseract', dim: 4, union: true, make: () => tiered(4, { name: '16-cell seed', n: 8 }, { name: 'tesseract', n: 16 }, 0.06, 0.01), note: 'The 24-cell\'s 24 vertices are a 16-cell\'s 8 and a tesseract\'s 16, at the same radius. The two tiers settle at different radii; brought onto one sphere, they are the 24-cell.' },
];


// ------------------------------------------------------------------ vibration: the modes a settled swarm rings with
// Near equilibrium the force is F ≈ −K δx, K the stiffness (the Hessian of the energy). From the force law,
//   K_ii = a I − Σ_j J_ij,  K_ij = J_ij,  J_ij = g I − r u uᵀ/d³,  g = r (1/d − 1/m),  u = x_i − x_j
// for the pushes i feels from j. Pushes needn't be mutual, so K as a whole isn't symmetric; but they only ever run one
// way between tiers (an upper tier feels a lower, not the reverse), so K is block-triangular by tier and its
// frequencies are those of each tier's own block, holding the others still. Within a tier pushes are mutual and the
// block is symmetric: real modes, orthogonal shapes.

/** The stiffness block of one tier (its particles' coordinates, dim each), the other tiers held still. */
export function stiffness(s, t) {
  const idx = []; for (let i = 0; i < s.n; i++) if (s.type[i] === t) idx.push(i);
  const D = s.dim, N = idx.length * D, K = Array.from({ length: N }, () => new Float64Array(N)), a = s.a ?? A, rk = s.rk ?? 1, mk = s.mk ?? 1;
  const where = new Map(idx.map((i, k) => [i, k]));
  idx.forEach((i, ki) => {
    for (let c = 0; c < D; c++) K[ki * D + c][ki * D + c] += a;
    for (let j = 0; j < s.n; j++) {
      if (j === i) continue;
      const r = s.R[s.type[i]][s.type[j]] * rk, m = s.M[s.type[i]][s.type[j]] * mk; if (!r) continue;
      const u = [0, 1, 2, 3].map((c) => s.pos[i * 4 + c] - s.pos[j * 4 + c]), d = Math.hypot(...u); if (d >= m || d < 1e-12) continue;
      const g = r * (1 / d - 1 / m);
      for (let p = 0; p < D; p++) for (let q = 0; q < D; q++) {
        const Jpq = (p === q ? g : 0) - (r * u[p] * u[q]) / (d * d * d);
        K[ki * D + p][ki * D + q] -= Jpq;                                      // i's own block: −Σ J
        if (where.has(j)) K[ki * D + p][where.get(j) * D + q] += Jpq;          // a partner in the same tier
      }
    }
  });
  return { K, idx };
}

/** Eigen-decomposition of a symmetric matrix: Householder to tridiagonal, then implicit QL (the EISPACK tred2/tql2
 *  pair, as in JAMA). Returns eigenvalues ascending and eigenvectors as columns V[row][k]. */
export function eigSym(A0) {
  const n = A0.length, V = A0.map((r) => Float64Array.from(r)), d = new Float64Array(n), e = new Float64Array(n);
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0;
    for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) { e[i] = d[i - 1]; for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; } }
    else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h); if (f > 0) g = -g;
      e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) { f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f; for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; } e[j] = g; }
      f = 0; for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h); for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) { f = d[j]; g = e[j]; for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k]; d[j] = V[i - 1][j]; V[i][j] = 0; }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i]; V[i][i] = 1; const h = d[i + 1];
    if (h !== 0) { for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h; for (let j = 0; j <= i; j++) { let g = 0; for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j]; for (let k = 0; k <= i; k++) V[k][j] -= g * d[k]; } }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0;
  }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; }
  V[n - 1][n - 1] = 1; e[0] = 0;
  for (let i = 1; i < n; i++) e[i - 1] = e[i];
  e[n - 1] = 0;
  let f = 0, tst1 = 0; const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]));
    let m = l; while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
    if (m > l) {
      do {
        let g = d[l], p = (d[l + 1] - g) / (2 * e[l]), r = Math.hypot(p, 1); if (p < 0) r = -r;
        d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r); const dl1 = d[l + 1]; let h = g - d[l];
        for (let i = l + 2; i < n; i++) d[i] -= h;
        f += h; p = d[m]; let c = 1, c2 = c, c3 = c; const el1 = e[l + 1]; let s = 0, s2 = 0;
        for (let i = m - 1; i >= l; i--) {
          c3 = c2; c2 = c; s2 = s; g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]); e[i + 1] = s * r; s = e[i] / r; c = p / r; p = c * d[i] - s * g; d[i + 1] = h + s * (c * g + s * d[i]);
          for (let k = 0; k < n; k++) { h = V[k][i + 1]; V[k][i + 1] = s * V[k][i] + c * h; V[k][i] = c * V[k][i] - s * h; }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1; e[l] = s * p; d[l] = c * p;
      } while (Math.abs(e[l]) > eps * tst1);
    }
    d[l] += f; e[l] = 0;
  }
  const ord = [...d.keys()].sort((x, y) => d[x] - d[y]);
  return { values: ord.map((k) => d[k]), vectors: V.map((row) => Float64Array.from(ord.map((k) => row[k]))) };
}

/** Every tier's modes: stiffness λ (ω = √λ, radians per unit time), shape (unit vector over the tier's coordinates),
 *  and how much of the shape moves along w (0 to 1). ω is per simulation step, from the step rule (cos ω = 1 − λ/2). Zero modes (turning the whole tier: free when nothing else holds
 *  it) come out with λ ≈ 0 and are marked. */
export function modes(s) {
  const out = [];
  s.preset.types.forEach((t, ti) => {
    const { K, idx } = stiffness(s, ti); if (!idx.length) return;
    const { values, vectors } = eigSym(K), D = s.dim, top = Math.max(...values.map(Math.abs));
    values.forEach((lam, k) => {
      const shape = vectors.map((row) => row[k]); let wpart = 0; if (D === 4) for (let p = 0; p < idx.length; p++) wpart += shape[p * 4 + 3] ** 2;
      // ω as the simulation itself swings: its step rule (drag aside) turns λ into cos ω = 1 − λ/2, which is √λ for
      // small λ and runs about 3% sharp of it for the stiffest modes here
      out.push({ tier: ti, idx, lam, omega: Math.acos(Math.max(-1, Math.min(1, 1 - lam / 2))), shape, w: wpart, zero: Math.abs(lam) < 1e-7 * top });
    });
  });
  return out;
}
/** Group frequencies that agree to tol (relative): the distinct notes, and how many modes share each. */
export function notes(ms, tol = 1e-6) {
  const live = ms.filter((x) => !x.zero).map((x) => x.omega).sort((a, b) => a - b), out = [];
  for (const w of live) { const last = out[out.length - 1]; if (last && Math.abs(w - last.omega) <= tol * w) last.count++; else out.push({ omega: w, count: 1 }); }
  return out;
}
/** A kick dv (a velocity, over the particle's coordinates) to particle i: how strongly it sets each of its tier's modes
 *  ringing (the kick's component along each mode shape; their squares sum to |dv|²). */
export function kickModes(ms, i, dv) {
  return ms.map((m) => { const k = m.idx.indexOf(i); if (k < 0) return 0; let a = 0; for (let c = 0; c < dv.length; c++) a += m.shape[k * dv.length + c] * dv[c]; return a; });
}
/** Kick one particle in the simulation itself. */
export function kick(s, i, dv) { for (let c = 0; c < s.dim; c++) s.vel[i * 4 + c] += dv[c] ?? 0; }

/** Record the swarm itself, not its modes: a copy, kicked, run for `steps` steps with drag f, listened to by two
 *  microphones. Each microphone hears every particle's velocity along its own fixed direction, weighted ±1 (so the
 *  symmetric modes don't cancel out): mic L along directions in `spaceDirs(i)`, mic R along `wDir(i)`. This is the full
 *  nonlinear motion: small kicks ring at the modes' frequencies, hard ones bend the pitches and trade energy between
 *  modes. Returns two Float32Arrays, one sample per step. */
export function record(s, kicks, { steps, f, spaceDirs, wDir }) {
  const c = { ...s, pos: Float64Array.from(s.pos), vel: Float64Array.from(s.vel), f };
  for (const [i, dv] of kicks) kick(c, i, dv);
  const L = new Float32Array(steps), R = new Float32Array(steps), n = s.n;
  const wl = Array.from({ length: n }, (_, i) => ((i * 2654435761) % 7 < 4 ? 1 : -1)), wr = Array.from({ length: n }, (_, i) => ((i * 40503) % 5 < 3 ? 1 : -1));
  const dl = Array.from({ length: n }, (_, i) => spaceDirs(i)), dr = Array.from({ length: n }, (_, i) => wDir(i));
  for (let k = 0; k < steps; k++) {
    step(c); let l = 0, r = 0;
    for (let i = 0; i < n; i++) { const o = i * 4, v = [c.vel[o], c.vel[o + 1], c.vel[o + 2], c.vel[o + 3]]; l += wl[i] * (v[0] * dl[i][0] + v[1] * dl[i][1] + v[2] * dl[i][2] + v[3] * dl[i][3]); r += wr[i] * (v[0] * dr[i][0] + v[1] * dr[i][1] + v[2] * dr[i][2] + v[3] * dr[i][3]); }
    L[k] = l; R[k] = r;
  }
  return { L, R };
}
