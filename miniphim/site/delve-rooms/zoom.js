// zoom.js: pinch, drag and wheel zoom for an <svg> with a viewBox. No dependencies.
// One finger or mouse drag pans; two fingers pinch; wheel zooms at the cursor; double-click resets.
// Links inside still work: a press that moves less than 6 px is a click, more is a drag.
(function (root) {
  function zoomable(svg, opt = {}) {
    const min = opt.min || 0.5, max = opt.max || 12; // zoom limits, relative to the base view
    let base, v;
    const read = () => { const b = svg.viewBox.baseVal; base = { x: b.x, y: b.y, w: b.width, h: b.height }; v = { ...base }; };
    const set = () => svg.setAttribute('viewBox', `${v.x} ${v.y} ${v.w} ${v.h}`);
    read();
    svg.style.touchAction = 'none'; svg.style.cursor = 'grab';
    // svg units per screen pixel, and the letterbox offset (preserveAspectRatio "meet")
    const frame = () => { const r = svg.getBoundingClientRect(), s = Math.max(v.w / r.width, v.h / r.height); return { r, s, ox: (r.width * s - v.w) / 2, oy: (r.height * s - v.h) / 2 }; };
    const at = (cx, cy) => { const f = frame(); return { x: v.x + (cx - f.r.left) * f.s - f.ox, y: v.y + (cy - f.r.top) * f.s - f.oy }; };
    function zoomAt(cx, cy, k) {
      const p = at(cx, cy), w = Math.min(base.w / min, Math.max(base.w / max, v.w / k)), q = v.w / w;
      v = { x: p.x - (p.x - v.x) / q, y: p.y - (p.y - v.y) / q, w, h: v.h / q }; set();
    }
    function panBy(dx, dy) { const f = frame(); v.x -= dx * f.s; v.y -= dy * f.s; set(); }

    const pts = new Map(); let moved = 0, last = null;
    const mid = () => { const a = [...pts.values()]; return { x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) }; };
    svg.addEventListener('pointerdown', e => {
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 1) moved = 0;
      last = pts.size === 2 ? mid() : null; svg.style.cursor = 'grabbing';
    });
    window.addEventListener('pointermove', e => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      if (pts.size === 1) { if (moved > 6) panBy(dx, dy); }
      else if (pts.size === 2) { const m = mid(); if (last && last.d > 0) { panBy(m.x - last.x, m.y - last.y); zoomAt(m.x, m.y, m.d / last.d); } last = m; moved += 7; }
    });
    const up = e => { pts.delete(e.pointerId); last = pts.size === 2 ? mid() : null; if (!pts.size) svg.style.cursor = 'grab'; };
    window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    svg.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    svg.addEventListener('wheel', e => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.deltaMode ? 0.05 : 0.0015))); }, { passive: false });
    svg.addEventListener('dblclick', e => { e.preventDefault(); v = { ...base }; set(); });
    return { reset: read, zoomAt, panBy, view: () => ({ ...v }) };
  }
  root.Zoom = { zoomable };
})(this);
