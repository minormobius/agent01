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
 * The whole curve, cell centres in the unit cube [0, 1]^n, padded with zeros to four coordinates so the page draws
 * the square, the cube and the tesseract the same way. Returns a Float32Array of 4 floats a point.
 */
export function curve4(n, b) {
  const count = cellCount(n, b), s = 1 / 2 ** b;
  const out = new Float32Array(count * 4);
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

/** The tesseract's (or square's, or cube's) 2^n corners and its n·2^(n−1) edges, in the unit cube, padded to 4D. */
export function cube4(n) {
  const verts = [], edges = [];
  for (let v = 0; v < 2 ** n; v++) {
    const p = [0, 0, 0, 0];
    for (let j = 0; j < n; j++) p[j] = (v >> j) & 1;
    verts.push(p);
    for (let j = 0; j < n; j++) if (!((v >> j) & 1)) edges.push([v, v | (1 << j)]);
  }
  return { verts, edges };
}
