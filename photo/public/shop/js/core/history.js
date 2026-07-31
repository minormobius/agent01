// history.js — undo/redo.
//
// THE ONE DECISION THAT MAKES THIS CHEAP
// --------------------------------------
// A snapshot deep-copies the document's *structure* (layer order, opacities,
// effect stacks, parameters, transforms) but holds its **pixel and mask buffers
// by reference**. Structure is kilobytes; a single layer's pixels are tens of
// megabytes, and a stack of forty snapshots that each copied them would be a
// gigabyte of RAM to undo a slider drag.
//
// That works only under a rule the whole app has to keep:
//
//   **Never mutate a pixel or mask buffer that history might be holding.**
//   Replace it. Before the first dab of a brush stroke, the tool calls
//   `beginPixelEdit(layer)`, which swaps in a fresh copy; the stroke then
//   mutates that copy freely for as long as the mouse is down.
//
// One clone per stroke, none per dab, and an undo stack that costs almost
// nothing for the ninety per cent of edits — parameters, layer order, masks
// swapped wholesale — that never touch a pixel at all.

import { cloneMask, cloneRGBA } from './pixels.js';

export const DEFAULT_LIMIT = 60;

export function createHistory(limit = DEFAULT_LIMIT) {
  return { past: [], future: [], limit, label: null };
}

/** Structure deep, buffers by reference. */
export function snapshot(doc) {
  return {
    name: doc.name,
    W: doc.W,
    H: doc.H,
    seed: doc.seed,
    background: doc.background,
    active: doc.active,
    selection: doc.selection,
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
      pixels: l.pixels,
      mask: l.mask,
      fx: l.fx.map((e) => ({
        fx: e.fx,
        on: e.on,
        amount: e.amount,
        seed: e.seed,
        field: { type: e.field?.type || 'all', params: { ...(e.field?.params || {}) }, invert: !!e.field?.invert, paintMul: !!e.field?.paintMul },
        mask: e.mask,
        params: { ...e.params },
      })),
    })),
  };
}

/** Put a snapshot back, in place, so every reference to `doc` stays valid. */
export function restore(doc, snap) {
  doc.name = snap.name;
  doc.W = snap.W;
  doc.H = snap.H;
  doc.seed = snap.seed;
  doc.background = snap.background;
  doc.active = snap.active;
  doc.selection = snap.selection;
  doc.layers = snap.layers.map((l) => ({
    ...l,
    transform: { ...l.transform },
    fx: l.fx.map((e) => ({ ...e, field: { ...e.field, params: { ...e.field.params } }, params: { ...e.params } })),
  }));
  return doc;
}

/**
 * Record the state *before* an edit. Call it first, then make the change —
 * so undo returns to the last thing the user saw, not to the thing they just
 * asked for.
 */
export function push(hist, doc, label = 'edit') {
  hist.past.push({ snap: snapshot(doc), label });
  if (hist.past.length > hist.limit) hist.past.shift();
  hist.future.length = 0;
  return hist;
}

/**
 * Coalesce a run of the same continuous edit — dragging one slider should be
 * one undo step, not two hundred. `key` identifies the gesture; a new key (or
 * `null`) starts a new step.
 */
export function pushCoalesced(hist, doc, label, key) {
  const top = hist.past[hist.past.length - 1];
  if (key && top && top.key === key) return hist;
  hist.past.push({ snap: snapshot(doc), label, key });
  if (hist.past.length > hist.limit) hist.past.shift();
  hist.future.length = 0;
  return hist;
}

export function undo(hist, doc) {
  const entry = hist.past.pop();
  if (!entry) return null;
  hist.future.push({ snap: snapshot(doc), label: entry.label });
  restore(doc, entry.snap);
  return entry.label;
}

export function redo(hist, doc) {
  const entry = hist.future.pop();
  if (!entry) return null;
  hist.past.push({ snap: snapshot(doc), label: entry.label });
  restore(doc, entry.snap);
  return entry.label;
}

export const canUndo = (hist) => hist.past.length > 0;
export const canRedo = (hist) => hist.future.length > 0;

/**
 * Detach a layer's pixels from every snapshot that references them, so the
 * caller may mutate freely. Call once at the start of a stroke — not per dab.
 */
export function beginPixelEdit(layer) {
  if (layer.pixels) layer.pixels = cloneRGBA(layer.pixels);
  return layer.pixels;
}

/** The same, for a layer mask being painted. */
export function beginMaskEdit(layer) {
  if (layer.mask) layer.mask = cloneMask(layer.mask);
  return layer.mask;
}
