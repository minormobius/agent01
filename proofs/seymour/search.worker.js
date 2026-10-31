// proofs/seymour/search.worker.js — run the exhaustive check and the adversarial
// hunt off the main thread. Same engine as the page.
import { exhaust, hunt } from './seymour.js';

self.onmessage = (e) => {
  const { task, n, seed } = e.data, t0 = performance.now();
  if (task === 'exhaust') {
    const r = exhaust(n, { onProgress: (i, total) => self.postMessage({ task, progress: i / total }) });
    self.postMessage({ task, done: true, ...r, ms: performance.now() - t0 });
  } else {
    const r = hunt(n, { steps: 6000, restarts: 8, seed });
    self.postMessage({ task, done: true, ...r, ms: performance.now() - t0 });
  }
};
