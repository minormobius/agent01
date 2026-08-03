// controls.js — parameter widgets built from a schema, never from a list.
//
// Every effect in the registry declares its parameters as data; this file turns
// that declaration into controls. The consequence worth protecting: adding an
// effect — here, or in /glitch, or in /lens — needs **no** UI change. If it
// declares its parameters, it is fully editable the moment it is registered.
//
// Five kinds cover the whole registry: number, enum, bool, colour, and curve.
// A sixth would mean a new kind of parameter, which is a real decision and
// should feel like one.

import { curveLUT } from '../core/adjust.js';

const fmt = (v, step) => {
  if (typeof v !== 'number') return String(v);
  const d = step >= 1 ? 0 : step >= 0.1 ? 1 : step >= 0.01 ? 2 : 3;
  return v.toFixed(d);
};

/**
 * @param onChange (key, value, {live}) — `live` is true while a slider is being
 *   dragged, so the caller can coalesce a drag into one undo step and throttle
 *   its renders, and false on release, when the value is final.
 */
export function buildControls(host, schema, values, onChange) {
  host.innerHTML = '';
  for (const [key, spec] of Object.entries(schema || {})) {
    const value = values[key] !== undefined ? values[key] : spec.def;
    host.appendChild(control(key, spec, value, onChange));
  }
  return host;
}

export function control(key, spec, value, onChange) {
  const type = spec.type || 'number';
  const el = document.createElement('div');
  el.className = `ctl ${type}`;

  if (type === 'bool') {
    const lab = document.createElement('label');
    const box = document.createElement('input');
    box.type = 'checkbox';
    box.checked = !!value;
    box.onchange = () => onChange(key, box.checked, { live: false });
    lab.append(box, document.createTextNode(spec.label || key));
    el.appendChild(lab);
    return el;
  }

  const lab = document.createElement('label');
  lab.append(document.createTextNode(spec.label || key));
  const read = document.createElement('span');
  lab.appendChild(read);
  el.appendChild(lab);

  if (type === 'enum') {
    read.textContent = '';
    const sel = document.createElement('select');
    for (const opt of spec.options) {
      const o = document.createElement('option');
      o.value = opt; o.textContent = opt;
      sel.appendChild(o);
    }
    sel.value = value;
    sel.onchange = () => onChange(key, sel.value, { live: false });
    el.appendChild(sel);
    return el;
  }

  if (type === 'color') {
    read.textContent = value;
    const inp = document.createElement('input');
    inp.type = 'color';
    inp.value = value;
    inp.oninput = () => { read.textContent = inp.value; onChange(key, inp.value, { live: true }); };
    inp.onchange = () => onChange(key, inp.value, { live: false });
    el.appendChild(inp);
    return el;
  }

  if (type === 'curve') {
    read.textContent = `${(value || []).length} points`;
    el.appendChild(curveEditor(value, (pts, live) => {
      read.textContent = `${pts.length} points`;
      onChange(key, pts, { live });
    }));
    return el;
  }

  // number
  read.textContent = fmt(value, spec.step ?? 0.01);
  const range = document.createElement('input');
  range.type = 'range';
  range.min = spec.min ?? 0;
  range.max = spec.max ?? 1;
  range.step = spec.step ?? 0.01;
  range.value = value;
  range.oninput = () => {
    read.textContent = fmt(+range.value, spec.step ?? 0.01);
    onChange(key, +range.value, { live: true });
  };
  range.onchange = () => onChange(key, +range.value, { live: false });
  // double-click a slider to return it to the effect's default — the fastest
  // way to answer "what was this doing before I touched it"
  range.ondblclick = () => {
    range.value = spec.def;
    read.textContent = fmt(spec.def, spec.step ?? 0.01);
    onChange(key, spec.def, { live: false });
  };
  el.appendChild(range);
  return el;
}

/**
 * The curve editor. Points live in 0..1 with y up; the drawn line is the actual
 * 256-entry LUT the adjustment will use, so what you see is the transfer
 * function itself and not an idealised spline through the handles.
 */
export function curveEditor(points, onChange) {
  const canvas = document.createElement('canvas');
  canvas.className = 'curve';
  canvas.width = 300; canvas.height = 264;
  let pts = (points && points.length ? points : [[0, 0], [1, 1]]).map((p) => p.slice());
  let dragging = -1;

  const draw = () => {
    const c = canvas.getContext('2d');
    const { width: w, height: h } = canvas;
    c.clearRect(0, 0, w, h);
    c.strokeStyle = 'rgba(255,255,255,0.07)';
    c.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      c.beginPath();
      c.moveTo((i / 4) * w, 0); c.lineTo((i / 4) * w, h);
      c.moveTo(0, (i / 4) * h); c.lineTo(w, (i / 4) * h);
      c.stroke();
    }
    c.strokeStyle = 'rgba(255,255,255,0.14)';
    c.beginPath(); c.moveTo(0, h); c.lineTo(w, 0); c.stroke();

    const lut = curveLUT(pts);
    c.strokeStyle = '#f0a136';
    c.lineWidth = 3;
    c.beginPath();
    for (let i = 0; i < 256; i++) {
      const x = (i / 255) * w, y = h - (lut[i] / 255) * h;
      if (i === 0) c.moveTo(x, y); else c.lineTo(x, y);
    }
    c.stroke();

    c.fillStyle = '#e9eaee';
    for (const p of pts) {
      c.beginPath();
      c.arc(p[0] * w, h - p[1] * h, 6, 0, Math.PI * 2);
      c.fill();
    }
  };

  const at = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, 1 - (ev.clientY - r.top) / r.height)),
    ];
  };
  const nearest = (p) => {
    let best = -1, bd = 0.05;
    pts.forEach((q, i) => {
      const d = Math.hypot(q[0] - p[0], q[1] - p[1]);
      if (d < bd) { bd = d; best = i; }
    });
    return best;
  };

  canvas.onpointerdown = (ev) => {
    const p = at(ev);
    const i = nearest(p);
    if (ev.shiftKey || ev.button === 2) {
      // shift-click (or right-click) removes — but the two endpoints stay, or
      // the curve would stop being a function on the whole range
      if (i > 0 && i < pts.length - 1) { pts.splice(i, 1); onChange(pts.map((q) => q.slice()), false); draw(); }
      return;
    }
    if (i < 0) {
      pts.push(p);
      pts.sort((a, b) => a[0] - b[0]);
      dragging = pts.findIndex((q) => q === p);
    } else dragging = i;
    canvas.setPointerCapture(ev.pointerId);
    draw();
  };
  canvas.onpointermove = (ev) => {
    if (dragging < 0) return;
    const p = at(ev);
    const isEnd = dragging === 0 || dragging === pts.length - 1;
    pts[dragging] = [isEnd ? pts[dragging][0] : p[0], p[1]];
    pts.sort((a, b) => a[0] - b[0]);
    dragging = pts.findIndex((q) => q[1] === p[1] && (isEnd || q[0] === p[0]));
    onChange(pts.map((q) => q.slice()), true);
    draw();
  };
  const end = () => {
    if (dragging < 0) return;
    dragging = -1;
    onChange(pts.map((q) => q.slice()), false);
  };
  canvas.onpointerup = end;
  canvas.onpointercancel = end;
  canvas.oncontextmenu = (e) => e.preventDefault();
  canvas.ondblclick = () => { pts = [[0, 0], [1, 1]]; onChange(pts.map((q) => q.slice()), false); draw(); };

  draw();
  return canvas;
}
