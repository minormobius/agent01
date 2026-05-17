// render.js — compose the four-channel map from per-node readings + virtual
// pole readings, with horizontal-wrap interpolation and a drifting texture
// layer. Also draws an optional top-down debug view (world + cell polyline +
// sensor dots) so the projection can be sanity-checked.
//
// Model:
//   - Each sensor node sits on the equator (mapV = 0.5) at its azimuth around
//     the cell centroid (mapU = angle / 2pi).
//   - Two virtual poles (north = dorsal, south = ventral) carry per-channel
//     scalars sampled at the centroid (set in sim.js each tick).
//   - For each output pixel:
//       equator_value(U) = interp of nodes nearest in azimuth
//       pole_value(V)    = north for V < 0.5, south for V > 0.5
//       result(U, V)     = equator * eqWeight(V) + pole * (1 - eqWeight(V))
//                          eqWeight peaks at V = 0.5 (skirt), falls to 0 at the poles.

const GRID_W = 192;
const GRID_H = 96;
const TWO_PI = Math.PI * 2;

const COLOR = {
  adhesion: [240, 160,  80],
  light:    [248, 240, 168],
  chem:     [112, 208, 136],
  tension:  [216, 112, 200],
};

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

// Cached top-down view of the world: substrate adhesion as warm wash, light
// as pale wash, chemistry as green wash, obstacles near-black. Generated once.
function makeWorldBitmap(world) {
  const cnv = document.createElement('canvas');
  cnv.width = world.w; cnv.height = world.h;
  const ctx = cnv.getContext('2d');
  const img = ctx.createImageData(world.w, world.h);
  const data = img.data;
  for (let i = 0; i < world.w * world.h; i++) {
    const a = world.adhesion[i];
    const l = world.light[i];
    const k = world.chem[i];
    const ob = world.obstacle[i];
    let r = 18 + a * 110 + l * 50 + k * 14;
    let g = 22 + a *  78 + l * 60 + k * 90;
    let b = 30 + a *  40 + l * 80 + k * 56;
    if (ob) { r *= 0.18; g *= 0.18; b *= 0.20; }
    const o = i * 4;
    data[o]     = r > 255 ? 255 : r | 0;
    data[o + 1] = g > 255 ? 255 : g | 0;
    data[o + 2] = b > 255 ? 255 : b | 0;
    data[o + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return cnv;
}

export function createRenderer({ canvas, world }) {
  const ctx = canvas.getContext('2d', { alpha: false });
  const offCnv = document.createElement('canvas');
  offCnv.width = GRID_W; offCnv.height = GRID_H;
  const offCtx = offCnv.getContext('2d');
  const offImg = offCtx.createImageData(GRID_W, GRID_H);

  const channels = ['adhesion', 'light', 'chem', 'tension'];
  const eqVal = {};
  const eqWt  = new Float32Array(GRID_W);
  for (const c of channels) eqVal[c] = new Float32Array(GRID_W);
  const eqWrinkle = new Float32Array(GRID_W);

  // Reused scratch for the wrinkle overlay.
  const staticCnv = document.createElement('canvas');
  staticCnv.width = GRID_W; staticCnv.height = GRID_H;
  const staticCtx = staticCnv.getContext('2d');
  const staticImg = staticCtx.createImageData(GRID_W, GRID_H);

  const texture = makeNoiseCanvas(GRID_W, GRID_H, 0x4a017b);
  const worldBmp = world ? makeWorldBitmap(world) : null;

  return {
    canvas, ctx,
    offCnv, offCtx, offImg,
    eqVal, eqWt, eqWrinkle,
    staticCnv, staticCtx, staticImg,
    texture, worldBmp, world,
    width: canvas.width, height: canvas.height,
    resize(w, h) { this.width = w; this.height = h; },
  };
}

// Splat one node's reading into the equator LUT with linear interpolation
// between its two flanking bins (horizontal wrap).
function binSplat(eqVal, eqWt, eqWrinkle, n) {
  const u = n.mapU * GRID_W;
  const lo = Math.floor(u);
  const fr = u - lo;
  const il = ((lo % GRID_W) + GRID_W) % GRID_W;
  const ih = (il + 1) % GRID_W;
  const wl = 1 - fr;
  const wh = fr;
  eqWt[il] += wl;       eqWt[ih] += wh;
  eqVal.adhesion[il] += n.adhesion * wl; eqVal.adhesion[ih] += n.adhesion * wh;
  eqVal.light[il]    += n.light    * wl; eqVal.light[ih]    += n.light    * wh;
  eqVal.chem[il]     += n.chem     * wl; eqVal.chem[ih]     += n.chem     * wh;
  eqVal.tension[il]  += n.tension  * wl; eqVal.tension[ih]  += n.tension  * wh;
  eqWrinkle[il]      += n.wrinkle  * wl; eqWrinkle[ih]      += n.wrinkle  * wh;
}

// In-place [1 2 1]/4 smoothing along a ring buffer.
function smoothRing(arr, passes = 3) {
  const n = arr.length;
  const tmp = new Float32Array(n);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < n; i++) {
      const prev = arr[(i - 1 + n) % n];
      const cur  = arr[i];
      const next = arr[(i + 1) % n];
      tmp[i] = (prev + cur * 2 + next) * 0.25;
    }
    arr.set(tmp);
  }
}

export function render(renderer, sim, opts) {
  if (opts && opts.debug) return renderDebug(renderer, sim, opts);
  return renderMap(renderer, sim, opts);
}

function renderMap(renderer, sim, { channels: enabled, showTexture }) {
  const { offImg, eqVal, eqWt, eqWrinkle } = renderer;
  const data = offImg.data;
  const nodes = sim.nodes;
  const N = sim.N;
  const detached = sim.detached;

  // --- 1. Build the equator LUT. ---------------------------------------
  eqWt.fill(0);
  eqWrinkle.fill(0);
  eqVal.adhesion.fill(0); eqVal.light.fill(0); eqVal.chem.fill(0); eqVal.tension.fill(0);
  for (let i = 0; i < N; i++) binSplat(eqVal, eqWt, eqWrinkle, nodes[i]);

  // Normalize per bin so dense azimuth ranges don't bias the average.
  for (let u = 0; u < GRID_W; u++) {
    const w = eqWt[u];
    if (w > 0.001) {
      const iw = 1 / w;
      eqVal.adhesion[u] *= iw;
      eqVal.light[u]    *= iw;
      eqVal.chem[u]     *= iw;
      eqVal.tension[u]  *= iw;
      eqWrinkle[u]      *= iw;
    }
  }
  smoothRing(eqVal.adhesion);
  smoothRing(eqVal.light);
  smoothRing(eqVal.chem);
  smoothRing(eqVal.tension);
  smoothRing(eqWrinkle, 2);

  // --- 2. Compose. -----------------------------------------------------
  const pS = sim.poleSouth || { adhesion: 0, light: 0, chem: 0, tension: 0 };
  const pN = sim.poleNorth || { adhesion: 0, light: 0, chem: 0, tension: 0 };
  const cA = COLOR.adhesion, cL = COLOR.light, cK = COLOR.chem, cT = COLOR.tension;
  const showA = enabled.adhesion, showL = enabled.light, showK = enabled.chem, showT = enabled.tension;
  const bgR = 8, bgG = 11, bgB = 14;

  for (let y = 0; y < GRID_H; y++) {
    // v = 0 at top (north / dorsal), 1 at bottom (south / ventral).
    const v = y / (GRID_H - 1);
    const eqW = Math.sin(v * Math.PI);        // peaks 1.0 at equator
    const poleW = 1 - eqW;
    const isSouth = v > 0.5;
    const pole = isSouth ? pS : pN;
    const row = y * GRID_W;
    for (let x = 0; x < GRID_W; x++) {
      let a = 0, l = 0, k = 0, t = 0;
      if (showA) a = eqVal.adhesion[x] * eqW + pole.adhesion * poleW;
      if (showL) l = eqVal.light[x]    * eqW + pole.light    * poleW;
      if (showK) k = eqVal.chem[x]     * eqW + pole.chem     * poleW;
      if (showT) t = eqVal.tension[x]  * eqW + pole.tension  * poleW;
      if (showA && detached && isSouth) a = Math.random() * 0.9;

      let r = bgR + 0.85 * (a * cA[0] + l * cL[0] + k * cK[0] + t * cT[0]);
      let g = bgG + 0.85 * (a * cA[1] + l * cL[1] + k * cK[1] + t * cT[1]);
      let b = bgB + 0.85 * (a * cA[2] + l * cL[2] + k * cK[2] + t * cT[2]);
      const K = 260;
      r = (r * K) / (r + K) * 1.5;
      g = (g * K) / (g + K) * 1.5;
      b = (b * K) / (b + K) * 1.5;

      const o = (row + x) * 4;
      data[o]     = r > 255 ? 255 : r | 0;
      data[o + 1] = g > 255 ? 255 : g | 0;
      data[o + 2] = b > 255 ? 255 : b | 0;
      data[o + 3] = 255;
    }
  }
  renderer.offCtx.putImageData(offImg, 0, 0);

  // --- 3. Display: bilinear upscale. -----------------------------------
  const { ctx, canvas } = renderer;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.fillStyle = '#07090c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(renderer.offCnv, 0, 0, canvas.width, canvas.height);

  // --- 4. Texture overlay + wrinkle accent. ----------------------------
  if (showTexture && !detached) {
    const phase = sim.flowPhase || 0;
    const shiftPx = Math.floor(phase * canvas.width);
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.globalCompositeOperation = 'overlay';
    ctx.drawImage(renderer.texture, -shiftPx, 0, canvas.width, canvas.height);
    ctx.drawImage(renderer.texture, canvas.width - shiftPx, 0, canvas.width, canvas.height);
    ctx.restore();

    let hasWrinkle = false;
    for (let y = 0; y < GRID_H; y++) {
      const v = y / (GRID_H - 1);
      const eqW = Math.sin(v * Math.PI);
      const row = y * GRID_W;
      for (let x = 0; x < GRID_W; x++) {
        const w = Math.min(1, eqWrinkle[x] * 0.6) * eqW;
        const o = (row + x) * 4;
        data[o] = data[o + 1] = data[o + 2] = 0;
        data[o + 3] = Math.floor(w * 170);
        if (w > 0.06) hasWrinkle = true;
      }
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
    const { staticCnv, staticCtx, staticImg } = renderer;
    const td = staticImg.data;
    for (let p = 0; p < td.length; p += 4) {
      const v = (Math.random() * 255) | 0;
      td[p] = v; td[p + 1] = v; td[p + 2] = v; td[p + 3] = 90;
    }
    staticCtx.putImageData(staticImg, 0, 0);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.drawImage(staticCnv, 0, 0, canvas.width, canvas.height);
    ctx.restore();
  }
}

// Top-down debug view: substrate fields + cell polyline + sensor dots, south
// pole marker, chem gradient arrow. Used to sanity-check the projection.
function renderDebug(renderer, sim, { channels: enabled }) {
  const { ctx, canvas, worldBmp, world } = renderer;
  ctx.fillStyle = '#07090c';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  if (!worldBmp || !world) return;

  const W = canvas.width, H = canvas.height;
  const scale = Math.min(W / world.w, H / world.h);
  const dw = world.w * scale, dh = world.h * scale;
  const dx = (W - dw) * 0.5, dy = (H - dh) * 0.5;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(worldBmp, dx, dy, dw, dh);

  ctx.save();
  ctx.translate(dx, dy);
  ctx.scale(scale, scale);

  // Cell polyline.
  const nodes = sim.nodes;
  const N = sim.N;
  ctx.lineWidth = 1.2 / scale;
  ctx.strokeStyle = 'rgba(220, 220, 220, 0.45)';
  ctx.beginPath();
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    if (i === 0) ctx.moveTo(n.x, n.y); else ctx.lineTo(n.x, n.y);
  }
  ctx.closePath();
  ctx.stroke();

  // Sensor dots colored by enabled channels.
  const cA = COLOR.adhesion, cL = COLOR.light, cK = COLOR.chem, cT = COLOR.tension;
  const dot = 3.0 / scale;
  for (let i = 0; i < N; i++) {
    const n = nodes[i];
    let r = 24, g = 28, b = 36;
    if (enabled.adhesion) { r += n.adhesion * cA[0]; g += n.adhesion * cA[1]; b += n.adhesion * cA[2]; }
    if (enabled.light)    { r += n.light    * cL[0]; g += n.light    * cL[1]; b += n.light    * cL[2]; }
    if (enabled.chem)     { r += n.chem     * cK[0]; g += n.chem     * cK[1]; b += n.chem     * cK[2]; }
    if (enabled.tension)  { r += n.tension  * cT[0]; g += n.tension  * cT[1]; b += n.tension  * cT[2]; }
    if (r > 255) r = 255; if (g > 255) g = 255; if (b > 255) b = 255;
    ctx.fillStyle = `rgb(${r | 0}, ${g | 0}, ${b | 0})`;
    ctx.beginPath();
    ctx.arc(n.x, n.y, dot, 0, TWO_PI);
    ctx.fill();
    if (n.intent_push > 0.05) {
      ctx.strokeStyle = `rgba(255, 180, 80, ${Math.min(1, n.intent_push * 2)})`;
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, dot * 2.2, 0, TWO_PI);
      ctx.stroke();
    }
    if (n.intent_release > 0.05) {
      ctx.strokeStyle = `rgba(80, 200, 255, ${Math.min(1, n.intent_release * 2)})`;
      ctx.lineWidth = 1.5 / scale;
      ctx.beginPath();
      ctx.arc(n.x, n.y, dot * 2.2, 0, TWO_PI);
      ctx.stroke();
    }
  }

  // South pole (adhesion centroid).
  if (!sim.detached && sim.southPoint) {
    const sp = sim.southPoint;
    ctx.strokeStyle = 'rgba(255, 230, 200, 0.95)';
    ctx.lineWidth = 1.8 / scale;
    const s = 6 / scale;
    ctx.beginPath();
    ctx.moveTo(sp.x - s, sp.y - s); ctx.lineTo(sp.x + s, sp.y + s);
    ctx.moveTo(sp.x - s, sp.y + s); ctx.lineTo(sp.x + s, sp.y - s);
    ctx.stroke();
  }

  // Centroid + chem gradient arrow.
  const cx = sim.cellCx, cy = sim.cellCy;
  const eps = 5;
  const gx = world.sample(world.chem, cx + eps, cy) - world.sample(world.chem, cx - eps, cy);
  const gy = world.sample(world.chem, cx, cy + eps) - world.sample(world.chem, cx, cy - eps);
  const gMag = Math.hypot(gx, gy);
  if (gMag > 0.001) {
    const len = 32 / scale;
    const ax = (gx / gMag) * len;
    const ay = (gy / gMag) * len;
    ctx.strokeStyle = 'rgba(112, 208, 136, 0.9)';
    ctx.lineWidth = 2 / scale;
    ctx.beginPath();
    ctx.moveTo(cx, cy); ctx.lineTo(cx + ax, cy + ay);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(200, 220, 220, 0.85)';
  ctx.beginPath();
  ctx.arc(cx, cy, 2 / scale, 0, TWO_PI);
  ctx.fill();

  ctx.restore();

  // Legend.
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.fillRect(8, 8, 230, 62);
  ctx.fillStyle = '#e0f0e8';
  ctx.font = '11px ui-monospace, monospace';
  ctx.fillText('DEBUG: top-down view', 16, 24);
  ctx.fillStyle = 'rgba(255, 230, 200, 0.95)';
  ctx.fillText('x  south pole (adhesion centroid)', 16, 40);
  ctx.fillStyle = 'rgba(112, 208, 136, 0.9)';
  ctx.fillText('->  chem gradient (heading)', 16, 56);
}
