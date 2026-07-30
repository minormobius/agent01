// plot-render.js — the GARDEN PLOT renderer. Draws a single bed at yarrow/sand fidelity: the SOIL
// substrate (grain, moisture, desiccation cracks, lit relief — the whole substrate under the
// microscope, via worship/lib/soil.js's soilProps + crackMask) with a CUTAWAY profile so the roots and
// tubers show in the earth, and the FLORA (garden/flora.js models) drawn above at stalk-render care:
// tapered lit stems, veined leaf-blades, petal-fan flowers glowing in the ruling-planet's colour.
//
// Canvas2D, self-contained, works everywhere (no WebGPU dependency — a garden plot doesn't need it, and
// this keeps NPC-generated gardens renderable anywhere). Pure draw calls off the flora model + a soil
// composition; deterministic given the model's seed. The kernels it draws are node-tested; this pixel
// layer is proofed on the /garden/plot demo.

import { soilProps, crackMask } from '../worship/lib/soil.js';

const clamp01 = (x) => x < 0 ? 0 : x > 1 ? 1 : x;
const rgba = (c, a) => `rgba(${c.r * 255 | 0},${c.g * 255 | 0},${c.b * 255 | 0},${a})`;
const shade = (c, k) => ({ r: clamp01(c.r * k), g: clamp01(c.g * k), b: clamp01(c.b * k) });

// value-noise for the soil relief (matches soil.js's family closely enough for a bed)
function vnoise(x, y, seed) {
  const h = (ix, iy) => { let n = (Math.imul(ix + 1, 374761393) ^ Math.imul(iy + 131, 668265263) ^ Math.imul(seed, 2654435761)) >>> 0; n = Math.imul(n ^ n >>> 15, 1 | n); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; };
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return (h(ix, iy) * (1 - u) + h(ix + 1, iy) * u) * (1 - v) + (h(ix, iy + 1) * (1 - u) + h(ix + 1, iy + 1) * u) * v;
}

// ── the soil bed: a lit, grainy, cracked substrate with an earth-cutaway lower band ──
// props from soilProps(sand,silt,clay,wet). soilTop = the y of the soil surface (px); below it is earth.
export function drawSoil(ctx, W, H, soilTop, props, seed = 7) {
  const N = 96, mask = crackMask(N, 8 + props.grain.scale, seed);
  const cell = W / N;
  // Render to an OFFSCREEN canvas at CSS size, then drawImage it — putImageData writes in DEVICE
  // pixels and ignores the DPR setTransform on the main context (that was the "soil is a small square
  // off to the left" bug: a CSS-sized ImageData landed in the top-left device-pixel corner). drawImage
  // respects the transform, so the bed fills the full width at any DPR.
  const off = (typeof OffscreenCanvas !== 'undefined') ? new OffscreenCanvas(W, H)
    : Object.assign(document.createElement('canvas'), { width: W, height: H });
  const octx = off.getContext('2d');
  const img = octx.createImageData(W, H);
  const surf = props.color, deep = shade(surf, 0.62);   // the profile darkens with depth
  for (let py = 0; py < H; py++) {
    const belowFrac = clamp01((py - soilTop) / Math.max(1, H - soilTop));   // 0 at surface → 1 at bottom
    for (let px = 0; px < W; px++) {
      let r, g, b, aBase = 255;
      if (py < soilTop) { aBase = 0; r = g = b = 0; }                       // above soil = transparent (sky/plants drawn over)
      else {
        // depth gradient surface→deep
        const base = { r: surf.r * (1 - belowFrac) + deep.r * belowFrac, g: surf.g * (1 - belowFrac) + deep.g * belowFrac, b: surf.b * (1 - belowFrac) + deep.b * belowFrac };
        // lit relief: value-noise height → simple hillshade near the surface band
        const nx = px / cell, ny = py / cell;
        const hgt = vnoise(nx, ny, seed), gx = hgt - vnoise(nx + 1, ny, seed), gy = hgt - vnoise(nx, ny + 1, seed);
        const lit = clamp01(0.72 + (gx * 0.9 + gy * 0.5) * props.grain.amp * 6);
        // grain speckle
        const sp = 1 + (vnoise(nx * 6.3, ny * 6.3, seed + 9) - 0.5) * props.grain.roughness * 0.5;
        // desiccation cracks (only near the surface, where clay dries)
        const surfBand = clamp01(1 - belowFrac * 3);
        const crk = mask[(Math.min(N - 1, Math.floor(py / (H / N)))) * N + Math.min(N - 1, Math.floor(px / cell))] * props.crack * surfBand;
        const k = lit * sp * (1 - 0.75 * crk);
        r = base.r * k * 255; g = base.g * k * 255; b = base.b * k * 255;
        // moisture sheen: a subtle cool darken where wet
        r *= 1 - 0.12 * props.wet; g *= 1 - 0.06 * props.wet;
      }
      const o = (py * W + px) * 4; img.data[o] = r; img.data[o + 1] = g; img.data[o + 2] = b; img.data[o + 3] = aBase;
    }
  }
  octx.putImageData(img, 0, 0);
  ctx.drawImage(off, 0, 0, W, H);   // respects the main context's DPR transform
  // a crisp soil surface line with a lit lip
  ctx.strokeStyle = rgba(shade(surf, 1.25), 0.9); ctx.lineWidth = 1.5; ctx.beginPath(); ctx.moveTo(0, soilTop); ctx.lineTo(W, soilTop); ctx.stroke();
}

// ── a leaf silhouette, drawn in a local frame with the blade running along +x from the origin.
// Distinct shapes so a fennel (pinnate/feathery) doesn't read like a sage (ovate). ──
function drawLeaf(ctx, shape, len, wid, P) {
  const blade = (L, W, ctrl = 0.5) => { ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(L * ctrl, -W / 2, L, 0); ctx.quadraticCurveTo(L * ctrl, W / 2, 0, 0); ctx.fill(); };
  ctx.fillStyle = P.leaf;
  switch (shape) {
    case 'needle': ctx.strokeStyle = P.leaf; ctx.lineWidth = Math.max(1, wid); ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke(); return;
    case 'strap': blade(len, Math.max(2, wid), 0.7); break;                        // long, near-parallel-sided
    case 'lance': blade(len, wid, 0.32); break;                                    // narrow, pointed
    case 'round': ctx.beginPath(); ctx.arc(len * 0.45, 0, Math.max(2, wid * 0.6), 0, 7); ctx.fill(); break;
    case 'lobed': { blade(len, wid, 0.5); ctx.save(); for (const s of [-1, 1]) { ctx.rotate(0); const a = s * 0.5; ctx.beginPath(); ctx.moveTo(len * 0.35, s * wid * 0.1); ctx.quadraticCurveTo(len * 0.55 + Math.cos(a) * len * 0.2, s * wid * 0.6, len * 0.7, s * wid * 0.15); ctx.quadraticCurveTo(len * 0.5, s * wid * 0.1, len * 0.35, s * wid * 0.1); ctx.fill(); } ctx.restore(); break; }
    case 'palmate': { const fingers = 5; for (let i = 0; i < fingers; i++) { const a = (i / (fingers - 1) - 0.5) * 1.3; ctx.save(); ctx.rotate(a); blade(len * (0.7 + 0.3 * (1 - Math.abs(i / (fingers - 1) - 0.5) * 2)), wid * 0.4, 0.4); ctx.restore(); } return; }
    case 'pinnate': { ctx.strokeStyle = P.stem; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(len, 0); ctx.stroke(); const pairs = 4 + Math.round(len / 8); for (let i = 1; i <= pairs; i++) { const t = i / (pairs + 1), px = len * t, ll = wid * (1 - t * 0.4); for (const s of [-1, 1]) { ctx.save(); ctx.translate(px, 0); ctx.rotate(s * 0.9); blade(ll, ll * 0.5, 0.4); ctx.restore(); } } return; }
    default: blade(len, wid, 0.45);                                               // ovate
  }
  ctx.strokeStyle = P.leafHi; ctx.lineWidth = 0.7; ctx.beginPath(); ctx.moveTo(len * 0.05, 0); ctx.lineTo(len * 0.92, 0); ctx.stroke();   // midrib
}

// ── a plant, drawn from its flora.js model, at (ox,oy)=base on the soil surface; `u`=plot-units→px ──
export function drawPlant(ctx, m, ox, oy, u) {
  const P = m.palette;
  const X = (x) => ox + x * u, Y = (y) => oy - y * u;    // +y up
  // ROOTS first — the below-soil foraging network (grow.js), drawn faint in the earth (the microscope).
  // Segments taper by Murray's law just like the branches; pale, translucent, so they read as fibrous.
  ctx.lineCap = 'round';
  for (const r of m.roots) { ctx.strokeStyle = rgba({ r: 0.82, g: 0.72, b: 0.55 }, 0.5); ctx.lineWidth = Math.max(0.5, r.w1 * u * 0.9); ctx.beginPath(); ctx.moveTo(X(r.x0), Y(r.y0)); ctx.lineTo(X(r.x1), Y(r.y1)); ctx.stroke(); }
  if (m.tuber) { const tx = X(m.tuber.x), ty = Y(m.tuber.y), rr = m.tuber.r * u; ctx.fillStyle = m.tuber.kind === 'bulb' ? '#e8e0c8' : '#d8b57a'; ctx.beginPath(); ctx.ellipse(tx, ty, rr * 0.7, rr, 0, 0, 7); ctx.fill(); ctx.strokeStyle = 'rgba(90,70,40,.5)'; ctx.lineWidth = 1; ctx.stroke(); }
  // BRANCHES — the shoot foraging network (grow.js): each segment a tapered stroke, Murray-thick at the
  // base, thin at the twigs; a lit edge on the thicker limbs for roundness (stalk-render's cue).
  for (const s of m.branches) {
    const x0 = X(s.x0), y0 = Y(s.y0), x1 = X(s.x1), y1 = Y(s.y1);
    ctx.strokeStyle = P.stem; ctx.lineWidth = Math.max(0.8, s.w1 * u); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    if (s.w0 * u > 2.5) { ctx.strokeStyle = rgba({ r: 1, g: 1, b: 0.9 }, 0.16); ctx.lineWidth = Math.max(0.5, s.w0 * u * 0.35); ctx.beginPath(); ctx.moveTo(x0 - 0.8, y0); ctx.lineTo(x1 - 0.6, y1); ctx.stroke(); }
  }
  // LEAVES — distinct silhouettes by shape, oriented by the plant's plot-space theta (up-and-out)
  for (const l of m.leaves) {
    const lx = X(l.x), ly = Y(l.y), len = (l.len || 0.04) * u, wid = len * (l.wid || 0.45);
    ctx.save(); ctx.translate(lx, ly); ctx.rotate(-(l.theta != null ? l.theta : Math.PI / 2));   // local +x = the leaf's direction
    drawLeaf(ctx, l.shape || 'ovate', len, Math.max(1.5, wid), P);
    ctx.restore();
  }
  // FLOWERS — petal fans, glowing in the ruling planet's colour (yarrow's emissive touch)
  for (const f of m.flowers) {
    const fx = X(f.x), fy = Y(f.y), r = f.r * u;
    // NO glow on an umbel — its many clustered florets would smear into one big soft orb (the "huge
    // white/pink orb" bug). A single daisy/floret gets a small emissive touch; the umbel stays crisp.
    ctx.save(); ctx.shadowColor = P.flower; ctx.shadowBlur = f.kind === 'umbel' ? 0 : 4;
    if (f.kind === 'ear' || f.kind === 'spike') { ctx.fillStyle = P.flower; ctx.beginPath(); ctx.ellipse(fx, fy, r * 0.6, r * 1.6, 0, 0, 7); ctx.fill(); }
    else if (f.kind === 'umbel') {   // a lace of tiny florets (fennel/dill) — NOT a big disc
      ctx.fillStyle = P.flower; const dot = Math.max(0.6, r * 0.16);   // r is ALREADY in px (f.r*u); the old `r*u*0.14` double-scaled → 112px "orb" florets
      for (const fl of (f.florets || [])) { ctx.beginPath(); ctx.arc(X(fl.x), Y(fl.y), dot, 0, 7); ctx.fill(); }
    }
    else if (f.kind === 'daisy') {   // small petal ring + disk
      ctx.fillStyle = P.flower; const pet = f.petals || 12; for (let i = 0; i < pet; i++) { const a = i / pet * Math.PI * 2; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * r * 0.8, fy + Math.sin(a) * r * 0.8, r * 0.7, r * 0.26, a, 0, 7); ctx.fill(); } ctx.fillStyle = '#e8c24a'; ctx.beginPath(); ctx.arc(fx, fy, r * 0.5, 0, 7); ctx.fill(); }
    else { ctx.fillStyle = P.flower; const pet = f.petals || 5; for (let i = 0; i < pet; i++) { const a = i / pet * Math.PI * 2; ctx.beginPath(); ctx.ellipse(fx + Math.cos(a) * r * 0.9, fy + Math.sin(a) * r * 0.9, r * 0.6, r * 0.34, a, 0, 7); ctx.fill(); } ctx.fillStyle = '#f8e6a0'; ctx.beginPath(); ctx.arc(fx, fy, r * 0.42, 0, 7); ctx.fill(); }
    ctx.restore();
  }
  // FRUIT
  for (const fr of m.fruits) { const x = X(fr.x), y = Y(fr.y), r = fr.r * u; ctx.fillStyle = P.flower; ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.3, r * 0.35, 0, 7); ctx.fill(); }
  // FUNGUS CAP
  if (m.cap) {
    const cx = X(m.cap.x), cy = Y(m.cap.y), r = m.cap.r * u;
    ctx.fillStyle = m.cap.warts ? '#d23b2e' : '#b98a5a'; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.7, 0, Math.PI, 0); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath(); ctx.ellipse(cx, cy, r, r * 0.22, 0, 0, Math.PI); ctx.fill();
    if (m.cap.warts) { ctx.fillStyle = '#f4ead0'; for (let i = 0; i < 7; i++) { const a = (i / 7 - 0.5) * Math.PI; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * r * 0.7, cy - Math.abs(Math.sin(a)) * r * 0.4 - 1, r * 0.1, 0, 7); ctx.fill(); } }
  }
}

// ── the whole plot: soil bed + laid-out flora, with a warm ambient. `plot` = buildPlotFlora output. ──
export function renderPlot(ctx, W, H, plot, { soil, seed = 7, soilTop } = {}) {
  const props = soil || soilProps(0.4, 0.35, 0.25, 0.3);
  soilTop = soilTop != null ? soilTop : H * 0.64;   // soil is the lower ~third — a bed, not half the frame
  // sky/air wash above the soil (a soft dawn)
  const sky = ctx.createLinearGradient(0, 0, 0, soilTop); sky.addColorStop(0, '#12100c'); sky.addColorStop(1, '#25201a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, soilTop);
  drawSoil(ctx, W, H, soilTop, props, seed);
  // lay the plants along the bed: x across the width, base ON the soil surface; further-back rows dimmer.
  // Each plant is scaled to FIT ITS CELL by its footprint (canopy radius) so no two grow on top of each
  // other, and so a big tree auto-shrinks to share the bed instead of swallowing its neighbours.
  const rows = {}; for (const s of plot) (rows[s.row] = rows[s.row] || []).push(s);
  const rowKeys = Object.keys(rows).map(Number).sort((a, b) => b - a);   // back rows first
  const cols = Math.max(1, Math.max(...plot.map((s) => s.col)) + 1);
  const cellHalf = (W / cols) * 0.47;
  const baseU = Math.min(W, H) * 0.42;
  const airPx = soilTop * 0.95;
  for (const rk of rowKeys) {
    for (const s of rows[rk]) {
      const fp = Math.max(0.12, s.plant.footprint || 0.2), rowScale = rk > 0 ? 0.82 : 1;
      const u = Math.min(baseU * rowScale, cellHalf / fp, airPx / Math.max(0.2, s.plant.height));   // fit width AND height
      const ox = s.x * W, oy = soilTop + (rk * 6) - 2;
      ctx.save(); if (rk > 0) ctx.globalAlpha = 0.85; drawPlant(ctx, s.plant, ox, oy, u); ctx.restore();
    }
  }
  // warm vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.2, W / 2, H * 0.5, Math.max(W, H) * 0.7);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.35)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// ── a SINGLE plant on its own soil tile, with a LABEL WINDOW cut into the soil at the bottom. This is
// the per-plot cell of the game garden: each plant gets its own plot, named. `plant` is a flora model. ──
export function renderSinglePlot(ctx, W, H, plant, { soil, label, seed = 7, ready = false } = {}) {
  const props = soil || soilProps(0.4, 0.35, 0.25, 0.3);
  const labelH = Math.max(16, H * 0.13);
  const soilTop = H - Math.max(labelH + 8, H * 0.34);   // soil is the lower third; the plant stands on it
  const sky = ctx.createLinearGradient(0, 0, 0, soilTop); sky.addColorStop(0, '#12100c'); sky.addColorStop(1, '#25201a');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, soilTop);
  drawSoil(ctx, W, H, soilTop, props, seed);
  if (plant) {
    const fp = Math.max(0.14, plant.footprint || 0.25);
    const u = Math.min((W * 0.44) / fp, (soilTop * 0.92) / Math.max(0.2, plant.height), Math.min(W, H) * 0.9);
    drawPlant(ctx, plant, W / 2, soilTop, u);
  }
  // the LABEL WINDOW — a carved sill in the soil with the plant's name (a bottom window in the soil)
  ctx.fillStyle = 'rgba(6,7,10,0.82)'; ctx.fillRect(0, H - labelH, W, labelH);
  ctx.strokeStyle = 'rgba(244,191,98,0.35)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(0, H - labelH + 0.5); ctx.lineTo(W, H - labelH + 0.5); ctx.stroke();
  ctx.fillStyle = ready ? '#8fe0a0' : '#e8e0d0'; ctx.font = `${Math.max(9, Math.round(labelH * 0.42))}px "JetBrains Mono", ui-monospace, monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText((label || (plant && plant.name) || '') + (ready ? ' ✓' : ''), W / 2, H - labelH / 2, W - 8);
}

export default { drawSoil, drawPlant, renderPlot, renderSinglePlot };
