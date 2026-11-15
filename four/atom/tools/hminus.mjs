/* Does H⁻ bind in four dimensions? A variational answer under the book's own Hamiltonian (non-relativistic, the pinned
   1/r between every pair of charges), which the photosphere's opacity needs: in our Sun's photosphere H⁻ supplies most
   of it, and paper 1's anion search (local exchange) fails our H⁻, so its "unbound in 4D" can't be trusted.
   Method: s-wave configuration interaction. One-electron basis: M orthonormalized Laguerre functions
   e^(−λr) L_n^(d−1)(2λr) (orthogonal under r^(d−1) dr), diagonalized in hydrogen's h to give orbitals ϕ_p (the first is
   hydrogen's 1s, the rest a discretized spectrum); two-electron singlets (ϕ_pϕ_q + ϕ_qϕ_p) over every pair p ≤ q;
   the electrons' repulsion averaged over both directions is the book's kernel, 1/r_> ours and k₄(r_</r_>)/r_> in 4D
   (kernel.js), so every s-wave matrix element is exact up to the radial quadrature. The lowest eigenvalue is an upper
   bound on the s-wave H⁻ energy, and the s-wave energy is itself above the full one, so E below hydrogen's exact
   −Z²/2ν² (ν = 1 ours, 3/2 in 4D) proves H⁻ bound. Ours as the check: Chandrasekhar's two-exponent function gives
   −0.51330 Ha and the s-wave limit is about −0.514 (from memory); hydrogen −0.5.
     node four/atom/tools/hminus.mjs [M] [λ] [N]          both worlds; prints E, hydrogen in the basis, the margin */
import { kTab } from "../js/kernel.js";

const OM = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
export function jacobi(A0) {
  const n = A0.length, a = A0.map((r) => Float64Array.from(r)), V = Array.from({ length: n }, (_, i) => { const v = new Float64Array(n); v[i] = 1; return v; });
  const scale = Math.max(...a.map((r, i) => Math.abs(r[i]))) || 1;
  for (let sweep = 0; sweep < 60; sweep++) { let off = 0; for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += a[p][q] * a[p][q]; if (off < 1e-30 * scale * scale) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) { const apq = a[p][q]; if (Math.abs(apq) < 1e-18 * scale) continue;
      const th = (a[q][q] - a[p][p]) / (2 * apq), t = (th >= 0 ? 1 : -1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[p][k], vkq = V[q][k]; V[p][k] = c * vkp - s * vkq; V[q][k] = s * vkp + c * vkq; } } }
  return { w: Array.from({ length: n }, (_, i) => a[i][i]), V }; // V[i] is the i-th eigenvector
}
const lag = (n, al, x) => { const L = new Float64Array(n + 1); L[0] = 1; if (n > 0) L[1] = 1 + al - x; for (let k = 1; k < n; k++) L[k + 1] = ((2 * k + 1 + al - x) * L[k] - (k + al) * L[k - 1]) / (k + 1); return L; };

export function hminus(d, { Z = 1, M = 24, lam = 0.25, N = 2000, rlo = 1e-6, rhi = 900 } = {}) {
  const xs = Float64Array.from({ length: N + 1 }, (_, i) => Math.log(rlo) + ((Math.log(rhi) - Math.log(rlo)) * i) / N), r = xs.map(Math.exp), hx = xs[1] - xs[0];
  const w = r.map((ri, i) => (((i === 0 || i === N ? 1 : i % 2 ? 4 : 2) * hx) / 3) * ri * OM[d] * ri ** (d - 1));
  // the Laguerre functions and their slopes: d/dr [e^(−λr) L_n^α(2λr)] = e^(−λr)[−λ L_n^α − 2λ L_(n−1)^(α+1)]
  const al = d - 1, f = [], fp = [];
  for (let n = 0; n < M; n++) { f.push(new Float64Array(N + 1)); fp.push(new Float64Array(N + 1)); }
  for (let i = 0; i <= N; i++) { const x = 2 * lam * r[i], e = Math.exp(-lam * r[i]), L = lag(M, al, x), L1 = lag(M, al + 1, x);
    for (let n = 0; n < M; n++) { f[n][i] = e * L[n]; fp[n][i] = e * (-lam * L[n] - (n > 0 ? 2 * lam * L1[n - 1] : 0)); } }
  const dot = (u, v) => { let t = 0; for (let i = 0; i <= N; i++) t += u[i] * v[i] * w[i]; return t; };
  // orthonormalize (modified Gram–Schmidt, twice), carrying the slopes with the same coefficients
  for (let pass = 0; pass < 2; pass++) for (let n = 0; n < M; n++) { for (let m = 0; m < n; m++) { const c = dot(f[n], f[m]); for (let i = 0; i <= N; i++) { f[n][i] -= c * f[m][i]; fp[n][i] -= c * fp[m][i]; } }
    const s = 1 / Math.sqrt(dot(f[n], f[n])); for (let i = 0; i <= N; i++) { f[n][i] *= s; fp[n][i] *= s; } }
  const h = f.map((u, m) => f.map((v, n) => { let t = 0; for (let i = 0; i <= N; i++) t += (0.5 * fp[m][i] * fp[n][i] - (Z / r[i]) * u[i] * v[i]) * w[i]; return t; }));
  const eh = jacobi(h), ord = eh.w.map((e, i) => [e, i]).sort((p, q) => p[0] - q[0]), eps = ord.map(([e]) => e);
  const phi = ord.map(([, k]) => { const v = new Float64Array(N + 1); for (let n = 0; n < M; n++) { const c = eh.V[k][n]; for (let i = 0; i <= N; i++) v[i] += c * f[n][i]; } return v; });
  // pair densities and their potentials U_pq(r₂) = ∫ ϕ_pϕ_q K dV₁ (kernel = the angular average)
  const KM = Array.from({ length: N + 1 }, (_, m) => { const row = new Float64Array(N + 1); for (let i = 0; i <= N; i++) { const lo = Math.min(r[i], r[m]), hi = Math.max(r[i], r[m]); row[i] = ((d === 3 ? 1 : kTab(lo / hi)) / hi) * w[i]; } return row; });
  const P = (p, q) => (p <= q ? p * M + q : q * M + p), U = new Map(), rho = new Map();
  for (let p = 0; p < M; p++) for (let q = p; q < M; q++) { const rh = new Float64Array(N + 1); for (let i = 0; i <= N; i++) rh[i] = phi[p][i] * phi[q][i]; rho.set(P(p, q), rh);
    const u = new Float64Array(N + 1); for (let m = 0; m <= N; m++) { const row = KM[m]; let t = 0; for (let i = 0; i <= N; i++) t += rh[i] * row[i]; u[m] = t; } U.set(P(p, q), u); }
  const g = (p, q, r_, s) => { const u = U.get(P(p, r_)), rh = rho.get(P(q, s)); let t = 0; for (let i = 0; i <= N; i++) t += u[i] * rh[i] * w[i]; return t; }; // ⟨pq|rs⟩ = ∫∫ ρ_pr(1) ρ_qs(2) K
  const conf = []; for (let p = 0; p < M; p++) for (let q = p; q < M; q++) conf.push([p, q]);
  const nrm = ([p, q]) => (p === q ? 2 : Math.SQRT2), H = conf.map((A) => conf.map((B) => { const [p, q] = A, [r_, s] = B;
    let v = 2 * (g(p, q, r_, s) + g(p, q, s, r_)); if (p === r_ && q === s) v += (eps[p] + eps[q]) * (p === q ? 4 : 2); return v / ((nrm(A) * nrm(B)) ** 1 * 1) / 1; }));
  // with S_pq = ϕpϕq + ϕqϕp, ⟨S_pq|S_pq⟩ = 2(1 + δ) → normalized by √(2(1+δ)); nrm above is √(2(1+δ)) squared-consistent: fix by explicit norms
  const nn = conf.map(([p, q]) => Math.sqrt(2 * (1 + (p === q ? 1 : 0)))), Hn = conf.map((A, a) => conf.map((B, b) => { const [p, q] = A, [r_, s] = B;
    let v = 2 * (g(p, q, r_, s) + g(p, q, s, r_)); if (p === r_ && q === s) v += (eps[p] + eps[q]) * 2 * (1 + (p === q ? 1 : 0)); return v / (nn[a] * nn[b]); }));
  void H;
  const ec = jacobi(Hn), E = Math.min(...ec.w), nu = d === 3 ? 1 : 1.5, EHx = (-Z * Z) / (2 * nu * nu);
  // the outer electron's orbital, χ(r) = ∫ ϕ₀(r₁) Ψ(r₁, r) dV₁ (ϕ₀ = hydrogen's 1s in the basis): from the configurations (0, q)
  const g0 = ec.w.indexOf(E), C = ec.V[g0], chi = new Float64Array(N + 1);
  conf.forEach(([p, q], c) => { if (p !== 0) return; const f = (q === 0 ? 2 : 1) / nn[c]; for (let i = 0; i <= N; i++) chi[i] += C[c] * f * phi[q][i]; });
  return { d, M, lam, N, E, EH_basis: eps[0], EH_exact: EHx, marginMeV: (EHx - E) * 27211.386, configs: conf.length, r, chi, phi0: phi[0], U00: U.get(P(0, 0)), norm1s: dot(chi, chi) };
}
/* photodetachment, H⁻ + γ → H(1s) + e: the final state is H(1s) with a p-wave electron in its static field
   (−Z/r + the 1s cloud's own potential), symmetrized; the dipole then reduces to √2 ∫ u_ε u_χ r dr (u = r^((d−1)/2)√Ω ×
   the s-wave function), and σ follows by the same detailed balance as photo.js's. Energies in hartree, σ in a₀^(d−1);
   the threshold is the s-wave CI's own affinity (pass `affinity` to move it to a measured one). */
export function photodetach(d, R, ws, { affinity = R.EH_exact - R.E, h = 0.01, rmax = 1600 } = {}) {
  const { r, chi, U00 } = R, n = Math.ceil(rmax / h), Om = OM[d], Lp = 1 + (d - 3) / 2;
  const interp = (arr, x) => { if (x <= r[0]) return arr[0]; if (x >= r[r.length - 1]) return 0; const lx = Math.log(x), l0 = Math.log(r[0]), dl = Math.log(r[1]) - l0, f = (lx - l0) / dl, i = Math.floor(f); return arr[i] + (arr[i + 1] - arr[i]) * (f - i); };
  const uChi = new Float64Array(n + 1), Vst = new Float64Array(n + 1);
  for (let i = 1; i <= n; i++) { const x = i * h; uChi[i] = x ** ((d - 1) / 2) * Math.sqrt(Om) * interp(chi, x); Vst[i] = -1 / x + interp(U00, x); }
  return ws.map((w) => { const E = w - affinity; if (E <= 0) return 0;
    const f = (i) => (Lp * (Lp + 1)) / (i * h) ** 2 + 2 * Vst[i] - 2 * E, u = new Float64Array(n + 1), h2 = (h * h) / 12; u[1] = h ** (Lp + 1); u[2] = (2 * h) ** (Lp + 1);
    for (let i = 2; i < n; i++) { u[i + 1] = (2 * u[i] * (1 + 5 * h2 * f(i)) - u[i - 1] * (1 - h2 * f(i - 1))) / (1 - h2 * f(i + 1)); if (Math.abs(u[i + 1]) > 1e200) for (let j = 0; j <= i + 1; j++) u[j] *= 1e-200; }
    const k = Math.sqrt(2 * E); let A2 = 0, m = 0; for (let i = n - 600; i < n; i += 7) { const kl = Math.sqrt(Math.max(1e-30, -f(i))), du = (u[i + 1] - u[i - 1]) / (2 * h); A2 += (u[i] * u[i] + (du * du) / (kl * kl)) * (kl / k); m++; }
    const s = Math.sqrt(2 / (Math.PI * k)) / Math.sqrt(A2 / m); let I = 0; for (let i = 1; i <= n; i++) I += u[i] * s * uChi[i] * i * h; I *= h;
    const D2 = 2 * I * I, K = { 3: 4 / 3, 4: (3 * Math.PI) / 8 }[d], ALPHA = 1 / 137.035999084;
    return (K * ALPHA ** (4 - d) * (2 * Math.PI) ** d * w ** (4 - d) * D2) / ((d - 1) * Om); });
}
if (process.argv[1]?.endsWith("hminus.mjs")) { const M = +(process.argv[2] ?? 24), lam = +(process.argv[3] ?? 0.25), N = +(process.argv[4] ?? 2000);
  for (const d of [3, 4]) { const t = Date.now(), R = hminus(d, { M, lam, N }); console.log(JSON.stringify({ ...R, sec: (Date.now() - t) / 1000 })); } }
