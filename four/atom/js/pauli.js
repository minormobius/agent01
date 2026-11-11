/* Pauli's exclusion in this universe, derived rather than declared (paper 1, appendix F.6). No DOM.

   The spin-statistics theorem has two halves. Integer spin quantized with anticommutators breaks causality, which needs
   locality. Half-integer spin quantized with commutators has no ground state, which needs only that the particle obeys a
   Dirac equation and that the energy is bounded below. The lens vacuum gives up relativity and locality for the force
   between charges only; the free electron keeps its 4 + 1 Dirac equation (F.6). So the half an electron needs survives:
   - the Dirac Hamiltonian H_D(p) = c Σ Γ_i p_i + mc² Γ_0, with Γ_0 = Γ_1Γ_2Γ_3Γ_4, has the levels ±√(c²p² + m²c⁴), each
     twice (`diracH`, `negProjector`);
   - with commutators there is no Dirac sea to fill, so N electrons can all sit in one negative-energy wavepacket;
   - the pinned 1/r between them can't stop it: for a packet of width b, the pair repulsion J is at most √π/(4bν²)
     (`repulsionBound`), with ν ≥ ½ the packet's weight in the negative-energy states, while each electron brings at
     most −mc². At b = N², E_N ≤ −N mc² + √π/2 (`boseBound`): no ground state.
   The bound on J: ρ̂(k) = ∫ φ(p)†φ(p + k) d⁴p/ν with |φ(p)| ≤ |g(p)|, so |ρ̂(k)| ≤ e^(−b²k²/2)/ν (Cauchy–Schwarz on the
   Gaussian amplitude g), and J = ∫ d⁴k/(2π)⁴ (4π²/k³)|ρ̂(k)|², the 4D transform of 1/r being 4π²/k³. Any repulsion
   that weakens with distance gives the same conclusion; only the power of N in the choice of b changes.
   Atomic units: m = e = ħ = 1, c = 1/α. */

export const C_LIGHT = 137.035999084;

/* complex 4×4 matrices as [re, im] pairs */
const cx = (re, im = 0) => [re, im], cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const kron = (A, B) => { const n = A.length * B.length, out = []; for (let i = 0; i < n; i++) { out.push([]); for (let j = 0; j < n; j++) out[i].push(cmul(A[Math.floor(i / B.length)][Math.floor(j / B.length)], B[i % B.length][j % B.length])); } return out; };
export const mmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => { const p = cmul(v, B[k][j]); return [s[0] + p[0], s[1] + p[1]]; }, [0, 0])));
export const mlin = (A, B, a, b) => A.map((r, i) => r.map((v, j) => [a * v[0] + b * B[i][j][0], a * v[1] + b * B[i][j][1]]));
export const mapply = (A, v) => A.map((r) => r.reduce((s, x, k) => { const p = cmul(x, v[k]); return [s[0] + p[0], s[1] + p[1]]; }, [0, 0]));
export const vdot = (u, v) => u.reduce((s, x, k) => [s[0] + x[0] * v[k][0] + x[1] * v[k][1], s[1] + x[0] * v[k][1] - x[1] * v[k][0]], [0, 0]); // u†v
export const msize = (A) => Math.max(...A.flat().map((v) => Math.hypot(v[0], v[1])));
const I2 = [[cx(1), cx(0)], [cx(0), cx(1)]], S1 = [[cx(0), cx(1)], [cx(1), cx(0)]], S2 = [[cx(0), cx(0, -1)], [cx(0, 1), cx(0)]], S3 = [[cx(1), cx(0)], [cx(0), cx(-1)]];
export const I4 = kron(I2, I2);
/* the four spatial Dirac matrices of 4 + 1 (the selftest's, block 13) and time's, their product */
export const GAMMA = [kron(S1, S1), kron(S1, S2), kron(S1, S3), kron(S2, I2)];
export const GAMMA0 = mmul(mmul(GAMMA[0], GAMMA[1]), mmul(GAMMA[2], GAMMA[3]));

/* H_D(p) = c Σ Γ_i p_i + m c² Γ_0 */
export function diracH(p, { m = 1, c = C_LIGHT } = {}) {
  let H = mlin(GAMMA0, GAMMA0, m * c * c, 0);
  for (let i = 0; i < 4; i++) H = mlin(H, GAMMA[i], 1, c * p[i]);
  return H;
}
export const diracE = (p, { m = 1, c = C_LIGHT } = {}) => Math.sqrt(c * c * p.reduce((s, x) => s + x * x, 0) + m * m * c ** 4);
/* the projector onto the negative-energy states at momentum p, (1 − H_D/E)/2 */
export const negProjector = (p, o = {}) => mlin(I4, diracH(p, o), 0.5, -0.5 / diracE(p, o));
/* a spinor at rest in the negative-energy half (Γ_0 = −1): its weight in the negative-energy states at p is (1 + mc²/E)/2 */
export function restNegative() {
  const P = mlin(I4, GAMMA0, 0.5, -0.5); // projector onto Γ_0 = −1
  for (let j = 0; j < 4; j++) { const col = P.map((r) => r[j]), n = Math.hypot(...col.flat()); if (n > 0.5) return col.map((v) => [v[0] / n, v[1] / n]); }
}

/* the wavepacket: amplitude g(p) ∝ e^(−b²p²) (so |g|² has variance 1/(4b²) per axis and a scalar packet's density
   e^(−x²/2b²)), projected onto the negative-energy states. Radial quadrature over the 4-ball's p³ dp.
   nu: its weight there, ∫|g|²(1 + mc²/E)/2; kinetic: ⟨H_D⟩ per electron, −∫|g|²(E + mc²)/2 / nu, never above −mc² */
export function packet(b, { m = 1, c = C_LIGHT, n = 4000 } = {}) {
  const pmax = 9 / b, dp = pmax / n; let w = 0, nu = 0, kin = 0;
  for (let i = 0; i < n; i++) { const p = (i + 0.5) * dp, f = p ** 3 * Math.exp(-2 * b * b * p * p) * dp, E = Math.sqrt(c * c * p * p + m * m * c ** 4);
    w += f; nu += (f * (1 + (m * c * c) / E)) / 2; kin -= (f * (E + m * c * c)) / 2; }
  return { b, nu: nu / w, kinetic: kin / nu };
}
/* the pair repulsion of a density of width b under the pinned 1/r: J ≤ √π/(4bν²), equal to √π/(4b) for a scalar
   Gaussian (∫ d⁴k/(2π)⁴ 4π²/k³ e^(−b²k²) = √π/(4b)) */
export const gaussianRepulsion = (b) => Math.sqrt(Math.PI) / (4 * b);
export const repulsionBound = (b, nu) => gaussianRepulsion(b) / (nu * nu);
/* N bosonic electrons in one negative-energy packet of width b: E_N ≤ N⟨H_D⟩ + N(N − 1)/2 · J */
export function boseBound(N, { b = N * N, ...o } = {}) {
  const k = packet(b, o), J = repulsionBound(b, k.nu);
  return { N, b, nu: k.nu, kinetic: k.kinetic, J, E: N * k.kinetic + ((N * (N - 1)) / 2) * J, floor: -N * (o.m ?? 1) * (o.c ?? C_LIGHT) ** 2 + Math.sqrt(Math.PI) / 2 };
}
