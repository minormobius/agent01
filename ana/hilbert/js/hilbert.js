// The Hilbert curve in any number of dimensions, after John Skilling, "Programming the Hilbert curve" (AIP Conf.
// Proc. 707, 2004). No DOM: the page draws what this computes, and test/hilbert.selftest.mjs holds it to its claims.
//
// A point of the order-b curve in n dimensions is a cell of the 2^b × … × 2^b grid. Its index along the curve is an
// (n·b)-bit number; Skilling's "transpose" spreads those bits over n words, one bit to each axis in turn from the top,
// and two loops of bit tricks turn that into the cell's coordinates and back. Each pass is O(n·b), with no tables
// and no recursion, so the same code draws the square, the cube and the tesseract.

// The index h's bits, most significant first, dealt round the n axes: axis j gets bits n·b−1−j, n·b−1−j−n, …
function toTranspose(h, n, b) {
  const X = new Array(n).fill(0);
  for (let q = 0; q < b; q++) {
    for (let j = 0; j < n; j++) {
      const bit = (h >>> (n * b - 1 - (q * n + j))) & 1;   // n·b ≤ 30 here, so plain bit ops are exact
      X[j] |= bit << (b - 1 - q);
    }
  }
  return X;
}

function fromTranspose(X, n, b) {
  let h = 0;
  for (let q = 0; q < b; q++)
    for (let j = 0; j < n; j++) h = (h << 1) | ((X[j] >> (b - 1 - q)) & 1);
  return h;
}

/** The cell at index h (0 ≤ h < 2^(n·b)) of the order-b Hilbert curve in n dimensions, as n integers in [0, 2^b). */
export function indexToPoint(h, n, b) {
  if (n * b > 30) throw new RangeError('n·b must be at most 30');
  const X = toTranspose(h, n, b);
  const N = 2 << (b - 1);
  // Gray decode.
  let t = X[n - 1] >> 1;
  for (let i = n - 1; i > 0; i--) X[i] ^= X[i - 1];
  X[0] ^= t;
  // Undo the excess work: at each scale, reflect or exchange the axes below it.
  for (let Q = 2; Q !== N; Q <<= 1) {
    const P = Q - 1;
    for (let i = n - 1; i >= 0; i--) {
      if (X[i] & Q) X[0] ^= P;
      else { t = (X[0] ^ X[i]) & P; X[0] ^= t; X[i] ^= t; }
    }
  }
  return X;
}

/** The inverse: the index along the order-b curve of the cell X (n integers in [0, 2^b)). */
export function pointToIndex(point, n, b) {
  const X = point.slice();
  const M = 1 << (b - 1);
  let t;
  for (let Q = M; Q > 1; Q >>= 1) {
    const P = Q - 1;
    for (let i = 0; i < n; i++) {
      if (X[i] & Q) X[0] ^= P;
      else { t = (X[0] ^ X[i]) & P; X[0] ^= t; X[i] ^= t; }
    }
  }
  // Gray encode.
  for (let i = 1; i < n; i++) X[i] ^= X[i - 1];
  t = 0;
  for (let Q = M; Q > 1; Q >>= 1) if (X[n - 1] & Q) t ^= Q - 1;
  for (let i = 0; i < n; i++) X[i] ^= t;
  return fromTranspose(X, n, b);
}

/** How many cells the order-b curve visits in n dimensions. */
export const cellCount = (n, b) => 2 ** (n * b);

/** The largest order the page offers in n dimensions: 2^20 cells (a million segments) at most. */
export const maxOrder = (n) => Math.max(1, Math.floor(20 / n));

/**
 * The whole curve, cell centres in the unit cube [0, 1]^n, padded to four coordinates with 0.5 (the middle of the unit
 * tesseract) so the page draws the square, the cube and the tesseract the same way, centred. A Float32Array, 4 a point.
 */
export function curve4(n, b) {
  const count = cellCount(n, b), s = 1 / 2 ** b;
  const out = new Float32Array(count * 4).fill(0.5);
  for (let h = 0; h < count; h++) {
    const X = indexToPoint(h, n, b);
    for (let j = 0; j < n; j++) out[h * 4 + j] = (X[j] + 0.5) * s;
  }
  return out;
}

/** The curve's length in the unit cube: every step is one cell, 2^−b long. */
export const curveLength = (n, b) => (cellCount(n, b) - 1) / 2 ** b;

/** The index h written as b digits base 2^n, most significant first: digit k says which of the 2^n sub-cubes at
 *  scale k the cell is in, in the order the curve visits them. */
export function digits(h, n, b) {
  const base = 2 ** n, out = [];
  for (let k = 0; k < b; k++) { out.unshift(h % base); h = Math.floor(h / base); }
  return out;
}

// ---------------------------------------------------------------- 4D view --
// The six planes of rotation in four dimensions, as index pairs into (x, y, z, w).
export const PLANES = [['xy', 0, 1], ['xz', 0, 2], ['xw', 0, 3], ['yz', 1, 2], ['yw', 1, 3], ['zw', 2, 3]];

/** A 4×4 rotation (row-major, Float32Array(16)) composed from one angle per plane, in PLANES order. */
export function rotation4(angles) {
  let M = identity4();
  PLANES.forEach(([, a, b], k) => {
    const th = angles[k] || 0;
    if (!th) return;
    const R = identity4(), c = Math.cos(th), s = Math.sin(th);
    R[a * 4 + a] = c; R[a * 4 + b] = -s; R[b * 4 + a] = s; R[b * 4 + b] = c;
    M = mul4(R, M);
  });
  return M;
}

export function identity4() { const I = new Float32Array(16); I[0] = I[5] = I[10] = I[15] = 1; return I; }

export function mul4(A, B) {
  const C = new Float32Array(16);
  for (let i = 0; i < 4; i++)
    for (let j = 0; j < 4; j++) {
      let s = 0;
      for (let k = 0; k < 4; k++) s += A[i * 4 + k] * B[k * 4 + j];
      C[i * 4 + j] = s;
    }
  return C;
}

/** Turn a rotation by a small angle in one plane, applied in the viewer's frame (so dragging always turns what you see). */
export function turn4(M, a, b, th) {
  const R = identity4(), c = Math.cos(th), s = Math.sin(th);
  R[a * 4 + a] = c; R[a * 4 + b] = -s; R[b * 4 + a] = s; R[b * 4 + b] = c;
  return orthonormalize(mul4(R, M));
}

// Gram–Schmidt on the rows, so a rotation turned a thousand times a minute stays a rotation.
function orthonormalize(M) {
  for (let i = 0; i < 4; i++) {
    for (let k = 0; k < i; k++) {
      let d = 0;
      for (let j = 0; j < 4; j++) d += M[i * 4 + j] * M[k * 4 + j];
      for (let j = 0; j < 4; j++) M[i * 4 + j] -= d * M[k * 4 + j];
    }
    let n = 0;
    for (let j = 0; j < 4; j++) n += M[i * 4 + j] ** 2;
    n = Math.sqrt(n);
    for (let j = 0; j < 4; j++) M[i * 4 + j] /= n;
  }
  return M;
}

/** The tesseract's (or square's, or cube's) 2^n corners and its n·2^(n−1) edges, in the unit cube, padded to 4D with 0.5. */
export function cube4(n) {
  const verts = [], edges = [];
  for (let v = 0; v < 2 ** n; v++) {
    const p = [0.5, 0.5, 0.5, 0.5];
    for (let j = 0; j < n; j++) p[j] = (v >> j) & 1;
    verts.push(p);
    for (let j = 0; j < n; j++) if (!((v >> j) & 1)) edges.push([v, v | (1 << j)]);
  }
  return { verts, edges };
}

// ------------------------------------------------------------- the slice --
// The slice view cuts the curve's hypertubes (every point within ρ of the path, a 4D capsule chain) with a hyperplane
// and draws the 3D cross-section. The shader finds it by walking each pixel's ray, which lies in the slice, through the
// 4D grid cell by cell; in each cell it tests the two half-tubes that leave the cell's centre for its neighbours on the
// path. traceTubes below is that walk, line for line, and the selftest holds it to brute force over every segment.

/** Cells per axis: 2^b along the curve's n axes, one cell spanning [0, 1] along each padded axis. */
export const gridSize = (n, b) => [0, 1, 2, 3].map((j) => (j < n ? 2 ** b : 1));

/** A cell's place in the links array: x fastest, then y, z, w. */
export const linearCell = (X, sz) => (X[0] | 0) + sz[0] * ((X[1] | 0) + sz[1] * ((X[2] | 0) + sz[2] * (X[3] | 0)));

/** Direction codes: d = 2·axis + (1 if the step is +, 0 if −); 15 means none (the path's two ends). */
export const NONE = 15;
function dirCode(from, to) {
  for (let j = 0; j < from.length; j++) if (to[j] !== from[j]) return 2 * j + (to[j] > from[j] ? 1 : 0);
  return NONE;
}

/**
 * Per cell, one 32-bit word: (h << 8) | (prev << 4) | next, h the cell's index along the path and prev, next the
 * direction codes to the cells before and after it. The page uploads it as an R32UI texture `width` texels wide.
 */
export function cellLinks(n, b) {
  const N = cellCount(n, b), sz = gridSize(n, b), out = new Uint32Array(N);
  let prev = null, cur = indexToPoint(0, n, b);
  for (let h = 0; h < N; h++) {
    const next = h < N - 1 ? indexToPoint(h + 1, n, b) : null;
    const pd = prev ? dirCode(cur, prev) : NONE, nd = next ? dirCode(cur, next) : NONE;
    out[linearCell([...cur, 0, 0, 0].slice(0, 4), sz)] = ((h << 8) | (pd << 4) | nd) >>> 0;
    prev = cur; cur = next;
  }
  return out;
}

/** The first t ≥ 0 at which the ray ro + t·rd (rd a unit vector) enters the capsule body from pa to pb, or the ball
 *  of radius ra round pa; Infinity if neither. The ball at pb is left to the neighbouring cell. */
export function hitHalf(ro, rd, pa, pb, ra) {
  let baba = 0, bard = 0, baoa = 0, rdoa = 0, oaoa = 0;
  for (let j = 0; j < 4; j++) {
    const ba = pb[j] - pa[j], oa = ro[j] - pa[j];
    baba += ba * ba; bard += ba * rd[j]; baoa += ba * oa; rdoa += rd[j] * oa; oaoa += oa * oa;
  }
  let best = Infinity;
  const a = baba - bard * bard;
  if (a > 1e-12) {
    const bq = baba * rdoa - baoa * bard, c = baba * oaoa - baoa * baoa - ra * ra * baba, h = bq * bq - a * c;
    if (h >= 0) {
      const t = (-bq - Math.sqrt(h)) / a, y = baoa + t * bard;
      if (y >= 0 && y <= baba && t >= 0) best = t;
    }
  }
  const hh = rdoa * rdoa - (oaoa - ra * ra);
  if (hh >= 0) { const t = -rdoa - Math.sqrt(hh); if (t >= 0 && t < best) best = t; }
  return best;
}

/**
 * Walk the ray through the grid (Amanatides–Woo in four dimensions) and return the first hit on the tubes of radius
 * rho round the path's first `shown` steps: { t, h, code } (code the half-tube's direction, NONE for the ball), or null.
 * Coordinates are the unit tesseract's; rd must be a unit vector.
 */
export function traceTubes(links, n, b, ro, rd, rho, shown = Infinity) {
  const sz = gridSize(n, b), cs = sz.map((s) => 1 / s);
  let t0 = -Infinity, t1 = Infinity;
  for (let j = 0; j < 4; j++) {
    if (Math.abs(rd[j]) < 1e-12) { if (ro[j] < 0 || ro[j] > 1) return null; continue; }
    const a = -ro[j] / rd[j], c = (1 - ro[j]) / rd[j];
    t0 = Math.max(t0, Math.min(a, c)); t1 = Math.min(t1, Math.max(a, c));
  }
  if (t1 < Math.max(t0, 0)) return null;
  const tStart = Math.max(t0, 0);
  const cell = [], step = [], tMax = [], tDelta = [];
  for (let j = 0; j < 4; j++) {
    const x = ro[j] + rd[j] * (tStart + 1e-9);
    cell[j] = Math.min(sz[j] - 1, Math.max(0, Math.floor(x / cs[j])));
    step[j] = rd[j] > 0 ? 1 : -1;
    if (Math.abs(rd[j]) < 1e-12) { tMax[j] = Infinity; tDelta[j] = Infinity; }
    else { tMax[j] = ((cell[j] + (rd[j] > 0 ? 1 : 0)) * cs[j] - ro[j]) / rd[j]; tDelta[j] = cs[j] / Math.abs(rd[j]); }
  }
  const limit = sz.reduce((s, v) => s + v, 0) + 4;
  for (let it = 0; it < limit; it++) {
    const tExit = Math.min(t1, ...tMax);
    const v = links[linearCell(cell, sz)], h = v >>> 8;
    if (h <= shown) {
      const c = cell.map((k, j) => (k + 0.5) * cs[j]);
      let best = Infinity, bestCode = NONE;
      for (const [code, isNext] of [[(v >>> 4) & 15, false], [v & 15, true]]) {
        if (isNext && h >= shown) continue;
        const pb = c.slice();
        if (code !== NONE) { const j = code >> 1; pb[j] += (code & 1 ? 0.5 : -0.5) * cs[j]; }
        const t = hitHalf(ro, rd, c, pb, rho);
        if (t < best) { best = t; bestCode = code; }
      }
      if (best <= tExit + 1e-9) return { t: best, h, code: bestCode };
    }
    let k = 0;
    for (let j = 1; j < 4; j++) if (tMax[j] < tMax[k]) k = j;
    if (tMax[k] > t1) break;
    cell[k] += step[k];
    if (cell[k] < 0 || cell[k] >= sz[k]) break;
    tMax[k] += tDelta[k];
  }
  return null;
}
