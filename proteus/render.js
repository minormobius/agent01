// render.js — rasterize sensor nodes into a 2D map and compose the four
// channels into a single ImageData, plus a drifting texture overlay.
//
// The four channel colors (must match index.html toolbar swatches):
//   adhesion = warm orange   (240, 160, 80)
//   light    = pale yellow   (248, 240, 168)
//   chemistry = green        (112, 208, 136)
//   tension  = magenta       (216, 112, 200)
//
// We splat each node onto a low-resolution grid (gridW * gridH) per channel
// using a small Gaussian kernel. Weighted average per cell. Then compose into
// an RGBA buffer and scale up to the display canvas with smoothing on.

const GRID_W = 128;
const GRID_H = 64;
const SPLAT_RADIUS = 7;   // in grid cells
const COLOR = {
  adhesion: [240, 160,  80],
  light:    [248, 240, 168],
  chem:     [112, 208, 136],
  tension:  [216, 112, 200],
};

// Cached splat kernel (Gaussian, radius SPLAT_RADIUS, normalized to peak 1).
const KERNEL = (() => {
  const r = SPLAT_RADIUS;
  const size = 2 * r + 1;
  const k = new Float32Array(size * size);
  const sigma = r / 2.0;
  const invSig2 = 1 / (2 * sigma * sigma);
  for (let y = -r; y <= r; y++) {
    for (let x = -r; x <= r; x++) {
      const d2 = x * x + y * y;
      k[(y + r) * size + (x + r)] = Math.exp(-d2 * invSig2);
    }
  }
  return { data: k, r, size };
})();

// Small value-noise texture for the membrane flow overlay. Generated once.
function makeNoiseCanvas(w, h, seed) {
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(w, h);
  let s = seed >>> 0;
  function rng() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  // Sparse blob noise, smoothed by averaging.
  const f = new Float32Array(w * h);
  for (let i = 0; i < 220; i++) {
    const bx = Math.floor(rng() * w);
    const by = Math.floor(rng() * h);
    const br = 3 + Math.floor(rng() * 8);
    const amp = (rng() - 0.5) * 1.4;
    for (let yy = -br; yy <= br; yy++) {
      for (let xx = -br; xx <= br; xx++) {
        const d2 = xx * xx + yy * yy;
        if (d2 > br * br) continue;
        const x = (bx + xx + w) % w;
        const y = by + yy;
        if (y < 0 || y >= h) continue;
        f[y * w + x] += amp * (1 - d2 / (br * br));
      }
    }
  }
  // Simple box blur a couple of times for smoothness.
  const tmp = new Float32Array(w * h);
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0, n = 0;
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy;
          if (yy < 0 || yy >= h) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const xx = (x + dx + w) % w;
            sum += f[yy * w + xx]; n++;
          }
        }
        tmp[y * w + x] = sum / n;
      }
    }
    f.set(tmp);
  }
  // Normalize to ~[0, 1].
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < f.length; i++) {
    if (f[i] < lo) lo = f[i];
    if (f[i] > hi) hi = f[i];
  }
  const range = (hi - lo) || 1;
  for (let i = 0; i < f.length; i++) {
    const v = (f[i] - lo) / range;
    const g = Math.floor(v * 255);
    const p = i * 4;
    img.data[p]     = g;
    img.data[p + 1] = g;
    img.data[p + 2] = g;
    img.data[p + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

// Solid-noise canvas for the "detached" static effect on the adhesion channel.
function makeStaticCanvas(w, h) {
  const cnv = document.createElement('canvas');
  cnv.width = w; cnv.height = h;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(w, h);
  // Cycled on every render.
  return { cnv, ctx, img };
}

export function createRenderer({ canvas }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  // Offscreen compositor at low-res.
  const offCnv = document.createElement('canvas');
  offCnv.width = GRID_W; offCnv.height = GRID_H;
  const offCtx = offCnv.getContext('2d');
  const offImg = offCtx.createImageData(GRID_W, GRID_H);

  // Per-channel accumulators (value-weighted sums and weight totals).
  const channels = ['adhesion', 'light', 'chem', 'tension'];
  const accVal = {};
  const accW   = new Float32Array(GRID_W * GRID_H);
  for (const c of channels) accVal[c] = new Float32Array(GRID_W * GRID_H);

  // Wrinkle accumulator (modulates the texture overlay).
  const wrinkleGrid = new Float32Array(GRID_W * GRID_H);

  const texture = makeNoiseCanvas(GRID_W, GRID_H, 0x4a017b);
  const staticBuf = makeStaticCanvas(GRID_W, GRID_H);

  return {
    canvas, ctx,
    offCnv, offCtx, offImg,
    accVal, accW, wrinkleGrid,
    texture, staticBuf,
    width: canvas.width, height: canvas.height,
    resize(w, h) { this.width = w; this.height = h; },
  };
}

// Splat a single node onto the low-res grid using the cached Gaussian kernel.
// Handles horizontal wrap (mapU is azimuth and wraps).
function splat(renderer, n, channel) {
  const accV = renderer.accVal[channel];
  const accW = renderer.accW;
  const value = n[channel];
  if (value <= 0.001) {
    // Still contribute weight so background reads as 0 cleanly; skip cheap.
    // (We rely on other splats to provide the weight; avoid wasted work.)
    return;
  }
  const cx = n.mapU * GRID_W;
  const cy = n.mapV * GRID_H;
  const K = KERNEL.data;
  const r = KERNEL.r;
  const size = KERNEL.size;
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  for (let dy = -r; dy <= r; dy++) {
    const y = iy + dy;
    if (y < 0 || y >= GRID_H) continue;
    const krow = (dy + r) * size;
    const row = y * GRID_W;
    for (let dx = -r; dx <= r; dx++) {
      let x = ix + dx;
      if (x < 0) x += GRID_W;
      else if (x >= GRID_W) x -= GRID_W;
      const w = K[krow + (dx + r)];
      accV[row + x] += value * w;
      // Weight accumulated only once per pass via the dedicated weight loop below.
      // (We use a separate pass to avoid quadrupling weight.)
    }
  }
}

// Splat just the geometric weight (one pass per node, shared across channels).
function splatWeight(renderer, n) {
  const accW = renderer.accW;
  const cx = n.mapU * GRID_W;
  const cy = n.mapV * GRID_H;
  const K = KERNEL.data;
  const r = KERNEL.r;
  const size = KERNEL.size;
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  for (let dy = -r; dy <= r; dy++) {
    const y = iy + dy;
    if (y < 0 || y >= GRID_H) continue;
    const krow = (dy + r) * size;
    const row = y * GRID_W;
    for (let dx = -r; dx <= r; dx++) {
      let x = ix + dx;
      if (x < 0) x += GRID_W;
      else if (x >= GRID_W) x -= GRID_W;
      accW[row + x] += K[krow + (dx + r)];
    }
  }
}

// Splat wrinkle accumulator (independent — uses its own grid).
function splatWrinkle(renderer, n) {
  const grid = renderer.wrinkleGrid;
  const cx = n.mapU * GRID_W;
  const cy = n.mapV * GRID_H;
  const K = KERNEL.data;
  const r = KERNEL.r;
  const size = KERNEL.size;
  const ix = Math.floor(cx);
  const iy = Math.floor(cy);
  const v = n.wrinkle;
  if (v <= 0.001) return;
  for (let dy = -r; dy <= r; dy++) {
    const y = iy + dy;
    if (y < 0 || y >= GRID_H) continue;
    const krow = (dy + r) * size;
    const row = y * GRID_W;
    for (let dx = -r; dx <= r; dx++) {
      let x = ix + dx;
      if (x < 0) x += GRID_W;
      else if (x >= GRID_W) x -= GRID_W;
      grid[row + x] += v * K[krow + (dx + r)];
    }
  }
}

// Main render pass.
export function render(renderer, sim, { channels: enabled, showTexture }) {
  const { offImg, accVal, accW, wrinkleGrid } = renderer;
  const data = offImg.data;
  const nodes = sim.nodes;
  const N = sim.N;

  // Reset accumulators.
  accW.fill(0);
  wrinkleGrid.fill(0);
  for (const c of Object.keys(accVal)) accVal[c].fill(0);

  // Splat weights once, then each enabled channel.
  for (let i = 0; i < N; i++) splatWeight(renderer, nodes[i]);
  if (enabled.adhesion) for (let i = 0; i < N; i++) splat(renderer, nodes[i], 'adhesion');
  if (enabled.light)    for (let i = 0; i < N; i++) splat(renderer, nodes[i], 'light');
  if (enabled.chem)     for (let i = 0; i < N; i++) splat(renderer, nodes[i], 'chem');
  if (enabled.tension)  for (let i = 0; i < N; i++) splat(renderer, nodes[i], 'tension');
  for (let i = 0; i < N; i++) splatWrinkle(renderer, nodes[i]);

  // Compose. For each cell, average each enabled channel by its color and
  // additively composite onto a dark background.
  const detached = sim.detached;
  const bgR = 8, bgG = 11, bgB = 14;
  const cellCount = GRID_W * GRID_H;

  // Pre-fetch color triples for branches.
  const cAdh = COLOR.adhesion, cLi = COLOR.light, cCh = COLOR.chem, cTe = COLOR.tension;

  for (let p = 0; p < cellCount; p++) {
    const w = accW[p];
    let r = bgR, g = bgG, b = bgB;
    if (w > 0.001) {
      const inv = 1 / w;
      let a = 0, l = 0, k = 0, t = 0;
      if (enabled.adhesion) a = accVal.adhesion[p] * inv;
      if (enabled.light)    l = accVal.light[p]    * inv;
      if (enabled.chem)     k = accVal.chem[p]     * inv;
      if (enabled.tension)  t = accVal.tension[p]  * inv;
      // Optional: "detached" replaces adhesion with TV static.
      if (enabled.adhesion && detached) {
        a = Math.random() * 0.9;
      }
      // Additive compositing, soft-clipped per channel.
      r += a * cAdh[0] + l * cLi[0] + k * cCh[0] + t * cTe[0];
      g += a * cAdh[1] + l * cLi[1] + k * cCh[1] + t * cTe[1];
      b += a * cAdh[2] + l * cLi[2] + k * cCh[2] + t * cTe[2];
      // Soft tone-map via x / (x + K) so highlights don't blow.
      const K = 320;
      r = (r * K) / (r + K) * 1.6;
      g = (g * K) / (g + K) * 1.6;
      b = (b * K) / (b + K) * 1.6;
    }
    const o = p * 4;
    data[o]     = r > 255 ? 255 : r | 0;
    data[o + 1] = g > 255 ? 255 : g | 0;
    data[o + 2] = b > 255 ? 255 : b | 0;
    data[o + 3] = 255;
  }
  renderer.offCtx.putImageData(offImg, 0, 0);

  // --- Draw to display canvas with bilinear upscaling. ------------------
  const { ctx, canvas } = renderer;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#07090c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.offCnv, 0, 0, canvas.width, canvas.height);

  // --- Membrane texture overlay (advected noise). -----------------------
  if (showTexture && !detached) {
    const phase = sim.flowPhase || 0;
    const shiftPx = Math.floor(phase * canvas.width);
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.globalCompositeOperation = 'overlay';
    // Tile twice for the horizontal wrap.
    ctx.drawImage(renderer.texture, -shiftPx, 0, canvas.width, canvas.height);
    ctx.drawImage(renderer.texture, canvas.width - shiftPx, 0, canvas.width, canvas.height);
    ctx.restore();

    // Wrinkle accent: where wrinkleGrid is high, draw a darker mottling. We
    // render this as a quick second pass via an offscreen ImageData.
    // (Cheap version: re-purpose offImg space.)
    let hasWrinkle = false;
    for (let p = 0; p < cellCount; p++) {
      const v = Math.min(1, wrinkleGrid[p] * 0.5);
      const o = p * 4;
      data[o]     = 0;
      data[o + 1] = 0;
      data[o + 2] = 0;
      data[o + 3] = Math.floor(v * 180);
      if (v > 0.05) hasWrinkle = true;
    }
    if (hasWrinkle) {
      renderer.offCtx.putImageData(offImg, 0, 0);
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.globalCompositeOperation = 'multiply';
      ctx.drawImage(renderer.offCnv, 0, 0, canvas.width, canvas.height);
      ctx.restore();
    }
  } else if (showTexture && detached) {
    // Subtle TV-static overlay so the player feels the loss of traction.
    const { ctx: sctx, img: simg, cnv: scnv } = renderer.staticBuf;
    const d = simg.data;
    for (let p = 0; p < d.length; p += 4) {
      const v = (Math.random() * 255) | 0;
      d[p] = v; d[p + 1] = v; d[p + 2] = v; d[p + 3] = 90;
    }
    sctx.putImageData(simg, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(scnv, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}
