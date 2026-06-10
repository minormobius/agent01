// Generic renderer — draws WHATEVER substrate + entity set the genome rolled,
// themed by the rolled aesthetic. It reads only the substrate interface and the
// instance fields, so it never special-cases a game. Wrap seams are shown as
// coloured dashed borders (with a ½-twist mark on Möbius/Klein) so a torus reads
// as a torus even drawn flat — the topology is legible without 3D.
import { initialState } from './engine.js';

function hsl(h, s, l, a = 1) { return `hsla(${h},${s}%,${l}%,${a})`; }

export class Renderer {
  constructor(canvas, inst) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d'); this.inst = inst;
    this.hue = inst.genome.aesthetic.hue;
    this.dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    this.dpr = window.devicePixelRatio || 1;
    this.layout();
  }
  layout() {
    const max = Math.min(this.canvas.parentElement.clientWidth || 520, 540);
    // bounds from substrate layout
    let maxX = 0, maxY = 0;
    for (let c = 0; c < this.inst.sub.ncells; c++) { const p = this.inst.sub.layout(c); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
    this.cols = maxX + 1; this.rows = maxY + 1;
    this.cs = Math.floor((max - 8) / Math.max(this.cols, this.rows + (this.inst.sub.family === 'hex' ? 0.2 : 0)));
    this.cs = Math.max(20, Math.min(this.cs, 64));
    const w = max, h = max;
    this.canvas.width = w * this.dpr; this.canvas.height = h * this.dpr;
    this.canvas.style.width = w + 'px'; this.canvas.style.height = h + 'px';
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.W = w; this.H = h;
    this.ox = (w - this.cols * this.cs) / 2 + this.cs / 2;
    this.oy = (h - this.rows * this.cs * (this.inst.sub.family === 'hex' ? 0.9 : 1)) / 2 + this.cs / 2;
  }
  pos(c) { const p = this.inst.sub.layout(c); return { x: this.ox + p.x * this.cs, y: this.oy + p.y * this.cs * (this.inst.sub.family === 'hex' ? 1 : 1) }; }

  fg() { return this.dark ? '#ece7da' : '#1f1d1a'; }
  cellFill(lit) { return this.dark ? hsl(this.hue, 14, 16) : hsl(this.hue, 24, 92); }

  draw(state) {
    const ctx = this.ctx, inst = this.inst, cs = this.cs;
    ctx.clearRect(0, 0, this.W, this.H);
    const r = cs * 0.46;

    // cells
    for (let c = 0; c < inst.sub.ncells; c++) {
      if (inst.wall[c]) continue;
      const p = this.pos(c);
      const isIce = inst.ice && inst.ice[c];
      const litOn = inst.has.lights ? ((state.lit >> inst.toggles.indexOf(c)) & 1) : 0;
      ctx.fillStyle = inst.has.lights
        ? (litOn ? hsl(this.hue, 70, this.dark ? 46 : 60) : (this.dark ? hsl(this.hue, 12, 14) : hsl(this.hue, 18, 88)))
        : (isIce ? hsl(this.hue + 180, 40, this.dark ? 26 : 86) : this.cellFill());
      this._cell(p, r, ctx.fillStyle);
    }
    // walls
    ctx.fillStyle = this.dark ? hsl(this.hue, 10, 30) : hsl(this.hue, 16, 52);
    for (let c = 0; c < inst.sub.ncells; c++) if (inst.wall[c]) this._cell(this.pos(c), r, ctx.fillStyle, true);

    // seam borders (wrap topology hint)
    this._seams();

    // portals
    const pc = ['#e0b13a', '#41b0d0', '#d05fa0', '#7ad06a'];
    (inst.portals || []).forEach(([a, b], i) => { for (const c of [a, b]) { const p = this.pos(c); ctx.strokeStyle = pc[i % pc.length]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.7, 0, 7); ctx.stroke(); } });
    // targets (cover)
    ctx.strokeStyle = hsl(this.hue, 60, this.dark ? 64 : 40); ctx.lineWidth = 2;
    for (const t of inst.targets || []) { const p = this.pos(t); this._diamond(p, r * 0.5); }
    // gems
    const gi = inst.genome.aesthetic.glyph.gem || '◇';
    if (inst.has.collect) inst.gems.forEach((c, i) => { if ((state.gems >> i) & 1) return; const p = this.pos(c); ctx.fillStyle = hsl(this.hue, 75, this.dark ? 62 : 46); ctx.font = `${r}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(gi, p.x, p.y); });
    // boxes
    for (const c of (state.boxes || [])) { const p = this.pos(c); const onT = (inst.targets || []).indexOf(c) >= 0; ctx.fillStyle = onT ? hsl(this.hue, 60, 44) : hsl(this.hue, 30, this.dark ? 40 : 56); this._round(p, r * 0.74, ctx.fillStyle); }
    // goal
    if (inst.goal.cell != null) { const p = this.pos(inst.goal.cell); ctx.strokeStyle = hsl(this.hue, 80, this.dark ? 66 : 40); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.7, 0, 7); ctx.stroke(); ctx.globalAlpha = 0.14; ctx.fillStyle = ctx.strokeStyle; ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.7, 0, 7); ctx.fill(); ctx.globalAlpha = 1; }
    // agent
    { const p = this.pos(state.agent); ctx.fillStyle = hsl(this.hue, 80, this.dark ? 70 : 38); ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.52, 0, 7); ctx.fill(); ctx.fillStyle = '#fff'; ctx.font = `${r * 0.7}px serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(inst.genome.aesthetic.glyph.agent || '◆', p.x, p.y); }
  }

  _cell(p, r, fill, wall) {
    const ctx = this.ctx;
    if (this.inst.sub.family === 'hex') {
      ctx.fillStyle = fill; ctx.beginPath();
      for (let k = 0; k < 6; k++) { const a = Math.PI / 180 * (60 * k - 30); const x = p.x + r * 1.0 * Math.cos(a), y = p.y + r * 1.0 * Math.sin(a); k ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = this.dark ? 'rgba(0,0,0,.3)' : 'rgba(0,0,0,.08)'; ctx.lineWidth = 1; ctx.stroke();
    } else {
      ctx.fillStyle = fill;
      this._roundRect(p.x - r, p.y - r, r * 2, r * 2, wall ? 3 : 5); ctx.fill();
    }
  }
  _round(p, rad, fill) { const ctx = this.ctx; ctx.fillStyle = fill; this._roundRect(p.x - rad, p.y - rad, rad * 2, rad * 2, 4); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.2)'; ctx.lineWidth = 1; ctx.stroke(); }
  _diamond(p, r) { const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x + r, p.y); ctx.lineTo(p.x, p.y + r); ctx.lineTo(p.x - r, p.y); ctx.closePath(); ctx.stroke(); }
  _roundRect(x, y, w, h, rr) { const ctx = this.ctx; ctx.beginPath(); ctx.moveTo(x + rr, y); ctx.arcTo(x + w, y, x + w, y + h, rr); ctx.arcTo(x + w, y + h, x, y + h, rr); ctx.arcTo(x, y + h, x, y, rr); ctx.arcTo(x, y, x + w, y, rr); ctx.closePath(); }

  _seams() {
    const id = this.inst.sub.id; if (id === 'grid' || id === 'hex') return;
    const ctx = this.ctx;
    const wrapX = (id === 'cylinder' || id === 'torus' || id === 'mobius' || id === 'klein');
    const wrapY = (id === 'torus' || id === 'klein');
    const x0 = this.ox - this.cs / 2, y0 = this.oy - this.cs / 2;
    const x1 = x0 + this.cols * this.cs, y1 = y0 + this.rows * this.cs;
    ctx.setLineDash([6, 5]); ctx.lineWidth = 2.5;
    if (wrapX) { ctx.strokeStyle = hsl(this.hue, 70, 55); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0, y1); ctx.moveTo(x1, y0); ctx.lineTo(x1, y1); ctx.stroke(); }
    if (wrapY) { ctx.strokeStyle = hsl(this.hue + 40, 70, 55); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y0); ctx.moveTo(x0, y1); ctx.lineTo(x1, y1); ctx.stroke(); }
    ctx.setLineDash([]);
    if (id === 'mobius' || id === 'klein') {     // ½-twist mark on the twisted seam
      ctx.fillStyle = hsl(this.hue, 70, 55); ctx.font = '12px ui-monospace, monospace'; ctx.textAlign = 'center';
      ctx.fillText('½', x1, (y0 + y1) / 2);
      ctx.fillText('½', x0, (y0 + y1) / 2);
    }
  }
}

export function drawThumb(canvas, inst, px = 150) {
  const r = new Renderer(canvas, inst);
  // force a compact size
  let maxX = 0, maxY = 0;
  for (let c = 0; c < inst.sub.ncells; c++) { const p = inst.sub.layout(c); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
  r.cols = maxX + 1; r.rows = maxY + 1; r.cs = Math.max(10, Math.floor((px - 6) / Math.max(r.cols, r.rows)));
  canvas.width = px * r.dpr; canvas.height = px * r.dpr; canvas.style.width = px + 'px'; canvas.style.height = px + 'px';
  r.ctx.setTransform(r.dpr, 0, 0, r.dpr, 0, 0); r.W = px; r.H = px;
  r.ox = (px - r.cols * r.cs) / 2 + r.cs / 2; r.oy = (px - r.rows * r.cs) / 2 + r.cs / 2;
  r.draw(initialState(inst));
}
