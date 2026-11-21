// kit.js — the deck format's shared parts: plotting, the cursor (LAW 3) and the
// theme toggle (LAW 4). A slide that draws a chart calls cursor(); a page that
// has charts calls theme.mount(). See LAWS.md. browser.selftest.mjs enforces both.

const NS = 'http://www.w3.org/2000/svg';
export const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

// ------------------------------------------------------------------ theme ---
// data-theme on <html>: absent = follow the system, "light", "dark".
const THEME_KEY = 'proofs-theme';
const listeners = new Set();
export const theme = {
  get() { return document.documentElement.dataset.theme || 'auto'; },
  isDark() {
    const t = this.get();
    return t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  },
  set(t) {
    if (t === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = t;
    try { localStorage.setItem(THEME_KEY, t); } catch {}
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = css('--accent');
    for (const f of listeners) f(t);
  },
  onChange(f) { listeners.add(f); },
  // a button that cycles auto → light → dark, labelled with what it shows now
  mount(btn) {
    let saved = 'auto'; try { saved = localStorage.getItem(THEME_KEY) || 'auto'; } catch {}
    const label = () => { const t = this.get(); btn.textContent = t === 'auto' ? '◐ auto' : t === 'light' ? '☀ light' : '☾ dark'; btn.setAttribute('aria-label', `colour theme: ${t}. Click to change.`); };
    this.set(saved); label();
    btn.onclick = () => { const t = this.get(); this.set(t === 'auto' ? 'light' : t === 'light' ? 'dark' : 'auto'); label(); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', () => { if (this.get() === 'auto') for (const f of listeners) f('auto'); });
  },
};

// --------------------------------------------------------------- plotting ---
export function frame(el, opts = {}) {
  const r = el.getBoundingClientRect(), W = Math.max(200, r.width), H = Math.max(140, r.height);
  const pad = { l: 38, r: 10, t: 8, b: 20, ...(opts.pad || {}) };
  const [x0, x1] = opts.x, [y0, y1] = opts.y;
  const lx = opts.logx, ly = opts.logy;
  const fx = (v) => lx ? Math.log10(v) : v, fy = (v) => ly ? Math.log10(v) : v;
  const X = (v) => pad.l + (fx(v) - fx(x0)) / (fx(x1) - fx(x0)) * (W - pad.l - pad.r);
  const Y = (v) => H - pad.b - (fy(v) - fy(y0)) / (fy(y1) - fy(y0)) * (H - pad.t - pad.b);
  el.setAttribute('viewBox', `0 0 ${W} ${H}`);
  return { W, H, pad, X, Y };
}
export const path = (pts, X, Y) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(p[0]).toFixed(1)},${Y(p[1]).toFixed(1)}`).join('');
export function axes(f, xt, yt, xl = '', yl = '') {
  const rule = css('--rule');
  let g = `<line x1="${f.pad.l}" x2="${f.W - f.pad.r}" y1="${f.H - f.pad.b}" y2="${f.H - f.pad.b}" stroke="${rule}"/>`;
  g += `<line x1="${f.pad.l}" x2="${f.pad.l}" y1="${f.pad.t}" y2="${f.H - f.pad.b}" stroke="${rule}"/>`;
  for (const [v, l] of xt) g += `<text x="${f.X(v)}" y="${f.H - 5}" font-size="9" text-anchor="middle">${l}</text>`;
  for (const [v, l] of yt) g += `<text x="${f.pad.l - 4}" y="${f.Y(v) + 3}" font-size="9" text-anchor="end">${l}</text>`;
  if (xl) g += `<text x="${f.W - f.pad.r}" y="${f.H - f.pad.b - 4}" font-size="9" text-anchor="end">${xl}</text>`;
  if (yl) g += `<text x="${f.pad.l + 4}" y="${f.pad.t + 9}" font-size="9">${yl}</text>`;
  return g;
}

// -------------------------------------------------------------- tooltip ---
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// draws a tooltip box into group g at (x, y), kept inside W × H. lines: [{ text, color? }]
export function tip(g, x, y, lines, W, H) {
  const lh = 13, w = Math.min(W - 8, 10 + 6.2 * Math.max(...lines.map((l) => l.text.length))), h = 6 + lh * lines.length;
  let bx = x + 12, by = y - h - 10;
  if (bx + w > W - 4) bx = x - w - 12;
  if (bx < 4) bx = 4;
  if (by < 4) by = y + 12;
  if (by + h > H - 4) by = H - h - 4;
  let s = `<rect class="tipbox" x="${bx}" y="${by}" width="${w}" height="${h}" rx="5" fill="${css('--bg')}" stroke="${css('--rule')}" opacity="0.96"/>`;
  lines.forEach((l, i) => {
    s += `<text x="${bx + 6}" y="${by + 14 + i * lh}" font-size="10" style="fill:${l.color || css('--fg')};font-weight:${i === 0 ? 700 : 400}">${esc(l.text)}</text>`;
  });
  g.insertAdjacentHTML('beforeend', s);
}

// --------------------------------------------------------------- cursor ---
// LAW 3. Every chart gets one. It snaps to real data points (never interpolates),
// reaches every point by pointer, touch-drag and keyboard (← → Home End, Esc hides),
// shows every series at the chosen point, and survives redraws.
//
// series: [{ name, color, pts: [[x, y, label?], ...] }]   label overrides the y readout
// opts:   { snap: 'x' | 'y' | 'xy', xfmt(x) → string, yfmt(y) → string, head(pt, si) → string }
// Call it after every redraw, with the same svg; the svg's innerHTML must already be drawn.
export function cursor(svg, f, series, opts = {}) {
  const snap = opts.snap || 'x';
  const xfmt = opts.xfmt || ((x) => `x = ${+x.toPrecision(6)}`);
  const yfmt = opts.yfmt || ((y) => `${+y.toPrecision(6)}`);
  const st = svg.__cur || (svg.__cur = { si: 0, i: null, data: null });
  svg.setAttribute('tabindex', '0');
  svg.style.touchAction = 'none';
  svg.style.outline = 'none';
  svg.dataset.cursor = snap;
  const P = series.map((s) => s.pts.map((p) => [f.X(p[0]), f.Y(p[1])]));
  const valid = (si, i) => Number.isFinite(P[si][i][0]) && Number.isFinite(P[si][i][1]);
  let g = svg.querySelector('g.cur');
  if (!g) { g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'cur'); g.setAttribute('pointer-events', 'none'); }
  svg.appendChild(g);

  const nearestX = (si, px) => {
    let best = -1, bd = Infinity;
    P[si].forEach((q, i) => { if (!valid(si, i)) return; const d = Math.abs(q[0] - px); if (d < bd) { bd = d; best = i; } });
    return best;
  };
  const pick = (px, py) => {
    if (snap === 'xy') {
      let bs = 0, bi = -1, bd = Infinity;
      P.forEach((ps, si) => ps.forEach((q, i) => { if (!valid(si, i)) return; const d = (q[0] - px) ** 2 + (q[1] - py) ** 2; if (d < bd) { bd = d; bs = si; bi = i; } }));
      return [bs, bi];
    }
    if (snap === 'y') {
      let bi = -1, bd = Infinity;
      P[0].forEach((q, i) => { if (!valid(0, i)) return; const d = Math.abs(q[1] - py); if (d < bd) { bd = d; bi = i; } });
      return [0, bi];
    }
    return [0, nearestX(0, px)];
  };
  const show = (si, i) => {
    g.innerHTML = '';
    if (i == null || i < 0 || !series[si] || !series[si].pts[i]) { svg.removeAttribute('aria-description'); return; }
    st.si = si; st.i = i; st.data = series[si].pts[i].slice(0, 2);
    const [px, py] = P[si][i];
    const col = css('--fg');
    if (snap === 'y') g.insertAdjacentHTML('beforeend', `<line x1="${f.pad.l}" x2="${f.W - f.pad.r}" y1="${py}" y2="${py}" stroke="${col}" stroke-opacity="0.35" stroke-dasharray="2 3"/>`);
    else g.insertAdjacentHTML('beforeend', `<line x1="${px}" x2="${px}" y1="${f.pad.t}" y2="${f.H - f.pad.b}" stroke="${col}" stroke-opacity="0.35" stroke-dasharray="2 3"/>`);
    const p0 = series[si].pts[i];
    const lines = [{ text: opts.head ? opts.head(p0, si) : xfmt(p0[0]) }];
    const rows = snap === 'x' ? series.map((s, k) => [k, k === si ? i : nearestX(k, px)]) : [[si, i]];
    for (const [k, j] of rows) {
      if (j < 0) continue;
      const p = series[k].pts[j], [qx, qy] = P[k][j];
      g.insertAdjacentHTML('beforeend', `<circle cx="${qx}" cy="${qy}" r="4.5" fill="${series[k].color}" stroke="${css('--bg')}" stroke-width="1.5"/>`);
      lines.push({ text: `${series[k].name}: ${p[2] ?? yfmt(p[1])}`, color: series[k].color });
    }
    tip(g, px, py, lines, f.W, f.H);
    svg.setAttribute('aria-description', lines.map((l) => l.text).join('; '));
  };
  const local = (e) => { const pt = svg.createSVGPoint(); pt.x = e.clientX; pt.y = e.clientY; return pt.matrixTransform(svg.getScreenCTM().inverse()); };
  const onPoint = (e) => { const p = local(e); const [si, i] = pick(p.x, p.y); show(si, i); opts.onPick?.(series[si]?.pts[i], si, i); };
  svg.onpointerdown = (e) => { svg.setPointerCapture?.(e.pointerId); onPoint(e); };
  svg.onpointermove = (e) => { if (e.pointerType === 'mouse' || e.buttons) onPoint(e); };
  svg.onpointerleave = (e) => { if (e.pointerType === 'mouse') { st.i = null; g.innerHTML = ''; } };
  svg.onkeydown = (e) => {
    const keys = { ArrowRight: 1, ArrowLeft: -1, ArrowUp: snap === 'y' ? 1 : 0, ArrowDown: snap === 'y' ? -1 : 0 };
    const n = series[st.si]?.pts.length || 0;
    if (e.key in keys && keys[e.key]) {
      e.preventDefault(); e.stopPropagation();
      let i = st.i == null ? 0 : st.i + keys[e.key];
      // xy-snap walks one series in its stored order; skip points off the plot
      while (i >= 0 && i < n && !valid(st.si, i)) i += keys[e.key];
      show(st.si, Math.max(0, Math.min(n - 1, i)));
    } else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); e.stopPropagation(); show(st.si, e.key === 'Home' ? 0 : n - 1); }
    else if (e.key === 'Escape') { e.stopPropagation(); st.i = null; g.innerHTML = ''; }
  };
  // survive the redraw: re-find the same data point (scales and series may have changed)
  if (st.i != null && st.data && series[st.si]) {
    const [dx, dy] = st.data, ps = series[st.si].pts;
    let bi = -1, bd = Infinity;
    ps.forEach((p, i) => { const d = Math.abs(p[0] - dx) + (snap === 'x' ? 0 : Math.abs(p[1] - dy)); if (d < bd) { bd = d; bi = i; } });
    show(st.si, bi);
  }
  return { show };
}
