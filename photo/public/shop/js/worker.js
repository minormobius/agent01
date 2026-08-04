// worker.js — the composite, off the main thread.
//
// It holds a mirror of the document's pixel and mask buffers (see wire.js) so
// an ordinary edit ships kilobytes of structure rather than megabytes of
// pixels. Renders are coalesced: while one is running, further requests
// collapse into a single pending job, because a slider drag fires far faster
// than a full-resolution composite can finish and every intermediate frame is
// already stale by the time it would be drawn.

import { composite } from './core/doc.js';
import { fromWire, prune } from './core/wire.js';

const store = new Map();
let pending = null;
let running = false;

self.onmessage = (ev) => {
  const { type } = ev.data;
  if (type === 'render') {
    pending = ev.data;
    if (!running) drain();
  } else if (type === 'forget') {
    store.clear();
  }
};

async function drain() {
  running = true;
  while (pending) {
    const job = pending;
    pending = null;
    try {
      const doc = fromWire(job.msg, store);
      prune(store, job.msg);
      const t0 = performance.now();
      const px = composite(doc);
      const ms = performance.now() - t0;
      // The result is transferable and the worker has no further use for it,
      // so it moves rather than copies — the one place a transfer is free.
      self.postMessage({ type: 'frame', token: job.token, W: doc.W, H: doc.H, px, ms }, [px.buffer]);
    } catch (err) {
      self.postMessage({ type: 'error', token: job.token, message: String(err && err.message || err) });
    }
  }
  running = false;
}
