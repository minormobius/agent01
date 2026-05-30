// Median-cut palette extraction + histogram, all from a downscaled copy of
// the photo on a 2D canvas.

function downscale(image, max = 160) {
  const r = Math.min(max / image.width, max / image.height, 1);
  const w = Math.max(1, Math.round(image.width * r));
  const h = Math.max(1, Math.round(image.height * r));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

// Median-cut into `count` representative colors.
export function extractPalette(image, count = 8) {
  const { data } = downscale(image, 160);
  const pixels = [];
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    pixels.push([data[i], data[i + 1], data[i + 2]]);
  }
  if (pixels.length === 0) return [[20, 20, 30]];

  let boxes = [pixels];
  while (boxes.length < count) {
    // Split the box with the largest channel range.
    let bi = -1, bestRange = -1, bestCh = 0;
    for (let i = 0; i < boxes.length; i++) {
      if (boxes[i].length < 2) continue;
      const { range, ch } = channelRange(boxes[i]);
      if (range > bestRange) { bestRange = range; bi = i; bestCh = ch; }
    }
    if (bi < 0) break;
    const box = boxes[bi];
    box.sort((a, b) => a[bestCh] - b[bestCh]);
    const mid = box.length >> 1;
    boxes.splice(bi, 1, box.slice(0, mid), box.slice(mid));
  }

  const swatches = boxes.map(avgColor);
  // Sort by luminance for a coherent gradient.
  swatches.sort((a, b) => luma(a) - luma(b));
  return swatches;
}

function channelRange(box) {
  const min = [255, 255, 255], max = [0, 0, 0];
  for (const px of box) {
    for (let c = 0; c < 3; c++) {
      if (px[c] < min[c]) min[c] = px[c];
      if (px[c] > max[c]) max[c] = px[c];
    }
  }
  let ch = 0, range = -1;
  for (let c = 0; c < 3; c++) {
    const r = max[c] - min[c];
    if (r > range) { range = r; ch = c; }
  }
  return { range, ch };
}

function avgColor(box) {
  const s = [0, 0, 0];
  for (const px of box) { s[0] += px[0]; s[1] += px[1]; s[2] += px[2]; }
  const n = box.length || 1;
  return [Math.round(s[0] / n), Math.round(s[1] / n), Math.round(s[2] / n)];
}

function luma(c) { return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }

// Build a 256-entry RGBA gradient by interpolating sorted swatches.
export function paletteToGradient(swatches) {
  const out = new Uint8Array(256 * 4);
  const n = swatches.length;
  for (let i = 0; i < 256; i++) {
    const t = i / 255 * (n - 1);
    const a = Math.floor(t), b = Math.min(n - 1, a + 1);
    const f = t - a;
    for (let c = 0; c < 3; c++) {
      out[i * 4 + c] = Math.round(swatches[a][c] * (1 - f) + swatches[b][c] * f);
    }
    out[i * 4 + 3] = 255;
  }
  return out;
}

// Compute per-channel histograms (256 bins each) on a downscaled copy.
export function computeHistogram(image) {
  const { data } = downscale(image, 200);
  const r = new Float32Array(256), g = new Float32Array(256), b = new Float32Array(256), l = new Float32Array(256);
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 8) continue;
    r[data[i]]++; g[data[i + 1]]++; b[data[i + 2]]++;
    const lum = Math.round(0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]);
    l[lum]++;
  }
  return { r, g, b, l };
}

export function drawHistogram(canvas, hist, channel = 'l') {
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);
  const channels = channel === 'rgb'
    ? [['r', 'rgba(230,90,90,0.7)'], ['g', 'rgba(90,210,120,0.7)'], ['b', 'rgba(110,140,240,0.7)']]
    : [[channel, 'rgba(200,200,220,0.85)']];

  for (const [ch, color] of channels) {
    const arr = hist[ch];
    let max = 0;
    for (let i = 0; i < 256; i++) if (arr[i] > max) max = arr[i];
    if (max === 0) continue;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * W;
      const y = H - (arr[i] / max) * H;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }
}

export function rgbToHex(c) {
  return '#' + c.map(v => v.toString(16).padStart(2, '0')).join('');
}
