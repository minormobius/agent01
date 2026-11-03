/* ATOM⁴'s ionic crystals, no DOM, in any number of dimensions: ions (point charges with clouds) in a periodic cell of
   any shape, their lattice energy, for salts whose structure isn't known (bluminium pxide, Bl₂Px₃; our corundum the
   check). The ions and their meetings come from tools/salt.mjs (closed-shell ions from the table's solver, Gordon and
   Kim's electron gas between their frozen clouds); this sums them over a crystal.

   Two ions A and B meet, past their point charges q_A q_B / r, as tools/salt.mjs's far field in 4D (the shell theorem
   fails, so a spherical cloud leaks a field):
       (q_A c_B + c_A q_B)/r³ + (−3 S_A S_B + q_A T_B + T_A q_B)/(64 r⁵),   c = S/8, S = Σ⟨r²⟩, T = Σ⟨r⁴⟩
   plus a short-range rest (overlap) that is gone by RM. In ours the far field is zero.

   The 1/r and 1/r³ parts reach far and alternate in sign, so both are summed by Ewald's split of r^(−p) in d dimensions:
       r^(−p) = Q(p/2, α²r²)/r^p  +  P(p/2, α²r²)/r^p,
   the first in real space, the second as Σ_k FT_p(k)…/V with
       FT_p(k) = π^(d/2) 2^(d−p) k^(p−d) Γ((d−p)/2) Q((d−p)/2, k²/4α²) / Γ(p/2),
   (Q, P the regularized incomplete gammas), and each ion's own smooth part at r = 0 taken out (α^p/Γ(p/2 + 1) per
   bilinear term). The cell is neutral, so k = 0 drops out (tin foil). The r⁻⁵ part converges in 4D over r³ shells and
   is summed directly to rc with the continuum past it. */
import { erfc, Qgamma } from "./md.js";
/* small dense algebra (the mirror carries this file without js/crystal.js) */
function inv(M) { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; const v = A[c][c]; A[c] = A[c].map((x) => x / v); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((x, k) => x - f * A[c][k]); } } return A.map((r) => r.slice(n)); }
function det(M) { const n = M.length, A = M.map((r) => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (!A[p][c]) return 0; if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; D = -D; } D *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return D; }

const G = { 0.5: Math.sqrt(Math.PI), 1: 1, 1.5: Math.sqrt(Math.PI) / 2, 2: 1, 2.5: (3 * Math.sqrt(Math.PI)) / 4 };
const SD = { 3: 4 * Math.PI, 4: 2 * Math.PI * Math.PI };
/* FT of the smooth part of r^(−p), divided by nothing (the caller divides by V) */
const ft = (d, p, k, alpha) => (Math.PI ** (d / 2) * 2 ** (d - p) * k ** (p - d) * G[(d - p) / 2] * Qgamma((d - p) / 2, (k * k) / (4 * alpha * alpha))) / G[p / 2];

const W5 = 2; // bohr over which the r⁻⁵ cloud terms are switched off before rc
/* ∫ (1 − s(r)) r⁻² dr from rc − W5 to ∞, s the quintic switch (Simpson on the switch's span, 1/rc past it) */
const TAIL = new Map();
function tailJ(rc) { if (TAIL.has(rc)) return TAIL.get(rc); const n = 200, a = rc - W5, h = W5 / n; let J = 0;
  for (let k = 0; k <= n; k++) { const r = a + k * h, t = (r - a) / W5, s = 1 - t * t * t * (10 - 15 * t + 6 * t * t), wk = k === 0 || k === n ? 1 : k % 2 ? 4 : 2; J += (wk * (1 - s)) / (r * r); }
  J = (J * h) / 3 + 1 / rc; TAIL.set(rc, J); return J; }
export class Ionic {
  /* species: [{ q, S, T }] (S, T: Σ⟨r²⟩ and Σ⟨r⁴⟩ over the ion's electrons; only used in 4D); short(a, b, r): the
     short-range rest between species a and b at r (zero past RM); rc the real-space cut */
  constructor({ d, species, short, rc = d === 3 ? 14 : 18, RM = 14 }) {
    Object.assign(this, { d, species, short, rc, RM });
    this.alpha = 4.2 / rc; // erfc(4.2) ≈ 2·10⁻⁹, and Q(3/2, 4.2²) ≈ 10⁻⁷: the real-space parts are gone by rc
    this.kmax = 2 * this.alpha * Math.sqrt(24);
  }
  /* the point charges' potential at each ion from every other (Ewald; the ion's own charge excluded): what sets a
     doubly charged anion's size in the crystal (its Watson shell, R = |q|/φ) */
  sitePotentials(H, x, kinds) {
    const { d, species: sp, rc, alpha } = this, n = kinds.length, V = Math.abs(det(H)), Hi = inv(H), q = kinds.map((k) => sp[k].q), phi = new Float64Array(n);
    const bound = H.map((_, i) => Math.ceil((rc + Math.max(...H.map((h) => Math.hypot(...h)))) * Math.hypot(...Hi.map((r) => r[i]))));
    const m = bound.map((b) => -b), rv = new Float64Array(d);
    for (;;) { const t = H[0].map((_, a) => m.reduce((s2, v, i) => s2 + v * H[i][a], 0));
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) { let r2 = 0; for (let a = 0; a < d; a++) { rv[a] = x[j * d + a] - x[i * d + a] + t[a]; r2 += rv[a] * rv[a]; } if (r2 < 1e-12 || r2 >= rc * rc) continue; const r = Math.sqrt(r2); phi[i] += (q[j] * erfc(alpha * r)) / r; }
      let i = 0; while (i < d && m[i] === bound[i]) { m[i] = -bound[i]; i++; } if (i === d) break; m[i]++; }
    const nb = H.map((h) => Math.ceil((Math.hypot(...h) * this.kmax) / (2 * Math.PI))), mk = nb.map((b) => -b), kv = new Float64Array(d);
    for (;;) { if (mk.find((v) => v !== 0) > 0) { for (let a = 0; a < d; a++) { let s2 = 0; for (let b = 0; b < d; b++) s2 += Hi[a][b] * mk[b]; kv[a] = 2 * Math.PI * s2; } const k = Math.hypot(...kv);
        if (k <= this.kmax) { let Sr = 0, Si = 0; const ph = []; for (let i = 0; i < n; i++) { let p2 = 0; for (let a = 0; a < d; a++) p2 += kv[a] * x[i * d + a]; ph.push(p2); Sr += q[i] * Math.cos(p2); Si += q[i] * Math.sin(p2); }
          const w = (2 * ft(d, 1, k, alpha)) / V; for (let i = 0; i < n; i++) phi[i] += w * (Sr * Math.cos(ph[i]) + Si * Math.sin(ph[i])); } }
      let i = 0; while (i < d && mk[i] === nb[i]) { mk[i] = -nb[i]; i++; } if (i === d) break; mk[i]++; }
    for (let i = 0; i < n; i++) phi[i] -= (2 * alpha * q[i]) / Math.sqrt(Math.PI); // the ion's own smooth part out
    return phi;
  }
  /* energy per formula unit (hartree) for cell rows H, flat positions x (n × d) and each ion's species; nf the number of
     formula units in the cell. Returns its parts too, and with grad the slopes gx (per ion, flat) at fixed cell and gH
     (d × d) at fixed ions, both per formula unit. null if the cell is too skewed to sum. short(a, b, r) returns
     [u, du/dr] */
  energy(H, x, kinds, nf = 1, grad = false) {
    const { d, species: sp, rc, alpha } = this, n = kinds.length, V = Math.abs(det(H)), Hi = inv(H), cloud = d === 4;
    const q = kinds.map((k) => sp[k].q), c = kinds.map((k) => (cloud ? sp[k].S / 8 : 0)), S = kinds.map((k) => (cloud ? sp[k].S : 0)), T = kinds.map((k) => (cloud ? sp[k].T : 0));
    // pairs wrapped to the nearest image, and the lattice translations that can bring them within rc
    const P = []; let far = 0;
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
      const r0 = new Float64Array(d); for (let a = 0; a < d; a++) r0[a] = x[j * d + a] - x[i * d + a];
      const m = new Array(d).fill(0);
      if (i !== j) { for (let a = 0; a < d; a++) { let s = 0; for (let b = 0; b < d; b++) s += r0[b] * Hi[b][a]; m[a] = Math.round(s); } for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) r0[a] -= m[b] * H[b][a]; }
      far = Math.max(far, Math.hypot(...r0)); P.push({ i, j, r0, m });
    }
    const reach = rc + far, bound = H.map((_, i) => Math.ceil(reach * Math.hypot(...Hi.map((r) => r[i])))); if (bound.reduce((s, b) => s * (2 * b + 1), 1) > 6e5) return null;
    const Tr = []; { const m = bound.map((b) => -b); for (;;) { const t = H[0].map((_, a) => m.reduce((s, v, i) => s + v * H[i][a], 0)); if (Math.hypot(...t) < reach) Tr.push({ t, nt: m.slice() }); let i = 0; while (i < d && m[i] === bound[i]) { m[i] = -bound[i]; i++; } if (i === d) break; m[i]++; } }
    let E1 = 0, E3 = 0, E5 = 0, Es = 0, closest = Infinity; const rv = new Float64Array(d), a2 = alpha * alpha, SP = 2 / Math.sqrt(Math.PI);
    const gx = grad ? new Float64Array(n * d) : null, gH = grad ? H.map(() => new Float64Array(d)) : null;
    for (const { i, j, r0, m } of P) {
      const w = i === j ? 0.5 : 1, qq = q[i] * q[j], c3 = q[i] * c[j] + c[i] * q[j], c5 = (-3 * S[i] * S[j] + q[i] * T[j] + T[i] * q[j]) / 64;
      for (const { t, nt } of Tr) {
        let r2 = 0; for (let a = 0; a < d; a++) { rv[a] = r0[a] + t[a]; r2 += rv[a] * rv[a]; }
        if (r2 >= rc * rc || r2 < 1e-12) continue;
        const r = Math.sqrt(r2); if (i !== j) closest = Math.min(closest, r);
        const ef = erfc(alpha * r), ex = Math.exp(-a2 * r2); let dU = -qq * (ef / r2 + (SP * alpha * ex) / r); // dU/dr
        E1 += (w * qq * ef) / r;
        if (cloud) { const Q3 = Qgamma(1.5, a2 * r2); E3 += (w * c3 * Q3) / (r2 * r);
          // the r⁻⁵ terms switched off over the last W5 bohr before rc (the continuum below takes the rest): a hard cut
          // makes the energy jump as an image crosses rc, which stalls the descent
          let s5 = 1, ds5 = 0; if (r > rc - W5) { const t = (r - rc + W5) / W5; s5 = 1 - t * t * t * (10 - 15 * t + 6 * t * t); ds5 = (-30 * t * t * (1 - t) * (1 - t)) / W5; }
          E5 += (w * c5 * s5) / (r2 * r2 * r);
          dU += c3 * ((-2 * alpha ** 3 * r2 * ex) / G[1.5] / (r2 * r) - (3 * Q3) / (r2 * r2)) + c5 * (ds5 / (r2 * r2 * r) - (5 * s5) / (r2 * r2 * r2)); }
        if (r < this.RM) { let [u, du] = this.short(kinds[i], kinds[j], r); // tapered to zero over the last 2 bohr (the tables end a hair short of it)
          if (r > this.RM - 2) { const t = (r - this.RM + 2) / 2, sw = 1 - t * t * t * (10 - 15 * t + 6 * t * t), dsw = (-30 * t * t * (1 - t) * (1 - t)) / 2; du = du * sw + u * dsw; u *= sw; }
          Es += w * u; dU += du; }
        if (!grad) continue;
        const g = (w * dU) / r;
        for (let a = 0; a < d; a++) { const f = g * rv[a]; gx[j * d + a] += f; gx[i * d + a] -= f; for (let b = 0; b < d; b++) gH[b][a] += f * (nt[b] - m[b]); }
      }
    }
    // the r⁻⁵ continuum the switch leaves: ½ Σ_ij c5_ij S_d ∫ (1 − s(r)) r^(d−1) r⁻⁵ dr / V (4D: r⁻², so S_d (J + 1/rc))
    let Etail = 0; if (cloud) { let s5 = 0; for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) s5 += (-3 * S[i] * S[j] + q[i] * T[j] + T[i] * q[j]) / 64; Etail = (0.5 * s5 * SD[4] * tailJ(rc)) / V; E5 += Etail; }
    // reciprocal space over half the k vectors
    let K1 = 0, K3 = 0; const nb = H.map((h) => Math.ceil((Math.hypot(...h) * this.kmax) / (2 * Math.PI))); if (nb.reduce((t, b) => t * (2 * b + 1), 1) > 6e5) return null;
    const kv = new Float64Array(d), cs = new Float64Array(n), sn = new Float64Array(n), gk = new Float64Array(d);
    // the weight of r^(−p)'s smooth part at k and its slope (dw/dk)/k, both before the 1/V
    const wk = (p, k) => ft(d, p, k, alpha), dwk = (p, k) => { const s2 = (d - p) / 2, z = (k * k) / (4 * alpha * alpha), A = (Math.PI ** (d / 2) * 2 ** (d - p) * G[s2]) / G[p / 2];
      return (A * ((p - d) * k ** (p - d - 2) * Qgamma(s2, z) - (k ** (p - d) * z ** (s2 - 1) * Math.exp(-z)) / G[s2] / (2 * alpha * alpha))); };
    { const m = nb.map((b) => -b); for (;;) {
      if (m.find((v) => v !== 0) > 0) {
        for (let a = 0; a < d; a++) { let s = 0; for (let b = 0; b < d; b++) s += Hi[a][b] * m[b]; kv[a] = 2 * Math.PI * s; }
        const k = Math.hypot(...kv);
        if (k <= this.kmax) {
          let Sr = 0, Si = 0, Cr = 0, Ci = 0;
          for (let i = 0; i < n; i++) { let ph = 0; for (let a = 0; a < d; a++) ph += kv[a] * x[i * d + a]; cs[i] = Math.cos(ph); sn[i] = Math.sin(ph); Sr += q[i] * cs[i]; Si += q[i] * sn[i]; Cr += c[i] * cs[i]; Ci += c[i] * sn[i]; }
          const w1 = wk(1, k) / V, S2 = Sr * Sr + Si * Si, e1 = w1 * S2; K1 += e1; // ½ Σ_all = Σ_half
          const w3 = cloud ? (2 * wk(3, k)) / V : 0, X = Sr * Cr + Si * Ci, e3 = w3 * X; K3 += e3; // Σ_ij q_i c_j: Σ_all Re(S C*) = 2 Σ_half
          if (grad) {
            gk.fill(0); const d1 = (dwk(1, k) / V) * S2 + (cloud ? ((2 * dwk(3, k)) / V) * X : 0); for (let a = 0; a < d; a++) gk[a] = d1 * kv[a];
            for (let i = 0; i < n; i++) {
              const dphi = 2 * w1 * q[i] * (Si * cs[i] - Sr * sn[i]) + (cloud ? w3 * (q[i] * (Ci * cs[i] - Cr * sn[i]) + c[i] * (Si * cs[i] - Sr * sn[i])) : 0);
              for (let a = 0; a < d; a++) { gx[i * d + a] += dphi * kv[a]; gk[a] += dphi * x[i * d + a]; }
            }
            // k_a depends on H: ∂k_a/∂H_bc = −(H⁻¹)_ab k_c; and the weights go as 1/V: ∂E/∂H_bc = −E (H⁻¹)_cb
            for (let b = 0; b < d; b++) for (let c2 = 0; c2 < d; c2++) { let s = 0; for (let a = 0; a < d; a++) s += gk[a] * Hi[a][b]; gH[b][c2] -= s * kv[c2] + (e1 + e3) * Hi[c2][b]; }
          }
        }
      }
      let i = 0; while (i < d && m[i] === nb[i]) { m[i] = -nb[i]; i++; } if (i === d) break; m[i]++;
    } }
    // each ion's own smooth part at r = 0
    let self1 = 0, self3 = 0; for (let i = 0; i < n; i++) { self1 -= (q[i] * q[i] * alpha) / Math.sqrt(Math.PI); self3 -= (q[i] * c[i] * alpha ** 3) / G[2.5]; }
    const coul = E1 + K1 + self1, clouds = cloud ? E3 + K3 + self3 + E5 : 0;
    const out = { E: (coul + clouds + Es) / nf, coul: coul / nf, clouds: clouds / nf, short: Es / nf, V: V / nf, closest };
    if (grad) { for (let b = 0; b < d; b++) for (let a = 0; a < d; a++) gH[b][a] = (gH[b][a] - Etail * Hi[a][b]) / nf; for (let k = 0; k < gx.length; k++) gx[k] /= nf; out.gx = gx; out.gH = gH; }
    return out;
  }
}
