/* ATOM⁴'s polarizable crystals, no DOM, in any d: js/polmodel.js's force field (charges, 4D's clouds, induced dipoles,
   repulsion) for rigid molecules in a periodic cell of any shape (js/crystal.js's cells, descent and tidying).

   Every long-ranged term is split as Ewald split the charges (js/md.js, js/crystal.js): a kernel r⁻ᵖ is
   Q(p/2, α²r²)/rᵖ, short-ranged and summed over images, plus a smooth rest summed over reciprocal vectors with
       FT[smooth r⁻ᵖ](k) = π^(d/2)/Γ(p/2) · (k/2)^(p−d) · Γ((d−p)/2, k²/4α²)
   (Γ(s, z) the upper incomplete gamma function; p = 1 gives js/md.js's kernel). Three kernels meet:
   · p = 1 between charges, and the field of charges and of dipoles on each dipole (its first and second slopes);
   · p = 3 between a charge and a cloud (q c/r³, 4D only), and a cloud's field on a dipole;
   · p = 5 between clouds (−3cc′/r⁵), short enough in 4D to sum directly with the continuum past the cut.
   The induced dipoles solve (α⁻¹ − T)μ = E, E the field of every other molecule's charges and clouds, T the dipoles'
   periodic coupling; E_pol = −½ Σ μ·E. Everything within a molecule is taken out (its own charges and clouds come
   with its shape) except its dipoles' coupling to each other, which is what shapes its response. The damping of
   js/polmodel.js (Thole's between dipoles and on a charge's field, Tang–Toennies' on the clouds) is short-ranged, so
   it enters as a correction to the real-space sum. Tin-foil boundary throughout (the k = 0 terms dropped).

   Checked (selftest): the energy doesn't depend on Ewald's α, and two molecules in a large cell give
   js/polmodel.js's cluster energy for the pair.

   Slopes (energy(H, mols, true): gx per site at fixed cell, gH in the cell rows at fixed sites, as js/crystal.js): the
   dipoles make the energy stationary in them, so its slope is the slope at fixed dipoles (Hellmann–Feynman). Each
   real-space pair's terms are differentiated as they stand, switch and damping included; the smooth parts through
   S = Σ (q_j + i k·μ_j) e^(ik·x_j) and the clouds' C = Σ c_j e^(ik·x_j), whose energy is ½w₁|S|² + w₃ Re S C*, with k
   moving with the cell (∂k_a/∂H_bc = −(H⁻¹)_ab k_c) and w ∝ 1/V. Checked against central differences (selftest). */
import { erfc, Qgamma, shortPair, sphereArea } from "./md.js";
import { thole, tholeJet, ttf, THOLE } from "./polmodel.js";
import { inv, det } from "./crystal.js";

const SP = 2 / Math.sqrt(Math.PI);
const gammaHalf = (s) => { let g = s % 1 ? Math.sqrt(Math.PI) : 1, x = s % 1 ? 0.5 : 1; while (x < s - 1e-9) { g *= x; x += 1; } return g; }; // Γ(s), s a half-integer
/* Γ(s, z) for half-integer s > 0, unnormalized, by recursion from Γ(½, z) = √π erfc(√z) or Γ(1, z) = e^(−z) */
const upperGamma = (s, z) => Qgamma(s, z) * gammaHalf(s);
/* the step that switches the real-space terms off before rc (as js/crystal.js) */
const step = (r, r1, rc) => { if (r <= r1) return 1; if (r >= rc) return 0; const t = (r - r1) / (rc - r1); return 1 - t * t * t * (10 - 15 * t + 6 * t * t); };

export class PolCrystal {
  /* tmpl: the molecule's sites (heavy atom first); terms: polmodel's polTerms output; rc: the cut */
  constructor({ d, tmpl, terms, rc = d === 3 ? 12 : 14, width = 2, alphaFactor = 4 }) {
    const nH = tmpl.length - 1, ns = tmpl.length;
    Object.assign(this, { d, tmpl, terms, rc, r1: rc - width, ns, numericSlopes: false });
    this.q = tmpl.map((_, i) => (i ? terms.q : -nH * terms.q)); this.c = tmpl.map((_, i) => (i ? terms.cH : terms.cX)) ; this.al = tmpl.map((_, i) => (i ? terms.pol.aH : terms.pol.aX));
    this.ty = tmpl.map((_, i) => (i ? "H" : "X")); this.key = (a, b) => (a !== b ? "X|H" : `${a}|${b}`);
    this.alpha = alphaFactor / this.r1; this.kmax = 2 * this.alpha * Math.sqrt(22);
    this.hasClouds = d === 4 && this.c.some((v) => v);
    this.inter = terms.pol.inter ?? THOLE;
    // the continuum past the switch for the clouds' −3cc′/r⁵ (the repulsions are gone by rc)
    const Sd = sphereArea(d); let J = 0;
    if (this.hasClouds) { const R = 60 * rc, n = 20000, lo = Math.log(this.r1), h = (Math.log(R) - lo) / n; for (let k = 0; k <= n; k++) { const r = Math.exp(lo + k * h), w = k === 0 || k === n ? 0.5 : 1; J += w * (-3 / r ** 5) * (1 - step(r, this.r1, rc)) * Sd * r ** d; } J = J * h - 3 * Sd * R ** (d - 5) / (5 - d); }
    this.Jcc = 0.5 * J * this.c.reduce((s, a) => s + a, 0) ** 2; // × Z²/V
    // the charges' meeting within a molecule and with themselves (a rigid molecule's constant), as js/crystal.js
    this.Eintra = 0; for (let i = 0; i < ns; i++) { this.Eintra -= 0.5 * this.q[i] ** 2 * SP * this.alpha; for (let j = i + 1; j < ns; j++) { const r = Math.hypot(...tmpl[i].map((x, k) => x - tmpl[j][k])); this.Eintra -= (this.q[i] * this.q[j] * (1 - erfc(this.alpha * r))) / r; } }
    // and the clouds': a charge meeting its own molecule's clouds (its own site's included) through the smooth p = 3 part
    const g3s0 = (4 * this.alpha ** 3) / (3 * Math.sqrt(Math.PI)); // lim r→0 of γ(3/2, α²r²)/(Γ(3/2) r³)
    this.g3s = (r) => (r < 1e-9 ? g3s0 : (1 - Qgamma(1.5, (this.alpha * r) ** 2)) / r ** 3);
    if (this.hasClouds) for (let i = 0; i < ns; i++) for (let j = 0; j < ns; j++) { const r = Math.hypot(...tmpl[i].map((x, k) => x - tmpl[j][k])); this.Eintra -= this.q[i] * this.c[j] * this.g3s(r); }
  }
  /* the reciprocal weights of the p = 1 and p = 3 kernels for |k| (full-space, per 1/V) */
  ft(p, k) { const { d, alpha } = this; return (Math.PI ** (d / 2) / gammaHalf(p / 2)) * (k / 2) ** (p - d) * upperGamma((d - p) / 2, (k * k) / (4 * alpha * alpha)); }
  /* and its slope in k (dΓ(s, z)/dz = −z^(s−1) e^(−z)) */
  dft(p, k) { const { d, alpha } = this, s = (d - p) / 2, z = (k * k) / (4 * alpha * alpha); return (this.ft(p, k) * (p - d)) / k - (Math.PI ** (d / 2) / gammaHalf(p / 2)) * (k / 2) ** (p - d) * z ** (s - 1) * Math.exp(-z) * (k / (2 * alpha * alpha)); }
  /* every reciprocal vector of half the space within kmax: f(kv, k); false if there are too many */
  eachK(H, Hi, f) {
    const d = this.d, nb = H.map((h) => Math.ceil((Math.hypot(...h) * this.kmax) / (2 * Math.PI))); if (nb.reduce((t, b) => t * (2 * b + 1), 1) > 3e6) return false;
    const kv = new Float64Array(d), m = nb.map((b) => -b);
    for (;;) {
      if (m.find((v) => v !== 0) > 0) {
        for (let a = 0; a < d; a++) { let s = 0; for (let b = 0; b < d; b++) s += Hi[a][b] * m[b]; kv[a] = 2 * Math.PI * s; }
        const k = Math.hypot(...kv); if (k <= this.kmax) f(kv, k);
      }
      let i = 0; while (i < d && m[i] === nb[i]) { m[i] = -nb[i]; i++; } if (i === d) return true; m[i]++;
    }
  }
  /* energy per molecule for cell rows H and molecules as site lists; null if too skewed. Also the dipoles, and with
     grad the slopes gx (per site, flat) and gH (d × d), per molecule */
  energy(H, mols, grad = false) {
    const { d, rc, r1, alpha, ns, q, c, al, terms } = this, Z = mols.length, n = Z * ns, V = Math.abs(det(H)), Hi = inv(H), rc2 = rc * rc, a2 = alpha * alpha;
    const x = []; mols.forEach((m) => m.forEach((p) => x.push(p))); const mol = Array.from({ length: n }, (_, i) => (i / ns) | 0), sk = (i) => i % ns;
    // pairs and their wrapped separations (r = x_i − x_j − mH, as js/crystal.js but i − j)
    const P = []; let far = 0;
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
      const r0 = x[i].map((v, k) => v - x[j][k]), same = mol[i] === mol[j]; let m = new Array(d).fill(0);
      if (!same) { const f = r0.map((_, cc) => r0.reduce((s, v, k) => s + v * Hi[k][cc], 0)); m = f.map(Math.round); for (let cc = 0; cc < d; cc++) for (let k = 0; k < d; k++) r0[cc] -= m[k] * H[k][cc]; }
      far = Math.max(far, Math.hypot(...r0)); P.push({ i, j, r0, m, same });
    }
    const reach = rc + far, bound = H.map((_, i) => Math.ceil(reach * Math.hypot(...Hi.map((r) => r[i])))); if (bound.reduce((s, b) => s * (2 * b + 1), 1) > 3e6) return null;
    const T = []; { const m = bound.map((b) => -b); for (;;) { const t = H[0].map((_, cc) => m.reduce((s, v, i) => s + v * H[i][cc], 0)); if (Math.hypot(...t) < reach) T.push({ t, nt: m.slice(), zero: m.every((v) => !v) }); let i = 0; while (i < d && m[i] === bound[i]) { m[i] = -bound[i]; i++; } if (i === d) break; m[i]++; } }
    // the polarization system: fields E (n × d) and coupling Tm ((n d)²), and the energies
    const E = new Float64Array(n * d), Tm = Array.from({ length: n * d }, () => new Float64Array(n * d)); let Eqq = 0, Eqc = 0, Ecc = 0, Erep = 0;
    const addT = (i, j, rv, r2, B1, B2, w) => { for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) { const v = w * (B2 * rv[a] * rv[b] - (a === b ? B1 : 0)); Tm[i * d + a][j * d + b] += v; if (i !== j) Tm[j * d + b][i * d + a] += v; } };
    const rv = new Float64Array(d), hits = []; // with grad, each pair-image's kernels and their slopes, for after the dipoles are known
    for (const { i, j, r0, m, same } of P) {
      const si = sk(i), sj = sk(j), self = i === j, w = self ? 0.5 : 1, kp = this.key(this.ty[si], this.ty[sj]), rep = terms.pairs[kp], B = rep.tt[1] * (terms.cdamp ?? 1);
      for (const { t, nt, zero } of T) {
        let r2 = 0; for (let k = 0; k < d; k++) { rv[k] = r0[k] + t[k]; r2 += rv[k] * rv[k]; }
        if (r2 >= rc2 || r2 < 1e-12) continue;
        const r = Math.sqrt(r2), S = step(r, r1, rc), own = same && zero, other = !own, inter = other, ea = Math.exp(-a2 * r2), ec = erfc(alpha * r);
        // p = 1 slopes: B1 = −g′/r, B2 = −(1/r) dB1/dr, for g = erfc(αr)/r
        const B1 = (ec / r + SP * alpha * ea) / r2, B2 = (3 * B1 + SP * 2 * alpha * a2 * ea) / r2;
        // with grad: h collects the slopes in r of what this pair-image adds (dE: of its plain energies; fq, fc: the charges'
        // and clouds' field factors; b1, b2: the dipoles' coupling)
        let h = null, dS = 0; if (grad) { h = { i, j, self, rv: Float64Array.from(rv), dn: nt.map((v, k) => v - m[k]), dE: 0, fq: 0, dfq: 0, fc: 0, dfc: 0, b1: 0, db1: 0, b2: 0, db2: 0, sd: 0 }; if (r > r1 && r < rc) { const u = (r - r1) / (rc - r1); dS = (-30 * u * u * (1 - u) * (1 - u)) / (rc - r1); } }
        if (other) {
          Eqq += (w * S * q[si] * q[sj] * ec) / r;
          if (inter) { const sp = shortPair(rep, r2); Erep += w * sp[0]; if (h) h.dE += w * (q[si] * q[sj] * (dS * ec / r - S * r * B1) - sp[1] * r); }
          // charge fields on the dipoles (damped as Thole damps them between molecules)
          const l3 = inter ? thole(r, al[si], al[sj], this.inter)[0] : 1;
          const fq = S * B1 + (inter ? (l3 - 1) / (r2 * r) : 0);
          if (h) { const [, , dl3] = tholeJet(r, al[si], al[sj], this.inter); h.fq = fq; h.dfq = dS * B1 - S * r * B2 + dl3 / (r2 * r) - (3 * (l3 - 1)) / (r2 * r2); }
          for (let k = 0; k < d; k++) { E[i * d + k] += q[sj] * fq * rv[k]; if (!self) E[j * d + k] -= q[si] * fq * rv[k]; }
          if (this.hasClouds) {
            const z = a2 * r2, Q3 = Qgamma(1.5, z), g3 = Q3 / (r2 * r), D1 = (3 * Q3) / (r2 * r2 * r) + (2 * a2 * Math.sqrt(z) * Math.exp(-z)) / (gammaHalf(1.5) * r2 * r);
            const [f3, gg3] = inter ? ttf(3, B * r) : [1, 0], [f5, gg5] = inter ? ttf(5, B * r) : [1, 0];
            Eqc += w * (S * g3 + (inter ? (f3 - 1) / (r2 * r) : 0)) * (q[si] * c[sj] + c[si] * q[sj]);
            Ecc += (w * S * (-3 * f5 * c[si] * c[sj])) / (r2 * r2 * r);
            const fcl = S * D1 + (inter ? ((3 * f3) / (r2 * r2 * r) - (B * gg3) / (r2 * r2) - 3 / (r2 * r2 * r)) : 0);
            for (let k = 0; k < d; k++) { E[i * d + k] += c[sj] * fcl * rv[k]; if (!self) E[j * d + k] -= c[si] * fcl * rv[k]; }
            if (h) {
              const D2 = (5 * D1 + (8 * a2 * a2 * alpha * Math.exp(-z)) / Math.sqrt(Math.PI)) / r2, x = B * r, gg2 = x ? (3 * gg3) / x : 0, r4 = r2 * r2, r5 = r4 * r, r6 = r4 * r2;
              h.dE += w * (q[si] * c[sj] + c[si] * q[sj]) * (dS * g3 - S * r * D1 + (B * gg3) / (r2 * r) - (3 * (f3 - 1)) / r4) - 3 * w * c[si] * c[sj] * ((dS * f5 + S * B * gg5) / r5 - (5 * S * f5) / r6);
              h.fc = fcl; h.dfc = dS * D1 - S * r * D2 + (7 * B * gg3) / r5 - (15 * (f3 - 1)) / r6 - (B * B * (gg2 - gg3)) / r4;
            }
          }
        }
        // the dipoles' coupling: every pair but a site with itself, damped (Thole) within a molecule by its own a, between by THOLE
        if (!(self && zero)) {
          let b1 = S * B1, b2 = S * B2; const [l3, l5, dl3, dl5] = tholeJet(r, al[si], al[sj], own ? terms.pol.thole : this.inter);
          b1 += (l3 - 1) / (r2 * r); b2 += (3 * (l5 - 1)) / (r2 * r2 * r);
          if (h) { const B3 = (5 * B2 + SP * 4 * alpha * a2 * a2 * ea) / r2, r4 = r2 * r2; Object.assign(h, { b1, b2, sd: self ? 0.5 : 1, db1: dS * B1 - S * r * B2 + dl3 / (r2 * r) - (3 * (l3 - 1)) / r4, db2: dS * B2 - S * r * B3 + (3 * dl5) / (r4 * r) - (15 * (l5 - 1)) / (r4 * r2) }); }
          addT(i, j, rv, r2, b1, b2, 1); // a site and its own images: every image t is in the list, ±t both
        }
        if (h) hits.push(h);
      }
    }
    // the smooth parts, over half the reciprocal vectors
    const cs = new Float64Array(n), sn = new Float64Array(n);
    const done = this.eachK(H, Hi, (kv, k) => {
      const w1 = (2 * this.ft(1, k)) / V, w3 = this.hasClouds ? (2 * this.ft(3, k)) / V : 0; let Sr = 0, Si = 0, Cr = 0, Ci = 0;
      for (let i = 0; i < n; i++) { let ph = 0; for (let a = 0; a < d; a++) ph += kv[a] * x[i][a]; cs[i] = Math.cos(ph); sn[i] = Math.sin(ph); Sr += q[sk(i)] * cs[i]; Si += q[sk(i)] * sn[i]; Cr += c[sk(i)] * cs[i]; Ci += c[sk(i)] * sn[i]; }
      Eqq += 0.5 * w1 * (Sr * Sr + Si * Si); Eqc += w3 * (Sr * Cr + Si * Ci);
      for (let i = 0; i < n; i++) {
        // field at i: Σ_j src_j sin(k·(x_i − x_j)) k, = k (sin_i S_cos − cos_i S_sin)
        const fi = w1 * (sn[i] * Sr - cs[i] * Si) + w3 * (sn[i] * Cr - cs[i] * Ci);
        for (let a = 0; a < d; a++) E[i * d + a] += fi * kv[a];
        // dipole coupling: −w1 cos(k·(x_i − x_j)) k kᵀ
        for (let j = 0; j < n; j++) { const cij = -w1 * (cs[i] * cs[j] + sn[i] * sn[j]); for (let a = 0; a < d; a++) for (let b = 0; b < d; b++) Tm[i * d + a][j * d + b] += cij * kv[a] * kv[b]; }
      }
    });
    if (!done) return null;
    // take out what the smooth sums put in within a molecule: its charges' and clouds' fields on its own sites, and each
    // dipole's smooth field on itself (+4α³/3√π)
    const self3 = (4 * alpha ** 3) / (3 * Math.sqrt(Math.PI));
    for (let i = 0; i < n; i++) {
      for (let a = 0; a < d; a++) Tm[i * d + a][i * d + a] += self3;
      for (let j = 0; j < n; j++) {
        if (i === j || mol[i] !== mol[j]) continue;
        const r = x[i].map((v, k) => v - x[j][k]), r2 = r.reduce((s, v) => s + v * v, 0), rr = Math.sqrt(r2), ea = Math.exp(-a2 * r2);
        const B1s = 1 / (r2 * rr) - (erfc(alpha * rr) / rr + SP * alpha * ea) / r2; // the smooth part of the p = 1 field factor
        let D1s = 0; if (this.hasClouds) { const z = a2 * r2, Q3 = Qgamma(1.5, z); D1s = 3 / (r2 * r2 * rr) - ((3 * Q3) / (r2 * r2 * rr) + (2 * a2 * Math.sqrt(z) * Math.exp(-z)) / (gammaHalf(1.5) * r2 * rr)); }
        for (let a = 0; a < d; a++) E[i * d + a] -= (q[sk(j)] * B1s + c[sk(j)] * D1s) * r[a];
      }
    }
    // the dipoles: (α⁻¹ − T) μ = E
    const M = Tm.map((row, I) => Array.from(row, (v, J) => (I === J ? 1 / al[sk((I / d) | 0)] : 0) - v)), b = Array.from(E);
    const mu = solveDense(M, b); let Epol = 0; for (let k = 0; k < E.length; k++) Epol -= 0.5 * mu[k] * E[k];
    const Etail = (this.Jcc * Z * Z) / V;
    const tot = Eqq + Eqc + Ecc + Erep + Epol + Etail;
    const out = { E: tot / Z + this.Eintra, Eqq: Eqq / Z + this.Eintra, Eqc: Eqc / Z, Ecc: (Ecc + Etail) / Z, Erep: Erep / Z, Epol: Epol / Z, V: V / Z, mu };
    if (grad) Object.assign(out, this.slopes(H, Hi, V, Z, x, mol, hits, mu, Etail));
    return out;
  }
  /* the slopes at fixed dipoles mu: the real-space pair-images (hits), the smooth parts, the corrections within a
     molecule, the continuum's tail; per molecule */
  slopes(H, Hi, V, Z, x, mol, hits, mu, Etail) {
    const { d, ns, q, c, alpha } = this, n = x.length, a2 = alpha * alpha, sk = (i) => i % ns, gx = new Float64Array(n * d), gH = H.map(() => new Float64Array(d)), v = new Float64Array(d);
    const add = (i, j, dn) => { for (let a = 0; a < d; a++) { gx[i * d + a] += v[a]; gx[j * d + a] -= v[a]; if (dn) for (let b = 0; b < d; b++) gH[b][a] += v[a] * dn[b]; } };
    for (const h of hits) {
      // e = e(r) − fq u_q·r − fc u_c·r − sd (b2 (μ_i·r)(μ_j·r) − b1 μ_i·μ_j), u = (src_j μ_i − src_i μ_j)
      const { i, j, self, rv } = h, r = Math.hypot(...rv), qi = self ? 0 : q[sk(i)], ci = self ? 0 : c[sk(i)];
      let uq = 0, uc = 0, ai = 0, aj = 0, ij = 0;
      for (let a = 0; a < d; a++) { const mi = mu[i * d + a], mj = mu[j * d + a]; uq += (q[sk(j)] * mi - qi * mj) * rv[a]; uc += (c[sk(j)] * mi - ci * mj) * rv[a]; ai += mi * rv[a]; aj += mj * rv[a]; ij += mi * mj; }
      const rad = (h.dE - h.dfq * uq - h.dfc * uc - h.sd * (h.db2 * ai * aj - h.db1 * ij)) / r;
      for (let a = 0; a < d; a++) { const mi = mu[i * d + a], mj = mu[j * d + a]; v[a] = rad * rv[a] - h.fq * (q[sk(j)] * mi - qi * mj) - h.fc * (c[sk(j)] * mi - ci * mj) - h.sd * h.b2 * (mi * aj + mj * ai); }
      add(i, j, h.dn);
    }
    // the smooth parts: ½w₁|S|² + w₃ Re S C*, S = Σ (q + i k·μ) e^(ik·x), C = Σ c e^(ik·x)
    const cs = new Float64Array(n), sn = new Float64Array(n), Bk = new Float64Array(n), gk = new Float64Array(d);
    this.eachK(H, Hi, (kv, k) => {
      const w1 = (2 * this.ft(1, k)) / V, w3 = this.hasClouds ? (2 * this.ft(3, k)) / V : 0; let Sr = 0, Si = 0, Cr = 0, Ci = 0;
      for (let i = 0; i < n; i++) { let ph = 0, b = 0; for (let a = 0; a < d; a++) { ph += kv[a] * x[i][a]; b += kv[a] * mu[i * d + a]; } cs[i] = Math.cos(ph); sn[i] = Math.sin(ph); Bk[i] = b; const A = q[sk(i)]; Sr += A * cs[i] - b * sn[i]; Si += A * sn[i] + b * cs[i]; Cr += c[sk(i)] * cs[i]; Ci += c[sk(i)] * sn[i]; }
      const PSr = w1 * Sr + w3 * Cr, PSi = w1 * Si + w3 * Ci, Ek = 0.5 * w1 * (Sr * Sr + Si * Si) + w3 * (Sr * Cr + Si * Ci);
      const dw = ((2 * this.dft(1, k)) / V) * 0.5 * (Sr * Sr + Si * Si) + (this.hasClouds ? ((2 * this.dft(3, k)) / V) * (Sr * Cr + Si * Ci) : 0);
      for (let a = 0; a < d; a++) gk[a] = (dw * kv[a]) / k;
      for (let i = 0; i < n; i++) {
        const A = q[sk(i)], g = c[sk(i)], ph = PSr * (-A * sn[i] - Bk[i] * cs[i]) + PSi * (A * cs[i] - Bk[i] * sn[i]) + w3 * g * (Si * cs[i] - Sr * sn[i]), dm = -PSr * sn[i] + PSi * cs[i];
        for (let a = 0; a < d; a++) { gx[i * d + a] += ph * kv[a]; gk[a] += ph * x[i][a] + dm * mu[i * d + a]; }
      }
      for (let b = 0; b < d; b++) for (let cc = 0; cc < d; cc++) { let s = 0; for (let a = 0; a < d; a++) s += gk[a] * Hi[a][b]; gH[b][cc] -= s * kv[cc] + Ek * Hi[cc][b]; }
    });
    // within a molecule, the smooth fields taken out: e = μ_i·r (q_j B1s + c_j D1s), r = x_i − x_j, unswitched
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      if (i === j || mol[i] !== mol[j]) continue;
      const r = x[i].map((u, k) => u - x[j][k]), r2 = r.reduce((s, u) => s + u * u, 0), rr = Math.sqrt(r2), ea = Math.exp(-a2 * r2), B1 = (erfc(alpha * rr) / rr + SP * alpha * ea) / r2, B2 = (3 * B1 + SP * 2 * alpha * a2 * ea) / r2;
      let hh = q[sk(j)] * (1 / (r2 * rr) - B1), dh = q[sk(j)] * (-3 / (r2 * r2) + rr * B2);
      if (this.hasClouds) { const z = a2 * r2, D0 = Qgamma(1.5, z) / (r2 * rr), D1 = (3 * D0 + (4 * a2 * alpha * ea) / Math.sqrt(Math.PI)) / r2, D2 = (5 * D1 + (8 * a2 * a2 * alpha * ea) / Math.sqrt(Math.PI)) / r2; hh += c[sk(j)] * (3 / (r2 * r2 * rr) - D1); dh += c[sk(j)] * (-15 / (r2 * r2 * r2) + rr * D2); }
      let ai = 0; for (let a = 0; a < d; a++) ai += mu[i * d + a] * r[a];
      for (let a = 0; a < d; a++) v[a] = (dh / rr) * ai * r[a] + hh * mu[i * d + a];
      add(i, j, null);
    }
    for (let b = 0; b < d; b++) for (let cc = 0; cc < d; cc++) gH[b][cc] = (gH[b][cc] - Etail * Hi[cc][b]) / Z;
    for (let k = 0; k < gx.length; k++) gx[k] /= Z;
    return { gx, gH };
  }
}
function solveDense(M, b) {
  const n = b.length, A = M.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[p], A[c]] = [A[c], A[p]]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; if (f) for (let k = c; k <= n; k++) A[r][k] -= f * A[c][k]; } }
  const x = new Array(n); for (let r = n - 1; r >= 0; r--) { let s = A[r][n]; for (let k = r + 1; k < n; k++) s -= A[r][k] * x[k]; x[r] = s / A[r][r]; } return x;
}
