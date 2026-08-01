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
// DEAD BRANCHES ARE REJECTED HERE, NOT SAMPLED AWAY
// -------------------------------------------------
// The worker holds the parent's pixels, so it can see that a child came out
// identical and re-roll it with a salted key (see `saltedKey`). Sampling cannot
// know that `filter:bloom` above the picture's brightest pixel does nothing;
// rendering knows for certain, and comparing two bitmaps it already has costs
// nothing next to producing them.

import { runStack } from '../shop/js/core/doc.js';
import { stackAt } from './js/mutate.js';

const MAX_ATTEMPTS = 4;

let seedPixels = null;   // the root picture, at thumbnail size
let W = 0, H = 0;
let root = '';
const cache = new Map();  // path → { pixels, salt }

self.onmessage = async (ev) => {
  const m = ev.data;
  if (m.type === 'seed') {
    seedPixels = new Uint8ClampedArray(m.pixels);
    W = m.W; H = m.H; root = m.root;
    cache.clear();
    cache.set('', { pixels: seedPixels, salt: 0 });
    self.postMessage({ type: 'ready', W, H });
    return;
  }
  if (m.type === 'render') {
    for (const path of m.paths) render(path);
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
  const id = path.join('.');
  if (!seedPixels || cache.has(id)) {
    const hit = cache.get(id);
    if (hit) emit(id, hit.pixels, hit.salt);
    return;
  }

  const parentId = path.slice(0, -1).join('.');
  const parent = cache.get(parentId);
  if (!parent) return;   // parent not rendered yet; the app asks in order

  const salts = saltsFor(path);
  let out = null;
  let salt = 0;
  for (; salt < MAX_ATTEMPTS; salt++) {
    salts[id] = salt;
    out = new Uint8ClampedArray(seedPixels);
    try {
      runStack(out, W, H, stackAt(root, path, { salts }), { seed: `bloom/${id}` });
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
    const id = path.slice(0, d).join('.');
    const hit = cache.get(id);
    if (hit) salts[id] = hit.salt;
  }
  return salts;
}

function emit(id, pixels, salt) {
  const copy = new Uint8ClampedArray(pixels);
  self.postMessage({ type: 'tile', id, pixels: copy.buffer, W, H, salt }, [copy.buffer]);
}
