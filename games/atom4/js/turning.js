/* ATOM⁴'s motion and spin, no DOM. Points move by F = ma in four components. Rotations turn planes, six of them
   (01 02 03 12 13 23), so angular velocity and angular momentum are antisymmetric 4×4 matrices, not arrows. Every one
   splits into a self-dual and an anti-self-dual half, which commute: so(4) = so(3) ⊕ so(3), the "left" and "right"
   isoclinic turns. An electron's spin is a 2-state spinor of one half only (we call it the left): it turns with the
   left half of any rotation and ignores the right. */

export const PLANES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
export const zero4 = () => Array.from({ length: 4 }, () => [0, 0, 0, 0]);
/* an antisymmetric matrix from its six plane components */
export function bivector(c) { const M = zero4(); PLANES.forEach(([a, b], i) => { M[a][b] = c[i]; M[b][a] = -c[i]; }); return M; }
/* the Hodge star: swaps each plane with the plane perpendicular to it (01↔23, 02↔31, 03↔12) */
export function hodge(M) { const S = zero4(), set = (a, b, v) => { S[a][b] = v; S[b][a] = -v; }; set(0, 1, M[2][3]); set(2, 3, M[0][1]); set(0, 2, M[3][1]); set(3, 1, M[0][2]); set(0, 3, M[1][2]); set(1, 2, M[0][3]); return S; }
const lin = (A, B, a, b) => A.map((r, i) => r.map((v, j) => a * v + b * B[i][j]));
export const leftPart = (M) => lin(M, hodge(M), 0.5, 0.5); // self-dual
export const rightPart = (M) => lin(M, hodge(M), 0.5, -0.5); // anti-self-dual
/* the left half as a 3-vector (what turns the electron's spin) and the right half */
export const leftVector = (M) => [M[0][1] + M[2][3], M[0][2] + M[3][1], M[0][3] + M[1][2]];
export const rightVector = (M) => [M[0][1] - M[2][3], M[0][2] - M[3][1], M[0][3] - M[1][2]];
export const matmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => s + v * B[k][j], 0)));
export const commutator = (A, B) => lin(matmul(A, B), matmul(B, A), 1, -1);

/* a turn at rate a in the 01 plane and b in the 23 plane: the spin turns at a + b, ignoring a − b.
   simple (b = 0): a full turn flips the spinor's sign, as ours does. left-isoclinic (b = a): twice as fast.
   right-isoclinic (b = −a): not at all */
export const spinRate = (a, b) => a + b;

/* the orbitals of angular momentum l on the 3-sphere: harmonic polynomials of degree l in 4 variables,
   C(l+3, 3) − C(l+1, 3) = (l + 1)², which is the pair of spins (l/2, l/2) of SU(2) × SU(2) */
const C = (n, k) => (k < 0 || k > n ? 0 : Array.from({ length: k }, (_, i) => (n - i) / (i + 1)).reduce((a, b) => a * b, 1));
export const harmonicDim = (l, d = 4) => Math.round(C(l + d - 1, d - 1) - C(l + d - 3, d - 1));
/* fine structure: spin ½ joined to the left l/2 gives (l ± 1)/2, times the right's l + 1 states */
export const fineSplit = (l) => (l === 0 ? [2] : [(l + 2) * (l + 1), l * (l + 1)]);

/* ---------------------------------------------------------------- orbits: F = −x/r^(q+1) (q = 1 the pinned 1/r²
   force from a 1/r potential; q = 2 … Gauss's 1/r³), leapfrog */
export function orbitStep(s, dt, q = 2) {
  const acc = (x) => { const r = Math.hypot(...x); return x.map((v) => -v / r ** (q + 1)); };
  const a0 = acc(s.x), v = s.v.map((u, i) => u + 0.5 * dt * a0[i]), x = s.x.map((u, i) => u + dt * v[i]), a1 = acc(x);
  return { x, v: v.map((u, i) => u + 0.5 * dt * a1[i]) };
}
/* Runge–Lenz in any dimension, for the 1/r potential: A = p² x − (x·p) p − x/r */
export function rungeLenz({ x, v }) { const p2 = v.reduce((s, u) => s + u * u, 0), xp = x.reduce((s, u, i) => s + u * v[i], 0), r = Math.hypot(...x); return x.map((u, i) => p2 * u - xp * v[i] - u / r); }

/* ---------------------------------------------------------------- a free rigid body: Euler's equations in four
   dimensions. J = diag(j) the body's second moments, angular momentum M_ab = (j_a + j_b) Ω_ab, and in the body's
   frame dM/dt = [M, Ω]. Conserved: the energy ½ Σ M_ab Ω_ab, tr M², the Pfaffian M01 M23 − M02 M13 + M03 M12, and
   (Manakov, 1976) enough more that the motion is exactly solvable */
export const omegaOf = (M, j) => M.map((r, a) => r.map((v, b) => (a === b ? 0 : v / (j[a] + j[b]))));
export function bodyStep(M, j, dt) { // RK4
  const f = (X) => commutator(X, omegaOf(X, j)), add = (X, K, h) => lin(X, K, 1, h);
  const k1 = f(M), k2 = f(add(M, k1, dt / 2)), k3 = f(add(M, k2, dt / 2)), k4 = f(add(M, k3, dt));
  return M.map((r, a) => r.map((v, b) => v + (dt / 6) * (k1[a][b] + 2 * k2[a][b] + 2 * k3[a][b] + k4[a][b])));
}
export const bodyEnergy = (M, j) => { let e = 0; for (const [a, b] of PLANES) e += (M[a][b] * M[a][b]) / (j[a] + j[b]); return e / 2; };
export const trace2 = (M) => matmul(M, M).reduce((s, r, i) => s + r[i], 0);
export const pfaffian = (M) => M[0][1] * M[2][3] - M[0][2] * M[1][3] + M[0][3] * M[1][2];
/* the rotations that fix a line (a bond) form SO(3): three angles of twist, where 3D has one */
export const twistAngles = (d) => ((d - 1) * (d - 2)) / 2;
