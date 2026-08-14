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
import {
  growthOf, cropById, isWatered, isInfested, tileAt, FIELD_T, WORLD_MIN, WORLD_MAX, BUILDING_KINDS,
  parcelOf, ownsParcel, buyableParcels,
  ANIMALS, animalPos, animalProducing, animalFed, forageSpots, laneSpec,
} from './state.js';
import { modelFor } from './render.js';
import { currentSkin, groundFill, rgba as trgba } from './themes.js';

export { FIELD_T };
const TW = 72, TH = 36;               // base tile diamond (2:1) at zoom 1
const DRAG_PX = 6;                    // a press that moves less than this is a tap
const ZMIN = 0.3, ZMAX = 1.8;         // zoomed right out you can survey the whole estate

// seeded per-tile shade (fnv mix — house family)
function tileHash(seed, tx, ty) {
  let h = (seed >>> 0) ^ 0x9e3779b9;
  h = Math.imul(h ^ (tx + 101), 16777619); h = Math.imul(h ^ (ty + 977), 16777619);
  h ^= h >>> 15; return (h >>> 0) / 4294967296;
}

// ── RASTER CACHES (shared across iso instances) ──────────────────────────────────────────────────
// fillText with color-font emoji re-rasterizes the glyph every call — one of the two big per-frame
// costs (the other is the ground pass). Both caches trade a little memory for drawImage blits.

// text/emoji stamps: key (text, px, font, color, dpr) → offscreen canvas, centre-anchored
const _stamps = new Map();
function textStamp(text, px, font, color, dpr) {
  const key = text + '|' + px + '|' + font + '|' + (color || '') + '|' + dpr;
  let s = _stamps.get(key);
  if (!s) {
    if (_stamps.size > 400) _stamps.clear();
    const cv = document.createElement('canvas');
    const fontStr = px + 'px ' + font;
    let g = cv.getContext('2d');
    g.font = fontStr;
    const w = Math.max(2, Math.ceil(g.measureText(text).width) + Math.ceil(px * 0.5));
    const h = Math.max(2, Math.ceil(px * 1.6));
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.font = fontStr; g.textAlign = 'center'; g.textBaseline = 'middle';
    if (color) g.fillStyle = color;
    g.fillText(text, w / 2, h / 2);
    s = { cv, w, h };
    _stamps.set(key, s);
  }
  return s;
}

// plant sprites: drawPlant rasterizes a whole procedural model per plant per frame — cached here
// per (plant, stage bucket, size bucket). The bucket matches modelFor's, so pixels are stable
// within a bucket; uQ quantizes size so a zoom gesture doesn't mint 150 rasters per notch.
const _plantRasters = new Map();
let _plantRasterPx = 0;
function plantRaster(p, crop, stage, u, dpr, modelFor, drawPlant) {
  const uQ = Math.max(18, Math.round(u / 6) * 6);
  const bucket = Math.min(20, Math.floor(stage * 20));
  const key = p.id + ':' + p.seedId + ':' + bucket + ':' + uQ + ':' + dpr;
  let s = _plantRasters.get(key);
  if (!s) {
    if (_plantRasters.size > 320 || _plantRasterPx > 16_000_000) { _plantRasters.clear(); _plantRasterPx = 0; }
    const w = Math.ceil(uQ * 2), h = Math.ceil(uQ * 1.5);
    const ax = w / 2, ay = h - uQ * 0.3;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil(w * dpr); cv.height = Math.ceil(h * dpr);
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const m = modelFor(p, crop, stage);
    try { drawPlant(g, m, ax, ay, uQ * 0.6); } catch (e) { /* one bad model must not blank the field */ }
    s = { cv, w, h, ax, ay, uQ };
    _plantRasters.set(key, s);
    _plantRasterPx += cv.width * cv.height;
  }
  return s;
}

export function createIso(canvas, { onTap } = {}) {
  const ctx = canvas.getContext('2d');
  const cam = { x: FIELD_T / 2, y: FIELD_T / 2, zoom: 1 };   // camera looks at world point (x,y)
  let W = 0, H = 0, dpr = 1;
  let state = null;                                          // { farm, ark, now, tends, readOnly }
  let hover = null;                                          // {tx,ty} tile under cursor (planting aid)
  let hoverS = null;                                         // {sx,sy} screen point — outlines the tappable target
  let raf = 0;
  let particles = [];                                        // cosmetic floaters ({wx,wy,text,color,at,dx})
  let drawTimer = 0;                                         // the lazy liveliness tick
  let groundVersion = 0;                                     // bumped when anything the ground reads changes
  let gcache = null;                                         // the cached ground layer (see rebuildGround)
  let vign = null;                                           // cached vignette gradient
  let plantHits = [];                                        // this frame's plant hitboxes — hover/tap reuse
  let outlinedKey = null;                                    // what the play-mode outline ringed last frame
  const GM = 224;                                            // ground cache margin (css px): pan this far before a rebuild

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

  function diamondOn(g, cx, cy, w, h) {
    g.beginPath();
    g.moveTo(cx, cy - h / 2); g.lineTo(cx + w / 2, cy); g.lineTo(cx, cy + h / 2); g.lineTo(cx - w / 2, cy);
    g.closePath();
  }
  const diamond = (cx, cy, w, h) => diamondOn(ctx, cx, cy, w, h);

  // blit a cached glyph. baseline 'alphabetic' matches what fillText did at the same y.
  function stampAt(text, px, x, y, { font = 'system-ui, sans-serif', color = null, baseline = 'alphabetic' } = {}) {
    const s = textStamp(text, px, font, color, dpr);
    const yy = baseline === 'middle' ? y : y - px * 0.36;
    ctx.drawImage(s.cv, x - s.w / 2, yy - s.h / 2, s.w, s.h);
  }

  // THE GROUND LAYER CACHE. The tile pass was the whole-frame cost: at survey zoom it filled
  // thousands of diamonds per frame. The ground only changes when the WORLD changes (terraform,
  // purchase, skin, planting overlay) or the camera leaves the cached apron — so it renders once
  // into an offscreen (viewport + GM margin on every side) and every frame after is one blit.
  // Pond sheen is deliberately NOT cached: the water animates live over the blit (few tiles).
  function rebuildGround() {
    const { farm, readOnly } = state;
    const g = (state.theme || currentSkin(farm)).ground;
    const cw = W + GM * 2, ch = H + GM * 2;
    if (!gcache) gcache = { cv: document.createElement('canvas'), ponds: [] };
    const cv = gcache.cv;
    if (cv.width !== Math.ceil(cw * dpr) || cv.height !== Math.ceil(ch * dpr)) {
      cv.width = Math.ceil(cw * dpr); cv.height = Math.ceil(ch * dpr);
    }
    const g2 = cv.getContext('2d');
    g2.setTransform(dpr, 0, 0, dpr, 0, 0);
    g2.fillStyle = g.sky; g2.fillRect(0, 0, cw, ch);

    const corners = [toWorld(-GM, -GM), toWorld(W + GM, -GM), toWorld(-GM, H + GM), toWorld(W + GM, H + GM)];
    const tx0 = Math.max(WORLD_MIN, Math.floor(Math.min(...corners.map((c) => c.wx)) - 1));
    const tx1 = Math.min(WORLD_MAX, Math.ceil(Math.max(...corners.map((c) => c.wx)) + 1));
    const ty0 = Math.max(WORLD_MIN, Math.floor(Math.min(...corners.map((c) => c.wy)) - 1));
    const ty1 = Math.min(WORLD_MAX, Math.ceil(Math.max(...corners.map((c) => c.wy)) + 1));
    const forSale = new Map(buyableParcels(farm).map((b) => [b.px + ',' + b.py, b]));
    const ponds = [];

    // painter order: sum ascending draws back → front
    for (let s = tx0 + ty0; s <= tx1 + ty1; s++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const ty = s - tx; if (ty < ty0 || ty > ty1) continue;
        const kind = tileAt(farm, tx, ty);   // terraform-aware: overrides first, seeded baseline under
        const c0 = toScreen(tx + 0.5, ty + 0.5);
        const c = { x: c0.x + GM, y: c0.y + GM };
        if (c.x < -tw() || c.x > cw + tw() || c.y < -th() * 3 || c.y > ch + th()) continue;
        const [ppx, ppy] = parcelOf(tx, ty);
        const owned = ownsParcel(farm, ppx, ppy);
        const saleable = !owned && forSale.has(ppx + ',' + ppy);
        const r = tileHash(farm.bed.seed, tx, ty);
        const fill = groundFill(g, kind === 'stone' ? 'stone' : kind, r);   // stone paints its soil, boulder drawn on top
        // GLOBAL PLANTING OVERLAY: with a seed in hand, every soil tile declares itself — green
        // takes the seed, red will not (occupied, or a wetland crop out of its water range). The
        // same predicate the tap uses, so the map never lies; it re-paints as plants land.
        const plantTint = state.tool === 'plant' && owned && kind === 'soil' && state.toolCheck && !readOnly
          ? (state.toolCheck(tx, ty) ? 'rgba(143,224,160,0.22)' : 'rgba(224,120,96,0.18)') : null;

        if (kind === 'hill') {
          // a raised block: side skirts up to a lifted cap — the terrain you paid less because of
          const lift = th() * 0.55;
          g2.fillStyle = 'rgba(0,0,0,0.4)';   // shadow at the foot
          diamondOn(g2, c.x, c.y, tw(), th()); g2.fill();
          g2.fillStyle = trgba(g.hillSkirtL, 1);   // left skirt
          g2.beginPath(); g2.moveTo(c.x - tw() / 2, c.y); g2.lineTo(c.x, c.y + th() / 2); g2.lineTo(c.x, c.y + th() / 2 - lift); g2.lineTo(c.x - tw() / 2, c.y - lift); g2.closePath(); g2.fill();
          g2.fillStyle = trgba(g.hillSkirtR, 1);   // right skirt
          g2.beginPath(); g2.moveTo(c.x + tw() / 2, c.y); g2.lineTo(c.x, c.y + th() / 2); g2.lineTo(c.x, c.y + th() / 2 - lift); g2.lineTo(c.x + tw() / 2, c.y - lift); g2.closePath(); g2.fill();
          g2.fillStyle = groundFill(g, 'hill', r);   // grassy cap
          diamondOn(g2, c.x, c.y - lift, tw(), th()); g2.fill();
          g2.fillStyle = 'rgba(120,116,100,0.5)';   // rocky flecks
          g2.beginPath(); g2.ellipse(c.x + (r - 0.5) * tw() * 0.3, c.y - lift, tw() * 0.08, th() * 0.1, 0, 0, 7); g2.fill();
        } else {
          g2.fillStyle = fill;
          diamondOn(g2, c.x, c.y, tw(), th()); g2.fill();
          if (plantTint) { g2.fillStyle = plantTint; diamondOn(g2, c.x, c.y, tw() * 0.92, th() * 0.92); g2.fill(); }
          // furrow grid on the tillable soil only — reads as "you can plant here"
          if (kind === 'soil') { g2.strokeStyle = g.furrow; g2.lineWidth = 1; diamondOn(g2, c.x, c.y, tw(), th()); g2.stroke(); }
          if (kind === 'pond') ponds.push({ tx, ty });   // sheen animates live, over the blit
          if (kind === 'road') {   // faded centre-line dashes
            g2.strokeStyle = 'rgba(220,210,170,0.28)'; g2.lineWidth = Math.max(1, 1.5 * cam.zoom); g2.setLineDash([tw() * 0.14, tw() * 0.12]);
            g2.beginPath(); g2.moveTo(c.x - tw() * 0.25, c.y - th() * 0.12); g2.lineTo(c.x + tw() * 0.25, c.y + th() * 0.12); g2.stroke();
            g2.setLineDash([]);
          }
          if (kind === 'stone') {   // a boulder resting on the tile
            const rw = tw() * 0.26, rh = th() * 0.5;
            g2.fillStyle = g.boulder[0]; g2.beginPath(); g2.ellipse(c.x, c.y - rh * 0.4, rw, rh, 0, Math.PI, 0); g2.fill();
            g2.fillStyle = g.boulder[1]; g2.beginPath(); g2.ellipse(c.x, c.y - rh * 0.4, rw, rh * 0.45, 0, 0, Math.PI); g2.fill();
            g2.fillStyle = 'rgba(255,255,255,0.12)'; g2.beginPath(); g2.ellipse(c.x - rw * 0.35, c.y - rh * 0.75, rw * 0.35, rh * 0.3, 0, 0, 7); g2.fill();
          }
        }

        // fog of ownership: unowned land dims — parcels on the market a little less than the rest
        if (!owned) {
          g2.fillStyle = saleable ? g.fogSale : g.fogFar;
          const lift = kind === 'hill' ? th() * 0.55 : 0;
          diamondOn(g2, c.x, c.y - lift, tw(), th()); g2.fill();
        }
      }
    }
    gcache.ponds = ponds;
    gcache.camX = cam.x; gcache.camY = cam.y; gcache.zoom = cam.zoom;
    gcache.W = W; gcache.H = H; gcache.dpr = dpr; gcache.version = groundVersion;
  }

  function draw() {
    raf = 0;
    if (!state) return;
    const __t0 = performance.now();
    size();
    const { farm, ark, tends, readOnly, plantingCrop } = state;
    const now = Date.now();   // the LIVE clock: the world breathes between state updates too
    const g = (state.theme || currentSkin(farm)).ground;   // the equipped skin paints the world
    let motion = false;       // set when anything animated actually drew — gates the liveliness tick

    // ── ground: one blit from the cache; rebuild only when stale ──
    let gdx = 0, gdy = 0, gok = false;
    if (gcache && gcache.version === groundVersion && gcache.zoom === cam.zoom &&
        gcache.W === W && gcache.H === H && gcache.dpr === dpr) {
      gdx = ((cam.x - gcache.camX) - (cam.y - gcache.camY)) * tw() / 2;
      gdy = ((cam.x - gcache.camX) + (cam.y - gcache.camY)) * th() / 2;
      gok = Math.abs(gdx) < GM && Math.abs(gdy) < GM;
    }
    if (!gok) { rebuildGround(); gdx = 0; gdy = 0; }
    ctx.drawImage(gcache.cv, -GM - gdx, -GM - gdy, W + GM * 2, H + GM * 2);
    // living water over the blit
    for (const t of gcache.ponds) {
      const c = toScreen(t.tx + 0.5, t.ty + 0.5);
      if (c.x < -tw() || c.x > W + tw() || c.y < -th() || c.y > H + th()) continue;
      ctx.fillStyle = trgba(g.sheen, 0.06 + 0.05 * Math.sin(now / 900 + t.tx * 2.1 + t.ty * 1.3));
      diamond(c.x, c.y, tw() * 0.7, th() * 0.7); ctx.fill();
      motion = true;
    }
    const forSale = new Map(buyableParcels(farm).map((b) => [b.px + ',' + b.py, b]));

    // parcel survey lines + the home field's golden rim
    ctx.strokeStyle = g.survey; ctx.lineWidth = 1;
    for (let p = -2; p <= 3; p++) {
      const a = toScreen(p * FIELD_T, WORLD_MIN), b = toScreen(p * FIELD_T, WORLD_MAX + 1);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      const a2 = toScreen(WORLD_MIN, p * FIELD_T), b2 = toScreen(WORLD_MAX + 1, p * FIELD_T);
      ctx.beginPath(); ctx.moveTo(a2.x, a2.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
    }
    const e0 = toScreen(0, 0), e1 = toScreen(FIELD_T, 0), e2 = toScreen(FIELD_T, FIELD_T), e3 = toScreen(0, FIELD_T);
    ctx.strokeStyle = g.rim; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(e0.x, e0.y); ctx.lineTo(e1.x, e1.y); ctx.lineTo(e2.x, e2.y); ctx.lineTo(e3.x, e3.y); ctx.closePath(); ctx.stroke();

    // FOR SALE signs at the centre of each on-market parcel
    for (const [, b] of forSale) {
      const c = toScreen(b.px * FIELD_T + FIELD_T / 2, b.py * FIELD_T + FIELD_T / 2);
      if (c.x < -80 || c.x > W + 80 || c.y < -60 || c.y > H + 60) continue;
      ctx.strokeStyle = '#7a6a4a'; ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
      ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - th() * 1.3); ctx.stroke();
      const label = 'FOR SALE · ' + b.price + '◈';
      ctx.font = `bold ${Math.max(9, 11 * cam.zoom) | 0}px "JetBrains Mono", ui-monospace, monospace`;
      const wd = ctx.measureText(label).width + 12;
      ctx.fillStyle = '#241f15';
      ctx.fillRect(c.x - wd / 2, c.y - th() * 1.3 - 16 * cam.zoom - 4, wd, 16 * cam.zoom + 6);
      ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = 1;
      ctx.strokeRect(c.x - wd / 2, c.y - th() * 1.3 - 16 * cam.zoom - 4, wd, 16 * cam.zoom + 6);
      ctx.fillStyle = '#f4bf62'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(label, c.x, c.y - th() * 1.3 - (16 * cam.zoom + 4) / 2 + 1);
    }

    // hover tile (action aid): green = the current tool lands here, red = it doesn't. The tool is
    // whatever the host set — 'plant' when a seed is picked, a terraform verb in craft mode, 'move'
    // when a building is in hand. The host supplies toolCheck(tx,ty).
    const tool = state.tool || (plantingCrop ? 'plant' : null);
    if (hover && tool && !readOnly) {
      const okHere = state.toolCheck ? state.toolCheck(hover.tx, hover.ty) : false;
      const c = toScreen(hover.tx + 0.5, hover.ty + 0.5);
      ctx.fillStyle = okHere ? 'rgba(143,224,160,0.25)' : 'rgba(224,138,106,0.25)';
      diamond(c.x, c.y, tw(), th()); ctx.fill();
      ctx.strokeStyle = okHere ? '#8fe0a0' : '#e08a6a'; ctx.lineWidth = 1.5;
      diamond(c.x, c.y, tw(), th()); ctx.stroke();
    }

    // ── sprite pass: plants AND buildings in one painter order (back → front by wx+wy) ──
    const u = 118 * cam.zoom;   // plot-units → px for the flora sprites (heights ≤ ~1.15 units)
    const sprites = [];
    const hits = [];            // this frame's plant hitboxes — plantAt reuses them on every mousemove
    farm.bed.plants.forEach((p, i) => {
      const crop = cropById(ark, p.seedId);
      if (!crop) return;
      const g = growthOf(farm, p, crop, now, (tends || {})[p.id] || 0);
      sprites.push({ sum: p.x * FIELD_T + p.y * FIELD_T, draw: () => {
        const c = toScreen(p.x * FIELD_T, p.y * FIELD_T);
        if (c.x < -u || c.x > W + u || c.y < -u * 1.4 || c.y > H + u) return;
        const m = modelFor(p, crop, g.stage);
        hits.push({ i, x: c.x, halfW: Math.max(14, m.footprint * u * 0.45 + 8), top: c.y - m.height * u * 0.6 - 10, bottom: c.y + th() * 0.3, sum: p.x + p.y });
        ctx.fillStyle = 'rgba(0,0,0,0.3)';   // contact shadow: the sprite sits ON the ground
        ctx.beginPath(); ctx.ellipse(c.x, c.y, u * 0.1 + g.stage * u * 0.08, th() * 0.16, 0, 0, 7); ctx.fill();
        // the plant itself comes from the raster cache: drawPlant rasterizes a whole procedural
        // model — done once per (plant, stage bucket, size bucket), blitted every frame after
        const s = plantRaster(p, crop, g.stage, u, dpr, modelFor, drawPlant);
        const k = u / s.uQ;
        if (g.dead) ctx.globalAlpha = 0.45;   // the withered stand grey-faded until cleared
        ctx.drawImage(s.cv, c.x - s.ax * k, c.y - s.ay * k, s.w * k, s.h * k);
        ctx.globalAlpha = 1;
        if (g.dead) {   // 🥀 marks the corpse; a tap clears it
          stampAt('🥀', Math.max(11, 15 * cam.zoom) | 0, c.x, c.y - m.height * u * 0.6 - 6);
          return;
        }
        const bug = isInfested(farm, p, now);
        if (g.ready) {
          stampAt(bug ? '✓🐛' : '✓', Math.max(10, 13 * cam.zoom) | 0, c.x, c.y - m.height * u * 0.6 - 8,
            { font: '"JetBrains Mono", ui-monospace, monospace', color: '#8fe0a0' });
        } else if (g.stage > 0.02) {   // growth arc at the base: green while watered, parched orange when dry
          ctx.strokeStyle = g.watered ? 'rgba(143,224,160,0.8)' : 'rgba(224,150,80,0.9)';
          ctx.lineWidth = 2;
          if (!g.watered) ctx.setLineDash([4, 3]);
          ctx.beginPath(); ctx.ellipse(c.x, c.y, u * 0.13, th() * 0.2, 0, -Math.PI / 2, -Math.PI / 2 + g.stage * Math.PI * 2); ctx.stroke();
          ctx.setLineDash([]);
          if (!g.watered) {   // the thirst marker — this is the TASK calling (urgent beyond the ponds)
            stampAt(g.farWater ? '🏜' : '💧', Math.max(9, 12 * cam.zoom) | 0, c.x + u * 0.14, c.y - m.height * u * 0.6 - 6, { color: '#e09650' });
          }
          if (bug) stampAt('🐛', Math.max(9, 12 * cam.zoom) | 0, c.x - u * 0.14, c.y - m.height * u * 0.6 - 6);
        }
      } });
    });
    for (const b of farm.buildings || []) {
      const def = BUILDING_KINDS[b.kind]; if (!def) continue;
      const moving = state.movingBuilding === b.id;
      sprites.push({ sum: b.tx + 0.5 + b.ty + 0.5, draw: () => drawBuilding(b, def, moving) });
    }
    // THROUGH-TRAFFIC — little cars on the world lanes, in one border and out the other: the
    // proof the roads go somewhere. Deterministic from the clock; scenery, no hitbox.
    {
      const lanes = laneSpec(farm.bed.seed);
      const SPAN = WORLD_MAX - WORLD_MIN;
      const CARS = ['🚗', '🛻', '🚚', '🚌'];
      for (let lane = 0; lane < 2; lane++) {
        for (let i = 0; i < 3; i++) {
          const period = 16000 + lane * 4000 + i * 2600;
          let s = ((now / period) + i * 0.37 + lane * 0.53) % 1;
          if (i % 2) s = 1 - s;                              // opposing traffic
          const wpos = WORLD_MIN + s * SPAN + 0.5;
          const wx = lane === 0 ? wpos : lanes.v.col + 0.5;
          const wy = lane === 0 ? lanes.h.row + 0.5 : wpos;
          sprites.push({ sum: wx + wy - 0.01, draw: () => {
            const c = toScreen(wx, wy);
            if (c.x < -tw() || c.x > W + tw() || c.y < -th() * 2 || c.y > H + th()) return;
            motion = true;
            const dim = ownsParcel(farm, ...parcelOf(Math.floor(wx), Math.floor(wy))) ? 1 : 0.65;
            ctx.globalAlpha = dim;
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.beginPath(); ctx.ellipse(c.x, c.y + th() * 0.06, tw() * 0.11, th() * 0.1, 0, 0, 7); ctx.fill();
            stampAt(CARS[(lane * 3 + i) % CARS.length], Math.max(11, 16 * cam.zoom) | 0, c.x, c.y + Math.sin(now / 90 + i * 9) * 1.2 * cam.zoom);
            ctx.globalAlpha = 1;
          } });
        }
      }
    }
    // ANIMALS — emoji wanderers with a shadow and a status bubble (the heartbeat of the farm)
    for (const a of farm.animals || []) {
      const def = ANIMALS[a.kind]; if (!def) continue;
      const pos = animalPos(farm, a, now);
      const wx = pos.x * FIELD_T, wy = pos.y * FIELD_T;
      sprites.push({ sum: wx + wy, draw: () => {
        const c = toScreen(wx, wy);
        if (c.x < -tw() || c.x > W + tw() || c.y < -th() * 3 || c.y > H + th()) return;
        motion = true;
        const bob = Math.sin(now / 300 + wx) * 2 * cam.zoom;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath(); ctx.ellipse(c.x, c.y, tw() * 0.13, th() * 0.14, 0, 0, 7); ctx.fill();
        stampAt(def.emoji, Math.max(14, 22 * cam.zoom) | 0, c.x, c.y - 2 + bob);
        // status bubble: good ready > pettable > hungry
        const ready = animalProducing(farm, a, now) && now - (a.lastCollect || a.at) >= def.everyMs;
        const pettable = Math.floor((a.lastPet || 0) / 86400000) !== Math.floor(now / 86400000);
        const hungry = def.feedUnits > 0 && !animalFed(a, now);
        const bubble = ready ? def.goodEmoji : hungry ? '🍽️' : pettable ? '💕' : null;
        if (bubble) stampAt(bubble, Math.max(10, 14 * cam.zoom) | 0, c.x + tw() * 0.14, c.y - th() * 0.9 + bob);
      } });
    }

    // sprinklers: a small post with a spinning head; faint reach diamond while crafting
    for (const f of farm.fixtures || []) {
      if (f.kind !== 'sprinkler') continue;
      sprites.push({ sum: f.tx + 0.5 + f.ty + 0.5, draw: () => {
        const c = toScreen(f.tx + 0.5, f.ty + 0.5);
        if (c.x < -tw() || c.x > W + tw() || c.y < -th() * 3 || c.y > H + th()) return;
        motion = true;   // the head spins
        if (state.tool === 'sprinkler') {
          const R = state.sprinklerReach || 1;
          ctx.fillStyle = 'rgba(90,169,216,0.13)';
          diamond(c.x, c.y, tw() * (2 * R + 1), th() * (2 * R + 1)); ctx.fill();
        }
        ctx.strokeStyle = '#8a8f96'; ctx.lineWidth = Math.max(1.5, 2 * cam.zoom);
        ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - th() * 0.9); ctx.stroke();
        const spin = (now / 400) % (Math.PI * 2);
        ctx.strokeStyle = '#59c7cf';
        for (const a of [spin, spin + Math.PI * 2 / 3, spin + Math.PI * 4 / 3]) {
          ctx.beginPath(); ctx.moveTo(c.x, c.y - th() * 0.9);
          ctx.lineTo(c.x + Math.cos(a) * tw() * 0.12, c.y - th() * 0.9 + Math.sin(a) * th() * 0.12); ctx.stroke();
        }
        ctx.fillStyle = 'rgba(90,199,207,0.6)';
        ctx.beginPath(); ctx.arc(c.x, c.y - th() * 0.9, Math.max(1.5, 2 * cam.zoom), 0, 7); ctx.fill();
      } });
    }
    sprites.sort((a, b) => a.sum - b.sum);
    for (const s of sprites) s.draw();
    plantHits = hits;   // publish this frame's hitboxes for hover/tap reuse

    // play-mode selection outline: whatever a tap would land on gets a ring, so a click never
    // feels like a gamble against the tile hiding behind it
    outlinedKey = null;
    if (hoverS && !tool && !readOnly) {
      const hb = buildingHit(hoverS.sx, hoverS.sy);
      const pi = hb ? -1 : plantAt(hoverS.sx, hoverS.sy);
      let oc = null, ow = 1;
      if (hb) { oc = toScreen(hb.tx + 0.5, hb.ty + 0.5); ow = 1.15; outlinedKey = 'b' + hb.id; }
      else if (pi >= 0) { const pp = farm.bed.plants[pi]; oc = toScreen(pp.x * FIELD_T, pp.y * FIELD_T); ow = 0.7; outlinedKey = 'p' + pi; }
      if (oc) {
        ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 2; ctx.setLineDash([5, 4]);
        diamond(oc.x, oc.y, tw() * ow, th() * ow); ctx.stroke();
        ctx.setLineDash([]);
      }
    }

    // FORAGE SPARKLES — the arrival scavenger hunt twinkling across owned land
    if (!readOnly) {
      for (const spot of forageSpots(farm, now)) {
        const c = toScreen(spot.tx + 0.5, spot.ty + 0.5);
        if (c.x < -40 || c.x > W + 40 || c.y < -40 || c.y > H + 40) continue;
        motion = true;
        const tws = 0.75 + 0.35 * Math.sin(now / 260 + spot.i * 2.1);
        ctx.save();
        ctx.globalAlpha = 0.55 + 0.45 * Math.sin(now / 300 + spot.i);
        stampAt('✨', Math.max(11, 17 * cam.zoom * tws) | 0, c.x, c.y - th() * 0.3, { baseline: 'middle' });
        ctx.restore();
      }
    }

    // PARTICLES — pure cosmetic floaters (burst() pushes them; they live ~1s and die)
    if (particles.length) {
      const alive = [];
      for (const p of particles) {
        const age = now - p.at;
        if (age > 950) continue;
        alive.push(p);
        const c = toScreen(p.wx, p.wy);
        const t = age / 950;
        ctx.save();
        ctx.globalAlpha = 1 - t * t;
        ctx.font = `bold ${Math.max(11, (14 + 6 * (1 - t)) * cam.zoom) | 0}px "JetBrains Mono", ui-monospace, monospace`;
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = p.color || '#f7c66a';
        ctx.fillText(p.text, c.x + (p.dx || 0) * t * 30, c.y - th() * 0.6 - t * 46 * cam.zoom);
        ctx.restore();
      }
      particles = alive;
      if (particles.length) schedule();   // keep animating while any live
    }

    // the world breathes — but ONLY while something animated is actually on screen and the tab
    // is visible. An empty corner of the estate, a hidden tab, a covered pane: zero redraws.
    // (This replaced an unconditional tick that repainted the whole world 5.5×/s forever.)
    if (!readOnly && motion && !document.hidden && !drawTimer) {
      drawTimer = setTimeout(() => { drawTimer = 0; schedule(); }, 180);
    }

    // vignette (gradient cached per canvas size — building one per frame was pure waste)
    const vkey = W + 'x' + H;
    if (!vign || vign.key !== vkey) {
      const grad = ctx.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.75);
      grad.addColorStop(0, 'rgba(0,0,0,0)'); grad.addColorStop(1, 'rgba(0,0,0,0.38)');
      vign = { key: vkey, grad };
    }
    ctx.fillStyle = vign.grad; ctx.fillRect(0, 0, W, H);

    _stat.frames++; _stat.ms += performance.now() - __t0;
  }
  // frame-cost counters since the last read — the perf instrument (harvestople.isoStats())
  let _stat = { frames: 0, ms: 0 };

  // a station building: a little iso hut (two faces + roof) with its emoji over the door. The
  // stations ARE the game's rooms — tapping one opens its panel — so they must read at any zoom.
  function drawBuilding(b, def, moving) {
    const c = toScreen(b.tx + 0.5, b.ty + 0.5);
    const hw = tw() * 0.36, hh = th() * 0.36, wall = th() * 1.05;
    if (c.x < -tw() * 2 || c.x > W + tw() * 2 || c.y < -th() * 4 || c.y > H + th() * 2) return;
    ctx.save();
    if (moving) ctx.globalAlpha = 0.55;   // in hand: ghosted until it is set down
    ctx.fillStyle = 'rgba(0,0,0,0.35)';   // ground shadow
    ctx.beginPath(); ctx.ellipse(c.x, c.y, hw * 1.15, hh * 1.1, 0, 0, 7); ctx.fill();
    // left face / right face / roof
    ctx.fillStyle = '#3a3128';
    ctx.beginPath(); ctx.moveTo(c.x - hw, c.y - hh); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - wall); ctx.lineTo(c.x - hw, c.y - hh - wall * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#4a4033';
    ctx.beginPath(); ctx.moveTo(c.x + hw, c.y - hh); ctx.lineTo(c.x, c.y); ctx.lineTo(c.x, c.y - wall); ctx.lineTo(c.x + hw, c.y - hh - wall * 0.8); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#5c4a2f';
    ctx.beginPath(); ctx.moveTo(c.x, c.y - wall); ctx.lineTo(c.x + hw, c.y - hh - wall * 0.8); ctx.lineTo(c.x, c.y - hh * 2 - wall * 1.15); ctx.lineTo(c.x - hw, c.y - hh - wall * 0.8); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = 'rgba(244,191,98,0.35)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(c.x, c.y); ctx.lineTo(c.x, c.y - wall); ctx.stroke();
    // the emoji over the door + a label when zoomed in
    stampAt(def.emoji, Math.max(13, 19 * cam.zoom) | 0, c.x, c.y - wall * 0.55, { baseline: 'middle' });
    if (cam.zoom > 0.8) {
      ctx.font = `${Math.max(8, 10 * cam.zoom) | 0}px "JetBrains Mono", ui-monospace, monospace`;
      ctx.fillStyle = '#c8b890'; ctx.textBaseline = 'alphabetic';
      ctx.fillText(def.name, c.x, c.y + th() * 0.62);
    }
    ctx.restore();
  }

  const schedule = () => { if (!raf) raf = requestAnimationFrame(draw); };

  // find the plant under a screen point (front-most). Sprites stand up from their base.
  // Reuses the hitboxes the last draw published — a mousemove must never re-model the whole bed.
  function plantAt(sx, sy) {
    if (!state) return -1;
    if (plantHits.length || !state.farm.bed.plants.length) {
      let best = -1, bestSum = -Infinity;
      for (const h of plantHits) {
        if (sx >= h.x - h.halfW && sx <= h.x + h.halfW && sy >= h.top && sy <= h.bottom && h.sum > bestSum) {
          bestSum = h.sum; best = h.i;
        }
      }
      return best;
    }
    // no frame drawn yet (a tap can race the first paint) — the full scan, once
    const u = 118 * cam.zoom;
    let best = -1, bestSum = -Infinity;
    state.farm.bed.plants.forEach((p, i) => {
      const c = toScreen(p.x * FIELD_T, p.y * FIELD_T);
      const crop = cropById(state.ark, p.seedId);
      const g = growthOf(state.farm, p, crop, Date.now(), (state.tends || {})[p.id] || 0);
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

  // the building under a screen point (its hut silhouette), front-most first
  function buildingHit(sx, sy) {
    if (!state) return null;
    let best = null, bestSum = -Infinity;
    for (const b of state.farm.buildings || []) {
      const c = toScreen(b.tx + 0.5, b.ty + 0.5);
      // generous: a tap anywhere on the silhouette (roof and headroom included) is the building —
      // never the tile hiding behind it
      const hw = tw() * 0.52, wall = th() * 1.05, top = c.y - th() * 0.72 - wall * 1.15 - th() * 0.4;
      if (sx >= c.x - hw && sx <= c.x + hw && sy >= top && sy <= c.y + th() * 0.4) {
        const sum = b.tx + b.ty;
        if (sum > bestSum) { bestSum = sum; best = b; }
      }
    }
    return best;
  }

  // the animal under a screen point (front-most)
  function animalHit(sx, sy) {
    if (!state) return null;
    let best = null, bestSum = -Infinity;
    for (const a of state.farm.animals || []) {
      const pos = animalPos(state.farm, a, Date.now());   // the live clock — where draw() put them
      const c = toScreen(pos.x * FIELD_T, pos.y * FIELD_T);
      const rr = Math.max(16, tw() * 0.2);
      if (sx >= c.x - rr && sx <= c.x + rr && sy >= c.y - rr * 1.6 && sy <= c.y + rr * 0.6) {
        const sum = pos.x + pos.y;
        if (sum > bestSum) { bestSum = sum; best = a; }
      }
    }
    return best;
  }
  // the sparkle under a screen point
  function sparkleHit(sx, sy) {
    if (!state || state.readOnly) return null;
    for (const spot of forageSpots(state.farm, Date.now())) {
      const c = toScreen(spot.tx + 0.5, spot.ty + 0.5);
      if (Math.abs(sx - c.x) < Math.max(14, tw() * 0.22) && Math.abs(sy - (c.y - th() * 0.3)) < Math.max(14, th() * 0.5)) return spot;
    }
    return null;
  }

  // ── input: drag to pan, pinch/wheel to zoom, tap to act ──
  let press = null;   // { sx, sy, camX, camY, moved, id }
  const touches = new Map();   // pointerId → {sx,sy}; two live fingers = a pinch, never a tap
  let pinch = null;   // { d0, zoom0 } — finger distance and zoom at pinch start
  const pos = (ev) => { const r = canvas.getBoundingClientRect(); return { sx: ev.clientX - r.left, sy: ev.clientY - r.top }; };

  canvas.addEventListener('pointerdown', (ev) => {
    const { sx, sy } = pos(ev);
    touches.set(ev.pointerId, { sx, sy });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()];
      pinch = { d0: Math.hypot(a.sx - b.sx, a.sy - b.sy) || 1, zoom0: cam.zoom };
      press = null;   // the second finger cancels any pan/tap in progress
    } else if (touches.size === 1) {
      press = { sx, sy, camX: cam.x, camY: cam.y, moved: false, id: ev.pointerId };
    } else {
      press = null;
    }
    try { canvas.setPointerCapture(ev.pointerId); } catch { /* synthetic or already-lifted pointer */ }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const { sx, sy } = pos(ev);
    if (touches.has(ev.pointerId)) touches.set(ev.pointerId, { sx, sy });
    if (pinch && touches.size >= 2) {
      const [a, b] = [...touches.values()];
      const d = Math.hypot(a.sx - b.sx, a.sy - b.sy);
      if (d > 0) {
        const mx = (a.sx + b.sx) / 2, my = (a.sy + b.sy) / 2;
        const before = toWorld(mx, my);
        cam.zoom = Math.max(ZMIN, Math.min(ZMAX, pinch.zoom0 * (d / pinch.d0)));
        const after = toWorld(mx, my);
        cam.x += before.wx - after.wx; cam.y += before.wy - after.wy;   // zoom about the fingers
        schedule();
      }
      return;
    }
    if (press && ev.pointerId === press.id) {
      const dx = sx - press.sx, dy = sy - press.sy;
      if (Math.abs(dx) + Math.abs(dy) > DRAG_PX) press.moved = true;
      if (press.moved) {
        // invert the projection for the delta: dwx-dwy = -dx/(tw/2), dwx+dwy = -dy/(th/2)
        const a = -dx / (tw() / 2), b = -dy / (th() / 2);
        cam.x = press.camX + (a + b) / 2;
        cam.y = press.camY + (b - a) / 2;
        cam.x = Math.max(WORLD_MIN + 2, Math.min(WORLD_MAX - 1, cam.x));
        cam.y = Math.max(WORLD_MIN + 2, Math.min(WORLD_MAX - 1, cam.y));
        schedule();
      }
    } else {
      // hover bookkeeping — but only REDRAW when the visible aid would change: the hovered tile
      // (tool overlay) or the outlined tap target. A bare mousemove used to repaint the world.
      const w = toWorld(sx, sy);
      const t = { tx: Math.floor(w.wx), ty: Math.floor(w.wy) };
      const tileChanged = !hover || hover.tx !== t.tx || hover.ty !== t.ty;
      hover = t; hoverS = { sx, sy };
      let need = tileChanged;
      if (!need && state && !state.readOnly && !state.tool && !state.plantingCrop) {
        const hb = buildingHit(sx, sy);
        const key = hb ? 'b' + hb.id : (() => { const pi = plantAt(sx, sy); return pi >= 0 ? 'p' + pi : null; })();
        need = key !== outlinedKey;
      }
      if (need) schedule();
    }
  });
  const liftFinger = (ev) => {
    touches.delete(ev.pointerId);
    if (pinch && touches.size < 2) {
      pinch = null;
      // hand the surviving finger a pan (moved: it must never fire a tap)
      const [id] = [...touches.keys()];
      if (id !== undefined) { const p = touches.get(id); press = { sx: p.sx, sy: p.sy, camX: cam.x, camY: cam.y, moved: true, id }; }
    }
  };
  const endPress = (ev) => {
    liftFinger(ev);
    if (!press || ev.pointerId !== press.id) return;
    const wasTap = !press.moved;
    press = null;
    if (wasTap && onTap && state && !state.readOnly) {
      const { sx, sy } = pos(ev);
      const w = toWorld(sx, sy);
      onTap({
        bx: w.wx / FIELD_T, by: w.wy / FIELD_T,
        tx: Math.floor(w.wx), ty: Math.floor(w.wy),
        plantIdx: plantAt(sx, sy),
        building: buildingHit(sx, sy),
        animal: animalHit(sx, sy),
        sparkle: sparkleHit(sx, sy),
      });
    }
  };
  canvas.addEventListener('pointerup', endPress);
  canvas.addEventListener('pointercancel', (ev) => { liftFinger(ev); press = null; });
  canvas.addEventListener('pointerleave', () => { if (hover || hoverS) { hover = null; hoverS = null; schedule(); } });
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
  // a hidden tab draws nothing (the tick gate checks document.hidden) — wake it on return
  document.addEventListener('visibilitychange', () => { if (!document.hidden) schedule(); });

  return {
    update(next) {
      // anything the cached ground layer reads → new version → next draw rebuilds it
      if (!state || !next || next.farm !== state.farm || next.tool !== state.tool ||
          next.theme !== state.theme || next.plantingCrop !== state.plantingCrop ||
          next.toolCheck !== state.toolCheck || next.readOnly !== state.readOnly) groundVersion++;
      state = next; schedule();
    },
    center() { cam.x = FIELD_T / 2; cam.y = FIELD_T / 2; schedule(); },
    cam: () => ({ x: cam.x, y: cam.y, zoom: cam.zoom }),   // read-only peek (smoke tests)
    stats() { const s = { frames: _stat.frames, ms: _stat.ms, avg: _stat.frames ? _stat.ms / _stat.frames : 0 }; _stat = { frames: 0, ms: 0 }; return s; },
    redraw: schedule,
    // JUICE: float a little payoff off a world point (bed-normalized coords like plants)
    burst(bx, by, text, color) {
      particles.push({ wx: bx * FIELD_T, wy: by * FIELD_T, text, color, at: Date.now(), dx: Math.random() - 0.5 });
      schedule();
    },
  };
}

export default { createIso, FIELD_T };
