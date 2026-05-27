// Reusable interactive phenotype phase-space map. Projects 4-D descriptor
// vectors to 2-D (PCA), draws parent->child lineage edges, and supports
// pan (drag) / zoom (wheel) / hover (thumbnail tooltip) / click. Shared by the
// map page and the breeder lab so there's one implementation.
//
// Nodes passed to setNodes() must have: id, parent (id|null), vv (4-vector),
// fit (0..1). Behavior is supplied via the constructor callbacks.

function pca2(rows) {
  const dim = 4, n = rows.length;
  const mean = new Array(dim).fill(0);
  for (const r of rows) for (let j = 0; j < dim; j++) mean[j] += r[j];
  for (let j = 0; j < dim; j++) mean[j] /= n;
  const cov = Array.from({ length: dim }, () => new Array(dim).fill(0));
  for (const r of rows) { const c = r.map((v, j) => v - mean[j]); for (let a = 0; a < dim; a++) for (let b = 0; b < dim; b++) cov[a][b] += c[a] * c[b]; }
  for (let a = 0; a < dim; a++) for (let b = 0; b < dim; b++) cov[a][b] /= Math.max(1, n - 1);
  const mul = (M, v) => M.map(row => row.reduce((s, x, j) => s + x * v[j], 0));
  const norm = (v) => { const m = Math.hypot(...v) || 1; return v.map(x => x / m); };
  const power = (M) => { let v = norm([1, 0.7, 0.3, 0.1]); for (let i = 0; i < 90; i++) v = norm(mul(M, v)); const lam = mul(M, v).reduce((s, x, j) => s + x * v[j], 0); return { v, lam }; };
  // stabilize sign so orientation doesn't flip between recomputes
  const stab = (v) => { let mi = 0; for (let i = 1; i < v.length; i++) if (Math.abs(v[i]) > Math.abs(v[mi])) mi = i; return v[mi] < 0 ? v.map(x => -x) : v; };
  const e1v = stab(power(cov).v);
  const lam1 = mul(cov, e1v).reduce((s, x, j) => s + x * e1v[j], 0);
  const cov2 = cov.map((row, a) => row.map((x, b) => x - lam1 * e1v[a] * e1v[b]));
  const e2v = stab(power(cov2).v);
  const dot = (a, b) => a.reduce((s, x, j) => s + x * b[j], 0);
  return rows.map(r => { const c = r.map((v, j) => v - mean[j]); return [dot(c, e1v), dot(c, e2v)]; });
}

export class PhaseMap {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.opts = opts; // { colorOf, thumbOf, labelOf, onClick, isCurrent }
    this.nodes = [];
    this.layout = new Map(); // id -> [lx, ly] (pixel coords at scale 1, centered)
    this.pos = new Map();    // id -> [sx, sy, r] (current screen)
    this.pan = { x: 0, y: 0 }; this.scale = 1;
    this._drag = null;

    // tooltip
    const parent = canvas.parentNode;
    if (getComputedStyle(parent).position === 'static') parent.style.position = 'relative';
    this.tip = document.createElement('div');
    this.tip.style.cssText = 'position:absolute;pointer-events:none;display:none;z-index:30;background:#0e1014;border:1px solid #23272f;border-radius:10px;padding:8px;width:120px;';
    this.tip.innerHTML = '<canvas width="104" height="104" style="width:104px;height:104px;display:block;border-radius:6px;background:#000;"></canvas><div class="tn" style="font-size:11px;font-weight:600;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;"></div><div class="tv" style="font-size:10px;color:#8b909c;"></div>';
    parent.appendChild(this.tip);
    this.tipCtx = this.tip.querySelector('canvas').getContext('2d');

    this._onWheel = this._wheel.bind(this);
    this._onDown = this._down.bind(this);
    this._onMove = this._move.bind(this);
    this._onUp = this._up.bind(this);
    this._onLeave = () => { this.tip.style.display = 'none'; };
    canvas.addEventListener('wheel', this._onWheel, { passive: false });
    canvas.addEventListener('pointerdown', this._onDown);
    canvas.addEventListener('pointermove', this._onMove);
    window.addEventListener('pointerup', this._onUp);
    canvas.addEventListener('pointerleave', this._onLeave);
    canvas.addEventListener('dblclick', () => this.resetView());
    window.addEventListener('resize', () => this.draw());
  }

  setNodes(nodes, { relayout = true } = {}) {
    this.nodes = nodes.filter(n => n.vv);
    if (relayout) this._relayout();
    this.draw();
  }

  _relayout() {
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    const ns = this.nodes;
    this.layout.clear();
    if (ns.length < 2) { if (ns.length === 1) this.layout.set(ns[0].id, [W / 2, H / 2]); return; }
    const coords = ns.length >= 3 ? pca2(ns.map(n => n.vv)) : ns.map(n => [n.vv[2], n.vv[0]]);
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const [x, y] of coords) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y); }
    const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
    const span = Math.max(maxX - minX, maxY - minY) || 1;
    const baseR = 0.42 * Math.min(W, H);
    ns.forEach((n, i) => {
      const nx = (coords[i][0] - cx) / (span / 2), ny = (coords[i][1] - cy) / (span / 2);
      this.layout.set(n.id, [W / 2 + nx * baseR, H / 2 - ny * baseR]);
    });
  }

  resetView() { this.pan = { x: 0, y: 0 }; this.scale = 1; this._relayout(); this.draw(); }

  _screen(id) {
    const l = this.layout.get(id); if (!l) return null;
    const cx = this.canvas.clientWidth / 2, cy = this.canvas.clientHeight / 2;
    return [cx + this.pan.x + this.scale * (l[0] - cx), cy + this.pan.y + this.scale * (l[1] - cy)];
  }

  draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.canvas.width = W * dpr; this.canvas.height = H * dpr;
    const ctx = this.ctx; ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    if (W !== this._w || H !== this._h) { this._w = W; this._h = H; this._relayout(); }
    this.pos.clear();
    const col = this.opts.colorOf || (() => '#888');
    const cur = this.opts.isCurrent || (() => false);
    // edges
    ctx.lineWidth = 1; ctx.strokeStyle = 'rgba(56,225,192,0.22)';
    for (const n of this.nodes) {
      if (n.parent == null) continue;
      const a = this._screen(n.parent), b = this._screen(n.id);
      if (a && b) { ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    }
    // nodes
    for (const n of this.nodes) {
      const s = this._screen(n.id); if (!s) continue;
      const r = (2 + (n.fit || 0) * 6) * Math.sqrt(this.scale);
      this.pos.set(n.id, [s[0], s[1], r]);
      ctx.beginPath(); ctx.arc(s[0], s[1], r, 0, 7);
      ctx.fillStyle = col(n); ctx.globalAlpha = cur(n) ? 1 : 0.6; ctx.fill(); ctx.globalAlpha = 1;
      if (cur(n)) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 1; ctx.stroke(); }
    }
  }

  _nearest(mx, my) {
    let best = null, bd = 14;
    for (const n of this.nodes) { const p = this.pos.get(n.id); if (!p) continue; const d = Math.hypot(p[0] - mx, p[1] - my); if (d < bd) { bd = d; best = n; } }
    return best;
  }

  _wheel(e) {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    const cx = this.canvas.clientWidth / 2, cy = this.canvas.clientHeight / 2;
    const f = Math.exp(-e.deltaY * 0.0015), ns = Math.max(0.2, Math.min(12, this.scale * f)), fr = ns / this.scale;
    this.pan.x = (mx - cx) - fr * ((mx - cx) - this.pan.x);
    this.pan.y = (my - cy) - fr * ((my - cy) - this.pan.y);
    this.scale = ns; this.draw();
  }
  _down(e) { const rect = this.canvas.getBoundingClientRect(); this._drag = { x: e.clientX - rect.left, y: e.clientY - rect.top, px: this.pan.x, py: this.pan.y, moved: 0 }; }
  _move(e) {
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left, my = e.clientY - rect.top;
    if (this._drag) {
      const dx = mx - this._drag.x, dy = my - this._drag.y;
      this._drag.moved += Math.abs(dx) + Math.abs(dy);
      this.pan.x = this._drag.px + dx; this.pan.y = this._drag.py + dy;
      this.tip.style.display = 'none'; this.draw(); return;
    }
    const n = this._nearest(mx, my);
    if (!n) { this.tip.style.display = 'none'; this.canvas.style.cursor = 'grab'; return; }
    this.canvas.style.cursor = 'pointer';
    const thumb = this.opts.thumbOf && this.opts.thumbOf(n);
    if (thumb) this.tipCtx.drawImage(thumb, 0, 0, 104, 104); else this.tipCtx.clearRect(0, 0, 104, 104);
    const lab = (this.opts.labelOf && this.opts.labelOf(n)) || { name: '', sub: '' };
    this.tip.querySelector('.tn').textContent = lab.name; this.tip.querySelector('.tv').textContent = lab.sub;
    this.tip.style.borderColor = (this.opts.colorOf ? this.opts.colorOf(n) : '#23272f');
    this.tip.style.display = 'block';
    const W = this.canvas.clientWidth, H = this.canvas.clientHeight;
    this.tip.style.left = Math.min(mx + 14, W - 138) + 'px';
    this.tip.style.top = Math.min(my + 14, H - 150) + 'px';
  }
  _up(e) {
    if (!this._drag) return;
    const moved = this._drag.moved; this._drag = null;
    if (moved < 5 && this.opts.onClick) {
      const rect = this.canvas.getBoundingClientRect();
      const n = this._nearest(e.clientX - rect.left, e.clientY - rect.top);
      if (n) this.opts.onClick(n);
    }
  }
}
