// app.js — the bench. The maths lives in glitch.js, the JPEG in codec.js, the
// stack runner in pipeline.js; this file owns the photograph, the canvas, the
// brush and the editor that assembles a recipe.

import {
  OPS, FIELDS, makeLayer, defaults, defaultField, normalise,
  encodeRecipe, decodeRecipe, hash32,
} from './glitch.js';
import { renderAsync } from './pipeline.js';
import { PRESETS, presetByName } from './presets.js';

// Operators are O(pixels) and a deep stack is a second of arithmetic, so the
// photo is cut to a working resolution first. Everything downstream — masks,
// brush, export — lives at this size.
const WORK_MAX = 1100;

const $ = (id) => document.getElementById(id);
const stage = $('stage');
const sctx = stage.getContext('2d');

let photo = null;          // { rgba, W, H, bitmap }
let paint = null;          // Float32Array, the hand-painted mask
let out = null;            // ImageData of the current result
let recipe = { seed: 'rust', ops: [] };
let openLayer = -1;
let busy = false, queued = false, token = 0;
let painting = false, showOriginal = false;
let lastLog = [];

const narrow = () => window.innerWidth <= 760;

// ────────────────────────────────────────────────────────── the worker ──

let worker = null;
try {
  worker = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' });
} catch { worker = null; }

function runStack() {
  const req = { rgba: photo.rgba, W: photo.W, H: photo.H, recipe: normalise(recipe), paint };
  if (!worker) return renderAsync(req.rgba, req.W, req.H, req.recipe, { paint });
  return new Promise((resolve, reject) => {
    const mine = ++token;
    const onMessage = (e) => {
      if (e.data.token !== mine) return;
      worker.removeEventListener('message', onMessage);
      if (e.data.ok) resolve({ rgba: e.data.rgba, width: e.data.width, height: e.data.height, log: e.data.log });
      else reject(new Error(e.data.error));
    };
    worker.addEventListener('message', onMessage);
    const copy = photo.rgba.slice();
    const pcopy = paint ? paint.slice() : null;
    worker.postMessage(
      { rgba: copy, W: photo.W, H: photo.H, recipe: req.recipe, paint: pcopy, token: mine },
      pcopy ? [copy.buffer, pcopy.buffer] : [copy.buffer],
    );
  });
}

async function apply() {
  if (!photo) return;
  if (busy) { queued = true; return; }
  busy = true;
  status('running the stack…');
  const t0 = performance.now();
  try {
    const res = await runStack();
    out = new ImageData(new Uint8ClampedArray(res.rgba), res.width, res.height);
    lastLog = res.log;
    showLog(performance.now() - t0);
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
const applySoon = () => { clearTimeout(debounce); debounce = setTimeout(apply, 110); };

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
  paint = new Float32Array(W * H);
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

// ─────────────────────────────────────────────────────────── the view ──

let placement = { x: 0, y: 0, scale: 1 };

function paintStage() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth, h = window.innerHeight;
  stage.width = Math.round(w * dpr); stage.height = Math.round(h * dpr);
  stage.style.width = w + 'px'; stage.style.height = h + 'px';
  sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  sctx.clearRect(0, 0, w, h);
  if (!photo) return;

  const left = !$('panel').classList.contains('hidden') && w > 760 ? 330 : 0;
  const pad = 24;
  const availW = w - left - pad * 2, availH = h - pad * 2;
  const scale = Math.min(availW / photo.W, availH / photo.H);
  const dw = photo.W * scale, dh = photo.H * scale;
  const x = left + pad + (availW - dw) / 2, y = pad + (availH - dh) / 2;
  placement = { x, y, scale };

  const buf = document.createElement('canvas');
  buf.width = photo.W; buf.height = photo.H;
  const bctx = buf.getContext('2d');
  if (showOriginal || !out) bctx.putImageData(new ImageData(new Uint8ClampedArray(photo.rgba), photo.W, photo.H), 0, 0);
  else bctx.putImageData(out, 0, 0);

  if ($('show-mask').checked && paint) {
    const overlay = bctx.getImageData(0, 0, photo.W, photo.H);
    for (let i = 0, q = 0; i < photo.W * photo.H; i++, q += 4) {
      const m = paint[i];
      if (m <= 0) continue;
      overlay.data[q] = overlay.data[q] * (1 - m * 0.55) + 255 * m * 0.55;
      overlay.data[q + 1] = overlay.data[q + 1] * (1 - m * 0.55) + 46 * m * 0.55;
      overlay.data[q + 2] = overlay.data[q + 2] * (1 - m * 0.55) + 136 * m * 0.55;
    }
    bctx.putImageData(overlay, 0, 0);
  }

  sctx.imageSmoothingEnabled = scale < 1;
  sctx.save();
  sctx.shadowColor = 'rgba(0,0,0,0.9)';
  sctx.shadowBlur = 30;
  sctx.drawImage(buf, x, y, dw, dh);
  sctx.restore();
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

/** One control, generated from a parameter's schema entry. */
function control(spec, value, onChange) {
  if (spec.type === 'enum') {
    const sel = el('select', { onchange: (e) => onChange(e.target.value) },
      ...spec.options.map((o) => el('option', { value: o, ...(o === value ? { selected: '' } : {}) }, o)));
    sel.value = value;
    return el('div', { class: 'pair' }, el('label', {}, spec.label), sel);
  }
  if (spec.type === 'bool') {
    const box = el('input', { type: 'checkbox', ...(value ? { checked: '' } : {}) });
    box.addEventListener('change', () => onChange(box.checked));
    return el('label', { class: 'check' }, box, ' ' + spec.label);
  }
  const num = el('b', {}, fmt(value));
  const range = el('input', {
    type: 'range', min: spec.min, max: spec.max, step: spec.step, value,
    oninput: (e) => { const v = parseFloat(e.target.value); num.textContent = fmt(v); onChange(v); },
  });
  return el('label', { class: 'slider' }, el('span', {}, spec.label, num), range);
}

const fmt = (v) => (typeof v === 'number' && !Number.isInteger(v) ? v.toFixed(2) : String(v));

function renderLayers() {
  const host = $('stack');
  host.textContent = '';
  $('stack-count').textContent = recipe.ops.length ? `${recipe.ops.length}` : '';

  recipe.ops.forEach((layer, i) => {
    const spec = OPS[layer.op];
    if (!spec) return;
    const open = openLayer === i;
    const entry = lastLog[i];

    const head = el('div', { class: 'layer-head', onclick: (e) => {
      if (e.target.closest('.mini')) return;
      openLayer = open ? -1 : i;
      renderLayers();
    } },
      el('span', { class: 'dot' }),
      el('span', { class: 'name' }, spec.label),
      el('button', { class: 'mini', title: 'mute', onclick: () => { layer.on = !layer.on; changed(); } }, layer.on ? '◉' : '○'),
      el('button', { class: 'mini', title: 'up', onclick: () => move(i, -1) }, '↑'),
      el('button', { class: 'mini', title: 'down', onclick: () => move(i, 1) }, '↓'),
      el('button', { class: 'mini', title: 'duplicate', onclick: () => {
        recipe.ops.splice(i + 1, 0, JSON.parse(JSON.stringify(layer)));
        openLayer = i + 1; changed();
      } }, '⧉'),
      el('button', { class: 'mini', title: 'remove', onclick: () => {
        recipe.ops.splice(i, 1); openLayer = -1; changed();
      } }, '×'),
    );

    const kids = [head];
    if (open) {
      const fieldType = layer.field?.type || 'all';
      const body = el('div', { class: 'layer-body' },
        el('p', { class: 'layer-note' }, spec.note),

        control({ min: 0, max: 1, step: 0.01, label: 'strength' }, layer.amount,
          (v) => { layer.amount = v; changed(false); }),

        el('p', { class: 'sub' }, 'where'),
        el('div', { class: 'pair' },
          el('label', {}, 'field'),
          (() => {
            const sel = el('select', { onchange: (e) => {
              layer.field = defaultField(e.target.value);
              changed();
            } }, ...Object.entries(FIELDS).map(([k, f]) => el('option', { value: k }, f.label)));
            sel.value = fieldType;
            return sel;
          })()),
        ...Object.entries(FIELDS[fieldType].params).map(([k, d]) =>
          control({ ...d, label: d.label || k }, layer.field.params[k] ?? d.def,
            (v) => { layer.field.params[k] = v; changed(false); })),
        (() => {
          const box = el('input', { type: 'checkbox', ...(layer.field.invert ? { checked: '' } : {}) });
          box.addEventListener('change', () => { layer.field.invert = box.checked; changed(); });
          return el('label', { class: 'check' }, box, ' invert');
        })(),
        (() => {
          const box = el('input', { type: 'checkbox', ...(layer.field.paintMul ? { checked: '' } : {}) });
          box.addEventListener('change', () => { layer.field.paintMul = box.checked; changed(); });
          return el('label', { class: 'check' }, box, ' ∩ paint');
        })(),

        el('p', { class: 'sub' }, 'what'),
        ...Object.entries(spec.params).map(([k, d]) =>
          control({ ...d, label: d.label || k }, layer.params[k] ?? d.def,
            (v) => { layer.params[k] = v; changed(false); })),

        el('button', { class: 'btn wide', onclick: () => { layer.seed = (layer.seed | 0) + 1; changed(); } },
          'reroll this layer'),

        entry && (entry.note || entry.failed || entry.ms > 0)
          ? el('p', { class: `layer-stat${entry.failed ? ' bad' : ''}` },
            [entry.failed ? '⚠ ' : '', entry.note || '', entry.ms ? ` ${entry.ms.toFixed(0)}ms` : ''].join(''))
          : null,
      );
      kids.push(body);
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

/** Something in the recipe moved: re-render the stack, re-run the pipeline. */
function changed(redraw = true) {
  if (redraw) renderLayers();
  syncUrl();
  applySoon();
}

// ────────────────────────────────────────────────────────── the brush ──

function paintAt(cx, cy, brush, erase) {
  const x = (cx - placement.x) / placement.scale;
  const y = (cy - placement.y) / placement.scale;
  const r = brush / 2;
  const x0 = Math.max(0, Math.floor(x - r)), x1 = Math.min(photo.W - 1, Math.ceil(x + r));
  const y0 = Math.max(0, Math.floor(y - r)), y1 = Math.min(photo.H - 1, Math.ceil(y + r));
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const d = Math.hypot(px - x, py - y);
      if (d > r) continue;
      const falloff = 1 - (d / r) ** 2;
      const i = py * photo.W + px;
      paint[i] = erase
        ? Math.max(0, paint[i] - falloff)
        : Math.min(1, paint[i] + falloff * 0.6);
    }
  }
}

let stroking = false;
stage.addEventListener('pointerdown', (e) => {
  if (!painting || !photo) return;
  stroking = true;
  stage.setPointerCapture(e.pointerId);
  paintAt(e.clientX, e.clientY, +$('brush').value, $('erase').checked);
  paintStage();
});
stage.addEventListener('pointermove', (e) => {
  if (!stroking) return;
  paintAt(e.clientX, e.clientY, +$('brush').value, $('erase').checked);
  paintStage();
});
stage.addEventListener('pointerup', () => {
  if (!stroking) return;
  stroking = false;
  applySoon();
});

// ────────────────────────────────────────────────────────── plumbing ──

let statusTimer = 0;
function status(msg, ms = 0) {
  const s = $('status');
  clearTimeout(statusTimer);
  if (!msg) { s.hidden = true; return; }
  s.textContent = msg;
  s.hidden = false;
  if (ms) statusTimer = setTimeout(() => { s.hidden = true; }, ms);
}

function showLog(total) {
  const box = $('log');
  if (!lastLog.length) { box.hidden = true; return; }
  box.innerHTML = lastLog.map((e) => {
    if (e.off) return `<div><b>${OPS[e.op]?.label || e.op}</b> · muted</div>`;
    const cls = e.failed ? ' class="bad"' : '';
    return `<div${cls}><b>${OPS[e.op]?.label || e.op}</b> <span class="ms">${e.ms.toFixed(0)}ms</span>${e.note ? ` · ${e.note}` : ''}</div>`;
  }).join('') + `<div>total <span class="ms">${total.toFixed(0)}ms</span></div>`;
  box.hidden = false;
}

function syncUrl() {
  try {
    const url = new URL(location.href);
    url.searchParams.set('r', encodeRecipe(recipe));
    history.replaceState(null, '', url);
  } catch { /* a recipe too big for a URL is not worth breaking the page over */ }
}

function loadRecipe(r, { keepSeed = false } = {}) {
  const next = normalise(r);
  recipe = keepSeed ? { ...next, seed: recipe.seed } : next;
  $('seed').value = recipe.seed;
  openLayer = -1;
  renderLayers();
  syncUrl();
  apply();
}

// presets + add-op menus
$('preset').append(...PRESETS.map((p) => el('option', { value: p.name }, p.name)));
$('preset').addEventListener('change', (e) => {
  const p = presetByName(e.target.value);
  if (!p) return;
  $('preset-note').textContent = p.note;
  loadRecipe(p.recipe);
});

$('add-op').append(...Object.entries(OPS).map(([k, s]) => el('option', { value: k }, s.label)));
$('add-op').addEventListener('change', (e) => {
  if (!e.target.value) return;
  recipe.ops.push(makeLayer(e.target.value));
  openLayer = recipe.ops.length - 1;
  e.target.value = '';
  changed();
});

$('seed').addEventListener('input', (e) => { recipe.seed = e.target.value; changed(false); });
$('reseed').addEventListener('click', () => {
  // a new seed derived from the old one: still deterministic, still yours
  recipe.seed = (hash32(Date.now() & 0xffff, recipe.seed.length, 7) >>> 0).toString(36);
  $('seed').value = recipe.seed;
  changed(false);
});

$('browse-btn').addEventListener('click', () => $('file-input').click());
$('drop-browse').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (e) => loadFromFile(e.target.files[0]));

for (const [ev, val] of [['pointerdown', true], ['pointerup', false], ['pointerleave', false]]) {
  $('compare-btn').addEventListener(ev, () => { showOriginal = val; paintStage(); });
}

$('paint-btn').addEventListener('click', () => {
  painting = !painting;
  $('paint-btn').classList.toggle('on', painting);
  stage.classList.toggle('painting', painting);
  if (painting) $('show-mask').checked = true;
  paintStage();
});
$('paint-clear').addEventListener('click', () => {
  if (paint) paint.fill(0);
  paintStage();
  applySoon();
});
$('brush').addEventListener('input', (e) => { $('brush-v').textContent = e.target.value; });
$('show-mask').addEventListener('change', paintStage);

$('png-btn').addEventListener('click', exportPNG);
$('link-btn').addEventListener('click', async () => {
  syncUrl();
  await copy(location.href);
  status('link copied — it carries the whole recipe', 2500);
});
$('copy-btn').addEventListener('click', async () => {
  await copy(JSON.stringify(normalise(recipe), null, 2));
  status('recipe copied', 2000);
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

// A PNG that remembers how it was made: the recipe rides in a tEXt chunk, so a
// file you find in six months can still tell you its own history.
function exportPNG() {
  if (!out) return;
  const c = document.createElement('canvas');
  c.width = photo.W; c.height = photo.H;
  c.getContext('2d').putImageData(out, 0, 0);
  c.toBlob(async (blob) => {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    const tagged = embedText(bytes, 'glitch-recipe', JSON.stringify(normalise(recipe)));
    const a = el('a', { download: `glitch-${recipe.seed}-${recipe.ops.filter((l) => l.on).length}ops.png` });
    a.href = URL.createObjectURL(new Blob([tagged], { type: 'image/png' }));
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }, 'image/png');
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

export function embedText(png, key, value) {
  const payload = new TextEncoder().encode(`${key}\0${value}`);
  const chunk = new Uint8Array(12 + payload.length);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, payload.length);
  chunk.set([0x74, 0x45, 0x58, 0x74], 4);        // "tEXt"
  chunk.set(payload, 8);
  dv.setUint32(8 + payload.length, crc32(chunk.subarray(4, 8 + payload.length)));
  // insert before IEND, which is always the last 12 bytes
  const at = png.length - 12;
  const outp = new Uint8Array(png.length + chunk.length);
  outp.set(png.subarray(0, at), 0);
  outp.set(chunk, at);
  outp.set(png.subarray(at), at + chunk.length);
  return outp;
}

function setPanel(hidden) {
  $('panel').classList.toggle('hidden', hidden);
  $('panel-toggle').classList.toggle('collapsed', hidden);
  $('panel-toggle').textContent = hidden ? '⮞' : '⮜';
  paintStage();
}
$('panel-toggle').addEventListener('click', () => setPanel(!$('panel').classList.contains('hidden')));
$('docs-btn').addEventListener('click', () => $('docs').showModal());
$('docs-close').addEventListener('click', () => $('docs').close());

for (const ev of ['dragenter', 'dragover']) {
  window.addEventListener(ev, (e) => { e.preventDefault(); $('drop').classList.add('dragging'); });
}
window.addEventListener('dragleave', () => $('drop').classList.remove('dragging'));
window.addEventListener('drop', (e) => {
  e.preventDefault();
  $('drop').classList.remove('dragging');
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
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { showOriginal = false; paintStage(); }
});
window.addEventListener('resize', paintStage);

// ─────────────────────────────────────────────────────────── first run ──
{
  const params = new URLSearchParams(location.search);
  const r = params.get('r');
  if (r) {
    try { recipe = decodeRecipe(r); } catch { recipe = normalise(PRESETS[0].recipe); }
  } else {
    recipe = normalise(PRESETS[0].recipe);
    $('preset').value = PRESETS[0].name;
    $('preset-note').textContent = PRESETS[0].note;
  }
  $('seed').value = recipe.seed;
  renderLayers();
  const u = params.get('u');
  if (u) loadFromUrl(u);
}
if (narrow()) setPanel(true);
paintStage();
