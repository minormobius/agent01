/* ATOM⁴'s molecular crystals, no DOM, in any number of dimensions: rigid molecules in a periodic cell of any shape,
   their lattice energy, and the descent that relaxes molecules and cell together. What tools/ice.mjs searches with.

   The cell is d lattice vectors, the rows of H (kept lower-triangular, which fixes the crystal's own turn: d(d + 1)/2
   numbers). Each molecule is the force field's template (js/ffmodel.js: charges on the nuclei, Tang–Toennies pairs
   between sites), turned and placed at fractional coordinates s, so its heavy atom sits at sH.

   The energy per molecule, relative to free molecules, has three parts.
   · The charges, by Ewald's split of 1/r itself (js/md.js has the why, for any d), in a cell of any shape: the
     reciprocal vectors are k = 2πH⁻¹n, the real-space part runs over every image within rc, and each charge's meeting
     with itself and every meeting within a molecule are taken out. Tin-foil boundary: a polar crystal has no
     depolarizing field.
   · The short-range pairs between sites of different molecules (and a site and its own images), out to rc.
   · Past rc, the continuum: the pairs' tails as if the crystal were smooth there, ρ ∫ u S_d r^(d−1) dr.
   Every real-space term is switched off smoothly over the last `width` before rc (a quintic step), and the continuum
   starts where the switch does, so the energy has no jumps for the descent to trip on and the cut costs only the
   continuum's error. The site charges are those of a neutral molecule, so the box is neutral.

   One guard: the model's repulsions are finite at r = 0 while the charges' attraction isn't, so a hydrogen pushed into
   another molecule's heavy atom would fall in for ever. Opposite charges on different molecules also meet a hard core,
   0.01 (1.5/r)¹² hartree: under 10⁻⁶ of an H-bond's energy at any distance the crystal uses, a wall at 1 bohr. */
import { erfc, Qgamma, kernelConst, shortPair, sphereArea } from "./md.js";
import { planes, expm, bfgsSteps } from "./landscape.js";

const SP = 2 / Math.sqrt(Math.PI), CORE = [0.01, 1.5];
/* small dense linear algebra on row-major arrays of rows */
export function inv(M) { const n = M.length, A = M.map((r, i) => [...r, ...Array.from({ length: n }, (_, j) => +(i === j))]); for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; [A[c], A[p]] = [A[p], A[c]]; const v = A[c][c]; A[c] = A[c].map((x) => x / v); for (let r = 0; r < n; r++) if (r !== c) { const f = A[r][c]; A[r] = A[r].map((x, k) => x - f * A[c][k]); } } return A.map((r) => r.slice(n)); }
export function det(M) { const n = M.length, A = M.map((r) => r.slice()); let D = 1; for (let c = 0; c < n; c++) { let p = c; for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r; if (!A[p][c]) return 0; if (p !== c) { [A[c], A[p]] = [A[p], A[c]]; D = -D; } D *= A[c][c]; for (let r = c + 1; r < n; r++) { const f = A[r][c] / A[c][c]; for (let k = c; k < n; k++) A[r][k] -= f * A[c][k]; } } return D; }
const dot = (a, b) => a.reduce((s, v, i) => s + v * b[i], 0);
/* the switch: 1 below r1, 0 past rc, a quintic step between (value and two slopes continuous) */
const step = (r, r1, rc) => { if (r <= r1) return 1; if (r >= rc) return 0; const t = (r - r1) / (rc - r1); return 1 - t * t * t * (10 - 15 * t + 6 * t * t); };

/* a lattice's vectors, LLL-reduced (rows; δ = 3/4) together with the unimodular U that did it (reduced = U·H) */
export function reduce(H) {
  const d = H.length; let B = H.map((r) => r.slice()), U = H.map((_, i) => H.map((_, j) => +(i === j)));
  const gs = () => { const S = [], mu = B.map(() => new Array(d).fill(0)); B.forEach((b, i) => { let v = b.slice(); for (let j = 0; j < i; j++) { mu[i][j] = dot(b, S[j]) / dot(S[j], S[j]); v = v.map((x, k) => x - mu[i][j] * S[j][k]); } S.push(v); }); return { S, mu }; };
  let k = 1, guard = 0;
  while (k < d && guard++ < 10000) {
    for (let j = k - 1; j >= 0; j--) { const { mu } = gs(), m = Math.round(mu[k][j]); if (m) { B[k] = B[k].map((x, c) => x - m * B[j][c]); U[k] = U[k].map((x, c) => x - m * U[j][c]); } }
    const { S, mu } = gs();
    if (dot(S[k], S[k]) >= (0.75 - mu[k][k - 1] ** 2) * dot(S[k - 1], S[k - 1])) k++;
    else { [B[k], B[k - 1]] = [B[k - 1], B[k]]; [U[k], U[k - 1]] = [U[k - 1], U[k]]; k = Math.max(k - 1, 1); }
  }
  return { B, U };
}
/* H = L·Q with L lower-triangular (positive diagonal) and Q orthogonal: Gram–Schmidt on the rows */
export function lq(H) {
  const d = H.length, Q = [], L = H.map(() => new Array(d).fill(0));
  H.forEach((h, i) => { let v = h.slice(); for (let j = 0; j < i; j++) { L[i][j] = dot(h, Q[j]); v = v.map((x, k) => x - L[i][j] * Q[j][k]); } L[i][i] = Math.hypot(...v); Q.push(v.map((x) => x / L[i][i])); });
  return { L, Q };
}

/* a crystal of one rigid molecule. tmpl: site positions (heavy atom first, at the origin); q, types: per site; pairs:
   { "t1|t2": term } as js/md.js's shortPair takes; rc the cut, width the switch */
export class Crystal {
  constructor({ d, tmpl, q, types, pairs, rc, width = 2 }) {
    Object.assign(this, { d, tmpl, q, types, rc, width, r1: rc - width });
    this.alpha = 4 / this.r1; // erfc(4) ≈ 2·10⁻⁸: the real-space charges are gone before the switch starts
    this.K = kernelConst(d); this.kmax = 2 * this.alpha * Math.sqrt(22); // Q at k²/4α² = 22 is below 10⁻⁹
    this.gammaNu = this.K / (4 * Math.PI) ** ((d - 1) / 2); // Γ((d − 1)/2), for Q's slope
    const ty = [...new Set(types)], key = (a, b) => (pairs[`${a}|${b}`] ? `${a}|${b}` : `${b}|${a}`);
    this.pair = types.map((a) => types.map((b) => pairs[key(a, b)] || null));
    // the continuum past the switch, per site pair: J = ∫ u (1 − S) S_d r^(d−1) dr, out to 40 rc and analytically on
    // (a TT pair is −C/r⁶ out there)
    const Sd = sphereArea(d), J = {}, R = 40 * rc;
    for (const a of ty) for (const b of ty) {
      const p = pairs[key(a, b)]; if (!p || J[key(a, b)] !== undefined) continue;
      let I = 0; const n = 40000, lo = Math.log(this.r1), hi = Math.log(R), h = (hi - lo) / n;
      for (let k = 0; k <= n; k++) { const r = Math.exp(lo + k * h), w = k === 0 || k === n ? 0.5 : 1; I += w * shortPair(p, r * r)[0] * (1 - step(r, this.r1, rc)) * Sd * r ** d; }
      J[key(a, b)] = I * h - (p.tt ? p.tt[2] : 0) * Sd * R ** (d - 6) / (6 - d);
    }
    this.J = 0; types.forEach((a) => types.forEach((b) => { if (pairs[key(a, b)]) this.J += 0.5 * J[key(a, b)]; })); // per molecule pair-of-sites sum, halved: × Z²/V
    // within a molecule: the excluded smooth parts and the self terms, a constant for a rigid molecule
    this.Eintra = 0; const ns = tmpl.length;
    for (let i = 0; i < ns; i++) { this.Eintra -= 0.5 * q[i] * q[i] * SP * this.alpha; for (let j = i + 1; j < ns; j++) { const r = Math.hypot(...tmpl[i].map((x, k) => x - tmpl[j][k])); this.Eintra -= (q[i] * q[j] * (1 - erfc(this.alpha * r))) / r; } }
  }
  /* energy per molecule (hartree) for cell rows H and molecules as lists of site positions; null if the cell is too
     skewed to sum (tidy it first). With grad, also its slopes: gx (per site, flat) at fixed cell, and gH (d × d) at
     fixed sites, both per molecule */
  energy(H, mols, grad = false) {
    const { d, q, rc, r1, alpha } = this, Z = mols.length, ns = this.tmpl.length, n = Z * ns, V = Math.abs(det(H)), Hi = inv(H), rc2 = rc * rc;
    const x = new Float64Array(n * d); mols.forEach((m, a) => m.forEach((p, k) => p.forEach((v, c) => (x[(a * ns + k) * d + c] = v))));
    const gx = grad ? new Float64Array(n * d) : null, gH = grad ? H.map(() => new Float64Array(d)) : null;
    // each pair's separation wrapped to the nearest cell (r = x_j − x_i − mH); a molecule's own pairs keep their true
    // separation (m = 0), so image 0 is the molecule itself
    const P = []; let far = 0;
    for (let i = 0; i < n; i++) for (let j = i; j < n; j++) {
      const r0 = new Float64Array(d), m = new Float64Array(d), same = ((i / ns) | 0) === ((j / ns) | 0);
      for (let c = 0; c < d; c++) r0[c] = x[j * d + c] - x[i * d + c];
      if (!same) { for (let c = 0; c < d; c++) { let s = 0; for (let k = 0; k < d; k++) s += r0[k] * Hi[k][c]; m[c] = Math.round(s); } for (let c = 0; c < d; c++) for (let k = 0; k < d; k++) r0[c] -= m[k] * H[k][c]; }
      far = Math.max(far, Math.hypot(...r0)); P.push({ i, j, r0, m, same });
    }
    // the lattice translations that can bring a pair within rc
    const reach = rc + far, bound = H.map((_, i) => Math.ceil(reach * Math.hypot(...Hi.map((r) => r[i])))); if (bound.reduce((s, b) => s * (2 * b + 1), 1) > 4e5) return null;
    const T = []; { const m = bound.map((b) => -b); for (;;) { const t = H[0].map((_, c) => m.reduce((s, v, i) => s + v * H[i][c], 0)); if (Math.hypot(...t) < reach) T.push({ t, n: m.slice(), zero: m.every((v) => !v) }); let i = 0; while (i < d && m[i] === bound[i]) { m[i] = -bound[i]; i++; } if (i === d) break; m[i]++; } }
    let Er = 0, Es = 0; const rv = new Float64Array(d), sw = 1 / (rc - r1);
    for (const { i, j, r0, m, same } of P) {
      const si = i % ns, sj = j % ns, qq = q[si] * q[sj], p = this.pair[si][sj], w = i === j ? 0.5 : 1;
      for (const { t, n: nt, zero } of T) {
        let r2 = 0; for (let c = 0; c < d; c++) { rv[c] = r0[c] + t[c]; r2 += rv[c] * rv[c]; }
        if (r2 >= rc2 || r2 < 1e-12 || (same && zero)) continue; // a site meeting itself, or a molecule's own pair
        const r = Math.sqrt(r2), S = step(r, r1, rc); let ec = 0, u = 0, de = 0, core = 0, dcore = 0; // e: the switched part, de its slope
        if (qq) { const erfcr = erfc(alpha * r); ec = (qq * erfcr) / r; de -= qq * (erfcr / r2 + (SP * alpha * Math.exp(-alpha * alpha * r2)) / r); if (qq < 0) { core = CORE[0] * (CORE[1] / r) ** 12; dcore = (-12 * core) / r; } }
        if (p) { const [v, fu] = shortPair(p, r2); u = v; de -= fu * r; }
        Er += w * S * ec; Es += w * (S * u + core); const e = ec + u;
        if (!grad) continue;
        let dS = 0; if (r > r1) { const u = (r - r1) * sw; dS = -30 * u * u * (1 - u) * (1 - u) * sw; }
        const g = (w * (dS * e + S * de + dcore)) / r;
        for (let c = 0; c < d; c++) { const f = g * rv[c]; gx[j * d + c] += f; gx[i * d + c] -= f; for (let b = 0; b < d; b++) gH[b][c] += f * (nt[b] - m[b]); }
      }
    }
    // reciprocal space, over half the k vectors (k = 2πH⁻¹n)
    let Ek = 0; const nb = H.map((h) => Math.ceil((Math.hypot(...h) * this.kmax) / (2 * Math.PI))); if (nb.reduce((t, b) => t * (2 * b + 1), 1) > 4e5) return null; const kv = new Float64Array(d), nu = (d - 1) / 2, a4 = 1 / (4 * alpha * alpha);
    const cs = new Float64Array(n), sn = new Float64Array(n), gk = new Float64Array(d);
    { const m = nb.map((b) => -b); for (;;) {
      if (m.find((v) => v !== 0) > 0) {
        for (let a = 0; a < d; a++) { let s = 0; for (let b = 0; b < d; b++) s += Hi[a][b] * m[b]; kv[a] = 2 * Math.PI * s; }
        let k2 = 0; for (let a = 0; a < d; a++) k2 += kv[a] * kv[a];
        if (k2 <= this.kmax * this.kmax) {
          const z = k2 * a4, Q = Qgamma(nu, z), kp = Math.pow(k2, nu), wk = (this.K * Q) / kp / V; let Sr = 0, Si = 0;
          for (let i = 0; i < n; i++) { const qi = q[i % ns]; if (!qi) continue; let ph = 0; for (let a = 0; a < d; a++) ph += kv[a] * x[i * d + a]; cs[i] = Math.cos(ph); sn[i] = Math.sin(ph); Sr += qi * cs[i]; Si += qi * sn[i]; }
          const S2 = Sr * Sr + Si * Si, ek = wk * S2; Ek += ek;
          if (grad) {
            // through the phases: ∂E/∂φ_i = 2w q_i (Si cos φ_i − Sr sin φ_i); through k's size: w′(k)/k · k_a |S|²
            const dwdk_k = ((this.K / V) * ((1 - d) * Q / (kp * k2) - (2 * a4 * Math.pow(z, nu - 1) * Math.exp(-z)) / this.gammaNu / kp)); // (dw/dk)/k
            gk.fill(0); for (let a = 0; a < d; a++) gk[a] = dwdk_k * kv[a] * S2;
            for (let i = 0; i < n; i++) { const qi = q[i % ns]; if (!qi) continue; const dphi = 2 * wk * qi * (Si * cs[i] - Sr * sn[i]); for (let a = 0; a < d; a++) { gx[i * d + a] += dphi * kv[a]; gk[a] += dphi * x[i * d + a]; } }
            // k_a depends on H: ∂k_a/∂H_bc = −(H⁻¹)_ab k_c; and w ∝ 1/V: ∂E/∂H_bc = −E (H⁻¹)_cb
            for (let b = 0; b < d; b++) for (let c = 0; c < d; c++) { let s = 0; for (let a = 0; a < d; a++) s += gk[a] * Hi[a][b]; gH[b][c] -= s * kv[c] + ek * Hi[c][b]; }
          }
        }
      }
      let i = 0; while (i < d && m[i] === nb[i]) { m[i] = -nb[i]; i++; } if (i === d) break; m[i]++;
    } }
    const Etail = (this.J * Z * Z) / V;
    const out = { E: (Er + Ek + Es + Etail) / Z + this.Eintra, Ecoul: (Er + Ek) / Z + this.Eintra, Eshort: Es / Z, Etail: Etail / Z, V: V / Z };
    if (grad) { for (let b = 0; b < d; b++) for (let c = 0; c < d; c++) gH[b][c] = (gH[b][c] - Etail * Hi[c][b]) / Z; for (let k = 0; k < gx.length; k++) gx[k] /= Z; out.gx = gx; out.gH = gH; }
    return out;
  }
}

/* A state: { H (rows), mols: [{ R0, s }] } (R0 the molecule's turn, s its heavy atom's fractional place). Its sites: */
export const sitesOf = (C, st) => st.mols.map(({ R0, s }) => { const c = H0(st.H, s); return C.tmpl.map((p) => c.map((v, i) => v + dot(R0[i], p))); });
const H0 = (H, s) => H[0].map((_, c) => s.reduce((t, v, i) => t + v * H[i][c], 0));
const SC = 10; // fractional coordinates enter the descent ×10, so a unit step moves a molecule about a bohr
/* the numbers the descent moves: the cell's lower triangle, then each molecule's turn (one per plane) and, after the
   first (which pins the origin), its place */
function pack(st, d) { const x = []; for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) x.push(st.H[i][j]); const np = planes(d).length; st.mols.forEach((m, a) => { x.push(...new Array(np).fill(0)); if (a) x.push(...m.s.map((v) => v * SC)); }); return x; }
const turnOf = (w, d) => { const W = new Array(d * d).fill(0); planes(d).forEach(([p, r], i) => { W[p * d + r] = w[i]; W[r * d + p] = -w[i]; }); return expm(W, d); };
const mulR = (M, R0, d) => Array.from({ length: d }, (_, r) => Array.from({ length: d }, (_, c) => R0.reduce((t, row, l) => t + M[r * d + l] * row[c], 0)));
function unpack(st, x, d) {
  const H = st.H.map((r) => r.map(() => 0)); let k = 0; for (let i = 0; i < d; i++) for (let j = 0; j <= i; j++) H[i][j] = x[k++];
  const np = planes(d).length, mols = st.mols.map((m, a) => {
    const w = x.slice(k, k + np); k += np; const s = a ? x.slice(k, k + d).map((v) => v / SC) : m.s; if (a) k += d;
    return { R0: mulR(turnOf(w, d), m.R0, d), s, w, base: m.R0 };
  });
  return { H, mols };
}
/* the energy and its slope in the descent's numbers: sites move with the cell (c = sH), with their place, and with
   their turn (whose slope is taken through exp numerically: cheap, d × d) */
function energyAndSlope(C, st, x) {
  if (C.numericSlopes) { // a model without analytic slopes (js/polcrystal.js): central differences in the descent's own numbers
    const f = (y) => { const s = unpack(st, y, C.d), e = C.energy(s.H, sitesOf(C, s)); return e ? e.E : 1e3; }, f0 = f(x);
    return { f: f0, g: x.map((_, k) => { const h = 1e-5, a = x.slice(), b = x.slice(); a[k] += h; b[k] -= h; return (f(a) - f(b)) / (2 * h); }) };
  }
  const d = C.d, s = unpack(st, x, d), e = C.energy(s.H, sitesOf(C, s), true); if (!e) return { f: 1e3, g: x.map(() => 0) };
  const ns = C.tmpl.length, np = planes(d).length, g = [], F = s.mols.map((_, a) => { const f = new Array(d).fill(0); for (let k = 0; k < ns; k++) for (let c = 0; c < d; c++) f[c] += e.gx[(a * ns + k) * d + c]; return f; });
  for (let b = 0; b < d; b++) for (let c = 0; c <= b; c++) g.push(e.gH[b][c] + s.mols.reduce((t, m, a) => t + m.s[b] * F[a][c], 0));
  s.mols.forEach((m, a) => {
    for (let j = 0; j < np; j++) {
      const h = 1e-6, wp = m.w.slice(), wm = m.w.slice(); wp[j] += h; wm[j] -= h; const Rp = mulR(turnOf(wp, d), m.base, d), Rm = mulR(turnOf(wm, d), m.base, d);
      let t = 0; C.tmpl.forEach((p, k) => { for (let c = 0; c < d; c++) t += (e.gx[(a * ns + k) * d + c] * (dot(Rp[c], p) - dot(Rm[c], p))) / (2 * h); }); g.push(t);
    }
    if (a) for (let b = 0; b < d; b++) g.push(s.H[b].reduce((t, v, c) => t + v * F[a][c], 0) / SC);
  });
  return { f: e.E, g };
}
/* a state made tidy: the cell LLL-reduced and turned back to lower-triangular (everything turned with it), each
   molecule's place wrapped into the cell */
export function tidy(st) {
  const { B, U } = reduce(st.H), { L, Q } = lq(B), Ui = inv(U);
  return { H: L, mols: st.mols.map(({ R0, s }) => ({ R0: Q.map((qr) => R0[0].map((_, c) => qr.reduce((t, v, l) => t + v * R0[l][c], 0))), s: s.map((_, c) => { const v = s.reduce((t, u, i) => t + u * Ui[i][c], 0); return v - Math.floor(v); }) })) };
}
/* BFGS as js/landscape.js runs it (backtracking, restarts on a failed line search, done when |g| < gtol), with the
   slope given */
function* bfgsG(fg, x0, iters, gtol) {
  const n = x0.length; let x = x0.slice(), { f: fx, g: gx } = fg(x), fresh = true, H = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => +(i === j)));
  yield { x, f: fx, g: Math.hypot(...gx) };
  for (let it = 0; it < iters; it++) {
    const p = H.map((row) => -row.reduce((s, v, j) => s + v * gx[j], 0)), slope = p.reduce((s, v, i) => s + v * gx[i], 0); let a = 1, xn, r;
    if (slope >= 0) { H = H.map((row, i) => row.map((_, j) => +(i === j))); continue; }
    for (;;) { xn = x.map((v, i) => v + a * p[i]); r = fg(xn); if (r.f <= fx + 1e-4 * a * slope || a < 1e-8) break; a /= 2; }
    if (r.f > fx + 1e-4 * a * slope) { if (fresh) break; H = H.map((row, i) => row.map((_, j) => +(i === j))); fresh = true; continue; }
    const s = xn.map((v, i) => v - x[i]), y = r.g.map((v, i) => v - gx[i]), sy = s.reduce((t, v, i) => t + v * y[i], 0);
    if (sy > 1e-12) { const Hy = H.map((row) => row.reduce((t, v, j) => t + v * y[j], 0)), yHy = y.reduce((t, v, i) => t + v * Hy[i], 0); H = H.map((row, i) => row.map((v, j) => v + ((sy + yHy) * s[i] * s[j]) / (sy * sy) - (Hy[i] * s[j] + s[i] * Hy[j]) / sy)); }
    x = xn; fx = r.f; gx = r.g; fresh = false; const gn = Math.hypot(...gx); yield { x, f: fx, g: gn }; if (gn < gtol) break;
  }
}
/* relax a state to the nearest minimum of the lattice energy, molecules and cell together. Each turn is folded into
   its molecule's reference, and the cell re-reduced, whenever a turn has wound past 1.5 rad or the cell has sheared
   (its vectors' lengths multiplied, over its volume, past 3), so the numbers stay well conditioned. Yields
   { st, f, g } */
export function* relaxSteps(C, st0, iters = 3000, gtol = 2e-6) {
  const d = C.d, skewOf = (H) => Math.max(3, 1.5 * (H.reduce((t, h) => t * Math.hypot(...h), 1) / Math.abs(det(H))));
  let st = tidy(st0), used = 0, last = null, skew0 = skewOf(st.H);
  while (used < iters) {
    let refold = false, k = 0;
    for (const it of bfgsG((x) => energyAndSlope(C, st, x), pack(st, d), iters - used, gtol)) {
      const s = unpack(st, it.x, d); last = { st: s, f: it.f, g: it.g }; if (k++) { used++; yield last; }
      const skew = s.H.reduce((t, h) => t * Math.hypot(...h), 1) / Math.abs(det(s.H));
      if (k > 1 && (s.mols.some((m) => Math.hypot(...m.w) > 1.5) || skew > skew0)) { refold = true; break; }
    }
    if (!refold) { if (k <= 1) yield last; return; }
    st = tidy({ H: last.st.H, mols: last.st.mols.map(({ R0, s }) => ({ R0, s })) }); skew0 = skewOf(st.H); used++;
  }
}
export function relax(C, st, iters, gtol) { let last; for (const s of relaxSteps(C, st, iters, gtol)) last = s; return { ...last, st: tidy(last.st) }; }
/* the descent's own slope, for the selftest: analytic against central differences */
export const slopeCheck = (C, st, h = 1e-5) => { const s = tidy(st), x = pack(s, C.d), { g } = energyAndSlope(C, s, x); return g.map((v, i) => { const a = x.slice(), b = x.slice(); a[i] += h; b[i] -= h; return [v, (energyAndSlope(C, s, a).f - energyAndSlope(C, s, b).f) / (2 * h)]; }); };
