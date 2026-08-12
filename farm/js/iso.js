// iso.js — THE FIELD, seen from above. A draggable 2:1 isometric ground with the flora sprites
// standing upright on it (the classic farm-game billboard: the ground tilts, the plants don't).
// Replaces the side-view cross-section as the play surface; the same save renders in both.
//
// WORLD. The bed's normalized [0,1]² maps onto FIELD_T×FIELD_T iso tiles; the keep-outs (pond,
// stones, trodden path — bedKeepouts, derived from the bed seed as ever) become pond/stone/path
// tiles sampled at tile centres, and a meadow ring surrounds the field so panning has somewhere to
// go. Deterministic: tile shades come from the bed seed, not Math.random.
//
// INPUT. Drag pans (pointer events, works on touch), wheel/pinch zooms about the cursor, and a
// press that never travels past DRAG_PX is a TAP — the host decides what a tap means (plant here /
// harvest that). One callback: onTap({ bx, by, plantIdx }) with bed-normalized coords and the index
// of the plant under the tap (or -1).
//
// Pure-ish: this module owns projection, camera and input; game rules stay in state.js, model
// building stays in render.js (modelFor). No fetch, no game mutations.

import { drawPlant } from '../vendor/plot-render.js';
import { bedKeepouts, inKeepout } from '../vendor/garden.js';
import { growthOf, cropById } from './state.js';
import { modelFor } from './render.js';

export const FIELD_T = 12;            // the bed is a 12×12-tile field
const MEADOW = 5;                     // meadow ring beyond the field (tiles)
const TW = 72, TH = 36;               // base tile diamond (2:1) at zoom 1
const DRAG_PX = 6;                    // a press that moves less than this is a tap
const ZMIN = 0.55, ZMAX = 1.8;

// seeded per-tile shade (fnv mix — house family)
function tileHash(seed, tx, ty) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (tx + 101), 16777619); h = Math.imul(h ^ (ty + 977), 16777619);
  h ^= h >>> 15; return (h >>> 0) / 4294967296;
}

export function createIso(canvas, { onTap } = {}) {
  const ctx = canvas.getContext('2d');
  const cam = { x: FIELD_T / 2, y: FIELD_T / 2, zoom: 1 };   // camera looks at world point (x,y)
  let W = 0, H = 0, dpr = 1;
  let state = null;                                          // { farm, ark, now, tends, readOnly }
  let hover = null;                                          // {tx,ty} tile under cursor (planting aid)
  let raf = 0;

  const tw = () => TW * cam.zoom, th = () => TH * cam.zoom;
  // world → screen (canvas CSS px)
  const toScreen = (wx, wy) => ({
    x: W / 2 + ((wx - cam.x) - (wy - cam.y)) * tw() / 2,
    y: H / 2 + ((wx - cam.x) + (wy - cam.y)) * th() / 2,
  });
  // screen → world
  const toWorld = (sx, sy) => {
    const a = (sx - W / 2) / (tw() / 2), b = (sy - H / 2) / (th() / 2);
    return { wx: cam.x + (a + b) / 2, wy: cam.y + (b - a) / 2 };
  };

  function size() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    W = canvas.clientWidth; H = canvas.clientHeight;
    if (canvas.width !== W * dpr || canvas.height !== H * dpr) { canvas.width = W * dpr; canvas.height = H * dpr; }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function diamond(cx, cy, w, h) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - h / 2); ctx.lineTo(cx + w / 2, cy); ctx.lineTo(cx, cy + h / 2); ctx.lineTo(cx - w / 2, cy);
    ctx.closePath();
  }

  // what a tile is: 'soil' | 'path' | 'pond' | 'stone' | 'meadow'
  function tileKind(keepouts, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= FIELD_T || ty >= FIELD_T) return 'meadow';
    const nx = (tx + 0.5) / FIELD_T, ny = (ty + 0.5) / FIELD_T;
    if (!inKeepout(keepouts, nx, ny)) return 'soil';
    for (const bl of keepouts.blobs || []) {
      if ((nx - bl.x) ** 2 + (ny - bl.y) ** 2 < bl.r * bl.r) return bl.kind === 'pond' ? 'pond' : 'stone';
    }
    return 'path';
  }

  function draw() {
    raf = 0;
    if (!state) return;
    size();
    const { farm, ark, now, tends, readOnly, plantingCrop } = state;
    const keepouts = bedKeepouts(farm.bed.seed);
    ctx.fillStyle = '#0b0906'; ctx.fillRect(0, 0, W, H);

    // visible tile range from the screen corners (padded)
    const corners = [toWorld(0, 0), toWorld(W, 0), toWorld(0, H), toWorld(W, H)];
    const tx0 = Math.max(-MEADOW, Math.floor(Math.min(...corners.map((c) => c.wx)) - 1));
    const tx1 = Math.min(FIELD_T + MEADOW, Math.ceil(Math.max(...corners.map((c) => c.wx)) + 1));
    const ty0 = Math.max(-MEADOW, Math.floor(Math.min(...corners.map((c) => c.wy)) - 1));
    const ty1 = Math.min(FIELD_T + MEADOW, Math.ceil(Math.max(...corners.map((c) => c.wy)) + 1));

    // ── ground pass (painter order: sum ascending draws back → front) ──
    for (let s = tx0 + ty0; s <= tx1 + ty1; s++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ty = s - tx; if (ty < ty0 || ty > ty1) continue;
        const kind = tileKind(keepouts, tx, ty);
        const c = toScreen(tx + 0.5, ty + 0.5);
        if (c.x < -tw() || c.x > W + tw() || c.y < -th() * 2 || c.y > H + th()) continue;
        const r = tileHash(farm.bed.seed, tx, ty);
        let fill;
        if (kind === 'meadow') fill = `rgb(${26 + r * 8 | 0},${34 + r * 10 | 0},${20 + r * 6 | 0})`;
        else if (kind === 'soil') fill = `rgb(${56 + r * 14 | 0},${41 + r * 10 | 0},${26 + r * 7 | 0})`;
        else if (kind === 'path') fill = `rgb(${96 + r * 12 | 0},${82 + r * 10 | 0},${58 + r * 8 | 0})`;
        else if (kind === 'pond') fill = `rgb(${20 + r * 6 | 0},${52 + r * 10 | 0},${72 + r * 12 | 0})`;
        else fill = `rgb(${56 + r * 14 | 0},${41 + r * 10 | 0},${26 + r * 7 | 0})`;   // stone sits ON soil
        ctx.fillStyle = fill;
        diamond(c.x, c.y, tw(), th()); ctx.fill();
        // furrow grid on the tillable soil only — reads as "you can plant here"
        if (kind === 'soil') { ctx.strokeStyle = 'rgba(0,0,0,0.22)'; ctx.lineWidth = 1; diamond(c.x, c.y, tw(), th()); ctx.stroke(); }
        if (kind === 'pond') {   // water sheen
          ctx.fillStyle = `rgba(180,220,235,${0.06 + 0.05 * Math.sin(now / 900 + tx * 2.1 + ty * 1.3)})`;
          diamond(c.x, c.y, tw() * 0.7, th() * 0.7); ctx.fill();
        }
        if (kind === 'stone') {   // a boulder resting on the tile
          const rw = tw() * 0.26, rh = th() * 0.5;
          ctx.fillStyle = '#6b6455'; ctx.beginPath(); ctx.ellipse(c.x, c.y - rh * 0.4, rw, rh, 0, Math.PI, 0); ctx.fill();
          ctx.fillStyle = '#575044'; ctx.beginPath(); ctx.ellipse(c.x, c.y - rh * 0.4, rw, rh * 0.45, 0, 0, Math.PI); ctx.fill();
          ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.ellipse(c.x - rw * 0.35, c.y - rh * 0.75, rw * 0.35, rh * 0.3, 0, 0, 7); ctx.fill();
        }
      }
    }

    // field edge — a soft rim so the tillable square reads at a glance
    const e0 = toScreen(0, 0), e1 = toScreen(FIELD_T, 0), e2 = toScreen(FIELD_T, FIELD_T), e3 = toScreen(0, FIELD_T);
    ctx.strokeStyle = 'rgba(244,191,98,0.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.lineTo(e3.x, e3.y); ctx.closePath(); ctx.stroke();

    // hover tile (planting aid): green = plantable, red = not
    if (hover && plantingCrop && !readOnly) {
      const nx = (hover.tx + 0.5) / FIELD_T, ny = (hover.ty + 0.5) / FIELD_T;
      const okHere = state.plantableAt ? state.plantableAt(nx, ny) : false;
      const c = toScreen(hover.tx + 0.5, hover.ty + 0.5);
      ctx.fillStyle = okHere ? 'rgba(143,224,160,0.25)' : 'rgba(224,138,106,0.25)';
      diamond(c.x, c.y, tw(), th()); ctx.fill();
      ctx.strokeStyle = okHere ? '#8fe0a0' : '#e08a6a'; ctx.lineWidth = 1.5;
      diamond(c.x, c.y, tw(), th()); ctx.stroke();
    }

    // ── plant pass (billboarded flora, back → front by wx+wy) ──
    const items = farm.bed.plants.map((p, i) => {
      const crop = cropById(ark, p.seedId);
      const g = growthOf(p, crop, now, (tends || {})[p.id] || 0);
      return { p, i, crop, g, wx: p.x * FIELD_T, wy: p.y * FIELD_T };
    }).sort((a, b) => (a.wx + a.wy) - (b.wx + b.wy));
    const u = 118 * cam.zoom;   // plot-units → px for the sprites (flora heights are ≤ ~1.15 units)
    for (const it of items) {
      if (!it.crop) continue;
      const c = toScreen(it.wx, it.wy);
      if (c.x < -u || c.x > W + u || c.y < -u * 1.4 || c.y > H + u) continue;
      // contact shadow so the sprite sits ON the ground rather than floating over it
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath(); ctx.ellipse(c.x, c.y, u * 0.1 + it.g.stage * u * 0.08, th() * 0.16, 0, 0, 7); ctx.fill();
      const m = modelFor(it.p, it.crop, it.g.stage);
      try { drawPlant(ctx, m, c.x, c.y, u * 0.6); } catch (e) { /* one bad model must not blank the field */ }
      if (it.g.ready) {
        ctx.fillStyle = '#8fe0a0'; ctx.font = `${Math.max(10, 13 * cam.zoom) | 0}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center'; ctx.fillText('✓', c.x, c.y - m.height * u * 0.6 - 8);
      } else if (it.g.stage > 0.02) {   // growth arc at the base
        ctx.strokeStyle = 'rgba(143,224,160,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.ellipse(c.x, c.y, u * 0.13, th() * 0.2, 0, -Math.PI / 2, -Math.PI / 2 + it.g.stage * Math.PI * 2); ctx.stroke();
      }
    }

    // vignette
    const vg = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // find the plant under a screen point (front-most). Sprites stand up from their base.
  function plantAt(sx, sy) {
    if (!state) return -1;
    const u = 118 * cam.zoom;
    let best = -1, bestSum = -Infinity;
    state.farm.bed.plants.forEach((p, i) => {
      const c = toScreen(p.x * FIELD_T, p.y * FIELD_T);
      const crop = cropById(state.ark, p.seedId);
      const g = growthOf(p, crop, state.now, (state.tends || {})[p.id] || 0);
      const m = crop ? modelFor(p, crop, g.stage) : null;
      const halfW = Math.max(14, (m ? m.footprint : 0.2) * u * 0.45 + 8);
      const top = c.y - (m ? m.height : 0.3) * u * 0.6 - 10;
      if (sx >= c.x - halfW && sx <= c.x + halfW && sy >= top && sy <= c.y + th() * 0.3) {
        const sum = p.x + p.y;
        if (sum > bestSum) { bestSum = sum; best = i; }
      }
    });
    return best;
  }

  // ── input: drag to pan, wheel to zoom, tap to act ──
  let press = null;   // { sx, sy, camX, camY, moved, id }
  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return { sx: ev.clientX - r.left, sy: ev.clientY - r.top }; };

  canvas.addEventListener('pointerdown', (ev) => {
    const { sx, sy } = pos(ev);
    press = { sx, sy, camX: cam.x, camY: cam.y, moved: false, id: ev.pointerId };
    canvas.setPointerCapture(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    const { sx, sy } = pos(ev);
    if (press && ev.pointerId === press.id) {
      const dx = sx - press.sx, dy = sy - press.sy;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_PX) press.moved = true;
      if (press.moved) {
        // invert the projection for the delta: dwx-dwy = -dx/(tw/2), dwx+dwy = -dy/(th/2)
        const a = -dx / (tw() / 2), b = -dy / (th() / 2);
        cam.x = press.camX + (a + b) / 2;
        cam.y = press.camY + (b - a) / 2;
        const PAD = MEADOW - 1;
        cam.x = Math.max(-PAD, Math.min(FIELD_T + PAD, cam.x));
        cam.y = Math.max(-PAD, Math.min(FIELD_T + PAD, cam.y));
        schedule();
      }
    } else {
      const w = toWorld(sx, sy);
      const t = { tx: Math.floor(w.wx), ty: Math.floor(w.wy) };
      if (!hover || hover.tx !== t.tx || hover.ty !== t.ty) { hover = t; schedule(); }
    }
  });
  const endPress = (ev) => {
    if (!press || ev.pointerId !== press.id) return;
    const wasTap = !press.moved;
    press = null;
    if (wasTap && onTap && state && !state.readOnly) {
      const { sx, sy } = pos(ev);
      const idx = plantAt(sx, sy);
      const w = toWorld(sx, sy);
      onTap({ bx: w.wx / FIELD_T, by: w.wy / FIELD_T, plantIdx: idx });
    }
  };
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', () => { press = null; });
  canvas.addEventListener('pointerleave', () => { if (hover) { hover = null; schedule(); } });
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    const { sx, sy } = pos(ev);
    const before = toWorld(sx, sy);
    cam.zoom = Math.max(ZMIN, Math.min(ZMAX, cam.zoom * (ev.deltaY > 0 ? 0.9 : 1.1)));
    const after = toWorld(sx, sy);
    cam.x += before.wx - after.wx; cam.y += before.wy - after.wy;   // zoom about the cursor
    schedule();
  }, { passive: false });
  window.addEventListener('resize', schedule);

  return {
    update(next) { state = next; schedule(); },
    center() { cam.x = FIELD_T / 2; cam.y = FIELD_T / 2; schedule(); },
    redraw: schedule,
  };
}

export default { createIso, FIELD_T };
