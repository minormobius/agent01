// proofs/crossing/search.worker.js — run the exhaustive two-page search off the
// main thread (K_11 visits ~7 million nodes). Same engine as the page.
import { twoPageMinimum, hill } from './crossing.js';

self.onmessage = (e) => {
  const n = e.data.n, t0 = performance.now();
  const r = twoPageMinimum(n, { target: hill(n), onProgress: (nodes) => self.postMessage({ n, progress: nodes }) });
  self.postMessage({ n, done: true, below: r.witness !== null, nodes: r.nodes, ms: performance.now() - t0 });
};
