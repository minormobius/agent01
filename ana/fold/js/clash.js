// Do two cells pass through each other? For two convex cells x = o + P·u (u in a box), the deepest common point is a
// small linear programme: maximise s with both u and v at least s inside their boxes and o₁ + P₁u = o₂ + P₂v. s > 0
// means their insides meet (two solids crossing in 4D); touching along a hinge square, an edge or a corner gives 0.
// No DOM. A dense two-phase simplex with Bland's rule: tiny (19 variables, 16 rows) and exact enough at 1e-9.

/** max c·x subject to A x = b, x ≥ 0. Returns { x, value } or null if infeasible. (Unbounded can't happen here.) */
export function simplex(A, b, c) {
  const m = A.length, n = c.length, EPS = 1e-10;
  // tableau with an artificial per row (rows flipped so b ≥ 0)
  const T = A.map((r, i) => { const s = b[i] < 0 ? -1 : 1; const row = r.map((v) => s * v); for (let k = 0; k < m; k++) row.push(k === i ? 1 : 0); row.push(s * b[i]); return row; });
  const basis = Array.from({ length: m }, (_, i) => n + i), W = n + m;
  const pivot = (r, col) => {
    const pr = T[r], pv = pr[col]; for (let j = 0; j <= W; j++) pr[j] /= pv;
    for (let i = 0; i < m; i++) if (i !== r) { const f = T[i][col]; if (Math.abs(f) > 0) for (let j = 0; j <= W; j++) T[i][j] -= f * pr[j]; }
    basis[r] = col;
  };
  const run = (cost, allowed) => {
    for (let it = 0; it < 500; it++) {
      // reduced costs: cost_j − Σ cost_basis · T[i][j]; enter the lowest-index improving column (Bland)
      let col = -1;
      for (let j = 0; j < allowed; j++) { if (basis.includes(j)) continue; let r = cost[j] || 0; for (let i = 0; i < m; i++) r -= (cost[basis[i]] || 0) * T[i][j]; if (r > EPS) { col = j; break; } }
      if (col < 0) return true;
      let row = -1, best = Infinity;
      for (let i = 0; i < m; i++) if (T[i][col] > EPS) { const q = T[i][W] / T[i][col]; if (q < best - EPS || (Math.abs(q - best) <= EPS && basis[i] < basis[row])) { best = q; row = i; } }
      if (row < 0) return false;
      pivot(row, col);
    }
    return false;
  };
  const c1 = new Array(n + m).fill(0); for (let k = n; k < n + m; k++) c1[k] = -1;   // phase 1: drive artificials out
  run(c1, n + m);
  let infeas = 0; for (let i = 0; i < m; i++) if (basis[i] >= n) infeas += T[i][W];
  if (infeas > 1e-8) return null;
  for (let i = 0; i < m; i++) if (basis[i] >= n) { const j = T[i].findIndex((v, k) => k < n && Math.abs(v) > 1e-9); if (j >= 0) pivot(i, j); }   // degenerate leftovers
  if (!run(c, n)) return null;
  const x = new Array(n).fill(0); for (let i = 0; i < m; i++) if (basis[i] < n) x[basis[i]] = T[i][W];
  return { x, value: c.reduce((s, v, j) => s + v * x[j], 0) };
}

/** How deep two boxes x = o + P·u, u ∈ [−h, h]^k, interpenetrate: the largest s with a common point at least s inside
 *  both (in their own box units). 0 when they only touch; −1 when they don't meet. P are 4×k (columns as arrays). */
export function depth(o1, P1, h1, o2, P2, h2) {
  const k1 = P1.length, k2 = P2.length, nv = k1 + k2 + 1, rows = [], rhs = [];
  const nslack = 2 * (k1 + k2), N = nv + nslack;
  const row = () => new Array(N).fill(0);
  let sl = nv;
  // p = u + h ∈ [0, 2h]: p − s − a = 0, p + s + b = 2h
  for (let i = 0; i < k1 + k2; i++) {
    const hh = i < k1 ? h1 : h2;
    let r = row(); r[i] = 1; r[nv - 1] = -1; r[sl++] = -1; rows.push(r); rhs.push(0);
    r = row(); r[i] = 1; r[nv - 1] = 1; r[sl++] = 1; rows.push(r); rhs.push(2 * hh);
  }
  // o1 + P1(p − h1) = o2 + P2(q − h2)
  for (let d = 0; d < 4; d++) {
    const r = row(); let b = o2[d] - o1[d];
    P1.forEach((col, i) => { r[i] = col[d]; b += h1 * col[d]; });
    P2.forEach((col, i) => { r[k1 + i] = -col[d]; b -= h2 * col[d]; });
    rows.push(r); rhs.push(b);
  }
  const c = new Array(N).fill(0); c[nv - 1] = 1;
  const res = simplex(rows, rhs, c);
  return res ? res.value : -1;
}
