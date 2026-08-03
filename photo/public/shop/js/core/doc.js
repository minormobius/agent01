// doc.js — the document: layers, their non-destructive effect stacks, and the
// composite that turns the two into one picture. DOM-free; the app drives it,
// the worker renders it, `photo/shop.selftest.mjs` proves it.
//
// THE MODEL IN ONE PARAGRAPH
// -------------------------
// A document is a stack of layers over a fixed W×H. A **raster** layer carries
// pixels; an **adjustment** layer carries none and instead re-processes
// everything composited beneath it. Every layer carries an ordered list of
// effects — its stack — which is applied on the way to the canvas and never to
// the stored pixels, so any parameter stays editable forever. Every layer also
// carries a mask, and every effect carries its own mask and field, so "where"
// is answerable at three scales: the whole layer, one effect, one brush stroke.
//
// WHY LAYER PIXELS ARE ALWAYS DOCUMENT-SIZED
// ------------------------------------------
// Photoshop stores a layer at its own size with an offset, which saves memory
// and costs a coordinate conversion at every single site that touches pixels —
// masks, selections, brushes, effect fields, the wand. Here a layer buffer is
// always W*H*4, and moving a layer is a *transform*, applied at composite time
// by resampling. One coordinate system, no conversions, and the identity
// transform short-circuits to a copy so an unmoved layer is never resampled.
//
// WHY NOTHING RENDERS AT A PROXY RESOLUTION
// -----------------------------------------
// The tempting optimisation is to preview at half size. But a blur radius, a
// grain size and a halftone cell are all measured in pixels, so a half-size
// preview is a *different picture*, and every one of those effects would have
// to lie about its parameters to look right. Instead the imported picture is
// capped (see `MAX_SIDE`) and the whole composite runs at document resolution
// in a worker: what you see is what leaves.

import {
  alphaOf, blendMasked, cloneMask, cloneRGBA, compositeAdjust, compositeOver,
  drawTransformed, IDENTITY_TRANSFORM, isIdentityTransform, makeMask, makeRGBA, resize,
} from './pixels.js';
import { defaults, EFFECTS } from './registry.js';
import { decodeMask, encodeMask } from './select.js';
import { makeField, seedOf, hash32 } from '../../../glitch/js/glitch.js';

export const DOC_VERSION = 1;

/** The longest side an imported picture is scaled to by default. Above this a
 *  full composite stops being interactive; the app offers to raise it. */
export const MAX_SIDE = 2400;

let nextId = 1;
const uid = (prefix) => `${prefix}${(nextId++).toString(36)}${Math.floor(Date.now() % 46656).toString(36)}`;

// ──────────────────────────────────────────────────────────── documents ──

export function createDoc(W, H, { name = 'untitled' } = {}) {
  return {
    v: DOC_VERSION,
    name, W, H,
    layers: [],
    active: null,
    selection: null,
    seed: 'shop',
    background: null, // hex, or null for the transparency checker
  };
}

export function makeLayer({
  kind = 'raster', name = 'layer', W = 0, H = 0, pixels = null,
} = {}) {
  return {
    id: uid('L'),
    kind,
    name,
    on: true,
    opacity: 1,
    blend: 'normal',
    clip: false,
    locked: false,
    pixels: kind === 'raster' ? (pixels || makeRGBA(W, H)) : null,
    mask: null,
    maskOn: true,
    maskInvert: false,
    transform: { ...IDENTITY_TRANSFORM },
    fx: [],
  };
}

export const activeLayer = (doc) => doc.layers.find((l) => l.id === doc.active) || null;
export const layerIndex = (doc, id) => doc.layers.findIndex((l) => l.id === id);

export function addLayer(doc, layer, { above = doc.active } = {}) {
  const at = above ? layerIndex(doc, above) + 1 : doc.layers.length;
  doc.layers.splice(at, 0, layer);
  doc.active = layer.id;
  return layer;
}

export function removeLayer(doc, id) {
  const i = layerIndex(doc, id);
  if (i < 0) return null;
  const [gone] = doc.layers.splice(i, 1);
  doc.active = doc.layers[Math.min(i, doc.layers.length - 1)]?.id || null;
  return gone;
}

export function moveLayer(doc, id, delta) {
  const i = layerIndex(doc, id);
  const j = Math.max(0, Math.min(doc.layers.length - 1, i + delta));
  if (i < 0 || i === j) return false;
  const [l] = doc.layers.splice(i, 1);
  doc.layers.splice(j, 0, l);
  return true;
}

export function duplicateLayer(doc, id) {
  const src = doc.layers[layerIndex(doc, id)];
  if (!src) return null;
  const copy = {
    ...src,
    id: uid('L'),
    name: `${src.name} copy`,
    pixels: src.pixels ? cloneRGBA(src.pixels) : null,
    mask: cloneMask(src.mask),
    transform: { ...src.transform },
    fx: src.fx.map((e) => ({ ...e, params: { ...e.params }, field: cloneField(e.field), mask: cloneMask(e.mask) })),
  };
  doc.layers.splice(layerIndex(doc, id) + 1, 0, copy);
  doc.active = copy.id;
  return copy;
}

const cloneField = (f) => ({ type: f?.type || 'all', params: { ...(f?.params || {}) }, invert: !!f?.invert, paintMul: !!f?.paintMul });

// ─────────────────────────────────────────────────────────── the stack ──

/**
 * A stack entry's seed: derived from the document seed AND the entry's
 * position, so two copies of one glitch operator don't fire in lockstep, and a
 * per-entry nudge rerolls one without disturbing the others. Same construction
 * as /glitch, on purpose — a recipe carried across from there behaves the same.
 */
export const seedFor = (base, index, own = 0) => (base ^ hash32(base, index + 1, own | 0)) >>> 0;

/**
 * The gate for one effect: its field, multiplied by its own painted/selected
 * mask when `paintMul` is set, inverted if asked. This is where a lasso becomes
 * a constraint on a Droste warp — `makeField` is /glitch's, and it treats the
 * painted layer as just another field source.
 */
export function fieldFor(entry, px, W, H, seed) {
  return makeField(entry.field || { type: 'all' }, px, W, H, seed, entry.mask || null);
}

/**
 * Run an effect stack over `px` in place. Returns a log of what ran.
 *
 * Effects marked `async` are skipped and reported — the browser app runs those
 * itself (the JPEG databender needs a real encoder), exactly as /glitch does,
 * so this function stays pure and node-testable.
 */
export function runStack(px, W, H, stack, { seed = 'shop', onStep = null, scratch = null } = {}) {
  const N = W * H;
  const buf = scratch || makeRGBA(W, H);
  const base = seedOf(seed);
  const log = [];
  (stack || []).forEach((entry, index) => {
    const spec = EFFECTS[entry.fx];
    if (!spec) { log.push({ fx: entry.fx, skipped: 'unknown' }); return; }
    if (entry.on === false) { log.push({ fx: entry.fx, skipped: 'off' }); return; }
    if (spec.async) { log.push({ fx: entry.fx, skipped: 'async' }); return; }
    const amount = entry.amount ?? 1;
    if (amount <= 0) { log.push({ fx: entry.fx, skipped: 'amount 0' }); return; }
    const s = seedFor(base, index, entry.seed);
    const mask = fieldFor(entry, px, W, H, s);
    const P = { ...defaults(entry.fx), ...(entry.params || {}) };
    buf.set(px);
    spec.apply(px, buf, W, H, P, { seed: s, mask, index });
    blendMasked(px, buf, mask, amount, N);
    log.push({ fx: entry.fx, index });
    if (onStep) onStep(index, entry.fx);
  });
  return log;
}

// ───────────────────────────────────────────────────────── compositing ──

/** A layer's mask as the compositor wants it, or null if it has none. */
export function layerMask(layer, N) {
  if (!layer.mask || !layer.maskOn) return null;
  if (!layer.maskInvert) return layer.mask;
  const m = new Float32Array(N);
  for (let i = 0; i < N; i++) m[i] = 1 - layer.mask[i];
  return m;
}

/**
 * The whole picture. Bottom to top, each layer processed by its own stack and
 * composited through its mask, opacity and blend mode.
 *
 * A **clipped** layer is confined to the alpha of what is already beneath it.
 * The honest caveat: in a full compositor that means the single layer below,
 * whereas here it means the accumulated composite below. For the ordinary use —
 * clip a texture to the cut-out under it — they agree; for a clip over a stack
 * of partially transparent layers they do not, and the UI says so.
 */
export function composite(doc, { onLayer = null, upTo = null } = {}) {
  const { W, H } = doc;
  const N = W * H;
  const base = makeRGBA(W, H);
  if (doc.background) {
    const [r, g, b] = hexToRgbLocal(doc.background);
    for (let q = 0; q < N * 4; q += 4) { base[q] = r; base[q + 1] = g; base[q + 2] = b; base[q + 3] = 255; }
  }
  const scratch = makeRGBA(W, H);
  const work = makeRGBA(W, H);

  for (const layer of doc.layers) {
    if (upTo && layer.id === upTo) break;
    if (!layer.on || layer.opacity <= 0) continue;

    if (layer.kind === 'adjust') {
      // An adjustment layer re-processes the composite beneath it. Its coverage
      // is whatever was already there — an adjustment cannot create any — which
      // is why this is `compositeAdjust` and not `compositeOver`; see the note
      // on that function for the bug the distinction prevents.
      work.set(base);
      runStack(work, W, H, layer.fx, { seed: doc.seed, scratch });
      compositeAdjust(base, work, W, H, {
        mode: layer.blend, opacity: layer.opacity,
        mask: combineMasks(layerMask(layer, N), layer.clip ? alphaOf(base, N) : null, N),
      });
    } else {
      drawTransformed(work, layer.pixels, W, H, W, H, layer.transform);
      runStack(work, W, H, layer.fx, { seed: doc.seed, scratch });
      compositeOver(base, work, W, H, {
        mode: layer.blend, opacity: layer.opacity,
        mask: combineMasks(maskThroughTransform(layer, W, H, N), layer.clip ? alphaOf(base, N) : null, N),
        seed: seedOf(doc.seed),
      });
    }
    if (onLayer) onLayer(layer);
  }
  return base;
}

/** A layer mask travels with its layer — move the layer, the mask moves. */
function maskThroughTransform(layer, W, H, N) {
  const m = layerMask(layer, N);
  if (!m || isIdentityTransform(layer.transform)) return m;
  const asRGBA = makeRGBA(W, H);
  for (let i = 0, q = 0; i < N; i++, q += 4) { asRGBA[q] = m[i] * 255; asRGBA[q + 3] = 255; }
  const moved = makeRGBA(W, H);
  drawTransformed(moved, asRGBA, W, H, W, H, layer.transform);
  const out = new Float32Array(N);
  for (let i = 0, q = 0; i < N; i++, q += 4) out[i] = (moved[q] / 255) * (moved[q + 3] / 255);
  return out;
}

function combineMasks(a, b, N) {
  if (!a) return b;
  if (!b) return a;
  const out = new Float32Array(N);
  for (let i = 0; i < N; i++) out[i] = a[i] * b[i];
  return out;
}

const hexToRgbLocal = (hex) => {
  const n = parseInt(String(hex).replace('#', ''), 16) || 0;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
};

/** Flatten a layer's stack into its pixels — the one destructive operation,
 *  offered because sometimes you really do want to stop being able to edit. */
export function flattenLayer(doc, id) {
  const layer = doc.layers[layerIndex(doc, id)];
  if (!layer || layer.kind !== 'raster') return null;
  const { W, H } = doc;
  const px = makeRGBA(W, H);
  drawTransformed(px, layer.pixels, W, H, W, H, layer.transform);
  runStack(px, W, H, layer.fx, { seed: doc.seed });
  layer.pixels = px;
  layer.fx = [];
  layer.transform = { ...IDENTITY_TRANSFORM };
  return layer;
}

/** Merge a layer into the one beneath it, respecting both stacks. */
export function mergeDown(doc, id) {
  const i = layerIndex(doc, id);
  if (i <= 0) return null;
  const { W, H } = doc;
  const N = W * H;
  const upper = doc.layers[i], lower = doc.layers[i - 1];
  if (lower.kind !== 'raster') return null;
  const base = makeRGBA(W, H);
  drawTransformed(base, lower.pixels, W, H, W, H, lower.transform);
  runStack(base, W, H, lower.fx, { seed: doc.seed });
  const lm = layerMask(lower, N);
  if (lm) for (let k = 0, q = 3; k < N; k++, q += 4) base[q] *= lm[k];

  const top = makeRGBA(W, H);
  drawTransformed(top, upper.pixels || makeRGBA(W, H), W, H, W, H, upper.transform);
  runStack(top, W, H, upper.fx, { seed: doc.seed });
  compositeOver(base, top, W, H, {
    mode: upper.blend, opacity: upper.opacity, mask: maskThroughTransform(upper, W, H, N),
    seed: seedOf(doc.seed),
  });

  lower.pixels = base;
  lower.fx = [];
  lower.mask = null;
  lower.opacity = 1;
  lower.blend = 'normal';
  lower.transform = { ...IDENTITY_TRANSFORM };
  doc.layers.splice(i, 1);
  doc.active = lower.id;
  return lower;
}

// ─────────────────────────────────────────────────────── thumbnails ──

export function thumbnail(px, W, H, maxSide = 64) {
  const k = Math.max(W, H) / maxSide;
  const w = Math.max(1, Math.round(W / k)), h = Math.max(1, Math.round(H / k));
  return { px: resize(px, W, H, w, h), W: w, H: h };
}

// ──────────────────────────────────────────────────── serialisation ──
//
// Two shapes, because they answer different questions:
//
//   recipe   — structure, effects, masks. No pixels. Small enough for a URL,
//              and the answer to "how was this made".
//   project  — a recipe plus the pixels, encoded by a callback the caller
//              supplies (the app hands it a PNG data-URL encoder). The answer
//              to "let me carry on tomorrow".
//
// Masks are run-length encoded (see select.js): a selection is mostly flat, so
// the encoding is a few hundred bytes rather than a megabyte of floats.

export function serialize(doc, { encodePixels = null } = {}) {
  return {
    v: DOC_VERSION,
    name: doc.name,
    W: doc.W,
    H: doc.H,
    seed: doc.seed,
    background: doc.background,
    active: doc.active,
    selection: doc.selection ? encodeMask(doc.selection, doc.W, doc.H) : null,
    layers: doc.layers.map((l) => ({
      id: l.id,
      kind: l.kind,
      name: l.name,
      on: l.on,
      opacity: l.opacity,
      blend: l.blend,
      clip: l.clip,
      locked: l.locked,
      maskOn: l.maskOn,
      maskInvert: l.maskInvert,
      transform: { ...l.transform },
      mask: l.mask ? encodeMask(l.mask, doc.W, doc.H) : null,
      pixels: encodePixels && l.pixels ? encodePixels(l.pixels, doc.W, doc.H) : null,
      fx: l.fx.map((e) => ({
        fx: e.fx,
        on: e.on !== false,
        amount: e.amount ?? 1,
        seed: e.seed | 0,
        field: cloneField(e.field),
        mask: e.mask ? encodeMask(e.mask, doc.W, doc.H) : null,
        params: { ...defaults(e.fx), ...(e.params || {}) },
      })),
    })),
  };
}

/**
 * Rebuild a document. `decodePixels` is async in the browser (image decoding
 * is), so this returns the document with raster layers left empty and a list of
 * the pixel payloads for the caller to fill in — keeping the core synchronous
 * and free of any assumption about how a picture is stored.
 */
export function deserialize(json) {
  const doc = createDoc(json.W, json.H, { name: json.name || 'untitled' });
  doc.seed = json.seed ?? 'shop';
  doc.background = json.background ?? null;
  doc.selection = json.selection ? decodeMask(json.selection) : null;
  const pending = [];
  doc.layers = (json.layers || []).map((l) => {
    const layer = makeLayer({ kind: l.kind === 'adjust' ? 'adjust' : 'raster', name: l.name, W: json.W, H: json.H });
    layer.id = l.id || layer.id;
    layer.on = l.on !== false;
    layer.opacity = l.opacity ?? 1;
    layer.blend = l.blend || 'normal';
    layer.clip = !!l.clip;
    layer.locked = !!l.locked;
    layer.maskOn = l.maskOn !== false;
    layer.maskInvert = !!l.maskInvert;
    layer.transform = { ...IDENTITY_TRANSFORM, ...(l.transform || {}) };
    layer.mask = l.mask ? decodeMask(l.mask) : null;
    layer.fx = (l.fx || []).filter((e) => EFFECTS[e.fx]).map((e) => ({
      fx: e.fx,
      on: e.on !== false,
      amount: e.amount ?? 1,
      seed: e.seed | 0,
      field: cloneField(e.field),
      mask: e.mask ? decodeMask(e.mask) : null,
      params: { ...defaults(e.fx), ...(e.params || {}) },
    }));
    if (l.pixels) pending.push({ id: layer.id, payload: l.pixels });
    return layer;
  });
  doc.active = json.active && doc.layers.some((l) => l.id === json.active)
    ? json.active
    : doc.layers[doc.layers.length - 1]?.id || null;
  return { doc, pending };
}

const b64enc = (s) => (typeof btoa === 'function' ? btoa(s) : Buffer.from(s, 'binary').toString('base64'))
  .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64dec = (s) => {
  const t = s.replace(/-/g, '+').replace(/_/g, '/');
  return typeof atob === 'function' ? atob(t) : Buffer.from(t, 'base64').toString('binary');
};

/** The recipe as a URL-safe string — `?r=…`, and the tEXt chunk in a saved PNG. */
export function encodeRecipe(doc) {
  const json = JSON.stringify(serialize(doc));
  let bin = '';
  for (const ch of unescape(encodeURIComponent(json))) bin += ch;
  return b64enc(bin);
}

export function decodeRecipe(str) {
  return JSON.parse(decodeURIComponent(escape(b64dec(str))));
}

export { makeMask, makeRGBA };
