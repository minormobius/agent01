// org/diagram.js — a canvas renderer for the org tree.
//
// Four layouts, switchable live, all pure Canvas 2D (no deps, no build):
//   radial  — radial tidy tree: apex at the centre, each ring a rank, the
//             pyramid fanning outward. The mobile default — it's circular, so
//             it fills a portrait screen, and the fractal descent spirals in.
//   tree    — the familiar top-down org chart (pan to read wide ones).
//   icicle  — rank strata as stacked bands, each box sized by its subtree.
//             The most compact — a whole org in one screenful.
//   force   — force-directed: solid lines up the tree, dotted lines across it.
//             Best for the `matrix` shape, where the cross-links are the point.
//
// Themed from the page's CSS custom properties, so it reads in light and dark.
// Touch-first: one finger pans, two fingers pinch-zoom, a tap selects a node
// (and offers to drill through it — the infinite lens, via the page callback).

const TAU = Math.PI * 2;

function cssVar(name, fallback) {
  const v = getComputedStyle(document.body).getPropertyValue(name).trim();
  return v || fallback;
}

export class OrgDiagram {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.onSelect = opts.onSelect || (() => {});
    this.mode = 'radial';
    this.root = null;
    this.scale = 1; this.tx = 0; this.ty = 0;
    this.laid = []; this.links = []; this.byId = new Map();
    this.selected = null;
    this.note = '';
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this._pointers = new Map();
    this._pinchDist = 0; this._moved = 0;
    this._bindEvents();
    this._ro = new ResizeObserver(() => { this._resize(); this.draw(); });
    this._ro.observe(canvas);
    this._resize();
  }

  setData(root) { this.root = root; this.selected = null; this.onSelect(null); this.relayout(); this.fit(); this.draw(); }
  setMode(mode) { this.mode = mode; this.selected = null; this.onSelect(null); this.relayout(); this.fit(); this.draw(); }
  refresh() { this.relayout(); this.draw(); }           // keep the current view

  _resize() {
    const r = this.canvas.getBoundingClientRect();
    this.cssW = Math.max(1, r.width); this.cssH = Math.max(1, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.cssW * this.dpr);
    this.canvas.height = Math.round(this.cssH * this.dpr);
  }

  // ---- layout ----

  relayout() {
    if (!this.root) return;
    // Walk the tree, numbering leaves left-to-right; internal nodes centre on
    // their leaf span. This drives every layout.
    const laid = []; const links = []; const byId = new Map();
    let leafOrder = 0;
    const visit = (node, depth, parent) => {
      const entry = { node, depth, parent: parent ? byId.get(parent.id) : null, kids: [] };
      byId.set(node.id, entry);
      laid.push(entry);
      if (parent) links.push({ a: byId.get(parent.id), b: entry });
      const reps = node.reports || [];
      if (!reps.length) { entry.lo = entry.hi = entry.center = leafOrder + 0.5; leafOrder++; }
      else {
        for (const k of reps) { const c = visit(k, depth + 1, node); entry.kids.push(c); }
        entry.lo = entry.kids[0].lo; entry.hi = entry.kids[entry.kids.length - 1].hi;
        entry.center = entry.kids.reduce((s, c) => s + c.center, 0) / entry.kids.length;
      }
      entry.maxDepth = depth;
      return entry;
    };
    visit(this.root, 0, null);
    const leaves = leafOrder || 1;
    const maxDepth = laid.reduce((m, e) => Math.max(m, e.depth), 0);
    this.laid = laid; this.links = links; this.byId = byId; this.leaves = leaves; this.maxDepth = maxDepth;
    this.note = '';

    // dotted cross-links (matrix shape) → resolve id → laid node
    this.dotted = [];
    for (const e of laid) {
      if (e.node.dottedTo && byId.has(e.node.dottedTo)) this.dotted.push({ a: e, b: byId.get(e.node.dottedTo) });
    }

    if (this.mode === 'radial') this._layoutRadial();
    else if (this.mode === 'tree') this._layoutTree();
    else if (this.mode === 'icicle') this._layoutIcicle();
    else if (this.mode === 'force') this._layoutForce();
  }

  _layoutRadial() {
    const ring = 92;
    for (const e of this.laid) {
      const r = e.depth * ring;
      const a = (e.center / this.leaves) * TAU - Math.PI / 2;
      e.wx = r * Math.cos(a); e.wy = r * Math.sin(a);
    }
  }

  _layoutTree() {
    // Left→right, not top→down: a wide org (hundreds of leaves) laid top-down
    // is a thin unreadable strip on a phone. Depth runs across in columns,
    // people stack down the rows — tall and narrow, so it fills a portrait
    // screen and scrolls vertically.
    const xg = 148, yg = 17;
    for (const e of this.laid) { e.wx = e.depth * xg; e.wy = e.center * yg; }
  }

  _layoutIcicle() {
    // Horizontal: ranks are columns left→right, people stack down each column.
    // Portrait phones are tall, so this fills the screen and scrolls vertically
    // (fit() sizes it to the canvas WIDTH — see the icicle branch there).
    const colW = 128, cell = 15;
    for (const e of this.laid) {
      e.rx = e.depth * colW; e.rw = colW - 3;
      e.ry = e.lo * cell; e.rh = Math.max(cell, (e.hi - e.lo) * cell) - 1.5;
      e.wx = e.rx + e.rw / 2; e.wy = e.ry + e.rh / 2;
    }
  }

  _layoutForce() {
    // Seed from the radial layout (deterministic + already untangled), then
    // settle with a bounded sim. Capped so it stays snappy on a phone; a big
    // org falls back to radial with a note rather than melting the CPU.
    this._layoutRadial();
    const n = this.laid.length;
    if (n > 400) { this.note = `force layout skipped for ${n} nodes — showing radial (try a lower depth)`; return; }
    const K = 46, iters = 160;
    for (let it = 0; it < iters; it++) {
      const t = 1 - it / iters;
      for (let i = 0; i < n; i++) {
        const a = this.laid[i]; let fx = 0, fy = 0;
        for (let j = 0; j < n; j++) {
          if (i === j) continue;
          const b = this.laid[j];
          let dx = a.wx - b.wx, dy = a.wy - b.wy; let d2 = dx * dx + dy * dy;
          if (d2 < 1) { dx = (i - j); dy = (i * 7 - j * 3) % 5; d2 = dx * dx + dy * dy + 1; }
          const f = (K * K) / d2;
          const d = Math.sqrt(d2); fx += (dx / d) * f; fy += (dy / d) * f;
        }
        a._fx = fx * 0.02 * t; a._fy = fy * 0.02 * t;
      }
      for (const l of this.links) {
        const dx = l.b.wx - l.a.wx, dy = l.b.wy - l.a.wy;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        const f = (d - K) * 0.14 * t;
        const ux = dx / d, uy = dy / d;
        l.a._fx = (l.a._fx || 0) + ux * f; l.a._fy = (l.a._fy || 0) + uy * f;
        l.b._fx = (l.b._fx || 0) - ux * f; l.b._fy = (l.b._fy || 0) - uy * f;
      }
      for (const e of this.laid) {
        if (e.depth === 0) continue;              // pin the apex
        e.wx += Math.max(-24, Math.min(24, e._fx || 0));
        e.wy += Math.max(-24, Math.min(24, e._fy || 0));
      }
    }
  }

  // ---- view transform ----

  fit() {
    if (!this.laid.length) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const e of this.laid) {
      const pad = 18;
      const x0 = this.mode === 'icicle' ? e.rx : e.wx - pad;
      const x1 = this.mode === 'icicle' ? e.rx + e.rw : e.wx + pad;
      const y0 = this.mode === 'icicle' ? e.ry : e.wy - pad;
      const y1 = this.mode === 'icicle' ? e.ry + e.rh : e.wy + pad;
      minX = Math.min(minX, x0); maxX = Math.max(maxX, x1);
      minY = Math.min(minY, y0); maxY = Math.max(maxY, y1);
    }
    const w = maxX - minX || 1, h = maxY - minY || 1;
    if (this.mode === 'icicle' || this.mode === 'tree') {
      // Both are tall & narrow: fill the canvas width (reserving room on the
      // right for the tree's labels), then centre vertically if it's short or
      // top-align and let the user pan down if it's long.
      const labelPad = this.mode === 'tree' ? 116 : 0;
      const s = Math.max(0.06, Math.min(3, (this.cssW - 8) / (w + labelPad)));
      this.scale = s;
      this.tx = 4 - minX * s + Math.max(0, (this.cssW - (w + labelPad) * s) / 2);
      const hh = h * s;
      this.ty = hh <= this.cssH ? (this.cssH - hh) / 2 - minY * s : 8 - minY * s;
      return;
    }
    const m = 16;
    this.scale = Math.min((this.cssW - m) / w, (this.cssH - m) / h);
    this.scale = Math.max(0.05, Math.min(3, this.scale));
    this.tx = (this.cssW - w * this.scale) / 2 - minX * this.scale;
    this.ty = (this.cssH - h * this.scale) / 2 - minY * this.scale;
  }

  _sx(x) { return x * this.scale + this.tx; }
  _sy(y) { return y * this.scale + this.ty; }

  // ---- draw ----

  draw() {
    const ctx = this.ctx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.cssW, this.cssH);
    if (!this.laid.length) return;

    const accent = cssVar('--accent', '#8b0000');
    const line = cssVar('--line', '#d8d3c8');
    const text = cssVar('--text', '#1a1a1a');
    const muted = cssVar('--muted', '#777');
    const gold = '#c79a3a';

    // links
    ctx.lineWidth = 1;
    ctx.strokeStyle = line;
    if (this.mode !== 'icicle') {
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      for (const l of this.links) {
        ctx.moveTo(this._sx(l.a.wx), this._sy(l.a.wy));
        ctx.lineTo(this._sx(l.b.wx), this._sy(l.b.wy));
      }
      ctx.stroke();
      ctx.globalAlpha = 1;
    }

    // dotted cross-links (matrix)
    if (this.dotted.length && this.mode !== 'icicle') {
      ctx.save();
      ctx.strokeStyle = accent; ctx.globalAlpha = 0.4; ctx.setLineDash([4, 4]); ctx.lineWidth = 1;
      ctx.beginPath();
      for (const d of this.dotted) {
        ctx.moveTo(this._sx(d.a.wx), this._sy(d.a.wy));
        ctx.lineTo(this._sx(d.b.wx), this._sy(d.b.wy));
      }
      ctx.stroke();
      ctx.restore();
    }

    // nodes
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    const labelFont = '600 12px ' + cssVar('--serif', 'Georgia, serif');
    for (const e of this.laid) {
      const isSub = e.node.subOrg;
      const depthT = this.maxDepth ? e.depth / this.maxDepth : 0;
      ctx.globalAlpha = 1;
      if (this.mode === 'icicle') {
        const x = this._sx(e.rx), y = this._sy(e.ry), w = e.rw * this.scale, h = e.rh * this.scale;
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.22 + 0.5 * (1 - depthT);
        ctx.fillRect(x, y, w, h);
        ctx.globalAlpha = 1;
        if (e === this.selected) { ctx.strokeStyle = gold; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h); }
        if (w > 42) {
          ctx.fillStyle = text; ctx.font = labelFont; ctx.globalAlpha = 0.9;
          ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
          ctx.fillText(' ' + e.node.name, x + 2, y + h / 2);
          ctx.restore(); ctx.globalAlpha = 1;
        }
        continue;
      }
      const r = Math.max(2.4, (8.5 - e.depth * 0.7)) * Math.min(1.6, Math.max(0.7, this.scale));
      const cx = this._sx(e.wx), cy = this._sy(e.wy);
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU);
      ctx.fillStyle = isSub ? gold : accent;
      ctx.globalAlpha = 0.35 + 0.55 * (1 - depthT);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (e === this.selected) { ctx.lineWidth = 2; ctx.strokeStyle = gold; ctx.stroke(); }
      else if (isSub) { ctx.lineWidth = 1; ctx.strokeStyle = gold; ctx.stroke(); }

      // labels: apex + shallow ranks always; the selected node always; the rest
      // only when zoomed in enough to be legible.
      const show = e === this.selected || e.depth === 0 ||
        (e.depth <= 1 && this.scale > 0.35) || this.scale > 0.85;
      if (show) {
        ctx.font = labelFont;
        ctx.fillStyle = e === this.selected ? accent : (e.depth === 0 ? text : muted);
        ctx.globalAlpha = e.depth === 0 ? 1 : 0.9;
        ctx.fillText(' ' + e.node.name, cx + r, cy);
        ctx.globalAlpha = 1;
      }
    }

    if (this.note) {
      ctx.font = '12px ' + cssVar('--mono', 'monospace');
      ctx.fillStyle = muted; ctx.globalAlpha = 0.9; ctx.textAlign = 'center';
      ctx.fillText(this.note, this.cssW / 2, this.cssH - 12);
      ctx.globalAlpha = 1;
    }
  }

  // ---- interaction ----

  _bindEvents() {
    const c = this.canvas;
    c.style.touchAction = 'none';
    c.addEventListener('pointerdown', (e) => {
      c.setPointerCapture(e.pointerId);
      this._pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      this._moved = 0;
      if (this._pointers.size === 2) this._pinchDist = this._twoDist();
    });
    c.addEventListener('pointermove', (e) => {
      const p = this._pointers.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      this._moved += Math.abs(dx) + Math.abs(dy);
      p.x = e.clientX; p.y = e.clientY;
      if (this._pointers.size === 2) {
        const nd = this._twoDist();
        const mid = this._twoMid();
        if (this._pinchDist) this._zoomAt(nd / this._pinchDist, mid.x, mid.y);
        this._pinchDist = nd;
      } else {
        this.tx += dx; this.ty += dy; this.draw();
      }
    });
    const up = (e) => {
      const wasTap = this._pointers.size === 1 && this._moved < 8;
      this._pointers.delete(e.pointerId);
      if (this._pointers.size < 2) this._pinchDist = 0;
      if (wasTap) this._tap(e.clientX, e.clientY);
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', (e) => this._pointers.delete(e.pointerId));
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const r = c.getBoundingClientRect();
      this._zoomAt(Math.exp(-e.deltaY * 0.0015), e.clientX - r.left, e.clientY - r.top);
    }, { passive: false });
  }

  _twoDist() { const p = [...this._pointers.values()]; return Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y); }
  _twoMid() {
    const p = [...this._pointers.values()]; const r = this.canvas.getBoundingClientRect();
    return { x: (p[0].x + p[1].x) / 2 - r.left, y: (p[0].y + p[1].y) / 2 - r.top };
  }

  _zoomAt(factor, sx, sy) {
    const ns = Math.max(0.05, Math.min(6, this.scale * factor));
    const k = ns / this.scale;
    this.tx = sx - (sx - this.tx) * k;
    this.ty = sy - (sy - this.ty) * k;
    this.scale = ns;
    this.draw();
  }

  _tap(clientX, clientY) {
    const r = this.canvas.getBoundingClientRect();
    const px = clientX - r.left, py = clientY - r.top;
    let best = null, bestD = this.mode === 'icicle' ? 0 : 22 * 22;
    for (const e of this.laid) {
      if (this.mode === 'icicle') {
        const x = this._sx(e.rx), y = this._sy(e.ry), w = e.rw * this.scale, h = e.rh * this.scale;
        if (px >= x && px <= x + w && py >= y && py <= y + h) { best = e; break; }
      } else {
        const dx = px - this._sx(e.wx), dy = py - this._sy(e.wy);
        const d = dx * dx + dy * dy;
        if (d < bestD) { bestD = d; best = e; }
      }
    }
    this.selected = best;
    this.draw();
    this.onSelect(best ? best.node : null);
  }
}
