// minimap.js — the MAP alt-screen (key `m`) + the pure geometry the main-map waypoint indicator shares.
//
// The map is the GROSS VORONOI TILING the world is generated from: each chunk's coarse "bones" cells
// (ch.cells[i].poly), filled in the real room colour scheme (ch.rooms[roomOf].color / road / void), fogged
// by the same `seen` set the main map uses — so a chunk reads as its true painted layout, not abstract dots.
// No glyphs by default: you HOVER a room (or tap-drag on touch) to get a context sub-window (verb · matter ·
// story name if one lives there). Glyphs appear only where you have an OBLIGATION — a chest holding items,
// the bed you last slept in, a garden with plants — plus QUEST markers as lesser waypoints (hover for the
// quest context). The page computes those game-specific bits (marks / roomAt) and hands them in via getState.
//
// The view transform + the off-screen edge-clamp + the on-screen test are pure, exported, and shared with the
// main map so the two surfaces agree exactly. Pinned by test/minimap.selftest.mjs.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the civic / third-place / market roles — the places worth routing to. Quiet rooms (dwell/store/move/
// grow/mend) are left off so the map reads at a glance. (Kept for back-compat + the selftest; the tiling
// no longer draws a marker per hub — hover surfaces every room's verb/matter instead.)
export const QUEST_ROLES = new Set(['govern', 'worship', 'learn', 'serve', 'trade', 'heal', 'play', 'make']);

// the map's own room-scheme constants (mirrors skin.js so the minimap reads like the painted floor).
const ROAD_RGB = [44, 70, 60], DOOR_RGB = [120, 92, 50], VOID_RGB = [10, 13, 18];
const hexRGB = (h) => { const c = String(h || '#3a4248').replace('#', ''); return [parseInt(c.slice(0, 2), 16) || 58, parseInt(c.slice(2, 4), 16) || 66, parseInt(c.slice(4, 6), 16) || 72]; };
const rgb = (a, m = 1) => `rgb(${clamp(a[0] * m, 0, 255) | 0},${clamp(a[1] * m, 0, 255) | 0},${clamp(a[2] * m, 0, 255) | 0})`;

// ── pure geometry (shared by the overlay + the main-map indicator, node-tested) ──────────────────────

// union bbox of every chunk polygon in `world.chunks` (the generated extent, seen or not). Pass a
// deck-filtered pseudo-world ({chunks:[…]}) to bound a single deck.
export function worldBBox(world) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const ch of world.chunks) for (const v of ch.poly) { if (v.x < x0) x0 = v.x; if (v.y < y0) y0 = v.y; if (v.x > x1) x1 = v.x; if (v.y > y1) y1 = v.y; }
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 1, y1: 1 };
  return { x0, y0, x1, y1 };
}

// fit a world bbox into a W×H canvas with `pad` margin; returns the scale, world centre, and the
// world↔mini transform pair (uniform scale, centred).
export function fitView(bbox, W, H, pad = 44) {
  const bw = Math.max(1, bbox.x1 - bbox.x0), bh = Math.max(1, bbox.y1 - bbox.y0);
  const scale = Math.max(1e-6, Math.min((W - 2 * pad) / bw, (H - 2 * pad) / bh));
  const cx = (bbox.x0 + bbox.x1) / 2, cy = (bbox.y0 + bbox.y1) / 2;
  return {
    scale, cx, cy, W, H,
    toMini: (x, y) => [(x - cx) * scale + W / 2, (y - cy) * scale + H / 2],
    toWorld: (mx, my) => [(mx - W / 2) / scale + cx, (my - H / 2) / scale + cy],
  };
}

// is a screen point inside the viewport (optionally inset by `margin`)?
export function onScreen(sx, sy, W, H, margin = 0) { return sx >= margin && sx <= W - margin && sy >= margin && sy <= H - margin; }

// clamp the ray (dx,dy) from a centre to an inset rectangle of half-extents (hw,hh): the edge point the
// off-screen direction arrow sits on, plus the bearing. (dx,dy) need not be normalised.
export function edgePoint(dx, dy, hw, hh) {
  const ang = Math.atan2(dy, dx), ux = Math.cos(ang), uy = Math.sin(ang);
  const ax = Math.max(Math.abs(ux), 1e-6), ay = Math.max(Math.abs(uy), 1e-6);
  const t = Math.min(hw / ax, hh / ay);
  return { x: ux * t, y: uy * t, ang };
}

// ── THE OVERLAY ──────────────────────────────────────────────────────────────────────────────────
export class MiniMap {
  // getState() → { world, walk, seen:Set, society, deck, px, py, waypoint:{x,y}|null,
  //                marks:[{x,y,kind,glyph,label,sub,color}], roomAt:(wx,wy)=>{verb,matter,story}|null }
  // onWaypoint(wp|null) — the page persists it + lights the main-map indicator
  constructor({ getState, onWaypoint }) {
    this.getState = getState; this.onWaypoint = onWaypoint;
    this.open = false; this.raf = null; this.dpr = 1; this.view = null;
    this.layer = null; this._key = '';        // cached tiling raster + its rebuild key
    this._hover = null;                        // {mx,my} last inspect point, or null
    this._build();
  }

  _build() {
    const root = document.createElement('div'); this.root = root;
    root.id = 'mmap'; root.style.cssText = 'position:fixed;inset:0;z-index:30;display:none;background:radial-gradient(120% 120% at 50% 42%,rgba(7,10,15,.95),rgba(2,3,6,.99));backdrop-filter:blur(2px);font-family:"JetBrains Mono",ui-monospace,monospace;color:#dfe7e2;';
    root.innerHTML = `
      <canvas id="mmcv" style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;touch-action:none;"></canvas>
      <div id="mmhead" style="position:absolute;top:14px;left:0;right:0;text-align:center;font-size:12px;color:#7fd8d0;letter-spacing:.4px;pointer-events:none;"></div>
      <div id="mmleg" style="position:absolute;top:34px;left:0;right:0;text-align:center;font-size:10.5px;color:#6b7872;pointer-events:none;">
        <span style="color:#fff7e6">◍</span> you · <span style="color:#f4bf62">⌖</span> waypoint · <span style="color:#e0c98a">▣</span> chest · <span style="color:#8fe07a">❀</span> garden · <span style="color:#9ee6df">✚</span> bed · <span style="color:#f4bf62">◈</span> quest — hover / drag for details</div>
      <div id="mmctx" style="position:absolute;display:none;pointer-events:none;z-index:2;max-width:230px;padding:8px 11px;background:rgba(6,10,15,0.94);border:1px solid #2a3642;border-radius:8px;font-size:11.5px;line-height:1.5;color:#dfe7e2;box-shadow:0 4px 18px rgba(0,0,0,.5);"></div>
      <div id="mmtip" style="position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:10.5px;color:#6b7872;pointer-events:none;">tap / click to drop a waypoint · tap it again to clear · hover or drag to inspect · esc to close</div>
      <button id="mmclear" style="position:absolute;top:10px;left:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;display:none;">✕ clear waypoint</button>
      <button id="mmclose" style="position:absolute;top:10px;right:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;">close ⏎</button>`;
    document.body.appendChild(root);
    this.cv = root.querySelector('#mmcv'); this.ctx = this.cv.getContext('2d');
    this.elHead = root.querySelector('#mmhead'); this.elClear = root.querySelector('#mmclear'); this.elCtx = root.querySelector('#mmctx');
    root.querySelector('#mmclose').addEventListener('click', () => this.close());
    this.elClear.addEventListener('click', () => { this.onWaypoint(null); });
    this._wire();
  }

  _wire() {
    const cv = this.cv;
    let downAt = null, moved = false;
    const local = (e) => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
    cv.addEventListener('pointerdown', (e) => {
      if (!this.view) return;
      const [mx, my] = local(e); downAt = { mx, my }; moved = false;
      this._inspect(mx, my);                                   // drag-to-inspect starts on press (touch)
      try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    });
    cv.addEventListener('pointermove', (e) => {
      if (!this.view) return;
      const [mx, my] = local(e);
      if (downAt) { if (Math.hypot(mx - downAt.mx, my - downAt.my) > 4) moved = true; this._inspect(mx, my); }   // dragging → inspect
      else if (e.pointerType === 'mouse') this._inspect(mx, my);                                                 // hovering (desktop)
    });
    cv.addEventListener('pointerup', (e) => {
      if (!this.view || !downAt) { downAt = null; return; }
      const [mx, my] = local(e); const st = this.getState();
      // released on the existing waypoint (a tap, not a drag) → clear it
      if (st.waypoint) { const [wx, wy] = this.view.toMini(st.waypoint.x, st.waypoint.y); if (!moved && Math.hypot(mx - wx, my - wy) <= 14) { this.onWaypoint(null); downAt = null; if (e.pointerType !== 'mouse') this._hideCtx(); return; } }
      const [x, y] = this.view.toWorld(mx, my); this.onWaypoint({ x, y });   // tap/click OR end-of-drag drops a waypoint
      downAt = null;
      if (e.pointerType !== 'mouse') this._hideCtx();                         // touch: release ends the inspect
    });
    cv.addEventListener('pointerleave', () => { if (!downAt) this._hideCtx(); });
    this._keyh = (e) => { if (!this.open) return; if (e.key === 'Escape') { this.close(); e.preventDefault(); } };
    addEventListener('keydown', this._keyh);
  }

  // hit-test the point: a nearby MARK (chest/bed/garden/quest) wins over the room under it; show the
  // context sub-window with whatever we found. Purely presentational — no state change.
  _inspect(mx, my) {
    const st = this.getState(); if (!this.view) return;
    let html = null;
    // marks first (they're the reason a glyph is drawn) — nearest within a small screen radius
    let best = null, bd = 15 * 15;
    for (const m of (st.marks || [])) { const [sx, sy] = this.view.toMini(m.x, m.y); const d = (mx - sx) ** 2 + (my - sy) ** 2; if (d < bd) { bd = d; best = m; } }
    if (best) {
      html = `<div style="color:${best.color || '#f4bf62'};font-weight:600">${best.glyph ? best.glyph + ' ' : ''}${esc(best.label || best.kind)}</div>`
        + (best.sub ? `<div style="color:#aeb9b3;margin-top:2px">${esc(best.sub)}</div>` : '');
    } else {
      const [wx, wy] = this.view.toWorld(mx, my), info = st.roomAt ? st.roomAt(wx, wy) : null;
      if (info) {
        const vm = [info.verb, info.matter].filter(Boolean).join(' · ');
        html = `<div style="color:#cfe0d8;font-weight:600">${esc(vm || 'a chamber')}</div>`
          + (info.story ? `<div style="color:#e0c98a;margin-top:2px">${esc(info.story)}</div>` : '');
      }
    }
    if (!html) return this._hideCtx();
    const el = this.elCtx; el.innerHTML = html; el.style.display = 'block';
    const w = el.offsetWidth || 180, h = el.offsetHeight || 40;
    el.style.left = clamp(mx + 14, 6, this.W - w - 6) + 'px';
    el.style.top = clamp(my + 14, 6, this.H - h - 6) + 'px';
  }
  _hideCtx() { if (this.elCtx) this.elCtx.style.display = 'none'; }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    this.open = true; this.root.style.display = 'block'; this._invalidate(); this._resize();
    const loop = () => { if (!this.open) return; this._frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  close() { this.open = false; this.root.style.display = 'none'; this._hideCtx(); if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; }
  _invalidate() { this._key = ''; }     // force the tiling raster to rebuild next frame

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.cv.clientWidth || window.innerWidth; this.H = this.cv.clientHeight || window.innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this._invalidate();
  }

  _deckChunks(st) { const d = st.deck || 0; return st.world.chunks.filter((ch) => (ch.deck || 0) === d); }

  _frame() {
    if (this.W !== this.cv.clientWidth || this.H !== this.cv.clientHeight) this._resize();
    const st = this.getState(); if (!st.world || !st.walk) return;
    this._ensureLayer(st);
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (this.layer) ctx.drawImage(this.layer, 0, 0, W, H);          // the cached tiling raster
    this._drawDynamic(ctx, st);
    this.elClear.style.display = st.waypoint ? 'block' : 'none';
    const seen = st.seen ? st.seen.size : 0, N = st.walk.N || 1;
    const dn = ['the Nave', 'the Upper Rind', 'the Lower Rind'][st.deck || 0] || ('deck ' + (st.deck || 0));
    const nc = this._deckChunks(st).length;
    this.elHead.innerHTML = `▦ minimap · ${esc(dn)} · ${nc} chunk${nc === 1 ? '' : 's'} · ${(seen / N * 100) | 0}% explored`;
  }

  // rebuild the static tiling raster only when the world grows / more is revealed / the deck or size
  // changes (perf: a few thousand voronoi cells shouldn't repaint every frame).
  _ensureLayer(st) {
    const seenSize = st.seen ? st.seen.size : 0, deck = st.deck || 0;
    const key = `${st.world.chunks.length}|${seenSize}|${deck}|${this.W}x${this.H}|${this.dpr}`;
    if (key === this._key && this.layer) return;
    this._key = key;
    const chunks = this._deckChunks(st);
    this.view = fitView(worldBBox({ chunks: chunks.length ? chunks : st.world.chunks }), this.W, this.H, 48);
    const lc = this.layer && this.layer.width === this.W * this.dpr ? this.layer : (this.layer = document.createElement('canvas'));
    lc.width = this.W * this.dpr; lc.height = this.H * this.dpr;
    const g = lc.getContext('2d'); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.W, this.H);
    const { toMini } = this.view, seenSet = st.seen || new Set();
    for (const ch of chunks) {
      // the chunk's generated outline — faint, so the extent ahead reads even before you explore it
      g.beginPath(); ch.poly.forEach((v, i) => { const [mx, my] = toMini(v.x, v.y); i ? g.lineTo(mx, my) : g.moveTo(mx, my); }); g.closePath();
      g.fillStyle = 'rgba(12,17,23,0.5)'; g.fill();
      g.strokeStyle = 'rgba(40,54,66,0.45)'; g.lineWidth = 1; g.stroke();
      // THE GROSS VORONOI TILING: each SEEN bones cell, filled in the real room colour (road / door / room),
      // with a hairline seam — the coarse voronoi the map is generated from, fogged 1:1 with the main map.
      const base = st.walk.base[ch.id]; if (base == null || !ch.cells) continue;
      const rooms = ch.rooms || [], roomOf = ch.roomOf || [], road = ch.road || [];
      for (let i = 0; i < ch.cells.length; i++) {
        if (!seenSet.has(base + i)) continue;                       // fog
        const c = ch.cells[i], poly = c.poly; if (!poly || poly.length < 3) continue;
        let col;
        if (road[i]) col = rgb(ROAD_RGB, 1.0);
        else { const rid = roomOf[i]; col = (rid != null && rid >= 0 && rooms[rid]) ? rgb(hexRGB(rooms[rid].color), 0.92) : rgb(VOID_RGB, 1); }
        g.beginPath(); for (let k = 0; k < poly.length; k++) { const [mx, my] = toMini(poly[k][0], poly[k][1]); k ? g.lineTo(mx, my) : g.moveTo(mx, my); } g.closePath();
        g.fillStyle = col; g.fill();
        g.strokeStyle = 'rgba(6,9,12,0.35)'; g.lineWidth = 0.5; g.stroke();
      }
    }
  }

  _drawDynamic(ctx, st) {
    const { toMini } = this.view;
    // OBLIGATION + QUEST marks — the only glyphs on the map. Quest marks are LESSER waypoints (small hollow
    // rings); obligation marks are their glyph. Everything else is hover-to-inspect.
    for (const m of (st.marks || [])) {
      const [mx, my] = toMini(m.x, m.y), col = m.color || '#f4bf62';
      if (m.kind === 'quest') {
        const t = (Date.now() % 1600) / 1600;
        ctx.beginPath(); ctx.arc(mx, my, 4 + t * 3, 0, 7); ctx.strokeStyle = `rgba(244,191,98,${(1 - t) * 0.6})`; ctx.lineWidth = 1.2; ctx.stroke();
        ctx.beginPath(); ctx.arc(mx, my, 3.4, 0, 7); ctx.strokeStyle = col; ctx.lineWidth = 1.4; ctx.stroke();
        ctx.fillStyle = col; ctx.beginPath(); ctx.arc(mx, my, 1.3, 0, 7); ctx.fill();
      } else {
        ctx.fillStyle = 'rgba(6,10,15,0.85)'; ctx.beginPath(); ctx.arc(mx, my, 7.5, 0, 7); ctx.fill();
        ctx.fillStyle = col; ctx.font = '11px "JetBrains Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(m.glyph || '•', mx, my + 0.5);
      }
    }
    // the waypoint
    if (st.waypoint) this._drawWaypoint(ctx, ...toMini(st.waypoint.x, st.waypoint.y));
    // the player — a hot dot with a soft pulsing ring
    const [px, py] = toMini(st.px, st.py), t = (Date.now() % 1600) / 1600, rr = 5 + t * 7;
    ctx.beginPath(); ctx.arc(px, py, rr, 0, 7); ctx.strokeStyle = `rgba(244,191,98,${(1 - t) * 0.5})`; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(px, py, 3.4, 0, 7); ctx.fillStyle = '#fff7e6'; ctx.shadowColor = 'rgba(244,191,98,0.95)'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
  }

  _drawWaypoint(ctx, x, y) {
    const t = (Date.now() % 1200) / 1200;
    ctx.beginPath(); ctx.arc(x, y, 7 + t * 5, 0, 7); ctx.strokeStyle = `rgba(244,191,98,${(1 - t) * 0.7})`; ctx.lineWidth = 1.6; ctx.stroke();
    ctx.strokeStyle = '#f4bf62'; ctx.lineWidth = 1.8;
    ctx.beginPath(); ctx.arc(x, y, 6, 0, 7); ctx.moveTo(x - 9, y); ctx.lineTo(x + 9, y); ctx.moveTo(x, y - 9); ctx.lineTo(x, y + 9); ctx.stroke();
  }
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

export default MiniMap;
