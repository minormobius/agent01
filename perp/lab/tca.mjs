// Tensor component analysis — CP/PARAFAC by alternating least squares.
// X[i][j][k] ~= sum_r lambda_r * A[i][r] * B[j][r] * C[k][r]
// Dependency-free; sized for small modes (R <= ~12), any K.

export function zeros(n, m) { return Array.from({length: n}, () => new Float64Array(m)); }

// Solve (G + reg*I) x = rhs for each row of rhs, G is R x R. Gauss-Jordan.
function solveRight(G, rhs, reg) {
  const R = G.length;
  const M = Array.from({length: R}, (_, i) => {
    const row = new Float64Array(2 * R);
    for (let j = 0; j < R; j++) row[j] = G[i][j] + (i === j ? reg : 0);
    row[R + i] = 1;
    return row;
  });
  for (let c = 0; c < R; c++) {
    let p = c;
    for (let r = c + 1; r < R; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-12) continue;
    [M[c], M[p]] = [M[p], M[c]];
    const d = M[c][c];
    for (let j = 0; j < 2 * R; j++) M[c][j] /= d;
    for (let r = 0; r < R; r++) {
      if (r === c) continue;
      const f = M[r][c];
      if (!f) continue;
      for (let j = 0; j < 2 * R; j++) M[r][j] -= f * M[c][j];
    }
  }
  const inv = Array.from({length: R}, (_, i) => M[i].slice(R));
  return rhs.map((row) => {
    const out = new Float64Array(R);
    for (let r = 0; r < R; r++) { let s = 0; for (let q = 0; q < R; q++) s += row[q] * inv[q][r]; out[r] = s; }
    return out;
  });
}

const gram = (M) => {
  const R = M[0].length, G = zeros(R, R);
  for (let a = 0; a < R; a++) for (let b = a; b < R; b++) {
    let s = 0; for (let i = 0; i < M.length; i++) s += M[i][a] * M[i][b];
    G[a][b] = G[b][a] = s;
  }
  return G;
};
const hadamard = (P, Q) => P.map((row, i) => row.map((v, j) => v * Q[i][j]));

export function cpAls(X, R, { seed = 1, iters = 400, tol = 1e-8, reg = 1e-9 } = {}) {
  const I = X.length, J = X[0].length, K = X[0][0].length;
  let s = seed >>> 0;
  const rand = () => { s = (s + 0x6D2B79F5) | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const init = (n) => Array.from({length: n}, () => Float64Array.from({length: R}, () => rand() - 0.5));

  let A = init(I), B = init(J), C = init(K);
  let normX = 0;
  for (let i = 0; i < I; i++) for (let j = 0; j < J; j++) for (let k = 0; k < K; k++) normX += X[i][j][k] ** 2;
  normX = Math.sqrt(normX);

  let prev = Infinity, err = Infinity;
  for (let it = 0; it < iters; it++) {
    // --- A: rhs[i][r] = sum_{j,k} X[i][j][k] * B[j][r] * C[k][r]
    let rhs = zeros(I, R);
    for (let i = 0; i < I; i++) for (let j = 0; j < J; j++) { const Xij = X[i][j], Bj = B[j];
      for (let k = 0; k < K; k++) { const v = Xij[k]; if (!v) continue; const Ck = C[k];
        for (let r = 0; r < R; r++) rhs[i][r] += v * Bj[r] * Ck[r]; } }
    A = solveRight(hadamard(gram(B), gram(C)), rhs, reg);

    // --- B
    rhs = zeros(J, R);
    for (let i = 0; i < I; i++) { const Ai = A[i];
      for (let j = 0; j < J; j++) { const Xij = X[i][j];
        for (let k = 0; k < K; k++) { const v = Xij[k]; if (!v) continue; const Ck = C[k];
          for (let r = 0; r < R; r++) rhs[j][r] += v * Ai[r] * Ck[r]; } } }
    B = solveRight(hadamard(gram(A), gram(C)), rhs, reg);

    // --- C
    rhs = zeros(K, R);
    for (let i = 0; i < I; i++) { const Ai = A[i];
      for (let j = 0; j < J; j++) { const Xij = X[i][j], Bj = B[j];
        for (let k = 0; k < K; k++) { const v = Xij[k]; if (!v) continue;
          for (let r = 0; r < R; r++) rhs[k][r] += v * Ai[r] * Bj[r]; } } }
    C = solveRight(hadamard(gram(A), gram(B)), rhs, reg);

    // --- reconstruction error via <X,X> - 2<X,X̂> + <X̂,X̂>
    const GA = gram(A), GB = gram(B), GC = gram(C);
    let xx = 0;
    for (let a = 0; a < R; a++) for (let b = 0; b < R; b++) xx += GA[a][b] * GB[a][b] * GC[a][b];
    let xxh = 0;
    for (let k = 0; k < K; k++) for (let r = 0; r < R; r++) xxh += C[k][r] * rhs[k][r];
    err = Math.sqrt(Math.max(0, normX * normX - 2 * xxh + xx)) / normX;
    if (Math.abs(prev - err) < tol) break;
    prev = err;
  }

  // normalise: unit-norm A and B columns, magnitude into lambda, sign fixed by A
  const lambda = new Float64Array(R);
  for (let r = 0; r < R; r++) {
    const na = Math.hypot(...A.map((x) => x[r])), nb = Math.hypot(...B.map((x) => x[r]));
    const nc = Math.hypot(...C.map((x) => x[r]));
    lambda[r] = na * nb * nc;
    if (na) for (let i = 0; i < A.length; i++) A[i][r] /= na;
    if (nb) for (let j = 0; j < B.length; j++) B[j][r] /= nb;
    if (nc) for (let k = 0; k < C.length; k++) C[k][r] /= nc;
    let sa = 0; for (let i = 0; i < A.length; i++) sa += A[i][r] ** 3;
    if (sa < 0) { for (let i = 0; i < A.length; i++) A[i][r] *= -1; for (let k = 0; k < C.length; k++) C[k][r] *= -1; }
  }
  const order = [...lambda.keys()].sort((a, b) => lambda[b] - lambda[a]);
  const pick = (M) => M.map((row) => Float64Array.from(order, (r) => row[r]));
  return { A: pick(A), B: pick(B), C: pick(C), lambda: Float64Array.from(order, (r) => lambda[r]),
           err, fitR2: 1 - err * err };
}

// Reproducibility across restarts (Williams et al.): greedily match components
// between two fits and average the product of per-mode correlations.
const corr = (u, v) => {
  const n = u.length; let mu = 0, mv = 0;
  for (let i = 0; i < n; i++) { mu += u[i]; mv += v[i]; }
  mu /= n; mv /= n;
  let c = 0, su = 0, sv = 0;
  for (let i = 0; i < n; i++) { const a = u[i] - mu, b = v[i] - mv; c += a * b; su += a * a; sv += b * b; }
  return (su && sv) ? c / Math.sqrt(su * sv) : 0;
};
const colOf = (M, r) => Float64Array.from(M, (row) => row[r]);

export function similarity(f1, f2) {
  const R = f1.lambda.length, used = new Set(), scores = [];
  for (let r = 0; r < R; r++) {
    let best = -1, bestS = -Infinity;
    for (let q = 0; q < R; q++) {
      if (used.has(q)) continue;
      const s = Math.abs(corr(colOf(f1.A, r), colOf(f2.A, q)))
              * Math.abs(corr(colOf(f1.B, r), colOf(f2.B, q)))
              * Math.abs(corr(colOf(f1.C, r), colOf(f2.C, q)));
      if (s > bestS) { bestS = s; best = q; }
    }
    used.add(best); scores.push(bestS);
  }
  return scores.reduce((s, x) => s + x, 0) / R;
}
