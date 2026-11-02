/* ORBITAL's atom, no DOM: hydrogen, exactly, in d dimensions (d = 4 for kata's, 3 for ours).

   THE FORCE is ATOM⁴'s position (four.mino.mobi/atom/hydrogen.html): pinned at 1/r in any dimension, V = −Z/r (Gauss's
   law in 4D would give 1/r², under which an electron falls into the nucleus and there's no ground state). Then the
   electron's equation separates as ours does: ψ = R(r) Y(direction), with
       R'' + (d − 1)/r R' + [2(E + Z/r) − l(l + d − 2)/r²] R = 0,
   solved by R = r^l e^{−κr} L_{n−l−1}^{(2l + d − 2)}(2κr), κ = Z / (n + (d − 3)/2), E = −κ²/2 (hartrees, bohr). In 4D
   that's E = −Z²/2(n + ½)²: ATOM⁴'s spectrum, the angular momentum shifted by a half.

   THE DIRECTIONS: Y is a harmonic polynomial of degree l (its Laplacian zero), taken on the unit sphere. In d dimensions
   there are C(l + d − 1, d − 1) − C(l + d − 3, d − 1) of them: 2l + 1 for us, (l + 1)² in 4D. They're written here as
   c0 + b·x + xᵀQx (enough for s, p and d), normalised on the sphere, so ψ = R(r)/r^l · P(x) and ∫|ψ|² = 1. */
export const AREA = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI }; // the unit sphere's area in 3D and 4D
const fact = (n) => { let f = 1; for (let i = 2; i <= n; i++) f *= i; return f; };
const binom = (n, k) => (k < 0 || k > n ? 0 : fact(n) / (fact(k) * fact(n - k)));

/* a state: n, l in d dimensions; its radial function's polynomial, normalisation, energy and radii */
export function state(d, n, l, Z = 1) {
  if (l > n - 1) throw new Error("l must be below n");
  const nr = n - l - 1, a = 2 * l + d - 2, kappa = Z / (n + (d - 3) / 2);
  const poly = []; for (let i = 0; i <= nr; i++) poly.push(((i % 2 ? -1 : 1) * binom(nr + a, nr - i)) / fact(i)); // L_nr^(a)(ρ) = Σ poly[i] ρ^i
  const st = { d, n, l, Z, nr, kappa, E: -(kappa * kappa) / 2, poly, norm: 1 };
  // normalise numerically: ∫ R² r^{d−1} dr = 1 (Simpson, far enough out)
  const rMax = (40 + 12 * n * n) / (kappa * n), N = 8000, h = rMax / N; let s = 0;
  for (let i = 0; i <= N; i++) { const r = i * h, f = R(st, r) ** 2 * r ** (d - 1); s += f * (i === 0 || i === N ? 1 : i % 2 ? 4 : 2); }
  st.norm = 1 / Math.sqrt((s * h) / 3);
  // the radial distribution P(r) = r^{d−1} R²: where it peaks (the most likely distance), its mean, and how far 99.5% reaches
  let best = 0, rMost = 0, mean = 0, cum = 0, r99 = rMax; const cdf = [];
  for (let i = 0; i <= N; i++) { const r = i * h, p = pr(st, r); if (p > best) { best = p; rMost = r; } mean += r * p * h; cum += p * h; cdf.push(cum); if (cum < 0.995) r99 = r; }
  Object.assign(st, { rMost, rMean: mean, r99, cdf: { h, v: cdf.map((c) => c / cum) } });
  return st;
}
/* the radial function itself, and R / r^l (what multiplies the polynomial) */
export function Rl(st, r) { const rho = 2 * st.kappa * r; let p = 0; for (let i = st.poly.length - 1; i >= 0; i--) p = p * rho + st.poly[i]; return st.norm * Math.exp(-st.kappa * r) * p; }
export function R(st, r) { return Rl(st, r) * r ** st.l; }
export function pr(st, r) { return r ** (st.d - 1) * R(st, r) ** 2; }

/* the directions: the harmonics of degree l ≤ 2 in d dimensions, each { name, kind, c0, b, Q }, normalised on the
   sphere (means over it: ⟨x_i²⟩ = 1/d, ⟨x_i⁴⟩ = 3/d(d+2), ⟨x_i² x_j²⟩ = 1/d(d+2)) */
const AX = { 3: ["x", "y", "z"], 4: ["x", "y", "z", "w"] };
export function harmonics(d, l) {
  const A = AREA[d], ax = AX[d], c = 1 / (d * (d + 2)), out = [], zero = () => Array.from({ length: d }, () => new Array(d).fill(0));
  if (l === 0) return [{ name: "s", kind: "s", c0: 1 / Math.sqrt(A), b: new Array(d).fill(0), Q: zero() }];
  if (l === 1) return ax.map((n, i) => { const b = new Array(d).fill(0); b[i] = Math.sqrt(d / A); return { name: n, kind: "axis", c0: 0, b, Q: zero() }; });
  // l = 2: the plane kind, x_i x_j (i < j); then traceless diagonals, mutually orthogonal (⟨(a·x²)(b·x²)⟩ = 2c a·b when Σa = Σb = 0)
  for (let i = 0; i < d; i++) for (let j = i + 1; j < d; j++) { const Q = zero(), k = 1 / Math.sqrt(A * c); Q[i][j] = Q[j][i] = k / 2; out.push({ name: ax[i] + ax[j], kind: "plane", c0: 0, b: new Array(d).fill(0), Q }); }
  const diags = d === 4 ? [["x²−y²", [1, -1, 0, 0]], ["z²−w²", [0, 0, 1, -1]], ["x²+y²−z²−w²", [1, 1, -1, -1]]] : [["x²−y²", [1, -1, 0]], ["3z²−r²", [-1, -1, 2]]];
  for (const [name, a] of diags) { const Q = zero(), k = 1 / Math.sqrt(A * 2 * c * a.reduce((s, v) => s + v * v, 0)); a.forEach((v, i) => (Q[i][i] = v * k)); out.push({ name, kind: "diag", c0: 0, b: new Array(d).fill(0), Q }); }
  return out;
}
export function P(h, x) { let s = h.c0; for (let i = 0; i < x.length; i++) { s += h.b[i] * x[i]; for (let j = 0; j < x.length; j++) s += h.Q[i][j] * x[i] * x[j]; } return s; }
export function psi(st, h, x) { const r = Math.hypot(...x); return Rl(st, r) * P(h, x); }

/* the dartboard: electron positions drawn from |ψ|² (r from P(r) by its tabulated CDF, the direction uniform on the
   sphere then kept with chance Y²/max Y²) */
export function sampler(st, h, rng = Math.random) {
  const d = st.d, gauss = () => Math.sqrt(-2 * Math.log(1 - rng())) * Math.cos(2 * Math.PI * rng());
  const dir = () => { const v = Array.from({ length: d }, gauss), m = Math.hypot(...v); return v.map((x) => x / m); };
  let ymax = 0; for (let i = 0; i < 4000; i++) ymax = Math.max(ymax, P(h, dir()) ** 2); ymax *= 1.15;
  const { h: dh, v } = st.cdf;
  return () => {
    const u = rng(); let lo = 0, hi = v.length - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (v[m] < u) lo = m; else hi = m; }
    const r = (lo + (u - v[lo]) / Math.max(1e-12, v[hi] - v[lo])) * dh;
    for (let k = 0; k < 10000; k++) { const x = dir(); if (rng() * ymax <= P(h, x) ** 2) return x.map((c) => c * r); }
    return dir().map((c) => c * r);
  };
}
/* the same orbital in our 3D atom, when there is one (same n, l and the same name); else null */
export function twin(name, n, l) { const h = harmonics(3, l).find((q) => q.name === name); return h ? { st: state(3, n, l), h } : null; }
