/* ATOM⁴'s multiplets, no DOM: the levels of n electrons in a d shell (5 orbitals in ours, 9 in 4D) under a ligand field and
   their own repulsion, every determinant of one M_S block diagonalized, spin from ⟨S²⟩. The integrals come in from
   outside (tools/multiplets.mjs makes them: the repulsion's radial F_n and angular A_n, the field's matrix), so this runs
   as well in a page as in node: the Bluminium viewer's dopant playground diagonalizes here live.
     levels(m, n, h, s, { m, A }, F, beta) → { dim, M, multiplets: [{ eV, mult, g, Eabs }] }
     firsts(levels, [gAllowed, gFlip]) → the ground spin, the lowest excited state of that spin, the lowest spin flip */
const HA = 27.211386;
/* symmetric eigensystem: Householder to tridiagonal, then implicit QL (after JAMA's tred2/tql2); V's columns are vectors */
export function eigh(A) {
  const n = A.length, V = A.map((r) => Float64Array.from(r)), d = new Float64Array(n), e = new Float64Array(n);
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j];
  for (let i = n - 1; i > 0; i--) {
    let scale = 0, h = 0; for (let k = 0; k < i; k++) scale += Math.abs(d[k]);
    if (scale === 0) { e[i] = d[i - 1]; for (let j = 0; j < i; j++) { d[j] = V[i - 1][j]; V[i][j] = 0; V[j][i] = 0; } }
    else {
      for (let k = 0; k < i; k++) { d[k] /= scale; h += d[k] * d[k]; }
      let f = d[i - 1], g = Math.sqrt(h); if (f > 0) g = -g; e[i] = scale * g; h -= f * g; d[i - 1] = f - g;
      for (let j = 0; j < i; j++) e[j] = 0;
      for (let j = 0; j < i; j++) { f = d[j]; V[j][i] = f; g = e[j] + V[j][j] * f; for (let k = j + 1; k <= i - 1; k++) { g += V[k][j] * d[k]; e[k] += V[k][j] * f; } e[j] = g; }
      f = 0; for (let j = 0; j < i; j++) { e[j] /= h; f += e[j] * d[j]; }
      const hh = f / (h + h); for (let j = 0; j < i; j++) e[j] -= hh * d[j];
      for (let j = 0; j < i; j++) { f = d[j]; g = e[j]; for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k]; d[j] = V[i - 1][j]; V[i][j] = 0; }
    }
    d[i] = h;
  }
  for (let i = 0; i < n - 1; i++) { V[n - 1][i] = V[i][i]; V[i][i] = 1; const h = d[i + 1];
    if (h !== 0) { for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h; for (let j = 0; j <= i; j++) { let g = 0; for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j]; for (let k = 0; k <= i; k++) V[k][j] -= g * d[k]; } }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0; }
  for (let j = 0; j < n; j++) { d[j] = V[n - 1][j]; V[n - 1][j] = 0; } V[n - 1][n - 1] = 1; e[0] = 0;
  for (let i = 1; i < n; i++) e[i - 1] = e[i]; e[n - 1] = 0;
  let f = 0, tst1 = 0; const eps = 2 ** -52;
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l])); let m = l; while (m < n) { if (Math.abs(e[m]) <= eps * tst1) break; m++; }
    if (m > l) { let iter = 0; do { if (++iter > 200) throw new Error("eigh: no convergence");
      let g = d[l], p = (d[l + 1] - g) / (2 * e[l]), r = Math.hypot(p, 1); if (p < 0) r = -r;
      d[l] = e[l] / (p + r); d[l + 1] = e[l] * (p + r); const dl1 = d[l + 1]; let h = g - d[l]; for (let i = l + 2; i < n; i++) d[i] -= h; f += h;
      p = d[m]; let c = 1, c2 = c, c3 = c; const el1 = e[l + 1]; let s = 0, s2 = 0;
      for (let i = m - 1; i >= l; i--) { c3 = c2; c2 = c; s2 = s; g = c * e[i]; h = c * p; r = Math.hypot(p, e[i]); e[i + 1] = s * r; s = e[i] / r; c = p / r; p = c * d[i] - s * g; d[i + 1] = h + s * (c * g + s * d[i]);
        for (let k = 0; k < n; k++) { h = V[k][i + 1]; V[k][i + 1] = s * V[k][i] + c * h; V[k][i] = c * V[k][i] - s * h; } }
      p = (-s * s2 * c3 * el1 * e[l]) / dl1; e[l] = s * p; d[l] = c * p; } while (Math.abs(e[l]) > eps * tst1); }
    d[l] += f; e[l] = 0;
  }
  const ord = Array.from(d, (_, i) => i).sort((a, b) => d[a] - d[b]);
  return { values: ord.map((i) => d[i]), vectors: ord.map((i) => Float64Array.from(V, (row) => row[i])) };
}


/* ⟨ab|cd⟩ = Σ_n β_n F_n A_n(ac, bd), F⁰ unscaled (it shifts every level of the configuration alike) */
export function twoBody(ang, F, beta) { const { m, A } = ang, g = new Float64Array(m ** 4), sc = [1, beta, beta];
  for (let a = 0; a < m; a++) for (let b = 0; b < m; b++) for (let c = 0; c < m; c++) for (let dd = 0; dd < m; dd++) { let v = 0; for (let k = 0; k < 3; k++) v += sc[k] * F[k] * A[k][a * m + c][b * m + dd]; g[((a * m + b) * m + c) * m + dd] = v; }
  return g; }

/* the determinants of n electrons with nu spin-up in 2m spin orbitals (bit o = orbital o up, bit m + o = down) */
const pop = (x) => { let c = 0; while (x) { x &= x - 1; c++; } return c; };
export function dets(m, n, nu) { const out = []; for (let D = 0; D < 1 << (2 * m); D++) if (pop(D) === n && pop(D & ((1 << m) - 1)) === nu) out.push(D); return out; }
const sgn = (D, p) => (pop(D & ((1 << p) - 1)) & 1 ? -1 : 1);

/* H in one M_S block; h the one-electron (ligand field) matrix, g the two-electron integrals */
function hamiltonian(m, basis, h, g) {
  const at = new Map(basis.map((D, i) => [D, i])), N = basis.length, H = Array.from({ length: N }, () => new Float64Array(N)), sp = (p) => (p < m ? 0 : 1), o = (p) => p % m;
  basis.forEach((D, col) => {
    for (let r = 0; r < 2 * m; r++) { if (!(D >> r & 1)) continue; const s1 = sgn(D, r), D1 = D ^ (1 << r);
      for (let p = 0; p < 2 * m; p++) { if (sp(p) !== sp(r) || D1 >> p & 1) continue; const row = at.get(D1 | (1 << p)); H[row][col] += s1 * sgn(D1, p) * h[o(p)][o(r)]; } }
    for (let r = 0; r < 2 * m; r++) { if (!(D >> r & 1)) continue; const sr = sgn(D, r), Dr = D ^ (1 << r);
      for (let s = 0; s < 2 * m; s++) { if (s === r || !(Dr >> s & 1)) continue; const ss = sgn(Dr, s), Ds = Dr ^ (1 << s);
        for (let q = 0; q < 2 * m; q++) { if (sp(q) !== sp(s) || Ds >> q & 1) continue; const sq = sgn(Ds, q), Dq = Ds | (1 << q);
          for (let p = 0; p < 2 * m; p++) { if (p === q || sp(p) !== sp(r) || Dq >> p & 1) continue; const row = at.get(Dq | (1 << p));
            H[row][col] += 0.5 * sr * ss * sq * sgn(Dq, p) * g[((o(p) * m + o(q)) * m + o(r)) * m + o(s)]; } } } }
  });
  return H;
}
/* ⟨S²⟩ = |S₊v|² + M² + M */
function spinSq(m, basis, v, M) { const out = new Map();
  basis.forEach((D, i) => { if (!v[i]) return; for (let o2 = 0; o2 < m; o2++) { const dn = m + o2; if (!(D >> dn & 1) || D >> o2 & 1) continue; const s1 = sgn(D, dn), D1 = D ^ (1 << dn), s2 = sgn(D1, o2), D2 = D1 | (1 << o2); out.set(D2, (out.get(D2) || 0) + s1 * s2 * v[i]); } });
  let t = 0; for (const x of out.values()) t += x * x; return t + M * M + M; }

/* the multiplets of dⁿ in field s·h with repulsion β: levels grouped by energy, each with its spin and how many states */
/* eigenvalues only (Householder to tridiagonal, then implicit QL; after Numerical Recipes' tred2/tqli): about a quarter
   of eigh's work, which is what lets a page solve a 4D d³ block live */
export function eigvals(A0) {
  const n = A0.length, a = A0.map((r) => Float64Array.from(r)), d = new Float64Array(n), e = new Float64Array(n);
  for (let i = n - 1; i > 0; i--) { const l = i - 1; let h = 0, scale = 0;
    if (l > 0) { for (let k = 0; k <= l; k++) scale += Math.abs(a[i][k]);
      if (scale === 0) e[i] = a[i][l];
      else { for (let k = 0; k <= l; k++) { a[i][k] /= scale; h += a[i][k] * a[i][k]; }
        let f = a[i][l], g = f >= 0 ? -Math.sqrt(h) : Math.sqrt(h); e[i] = scale * g; h -= f * g; a[i][l] = f - g; f = 0;
        for (let j = 0; j <= l; j++) { g = 0; for (let k = 0; k <= j; k++) g += a[j][k] * a[i][k]; for (let k = j + 1; k <= l; k++) g += a[k][j] * a[i][k]; e[j] = g / h; f += e[j] * a[i][j]; }
        const hh = f / (h + h); for (let j = 0; j <= l; j++) { f = a[i][j]; e[j] = g = e[j] - hh * f; for (let k = 0; k <= j; k++) a[j][k] -= f * e[k] + g * a[i][k]; } } }
    else e[i] = a[i][l];
    d[i] = h; }
  for (let i = 0; i < n; i++) d[i] = a[i][i];
  for (let i = 1; i < n; i++) e[i - 1] = e[i]; e[n - 1] = 0;
  for (let l = 0; l < n; l++) { let iter = 0, m;
    do { for (m = l; m < n - 1; m++) { const dd = Math.abs(d[m]) + Math.abs(d[m + 1]); if (Math.abs(e[m]) <= 2.2e-16 * dd) break; }
      if (m !== l) { if (++iter > 60) throw new Error("eigvals: no convergence");
        let g = (d[l + 1] - d[l]) / (2 * e[l]), r = Math.hypot(g, 1); g = d[m] - d[l] + e[l] / (g + (g >= 0 ? Math.abs(r) : -Math.abs(r)));
        let s = 1, c = 1, p = 0, i; for (i = m - 1; i >= l; i--) { let f = s * e[i]; const b = c * e[i]; e[i + 1] = r = Math.hypot(f, g); if (r === 0) { d[i + 1] -= p; e[m] = 0; break; } s = f / r; c = g / r; g = d[i + 1] - p; r = (d[i] - g) * s + 2 * c * b; p = s * r; d[i + 1] = g + p; g = c * r - b; }
        if (r === 0 && i >= l) continue; d[l] -= p; e[l] = g; e[m] = 0; } } while (m !== l); }
  return Array.from(d).sort((x, y) => x - y);
}
/* the multiplets of dⁿ in field s·h with repulsion β, from eigenvalues alone: a multiplet of spin S appears once in every
   M_S block with M ≤ S, so counting each level's copies block by block gives its spin (g_S = count at M − count at M + 1) */
export function levels(m, n, h, s, ang, F, beta, tol = 1e-6) {
  const g2 = twoBody(ang, F, beta), hs = h.map((r) => Array.from(r, (x) => s * x)), nu0 = Math.ceil(n / 2), blocks = [];
  for (let nu = nu0; nu <= Math.min(n, m); nu++) { if (n - nu > m) continue; const basis = dets(m, n, nu); if (nu === nu0 && basis.length > 1600) throw new Error(`block of ${basis.length} determinants: too large here`);
    blocks.push({ M: (2 * nu - n) / 2, dim: basis.length, E: eigvals(hamiltonian(m, basis, hs, g2)) }); }
  const low = blocks[0].E, groups = []; for (const E of low) { const last = groups.at(-1); if (last && E - last.top < tol) { last.top = E; last.n++; } else groups.push({ E, top: E, n: 1 }); }
  const count = (B, gp) => { let c = 0; for (const E of B.E) if (E > gp.E - tol && E < gp.top + tol) c++; return c; };
  const out = []; for (const gp of groups) { const c = blocks.map((B) => count(B, gp)); for (let k = 0; k < blocks.length; k++) { const gS = c[k] - (c[k + 1] || 0); if (gS > 0) out.push({ E: gp.E, mult: Math.round(2 * blocks[k].M + 1), g: gS }); } }
  out.sort((x, y) => x.E - y.E || y.mult - x.mult);
  const E0 = out[0].E; return { dim: blocks[0].dim, M: blocks[0].M, multiplets: out.map((x) => ({ eV: +((x.E - E0) * HA).toFixed(4), mult: x.mult, g: x.g, Eabs: x.E })) };
}
/* the same from eigenvectors and ⟨S²⟩, kept as the check on levels() */
export function levelsByVectors(m, n, h, s, ang, F, beta, tol = 1e-6) {
  const nu = Math.ceil(n / 2), M = (2 * nu - n) / 2, basis = dets(m, n, nu);
  if (basis.length > 1600) throw new Error(`block of ${basis.length} determinants: too large here`);
  const hs = h.map((r) => Array.from(r, (x) => s * x)), H = hamiltonian(m, basis, hs, twoBody(ang, F, beta)), { values, vectors } = eigh(H.map((r) => Array.from(r)));
  const out = []; values.forEach((E, i) => { const S2 = spinSq(m, basis, vectors[i], M), S = (Math.sqrt(1 + 4 * S2) - 1) / 2, last = out.at(-1);
    if (last && E - last.E < tol && Math.abs(last.S - S) < 0.25) { last.g++; last.top = E; } else out.push({ E, S, g: 1, top: E }); });
  const E0 = out[0].E; return { dim: basis.length, M, multiplets: out.map((x) => ({ eV: +((x.E - E0) * HA).toFixed(4), mult: Math.round(2 * x.S + 1), g: x.g, Eabs: x.E })) };
}
/* the two states that decide the laser: the lowest excited state of the ground state's spin, and the lowest of another
   spin; a level is its group's mean over the next `g` states (a T level split by a trigonal field counts as one band) */
export function firsts(L, gBand) { const ms = L.multiplets, gs = ms[0].mult;
  const take = (pred, need) => { let n = 0, e = 0; for (const x of ms.slice(1)) { if (!pred(x)) continue; const k = Math.min(x.g, need - n); e += k * x.eV; n += k; if (n >= need) break; } return n ? e / n : null; };
  return { groundMult: gs, groundG: ms[0].g, allowed_eV: take((x) => x.mult === gs, gBand[0]), flip_eV: take((x) => x.mult !== gs, gBand[1]), flipMult: ms.slice(1).find((x) => x.mult !== gs)?.mult ?? null }; }

