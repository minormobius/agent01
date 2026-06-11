// biome/cycles/sim/linalg.mjs — the small dense linear-algebra kernel the stability
// solver needs: matrix inverse (press perturbations), symmetric eigenvalues (reactivity),
// and general real-matrix eigenvalues (asymptotic stability of the community matrix).
//
// Pure, zero-dep, deterministic. Matrices are arrays-of-rows (number[][]); vectors are
// number[]. Sizes here are small (one row/col per species, ~6–50), so clarity beats
// cache-blocking. The general eigensolver is a faithful port of the classic Hessenberg
// QR algorithm (Numerical Recipes `elmhes`/`hqr`), which returns real and complex
// eigenvalues of a real non-symmetric matrix — exactly the spectrum of a community matrix.
//
// Heavily self-tested (test/linalg.selftest.mjs) against matrices with known spectra,
// because the entire stability verdict rests on these routines being right.

export const clone = (A) => A.map((r) => r.slice());
export const identity = (n) => Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
export const transpose = (A) => A[0].map((_, j) => A.map((r) => r[j]));

export function matMul(A, B) {
  const n = A.length, m = B[0].length, k = B.length;
  const C = Array.from({ length: n }, () => new Array(m).fill(0));
  for (let i = 0; i < n; i++) for (let p = 0; p < k; p++) { const a = A[i][p]; if (a) for (let j = 0; j < m; j++) C[i][j] += a * B[p][j]; }
  return C;
}
export function matVec(A, x) { return A.map((row) => row.reduce((s, v, j) => s + v * x[j], 0)); }

// Gauss–Jordan inverse with partial pivoting. Throws on (near-)singular input.
export function inverse(Ain) {
  const n = Ain.length;
  const A = clone(Ain), I = identity(n);
  for (let col = 0; col < n; col++) {
    let piv = col, best = Math.abs(A[col][col]);
    for (let r = col + 1; r < n; r++) if (Math.abs(A[r][col]) > best) { best = Math.abs(A[r][col]); piv = r; }
    if (best < 1e-300) throw new Error('inverse: singular matrix');
    if (piv !== col) { [A[col], A[piv]] = [A[piv], A[col]]; [I[col], I[piv]] = [I[piv], I[col]]; }
    const d = A[col][col];
    for (let j = 0; j < n; j++) { A[col][j] /= d; I[col][j] /= d; }
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col];
      if (f === 0) continue;
      for (let j = 0; j < n; j++) { A[r][j] -= f * A[col][j]; I[r][j] -= f * I[col][j]; }
    }
  }
  return I;
}

// Symmetric eigenvalues via the cyclic Jacobi rotation method. Guaranteed to converge
// for real symmetric matrices; returns eigenvalues sorted descending. (Used for
// reactivity = λmax of the symmetric part (J+Jᵀ)/2.)
export function eigSymmetric(Ain, { maxSweeps = 100, tol = 1e-14 } = {}) {
  const n = Ain.length;
  const A = clone(Ain);
  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += A[p][q] * A[p][q];
    if (Math.sqrt(off) < tol) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-300) continue;
      const theta = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
      const c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let i = 0; i < n; i++) {
        const aip = A[i][p], aiq = A[i][q];
        A[i][p] = c * aip - s * aiq; A[i][q] = s * aip + c * aiq;
      }
      for (let i = 0; i < n; i++) {
        const api = A[p][i], aqi = A[q][i];
        A[p][i] = c * api - s * aqi; A[q][i] = s * api + c * aqi;
      }
    }
  }
  return A.map((r, i) => r[i]).sort((a, b) => b - a);
}

// ── General real-matrix eigenvalues: Householder→Hessenberg, then the hqr QR algorithm.
// Returns [{re, im}, …]. Port of Numerical Recipes elmhes+hqr (public-domain algorithm),
// 0-indexed. Robust for the modest, non-pathological community matrices we feed it.

function hessenberg(Ain) {
  const n = Ain.length;
  const a = clone(Ain);
  for (let m = 1; m < n - 1; m++) {
    let x = 0, i = m;
    for (let j = m; j < n; j++) if (Math.abs(a[j][m - 1]) > Math.abs(x)) { x = a[j][m - 1]; i = j; }
    if (i !== m) {
      for (let j = m - 1; j < n; j++) { const t = a[i][j]; a[i][j] = a[m][j]; a[m][j] = t; }
      for (let j = 0; j < n; j++) { const t = a[j][i]; a[j][i] = a[j][m]; a[j][m] = t; }
    }
    if (x !== 0) {
      for (i = m + 1; i < n; i++) {
        let y = a[i][m - 1];
        if (y !== 0) {
          y /= x; a[i][m - 1] = y;
          for (let j = m; j < n; j++) a[i][j] -= y * a[m][j];
          for (let j = 0; j < n; j++) a[j][m] += y * a[j][i];
        }
      }
    }
  }
  // zero out the strictly-below-subdiagonal part
  for (let i = 2; i < n; i++) for (let j = 0; j < i - 1; j++) a[i][j] = 0;
  return a;
}

function hqr(ain) {
  const n = ain.length;
  const a = clone(ain);
  const w = []; // eigenvalues {re, im}
  let anorm = 0;
  for (let i = 0; i < n; i++) for (let j = Math.max(i - 1, 0); j < n; j++) anorm += Math.abs(a[i][j]);
  let nn = n - 1, t = 0;
  while (nn >= 0) {
    let its = 0, l;
    do {
      for (l = nn; l >= 1; l--) {
        let s = Math.abs(a[l - 1][l - 1]) + Math.abs(a[l][l]);
        if (s === 0) s = anorm;
        if (Math.abs(a[l][l - 1]) + s === s) { a[l][l - 1] = 0; break; }
      }
      let x = a[nn][nn];
      if (l === nn) { w[nn] = { re: x + t, im: 0 }; nn--; }
      else {
        let y = a[nn - 1][nn - 1];
        let ww = a[nn][nn - 1] * a[nn - 1][nn];
        if (l === nn - 1) {
          let p = 0.5 * (y - x);
          let q = p * p + ww;
          let z = Math.sqrt(Math.abs(q));
          x += t;
          if (q >= 0) {
            z = p + Math.sign(p || 1) * z;
            w[nn] = w[nn - 1] = { re: x + z, im: 0 };
            if (z !== 0) w[nn] = { re: x - ww / z, im: 0 };
          } else {
            w[nn] = { re: x + p, im: -z };
            w[nn - 1] = { re: x + p, im: z };
          }
          nn -= 2;
        } else {
          if (its === 60) throw new Error('hqr: too many iterations');
          if (its === 10 || its === 20) {
            t += x;
            for (let i = 0; i <= nn; i++) a[i][i] -= x;
            let s = Math.abs(a[nn][nn - 1]) + Math.abs(a[nn - 1][nn - 2]);
            y = x = 0.75 * s;
            ww = -0.4375 * s * s;
          }
          its++;
          let m;
          let p = 0, q = 0, r = 0;
          for (m = nn - 2; m >= l; m--) {
            const z = a[m][m];
            r = x - z; let s = y - z;
            p = (r * s - ww) / a[m + 1][m] + a[m][m + 1];
            q = a[m + 1][m + 1] - z - r - s;
            r = a[m + 2][m + 1];
            const sc = Math.abs(p) + Math.abs(q) + Math.abs(r);
            p /= sc; q /= sc; r /= sc;
            if (m === l) break;
            const u = Math.abs(a[m][m - 1]) * (Math.abs(q) + Math.abs(r));
            const v = Math.abs(p) * (Math.abs(a[m - 1][m - 1]) + Math.abs(z) + Math.abs(a[m + 1][m + 1]));
            if (u + v === v) break;
          }
          for (let i = m + 2; i <= nn; i++) { a[i][i - 2] = 0; if (i !== m + 2) a[i][i - 3] = 0; }
          for (let k = m; k <= nn - 1; k++) {
            if (k !== m) {
              p = a[k][k - 1]; q = a[k + 1][k - 1]; r = 0;
              if (k !== nn - 1) r = a[k + 2][k - 1];
              x = Math.abs(p) + Math.abs(q) + Math.abs(r);
              if (x !== 0) { p /= x; q /= x; r /= x; }
            }
            const s = Math.sign(p || 1) * Math.sqrt(p * p + q * q + r * r);
            if (s === 0) continue;
            if (k === m) { if (l !== m) a[k][k - 1] = -a[k][k - 1]; }
            else a[k][k - 1] = -s * x;
            p += s;
            const px = p / s, qx = q / s, rx = r / s;
            let yy = q / p, zz = r / p;
            for (let j = k; j <= nn; j++) {
              let pp = a[k][j] + yy * a[k + 1][j];
              if (k !== nn - 1) { pp += zz * a[k + 2][j]; a[k + 2][j] -= pp * rx; }
              a[k + 1][j] -= pp * qx; a[k][j] -= pp * px;
            }
            const mmin = nn < k + 3 ? nn : k + 3;
            for (let i = l; i <= mmin; i++) {
              let pp = px * a[i][k] + qx * a[i][k + 1];
              if (k !== nn - 1) { pp += rx * a[i][k + 2]; a[i][k + 2] -= pp * zz; }
              a[i][k + 1] -= pp * yy; a[i][k] -= pp;
            }
          }
        }
      }
    } while (l < nn - 1);
  }
  return w;
}

export function eigGeneral(A) {
  const n = A.length;
  if (n === 0) return [];
  if (n === 1) return [{ re: A[0][0], im: 0 }];
  return hqr(hessenberg(A));
}

// Spectral abscissa — the stability-determining quantity: max real part of the spectrum.
export function spectralAbscissa(A) {
  return eigGeneral(A).reduce((mx, e) => Math.max(mx, e.re), -Infinity);
}

const Linalg = { clone, identity, transpose, matMul, matVec, inverse, eigSymmetric, eigGeneral, spectralAbscissa };
if (typeof globalThis !== 'undefined') globalThis.Linalg = Linalg;
export default Linalg;
