// bed-render.js — the CONTINUUM GARDEN BED renderer, as a 2D CROSS-SECTION (the way the plot demo builds
// it): a soil substrate seen from the SIDE with an earth cutaway below (roots + tubers show in the ground),
// and every plant standing on the soil surface at its own x, drawn with its flora silhouette. The bed's
// second axis (y = depth into the bed, 0 back → 1 front) is a shallow vertical band on the soil surface:
// back plants sit a little higher + smaller + dimmer, front plants lower + larger, painted back-to-front.
// Keep-out zones (a pond, stones, a trodden path) are drawn on the surface as the ground you can't plant on.
//
// Pure draw layer: it takes PRE-BUILT flora models (the host owns buildPlant/descriptorForCrop) so this
// stays reusable and DOM-cheap. Canvas2D. The kernels it draws are node-tested; this pixel layer is
// proofed live on the /garden overlay.

import { drawSoil, drawPlant } from './plot-render.js';
import { soilProps } from '../worship/lib/soil.js';

// the cross-section geometry: air on top, a soil surface band the plants' bases spread across (by depth),
// then the earth cutaway below (roots). All derived from the canvas size so it scales anywhere.
function section(W, H) {
  const padX = W * 0.03;
  const soilTop = H * 0.52;              // the BACK edge of the soil surface (y=0 depth)
  const depthBand = H * 0.15;            // bases spread down this band front-to-back (y: 0→1)
  return {
    bx: padX, bw: W - padX * 2, soilTop, depthBand, W, H,
    baseX: (x) => padX + x * (W - padX * 2),
    baseY: (y) => soilTop + y * depthBand,   // front (y=1) sits lower/nearer
    scaleAt: (y) => 0.82 + y * 0.42,         // front plants a touch larger
  };
}
// the plot-units→px scale for a plant of depth y (shared by the renderer + the hit-test so they agree).
function plantUnit(S, model, y) {
  const sc = S.scaleAt(y), fp = Math.max(0.14, (model && model.footprint) || 0.25), airPx = S.soilTop * 0.94;
  return Math.min((S.W * 0.16 * sc) / fp, (airPx * sc) / Math.max(0.2, (model && model.height) || 0.5), Math.min(S.W, S.H) * 0.9);
}

// renderBed(ctx, W, H, { keepouts, items, seed, soil }) — items: [{ x, y, model, ready, label }] in bed
// coords (x across, y depth), model = a flora.js buildPlant output. Draws the soil cross-section, the
// keep-outs on the surface, then the plants standing on the bed back-to-front.
export function renderBed(ctx, W, H, { keepouts, items = [], seed = 7, soil } = {}) {
  const S = section(W, H), props = soil || soilProps(0.42, 0.34, 0.24, 0.34);
  // sky/air wash above the soil, then the soil cutaway (transparent above soilTop, earth below with the
  // surface line + grain + roots-visible cutaway — exactly the plot demo's substrate)
  const sky = ctx.createLinearGradient(0, 0, 0, S.soilTop); sky.addColorStop(0, '#0d0b07'); sky.addColorStop(1, '#211b13');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, W, S.soilTop);
  drawSoil(ctx, W, H, S.soilTop, props, seed);

  // ── keep-out zones drawn ON the soil surface (the ground you can't plant on) ──
  if (keepouts) {
    // the trodden path — a pale bare scuff across the surface band at its x-range
    const path = keepouts.path;
    if (path && path.pts && path.pts.length > 1) {
      for (let i = 0; i < path.pts.length - 1; i++) {
        const a = path.pts[i], b = path.pts[i + 1];
        const x0 = S.baseX(a[0]), x1 = S.baseX(b[0]), sy = S.baseY(0.5);
        ctx.strokeStyle = 'rgba(150,130,96,0.4)'; ctx.lineWidth = Math.max(4, S.depthBand * 1.6); ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(x0, sy); ctx.lineTo(x1, sy); ctx.stroke();
      }
    }
    for (const bl of (keepouts.blobs || [])) {
      const cx = S.baseX(bl.x), cy = S.baseY(bl.y), rw = bl.r * S.bw;
      if (bl.kind === 'pond') {
        // a shallow water pool sitting in a dip on the surface
        const g = ctx.createLinearGradient(0, cy - rw * 0.3, 0, cy + rw * 0.3);
        g.addColorStop(0, '#3a6a84'); g.addColorStop(1, '#173142');
        ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(cx, cy, rw, Math.max(6, rw * 0.34), 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(150,190,205,0.4)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.ellipse(cx, cy, rw, Math.max(6, rw * 0.34), 0, 0, 7); ctx.stroke();
        ctx.fillStyle = 'rgba(210,235,245,0.22)'; ctx.beginPath(); ctx.ellipse(cx - rw * 0.3, cy - rw * 0.08, rw * 0.4, rw * 0.09, 0, 0, 7); ctx.fill();
      } else {
        // a stone resting on the surface
        const rh = Math.max(7, rw * 0.7);
        ctx.fillStyle = '#6b6455'; ctx.beginPath(); ctx.ellipse(cx, cy - rh * 0.3, rw * 0.8, rh, 0, Math.PI, 0); ctx.fill();
        ctx.fillStyle = '#575044'; ctx.beginPath(); ctx.ellipse(cx, cy - rh * 0.3, rw * 0.8, rh * 0.5, 0, 0, Math.PI); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(cx - rw * 0.28, cy - rh * 0.6, rw * 0.32, rh * 0.4, 0, 0, 7); ctx.fill();
      }
    }
  }

  // ── the plants, standing on the soil surface, back-to-front (painter's algorithm on depth) ──
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  for (const it of sorted) {
    const ox = S.baseX(it.x), oy = S.baseY(it.y), sc = S.scaleAt(it.y);
    if (it.model) {
      const u = plantUnit(S, it.model, it.y);
      ctx.save(); ctx.globalAlpha = 0.7 + it.y * 0.3;   // back plants a touch dimmer (aerial depth)
      try { drawPlant(ctx, it.model, ox, oy, u); } catch (e) {}
      ctx.restore();
      if (it.ready) { ctx.fillStyle = '#8fe0a0'; ctx.font = `${Math.max(9, 11 * sc) | 0}px "JetBrains Mono", ui-monospace, monospace`; ctx.textAlign = 'center'; ctx.fillText('✓', ox, oy - (it.model.height * u + 8)); }
    } else { ctx.fillStyle = '#4f7e46'; ctx.beginPath(); ctx.arc(ox, oy - 4 * sc, 3 * sc, 0, 7); ctx.fill(); }
  }

  // warm vignette
  const vg = ctx.createRadialGradient(W / 2, H * 0.5, Math.min(W, H) * 0.28, W / 2, H * 0.5, Math.max(W, H) * 0.72);
  vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.34)'); ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
}

// screenToBed — invert the section so a canvas click maps to bed (x,y) for PLANTING. x across the width; y
// (depth) from where in the soil-surface band the click lands (higher = further back, lower = nearer front).
export function screenToBed(W, H, mx, my) {
  const S = section(W, H);
  return {
    x: Math.max(0, Math.min(1, (mx - S.bx) / S.bw)),
    y: Math.max(0, Math.min(1, (my - S.soilTop) / S.depthBand)),
  };
}

// pickPlant — which drawn plant did the click hit? In a side view a plant's body stands well ABOVE its
// base, so selection can't map click-y to depth (that's only right for planting on bare soil). Instead we
// hit-test the click against each plant's screen silhouette box (its footprint width, base up to its top),
// front-most first. items: [{ x, y, model, idx }]. Returns the hit item's `idx`, or -1.
export function pickPlant(W, H, items, mx, my) {
  const S = section(W, H);
  let best = -1, bestY = -1;
  for (const it of items) {
    if (!it.model) continue;
    const ox = S.baseX(it.x), oy = S.baseY(it.y), u = plantUnit(S, it.model, it.y);
    const halfW = Math.max(10, (it.model.footprint || 0.25) * u * 0.6 + 8), topY = oy - it.model.height * u;
    if (mx >= ox - halfW && mx <= ox + halfW && my >= topY - 6 && my <= oy + 10) {
      if (it.y > bestY) { bestY = it.y; best = it.idx; }   // prefer the front-most plant under the cursor
    }
  }
  return best;
}

export default { renderBed, screenToBed, pickPlant };
