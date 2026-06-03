// Shared text → SDF-gradient field baking for the fluoddity text attractor
// (engine constructed with { text:true }). aphid91's recipe: render the string,
// distance-transform it, and bake a texture whose rg = unit direction toward the
// nearest text pixel, b = normalized distance, a = inside mask. The move shader
// reads it and shoves agents toward the text. Used by /text (say) and /read (rsvp).

const FONT = (size) => `800 ${size}px Arial, Helvetica, sans-serif`;

function fitText(ctx, str, S, sizeScale) {
  const maxW = S * 0.9 * sizeScale, maxH = S * 0.86 * sizeScale;
  const words = (str || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return { lines: [], size: 0 };
  let best = { lines: [words.join(' ')], size: 10 };
  for (let size = Math.floor(S * 0.5); size >= 10; size -= 2) {
    ctx.font = FONT(size);
    const lines = []; let cur = words[0];
    for (let i = 1; i < words.length; i++) {
      if (ctx.measureText(cur + ' ' + words[i]).width <= maxW) cur += ' ' + words[i];
      else { lines.push(cur); cur = words[i]; }
    }
    lines.push(cur);
    const widest = Math.max(...lines.map(l => ctx.measureText(l).width));
    const lh = size * 1.12, totalH = lines.length * lh;
    if (widest <= maxW && totalH <= maxH) { best = { lines, size }; break; }
  }
  return best;
}

// Rasterize a string to a binary mask (1 = ink). Square S×S.
export function renderMask(str, S, sizeScale) {
  const c = document.createElement('canvas'); c.width = c.height = S;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, S, S);
  ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const { lines, size } = fitText(ctx, str, S, sizeScale);
  ctx.font = FONT(size);
  const lh = size * 1.12, y0 = S / 2 - (lines.length - 1) * lh / 2;
  lines.forEach((l, i) => ctx.fillText(l, S / 2, y0 + i * lh));
  const img = ctx.getImageData(0, 0, S, S).data;
  const mask = new Uint8Array(S * S);
  for (let i = 0, p = 0; p < S * S; i += 4, p++) mask[p] = img[i] > 128 ? 1 : 0;
  return mask;
}

// 8SSEDT-style distance transform: per pixel, the offset (gx,gy) to the nearest
// ink pixel — distance and direction in one O(N) two-pass sweep. Inlined (no
// per-neighbor closure) so it's fast enough to re-bake every RSVP word.
function edt(mask, W, H) {
  const N = W * H, INF = 1e20;
  const gx = new Float64Array(N), gy = new Float64Array(N);
  for (let i = 0; i < N; i++) { if (mask[i]) { gx[i] = 0; gy[i] = 0; } else { gx[i] = INF; gy[i] = INF; } }
  // forward pass
  for (let y = 0; y < H; y++) {
    const row = y * W;
    for (let x = 0; x < W; x++) {
      const p = row + x; let bx = gx[p], by = gy[p], bd = bx * bx + by * by, ox, oy, d, q;
      if (x > 0) { q = p - 1; ox = gx[q] - 1; oy = gy[q]; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; } }
      if (y > 0) {
        q = p - W; ox = gx[q]; oy = gy[q] - 1; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; }
        if (x > 0) { q = p - W - 1; ox = gx[q] - 1; oy = gy[q] - 1; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; } }
        if (x < W - 1) { q = p - W + 1; ox = gx[q] + 1; oy = gy[q] - 1; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; } }
      }
      gx[p] = bx; gy[p] = by;
    }
    for (let x = W - 2; x >= 0; x--) {
      const p = row + x, q = p + 1, ox = gx[q] + 1, oy = gy[q], d = ox * ox + oy * oy;
      if (d < gx[p] * gx[p] + gy[p] * gy[p]) { gx[p] = ox; gy[p] = oy; }
    }
  }
  // backward pass
  for (let y = H - 1; y >= 0; y--) {
    const row = y * W;
    for (let x = W - 1; x >= 0; x--) {
      const p = row + x; let bx = gx[p], by = gy[p], bd = bx * bx + by * by, ox, oy, d, q;
      if (x < W - 1) { q = p + 1; ox = gx[q] + 1; oy = gy[q]; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; } }
      if (y < H - 1) {
        q = p + W; ox = gx[q]; oy = gy[q] + 1; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; }
        if (x < W - 1) { q = p + W + 1; ox = gx[q] + 1; oy = gy[q] + 1; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; } }
        if (x > 0) { q = p + W - 1; ox = gx[q] - 1; oy = gy[q] + 1; d = ox * ox + oy * oy; if (d < bd) { bx = ox; by = oy; bd = d; } }
      }
      gx[p] = bx; gy[p] = by;
    }
    for (let x = 1; x < W; x++) {
      const p = row + x, q = p - 1, ox = gx[q] - 1, oy = gy[q], d = ox * ox + oy * oy;
      if (d < gx[p] * gx[p] + gy[p] * gy[p]) { gx[p] = ox; gy[p] = oy; }
    }
  }
  return { gx, gy };
}

function bakeSDF(mask, S) {
  const N = S * S, RANGE = S * 0.55;
  const { gx, gy } = edt(mask, S, S);
  const out = new Uint8Array(N * 4);
  for (let ty = 0; ty < S; ty++) for (let tx = 0; tx < S; tx++) {
    const s = (S - 1 - ty) * S + tx;                 // vertical flip → field y-up
    const ox = gx[s], oy = gy[s], d = Math.hypot(ox, oy);
    let dx = 0, dy = 0;
    if (d > 1e-3) { dx = ox / d; dy = -oy / d; }      // dir toward text, y flipped to sim space
    const o = (ty * S + tx) * 4;
    out[o] = (dx * 0.5 + 0.5) * 255 | 0;
    out[o + 1] = (dy * 0.5 + 0.5) * 255 | 0;
    out[o + 2] = Math.min(1, d / RANGE) * 255 | 0;
    out[o + 3] = mask[s] ? 255 : 0;
  }
  return out;
}

// One call: string → baked RGBA field ready for engine.setTextData(arr, S, S).
export function bakeText(str, S, sizeScale = 0.86) {
  return bakeSDF(renderMask(str, S, sizeScale), S);
}
