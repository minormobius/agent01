// inventory.js — the PACK: a novel inventory rendered as a Voronoi-tiled CYLINDER you rotate.
//
// The pack's items are laid out on the *unrolled* surface of a cylinder (an angle×height strip),
// Voronoi-tiled — one seed per item slot. The strip wraps in the angular axis (the seam is seamless:
// seeds get ±circumference ghost-copies so cells clip across the join) and is bounded top/bottom by
// each seed's own reflection (so the band has clean edges). The strip is then projected back onto a
// cylinder: angle → sin/cos around a vertical axis, so spinning `rot` rolls items through the front.
// Front cells are large & bright; cells rolling to the sides foreshorten and dim; the back is culled.
//
// The item objects come straight from the shared item-genome engine (./sprite/item) — each is a full
// genome with expressed stats, grade, spikes, material colour and a verb glyph. Inventory is a *view*;
// it owns no item data of its own beyond the pack array, so combat/lore/world drops can mutate the pack
// and the cylinder just re-tiles. Deterministic layout from (count, geometry): no unseeded randomness
// except the cosmetic seed-jitter, which is itself seeded off the slot index.

import { clipCell } from './paint/voronoi.js';
import { drawGlyph, drawSprite } from './sprite/item/sprite.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const angDiff = (a, b) => { let d = (a - b) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; };
// a tiny seeded jitter so cell seams aren't a perfect grid (cosmetic only, slot-deterministic)
const jit = (i, s) => { let h = Math.imul((i + 1) ^ (s * 0x9e3779b1), 2654435761); h ^= h >>> 15; return ((h >>> 0) / 4294967296) - 0.5; };
// shade a hex colour toward black (t<0) or white (t>0)
function shade(hex, t) {
  const c = hex.replace('#', ''); const n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = t < 0 ? 0 : 255, m = Math.abs(t);
  r = Math.round(lerp(r, k, m)); g = Math.round(lerp(g, k, m)); b = Math.round(lerp(b, k, m));
  return `rgb(${r},${g},${b})`;
}
function centroid(poly) { let x = 0, y = 0; for (const p of poly) { x += p[0]; y += p[1]; } return [x / poly.length, y / poly.length]; }

// ── LAYOUT — items → seeds on the angle×height strip → wrapped Voronoi cell polygons ───────────────
// C is the strip circumference (angular axis, strip units); Hs its height. Columns must divide the
// circle evenly so the seam tiles, so we fix `cols` and place one seed per (row,col) slot.
export function buildLayout(count, C, Hs) {
  const n = Math.max(1, count | 0);
  const rows = n <= 7 ? 1 : n <= 20 ? 2 : 3;
  const cols = Math.max(rows + 2, Math.ceil(n / rows));     // ≥ a few columns so the band reads as a ring
  const slots = [];
  const colW = C / cols, rowH = Hs / rows;
  for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
    const idx = r * cols + c;
    const x = (c + 0.5 + jit(idx, 11) * 0.34) * colW;
    const y = (r + 0.5 + jit(idx, 29) * 0.30) * rowH;
    slots.push({ idx, col: c, row: r, x, y, angle: (x / C) * TAU });
  }
  // neighbour pool: every seed plus its ±C angular ghosts (seam wrap)
  const pool = [];
  for (const s of slots) { pool.push(s, { x: s.x - C, y: s.y }, { x: s.x + C, y: s.y }); }
  const R = C; // generous clip box; neighbours do the real cutting
  for (const s of slots) {
    const nb = pool.filter((p) => p !== s);
    nb.push({ x: s.x, y: -s.y }, { x: s.x, y: 2 * Hs - s.y });  // reflections bound this seed's band edge
    s.cell = clipCell(s, nb, R);
  }
  return { rows, cols, slots, C, Hs };
}

// ── THE VIEW ───────────────────────────────────────────────────────────────────────────────────
export class Inventory {
  constructor({ pack = [], onClose = null, title = 'pack', equipInfo = null, onEquip = null } = {}) {
    this.pack = pack; this.onClose = onClose; this.title = title;
    this.equipInfo = equipInfo; this.onEquip = onEquip;   // controller hooks for the inventory⇆equipment link
    this.rot = 0; this.target = 0; this.focus = 0; this.open = false;
    this.drag = null; this.raf = null; this.dpr = 1; this.layout = null;
    this._build();
  }
  setPack(pack) { this.pack = pack || []; this._relayout(); this._renderDetail(); }

  _build() {
    const root = document.createElement('div'); this.root = root;
    root.id = 'inv'; root.style.cssText = 'position:fixed;inset:0;z-index:30;display:none;background:radial-gradient(120% 120% at 50% 40%,rgba(8,11,16,.93),rgba(3,4,7,.985));backdrop-filter:blur(2px);font-family:"JetBrains Mono",ui-monospace,monospace;color:#dfe7e2;';
    root.innerHTML = `
      <canvas id="invcv" style="position:absolute;inset:0;width:100%;height:100%;display:block;cursor:grab;touch-action:none;"></canvas>
      <div id="invhead" style="position:absolute;top:14px;left:0;right:0;text-align:center;font-size:12px;color:#7fd8d0;letter-spacing:.4px;pointer-events:none;"></div>
      <div id="invtip" style="position:absolute;bottom:12px;left:0;right:0;text-align:center;font-size:10.5px;color:#6b7872;pointer-events:none;">drag / ← → to spin · scroll to cycle · click a cell · esc to close</div>
      <button id="invclose" style="position:absolute;top:10px;right:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;">close ⏎</button>
      <div id="invcard" style="position:absolute;bottom:0;left:0;right:0;max-width:560px;margin:0 auto;padding:14px 18px 40px;pointer-events:none;"></div>`;
    document.body.appendChild(root);
    this.cv = root.querySelector('#invcv'); this.ctx = this.cv.getContext('2d');
    this.elHead = root.querySelector('#invhead'); this.elCard = root.querySelector('#invcard');
    root.querySelector('#invclose').addEventListener('click', () => this.close());
    this._wire();
  }

  _wire() {
    const cv = this.cv;
    const ptAngle = (e) => { const r = cv.getBoundingClientRect(); return ((e.clientX - r.left) / r.width - 0.5); };
    cv.addEventListener('pointerdown', (e) => { this.drag = { a: ptAngle(e), rot: this.target, moved: false }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing'; });
    cv.addEventListener('pointermove', (e) => {
      if (!this.drag) return;
      const da = (ptAngle(e) - this.drag.a) * TAU * 1.6;
      if (Math.abs(da) > 0.02) this.drag.moved = true;
      this.target = this.drag.rot + da;        // free-spin while dragging
    });
    const release = (e) => {
      if (!this.drag) return;
      const wasDrag = this.drag.moved; this.drag = null; cv.style.cursor = 'grab';
      if (wasDrag) this._snap();                 // settle onto the nearest item
      else if (e) this._pick(e);                 // a tap = focus the cell under the cursor
    };
    cv.addEventListener('pointerup', release);
    cv.addEventListener('pointercancel', () => { this.drag = null; cv.style.cursor = 'grab'; });
    cv.addEventListener('wheel', (e) => { e.preventDefault(); this.step(e.deltaY > 0 ? 1 : -1); }, { passive: false });
    this._keyh = (e) => {
      if (!this.open) return;
      if (e.key === 'Escape') { this.close(); }
      else if (e.key === 'ArrowRight' || e.key === 'd') { this.step(1); }
      else if (e.key === 'ArrowLeft' || e.key === 'a') { this.step(-1); }
      else return; e.preventDefault();
    };
    addEventListener('keydown', this._keyh);
  }

  // occupied slots, in angular order — the ring of real items
  _occupied() { return this.layout ? this.layout.slots.filter((s) => s.idx < this.pack.length) : []; }
  _relayout() {
    const C = 1000, Hs = this.pack.length <= 7 ? 300 : this.pack.length <= 20 ? 440 : 560;
    this.layout = buildLayout(this.pack.length, C, Hs);
    this._laidFor = this.pack.length;
    this.focus = clamp(this.focus, 0, Math.max(0, this.pack.length - 1));
  }
  _snap() {                                       // ease target onto the seed nearest the front
    const occ = this._occupied(); if (!occ.length) return;
    let best = occ[0], bd = Infinity;
    for (const s of occ) { const d = Math.abs(angDiff(s.angle, this.target)); if (d < bd) { bd = d; best = s; } }
    this.target = this.target + angDiff(best.angle, this.target);
    this.focus = best.idx;
  }
  step(dir) {                                     // advance focus to the next item around the ring
    const occ = this._occupied(); if (!occ.length) return;
    occ.sort((a, b) => a.angle - b.angle);
    let fi = occ.findIndex((s) => s.idx === this.focus); if (fi < 0) fi = 0;
    const next = occ[(fi + dir + occ.length) % occ.length];
    this.focus = next.idx;
    this.target = this.target + angDiff(next.angle, this.target);
  }
  _pick(e) {                                      // focus the occupied cell whose front-angle is nearest the tap
    const r = this.cv.getBoundingClientRect(); const fx = (e.clientX - r.left) / r.width - 0.5;
    const occ = this._occupied(); if (!occ.length) return;
    // map tap x to an angle offset on the front face, then pick nearest seed
    const tapAng = this.rot + Math.asin(clamp(fx * 2, -1, 1));
    let best = null, bd = Infinity;
    for (const s of occ) { const d = Math.abs(angDiff(s.angle, tapAng)); if (d < bd) { bd = d; best = s; } }
    if (best) { this.focus = best.idx; this.target = this.target + angDiff(best.angle, this.target); }
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    if (!this.layout || this._laidFor !== this.pack.length) this._relayout();
    this.open = true; this.root.style.display = 'block';
    const occ = this._occupied(); if (occ.length) { const f = occ.find(s => s.idx === this.focus) || occ[0]; this.focus = f.idx; this.target = f.angle; this.rot = f.angle; }
    this._resize(); this._renderDetail();
    const loop = () => { if (!this.open) return; this._frame(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  close() {
    this.open = false; this.root.style.display = 'none';
    if (this.raf) cancelAnimationFrame(this.raf), this.raf = null;
    if (this.onClose) this.onClose();
  }

  _resize() {
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.W = this.cv.clientWidth || window.innerWidth; this.H = this.cv.clientHeight || window.innerHeight;
    this.cv.width = this.W * this.dpr; this.cv.height = this.H * this.dpr;
  }

  _frame() {
    if (this.W !== this.cv.clientWidth || this.H !== this.cv.clientHeight) this._resize();
    // ease rotation toward target
    const prevFocus = this.focus;
    this.rot += angDiff(this.target, this.rot) * 0.18;
    if (!this.drag) {                                  // keep focus synced to whatever's at the front
      const occ = this._occupied();
      if (occ.length) { let b = occ[0], bd = Infinity; for (const s of occ) { const d = Math.abs(angDiff(s.angle, this.rot)); if (d < bd) { bd = d; b = s; } } this.focus = b.idx; }
    }
    if (this.focus !== prevFocus) this._renderDetail();
    this._draw();
  }

  _draw() {
    const ctx = this.ctx, W = this.W, H = this.H, dpr = this.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    if (!this.layout || !this.pack.length) { this.elHead.textContent = 'the pack is empty'; return; }
    const L = this.layout, CX = W / 2, CY = H * 0.46;
    const Rpix = Math.min(W * 0.42, 460);
    const baseV = Math.min(H * 0.0011, Rpix / L.Hs * 1.18);   // vertical strip-unit → screen scale
    const proj = (sx, sy) => {
      const a = (sx / L.C) * TAU - this.rot;
      return [CX + Rpix * Math.sin(a), CY + (sy - L.Hs / 2) * baseV * (0.80 + 0.20 * Math.cos(a)), Math.cos(a)];
    };
    // visible cells, back-to-front (painter's order)
    const vis = [];
    for (const s of L.slots) {
      if (!s.cell || s.cell.length < 3) continue;
      const d = Math.cos(s.angle - this.rot);
      if (d < -0.18) continue;                       // cull the back of the cylinder
      vis.push({ s, d });
    }
    vis.sort((a, b) => a.d - b.d);
    ctx.lineJoin = 'round';
    for (const { s, d } of vis) {
      const occupied = s.idx < this.pack.length;
      const item = occupied ? this.pack[s.idx] : null;
      const pts = s.cell.map((p) => proj(p[0], p[1]));
      ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
      ctx.closePath();
      const bright = smooth(-0.18, 0.9, d);
      if (item) { ctx.fillStyle = shade(item.color, lerp(-0.62, 0.04, bright)); ctx.globalAlpha = lerp(0.25, 1, bright); }
      else { ctx.fillStyle = '#0c1016'; ctx.globalAlpha = lerp(0.12, 0.4, bright); }
      ctx.fill();
      // seam + grade frame
      ctx.globalAlpha = lerp(0.25, 0.9, bright); ctx.lineWidth = 1;
      ctx.strokeStyle = item ? shade(item.frame, lerp(-0.4, 0.1, bright)) : 'rgba(40,52,64,.6)';
      const focused = occupied && s.idx === this.focus;
      if (focused) { ctx.lineWidth = 2.4; ctx.strokeStyle = '#f4bf62'; }
      ctx.stroke(); ctx.globalAlpha = 1;
      // the item glyph, sized to the cell & depth, centred on the projected centroid
      if (item) {
        const [cx, cy] = proj(...centroid(s.cell));
        const g = clamp((L.Hs / L.rows) * baseV * (0.46 + 0.30 * bright) * (focused ? 1.18 : 1), 14, 96);
        ctx.globalAlpha = lerp(0.4, 1, bright);
        drawGlyph(ctx, item, { x: cx - g / 2, y: cy - g / 2, size: g });
        ctx.globalAlpha = 1;
      }
    }
    this.elHead.innerHTML = `▣ ${this.title} · ${this.pack.length} item${this.pack.length === 1 ? '' : 's'}`;
  }

  _renderDetail() {
    const item = this.pack[this.focus];
    if (!item) { this.elCard.innerHTML = ''; return; }
    const st = item.stats || {};
    const bars = [['Potency', st.potency, 135], ['Durability', st.durability, 125], ['Mass', st.mass, 12], ['Value', st.value, 240]]
      .map(([k, v, max]) => {
        const w = clamp((v || 0) / max * 100, 2, 100);
        return `<div style="display:flex;align-items:center;gap:8px;font-size:10.5px;color:#9aa8a0">
          <span style="width:64px;color:#6b7872">${k}</span>
          <span style="flex:1;height:5px;background:#0f141a;border-radius:3px;overflow:hidden"><span style="display:block;height:100%;width:${w}%;background:${item.accent}"></span></span>
          <span style="width:34px;text-align:right;color:#cfd8d2">${v ?? '—'}</span></div>`;
      }).join('');
    const spikes = (item.spikes || []).map((s) => `<span style="display:inline-block;font-size:10px;padding:1px 6px;margin:2px 3px 0 0;border-radius:9px;border:1px solid ${s.dir === 'hi' ? item.frame : '#3a3030'};color:${s.dir === 'hi' ? '#f4bf62' : '#9b6b6b'}">${s.word}</span>`).join('');
    // a sprite peek + identity
    this.elCard.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;background:linear-gradient(180deg,rgba(10,13,18,.86),rgba(6,8,12,.86));border:1px solid #1b2530;border-top:2px solid ${item.frame};border-radius:12px;padding:12px 14px;">
        <canvas id="invsprite" width="120" height="120" style="width:60px;height:60px;flex:0 0 60px;image-rendering:pixelated;background:#06080c;border-radius:8px"></canvas>
        <div style="flex:1;min-width:0">
          <div style="font-size:15px;font-weight:600;color:#f4bf62;line-height:1.2">${item.glyph} ${esc(item.name)}</div>
          <div style="font-size:10.5px;color:#6b7872;margin:2px 0 9px;letter-spacing:.3px">${esc(item.kingdom)} · ${esc(item.phylum)} · ${esc(item.material)} · <span style="color:${item.frame}">${esc(item.gradeLabel || item.grade)}</span> · worth ${item.worth}</div>
          ${bars}
          <div style="margin-top:7px">${spikes}</div>
          ${item.lore ? `<div style="font-size:11px;color:#cbb6e6;margin-top:8px;line-height:1.5;border-left:2px solid ${item.frame};padding-left:8px">${esc(item.lore)}</div>` : ''}
          <div style="font-size:11px;color:#cfd8d2;margin-top:8px;line-height:1.5;font-style:italic">${esc(item.headline || '')}</div>
        </div>
      </div>${this._equipBtnHTML(item)}`;
    const sc = this.elCard.querySelector('#invsprite');
    if (sc) { const g = sc.getContext('2d'); g.imageSmoothingEnabled = false; try { drawSprite(g, item, { x: 12, y: 12, size: 96, frame: false }); } catch (e) {} }
    const eb = this.elCard.querySelector('#inveq');
    if (eb && this.onEquip) eb.addEventListener('click', () => this.onEquip(item));
  }
  // the EQUIP button (only for items that fit a body slot). Default action installs into the slot, swapping
  // whatever was there; if this item is already worn, it toggles to unequip. pointer-events:auto because the
  // card wrapper is click-through (pointer-events:none) so taps fall to the spinning ring behind it.
  _equipBtnHTML(item) {
    const info = this.equipInfo ? this.equipInfo(item) : null;
    if (!info || !info.slot) return '';
    const on = info.equipped;
    return `<button id="inveq" style="pointer-events:auto;margin-top:10px;width:100%;background:${on ? '#11331f' : '#131a22'};border:1px solid ${on ? '#2f7a4a' : '#34424d'};color:${on ? '#bfe9cf' : '#cfe3dc'};font:inherit;font-size:12.5px;padding:9px;border-radius:9px;cursor:pointer">`
      + (on ? `✓ equipped · ${esc(info.label)} — tap to unequip` : `equip ▸ ${esc(info.label)}`) + `</button>`;
  }
}
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m])); }

export default Inventory;
