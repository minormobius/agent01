// The fit runs off the main thread — a 1000px photo at 3000 pieces is most of
// a second of k-means, and the panel should stay draggable while it thinks.
// app.js falls back to calling glass.js directly if module workers are absent.

import { stainedGlass } from './glass.js';

self.onmessage = (e) => {
  const { rgba, W, H, opts, token } = e.data;
  try {
    const result = stainedGlass(rgba, W, H, opts);
    self.postMessage({ ok: true, token, result }, [result.labels.buffer]);
  } catch (err) {
    self.postMessage({ ok: false, token, error: String((err && err.message) || err) });
  }
};
