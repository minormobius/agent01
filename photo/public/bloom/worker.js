// worker.js — every thumbnail in the web, rendered off the main thread.
//
// The seed picture is sent once, downscaled, and kept here. After that a job is
// a path and a salt: the worker folds the mutation chain itself (`js/mutate.js`
// is pure and imports nothing browser-only) and renders. So a job is a few
// bytes rather than a bitmap, and expanding a node costs one postMessage.
//
// WHY THUMBNAIL SIZE IS THE WHOLE PERFORMANCE STORY
// ------------------------------------------------
// Shop's effects are O(pixels) and it composites at up to 2400px. A web of two
// hundred variations at that size is not a slow feature, it is an impossible
// one. At 168px on the long side each render is roughly two hundred times
// cheaper, which is the difference between a fan appearing as you watch and a
// fan you go and make tea for. The full-resolution version is never made here —
// that is what handing the recipe to /shop is for.
//
// THE STACK IS AUTHORED AT FULL SIZE AND READ DOWN TO PREVIEW SIZE
// ----------------------------------------------------------------
// A blur radius of 20 is 12% of a 168px thumbnail and 0.8% of the 2400px
// picture /shop will open. Rendering the same numbers at both sizes made the
// web preview a different, smaller picture — you picked a tile for how hard
// the halftone hit and got something much gentler in the editor. So the stack
// means what it means at the document's real resolution, and `scaleStack`
// divides its lengths down for this render only. What goes to /shop is
// untouched.
//
// DEAD BRANCHES ARE REJECTED HERE, NOT SAMPLED AWAY
// -------------------------------------------------
// The worker holds the parent's pixels, so it can see that a child came out
// identical and re-roll it with a salted key (see `saltedKey`). Sampling cannot
// know that `filter:bloom` above the picture's brightest pixel does nothing;
// rendering knows for certain, and comparing two bitmaps it already has costs
// nothing next to producing them.

import { runStack } from '../shop/js/core/doc.js';
import { EFFECTS } from '../shop/js/core/registry.js';
import { scaleStack } from '../shop/js/core/scale.js';
import { pathText, stackAt } from './js/mutate.js';

const MAX_ATTEMPTS = 4;

let seedPixels = null;   // the root picture, at thumbnail size
let W = 0, H = 0;
let root = '';
// How much smaller this preview is than the picture /shop will open. Every
// length in a stack is divided by it before rendering — see core/scale.js for
// why the correction goes this way round and not the other.
let scale = 1;
const cache = new Map();  // path → { pixels, salt }

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'seed') {
    seedPixels = new Uint8ClampedArray(m.pixels);
    W = m.W; H = m.H; root = m.root;
    scale = m.scale || 1;
    cache.clear();
    cache.set('', { pixels: seedPixels, salt: 0 });
    self.postMessage({ type: 'ready', W, H });
    return;
  }
  if (m.type === 'render') {
    for (const path of m.paths) render(path);
    return;
  }
  // An explicit stack, rendered as given. Bridge tiles are blends of two other
  // stacks rather than draws from the grammar (see js/bridge.js), so there is
  // no path to fold and no re-roll to do: a step that looks like its neighbour
  // is the arc working, not a dead branch.
  if (m.type === 'stack') {
    if (!seedPixels) return;
    const out = new Uint8ClampedArray(seedPixels);
    try {
      runStack(out, W, H, scaleStack(m.stack, scale, EFFECTS), { seed: `bloom/${m.id}` });
    } catch { /* one effect throwing shows the seed, and the arc still reads */ }
    cache.set(m.id, { pixels: out, salt: 0 });
    // A bridge STEP is meant to resemble its neighbours, so it is never checked.
    // A node GROWN from one is a mutation like any other and gets the same
    // guarantee — but the stack was folded on the main thread, so the miss is
    // reported back rather than re-rolled here.
    const parent = m.parentId != null ? cache.get(m.parentId) : null;
    const dead = !!parent && identical(out, parent.pixels);
    emit(m.id, out, 0, { dead, parentId: m.parentId });
  }
};

const identical = (a, b) => {
  if (a.length !== b.length) return false;
  // Stride the comparison: a single changed pixel is enough to prove
  // difference, and a full walk of every dead candidate is the one place this
  // check could stop being free.
  for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i]) return false;
  for (let i = 1; i < a.length; i += 16) if (a[i] !== b[i]) return false;
  return true;
};

function render(path) {
  const id = pathText(path);
  if (!seedPixels || cache.has(id)) {
    const hit = cache.get(id);
    if (hit) emit(id, hit.pixels, hit.salt);
    return;
  }

  const parentId = pathText(path.slice(0, -1));
  const parent = cache.get(parentId);
  if (!parent) return;   // parent not rendered yet; the app asks in order

  const salts = saltsFor(path);
  let out = null;
  let salt = 0;
  for (; salt < MAX_ATTEMPTS; salt++) {
    salts[id] = salt;
    out = new Uint8ClampedArray(seedPixels);
    try {
      runStack(out, W, H, scaleStack(stackAt(root, path, { salts }), scale, EFFECTS), { seed: `bloom/${id}` });
    } catch (err) {
      // One effect throwing must not take the web down — the node just shows
      // its parent, and the branch is still explorable.
      out = new Uint8ClampedArray(parent.pixels);
      break;
    }
    if (!identical(out, parent.pixels)) break;
  }
  salt = Math.min(salt, MAX_ATTEMPTS - 1);

  cache.set(id, { pixels: out, salt });
  emit(id, out, salt);
}

/** The salts of every ancestor, so a child folds the same chain its parent did. */
function saltsFor(path) {
  const salts = {};
  for (let d = 1; d < path.length; d++) {
    const id = pathText(path.slice(0, d));
    const hit = cache.get(id);
    if (hit) salts[id] = hit.salt;
  }
  return salts;
}

function emit(id, pixels, salt, extra = {}) {
  const copy = new Uint8ClampedArray(pixels);
  self.postMessage({ type: 'tile', id, pixels: copy.buffer, W, H, salt, ...extra }, [copy.buffer]);
}
