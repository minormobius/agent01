// minimap.js — the MAP alt-screen (key `m`) + the pure geometry the main-map waypoint indicator shares.
//
// A high-level read of the streamed world: every generated chunk's outline (the extent ahead), the
// cells you've actually SEEN painted in (where you've been), the civic interaction hubs as quest
// markers (where the quests are supposed to be — faint until you've discovered them), the player, and
// a WAYPOINT you drop with a click. Dropping a waypoint here lights a persistent direction indicator on
// the main map (see index.html drawWaypoint): an edge arrow while the target is off-screen, the marker
// itself once it rolls into the viewport.
//
// The view transform + the off-screen edge-clamp + the on-screen test are pure, exported, and shared
// with the main map so the two surfaces agree exactly. Pinned by test/minimap.selftest.mjs.

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// the civic / third-place / market roles — the places worth routing to. Quiet rooms (dwell/store/move/
// grow/mend) are left off so the map reads at a glance.
export const QUEST_ROLES = new Set(['govern', 'worship', 'learn', 'serve', 'trade', 'heal', 'play', 'make']);

// ── pure geometry (shared by the overlay + the main-map indicator, node-tested) ──────────────────────

// union bbox of every loaded chunk's polygon (the generated extent, seen or not)
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
  // getState() → { world, walk, seen:Set, society, px, py, waypoint:{x,y}|null }
  // onWaypoint(wp|null) — the page persists it + lights the main-map indicator
  constructor({ getState, onWaypoint }) {
    this.getState = getState; this.onWaypoint = onWaypoint;
    this.open = false; this.raf = null; this.dpr = 1; this.view = null;
    this.layer = null; this._key = '';        // cached "explored" raster + its rebuild key
    this._build();
  }

  _build() {
    const root = document.createElement('div'); this.root = root;
    root.id = 'mmap'; root.style.cssText = 'position:fixed;inset:0;z-index:30;display:none;background:radial-gradient(120% 120% at 50% 42%,rgba(7,10,15,.95),rgba(2,3,6,.99));backdrop-filter:blur(2px);font-family:"JetBrains Mono",ui-monospace,monospace;color:#dfe7e2;';
    root.innerHTML = `
      <canvas id="mmcv" style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:crosshair;touch-action:none;"></canvas>
      <div id="mmhead" style="position:absolute;top:14px;left:0;right:0;text-align:center;font-size:12px;color:#7fd8d0;letter-spacing:.4px;pointer-events:none;"></div>
      <div id="mmleg" style="position:absolute;top:34px;left:0;right:0;text-align:center;font-size:10.5px;color:#6b7872;pointer-events:none;">
        <span style="color:#fff7e6">◍</span> you · <span style="color:#b39bd8">◆</span> interaction · <span style="color:#f4bf62">⌖</span> waypoint</div>
      <div id="mmtip" style="position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:10.5px;color:#6b7872;pointer-events:none;">click to drop a waypoint · click it again to clear · esc to close</div>
      <button id="mmclear" style="position:absolute;top:10px;left:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;display:none;">✕ clear waypoint</button>
      <button id="mmclose" style="position:absolute;top:10px;right:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;">close ⏎</button>`;
    document.body.appendChild(root);
    this.cv = root.querySelector('#mmcv'); this.ctx = this.cv.getContext('2d');
    this.elHead = root.querySelector('#mmhead'); this.elClear = root.querySelector('#mmclear');
    root.querySelector('#mmclose').addEventListener('click', () => this.close());
    this.elClear.addEventListener('click', () => { this.onWaypoint(null); this._invalidate(); });
    this._wire();
  }

  _wire() {
    const cv = this.cv;
    cv.addEventListener('pointerdown', (e) => {
      if (!this.view) return;
      const r = cv.getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
      const st = this.getState();
      // clicking the existing waypoint clears it; otherwise drop a new one at the world point
      if (st.waypoint) { const [wx, wy] = this.view.toMini(st.waypoint.x, st.waypoint.y); if (Math.hypot(mx - wx, my - wy) <= 14) { this.onWaypoint(null); return; } }
      const [x, y] = this.view.toWorld(mx, my);
      this.onWaypoint({ x, y });
    });
    this._keyh = (e) => { if (!this.open) return; if (e.key === 'Escape') { this.close(); e.preventDefault(); } };
    addEventListener('keydown', this._keyh);
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    this.open = true; this.root.style.display = 'block'; this._invalidate(); this._resize();
    const loop = () => { if (!this.open) return; this._frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  close() { this.open = false; this.root.style.display = 'none'; if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; }
  _invalidate() { this._key = ''; }     // force the explored raster to rebuild next frame

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.cv.clientWidth || window.innerWidth; this.H = this.cv.clientHeight || window.innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
    this._invalidate();
  }

  _frame() {
    if (this.W !== this.cv.clientWidth || this.H !== this.cv.clientHeight) this._resize();
    const st = this.getState(); if (!st.world || !st.walk) return;
    this._ensureLayer(st);
    const ctx = this.ctx, W = this.W, H = this.H;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(this.layer, 0, 0, W, H);          // the cached explored raster
    this._drawDynamic(ctx, st);
    this.elClear.style.display = st.waypoint ? 'block' : 'none';
    const seen = st.seen ? st.seen.size : 0, N = st.walk.N || 1;
    this.elHead.innerHTML = `▦ minimap · ${st.world.chunks.length} chunk${st.world.chunks.length === 1 ? '' : 's'} · ${(seen / N * 100) | 0}% explored`;
  }

  // rebuild the static explored raster only when the world grows or more is revealed (perf: a few
  // thousand cells shouldn't repaint every frame — see CLAUDE.md's note on the reverted per-cell dim).
  _ensureLayer(st) {
    const seenSize = st.seen ? st.seen.size : 0;
    const key = `${st.world.chunks.length}|${seenSize}|${this.W}x${this.H}|${this.dpr}`;
    if (key === this._key && this.layer) return;
    this._key = key;
    this.view = fitView(worldBBox(st.world), this.W, this.H, 48);
    const lc = this.layer && this.layer.width === this.W * this.dpr ? this.layer : (this.layer = document.createElement('canvas'));
    lc.width = this.W * this.dpr; lc.height = this.H * this.dpr;
    const g = lc.getContext('2d'); g.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); g.clearRect(0, 0, this.W, this.H);
    const { toMini, scale } = this.view, seenSet = st.seen || new Set();
    for (const ch of st.world.chunks) {
      // the chunk's generated outline — faint, so the extent ahead reads even before you explore it
      g.beginPath(); ch.poly.forEach((v, i) => { const [mx, my] = toMini(v.x, v.y); i ? g.lineTo(mx, my) : g.moveTo(mx, my); }); g.closePath();
      g.fillStyle = 'rgba(14,19,26,0.55)'; g.fill();
      g.strokeStyle = 'rgba(40,54,66,0.5)'; g.lineWidth = 1; g.stroke();
      // the SEEN cells — two-tone (concourse brighter than rooms): where you've actually been
      const base = st.walk.base[ch.id], cs = Math.max(1.4, scale * (ch.cellSize || 16) * 0.95);
      for (let i = 0; i < ch.cells.length; i++) {
        if (!seenSet.has(base + i)) continue;
        const c = ch.cells[i], [mx, my] = toMini(c.x, c.y);
        g.fillStyle = ch.road[i] ? 'rgba(127,200,196,0.55)' : 'rgba(70,92,108,0.5)';
        g.fillRect(mx - cs / 2, my - cs / 2, cs, cs);
      }
    }
  }

  _drawDynamic(ctx, st) {
    const { toMini } = this.view;
    // quest interaction hubs — faint diamond until discovered, then solid + glyph
    if (st.society) for (const r of st.society.rooms) {
      if (!QUEST_ROLES.has(r.role)) continue;
      const seen = r.cellsG && r.cellsG.some((gid) => st.seen.has(gid));
      const [mx, my] = toMini(r.x, r.y), s = seen ? 6 : 4.5;
      ctx.beginPath(); ctx.moveTo(mx, my - s); ctx.lineTo(mx + s, my); ctx.lineTo(mx, my + s); ctx.lineTo(mx - s, my); ctx.closePath();
      if (seen) { ctx.fillStyle = 'rgba(179,155,216,0.92)'; ctx.fill(); ctx.fillStyle = '#0b0e14'; ctx.font = '8px "JetBrains Mono",monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(r.glyph || '·', mx, my + 0.5); }
      else { ctx.strokeStyle = 'rgba(120,104,150,0.6)'; ctx.lineWidth = 1; ctx.stroke(); }
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

export default MiniMap;
