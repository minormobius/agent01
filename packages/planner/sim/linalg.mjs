// Small dense linear algebra. The model is 21x21; no library needed.
export const zeros = (r, c) => Array.from({ length: r }, () => new Array(c).fill(0));
export const eye = n => zeros(n, n).map((row, i) => (row[i] = 1, row));
export const matvec = (A, x) => A.map(row => row.reduce((s, a, j) => s + a * x[j], 0));
export const matmul = (A, B) => A.map(row => B[0].map((_, j) => row.reduce((s, a, k) => s + a * B[k][j], 0)));
export const sub = (A, B) => A.map((row, i) => row.map((a, j) => a - B[i][j]));
export const outer = (u, v) => u.map(a => v.map(b => a * b));

// Solve A x = b by Gaussian elimination with partial pivoting.
export function solve(A, b) {
  const n = A.length, M = A.map((row, i) => [...row, b[i]]);
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
    if (Math.abs(M[p][c]) < 1e-14) throw new Error(`singular matrix at column ${c}`);
    [M[c], M[p]] = [M[p], M[c]];
    for (let r = 0; r < n; r++) if (r !== c) {
      const f = M[r][c] / M[c][c];
      if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
    }
  }
  return M.map((row, i) => row[n] / row[i]);
}
export const inverse = A => { const n = A.length, I = eye(n); const cols = I.map(e => solve(A, e)); return A.map((_, i) => cols.map(col => col[i])); };
