/* ATOM⁴'s magnetism of atoms, no DOM. Atomic units throughout (e = m = ħ = 1), and the field is the 2-form F_ij that
   pushes a charge (js/fields.js: dv/dt = (q/m) F v), one number per plane: three in our world, six in 4D.

   The electron's equation. A slow spin-½ particle obeys Pauli's equation, which needs no relativity: it is the square
   of a first-order one (Lévy-Leblond, 1967), H = (σ·π)²/2m, with π = p − qA. In 4D the electron's two-state spin is
   one half of SU(2) × SU(2) (js/turning.js), and the matching first-order operator is built from quaternion units,
   τ = (1, iσ₁, iσ₂, iσ₃) and τ̄ = (1, −iσ₁, −iσ₂, −iσ₃). Their product is the 4D version of our σ identity:
     (τ̄·a)(τ·b) = a·b + iσ·ℓ(a ∧ b),    ℓ(W) = (W₀₁ + W₂₃, W₀₂ + W₃₁, W₀₃ + W₁₂), the bivector's left (self-dual) half,
   so H = (τ̄·π)(τ·π)/2m = π²/2m − (q/2m) σ·ℓ(F). The spin feels the field's left half only, with the same strength as
   ours for a field in one plane (g = 2), twice it for a left-isoclinic field, and not at all for a right one.

   An atom in a field. π²/2m holds the rest: the orbital term −(q/2m) Σ F_ij L_ij (both halves) and the diamagnetic
   (q²/8m) Σ_i (Σ_j F_ij x_j)². Averaged over a round atom (⟨x_i x_j⟩ = δ_ij ⟨r²⟩/d), the latter is
   (Σ⟨r²⟩/4d)|F|², |F|² = Σ_{i<j} F_ij²: Langevin's diamagnetism, χ = −Σ⟨r²⟩/2d per atom, from both halves alike.
   An atom with unpaired spin S (Hund's first rule on the solver's configuration) adds Curie's paramagnetism,
   S(S + 1)/3kT for a field in one plane, scaled in 4D by the field's shape |ℓ|²/|F|²: 1 for a simple field, 2 for a
   left-isoclinic one, 0 for a right one. Orbital moments (both halves) are left out: the solver averages open shells
   into spheres, so an atom's orbital state isn't known. The energy in a field is −½ χ |F|². */
export const KELVIN = 3.166811563e-6; // hartree per kelvin
export const CGS_MOLAR = 6.02214076e23 * 7.2973525693e-3 ** 2 * 0.529177210903e-8 ** 3; // a.u. per atom → cm³/mol (our world, Gaussian)

/* complex 2 × 2 matrices as [[re, im], …] rows */
const C = (re, im = 0) => [re, im], cmul = (a, b) => [a[0] * b[0] - a[1] * b[1], a[0] * b[1] + a[1] * b[0]];
const mmul = (A, B) => A.map((r) => B[0].map((_, j) => r.reduce((s, v, k) => { const p = cmul(v, B[k][j]); return [s[0] + p[0], s[1] + p[1]]; }, [0, 0])));
const mlin = (terms) => [0, 1].map((i) => [0, 1].map((j) => terms.reduce((s, [c, M]) => [s[0] + c * M[i][j][0], s[1] + c * M[i][j][1]], [0, 0])));
export const SIGMA = [[[C(0), C(1)], [C(1), C(0)]], [[C(0), C(0, -1)], [C(0, 1), C(0)]], [[C(1), C(0)], [C(0), C(-1)]]];
const ONE = [[C(1), C(0)], [C(0), C(1)]], iTimes = (M) => M.map((r) => r.map(([a, b]) => [-b, a]));
export const TAU = [ONE, ...SIGMA.map(iTimes)], TAUBAR = [ONE, ...SIGMA.map((s) => iTimes(s).map((r) => r.map(([a, b]) => [-a, -b])))];
const dot4 = (M, a) => mlin(M.map((X, k) => [a[k], X]));
/* (τ̄·a)(τ·b) for two 4-vectors */
export const pauliProduct = (a, b) => mmul(dot4(TAUBAR, a), dot4(TAU, b));
/* what the identity says it is: a·b + iσ·ℓ(a ∧ b) */
export const wedge = (a, b) => a.map((ai, i) => b.map((bj, j) => ai * bj - a[j] * b[i]));
export const leftOf = (W) => [W[0][1] + W[2][3], W[0][2] + W[3][1], W[0][3] + W[1][2]];
export const rightOf = (W) => [W[0][1] - W[2][3], W[0][2] - W[3][1], W[0][3] - W[1][2]];
export const pauliClaimed = (a, b) => { const l = leftOf(wedge(a, b)); return mlin([[a.reduce((s, v, k) => s + v * b[k], 0), ONE], ...l.map((v, k) => [v, iTimes(SIGMA[k])])]); };

/* a field's shape for the spin: |ℓ(F)|² / |F|², 1 for a field in one plane, 2 all left, 0 all right */
export function fieldShape(F) {
  const n2 = F.reduce((s, r, i) => s + r.reduce((t, v, j) => t + (j > i ? v * v : 0), 0), 0), l = leftOf(F);
  return n2 ? (l[0] ** 2 + l[1] ** 2 + l[2] ** 2) / n2 : 0;
}

/* an atom from js/table.js: Σ over its electrons of ⟨r²⟩ (bohr²) */
export const sumR2 = (atom) => atom.orb.reduce((s, o) => s + o.o * o.r2, 0);
/* Langevin: χ per atom, a.u. */
export const diamagnetic = (atom, d) => -sumR2(atom) / (2 * d);
/* Hund's first rule, subshell by subshell: unpaired electrons, up to half a subshell, then its holes; S = half that */
const LETTER = "spdfghik";
export function unpaired(atom, d) {
  const n = {}; for (const o of atom.orb) n[o.s] = (n[o.s] || 0) + o.o;
  return Object.entries(n).reduce((u, [s, k]) => { const l = LETTER.indexOf(s.at(-1)), orbs = d === 3 ? 2 * l + 1 : (l + 1) ** 2; return u + (k <= orbs ? k : 2 * orbs - k); }, 0);
}
export const spinOf = (atom, d) => unpaired(atom, d) / 2;
/* Curie: a free spin S in a field in one plane, kT in hartree */
export const curie = (S, kT) => (S * (S + 1)) / (3 * kT);
/* the whole response of a free atom, a.u.: diamagnetism from both halves, spin from the left (shape = fieldShape) */
export const susceptibility = (atom, d, kT, shape = 1) => diamagnetic(atom, d) + (d === 4 ? shape : 1) * curie(spinOf(atom, d), kT);

/* A spinning ball's field. A ball of charge turning at Ω (a 4 × 4 antisymmetric matrix: one rate per plane) is a
   current j = ρΩx, and through the pinned 1/r kernel it makes, far from it, A = Ωx/r³ (times its size and charge,
   set to 1 here): the field of its moment, which is shaped like its spin. Then B_ij = ∂_iA_j − ∂_jA_i:
     B = −2Ω/r³ − 3(x(Ωx)ᵀ − (Ωx)xᵀ)/r⁵.
   A ball spinning in xy and zw at once makes both moments. Seen from a 3D slice (x, y, z at some w), the six numbers
   split into two 3D vectors: the part within the slice, (B_yz, B_zx, B_xy), which turns a charge's path as our
   magnetic field does, and the part reaching into w, (B_xw, B_yw, B_zw), which pushes a charge moving through the
   slice out of it, into w. At w = 0 an xy spin gives only the first (a bar magnet's field, in shape exactly ours) and
   a zw spin only the second. */
export function spinField(Om, x) {
  const r2 = x.reduce((s, v) => s + v * v, 0), r = Math.sqrt(r2), r3 = r2 * r, r5 = r3 * r2, Ox = Om.map((row) => row.reduce((s, v, k) => s + v * x[k], 0));
  return Om.map((row, i) => row.map((v, j) => (-2 * v) / r3 - (3 * (x[i] * Ox[j] - x[j] * Ox[i])) / r5));
}
export const spin = (xy, zw) => [[0, -xy, 0, 0], [xy, 0, 0, 0], [0, 0, 0, -zw], [0, 0, zw, 0]]; // turning x toward y at rate xy, z toward w at zw
export const sliceParts = (B) => ({ within: [B[1][2], B[2][0], B[0][1]], intoW: [B[0][3], B[1][3], B[2][3]] });
