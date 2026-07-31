// equipped.js — the EQUIPPED page: a stained-glass Vitruvian figure of the player, each body region
// shattered into lead-came glass shards tinted by the item equipped into that region's slot. This is
// the character⇆inventory crossover surface and the visualisation hook for "what would this item look
// like equipped onto this body" — swap in any body plan (two heads, wheels, a shoulder cannon) and the
// same tiler + renderer light it up. A first pass: humanoid plan, auto-equipped from the pack.

import { defaultPlan, BODY_PLANS, glassTiling, autoEquip, slotForItem, SLOTS } from './bodyplan.js';
import { drawGlyph } from './sprite/item/sprite.js';

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (m) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
function shade(hex, t) {
  if (!hex || hex[0] !== '#') return hex || '#888';
  const c = hex.slice(1), n = parseInt(c.length === 3 ? c.replace(/(.)/g, '$1$1') : c, 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const k = t < 0 ? 0 : 255, m = Math.abs(t); r = Math.round(r + (k - r) * m); g = Math.round(g + (k - g) * m); b = Math.round(b + (k - b) * m);
  return `rgb(${r},${g},${b})`;
}
const sjit = (x, y) => { let h = Math.imul(((x * 9301) ^ (y * 49297)) | 0, 2654435761); h ^= h >>> 15; return ((h >>> 0) / 4294967296) - 0.5; };

export class EquippedView {
  constructor({ getCharacter = () => null, getPack = () => [], onClose = null, planId = 'humanoid' } = {}) {
    this.getCharacter = getCharacter; this.getPack = getPack; this.onClose = onClose; this.planId = planId;
    this.open = false; this.raf = null; this.phase = 0; this.dpr = 1; this.shards = null; this.equipped = {};
    this._build();
  }

  _build() {
    const root = document.createElement('div'); this.root = root;
    root.id = 'equip'; root.style.cssText = 'position:fixed;inset:0;z-index:35;display:none;overflow:auto;background:radial-gradient(120% 120% at 50% 38%,rgba(6,9,14,.97),rgba(2,3,6,.995));font-family:"JetBrains Mono",ui-monospace,monospace;color:#dfe7e2;';
    root.innerHTML = `
      <button id="eqclose" style="position:absolute;top:10px;right:14px;background:none;border:0;color:#6b7872;font:inherit;font-size:12px;cursor:pointer;z-index:2">close ⏎</button>
      <div id="eqhead" style="position:absolute;top:14px;left:0;right:0;text-align:center;font-size:12px;color:#7fd8d0;letter-spacing:.5px;pointer-events:none"></div>
      <div style="display:flex;gap:8px;align-items:center;justify-content:center;min-height:100%;flex-wrap:wrap;padding:48px 14px">
        <canvas id="eqcv" width="520" height="720" style="width:min(46vh,360px);height:auto;filter:drop-shadow(0 0 22px rgba(127,216,208,.10))"></canvas>
        <div id="eqlist" style="min-width:220px;max-width:300px"></div>
      </div>`;
    document.body.appendChild(root);
    this.cv = root.querySelector('#eqcv'); this.ctx = this.cv.getContext('2d');
    root.querySelector('#eqclose').addEventListener('click', () => this.close());
    this._keyh = (e) => { if (this.open && e.key === 'Escape') { this.close(); e.preventDefault(); } };
    addEventListener('keydown', this._keyh);
  }

  _rebuild() {
    const c = this.getCharacter(); const plan = BODY_PLANS[this.planId] || defaultPlan();
    this.plan = plan;
    const seed = (c && c.seed) || 7;
    this.shards = glassTiling(plan, seed, 7);
    this.equipped = autoEquip(plan, this.getPack() || []);
    // index regions for anchors/labels
    this.regionById = {}; for (const r of plan.regions) this.regionById[r.id] = r;
    this._renderHead(c); this._renderList(c);
  }
  _renderHead(c) {
    this.root.querySelector('#eqhead').innerHTML = c
      ? `⛨ EQUIPPED · ${esc(c.name)} — <b style="color:#cfd8d2">${esc(c.cast.label)} ${esc(c.vocTag)}</b> · ${esc(this.plan.label)} plan`
      : `⛨ EQUIPPED · no character yet — roll one with 'c'`;
  }
  _renderList(c) {
    const slots = [...new Set(this.plan.regions.map((r) => r.slot))];
    this.root.querySelector('#eqlist').innerHTML = slots.map((sl) => {
      const it = this.equipped[sl], L = (SLOTS[sl] || {}).label || sl;
      if (!it) return `<div style="font-size:11px;color:#6b7872;border-bottom:1px solid #141c24;padding:7px 0">${esc(L)} <span style="float:right">— empty</span></div>`;
      return `<div style="font-size:11px;border-bottom:1px solid #141c24;padding:7px 0;display:flex;justify-content:space-between;gap:8px">
        <span style="color:#9aa8a0">${esc(L)}</span>
        <span style="text-align:right"><b style="color:${it.frame}">${it.glyph} ${esc(it.name)}</b><br><span style="color:#6b7872">${esc(it.kingdom)} · ⚔${it.stats?.potency ?? '—'} ⛨${it.stats?.durability ?? '—'}</span></span></div>`;
    }).join('') + `<div style="font-size:10px;color:#566066;margin-top:12px;line-height:1.5">stained-glass shards are tinted by the item equipped to each region. body plan is a hook — alternate plans (extra heads, wheels, a shoulder cannon) drop in as new regions.</div>`;
  }

  toggle() { this.open ? this.close() : this.show(); }
  show() {
    this.open = true; this.root.style.display = 'block'; this._rebuild();
    const loop = () => { if (!this.open) return; this.phase++; this._draw(); this.raf = requestAnimationFrame(loop); };
    this.raf = requestAnimationFrame(loop);
  }
  close() { this.open = false; this.root.style.display = 'none'; if (this.raf) cancelAnimationFrame(this.raf), this.raf = null; if (this.onClose) this.onClose(); }

  _draw() {
    const ctx = this.ctx, W = this.cv.width, H = this.cv.height;
    ctx.clearRect(0, 0, W, H);
    if (!this.shards) return;
    // the figure box (a touch of margin), 0..1 → canvas
    const m = 0.06, bx = W * m, by = H * m, bw = W * (1 - 2 * m), bh = H * (1 - 2 * m);
    const px = (x) => bx + x * bw, py = (y) => by + y * bh;
    const breath = 1 + 0.012 * Math.sin(this.phase * 0.05);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (const sh of this.shards) {
      const it = this.equipped[sh.slot], region = this.regionById[sh.region];
      const base = it ? it.color : (region.tint || '#3a4654');
      const j = sjit(sh.seed[0] * 1000, sh.seed[1] * 1000);
      ctx.beginPath();
      const p0 = sh.poly[0]; ctx.moveTo(px(p0[0]), py(p0[1]));
      for (let i = 1; i < sh.poly.length; i++) ctx.lineTo(px(sh.poly[i][0]), py(sh.poly[i][1]));
      ctx.closePath();
      ctx.fillStyle = shade(base, j * 0.5 + (it ? 0.06 : -0.18));    // glass facet variance; equipped glows brighter
      ctx.globalAlpha = it ? 0.96 : 0.5; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#05070b'; ctx.lineWidth = Math.max(1.2, bw * 0.006); ctx.stroke();   // lead came
    }
    // equipped item glyphs riding their region anchors
    for (const region of this.plan.regions) {
      const it = this.equipped[region.slot]; if (!it) continue;
      const a = region.anchor, g = bw * 0.13;
      try { drawGlyph(ctx, it, { x: px(a[0]) - g / 2, y: py(a[1]) - g / 2, size: g }); } catch (e) {}
    }
  }
}

export default EquippedView;
