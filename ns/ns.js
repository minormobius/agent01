// ns.js — the little shared runtime of the ns.mino.mobi pack: tabs, a HiDPI
// canvas helper, number formatting and a tiny chart scaffold. No dependencies.
'use strict';
window.NS = (function () {
  function cssVar(n) { return getComputedStyle(document.documentElement).getPropertyValue(n).trim(); }

  // Tabs: <button class="tab" data-tab="x"> shows <div class="pane" id="pane-x">.
  // The hash remembers the tab so a link can point at one.
  function tabs(onShow) {
    const btns = [...document.querySelectorAll('.tab')];
    function show(id) {
      btns.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
      document.querySelectorAll('.pane').forEach((p) => p.classList.toggle('active', p.id === 'pane-' + id));
      if (onShow) onShow(id);
    }
    btns.forEach((b) => b.addEventListener('click', () => { show(b.dataset.tab); history.replaceState(null, '', '#' + b.dataset.tab); }));
    const h = location.hash.slice(1);
    if (h && btns.some((b) => b.dataset.tab === h)) show(h);
    else if (btns.length) show(btns[0].dataset.tab);
    return show;
  }

  // Size a canvas to its CSS box at device resolution; returns {ctx, w, h} in
  // CSS pixels with the transform already applied.
  function fit(canvas) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(10, Math.round(r.width)), h = Math.max(10, Math.round(r.height));
    if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w, h };
  }

  function fmt(x, digits = 3) {
    if (!isFinite(x)) return x > 0 ? '∞' : x < 0 ? '−∞' : 'nan';
    const a = Math.abs(x);
    if (a !== 0 && (a < 1e-3 || a >= 1e5)) {
      const e = Math.floor(Math.log10(a));
      const m = x / Math.pow(10, e);
      return m.toFixed(Math.max(0, digits - 1)).replace('-', '−') + '×10' + sup(e);
    }
    return (a >= 100 ? x.toFixed(0) : a >= 10 ? x.toFixed(1) : x.toFixed(digits)).replace('-', '−');
  }
  const SUP = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
  function sup(n) { return String(n).split('').map((c) => SUP[c] || c).join(''); }

  function stats(el, rows) {
    el.innerHTML = rows.map(([k, v, cls]) => `<div class="stat-row"><span class="k">${k}</span><span class="v${cls ? ' ' + cls : ''}">${v}</span></div>`).join('');
  }

  // A minimal chart: axes with optional log scales, then a draw callback that
  // receives x->px, y->px mappers.
  function chart(canvas, opts) {
    const { ctx, w, h } = fit(canvas);
    const pad = Object.assign({ l: 54, r: 14, t: 14, b: 34 }, opts.pad || {});
    const xlog = !!opts.xlog, ylog = !!opts.ylog;
    const [x0, x1] = opts.x, [y0, y1] = opts.y;
    const fx = xlog ? Math.log10 : (v) => v, fy = ylog ? Math.log10 : (v) => v;
    const X = (v) => pad.l + (fx(v) - fx(x0)) / (fx(x1) - fx(x0)) * (w - pad.l - pad.r);
    const Y = (v) => h - pad.b - (fy(v) - fy(y0)) / (fy(y1) - fy(y0)) * (h - pad.t - pad.b);
    ctx.clearRect(0, 0, w, h);
    ctx.font = '10px ' + cssVar('--mono');
    ctx.fillStyle = cssVar('--muted'); ctx.strokeStyle = cssVar('--rule'); ctx.lineWidth = 1;
    // grid
    const ticks = (lo, hi, log) => {
      if (log) { const t = []; for (let e = Math.ceil(Math.log10(lo)); e <= Math.floor(Math.log10(hi)); e++) t.push(Math.pow(10, e)); return t; }
      const span = hi - lo, step = Math.pow(10, Math.floor(Math.log10(span))) * (span / Math.pow(10, Math.floor(Math.log10(span))) > 5 ? 1 : span / Math.pow(10, Math.floor(Math.log10(span))) > 2 ? 0.5 : 0.2);
      const t = []; for (let v = Math.ceil(lo / step) * step; v <= hi + 1e-9; v += step) t.push(+v.toFixed(10)); return t;
    };
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (const t of (opts.xticks || ticks(x0, x1, xlog))) {
      const px = X(t); if (px < pad.l - 1 || px > w - pad.r + 1) continue;
      ctx.beginPath(); ctx.moveTo(px, pad.t); ctx.lineTo(px, h - pad.b); ctx.stroke();
      ctx.fillText(xlog ? '10' + sup(Math.round(Math.log10(t))) : fmt(t, 2), px, h - pad.b + 5);
    }
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const t of (opts.yticks || ticks(y0, y1, ylog))) {
      const py = Y(t); if (py < pad.t - 1 || py > h - pad.b + 1) continue;
      ctx.beginPath(); ctx.moveTo(pad.l, py); ctx.lineTo(w - pad.r, py); ctx.stroke();
      ctx.fillText(ylog ? '10' + sup(Math.round(Math.log10(t))) : fmt(t, 2), pad.l - 6, py);
    }
    ctx.strokeStyle = cssVar('--muted');
    ctx.beginPath(); ctx.moveTo(pad.l, pad.t); ctx.lineTo(pad.l, h - pad.b); ctx.lineTo(w - pad.r, h - pad.b); ctx.stroke();
    if (opts.xlabel) { ctx.textAlign = 'center'; ctx.textBaseline = 'bottom'; ctx.fillText(opts.xlabel, (pad.l + w - pad.r) / 2, h - 3); }
    if (opts.ylabel) { ctx.save(); ctx.translate(11, (pad.t + h - pad.b) / 2); ctx.rotate(-Math.PI / 2); ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(opts.ylabel, 0, 0); ctx.restore(); }
    // clip to plot for series
    ctx.save(); ctx.beginPath(); ctx.rect(pad.l, pad.t, w - pad.l - pad.r, h - pad.t - pad.b); ctx.clip();
    const line = (pts, color, width = 1.6, dash = []) => {
      ctx.strokeStyle = color; ctx.lineWidth = width; ctx.setLineDash(dash); ctx.beginPath();
      let pen = false;
      for (const [x, y] of pts) {
        if (!isFinite(x) || !isFinite(y) || (xlog && x <= 0) || (ylog && y <= 0)) { pen = false; continue; }
        const px = X(x), py = Y(y);
        if (!pen) { ctx.moveTo(px, py); pen = true; } else ctx.lineTo(px, py);
      }
      ctx.stroke(); ctx.setLineDash([]);
    };
    const label = (x, y, text, color, dx = 4, dy = 0, align = 'left') => {
      ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle'; ctx.fillText(text, X(x) + dx, Y(y) + dy);
    };
    const api = { ctx, w, h, X, Y, pad, line, label, done: () => ctx.restore() };
    if (opts.draw) { opts.draw(api); ctx.restore(); }
    return api;
  }

  // Sliders: bind <input id> to a display <span id="<id>-val"> and a callback.
  function slider(id, fmtFn, cb) {
    const el = document.getElementById(id), out = document.getElementById(id + '-val');
    const upd = () => { const v = parseFloat(el.value); if (out) out.textContent = fmtFn ? fmtFn(v) : v; cb(v); };
    el.addEventListener('input', upd);
    return { get: () => parseFloat(el.value), set: (v) => { el.value = v; upd(); }, upd };
  }

  // The similarity change of variables of (3.2): tau = q(1-eta^2), z = q^D eta,
  // so q solves q - z^2 q^{2h} = tau (unique root, Lemma 4.1). Newton from above.
  function qOf(z, tau, h) {
    const D = 0.5 - h;
    let q = Math.max(tau, Math.pow(Math.abs(z), 1 / D)) + tau;
    for (let i = 0; i < 60; i++) {
      const f = q - z * z * Math.pow(q, 2 * h) - tau, df = 1 - 2 * h * z * z * Math.pow(q, 2 * h - 1);
      const nq = q - f / df;
      if (Math.abs(nq - q) < 1e-14 * q) { q = nq; break; }
      q = Math.max(nq, tau * 0.5);
    }
    return q;
  }

  return { cssVar, tabs, fit, fmt, sup, stats, chart, slider, qOf };
})();
