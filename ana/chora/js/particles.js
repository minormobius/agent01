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
  return { preset, n, dim, pos, vel, type, R: preset.R, M: preset.M, steps: 0 };
}

/** One step for everyone (forces from the positions at the start of the step). Returns the largest speed. */
export function step(s) {
  const { n, pos, vel, type, R, M, dim } = s, frc = new Float64Array(n * 4);
  for (let i = 0; i < n; i++) {
    const ti = type[i], Ri = R[ti], Mi = M[ti], o = i * 4;
    let fx = -A * pos[o], fy = -A * pos[o + 1], fz = -A * pos[o + 2], fw = -A * pos[o + 3];
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const tj = type[j], r = Ri[tj]; if (!r) continue;
      const m = Mi[tj], p = j * 4, dx = pos[o] - pos[p], dy = pos[o + 1] - pos[p + 1], dz = pos[o + 2] - pos[p + 2], dw = pos[o + 3] - pos[p + 3];
      const d2 = dx * dx + dy * dy + dz * dz + dw * dw; if (d2 >= m * m) continue;
      const d = Math.sqrt(d2); if (d < 1e-12) { fx += r * 1e-3 * (Math.random() - 0.5); continue; }   // two on one spot: nudge apart
      const g = ((1 - d / m) * r) / d; fx += g * dx; fy += g * dy; fz += g * dz; fw += g * dw;
    }
    frc[o] = fx; frc[o + 1] = fy; frc[o + 2] = fz; frc[o + 3] = dim === 4 ? fw : 0;
  }
  let vmax = 0;
  for (let i = 0; i < n * 4; i++) { vel[i] = (vel[i] + frc[i]) * F; pos[i] += vel[i]; }
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
