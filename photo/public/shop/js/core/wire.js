// wire.js — how a document crosses the boundary to the render worker.
//
// THE PROBLEM THIS SOLVES
// -----------------------
// A 2400×1600 layer is 15 MB. Structured-cloning the whole document on every
// slider drag would copy tens of megabytes sixty times a second; transferring
// the buffers instead would move them out of the main thread, where the brush
// still needs them. Either way the render loop dies.
//
// So the worker keeps a **mirror**: a map of buffer id → buffer. Each message
// carries the document's structure (kilobytes — layer order, stacks,
// parameters) and *only the buffers the main thread says have changed*. Drag a
// slider and nothing but the structure crosses. Paint a stroke and one layer's
// pixels cross, once, when the stroke ends.
//
// The mirror is safe only because of the copy-on-write rule in history.js:
// buffers are replaced rather than mutated, so identity is a reliable signal —
// and where a tool does mutate in place (a stroke, mid-drag), it marks the
// buffer dirty explicitly.

/** Stable ids for the three kinds of buffer a document holds. */
export const pixelsKey = (layerId) => `${layerId}:px`;
export const maskKey = (layerId) => `${layerId}:mask`;
export const fxMaskKey = (layerId, i) => `${layerId}:fx${i}:mask`;
export const SELECTION_KEY = 'doc:selection';

/**
 * Build a render message. `known` is the set of buffer ids the worker already
 * holds with the same contents; `dirty` forces a resend for ids the caller
 * knows it has mutated in place.
 *
 * Returns `{ msg, sent }` — `sent` is the ids now in the worker's mirror, for
 * the caller to fold into `known`.
 */
export function toWire(doc, known = new Map(), dirty = new Set()) {
  const buffers = {};
  const sent = new Map(known);

  const put = (key, buf) => {
    if (!buf) { sent.delete(key); return null; }
    if (sent.get(key) !== buf || dirty.has(key)) {
      buffers[key] = buf;
      sent.set(key, buf);
    }
    return key;
  };

  const layers = doc.layers.map((l) => ({
    id: l.id,
    kind: l.kind,
    on: l.on,
    opacity: l.opacity,
    blend: l.blend,
    clip: l.clip,
    maskOn: l.maskOn,
    maskInvert: l.maskInvert,
    transform: { ...l.transform },
    pixels: l.pixels ? put(pixelsKey(l.id), l.pixels) : null,
    mask: l.mask ? put(maskKey(l.id), l.mask) : null,
    fx: l.fx.map((e, i) => ({
      fx: e.fx,
      on: e.on !== false,
      amount: e.amount ?? 1,
      seed: e.seed | 0,
      field: { type: e.field?.type || 'all', params: { ...(e.field?.params || {}) }, invert: !!e.field?.invert, paintMul: !!e.field?.paintMul },
      mask: e.mask ? put(fxMaskKey(l.id, i), e.mask) : null,
      params: { ...(e.params || {}) },
    })),
  }));

  return {
    msg: {
      W: doc.W, H: doc.H, seed: doc.seed, background: doc.background,
      layers, buffers,
    },
    sent,
  };
}

/**
 * Rebuild a renderable document from a wire message plus the worker's mirror.
 * Buffers arriving in the message replace what the mirror held; ids that are
 * absent are looked up, and a miss is fatal rather than silent — a composite
 * drawn from a stale mirror is the worst kind of bug, because it looks fine.
 */
export function fromWire(msg, store) {
  for (const [key, buf] of Object.entries(msg.buffers || {})) store.set(key, buf);

  const need = (key) => {
    const b = store.get(key);
    if (!b) throw new Error(`render worker: buffer ${key} was never sent`);
    return b;
  };

  return {
    v: 1,
    W: msg.W, H: msg.H, seed: msg.seed, background: msg.background,
    selection: null,
    active: null,
    layers: msg.layers.map((l) => ({
      ...l,
      pixels: l.pixels ? need(l.pixels) : null,
      mask: l.mask ? need(l.mask) : null,
      fx: l.fx.map((e) => ({ ...e, mask: e.mask ? need(e.mask) : null })),
    })),
  };
}

/** Drop mirror entries for buffers no document layer references any more. */
export function prune(store, msg) {
  const live = new Set();
  for (const l of msg.layers) {
    if (l.pixels) live.add(l.pixels);
    if (l.mask) live.add(l.mask);
    for (const e of l.fx) if (e.mask) live.add(e.mask);
  }
  for (const key of [...store.keys()]) if (!live.has(key)) store.delete(key);
}
