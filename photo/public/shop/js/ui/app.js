// app.js — the wiring. State lives here; everything else is a pure module that
// this file drives.
//
// THE RENDER LOOP
// ---------------
// Nothing draws synchronously. Every change calls `render()`, which coalesces
// into one animation frame, ships the document's *structure* (and only the
// buffers that changed — see wire.js) to the worker, and draws the frame that
// comes back. A slider drag therefore costs one composite per completed
// render, not one per input event, and the picture never blocks the pointer.
//
// If module workers are unavailable the same composite runs inline. It is the
// identical code path — `core/doc.js` has no idea which thread it is on —
// so the fallback is slower and never different.

import {
  addLayer, composite, createDoc, decodeRecipe, deserialize, duplicateLayer,
  encodeRecipe, flattenLayer, makeLayer, mergeDown, moveLayer, removeLayer, serialize,
} from '../core/doc.js';
import { createHistory, push, redo, undo } from '../core/history.js';
import { FIELDS } from '../../../glitch/js/glitch.js';
import { makeMask, makeRGBA } from '../core/pixels.js';
import { defaults, EFFECTS, makeEffect } from '../core/registry.js';
import * as sel from '../core/select.js';
import { fxMaskKey, maskKey, pixelsKey, toWire } from '../core/wire.js';
import { PRESETS } from '../presets.js';
import { control } from './controls.js';
import * as io from './io.js';
import { createPublisher } from './post.js';
import { peek, takeSeed } from '../handoff.js';
import { usableSession } from '../core/session.js';
import {
  renderLayerProps, renderLayers, renderParams, renderPicker, renderStack,
} from './panels.js';
import { createTools, defaultOptions, TOOL_OPTIONS, TOOLS } from './tools.js';
import {
  createView, drawOverlay, drawPicture, fitCanvas, setDocSize, setFrame, toDoc,
  zoomAt, zoomToFit,
} from './view.js';

const $ = (id) => document.getElementById(id);

const app = {
  doc: null,
  view: null,
  history: createHistory(),
  tool: 'marquee',
  opts: defaultOptions(),
  activeFx: -1,
  lastComposite: null,
  original: null,
  spaceDown: false,
  showOriginal: false,
  cursor: null,
};

let tools = null;
let publisher = null;
let worker = null;
let sentBuffers = new Map();
const dirty = new Set();
let renderToken = 0;
let renderQueued = false;
let rendering = false;

// ────────────────────────────────────────────────────────────── booting ──

function boot() {
  app.view = createView($('view'), $('overlay'));
  tools = createTools(app);
  publisher = createPublisher(app);
  buildTools();
  buildPresetMenu();
  buildHelp();
  wireVeil();
  wireMenus();
  wireStage();
  wireKeys();
  startWorker();
  requestAnimationFrame(tick);

  const params = new URLSearchParams(location.search);
  // A recipe is structure without pixels, so it waits for a picture to arrive
  // and is applied to it — which is exactly what a shared link means: "do this
  // to yours".
  const hash = new URLSearchParams(location.hash.slice(1));
  if (hash.get('r')) {
    try { pendingRecipe = decodeRecipe(hash.get('r')); } catch { pendingRecipe = null; }
    if (pendingRecipe) {
      $('drop-browse').textContent = 'open a photograph to apply this recipe…';
    }
  }
  // `?resume=` FIRST, and it wins outright. It is what an OAuth round trip
  // comes back to, and it holds the session that was here before the redirect —
  // pixels and all. Any `?u=` or `?seed=` beside it would be the *old* way in,
  // already spent; `resumeUrl` strips them for that reason, and checking this
  // first means a stray one can never re-open an emptier version of the same
  // picture over the top of the real one.
  if (params.get('resume')) resumeSession(params.get('resume'));
  else if (params.get('u')) openURL(params.get('u'));
  // `?seed=` — a picture handed over from another page on this origin that had
  // no URL to give (a file someone dropped into /bloom). The blob waits in
  // IndexedDB under this key and is deleted as it is collected; see
  // js/handoff.js for why a data: URL and sessionStorage both lose.
  else if (params.get('seed')) openHandoff(params.get('seed'));
}

/**
 * Walk back in after a full-page OAuth redirect.
 *
 * Everything is restored by reference from the structured clone — the layer
 * buffers ARE the buffers, so this costs one read and no decoding whatever the
 * document's size. Undo history is deliberately not carried (see
 * `core/session.js`), so it starts clean.
 *
 * The key is read with `peek`, not `take`: a reload of the page you just came
 * back to must find it again. It expires on its own in half an hour.
 */
async function resumeSession(key) {
  let snap = null;
  try { snap = await peek(key); } catch { snap = null; }
  if (!usableSession(snap)) {
    // The stash is gone — a different browser, cleared storage, or half an
    // hour of doing something else. Say which picture it was rather than
    // showing a blank veil, and fall back to re-fetching it if it had a URL.
    const params = new URLSearchParams(location.search);
    if (params.get('u')) return void openURL(params.get('u'));
    // Do not guess at a cause: this is equally "the sign-in took half an hour",
    // "storage was cleared", and "somebody sent me this link". A `?resume=` key
    // only ever means anything in the browser that wrote it, so say that.
    veilError('that link points at a session this browser is not holding — it has either expired '
      + '(they last half an hour) or it was made on another machine. Open a picture to start again.');
    return;
  }

  app.doc = snap.doc;
  app.original = snap.original || null;
  app.history = createHistory();
  app.activeFx = -1;
  sentBuffers = new Map();
  dirty.clear();
  worker?.postMessage({ type: 'forget' });
  $('drop').hidden = true;
  $('app').hidden = false;
  fitCanvas(app.view, $('stage'));
  setDocSize(app.view, app.doc.W, app.doc.H);
  if (snap.view) {
    app.view.zoom = snap.view.zoom;
    app.view.panx = snap.view.panx;
    app.view.pany = snap.view.pany;
  } else {
    zoomToFit(app.view);
  }
  refresh();
  render();
  status(`${app.doc.W}×${app.doc.H} · picked up where you left off`);
  // You did not click "sign in", you clicked **post**. Come back to that — but
  // not until there is a composite to post; `acceptFrame` picks this up.
  pendingPost = snap.post || null;
}

let pendingRecipe = null;
let pendingPost = null;

/** Drop a spent resume key from the address bar, leaving everything else. */
function forgetResume() {
  const url = new URL(location.href);
  if (!url.searchParams.get('resume')) return;
  url.searchParams.delete('resume');
  const q = url.searchParams.toString();
  history.replaceState(null, '', `${url.pathname}${q ? `?${q}` : ''}${url.hash}`);
}

function startWorker() {
  try {
    worker = new Worker(new URL('../worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = (ev) => {
      const m = ev.data;
      if (m.type === 'frame') {
        if (m.token !== renderToken) { rendering = false; pump(); return; }
        acceptFrame(m.px, m.W, m.H, m.ms);
      } else if (m.type === 'error') {
        status(`render failed: ${m.message}`);
        rendering = false;
      }
      rendering = false;
      pump();
    };
    worker.onerror = () => { worker = null; status('worker unavailable — compositing on the main thread'); };
  } catch (err) {
    worker = null;
  }
}

// ───────────────────────────────────────────────────────── the document ──

function startDoc(px, W, H, name = 'photograph') {
  const doc = createDoc(W, H, { name });
  const layer = makeLayer({ kind: 'raster', name, W, H, pixels: px });
  addLayer(doc, layer);
  app.doc = doc;
  app.original = { px: new Uint8ClampedArray(px), W, H };
  app.history = createHistory();
  app.activeFx = -1;
  sentBuffers = new Map();
  dirty.clear();
  worker?.postMessage({ type: 'forget' });
  // Any `?resume=` in the bar names the session that WAS here. Opening a
  // different picture makes it a lie, and leaving it would mean a reload
  // silently throwing away what you just opened in favour of a stale snapshot.
  forgetResume();
  $('drop').hidden = true;
  $('app').hidden = false;
  fitCanvas(app.view, $('stage'));
  setDocSize(app.view, app.doc.W, app.doc.H);
  zoomToFit(app.view);
  refresh();
  render();
  status(`${W}×${H} · one layer · nothing leaves this tab unless you post it`);
  if (pendingRecipe) {
    const r = pendingRecipe;
    pendingRecipe = null;
    try {
      applyRecipe(r);
      status('the shared recipe has been applied to your picture');
    } catch (err) {
      status(`that recipe would not load — ${err.message}`);
    }
  }
}

async function openFile(file, { asLayer = false } = {}) {
  try {
    if (file.name?.endsWith('.json')) return void loadProjectFile(file);
    const recipe = file.type === 'image/png' ? await io.readPNGText(file, io.RECIPE_KEY) : null;
    const raw = await io.decodeImage(file);
    const capped = io.capSize(raw, Number(localStorage.getItem('shop.maxSide')) || 2400);
    if (asLayer && app.doc) {
      push(app.history, app.doc, 'place layer');
      const px = io.place(capped.px, capped.W, capped.H, app.doc.W, app.doc.H);
      addLayer(app.doc, makeLayer({ kind: 'raster', name: file.name || 'placed', W: app.doc.W, H: app.doc.H, pixels: px }));
      refresh(); render();
      return;
    }
    startDoc(capped.px, capped.W, capped.H, file.name || 'photograph');
    if (recipe) {
      try {
        applyRecipe(JSON.parse(recipe));
        status('opened with the recipe that made it');
      } catch { /* a corrupt chunk is not worth failing the open for */ }
    }
  } catch (err) {
    veilError(`could not read that file — ${err.message}`);
  }
}

async function openHandoff(key) {
  try {
    const blob = await takeSeed(key);
    if (!blob) throw new Error('that picture was already collected, or the link is stale');
    await openFile(blob);
  } catch (err) {
    veilError(`could not pick up that picture — ${err.message}`);
  }
}

async function openURL(url) {
  try {
    const proxied = /(^https?:)?\/\/[^/]*bsky\.app\//.test(url) ? `/api/img?u=${encodeURIComponent(url)}` : url;
    const raw = await io.decodeImage(proxied);
    const capped = io.capSize(raw, 2400);
    startDoc(capped.px, capped.W, capped.H, 'linked picture');
  } catch (err) {
    veilError(`could not load that URL — ${err.message}`);
  }
}

/** Re-apply a recipe (structure only) on top of the picture already open. */
function applyRecipe(json) {
  const { doc: rebuilt } = deserialize({ ...json, W: app.doc.W, H: app.doc.H });
  // the recipe's layers carry no pixels; keep the open picture as the base and
  // adopt everything that describes what was done to it
  const base = app.doc.layers[0];
  app.doc.layers = rebuilt.layers.map((l, i) => (i === 0 && l.kind === 'raster'
    ? { ...l, pixels: base.pixels }
    : { ...l, pixels: l.kind === 'raster' ? makeRGBA(app.doc.W, app.doc.H) : null }));
  app.doc.active = app.doc.layers[app.doc.layers.length - 1]?.id || null;
  app.doc.seed = rebuilt.seed;
  sentBuffers = new Map();
  refresh(); render();
}

// ─────────────────────────────────────────────────────────── rendering ──

export function render() {
  if (!app.doc) return;
  renderQueued = true;
  pump();
}

function pump() {
  if (!renderQueued || rendering || !app.doc) return;
  renderQueued = false;
  const token = ++renderToken;
  if (worker) {
    const { msg, sent } = toWire(app.doc, sentBuffers, dirty);
    sentBuffers = sent;
    dirty.clear();
    rendering = true;
    worker.postMessage({ type: 'render', token, msg });
  } else {
    const t0 = performance.now();
    const px = composite(app.doc);
    acceptFrame(px, app.doc.W, app.doc.H, performance.now() - t0);
  }
}

function acceptFrame(px, W, H, ms) {
  app.lastComposite = px;
  setFrame(app.view, px, W, H);
  drawPicture(app.view);
  paintOverlay();
  const layers = app.doc.layers.length;
  const fx = app.doc.layers.reduce((n, l) => n + l.fx.length, 0);
  status(`${W}×${H} · ${layers} layer${layers === 1 ? '' : 's'} · ${fx} effect${fx === 1 ? '' : 's'} · ${ms.toFixed(0)} ms`);
  // Reopening the post dialog has to wait for a composite: it posts what is on
  // screen, so `open()` refuses while `lastComposite` is null. This is the
  // first moment after a resume that there is one.
  if (pendingPost) {
    const post = pendingPost;
    pendingPost = null;
    publisher.restore(post);
  }
}

function paintOverlay() {
  if (!app.doc) return;
  drawOverlay(app.view, {
    selection: app.doc.selection && !sel.isEmpty(app.doc.selection) ? app.doc.selection : null,
    W: app.doc.W, H: app.doc.H,
    shape: tools.preview(app.cursor),
    brush: ['brush', 'eraser', 'mask'].includes(app.tool) && app.cursor
      ? { x: app.cursor.x, y: app.cursor.y, radius: app.opts.size / 2, soft: app.opts.soft }
      : null,
  });
}

/** Marching ants, and nothing else — the picture only redraws when it changes. */
function tick() {
  if (app.doc && app.doc.selection && !sel.isEmpty(app.doc.selection)) {
    app.view.antPhase = (app.view.antPhase + 0.6) % 8;
    paintOverlay();
  }
  requestAnimationFrame(tick);
}

// ────────────────────────────────────────────────────────────── the API ──
//
// Everything the panels and tools are allowed to do. Each one decides where the
// undo boundary is, which is why it lives in one file.

Object.assign(app, {
  status,
  render,
  refresh,

  markDirty(layerId, kind) {
    dirty.add(kind === 'mask' ? maskKey(layerId) : pixelsKey(layerId));
  },

  zoomBy(factor, sx, sy) {
    zoomAt(app.view, factor, sx, sy);
    drawPicture(app.view);
    paintOverlay();
    updateZoomLabel();
  },

  setOption(key, value) {
    app.opts[key] = value;
    buildOptions();
    paintOverlay();
  },

  commitSelection(mask) {
    push(app.history, app.doc, 'selection');
    app.doc.selection = sel.isEmpty(mask) ? null : mask;
    refresh();
    paintOverlay();
  },

  selectLayer(id) {
    app.doc.active = id;
    app.activeFx = -1;
    refresh();
  },

  setLayer(id, patch, label, o = {}) {
    const layer = app.doc.layers.find((l) => l.id === id);
    if (!layer) return;
    if (!o.live) push(app.history, app.doc, label || 'layer');
    Object.assign(layer, patch);
    refresh();
    render();
  },

  selectFx(i) {
    app.activeFx = i;
    refresh();
  },

  setFx(i, patch, label, o = {}) {
    const layer = activeLayerOf();
    if (!layer?.fx[i]) return;
    if (!o.live) push(app.history, app.doc, label || 'effect');
    Object.assign(layer.fx[i], patch);
    refresh();
    render();
  },

  setFxParam(i, key, value, o = {}) {
    const layer = activeLayerOf();
    if (!layer?.fx[i]) return;
    if (!o.live) push(app.history, app.doc, `${key}`);
    layer.fx[i].params = { ...layer.fx[i].params, [key]: value };
    render();
  },

  setField(i, patch, label, o = {}) {
    const layer = activeLayerOf();
    if (!layer?.fx[i]) return;
    if (!o.live) push(app.history, app.doc, label || 'aim');
    const entry = layer.fx[i];
    entry.field = { ...entry.field, ...patch };
    if (patch.type && patch.type !== 'paint') entry.field.params = { ...fieldDefaults(patch.type) };
    refresh();
    render();
  },

  removeFx(i) {
    const layer = activeLayerOf();
    if (!layer) return;
    push(app.history, app.doc, 'remove effect');
    layer.fx.splice(i, 1);
    if (app.activeFx >= layer.fx.length) app.activeFx = layer.fx.length - 1;
    dirty.add(fxMaskKey(layer.id, i));
    sentBuffers = new Map();
    refresh(); render();
  },

  moveFx(from, to) {
    const layer = activeLayerOf();
    if (!layer) return;
    push(app.history, app.doc, 'reorder effects');
    const [e] = layer.fx.splice(from, 1);
    layer.fx.splice(to, 0, e);
    app.activeFx = to;
    sentBuffers = new Map();
    refresh(); render();
  },

  captureSelection(i) {
    const layer = activeLayerOf();
    if (!layer?.fx[i]) return;
    if (!app.doc.selection || sel.isEmpty(app.doc.selection)) { status('no selection to capture'); return; }
    push(app.history, app.doc, 'limit effect to selection');
    layer.fx[i].mask = new Float32Array(app.doc.selection);
    layer.fx[i].field = { ...layer.fx[i].field, paintMul: true };
    if (layer.fx[i].field.type === 'all') layer.fx[i].field.type = 'paint';
    dirty.add(fxMaskKey(layer.id, i));
    refresh(); render();
    status('this effect now applies only inside that selection');
  },
});

const activeLayerOf = () => app.doc?.layers.find((l) => l.id === app.doc.active) || null;

function fieldDefaults(type) {
  const params = {};
  for (const [k, d] of Object.entries(FIELDS[type]?.params || {})) params[k] = d.def;
  return params;
}

// ───────────────────────────────────────────────────────────── the DOM ──

function refresh() {
  if (!app.doc) return;
  renderLayers($('layers'), app.doc, app);
  renderLayerProps($('layer-props'), app.doc, app);
  renderStack($('stack'), app.doc, app, app.activeFx);
  renderParams($('params'), app.doc, app, app.activeFx);
  buildOptions();
  updateZoomLabel();
}

function status(text) { $('stat').textContent = text; }

function updateZoomLabel() {
  $('zoom-label').textContent = `${Math.round(app.view.zoom * 100)}%`;
}

function buildTools() {
  const host = $('tools');
  host.innerHTML = '';
  for (const t of TOOLS) {
    if (t.sep) { host.appendChild(document.createElement('hr')); continue; }
    const b = document.createElement('button');
    b.className = `tool${t.id === app.tool ? ' on' : ''}`;
    b.textContent = t.icon;
    b.title = `${t.label}  (${t.key})`;
    b.dataset.tool = t.id;
    b.onclick = () => setTool(t.id);
    host.appendChild(b);
  }
}

function setTool(id) {
  app.tool = id;
  for (const b of $('tools').querySelectorAll('.tool')) b.classList.toggle('on', b.dataset.tool === id);
  buildOptions();
  paintOverlay();
}

function buildOptions() {
  const host = $('opts');
  host.innerHTML = '';
  const t = TOOLS.find((x) => x.id === app.tool);
  const name = document.createElement('span');
  name.className = 'name';
  name.textContent = t?.label || app.tool;
  host.appendChild(name);

  const wanted = TOOL_OPTIONS[app.tool] || [];
  const defs = {
    combine: { kind: 'seg', label: '', options: sel.COMBINE },
    tolerance: { kind: 'num', label: 'tolerance', min: 0.01, max: 0.8, step: 0.01 },
    contiguous: { kind: 'bool', label: 'contiguous' },
    sampleAll: { kind: 'bool', label: 'sample all layers' },
    size: { kind: 'num', label: 'size', min: 1, max: 400, step: 1 },
    soft: { kind: 'num', label: 'softness', min: 0, max: 1, step: 0.01 },
    flow: { kind: 'num', label: 'flow', min: 0.02, max: 1, step: 0.01 },
    color: { kind: 'color', label: 'colour' },
    maskTo: { kind: 'seg', label: 'paints', options: ['reveal', 'hide'] },
  };
  for (const key of wanted) {
    const d = defs[key];
    const wrap = document.createElement('label');
    if (d.kind === 'seg') {
      if (d.label) wrap.append(document.createTextNode(d.label));
      const seg = document.createElement('span');
      seg.className = 'seg';
      for (const o of d.options) {
        const b = document.createElement('button');
        b.textContent = o;
        b.className = app.opts[key] === o ? 'on' : '';
        b.onclick = () => app.setOption(key, o);
        seg.appendChild(b);
      }
      wrap.appendChild(seg);
    } else if (d.kind === 'bool') {
      const b = document.createElement('input');
      b.type = 'checkbox'; b.checked = !!app.opts[key];
      b.onchange = () => app.setOption(key, b.checked);
      wrap.append(b, document.createTextNode(d.label));
    } else if (d.kind === 'color') {
      const c = document.createElement('input');
      c.type = 'color'; c.value = app.opts[key];
      c.oninput = () => { app.opts[key] = c.value; };
      wrap.append(document.createTextNode(d.label), c);
    } else {
      const r = document.createElement('input');
      r.type = 'range'; r.min = d.min; r.max = d.max; r.step = d.step; r.value = app.opts[key];
      r.style.width = '90px';
      const out = document.createElement('span');
      out.style.cssText = 'font:10px var(--mono);color:var(--ink);min-width:2.4em';
      out.textContent = app.opts[key];
      r.oninput = () => { app.opts[key] = +r.value; out.textContent = r.value; paintOverlay(); };
      wrap.append(document.createTextNode(d.label), r, out);
    }
    host.appendChild(wrap);
  }
  if (app.tool === 'poly') {
    const tip = document.createElement('span');
    tip.style.color = 'var(--faint)';
    tip.textContent = 'click to add points · click the first point or press ⏎ to close · esc cancels';
    host.appendChild(tip);
  }
}

function buildPresetMenu() {
  const host = $('preset-menu');
  host.innerHTML = '';
  for (const p of PRESETS) {
    const b = document.createElement('button');
    b.textContent = p.name;
    b.onclick = () => applyPreset(p);
    const n = document.createElement('div');
    n.className = 'pnote';
    n.textContent = p.note;
    host.append(b, n);
  }
}

function applyPreset(preset) {
  const layer = activeLayerOf();
  if (!layer) return;
  push(app.history, app.doc, `preset: ${preset.name}`);
  layer.fx = preset.stack.map((e) => ({
    ...makeEffect(e.fx),
    ...e,
    params: { ...defaults(e.fx), ...(e.params || {}) },
    field: e.field ? { type: 'all', params: {}, invert: false, paintMul: false, ...e.field } : { type: 'all', params: {}, invert: false, paintMul: false },
  }));
  app.activeFx = 0;
  sentBuffers = new Map();
  closeMenus();
  refresh(); render();
  status(`preset “${preset.name}” — ${preset.stack.length} effects, all still editable`);
}

function buildHelp() {
  $('help-pop').innerHTML = `
    <h4>What this is</h4>
    <p>A layered editor where every manipulation on this surface is one entry in a
    stack. Nothing is destructive: the stack is applied on the way to the screen,
    so any parameter stays editable forever.</p>
    <h4>The idea worth knowing</h4>
    <p>Every effect is gated by a <b>mask</b> — a selection you drew, a brush stroke,
    or a field derived from the picture itself (brightness, edges, bands, noise).
    Outside that mask the source survives byte for byte. That is what makes
    “sort only the sky” or “warp only inside the lasso” a guarantee rather than a hope.</p>
    <h4>Keys</h4>
    <ul>
      <li><code>v m e l p w b x k i h z</code> — tools</li>
      <li><code>⌘Z</code> / <code>⇧⌘Z</code> — undo, redo</li>
      <li><code>⌘A</code> select all · <code>⌘D</code> deselect · <code>⇧⌘I</code> invert</li>
      <li><code>space</code>-drag or scroll to pan · <code>⌘</code>+scroll or <code>+</code>/<code>−</code> to zoom</li>
      <li><code>[</code> <code>]</code> brush size · <code>⌫</code> clear the selection's contents</li>
      <li><code>⌘V</code> paste a picture as a new layer</li>
    </ul>
    <h4>Where the effects come from</h4>
    <p><b>adjust</b> and <b>filter</b> are this page's own. <b>lens</b> is
    <a href="/lens">/lens</a> — conformal warps with the distortion measured.
    <b>glit</b> is <a href="/glitch">/glitch</a> — seeded, reproducible damage.
    <b>glass</b> is <a href="/glass">/glass</a> — the stained-glass projection of
    best fit. They are imported, not copied: fix one there and it changes here.</p>
    <h4>Honest limits</h4>
    <ul>
      <li>Pictures are scaled to 2400px on the long side by default, so a full
      composite stays interactive. The export is that size.</li>
      <li><i>copy image</i> loses the recipe chunk — the browser re-encodes it.
      <i>export PNG</i> keeps it.</li>
      <li>Nothing is uploaded unless you use <i>post to Bluesky</i>, and that
      re-encodes the picture to fit Bluesky's 1 MB blob limit — what posts is
      not byte-for-byte what <i>export PNG</i> writes. The dialog says what the
      fit cost before it sends anything.</li>
      <li>A clipping layer clips to the whole composite beneath it, not to the
      single layer below.</li>
      <li>The stained-glass cut fits a partition to the whole picture; expect
      seconds at full resolution.</li>
    </ul>`;
}

// ────────────────────────────────────────────────────────────── events ──

function wireVeil() {
  const drop = $('drop');
  $('drop-browse').onclick = () => $('file-input').click();
  $('drop-blank').onclick = () => startDoc(makeRGBA(1400, 1000), 1400, 1000, 'blank');
  $('drop-sample').onclick = () => { const t = io.testPattern(); startDoc(t.px, t.W, t.H, 'test pattern'); };
  $('file-input').onchange = (e) => { const f = e.target.files[0]; if (f) openFile(f, { asLayer: !!$('file-input').dataset.asLayer }); $('file-input').value = ''; delete $('file-input').dataset.asLayer; };
  $('project-input').onchange = (e) => { const f = e.target.files[0]; if (f) loadProjectFile(f); $('project-input').value = ''; };

  const over = (e) => { e.preventDefault(); drop.classList.add('dragging'); };
  const leave = () => drop.classList.remove('dragging');
  document.addEventListener('dragover', over);
  document.addEventListener('dragleave', leave);
  document.addEventListener('drop', (e) => {
    e.preventDefault(); leave();
    const f = e.dataTransfer?.files?.[0];
    if (f) openFile(f, { asLayer: !!app.doc && e.shiftKey });
  });
  document.addEventListener('paste', async (e) => {
    const item = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith('image/'));
    if (item) openFile(item.getAsFile(), { asLayer: !!app.doc });
  });
}

function veilError(msg) {
  const e = $('drop-err');
  e.hidden = false;
  e.textContent = msg;
}

function closeMenus() {
  for (const m of document.querySelectorAll('.menu')) m.classList.remove('open');
}

function wireMenus() {
  for (const btn of document.querySelectorAll('.mbtn')) {
    btn.onclick = (e) => {
      e.stopPropagation();
      const menu = btn.parentElement;
      const wasOpen = menu.classList.contains('open');
      closeMenus();
      if (!wasOpen) menu.classList.add('open');
    };
  }
  document.addEventListener('click', closeMenus);
  for (const b of document.querySelectorAll('[data-act]')) {
    b.onclick = (e) => { e.stopPropagation(); closeMenus(); act(b.dataset.act); };
  }
  $('add-fx').onclick = openPicker;
  $('compare').onpointerdown = () => showOriginal(true);
  $('compare').onpointerup = () => showOriginal(false);
  $('compare').onpointerleave = () => showOriginal(false);
  for (const b of document.querySelectorAll('[data-zoom]')) {
    b.onclick = () => {
      const k = b.dataset.zoom;
      if (k === 'fit') { zoomToFit(app.view); drawPicture(app.view); paintOverlay(); updateZoomLabel(); }
      else app.zoomBy(k === 'in' ? 1.25 : 1 / 1.25, app.view.cssW / 2, app.view.cssH / 2);
    };
  }
  window.addEventListener('resize', () => {
    if (!app.doc) return;
    fitCanvas(app.view, $('stage'));
    drawPicture(app.view);
    paintOverlay();
  });
}

function showOriginal(on) {
  if (!app.doc || !app.original) return;
  app.showOriginal = on;
  $('compare').classList.toggle('on', on);
  if (on) {
    setFrame(app.view, app.original.px, app.original.W, app.original.H);
    drawPicture(app.view);
    drawOverlay(app.view, {});
  } else if (app.lastComposite) {
    setFrame(app.view, app.lastComposite, app.doc.W, app.doc.H);
    drawPicture(app.view);
    paintOverlay();
  }
}

function wireStage() {
  const stage = $('stage');
  const at = (ev) => {
    const r = stage.getBoundingClientRect();
    const sx = ev.clientX - r.left, sy = ev.clientY - r.top;
    const d = toDoc(app.view, sx, sy);
    return { x: d.x, y: d.y, screen: { x: sx, y: sy } };
  };
  stage.addEventListener('pointerdown', (ev) => {
    if (!app.doc) return;
    stage.setPointerCapture(ev.pointerId);
    tools.down(at(ev), ev);
    paintOverlay();
  });
  stage.addEventListener('pointermove', (ev) => {
    if (!app.doc) return;
    const p = at(ev);
    app.cursor = p;
    if (tools.move(p, ev)) {
      if (tools.drag?.kind === 'pan') { drawPicture(app.view); }
      paintOverlay();
    } else if (['brush', 'eraser', 'mask'].includes(app.tool) || tools.drag) {
      paintOverlay();
    }
  });
  stage.addEventListener('pointerup', (ev) => {
    if (!app.doc) return;
    tools.up(at(ev));
    paintOverlay();
  });
  stage.addEventListener('pointerleave', () => { app.cursor = null; paintOverlay(); });
  stage.addEventListener('wheel', (ev) => {
    if (!app.doc) return;
    ev.preventDefault();
    const r = stage.getBoundingClientRect();
    if (ev.ctrlKey || ev.metaKey) {
      app.zoomBy(Math.exp(-ev.deltaY * 0.002), ev.clientX - r.left, ev.clientY - r.top);
    } else {
      app.view.panx -= ev.deltaX;
      app.view.pany -= ev.deltaY;
      drawPicture(app.view);
      paintOverlay();
    }
  }, { passive: false });
}

function wireKeys() {
  document.addEventListener('keydown', (ev) => {
    if (ev.target.matches('input, select, textarea')) return;
    const cmd = ev.metaKey || ev.ctrlKey;
    if (ev.key === ' ') { app.spaceDown = true; return; }
    if (tools.key(ev)) { paintOverlay(); ev.preventDefault(); return; }
    if (!app.doc) return;

    if (cmd && ev.key.toLowerCase() === 'z') {
      ev.preventDefault();
      const label = ev.shiftKey ? redo(app.history, app.doc) : undo(app.history, app.doc);
      if (label) { sentBuffers = new Map(); refresh(); render(); status(`${ev.shiftKey ? 'redid' : 'undid'} ${label}`); }
      else status(ev.shiftKey ? 'nothing to redo' : 'nothing to undo');
      return;
    }
    if (cmd && ev.key.toLowerCase() === 'a') { ev.preventDefault(); act('sel-all'); return; }
    if (cmd && ev.key.toLowerCase() === 'd') { ev.preventDefault(); act('sel-none'); return; }
    if (cmd && ev.shiftKey && ev.key.toLowerCase() === 'i') { ev.preventDefault(); act('sel-invert'); return; }
    if (cmd) return;

    if (ev.key === 'Backspace' || ev.key === 'Delete') { act('clear-sel'); return; }
    if (ev.key === '[') { app.setOption('size', Math.max(1, app.opts.size - 4)); return; }
    if (ev.key === ']') { app.setOption('size', Math.min(400, app.opts.size + 4)); return; }
    if (ev.key === '+' || ev.key === '=') { app.zoomBy(1.25, app.view.cssW / 2, app.view.cssH / 2); return; }
    if (ev.key === '-') { app.zoomBy(1 / 1.25, app.view.cssW / 2, app.view.cssH / 2); return; }

    const t = TOOLS.find((x) => x.key === ev.key.toLowerCase());
    if (t) setTool(t.id);
  });
  document.addEventListener('keyup', (ev) => { if (ev.key === ' ') app.spaceDown = false; });
}

// ───────────────────────────────────────────────────────────── actions ──

async function act(name) {
  const d = app.doc;
  if (!d && !['open', 'blank'].includes(name)) return;
  const layer = activeLayerOf();

  switch (name) {
    case 'open': $('file-input').click(); break;
    case 'place': $('file-input').dataset.asLayer = '1'; $('file-input').click(); break;
    case 'blank': startDoc(makeRGBA(1400, 1000), 1400, 1000, 'blank'); break;

    case 'export-png': {
      const blob = await io.toBlob(app.lastComposite, d.W, d.H);
      const withRecipe = await io.withPNGText(blob, io.RECIPE_KEY, JSON.stringify(serialize(d)));
      io.download(withRecipe, `${d.name.replace(/\.[a-z]+$/i, '')}-shop.png`);
      status('exported — the recipe is inside the file');
      break;
    }
    case 'post-bsky': publisher.open(); break;
    case 'copy':
      io.copyImage(app.lastComposite, d.W, d.H)
        .then(() => status('copied — note the clipboard drops the recipe chunk'))
        .catch((e) => status(`copy failed: ${e.message}`));
      break;
    case 'save-project': {
      const json = serialize(d, { encodePixels: null });
      // pixels are encoded separately so the await happens outside serialize
      for (let i = 0; i < d.layers.length; i++) {
        if (d.layers[i].pixels) json.layers[i].pixels = await io.encodeLayerPixels(d.layers[i].pixels, d.W, d.H);
      }
      io.download(new Blob([JSON.stringify(json)], { type: 'application/json' }), `${d.name}.shop.json`);
      break;
    }
    case 'load-project': $('project-input').click(); break;
    case 'copy-recipe': {
      const url = `${location.origin}${location.pathname}#r=${encodeRecipe(d)}`;
      navigator.clipboard.writeText(url)
        .then(() => status('recipe link copied — it carries the stack, not the picture'))
        .catch(() => status('could not reach the clipboard'));
      break;
    }

    case 'undo': case 'redo': {
      const label = name === 'undo' ? undo(app.history, d) : redo(app.history, d);
      if (label) { sentBuffers = new Map(); refresh(); render(); }
      status(label ? `${name} ${label}` : `nothing to ${name}`);
      break;
    }

    case 'sel-all': app.commitSelection(makeMask(d.W, d.H, 1)); break;
    case 'sel-none': app.commitSelection(makeMask(d.W, d.H, 0)); break;
    case 'sel-invert':
      if (d.selection) app.commitSelection(sel.invert(d.selection));
      else app.commitSelection(makeMask(d.W, d.H, 1));
      break;
    case 'sel-feather':
      if (!d.selection) return status('no selection');
      ask('feather the selection', { radius: { min: 0.5, max: 200, step: 0.5, def: 8, label: 'radius (px)' } },
        (v) => app.commitSelection(sel.feather(d.selection, d.W, d.H, v.radius)));
      break;
    case 'sel-grow': case 'sel-contract':
      if (!d.selection) return status('no selection');
      ask(name === 'sel-grow' ? 'grow the selection' : 'contract the selection',
        { px: { min: 1, max: 200, step: 1, def: 4, label: 'pixels' } },
        (v) => app.commitSelection(sel.grow(d.selection, d.W, d.H, name === 'sel-grow' ? v.px : -v.px)));
      break;
    case 'sel-luma':
      ask('select by brightness', {
        lo: { min: 0, max: 1, step: 0.01, def: 0.6, label: 'from' },
        hi: { min: 0, max: 1, step: 0.01, def: 1, label: 'to' },
        feather: { min: 0, max: 0.4, step: 0.01, def: 0.06, label: 'softness' },
      }, (v) => app.commitSelection(sel.luminanceRange(app.lastComposite, d.W, d.H, v)));
      break;
    case 'sel-alpha': {
      if (!layer?.pixels) return status('this layer has no pixels');
      const m = new Float32Array(d.W * d.H);
      for (let i = 0, q = 3; i < m.length; i++, q += 4) m[i] = layer.pixels[q] / 255;
      app.commitSelection(m);
      break;
    }
    case 'sel-mask':
      if (!layer?.mask) return status('this layer has no mask');
      app.commitSelection(new Float32Array(layer.mask));
      break;

    case 'fill-sel': {
      if (!layer?.pixels) return status('pick a raster layer');
      push(app.history, d, 'fill');
      const [r, g, b] = hexToRgbLocal(app.opts.color);
      const s = d.selection;
      const px = (layer.pixels = new Uint8ClampedArray(layer.pixels));
      for (let i = 0, q = 0; i < d.W * d.H; i++, q += 4) {
        const a = s ? s[i] : 1;
        if (a <= 0) continue;
        px[q] = px[q] + (r - px[q]) * a;
        px[q + 1] = px[q + 1] + (g - px[q + 1]) * a;
        px[q + 2] = px[q + 2] + (b - px[q + 2]) * a;
        px[q + 3] = px[q + 3] + (255 - px[q + 3]) * a;
      }
      app.markDirty(layer.id, 'pixels');
      refresh(); render();
      break;
    }
    case 'clear-sel': {
      if (!layer?.pixels) return status('pick a raster layer');
      push(app.history, d, 'clear');
      const s = d.selection;
      const px = (layer.pixels = new Uint8ClampedArray(layer.pixels));
      for (let i = 0, q = 3; i < d.W * d.H; i++, q += 4) px[q] = px[q] * (1 - (s ? s[i] : 1));
      app.markDirty(layer.id, 'pixels');
      refresh(); render();
      break;
    }
    case 'crop-sel': {
      if (!d.selection) return status('no selection to crop to');
      const b = sel.bounds(d.selection, d.W, d.H);
      if (!b) return status('the selection is empty');
      cropTo(b.x0, b.y0, b.w, b.h);
      break;
    }
    case 'doc-size':
      ask('document size', {
        w: { min: 16, max: 6000, step: 1, def: d.W, label: 'width' },
        h: { min: 16, max: 6000, step: 1, def: d.H, label: 'height' },
      }, (v) => resizeDoc(Math.round(v.w), Math.round(v.h)));
      break;

    case 'layer-new':
      push(app.history, d, 'new layer');
      addLayer(d, makeLayer({ kind: 'raster', name: 'layer', W: d.W, H: d.H }));
      refresh(); render();
      break;
    case 'layer-adjust':
      push(app.history, d, 'new adjustment layer');
      addLayer(d, makeLayer({ kind: 'adjust', name: 'adjustment' }));
      app.activeFx = -1;
      refresh(); render();
      openPicker();
      break;
    case 'layer-dup':
      push(app.history, d, 'duplicate layer');
      duplicateLayer(d, d.active);
      sentBuffers = new Map();
      refresh(); render();
      break;
    case 'layer-del':
      if (d.layers.length <= 1) return status('a document needs one layer');
      push(app.history, d, 'delete layer');
      removeLayer(d, d.active);
      sentBuffers = new Map();
      refresh(); render();
      break;
    case 'layer-up': case 'layer-down':
      push(app.history, d, 'reorder layers');
      moveLayer(d, d.active, name === 'layer-up' ? 1 : -1);
      refresh(); render();
      break;
    case 'mask-add':
      if (!layer) return;
      push(app.history, d, 'add mask');
      layer.mask = makeMask(d.W, d.H, 1);
      layer.maskOn = true;
      app.markDirty(layer.id, 'mask');
      refresh(); render();
      status('mask added, fully revealing — paint it with the ◐ tool');
      break;
    case 'mask-from-sel':
      if (!layer || !d.selection) return status('needs a layer and a selection');
      push(app.history, d, 'mask from selection');
      layer.mask = new Float32Array(d.selection);
      layer.maskOn = true;
      app.markDirty(layer.id, 'mask');
      refresh(); render();
      break;
    case 'mask-del':
      if (!layer?.mask) return;
      push(app.history, d, 'delete mask');
      layer.mask = null;
      sentBuffers = new Map();
      refresh(); render();
      break;
    case 'layer-clip':
      if (!layer) return;
      app.setLayer(layer.id, { clip: !layer.clip }, 'clipping');
      break;
    case 'layer-flatten':
      if (!layer) return;
      push(app.history, d, 'flatten stack');
      flattenLayer(d, layer.id);
      app.activeFx = -1;
      sentBuffers = new Map();
      refresh(); render();
      break;
    case 'layer-merge':
      push(app.history, d, 'merge down');
      if (!mergeDown(d, d.active)) status('nothing below to merge into');
      sentBuffers = new Map();
      refresh(); render();
      break;
    default: break;
  }
}

const hexToRgbLocal = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

function cropTo(x0, y0, w, h) {
  const d = app.doc;
  push(app.history, d, 'crop');
  for (const l of d.layers) {
    if (l.pixels) l.pixels = cropBuffer(l.pixels, d.W, d.H, x0, y0, w, h, 4);
    if (l.mask) l.mask = cropBuffer(l.mask, d.W, d.H, x0, y0, w, h, 1);
    for (const e of l.fx) if (e.mask) e.mask = cropBuffer(e.mask, d.W, d.H, x0, y0, w, h, 1);
  }
  if (d.selection) d.selection = cropBuffer(d.selection, d.W, d.H, x0, y0, w, h, 1);
  d.W = w; d.H = h;
  sentBuffers = new Map();
  fitCanvas(app.view, $('stage'));
  setDocSize(app.view, app.doc.W, app.doc.H);
  zoomToFit(app.view);
  refresh(); render();
}

function cropBuffer(buf, W, H, x0, y0, w, h, stride) {
  const out = stride === 4 ? new Uint8ClampedArray(w * h * 4) : new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const sy = y + y0;
    if (sy < 0 || sy >= H) continue;
    for (let x = 0; x < w; x++) {
      const sx = x + x0;
      if (sx < 0 || sx >= W) continue;
      if (stride === 4) {
        const s = (sy * W + sx) * 4, dq = (y * w + x) * 4;
        out[dq] = buf[s]; out[dq + 1] = buf[s + 1]; out[dq + 2] = buf[s + 2]; out[dq + 3] = buf[s + 3];
      } else out[y * w + x] = buf[sy * W + sx];
    }
  }
  return out;
}

function resizeDoc(w, h) {
  // The canvas changes size; the pictures on it do not move. Growing adds
  // transparency, shrinking crops — the same operation as a crop with a
  // negative origin, which is why it shares the code.
  cropTo(0, 0, w, h);
}

async function loadProjectFile(file) {
  try {
    const json = JSON.parse(await file.text());
    const { doc, pending } = deserialize(json);
    app.doc = doc;
    app.history = createHistory();
    app.activeFx = -1;
    sentBuffers = new Map();
    worker?.postMessage({ type: 'forget' });
    for (const p of pending) {
      const layer = doc.layers.find((l) => l.id === p.id);
      if (!layer) continue;
      const img = await io.decodeLayerPixels(p.payload);
      layer.pixels = img.W === doc.W && img.H === doc.H ? img.px : io.place(img.px, img.W, img.H, doc.W, doc.H);
    }
    app.original = { px: new Uint8ClampedArray(doc.layers[0]?.pixels || makeRGBA(doc.W, doc.H)), W: doc.W, H: doc.H };
    $('drop').hidden = true;
    $('app').hidden = false;
    fitCanvas(app.view, $('stage'));
    setDocSize(app.view, doc.W, doc.H);
    zoomToFit(app.view);
    refresh(); render();
    status(`opened ${doc.name}`);
  } catch (err) {
    status(`could not open that project — ${err.message}`);
  }
}

// ────────────────────────────────────────────────────── picker + ask ──

function openPicker() {
  if (!app.doc) return;
  const box = $('picker');
  const search = $('picker-search');
  box.hidden = false;
  search.value = '';
  search.focus();
  let first = renderPicker($('picker-list'), '', addEffect);
  search.oninput = () => { first = renderPicker($('picker-list'), search.value, addEffect); };
  search.onkeydown = (ev) => {
    if (ev.key === 'Escape') closePicker();
    if (ev.key === 'Enter' && first) first.click();
  };
  box.onclick = (ev) => { if (ev.target === box) closePicker(); };
}

function closePicker() { $('picker').hidden = true; }

function addEffect(id) {
  const layer = activeLayerOf();
  if (!layer) return;
  push(app.history, app.doc, `add ${EFFECTS[id].label}`);
  const entry = makeEffect(id);
  const hasSelection = app.doc.selection && !sel.isEmpty(app.doc.selection);
  if (hasSelection) {
    // An effect added while something is selected inherits that selection. It
    // is the overwhelmingly common intent, it is reversible (the parameters
    // panel can release it), and the status line says it happened.
    entry.mask = new Float32Array(app.doc.selection);
    entry.field = { type: 'paint', params: {}, invert: false, paintMul: false };
  }
  layer.fx.push(entry);
  app.activeFx = layer.fx.length - 1;
  closePicker();
  refresh(); render();
  status(hasSelection
    ? `${EFFECTS[id].label} added — limited to the selection`
    : `${EFFECTS[id].label} added`);
}

/** A tiny modal built from the same schema machinery as the effect panels. */
function ask(title, schema, done) {
  const box = $('ask');
  const body = $('ask-body');
  const values = {};
  body.innerHTML = '';
  for (const [k, spec] of Object.entries(schema)) {
    values[k] = spec.def;
    body.appendChild(control(k, spec, spec.def, (key, v) => { values[key] = v; }));
  }
  box.hidden = false;
  const close = () => { box.hidden = true; };
  $('ask-title').textContent = title;
  $('ask-cancel').onclick = close;
  $('ask-ok').onclick = () => { close(); done(values); };
  box.onclick = (ev) => { if (ev.target === box) close(); };
}

boot();
