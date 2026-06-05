// OCR Web Worker. Keeps the synchronous wasm inference OFF the main thread so
// the page stays responsive (spinner animates, no freeze) while it computes.
// Wraps the shared engine, relaying progress and the final result back to app.js.

import { ensureEngine, scanBytes } from './engine.js';

self.onmessage = async (e) => {
  const msg = e.data || {};

  // Optional warm-up: start loading wasm + models before the first image.
  if (msg.type === 'warmup') {
    try {
      await ensureEngine((p) => self.postMessage({ type: 'progress', ...p }));
      self.postMessage({ type: 'ready' });
    } catch (err) {
      self.postMessage({ type: 'error', id: null, message: err?.message || String(err) });
    }
    return;
  }

  if (msg.type === 'scan') {
    const { id, buf, mime } = msg;
    try {
      const result = await scanBytes(buf, mime, (p) => self.postMessage({ type: 'progress', id, ...p }));
      self.postMessage({ type: 'result', id, result });
    } catch (err) {
      self.postMessage({ type: 'error', id, message: err?.message || String(err) });
    }
  }
};
