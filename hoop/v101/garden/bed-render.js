// bed-render.js — the CONTINUUM GARDEN BED renderer. Draws one bed (garden.js's single-bed model) as an
// oblique top-of-bed view: the soil substrate, the KEEP-OUT ZONES (a trodden path, a pond, stones) marked
// on it, then every plant at its free (x,y) — normalized bed coords → screen — drawn back-to-front with
// its flora silhouette (growth-form + Galenic palette), scaled by depth so front plants read larger.
//
// Pure draw layer: it takes PRE-BUILT flora models (the host owns buildPlant/descriptorForCrop) so this
// stays reusable and DOM-cheap. Canvas2D. The kernels it draws are node-tested; this pixel layer is
// proofed live on the /garden overlay.

import { drawSoil, drawPlant } from './plot-render.js';
import { soilProps } from '../worship/lib/soil.js';

// bed (x,y ∈ [0,1]) → screen. The bed occupies an inset rect; y is depth (0 back → 1 front), given a
// slight vertical foreshortening so the back of the bed sits higher and reads as receding.
function projector(W, H) {
  const padX = W * 0.04, padTop = H * 0.06, padBot = H * 0.08;
  const bx = padX, bw = W - padX * 2, by = padTop, bh = H - padTop - padBot;
  return {
    sx: (x) => bx + x * bw,
    sy: (y) => by + y * bh,
    scaleAt: (y) => 0.7 + y * 0.55,   // front (y=1) plants ~1.25×, back (y=0) ~0.7×
    rect: { bx, by, bw, bh },
  };
}

// renderBed(ctx, W, H, { keepouts, items, seed, soil }) — items: [{ x, y, model, ready, label }] in bed
// coords, model = a flora.js buildPlant output (or null for a bare marker). Draws soil, keep-outs, plants.
export function renderBed(ctx, W, H, { keepouts, items = [], seed = 7, soil } = {}) {
  const P = projector(W, H), props = soil || soilProps(0.42, 0.34, 0.24, 0.34);
  // sky wash + the whole frame as soil bed (drawSoil paints a substrate; soilTop near the very top so the
  // bed IS the ground, seen from just above)
  ctx.fillStyle = '#0c0a07'; ctx.fillRect(0, 0, W, H);
  drawSoil(ctx, W, H, P.rect.by, props, seed);

  // ── keep-out zones drawn ON the soil ──
  if (keepouts) {
    // the pond + stones
    for (const bl of (keepouts.blobs || [])) {
      const cx = P.sx(bl.x), cy = P.sy(bl.y), rx = bl.r * P.rect.bw, ry = bl.r * P.rect.bh;
      if (bl.kind === 'pond') {
        const g = ctx.createRadialGradient(cx, cy, 1, cx, cy, Math.max(rx, ry));
        g.addColorStop(0, '#2f5a72'); g.addColorStop(1, '#173142');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(120,170,190,0.35)'; ctx.lineWidth = 1.5; ctx.stroke();
      } else {
        ctx.fillStyle = '#6b6455'; ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry * 0.8, 0, 0, 7); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(cx - rx * 0.25, cy - ry * 0.3, rx * 0.5, ry * 0.4, 0, 0, 7); ctx.fill();
      }
    }
    // the trodden path — a pale strip along the polyline
    const path = keepouts.path;
    if (path && path.pts && path.pts.length > 1) {
      ctx.strokeStyle = 'rgba(150,130,96,0.5)'; ctx.lineWidth = Math.max(6, path.hw * 2 * P.rect.bh); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(P.sx(path.pts[0][0]), P.sy(path.pts[0][1]));
      for (let i = 1; i < path.pts.length; i++) ctx.lineTo(P.sx(path.pts[i][0]), P.sy(path.pts[i][1]));
      ctx.stroke();
      ctx.strokeStyle = 'rgba(90,74,50,0.4)'; ctx.lineWidth = Math.max(2, path.hw * P.rect.bh * 0.7); ctx.beginPath(); ctx.moveTo(P.sx(path.pts[0][0]), P.sy(path.pts[0][1]));
      for (let i = 1; i < path.pts.length; i++) ctx.lineTo(P.sx(path.pts[i][0]), P.sy(path.pts[i][1]));
      ctx.stroke();
    }
  }

  // ── the plants, back-to-front ──
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  const baseU = Math.min(W, H) * 0.5;
  for (const it of sorted) {
    const ox = P.sx(it.x), oy = P.sy(it.y), sc = P.scaleAt(it.y);
    // contact shadow
    ctx.fillStyle = 'rgba(0,0,0,0.22)'; ctx.beginPath(); ctx.ellipse(ox, oy, 8 * sc, 3 * sc, 0, 0, 7); ctx.fill();
    if (it.model) {
      const fp = Math.max(0.14, it.model.footprint || 0.25);
      const u = Math.min(baseU * sc * 0.34 / fp, (P.rect.bh * 0.5 * sc) / Math.max(0.2, it.model.height));
      try { drawPlant(ctx, it.model, ox, oy, u); } catch (e) {}
    } else { ctx.fillStyle = '#4f7e46'; ctx.beginPath(); ctx.arc(ox, oy - 4 * sc, 3 * sc, 0, 7); ctx.fill(); }
    // a ripe marker
    if (it.ready) { ctx.fillStyle = '#8fe0a0'; ctx.font = `${Math.max(9, 11 * sc) | 0}px "JetBrains Mono", ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillText('✓', ox, oy - Math.max(14, 16 * sc)); }
  }

  // warm vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.25, W / 2, H * 0.5, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// screenToBed — invert the projector so a canvas click maps back to bed (x,y). Returns { x, y } (clamped).
export function screenToBed(W, H, mx, my) {
  const P = projector(W, H);
  return { x: Math.max(0, Math.min(1, (mx - P.rect.bx) / P.rect.bw)), y: Math.max(0, Math.min(1, (my - P.rect.by) / P.rect.bh)) };
}

export default { renderBed, screenToBed };
