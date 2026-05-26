// Build a signed distance field (SDF) from a photo for the shape-conform
// fractal mode. The photo is thresholded into a binary mask, recentered on
// the foreground centroid (so the origin sits inside the shape — required by
// the shape-modulus map), and turned into a signed Euclidean distance field
// via Felzenszwalb & Huttenlocher's exact transform.
//
// Output is an 8-bit RGBA texture where the (grayscale) value encodes signed
// distance remapped to [0,1] over [-R, R] complex units (0.5 = on the
// surface). The shader decodes phi = (value*2 - 1) * R.

const INF = 1e20;

// 1D squared-distance transform of a row/column of costs (0 = object).
function edt1d(f, n) {
  const d = new Float64Array(n);
  const v = new Int32Array(n);
  const z = new Float64Array(n + 1);
  let k = 0;
  v[0] = 0; z[0] = -INF; z[1] = INF;
  for (let q = 1; q < n; q++) {
    let s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    while (s <= z[k]) {
      k--;
      s = ((f[q] + q * q) - (f[v[k]] + v[k] * v[k])) / (2 * q - 2 * v[k]);
    }
    k++; v[k] = q; z[k] = s; z[k + 1] = INF;
  }
  k = 0;
  for (let q = 0; q < n; q++) {
    while (z[k + 1] < q) k++;
    d[q] = (q - v[k]) * (q - v[k]) + f[v[k]];
  }
  return d;
}

// 2D squared EDT in place. grid: Float64Array(W*H), 0 = object, INF = empty.
function edt2d(grid, W, H) {
  const col = new Float64Array(H);
  const tmp = new Float64Array(W * H);
  for (let x = 0; x < W; x++) {
    for (let y = 0; y < H; y++) col[y] = grid[y * W + x];
    const d = edt1d(col, H);
    for (let y = 0; y < H; y++) tmp[y * W + x] = d[y];
  }
  const row = new Float64Array(W);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) row[x] = tmp[y * W + x];
    const d = edt1d(row, W);
    for (let x = 0; x < W; x++) grid[y * W + x] = d[x];
  }
  return grid;
}

// Build the SDF texture. Returns { rgba: Uint8Array, size, R }.
export function buildSDF(image, { threshold = 0.5, invert = false, size = 256, R = 1.6 } = {}) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, size, size);
  // contain-fit the image, centered
  const r = Math.min(size / image.width, size / image.height);
  const w = image.width * r, h = image.height * r;
  ctx.drawImage(image, (size - w) / 2, (size - h) / 2, w, h);
  const { data } = ctx.getImageData(0, 0, size, size);

  // Binary mask via luminance threshold (XOR invert).
  const mask = new Uint8Array(size * size);
  let cx = 0, cy = 0, count = 0;
  for (let i = 0; i < size * size; i++) {
    const lum = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
    const fg = (lum >= threshold) !== invert;
    if (fg) {
      mask[i] = 1;
      cx += i % size; cy += (i / size) | 0; count++;
    }
  }

  // Recenter on centroid so the origin is inside the shape.
  let shifted = mask;
  if (count > 0) {
    const dx = Math.round(size / 2 - cx / count);
    const dy = Math.round(size / 2 - cy / count);
    if (dx !== 0 || dy !== 0) {
      shifted = new Uint8Array(size * size);
      for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const sx = x - dx, sy = y - dy;
          if (sx >= 0 && sx < size && sy >= 0 && sy < size) {
            shifted[y * size + x] = mask[sy * size + sx];
          }
        }
      }
    }
  }

  // EDT of foreground (distance to nearest fg) and background.
  const gFg = new Float64Array(size * size);
  const gBg = new Float64Array(size * size);
  for (let i = 0; i < size * size; i++) {
    gFg[i] = shifted[i] ? 0 : INF;   // object = foreground
    gBg[i] = shifted[i] ? INF : 0;   // object = background
  }
  edt2d(gFg, size, size);
  edt2d(gBg, size, size);

  const pxToComplex = (2 * R) / size;
  const rgba = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    // signed: + outside (dist to fg), - inside (dist to bg)
    const signedPx = Math.sqrt(gFg[i]) - Math.sqrt(gBg[i]);
    const signed = signedPx * pxToComplex;
    let v = 0.5 + signed / (2 * R);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    const b = Math.round(v * 255);
    rgba[i * 4] = b; rgba[i * 4 + 1] = b; rgba[i * 4 + 2] = b; rgba[i * 4 + 3] = 255;
  }
  return { rgba, size, R };
}
