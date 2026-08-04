// panels.js — the right-hand column: layers, the active layer's effect stack,
// and the parameters of whatever is selected in it.
//
// The panels are pure renderers: they read the document and call back into the
// app for every change. Nothing here mutates the document directly, which is
// what lets the app decide — in one place — when to push an undo step and when
// to coalesce a drag into the one already open.

import { BLEND_MODES } from '../core/pixels.js';
import { catalogue, EFFECTS } from '../core/registry.js';
import { FIELDS } from '../../../glitch/js/glitch.js';
import { buildControls, control } from './controls.js';
import { thumbnail } from '../core/doc.js';

// ───────────────────────────────────────────────────────────── layers ──

export function renderLayers(host, doc, api) {
  host.innerHTML = '';
  // top of the list is the top of the stack, which is the opposite of the
  // array order — the array is bottom-up because that is the order compositing
  // happens in, and reversing here keeps both readable
  [...doc.layers].reverse().forEach((layer) => {
    const li = document.createElement('li');
    li.className = `layer${layer.id === doc.active ? ' on' : ''}`;
    li.onclick = () => api.selectLayer(layer.id);

    const eye = document.createElement('button');
    eye.className = `eye${layer.on ? '' : ' off'}`;
    eye.textContent = layer.on ? '◉' : '○';
    eye.title = 'show / hide';
    eye.onclick = (e) => { e.stopPropagation(); api.setLayer(layer.id, { on: !layer.on }, 'visibility'); };
    li.appendChild(eye);

    if (layer.kind === 'raster' && layer.pixels) {
      const t = thumbnail(layer.pixels, doc.W, doc.H, 34);
      const c = document.createElement('canvas');
      c.width = t.W; c.height = t.H;
      c.getContext('2d').putImageData(new ImageData(t.px, t.W, t.H), 0, 0);
      li.appendChild(c);
    } else {
      const c = document.createElement('canvas');
      c.width = 34; c.height = 34;
      const cx = c.getContext('2d');
      cx.fillStyle = '#24272c'; cx.fillRect(0, 0, 34, 34);
      cx.fillStyle = '#35c4b5'; cx.font = '18px sans-serif'; cx.textAlign = 'center';
      cx.fillText('◐', 17, 24);
      li.appendChild(c);
    }

    const who = document.createElement('div');
    who.className = 'who';
    const nm = document.createElement('span');
    nm.className = 'nm';
    nm.textContent = layer.name;
    nm.ondblclick = (e) => {
      e.stopPropagation();
      const v = prompt('layer name', layer.name);
      if (v != null) api.setLayer(layer.id, { name: v }, 'rename');
    };
    const sub = document.createElement('span');
    sub.className = 'sub';
    const bits = [];
    if (layer.kind === 'adjust') bits.push('adjustment');
    if (layer.blend !== 'normal') bits.push(layer.blend);
    if (layer.opacity < 1) bits.push(`${Math.round(layer.opacity * 100)}%`);
    if (layer.fx.length) bits.push(`${layer.fx.length} fx`);
    if (layer.clip) bits.push('clipped');
    sub.textContent = bits.join(' · ') || 'normal';
    who.append(nm, sub);
    li.appendChild(who);

    if (layer.mask) {
      const t = maskThumb(layer.mask, doc.W, doc.H);
      t.className = `mask-chip${layer.maskOn ? ' on' : ''}`;
      t.title = 'layer mask — click to enable/disable';
      t.onclick = (e) => { e.stopPropagation(); api.setLayer(layer.id, { maskOn: !layer.maskOn }, 'mask toggle'); };
      li.appendChild(t);
    }

    host.appendChild(li);
  });
}

function maskThumb(mask, W, H, size = 26) {
  const k = Math.max(W, H) / size;
  const w = Math.max(1, Math.round(W / k)), h = Math.max(1, Math.round(H / k));
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const img = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const v = mask[Math.min(H - 1, Math.round(y * k)) * W + Math.min(W - 1, Math.round(x * k))] * 255;
      const q = (y * w + x) * 4;
      img.data[q] = img.data[q + 1] = img.data[q + 2] = v;
      img.data[q + 3] = 255;
    }
  }
  c.getContext('2d').putImageData(img, 0, 0);
  return c;
}

export function renderLayerProps(host, doc, api) {
  host.innerHTML = '';
  const layer = doc.layers.find((l) => l.id === doc.active);
  if (!layer) return;

  const add = (labelText, node) => {
    const l = document.createElement('label');
    l.textContent = labelText;
    host.append(l, node);
  };

  const blend = document.createElement('select');
  for (const m of BLEND_MODES) {
    const o = document.createElement('option');
    o.value = m; o.textContent = m;
    blend.appendChild(o);
  }
  blend.value = layer.blend;
  blend.onchange = () => api.setLayer(layer.id, { blend: blend.value }, 'blend mode');
  add('blend', blend);

  const op = document.createElement('input');
  op.type = 'range'; op.min = 0; op.max = 1; op.step = 0.01; op.value = layer.opacity;
  op.oninput = () => api.setLayer(layer.id, { opacity: +op.value }, 'opacity', { live: true });
  op.onchange = () => api.setLayer(layer.id, { opacity: +op.value }, 'opacity');
  add(`opacity ${Math.round(layer.opacity * 100)}%`, op);

  const flags = document.createElement('div');
  flags.className = 'flags';
  flags.append(
    flag('clip to below', layer.clip, (v) => api.setLayer(layer.id, { clip: v }, 'clipping')),
    ...(layer.mask ? [flag('mask on', layer.maskOn, (v) => api.setLayer(layer.id, { maskOn: v }, 'mask')),
      flag('invert mask', layer.maskInvert, (v) => api.setLayer(layer.id, { maskInvert: v }, 'mask invert'))] : []),
  );
  host.appendChild(flags);
}

function flag(text, on, cb) {
  const l = document.createElement('label');
  const b = document.createElement('input');
  b.type = 'checkbox'; b.checked = on;
  b.onchange = () => cb(b.checked);
  l.append(b, document.createTextNode(text));
  return l;
}

// ────────────────────────────────────────────────────────── the stack ──

export function renderStack(host, doc, api, activeFx) {
  host.innerHTML = '';
  const layer = doc.layers.find((l) => l.id === doc.active);
  if (!layer) return;
  if (!layer.fx.length) {
    const li = document.createElement('li');
    li.className = 'sub';
    li.style.cssText = 'color:var(--faint);padding:8px;text-align:center';
    li.textContent = 'no effects — the layer shows as it is';
    host.appendChild(li);
    return;
  }

  layer.fx.forEach((entry, i) => {
    const spec = EFFECTS[entry.fx];
    const li = document.createElement('li');
    li.className = `fx${i === activeFx ? ' on' : ''}`;
    li.draggable = true;
    li.onclick = () => api.selectFx(i);

    const grip = document.createElement('span');
    grip.className = 'grip';
    grip.textContent = '⠿';
    li.appendChild(grip);

    const eye = document.createElement('button');
    eye.className = `eye${entry.on ? '' : ' off'}`;
    eye.style.cssText = 'background:none;border:0;color:inherit;padding:0 2px';
    eye.textContent = entry.on ? '◉' : '○';
    eye.onclick = (e) => { e.stopPropagation(); api.setFx(i, { on: !entry.on }, 'toggle effect'); };
    li.appendChild(eye);

    const lbl = document.createElement('span');
    lbl.className = 'lbl';
    lbl.textContent = spec ? spec.label : entry.fx;
    li.appendChild(lbl);

    if (entry.field?.type && entry.field.type !== 'all') {
      const f = document.createElement('span');
      f.className = 'amt';
      f.textContent = `▨${entry.field.type}`;
      f.title = `aimed: ${FIELDS[entry.field.type]?.label || entry.field.type}`;
      li.appendChild(f);
    }
    if (entry.mask) {
      const f = document.createElement('span');
      f.className = 'amt';
      f.textContent = '✂';
      f.title = 'limited to a saved selection';
      li.appendChild(f);
    }
    if ((entry.amount ?? 1) < 1) {
      const a = document.createElement('span');
      a.className = 'amt';
      a.textContent = `${Math.round((entry.amount ?? 1) * 100)}%`;
      li.appendChild(a);
    }

    const src = document.createElement('span');
    const group = spec?.group || '';
    src.className = `src ${group}`;
    src.textContent = { adjust: 'adj', filter: 'flt', warp: 'lens', damage: 'glit', cut: 'glass' }[group] || group;
    li.appendChild(src);

    const del = document.createElement('button');
    del.className = 'mini';
    del.textContent = '✕';
    del.onclick = (e) => { e.stopPropagation(); api.removeFx(i); };
    li.appendChild(del);

    li.ondragstart = (e) => { e.dataTransfer.setData('text/plain', String(i)); li.classList.add('dragging'); };
    li.ondragend = () => li.classList.remove('dragging');
    li.ondragover = (e) => { e.preventDefault(); li.classList.add('dropbefore'); };
    li.ondragleave = () => li.classList.remove('dropbefore');
    li.ondrop = (e) => {
      e.preventDefault();
      li.classList.remove('dropbefore');
      const from = +e.dataTransfer.getData('text/plain');
      if (!Number.isNaN(from) && from !== i) api.moveFx(from, i);
    };

    host.appendChild(li);
  });
}

// ──────────────────────────────────────────────────────── parameters ──

export function renderParams(host, doc, api, activeFx) {
  host.innerHTML = '';
  const layer = doc.layers.find((l) => l.id === doc.active);
  const entry = layer?.fx?.[activeFx];
  if (!entry) {
    const p = document.createElement('p');
    p.className = 'empty';
    p.textContent = layer ? 'pick an effect to edit it' : 'no layer';
    host.appendChild(p);
    return;
  }
  const spec = EFFECTS[entry.fx];
  if (!spec) return;

  const head = document.createElement('div');
  head.className = 'head';
  const b = document.createElement('b');
  b.textContent = spec.label;
  head.appendChild(b);
  host.appendChild(head);

  const note = document.createElement('p');
  note.className = 'note';
  note.textContent = spec.note || '';
  host.appendChild(note);

  // amount — the one control every effect has, because the stack blends every
  // effect the same way
  host.appendChild(control('amount', { min: 0, max: 1, step: 0.01, def: 1, label: 'strength' },
    entry.amount ?? 1, (k, v, o) => api.setFx(activeFx, { amount: v }, 'strength', o)));

  if (spec.seeded) {
    host.appendChild(control('seed', { min: 0, max: 999, step: 1, def: 0, label: 'seed nudge' },
      entry.seed | 0, (k, v, o) => api.setFx(activeFx, { seed: v }, 'seed', o)));
  }

  const params = document.createElement('div');
  buildControls(params, spec.params, entry.params,
    (k, v, o) => api.setFxParam(activeFx, k, v, o));
  host.appendChild(params);

  // ── where it applies ──
  const h = document.createElement('div');
  h.className = 'subhead';
  h.textContent = 'where it applies';
  host.appendChild(h);

  const fieldSpec = { type: 'enum', options: Object.keys(FIELDS), def: 'all', label: 'aim' };
  host.appendChild(control('type', fieldSpec, entry.field?.type || 'all',
    (k, v) => api.setField(activeFx, { type: v, params: {} }, 'aim')));

  const ftype = entry.field?.type || 'all';
  if (FIELDS[ftype]?.params && Object.keys(FIELDS[ftype].params).length) {
    const fp = document.createElement('div');
    buildControls(fp, FIELDS[ftype].params, entry.field.params || {},
      (k, v, o) => api.setField(activeFx, { params: { ...(entry.field.params || {}), [k]: v } }, 'aim', o));
    host.appendChild(fp);
  }

  host.appendChild(control('invert', { type: 'bool', def: false, label: 'invert the aim' },
    !!entry.field?.invert, (k, v) => api.setField(activeFx, { invert: v }, 'aim invert')));

  const selRow = document.createElement('div');
  selRow.className = 'ctl';
  const use = document.createElement('button');
  use.className = 'ghost';
  use.style.width = '100%';
  use.textContent = entry.mask ? 'replace saved selection' : 'limit to current selection';
  use.onclick = () => api.captureSelection(activeFx);
  selRow.appendChild(use);
  if (entry.mask) {
    const drop = document.createElement('button');
    drop.className = 'ghost';
    drop.style.cssText = 'width:100%;margin-top:4px';
    drop.textContent = 'release the selection';
    drop.onclick = () => api.setFx(activeFx, { mask: null, field: { ...entry.field, paintMul: false } }, 'release selection');
    selRow.appendChild(drop);
  }
  host.appendChild(selRow);

  if (spec.heavy) {
    const warn = document.createElement('p');
    warn.className = 'note';
    warn.style.color = 'var(--amber)';
    warn.textContent = 'This one fits a partition to the whole picture — expect seconds, not milliseconds, at full resolution.';
    host.appendChild(warn);
  }
}

// ───────────────────────────────────────────────────── effect picker ──

export function renderPicker(listHost, query, onPick) {
  listHost.innerHTML = '';
  const q = query.trim().toLowerCase();
  let first = null;
  for (const group of catalogue()) {
    const hits = group.effects.filter((e) => !q
      || e.label.toLowerCase().includes(q)
      || e.id.toLowerCase().includes(q)
      || (e.note || '').toLowerCase().includes(q));
    if (!hits.length) continue;
    const g = document.createElement('div');
    g.className = 'grp';
    g.innerHTML = `${group.label} <small>${group.note}</small>`;
    listHost.appendChild(g);
    for (const e of hits) {
      const b = document.createElement('button');
      b.className = 'pick';
      b.innerHTML = `<b></b><i></i>`;
      b.querySelector('b').textContent = e.label;
      b.querySelector('i').textContent = e.note || '';
      b.onclick = () => onPick(e.id);
      if (!first) { first = b; b.classList.add('sel'); }
      listHost.appendChild(b);
    }
  }
  if (!first) {
    const p = document.createElement('div');
    p.className = 'grp';
    p.textContent = 'nothing matches';
    listHost.appendChild(p);
  }
  return first;
}
