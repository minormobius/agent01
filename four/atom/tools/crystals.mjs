/* Which crystal? The energy per atom of candidate lattices for a pair potential, each at its best spacing, by direct
   lattice sums with a smooth continuum past the cut. Our noble gases are the check: face-centred cubic must win
   (hexagonal close packing, not a lattice, isn't tried: it ties fcc to a fraction of a percent).
     node four/atom/tools/crystals.mjs            # JSON: every candidate for argon, krypton, Lennard-Jones, and 4D's 2, 12, 22
   The 4D candidates are the lattices with something to say for them: D4 (the densest, 24 neighbours, its first shell a
   24-cell), A4 (20 neighbours, the simplex lattice), A4* (10, its dual) and the hypercubic Z4 (8). */
import { fileURLToPath } from "node:url";
import * as G from "../js/gas.js";

const KB = 3.166811563e-6;
/* generator rows, scaled later so the nearest neighbour sits at the spacing being tried */
const ortho5to4 = (() => { // an orthonormal basis of the plane x₁ + … + x₅ = 0 in 5D, by Gram–Schmidt
  const B = []; for (let i = 0; i < 4; i++) { let v = Array.from({ length: 5 }, (_, k) => (k === i ? 1 : 0) - (k === i + 1 ? 1 : 0)); for (const b of B) { const p = v.reduce((s, x, k) => s + x * b[k], 0); v = v.map((x, k) => x - p * b[k]); } const n = Math.hypot(...v); B.push(v.map((x) => x / n)); }
  return (v) => B.map((b) => b.reduce((s, x, k) => s + x * v[k], 0));
})();
const A4 = Array.from({ length: 4 }, (_, i) => ortho5to4(Array.from({ length: 5 }, (_, k) => (k === i ? 1 : 0) - (k === i + 1 ? 1 : 0))));
const inv = (M) => { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; const v = A[c][c]; A[c] = A[c].map((x) => x / v); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((x, k) => x - f * A[c][k]); } } return A.map((r) => r.slice(n)); };
const T = (M) => M[0].map((_, j) => M.map((r) => r[j]));
export const LATTICES = {
  3: { fcc: [[0, 1, 1], [1, 0, 1], [1, 1, 0]], bcc: [[-1, 1, 1], [1, -1, 1], [1, 1, -1]], sc: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] },
  4: { D4: [[1, 1, 0, 0], [1, -1, 0, 0], [0, 1, -1, 0], [0, 0, 1, -1]], A4, "A4*": T(inv(A4)), Z4: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]] },
};
/* the lattice's points out to radius rc, with the generator scaled to nearest-neighbour distance 1: [r, count] shells */
function shells(B, rc) {
  const d = B.length, Bi = inv(B), bound = Bi.map((_, i) => Math.ceil(rc * Math.hypot(...Bi.map((r) => r[i])))), pts = new Map(), n = bound.map((b) => -b);
  for (;;) { const p = B[0].map((_, k) => n.reduce((s, c, i) => s + c * B[i][k], 0)), r = Math.hypot(...p); if (r > 1e-9 && r <= rc) { const key = r.toFixed(9); pts.set(key, (pts.get(key) || 0) + 1); }
    let i = 0; while (i < d && n[i] === bound[i]) n[i++] = -bound[i - 1]; if (i === d) break; n[i]++; }
  const out = [...pts].map(([r, c]) => [+r, c]).sort((a, b) => a[0] - b[0]), nn = out[0][0];
  return { shells: out.map(([r, c]) => [r / nn, c]), vol: Math.abs(det(B)) / nn ** d, neighbours: out[0][1] };
}
function det(M) { const n = M.length, A = M.map((r) => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (!A[p][c]) return 0; if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; D = -D; } D *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return D; }
/* energy per atom at nearest-neighbour distance a: half the sum over shells out to rc·a, and the continuum past it */
export function latticeEnergy(L, u, tail, a, d, rc) {
  let E = 0; for (const [r, c] of L.shells) if (r <= rc) E += c * u(r * a);
  const dens = 1 / (L.vol * a ** d), R = rc * a; E -= dens * G.sphereArea(d) * tail.reduce((t, { a: A, n }) => t + (A * R ** (d - n)) / (n - d), 0);
  return E / 2;
}
export function best(L, u, tail, d, lo, hi, rc) { let b = { a: lo, E: Infinity }; for (let a = lo; a <= hi; a += 0.005 * (hi - lo)) { const E = latticeEnergy(L, u, tail, a, d, rc); if (E < b.E) b = { a, E }; } return b; }

export async function crystals() {
  const FF = await import("../js/forces.js"), { PAIRS, RS } = await import("../js/pairs.js"), { TABLE } = await import("../js/table.js"), { RESPONSE } = await import("../js/response.js");
  const out = [], RC = { 3: 9, 4: 7 }, Ls = { 3: {}, 4: {} };
  for (const d of [3, 4]) for (const [k, B] of Object.entries(LATTICES[d])) Ls[d][k] = shells(B, RC[d] + 0.01);
  const sys = [["Lennard-Jones", 3, null], ["argon", 3, 18], ["krypton", 3, 36], ["Lennard-Jones 4D", 4, null], ["element 2", 4, 2], ["element 12", 4, 12], ["element 22", 4, 22]];
  for (const [name, d, Z] of sys) {
    let u, tail, eps, R, lo;
    if (!Z) { u = (r) => 4 * KB * (r ** -12 - r ** -6); tail = [{ a: 4 * KB, n: 6 }]; eps = KB; R = 2 ** (1 / 6); lo = 0.8; }
    else { const P = G.noblePotential(d, Z, { FF, PAIRS, RS, TABLE, RESPONSE }); u = (r) => (r <= P.opt.rmax ? P.u(r) : -P.opt.tail.reduce((s, t) => s + t.a / r ** t.n, 0)); tail = P.opt.tail; eps = -P.well.E; R = P.well.R; lo = Math.max(P.opt.rmin + 0.2, 0.7 * R); }
    const rows = Object.entries(Ls[d]).map(([k, L]) => { const b = best(L, u, tail, d, lo, 1.4 * R, RC[d]); return { lattice: k, neighbours: L.neighbours, a: +b.a.toFixed(3), aOverR: +(b.a / R).toFixed(3), E: +(b.E / eps).toFixed(3) }; }).sort((x, y) => x.E - y.E);
    out.push({ name, d, Z, R, rows });
  }
  return out;
}
if (process.argv[1] === fileURLToPath(import.meta.url)) console.log(JSON.stringify(await crystals(), null, 1));
