// app.js — the bench. The mathematics lives in conformal.js; this file owns the
// photograph, the canvas, the stack editor and the two measurement views.

import {
  MAPS, defaults, makeLayer, normalise, encodeRecipe, decodeRecipe, render as renderSync,
} from './conformal.js';
import { PRESETS, presetByName } from './presets.js';

// A warp is a few hundred milliseconds of transcendentals per layer, so the
// photograph is cut to a working resolution first; the warp is resolution
// independent, so nothing but sharpness is lost.
const WORK_MAX = 1100;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const sctx = stage.getContext('2d');

let photo = null;            // { rgba, W, H, bitmap }
let recipe = normalise(PRESETS[0].recipe);
let result = null;           // { image: ImageData, K, cw, ch, mstep, stats }
let openLayer = -1;
let busy = false, queued = false, token = 0;
let showOriginal = false;
let view = 'image';

const narrow = () => window.innerWidth <= 760;

// ────────────────────────────────────────────────────────── the worker ──

let worker = null;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
} catch { worker = null; }

function warp() {
  const R = normalise(recipe);
  if (!worker) {
    const r = renderSync(photo.rgba, photo.W, photo.H, photo.W, photo.H, R);
    return Promise.resolve(r);
  }
  return new Promise((resolve, reject) => {
    const mine = ++token;
    const onMessage = (e) => {
      if (e.data.type !== 'render' || e.data.token !== mine) return;
      worker.removeEventListener('message', onMessage);
      if (e.data.ok) resolve(e.data); else reject(new Error(e.data.error));
    };
    worker.addEventListener('message', onMessage);
    worker.postMessage({ type: 'render', recipe: R, W: photo.W, H: photo.H, token: mine });
  });
}

async function apply() {
  if (!photo) return;
  if (busy) { queued = true; return; }
  busy = true;
  status('warping…');
  const t0 = performance.now();
  try {
    const r = await warp();
    result = {
      image: new ImageData(new Uint8ClampedArray(r.rgba), r.width, r.height),
      K: r.K, cw: r.cw, ch: r.ch, mstep: r.mstep ?? r.step, flip: r.flip, reliable: r.reliable,
      scale: r.scale, fieldRef: r.field, stats: r.stats, ms: performance.now() - t0,
    };
    showStats();
    renderLayers();
    paintStage();
    status('');
  } catch (e) {
    status(`failed: ${e.message || e}`, 4000);
  } finally {
    busy = false;
    if (queued) { queued = false; apply(); }
  }
}

let debounce = 0;
const applySoon = () => { clearTimeout(debounce); debounce = setTimeout(apply, 90); };

// ──────────────────────────────────────────────────── loading a photo ──

async function loadImage(src) {
  const bitmap = await createImageBitmap(src);
  const r = Math.min(WORK_MAX / bitmap.width, WORK_MAX / bitmap.height, 1);
  const W = Math.max(1, Math.round(bitmap.width * r));
  const H = Math.max(1, Math.round(bitmap.height * r));
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(bitmap, 0, 0, W, H);
  photo = { rgba: ctx.getImageData(0, 0, W, H).data, bitmap, W, H };

  if (worker) {
    const copy = photo.rgba.slice();
    worker.postMessage({ type: 'photo', rgba: copy, W, H }, [copy.buffer]);
  }
  $('drop').hidden = true;
  if (narrow()) setPanel(true);
  $('src-note').textContent = `${bitmap.width}×${bitmap.height} → working at ${W}×${H}`;
  apply();
}

async function loadFromFile(file) {
  if (!file || !/^image\//.test(file.type)) return fail('that is not an image');
  try { await loadImage(file); } catch (e) { fail(String(e.message || e)); }
}

// Bluesky's CDN Origin-checks browser fetches, so those go through the
// surface's same-origin proxy — see photo/worker.js /api/img.
async function loadFromUrl(raw) {
  try {
    const u = new URL(raw, location.href);
    const bsky = /(^|\.)bsky\.(app|network)$/.test(u.hostname);
    const res = await fetch(bsky ? `/api/img?u=${encodeURIComponent(u.toString())}` : u.toString());
    if (!res.ok) throw new Error(`fetch failed (${res.status})`);
    await loadImage(await res.blob());
  } catch (e) { fail(`could not load that image — ${e.message || e}`); }
}

function fail(msg) {
  const el = $('drop-err');
  el.textContent = msg;
  el.hidden = false;
}

// ─────────────────────────────────────────────────────── the two views ──

// cold → hot, for K. 1 is cold; the ramp saturates at K = 4, which is well past
// "obviously distorted".
const RAMP = [[0, [24, 40, 90]], [0.25, [74, 124, 255]], [0.5, [120, 200, 190]],
  [0.75, [255, 176, 64]], [1, [255, 80, 64]]];
function heat(u) {
  let i = 0;
  while (i < RAMP.length - 2 && u > RAMP[i + 1][0]) i++;
  const [a, ca] = RAMP[i], [b, cb] = RAMP[i + 1];
  const t = (u - a) / (b - a);
  return ca.map((v, j) => Math.round(v + (cb[j] - v) * t));
}

/** The measurement painted over the frame, upsampled from the coarse grid. */
function measurementImage(kind) {
  const { W, H } = photo;
  const img = new ImageData(W, H);
  const { K, cw, ch, mstep, reliable, flip, scale } = result;
  for (let y = 0, i = 0; y < H; y++) {
    const cy = Math.min(ch - 1, (y / mstep) | 0);
    for (let x = 0; x < W; x++, i++) {
      const cx = Math.min(cw - 1, (x / mstep) | 0);
      const ci = cy * cw + cx;
      const q = i * 4;
      let c;
      if (!reliable[ci]) {
        c = [40, 40, 48];                                   // beyond measurement
      } else if (kind === 'dilatation') {
        const u = Math.min(1, Math.log2(Math.max(1, K[ci])) / 2);   // 1..4 → 0..1
        c = heat(u);
        if (flip[ci]) { c = [c[0] * 0.55 + 60, c[1] * 0.55, c[2] * 0.55 + 60]; }
      } else {
        const lg = Math.log2(Math.max(1e-6, scale[i]));      // per-pixel, not coarse
        c = heat(Math.min(1, Math.max(0, (lg + 3) / 6)));
      }
      img.data[q] = c[0]; img.data[q + 1] = c[1]; img.data[q + 2] = c[2]; img.data[q + 3] = 255;
    }
  }
  return img;
}

/**
 * The classic way to see a conformal map: draw the image of a square grid.
 * The field says where each output pixel reads from, so a line goes wherever
 * that source coordinate crosses a grid line — no tracing required.
 */
function overlayGrid(ctx) {
  const { W, H } = photo;
  const img = ctx.getImageData(0, 0, W, H);
  const N = 8;                                              // grid lines per unit
  const unit = Math.min(W, H) / 2;
  const field = result.fieldRef;
  if (!field) return;
  for (let i = 0, q = 0; i < W * H; i++, q += 4) {
    const gx = Math.abs(((field[i * 2] * N) % 1 + 1) % 1 - 0.5);
    const gy = Math.abs(((field[i * 2 + 1] * N) % 1 + 1) % 1 - 0.5);
    // line width in output pixels, scaled by how fast the field is moving
    const w = Math.min(0.42, 0.06 * Math.max(0.4, result.scale[i] * N / unit * 8));
    const on = gx > 0.5 - w || gy > 0.5 - w;
    if (!on) continue;
    img.data[q] = img.data[q] * 0.25 + 79 * 0.75;
    img.data[q + 1] = img.data[q + 1] * 0.25 + 214 * 0.75;
    img.data[q + 2] = img.data[q + 2] * 0.25 + 210 * 0.75;
  }
  ctx.putImageData(img, 0, 0);
}

let placement = { x: 0, y: 0, scale: 1 };

function paintStage() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, w, h);
  if (!photo || !result) return;

  const left = !$('panel').classList.contains('hidden') && w > 760 ? 320 : 0;
  const pad = 24;
  const availW = w - left - pad * 2, availH = h - pad * 2;
  const scale = Math.min(availW / photo.W, availH / photo.H);
  const dw = photo.W * scale, dh = photo.H * scale;
  const x = left + pad + (availW - dw) / 2, y = pad + (availH - dh) / 2;
  placement = { x, y, scale };

  const buf = document.createElement('canvas');
  buf.width = photo.W; buf.height = photo.H;
  const bctx = buf.getContext('2d');
  if (showOriginal) {
    bctx.putImageData(new ImageData(new Uint8ClampedArray(photo.rgba), photo.W, photo.H), 0, 0);
  } else if (view === 'image') {
    bctx.putImageData(result.image, 0, 0);
  } else {
    bctx.putImageData(measurementImage(view), 0, 0);
  }
  if ($('grid').checked && !showOriginal) overlayGrid(bctx);

  sctx.save();
  sctx.shadowColor = 'rgba(0,0,0,0.85)';
  sctx.shadowBlur = 28;
  sctx.drawImage(buf, x, y, dw, dh);
  sctx.restore();

  const legend = $('legend');
  if (view === 'image' || showOriginal) { legend.hidden = true; return; }
  legend.hidden = false;
  legend.innerHTML = view === 'dilatation'
    ? `<span>K 1</span>${rampSwatch()}<span>4+</span><span style="color:var(--dim)">· grey = beyond measurement</span>`
    : `<span>⅛×</span>${rampSwatch()}<span>8×</span><span style="color:var(--dim)">· source pixels per output pixel</span>`;
}

function rampSwatch() {
  const stops = RAMP.map(([p, c]) => `rgb(${c.join(',')}) ${p * 100}%`).join(',');
  return `<i class="ramp" style="background:linear-gradient(90deg,${stops})"></i>`;
}

// ────────────────────────────────────────────────── the stack editor ──

const el = (tag, props = {}, ...kids) => {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') n.className = v;
    else if (k.startsWith('on')) n.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null) n.setAttribute(k, v);
  }
  for (const kid of kids.flat()) if (kid != null) n.append(kid);
  return n;
};
const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v));

function control(spec, value, onChange) {
  if (spec.type === 'enum') {
    const sel = el('select', { onchange: (e) => onChange(e.target.value) },
      ...spec.options.map((o) => el('option', { value: o }, o)));
    sel.value = value;
    return el('div', { class: 'pair' }, el('label', {}, spec.label), sel);
  }
  const num = el('b', {}, fmt(value));
  const range = el('input', {
    type: 'range', min: spec.min, max: spec.max, step: spec.step, value,
    oninput: (e) => { const v = parseFloat(e.target.value); num.textContent = fmt(v); onChange(v); },
  });
  return el('label', { class: 'slider' }, el('span', {}, spec.label, num), range);
}

const KIND_LABEL = { conformal: 'K=1', anticonformal: 'mirror', lens: 'shears' };

function renderLayers() {
  const host = $('stack');
  host.textContent = '';
  $('stack-count').textContent = recipe.ops.length ? String(recipe.ops.length) : '';

  recipe.ops.forEach((layer, i) => {
    const spec = MAPS[layer.map];
    if (!spec) return;
    const open = openLayer === i;

    const head = el('div', {
      class: 'layer-head',
      onclick: (e) => { if (e.target.closest('.mini')) return; openLayer = open ? -1 : i; renderLayers(); },
    },
      el('span', { class: 'name' }, spec.label),
      el('span', { class: `kind ${spec.kind}` }, KIND_LABEL[spec.kind]),
      el('button', { class: 'mini', title: 'mute', onclick: () => { layer.on = !layer.on; changed(); } }, layer.on ? '◉' : '○'),
      el('button', { class: 'mini', title: 'up', onclick: () => move(i, -1) }, '↑'),
      el('button', { class: 'mini', title: 'down', onclick: () => move(i, 1) }, '↓'),
      el('button', { class: 'mini', title: 'remove', onclick: () => { recipe.ops.splice(i, 1); openLayer = -1; changed(); } }, '×'),
    );

    const kids = [head];
    if (open) {
      kids.push(el('div', { class: 'layer-body' },
        el('p', { class: 'layer-note' }, spec.note),
        ...Object.entries(spec.params).map(([k, d]) =>
          control({ ...d, label: d.label || k }, layer.params[k] ?? d.def,
            (v) => { layer.params[k] = v; changed(false); })),
        ('cx' in spec.params)
          ? el('p', { class: 'tip' }, 'drag on the picture to move this centre')
          : null,
      ));
    }
    host.append(el('div', { class: `layer${layer.on ? '' : ' off'}${open ? ' open' : ''}` }, kids));
  });
}

function move(i, d) {
  const j = i + d;
  if (j < 0 || j >= recipe.ops.length) return;
  const [l] = recipe.ops.splice(i, 1);
  recipe.ops.splice(j, 0, l);
  openLayer = j;
  changed();
}

function changed(redraw = true) {
  if (redraw) renderLayers();
  syncUrl();
  applySoon();
}

// ──────────────────────────────────────────────────────── the numbers ──

function showStats() {
  const s = result.stats;
  const pct = (v) => (v * 100).toFixed(1) + '%';
  // The verdict is what was MEASURED, not what the maps claim — a lens map set
  // to a plain zoom really is conformal, and the panel should say so.
  const kinds = recipe.ops.filter((l) => l.on).map((l) => MAPS[l.map].kind);
  const flips = s.flipped > 0.01;
  const verdict = !kinds.length ? 'identity'
    : s.K99 < 1.01 ? (flips ? 'angle-preserving (mirrored)' : 'conformal')
      : s.K99 < 1.15 ? 'nearly conformal'
        : 'shears';
  const kCls = (k) => (k < 1.01 ? 'good' : k < 1.5 ? 'warn' : 'bad');

  const rows = [
    ['measured', verdict, verdict === 'shears' ? 'bad' : verdict === 'nearly conformal' ? 'warn' : 'good'],
    ['median K', s.medianK.toFixed(4), kCls(s.medianK)],
    ['99th percentile K', s.K99.toFixed(3), kCls(s.K99)],
    ['angles kept', pct(s.conformalFraction), s.conformalFraction > 0.99 ? 'good' : 'warn'],
  ];
  if (s.flipped > 0.001) rows.push(['orientation flipped', pct(s.flipped), 'warn']);
  if (s.unmeasurable > 0.001) rows.push(['beyond measurement', pct(s.unmeasurable), '']);
  rows.push(
    ['magnification', `${(1 / Math.max(1e-6, s.scale95)).toFixed(2)}× – ${(1 / Math.max(1e-6, s.scale5)).toFixed(2)}×`, ''],
    ['took', `${result.ms.toFixed(0)} ms`, ''],
  );
  $('stats').innerHTML = rows.map(([k, v, c]) => `<dt>${k}</dt><dd class="${c}">${v}</dd>`).join('');

  $('meas-note').textContent = verdict === 'shears'
    ? 'Something here cannot preserve angles — the dilatation view shows where it is being paid for.'
    : s.conformalFraction > 0.99
      ? 'Every angle in the picture survived this warp: K = 1 wherever it can be measured.'
      : 'K is the ratio of the two axes a tiny circle becomes. 1 means angles survive exactly.';
}

let statusTimer = 0;
function status(msg, ms = 0) {
  const s = $('status');
  clearTimeout(statusTimer);
  if (!msg) { s.hidden = true; return; }
  s.textContent = msg;
  s.hidden = false;
  if (ms) statusTimer = setTimeout(() => { s.hidden = true; }, ms);
}

function syncUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.set('r', encodeRecipe(recipe));
    history.replaceState(null, '', url);
  } catch { /* never break the page over a URL */ }
}

function loadRecipe(r) {
  recipe = normalise(r);
  openLayer = -1;
  syncFrameControls();
  renderLayers();
  syncUrl();
  apply();
}

function syncFrameControls() {
  $('zoom').value = recipe.view.zoom; $('zoom-v').textContent = recipe.view.zoom.toFixed(2);
  $('rotate').value = recipe.view.rotate; $('rotate-v').textContent = recipe.view.rotate;
  $('bias').value = recipe.bias; $('bias-v').textContent = recipe.bias.toFixed(2);
  $('edge').value = recipe.edge;
}

// ─────────────────────────────────────────────────────────── plumbing ──

$('preset').append(...PRESETS.map((p) => el('option', { value: p.name }, p.name)));
$('preset').addEventListener('change', (e) => {
  const p = presetByName(e.target.value);
  if (!p) return;
  $('preset-note').textContent = p.note;
  loadRecipe(p.recipe);
});

$('add-op').append(...Object.entries(MAPS).map(([k, s]) => el('option', { value: k }, s.label)));
$('add-op').addEventListener('change', (e) => {
  if (!e.target.value) return;
  recipe.ops.push(makeLayer(e.target.value));
  openLayer = recipe.ops.length - 1;
  e.target.value = '';
  changed();
});

$('view').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-view]');
  if (!b) return;
  view = b.dataset.view;
  for (const btn of $('view').querySelectorAll('button')) btn.setAttribute('aria-pressed', String(btn === b));
  paintStage();
});
$('grid').addEventListener('change', paintStage);

for (const [id, key, fmtv] of [['zoom', 'zoom', (v) => v.toFixed(2)], ['rotate', 'rotate', (v) => String(v)]]) {
  $(id).addEventListener('input', (e) => {
    recipe.view[key] = parseFloat(e.target.value);
    $(`${id}-v`).textContent = fmtv(recipe.view[key]);
    changed(false);
  });
}
$('bias').addEventListener('input', (e) => {
  recipe.bias = parseFloat(e.target.value);
  $('bias-v').textContent = recipe.bias.toFixed(2);
  changed(false);
});
$('edge').addEventListener('change', (e) => { recipe.edge = e.target.value; changed(false); });
$('reset-frame').addEventListener('click', () => {
  recipe.view = { zoom: 1, rotate: 0, panx: 0, pany: 0 };
  syncFrameControls();
  changed(false);
});

$('browse-btn').addEventListener('click', () => $('file-input').click());
$('drop-browse').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => loadFromFile(e.target.files[0]));
for (const [ev, val] of [['pointerdown', true], ['pointerup', false], ['pointerleave', false]]) {
  $('compare-btn').addEventListener(ev, () => { showOriginal = val; paintStage(); });
}

// drag on the picture to move the open layer's centre; wheel zooms the frame
let dragging = false;
function planeAt(clientX, clientY) {
  const unit = Math.min(photo.W, photo.H) / 2;
  const px = (clientX - placement.x) / placement.scale;
  const py = (clientY - placement.y) / placement.scale;
  return [(px - photo.W / 2) / unit, (photo.H / 2 - py) / unit];
}
stage.addEventListener('pointerdown', (e) => {
  if (!photo || openLayer < 0) return;
  const layer = recipe.ops[openLayer];
  if (!layer || !('cx' in MAPS[layer.map].params)) return;
  dragging = true;
  stage.classList.add('dragging');
  stage.setPointerCapture(e.pointerId);
  const [x, y] = planeAt(e.clientX, e.clientY);
  layer.params.cx = Math.round(x * 100) / 100;
  layer.params.cy = Math.round(y * 100) / 100;
  changed();
});
stage.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const layer = recipe.ops[openLayer];
  const [x, y] = planeAt(e.clientX, e.clientY);
  layer.params.cx = Math.round(x * 100) / 100;
  layer.params.cy = Math.round(y * 100) / 100;
  changed(false);
});
stage.addEventListener('pointerup', () => {
  if (!dragging) return;
  dragging = false;
  stage.classList.remove('dragging');
  renderLayers();
});
stage.addEventListener('wheel', (e) => {
  if (!photo) return;
  e.preventDefault();
  const z = recipe.view.zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08);
  recipe.view.zoom = Math.min(4, Math.max(0.2, z));
  syncFrameControls();
  changed(false);
}, { passive: false });

$('panel-toggle').addEventListener('click', () => setPanel(!$('panel').classList.contains('hidden')));
function setPanel(hidden) {
  $('panel').classList.toggle('hidden', hidden);
  $('panel-toggle').classList.toggle('collapsed', hidden);
  $('panel-toggle').textContent = hidden ? '⮞' : '⮜';
  paintStage();
}
$('docs-btn').addEventListener('click', () => $('docs').showModal());
$('docs-close').addEventListener('click', () => $('docs').close());

for (const ev of ['dragenter', 'dragover']) {
  window.addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('dragover'); });
}
window.addEventListener('dragleave', () => $('drop').classList.remove('dragover'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  $('drop').classList.remove('dragover');
  const f = e.dataTransfer?.files?.[0];
  if (f) loadFromFile(f);
});
window.addEventListener('paste', (e) => {
  for (const item of e.clipboardData?.items || []) {
    if (item.type.startsWith('image/')) { loadFromFile(item.getAsFile()); return; }
  }
  const text = e.clipboardData?.getData('text');
  if (text && /^https?:\/\//.test(text.trim())) loadFromUrl(text.trim());
});
window.addEventListener('keydown', (e) => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
  if (e.code === 'Space' && !showOriginal) { showOriginal = true; paintStage(); e.preventDefault(); }
});
window.addEventListener('keyup', (e) => { if (e.code === 'Space') { showOriginal = false; paintStage(); } });
window.addEventListener('resize', paintStage);

// ───────────────────────────────────────────────────────────── export ──

function outCanvas() {
  const c = document.createElement('canvas');
  c.width = photo.W; c.height = photo.H;
  const ctx = c.getContext('2d');
  ctx.putImageData(view === 'image' || showOriginal ? result.image : measurementImage(view), 0, 0);
  if ($('grid').checked) overlayGrid(ctx);
  return c;
}

const stem = () => `lens-${recipe.ops.filter((l) => l.on).map((l) => l.map).join('-') || 'plain'}`;

/**
 * Straight to the clipboard. ClipboardItem is given the blob as a *pending
 * promise*: Safari drops the user-gesture permission if you await first, and
 * both engines accept a pending value.
 */
async function copyImage() {
  if (!result) return;
  if (!(navigator.clipboard?.write && window.ClipboardItem)) {
    return status('this browser has no image clipboard — save the PNG instead', 4500);
  }
  status('copying…');
  const blob = new Promise((res) => outCanvas().toBlob(res, 'image/png'));
  try {
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    } catch {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': await blob })]);
    }
    status('copied — paste it anywhere', 2500);
  } catch (e) {
    status(`the clipboard refused it (${e.message || e}) — save the PNG instead`, 5000);
  }
}

$('copy-img-btn').addEventListener('click', copyImage);
$('png-btn').addEventListener('click', () => {
  if (!result) return;
  outCanvas().toBlob((b) => {
    const a = el('a', { download: `${stem()}.png` });
    a.href = URL.createObjectURL(b);
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
});
$('link-btn').addEventListener('click', async () => {
  syncUrl();
  await copy(location.href);
  status('link copied — it carries the whole stack', 2500);
});
$('paste-btn').addEventListener('click', async () => {
  try {
    const text = (await navigator.clipboard.readText()).trim();
    loadRecipe(text.startsWith('{') ? JSON.parse(text) : decodeRecipe(text.split('r=').pop()));
    status('recipe loaded', 2000);
  } catch (e) { status(`that is not a recipe (${e.message || e})`, 3500); }
});

async function copy(text) {
  try { await navigator.clipboard.writeText(text); }
  catch {
    const ta = el('textarea', {});
    ta.value = text;
    document.body.append(ta); ta.select();
    document.execCommand('copy');
    ta.remove();
  }
}

// ─────────────────────────────────────────────────────────── first run ──
{
  const params = new URLSearchParams(location.search);
  const r = params.get('r');
  if (r) {
    try { recipe = decodeRecipe(r); } catch { recipe = normalise(PRESETS[0].recipe); }
  } else {
    $('preset').value = PRESETS[0].name;
    $('preset-note').textContent = PRESETS[0].note;
  }
  syncFrameControls();
  renderLayers();
  const u = params.get('u');
  if (u) loadFromUrl(u);
}
if (narrow()) setPanel(true);
paintStage();
